import { describe, expect, it } from 'vitest'
import { 创建默认合单动作, 合单动作摘要, 校验合单动作, 校验合单时长输入, 解析合单重量 } from './合单规则模型'

describe('公共合单池统一策略配置', () => {
  it('新时长表单要求半小时，旧分钟快照仍可运行且不被改写', () => {
    const old = { ...创建默认合单动作(), mode: 'advanced' as const, maxWaitMinutes: 45, shipByBufferMinutes: 10 }
    const before = JSON.stringify(old)
    expect(校验合单动作(old)).toBe('')
    expect(校验合单时长输入(old)).toContain('0.5 小时')
    expect(合单动作摘要(old)).toContain('0 小时 45 分钟')
    expect(JSON.stringify(old)).toBe(before)
    const config = { ...old, maxWaitMinutes: 30, shipByBufferMinutes: 0 }
    expect(校验合单时长输入(config)).toBe('')
    expect(合单动作摘要(config)).toContain('最多等待 0.5 小时')
    expect(校验合单时长输入({ ...config, maxWaitMinutes: 45 })).toContain('最长等待时间')
    expect(校验合单时长输入({ ...config, mode: 'basic', maxWaitMinutes: NaN })).toBe('')
  })
  it('基础模式不受隐藏高级配置影响，但仍校验履约预留时间', () => {
    const config = { ...创建默认合单动作(), maxWaitMinutes: NaN, releaseTimes: ['invalid'], readyOrderCount: NaN }
    expect(校验合单动作(config)).toBe('')
    expect(合单动作摘要(config)).toContain('本轮处理后放单')
    expect(校验合单动作({ ...config, shipByBufferMinutes: -1 })).toContain('履约预留时间')
  })
  it('容量限制与提前放单阈值独立且不能超过容量', () => {
    const config = { ...创建默认合单动作(), mode: 'advanced' as const, maxOrders: 5, readyOrderCount: 3 }
    expect(校验合单动作(config)).toBe('')
    expect(合单动作摘要(config)).toContain('达到 3 单')
    expect(校验合单动作({ ...config, readyOrderCount: 6 })).toContain('不能超过')
  })
  it('定点放单要求合法唯一时点，同时保留最长等待上限', () => {
    const config = { ...创建默认合单动作(), mode: 'advanced' as const, releaseMode: 'scheduled' as const }
    expect(校验合单动作(config)).toContain('至少设置')
    expect(校验合单动作({ ...config, releaseTimes: ['14:00', '14:00'] })).toContain('不能重复')
    expect(校验合单动作({ ...config, releaseTimes: ['24:00'] })).toContain('有效的北京时间')
    expect(校验合单动作({ ...config, releaseTimes: ['14:00'], maxWaitMinutes: 0 })).toContain('最长等待时间')
    expect(校验合单动作({ ...config, releaseTimes: ['14:00'], readyOrderCount: NaN })).toBe('')
  })
  it('重量使用精确小数，未开启与非法或零重量区分', () => {
    expect(解析合单重量('0.000001')).toBe(1n)
    expect(解析合单重量('1e2')).toBeUndefined()
    expect(解析合单重量(undefined)).toBeUndefined()
    expect(校验合单动作({ ...创建默认合单动作(), maxWeightKg: '0' })).toContain('大于 0')
    expect(校验合单动作({ ...创建默认合单动作(), maxWeightKg: '2.500001' })).toBe('')
  })
})
