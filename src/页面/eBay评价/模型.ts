import { 命中字段搜索, 命中时间范围, 校验字段搜索, 校验时间范围 } from '@/组件/筛选/筛选工具'
import { reviewCommentLabels, reviewHandlingLabels, reviewOwners, reviewPlatformLabels } from './数据'
import { canUseReviewReason, markReviewReasonUsed } from './原因分类模型'
import type {
  BuyerFeedbackRecord, BuyerFeedbackSendSource, ReviewActionResult, ReviewFilters, ReviewHandlingStatus, ReviewRecord,
  ReviewReasonSummary, ReviewShopSummary, ReviewSummary, ReviewTrend,
} from './类型'

export function createReviewFilters(patch: Partial<ReviewFilters> = {}): ReviewFilters {
  return { shopIds: [], commentTypes: [], handlingStatuses: [], owners: [], source: 'all', platformStates: [], replyState: 'all', dateRange: ['2026-09-30', '2026-10-29'], field: 'buyerId', mode: 'contains', query: '', onlyAttention: false, ...patch }
}

/** 改评申请中、拒绝或过期仍保留当前评价效力；REVISED 作为被替代旧记录排除，真实回包需联调。 */
export function isEffectiveReview(record: ReviewRecord): boolean {
  return ['ENTERED', 'REVISION_OPEN', 'REVISION_DECLINED_OR_EXPIRED'].includes(record.platformState)
}
export function isNonPositiveReview(record: ReviewRecord): boolean {
  return record.commentType === 'NEGATIVE' || record.commentType === 'NEUTRAL'
}
/** 业务展示、搜索与导出统一使用此投影；平台隐藏时保留底层原值但不再暴露内容。 */
export function getReviewDisplay(record: ReviewRecord): Pick<ReviewRecord, 'content' | 'translation' | 'reply' | 'followup'> & { hidden: boolean } {
  if (record.platformState === 'HIDDEN') return { hidden: true, content: '该评价内容已被平台隐藏', translation: '', reply: undefined, followup: undefined }
  return { hidden: false, content: record.content, translation: record.translation, reply: record.reply, followup: record.followup }
}
export function reviewDate(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 10) : ''
}
export function formatReviewTime(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ') : '—'
}

