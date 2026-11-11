import { beijingKpiDate, metricDetails, parseKpiTime, queryKpi } from './统计模型'
import type { KpiData, KpiDetail, KpiFilter, KpiResult } from './统计模型'

export interface KpiWaitingBucket { key: string; label: string; count: number; details: KpiDetail[] }

/** 等待区间只表达截至等待分布，不是回复达标线，边界采用左闭右开。 */
export function waitingBuckets(result: KpiResult): KpiWaitingBucket[] {
  const definitions = [
    { key: 'under-1h', label: '不足1小时', min: 0, max: 60 },
    { key: '1h-4h', label: '1～不足4小时', min: 60, max: 240 },
    { key: '4h-12h', label: '4～不足12小时', min: 240, max: 720 },
    { key: '12h-24h', label: '12～不足24小时', min: 720, max: 1440 },
    { key: '24h-plus', label: '24小时及以上', min: 1440, max: Infinity },
  ]
  const pending = metricDetails(result, 'pendingReplies')
  return definitions.map(({ key, label, min, max }) => {
    const details = pending.filter(item => item.durationMinutes !== undefined && Number.isFinite(item.durationMinutes)
      && item.durationMinutes >= min && item.durationMinutes < max)
      .sort((a, b) => b.durationMinutes! - a.durationMinutes! || a.id.localeCompare(b.id))
    return { key, label, count: details.length, details }
  })
}

/** 仅保留有可靠必办期限且截至尚未逾期的平台待办，不设置“收到后N天”等内部时限。 */
export function platformDueItems(result: KpiResult): KpiDetail[] {
  const asOf = parseKpiTime(result.asOf)
  if (asOf === null) return []
  return (['cancellationPending', 'returnPending', 'disputePending'] as const)
    .flatMap(metric => metricDetails(result, metric))
    .filter(item => {
      const due = parseKpiTime(item.dueAt)
      return due !== null && due >= asOf
    })
    .sort((a, b) => parseKpiTime(a.dueAt)! - parseKpiTime(b.dueAt)! || a.id.localeCompare(b.id))
}

export interface KpiComparison {
  current: KpiResult
  previous: KpiResult | null
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  label: string
  error: string | null
}

const DAY = 86400000
const dateAt = (stamp: number) => beijingKpiDate(new Date(stamp).toISOString())

/** 按实际可用的北京日数向前平移；当前末日未满时，上期末日截到同一北京时间。 */
export function queryKpiComparison(data: KpiData, filter: KpiFilter): KpiComparison {
  const current = queryKpi(data, filter)
  const result: KpiComparison = {
    current, previous: null, currentStart: filter.startDate, currentEnd: '', previousStart: '', previousEnd: '',
    label: '上一同长度期间', error: current.error,
  }
  if (current.error) return result
  const cutoff = parseKpiTime(current.asOf)!
  const start = parseKpiTime(`${filter.startDate}T00:00:00+08:00`)!
  result.currentEnd = dateAt(cutoff)
  const endDay = parseKpiTime(`${result.currentEnd}T00:00:00+08:00`)!
  const days = Math.round((endDay - start) / DAY) + 1
  const previousStart = start - days * DAY
  const previousCutoff = cutoff - days * DAY
  result.previousStart = dateAt(previousStart)
  result.previousEnd = dateAt(start - DAY)
  result.label = `上一同长度期间（${days}个北京自然日，末日截至同一时刻）`
  const coverageStart = parseKpiTime(data.coverageStart)
  if (coverageStart === null) {
    result.error = '未取得完整数据覆盖起点，暂不可比'
    return result
  }
  if (coverageStart > previousStart) {
    result.error = '上一期间超出完整数据覆盖范围，暂不可比'
    return result
  }
  const previous = queryKpi(data, {
    ...filter, startDate: result.previousStart, endDate: result.previousEnd, asOf: new Date(previousCutoff).toISOString(),
  })
  if (previous.error) result.error = previous.error
  else result.previous = previous
  return result
}
