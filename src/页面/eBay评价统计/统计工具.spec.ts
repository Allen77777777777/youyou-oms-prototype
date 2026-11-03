import { describe, expect, it } from 'vitest'
import { createReviewFilters, summarizeReviews } from '../eBay评价/模型'
import { chartScale, createStatisticsCsv, formatReviewRate, statisticsReviewQuery } from './统计工具'

describe('评价统计下钻与导出', () => {
  it('空分母与零百分比有区别，图表空范围保留正向刻度', () => {
    expect(formatReviewRate(null)).toBe('—'); expect(formatReviewRate(0)).toBe('0.0%')
    expect(chartScale([])).toEqual({ maximum: 4, ticks: [0, 1, 2, 3, 4] })
  })
  it('清空日期下钻保持不限，单店铺取代多店铺范围', () => {
    const filters = createReviewFilters({ dateRange: [], source: 'buyer', shopIds: ['shop-us', 'shop-uk'] })
    expect(statisticsReviewQuery(filters, { shopId: 'shop-uk', pending: true })).toEqual({ from: 'statistics', effective: '1', shopIds: 'shop-uk', startDate: '', endDate: '', source: 'buyer', commentTypes: 'NEUTRAL,NEGATIVE', handlingStatuses: 'pending,processing' })
    expect(filters.shopIds).toEqual(['shop-us', 'shop-uk'])
  })
  it('CSV包含统计范围、虚构性质、四个区块并防公式注入', () => {
    const summary = summarizeReviews([])
    const csv = createStatisticsCsv({ filters: createReviewFilters({ source: 'buyer', shopIds: ['shop-us'] }), shopNames: [' =HYPERLINK("https://example.com")'], summary,
      shops: [{ shopId: '@SUM(1)', shopName: '包含"引号",逗号\n换行', ...summary }],
      trend: [{ date: '2026-10-29', total: 0, positive: 0, neutral: 0, negative: 0 }], reasons: [{ reason: '\t=1+1', count: 0 }],
    })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('本地虚构评审数据'); expect(csv).toContain('北京时间（UTC+8）'); expect(csv).toContain('2026-09-30 至 2026-10-29')
    expect(csv).toContain('买家主动评价'); expect(csv).toContain('店铺统计'); expect(csv).toContain('每日趋势'); expect(csv).toContain('中差评原因分布')
    expect(csv).toContain('"中差评率","—"')
    expect(csv).toContain('"\' =HYPERLINK(""https://example.com"")"')
    expect(csv).toContain('"\'@SUM(1)"'); expect(csv).toContain('"\'\t=1+1"')
    expect(csv).toContain('"包含""引号"",逗号\n换行"')
  })
})
