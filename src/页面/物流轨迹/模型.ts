import { 命中字段搜索, 命中多选 } from '@/组件/筛选/筛选工具'

export type TrackingStatus = 'NotFound' | 'InfoReceived' | 'InTransit' | 'Expired' | 'AvailableForPickup' | 'OutForDelivery' | 'DeliveryFailure' | 'Delivered' | 'Exception'
export type SubscriptionStatus = 'unregistered' | 'registered' | 'failed' | 'stopped'
export type TrackingTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'
export const trackingStatuses: Array<{ value: TrackingStatus; label: string; tone: TrackingTone }> = [
  { value: 'NotFound', label: '查询不到', tone: 'info' },
  { value: 'InfoReceived', label: '收到信息', tone: 'info' },
  { value: 'InTransit', label: '运输途中', tone: 'primary' },
  { value: 'Expired', label: '运输过久', tone: 'warning' },
  { value: 'AvailableForPickup', label: '到达待取', tone: 'warning' },
  { value: 'OutForDelivery', label: '派送途中', tone: 'primary' },
  { value: 'DeliveryFailure', label: '投递失败', tone: 'danger' },
  { value: 'Delivered', label: '成功签收', tone: 'success' },
  { value: 'Exception', label: '可能异常', tone: 'danger' },
]
export const subscriptionStatuses: Array<{ value: SubscriptionStatus; label: string; tone: TrackingTone }> = [
  { value: 'unregistered', label: '未注册', tone: 'info' },
  { value: 'registered', label: '已注册', tone: 'success' },
  { value: 'failed', label: '注册失败', tone: 'danger' },
  { value: 'stopped', label: '已停止跟踪', tone: 'info' },
]
export interface TrackingEvent {
  id: string
  timeUtc: string | null
  /** v2.4 time_raw {date,time,timezone} 的展示投影，非接口原始对象。不能据此补猜 UTC。 */
  timeRaw: string
  description: string
  /** 仅已取得的 zh-hans 描述；不在浏览器调用翻译服务。 */
  descriptionZh: string | null
  location: string
  status: TrackingStatus
  subStatus: string
}
export interface TrackingProvider { id: string; name: string; number: string; events: TrackingEvent[] }
export interface TrackingLog { id: string; at: string; action: string; result: string; detail: string }
export interface TrackingMilestone {
  keyStage: 'InfoReceived' | 'PickedUp' | 'Departure' | 'Arrival' | 'AvailableForPickup' | 'OutForDelivery' | 'Delivered' | 'Returned' | 'Returning'
  timeUtc: string | null
  timeIso: string | null
  timeRaw: { date: string | null; time: string | null; timezone: string | null }
}
export interface TrackingTimeMetrics {
  daysOfTransit: number | null
  daysAfterOrder: number | null
  daysOfTransitDone: number | null
  daysAfterLastUpdate: number | null
  estimatedDelivery: { from: string | null; to: string | null; source: 'Official' | '17TRACK' | null }
}
export interface TrackingRecord {
  id: string; number: string; carrierCode: number | null; carrierName: string
  platform: string; shopId: string; shopName: string; warehouse: string; channel: string; country: string
  orderNo: string; platformOrderNo: string; fulfillmentNo: string; packageNo: string
  status: TrackingStatus | null; subStatus: string; subscription: SubscriptionStatus
  syncState: 'success' | 'pending' | 'failed' | 'never'; syncError: string
  registeredAt: string | null; lastSyncAt: string | null; latestEventAt: string | null
  latestEventText: string; latestEventTextZh: string | null; latestLocation: string; shippedAt: string | null
  orderPlacedAt: string | null; timeMetrics: TrackingTimeMetrics; milestones: TrackingMilestone[]
  providers: TrackingProvider[]; logs: TrackingLog[]
}
export interface TrackingFilters {
  keyword: string; field: 'number' | 'orderNo' | 'platformOrderNo'; mode: 'contains' | 'exact'
  platforms: string[]; shops: string[]; warehouses: string[]; statuses: string[]; subscriptions: string[]; syncStates: string[]
}
export function emptyTrackingFilters(): TrackingFilters {
  return { keyword: '', field: 'number', mode: 'contains', platforms: [], shops: [], warehouses: [], statuses: [], subscriptions: [], syncStates: [] }
}
export function filterTrackingRecords(records: TrackingRecord[], filters: TrackingFilters): TrackingRecord[] {
  return records.filter(record => 命中字段搜索(record[filters.field], filters.keyword, filters.mode)
    && 命中多选(filters.platforms, record.platform) && 命中多选(filters.shops, record.shopId)
    && 命中多选(filters.warehouses, record.warehouse) && 命中多选(filters.statuses, record.status ?? 'unknown')
    && 命中多选(filters.subscriptions, record.subscription) && 命中多选(filters.syncStates, record.syncState))
}
export function statusLabel(status: TrackingStatus | null): string { return trackingStatuses.find(item => item.value === status)?.label ?? '暂无轨迹状态' }
export function subscriptionLabel(subscription: SubscriptionStatus): string { return subscriptionStatuses.find(item => item.value === subscription)?.label ?? '未知' }

