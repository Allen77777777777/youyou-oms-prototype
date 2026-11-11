import type { KpiDetail, KpiFilter, KpiMetric, KpiResult, KpiRow } from './统计模型'
import { formatKpiDuration, isResponseDurationMetric, kpiMetricLabels } from './统计模型'
import type { queryKpiComparison } from './分析模型'

export const staffColumns: KpiMetric[] = ['humanMessages', 'repliedConversations', 'averageResponseMinutes', 'pendingReplies', 'cancellationHandled', 'returnHandled', 'disputeHandled', 'ticketsCompleted', 'ticketsAbandoned']
export const shopColumns: KpiMetric[] = ['incomingConversations', 'humanMessages', 'repliedConversations', 'automaticMessages', 'averageResponseMinutes', 'cancellationHandled', 'returnHandled', 'disputeHandled', 'ticketsCompleted', 'ticketsAbandoned']
export const backlogColumns: KpiMetric[] = ['pendingReplies', 'cancellationPending', 'cancellationOverdue', 'returnPending', 'returnOverdue', 'disputePending', 'disputeOverdue']

export const responseColumns: KpiMetric[] = ['averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes', 'responseSamples', 'pendingReplies']
export const comparisonColumns: KpiMetric[] = ['humanMessages', 'repliedConversations', 'averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes', 'responseSamples', 'pendingReplies']

export function formatKpiTime(value?: string): string {
  if (!value || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) return '—'
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const p = (key: string) => parts.find(part => part.type === key)?.value ?? ''
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`
}

export function metricValue(row: KpiRow['metrics'], metric: KpiMetric): string {
  return isResponseDurationMetric(metric) ? formatKpiDuration(row[metric]) : String(row[metric] ?? '—')
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
const csv = (rows: unknown[][]) => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')

/** 只描述变化；前期为零或无样本时不制造百分比。 */
export function kpiChange(current: number | null, previous: number | null, metric: KpiMetric): { difference: string; rate: string } {
  if (current === null || previous === null) return { difference: '—', rate: '—' }
  const delta = current - previous
  const difference = delta === 0 ? '持平' : `${delta > 0 ? '+' : '−'}${isResponseDurationMetric(metric) ? formatKpiDuration(Math.abs(delta)) : Math.abs(delta)}`
  const rate = previous === 0 ? current === 0 ? '持平' : '前期为 0' : `${delta > 0 ? '+' : ''}${(delta / previous * 100).toFixed(1)}%`
  return { difference, rate }
}

export function createKpiTrendCsv(result: KpiResult, filter: KpiFilter, shops: string, staff: string, view: 'staff' | 'shop'): string {
  const columns: KpiMetric[] = ['humanMessages', ...(view === 'shop' ? ['automaticMessages' as const] : []), 'responseSamples', 'averageResponseMinutes', 'medianResponseMinutes', 'p90ResponseMinutes', 'pendingReplies']
  return csv([...metadata(filter, result.asOf, '每日统计趋势', shops, staff),
    ['北京日期', '当日统计截至（北京）', ...columns.map(key => `${kpiMetricLabels[key]}${isResponseDurationMetric(key) ? '（分钟）' : ''}`)],
    ...result.trend.map(day => [day.date, formatKpiTime(day.asOf), ...columns.map(key => day.metrics[key] ?? '')]),
    [], ['说明', '耗时仅含当日完成人工首响的可靠样本，无样本留空；待回复按每日截至责任历史重建，包含期初积压。'],
  ])
}

export function createKpiComparisonCsv(comparison: ReturnType<typeof queryKpiComparison>, filter: KpiFilter, shops: string, staff: string): string {
  const { current, previous } = comparison
  return csv([...metadata(filter, current.asOf, '上一同长度期间对比', shops, staff),
    ['当前实际期间', `${comparison.currentStart} 至 ${comparison.currentEnd}`],
    ['前期期间', `${comparison.previousStart} 至 ${comparison.previousEnd}`],
    ['前期截至（北京）', previous ? formatKpiTime(previous.asOf) : ''],
    ['对比说明', comparison.error ?? comparison.label],
    ['指标', '当前值', '前期值', '变化量', '变化比例', '当前原始值（耗时为分钟）', '前期原始值（耗时为分钟）'],
    ...comparisonColumns.map(key => {
      const change = previous ? kpiChange(current.summary[key], previous.summary[key], key) : { difference: '—', rate: '—' }
      return [kpiMetricLabels[key], metricValue(current.summary, key), previous ? metricValue(previous.summary, key) : '—', change.difference, change.rate, current.summary[key] ?? '', previous?.summary[key] ?? '']
    }),
    [], ['说明', '各期分别从原始样本独立去重计算；待回复为各期截至存量；仅统计变化，不评分。'],
  ])
}

function metadata(filter: KpiFilter, asOf: string, scope: string, shops: string, staff: string): unknown[][] {
  return [['客服KPI统计', scope], ['统计日期', `${filter.startDate} 至 ${filter.endDate}`], ['业务时区', 'Asia/Shanghai（北京时间）'], ['统计截止', formatKpiTime(asOf)], ['店铺范围', shops], ['客服范围', staff], ['数据性质', '本地虚构评审数据，独立统计资料；未接入生产数据和服务端权限'], ['计算口径', '仅统计，不评分；人工响应按连续自然时间；自动回复单列；汇总独立去重'], []]
}

export function createKpiSummaryCsv(result: KpiResult, filter: KpiFilter, group: 'staff' | 'shop', columns: KpiMetric[], shops = '全部店铺', staff = '全部客服'): string {
  const rows = group === 'staff' ? result.staffRows : result.shopRows
  return csv([...metadata(filter, result.asOf, group === 'staff' ? '客服统计' : '店铺统计', shops, staff),
    [group === 'staff' ? '客服' : '店铺', ...columns.map(key => kpiMetricLabels[key])],
    ...rows.map(row => [row.name, ...columns.map(key => metricValue(row.metrics, key))]),
    ['合计（独立去重）', ...columns.map(key => metricValue(result.summary, key))],
    [], ['说明', '个人或店铺去重数不可直接相加；无响应样本显示—；待办为截至时点存量，不受起始日期限制。'],
  ])
}

export function createKpiDetailsCsv(details: KpiDetail[], filter: KpiFilter, asOf: string, metric: KpiMetric, scope: string, shops: string, staff: string, title: string = kpiMetricLabels[metric]): string {
  return csv([...metadata(filter, asOf, `${scope} · ${title}`, shops, staff),
    ['业务编号', '业务类型', '事项', '店铺', '人员', '动作', '结果', '发生时间（北京）', '本轮来信时间（北京）', '首次人工回复时间（北京）', '响应分钟数', '响应耗时', '截至等待分钟数', '截至等待耗时', '截止时间（北京）'],
    ...details.map(row => [row.number, ({ conversation: '站内信', cancellation: '取消申请', return: '退货退款申请', dispute: '纠纷', ticket: '工单' })[row.objectType], row.title, row.shopName, row.staffName, row.action, row.result, formatKpiTime(row.occurredAt), formatKpiTime(row.startedAt), formatKpiTime(row.respondedAt), row.respondedAt ? row.durationMinutes ?? '' : '', row.respondedAt ? formatKpiDuration(row.durationMinutes) : '', row.startedAt && !row.respondedAt ? row.durationMinutes ?? '' : '', row.startedAt && !row.respondedAt ? formatKpiDuration(row.durationMinutes) : '', formatKpiTime(row.dueAt)]),
  ])
}
