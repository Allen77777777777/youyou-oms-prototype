import { ref, watch } from 'vue'
import { createCustomerServiceLog, type CustomerServiceLog } from '@/组件/客服日志/日志工具'
import type { 订单路由, 金额 } from '../全渠道订单/类型'
import { 创建手工订单, 创建手工订单草稿, 原订单关联阻断原因, 校验手工订单, 手工订单路由, type 手工订单草稿 } from '../手工订单/模型'
import { 共享订单 } from '../订单处理/演示会话'
import { 查找所选仓库物流, 路由仓库键 } from '../订单处理/仓库物流选择模型'
import { resolveReturnItem, resolveReturnOrder } from '../eBay退换货申请/关联导航'
import { returnSession } from '../eBay退换货申请/数据'
import { formatMinor, parseMoney } from '../eBay退换货申请/接口契约'
import { returnPlatformPresentation } from '../eBay退换货申请/模型'

export type AfterSaleKind = '全额退款' | '部分退款' | '退货' | '重发'
export const afterSaleKinds: AfterSaleKind[] = ['全额退款', '部分退款', '退货', '重发']
export const afterSaleReasons = [
  '平台退款', '质量问题', '未收到', '破损', '分开发货', '不合适', '描述不符', '发错货', '缺货', '少件', '买家平台退款',
  '无理由退货', '仓库退回', '退快递费', '少配件', '退差价', '派送失败退回了', '客户抱怨物流问题', '退货已签收', '修改好评', '客户要取消', '运费太贵',
]
export interface AfterSaleItem { lineId: string; sku?: string; title: string; quantity: number; reason: string }
export interface AfterSaleInput {
  requestId: string
  shopId: string
  shopName: string
  returnId: string
  orderNo: string
  systemOrderNo?: string
  kind: AfterSaleKind
  items: AfterSaleItem[]
  note?: string
  platformReason?: string
  amount?: 金额
  actionLabel?: string
  reshipDraft?: 手工订单草稿
}
export interface AfterSaleRecord extends AfterSaleInput {
  no: string
  platform: 'eBay'
  source: '本地办理' | '平台同步'
  approval: '待审核' | '已审核' | null
  createdBy: string
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  executionResult: string
  actualAmount?: 金额
  /** 本次退货安排有独立平台确认后记录；免寄回为零。 */
  approvedReturnQty?: number
  /** 单次售后关联的仓库实收行；本原型仅有来源明确的虚构只读样例。 */
  warehouseReceipts?: Array<{ receiptNo: string; warehouse: string; lineId: string; quantity: number }>
  manualOrderNo?: string
  reshipRoute?: 订单路由
  /** 仅记录本单真实发生的本地操作及来源结果更新，历史缺失不补造。 */
  logs?: CustomerServiceLog[]
}
export interface AfterSaleActor { id: string; name: string; canApprove: boolean; shopIds: 'all' | string[] }
export const afterSaleActors: AfterSaleActor[] = [
  { id: 'ops-01', name: '运营01', canApprove: true, shopIds: 'all' },
  { id: 'support-01', name: '客服01', canApprove: false, shopIds: 'all' },
  { id: 'ops-02', name: '运营02', canApprove: true, shopIds: ['shop-us'] },
]
export const activeAfterSaleActor = ref<AfterSaleActor>(afterSaleActors[0]!)
export const afterSaleRecords = ref<AfterSaleRecord[]>([])
function addLog(record: AfterSaleRecord, operator: string, action: string, content: string, result: string, at?: string) {
  ;(record.logs ??= []).push(createCustomerServiceLog(operator, action, content, result, at))
}
watch(() => afterSaleRecords.value.filter(record => record.manualOrderNo).map(record => {
  const order = 共享订单.value.find(item => item.systemOrderNo === record.manualOrderNo)
  return { no: record.no, orderNo: record.manualOrderNo!, status: order?.processingStatus || '',
    parcels: order?.fulfillmentOrders.filter(parcel => parcel.isActive).map(parcel => `${parcel.fulfillmentOrderNo}：${parcel.status}`).sort().join('；') || '' }
}), (rows, previous) => {
  for (const row of rows) {
    const before = previous?.find(item => item.no === row.no && item.orderNo === row.orderNo)
    if (!before || !row.status || before.status === row.status && before.parcels === row.parcels) continue
    const record = afterSaleRecords.value.find(item => item.no === row.no)
    if (record) addLog(record, '系统', '重发执行结果更新', `手工订单 ${row.orderNo}；OMS 处理状态：${before.status || '未取得'} → ${row.status}${row.parcels ? `；履约进展：${row.parcels}` : ''}`, '已更新')
  }
}, { flush: 'sync' })
export interface AfterSaleResult { ok: boolean; message: string; record?: AfterSaleRecord; reused?: boolean }

