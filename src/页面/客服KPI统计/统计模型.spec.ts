import { describe, expect, it } from 'vitest'
import { demoKpiData } from './演示数据'
import { beijingKpiDate, createDefaultKpiFilter, formatKpiDuration, isResponseDurationMetric, metricDetails, parseKpiTime, queryKpi, UNASSOCIATED_SHOP, UNRECORDED_STAFF, type KpiData, type KpiEvent, type KpiFilter, type KpiMetric } from './统计模型'

const at = (date: string, time = '10:00:00') => new Date(`${date}T${time}+08:00`).toISOString()
function fresh(): KpiData {
  return {
    asOf: at('2026-11-06', '18:00:00'),
    staff: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], shops: [{ id: 's', name: '店铺' }],
    conversations: [{ id: 'c', shopId: 's', number: 'MSG-1', title: '咨询', owners: [{ at: at('2026-10-01'), staffId: 'a' }] }],
    workItems: [], tickets: [], events: [],
  }
}
const filter = (patch: Partial<KpiFilter> = {}): KpiFilter => ({ ...createDefaultKpiFilter(), ...patch })
function incoming(id: string, time: string): Extract<KpiEvent, { kind: 'incoming' }> { return { id, kind: 'incoming', conversationId: 'c', messageId: id, at: time } }
function reply(id: string, time: string, actorId: string | null = 'a', outcome: 'success' | 'failed' | 'unknown' | 'pending' = 'success'): Extract<KpiEvent, { kind: 'message' }> {
  return { id, kind: 'message', conversationId: 'c', messageId: id, at: time, actorId, source: 'human', purpose: 'reply', outcome }
}

describe('客服 KPI 统计：自然时间与回复轮次', () => {
  it('晚20点至次日9点为13小时，自动回复、买家追问均不重置起点', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-04', '20:00:00')), { ...reply('auto', at('2026-11-04', '20:01:00')), kind: 'message', source: 'automatic' } as KpiEvent, incoming('follow', at('2026-11-05', '08:00:00')), reply('reply', at('2026-11-05', '09:00:00'))]
    const result = queryKpi(data, filter())
    expect(result.summary.averageResponseMinutes).toBe(780)
    expect(result.summary.responseSamples).toBe(1)
    expect(result.summary.humanMessages).toBe(1)
    expect(result.summary.automaticMessages).toBe(1)
    expect(metricDetails(result, 'averageResponseMinutes')[0]?.startedAt).toBe(at('2026-11-04', '20:00:00'))
  })

  it('未回复和失败/未知/在途不当作零分钟样本，仍保留待回复', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-01')), reply('failed', at('2026-11-01', '11:00:00'), 'a', 'failed'), reply('unknown', at('2026-11-01', '12:00:00'), 'a', 'unknown'), reply('pending', at('2026-11-01', '13:00:00'), 'a', 'pending')]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ humanMessages: 0, responseSamples: 0, averageResponseMinutes: null, pendingReplies: 1 })
  })

  it('跨月首响归成功回复月份，响应起点仍用上月来信', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-10-31', '23:40:00')), reply('reply', at('2026-11-01', '00:20:00'))]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ incomingConversations: 0, humanMessages: 1, responseSamples: 1, averageResponseMinutes: 40 })
    const october = queryKpi(data, filter({ startDate: '2026-10-01', endDate: '2026-10-31' }))
    expect(october.summary).toMatchObject({ humanMessages: 0, pendingReplies: 1 })
  })

  it('按北京午夜包含起日，排除次日零点，事件带偏移与UTC等价', () => {
    const data = fresh()
    data.events = [reply('before', '2026-10-31T15:59:59Z'), reply('start', '2026-10-31T16:00:00Z'), reply('end', '2026-11-01T23:59:59.999+08:00'), reply('next', '2026-11-01T16:00:00Z')]
    const result = queryKpi(data, filter({ endDate: '2026-11-01' }))
    expect(result.summary.humanMessages).toBe(2)
    expect(result.trend).toHaveLength(1)
    expect(result.trend[0]?.date).toBe('2026-11-01')
    expect(beijingKpiDate('2026-10-31T16:00:00Z')).toBe('2026-11-01')
  })

  it('连续人工补发不新增响应样本，新来信才产生下一轮', () => {
    const data = fresh()
    data.events = [incoming('in1', at('2026-11-01')), reply('r1', at('2026-11-01', '11:00:00')), reply('r2', at('2026-11-01', '11:10:00')), incoming('in2', at('2026-11-02')), reply('r3', at('2026-11-02', '12:00:00'))]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ humanMessages: 3, repliedConversations: 1, responseSamples: 2, averageResponseMinutes: 90 })
  })

  it('主动联系计人工消息，不冒充回复或关闭等待轮次', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-01')), { ...reply('outreach', at('2026-11-01', '11:00:00')), kind: 'message', purpose: 'outreach' } as KpiEvent]
    expect(queryKpi(data, filter()).summary).toMatchObject({ humanMessages: 1, repliedConversations: 0, responseSamples: 0, pendingReplies: 1 })
  })
})

