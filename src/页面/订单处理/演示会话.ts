import { ref } from 'vue'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'

// 所有写操作只在本次浏览器会话内演示；订单详情与作业工作台引用同一主事实。
export const 演示路由: 订单路由[] = [
  { warehouse: '万邑通美西仓', warehouseProvider: '万邑通', warehouseAccount: '万邑通 · 北美主体', shippingChannel: 'USPS Ground Advantage', shippingChannelCode: 'WYT-USPS-GA', labelMode: '仓配一体' },
  { warehouse: '谷仓美东仓', warehouseProvider: '谷仓', warehouseAccount: '谷仓 · 北美主体', shippingChannel: 'FedEx Home Delivery', shippingChannelCode: 'GC-FEDEX-HD', labelMode: '仓配一体' },
]

function 创建作业样例(序号: number, 覆盖: Partial<全渠道订单> = {}): 全渠道订单 {
  const 原单 = structuredClone(全渠道订单模拟数据[0]!)
  return {
    ...原单,
    systemOrderNo: `OMS26091200${String(序号).padStart(4, '0')}`,
    platformOrderId: `DEMO-EB-260912-${序号}`,
    platformOrderNo: `DEMO-EB-260912-${序号}`,
    storeName: '北美汽配演示店',
    storeId: 'demo-ebay-us',
    professionalOrder: undefined,
    platformOrderStatus: 'NOT_STARTED',
    processingStatus: '待审核',
    defaultRoute: structuredClone(演示路由[序号 % 2]!),
    orderedAt: '2026-09-12 08:20:00 UTC+8',
    paidAt: '2026-09-12 08:21:00 UTC+8',
    createdAt: '2026-09-12 08:22:00 UTC+8',
    lastSyncedAt: '2026-09-12 09:00:00 UTC+8',
    platformUpdatedAt: undefined,
    shipByAt: '2026-09-13 18:00:00 UTC+8',
    shipByLabel: '09-13 18:00',
    urgency: '正常',
    tags: [],
    buyerExternalId: 'demo-buyer',
    items: [structuredClone(原单.items[0]!)],
    fulfillmentOrders: [],
    reviews: [],
    operationLogs: [{ operatedAt: '2026-09-12 09:00:00 UTC+8', operationType: '演示样例初始化', operationResult: '成功', operator: '原型演示', content: '虚构自配送订单已通过准入，等待审核；不会调用外部平台或仓库。' }],
    sync: { status: '待同步', normalizationStatus: '已标准化', latestAttempt: '—', message: '纯虚构原型样例；展示标准化与履约交互，不代表发生过真实平台同步。' },
    ...覆盖,
  }
}