export function canViewAfterSale(input: Pick<AfterSaleInput, 'shopId'>, actor = activeAfterSaleActor.value): boolean {
  return actor.shopIds === 'all' || actor.shopIds.includes(input.shopId)
}
export function canApproveReship(record: AfterSaleRecord, actor = activeAfterSaleActor.value): boolean {
  return record.kind === '重发' && record.approval === '待审核' && actor.canApprove && canViewAfterSale(record, actor) && canViewAfterSale({ shopId: record.reshipDraft?.storeId || record.shopId }, actor)
}
export function recordsForReturn(shopId: string, returnId: string): AfterSaleRecord[] {
  return afterSaleRecords.value.filter(r => r.shopId === shopId && r.returnId === returnId && canViewAfterSale(r))
}

function currentSource(input: AfterSaleInput, allowMissingOrderNo = false) {
  const sources = returnSession.records.filter(r => r.shopId === input.shopId && r.id === input.returnId)
  const source = sources.length === 1 ? sources[0] : undefined
  return source && (source.orderNo === input.orderNo || (allowMissingOrderNo && !source.orderNo)) ? source : undefined
}

/** 回执按仓库、实收单号和商品行识别。未知、冲突或跨售后单重复认领时保留待核实。 */
function receivedQuantity(record: AfterSaleRecord): number | undefined {
  if (record.kind !== '退货' || !record.warehouseReceipts?.length) return
  const seen = new Map<string, number>()
  for (const line of record.warehouseReceipts) {
    if (!line.receiptNo.trim() || !line.warehouse.trim() || !record.items.some(i => i.lineId === line.lineId) || !Number.isSafeInteger(line.quantity) || line.quantity < 0) return
    const key = JSON.stringify([line.warehouse, line.receiptNo, line.lineId])
    if (seen.has(key) && seen.get(key) !== line.quantity) return
    if (afterSaleRecords.value.some(r => r.no !== record.no && r.warehouseReceipts?.some(other =>
      other.warehouse === line.warehouse && other.receiptNo === line.receiptNo && other.lineId === line.lineId))) return
    seen.set(key, line.quantity)
  }
  return [...seen.values()].reduce((sum, quantity) => sum + quantity, 0)
}

export function afterSaleFacts(record: AfterSaleRecord) {
  // SUMMARY 可省略 orderId；展示按店铺＋Return ID 读取，已知原单身份冲突才阻断。
  const source = currentSource(record, true)
  return {
    ...returnPlatformPresentation(source),
    approvedReturnQty: record.kind === '退货' ? record.approvedReturnQty : undefined,
    receivedQty: receivedQuantity(record),
  }
}

