import { describe, expect, it } from 'vitest'
import { platformDueItems, queryKpiComparison, waitingBuckets } from './分析模型'
import { createDefaultKpiFilter, queryKpi, type KpiData, type KpiEvent, type KpiFilter, type KpiWorkItem } from './统计模型'

const at = (date: string, time = '10:00:00') => new Date(`${date}T${time}+08:00`).toISOString()
const filter = (patch: Partial<KpiFilter> = {}): KpiFilter => ({ ...createDefaultKpiFilter(), ...patch })
function fresh(): KpiData {
  return {
    asOf: at('2026-11-06', '18:00:00'), coverageStart: at('2026-10-01', '00:00:00'),
    staff: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], shops: [{ id: 's', name: '店铺' }],
    conversations: [{ id: 'c', shopId: 's', number: 'MSG-1', title: '咨询', owners: [{ at: at('2026-10-01'), staffId: 'a' }] }],
    workItems: [], tickets: [], events: [],
  }
}
function reply(id: string, time: string, actorId = 'a', conversationId = 'c'): KpiEvent {
  return { id, kind: 'message', conversationId, messageId: id, at: time, actorId, source: 'human', purpose: 'reply', outcome: 'success' }
}

describe('客服 KPI 等待分布与平台到期事项', () => {
  it('按左闭右开区间落桶，零等待保留，区间明细可核对到待回复总数', () => {
    const data = fresh()
    const durations = [0, 59.999, 60, 239.999, 240, 719.999, 720, 1439.999, 1440]
    data.conversations = durations.map((_, index) => ({ id: `c${index}`, shopId: 's', number: `MSG-${index}`, title: '咨询', owners: [{ at: at('2026-10-01'), staffId: index % 2 ? 'b' : 'a' }] }))
    data.events = durations.map((duration, index): KpiEvent => ({ id: `i${index}`, kind: 'incoming', conversationId: `c${index}`, messageId: `i${index}`, at: new Date(Date.parse(data.asOf) - duration * 60000).toISOString() }))
    data.events.push({ ...data.events[0]!, id: 'duplicate-incoming' })
    const result = queryKpi(data, filter())
    const buckets = waitingBuckets(result)
    expect(buckets.map(item => item.count)).toEqual([2, 2, 2, 2, 1])
    expect(buckets.reduce((total, item) => total + item.count, 0)).toBe(result.summary.pendingReplies)
    expect(buckets.every(bucket => bucket.count === bucket.details.length)).toBe(true)
    expect(buckets[0]?.details[0]?.durationMinutes).toBe(59.999)
    expect(waitingBuckets(queryKpi(data, filter({ staffIds: ['a'] }))).map(item => item.count)).toEqual([1, 1, 1, 1, 1])
    expect(waitingBuckets(queryKpi(fresh(), filter())).map(item => item.count)).toEqual([0, 0, 0, 0, 0])
  })

  it('只列当前待卖家办理、期限可靠且未逾期的事项，按期限升序并保留类型', () => {
    const data = fresh()
    const item = (id: string, type: KpiWorkItem['type'], dueAt: string | null, state: 'seller_action' | 'waiting' | 'closed' = 'seller_action'): KpiWorkItem => ({
      id, shopId: 's', type, number: id, title: '平台事项', history: [{ id: `${id}-open`, at: at('2026-11-01'), state, dueAt, summary: '当前状态' }],
    })
    data.workItems = [
      item('far', 'return', at('2026-11-10')), item('equal', 'cancellation', data.asOf), item('soon', 'dispute', at('2026-11-07')),
      item('overdue', 'return', at('2026-11-06', '17:59:59.999')), item('none', 'cancellation', null),
      item('bad-time', 'return', '2026-11-07 12:00:00'), item('waiting', 'dispute', at('2026-11-07'), 'waiting'), item('closed', 'return', at('2026-11-07'), 'closed'),
    ]
    const result = queryKpi(data, filter())
    expect(platformDueItems(result).map(detail => [detail.objectId, detail.objectType])).toEqual([['equal', 'cancellation'], ['soon', 'dispute'], ['far', 'return']])
    expect(result.summary.returnOverdue).toBe(1)
    expect(platformDueItems(queryKpi(data, filter({ shopIds: ['other'] })))).toEqual([])
    data.workItems[2]!.history.push({ id: 'future-close', at: at('2026-11-07'), state: 'closed', summary: '未来关闭' })
    expect(platformDueItems(queryKpi(data, filter())).map(detail => detail.objectId)).toContain('soon')
  })
})

