import type { LocationQueryRaw } from 'vue-router'
import type { ReviewFilters, ReviewReasonSummary, ReviewShopSummary, ReviewSummary, ReviewTrend } from '../eBay评价/类型'

export const defaultStatisticsRange: [string, string] = ['2026-09-30', '2026-10-29']
export const formatReviewRate = (rate: number | null) => rate === null ? '—' : `${rate.toFixed(1)}%`

export function statisticsReviewQuery(filters: ReviewFilters, options: { shopId?: string; nonPositive?: boolean; pending?: boolean; source?: ReviewFilters['source'] } = {}): LocationQueryRaw {
  return {
    from: 'statistics', effective: '1',
    shopIds: (options.shopId ? [options.shopId] : filters.shopIds).join(','),
    startDate: filters.dateRange[0] ?? '', endDate: filters.dateRange[1] ?? '',
    source: options.source ?? filters.source,
    ...(options.nonPositive || options.pending ? { commentTypes: 'NEUTRAL,NEGATIVE' } : {}),
    ...(options.pending ? { handlingStatuses: 'pending,processing' } : {}),
  }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  const safe = /^[\s\uFEFF]*[=+\-@\t\r]/u.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function createStatisticsCsv(input: {
  filters: ReviewFilters; shopNames: string[]; summary: ReviewSummary; shops: ReviewShopSummary[]; trend: ReviewTrend[]; reasons: ReviewReasonSummary[]
}): string {
  const { filters, summary, shops, trend, reasons } = input
  const source = { all: '全部来源', buyer: '买家主动评价', automated: '平台自动评价' }[filters.source]
  const rows: unknown[][] = [
    ['eBay评价统计', '本地虚构评审数据，不代表真实经营结果或平台官方评分'],
    ['统计时区', '北京时间（UTC+8）'], ['评价日期', filters.dateRange.length ? filters.dateRange.join(' 至 ') : '全部时间'],
    ['店铺范围', input.shopNames.length ? input.shopNames.join(' / ') : '全部店铺'], ['评价来源', source],
    ['口径', '只统计有效评价，排除已撤回、已隐藏及已被替代旧评价；中差评率=有效中差评/有效评价；待处理含待处理与处理中'], [],
    ['指标', '数量或比率'], ['有效评价', summary.total], ['买家主动评价', summary.total - summary.automated], ['平台自动评价', summary.automated],
    ['中差评', summary.nonPositive], ['中差评率', formatReviewRate(summary.nonPositiveRate)], ['待处理中差评', summary.pending], [],
    ['店铺统计'], ['店铺ID', '店铺', '有效评价', '买家主动', '平台自动', '好评', '中评', '差评', '中差评率', '待处理中差评'],
    ...shops.map(row => [row.shopId, row.shopName, row.total, row.total - row.automated, row.automated, row.positive, row.neutral, row.negative, formatReviewRate(row.nonPositiveRate), row.pending]), [],
    ['每日趋势'], ['评价日期（北京时间）', '有效评价', '好评', '中评', '差评'], ...trend.map(row => [row.date, row.total, row.positive, row.neutral, row.negative]), [],
    ['中差评原因分布'], ['人工分类原因', '有效中差评数量'], ...reasons.map(row => [row.reason, row.count]),
  ]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function chartScale(trend: ReviewTrend[]) {
  const maximum = Math.max(1, ...trend.map(row => row.total))
  const step = Math.max(1, Math.ceil(maximum / 4))
  return { maximum: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] }
}
