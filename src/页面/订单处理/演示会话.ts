import { ref } from 'vue'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单路由, 人工发货方案 } from '../全渠道订单/类型'
import { 创建订单标志演示, 订单标志演示证据 } from './订单标志演示'
import { 计算订单标志 } from './订单标志模型'
import { 创建操作演示 } from './操作演示数据'
import { 创建推单出库快照, type 出库快照 } from '../仓配管理/三方仓出库模型'
import { 创建拆合发货演示 } from './拆合发货演示'
import { 创建拆分发货阶段演示 } from './拆分发货阶段演示'
import { 创建已发货详情演示 } from './已发货详情演示'
import { 创建拆单重拆详情演示 } from './拆单重拆详情演示'
import { 创建评价跟踪OMS演示 } from '../eBay评价/未收到评价OMS演示'
import { 创建取消申请OMS演示 } from '../eBay取消订单申请/关联OMS演示'
import { 关联人工发货订单号, 校验人工发货方案, 保存人工发货方案, 校验多组合并发货方案, 保存多组合并发货方案, type 拆合发货上下文 } from './拆合发货模型'
import { 核查发货仓库SKU, 查询人工方案库存 } from './拆合发货库存'
import { 手工发货条件阻断 } from '../手工订单/来源规则'

// 所有写操作只在本次浏览器会话内演示；订单详情与作业工作台引用同一主事实。
export const 演示路由: 订单路由[] = [
  { warehouse: '万邑通美西仓', warehouseProvider: '万邑通', warehouseAccount: '万邑通 · 北美主体', shippingChannel: 'USPS Ground Advantage', shippingChannelCode: 'WYT-USPS-GA', shippingChannelId: 'DEMO-CF-CHANNEL-WYT', labelMode: '仓配一体' },
  { warehouse: '谷仓美东仓', warehouseProvider: '谷仓', warehouseAccount: '谷仓 · 北美主体', shippingChannel: 'FedEx Home Delivery', shippingChannelCode: 'GC-FEDEX-HD', shippingChannelId: 'DEMO-CF-CHANNEL-GC', labelMode: '仓配一体' },
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
// 历史轮次为固定样例；后续执行读取当前规则，已发和剩余数量仍须另行核实。
const 部分履约待审样例 = 创建作业样例(11, {
  platformOrderStatus: 'IN_PROGRESS',
  processingStatus: '待审核',
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
const 操作样例 = 创建操作演示(创建作业样例)
const 拆分阶段样例 = 创建拆分发货阶段演示(创建作业样例, 演示路由)
export const 已发货详情样例 = 创建已发货详情演示(创建作业样例, 演示路由)
export const 评价跟踪OMS样例 = 创建评价跟踪OMS演示(创建作业样例, 演示路由)
export const 取消申请OMS样例 = 创建取消申请OMS演示(创建作业样例)
export const 操作核查证据 = ref({ ...操作样例.证据, ...拆分阶段样例.证据 })
export const 共享订单 = ref<全渠道订单[]>([
  ...structuredClone(全渠道订单模拟数据), ...待审样例, ...推单样例, 取消中样例, 系统外样例, 部分履约待审样例, ...标发样例,
  ...创建订单标志演示(创建作业样例),
  ...操作样例.订单,
  ...创建拆合发货演示(创建作业样例),
  ...拆分阶段样例.订单,
  ...已发货详情样例.订单,
  ...评价跟踪OMS样例.订单,
  ...取消申请OMS样例.订单,
  创建拆单重拆详情演示(创建作业样例, 演示路由),
])

export interface 仓库执行 {
  履约单号: string
  订单号: string[]
  出库单号: string
  三方仓出库单号?: string
  /** 来源明确返回的物流业务编号；与仓单号、跟踪号独立，缺失不补。 */
  externalLogisticsOrderNo?: string
  状态: '下单中' | '下单失败' | '待出库' | '出库异常' | '已出库' | '取消中' | '已取消'
  待核查: boolean
  原因: string
  更新时间: string
  出库快照?: 出库快照
  出库事实?: { planned: number | null; shipped: number | null; tracking: string | null; shippedAt: string | null }
}
export const 仓库执行记录 = ref<仓库执行[]>(共享订单.value.flatMap((订单) => 订单.fulfillmentOrders
  .filter((履约) => 履约.isActive && ['执行中', '已发货'].includes(履约.status))
  .map((履约) => ({ 履约单号: 履约.fulfillmentOrderNo, 订单号: [订单.systemOrderNo], 出库单号: `OUT-${履约.fulfillmentOrderNo}`, 三方仓出库单号: `WH-DEMO-${履约.fulfillmentOrderNo}`, 状态: 履约.status === '已发货' ? '已出库' as const : '待出库' as const, 待核查: false, 原因: 履约.shippedQuantity > 0 && 履约.shippedQuantity < 履约.plannedQuantity ? '已部分出库；剩余范围暂停，状态及恢复规则待确认。' : '', 更新时间: 履约.fulfillmentOrderNo === 'FL-DEMO-FLAG-08' ? '2026-09-12 09:35:00 UTC+8' : '2026-09-12 09:00:00 UTC+8' }))))
仓库执行记录.value.push({ 履约单号: 'FL-DEMO-260912-7', 订单号: [推单样例[1]!.systemOrderNo], 出库单号: 'OUT-DEMO-260912-7', 状态: '下单失败', 待核查: false, 原因: '仓库明确拒绝：当前账号未开通所选渠道。修复账号与渠道配置后再重试。', 更新时间: '2026-09-12 09:08:00 UTC+8' }, { 履约单号: 'FL-DEMO-260912-8', 订单号: [推单样例[2]!.systemOrderNo], 出库单号: 'OUT-DEMO-260912-8', 状态: '下单中', 待核查: true, 原因: '请求超时，仓库是否已建单尚待核查；不可重复推仓。', 更新时间: '2026-09-12 09:09:00 UTC+8' })
仓库执行记录.value = 仓库执行记录.value.filter(项 => !项.履约单号.startsWith('FL-DEMO-OP-') && !项.履约单号.startsWith('FL-DEMO-ACTION-') && !项.履约单号.startsWith('FL-DEMO-SPLIT-STAGE-') && !项.履约单号.startsWith('FL-DEMO-DETAIL-') && !项.履约单号.startsWith('FL-DEMO-AWAIT-') && !项.履约单号.startsWith('FL-DEMO-CXL-'))
仓库执行记录.value.push(...操作样例.执行)
仓库执行记录.value.push(...拆分阶段样例.执行)
仓库执行记录.value.push(...已发货详情样例.执行)
仓库执行记录.value.push(...评价跟踪OMS样例.执行)
仓库执行记录.value.push(...取消申请OMS样例.执行)
export const 预置仓库评审执行身份: readonly string[] = Object.freeze(仓库执行记录.value.filter(执行 => !执行.履约单号.startsWith('FL-DEMO-SPLIT-STAGE-') && !执行.履约单号.startsWith('FL-DEMO-DETAIL-') && !执行.履约单号.startsWith('FL-DEMO-AWAIT-') && !执行.履约单号.startsWith('FL-DEMO-CXL-')).map(执行 => JSON.stringify([执行.出库单号, 执行.履约单号])))

// 既有固定虚构样例的数量来自初始化时明确给定的履约摘要；只认领唯一出库路径一次。
// 后续履约改路由、改组成或出现另一历史仓单，不覆盖该出库对象的原有事实。
for (const 执行 of 仓库执行记录.value) {
  const 同履约路径 = new Set(仓库执行记录.value.filter(项 => 项.履约单号 === 执行.履约单号).map(项 => 项.出库单号))
  const 履约 = 共享订单.value.find(项 => 项.systemOrderNo === 执行.订单号[0])?.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 执行.履约单号)
  if (同履约路径.size === 1 && 履约) 执行.出库事实 = { planned: 履约.plannedQuantity, shipped: 履约.shippedQuantity, tracking: 履约.trackingNumber || null, shippedAt: 履约.shippedAt || null }
}

const 物流商单号样例 = 仓库执行记录.value.find(执行 => 执行.出库单号 === 'OUT-FL-DEMO-CF-01')
if (物流商单号样例) 物流商单号样例.externalLogisticsOrderNo = 'DEMO-LOGISTICS-20261012-001'

export const 演示库存 = ref<Record<string, '充足' | '不足' | '结果未知'>>({ [待审样例[4]!.systemOrderNo]: '结果未知' })
Object.assign(演示库存.value, 操作样例.库存)
export const 订单版本 = ref<Record<string, number>>({})
export function 当前版本(订单号: string) { return 订单版本.value[订单号] ?? 1 }
export function 演示时间() { return `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC` }
export function 记录操作(订单: 全渠道订单, 类型: string, 内容: string, 成功 = true, 操作人 = '演示操作员') {
  订单.operationLogs.push({ operatedAt: 演示时间(), operationType: 类型, operationResult: 成功 ? '成功' : '失败', operator: 操作人, content: 内容 })
  订单版本.value[订单.systemOrderNo] = 当前版本(订单.systemOrderNo) + 1
}

export function 人工发货上下文(): 拆合发货上下文 {
  return { 订单: 共享订单.value, 仓库执行: 仓库执行记录.value, 当前版本, 记录操作, 当前时间: 演示时间, 可选路由: 演示路由, 库存检查: 方案 => 方案.kind === '拆分发货' ? 查询人工方案库存(方案, 共享订单.value).reasons : [] }
}

function 可发数量有效(订单: 全渠道订单): boolean {
  return 订单.items.every(行 => Number.isSafeInteger(行.orderedQuantity) && 行.orderedQuantity > 0 && Number.isSafeInteger(行.fulfillableQuantity) && 行.fulfillableQuantity! >= 0 && 行.fulfillableQuantity! <= 行.orderedQuantity) && 订单.items.some(行 => 行.fulfillableQuantity! > 0)
}

export function 审核资格原因(订单: 全渠道订单): string {
  if (订单.fulfillmentMode !== '自配送' || 订单.processingStatus !== '待审核') return '当前对象不在待审核自配送队列'
  if (订单.reviews.some(记录 => 记录.status === '审核中')) return '本轮审核尚未结束，请查看当前结果'
  if (订单.platformCode === 'eBay' && 订单.platformOrderStatus === 'IN_PROGRESS' &&
    (操作核查证据.value[订单.systemOrderNo]?.剩余已核实 !== true || !可发数量有效(订单))) return '请先人工核实已履约范围和剩余数量，不能按整单重复发货'
  return ''
}

function 审核单项阻断原因(订单: 全渠道订单, 库存: string = '充足'): string[] {
  const 原因: string[] = 手工发货条件阻断(订单, 共享订单.value, 仓库执行记录.value)
  const 资格 = 审核资格原因(订单)
  if (资格) 原因.push(资格)
  if (订单.blockReason || 订单.cancelledAt) 原因.push(订单.blockReason || '已确认最终取消，禁止继续履约')
  const 核查 = 操作核查证据.value[订单.systemOrderNo]
  if (核查?.平台允许 === false) 原因.push('当前平台付款或取消状态不满足发货条件，请先核实订单')
  if (核查?.剩余已核实 === false || 核查?.范围已核清 === false || 核查?.范围无重叠 === false) 原因.push('该订单需逐单人工核实剩余范围及其他发货路径')
  if (核查?.发货资料有效 === false || 核查?.路由适用 === false) 原因.push('当前商品、收件或仓库物流资料不满足发货要求')
  // paidAt 仅用于展示，不能代替当前 Order.orderPaymentStatus。
  // 本工作台只接收已准入六态；准入前非 PAID 不进入，准入后非 PAID 更新先由平台适配链路转为异常。
  if (订单.items.some((行) => 行.skuResolutionStatus !== '成功' || !行.systemSku?.trim())) 原因.push('SKU 映射未完整识别；请由中台商品资料责任方处理')
  if (![订单.address.fullName, 订单.address.countryCode, 订单.address.addressLine1].every(项 => 项?.trim())) 原因.push('收件人、收货国家或详细地址缺失')
  if (!订单.manualShippingPlan) {
    const 路由 = 订单.defaultRoute
    if (!路由?.warehouse?.trim()) 原因.push('未分配发货仓库，请先修改仓库物流')
    if (!路由?.warehouseProvider?.trim() || !路由.warehouseAccount?.trim()) 原因.push('仓储服务商或仓库账号缺失')
    if (!路由?.shippingChannel?.trim() || !路由.shippingChannelCode?.trim()) 原因.push('未分配物流渠道或渠道代码缺失，请先修改仓库物流')
  }
  // 拆分方案按包校验库存时已经逐行验证仓库 SKU；普通和合并发货按本次实际仓库账号取配对。
  if (订单.manualShippingPlan?.kind !== '拆分发货') {
    const 路由 = 订单.manualShippingPlan?.packages[0]?.route ?? 订单.defaultRoute
    if (路由?.warehouse && 路由.warehouseProvider && 路由.warehouseAccount) {
      for (const 行 of 订单.items.filter(行 => 行.systemSku && 行.skuResolutionStatus === '成功' && (行.fulfillableQuantity ?? 0) > 0)) {
        const 结果 = 核查发货仓库SKU(路由, 行.systemSku!)
        if (结果.reason) 原因.push(`${行.systemSku}：${结果.reason}`)
      }
    }
  }
  const 标志 = 计算订单标志(订单, 订单标志演示证据).filter(项 => 项.code === 'REFUND' || 项.code === 'CANCEL')
  if (标志.length) 原因.push(`当前订单含${标志.map(项 => `“${项.text}”`).join('、')}标志，默认不允许审核通过，请先核实退款或取消事实`)
  if (!订单.manualShippingPlan && 订单.defaultRoute?.labelMode === '仓配分离') 原因.push('仓配分离的一期交付范围待确认')
  if (订单.manualShippingPlan?.kind !== '拆分发货' && 库存 !== '充足') 原因.push(`中台库存${库存}；本轮不允许审核通过`)
  if (订单.fulfillmentOrders.some((履约) => 履约.isActive)) 原因.push('已有有效履约路径，禁止重复生成')
  if (!可发数量有效(订单)) 原因.push('可履约数量缺失或不合法')
  if (订单.fulfillmentOrders.some(项 => !Number.isInteger(项.shippedQuantity) || 项.shippedQuantity !== 0 || 项.status === '已发货' || 项.shippedAt)) 原因.push('历史实际出库未核清，禁止整单重复发货')
  const 履约号 = new Set(订单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo))
  const 原执行 = 仓库执行记录.value.filter(项 => 项.订单号.includes(订单.systemOrderNo) || 履约号.has(项.履约单号))
  if (原执行.some(项 => 项.待核查 || !['下单失败', '已取消'].includes(项.状态) || !履约号.has(项.履约单号))) 原因.push('已有其他发货路径或历史仓库请求结果未明，请先核查')
  if (原执行.some(项 => 项.订单号.some(号 => 号 !== 订单.systemOrderNo)) || 共享订单.value.some(项 => 项.systemOrderNo !== 订单.systemOrderNo && 项.fulfillmentOrders.some(履约 => 履约号.has(履约.fulfillmentOrderNo)))) 原因.push('历史关联共享履约，需专项核实后再审核')
  return 原因
}

export function 审核阻断原因(订单: 全渠道订单, 库存: string = '充足'): string[] {
  if (!订单.manualShippingPlan) return 审核单项阻断原因(订单, 库存)
  const 方案 = 订单.manualShippingPlan
  const 来源 = 共享订单.value.filter(单 => 方案.orderNos.includes(单.systemOrderNo))
  return [...new Set([...校验人工发货方案(人工发货上下文(), 方案), ...来源.flatMap(单 => 审核单项阻断原因(单, 单.systemOrderNo === 订单.systemOrderNo ? 库存 : 演示库存.value[单.systemOrderNo] ?? '充足').map(原因 => `${单.systemOrderNo}：${原因}`))])]
}

export interface 命令结果 { 成功: boolean; 信息: string; 对象号?: string; 待核查?: boolean }
export type 规则轮次来源 = '立即执行' | '定时执行'

export function 执行演示审核(订单号: string, 期望版本: number, 审核说明 = '', 来源版本?: Record<string, number>): 命令结果 {
  return 提交审核轮次(订单号, 期望版本, 审核说明, 来源版本)
}

export function 提交审核轮次(订单号: string, 期望版本: number, 审核说明: string, 来源版本?: Record<string, number>, 规则轮次?: { 来源: 规则轮次来源; 拦截: string[] }): 命令结果 {
  const 审核类型 = 规则轮次 ? '自动审核' : '人工审核'
  const 触发来源 = 规则轮次 ? `${规则轮次.来源}审单规则` : '手动审核'
  const 操作人 = 规则轮次 ? '规则执行器' : '演示操作员'
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
  if (!订单) return { 成功: false, 信息: '订单不存在，请刷新列表' }
  if (当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '订单已变化，请重新打开预检后提交' }
  if (审核说明.trim().length > 2000) return { 成功: false, 信息: '审核说明最多 2000 字符' }
  const 资格 = 审核资格原因(订单)
  if (资格) return { 成功: false, 信息: [资格, 订单.blockReason].filter(Boolean).join('；') }
  if (订单.manualShippingPlan) {
    const 方案 = 订单.manualShippingPlan
    const 来源号 = 关联人工发货订单号(人工发货上下文(), [订单号])
    const 来源 = 共享订单.value.filter(单 => 来源号.includes(单.systemOrderNo))
    if (来源.some(单 => (来源版本?.[单.systemOrderNo] ?? (来源.length === 1 ? 期望版本 : undefined)) !== 当前版本(单.systemOrderNo))) return { 成功: false, 信息: '全部来源订单版本尚未确认或已变化，请重新打开审核窗口' }
    if (来源.some(单 => 单.processingStatus !== '待审核')) return { 成功: false, 信息: '方案全部来源订单必须处于待审核，不能重复审核或部分通过' }
    const 来源资格 = 来源.map(审核资格原因).find(Boolean)
    if (来源资格) return { 成功: false, 信息: 来源资格 }
    const 原因 = [...审核阻断原因(订单, 演示库存.value[订单号] ?? '充足'), ...(规则轮次?.拦截 ?? [])]
    const 摘要 = `${方案.kind}方案 ${方案.id}；全部来源：${来源号.join('、')}。${原因.length ? `审核拦截：${原因.join('；')}；全部来源保留待审核。` : `审核通过，固化 ${方案.packages.length} 张履约单；全部来源进入待推单，本次不推仓。`}${审核说明.trim() ? `审核说明：${审核说明.trim()}` : ''}`
    for (const 单 of 来源) {
      单.reviews.push({ round: Math.max(0, ...单.reviews.map(项 => 项.round)) + 1, type: 审核类型, triggerSource: 触发来源, status: 原因.length ? '已拦截' : '已通过', decisionNote: 摘要, completedAt: 演示时间() })
      if (!原因.length) {
        for (const [索引, 包裹] of 方案.packages.entries()) {
          if (!包裹.items.some(行 => 行.orderNo === 单.systemOrderNo)) continue
          单.fulfillmentOrders.push({ fulfillmentOrderNo: `FL-${方案.id}-${索引 + 1}`, status: '待执行', isActive: true, route: { ...包裹.route }, plannedQuantity: 包裹.items.reduce((总, 行) => 总 + 行.quantity, 0), shippedQuantity: 0, items: 包裹.items.map(行 => ({ ...行 })), manualPlanId: 方案.id })
        }
        单.processingStatus = '待推单'
      }
      记录操作(单, 规则轮次 ? 触发来源 : '审核', 摘要, !原因.length, 操作人)
    }
    return { 成功: !原因.length, 信息: 摘要, 对象号: 原因.length ? undefined : `FL-${方案.id}-1` }
  }
  const 原因 = [...审核阻断原因(订单, 演示库存.value[订单号] ?? '充足'), ...(规则轮次?.拦截 ?? [])]
  const 摘要 = (原因.length ? `审核未通过：${原因.join('；')}。订单保留待审核。` : '审核已通过：已按本次发货数量生成履约单，并固化当前仓库和物流渠道。') + (审核说明.trim() ? `审核说明：${审核说明.trim()}` : '')
  订单.reviews.push({ round: Math.max(0, ...订单.reviews.map((项) => 项.round)) + 1, type: 审核类型, triggerSource: 触发来源, status: 原因.length ? '已拦截' : '已通过', decisionNote: 摘要, completedAt: 演示时间() })
  if (!原因.length) {
    订单.fulfillmentOrders.push({ fulfillmentOrderNo: `FL-${订单号}-R${订单.reviews.length}`, status: '待执行', isActive: true, route: { ...订单.defaultRoute! }, plannedQuantity: 订单.items.reduce((总, 行) => 总 + 行.fulfillableQuantity!, 0), shippedQuantity: 0 })
    订单.processingStatus = '待推单'
  }
  记录操作(订单, 规则轮次 ? 触发来源 : '审核', 摘要, !原因.length, 操作人)
  return { 成功: !原因.length, 信息: 摘要, 对象号: 订单.fulfillmentOrders[订单.fulfillmentOrders.length - 1]?.fulfillmentOrderNo }
}

/** 同步预检后保存并审核；任何前置失败均保留旧方案，不推仓。 */
export function 执行演示保存并审核(方案: 人工发货方案, 来源版本: Record<string, number>): 命令结果 {
  if (方案.orderNos.some(号 => !Number.isInteger(来源版本[号]) || 来源版本[号] !== 当前版本(号))) return { 成功: false, 信息: '全部来源订单版本尚未确认或已变化；本次未保存方案或提交审核，请重新打开' }
  const 上下文 = 人工发货上下文()
  const 来源 = 共享订单.value.filter(单 => 方案.orderNos.includes(单.systemOrderNo))
  const 原因 = [...校验人工发货方案(上下文, 方案), ...来源.flatMap(单 => 审核单项阻断原因({ ...单, manualShippingPlan: 方案 }, 演示库存.value[单.systemOrderNo] ?? '充足').map(原因项 => `${单.systemOrderNo}：${原因项}`))]
  if (原因.length) return { 成功: false, 信息: `方案未保存，未提交审核：${[...new Set(原因)].join('；')}` }
  const 保存 = 保存人工发货方案(上下文, 方案, 来源版本)
  if (!保存.成功) return { 成功: false, 信息: `方案未保存，未提交审核：${保存.信息}` }
  const 新版本 = Object.fromEntries(方案.orderNos.map(号 => [号, 当前版本(号)]))
  const 审核 = 执行演示审核(方案.orderNos[0]!, 当前版本(方案.orderNos[0]!), '保存并审核订单', 新版本)
  if (!审核.成功) return { ...审核, 成功: false, 信息: `方案已保存，审核未通过；来源订单保留待审核：${审核.信息}` }
  return { ...审核, 成功: true, 信息: `方案已保存并审核通过，${方案.orderNos.length} 张来源订单进入待推单，生成 ${方案.packages.length} 张履约单；本次未推仓` }
}

/** 全组选定方案先纯预检；任何来源不通过都不保存或提交其他组的审核。 */
export function 执行演示合并保存并审核(方案列表: 人工发货方案[], 来源版本: Record<string, number>): 命令结果 {
  const 上下文 = 人工发货上下文()
  const 原因 = 校验多组合并发货方案(上下文, 方案列表, 来源版本)
  for (const [索引, 方案] of 方案列表.entries()) {
    const 来源 = 共享订单.value.filter(单 => 方案.orderNos.includes(单.systemOrderNo))
    for (const 单 of 来源) {
      原因.push(...审核单项阻断原因({ ...单, manualShippingPlan: 方案 }, 演示库存.value[单.systemOrderNo] ?? '充足').map(项 => `第 ${索引 + 1} 组 ${单.systemOrderNo}：${项}`))
    }
  }
  if (原因.length) return { 成功: false, 信息: `合并方案未保存，未提交审核：${[...new Set(原因)].join('；')}` }
  const 保存 = 保存多组合并发货方案(上下文, 方案列表, 来源版本)
  if (!保存.成功) return { 成功: false, 信息: `合并方案未保存，未提交审核：${保存.信息}` }
  // 同一同步命令中，各组来源互不重叠；全部条件已在任何保存和审核之前复验。
  for (const 方案 of 方案列表) {
    const 新版本 = Object.fromEntries(方案.orderNos.map(号 => [号, 当前版本(号)]))
    const 审核 = 执行演示审核(方案.orderNos[0]!, 当前版本(方案.orderNos[0]!), '合并发货保存并审核', 新版本)
    if (!审核.成功) return { ...审核, 成功: false, 信息: `合并方案已保存，审核结果需核实：${审核.信息}` }
  }
  const 来源数 = 方案列表.reduce((总, 方案) => 总 + 方案.orderNos.length, 0)
  return { 成功: true, 信息: `已保存并审核 ${方案列表.length} 组合并发货方案，${来源数} 张来源订单进入待推单，生成 ${方案列表.length} 张共享履约单；本次未推仓` }
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
  const 来源 = 共享订单.value.filter(项 => 项.fulfillmentOrders.some(路径 => 路径.fulfillmentOrderNo === 履约单号))
  const 明细 = 履约?.items
  const 来源待发总量 = 明细 ? 明细.reduce((总, 行) => 总 + 行.quantity, 0) : 来源.reduce((总, 单) => 总 + 单.items.reduce((小计, 行) => 小计 + (行.fulfillableQuantity ?? 0), 0), 0)
  if (明细) {
    const 来源不明 = 明细.some(行 => !来源.some(单 => 单.systemOrderNo === 行.orderNo && 单.items.some(商品 => 商品.externalLineId === 行.externalLineId && Number.isInteger(行.quantity) && 行.quantity > 0 && 行.quantity <= (商品.fulfillableQuantity ?? 0))))
    if (!明细.length || 来源不明) 原因.push('本包裹商品来源或分配数量不合法')
    if (来源.some(单 => JSON.stringify(单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 履约单号)?.items) !== JSON.stringify(明细))) 原因.push('共享履约的来源明细不一致，请先核查')
    for (const 单 of 来源) for (const 行 of 单.items) {
      const 已分配 = 单.fulfillmentOrders.filter(项 => 项.isActive).flatMap(项 => 项.items ?? []).filter(项 => 项.orderNo === 单.systemOrderNo && 项.externalLineId === 行.externalLineId).reduce((总, 项) => 总 + 项.quantity, 0)
      if (已分配 !== 行.fulfillableQuantity) 原因.push(`来源订单 ${单.systemOrderNo} 商品分配不完整或重复`)
    }
  }
  if (明细 && 订单.manualShippingPlan?.kind === '拆分发货') {
    const 方案 = 订单.manualShippingPlan
    const 尚未明确受理 = 订单.fulfillmentOrders.filter(项 => {
      if (!项.isActive || 项.manualPlanId !== 方案.id) return false
      const 执行记录 = 仓库执行记录.value.filter(执行项 => 执行项.履约单号 === 项.fulfillmentOrderNo)
      // 已明确建仓的兄弟包可能已占用库存，不再次要求当前可用量覆盖；未知请求继续保留需求。
      return 执行记录.length !== 1 || 执行记录[0]!.待核查 || !['待出库', '出库异常', '已出库'].includes(执行记录[0]!.状态)
    })
    const 执行方案: 人工发货方案 = { ...方案, packages: 尚未明确受理.map(项 => ({ key: 项.fulfillmentOrderNo, route: 项.route, items: 项.items ?? [] })) }
    原因.push(...查询人工方案库存(执行方案, 共享订单.value).reasons)
  }
  for (const 单 of 来源) {
    原因.push(...手工发货条件阻断(单, 共享订单.value, 仓库执行记录.value))
    const 证据 = 操作核查证据.value[单.systemOrderNo]
    const 计划 = 单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 履约单号)!
    if (单.processingStatus !== '待推单' || 单.blockReason || 单.cancelledAt || 证据?.平台允许 === false) 原因.push(`来源订单 ${单.systemOrderNo} 当前状态不允许推单`)
    if (单.reviews[单.reviews.length - 1]?.status !== '已通过' || 证据?.原方案有效 === false) 原因.push(`来源订单 ${单.systemOrderNo} 没有当前有效的审核通过方案`)
    if (!计划.isActive || !Number.isInteger(计划.plannedQuantity) || 计划.plannedQuantity <= 0 || 单.items.some(行 => !Number.isInteger(行.fulfillableQuantity) || 行.fulfillableQuantity! < 0 || 行.fulfillableQuantity! > 行.orderedQuantity) || 计划.plannedQuantity !== 来源待发总量) 原因.push(`来源订单 ${单.systemOrderNo} 计划商品或数量尚未核实`)
    if (单.items.some(行 => !行.systemSku || 行.skuResolutionStatus !== '成功') || 证据?.发货资料有效 === false || 证据?.路由适用 === false || !单.address.fullName?.trim() || !单.address.countryCode?.trim() || !单.address.addressLine1?.trim()) 原因.push(`来源订单 ${单.systemOrderNo} 本次发货资料或渠道不满足要求`)
    if (单.manualShippingPlan?.kind !== '拆分发货' && (演示库存.value[单.systemOrderNo] ?? '充足') !== '充足') 原因.push(`来源订单 ${单.systemOrderNo} 库存不足或结果尚未核实`)
    if (证据?.剩余已核实 === false || 证据?.零出库已核实 === false || 证据?.范围无重叠 === false || 证据?.范围已核清 === false || 单.fulfillmentOrders.some(项 => !Number.isInteger(项.shippedQuantity) || (明细 && 项.isActive && 项.manualPlanId === 履约?.manualPlanId ? 项.shippedQuantity < 0 || 项.shippedQuantity > 项.plannedQuantity : 项.shippedQuantity !== 0 || 项.shippedAt || 项.status === '已发货'))) 原因.push(`来源订单 ${单.systemOrderNo} 历史发货范围未核清，不能重复推单`)
    const 历史号 = new Set(单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo))
    if (仓库执行记录.value.some(项 => 项.履约单号 !== 履约单号 && (项.订单号.includes(单.systemOrderNo) || 历史号.has(项.履约单号)) && !(明细 && 单.fulfillmentOrders.some(路径 => 路径.isActive && 路径.items?.length && 路径.manualPlanId === 履约?.manualPlanId && 路径.fulfillmentOrderNo === 项.履约单号)) && (项.待核查 || !['下单失败', '已取消'].includes(项.状态) || !历史号.has(项.履约单号)))) 原因.push(`来源订单 ${单.systemOrderNo} 存在其他有效发货执行或未明请求`)
  }
  return [...new Set(原因)]
}