describe('客服 KPI 统计：归属、去重及历史截至', () => {
  it('跨员工会话总计独立去重，筛客服同时重算总览/趋势/明细', () => {
    const data = fresh()
    data.events = [incoming('in1', at('2026-11-01')), reply('r1', at('2026-11-01', '11:00:00')), incoming('in2', at('2026-11-02')), reply('r2', at('2026-11-02', '12:00:00'), 'b')]
    const result = queryKpi(data, filter())
    expect(result.staffRows.map(row => row.metrics.repliedConversations)).toEqual([1, 1])
    expect(result.summary.repliedConversations).toBe(1)
    const selected = queryKpi(data, filter({ staffIds: ['b'] }))
    expect(selected.staffRows).toHaveLength(1)
    expect(selected.summary).toMatchObject({ humanMessages: 1, averageResponseMinutes: 120, responseSamples: 1 })
    expect(metricDetails(selected, 'humanMessages')[0]?.staffId).toBe('b')
    expect(selected.trend.reduce((sum, day) => sum + day.metrics.humanMessages, 0)).toBe(1)
  })

  it('重复成功回执和重拉来信不重复计数，失败后成功只算一封', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-01')), { ...incoming('in', at('2026-11-01')), id: 'incoming-copy' }, reply('reply', at('2026-11-01', '10:30:00'), 'a', 'failed'), reply('reply', at('2026-11-01', '11:00:00')), { ...reply('reply', at('2026-11-01', '11:10:00')), id: 'receipt-copy' }]
    expect(queryKpi(data, filter()).summary).toMatchObject({ humanMessages: 1, incomingConversations: 1, responseSamples: 1, averageResponseMinutes: 60 })
  })

  it('转交只改变截至时点待回复归属，不改写历史回复操作人', () => {
    const data = fresh()
    data.conversations[0]!.owners.push({ at: at('2026-11-04'), staffId: 'b' })
    data.events = [incoming('old', at('2026-10-30'))]
    const before = queryKpi(data, filter({ endDate: '2026-11-03' }))
    const after = queryKpi(data, filter())
    expect(before.staffRows.find(row => row.id === 'a')?.metrics.pendingReplies).toBe(1)
    expect(after.staffRows.find(row => row.id === 'b')?.metrics.pendingReplies).toBe(1)
    expect(after.summary.incomingConversations).toBe(0)
    expect(metricDetails(after, 'pendingReplies')[0]?.startedAt).toBe(at('2026-10-30'))
  })

  it('共同处理的待回复会话可由任一人筛出，按截至时点统计，团队明细和逐日积压均去重', () => {
    const data = fresh()
    data.conversations[0]!.owners.push({ at: at('2026-11-04'), staffIds: ['a', 'b', 'a'] })
    data.events = [incoming('waiting', at('2026-11-01'))]
    const all = queryKpi(data, filter({ staffIds: ['a', 'b'] }))
    expect(all.staffRows.map(person => person.metrics.pendingReplies)).toEqual([1, 1])
    expect(metricDetails(all, 'pendingReplies').map(row => row.staffName)).toEqual(['甲、乙'])
    expect(all.summary.pendingReplies).toBe(1)
    const second = queryKpi(data, filter({ staffIds: ['b'] }))
    expect(second.trend.map(point => point.metrics.pendingReplies)).toEqual([0, 0, 0, 1, 1, 1])
    data.events.push(reply('done', at('2026-11-06'), 'b'))
    const done = queryKpi(data, filter())
    expect(done.summary.pendingReplies).toBe(0)
    expect(done.staffRows.map(person => person.metrics.humanMessages)).toEqual([0, 1])
  })

  it('历史截至不能读取未来回复，指定asOf不能超过固定资料时点', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-05')), reply('r', at('2026-11-06', '12:00:00')), reply('future', at('2026-11-07'))]
    const before = queryKpi(data, filter({ asOf: at('2026-11-06', '11:00:00') }))
    expect(before.summary).toMatchObject({ humanMessages: 0, pendingReplies: 1 })
    const future = queryKpi(data, filter({ endDate: '2026-11-30', asOf: at('2026-11-20') }))
    expect(future.asOf).toBe(data.asOf)
    expect(future.summary.humanMessages).toBe(1)
  })

  it('缺员工进未记录，缺时刻不猜测归日', () => {
    const data = fresh()
    data.events = [reply('no-person', at('2026-11-01'), null), reply('no-time', '', 'b'), reply('ambiguous-time', '2026-11-01 11:00:00', 'b')]
    const result = queryKpi(data, filter())
    expect(result.summary.humanMessages).toBe(1)
    expect(result.staffRows.find(row => row.id === UNRECORDED_STAFF)?.metrics.humanMessages).toBe(1)
    expect(result.issues).toHaveLength(2)
    expect(parseKpiTime('2026-11-01T12:00:00')).toBeNull()
    expect(parseKpiTime('2026-02-30T12:00:00Z')).toBeNull()
    expect(parseKpiTime('2026-11-01T24:00:00Z')).toBeNull()
    expect(parseKpiTime('2024-02-29T12:00:00Z')).not.toBeNull()
  })

  it('来源质量问题按当前可定位店铺及员工范围统计', () => {
    const data = fresh()
    data.shops.push({ id: 'other', name: '另一店铺' })
    data.events = [reply('bad-time', '', 'a')]
    expect(queryKpi(data, filter()).issues).toHaveLength(1)
    expect(queryKpi(data, filter({ shopIds: ['other'] })).issues).toHaveLength(0)
    expect(queryKpi(data, filter({ staffIds: ['b'] })).issues).toHaveLength(0)
  })

  it('无效责任历史保留待回复总量但归未记录，不回落旧员工，也不改变可靠人工动作', () => {
    const data = fresh()
    data.shops.push({ id: 'other', name: '其他店铺' })
    data.conversations[0]!.owners.push({ at: '', staffId: 'b' })
    data.events = [incoming('first', at('2026-11-01')), reply('confirmed', at('2026-11-01', '11:00:00')), incoming('second', at('2026-11-02'))]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ humanMessages: 1, pendingReplies: 1 })
    expect(result.staffRows.find(row => row.id === 'a')?.metrics).toMatchObject({ humanMessages: 1, pendingReplies: 0 })
    expect(result.staffRows.find(row => row.id === UNRECORDED_STAFF)?.metrics.pendingReplies).toBe(1)
    expect(result.issues).toEqual([expect.objectContaining({ id: 'owner-history:c', reason: expect.stringContaining('无法判断') })])
    expect(queryKpi(data, filter({ staffIds: [UNRECORDED_STAFF] })).summary.pendingReplies).toBe(1)
    expect(queryKpi(data, filter({ staffIds: ['a'] })).issues).toHaveLength(0)
    expect(queryKpi(data, filter({ shopIds: ['other'] })).issues).toHaveLength(0)
  })
})

