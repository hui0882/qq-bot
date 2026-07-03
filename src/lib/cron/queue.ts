/**
 * 定时任务系统 - 并发队列
 *
 * 管理定时任务的并发执行，确保同时运行的任务数不超过上限。
 * 超出并发限制的任务按创建时间排序排队，等待空闲槽位后自动执行。
 */

import type { CronTask, QueueStatus } from './types';
import { executeTask } from './executor';

/**
 * 并发任务队列
 *
 * 限制同时执行的任务数量，超出上限的任务进入等待队列，
 * 按 createdAt 升序排列，任务完成后自动调度下一个等待任务。
 */
export class TaskQueue {
  /** 正在执行的任务映射表（taskId -> Promise） */
  private running: Map<string, Promise<void>>;

  /** 等待执行的任务列表，按 createdAt 排序 */
  private waiting: CronTask[];

  /** 最大并发数 */
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.running = new Map();
    this.waiting = [];
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 将任务加入队列
   *
   * 如果当前运行任务数未达上限，立即执行；
   * 否则加入等待队列，按 createdAt 排序。
   *
   * @param task 要执行的定时任务
   */
  async enqueue(task: CronTask): Promise<void> {
    if (this.running.size >= this.maxConcurrent) {
      // 并发已满，加入等待队列并按 createdAt 排序
      this.waiting.push(task);
      this.waiting.sort((a, b) => a.createdAt - b.createdAt);
      console.log(
        `[CronQueue] 任务 ${task.id}（${task.name}）进入等待队列，当前等待: ${this.waiting.length}`
      );
      return;
    }

    // 立即执行
    this.executeTask(task);
  }

  /**
   * 执行单个任务
   *
   * 将任务标记为运行中，执行完成后从运行列表移除，
   * 并触发等待队列的处理。
   *
   * @param task 要执行的任务
   */
  private executeTask(task: CronTask): void {
    const executionPromise = this.runTask(task);
    this.running.set(task.id, executionPromise);

    executionPromise.finally(() => {
      this.running.delete(task.id);
      this.processQueue();
    });
  }

  /**
   * 运行任务的实际逻辑
   *
   * 调用 executor 模块执行任务，捕获异常避免影响队列。
   *
   * @param task 要执行的任务
   */
  private async runTask(task: CronTask): Promise<void> {
    try {
      console.log(
        `[CronQueue] 开始执行任务 ${task.id}（${task.name}），并发数: ${this.running.size}/${this.maxConcurrent}`
      );
      await executeTask(task);
      console.log(`[CronQueue] 任务 ${task.id}（${task.name}）执行完成`);
    } catch (error) {
      console.error(
        `[CronQueue] 任务 ${task.id}（${task.name}）执行异常:`,
        error
      );
    }
  }

  /**
   * 处理等待队列
   *
   * 当有任务完成且有空闲槽位时，从等待队列取出最早的
   * 任务立即执行。循环处理直到队列满或等待队列为空。
   */
  private processQueue(): void {
    while (this.running.size < this.maxConcurrent && this.waiting.length > 0) {
      const nextTask = this.waiting.shift()!;
      console.log(
        `[CronQueue] 从等待队列取出任务 ${nextTask.id}（${nextTask.name}），剩余等待: ${this.waiting.length}`
      );
      this.executeTask(nextTask);
    }
  }

  /**
   * 获取当前队列状态
   *
   * @returns 包含正在运行和等待中的任务数量
   */
  getStatus(): QueueStatus {
    return {
      running: this.running.size,
      waiting: this.waiting.length,
    };
  }
}

/**
 * 并发任务队列单例实例
 *
 * 默认最大并发数为 3，整个定时任务系统共用此实例。
 */
export const taskQueue = new TaskQueue(3);