const reviewFields = ['id', 'feedbackId', 'buyerId', 'orderNo', 'orderLineItemId', 'sku', 'platformSku', 'listingId', 'itemId', 'title', 'content']
export function filterReviews(records: ReviewRecord[], filters: ReviewFilters): ReviewRecord[] {
  if (!reviewFields.includes(filters.field) || 校验时间范围(filters.dateRange) || 校验字段搜索(filters.query, filters.mode, ['title', 'content'].includes(filters.field) ? 'text' : 'identifier')) return []
  return records.filter(record => {
    if (filters.shopIds.length && !filters.shopIds.includes(record.shopId)) return false
    if (filters.commentTypes.length && !filters.commentTypes.includes(record.commentType)) return false
    if (filters.handlingStatuses.length && !filters.handlingStatuses.includes(record.handlingStatus)) return false
    if (filters.owners.length && !filters.owners.includes(record.owner)) return false
    if (filters.platformStates.length && !filters.platformStates.includes(record.platformState)) return false
    if (filters.source === 'buyer' && record.automated || filters.source === 'automated' && !record.automated) return false
    if (filters.replyState === 'replied' && !record.reply || filters.replyState === 'unreplied' && record.reply) return false
    if (filters.onlyAttention && (!isEffectiveReview(record) || !isNonPositiveReview(record) || record.handlingStatus === 'resolved')) return false
    if (!命中时间范围(record.createdAt, filters.dateRange)) return false
    const field = filters.field === 'feedbackId' ? 'id' : filters.field === 'itemId' ? 'listingId' : filters.field
    // 隐藏记录可以通过ID等元数据定位，但不能通过隐藏正文反查。
    const value = field === 'content' ? getReviewDisplay(record).hidden ? undefined : getReviewDisplay(record).content : record[field as keyof ReviewRecord]
    return 命中字段搜索(typeof value === 'string' ? value : undefined, filters.query, filters.mode, ['title', 'content'].includes(field) ? 'text' : 'identifier')
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
}

export function filterBuyerFeedback(records: BuyerFeedbackRecord[], filters: ReviewFilters, status: 'all' | 'pending' | 'sent' = 'all'): BuyerFeedbackRecord[] {
  const fields = ['id', 'buyerId', 'orderNo', 'orderLineItemId', 'sku', 'title', 'content']
  if (!fields.includes(filters.field) || 校验时间范围(filters.dateRange)) return []
  return records.filter(record => {
    if (filters.shopIds.length && !filters.shopIds.includes(record.shopId)) return false
    if (status !== 'all' && record.status !== status) return false
    if (!命中时间范围(record.completedAt, filters.dateRange)) return false
    const value = filters.field === 'content' ? record.comment?.text : record[filters.field as keyof BuyerFeedbackRecord]
    return 命中字段搜索(typeof value === 'string' ? value : undefined, filters.query, filters.mode, ['title', 'content'].includes(filters.field) ? 'text' : 'identifier')
  }).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || a.id.localeCompare(b.id))
}

export function summarizeReviews(records: ReviewRecord[]): ReviewSummary {
  const effective = records.filter(isEffectiveReview), issues = effective.filter(isNonPositiveReview)
  const positive = effective.filter(record => record.commentType === 'POSITIVE').length
  const neutral = effective.filter(record => record.commentType === 'NEUTRAL').length
  const negative = effective.filter(record => record.commentType === 'NEGATIVE').length
  return {
    total: effective.length, positive, neutral, negative, nonPositive: neutral + negative,
    nonPositiveRate: effective.length ? (neutral + negative) / effective.length * 100 : null,
    pending: issues.filter(record => record.handlingStatus !== 'resolved').length,
    processing: issues.filter(record => record.handlingStatus === 'processing').length,
    resolved: issues.filter(record => record.handlingStatus === 'resolved').length,
    replyCount: effective.filter(record => Boolean(record.reply)).length,
    automated: effective.filter(record => record.automated).length,
  }
}

export function groupReviewTrend(records: ReviewRecord[], dateRange: [string, string] | [] = []): ReviewTrend[] {
  if (校验时间范围(dateRange)) return []
  const effective = records.filter(record => isEffectiveReview(record) && 命中时间范围(record.createdAt, dateRange))
  const groups = new Map<string, ReviewTrend>()
  if (dateRange.length === 2) {
    const start = Date.parse(`${dateRange[0]}T00:00:00+08:00`), end = Date.parse(`${dateRange[1]}T00:00:00+08:00`)
    for (let at = start; at <= end; at += 86_400_000) {
      const date = reviewDate(new Date(at).toISOString())
      groups.set(date, { date, total: 0, positive: 0, neutral: 0, negative: 0 })
    }
  }
  for (const record of effective) {
    const date = reviewDate(record.createdAt)
    if (!date) continue
    const group = groups.get(date) ?? { date, total: 0, positive: 0, neutral: 0, negative: 0 }
    group.total += 1
    if (record.commentType === 'POSITIVE') group.positive += 1
    else if (record.commentType === 'NEUTRAL') group.neutral += 1
    else if (record.commentType === 'NEGATIVE') group.negative += 1
    groups.set(date, group)
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function groupReviewsByShop(records: ReviewRecord[]): ReviewShopSummary[] {
  const groups = new Map<string, ReviewRecord[]>()
  for (const record of records) {
    const group = groups.get(record.shopId) ?? []
    group.push(record)
    groups.set(record.shopId, group)
  }
  return [...groups.entries()].map(([shopId, group]) => ({ shopId, shopName: group[0]!.shopName, ...summarizeReviews(group) }))
    .sort((a, b) => b.nonPositive - a.nonPositive || b.total - a.total || a.shopId.localeCompare(b.shopId))
}

export function groupReviewReasons(records: ReviewRecord[]): ReviewReasonSummary[] {
  const groups = new Map<string, number>()
  for (const record of records.filter(record => isEffectiveReview(record) && isNonPositiveReview(record))) {
    const reason = record.reason || '未分类'
    groups.set(reason, (groups.get(reason) ?? 0) + 1)
  }
  return [...groups.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'zh-CN'))
}

const failure = (message: string): ReviewActionResult => ({ ok: false, message, error: message })
const success = (message: string): ReviewActionResult => ({ ok: true, message })
export function getReplyBlockedReason(record: ReviewRecord): string | undefined {
  if (!isEffectiveReview(record)) return '当前平台评价已失效，不能回复评价'
  if (record.automated) return 'eBay 自动评价不支持回复评价'
  if (record.reply) return '这条评价已回复，不能再次回复、编辑或撤回'
  return undefined
}
export function canReplyToReview(record: ReviewRecord): boolean { return !getReplyBlockedReason(record) }

export function validateReviewText(text: string): string | undefined {
  if (!text.trim()) return '请输入评价内容'
  if (Array.from(text.trim()).length > 500) return '内容最多500个字符'
  if (/<[^>]*>/u.test(text)) return '评价内容不能包含HTML标签'
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text) || /(?:\+\d{1,3}[ -]?)?(?<!\w)(?:\d[ -]?){10,15}(?!\w)/u.test(text)) return '评价内容不能包含邮箱或电话号码等个人信息'
  return undefined
}
function appendLog(record: ReviewRecord, action: string, detail: string, by: string, at: string): void {
  record.logs.push({ id: `${record.id}-log-${record.logs.length + 1}`, at, by, action, detail })
}

