import { describe, expect, it } from 'vitest'
import { createKpiComparisonCsv, createKpiDetailsCsv, createKpiSummaryCsv, createKpiTrendCsv, csvCell, formatKpiTime, kpiChange, metricValue, responseColumns } from './展示工具'
import { metricDetails, queryKpi, type KpiData, type KpiEvent } from './统计模型'
import { queryKpiComparison } from './分析模型'

const emptyData = (): KpiData => ({ asOf: '2026-11-06T10:00:00Z', staff: [], shops: [], conversations: [], events: [], workItems: [], tickets: [] })
const filter = { startDate: '2026-11-01', endDate: '2026-11-06' }
const csvRow = (content: string, key: string): string[] => {
  const line = content.split('\r\n').find(row => row.startsWith(`${csvCell(key)},`)) ?? ''
  return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1]!.replace(/""/g, '"'))
}

function responseData(): KpiData {
  const data = emptyData()
  data.coverageStart = '2026-10-25T16:00:00Z'
  data.staff = [{ id: 'a', name: '客服甲' }]
  data.shops = [{ id: 's', name: '店铺甲' }]
  data.conversations = [{ id: 'c', shopId: 's', number: 'MSG-RESPONSE', title: '核对商品', owners: [{ at: data.coverageStart, staffId: 'a' }] }]
  data.events = [1.5, 2.25, 3.75].flatMap((duration, index): KpiEvent[] => {
    const started = Date.parse('2026-11-06T09:00:00Z') + index * 10 * 60000
    return [
      { id: `in-${index}`, kind: 'incoming', conversationId: 'c', messageId: `in-${index}`, at: new Date(started).toISOString() },
      { id: `reply-${index}`, kind: 'message', conversationId: 'c', messageId: `reply-${index}`, at: new Date(started + duration * 60000).toISOString(), source: 'human', purpose: 'reply', actorId: 'a', outcome: 'success' },
    ]
  })
  return data
}