describe('客服 KPI 统计：分类办理及工单', () => {
  it('同对象多次办理和多人参与：各员工去重，团队独立去重；受理未确认不算成功', () => {
    const data = fresh()
    data.workItems = [{ id: 'return', shopId: 's', type: 'return', number: 'RET-1', title: '退货', history: [] }]
    data.events = [
      { id: 'a1', kind: 'handling', workItemId: 'return', actionId: 'action1', at: at('2026-11-01'), actorId: 'a', outcome: 'success' },
      { id: 'a2', kind: 'handling', workItemId: 'return', actionId: 'action2', at: at('2026-11-02'), actorId: 'b', outcome: 'success' },
      { id: 'copy', kind: 'handling', workItemId: 'return', actionId: 'action2', at: at('2026-11-03'), actorId: 'b', outcome: 'success' },
      { id: 'pending', kind: 'handling', workItemId: 'return', actionId: 'action3', at: at('2026-11-04'), actorId: 'a', outcome: 'pending' },
    ]
    const result = queryKpi(data, filter())
    expect(result.summary.returnHandled).toBe(1)
    expect(result.staffRows.map(row => row.metrics.returnHandled)).toEqual([1, 1])
    expect(metricDetails(result, 'returnHandled')[0]?.history).toHaveLength(2)
  })

  it('平台待办按截至状态及明确期限，等待平台/无期限不擅自判逾期', () => {
    const data = fresh()
    data.workItems = [
      { id: 'cancel', shopId: 's', type: 'cancellation', number: 'CAN-1', title: '取消', history: [{ id: 'c1', at: at('2026-10-30'), state: 'seller_action', dueAt: at('2026-11-02'), summary: '待答复' }, { id: 'c2', at: at('2026-11-05'), state: 'waiting', dueAt: at('2026-11-02'), summary: '等待平台' }] },
      { id: 'return', shopId: 's', type: 'return', number: 'RET-1', title: '退货', history: [{ id: 'r1', at: at('2026-10-30'), state: 'seller_action', summary: '待答复，来源未提供期限' }] },
    ]
    const early = queryKpi(data, filter({ endDate: '2026-11-03' }))
    expect(early.summary).toMatchObject({ cancellationPending: 1, cancellationOverdue: 1, returnPending: 1, returnOverdue: 0 })
    const now = queryKpi(data, filter())
    expect(now.summary).toMatchObject({ cancellationPending: 0, cancellationOverdue: 0, returnPending: 1, returnOverdue: 0 })
    expect(now.staffRows.every(row => row.metrics.returnPending === 0)).toBe(true)
  })

  it('非法状态历史隔离平台快照并明确无法判断，不抹掉已确认办理历史', () => {
    const data = fresh()
    data.shops.push({ id: 'other', name: '其他店铺' })
    data.workItems = [{ id: 'return', shopId: 's', type: 'return', number: 'RET-1', title: '退货', history: [
      { id: 'open', at: at('2026-11-01'), state: 'seller_action', dueAt: at('2026-11-02'), summary: '待卖家答复' },
      { id: 'closed-unknown-time', at: '2026-02-30T12:00:00Z', state: 'closed', summary: '关闭时间无效' },
    ] }]
    data.events = [{ id: 'action', kind: 'handling', workItemId: 'return', actionId: 'act-1', actorId: 'a', at: at('2026-11-02'), outcome: 'success', summary: '接受退货已确认' }]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ returnHandled: 1, returnPending: 0, returnOverdue: 0 })
    expect(result.issues).toEqual([expect.objectContaining({ id: 'work-history:return', reason: expect.stringContaining('无法判断') })])
    expect(metricDetails(result, 'returnPending')).toHaveLength(0)
    expect(queryKpi(data, filter({ shopIds: ['other'] })).issues).toHaveLength(0)
    const person = queryKpi(data, filter({ staffIds: ['a'] }))
    expect(person.summary.returnHandled).toBe(1)
    expect(person.issues).toHaveLength(0)
  })

  it('合法未来责任和状态历史仅按截至点截断，不误判为非法或影响当前快照', () => {
    const data = fresh()
    data.conversations[0]!.owners.push({ at: at('2026-11-07'), staffId: 'b' })
    data.events = [incoming('in', at('2026-11-01'))]
    data.workItems = [{ id: 'return', shopId: 's', type: 'return', number: 'RET-1', title: '退货', history: [
      { id: 'open', at: at('2026-11-01'), state: 'seller_action', dueAt: at('2026-11-02'), summary: '待卖家答复' },
      { id: 'future-close', at: at('2026-11-07'), state: 'closed', summary: '后续关闭' },
    ] }]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ pendingReplies: 1, returnPending: 1, returnOverdue: 1 })
    expect(result.staffRows.find(row => row.id === 'a')?.metrics.pendingReplies).toBe(1)
    expect(result.staffRows.find(row => row.id === 'b')?.metrics.pendingReplies).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('完成与放弃各自去重，重开不抹掉历史结果；无来源工单保留未关联店铺', () => {
    const data = fresh()
    data.tickets = [{ id: 'ticket', shopId: null, number: 'GD-1', title: '整理资料' }]
    data.events = [
      { id: 'end1', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'completed', at: at('2026-11-01') },
      { id: 'reopen', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'reopened', at: at('2026-11-02') },
      { id: 'end2', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'completed', at: at('2026-11-03') },
      { id: 'reopen2', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'reopened', at: at('2026-11-04') },
      { id: 'abandon', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'abandoned', at: at('2026-11-05') },
    ]
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ ticketsCompleted: 1, ticketsAbandoned: 1 })
    expect(result.shopRows.find(row => row.id === UNASSOCIATED_SHOP)?.metrics.ticketsCompleted).toBe(1)
    expect(metricDetails(result, 'ticketsCompleted')[0]?.history).toHaveLength(5)
    expect(queryKpi(data, filter({ shopIds: ['s'] })).summary.ticketsCompleted).toBe(0)
  })

  it('工单首次完成在上月，跨月重开及换人完成不新增数量，首次放弃独立归日', () => {
    const data = fresh()
    data.tickets = [{ id: 'ticket', shopId: 's', number: 'GD-1', title: '交接任务' }]
    data.events = [
      { id: 'old-complete', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'completed', at: at('2026-10-31') },
      { id: 'reopen', kind: 'ticket', ticketId: 'ticket', actorId: 'a', state: 'reopened', at: at('2026-11-01') },
      { id: 'new-complete', kind: 'ticket', ticketId: 'ticket', actorId: 'b', state: 'completed', at: at('2026-11-02') },
      { id: 'reopen2', kind: 'ticket', ticketId: 'ticket', actorId: 'b', state: 'reopened', at: at('2026-11-03') },
      { id: 'abandon', kind: 'ticket', ticketId: 'ticket', actorId: 'b', state: 'abandoned', at: at('2026-11-04') },
    ]
    expect(queryKpi(data, filter()).summary).toMatchObject({ ticketsCompleted: 0, ticketsAbandoned: 1 })
    expect(queryKpi(data, filter({ staffIds: ['b'] })).summary.ticketsCompleted).toBe(0)
    const october = queryKpi(data, filter({ startDate: '2026-10-01', endDate: '2026-10-31' }))
    expect(october.summary.ticketsCompleted).toBe(1)
    expect(metricDetails(october, 'ticketsCompleted')[0]?.staffId).toBe('a')
    expect(metricDetails(october, 'ticketsCompleted')[0]?.history).toHaveLength(1)
  })

  it('所有汇总与分组下钻数量保持一致，平均时长由同一明细样本计算', () => {
    const result = queryKpi(demoKpiData, filter())
    for (const metric of Object.keys(result.summary) as KpiMetric[]) {
      const details = metricDetails(result, metric)
      if (isResponseDurationMetric(metric)) {
        expect(details).toEqual(metricDetails(result, 'responseSamples'))
        if (metric === 'averageResponseMinutes') expect(result.summary[metric]).toBe(details.reduce((sum, row) => sum + row.durationMinutes!, 0) / details.length)
      }
      else expect(result.summary[metric]).toBe(details.length)
      for (const row of result.staffRows) {
        const staffDetails = metricDetails(result, metric, { group: 'staff', id: row.id })
        if (!isResponseDurationMetric(metric)) expect(row.metrics[metric]).toBe(staffDetails.length)
      }
      for (const row of result.shopRows) {
        const shopDetails = metricDetails(result, metric, { group: 'shop', id: row.id })
        if (!isResponseDurationMetric(metric)) expect(row.metrics[metric]).toBe(shopDetails.length)
      }
    }
    expect(result.staffRows.length).toBeGreaterThanOrEqual(4)
    expect(result.shopRows.length).toBeGreaterThanOrEqual(4)
    expect(result.trend).toHaveLength(6)
  })

  it('无数据返回空平均值、零数量；非法日期返回可解释错误', () => {
    expect(queryKpi(fresh(), filter()).summary).toMatchObject({ averageResponseMinutes: null, medianResponseMinutes: null, p90ResponseMinutes: null, responseSamples: 0 })
    expect(queryKpi(fresh(), filter({ startDate: '2026-11-31' })).error).toBeTruthy()
    expect(queryKpi(fresh(), filter({ startDate: '2026-11-07' })).error).toBeTruthy()
    expect(formatKpiDuration(null)).toBe('—')
    expect(formatKpiDuration(780)).toBe('13 小时')
  })
})