export function replyToReview(record: ReviewRecord, text: string, by = '客服01', at = new Date().toISOString()): ReviewActionResult {
  const error = getReplyBlockedReason(record) || validateReviewText(text)
  if (error) return failure(error)
  record.reply = { text: text.trim(), at, by }
  appendLog(record, '回复评价', '已完成本地模拟提交；原评价和客服处理状态保持不变。', by, at)
  return success('回复评价已保存（本地模拟）')
}

export function updateReviewHandling(record: ReviewRecord, patch: { handlingStatus?: ReviewHandlingStatus; owner?: string; reason?: string }, by = '客服01', at = new Date().toISOString()): ReviewActionResult {
  if (patch.handlingStatus !== undefined && !['pending', 'processing', 'resolved'].includes(patch.handlingStatus)) return failure('请选择有效的处理状态')
  if (patch.owner !== undefined && patch.owner !== '' && !reviewOwners.includes(patch.owner)) return failure('请选择有效的负责人')
  if (patch.reason !== undefined && !canUseReviewReason(patch.reason, record.reason)) return failure('请选择已启用的原因分类')
  const changes: string[] = []
  if (patch.handlingStatus !== undefined && patch.handlingStatus !== record.handlingStatus) changes.push(`处理状态：${reviewHandlingLabels[record.handlingStatus]} → ${reviewHandlingLabels[patch.handlingStatus]}`)
  if (patch.owner !== undefined && patch.owner !== record.owner) changes.push(`负责人：${record.owner || '未分配'} → ${patch.owner || '未分配'}`)
  if (patch.reason !== undefined && patch.reason !== record.reason) changes.push(`原因：${record.reason || '未分类'} → ${patch.reason || '未分类'}`)
  if (!changes.length) return success('处理信息没有变化')
  Object.assign(record, patch)
  if (record.reason) markReviewReasonUsed(record.reason)
  appendLog(record, '更新处理信息', changes.join('；'), by, at)
  return success('处理信息已保存')
}

export function addReviewNote(record: ReviewRecord, text: string, by = '客服01', at = new Date().toISOString()): ReviewActionResult {
  if (!text.trim()) return failure('请输入内部备注')
  if (Array.from(text.trim()).length > 1000) return failure('内部备注最多1000个字符')
  record.notes.push({ text: text.trim(), at, by })
  appendLog(record, '添加内部备注', '新增一条内部备注，仅供客服协作。', by, at)
  return success('内部备注已添加')
}