// 对应17TRACK官方30个物流子状态的中文展示；原始code仍独立保存在来源记录中。
const subStatusNames: Record<string, string> = {
  NotFound_Other: '运输商暂无信息',
  NotFound_InvalidCode: '物流单号无效',
  InfoReceived: '收到信息',
  InTransit_PickedUp: '已揽收',
  InTransit_Other: '其他运输情况',
  InTransit_Departure: '已离港',
  InTransit_Arrival: '已到港',
  InTransit_CustomsProcessing: '清关中',
  InTransit_CustomsReleased: '清关完成',
  InTransit_CustomsRequiringInformation: '清关需要资料',
  Expired_Other: '运输过久',
  AvailableForPickup_Other: '到达待取',
  OutForDelivery_Other: '派送途中',
  DeliveryFailure_Other: '其他投递失败情况',
  DeliveryFailure_NoBody: '找不到收件人',
  DeliveryFailure_Security: '安全原因',
  DeliveryFailure_Rejected: '收件人拒收',
  DeliveryFailure_InvalidAddress: '地址错误',
  Delivered_Other: '成功签收',
  Exception_Other: '其他异常情况',
  Exception_Returning: '退件中',
  Exception_Returned: '退件签收',
  Exception_NoBody: '找不到收件人',
  Exception_Security: '安全原因',
  Exception_Damage: '包裹损坏',
  Exception_Rejected: '收件人拒收',
  Exception_Delayed: '运输延误',
  Exception_Lost: '包裹丢失',
  Exception_Destroyed: '包裹销毁',
  Exception_Cancel: '物流订单已取消',
}
export function subStatusLabel(code: string): string {
  return Object.prototype.hasOwnProperty.call(subStatusNames, code) ? subStatusNames[code]! : code || '—'
}

const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i
export function formatTrackingTime(value: string | null | undefined): string {
  if (!value || !hasOffset.test(value) || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}
export function formatEventTime(event: TrackingEvent, mode: 'beijing' | 'source'): string {
  if (mode === 'source') return event.timeRaw || '—'
  const display = formatTrackingTime(event.timeUtc)
  return display === '—' && event.timeRaw ? '时区待核实' : display
}

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function instant(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || !validDate(value.slice(0, 10))) return null
  const result = Date.parse(value)
  return Number.isFinite(result) ? result : null
}
/** 完整可归属事件集合的最早可靠时刻；任何不可比较事件都会阻断“首次”的认定。 */
export function firstTrackingEvent(record: TrackingRecord): TrackingEvent | null {
  const events = record.providers.flatMap(provider => provider.events)
  if (!events.length || events.some(event => instant(event.timeUtc) === null || validDate(event.timeRaw.trim()) || /(?:来源未提供时区|时区待核实|未提供时区)/.test(event.timeRaw))) return null
  return events.reduce((earliest, event) => instant(event.timeUtc)! < instant(earliest.timeUtc)! ? event : earliest)
}