export function 执行演示推单(订单号: string, 履约单号: string, 期望版本: number, 来源版本?: Record<string, number>): 命令结果 {
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
  if (!订单 || 当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '对象已变化，请刷新后重新预检' }
  const 来源 = 共享订单.value.filter(项 => 项.fulfillmentOrders.some(路径 => 路径.fulfillmentOrderNo === 履约单号))
  if (来源.some(项 => (来源版本?.[项.systemOrderNo] ?? (来源.length === 1 ? 期望版本 : undefined)) !== 当前版本(项.systemOrderNo))) return { 成功: false, 信息: '全部来源订单版本尚未确认或已变化，请重新预检' }
  const 原因 = 推单阻断原因(订单, 履约单号)
  if (原因.length) return { 成功: false, 信息: 原因.join('；') }
  const 出库单号 = `CK-${履约单号}`
  const 提交时间 = 演示时间()
  const 出库快照 = 创建推单出库快照(来源, 履约单号, 提交时间)
  仓库执行记录.value.push({ 履约单号, 订单号: 来源.map(项 => 项.systemOrderNo), 出库单号, 状态: '下单中', 待核查: true, 原因: '演示请求已受理，等待读取仓库结果；提交受理不代表建仓成功。', 更新时间: 提交时间, 出库快照, 出库事实: { planned: 出库快照.quantitySummary.plannedQuantity, shipped: 0, tracking: null, shippedAt: null } })
  for (const 单 of 来源) 记录操作(单, '提交仓库', `创建 ${出库单号}；全部来源：${来源.map(项 => 项.systemOrderNo).join('、')}；状态为下单中，订单保持待推单。演示不调用外部接口。`)
  return { 成功: true, 信息: '推单已受理，订单保持待推单；请同步仓库状态查看结果。', 对象号: 出库单号, 待核查: true }
}

