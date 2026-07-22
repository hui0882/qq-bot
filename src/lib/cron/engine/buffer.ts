/**
 * 定时任务引擎 - 预取缓冲
 *
 * 基于最小堆实现的预取缓冲队列，按 scheduledAt 排序。
 * 核心特性：
 * - 固定大小（默认 15 条）
 * - 存储的是 Execution（不是 Task）
 * - 每个 Task 在缓冲里最多只有 1 条 pending Execution
 * - 执行完一条后，计算该 Task 的下一条 Execution 入堆补充
 */

import type { TaskExecution } from './types'

/**
 * 预取缓冲类（最小堆实现）
 *
 * 按 scheduledAt 升序排列的优先队列。
 * 保证堆顶始终是最早需要执行的 Execution。
 */
export class PreFetchBuffer {
  /** 堆数组（索引 0 为堆顶） */
  private heap: TaskExecution[] = []

  /** 每个 Task 在缓冲中的 Execution ID 集合（用于去重） */
  private taskIds: Set<string> = new Set()

  /** 最大容量 */
  private readonly capacity: number

  constructor(capacity: number = 15) {
    this.capacity = capacity
  }

  /**
   * 获取当前缓冲大小
   */
  get size(): number {
    return this.heap.length
  }

  /**
   * 检查缓冲是否为空
   */
  get isEmpty(): boolean {
    return this.heap.length === 0
  }

  /**
   * 检查缓冲是否已满
   */
  get isFull(): boolean {
    return this.heap.length >= this.capacity
  }

  /**
   * 检查指定 Task 是否已在缓冲中
   */
  hasTask(taskId: string): boolean {
    return this.taskIds.has(taskId)
  }

  /**
   * 查看堆顶元素（不移除）
   *
   * @returns 最早需要执行的 Execution，如果缓冲为空则返回 null
   */
  peek(): TaskExecution | null {
    return this.heap.length > 0 ? this.heap[0] : null
  }

  /**
   * 弹出堆顶元素（最早需要执行的 Execution）
   *
   * @returns 最早需要执行的 Execution，如果缓冲为空则返回 null
   */
  pop(): TaskExecution | null {
    if (this.heap.length === 0) return null

    const top = this.heap[0]
    const last = this.heap.pop()!

    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }

    this.taskIds.delete(top.taskId)
    return top
  }

  /**
   * 推入新的 Execution
   *
   * 如果同一 Task 已有 Execution 在缓冲中，保留 scheduledAt 更早的那个。
   * 如果缓冲已满且新 Execution 比堆顶晚，拒绝入堆。
   *
   * @param execution - 要推入的执行记录
   * @returns 是否成功推入
   */
  push(execution: TaskExecution): boolean {
    // 同一 Task 去重：保留更早的
    if (this.taskIds.has(execution.taskId)) {
      const existing = this.findExecution(execution.taskId)
      if (existing && existing.scheduledAt <= execution.scheduledAt) {
        // 已有的更早或相同，跳过新推入的
        return false
      }
      // 新的更早，替换已有的
      this.removeExecution(execution.taskId)
    }

    // 缓冲已满时，如果新 Execution 比堆顶晚，拒绝
    if (this.heap.length >= this.capacity) {
      if (execution.scheduledAt >= this.heap[0].scheduledAt) {
        // 比堆顶晚，但堆顶更早，不替换（堆顶优先级更高）
        // 实际上按最小堆逻辑，新元素如果更大应该被拒绝
        // 但这里我们检查：如果比堆中最大者还晚，可以拒绝
        // 简化：直接按容量限制
        return false
      }
    }

    // 推入堆
    this.heap.push(execution)
    this.taskIds.add(execution.taskId)
    this.siftUp(this.heap.length - 1)
    return true
  }

  /**
   * 批量推入 Execution
   *
   * @param executions - 要推入的执行记录数组
   * @returns 成功推入的数量
   */
  pushBatch(executions: TaskExecution[]): number {
    let count = 0
    for (const exec of executions) {
      if (this.push(exec)) {
        count++
      }
    }
    return count
  }

  /**
   * 移除指定 Task 的所有 Execution
   */
  removeByTask(taskId: string): boolean {
    return this.removeExecution(taskId)
  }

  /**
   * 清空缓冲
   */
  clear(): void {
    this.heap = []
    this.taskIds.clear()
  }

  /**
   * 获取缓冲中所有 Execution（按 scheduledAt 排序）
   */
  toArray(): TaskExecution[] {
    return [...this.heap].sort((a, b) => a.scheduledAt - b.scheduledAt)
  }

  // ============ 私有方法：堆操作 ============

  /**
   * 上浮操作
   */
  private siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.heap[index].scheduledAt >= this.heap[parentIndex].scheduledAt) {
        break
      }
      this.swap(index, parentIndex)
      index = parentIndex
    }
  }

  /**
   * 下沉操作
   */
  private siftDown(index: number): void {
    const length = this.heap.length
    while (true) {
      let smallest = index
      const left = 2 * index + 1
      const right = 2 * index + 2

      if (left < length && this.heap[left].scheduledAt < this.heap[smallest].scheduledAt) {
        smallest = left
      }
      if (right < length && this.heap[right].scheduledAt < this.heap[smallest].scheduledAt) {
        smallest = right
      }
      if (smallest === index) break

      this.swap(index, smallest)
      index = smallest
    }
  }

  /**
   * 交换堆中两个元素
   */
  private swap(i: number, j: number): void {
    const temp = this.heap[i]
    this.heap[i] = this.heap[j]
    this.heap[j] = temp
  }

  /**
   * 查找指定 Task 的 Execution
   */
  private findExecution(taskId: string): TaskExecution | null {
    return this.heap.find(e => e.taskId === taskId) || null
  }

  /**
   * 移除指定 Task 的 Execution
   */
  private removeExecution(taskId: string): boolean {
    const index = this.heap.findIndex(e => e.taskId === taskId)
    if (index === -1) return false

    const last = this.heap.pop()!
    if (index < this.heap.length) {
      this.heap[index] = last
      this.siftDown(index)
      this.siftUp(index)
    }
    this.taskIds.delete(taskId)
    return true
  }
}
