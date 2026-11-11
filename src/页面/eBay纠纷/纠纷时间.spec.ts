import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDisputeData } from './数据'
import { availableActions, dateText, isSellerOverdue } from './模型'

afterEach(() => vi.useRealTimers())

function seller() {
  return createDisputeData().find(row => row.id === 'DEMO-INR-101')!
}

describe('纠纷统一北京时间与来源时间精度', () => {
  it('申诉截止须为可信绝对时刻，截止相等或无时区来源不授予资格', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T06:30:00Z'))
    const row = createDisputeData().find(item => item.id === 'DEMO-CASE-111')!
    for (const value of ['2099-11-06T14:30:00', '2099-11-06', '2099-11-06T14:30:00-00:00', '2099-02-30T14:30:00Z', '2026-11-06T14:30:00+08:00']) {
      row.caseInfo!.appealDeadline = value
      expect(availableActions(row)).toEqual([])
    }
    row.caseInfo!.appealDeadline = '2026-11-06T14:30:00.001+08:00'
    expect(availableActions(row)).toEqual(['APPEAL'])
  })
  it('UTC 时刻跨日后显示北京时间及固定偏移', () => {
    expect(dateText('2026-11-05T23:30:00Z')).toBe('2026-11-06 07:30:00 UTC+8')
    expect(dateText('2026-11-05T16:00:00Z')).toBe('2026-11-06 00:00:00 UTC+8')
  })
  it('正负偏移统一换算，同一时刻不受来源偏移影响', () => {
    expect(dateText('2026-11-06T00:30:00+01:00')).toBe(dateText('2026-11-05T23:30:00Z'))
    expect(dateText('2026-11-05T19:30:00-04:00')).toBe(dateText('2026-11-05T23:30:00Z'))
    expect(dateText('2026-11-06T07:30:00+08:00')).toBe(dateText('2026-11-05T23:30:00Z'))
  })
  it('无时区墙钟与未知偏移保留待核查提示，不使用本机时区解释', () => {
    for (const value of ['2026-11-05T23:30:00', '2026-11-05 23:30:00', '2026-11-05T23:30:00-00:00']) {
      expect(dateText(value)).toBe(`${value}（时间格式待核查）`)
      const row = seller()
      row.date!.value = value
      expect(isSellerOverdue(row, new Date('2030-01-01T00:00:00Z'))).toBe(false)
    }
  })
  it('原始通知只有日期时保持日期精度，不能制造零点或据此判逾期', () => {
    expect(dateText('2026-11-09')).toBe('2026-11-09')
    const row = seller()
    row.date!.value = '2026-11-09'
    expect(isSellerOverdue(row, new Date('2030-01-01T00:00:00Z'))).toBe(false)
    const notice = createDisputeData().find(item => item.id === 'DEMO-CASE-102')!
    expect(notice.date).toMatchObject({ value: '2026-11-09', source: 'eBay 案件通知' })
    expect(dateText(notice.history[0]!.at)).toBe('2026-11-03')
  })
  it('可信卖家义务按同一精确时刻判断逾期，日期本身不决定边界', () => {
    const row = seller()
    row.date!.value = '2026-11-10T23:00:00+08:00'
    expect(isSellerOverdue(row, new Date('2026-11-10T14:59:59.999Z'))).toBe(false)
    expect(isSellerOverdue(row, new Date('2026-11-10T15:00:00Z'))).toBe(false)
    expect(isSellerOverdue(row, new Date('2026-11-10T15:00:00.001Z'))).toBe(true)
    row.owner = 'eBay'
    expect(isSellerOverdue(row, new Date('2030-01-01T00:00:00Z'))).toBe(false)
  })
  it('当前 API 演示的 INR 截止使用明确 UTC 来源，历史截图日期不充当精确时刻', () => {
    const row = seller()
    expect(row.date).toMatchObject({ value: '2026-11-10T15:00:00Z', source: 'eBay 接口' })
    expect(dateText(row.date!.value)).toBe('2026-11-10 23:00:00 UTC+8')
    expect(row.createdAt).toBe('2026-11-05T01:00:00Z')
    expect(row.inquiry!.providedInfo![0]!.at).toBe('2026-11-05T01:30:00Z')
  })
  it('无效来源时刻不自动纠正日期，也不触发卖家逾期', () => {
    const invalid = '2026-02-30T12:00:00Z'
    expect(dateText(invalid)).toBe(`${invalid}（时间格式待核查）`)
    const row = seller()
    row.date!.value = invalid
    expect(isSellerOverdue(row, new Date('2030-01-01T00:00:00Z'))).toBe(false)
    expect(dateText(undefined)).toBe('—')
    expect(dateText('   ')).toBe('—')
  })
})
