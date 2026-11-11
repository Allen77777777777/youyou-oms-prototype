import type { ActionCode, ActionDraft, DisputeRecord, Money } from './类型'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'

export interface PaymentLine { itemId: string; lineItemId: string }
export interface PaymentReturnAddress {
  fullName: string
  addressLine1: string
  addressLine2?: string
  city: string
  country: string
  county?: string
  stateOrProvince?: string
  postalCode?: string
  primaryPhone: { number: string; countryCode?: string }
}
export interface PaymentRequest {
  key: string
  evidenceId?: string
  type: string
  lines: PaymentLine[]
  requestedAt: string
  dueAt: string
}
export interface PaymentFile {
  name: string
  note: string
  requestKey?: string
  evidenceId?: string
  fileId?: string
  providedAt?: string
  type?: string
  uploadedAt?: string
  size?: number
  content?: File
}
export interface PaymentShipment { carrier: string; tracking: string; lines: PaymentLine[] }
/** 平台证据组自带元数据，不以当前 evidenceRequests 是否仍返回为存在条件。 */
export interface PaymentEvidenceSet {
  id: string
  type: string
  lines: PaymentLine[]
  requestKey?: string
  requestedAt?: string
  dueAt?: string
  providedAt?: string
  files: PaymentFile[]
  shipments: PaymentShipment[]
}
export interface PaymentDetails {
  lines: PaymentLine[]
  requests: PaymentRequest[]
  returnAddress?: PaymentReturnAddress
  buyerReturn?: { onHold?: boolean; note?: string; packages: { carrier: string; tracking: string }[] }
  closedAt?: string
  protectedAmount?: Money
  recoupAmount?: Money
  fees?: Money
  feeCredit?: Money
  donationCredit?: Money
  transactions?: { at: string; reason: string; type: string; amount: Money; originalAmount?: Money; exchangeRate?: string }[]
  deliveryEvidence?: { requestKey: string; carrier: string; tracking: string; lines: PaymentLine[] }[]
  evidenceSets?: PaymentEvidenceSet[]
}
const evidenceLabels: Record<string, string> = {
  PROOF_OF_DELIVERY: '物流跟踪（履约记录）', PROOF_OF_AUTHENTICITY: '商品真伪证明',
  PROOF_OF_ITEM_AS_DESCRIBED: '商品符合描述的证明', PROOF_OF_CREDIT_NOT_DUE: '无需退款的证明',
  PROOF_OF_RETURN_NOT_RECEIVED: '卖家尚未收到退货的证明', PROOF_OF_DELIVERY_AS_FILE: '妥投凭证图片',
  PROOF_OF_DELIVERY_SIGNATURE: '签收凭证', PROOF_OF_PICKUP: '买家自提证明', OPTIONAL_SUPPORTING_DOCUMENTS: '可选补充材料',
}
export const evidenceLabel = (type: string) => evidenceLabels[type] || type || '类型待核实'
export const isPaymentDecision = (code: ActionCode) => ['ACCEPT', 'ACCEPT_RETURN', 'CONTEST'].includes(code)
export const knownPaymentRevision = (revision?: number) => revision !== undefined && Number.isInteger(revision) && revision >= 0
/** 超期未答复也是 sellerResponse 的一个原值，不能据字段非空判为已作答。 */
export function paymentHasAnswered(row: DisputeRecord) {
  const response = (row.payment?.responseCode ?? row.payment?.response ?? '').trim()
  return !!response && response !== 'SELLER_RESPONSE_OVERDUE'
}
export function paymentAvailableActions(row: DisputeRecord): ActionCode[] {
  if (!row.payment || row.pending || row.status !== 'ACTION_NEEDED' || row.owner === '已结束' || paymentHasAnswered(row)) return []
  // 有原始回应码的报文不能用本地动作兜底；缺失真实选项时先核查。
  if (row.payment.availableChoices === undefined && (row.payment.responseCode !== undefined || row.payment.response === 'SELLER_RESPONSE_OVERDUE')) return []
  const choices: Record<string, ActionCode> = { SELLER_ACCEPT: 'ACCEPT', SELLER_ACCEPT_WITH_RETURN: 'ACCEPT_RETURN', SELLER_CONTEST: 'CONTEST' }
  const actions = row.payment.availableChoices === undefined ? row.actions.filter(action => isPaymentDecision(action)) :
    row.payment.availableChoices.flatMap(choice => choices[choice] && row.actions.includes(choices[choice]!) ? [choices[choice]!] : [])
  if (row.actions.includes('EVIDENCE') && actions.includes('CONTEST') && fileRequests(row).length) actions.push('EVIDENCE')
  return [...new Set(actions)]
}
const fileKey = (file: PaymentFile) => JSON.stringify([file.evidenceId || '', file.fileId || '', file.name, file.uploadedAt || file.providedAt || ''])
export function uniquePaymentFiles(files: PaymentFile[]) {
  return [...new Map(files.map(file => [file.evidenceId && file.fileId ? JSON.stringify([file.evidenceId, file.fileId]) : fileKey(file), file])).values()]
}
export function allPaymentFiles(row: DisputeRecord) {
  return uniquePaymentFiles([...(row.payment?.evidence || []), ...(row.payment?.details?.evidenceSets || [])
    .flatMap(set => set.files.map(file => ({ ...file, evidenceId: file.evidenceId || set.id, requestKey: file.requestKey || set.requestKey })))])
}
export function evidenceSetsForRequest(row: DisputeRecord, request: PaymentRequest) {
  return row.payment?.details?.evidenceSets?.filter(set => set.requestKey === request.key ||
    (!!request.evidenceId && set.id === request.evidenceId)) || []
}
export const canAttach = (req: PaymentRequest) => Object.prototype.hasOwnProperty.call(evidenceLabels, req.type) && req.type !== 'PROOF_OF_DELIVERY' &&
  req.lines.length > 0 && req.lines.every(line => line.itemId && line.lineItemId)