describe('客服KPI显示与CSV边界', () => {
  it('以北京时间显示同一绝对时刻，不猜无偏移、日期或缺失值', () => {
    expect(formatKpiTime('2026-11-05T16:00:00Z')).toBe('2026-11-06 00:00:00')
    expect(formatKpiTime('2026-11-06T00:00:00+08:00')).toBe('2026-11-06 00:00:00')
    expect(formatKpiTime('2026-11-06T00:00:00-05:00')).toBe('2026-11-06 13:00:00')
    for (const value of [undefined, '', '2026-11-06', '2026-11-06T09:00:00', 'invalid']) expect(formatKpiTime(value)).toBe('—')
  })
  it('CSV转义引号、换行与分隔符，并阻断空白前缀公式', () => {
    expect(csvCell('包含"引号",逗号\n换行')).toBe('"包含""引号"",逗号\n换行"')
    for (const value of ['=1+1', ' +SUM(A1)', '-1+1', '@SUM(1)', '\t=1', '\r=1']) expect(csvCell(value)).toBe(`"'${value}"`)
    expect(csvCell('MSG-01')).toBe('"MSG-01"')
  })
  it('空样本均值为—且导出记录范围、截至、时区、虚构性质', () => {
    const result = queryKpi(emptyData(), filter)
    expect(metricValue(result.summary, 'averageResponseMinutes')).toBe('—')
    expect(metricValue(result.summary, 'humanMessages')).toBe('0')
    const csv = createKpiSummaryCsv(result, filter, 'staff', ['humanMessages', 'averageResponseMinutes'], '全部店铺', '全部客服')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('2026-11-01 至 2026-11-06')
    expect(csv).toContain('Asia/Shanghai（北京时间）')
    expect(csv).toContain('2026-11-06 18:00:00')
    expect(csv).toContain('本地虚构评审数据')
    expect(csv).toContain('"合计（独立去重）","0","—"')
  })
  it('跨人会话导出使用团队独立去重合计，不把人员行直接相加', () => {
    const data = emptyData()
    data.staff = [{ id: 'a', name: '客服甲' }, { id: 'b', name: '客服乙' }]
    data.shops = [{ id: 's', name: '店铺甲' }]
    data.conversations = [{ id: 'c', shopId: 's', number: 'MSG-ONE', title: '同一买家事项', owners: [] }]
    data.events = ['a', 'b'].map((actorId, i) => ({ id: actorId, kind: 'message' as const, conversationId: 'c', messageId: actorId, at: `2026-11-02T0${i}:00:00Z`, source: 'human' as const, purpose: 'reply' as const, actorId, outcome: 'success' as const }))
    const result = queryKpi(data, filter)
    const summary = createKpiSummaryCsv(result, filter, 'staff', ['repliedConversations'])
    expect(summary).toContain('"客服甲","1"'); expect(summary).toContain('"客服乙","1"'); expect(summary).toContain('"合计（独立去重）","1"')
    const details = metricDetails(result, 'repliedConversations')
    const csv = createKpiDetailsCsv(details, filter, result.asOf, 'repliedConversations', '当前范围', '店铺甲', '全部客服')
    expect(csv.split('\r\n').filter(line => line.startsWith('"MSG-ONE"'))).toHaveLength(1)
    expect(csv).toContain('客服甲、客服乙')
  })
  it('尚未响应的累计等待导入独立等待列，响应列留空且业务类型为中文', () => {
    const data = emptyData()
    data.shops = [{ id: 's', name: '店铺甲' }]
    data.conversations = [{ id: 'c', shopId: 's', number: 'MSG-PENDING', title: '仍待人工确认', owners: [] }]
    data.events = [{ id: 'in', kind: 'incoming', conversationId: 'c', messageId: 'in', at: '2026-11-01T00:00:00Z' }]
    const result = queryKpi(data, filter)
    expect(result.summary.responseSamples).toBe(0)
    const csv = createKpiDetailsCsv(metricDetails(result, 'pendingReplies'), filter, result.asOf, 'pendingReplies', '当前范围', '店铺甲', '全部客服')
    const row = csv.split('\r\n').find(line => line.startsWith('"MSG-PENDING"'))!
    expect(row).toContain('"站内信"')
    expect(row).toContain('"—","","","7800","130 小时","—"')
  })

  it('三类响应耗时空样本一致显示—，汇总导出保留样本数和新增分位数', () => {
    const result = queryKpi(emptyData(), filter)
    for (const metric of ['averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes'] as const) expect(metricValue(result.summary, metric)).toBe('—')
    const summary = createKpiSummaryCsv(result, filter, 'staff', responseColumns)
    expect(csvRow(summary, '客服')).toEqual(['客服', '平均响应时长', '响应时长中位数', 'P90响应时长', '响应样本', '待人工回复'])
    expect(csvRow(summary, '合计（独立去重）')).toEqual(['合计（独立去重）', '—', '—', '—', '0', '0'])
  })

  it('趋势导出使用原始分钟精度；无样本留空、零数量保留0，并记录各日截至', () => {
    const result = queryKpi(responseData(), filter)
    const exported = createKpiTrendCsv(result, filter, '店铺甲', '客服甲', 'staff')
    expect(csvRow(exported, '北京日期')).toEqual(['北京日期', '当日统计截至（北京）', '人工成功消息', '响应样本', '平均响应时长（分钟）', '响应时长中位数（分钟）', 'P90响应时长（分钟）', '待人工回复'])
    expect(csvRow(exported, '2026-11-01')).toEqual(['2026-11-01', '2026-11-01 23:59:59', '0', '0', '', '', '', '0'])
    expect(csvRow(exported, '2026-11-06')).toEqual(['2026-11-06', '2026-11-06 18:00:00', '3', '3', '2.5', '2.25', '3.75', '0'])
    expect(exported).not.toContain('"2026-11-07",')
    expect(csvRow(createKpiTrendCsv(result, filter, '店铺甲', '不按客服筛选', 'shop'), '北京日期')).toContain('自动回复消息')
    expect(csvRow(exported, '北京日期')).not.toContain('自动回复消息')
  })

  it('P90明细导出保留同一完整响应样本集合及各轮原始精度', () => {
    const result = queryKpi(responseData(), filter)
    const details = metricDetails(result, 'p90ResponseMinutes')
    const exported = createKpiDetailsCsv(details, filter, result.asOf, 'p90ResponseMinutes', '当前范围', '店铺甲', '客服甲')
    const rows = exported.split('\r\n').filter(line => line.startsWith('"MSG-RESPONSE",'))
    expect(rows).toHaveLength(result.summary.responseSamples)
    expect(details.map(row => row.durationMinutes).sort((a, b) => a! - b!)).toEqual([1.5, 2.25, 3.75])
    for (const value of ['1.5', '2.25', '3.75']) expect(rows.some(row => row.includes(`,"${value}",`))).toBe(true)
    expect(rows.every(row => row.endsWith(',"","","—"'))).toBe(true)
  })

  it('变化值按原始数计算；前期为0或任一期无样本时不生成虚假百分比', () => {
    expect(kpiChange(3, 2, 'humanMessages')).toEqual({ difference: '+1', rate: '+50.0%' })
    expect(kpiChange(1.5, 1, 'medianResponseMinutes')).toEqual({ difference: '+30 秒', rate: '+50.0%' })
    expect(kpiChange(30, 60, 'p90ResponseMinutes')).toEqual({ difference: '−30 分钟', rate: '-50.0%' })
    expect(kpiChange(1, 0, 'humanMessages')).toEqual({ difference: '+1', rate: '前期为 0' })
    expect(kpiChange(0, 0, 'humanMessages')).toEqual({ difference: '持平', rate: '持平' })
    expect(kpiChange(null, 1, 'p90ResponseMinutes')).toEqual({ difference: '—', rate: '—' })
    expect(kpiChange(1, null, 'averageResponseMinutes')).toEqual({ difference: '—', rate: '—' })
  })

  it('对比导出保留同刻截止、可比期间、筛选和原始耗时，不把前期无样本当0', () => {
    const comparison = queryKpiComparison(responseData(), filter)
    const exported = createKpiComparisonCsv(comparison, filter, '店铺甲', '客服甲')
    expect(csvRow(exported, '当前实际期间')).toEqual(['当前实际期间', '2026-11-01 至 2026-11-06'])
    expect(csvRow(exported, '前期期间')).toEqual(['前期期间', '2026-10-26 至 2026-10-31'])
    expect(csvRow(exported, '前期截至（北京）')).toEqual(['前期截至（北京）', '2026-10-31 18:00:00'])
    expect(csvRow(exported, '响应时长中位数')).toEqual(['响应时长中位数', '2 分钟', '—', '—', '—', '2.25', ''])
    expect(csvRow(exported, '人工成功消息')).toEqual(['人工成功消息', '3', '0', "'+3", '前期为 0', '3', '0'])
    expect(csvRow(exported, '店铺范围')).toEqual(['店铺范围', '店铺甲'])
    expect(csvRow(exported, '客服范围')).toEqual(['客服范围', '客服甲'])
  })

  it('覆盖不足的对比导出明确不可比，前期值与变化留—而非输出零值', () => {
    const data = responseData()
    delete data.coverageStart
    const comparison = queryKpiComparison(data, filter)
    const exported = createKpiComparisonCsv(comparison, filter, '店铺甲', '客服甲')
    expect(csvRow(exported, '对比说明')[1]).toContain('暂不可比')
    expect(csvRow(exported, '人工成功消息')).toEqual(['人工成功消息', '3', '—', '—', '—', '3', ''])
    expect(csvRow(exported, '前期截至（北京）')).toEqual(['前期截至（北京）', ''])
  })
})