describe('客服 KPI 统计：响应分布与历史积压趋势', () => {
  it('起始日期早于明确覆盖起点时拒绝查询，不把未知日期画成零趋势', () => {
    const data = fresh()
    data.coverageStart = at('2026-11-02', '00:00:00')
    data.events = [incoming('in', at('2026-11-02'))]
    const unavailable = queryKpi(data, filter())
    expect(unavailable.error).toContain('完整数据覆盖起点（北京时间 2026-11-02 00:00:00）')
    expect(unavailable.trend).toEqual([])
    expect(unavailable.details).toEqual([])
    const available = queryKpi(data, filter({ startDate: '2026-11-02' }))
    expect(available.error).toBeNull()
    expect(available.trend).toHaveLength(5)
    expect(available.summary.pendingReplies).toBe(1)
  })

  it('覆盖从日中或午夜后一毫秒开始仍不冒充完整首日，无效起点明确报错', () => {
    const data = fresh()
    for (const time of ['00:00:00.001', '12:00:00']) {
      data.coverageStart = at('2026-11-01', time)
      expect(queryKpi(data, filter()).error).toContain('早于完整数据覆盖起点')
      expect(queryKpi(data, filter({ startDate: '2026-11-02' })).error).toBeNull()
    }
    for (const value of ['', '2026-11-01 12:00:00', '2026-02-30T00:00:00Z']) {
      data.coverageStart = value
      expect(queryKpi(data, filter()).error).toContain('覆盖起点无效')
    }
    delete data.coverageStart
    expect(queryKpi(data, filter()).error).toBeNull()
  })

  it('中位数和nearest-rank P90从去重样本重算，不平均人员分位数', () => {
    const data = fresh()
    const durations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]
    data.conversations = durations.map((_, index) => ({ id: `c${index}`, shopId: 's', number: `MSG-${index}`, title: '咨询', owners: [] }))
    data.events = durations.flatMap((duration, index): KpiEvent[] => [
      { ...incoming(`in${index}`, at('2026-11-01')), conversationId: `c${index}` },
      { ...reply(`r${index}`, new Date(Date.parse(at('2026-11-01')) + duration * 60000).toISOString(), index < 3 ? 'a' : 'b'), conversationId: `c${index}` },
    ])
    data.events.push({ ...data.events[1]!, id: 'duplicate-receipt' })
    const result = queryKpi(data, filter())
    expect(result.summary).toMatchObject({ averageResponseMinutes: 14.5, medianResponseMinutes: 5.5, p90ResponseMinutes: 9, responseSamples: 10 })
    expect(result.staffRows.find(row => row.id === 'a')?.metrics).toMatchObject({ medianResponseMinutes: 2, p90ResponseMinutes: 3, responseSamples: 3 })
    expect(result.staffRows.find(row => row.id === 'b')?.metrics).toMatchObject({ medianResponseMinutes: 7, p90ResponseMinutes: 100, responseSamples: 7 })
    expect(result.trend[0]?.metrics).toMatchObject({ averageResponseMinutes: 14.5, medianResponseMinutes: 5.5, p90ResponseMinutes: 9, responseSamples: 10 })
    expect(result.trend[1]?.metrics).toMatchObject({ averageResponseMinutes: null, medianResponseMinutes: null, p90ResponseMinutes: null, responseSamples: 0 })
    for (const metric of ['averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes'] as const) {
      expect(metricDetails(result, metric)).toHaveLength(10)
      expect(metricDetails(result, metric, { group: 'staff', id: 'a' })).toHaveLength(3)
    }
    expect(queryKpi(data, filter({ staffIds: ['a'] })).summary).toMatchObject({ medianResponseMinutes: 2, p90ResponseMinutes: 3, responseSamples: 3 })
  })

  it('单样本三种耗时相同，零分钟是有效样本', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-01')), reply('reply', at('2026-11-01'))]
    expect(queryKpi(data, filter()).summary).toMatchObject({ averageResponseMinutes: 0, medianResponseMinutes: 0, p90ResponseMinutes: 0, responseSamples: 1 })
  })

  it('日末积压含期初来信，按各日截至负责人筛选，不读取未来回复或转交', () => {
    const data = fresh()
    data.conversations[0]!.owners.push(
      { at: at('2026-11-02'), staffId: 'b' }, { at: at('2026-11-04'), staffId: 'a' }, { at: at('2026-11-07'), staffId: 'b' },
    )
    data.events = [incoming('old', at('2026-10-31')), reply('first', at('2026-11-02', '09:00:00'), 'b'), incoming('new', at('2026-11-03')), reply('future', at('2026-11-06', '19:00:00'))]
    const all = queryKpi(data, filter())
    expect(all.trend.map(day => day.metrics.pendingReplies)).toEqual([1, 0, 1, 1, 1, 1])
    expect(all.trend[0]?.asOf).toBe(at('2026-11-01', '23:59:59.999'))
    expect(all.trend[5]?.asOf).toBe(data.asOf)
    expect(all.trend[1]?.metrics.responseSamples).toBe(1)
    expect(all.trend[1]?.metrics.averageResponseMinutes).toBe(2820)
    const a = queryKpi(data, filter({ staffIds: ['a'] }))
    const b = queryKpi(data, filter({ staffIds: ['b'] }))
    expect(a.trend.map(day => day.metrics.pendingReplies)).toEqual([1, 0, 0, 1, 1, 1])
    expect(b.trend.map(day => day.metrics.pendingReplies)).toEqual([0, 0, 1, 0, 0, 0])
    expect(a.trend[5]?.metrics.pendingReplies).toBe(a.summary.pendingReplies)
    expect(b.summary.responseSamples).toBe(1)
    expect(a.summary.responseSamples).toBe(0)
  })

  it('日末同一毫秒的来信和回复全处理后封存，不把日后数据带入前日', () => {
    const data = fresh()
    data.events = [incoming('in', at('2026-11-01', '23:59:59.999')), reply('reply', at('2026-11-02', '00:00:00'))]
    const result = queryKpi(data, filter({ endDate: '2026-11-02' }))
    expect(result.trend.map(day => day.metrics.pendingReplies)).toEqual([1, 0])
    expect(result.trend.map(day => day.metrics.responseSamples)).toEqual([0, 1])
  })
})
