/**
 * 单位换算工具单元测试（回归：schedule_at 单位混乱 Bug）
 *
 * 历史 Bug：API 路径写入毫秒、AI 路径写入秒，引擎按秒读取后生成 16 位时间戳，
 * 导致任务永不触发。normalizeScheduleAtSeconds 以 1e12 为阈值做防御性归一化。
 */

import { describe, it, expect } from 'vitest'
import { normalizeScheduleAtSeconds } from '../units'

describe('normalizeScheduleAtSeconds', () => {
  describe('合法秒级时间戳', () => {
    it('秒级时间戳（约 1.7e9）原样返回', () => {
      expect(normalizeScheduleAtSeconds(1_700_000_000)).toBe(1_700_000_000)
    })

    it('任意 10 位秒级时间戳原样返回', () => {
      expect(normalizeScheduleAtSeconds(1_900_000_000)).toBe(1_900_000_000)
    })

    it('恰好等于阈值 1e12 时原样返回（不触发换算）', () => {
      expect(normalizeScheduleAtSeconds(1_000_000_000_000)).toBe(1_000_000_000_000)
    })
  })

  describe('残留毫秒级时间戳（旧数据毒化）', () => {
    it('毫秒级时间戳（约 1.7e12）除以 1000 归一化为秒', () => {
      expect(normalizeScheduleAtSeconds(1_700_000_000_000)).toBe(1_700_000_000)
    })

    it('阈值以上（1e12+1）除以 1000', () => {
      expect(normalizeScheduleAtSeconds(1_000_000_000_001)).toBe(1_000_000_000)
    })

    it('归一化结果向下取整', () => {
      expect(normalizeScheduleAtSeconds(1_700_000_000_999)).toBe(1_700_000_000)
    })
  })

  describe('无效输入', () => {
    it('null 返回 undefined', () => {
      expect(normalizeScheduleAtSeconds(null)).toBeUndefined()
    })

    it('undefined 返回 undefined', () => {
      expect(normalizeScheduleAtSeconds(undefined)).toBeUndefined()
    })

    it('0 返回 undefined', () => {
      expect(normalizeScheduleAtSeconds(0)).toBeUndefined()
    })

    it('负数返回 undefined', () => {
      expect(normalizeScheduleAtSeconds(-100)).toBeUndefined()
    })
  })
})
