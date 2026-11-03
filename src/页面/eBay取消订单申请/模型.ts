import { 命中字段搜索, 读取排序时刻, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { eBay查询日期, 获取显示时区, 转换eBay时间 } from '@/页面/eBay订单/时间工具'
import { cancelReasonLabel } from './原因映射'

export type CancelAction = 'approve' | 'reject'
// 内部提交门禁，不作为平台处理状态或业务列展示。
export type Submission = 'none' | 'submitted' | 'confirmed' | 'failed' | 'unknown'
export interface CancelOutboundContext {
  /** 已关联仓单的稳定内部身份，不能用可空的三方仓单号代替。 */
  outboundId?: string
  no: string; externalNo: string | null; status: string | null
  warehouse: string; account: string; channel: string | null; channelCode: string | null
  tracking: string | null; shippedAt: string | null
}
export interface CancelActivity {
  activityParty: string; activityType: string; actionDate: string
  stateFrom?: string; stateTo?: string
}
export interface CancelRecord {
  cancelId: string; shopId: string; shop: string; site: string; marketplaceId: string
  orderId: string; buyer: string; requestor: 'BUYER' | 'SELLER'
  products: { title: string; sku: string; quantity: number }[]
  /** reason仅兼容既有会话；页面统一按来源reasonCode实时翻译。 */
  reason: string; reasonCode: string; createdAt: string; dueAt?: string; lastSyncedAt: string
  cancelState: string; cancelStatus: string; currency: string; amount: number
  refundStatus?: string; actualRefundAmount?: number; actualRefundCurrency?: string; refundIssuedAt?: string
  activityHistories: CancelActivity[]
  omsStatus: string; warehouse: string; shipped: number | null; activeWarehouse: boolean | null
  systemOrderNo?: string; platformOrderStatus?: string; orderChannel?: string
  outbounds?: CancelOutboundContext[] | null
  eligibility: boolean | null; tracking?: string; shippedAt?: string
  submission: Submission; submissionNote: string; notes: string[]; logs: { at: string; text: string }[]
  pendingSnapshot?: { state: string; status: string; refundStatus?: string; activityHistories: CancelActivity[] }
}
export const statusNames: Record<string, string> = {
  CANCEL_REQUESTED: '已申请取消', CANCEL_PENDING: '取消处理中', CANCEL_REJECTED: '已拒绝取消',
  CANCEL_CLOSED_WITH_REFUND: '已关闭 · 已退款', CANCEL_CLOSED_NO_REFUND: '已关闭 · 未发生退款',
  CANCEL_CLOSED_UNKNOWN_REFUND: '已关闭 · 退款结果待核实', CANCEL_CLOSED_FOR_COMMITMENT: '未付款取消申请已关闭', INVALID: '申请无效',
}
export const stateNames: Record<string, string> = {
  INITIAL: '申请已发起', APPROVAL_PENDING: '待卖家响应', REFUND_PENDING: '待退款',
  REFUND_INITIATED: '退款已发起', REFUND_FAILED_RETRY: '退款失败，平台将重试',
  CONFIRM_REFUND_PENDING: '待买家确认退款', CLOSED: '已关闭', OTHER: '阶段待核实',
}
export const refundStatusNames: Record<string, string> = {
  REQUESTED: '已请求退款', PENDING: '退款处理中', SUCCESS: '退款成功',
  FAILED: '退款失败', SKIPPED: '未执行退款', UNKNOWN: '退款状态未知',
}
export const partyNames: Record<string, string> = { BUYER: '买家', SELLER: '卖家', UNKNOWN: '未明确' }
export const activityNames: Record<string, string> = {
  BUYER_CONFIRM_REFUND: '买家确认收到退款',
  BUYER_CREATE_CANCEL: '买家发起取消', SELLER_CREATE_CANCEL: '卖家发起取消',
  SELLER_APPROVE: '卖家同意取消', SELLER_REJECT: '卖家拒绝取消',
  SYSTEM_CHARGEBACK_OPENED: '信用卡拒付已开启', SYSTEM_CREATE_CANCEL: '系统创建取消申请',
  SYSTEM_NOTIFY_PAYOUT_STATUS: '系统收到退款状态更新', SYSTEM_NOTIFYPP_REFUND: '旧版退款通知（已废弃）',
  SYSTEM_PAYOUT: '买家收到平台退款', SYSTEM_REJECT: '系统因已发货拒绝取消',
  SYSTEM_REFUND: '系统发起退款', SYSTEM_NOTIFY_REFUND_STATUS: '系统通知退款状态',
  SYSTEM_TIMEOUT_FOR_APPROVAL: '卖家响应期限已过', SYSTEM_TIMEOUT_FOR_CONFIRMATION: '买家确认退款超时',
  SYSTEM_TIMEOUT_FOR_NOTIFY_PAYOUT_STATUS: '平台退款状态通知超时', SYSTEM_TIMEOUT_FOR_NOTIFY_REFUND_STATUS: '退款状态通知超时',
  UNKNOWN: '平台活动未知',
}
const shopIds = ['shop-us', 'shop-demo-2', 'shop-demo-3']
export const shops = ['演示店铺-US', 'DEMO 英国二店', 'DEMO 德国三店']
export const shopOptions = shops.map((label, index) => ({ value: shopIds[index]!, label }))
export const cancelKey = (r: Pick<CancelRecord, 'shopId' | 'cancelId'>): string => JSON.stringify([r.shopId, r.cancelId])
export const cancelTimeZone = (r: Pick<CancelRecord, 'marketplaceId'>): string | undefined => 获取显示时区('site', [r.marketplaceId])
export const formatCancelTime = (value: string | null | undefined, r: Pick<CancelRecord, 'marketplaceId'>): string => 转换eBay时间(value ?? undefined, cancelTimeZone(r))
export interface CancelFilters { shops: string[]; states: string[]; requestor: string; query: string; field: string; mode: 搜索模式; dates: string[] | null }
export const createFilters = (): CancelFilters => ({ shops: [], states: [], requestor: '', query: '', field: 'cancelId', mode: 'contains', dates: null })
export function createCancellations(): CancelRecord[] {
  const products = [ ['竹制厨房收纳架', 'HOME-DEMO-01'], ['轻量户外折叠椅', 'OUTDOOR-DEMO-02'], ['宠物慢食碗', 'PET-DEMO-03'], ['汽车后备箱收纳箱', 'AUTO-DEMO-04'], ['桌面阅读灯', 'LIGHT-DEMO-05'], ['瑜伽拉伸带', 'SPORT-DEMO-06'] ]
  return Array.from({ length: 16 }, (_, i) => {
    const p = products[i % products.length]!, code = String(i + 1).padStart(4, '0')
    const r: CancelRecord = {
      cancelId: `CXL-DEMO-${code}`, shopId: shopIds[i % 3]!, shop: shops[i % 3]!,
      site: ['美国', '英国', '德国'][i % 3]!, marketplaceId: ['EBAY_US', 'EBAY_GB', 'EBAY_DE'][i % 3]!,
      orderId: `EB-DEMO-1029-${code}`, buyer: i === 0 ? 'buyer_demo_01' : i === 3 ? 'buyer_demo_02' : `buyer_demo_${code}`,
      requestor: 'BUYER', products: [{ title: p[0]!, sku: p[1]!, quantity: i % 3 + 1 }],
      reason: cancelReasonLabel('ORDER_MISTAKE'), reasonCode: 'ORDER_MISTAKE', createdAt: `2026-10-${String(29 - i % 8).padStart(2, '0')}T01:30:00Z`,
      dueAt: '2026-10-30T01:30:00Z', lastSyncedAt: '2026-10-29T01:35:00Z',
      cancelState: 'APPROVAL_PENDING', cancelStatus: 'CANCEL_REQUESTED',
      currency: ['USD', 'GBP', 'EUR'][i % 3]!, amount: Number((24.9 + i * 4.2).toFixed(2)), activityHistories: [],
      omsStatus: '异常', warehouse: ['谷仓 · 美国西仓', '万邑通 · 英国仓', '4PX · 德国仓'][i % 3]!,
      shipped: 0, activeWarehouse: false, eligibility: true, submission: 'none', submissionNote: '', notes: [], logs: [],
      systemOrderNo: `OMS-DEMO-CXL-${code}`, platformOrderStatus: 'NOT_STARTED',
      orderChannel: ['美国标准配送', '英国标准配送', '德国标准配送'][i % 3]!, outbounds: [],
    }
    const after = (minutes: number) => new Date(Date.parse(r.createdAt) + minutes * 60_000).toISOString()
    r.activityHistories = [{ activityParty: 'BUYER', activityType: 'BUYER_CREATE_CANCEL', actionDate: r.createdAt, stateFrom: 'INITIAL', stateTo: 'APPROVAL_PENDING' }]
    if (i === 0) r.outbounds = [{ outboundId: 'shared-CK-DEMO-CXL-0001', no: 'CK-DEMO-CXL-0001', externalNo: 'GC-DEMO-CXL-0001', status: '已取消', warehouse: '谷仓 · 美国西仓', account: 'DEMO 谷仓账号', channel: '美国标准配送', channelCode: 'DEMO-US-STD', tracking: null, shippedAt: null }]
    if (i === 1) {
      r.activeWarehouse = true; r.submissionNote = '仓库仍在执行，请先核实截单结果。'
      r.outbounds = [
        { outboundId: 'shared-CK-DEMO-CXL-0002-A', no: 'CK-DEMO-CXL-0002-A', externalNo: 'WINIT-DEMO-CXL-0002-A', status: '待出库', warehouse: '万邑通 · 英国仓', account: 'DEMO 万邑通账号', channel: '英国标准配送', channelCode: 'DEMO-UK-STD', tracking: null, shippedAt: null },
        { outboundId: 'shared-CK-DEMO-CXL-0002-B', no: 'CK-DEMO-CXL-0002-B', externalNo: null, status: '下单中', warehouse: '4PX · 英国仓', account: 'DEMO 4PX账号', channel: '英国经济配送', channelCode: 'DEMO-UK-ECO', tracking: null, shippedAt: null },
      ]
    }
    if (i === 2) {
      r.shipped = 1; r.omsStatus = '已发货'; r.eligibility = false; r.tracking = 'TRACK-DEMO-0003'; r.shippedAt = '2026-10-27T06:20:00Z'; r.platformOrderStatus = 'IN_PROGRESS'
      r.outbounds = [{ outboundId: 'shared-CK-DEMO-CXL-0003', no: 'CK-DEMO-CXL-0003', externalNo: '4PX-DEMO-CXL-0003', status: '已出库', warehouse: '4PX · 德国仓', account: 'DEMO 4PX账号', channel: '德国标准配送', channelCode: 'DEMO-DE-STD', tracking: r.tracking, shippedAt: r.shippedAt }]
    }
    if ([3, 4, 10, 11].includes(i)) {
      r.cancelState = 'REFUND_PENDING'; r.cancelStatus = 'CANCEL_PENDING'; r.submission = 'confirmed'; r.refundStatus = 'PENDING'
      r.activityHistories.push(
        { activityParty: 'SELLER', activityType: 'SELLER_APPROVE', actionDate: after(30), stateFrom: 'APPROVAL_PENDING', stateTo: 'REFUND_PENDING' },
        { activityParty: 'UNKNOWN', activityType: 'SYSTEM_REFUND', actionDate: after(31), stateFrom: 'REFUND_PENDING', stateTo: 'REFUND_PENDING' },
      )
    }
    if (i === 4 || i === 11) {
      r.cancelState = 'CLOSED'; r.cancelStatus = 'CANCEL_CLOSED_WITH_REFUND'; r.refundStatus = 'SUCCESS'; r.actualRefundAmount = r.amount; r.actualRefundCurrency = r.currency; r.refundIssuedAt = after(35); r.dueAt = undefined
      r.activityHistories.push({ activityParty: 'UNKNOWN', activityType: 'SYSTEM_NOTIFY_REFUND_STATUS', actionDate: after(35), stateFrom: 'REFUND_PENDING', stateTo: 'CLOSED' })
    }
    if (i === 5) {
      r.cancelState = 'CLOSED'; r.cancelStatus = 'CANCEL_REJECTED'; r.submission = 'confirmed'; r.dueAt = undefined
      r.activityHistories.push({ activityParty: 'SELLER', activityType: 'SELLER_REJECT', actionDate: after(30), stateFrom: 'APPROVAL_PENDING', stateTo: 'CLOSED' })
    }
    if (i === 6) { r.submission = 'unknown'; r.submissionNote = '上次同意取消请求超时，平台结果尚未确认，请先刷新数据。' }
    if (i === 7) {
      r.eligibility = null; r.shipped = null; r.activeWarehouse = null; r.submissionNote = '平台资格与仓库执行情况待核实。'
      r.systemOrderNo = undefined; r.platformOrderStatus = undefined; r.orderChannel = undefined; r.outbounds = null
    }
    if (i === 8) {
      r.requestor = 'SELLER'; r.cancelState = 'CLOSED'; r.cancelStatus = 'CANCEL_CLOSED_NO_REFUND'; r.reasonCode = 'OUT_OF_STOCK_OR_CANNOT_FULFILL'; r.reason = cancelReasonLabel(r.reasonCode); r.submission = 'confirmed'; r.dueAt = undefined
      r.activityHistories = [{ activityParty: 'SELLER', activityType: 'SELLER_CREATE_CANCEL', actionDate: r.createdAt, stateFrom: 'INITIAL', stateTo: 'CLOSED' }]
    }
    if (i === 9) { r.submission = 'failed'; r.submissionNote = '上次操作已明确未生效，请核对平台当前状态后处理。' }
    if (i === 12) { r.cancelState = 'CLOSED'; r.cancelStatus = 'CANCEL_CLOSED_UNKNOWN_REFUND'; r.refundStatus = 'UNKNOWN'; r.dueAt = undefined; r.activityHistories = [] }
    if (i === 13) { r.cancelState = 'OTHER'; r.cancelStatus = 'UNKNOWN_SOURCE_VALUE'; r.eligibility = null; r.submissionNote = '尚未识别平台状态，请刷新数据或核对平台记录。'; r.activityHistories = [] }
    if (i === 15) r.products.push({ title: '可折叠收纳盒', sku: 'HOME-DEMO-EXTRA', quantity: 2 })
    return r
  })
}
export function blockedReason(r: CancelRecord, action: CancelAction, now = new Date().toISOString()): string {
  if (r.submission === 'unknown') return '上次操作结果尚未确认，请先刷新数据。'
  if (r.submission === 'submitted') return '本次操作已提交，请先刷新数据确认平台处理结果。'
  if (r.requestor !== 'BUYER') return '这是卖家发起的取消记录，无需批准或拒绝买家申请。'
  if (r.cancelState !== 'APPROVAL_PENDING' || r.cancelStatus !== 'CANCEL_REQUESTED') return '当前平台阶段不支持响应买家取消申请。'
  const due = 读取排序时刻(r.dueAt)
  if (due === undefined) return '平台响应期限尚未确认，请先刷新数据。'
  if (Date.parse(now) > due) return '来源响应期限已过，请先刷新数据并核实平台是否仍允许响应。'
  if (action === 'reject') return ''
  if (r.eligibility !== true) return r.eligibility === false ? '平台当前不允许取消该订单。' : '平台取消资格尚未确认，请先核实。'
  if (r.shipped === null || r.activeWarehouse === null) return '订单或仓库执行情况不完整，请先核实。'
  if (r.shipped > 0) return '订单已有出库事实，不能在此直接同意整单取消。'
  if (r.activeWarehouse) return '仓库仍有未结束的执行，请先确认截单结果。'
  return ''
}
export function inQueue(r: CancelRecord, queue: string): boolean {
  if (queue === 'all') return true
  if (queue === 'pending') return r.cancelState === 'APPROVAL_PENDING'
  if (queue === 'processing') return ['REFUND_PENDING', 'REFUND_INITIATED', 'REFUND_FAILED_RETRY', 'CONFIRM_REFUND_PENDING'].includes(r.cancelState)
  return queue === 'closed' && r.cancelState === 'CLOSED'
}
export function filterCancellations(rows: CancelRecord[], f: CancelFilters): CancelRecord[] {
  return rows.filter(r => {
    const date = f.dates?.length === 2 ? eBay查询日期(r.createdAt, 'site', [r.marketplaceId]) : null
    const dateMatches = !f.dates?.length || Boolean(date && date >= f.dates[0]! && date <= f.dates[1]!)
    return (!f.shops.length || f.shops.includes(r.shopId)) && (!f.states.length || f.states.includes(r.cancelState)) && (!f.requestor || f.requestor === r.requestor) && dateMatches && 命中字段搜索(f.field === 'sku' ? r.products.map(p => p.sku) : f.field === 'orderId' ? r.orderId : f.field === 'buyer' ? r.buyer : r.cancelId, f.query, f.mode)
  })
}
export function submitCancellation(r: CancelRecord, action: CancelAction, note: string, now = new Date().toISOString()): { ok: boolean; message: string } {
  const blocked = blockedReason(r, action, now)
  if (blocked) return { ok: false, message: blocked }
  if (!note.trim() || note.trim().length > 500) return { ok: false, message: '请填写 1～500 字的内部处理说明。' }
  r.submission = 'submitted'; r.submissionNote = `${action === 'approve' ? '同意取消' : '拒绝'}已提交，请刷新数据查看平台处理结果。`
  // 仅本地原型模拟下一次平台读取的快照；提交不直接改写来源状态与历史。
  const histories = r.activityHistories.map(item => ({ ...item }))
  histories.push({ activityParty: 'SELLER', activityType: action === 'approve' ? 'SELLER_APPROVE' : 'SELLER_REJECT', actionDate: now, stateFrom: r.cancelState, stateTo: action === 'approve' ? 'REFUND_PENDING' : 'CLOSED' })
  if (action === 'approve') histories.push({ activityParty: 'UNKNOWN', activityType: 'SYSTEM_REFUND', actionDate: now, stateFrom: 'REFUND_PENDING', stateTo: 'REFUND_PENDING' })
  r.pendingSnapshot = action === 'approve'
    ? { state: 'REFUND_PENDING', status: 'CANCEL_PENDING', refundStatus: 'PENDING', activityHistories: histories }
    : { state: 'CLOSED', status: 'CANCEL_REJECTED', refundStatus: r.refundStatus, activityHistories: histories }
  r.logs.unshift({ at: now, text: `${action === 'approve' ? '同意取消' : '拒绝'}｜客服 DEMO-01｜内部说明：${note.trim()}${action === 'reject' && r.tracking ? `｜随请求提供已有跟踪号 ${r.tracking}` : ''}。已提交，等待刷新平台数据。` })
  return { ok: true, message: '已提交，请刷新数据查看平台处理结果。' }
}
export function syncCancellation(r: CancelRecord, now = new Date().toISOString()): void {
  if (r.pendingSnapshot) {
    r.cancelState = r.pendingSnapshot.state; r.cancelStatus = r.pendingSnapshot.status; r.refundStatus = r.pendingSnapshot.refundStatus
    r.activityHistories = r.pendingSnapshot.activityHistories.map(item => ({ ...item }))
    r.submission = 'confirmed'; r.submissionNote = ''; delete r.pendingSnapshot
  }
  r.lastSyncedAt = now
  r.logs.unshift({ at: now, text: r.submission === 'unknown' ? '已刷新取消申请，尚无足以确认上次操作结果的新证据，继续禁止重复提交。' : '已刷新取消申请信息。' })
}
export function addNote(r: CancelRecord, text: string, now = new Date().toISOString()): boolean {
  if (!text.trim() || text.trim().length > 500) return false
  r.notes.unshift(text.trim()); r.logs.unshift({ at: now, text: `客服 DEMO-01 添加内部备注：${text.trim()}` }); return true
}