/** 先按交易行取得唯一对象，再验证买家身份；存在冲突时不能拿其中一条兜底。 */
export function getLinkedBuyerFeedback(review: ReviewRecord, records: BuyerFeedbackRecord[]): BuyerFeedbackRecord | undefined {
  if (![review.shopId, review.orderLineItemId, review.buyerId].every(value => typeof value === 'string' && value.trim())) return undefined
  const matches = records.filter(record => record.shopId === review.shopId && record.orderLineItemId === review.orderLineItemId)
  return matches.length === 1 && matches[0]!.buyerId === review.buyerId ? matches[0] : undefined
}
/** 未找到方向独立的好评对象不代表平台资格不通过，也不能从收到的评价凭空创建好评。 */
export function getLinkedBuyerFeedbackStatus(review: ReviewRecord, records: BuyerFeedbackRecord[], at = new Date().toISOString()): {
  record?: BuyerFeedbackRecord; label: string; reason?: string; canLeave: boolean
} {
  const record = getLinkedBuyerFeedback(review, records)
  if (!record) {
    const matches = records.filter(item => item.shopId === review.shopId && item.orderLineItemId === review.orderLineItemId)
    return { label: '暂无好评记录', reason: matches.length > 1 ? '同一交易行的好评记录不唯一，请核查后处理' : '尚无与店铺、交易行和买家准确关联的好评记录', canLeave: false }
  }
  const reason = getBuyerFeedbackBlockedReason(record, at), result = getBuyerFeedbackResult(record)
  return { record, label: result.status === 'succeeded' ? '已给买家好评' : result.status === 'failed' ? '留评失败' : reason ? '不可评价' : '待给好评', reason, canLeave: !reason }
}
export function getBuyerFeedbackMethod(record: BuyerFeedbackRecord): { source: BuyerFeedbackSendSource; label: string; ruleName?: string } {
  const latest = record.attempts?.[record.attempts.length - 1]
  const source = record.sendSource ?? latest?.sendSource ?? 'unknown'
  if (getBuyerFeedbackResult(record).status === 'not_submitted') return { source, label: '—' }
  const labels = { manual: '手动好评', automation: '自动好评', external: '外部好评', unknown: '来源未知' }
  return { source, label: labels[source], ruleName: source === 'automation' ? record.automationRuleName || latest?.automationRuleName || undefined : undefined }
}
export function getBuyerFeedbackResult(record: BuyerFeedbackRecord): {
  status: 'not_submitted' | 'failed' | 'succeeded'; label: string; reason?: string; at?: string
} {
  // 已有平台成功事实优先于历史失败，不把旧失败误作可以再次留评。
  const successAttempt = record.attempts?.slice().reverse().find(item => item.outcome === 'succeeded')
  if (record.status === 'sent' || record.comment || successAttempt) return { status: 'succeeded', label: '留评成功', at: record.comment?.at ?? successAttempt?.at }
  const latest = record.attempts?.[record.attempts.length - 1]
  if (latest?.outcome === 'failed') return { status: 'failed', label: '留评失败', reason: latest.code ? `${latest.code}：${latest.message}` : latest.message, at: latest.at }
  return { status: 'not_submitted', label: '未提交' }
}
export function getBuyerFeedbackBlockedReason(record: BuyerFeedbackRecord, at = new Date().toISOString()): string | undefined {
  if (![record.shopId, record.orderLineItemId, record.buyerId].every(value => typeof value === 'string' && value.trim())) return '店铺、交易行或买家身份未确认，暂不能留评'
  if (record.status === 'sent' || record.comment) return '该交易已经给买家留评，不能重复提交'
  if (record.attempts?.some(item => item.outcome === 'succeeded')) return '已存在成功留评记录，请先核对平台结果，不能重复提交'
  if (!record.eligible) return record.ineligibleReason || '当前交易未通过平台留评资格校验'
  const completedAt = Date.parse(record.completedAt), now = Date.parse(at)
  if (!Number.isFinite(completedAt) || !Number.isFinite(now) || now < completedAt) return '交易完成时间尚未确认，暂不能留评'
  if (now - completedAt > 90 * 86_400_000) return '交易完成已超过90天，当前不可留评'
  return undefined
}
export function canLeaveBuyerFeedback(record: BuyerFeedbackRecord, at = new Date().toISOString()): boolean { return !getBuyerFeedbackBlockedReason(record, at) }
export function leaveBuyerFeedback(record: BuyerFeedbackRecord, text: string, by = '客服01', at = new Date().toISOString(), simulation?: 'success' | 'failure'): ReviewActionResult {
  const error = getBuyerFeedbackBlockedReason(record, at) || validateReviewText(text)
  if (error) return failure(error)
  const simulateFailure = simulation === 'failure' || (simulation === undefined && record.simulateFailureOnce === true)
  record.simulateFailureOnce = false
  record.sendSource = 'manual'
  record.automationRuleName = undefined
  const attempts = record.attempts ?? (record.attempts = [])
  if (simulateFailure) {
    const message = '平台明确拒绝本次请求（本地模拟），请核对留评内容后再次提交。'
    attempts.push({ id: `buyer-attempt-${record.id}-${attempts.length + 1}`, at, by, text: text.trim(), outcome: 'failed', code: 'DEMO_REQUEST_REJECTED', message, sendSource: 'manual' })
    return failure(message)
  }
  record.comment = { text: text.trim(), at, by }
  record.status = 'sent'
  record.eligible = false
  record.ineligibleReason = '已给买家留评'
  attempts.push({ id: `buyer-attempt-${record.id}-${attempts.length + 1}`, at, by, text: text.trim(), outcome: 'succeeded', message: '给买家留评成功（本地模拟）', sendSource: 'manual' })
  return success('已给买家好评（本地模拟）')
}

