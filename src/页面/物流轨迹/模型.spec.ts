import { describe, expect, it } from 'vitest'
import { createTrackingRecords } from './演示数据'
import { emptyTrackingFilters, estimatedDeliveryLabel, exportTrackingCsv, filterTrackingRecords, firstTrackingEvent, formatEventTime, formatTrackingTime, metricDaysLabel, milestoneTime, refreshTracking, registerTracking, signatureTime, subStatusLabel, trackingStatuses, transitDaysLabel, type TrackingMilestone, type TrackingRecord } from './模型'

function row(index = 0): TrackingRecord { return createTrackingRecords()[index]! }
describe('物流轨迹来源与查询', () => {
  it('已知子状态显示中文，未知代码原样回退且不推断主状态', () => {
    expect(subStatusLabel('InTransit_CustomsRequiringInformation')).toBe('清关需要资料')
    expect(subStatusLabel('Exception_Returned')).toBe('退件签收')
    expect(subStatusLabel('DeliveryFailure_InvalidAddress')).toBe('地址错误')
    expect(subStatusLabel('FutureCarrier_NewStatus')).toBe('FutureCarrier_NewStatus')
    expect(subStatusLabel('__proto__')).toBe('__proto__')
    expect(subStatusLabel('')).toBe('—')
  })
  it('覆盖九主状态并将没有轨迹状态与NotFound分开', () => {
    const records = createTrackingRecords()
    expect(new Set(records.map(item => item.id)).size).toBe(records.length)
    expect(trackingStatuses.every(item => records.some(record => record.status === item.value))).toBe(true)
    const missing = filterTrackingRecords(records, { ...emptyTrackingFilters(), statuses: ['unknown'] })
    expect(missing).toHaveLength(3)
    expect(missing.every(item => item.status === null)).toBe(true)
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), statuses: ['NotFound'] }).every(item => item.status === 'NotFound')).toBe(true)
  })
  it('同条件OR不同维度AND，搜索只查询选定字段且不会合并同号', () => {
    const records = createTrackingRecords(), sharedNumber = records[17]!.number
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), keyword: sharedNumber, mode: 'exact' })).toHaveLength(2)
    const filtered = filterTrackingRecords(records, { ...emptyTrackingFilters(), platforms: ['eBay', 'Temu'], subscriptions: ['registered'], statuses: ['InTransit', 'Delivered'] })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every(item => ['eBay', 'Temu'].includes(item.platform) && item.subscription === 'registered' && ['InTransit', 'Delivered'].includes(item.status!))).toBe(true)
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), keyword: records[0]!.orderNo, field: 'number' })).toHaveLength(0)
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), keyword: `${records[0]!.orderNo}\n${records[1]!.orderNo}`, field: 'orderNo', mode: 'exact' })).toHaveLength(2)
  })
  it('每次创建独立对象，同订单包裹及多运输商事件保持各自身份', () => {
    const first = createTrackingRecords(), second = createTrackingRecords()
    first[0]!.providers[0]!.events.push(first[1]!.providers[0]!.events[0]!)
    expect(second[0]!.providers[0]!.events).toHaveLength(0)
    expect(first[20]!.orderNo).toBe(first[21]!.orderNo)
    expect(first[20]!.packageNo).not.toBe(first[21]!.packageNo)
    expect(first[16]!.providers).toHaveLength(2)
  })
  it('同步状态多选与其它筛选取交集，更新失败仍保留物流运输状态', () => {
    const records = createTrackingRecords()
    const failed = filterTrackingRecords(records, { ...emptyTrackingFilters(), syncStates: ['failed'] })
    expect(failed.map(record => record.id)).toEqual(['track-demo-13', 'track-demo-14'])
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), syncStates: ['failed'], statuses: ['Delivered'] }).map(record => record.id)).toEqual(['track-demo-14'])
    expect(filterTrackingRecords(records, { ...emptyTrackingFilters(), syncStates: ['failed', 'pending'] })).toHaveLength(3)
    expect(filterTrackingRecords(records, emptyTrackingFilters())).toHaveLength(24)
  })
})

