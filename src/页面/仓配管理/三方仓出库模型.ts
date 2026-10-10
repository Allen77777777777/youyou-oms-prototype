import { 命中多选, 命中字段搜索, 校验字段搜索, 命中时间范围, 校验时间范围, 排序列表, 读取排序时刻, type 列表排序条件 } from '@/组件/筛选/筛选工具'
import type { 全渠道订单, 脱敏收件信息, 订单路由 } from '../全渠道订单/类型'
import { 关联演示数据 } from '../订单处理/库存关联模型'
import { 创建仓配样例, type 仓配单据, type 历史记录, type 调用记录 } from './仓配模型'

export interface 出库来源订单 { systemOrderNo: string; platformOrderNo: string; platform: string; shopId: string; shop: string }
export interface 出库商品明细 {
  id: string; fulfillmentItemId: string | null; externalLineId: string | null; sourceOrderNo: string
  platformSku: string | null; systemSku: string | null; warehouseSku: string | null; goods: string
  plannedQuantity: number | null; shippedQuantity: number | null; unit: string | null; lineStatus: string
}
export interface 出库详情 {
  sourceOrders: 出库来源订单[]; items: 出库商品明细[]; recipient: 脱敏收件信息 | null; route: 订单路由 | null
  warehouseStatusRaw: string | null; submittedAt: string | null; acceptedAt: string | null; operationStartedAt: string | null; shippedAt: string | null; lastSyncedAt: string | null
  actualWeight: number | null; weightUnit: string | null; length: number | null; width: number | null; height: number | null; dimensionUnit: string | null; trackingUrl: string | null; labelFileRef: string | null
  snapshotReliable: boolean; compositionReason: string; history: 历史记录[]; attempts: 调用记录[]
}
export type 出库快照 = Omit<出库详情, 'history' | 'attempts'>
function 空详情(): 出库详情 {
  return { sourceOrders: [], items: [], recipient: null, route: null, warehouseStatusRaw: null, submittedAt: null, acceptedAt: null, operationStartedAt: null, shippedAt: null, lastSyncedAt: null, actualWeight: null, weightUnit: null, length: null, width: null, height: null, dimensionUnit: null, trackingUrl: null, labelFileRef: null, snapshotReliable: false, compositionReason: '本次出库的逐商品分配尚未核实', history: [], attempts: [] }
}
export function 取得出库详情(row: 仓配单据): 出库详情 {
  if (row.outboundDetail) return { ...row.outboundDetail, history: row.history, attempts: row.attempts }
  return { ...空详情(), sourceOrders: row.order.split('、').filter(Boolean).map(systemOrderNo => ({ systemOrderNo, platformOrderNo: '', platform: row.platform, shopId: '', shop: '' })), submittedAt: row.createdAt || null, history: row.history, attempts: row.attempts }
}
export function 出库仓库筛选键(row: 仓配单据): string { return JSON.stringify([row.provider, row.warehouse]) }
export function 出库账号筛选键(row: 仓配单据): string { return JSON.stringify([row.provider, row.account]) }
export function 出库渠道筛选键(row: 仓配单据): string { return JSON.stringify([row.provider, row.account, row.warehouse, row.channelCode]) }