type SourceTime = { kind: 'instant'; value: number; minutesOnly: boolean } | { kind: 'date'; value: string } | { kind: 'unknown' } | { kind: 'empty' } | { kind: 'conflict' }
function milestoneSourceTime(milestone: TrackingMilestone): SourceTime {
  const raw = milestone.timeRaw
  // 来源明确仅日期时，不能展示适配器规范化补出的零点。
  if (validDate(raw.date) && !raw.time?.trim()) return { kind: 'date', value: raw.date }
  // 明确缺运输商来源时区时，UTC/ISO可能是服务方补总部时区，不能据此认定可靠时刻。
  if (raw.date && raw.time && !raw.timezone?.trim()) return { kind: 'unknown' }
  const utc = instant(milestone.timeUtc), iso = instant(milestone.timeIso)
  if (utc !== null && iso !== null && utc !== iso) return { kind: 'conflict' }
  let at = utc ?? iso
  const minutesOnly = !!raw.time && /^\d{2}:\d{2}$/.test(raw.time)
  if (at === null && validDate(raw.date) && raw.time) {
    const offset = raw.timezone?.replace(/^UTC/i, '')
    if (offset && /^(?:Z|[+-]\d{2}:?\d{2})$/i.test(offset)) at = instant(`${raw.date}T${raw.time}${offset}`)
  }
  if (at !== null) return { kind: 'instant', value: at, minutesOnly }
  if (validDate(milestone.timeIso)) return { kind: 'date', value: milestone.timeIso }
  if (milestone.timeUtc || milestone.timeIso || raw.date || raw.time || raw.timezone) return { kind: 'unknown' }
  return { kind: 'empty' }
}
function eventSourceTime(event: TrackingEvent): SourceTime {
  if (validDate(event.timeRaw.trim())) return { kind: 'date', value: event.timeRaw.trim() }
  if (/(?:来源未提供时区|时区待核实|未提供时区)/.test(event.timeRaw)) return { kind: 'unknown' }
  const at = instant(event.timeUtc)
  return at !== null ? { kind: 'instant', value: at, minutesOnly: false } : event.timeRaw || event.timeUtc ? { kind: 'unknown' } : { kind: 'empty' }
}
function displaySourceTimes(values: SourceTime[]): string {
  if (values.some(value => value.kind === 'conflict')) return '待核实'
  const instants = values.filter((value): value is Extract<SourceTime, { kind: 'instant' }> => value.kind === 'instant')
  if (new Set(instants.map(value => value.value)).size > 1) return '待核实'
  if (instants.length) {
    const display = formatTrackingTime(new Date(instants[0]!.value).toISOString())
    return instants.some(value => value.minutesOnly) ? display.slice(0, 16) : display
  }
  const dates = values.filter((value): value is Extract<SourceTime, { kind: 'date' }> => value.kind === 'date')
  if (new Set(dates.map(value => value.value)).size > 1) return '待核实'
  if (dates.length) return dates[0]!.value
  return values.some(value => value.kind === 'unknown') ? '时区待核实' : '—'
}
export function milestoneTime(record: TrackingRecord, keyStage: TrackingMilestone['keyStage']): string {
  return displaySourceTimes(record.milestones.filter(milestone => milestone.keyStage === keyStage).map(milestoneSourceTime))
}
/** 当前主状态和退件事件不构成签收时间；仅核对真实Delivered来源，可靠时刻冲突不擅取首条。 */
export function signatureTime(record: TrackingRecord): string {
  const milestones = record.milestones.filter(milestone => milestone.keyStage === 'Delivered').map(milestoneSourceTime)
  const events = record.providers.flatMap(provider => provider.events).filter(event => event.subStatus === 'Delivered_Other').map(eventSourceTime)
  const sources = [...milestones, ...events]
  if (sources.some(source => source.kind === 'instant') && sources.some(source => source.kind === 'date')) return '待核实'
  if (sources.some(source => source.kind === 'unknown') && sources.some(source => source.kind === 'instant' || source.kind === 'date')) return '待核实'
  return displaySourceTimes(sources)
}
function hasEvents(record: TrackingRecord): boolean { return record.providers.some(provider => provider.events.length > 0) }
function dayLabel(value: number | null): string { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value}天` : '—' }
export function transitDaysLabel(record: TrackingRecord): string {
  return record.status === 'NotFound' || !hasEvents(record) ? '—' : dayLabel(record.timeMetrics.daysOfTransit)
}
export function metricDaysLabel(record: TrackingRecord, key: 'daysAfterOrder' | 'daysOfTransitDone' | 'daysAfterLastUpdate'): string {
  if (record.status === 'NotFound' || !hasEvents(record)) return '—'
  if (key === 'daysOfTransitDone' && record.status !== 'Delivered') return '—'
  if (key === 'daysAfterLastUpdate' && (record.status === 'Delivered' || record.subStatus === 'Exception_Returned')) return '—'
  return dayLabel(record.timeMetrics[key])
}
function estimatedEndpoint(value: string | null): string {
  if (validDate(value)) return value
  return instant(value) === null ? '—' : formatTrackingTime(value)
}
export function estimatedDeliveryLabel(record: TrackingRecord): string {
  const estimate = record.timeMetrics.estimatedDelivery
  if (estimate.source !== 'Official' && estimate.source !== '17TRACK') return '—'
  const from = estimatedEndpoint(estimate.from), to = estimatedEndpoint(estimate.to)
  if (from === '—' && to === '—') return '—'
  if (from === '—') return `截至 ${to}`
  if (to === '—') return `${from} 起`
  if (from.slice(0, 10) > to.slice(0, 10) || (!validDate(from) && !validDate(to) && from > to)) return '待核实'
  return from === to ? from : `${from} ～ ${to}`
}

export const trackingDemoNow = '2026-11-09T10:00:00Z'
function appendLog(record: TrackingRecord, action: string, result: string, detail: string, at: string): void {
  record.logs.unshift({ id: `${record.id}-log-${record.logs.length + 1}`, at, action, result, detail })
}
function numberError(record: TrackingRecord): string {
  return /^[a-z\d-]{5,50}$/i.test(record.number) ? '' : '跟踪号格式不符合要求，请核对来源单号后重试。'
}
/** 本地注册受理演示；不取得新轨迹、不改变承运事实，也不会创建订单发货或签收事实。 */
export function registerTracking(record: TrackingRecord, at = trackingDemoNow): { ok: boolean; message: string } {
  if (record.subscription === 'registered') return { ok: false, message: '该包裹已注册，无需重复注册。' }
  if (record.subscription === 'stopped') return { ok: false, message: '该包裹已停止跟踪，需核对重新跟踪条件。' }
  const error = numberError(record) || (!record.carrierCode ? '运输商尚未明确，请核对承运商映射后重新注册。' : '')
  if (error) {
    record.subscription = 'failed'; record.syncError = error
    appendLog(record, '注册跟踪', '失败', error, at)
    return { ok: false, message: error }
  }
  record.subscription = 'registered'; record.registeredAt = at; record.syncState = 'pending'; record.syncError = ''
  const message = '注册已受理，等待轨迹更新。'
  appendLog(record, '注册跟踪', '已受理', message, at)
  return { ok: true, message }
}
/** 演示 gettrackinfo 读取17TRACK已有轨迹；不是 getRealTimeTrackInfo，不强制运输商产生新事件。 */
export function refreshTracking(record: TrackingRecord, at = trackingDemoNow): { ok: boolean; message: string } {
  if (record.subscription !== 'registered') return { ok: false, message: '请先完成注册；已停止跟踪的包裹需另行核实。' }
  const error = numberError(record) || (!record.carrierCode ? '运输商尚未明确，请先核实注册身份。' : '')
    || (record.id === 'track-demo-13' ? '运输商查询暂时不可用，请稍后更新；已取得的轨迹继续保留。' : '')
    || (record.id === 'track-demo-14' ? '访问频率超出限制，请稍后更新；已取得的签收记录继续保留。' : '')
  if (error) {
    record.syncState = 'failed'; record.syncError = error
    appendLog(record, '更新轨迹', '失败', error, at)
    return { ok: false, message: error }
  }
  record.syncState = record.status === null && !record.providers.some(provider => provider.events.length) ? 'pending' : 'success'
  record.syncError = ''
  // 等待中不能把一次查询请求时间冒充最近成功同步时间。
  if (record.syncState === 'success') record.lastSyncAt = at
  const message = record.syncState === 'pending' ? '已查询，尚未取得轨迹，请等待后续更新。' : '已读取17TRACK缓存，暂无新增轨迹。'
  appendLog(record, '更新轨迹', record.syncState === 'pending' ? '等待轨迹' : '成功', message, at)
  return { ok: true, message }
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
export function exportTrackingCsv(records: TrackingRecord[]): string {
  const headers = ['跟踪号', '运输商', '17TRACK运输商代码', '平台', '店铺', '发货仓库', '物流渠道', '目的国家/地区', '系统订单号', '平台订单号', '履约单号', '包裹编号', '物流状态', '物流子状态', '跟踪注册状态', '同步情况', '更新失败原因', '最新轨迹', '最新轨迹中文', '轨迹位置', '轨迹时间（北京时间）', '最近成功同步（北京时间）', '注册受理时间（北京时间）', '订单下单时间（北京时间）', '本包裹发货时间（北京时间）', '运输天数', '首次轨迹时间（北京时间）', '收到信息时间', '揽收时间', '离港时间', '到港时间', '签收时间', '运单时效', '妥投时效', '无更新天数', '预计到达区间', '预计到达来源', '数据性质']
  const syncLabels = { success: '更新成功', pending: '等待轨迹', failed: '更新失败', never: '尚未更新' }
  const rows = records.map(record => [record.number, record.carrierName, record.carrierCode === null ? '' : String(record.carrierCode), record.platform, record.shopName, record.warehouse, record.channel, record.country, record.orderNo, record.platformOrderNo, record.fulfillmentNo, record.packageNo, statusLabel(record.status), record.subStatus, subscriptionLabel(record.subscription), syncLabels[record.syncState], record.syncError, record.latestEventText, record.latestEventTextZh ?? '', record.latestLocation, formatTrackingTime(record.latestEventAt), formatTrackingTime(record.lastSyncAt), formatTrackingTime(record.registeredAt), formatTrackingTime(record.orderPlacedAt), formatTrackingTime(record.shippedAt), transitDaysLabel(record), formatTrackingTime(firstTrackingEvent(record)?.timeUtc), milestoneTime(record, 'InfoReceived'), milestoneTime(record, 'PickedUp'), milestoneTime(record, 'Departure'), milestoneTime(record, 'Arrival'), signatureTime(record), metricDaysLabel(record, 'daysAfterOrder'), metricDaysLabel(record, 'daysOfTransitDone'), metricDaysLabel(record, 'daysAfterLastUpdate'), estimatedDeliveryLabel(record), record.timeMetrics.estimatedDelivery.source === 'Official' ? '运输商官方' : record.timeMetrics.estimatedDelivery.source === '17TRACK' ? '17TRACK' : '—', '本地虚构评审数据'])
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}