describe('客服 KPI 上一同长度期间对比', () => {
  it('本期六日截至18点，上期六日也截至末日18点，不多纳入上期晚间数据', () => {
    const data = fresh()
    data.events = [reply('previous-in', at('2026-10-31', '18:00:00')), reply('previous-after', at('2026-10-31', '18:00:00.001')), reply('current-in', at('2026-11-06', '18:00:00')), reply('current-after', at('2026-11-06', '18:00:00.001'))]
    const result = queryKpiComparison(data, filter())
    expect(result.error).toBeNull()
    expect(result).toMatchObject({ currentStart: '2026-11-01', currentEnd: '2026-11-06', previousStart: '2026-10-26', previousEnd: '2026-10-31' })
    expect(result.current.asOf).toBe(at('2026-11-06', '18:00:00'))
    expect(result.previous?.asOf).toBe(at('2026-10-31', '18:00:00'))
    expect(result.current.summary.humanMessages).toBe(1)
    expect(result.previous?.summary.humanMessages).toBe(1)
    expect(result.previous?.trend).toHaveLength(6)
  })

  it('日期选至未来只按实际可用日数平移，保持人员及店铺条件', () => {
    const data = fresh()
    data.events = [reply('current-a', at('2026-11-01')), reply('current-b', at('2026-11-02'), 'b'), reply('previous-a', at('2026-10-26')), reply('previous-b', at('2026-10-27'), 'b')]
    const result = queryKpiComparison(data, filter({ endDate: '2026-11-30', staffIds: ['a'], shopIds: ['s'] }))
    expect(result.currentEnd).toBe('2026-11-06')
    expect(result.previousStart).toBe('2026-10-26')
    expect(result.current.summary.humanMessages).toBe(1)
    expect(result.previous?.summary.humanMessages).toBe(1)
    expect(result.previous?.filter).toMatchObject({ staffIds: ['a'], shopIds: ['s'] })
  })

  it('完整历史日比较完整上一日；自定义较早截至时刻也精确平移', () => {
    const data = fresh()
    const full = queryKpiComparison(data, filter({ startDate: '2026-11-03', endDate: '2026-11-03' }))
    expect(full.previous?.asOf).toBe(at('2026-11-02', '23:59:59.999'))
    const partial = queryKpiComparison(data, filter({ startDate: '2026-11-03', endDate: '2026-11-05', asOf: at('2026-11-04', '09:20:30.123') }))
    expect(partial).toMatchObject({ currentEnd: '2026-11-04', previousStart: '2026-11-01', previousEnd: '2026-11-02' })
    expect(partial.previous?.asOf).toBe(at('2026-11-02', '09:20:30.123'))
    expect(partial.current.summary).toMatchObject({ responseSamples: 0, averageResponseMinutes: null, medianResponseMinutes: null, p90ResponseMinutes: null })
    expect(partial.previous?.summary).toMatchObject({ responseSamples: 0, averageResponseMinutes: null, medianResponseMinutes: null, p90ResponseMinutes: null })
  })

  it('覆盖不足、覆盖起点缺失或非法均明确不可比，不返回零值上期', () => {
    const data = fresh()
    data.coverageStart = at('2026-10-26', '00:00:00.001')
    const insufficient = queryKpiComparison(data, filter())
    expect(insufficient.previous).toBeNull()
    expect(insufficient.error).toContain('覆盖范围')
    data.coverageStart = at('2026-10-26', '00:00:00')
    expect(queryKpiComparison(data, filter()).error).toBeNull()
    delete data.coverageStart
    expect(queryKpiComparison(data, filter())).toMatchObject({ previous: null, error: expect.stringContaining('覆盖起点') })
    data.coverageStart = '2026-10-01 00:00:00'
    expect(queryKpiComparison(data, filter())).toMatchObject({ previous: null, error: expect.stringContaining('覆盖起点') })
  })

  it('共同负责人在期间对比、每日快照和等待分布中一致去重，不读取未来转交及回复', () => {
    const data = fresh()
    data.conversations[0]!.owners.push(
      { at: at('2026-10-30'), staffIds: ['a', 'b', 'a'] },
      { at: at('2026-11-04'), staffIds: ['b'] },
      { at: at('2026-11-07'), staffIds: ['a'] },
    )
    data.events = [{ id: 'old', kind: 'incoming', conversationId: 'c', messageId: 'old', at: at('2026-10-26') }, reply('future', at('2026-11-07'), 'a')]
    const all = queryKpiComparison(data, filter({ staffIds: ['a', 'b'] }))
    expect(all.previous?.summary.pendingReplies).toBe(1)
    expect(all.current.summary.pendingReplies).toBe(1)
    expect(all.current.trend.map(point => point.metrics.pendingReplies)).toEqual([1, 1, 1, 1, 1, 1])
    expect(waitingBuckets(all.previous!)[4]?.details.map(row => row.staffName)).toEqual(['甲、乙'])
    expect(waitingBuckets(all.current)[4]?.details.map(row => row.staffName)).toEqual(['乙'])
    const selected = queryKpiComparison(data, filter({ staffIds: ['a'] }))
    expect(selected.previous?.summary.pendingReplies).toBe(1)
    expect(selected.current.summary.pendingReplies).toBe(0)
    expect(selected.current.trend.map(point => point.metrics.pendingReplies)).toEqual([1, 1, 1, 0, 0, 0])
  })

  it('非法筛选直接保留查询错误，不创建上一期间或隐式扩大范围', () => {
    const result = queryKpiComparison(fresh(), filter({ startDate: '2026-11-31' }))
    expect(result.error).toBeTruthy()
    expect(result.previous).toBeNull()
    expect(result.previousStart).toBe('')
  })
})