/** 新推单已通过全来源门禁，固化该命令实际确认的剩余范围；不用于反推历史履约组成。 */
export function 创建推单出库快照(orders: 全渠道订单[], fulfillmentNo: string, submittedAt: string): 出库快照 {
  const fulfillment = orders[0]?.fulfillmentOrders.find(f => f.fulfillmentOrderNo === fulfillmentNo)
  const sourceOrders = orders.map(order => ({ systemOrderNo: order.systemOrderNo, platformOrderNo: order.platformOrderNo, platform: order.platformCode, shopId: order.storeId, shop: order.storeName }))
  const planned = orders.reduce((sum, order) => sum + order.items.reduce((sub, item) => sub + (item.fulfillableQuantity ?? 0), 0), 0)
  const reliable = !!fulfillment && orders.length > 0 && planned > 0 && orders.every(order => {
    const f = order.fulfillmentOrders.find(candidate => candidate.fulfillmentOrderNo === fulfillmentNo)
    return !!f && f.plannedQuantity === planned && f.shippedQuantity === 0 && order.items.length > 0 && order.items.every(item => Number.isInteger(item.fulfillableQuantity) && item.fulfillableQuantity! >= 0 && item.fulfillableQuantity! <= item.orderedQuantity && !!item.systemSku && item.skuResolutionStatus === '成功')
  })
  const items: 出库商品明细[] = reliable ? orders.flatMap(order => order.items.filter(item => item.fulfillableQuantity! > 0).map(item => {
    const scope = 关联演示数据.scopes.filter(candidate => candidate.provider === fulfillment!.route.warehouseProvider && candidate.account === fulfillment!.route.warehouseAccount && candidate.warehouse === fulfillment!.route.warehouse)
    const mappings = scope.length === 1 ? [...new Set(关联演示数据.mappings.filter(mapping => {
      const anchor = 关联演示数据.scopes.find(candidate => candidate.id === mapping.scopeId)
      return mapping.status === '已映射' && mapping.systemSku === item.systemSku && anchor?.organization === scope[0]!.organization && anchor.provider === scope[0]!.provider && anchor.accountId === scope[0]!.accountId
    }).map(mapping => mapping.warehouseSku).filter(Boolean))] : []
    const warehouseSku = mappings.length === 1 ? mappings[0]! : null
    const units = scope.length === 1 && warehouseSku ? [...new Set(关联演示数据.inventory.filter(source => source.organization === scope[0]!.organization && source.provider === scope[0]!.provider && source.accountId === scope[0]!.accountId && source.warehouseId === scope[0]!.warehouseId && source.warehouseSku === warehouseSku).map(source => source.unit).filter(Boolean))] : []
    return { id: JSON.stringify([order.systemOrderNo, item.externalLineId]), fulfillmentItemId: null, externalLineId: item.externalLineId || null, sourceOrderNo: order.systemOrderNo, platformSku: item.platformSku ?? null, systemSku: item.systemSku ?? null, warehouseSku, goods: item.systemItemName || item.platformItemTitle || '', plannedQuantity: item.fulfillableQuantity!, shippedQuantity: 0, unit: units.length === 1 ? units[0]! : null, lineStatus: '待出库' }
  })) : []
  const { history: _history, attempts: _attempts, ...base } = 空详情()
  return { ...base, sourceOrders, items, recipient: orders[0] && new Set(orders.map(order => JSON.stringify(order.address))).size === 1 ? JSON.parse(JSON.stringify(orders[0].address)) as 脱敏收件信息 : null, route: fulfillment ? { ...fulfillment.route } : null, submittedAt, snapshotReliable: reliable, compositionReason: reliable ? '' : '本次出库的逐商品分配尚未核实' }
}
export function 创建历史出库快照(orders: 全渠道订单[], fulfillmentNo: string): 出库快照 {
  const base = 创建推单出库快照(orders, fulfillmentNo, '')
  return { ...base, items: [], snapshotReliable: false, compositionReason: '尚未取得本次出库的逐商品分配', submittedAt: null }
}