export function 核查演示仓库结果(履约单号: string): 命令结果 {
  const 执行 = 仓库执行记录.value.find((项) => 项.履约单号 === 履约单号)
  if (!执行) return { 成功: false, 信息: '尚无仓库请求' }
  if (履约单号 === 'FL-DEMO-260912-8') return { 成功: false, 待核查: true, 信息: '演示查询仍未取得明确结果；保留下单中，禁止重复推仓。' }
  if (执行.状态 !== '下单中') return { 成功: true, 信息: `已读取最后可信仓库事实：${执行.状态}` }
  执行.状态 = '待出库'; 执行.待核查 = false; 执行.原因 = ''; 执行.三方仓出库单号 = `WH-DEMO-${履约单号}`; 执行.更新时间 = 演示时间()
  for (const 订单号 of 执行.订单号) {
    const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 订单号)
    if (!订单) continue
    const 履约 = 订单.fulfillmentOrders.find((项) => 项.fulfillmentOrderNo === 履约单号)
    if (履约) 履约.status = '执行中'
    const 全部建仓 = 订单.fulfillmentOrders.filter((项) => 项.isActive).every((项) => 仓库执行记录.value.some((仓单) => 仓单.履约单号 === 项.fulfillmentOrderNo && ['待出库', '出库异常', '已出库'].includes(仓单.状态)))
    if (订单.processingStatus === '待推单' && !订单.blockReason && !订单.cancelledAt && 全部建仓) 订单.processingStatus = '待发货'
    记录操作(订单, '核查仓库结果', `模拟仓库明确建单成功，已认领 ${执行.三方仓出库单号}；订单当前为${订单.processingStatus}。`)
  }
  return { 成功: true, 信息: '模拟仓库已明确建单成功，进入待出库；订单已按全部有效履约范围重新聚合。', 对象号: 执行.出库单号 }
}