describe('跟踪注册及更新', () => {
  it('注册受理只进入等待，不冒充获得轨迹或NotFound，不修改单号和实际承运商', () => {
    const record = row(9), origin = { orderNo: record.orderNo, number: record.number, carrierCode: record.carrierCode }
    expect(registerTracking(record).ok).toBe(true)
    expect(record.subscription).toBe('registered')
    expect(record.syncState).toBe('pending')
    expect(record.status).toBeNull()
    expect(record.lastSyncAt).toBeNull()
    expect(record.providers).toHaveLength(0)
    expect(record.logs[0]!.result).toBe('已受理')
    expect({ orderNo: record.orderNo, number: record.number, carrierCode: record.carrierCode }).toEqual(origin)
    expect(registerTracking(record).ok).toBe(false)
    expect(record.logs).toHaveLength(1)
  })
  it('未明确承运商和非法单号注册失败，已有事实不被清空', () => {
    const record = row(10)
    expect(registerTracking(record).ok).toBe(false)
    expect(record.subscription).toBe('failed')
    expect(record.syncError).toContain('运输商')
    const invalid = row(9); invalid.number = 'bad/'
    expect(registerTracking(invalid).ok).toBe(false)
    expect(invalid.registeredAt).toBeNull()
    expect(invalid.logs[0]!.detail).toContain('格式')
    const historical = row(7), priorSyncedAt = historical.lastSyncAt
    historical.subscription = 'unregistered'; historical.carrierCode = null
    expect(registerTracking(historical).ok).toBe(false)
    expect(historical.syncState).toBe('success')
    expect(historical.status).toBe('Delivered')
    expect(historical.lastSyncAt).toBe(priorSyncedAt)
  })
  it('重复注册和停止跟踪对象保护，不用注册绕过重新跟踪规则', () => {
    const record = row(0), snapshot = JSON.stringify(record)
    expect(registerTracking(record).ok).toBe(false)
    expect(JSON.stringify(record)).toBe(snapshot)
    const stopped = row(14)
    expect(registerTracking(stopped).message).toContain('停止')
    expect(refreshTracking(stopped).ok).toBe(false)
  })
  it('查询失败保留成功同步、当前签收和运输商原事件', () => {
    const record = row(13), snapshot = JSON.stringify(record.providers), synced = record.lastSyncAt
    expect(refreshTracking(record).ok).toBe(false)
    expect(record.status).toBe('Delivered')
    expect(record.syncState).toBe('failed')
    expect(record.lastSyncAt).toBe(synced)
    expect(JSON.stringify(record.providers)).toBe(snapshot)
    expect(record.logs[0]!.result).toBe('失败')
  })
  it('更新只读取现有轨迹，不产生事件；等待中不伪造成功同步时间', () => {
    const record = row(2), snapshot = JSON.stringify(record.providers)
    expect(refreshTracking(record).ok).toBe(true)
    expect(record.status).toBe('InTransit')
    expect(record.syncState).toBe('success')
    expect(JSON.stringify(record.providers)).toBe(snapshot)
    const pending = row(11)
    expect(refreshTracking(pending).ok).toBe(true)
    expect(pending.syncState).toBe('pending')
    expect(pending.status).toBeNull()
    expect(pending.lastSyncAt).toBeNull()
    expect(refreshTracking(row(9)).ok).toBe(false)
  })
})

describe('时间与导出', () => {
  it('仅日期来源保留日期，不补零点或转换成精确北京时间', () => {
    const event = row(23).providers[0]!.events[0]!, snapshot = JSON.stringify(event)
    expect(event.timeUtc).toBeNull()
    expect(formatEventTime(event, 'source')).toBe('2026-11-09')
    expect(formatEventTime(event, 'beijing')).toBe('时区待核实')
    expect(formatTrackingTime(event.timeRaw)).toBe('—')
    expect(JSON.stringify(event)).toBe(snapshot)
  })
  it('明确转北京时间，跨日与缺失来源不依赖运行主机时区', () => {
    expect(formatTrackingTime('2026-11-08T20:30:00Z')).toBe('2026-11-09 04:30:00')
    expect(formatTrackingTime('2026-11-09T08:30:00-05:00')).toBe('2026-11-09 21:30:00')
    expect(formatTrackingTime('2026-11-09 08:30:00')).toBe('—')
    expect(formatTrackingTime(null)).toBe('—')
    const event = row(15).providers[0]!.events[0]!
    expect(formatEventTime(event, 'beijing')).toBe('时区待核实')
    expect(formatEventTime(event, 'source')).toContain('来源未提供时区')
  })
  it('CSV全量逐包裹导出，保留失败、缺值、引用转义及公式防护', () => {
    const records = [row(13), row(9)], original = JSON.stringify(records)
    records[0]!.latestEventText = '=HYPERLINK("https://example.test")'
    records[0]!.shopName = '店铺,"甲"\n新行'
    const csv = exportTrackingCsv(records)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('成功签收')
    expect(csv).toContain('更新失败')
    expect(csv).toContain('暂无轨迹状态')
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain('店铺,""甲""\n新行')
    expect(csv).toContain('本地虚构评审数据')
    expect(JSON.stringify(records)).not.toBe(original)
    const snapshot = JSON.stringify(records)
    exportTrackingCsv(records)
    expect(JSON.stringify(records)).toBe(snapshot)
  })
})