export function fileRequests(row: DisputeRecord) {
  const details = row.payment?.details
  return details?.requests.filter(request => canAttach(request) && request.lines.every(line =>
    details.lines.some(orderLine => orderLine.itemId === line.itemId && orderLine.lineItemId === line.lineItemId))) || []
}
export function requestCoverage(row: DisputeRecord, request: PaymentRequest) {
  const requestedAt = 读取排序时刻(request.requestedAt)
  const sets = evidenceSetsForRequest(row, request).filter(set => {
    const providedAt = 读取排序时刻(set.providedAt)
    // 稳定请求身份仍是关联依据；仅两端时刻都可信时，才能排除请求前的旧材料。
    return set.type === request.type && !(requestedAt !== undefined && providedAt !== undefined && providedAt < requestedAt)
  })
  if (request.type !== 'PROOF_OF_DELIVERY') {
    const structuredIds = new Set((row.payment?.details?.evidenceSets || []).map(set => set.id))
    const provided = row.payment?.evidence.some(file => file.requestKey === request.key && file.evidenceId && file.fileId && !structuredIds.has(file.evidenceId))
    if (!provided && sets.length) {
      const covered = request.lines.filter(line => sets.some(set => !!set.id && set.files.some(file => file.fileId) &&
        set.lines.some(entry => entry.itemId === line.itemId && entry.lineItemId === line.lineItemId)))
      if (covered.length) return covered.length === request.lines.length ? '已提供材料' : '仅部分订单行已提供'
    }
    return provided ? '已提供材料' : '尚无对应材料'
  }
  const parcels = [...(row.payment?.details?.deliveryEvidence?.filter(parcel => parcel.requestKey === request.key) || []), ...sets.flatMap(set => set.shipments)]
    .filter(parcel => parcel.carrier && parcel.tracking)
  const covered = request.lines.filter(line => parcels.some(parcel => parcel.lines.some(entry =>
    entry.itemId === line.itemId && entry.lineItemId === line.lineItemId)))
  if (!covered.length) return '尚无对应材料'
  return covered.length === request.lines.length ? '已提供材料' : '仅部分订单行已提供'
}
export function nextPaymentEvidenceDeadline(row: DisputeRecord): string {
  if (row.pending || row.status !== 'ACTION_NEEDED' || row.owner !== '卖家') return ''
  const deadlines = (row.payment?.details?.requests || [])
    .filter(request => request.type !== 'OPTIONAL_SUPPORTING_DOCUMENTS' && requestCoverage(row, request) !== '已提供材料')
    .map(request => ({ value: request.dueAt, instant: 读取排序时刻(request.dueAt) }))
    .filter((entry): entry is { value: string; instant: number } => entry.instant !== undefined)
  return deadlines.sort((a, b) => a.instant - b.instant)[0]?.value || ''
}
const byteLimit = 1_500_000
export function validatePaymentEvidence(row: DisputeRecord, action: 'CONTEST' | 'EVIDENCE', draft: ActionDraft) {
  const payment = row.payment!
  const existing = allPaymentFiles(row)
  const requests = payment.details?.requests || []
  if ((draft.evidenceNote?.length ?? 0) > 1000) return '证据或抗辩说明最多 1000 个字符。'
  if (action === 'CONTEST') {
    if (!requests.length && !existing.some(file => file.fileId && file.evidenceId)) return '尚未取得举证要求，请刷新或到 Seller Hub 核实后办理。'
    for (const request of requests.filter(entry => entry.type !== 'OPTIONAL_SUPPORTING_DOCUMENTS')) {
      if (requestCoverage(row, request) !== '已提供材料') return '请先按本案要求提供' + evidenceLabel(request.type) + '，核对后再正式抗辩。'
    }
    return ''
  }
  const request = fileRequests(row).find(entry => entry.key === draft.evidenceRequest)
  if (!request) return '请选择当前可上传文件的举证要求。'
  const files = draft.evidenceFiles || []
  if (!files.length) return '请选择要准备的证据文件。'
  if (files.some(file => file.name.length > 255 || !/\.(jpe?g|png)$/i.test(file.name) || file.size <= 0 ||
    file.size > byteLimit || (file.type && !['image/jpeg', 'image/png'].includes(file.type)))) return '请选择有效的 JPG、JPEG 或 PNG 文件，每份不超过 1.5 MB，文件名最多 255 个字符。'
  const names = new Set(existing.filter(item => item.requestKey === request.key).map(item => item.name.toLowerCase()))
  for (const file of files) {
    if (names.has(file.name.toLowerCase())) return '该组已包含同名文件，请移除重复文件。'
    names.add(file.name.toLowerCase())
  }
  if (files.length + existing.length > 5) return '该争议已有和新增证据合计最多 5 份。'
  if (existing.some(file => file.size == null)) return '已有文件大小尚未核实，请刷新证据后重试。'
  const total = files.reduce((sum, file) => sum + file.size, 0) + existing.reduce((sum, file) => sum + (file.size || 0), 0)
  return total > byteLimit ? '已有与本次新增文件合计不能超过 1.5 MB。' : ''
}
export function attachPaymentFiles(row: DisputeRecord, draft: ActionDraft, at: string) {
  const evidence = row.payment!.evidence
  const details = row.payment!.details
  const request = details?.requests.find(entry => entry.key === draft.evidenceRequest)
  const sets = details ? (details.evidenceSets ||= []) : []
  let set = sets.find(entry => entry.requestKey === draft.evidenceRequest || (!!request?.evidenceId && entry.id === request.evidenceId))
  const setId = set?.id || request?.evidenceId || evidence.find(item => item.requestKey === draft.evidenceRequest)?.evidenceId || 'DEMO-SET-' + row.revision
  if (!set && request) {
    set = { id: setId, requestKey: request.key, type: request.type, lines: request.lines.map(line => ({ ...line })),
      requestedAt: request.requestedAt || undefined, dueAt: request.dueAt || undefined, providedAt: at, files: [], shipments: [] }
    sets.push(set)
  }
  for (const file of draft.evidenceFiles || []) {
    const provided: PaymentFile = {
      name: file.name, note: draft.evidenceNote?.trim() || '', requestKey: draft.evidenceRequest, evidenceId: setId,
      fileId: 'DEMO-FILE-' + row.revision + '-' + (allPaymentFiles(row).length + 1), providedAt: at, size: file.size, content: file,
      type: file.type || file.name.split('.').pop()?.toUpperCase(), uploadedAt: at,
    }
    evidence.push(provided)
    set?.files.push(provided)
  }
  if (set) set.providedAt = at
}
