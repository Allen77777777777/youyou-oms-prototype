import { describe, expect, it } from 'vitest'
import { 解析精确十进制, 精确金额相乘, 比较精确金额, 精确价差小于, 格式化精确金额, 校验比价汇率快照, type 比价汇率快照 } from './比价汇率'

function 准备(): 比价汇率快照 { return { snapshotId: 'DEMO-FX', source: '演示中台货币汇率', effectiveAt: '2026-10-22T08:00:00+08:00', rates: [{ currencyCode: 'USD', cnyRate: '7.200000000000000001' }] } }
describe('中台货币汇率快照与精确十进制', () => {
  it('十进制完整相乘、比较与价差，不经过Number或舍入', () => {
    const amount = 解析精确十进制('9007199254740993.000001')!, rate = 解析精确十进制('7.200000000000000001')!
    const product = 精确金额相乘(amount, rate)
    expect(格式化精确金额(product)).toBe('64851834634135149.609014399254740993000001')
    expect(比较精确金额(解析精确十进制('1.000000000000000001')!, 解析精确十进制('1')!)).toBe(1)
    expect(比较精确金额(解析精确十进制('01.000')!, 解析精确十进制('1')!)).toBe(0)
    expect(格式化精确金额(解析精确十进制('000.000')!)).toBe('0')
    expect(精确价差小于(解析精确十进制('1.000001')!, 解析精确十进制('1')!, 解析精确十进制('0.000001')!)).toBe(false)
    expect(精确价差小于(解析精确十进制('1.000001')!, 解析精确十进制('1')!, 解析精确十进制('0.000001000000000000000001')!)).toBe(true)
  })
  it('同快照保留精确汇率及来源，人民币固定1且不要求源额外提供', () => {
    const snapshot = 准备(), before = JSON.stringify(snapshot)
    const result = 校验比价汇率快照(snapshot, ['USD', 'CNY'])
    expect(result.reason).toBe(''); expect(result.rates.get('CNY')).toBe('1')
    expect(result.rates.get('USD')).toBe('7.200000000000000001')
    expect(result.snapshot).toEqual({ snapshotId: snapshot.snapshotId, effectiveAt: snapshot.effectiveAt, source: snapshot.source })
    expect(JSON.stringify(snapshot)).toBe(before)
    snapshot.rates = [...snapshot.rates, { currencyCode: 'CNY', cnyRate: '1.000' }]
    expect(校验比价汇率快照(snapshot, ['USD', 'CNY']).reason).toBe('')
  })
  it.each(['0', '-1', 'NaN', 'Infinity', '1e2', '', '.5', '1.', '+1'])('非法汇率%s明确失败，不能默认1或0', cnyRate => {
    const snapshot = 准备(); snapshot.rates = [{ currencyCode: 'USD', cnyRate }]
    expect(校验比价汇率快照(snapshot, ['USD']).reason).toContain('正十进制')
    expect(校验比价汇率快照(snapshot, ['USD']).snapshot).toBeUndefined()
  })
  it.each(['2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-22T24:00:00Z', '2026-10-22T00:00:00', '2026-10-22', '2026-10-22T00:00:00+14:01', '2026-10-22T00:00:00-00:00', 'INVALID'])('非法或无时区生效时间%s不借Date.parse自动纠正', effectiveAt => {
    const snapshot = { ...准备(), effectiveAt }
    expect(校验比价汇率快照(snapshot, ['USD']).reason).toContain('生效时间无效')
  })
  it('真实闰日及时区有效，不自设24h过期时限', () => {
    expect(校验比价汇率快照({ ...准备(), effectiveAt: '2024-02-29T12:30:45.123Z' }, ['USD']).reason).toBe('')
  })
  it('缺来源、缺ID、缺币、重复币、未知币或非1人民币均拒绝', () => {
    expect(校验比价汇率快照(undefined, ['USD']).reason).toContain('未取得')
    for (const field of ['snapshotId', 'source'] as const) expect(校验比价汇率快照({ ...准备(), [field]: ' ' }, ['USD']).reason).toContain('来源或生效时间')
    expect(校验比价汇率快照(准备(), ['EUR']).reason).toContain('缺少 EUR')
    for (const rates of [
      [{ currencyCode: 'USD', cnyRate: '7' }, { currencyCode: 'USD', cnyRate: '7' }],
      [{ currencyCode: 'ZZZ', cnyRate: '7' }],
      [{ currencyCode: 'CNY', cnyRate: '7' }],
    ]) expect(校验比价汇率快照({ ...准备(), rates }, ['USD']).reason).not.toBe('')
  })
})