const 待审样例 = [1, 2, 3, 4, 5].map((序号) => 创建作业样例(序号))
待审样例[2]!.defaultRoute = undefined
待审样例[3]!.items[0]!.systemSku = undefined
待审样例[3]!.items[0]!.skuResolutionStatus = '缺失'
const 推单样例 = [6, 7, 8].map((序号) => {
  const 订单 = 创建作业样例(序号, { processingStatus: '待推单' })
  订单.reviews = [{ round: 1, type: '自动审核', triggerSource: '演示审核', status: '已通过', completedAt: '2026-09-12 09:05:00 UTC+8', decisionNote: '演示规则校验通过；默认路由已固化为履约快照。' }]
  订单.fulfillmentOrders = [{ fulfillmentOrderNo: `FL-DEMO-260912-${序号}`, status: '待执行', isActive: true, route: structuredClone(订单.defaultRoute!), plannedQuantity: 1, shippedQuantity: 0 }]
  return 订单
})
const 取消中样例 = 创建作业样例(9, { processingStatus: '异常', blockReason: '平台取消处理中（cancelStatus.cancelState=IN_PROGRESS）；已由待审核转入异常，停止后续发货，等待人工复核后操作不发货。', admissionReason: '订单已付款并进入待审核，后收到平台取消中更新转为异常；尚非最终取消。此为固定结果样例，实时增量与人工不发货操作尚未实现。', operationLogs: [{ operatedAt: '2026-09-14 09:00:00 UTC+8', operationType: '平台变化转异常（演示）', operationResult: '成功', operator: '原型演示', content: '待审核 → 异常：cancelStatus.cancelState 由 NONE_REQUESTED 变为 IN_PROGRESS；OMS 发货量为零，尚无仓库任务。等待人工复核，不伪造最终取消。' }] })
const 系统外样例 = 创建作业样例(10, { processingStatus: '不发货', platformOrderStatus: 'FULFILLED', noShipmentReason: 'EBAY_FULFILLED_OUTSIDE_OMS：系统外履约已确认，OMS 有效出库量为零，未结束执行已核查。' })
// 固定样例演示用户配置的审核规则命中；不连接规则引擎，也不从平台状态推算已发/剩余数量。
const 部分履约待审样例 = 创建作业样例(11, {
  platformOrderStatus: 'IN_PROGRESS',
  processingStatus: '待审核',
  blockReason: '命中系统审核规则：eBay 部分履约（IN_PROGRESS）；保留待审核，请人工核实已履约范围和剩余数量，核实前不能通过审核或发整单。',
  admissionReason: '首次下载样例：订单级 orderPaymentStatus=PAID，cancelState=NONE_REQUESTED，其他接入条件满足，已进入待审核。平台部分履约由审核规则拦截；人工解除与剩余范围处置尚未在原型实现。',
  items: structuredClone(全渠道订单模拟数据[0]!.items).map((商品, 索引) => ({ ...商品, externalLineId: `DEMO-LINE-PARTIAL-${索引 + 1}`, fulfillableQuantity: undefined })),
  reviews: [{ round: 1, type: '自动审核', triggerSource: '演示系统审核规则', status: '已拦截', completedAt: '2026-09-12 09:05:00 UTC+8', decisionNote: '命中用户配置规则：orderFulfillmentStatus=IN_PROGRESS。订单保持待审核，人工核实已履约范围及剩余数量前不得审核通过，不生成整单履约；本地仅演示规则命中结果。' }],
})
const 标发样例 = [1, 2, 3, 4, 5, 6].map((序号) => {
  const 后缀 = String(序号).padStart(2, '0')
  const 订单 = 创建作业样例(20 + 序号, { systemOrderNo: `OMS-DEMO-CF-${后缀}`, processingStatus: '已发货', platformOrderStatus: 序号 === 3 ? 'FULFILLED' : 'NOT_STARTED' })
  订单.fulfillmentOrders = [{ fulfillmentOrderNo: `FL-DEMO-CF-${后缀}`, status: '已发货', isActive: true, route: structuredClone(订单.defaultRoute!), plannedQuantity: 1, shippedQuantity: 1, trackingNumber: `DEMO-TRACK-CF-${后缀}`, shippedAt: '2026-09-12 09:30:00 UTC+8' }]
  订单.reviews = [{ round: 1, type: '自动审核', triggerSource: '演示审核', status: '已通过', completedAt: '2026-09-12 09:05:00 UTC+8', decisionNote: '演示审核通过，当前订单全部可履约数量已有有效仓库出库事实。' }]
  return 订单
})
export const 共享订单 = ref<全渠道订单[]>([
  ...structuredClone(全渠道订单模拟数据), ...待审样例, ...推单样例, 取消中样例, 系统外样例, 部分履约待审样例, ...标发样例,
])

export interface 仓库执行 {
  履约单号: string
  订单号: string[]
  出库单号: string
  外部仓库单号?: string
  状态: '下单中' | '下单失败' | '待出库' | '出库异常' | '已出库' | '取消中' | '已取消'
  待核查: boolean
  原因: string
  更新时间: string
}
export const 仓库执行记录 = ref<仓库执行[]>(共享订单.value.flatMap((订单) => 订单.fulfillmentOrders
  .filter((履约) => 履约.isActive && ['执行中', '已发货'].includes(履约.status))
  .map((履约) => ({ 履约单号: 履约.fulfillmentOrderNo, 订单号: [订单.systemOrderNo], 出库单号: `OUT-${履约.fulfillmentOrderNo}`, 外部仓库单号: `WH-DEMO-${履约.fulfillmentOrderNo}`, 状态: 履约.status === '已发货' ? '已出库' as const : '待出库' as const, 待核查: false, 原因: 履约.shippedQuantity > 0 && 履约.shippedQuantity < 履约.plannedQuantity ? '已部分出库；剩余范围暂停，状态及恢复规则待确认。' : '', 更新时间: '2026-09-12 09:00:00 UTC+8' }))))
