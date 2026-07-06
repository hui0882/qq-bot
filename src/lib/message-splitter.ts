/**
 * 消息分段发送模块
 * 将 AI 回复按分隔符拆分为多段，支持动态延迟发送
 */

/** 分隔符常量 */
const SEGMENT_DELIMITER = '|||'

/**
 * 按分隔符拆分消息
 * 优先按 ||| 分隔符拆分；如果没有分隔符，则按自然段落拆分
 * @param text AI 回复的完整文本
 * @returns 拆分后的消息段数组（过滤空段）
 */
export function splitMessage(text: string): string[] {
  // 优先按 ||| 分隔符拆分
  if (text.includes(SEGMENT_DELIMITER)) {
    const segments = text
      .split(SEGMENT_DELIMITER)
      .map(s => s.trim())
      .filter(s => s.length > 0)
    if (segments.length > 1) return segments
  }

  // Fallback: 按自然段落拆分（双换行、句号+换行等）
  const segments = text
    .split(/\n{2,}|(?<=[。！？])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // 如果拆分后只有一段，或者每段太短（<15字），不拆分
  if (segments.length <= 1 || segments.every(s => s.length < 15)) {
    return [text.trim()]
  }

  return segments
}

/**
 * 计算动态延迟（毫秒）
 * 公式: clamp(字符数 × 50ms, 1000ms, 5000ms)
 * @param text 消息文本
 * @returns 延迟毫秒数
 */
export function calculateDelay(text: string): number {
  const charCount = text.length
  const delay = charCount * 50
  return Math.max(1000, Math.min(5000, delay))
}

/**
 * 延迟等待
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
