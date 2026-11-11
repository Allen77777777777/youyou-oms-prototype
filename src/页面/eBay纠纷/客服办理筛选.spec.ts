import { describe, it, expect } from 'vitest'
import { createDisputeData } from './数据'
import { emptyFilters, matchesFilters } from './列表视图'
import { availableActions, validateAction } from './模型'

describe('客服查找当案待办', () => {
  it('查卖家办件、平台等待与回执核查时，不把机构暂缓日算成卖家超时', () => {
    const rows = createDisputeData()
    const pick = (id: string) => rows.find(row => row.id === id)!
    const match = (id: string, work: string) => {
      const row = pick(id)
      return matchesFilters(row, row.kind, { ...emptyFilters(), work: [work] })
    }
    expect(match('DEMO-CASE-102','platform')).toBe(true)
    expect(match('DEMO-CASE-102','overdue')).toBe(false)
    expect(match('DEMO-PD-110','seller')).toBe(true)
    expect(match('DEMO-CASE-111','seller')).toBe(false)
    expect(match('DEMO-CASE-111','appeal')).toBe(true)
    const request = pick('DEMO-INR-101')
    request.pending = { action: 'REFUND', draft: {} }
    expect(match(request.id,'verify')).toBe(true)
    expect(match(request.id,'seller')).toBe(false)
  })
  it('请求内留言遵守当案资格和 500 字符限制，不把普通站内信的上限套过来', () => {
    const row = createDisputeData().find(item => item.id === 'DEMO-INR-101')!
    expect(validateAction(row,'MESSAGE',{ message: 'a'.repeat(500) })).toBe('')
    expect(validateAction(row,'MESSAGE',{ message: 'a'.repeat(501) })).toContain('500')
    row.inquiry!.messageAllowed = false
    expect(availableActions(row)).not.toContain('MESSAGE')
    expect(availableActions(row)).toContain('TRACKING')
  })
})