export const 出库搜索字段 = [
  { value: 'no', label: '出库单号' }, { value: 'externalNo', label: '三方仓出库单号' }, { value: 'fulfillment', label: '履约单号' }, { value: 'order', label: '系统订单号' },
  { value: 'platformOrderNo', label: '平台订单号' }, { value: 'tracking', label: '跟踪号' }, { value: 'sku', label: '系统 SKU' }, { value: 'warehouseSku', label: '仓库 SKU' },
]
export interface 出库筛选条件 {
  keyword: string; searchType: string; searchMatch: 'contains' | 'exact'; provider: string[]; warehouse: string[]; account: string[]; platform: string[]; shop: string[]; channel: string[]; review: string[]
  dates: null | string[]; dateType: 'submittedAt' | 'acceptedAt' | 'shippedAt' | 'lastSyncedAt' | 'createdAt'
}
export function 默认出库筛选(): 出库筛选条件 { return { keyword: '', searchType: 'no', searchMatch: 'contains', provider: [], warehouse: [], account: [], platform: [], shop: [], channel: [], review: [], dates: null, dateType: 'submittedAt' } }
export function 校验出库筛选(filter: 出库筛选条件): string | undefined { return 校验字段搜索(filter.keyword, filter.searchMatch, 'identifier') || 校验时间范围(filter.dates) }
export function 取得出库关注(row: 仓配单据): string[] {
  const d = 取得出库详情(row), result: string[] = []
  if (row.awaitingCheck) result.push('待核查')
  if (['下单中', '待出库', '取消中'].includes(row.status)) result.push('执行中')
  if (row.status === '下单失败' && !row.awaitingCheck) result.push('明确失败')
  if (row.shipped > 0 && row.shipped < row.planned) result.push('部分出库')
  if (row.status === '已出库' && !row.tracking) result.push('缺跟踪号')
  if (!d.snapshotReliable) result.push('商品待核实')
  return result
}
export function 命中出库筛选(row: 仓配单据, filter: 出库筛选条件): boolean {
  if (校验出库筛选(filter)) return false
  const d = 取得出库详情(row), type = 出库搜索字段.some(item => item.value === filter.searchType) ? filter.searchType : 'no'
  const sourceField = ['order', 'platformOrderNo', 'sku', 'warehouseSku'].includes(type)
  const sourceMatches = d.sourceOrders.some(source => {
    if (!命中多选(filter.platform, source.platform) || !命中多选(filter.shop, source.shopId)) return false
    if (!sourceField) return true
    const values = type === 'order' ? source.systemOrderNo : type === 'platformOrderNo' ? source.platformOrderNo : d.items.filter(item => item.sourceOrderNo === source.systemOrderNo).map(item => type === 'sku' ? item.systemSku || '' : item.warehouseSku || '')
    return 命中字段搜索(values, filter.keyword, filter.searchMatch)
  })
  const headerValue = type === 'no' ? row.no : type === 'externalNo' ? row.externalNo : type === 'fulfillment' ? row.fulfillment : row.tracking
  const date = filter.dateType === 'createdAt' ? row.createdAt : d[filter.dateType] || undefined
  return sourceMatches && (sourceField || 命中字段搜索(headerValue, filter.keyword, filter.searchMatch)) && 命中多选(filter.provider, row.provider)
    && 命中多选(filter.warehouse, 出库仓库筛选键(row)) && 命中多选(filter.account, 出库账号筛选键(row)) && 命中多选(filter.channel, 出库渠道筛选键(row))
    && (!filter.review.length || filter.review.some(item => 取得出库关注(row).includes(item))) && 命中时间范围(date, filter.dates, true)
}
export function 排序出库单据(rows: 仓配单据[], sort: 列表排序条件): 仓配单据[] {
  if (!sort.field) return rows
  return 排序列表(rows, row => {
    const d = 取得出库详情(row), value = sort.field === 'updatedAt' ? row.updatedAt : sort.field === 'createdAt' ? row.createdAt : d[sort.field as 出库筛选条件['dateType']]
    return 读取排序时刻(typeof value === 'string' ? value : undefined, true)
  }, sort.direction, row => row.id)
}