export function afterSaleReturnSummary(shopId: string, returnId: string) {
  const records = recordsForReturn(shopId, returnId)
  const amounts = new Map<string, bigint>()
  let approvedReturnQty: number | undefined, receivedQty: number | undefined
  let hasUnverifiedRefund = false, hasUnverifiedReceipt = false
  for (const record of records) {
    if (record.kind === '退货') {
      if (record.approvedReturnQty !== undefined) approvedReturnQty = (approvedReturnQty ?? 0) + record.approvedReturnQty
      const received = receivedQuantity(record)
      if (received !== undefined) receivedQty = (receivedQty ?? 0) + received
      else if (record.approvedReturnQty !== 0) hasUnverifiedReceipt = true
    }
    if (record.kind !== '全额退款' && record.kind !== '部分退款') continue
    const amount = record.actualAmount
    const value = amount && parseMoney(amount.value, amount.currency)
    if (value == null || !amount) { hasUnverifiedRefund = true; continue }
    amounts.set(amount.currency, (amounts.get(amount.currency) ?? 0n) + value)
  }
  return { count: records.length, approvedReturnQty, receivedQty, hasUnverifiedReceipt, hasUnverifiedRefund,
    actualAmounts: [...amounts].map(([currency, value]) => ({ currency, value: formatMinor(value, currency) })) }
}
function validateReship(input: AfterSaleInput, ownNo?: string): string[] {
  const source = currentSource(input)
  if (!source) return ['未找到唯一匹配的来源店铺、申请及原订单']
  if (source.detail?.readStatus.summary.status !== 'success' || source.detail.readStatus.detail.status !== 'success') return ['退货申请资料读取不完整，请先刷新并核实商品']
  const order = resolveReturnOrder(source, 共享订单.value)
  const item = resolveReturnItem(source, 共享订单.value)
  if (!order || !item?.systemSku || item.skuResolutionStatus !== '成功' || !order.systemOrderNo || order.systemOrderNo !== input.systemOrderNo) return ['原订单或本次申请对应的系统商品尚未核实']
  if (source.detail?.contentOnHold || source.detail?.itemOnHold || source.detail?.quantityConflict) return ['申请商品资料受限或数量存在冲突，请先核实']
  const quantity = source.quantity
  if (!quantity || !Number.isSafeInteger(quantity) || quantity < 1) return ['申请商品数量不明，请先核实']
  const errors = 原订单关联阻断原因(order.systemOrderNo)
  const selected = input.items[0]
  if (input.items.length !== 1 || !selected || selected.lineId !== item.externalLineId || selected.sku !== item.systemSku) {
    errors.push('重发商品、数量须与本次申请对应的原订单商品行一致')
  } else {
    const reserved = afterSaleRecords.value
      .filter(r => r.no !== ownNo && r.kind === '重发' && r.shopId === input.shopId && r.returnId === input.returnId)
      .flatMap(r => r.items).filter(i => i.lineId === item.externalLineId).reduce((n, i) => n + i.quantity, 0)
    if (selected.quantity + reserved > Math.min(quantity, item.orderedQuantity)) errors.push('本次与已有待审或已审重发数量合计超出申请数量，请查看关联售后单')
  }
  return errors
}
export function validateAfterSale(input: AfterSaleInput, ownNo?: string, platformSync = false): string[] {
  const errors: string[] = []
  if (![input.requestId, input.shopId, input.shopName, input.returnId, input.orderNo].every(v => v?.trim())) errors.push('本次处理标识、来源店铺或申请身份不完整')
  if (!afterSaleKinds.includes(input.kind)) errors.push('处理方式不适用')
  if (!input.items.length || new Set(input.items.map(i => i.lineId)).size !== input.items.length ||
      input.items.some(i => !i.lineId.trim() || !i.title.trim() || !Number.isSafeInteger(i.quantity) || i.quantity < 1)) {
    errors.push('请核对本次商品、明细身份和有效数量')
  }
  // 新单须选现行原因，历史单已保存的非空原值继续用于追溯。
  const saved = ownNo ? afterSaleRecords.value.find(r => r.no === ownNo) : undefined
  if (input.items.some(i => !afterSaleReasons.includes(i.reason) &&
      !(i.reason && saved?.items.some(old => old.lineId === i.lineId && old.reason === i.reason)))) errors.push('请选择系统售后原因')
  if ((input.note?.trim().length ?? 0) > 500) errors.push('内部备注最多 500 字')
  if (input.amount && (parseMoney(input.amount.value, input.amount.currency) ?? 0n) <= 0n) errors.push('本次金额或币种无效')
  if (!platformSync && (input.kind === '全额退款' || input.kind === '部分退款') && !input.amount) errors.push('请核对本次退款金额和币种')
  if (input.kind === '重发') errors.push(...validateReship(input, ownNo))
  return errors
}

