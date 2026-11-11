import { trackingStatuses, type TrackingEvent, type TrackingMilestone, type TrackingRecord, type TrackingStatus } from './模型'

// 纯虚构的独立包裹与订单身份。承运商字典代码于2026-11-09核对官方公开字典，非平台标发代码。
const carriers = [
  { code: 100002, name: 'UPS' }, { code: 21051, name: 'USPS' },
  { code: 100003, name: 'FedEx' }, { code: 100001, name: 'DHL Express' }, { code: 7041, name: 'DHL Paket' },
] as const
const routes = [
  ['eBay', 'track-shop-us', '家居美国店', '万邑通洛杉矶仓', '美国', 'US'],
  ['Temu', 'track-shop-uk', '户外英国店', '谷仓伯明翰仓', '英国', 'GB'],
  ['美客多', 'track-shop-mx', '生活墨西哥店', '4PX墨西哥仓', '墨西哥', 'MX'],
  ['Coupang', 'track-shop-kr', '数码韩国店', '西邮仁川仓', '韩国', 'KR'],
  ['OZON', 'track-shop-ru', '工具俄罗斯店', '出口易莫斯科仓', '俄罗斯', 'RU'],
  ['TikTok Shop', 'track-shop-us2', '收纳美国店', '谷仓美东仓', '美国', 'US'],
  ['乐天', 'track-shop-jp', '家清日本店', '4PX大阪仓', '日本', 'JP'],
] as const
const descriptions: Record<TrackingStatus, [string, string, string]> = {
  NotFound: ['No tracking information returned by carrier.', '运输商暂未返回轨迹信息。', 'NotFound_Other'],
  InfoReceived: ['Shipment information received.', '已收到电子信息，等待揽收。', 'InfoReceived'],
  InTransit: ['Departed from regional sorting facility.', '已离开区域分拨中心。', 'InTransit_Other'],
  Expired: ['Shipment has been in transit for an extended period.', '包裹运输时间较长，尚未投递。', 'Expired_Other'],
  AvailableForPickup: ['Available for collection at pickup point.', '已到自提点，等待收件人领取。', 'AvailableForPickup_Other'],
  OutForDelivery: ['Out for delivery.', '包裹正在派送。', 'OutForDelivery_Other'],
  DeliveryFailure: ['Delivery attempted. Recipient unavailable.', '派送未成功，未联系到收件人。', 'DeliveryFailure_NoBody'],
  Delivered: ['Delivered to the receiving location.', '已投递至收件地点。', 'Delivered_Other'],
  Exception: ['Shipment held. Additional customs information required.', '包裹暂留，需补充清关资料。', 'Exception_Security'],
}
function event(id: string, status: TrackingStatus, at: string, location: string): TrackingEvent {
  const [description, descriptionZh, subStatus] = descriptions[status]
  return { id, status, timeUtc: at, timeRaw: `${at.slice(0, 10)} ${at.slice(11, 19)} UTC+00:00`, description, descriptionZh, subStatus, location }
}
function milestone(keyStage: TrackingMilestone['keyStage'], at: string): TrackingMilestone {
  return { keyStage, timeUtc: at, timeIso: at, timeRaw: { date: at.slice(0, 10), time: at.slice(11, 19), timezone: '+00:00' } }
}
export function createTrackingRecords(): TrackingRecord[] {
  const records = Array.from({ length: 24 }, (_, index): TrackingRecord => {
    const seq = index + 1, suffix = String(seq).padStart(3, '0')
    const route = routes[index % routes.length]!, carrier = carriers[index % carriers.length]!
    const status = trackingStatuses[index % trackingStatuses.length]!.value
    const latestAt = `2026-11-09T${String(9 - index % 8).padStart(2, '0')}:20:00Z`
    const latest = event(`track-demo-${seq}-event-1`, status, latestAt, `${route[5]} · 区域处理中心`)
    const prior = event(`track-demo-${seq}-event-2`, 'InTransit', '2026-11-07T04:10:00Z', `${route[5]} · 发运中心`)
    const number = `DEMO-17T-202611-${suffix}`
    const events = status === 'NotFound' ? [] : status === 'InfoReceived' ? [latest] : [latest, prior]
    return {
      id: `track-demo-${seq}`, number, carrierCode: carrier.code, carrierName: carrier.name,
      platform: route[0], shopId: route[1], shopName: route[2], warehouse: route[3], channel: `${carrier.name} 标准配送`, country: route[4],
      orderNo: `DEMO-OMS-202611-${suffix}`, platformOrderNo: `DEMO-PLAT-${route[5]}-${suffix}`, fulfillmentNo: `DEMO-FL-202611-${suffix}`, packageNo: `DEMO-PKG-${suffix}`,
      status, subStatus: descriptions[status][2], subscription: 'registered', syncState: 'success', syncError: '',
      registeredAt: '2026-11-06T02:00:00Z', lastSyncAt: '2026-11-09T09:30:00Z', latestEventAt: status === 'NotFound' ? null : latestAt,
      latestEventText: status === 'NotFound' ? '' : latest.description, latestEventTextZh: status === 'NotFound' ? null : latest.descriptionZh,
      latestLocation: status === 'NotFound' ? '' : latest.location, shippedAt: '2026-11-06T01:00:00Z',
      orderPlacedAt: '2026-11-05T14:00:00Z',
      timeMetrics: { daysOfTransit: null, daysAfterOrder: null, daysOfTransitDone: null, daysAfterLastUpdate: null, estimatedDelivery: { from: null, to: null, source: null } },
      milestones: [],
      providers: [{ id: `provider-${carrier.code}`, name: carrier.name, number, events }],
      logs: [{ id: `track-demo-${seq}-log-1`, at: '2026-11-09T09:30:00Z', action: '接收轨迹更新', result: '成功', detail: '按注册身份保存运输商轨迹及当前状态。' }],
    }
  })
  for (const index of [9, 10, 11]) {
    const record = records[index]!
    record.status = null; record.subStatus = ''; record.providers = []; record.latestEventAt = null
    record.latestEventText = ''; record.latestEventTextZh = null; record.latestLocation = ''; record.lastSyncAt = null
    record.subscription = index === 9 ? 'unregistered' : index === 10 ? 'failed' : 'registered'
    record.syncState = index === 11 ? 'pending' : 'never'; record.registeredAt = index === 11 ? '2026-11-09T09:50:00Z' : null
    record.syncError = index === 10 ? '运输商尚未明确，请核对承运商映射后重新注册。' : ''
    record.logs = index === 9 ? [] : [{ id: `${record.id}-log-1`, at: '2026-11-09T09:50:00Z', action: '注册跟踪', result: index === 10 ? '失败' : '已受理', detail: index === 10 ? record.syncError : '注册已受理，等待轨迹更新。' }]
    if (index === 10) { record.carrierCode = null; record.carrierName = '待明确' }
  }
  // 查询失败保留此前已取得的运输及签收事实，不能回退成NotFound。
  for (const [index, status] of [[12, 'InTransit'], [13, 'Delivered']] as const) {
    const record = records[index]!, latest = event(`${record.id}-event-1`, status, '2026-11-08T09:20:00Z', `${routes[index % routes.length]![5]} · 配送中心`)
    Object.assign(record, { status, subStatus: latest.subStatus, syncState: 'failed', syncError: index === 12 ? '运输商查询暂时不可用，请稍后更新。' : '访问频率超出限制，请稍后更新。', lastSyncAt: '2026-11-08T10:00:00Z', latestEventAt: latest.timeUtc, latestEventText: latest.description, latestEventTextZh: latest.descriptionZh, latestLocation: latest.location })
    record.providers[0]!.events = [latest]
  }
  records[14]!.subscription = 'stopped'
  records[14]!.logs.unshift({ id: 'track-demo-15-log-2', at: '2026-11-09T01:00:00Z', action: '停止跟踪', result: '已停止', detail: '保留此前取得的轨迹与关联包裹资料。' })
  // 来源只给墙钟且缺可靠时区：北京视图不猜时间，来源视图保留显示投影。
  const uncertain = records[15]!
  uncertain.providers[0]!.events[0]!.timeUtc = null
  uncertain.providers[0]!.events[0]!.timeRaw = '2026-11-09 08:20:00（来源未提供时区）'
  uncertain.providers[0]!.events[0]!.descriptionZh = null
  uncertain.latestEventAt = null; uncertain.latestEventTextZh = null
  // 多运输商交接：相似事件仍按运输商分组，不跨provider去重或拼成虚构事件。
  const transfer = records[16]!
  transfer.carrierCode = 100001; transfer.carrierName = 'DHL Express'; transfer.channel = 'DHL Express 国际配送'
  Object.assign(transfer, { platform: 'eBay', shopId: 'track-shop-us', shopName: '家居美国店', warehouse: '万邑通洛杉矶仓', country: '美国', latestLocation: 'US · 收件地点' })
  transfer.providers = [
    { id: 'provider-100001', name: 'DHL Express', number: transfer.number, events: [event('transfer-origin-1', 'InTransit', '2026-11-08T03:30:00Z', 'DE · 转运中心')] },
    { id: 'provider-21051', name: 'USPS', number: 'DEMO-LASTMILE-017', events: [event('transfer-final-1', 'Delivered', '2026-11-09T09:20:00Z', 'US · 收件地点'), event('transfer-final-2', 'OutForDelivery', '2026-11-09T01:10:00Z', 'US · 投递站')] },
  ]
  // 相同跟踪号+不同运输商是不同来源身份；按record.id保存，不按单号归并。
  records[18]!.number = records[17]!.number
  records[18]!.providers[0]!.number = records[18]!.number
  // 同一订单两个包裹分别呈现，不把一包签收聚合为整单签收。
  const first = records[20]!, second = records[21]!
  for (const field of ['orderNo', 'platformOrderNo', 'platform', 'shopId', 'shopName'] as const) second[field] = first[field]
  first.orderPlacedAt = '2026-11-05T11:20:00Z'; second.orderPlacedAt = first.orderPlacedAt
  second.shippedAt = '2026-11-07T00:30:00Z'
  // 来源仅日期，不制造零点或秒级精度。
  const dateOnly = records[23]!
  dateOnly.providers[0]!.events[0]!.timeUtc = null
  dateOnly.providers[0]!.events[0]!.timeRaw = '2026-11-09'
  dateOnly.latestEventAt = null
  // 时效和里程碑分别模拟17TRACK独立来源字段，不从OMS下单/发货时间相减生成。
  for (const record of records) {
    if (!record.providers.some(provider => provider.events.length) || record.status === 'NotFound') continue
    const infoOnly = record.status === 'InfoReceived', delivered = record.status === 'Delivered'
    record.timeMetrics = {
      daysOfTransit: infoOnly ? 0 : 3, daysAfterOrder: infoOnly ? 0 : 3,
      daysOfTransitDone: delivered ? 3 : 0, daysAfterLastUpdate: 0,
      estimatedDelivery: delivered ? { from: null, to: null, source: null } : { from: '2026-11-10', to: '2026-11-12', source: Number(record.id.split('-')[2]) % 2 ? 'Official' : '17TRACK' },
    }
    record.milestones = [milestone('InfoReceived', infoOnly ? record.latestEventAt! : '2026-11-06T01:20:00Z')]
    if (!infoOnly) record.milestones.push(milestone('PickedUp', '2026-11-06T05:00:00Z'), milestone('Departure', '2026-11-06T13:00:00Z'), milestone('Arrival', '2026-11-07T02:00:00Z'))
  }
  // 三份独立里程碑快照与各自Delivered_Other事件一致，不靠当前主状态推定时刻。
  records[7]!.milestones.push(milestone('Delivered', '2026-11-09T02:20:00Z'))
  records[13]!.milestones.push(milestone('Delivered', '2026-11-08T09:20:00Z'))
  records[16]!.milestones.push(milestone('Delivered', '2026-11-09T09:20:00Z'))
  for (const index of [12, 13]) {
    records[index]!.timeMetrics.daysOfTransit = 2
    records[index]!.timeMetrics.daysAfterOrder = 2
    if (records[index]!.status === 'Delivered') records[index]!.timeMetrics.daysOfTransitDone = 2
  }
  records[2]!.timeMetrics.daysOfTransit = null
  records[2]!.timeMetrics.estimatedDelivery = { from: null, to: null, source: null }
  records[10]!.orderPlacedAt = null
  uncertain.milestones = [{ keyStage: 'InfoReceived', timeUtc: null, timeIso: null, timeRaw: { date: '2026-11-09', time: '08:20:00', timezone: null } }]
  second.milestones = [milestone('InfoReceived', '2026-11-07T00:35:00Z'), milestone('PickedUp', '2026-11-07T02:00:00Z')]
  second.timeMetrics.daysOfTransit = 2; second.timeMetrics.daysAfterOrder = 2
  dateOnly.milestones = [{ keyStage: 'InfoReceived', timeUtc: null, timeIso: null, timeRaw: { date: '2026-11-09', time: null, timezone: null } }]
  // 完整来源事件中也保存相同信息接收/揽收事实。既有事件保留ID和顺序，补充旧节点按倒序附后。
  for (const record of records) {
    if (record.id === uncertain.id || record.id === dateOnly.id || record.status === 'InfoReceived') continue
    const provider = record.providers[0]
    if (!provider?.events.length) continue
    const priorStages = record.milestones.filter(node => (node.keyStage === 'InfoReceived' || node.keyStage === 'PickedUp') && node.timeUtc)
      .sort((a, b) => b.timeUtc!.localeCompare(a.timeUtc!))
    for (const node of priorStages) {
      const received = node.keyStage === 'InfoReceived'
      const sourceEvent = event(`${record.id}-source-${node.keyStage}`, received ? 'InfoReceived' : 'InTransit', node.timeUtc!, `${record.country} · 始发处理中心`)
      if (!received) Object.assign(sourceEvent, { subStatus: 'InTransit_PickedUp', description: 'Shipment collected by carrier.', descriptionZh: '运输商已揽收包裹。' })
      provider.events.push(sourceEvent)
    }
  }
  return records
}