/** 五仓、七态固定虚构样例；每行计划、出库及来源明确赋值，不由查询生成发运事实。 */
export function 创建出库工作台样例(): 仓配单据[] {
  const providers = ['万邑通', '谷仓', '4PX', '西邮', '出口易'], warehouses = ['万邑通美西仓', '谷仓美东仓', '4PX德国仓', '西邮英国仓', '出口易澳洲仓']
  const accounts = ['北美主体', '北美主体', '欧洲主体', '欧洲主体', '澳洲主体'], channels = ['USPS Ground Advantage', 'FedEx Home Delivery', 'DHL Paket', 'Royal Mail Tracked 48', 'Australia Post Standard']
  const countries = ['美国 US', '美国 US', '德国 DE', '英国 GB', '澳大利亚 AU'], platforms = ['eBay', 'Temu', 'Mercado Libre', 'Coupang', 'OZON', 'TikTok Shop', 'Rakuten']
  const goods = [{ sku: 'YY-CA-1048-US', wh: 'WH-CA-1048', name: '汽车空气滤芯' }, { sku: 'YY-DH-2006-US', wh: 'WH-DH-2006', name: '车门把手组件' }, { sku: 'YY-BP-8821-EU', wh: 'WH-BP-8821', name: '刹车片套装' }, { sku: 'YY-WP-3066-UK', wh: 'WH-WP-3066', name: '雨刷器组件' }]
  return 创建仓配样例('仓库').map((row, i) => {
    const p = i % 5, suffix = String(i + 1).padStart(4, '0'), g = goods[i % goods.length]!
    const time = `2026-10-10 ${String(8 + i % 5).padStart(2, '0')}:${String(10 + i * 3).padStart(2, '0')}:00`
    Object.assign(row, { no: `CK261010${suffix}`, fulfillment: `LY261010${suffix}`, order: `OMS261010${suffix}`, provider: providers[p]!, warehouse: warehouses[p]!, account: `${providers[p]} · ${accounts[p]}`, channel: channels[p]!, channelCode: `WH-${p + 1}-STD`, platform: platforms[i % 7]!, sku: g.sku, goods: g.name, country: countries[p]!, externalNo: row.externalNo ? `${['WIN', 'GC', '4PX', 'XY', 'CKY'][p]}-261010-${suffix}` : '', tracking: row.tracking ? ['9400111899223000000001', '772800001234', '00340434161000001234', 'RN123456789GB', '33A1234567890'][p]! : '', createdAt: time, updatedAt: time })
    row.reason = row.awaitingCheck ? '请求响应超时，需核查仓库是否受理' : row.status === '出库异常' ? '仓库短拣，请核对剩余商品数量' : row.status === '下单失败' ? row.blocker || '仓库明确未受理，原请求可在重新校验后提交' : ''
    const sourceOrders: 出库来源订单[] = [{ systemOrderNo: row.order, platformOrderNo: `PO-261010-${suffix}`, platform: row.platform, shopId: `sample-shop-${row.platform}`, shop: `${row.platform} · 汽配直营店` }]
    const items: 出库商品明细[] = [{ id: `${row.id}-item-1`, fulfillmentItemId: `${row.fulfillment}-item-1`, externalLineId: row.externalNo ? `LINE-${suffix}-1` : null, sourceOrderNo: row.order, platformSku: `AUTO-${suffix}`, systemSku: g.sku, warehouseSku: g.wh, goods: g.name, plannedQuantity: row.planned, shippedQuantity: row.shipped, unit: '件', lineStatus: row.status === '已取消' ? '已终止' : row.status === '已出库' ? '已出库' : row.shipped > 0 ? '部分出库' : '待出库' }]
    if (i === 7) {
      const secondNo = 'OMS261010M0002'
      sourceOrders.push({ systemOrderNo: secondNo, platformOrderNo: 'PO-261010-M0002', platform: 'Temu', shopId: 'sample-shop-Temu-2', shop: 'Temu · 北美配件店' })
      items[0]!.plannedQuantity = 1
      items.push({ ...items[0]!, id: `${row.id}-item-2`, fulfillmentItemId: `${row.fulfillment}-item-2`, sourceOrderNo: secondNo, systemSku: goods[1]!.sku, warehouseSku: goods[1]!.wh, goods: goods[1]!.name, plannedQuantity: 1 })
      row.order = sourceOrders.map(source => source.systemOrderNo).join('、'); row.planned = 2; row.sku = items.map(item => item.systemSku).join('、')
    }
    const accepted = ['待出库', '出库异常', '已出库', '取消中', '已取消'].includes(row.status)
    const { history: _history, attempts: _attempts, ...base } = 空详情()
    row.outboundDetail = { ...base, sourceOrders, items, recipient: { fullName: 'J*** S***', mobilePhone: '+1 *** *** 0186', countryCode: countries[p]!.split(' ')[1]!, stateProvince: ['CA', 'NY', 'Bayern', 'England', 'NSW'][p]!, city: ['Los Angeles', 'New York', 'Munich', 'London', 'Sydney'][p]!, addressLine1: '*** Industrial Road', postalCode: ['90012', '10001', '80331', 'SW1A 1AA', '2000'][p]! }, route: { warehouse: row.warehouse, warehouseProvider: row.provider, warehouseAccount: row.account, shippingChannel: row.channel, shippingChannelCode: row.channelCode, labelMode: '仓配一体' }, warehouseStatusRaw: accepted ? `SAMPLE_${['CREATING', 'REJECTED', 'ACCEPTED', 'SHORT_PICK', 'SHIPPED', 'CANCEL_PENDING', 'CANCELED'][i % 7]}` : null, submittedAt: row.createdAt, acceptedAt: accepted ? row.createdAt : null, operationStartedAt: ['出库异常', '已出库'].includes(row.status) ? row.updatedAt : null, shippedAt: row.status === '已出库' ? row.updatedAt : null, lastSyncedAt: row.updatedAt, actualWeight: row.status === '已出库' && i === 4 ? 1.26 : null, weightUnit: row.status === '已出库' && i === 4 ? 'kg' : null, length: row.status === '已出库' && i === 4 ? 32 : null, width: row.status === '已出库' && i === 4 ? 24 : null, height: row.status === '已出库' && i === 4 ? 16 : null, dimensionUnit: row.status === '已出库' && i === 4 ? 'cm' : null, snapshotReliable: true, compositionReason: '' }
    row.history = [{ time: row.updatedAt, title: `仓库状态 · ${row.status}`, detail: row.reason || '已读取仓库作业结果，保留本次执行快照。' }, { time: row.createdAt, title: '提交仓库', detail: `按履约 ${row.fulfillment} 的商品、收件和仓库物流快照提交。` }]
    row.attempts = [{ id: `ATT-${row.id}-1`, time: row.createdAt, action: '创建仓库出库单', result: row.awaitingCheck || row.status === '下单失败' ? '失败' : '成功', reason: row.reason || '已取得明确接口结果' }]
    return row
  })
}
