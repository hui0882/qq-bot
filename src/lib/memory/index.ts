/**
 * Memory 模块入口
 *
 * 提供完整的用户记忆管理能力：
 * - 多用户隔离
 * - 对话摘要
 * - 用户画像
 * - 长期记忆
 * - 上下文动态构建
 * - 异步记忆整理
 */

export { memoryManager, getMemoryManager } from './manager'
export type { BuiltContext } from './manager'

export { memoryCache, getMemoryCache } from './cache'
export type { CachedContext } from './cache'

export { memoryWorker, getMemoryWorker } from './worker'

export * as memoryStore from './store'
export type {
  MemoryMessage,
  MemorySummary,
  MemoryProfile,
  MemoryEntry,
  MemoryEntryType,
} from './store'
