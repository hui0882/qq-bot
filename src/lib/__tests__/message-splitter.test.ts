/**
 * 消息分段模块单元测试
 */

import { describe, it, expect } from 'vitest'
import { splitMessage, calculateDelay, sleep } from '../message-splitter'

describe('message-splitter', () => {
  describe('splitMessage', () => {
    it('应该按 ||| 分隔符拆分消息', () => {
      const text = '第一段内容|||第二段内容|||第三段内容'
      const result = splitMessage(text)
      expect(result).toEqual(['第一段内容', '第二段内容', '第三段内容'])
    })

    it('应该过滤空段', () => {
      const text = '第一段|||  |||第三段'
      const result = splitMessage(text)
      expect(result).toEqual(['第一段', '第三段'])
    })

    it('应该 trim 每段内容', () => {
      const text = '  第一段  |||  第二段  '
      const result = splitMessage(text)
      expect(result).toEqual(['第一段', '第二段'])
    })

    it('没有分隔符时应该按段落拆分（如果每段足够长）', () => {
      const text = '这是一段比较长的内容，用来测试分段功能是否正常工作。\n\n这是第二段比较长的内容，同样需要足够多的字符才能触发拆分逻辑。\n\n这是第三段比较长的内容，确保每段都超过15个字符的阈值。'
      const result = splitMessage(text)
      expect(result.length).toBeGreaterThan(1)
    })

    it('没有分隔符且内容很短时不应该拆分', () => {
      const text = '这是一条简短的消息'
      const result = splitMessage(text)
      expect(result).toEqual([text])
    })

    it('没有分隔符且每段太短时不应该拆分', () => {
      const text = '短\n\n句\n\n子'
      const result = splitMessage(text)
      expect(result).toEqual([text])
    })

    it('应该处理空字符串', () => {
      const result = splitMessage('')
      expect(result).toEqual([''])
    })

    it('应该处理只有分隔符的情况（fallback 到整条发送）', () => {
      const result = splitMessage('|||')
      // 当分隔符拆分后都是空段时，fallback 到整条发送
      expect(result).toEqual(['|||'])
    })

    it('应该处理真实的 AI 回复场景', () => {
      const text = '我来帮你分析一下这个问题|||首先，WebSocket 是一种全双工通信协议，客户端和服务器可以同时发送数据|||而 HTTP 是请求-响应模式，每次通信都需要客户端发起请求|||总结来说，WebSocket 更适合实时通信场景'
      const result = splitMessage(text)
      expect(result.length).toBe(4)
      expect(result[0]).toBe('我来帮你分析一下这个问题')
      expect(result[1]).toContain('WebSocket')
    })
  })

  describe('calculateDelay', () => {
    it('应该返回至少 1000ms', () => {
      expect(calculateDelay('短')).toBe(1000)
    })

    it('应该返回最多 5000ms', () => {
      const longText = 'a'.repeat(200)
      expect(calculateDelay(longText)).toBe(5000)
    })

    it('应该按字符数计算延迟', () => {
      expect(calculateDelay('a'.repeat(20))).toBe(1000) // 20 * 50 = 1000
      expect(calculateDelay('a'.repeat(40))).toBe(2000) // 40 * 50 = 2000
      expect(calculateDelay('a'.repeat(60))).toBe(3000) // 60 * 50 = 3000
    })

    it('应该正确处理中文字符', () => {
      const text = '这是一个测试消息'
      const delay = calculateDelay(text)
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThanOrEqual(5000)
    })
  })

  describe('sleep', () => {
    it('应该延迟指定的时间', async () => {
      const start = Date.now()
      await sleep(100)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(90) // 允许一点误差
    })
  })

  describe('实际场景测试', () => {
    it('场景1: AI 使用 ||| 分隔符的回复', () => {
      const text = '我来帮你看看这个问题|||首先，你需要检查配置文件|||然后重启服务试试'
      const result = splitMessage(text)
      expect(result.length).toBe(3)
      expect(result[0]).toBe('我来帮你看看这个问题')
      expect(result[1]).toBe('首先，你需要检查配置文件')
      expect(result[2]).toBe('然后重启服务试试')
    })

    it('场景2: AI 没有使用分隔符，但有自然段落', () => {
      const text = '这是一个技术问题的解答。\n\n首先，WebSocket 是一种网络通信协议，它提供了全双工通信通道。\n\n其次，HTTP 是一种无状态的请求-响应协议，每次请求都需要建立新的连接。\n\n总结来说，两者各有优劣，选择取决于具体场景。'
      const result = splitMessage(text)
      expect(result.length).toBeGreaterThan(1)
    })

    it('场景3: 简短回复不拆分', () => {
      const text = '好的，我知道了'
      const result = splitMessage(text)
      expect(result).toEqual([text])
    })

    it('场景4: 混合使用分隔符和换行', () => {
      const text = '第一部分|||第二部分\n\n第三部分'
      const result = splitMessage(text)
      expect(result.length).toBe(2) // 按 ||| 拆分优先
      expect(result[0]).toBe('第一部分')
      expect(result[1]).toBe('第二部分\n\n第三部分')
    })

    it('场景5: 带有标点符号的中文回复', () => {
      const text = '你好呀！有什么我可以帮你的吗？|||我来详细解释一下这个问题。首先，这是一个常见的技术问题。|||希望这个回答对你有帮助！'
      const result = splitMessage(text)
      expect(result.length).toBe(3)
    })

    it('场景6: 延迟计算应该合理', () => {
      // 短消息
      expect(calculateDelay('你好')).toBe(1000)
      // 中等消息
      expect(calculateDelay('a'.repeat(50))).toBe(2500)
      // 长消息
      expect(calculateDelay('a'.repeat(100))).toBe(5000)
      // 超长消息（应该被限制在5000ms）
      expect(calculateDelay('a'.repeat(200))).toBe(5000)
    })
  })
})