function snapshot<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function inputSignature(input: AfterSaleInput): string {
  return JSON.stringify([input.orderNo, input.systemOrderNo, input.kind, input.items, input.note || '', input.amount, input.actionLabel])
}
function makeRecord(input: AfterSaleInput, source: AfterSaleRecord['source'], actorName: string): AfterSaleResult {
  const same = afterSaleRecords.value.find(r => r.shopId === input.shopId && r.returnId === input.returnId && r.requestId === input.requestId)
  if (same) {
    if (same.source !== source || inputSignature(same) !== inputSignature(input)) return { ok: false, message: '该次处理已生成售后单，内容不同，请核实原记录' }
    return { ok: true, message: '已返回该次处理的售后单', record: same, reused: true }
  }
  const errors = validateAfterSale(input, undefined, source === '平台同步')
  if (errors.length) return { ok: false, message: errors.join('；') }
  const now = new Date().toISOString()
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  let seq = afterSaleRecords.value.length + 1
  let no = ''
  do { no = `SH-${day}-${String(seq++).padStart(4, '0')}` } while (afterSaleRecords.value.some(r => r.no === no))
  const draft = input.reshipDraft
  const route = draft && 查找所选仓库物流(手工订单路由.value, draft.warehouse, draft.channel)
  const record: AfterSaleRecord = {
    ...snapshot(input), no, source, platform: 'eBay', createdAt: now, createdBy: actorName,
    approval: input.kind === '重发' ? '待审核' : null,
    executionResult: input.kind === '重发' ? '等待重发审核' : '已登记，待核实执行结果',
    ...(route && { reshipRoute: { ...route } }),
    logs: [createCustomerServiceLog(source === '平台同步' ? '系统 · eBay同步' : actorName, '创建售后单', `类型：${input.kind}；来源申请：${input.returnId}；${input.kind === '重发' ? '待审核，尚未创建手工订单' : '登记本次办理，不代表执行或退款成功'}`, '成功', now)],
  }
  afterSaleRecords.value.unshift(record)
  return { ok: true, message: input.kind === '重发' ? '重发售后单已提交审核' : '售后单已创建', record: afterSaleRecords.value[0]! }
}
export function createAfterSale(input: AfterSaleInput, actor = activeAfterSaleActor.value): AfterSaleResult {
  if (!canViewAfterSale(input, actor)) return { ok: false, message: '当前人员没有该店铺的办理权限' }
  if (input.reshipDraft && !canViewAfterSale({ shopId: input.reshipDraft.storeId }, actor)) return { ok: false, message: '当前人员没有所选发货店铺的办理权限' }
  return makeRecord(input, '本地办理', actor.name)
}
/** 来源回查只登记业务事实，不产生任何平台写请求。 */
export function createPlatformAfterSale(input: AfterSaleInput): AfterSaleResult {
  if (input.kind === '重发') return { ok: false, message: '重发仅支持商家内部办理' }
  return makeRecord(input, '平台同步', 'eBay')
}
export function updateAfterSaleResult(no: string, result: string, actualAmount?: 金额 | null): void {
  const record = afterSaleRecords.value.find(r => r.no === no)
  if (!record || record.kind === '重发' || !result.trim()) return
  const previous = JSON.stringify([record.executionResult, record.actualAmount])
  const before = record.executionResult
  record.executionResult = result
  if (actualAmount === null) delete record.actualAmount
  if (actualAmount && (record.kind === '全额退款' || record.kind === '部分退款') && parseMoney(actualAmount.value, actualAmount.currency) !== null) record.actualAmount = { ...actualAmount }
  if (JSON.stringify([record.executionResult, record.actualAmount]) !== previous) addLog(record, '系统', '执行结果更新', `办理结果：${before || '未取得'} → ${record.executionResult}${actualAmount !== undefined ? `；本笔实退：${record.actualAmount ? record.actualAmount.value + ' ' + record.actualAmount.currency : '未确认金额'}` : ''}`, '已更新')
}
/** 审核弹窗才准备发货草稿，生成或修改草稿本身不会建手工单。 */
export function getReshipReviewDraft(record: AfterSaleRecord): 手工订单草稿 {
  if (record.reshipDraft) return snapshot(record.reshipDraft)
  const draft = 创建手工订单草稿()
  const source = currentSource(record)
  const order = source && resolveReturnOrder(source, 共享订单.value)
  draft.scenario = '售后补寄'
  draft.originalOrderNo = record.systemOrderNo || ''
  draft.storeId = order?.storeId || ''
  draft.reason = record.note?.trim() || record.items[0]?.reason || ''
  draft.items = record.items.map(i => ({ systemSku: i.sku || '', quantity: i.quantity }))
  if (!order || source?.detail?.contentOnHold) return draft
  // 屏蔽脱敏值，只带实际关联原单可用字段，不以买家默认地址或卖家退货地址补空。
  for (const [key, value] of Object.entries(order.address)) {
    if (typeof value === 'string' && !/\*|•/.test(value)) Object.assign(draft.address, { [key]: value })
  }
  const lines = new Set(record.items.map(i => i.lineId))
  const actualRoutes = order.fulfillmentOrders.filter(f => f.isActive && f.items?.some(i => i.orderNo === order.systemOrderNo && lines.has(i.externalLineId)))
  const sourceRoute = order.fulfillmentOrders.length ? (actualRoutes.length === 1 ? actualRoutes[0]?.route : undefined) : order.defaultRoute
  if (sourceRoute) {
    const route = 查找所选仓库物流(手工订单路由.value, 路由仓库键(sourceRoute), sourceRoute.shippingChannelCode)
    if (route && (!sourceRoute.shippingChannelId || sourceRoute.shippingChannelId === route.shippingChannelId)) {
      draft.warehouse = 路由仓库键(route)
      draft.channel = route.shippingChannelCode
    }
  }
  return draft
}
export function approveReship(no: string, actor = activeAfterSaleActor.value, reviewDraft?: 手工订单草稿): AfterSaleResult {
  const record = afterSaleRecords.value.find(r => r.no === no)
  if (!record || !canViewAfterSale(record, actor)) return { ok: false, message: '售后单不存在或不在当前店铺权限范围' }
  if (record.kind !== '重发') return { ok: false, message: '该处理方式无需审核' }
  if (!actor.canApprove) return { ok: false, message: '当前人员没有重发审核权限' }
  if (record.reshipDraft && !canViewAfterSale({ shopId: record.reshipDraft.storeId }, actor)) return { ok: false, message: '发货店铺不在当前审核权限范围' }
  if (record.approval === '已审核') return { ok: true, message: '该售后单已审核，已返回原手工订单', record }
  const problems = validateAfterSale(record, record.no)
  if (problems.length) return { ok: false, message: problems.join('；'), record }
  // 手工订单服务同一稳定业务键只创建一次；先取得真实本地单号，再写审核事实。
  const draft = { ...snapshot(reviewDraft ?? getReshipReviewDraft(record)), requestId: 'after-sale:' + record.no }
  if (draft.storeId && !canViewAfterSale({ shopId: draft.storeId }, actor)) return { ok: false, message: '发货店铺不在当前审核权限范围', record }
  if (draft.scenario !== '售后补寄' || draft.originalOrderNo !== record.systemOrderNo || draft.items.length !== record.items.length ||
      draft.items.some((item, index) => item.systemSku !== record.items[index]?.sku || item.quantity !== record.items[index]?.quantity)) return { ok: false, message: '手工订单的原单、商品和数量须与本次重发一致', record }
  if (Object.values(draft.address).some(value => typeof value === 'string' && /\*|•/.test(value))) return { ok: false, message: '收件资料含脱敏值，请核实后补齐', record }
  const errors = 校验手工订单(draft)
  if (errors.length) return { ok: false, message: errors.join('；'), record }
  const order = 创建手工订单(draft, record.no)
  if (!order.成功 || !order.订单) {
    addLog(record, actor.name, '审核重发', '手工订单未创建成功，请核实后再办理', '失败')
    return { ok: false, message: order.信息, record }
  }
  Object.assign(record, { approval: '已审核', reviewedBy: actor.name, reviewedAt: new Date().toISOString(),
    reshipDraft: draft, reshipRoute: order.订单.defaultRoute && { ...order.订单.defaultRoute }, manualOrderNo: order.订单.systemOrderNo, executionResult: '已创建手工订单' })
  addLog(record, actor.name, '审核重发', `审核状态：待审核 → 已审核；关联手工订单：${record.manualOrderNo}；OMS 待审核，尚未发货`, '成功', record.reviewedAt)
  return { ok: true, message: '重发审核通过，手工订单已进入待审核', record }
}
