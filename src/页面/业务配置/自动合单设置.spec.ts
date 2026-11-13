import { beforeEach, describe, expect, it } from 'vitest'
import { 保存自动合单设置, 共享自动合单设置, 共享合单运行状态, 记录合单执行失败 } from './自动合单设置'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'

beforeEach(() => {
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
})

describe('自动合单任务配置', () => {
  it('停用默认保留30分钟，启用或改周期记录新的配置版本', () => {
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 60 })).toBe('')
    expect(共享自动合单设置.value).toMatchObject({ enabled: true, intervalMinutes: 60, version: 2 })
    expect(Number.isFinite(Date.parse(共享自动合单设置.value.updatedAt))).toBe(true)
    expect(保存自动合单设置({ enabled: false, intervalMinutes: 60 })).toBe('')
    expect(共享自动合单设置.value).toMatchObject({ enabled: false, intervalMinutes: 60, version: 3 })
  })

  it('重复保存相同设置保留对象及版本，避免重新起算扫描周期', () => {
    const original = 共享自动合单设置.value
    expect(保存自动合单设置({ enabled: false, intervalMinutes: 30 })).toBe('')
    expect(共享自动合单设置.value).toBe(original)
  })

  it('仅保存任务配置不能清除执行失败或把开启状态伪装成执行成功', () => {
    记录合单执行失败(new Error('unexpected internal failure'), '定时执行', 1234)
    const previous = JSON.parse(JSON.stringify(共享合单运行状态.value))
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 60 })).toBe('')
    expect(共享合单运行状态.value).toEqual(previous)
    expect(共享合单运行状态.value.failureReason).not.toContain('unexpected internal failure')
    expect(共享合单运行状态.value.nextAction).toContain('核实后再重试')
  })

  it('拒绝缺失、非整数和越界周期，不覆盖生效配置', () => {
    const original = 共享自动合单设置.value
    for (const intervalMinutes of [NaN, 0, -1, 1.5, 1441, Infinity]) {
      expect(保存自动合单设置({ enabled: true, intervalMinutes })).toContain('1～1440')
    }
    expect(共享自动合单设置.value).toBe(original)
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 1 })).toBe('')
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 1440 })).toBe('')
  })

  it('统一策略独立保存并深拷贝，旧调用保留策略', () => {
    const policy = { ...创建默认合单动作(), mode: 'advanced' as const, releaseTimes: ['14:00'], maxWaitMinutes: 180 }
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 30, policy })).toBe('')
    expect(共享自动合单设置.value.policy).toEqual(policy)
    expect(共享自动合单设置.value.policy).not.toBe(policy)
    policy.releaseTimes.push('18:00')
    policy.maxWaitMinutes = 240
    expect(共享自动合单设置.value.policy.releaseTimes).toEqual(['14:00'])
    expect(共享自动合单设置.value.policy.maxWaitMinutes).toBe(180)
    expect(保存自动合单设置({ enabled: true, intervalMinutes: 60 })).toBe('')
    expect(共享自动合单设置.value.policy.maxWaitMinutes).toBe(180)
    expect(共享自动合单设置.value.version).toBe(3)
  })

  it('仅策略变化递增版本，同内容不同属性顺序不重复保存', () => {
    const policy = { ...创建默认合单动作(), maxOrders: 8 }
    expect(保存自动合单设置({ enabled: false, intervalMinutes: 30, policy })).toBe('')
    expect(共享自动合单设置.value.version).toBe(2)
    const saved = 共享自动合单设置.value
    const reordered = Object.fromEntries(Object.entries(policy).reverse()) as typeof policy
    expect(保存自动合单设置({ enabled: false, intervalMinutes: 30, policy: reordered })).toBe('')
    expect(共享自动合单设置.value).toBe(saved)
  })

  it('容量、时限和高级参数无效时拒绝整个保存，关闭开关也不覆盖有效策略', () => {
    const saved = 共享自动合单设置.value
    for (const patch of [{ maxOrders: 1 }, { maxQuantity: 0 }, { maxWeightKg: '0' }, { shipByBufferMinutes: -1 }, { mode: 'advanced' as const, maxWaitMinutes: 0 }, { mode: 'advanced' as const, releaseMode: 'scheduled' as const, releaseTimes: [] }]) {
      expect(保存自动合单设置({ enabled: true, intervalMinutes: 60, policy: { ...创建默认合单动作(), ...patch } })).not.toBe('')
    }
    expect(共享自动合单设置.value).toBe(saved)
  })
})