describe('物流时效、里程碑与订单关联', () => {
  it('首次轨迹遍历全部运输商取最早可靠时刻，任一事件缺时刻或仅日期均不猜补', () => {
    const record = row(16), snapshot = JSON.stringify(record.providers)
    expect(firstTrackingEvent(record)?.id).toBe('track-demo-17-source-InfoReceived')
    expect(JSON.stringify(record.providers)).toBe(snapshot)
    expect(firstTrackingEvent(row(0))).toBeNull()
    expect(firstTrackingEvent(row(15))).toBeNull()
    expect(firstTrackingEvent(row(23))).toBeNull()
    record.providers[0]!.events[0]!.timeUtc = '2026-11-08'
    expect(firstTrackingEvent(record)).toBeNull()
    record.providers[0]!.events[0]!.timeUtc = '2026-11-08T03:30:00Z'
    record.providers[0]!.events[0]!.timeRaw = '2026-11-08'
    expect(firstTrackingEvent(record)).toBeNull()
    record.providers[0]!.events[0]!.timeRaw = '2026-11-08 03:30:00（来源未提供时区）'
    expect(firstTrackingEvent(record)).toBeNull()
  })
  it('里程碑区分日期、完整时刻和时区待核实，不补零点或用下单时间替代', () => {
    expect(milestoneTime(row(23), 'InfoReceived')).toBe('2026-11-09')
    expect(milestoneTime(row(15), 'InfoReceived')).toBe('时区待核实')
    expect(milestoneTime(row(9), 'PickedUp')).toBe('—')
    expect(milestoneTime(row(2), 'PickedUp')).toBe('2026-11-06 13:00:00')
    const record = row(2)
    record.milestones = [{ keyStage: 'InfoReceived', timeUtc: '2026-11-09T00:00:00Z', timeIso: null, timeRaw: { date: '2026-11-09', time: null, timezone: null } }]
    expect(milestoneTime(record, 'InfoReceived')).toBe('2026-11-09')
    record.milestones = [{ keyStage: 'PickedUp', timeUtc: null, timeIso: '2026-11-09T01:30:00-05:00', timeRaw: { date: '2026-11-09', time: '01:30', timezone: '-05:00' } }]
    expect(milestoneTime(record, 'PickedUp')).toBe('2026-11-09 14:30')
    record.milestones[0]!.timeRaw.timezone = null
    record.milestones[0]!.timeUtc = '2026-11-09T06:30:00Z'
    expect(milestoneTime(record, 'PickedUp')).toBe('时区待核实')
  })
  it('签收只从Delivered来源取得，主状态和退件签收不能制造收件人签收', () => {
    expect(signatureTime(row(7))).toBe('2026-11-09 10:20:00')
    expect(signatureTime(row(13))).toBe('2026-11-08 17:20:00')
    const record = row(2)
    record.status = 'Delivered'
    expect(signatureTime(record)).toBe('—')
    record.status = 'Exception'; record.subStatus = 'Exception_Returned'
    record.milestones = [{ keyStage: 'Returned', timeUtc: '2026-11-09T01:00:00Z', timeIso: null, timeRaw: { date: '2026-11-09', time: '01:00:00', timezone: '+00:00' } }]
    record.providers[0]!.events[0]!.subStatus = 'Exception_Returned'
    expect(signatureTime(record)).toBe('—')
  })
  it('签收交叉核对可靠时刻，冲突和不能证实一致的精度差异均待核实', () => {
    const record = row(7), delivered = record.milestones.find(milestone => milestone.keyStage === 'Delivered')!
    delivered.timeUtc = '2026-11-09T02:21:00Z'; delivered.timeIso = delivered.timeUtc
    expect(signatureTime(record)).toBe('待核实')
    delivered.timeUtc = null; delivered.timeIso = null; delivered.timeRaw.time = null
    expect(signatureTime(record)).toBe('待核实')
    record.providers = []
    expect(signatureTime(record)).toBe('2026-11-09')
    delivered.timeRaw.time = '02:20:00'; delivered.timeRaw.timezone = null
    expect(signatureTime(record)).toBe('时区待核实')
  })
  it('天数直读来源，适用0保留，无结果、缺值、负数及非妥投默认0不显示', () => {
    const info = row(1)
    expect(transitDaysLabel(info)).toBe('0天')
    expect(metricDaysLabel(info, 'daysAfterOrder')).toBe('0天')
    expect(metricDaysLabel(info, 'daysAfterLastUpdate')).toBe('0天')
    expect(metricDaysLabel(info, 'daysOfTransitDone')).toBe('—')
    expect(transitDaysLabel(row(2))).toBe('—')
    const notFound = row(0)
    notFound.timeMetrics.daysOfTransit = 0; notFound.timeMetrics.daysOfTransitDone = 0
    expect(transitDaysLabel(notFound)).toBe('—')
    expect(metricDaysLabel(notFound, 'daysOfTransitDone')).toBe('—')
    const record = row(2)
    record.timeMetrics.daysOfTransit = 0; record.timeMetrics.daysAfterOrder = 7
    record.orderPlacedAt = '2026-01-01T00:00:00Z'; record.shippedAt = '2026-11-01T00:00:00Z'
    expect(transitDaysLabel(record)).toBe('0天')
    expect(metricDaysLabel(record, 'daysAfterOrder')).toBe('7天')
    record.timeMetrics.daysOfTransit = -1
    expect(transitDaysLabel(record)).toBe('—')
    record.timeMetrics.daysAfterOrder = 1.5
    expect(metricDaysLabel(record, 'daysAfterOrder')).toBe('1.5天')
    record.timeMetrics.daysAfterOrder = Infinity
    expect(metricDaysLabel(record, 'daysAfterOrder')).toBe('—')
    record.timeMetrics.daysOfTransit = NaN
    expect(transitDaysLabel(record)).toBe('—')
    record.providers = []
    expect(metricDaysLabel(record, 'daysAfterLastUpdate')).toBe('—')
  })
  it('妥投时效只在Delivered适用，已签收和退件签收不显示无更新0', () => {
    const delivered = row(7)
    delivered.timeMetrics.daysOfTransitDone = 0
    expect(metricDaysLabel(delivered, 'daysOfTransitDone')).toBe('0天')
    expect(metricDaysLabel(delivered, 'daysAfterLastUpdate')).toBe('—')
    const returned = row(8)
    returned.subStatus = 'Exception_Returned'; returned.timeMetrics.daysAfterLastUpdate = 0
    expect(metricDaysLabel(returned, 'daysOfTransitDone')).toBe('—')
    expect(metricDaysLabel(returned, 'daysAfterLastUpdate')).toBe('—')
  })
  it('预计到达保留日期和提供者，明确时区转换，缺提供者不展示区间', () => {
    const record = row(1)
    expect(estimatedDeliveryLabel(record)).toBe('2026-11-10 ～ 2026-11-12')
    record.timeMetrics.estimatedDelivery.source = null
    expect(estimatedDeliveryLabel(record)).toBe('—')
    record.timeMetrics.estimatedDelivery = { from: '2026-11-09T20:00:00Z', to: '2026-11-10T01:00:00Z', source: 'Official' }
    expect(estimatedDeliveryLabel(record)).toBe('2026-11-10 04:00:00 ～ 2026-11-10 09:00:00')
    record.timeMetrics.estimatedDelivery = { from: null, to: '2026-11-12', source: '17TRACK' }
    expect(estimatedDeliveryLabel(record)).toBe('截至 2026-11-12')
    record.timeMetrics.estimatedDelivery = { from: '2026-11-13', to: '2026-11-12', source: 'Official' }
    expect(estimatedDeliveryLabel(record)).toBe('待核实')
    expect(estimatedDeliveryLabel(row(2))).toBe('—')
  })
  it('同订单两个包裹共用下单时间，各自保存本包裹发货时间', () => {
    const records = createTrackingRecords(), first = records[20]!, second = records[21]!
    expect(first.orderNo).toBe(second.orderNo)
    expect(first.orderPlacedAt).toBe(second.orderPlacedAt)
    expect(first.shippedAt).toBe('2026-11-06T01:00:00Z')
    expect(second.shippedAt).toBe('2026-11-07T00:30:00Z')
    expect(records[10]!.orderPlacedAt).toBeNull()
  })
  it('更新失败保留来源时效、节点和订单时间，CSV沿用页面同口径字段', () => {
    const record = row(13), before = JSON.stringify({ metrics: record.timeMetrics, milestones: record.milestones, ordered: record.orderPlacedAt, shipped: record.shippedAt })
    expect(refreshTracking(record).ok).toBe(false)
    expect(JSON.stringify({ metrics: record.timeMetrics, milestones: record.milestones, ordered: record.orderPlacedAt, shipped: record.shippedAt })).toBe(before)
    const csv = exportTrackingCsv([record])
    for (const header of ['订单下单时间（北京时间）', '本包裹发货时间（北京时间）', '运输天数', '首次轨迹时间（北京时间）', '收到信息时间', '揽收时间', '离港时间', '到港时间', '签收时间', '运单时效', '妥投时效', '无更新天数', '预计到达区间', '预计到达来源']) expect(csv).toContain(`"${header}"`)
    expect(csv).toContain(`"${signatureTime(record)}"`)
    expect(csv).toContain(`"${transitDaysLabel(record)}"`)
  })
})