/** CSV 所有单元格引号转义；公式起始和控制字符加前缀，防止表格软件执行内容。 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '')
    if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
  }).join(',')).join('\r\n')
}
export function exportReviewsCsv(records: ReviewRecord[]): string {
  return toCsv([
    ['数据性质', '评价ID', '店铺', '买家', '订单号', '订单行ID', 'SKU', '商品', '评价类型', '评价来源', '平台状态', '评价时间（北京时间）', '评价内容', '回复评价', '回复时间（北京时间）', '处理状态', '负责人', '原因分类', '内部备注'],
    ...records.map(record => {
      const display = getReviewDisplay(record)
      return ['虚构评审数据', record.id, record.shopName, record.buyerId, record.orderNo, record.orderLineItemId, record.sku, record.title, reviewCommentLabels[record.commentType], record.automated ? 'eBay自动评价' : '买家评价', reviewPlatformLabels[record.platformState], formatReviewTime(record.createdAt), display.content, display.reply?.text ?? '', display.reply ? formatReviewTime(display.reply.at) : '', reviewHandlingLabels[record.handlingStatus], record.owner, record.reason, record.notes.map(note => `${formatReviewTime(note.at)} ${note.by}：${note.text}`).join('\n')]
    }),
  ])
}
export function exportBuyerFeedbackCsv(records: BuyerFeedbackRecord[]): string {
  return toCsv([
    ['数据性质', '记录ID', '店铺', '买家', '订单号', '订单行ID', 'SKU', '商品', '交易完成时间（北京时间）', '留评状态', '评价类型', '评价内容', '留评时间（北京时间）', '操作人', '好评方式', '自动规则名称', '留评执行结果', '失败原因', '最近尝试时间（北京时间）'],
    ...records.map(record => {
      const result = getBuyerFeedbackResult(record), latest = record.attempts?.[record.attempts.length - 1], method = getBuyerFeedbackMethod(record)
      return ['虚构评审数据', record.id, record.shopName, record.buyerId, record.orderNo, record.orderLineItemId, record.sku, record.title, formatReviewTime(record.completedAt), record.status === 'sent' ? '已留评' : '待留评', record.status === 'sent' ? '好评' : '', record.comment?.text ?? '', record.comment ? formatReviewTime(record.comment.at) : '', record.comment?.by ?? '', method.label, method.ruleName ?? '', result.label, result.reason ?? '', latest ? formatReviewTime(latest.at) : '']
    }),
  ])
}