仓库执行记录.value.push({ 履约单号: 'FL-DEMO-260912-7', 订单号: [推单样例[1]!.systemOrderNo], 出库单号: 'OUT-DEMO-260912-7', 状态: '下单失败', 待核查: false, 原因: '仓库明确拒绝：当前账号未开通所选渠道。修复账号与渠道配置后再重试。', 更新时间: '2026-09-12 09:08:00 UTC+8' }, { 履约单号: 'FL-DEMO-260912-8', 订单号: [推单样例[2]!.systemOrderNo], 出库单号: 'OUT-DEMO-260912-8', 状态: '下单中', 待核查: true, 原因: '请求超时，仓库是否已建单尚待核查；不可重复推仓。', 更新时间: '2026-09-12 09:09:00 UTC+8' })

export const 演示库存 = ref<Record<string, '充足' | '不足' | '结果未知'>>({ [待审样例[4]!.systemOrderNo]: '结果未知' })
export const 订单版本 = ref<Record<string, number>>({})
export function 当前版本(订单号: string) { return 订单版本.value[订单号] ?? 1 }
export function 演示时间() { return `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC` }
export function 记录操作(订单: 全渠道订单, 类型: string, 内容: string, 成功 = true) {
  订单.operationLogs.push({ operatedAt: 演示时间(), operationType: 类型, operationResult: 成功 ? '成功' : '失败', operator: '演示操作员', content: 内容 })
  订单版本.value[订单.systemOrderNo] = 当前版本(订单.systemOrderNo) + 1
}

export function 审核阻断原因(订单: 全渠道订单, 库存: string = '充足'): string[] {
  const 原因: string[] = []
  if (订单.fulfillmentMode !== '自配送' || 订单.processingStatus !== '待审核') 原因.push('当前对象不在待审核自配送队列')
  if (订单.blockReason || 订单.cancelledAt) 原因.push(订单.blockReason || '已确认最终取消，禁止继续履约')
  // paidAt 仅用于展示，不能代替当前 Order.orderPaymentStatus。
  // 本工作台只接收已准入六态；准入前非 PAID 不进入，准入后非 PAID 更新先由平台适配链路转为异常。
  if (订单.items.some((行) => 行.skuResolutionStatus !== '成功' || !行.systemSku)) 原因.push('SKU 映射未完整识别；请由中台商品资料责任方处理')
  if (!订单.defaultRoute?.warehouse || !订单.defaultRoute.shippingChannel || !订单.defaultRoute.warehouseAccount) 原因.push('首次 / 默认路由不完整，请先调整路由')
  if (订单.defaultRoute?.labelMode === '仓配分离') 原因.push('仓配分离的一期交付范围待确认')
  if (库存 !== '充足') 原因.push(`中台库存${库存}；本轮不允许审核通过`)
  if (订单.fulfillmentOrders.some((履约) => 履约.isActive)) 原因.push('已有有效履约路径，禁止重复生成')
  if (订单.items.some((行) => !行.fulfillableQuantity || 行.fulfillableQuantity > 行.orderedQuantity)) 原因.push('可履约数量缺失或不合法')
  return 原因
}

export interface 命令结果 { 成功: boolean; 信息: string; 对象号?: string; 待核查?: boolean }
export function 执行演示审核(订单号: string, 期望版本: number): 命令结果 {
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
  if (!订单) return { 成功: false, 信息: '订单不存在，请刷新列表' }
  if (当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '订单已变化，请重新打开预检后提交' }
  const 原因 = 审核阻断原因(订单, 演示库存.value[订单号] ?? '充足')
  // 只有待审核对象才形成新审核轮次；其他状态仅返回资格失败。
  if (订单.processingStatus !== '待审核') return { 成功: false, 信息: 原因.join('；') }
  const 摘要 = 原因.length ? `演示审核拦截：${原因.join('；')}。本次保留待审核；原型未实现人工解除及剩余履约范围处置。` : '演示审核通过：订单已处于准入后的待审核状态，SKU 映射、库存、路由及数量校验通过；创建有效履约单并固化当前默认路由。'
  订单.reviews.push({ round: Math.max(0, ...订单.reviews.map((项) => 项.round)) + 1, type: '人工审核', triggerSource: '原型演示审核', status: 原因.length ? '已拦截' : '已通过', decisionNote: 摘要, completedAt: 演示时间() })
  if (!原因.length) {
    订单.fulfillmentOrders.push({ fulfillmentOrderNo: `FL-${订单号}-R${订单.reviews.length}`, status: '待执行', isActive: true, route: { ...订单.defaultRoute! }, plannedQuantity: 订单.items.reduce((总, 行) => 总 + 行.fulfillableQuantity!, 0), shippedQuantity: 0 })
    订单.processingStatus = '待推单'
  }
  记录操作(订单, '审核', 摘要, !原因.length)
  return { 成功: !原因.length, 信息: 摘要, 对象号: 订单.fulfillmentOrders[订单.fulfillmentOrders.length - 1]?.fulfillmentOrderNo }
}

