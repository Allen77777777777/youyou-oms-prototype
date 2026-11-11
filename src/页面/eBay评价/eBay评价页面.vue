<script setup lang="ts">
import { handlerNames, handlerOptions, handlerFilterOptions } from '@/组件/客服处理人/处理人'
import { getReviewHandlerIds, getBuyerFeedbackHandlerIds, hasManualReviewHandlers, sameReviewHandlers } from './评价处理人'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatDotRound, Download, TrendCharts, QuestionFilled } from '@element-plus/icons-vue'
import { ElButton, ElCheckbox, ElDialog, ElDrawer, ElEmpty, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import { 校验字段搜索, 校验时间范围, type 搜索字段 } from '@/组件/筛选/筛选工具'
import { reviewSession as session } from './会话'
import CustomerServiceLogList from '@/组件/客服日志/日志列表.vue'
import { addReviewNote, canLeaveBuyerFeedback, canReplyToReview, createReviewFilters, exportBuyerFeedbackCsv, exportReviewsCsv, filterBuyerFeedback, filterReviews, formatReviewTime, getBuyerFeedbackBlockedReason, getBuyerFeedbackResult, getLinkedBuyerFeedback, getReviewDisplay, getReviewOperationLogs, isEffectiveReview, leaveBuyerFeedback, replyToReview, updateReviewHandling } from './模型'
import { getAvailableFeedbackTemplates, useFeedbackTemplate } from '../消息模板管理/评价模板模型'
import { getBuyerFeedbackMethod, getLinkedBuyerFeedbackStatus } from './模型'
import { getReviewReasonOptions } from './原因分类模型'
import ReasonManager from './原因分类管理.vue'
import BuyerFeedbackSummary from './买家好评记录.vue'
import type { BuyerFeedbackRecord, ReviewCommentType, ReviewFilters, ReviewHandlingStatus, ReviewRecord } from './类型'
import { reviewAnnotation as annotation } from './标注'
import { mailSession } from '../eBay站内信/会话'
import ContactBuyer from './联系买家.vue'
import AwaitingBuyerReviews from './未收到买家评价.vue'
import TicketSourceActions from '@/页面/工单管理/来源工单操作.vue'
import { resetAwaitingReviewView, reviewViewSession, type ReviewDirection } from './评价视图会话'
import { getReviewContactBlockedReason } from './联系买家模型'
import './评价样式.css'

const route = useRoute(), router = useRouter()
const tab = ref<ReviewDirection>(reviewViewSession.activeTab), queue = ref('all'), page = ref(1), pageSize = ref(20)
watch(tab, value => { reviewViewSession.activeTab = value }, { flush: 'sync' })
const draft = reactive(createReviewFilters()), applied = reactive(createReviewFilters())
const effective = ref(false), appliedEffective = ref(false), error = ref(''), selected = ref<string[]>([])
const table = ref<{ clearSelection(): void }>()
const fields: 搜索字段[] = [{ value: 'orderNo', label: '平台订单号' }, { value: 'buyerId', label: '买家ID' }, { value: 'sku', label: '系统SKU' }, { value: 'platformSku', label: '平台SKU' }, { value: 'listingId', label: 'Item ID' }, { value: 'id', label: '评价ID' }, { value: 'content', label: '评价内容', kind: 'text' }]
const givenFields = computed(() => fields.filter(f => ['orderNo', 'buyerId', 'sku'].includes(f.value)))
const shops = computed(() => [...new Map([...session.reviews, ...session.buyerFeedback].map(r => [r.shopId, { value: r.shopId, label: r.shopName }])).values()])
const typeOptions = [{ value: 'POSITIVE', label: '好评' }, { value: 'NEUTRAL', label: '中评' }, { value: 'NEGATIVE', label: '差评' }]
const handlingOptions = [{ value: 'pending', label: '待处理' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已处理' }]
const stateOptions = [{ value: 'ENTERED', label: '有效' }, { value: 'REVISION_OPEN', label: '改评中' }, { value: 'REVISION_DECLINED_OR_EXPIRED', label: '改评拒绝或过期' }, { value: 'WITHDRAWN', label: '已撤回' }, { value: 'HIDDEN', label: '已隐藏' }, { value: 'REVISED', label: '已修改旧记录' }]
const reasonManagerOpen = ref(false)
const reasons = computed(() => getReviewReasonOptions())
const dates = computed({ get: () => draft.dateRange.length ? [...draft.dateRange] : null, set: (value: string[] | null) => { draft.dateRange = value?.length === 2 ? [value[0]!, value[1]!] : [] } })
const typeLabel = (type: string) => typeOptions.find(v => v.value === type)?.label ?? type
function reviewTicketSource(review: ReviewRecord) {
  return { kind: 'review' as const, id: review.id, shopId: review.shopId, shopName: review.shopName, summary: typeLabel(review.commentType) + ' · ' + review.title }
}
const statusLabel = (status: string) => handlingOptions.find(v => v.value === status)?.label ?? status
const stateLabel = (state: string) => stateOptions.find(v => v.value === state)?.label ?? state
const typeTone = (type: string) => type === 'POSITIVE' ? 'success' : type === 'NEUTRAL' ? 'warning' : 'danger'
const formatTime = formatReviewTime
const leaveNow = ref(new Date().toISOString())
const leaveClock = setInterval(() => { leaveNow.value = new Date().toISOString() }, 30_000)
onBeforeUnmount(() => clearInterval(leaveClock))
const canLeave = (record: BuyerFeedbackRecord) => canLeaveBuyerFeedback(record, leaveNow.value)
const leaveBlockReason = (record: BuyerFeedbackRecord) => getBuyerFeedbackBlockedReason(record, leaveNow.value)
const cloneFilters = (f: ReviewFilters) => ({ ...f, shopIds: [...f.shopIds], commentTypes: [...f.commentTypes], handlingStatuses: [...f.handlingStatuses], owners: [...f.owners], platformStates: [...f.platformStates], dateRange: [...f.dateRange] })
function clearSelection() { selected.value = []; table.value?.clearSelection() }
function query() {
  error.value = 校验字段搜索(draft.query, draft.mode, fields.find(f => f.value === draft.field)?.kind) ?? 校验时间范围(draft.dateRange) ?? ''
  if (error.value) return
  appliedBuyerMethod.value = buyerMethod.value; Object.assign(applied, cloneFilters(draft)); appliedEffective.value = effective.value; page.value = 1; clearSelection()
}
function reset() { Object.assign(draft, createReviewFilters()); effective.value = false; buyerMethod.value = 'all'; queue.value = 'all'; query() }
function changeTab(value: ReviewDirection) { contactOpen.value = false; if (value !== tab.value) resetAwaitingReviewView(); tab.value = value; reset() }
function changeQueue(value: string) { queue.value = value; page.value = 1; clearSelection() }
function changeRating(value: string) {
  const types = value ? [value as ReviewCommentType] : []
  draft.commentTypes = [...types]; applied.commentTypes = [...types]
  page.value = 1; clearSelection()
}
const ratingBase = computed(() => filterReviews(session.reviews, { ...applied, commentTypes: [] }).filter(r => !appliedEffective.value || isEffectiveReview(r)))
const ratingActive = (value: string) => value ? applied.commentTypes.length === 1 && applied.commentTypes[0] === value : !applied.commentTypes.length
const linkedBuyer = (r: ReviewRecord) => getLinkedBuyerFeedback(r, session.buyerFeedback)
const linkedBuyerStatus = (r: ReviewRecord) => getLinkedBuyerFeedbackStatus(r, session.buyerFeedback, leaveNow.value)
const latestNote = (r: ReviewRecord) => r.notes[r.notes.length - 1]
const buyerResult = getBuyerFeedbackResult
function openLinkedBuyer(r: ReviewRecord) { const target = linkedBuyer(r); if (target) openLeave(target) }
const buyerQueues = [{ id: 'all', label: '全部' }, { id: 'pending', label: '待好评' }, { id: 'failed', label: '提交失败' }, { id: 'sent', label: '已好评' }]
const buyerMethod = ref('all'), appliedBuyerMethod = ref('all')
const inBuyerQueue = (r: BuyerFeedbackRecord, value: string) => value === 'all' || (value === 'failed' ? buyerResult(r).status === 'failed' : r.status === value)
function onSelection(rows: ReviewRecord[]) { selected.value = rows.map(r => r.id) }
function onPageChange() { clearSelection() }
const base = computed(() => filterReviews(session.reviews, applied).filter(r => !appliedEffective.value || isEffectiveReview(r)))
const replyEligible = canReplyToReview
const needsAttention = (r: ReviewRecord) => isEffectiveReview(r) && r.commentType !== 'POSITIVE' && r.handlingStatus !== 'resolved'
const results = computed(() => base.value.filter(r => queue.value === 'all' || (queue.value === 'attention' ? needsAttention(r) : replyEligible(r))))
const rows = computed(() => results.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const buyerBase = computed(() => filterBuyerFeedback(session.buyerFeedback, applied).filter(r => appliedBuyerMethod.value === 'all' || (buyerResult(r).status !== 'not_submitted' && getBuyerFeedbackMethod(r).source === appliedBuyerMethod.value)))
const buyerResults = computed(() => buyerBase.value.filter(r => inBuyerQueue(r, queue.value)))
const buyerRows = computed(() => buyerResults.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const total = computed(() => tab.value === 'received' ? results.value.length : buyerResults.value.length)
watch(total, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / pageSize.value))) })
watch(pageSize, () => { page.value = 1; clearSelection() })

function applyRoute() {
  if (route.path !== '/oms/ebay-service/reviews') return
  if ('feedbackId' in route.query) {
    tab.value = 'given'; detailKey.value = undefined
    const matches = session.buyerFeedback.filter(row => row.shopId === route.query.shopId && row.id === route.query.feedbackId)
    if (matches.length === 1) { error.value = ''; openLeave(matches[0]!) }
    else { leaveOpen.value = false; error.value = '未找到唯一对应的好评记录，请核对店铺和记录ID' }
    return
  }
  if ('reviewId' in route.query || 'shopId' in route.query) {
    tab.value = 'received'
    const matches = session.reviews.filter(row => row.shopId === route.query.shopId && row.id === route.query.reviewId)
    if (matches.length === 1) { error.value = ''; openDetail(matches[0]!) }
    else { detailKey.value = undefined; error.value = '未找到唯一对应的评价，请核对店铺和评价ID' }
    return
  }
  detailKey.value = undefined
  if (route.query.from !== 'statistics') return
  tab.value = 'received'; queue.value = 'all'; Object.assign(draft, createReviewFilters())
  const text = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : ''
  draft.shopIds = text('shopIds').split(',').filter(Boolean)
  draft.dateRange = text('startDate') && text('endDate') ? [text('startDate'), text('endDate')] : []
  draft.source = ['buyer', 'automated'].includes(text('source')) ? text('source') as 'buyer' | 'automated' : 'all'
  draft.commentTypes = text('commentTypes').split(',').filter(v => typeOptions.some(o => o.value === v)) as ReviewCommentType[]
  draft.handlingStatuses = text('handlingStatuses').split(',').filter(v => handlingOptions.some(o => o.value === v)) as ReviewHandlingStatus[]
  effective.value = text('effective') === '1'; query()
}
function downloadCsv(csv: string, name: string) { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = `${name}-虚构评审数据.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportData() {
  if (tab.value === 'given') downloadCsv(exportBuyerFeedbackCsv(buyerResults.value), 'eBay给买家好评')
  else downloadCsv(exportReviewsCsv(selected.value.length ? results.value.filter(r => selected.value.includes(r.id)) : results.value), 'eBay收到的评价')
}

const detailKey = ref<Pick<ReviewRecord, 'shopId' | 'id'>>(), detailTab = ref<'feedback' | 'order' | 'history'>('feedback')
const detail = computed(() => {
  const key = detailKey.value
  if (!key) return
  const matches = session.reviews.filter(row => row.shopId === key.shopId && row.id === key.id)
  return matches.length === 1 ? matches[0] : undefined
})
const detailDisplay = computed(() => detail.value ? getReviewDisplay(detail.value) : undefined)
const detailOpen = computed({ get: () => !!detail.value, set: (open: boolean) => {
  if (open) return
  detailKey.value = undefined
  if ('reviewId' in route.query) {
    const { shopId, reviewId, ...otherQuery } = route.query
    void router.replace({ path: route.path, query: otherQuery })
  }
} })
const handling = reactive({ handlingStatus: 'pending' as ReviewHandlingStatus, handlerIds: [] as string[], reason: '' }), note = ref(''), detailError = ref('')
let originalHandlerIds: string[] = []
const historicalHandlerIds = computed(() => (detail.value ? getReviewHandlerIds(detail.value) : []).filter(id => !handlerOptions.some(person => person.value === id)))
const detailReasons = computed(() => getReviewReasonOptions(handling.reason))
function openDetail(r: ReviewRecord) { detailKey.value = { shopId: r.shopId, id: r.id }; detailTab.value = 'feedback'; originalHandlerIds = getReviewHandlerIds(r); Object.assign(handling, { handlingStatus: r.handlingStatus, handlerIds: [...originalHandlerIds], reason: r.reason }); note.value = ''; detailError.value = '' }
function restoreDetailHandlers() {
  const record = detail.value
  if (!record) return
  if (!sameReviewHandlers(getReviewHandlerIds(record), originalHandlerIds)) {
    detailError.value = '处理人已变化，请重新打开后核对。'
    return
  }
  const result = updateReviewHandling(record, { handlerIds: null })
  originalHandlerIds = getReviewHandlerIds(record)
  handling.handlerIds = [...originalHandlerIds]
  detailError.value = result.ok ? '' : result.message
  if (result.ok) ElMessage.success('已恢复自动分配')
}
function saveHandling() {
  if (!detail.value) return
  const peopleChanged = !sameReviewHandlers(handling.handlerIds, originalHandlerIds)
  if (peopleChanged && !sameReviewHandlers(getReviewHandlerIds(detail.value), originalHandlerIds)) {
    detailError.value = '处理人已变化，请重新打开后核对。'
    return
  }
  const result = updateReviewHandling(detail.value, {
    handlingStatus: handling.handlingStatus, reason: handling.reason,
    ...(peopleChanged ? { handlerIds: handling.handlerIds } : {}),
  })
  detailError.value = result.ok ? '' : result.message
  if (result.ok) {
    originalHandlerIds = getReviewHandlerIds(detail.value)
    handling.handlerIds = [...originalHandlerIds]
    ElMessage.success(result.message)
  }
}
function saveNote() { if (!detail.value) return; const result = addReviewNote(detail.value, note.value); detailError.value = result.ok ? '' : result.message; if (result.ok) { note.value = ''; ElMessage.success(result.message) } }
const linkedConversation = computed(() => { const r = detail.value; return r?.conversationId && r.orderId ? mailSession.conversations.find(c => c.id === r.conversationId && c.shopId === r.shopId && c.buyerId === r.buyerId && c.association === 'confirmed' && c.relatedOrderIds.includes(r.orderId!)) : undefined })
function openLinkedMail() { const c = linkedConversation.value; if (!c) return; mailSession.activeId = c.id; mailSession.activeSource = 'buyer'; mailSession.folder = c.status === 'ignored' ? 'ignored' : 'inbox'; mailSession.onlyPendingFolders = false; mailSession.listOpen = true; mailSession.readerOpen = true; void router.push('/oms/ebay-service/messages') }

const batchOpen = ref(false), batchIds = ref<string[]>([]), batchStatus = ref<ReviewHandlingStatus>('resolved'), batchPeopleMode = ref('keep'), batchHandlerIds = ref<string[]>([]), batchReason = ref('__keep__')
function openBatch() { batchIds.value = [...selected.value]; batchStatus.value = 'resolved'; batchPeopleMode.value = 'keep'; batchHandlerIds.value = []; batchReason.value = '__keep__'; batchOpen.value = true }
function saveBatch() {
  let count = 0, unchanged = 0, failed = 0
  for (const id of batchIds.value) {
    const r = session.reviews.find(v => v.id === id); if (!r) { failed++; continue }
    const next = { handlingStatus: batchStatus.value,
      ...(batchPeopleMode.value === 'change' ? { handlerIds: batchHandlerIds.value } : batchPeopleMode.value === 'restore' ? { handlerIds: null } : {}),
      ...(batchReason.value !== '__keep__' ? { reason: batchReason.value } : {}),
    }
    const previousLogCount = r.logs.length
    const result = updateReviewHandling(r, next)
    if (!result.ok) failed++
    else if (r.logs.length === previousLogCount) unchanged++
    else count++
  }
  batchOpen.value = false; clearSelection(); ElMessage.success(`已更新 ${count} 条${unchanged ? `，未变更 ${unchanged} 条` : ''}${failed ? `，未更新 ${failed} 条` : ''}`)
}

const contactOpen = ref(false), contactReviewId = ref('')
function contactBuyer(r: ReviewRecord) { contactReviewId.value = r.id; contactOpen.value = true }
const contactBlockedReason = (r: ReviewRecord) => getReviewContactBlockedReason(r.id)

const replyOpen = ref(false), replyId = ref(''), replyError = ref(''), replyIdentity = ref('')
const recordIdentity = (r: ReviewRecord | BuyerFeedbackRecord) => JSON.stringify([r.id, r.shopId, r.buyerId, r.orderLineItemId])
const replyRecord = computed(() => session.reviews.find(r => r.id === replyId.value))
const replyText = ref('')
watch(replyText, () => { replyError.value = '' })
watch(replyOpen, open => { if (!open) { replyText.value = ''; replyError.value = '' } }, { flush: 'sync' })
const replyTemplates = computed(() => getAvailableFeedbackTemplates('review-reply'))
const buyerFeedbackTemplates = computed(() => getAvailableFeedbackTemplates('buyer-positive'))
function useReplyTemplate(id: string) {
  const result = useFeedbackTemplate(id, 'review-reply')
  if (result.error) { replyError.value = result.error; return }
  replyText.value = result.text!; replyError.value = ''
}
function openReply(r: ReviewRecord) { replyId.value = r.id; replyIdentity.value = recordIdentity(r); replyText.value = ''; replyError.value = ''; replyOpen.value = true }
function submitReply() {
  const r = replyRecord.value
  if (!r || session.reviews.filter(item => item.id === replyId.value).length !== 1 || recordIdentity(r) !== replyIdentity.value) { replyError.value = '评价或买家身份已变化，请关闭后重新打开'; return }
  const result = replyToReview(r, replyText.value)
  if (!result.ok) { replyError.value = result.message; return }
  replyOpen.value = false; ElMessage.success('回复评价已保存（本地模拟）')
}

const leaveOpen = ref(false), leaveId = ref(''), leaveShopId = ref(''), leaveText = ref('Thank you for your purchase. A pleasure to do business with!'), leaveError = ref(''), leaveIdentity = ref('')
const leaveRecord = computed(() => session.buyerFeedback.find(r => r.id === leaveId.value && r.shopId === leaveShopId.value))
watch(leaveOpen, open => { if (!open) { leaveText.value = ''; leaveError.value = '' } }, { flush: 'sync' })
function openLeave(r: BuyerFeedbackRecord) { leaveNow.value = new Date().toISOString(); leaveId.value = r.id; leaveShopId.value = r.shopId; leaveIdentity.value = recordIdentity(r); leaveText.value = r.comment?.text ?? r.attempts?.slice(-1)[0]?.text ?? 'Thank you for your purchase. A pleasure to do business with!'; leaveError.value = ''; leaveOpen.value = true }
function submitLeave() {
  leaveNow.value = new Date().toISOString()
  const r = leaveRecord.value
  if (!r || session.buyerFeedback.filter(item => item.id === leaveId.value).length !== 1 || recordIdentity(r) !== leaveIdentity.value) { leaveError.value = '交易或买家身份已变化，请关闭后重新打开'; return }
  const result = leaveBuyerFeedback(r, leaveText.value)
  if (!result.ok) { leaveError.value = result.message; return }
  leaveOpen.value = false; ElMessage.success('给买家的好评已保存（本地模拟）')
}
function useBuyerTemplate(id: string) {
  const result = useFeedbackTemplate(id, 'buyer-positive')
  if (result.error) { leaveError.value = result.error; return }
  leaveText.value = result.text!; leaveError.value = ''
}
const buyerPageActive = useBuyerPageActive()
watch(() => route.fullPath, applyRoute, { immediate: true })
</script>

<template>
  <section class="review-page" v-prototype="annotation('overview', 'eBay评价工作台')">
    <header class="review-topbar">
      <div class="review-tabs" role="tablist" aria-label="评价方向"><button role="tab" :aria-selected="tab === 'received'" :class="{ active: tab === 'received' }" @click="changeTab('received')">收到的评价</button><button role="tab" :aria-selected="tab === 'awaiting'" :class="{ active: tab === 'awaiting' }" @click="changeTab('awaiting')">未收到买家评价</button><button role="tab" :aria-selected="tab === 'given'" :class="{ active: tab === 'given' }" @click="changeTab('given')">给买家好评</button></div>
      <ElButton link type="primary" :icon="TrendCharts" @click="router.push('/oms/ebay-service/review-statistics')">评价统计</ElButton>
    </header>
    <AwaitingBuyerReviews v-if="tab === 'awaiting'" @contact="id => { contactReviewId = id; contactOpen = true }" />
    <template v-else>
    <div class="review-filters" v-prototype="annotation('filters', '评价查询与统计下钻')">
      <MultiFilter v-model="draft.shopIds" :options="shops" placeholder="全部店铺" :width="155" />
      <template v-if="tab === 'received'"><MultiFilter v-model="draft.commentTypes" :options="typeOptions" placeholder="评价类型" :width="120" /><MultiFilter v-model="draft.handlingStatuses" :options="handlingOptions" placeholder="处理状态" :width="120" />
      <ElSelect v-model="draft.source" aria-label="评价来源" style="width:135px"><ElOption value="all" label="全部评价来源" /><ElOption value="buyer" label="买家主动评价" /><ElOption value="automated" label="eBay自动评价" /></ElSelect><MultiFilter v-model="draft.platformStates" :options="stateOptions" placeholder="平台状态" :width="135" />
      <ElSelect v-model="draft.replyState" aria-label="回复评价状态" style="width:130px"><ElOption value="all" label="全部回复状态" /><ElOption value="unreplied" label="未回复" /><ElOption value="replied" label="已回复" /></ElSelect></template>
      <MultiFilter v-model="draft.owners" :options="handlerFilterOptions" placeholder="处理人" :width="120" />
      <ElSelect v-if="tab === 'given'" v-model="buyerMethod" aria-label="好评方式" style="width:145px"><ElOption value="all" label="全部好评方式" /><ElOption value="manual" label="手动好评" /><ElOption value="automation" label="自动好评" /><ElOption value="external" label="外部好评" /><ElOption value="unknown" label="来源未知" /></ElSelect><div class="review-search-row"><span class="review-date-label">{{ tab === 'received' ? '评价时间' : '交易完成时间' }}<ElTooltip content="按北京时间查询，包含起止日期。" placement="top"><ElIcon tabindex="0" aria-label="日期口径"><QuestionFilled /></ElIcon></ElTooltip></span><DateRange v-model="dates" precision="date" :width="250" aria-prefix="评价" /><FieldSearch v-model="draft.query" v-model:field="draft.field" v-model:mode="draft.mode" :fields="tab === 'received' ? fields : givenFields" :width="360" aria-prefix="评价" @search="query" /><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton><ElCheckbox v-if="tab === 'received'" v-model="effective">仅有效评价</ElCheckbox></div>
    </div>
    <p v-if="error" class="review-inline-error" role="alert">{{ error }}</p>
    <div v-if="tab === 'received'" class="review-rating-shortcuts" aria-label="评价类型快捷筛选" v-prototype="annotation('rating', '好中差评分类')">
      <button v-for="item in [{ value: '', label: '全部类型' }, ...typeOptions]" :key="item.value" :class="{ active: ratingActive(item.value) }" :aria-pressed="ratingActive(item.value)" @click="changeRating(item.value)">{{ item.label }} <b>{{ ratingBase.filter(r => !item.value || r.commentType === item.value).length }}</b></button>
    </div>
    <div class="review-tools">
      <div v-if="tab === 'received'" class="review-queues" v-prototype="annotation('queues', '评价待办视图')"><button :class="{ active: queue === 'all' }" @click="changeQueue('all')">全部 <b>{{ base.length }}</b></button><button :class="{ active: queue === 'attention' }" @click="changeQueue('attention')">中差评待处理 <b class="attention-count">{{ base.filter(needsAttention).length }}</b></button><button :class="{ active: queue === 'reply' }" @click="changeQueue('reply')">待回复评价 <b>{{ base.filter(replyEligible).length }}</b></button></div>
      <div v-else class="review-queues" v-prototype="annotation('buyer', '给买家好评')"><button v-for="item in buyerQueues" :key="item.id" :class="{ active: queue === item.id }" @click="changeQueue(item.id)">{{ item.label }} <b>{{ buyerBase.filter(r => inBuyerQueue(r, item.id)).length }}</b></button></div>
      <div class="review-tools-actions"><ElButton v-if="tab === 'received'" :disabled="!selected.length" @click="openBatch">批量处理<span v-if="selected.length">（{{ selected.length }}）</span></ElButton><ElButton v-if="tab === 'received'" v-prototype="annotation('reasons', '原因分类维护')" @click="reasonManagerOpen = true">原因分类</ElButton><ElButton :icon="Download" :disabled="!total" v-prototype="annotation('export', '导出评价')" @click="exportData">导出{{ selected.length && tab === 'received' ? '所选' : '' }}</ElButton></div>
    </div>
    <div class="review-table" v-prototype="annotation('table', '评价列表与来源')">
      <ElTable v-if="tab === 'received'" ref="table" :data="rows" row-key="id" height="100%" stripe @selection-change="onSelection">
        <ElTableColumn type="selection" width="38" />
        <ElTableColumn label="店铺 / 买家" width="150"><template #default="{ row }"><div class="review-shop">{{ row.shopName }}</div><div class="review-secondary"><BuyerLink :shop-id="row.shopId" :buyer-id="row.buyerId" /></div><small class="review-time">{{ formatTime(row.createdAt) }}</small></template></ElTableColumn>
        <ElTableColumn label="商品 / 订单" min-width="135"><template #default="{ row }"><button class="review-link review-product" @click="openDetail(row as ReviewRecord)">{{ row.title }}</button><div class="review-secondary">SKU：{{ row.sku }}</div><button class="review-order-link" @click="openDetail(row as ReviewRecord); detailTab = 'order'">{{ row.orderNo || '未关联订单' }}</button></template></ElTableColumn>
        <ElTableColumn label="买家评价" min-width="175"><template #default="{ row }"><div class="review-rating"><ElTag :type="typeTone(row.commentType)" size="small" effect="light">{{ typeLabel(row.commentType) }}</ElTag><span v-if="row.automated" class="review-auto">eBay自动评价</span><ElTag v-if="row.platformState !== 'ENTERED'" type="info" size="small" effect="plain">{{ stateLabel(row.platformState) }}</ElTag></div><button class="review-comment" :title="getReviewDisplay(row as ReviewRecord).content" @click="openDetail(row as ReviewRecord)">{{ getReviewDisplay(row as ReviewRecord).content }}</button></template></ElTableColumn>
        <ElTableColumn label="卖家回复" min-width="180"><template #default="{ row }">
          <div class="review-seller-reply" v-prototype="annotation('sellerReply', '卖家回复独立列')">
            <template v-if="getReviewDisplay(row as ReviewRecord).reply"><button class="review-comment review-seller-reply-text" :title="getReviewDisplay(row as ReviewRecord).reply?.text" @click="openDetail(row as ReviewRecord)">{{ getReviewDisplay(row as ReviewRecord).reply?.text }}</button><small class="review-time">{{ getReviewDisplay(row as ReviewRecord).reply?.by }} · {{ formatTime(getReviewDisplay(row as ReviewRecord).reply!.at) }}</small></template>
            <span v-else class="review-muted">{{ getReviewDisplay(row as ReviewRecord).hidden ? '内容已隐藏' : row.automated || !isEffectiveReview(row as ReviewRecord) ? '不可回复' : '未回复' }}</span>
          </div>
        </template></ElTableColumn>
        <ElTableColumn label="处理情况" width="88"><template #default="{ row }"><span :class="['review-status', row.handlingStatus]"><i />{{ statusLabel(row.handlingStatus) }}</span><small v-if="row.reason" class="review-reason">{{ row.reason }}</small></template></ElTableColumn>
        <ElTableColumn label="给买家好评" width="110"><template #default="{ row }"><template v-if="linkedBuyer(row as ReviewRecord)"><span :class="['review-leave-result', buyerResult(linkedBuyer(row as ReviewRecord)!).status]">{{ buyerResult(linkedBuyer(row as ReviewRecord)!).label }}</span><ElTooltip v-if="buyerResult(linkedBuyer(row as ReviewRecord)!).reason" :content="buyerResult(linkedBuyer(row as ReviewRecord)!).reason" placement="top"><ElIcon tabindex="0" aria-label="留评失败原因"><QuestionFilled /></ElIcon></ElTooltip><small v-if="linkedBuyer(row as ReviewRecord)!.status !== 'sent' && linkedBuyerStatus(row as ReviewRecord).reason" class="review-block-reason" :title="linkedBuyerStatus(row as ReviewRecord).reason">{{ linkedBuyerStatus(row as ReviewRecord).reason }}</small><ElButton class="review-leave-link" link type="primary" :disabled="linkedBuyer(row as ReviewRecord)!.status !== 'sent' && !linkedBuyerStatus(row as ReviewRecord).canLeave" @click="openLinkedBuyer(row as ReviewRecord)">{{ linkedBuyer(row as ReviewRecord)!.status === 'sent' ? '查看好评' : '给买家好评' }}</ElButton></template><ElTooltip v-else :content="linkedBuyerStatus(row as ReviewRecord).reason" placement="top"><span class="review-muted">暂无好评记录</span></ElTooltip></template></ElTableColumn>
        <ElTableColumn label="处理人" min-width="110"><template #default="{ row }">{{ handlerNames(getReviewHandlerIds(row as ReviewRecord)) }}</template></ElTableColumn>
        <ElTableColumn label="内部备注" min-width="145"><template #default="{ row }"><div v-prototype="annotation('notes', '列表内部备注')"><template v-if="latestNote(row as ReviewRecord)"><button class="review-comment review-note-preview" :title="latestNote(row as ReviewRecord)?.text" @click="openDetail(row as ReviewRecord)">{{ latestNote(row as ReviewRecord)?.text }}</button><small class="review-time">{{ latestNote(row as ReviewRecord)?.by }} · {{ formatTime(latestNote(row as ReviewRecord)!.at) }}</small><button v-if="row.notes.length > 1" class="review-order-link" @click="openDetail(row as ReviewRecord)">全部 {{ row.notes.length }} 条</button></template><span v-else class="review-muted">—</span></div></template></ElTableColumn>
        <ElTableColumn label="操作" width="154" fixed="right"><template #default="{ row }"><div class="review-row-actions"><ElButton link type="primary" @click="openDetail(row as ReviewRecord)">{{ row.commentType === 'POSITIVE' ? '查看' : '跟进' }}</ElButton><ElButton link type="primary" :disabled="!replyEligible(row as ReviewRecord)" @click="openReply(row as ReviewRecord)">回复评价</ElButton><ElTooltip :disabled="!contactBlockedReason(row as ReviewRecord)" :content="contactBlockedReason(row as ReviewRecord)" placement="top"><span><ElButton link type="primary" :disabled="!!contactBlockedReason(row as ReviewRecord)" @click="contactBuyer(row as ReviewRecord)">联系买家</ElButton></span></ElTooltip>
          <TicketSourceActions :source="reviewTicketSource(row as ReviewRecord)" compact />
        </div></template></ElTableColumn>
        <template #empty><ElEmpty description="没有符合条件的评价" :image-size="66" /></template>
      </ElTable>
      <ElTable v-else :data="buyerRows" row-key="id" height="100%" stripe>
        <ElTableColumn label="店铺 / 买家" width="160"><template #default="{ row }"><div class="review-shop">{{ row.shopName }}</div><div class="review-secondary"><BuyerLink :shop-id="row.shopId" :buyer-id="row.buyerId" /></div></template></ElTableColumn>
        <ElTableColumn label="商品 / 订单" min-width="180"><template #default="{ row }"><div class="review-shop">{{ row.title }}</div><div class="review-secondary">{{ row.sku }} · {{ row.orderNo }}</div></template></ElTableColumn>
        <ElTableColumn label="处理人" min-width="110"><template #default="{ row }">{{ handlerNames(getBuyerFeedbackHandlerIds(row as BuyerFeedbackRecord)) }}</template></ElTableColumn>
        <ElTableColumn label="好评方式" width="155"><template #default="{ row }"><span class="review-method">{{ getBuyerFeedbackMethod(row as BuyerFeedbackRecord).label }}</span><small v-if="getBuyerFeedbackMethod(row as BuyerFeedbackRecord).ruleName" class="review-time">{{ getBuyerFeedbackMethod(row as BuyerFeedbackRecord).ruleName }}</small></template></ElTableColumn>
        <ElTableColumn label="交易完成时间" width="160"><template #default="{ row }">{{ formatTime(row.completedAt) }}</template></ElTableColumn>
        <ElTableColumn label="给买家的好评" min-width="230"><template #default="{ row }"><ElTag :type="row.status === 'sent' ? 'success' : canLeave(row as BuyerFeedbackRecord) ? 'warning' : 'info'" size="small">{{ row.status === 'sent' ? '已好评' : canLeave(row as BuyerFeedbackRecord) ? '待好评' : '不可提交' }}</ElTag><p class="review-comment-text">{{ row.comment?.text || leaveBlockReason(row as BuyerFeedbackRecord) || '可以给买家留下好评' }}</p></template></ElTableColumn>
        <ElTableColumn label="提交结果" width="150"><template #default="{ row }"><span :class="['review-leave-result', buyerResult(row as BuyerFeedbackRecord).status]">{{ buyerResult(row as BuyerFeedbackRecord).label }}</span><ElTooltip v-if="buyerResult(row as BuyerFeedbackRecord).reason" :content="buyerResult(row as BuyerFeedbackRecord).reason" placement="top"><ElIcon tabindex="0" aria-label="留评失败原因"><QuestionFilled /></ElIcon></ElTooltip><small v-if="buyerResult(row as BuyerFeedbackRecord).at" class="review-time">{{ formatTime(buyerResult(row as BuyerFeedbackRecord).at!) }}</small></template></ElTableColumn>
        <ElTableColumn label="操作" width="110" fixed="right"><template #default="{ row }"><ElButton link type="primary" :disabled="row.status !== 'sent' && !canLeave(row as BuyerFeedbackRecord)" @click="openLeave(row as BuyerFeedbackRecord)">{{ row.status === 'sent' ? '查看好评' : buyerResult(row as BuyerFeedbackRecord).status === 'failed' ? '重新提交' : '给买家好评' }}</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty description="没有符合条件的交易" :image-size="66" /></template>
      </ElTable>
    </div>
    <footer class="review-pagination"><span>共 {{ total }} 条<span v-if="selected.length"> · 已选 {{ selected.length }} 条</span></span><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10, 20, 50]" :total="total" layout="sizes, prev, pager, next, jumper" size="small" :pager-count="5" @current-change="onPageChange" /></footer>

    <ElDrawer :model-value="buyerPageActive && detailOpen" @update:model-value="value => { if (buyerPageActive) detailOpen = value }" title="评价详情" size="min(1080px, 95vw)" class="review-detail-drawer" :destroy-on-close="buyerPageActive">
      <div v-if="detail && detailDisplay" class="review-detail" v-prototype="annotation('detail', '评价详情与订单上下文')">
        <div class="review-detail-main"><div class="review-detail-heading"><ElTag :type="typeTone(detail.commentType)">{{ typeLabel(detail.commentType) }}</ElTag><div><strong><BuyerLink :shop-id="detail.shopId" :buyer-id="detail.buyerId" /></strong><b class="review-detail-order">平台订单号：{{ detail.orderNo || '未关联订单' }}</b><span>{{ detail.shopName }} · {{ formatTime(detail.createdAt) }}（北京时间）</span></div></div>
          <div class="review-detail-meta"><span>评价ID：{{ detail.id }}</span><span>来源：{{ detail.automated ? 'eBay自动评价' : '买家主动评价' }}</span><span>平台状态：{{ stateLabel(detail.platformState) }}</span></div>
          <div class="review-followup-actions" v-prototype="annotation('followup', '评价跟进与给买家好评')">
            <ElTooltip :disabled="!contactBlockedReason(detail)" :content="contactBlockedReason(detail)" placement="top"><span><ElButton type="primary" :icon="ChatDotRound" :disabled="!!contactBlockedReason(detail)" @click="contactBuyer(detail)">联系买家</ElButton></span></ElTooltip>
            <TicketSourceActions :source="reviewTicketSource(detail)" button-style="plain" />
            <ElButton v-if="linkedBuyer(detail)" :disabled="linkedBuyer(detail)!.status !== 'sent' && !linkedBuyerStatus(detail).canLeave" @click="openLinkedBuyer(detail)">{{ linkedBuyer(detail)!.status === 'sent' ? '查看给买家的好评' : '给买家好评' }}</ElButton>
            <ElButton @click="detailTab = 'order'">订单与售后</ElButton>
          </div>
          <div class="review-detail-tabs" role="tablist" aria-label="评价详情内容" v-prototype="annotation('operationLogs', '评价操作日志')"><button v-for="item in [{ id: 'feedback', label: '评价与回复' }, { id: 'order', label: '订单与物流' }, { id: 'history', label: '操作日志' }]" :key="item.id" :class="{ active: detailTab === item.id }" @click="detailTab = item.id as typeof detailTab">{{ item.label }}</button></div>
          <template v-if="detailTab === 'feedback'"><article class="review-original"><h3>买家给店铺的评价</h3><p>{{ detailDisplay.content }}</p><details v-if="detailDisplay.translation"><summary>翻译参考</summary><p>{{ detailDisplay.translation }}</p></details></article><article v-if="detailDisplay.followup" class="review-followup"><h3>买家追加评论</h3><p>{{ detailDisplay.followup.text }}</p><small>{{ formatTime(detailDisplay.followup.at) }}</small></article><article class="review-public-reply" v-prototype="annotation('reply', '回复评价')"><h3>回复买家评价</h3><template v-if="detailDisplay.reply"><p>{{ detailDisplay.reply.text }}</p><small>{{ detailDisplay.reply.by }} · {{ formatTime(detailDisplay.reply.at) }}</small></template><template v-else><p class="review-muted">{{ detail.automated ? 'eBay自动评价不能回复评价。' : !isEffectiveReview(detail) ? '当前平台状态不支持回复。' : '暂无回复。提交后会公开显示在买家评价下方。' }}</p><ElButton v-if="replyEligible(detail)" type="primary" @click="openReply(detail)">回复评价</ElButton></template></article>
            <article class="review-buyer-detail" v-prototype="annotation('buyerRecord', '详情给买家好评记录')"><div class="review-section-heading"><h3>给买家好评</h3><ElTag type="success" size="small" effect="plain">卖家 → 买家</ElTag></div><p class="review-direction-help">显示在买家的信用评价档案中，与上方回复分别记录。</p><BuyerFeedbackSummary :record="linkedBuyer(detail)" :blocked-reason="linkedBuyer(detail)?.status !== 'sent' ? linkedBuyerStatus(detail).reason : undefined" /><ElButton v-if="linkedBuyer(detail) && canLeave(linkedBuyer(detail)!)" type="success" plain @click="openLinkedBuyer(detail)">给买家好评</ElButton></article>
            <div class="review-platform-actions" v-prototype="annotation('revision', '平台改评与申诉入口')"><h3>平台跟进</h3><p>{{ detail.eligibleForRevision ? '平台资料显示可申请改评，具体资格和额度以 eBay 页面为准。' : '当前未取得可申请改评的资格，请在 eBay 核查。' }}</p><a href="https://www.ebay.com/help/selling/leaving-feedback-buyers/viewing-responding-feedback-buyers?id=4102" target="_blank" rel="noopener noreferrer">前往 eBay 查看改评与回复规则 ↗</a><a href="https://www.ebay.com/sellerhelp/feedback" target="_blank" rel="noopener noreferrer">前往 Seller Help 申请评价审查 ↗</a></div>
          </template>
          <template v-else-if="detailTab === 'order'"><section class="review-context-block"><h3>关联交易</h3><dl><dt>平台订单号</dt><dd>{{ detail.orderNo || '未关联' }}</dd><dt>订单行标识</dt><dd>{{ detail.orderLineItemId }}</dd><dt>商品</dt><dd>{{ detail.title }}</dd><dt>系统 SKU</dt><dd>{{ detail.sku }}</dd><dt>平台 SKU</dt><dd>{{ detail.platformSku }}</dd><dt>Item ID</dt><dd>{{ detail.listingId }}</dd></dl></section><section class="review-context-block"><h3>履约与物流</h3><dl><dt>发货仓库</dt><dd>{{ detail.logistics.warehouse || '—' }}</dd><dt>物流渠道</dt><dd>{{ detail.logistics.channel || '—' }}</dd><dt>跟踪号</dt><dd>{{ detail.logistics.trackingNumber || '—' }}</dd><dt>物流状态</dt><dd>{{ detail.logistics.status || '暂无资料' }}</dd></dl></section><section class="review-context-block"><h3>售后与沟通</h3><p>{{ detail.afterSalesSummary }}</p><ElButton :icon="ChatDotRound" :disabled="!linkedConversation" @click="openLinkedMail">打开关联站内信</ElButton><p v-if="!linkedConversation" class="review-muted">暂无准确关联的站内信会话</p></section></template>
          <template v-else><CustomerServiceLogList :key="JSON.stringify([detail.shopId, detail.id])" :entries="getReviewOperationLogs(detail)" :show-heading="false" :collapsed="false" :format-time="formatTime" /></template>
        </div>
        <aside class="review-handling" v-prototype="annotation('handling', '客服内部处理')"><h3>客服跟进</h3><label>处理状态<ElSelect v-model="handling.handlingStatus" aria-label="详情处理状态"><ElOption v-for="option in handlingOptions" :key="option.value" :value="option.value" :label="option.label" /></ElSelect></label><label>处理人<ElSelect v-model="handling.handlerIds" multiple clearable placeholder="未分配" aria-label="详情处理人"><ElOption v-for="option in handlerOptions" :key="option.value" :value="option.value" :label="option.label" /><ElOption v-for="id in historicalHandlerIds" :key="id" :value="id" :label="handlerNames([id])" disabled /></ElSelect></label><ElButton link type="primary" :disabled="!hasManualReviewHandlers(detail)" @click="restoreDetailHandlers">恢复自动分配</ElButton><label>原因分类<ElSelect v-model="handling.reason" aria-label="详情原因分类" clearable placeholder="请选择原因"><ElOption v-for="reason in detailReasons" :key="reason.value" :value="reason.value" :label="reason.label" :disabled="reason.disabled" /></ElSelect></label><ElButton type="primary" plain @click="saveHandling">保存处理信息</ElButton><div class="review-note-editor"><h3>内部备注</h3><ElInput v-model="note" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="记录沟通进展，仅内部可见" aria-label="新增内部备注" /><ElButton :disabled="!note.trim()" @click="saveNote">添加备注</ElButton></div><p v-if="detailError" class="review-inline-error" role="alert">{{ detailError }}</p><div class="review-notes"><article v-for="(item, i) in [...detail.notes].reverse()" :key="`${item.at}-${i}`"><p>{{ item.text }}</p><small>{{ item.by }} · {{ formatTime(item.at) }}</small></article><span v-if="!detail.notes.length" class="review-muted">暂无内部备注</span></div></aside>
      </div>
    </ElDrawer>

    <ElDialog :model-value="buyerPageActive && replyOpen" @update:model-value="value => { if (buyerPageActive) replyOpen = value }" title="回复评价" width="620px" align-center :close-on-click-modal="false">
      <div v-if="replyRecord" class="review-compose" v-prototype="annotation('reply', '回复评价编辑与提交')">
        <div class="review-direction-card reply"><span>回复买家评价</span><strong>在买家评价下方补充你的回应</strong><small>这条回应会随原评价公开展示。</small></div><div class="review-compose-recipient"><BuyerLink :shop-id="replyRecord.shopId" :buyer-id="replyRecord.buyerId" /><small>平台订单号：{{ replyRecord.orderNo }} · {{ replyRecord.shopName }}</small></div>
        <blockquote>{{ getReviewDisplay(replyRecord).content }}</blockquote>
        <p v-if="getReviewDisplay(replyRecord).hidden" class="review-action-notice">评价已被平台隐藏，无法继续回复。</p>
        <template v-else><ElSelect model-value="" placeholder="选择评价回复模板" aria-label="评价回复模板" no-data-text="暂无已启用的回复评价模板" @change="value => useReplyTemplate(String(value))"><ElOption v-for="item in replyTemplates" :key="item.id" :label="item.name" :value="item.id" /></ElSelect><ElInput v-model="replyText" type="textarea" :rows="6" maxlength="500" show-word-limit placeholder="输入评价回复内容" aria-label="回复评价内容" /></template>
        <p class="review-action-notice">回复会公开显示在买家评价下方，仅可提交一次，提交后无法编辑或撤回。</p>
      </div>
      <p v-if="replyError" class="review-inline-error" role="alert">{{ replyError }}</p>
      <template #footer><ElButton @click="replyOpen = false">关闭</ElButton><ElButton type="primary" :disabled="!replyRecord || !replyEligible(replyRecord)" @click="submitReply">提交回复</ElButton></template>
    </ElDialog>
    <ElDialog :model-value="buyerPageActive && batchOpen" @update:model-value="value => { if (buyerPageActive) batchOpen = value }" title="批量更新内部处理" width="460px" align-center><div class="review-batch-form"><p>将更新已选的 <strong>{{ batchIds.length }}</strong> 条评价。平台评价和回复评价保持独立。</p><label>处理状态<ElSelect v-model="batchStatus"><ElOption v-for="option in handlingOptions" :key="option.value" :value="option.value" :label="option.label" /></ElSelect></label><label>处理人<ElSelect v-model="batchPeopleMode" aria-label="处理人更新方式"><ElOption value="keep" label="保留原处理人" /><ElOption value="change" label="更换处理人" /><ElOption value="restore" label="恢复自动分配" /></ElSelect></label><label v-if="batchPeopleMode === 'change'">指定处理人<ElSelect v-model="batchHandlerIds" multiple clearable placeholder="未分配" aria-label="批量指定处理人"><ElOption v-for="option in handlerOptions" :key="option.value" :value="option.value" :label="option.label" /></ElSelect></label><label>原因分类<ElSelect v-model="batchReason"><ElOption value="__keep__" label="保留原原因" /><ElOption v-for="reason in reasons" :key="reason.value" :value="reason.value" :label="reason.label" :disabled="reason.disabled" /></ElSelect></label></div><template #footer><ElButton @click="batchOpen = false">取消</ElButton><ElButton type="primary" @click="saveBatch">确认更新 {{ batchIds.length }} 条</ElButton></template></ElDialog>
    <ElDialog :model-value="buyerPageActive && leaveOpen" @update:model-value="value => { if (buyerPageActive) leaveOpen = value }" title="给买家好评" width="620px" align-center :close-on-click-modal="false">
      <div v-if="leaveRecord" class="review-compose" v-prototype="annotation('buyer', '给买家好评编辑与提交')">
        <div class="review-direction-card buyer"><span>卖家 → 买家</span><strong>给这笔交易的买家留下好评</strong><small>显示在买家的信用评价档案中，独立于买家给店铺的评价及回复。</small></div><div class="review-compose-recipient"><BuyerLink :shop-id="leaveRecord.shopId" :buyer-id="leaveRecord.buyerId" /><small>平台订单号：{{ leaveRecord.orderNo }} · {{ leaveRecord.shopName }}</small><small>{{ leaveRecord.title }}</small><small>处理人：{{ handlerNames(getBuyerFeedbackHandlerIds(leaveRecord)) }}</small></div>
        <ElTag type="success">好评</ElTag>
        <BuyerFeedbackSummary v-if="leaveRecord.status === 'sent'" :record="leaveRecord" />
        <template v-else><ElSelect model-value="" aria-label="选择好评模板" placeholder="选择好评模板" no-data-text="暂无已启用的好评模板" @change="value => useBuyerTemplate(String(value))"><ElOption v-for="item in buyerFeedbackTemplates" :key="item.id" :value="item.id" :label="item.name" /></ElSelect><ElInput v-model="leaveText" type="textarea" :rows="5" maxlength="500" show-word-limit aria-label="给买家的好评内容" /></template>
        <p class="review-action-notice">卖家只能给买家好评；提交后无法修改原评价。</p>
        <p v-if="leaveRecord.status === 'pending' && leaveBlockReason(leaveRecord)" class="review-inline-error" role="alert">{{ leaveBlockReason(leaveRecord) }}</p>
        <p v-if="leaveError" class="review-inline-error" role="alert">{{ leaveError }}</p>
        <BuyerFeedbackSummary v-if="leaveRecord.status !== 'sent' && leaveRecord.attempts?.length" :record="leaveRecord" />
      </div>
      <template #footer><ElButton @click="leaveOpen = false">关闭</ElButton><ElButton v-if="leaveRecord?.status === 'pending'" type="primary" :disabled="!canLeave(leaveRecord)" @click="submitLeave">提交好评</ElButton></template>
    </ElDialog>
    </template>
    <ReasonManager v-model="reasonManagerOpen" />
    <ContactBuyer v-model="contactOpen" :review-id="contactReviewId" />
  </section>
</template>