export function 推单阻断原因(订单: 全渠道订单, 履约单号: string): string[] {
  const 履约 = 订单.fulfillmentOrders.find((项) => 项.fulfillmentOrderNo === 履约单号)
  const 执行 = 仓库执行记录.value.find((项) => 项.履约单号 === 履约单号)
  const 原因: string[] = []
  if (订单.processingStatus !== '待推单' || 订单.blockReason || 订单.cancelledAt) 原因.push('当前订单状态或发货条件不允许推仓')
  if (!履约?.isActive || 履约.shippedQuantity > 0) 原因.push('履约路径无效或已有出库事实')
  if (!订单.reviews.some((项) => 项.status === '已通过')) 原因.push('没有有效审核通过记录')
  if (!履约?.route.warehouseAccount || !履约.route.shippingChannel) 原因.push('履约路由不完整')
  if (履约?.route.labelMode === '仓配分离') 原因.push('仓配分离范围待评审，请查看物流下单')
  if (执行?.待核查 || 执行?.状态 === '下单中') 原因.push('已有外部请求，必须先核查原请求')
  else if (执行 && 执行.状态 !== '下单失败') 原因.push('仓库已有明确执行结果，不允许重复建单')
  else if (执行?.状态 === '下单失败') 原因.push('仓库已明确拒绝；先到三方仓出库单修复原因并执行受控重试')
  return 原因
}

export function 执行演示推单(订单号: string, 履约单号: string, 期望版本: number): 命令结果 {
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
  if (!订单 || 当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '对象已变化，请刷新后重新预检' }
  const 原因 = 推单阻断原因(订单, 履约单号)
  if (原因.length) return { 成功: false, 信息: 原因.join('；') }
  const 出库单号 = `OUT-${履约单号}`
  仓库执行记录.value.push({ 履约单号, 订单号: [订单号], 出库单号, 状态: '下单中', 待核查: true, 原因: '演示请求已受理，等待读取仓库结果；提交受理不代表建仓成功。', 更新时间: 演示时间() })
  记录操作(订单, '提交仓库', `创建 ${出库单号}；状态为下单中，订单保持待推单。演示不调用外部接口。`)
  return { 成功: true, 信息: '请求已受理，订单保持待推单；请核查仓库结果。', 对象号: 出库单号, 待核查: true }
}

export function 核查演示仓库结果(履约单号: string): 命令结果 {
  const 执行 = 仓库执行记录.value.find((项) => 项.履约单号 === 履约单号)
  if (!执行) return { 成功: false, 信息: '尚无仓库请求' }
  if (履约单号 === 'FL-DEMO-260912-8') return { 成功: false, 待核查: true, 信息: '演示查询仍未取得明确结果；保留下单中，禁止重复推仓。' }
  if (执行.状态 !== '下单中') return { 成功: true, 信息: `已读取最后可信仓库事实：${执行.状态}` }
  执行.状态 = '待出库'; 执行.待核查 = false; 执行.原因 = ''; 执行.外部仓库单号 = `WH-DEMO-${履约单号}`; 执行.更新时间 = 演示时间()
  for (const 订单号 of 执行.订单号) {
    const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
    if (!订单) continue
    const 履约 = 订单.fulfillmentOrders.find((项) => 项.fulfillmentOrderNo === 履约单号)
    if (履约) 履约.status = '执行中'
    const 全部建仓 = 订单.fulfillmentOrders.filter((项) => 项.isActive).every((项) => 仓库执行记录.value.some((仓单) => 仓单.履约单号 === 项.fulfillmentOrderNo && ['待出库', '出库异常', '已出库'].includes(仓单.状态)))
    if (订单.processingStatus === '待推单' && !订单.blockReason && !订单.cancelledAt && 全部建仓) 订单.processingStatus = '待发货'
    记录操作(订单, '核查仓库结果', `模拟仓库明确建单成功，已认领 ${执行.外部仓库单号}；订单当前为${订单.processingStatus}。`)
  }
  return { 成功: true, 信息: '模拟仓库已明确建单成功，进入待出库；订单已按全部有效履约范围重新聚合。', 对象号: 执行.出库单号 }
}
