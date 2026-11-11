<script setup lang="ts">
import { refreshDisputeWithHandlers } from './处理人'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton } from 'element-plus'
import { 共享订单 } from '../订单处理/演示会话'
import { 注册业务页签清理 } from '@/布局/页签操作'
import ActionForm from './纠纷办理表单.vue'
import { clearHandlingView, handlingBasis, handlingView } from './办理会话'
import { actionLabels, availableActions, dateText, findRecord, recheckRefundEligibility, type ActionCode, type DisputeRecord } from './模型'
import { disputeLocation } from './导航'
import { disputeAnnotations } from './标注'
import { isPaymentDecision, knownPaymentRevision, paymentHasAnswered, requestCoverage } from './支付争议证据'
import { disputeShippingLocation, sellerHubFor } from './办理接口边界'
import { idLabels } from './导航'

const props = defineProps<{ record: DisputeRecord }>()
const router = useRouter()
const view = handlingView(props.record)
const formGeneration = ref(0)
const currentRecord = props.record
注册业务页签清理(useRoute().path, () => clearHandlingView(currentRecord))
const title = { INR_REQUEST: '处理未收到货请求', EBAY_CASE: '处理平台案件', PAYMENT_DISPUTE: '处理支付争议' } as const
const allowed = computed(() => {
  const actions = availableActions(props.record)
  if (!props.record.payment) return actions
  const paymentOrder: ActionCode[] = ['EVIDENCE', 'CONTEST', 'ACCEPT', 'ACCEPT_RETURN']
  return paymentOrder.filter(action => actions.includes(action))
})
watch(allowed, actions => {
  for (const code of Object.keys(view.drafts) as ActionCode[]) {
    if (!actions.includes(code)) delete view.drafts[code]
  }
  if (view.active && !actions.includes(view.active)) {
    view.active = null
    view.feedback = ''
    view.followContest = false
  }
}, { immediate: true })
const missingPaymentChoices = computed(() => props.record.status === 'ACTION_NEEDED' && props.record.payment?.responseCode !== undefined &&
  props.record.payment.availableChoices === undefined && !paymentHasAnswered(props.record))
const platformMessage = computed(() => props.record.caseInfo?.platformAction || props.record.payment?.platformAction ||
  (missingPaymentChoices.value ? '尚未取得当前可选答复，请刷新或到卖家后台核查。' :
    props.record.inquiry?.requestedInfo?.some(item => item.kind === 'SIGNATURE') ? '如需补交签收文件，请按本案的卖家后台通知办理。' : ''))
const sellerHub = computed(() => sellerHubFor(props.record.site))
const deliveryRequests = computed(() => props.record.payment?.details?.requests.filter(request => request.type === 'PROOF_OF_DELIVERY') || [])
const missingDelivery = computed(() => deliveryRequests.value.some(request => requestCoverage(props.record, request) !== '已提供材料'))
const shippingLocation = computed(() => disputeShippingLocation(props.record, 共享订单.value))
const canRecheckRefund = computed(() => props.record.inquiry?.refundOutcome === 'FAILED' &&
  props.record.inquiry.refundFailure?.retryable && !props.record.pending && props.record.status === 'OPEN')
const linkedCase = computed(() => props.record.inquiry && props.record.links.find(link => {
  if (link.kind !== 'EBAY_CASE' || link.shopId !== props.record.shopId) return false
  const target = findRecord(link.shopId, link.kind, link.id)
  return target && target.orderId === props.record.orderId && target.buyer === props.record.buyer
}))
const decision = computed(() => props.record.caseInfo?.appeal || props.record.caseInfo?.decision || props.record.payment?.outcome || props.record.inquiry?.refundStatus)
function choose(action: ActionCode) {
  if (!allowed.value.includes(action)) return
  view.active = action
  view.feedback = ''
  view.followContest = false
}
function close() {
  if (view.active) delete view.drafts[view.active]
  view.active = null
}
function submitted() {
  const previousAction = view.active
  close()
  view.followContest = previousAction === 'EVIDENCE' && allowed.value.includes('CONTEST')
  view.feedback = props.record.pending ? '' : props.record.progress
}
function recheck() { view.feedback = refreshDisputeWithHandlers(props.record) }
function recheckRefund() { view.feedback = recheckRefundEligibility(props.record) }
function openShipping() {
  const location = disputeShippingLocation(props.record, 共享订单.value)
  if (location) void router.push(location)
  else view.feedback = '关联订单尚未唯一核实，请先核对店铺及平台订单号。'
}
function reviewDraft() {
  const action = view.active
  const saved = action && view.drafts[action]
  if (!saved || !action || !allowed.value.includes(action)) return
  refreshDisputeWithHandlers(props.record)
  if (isPaymentDecision(action) && !knownPaymentRevision(props.record.payment?.platformRevision)) {
    view.feedback = '尚未取得平台版本，请到卖家后台核查该争议。'
    return
  }
  saved.revision = props.record.revision
  saved.basis = handlingBasis(props.record, action)
  if (isPaymentDecision(action)) saved.draft.platformRevision = props.record.payment?.platformRevision
  saved.prepared = null
  formGeneration.value++
  view.feedback = '已重新载入本案资格，请核对原草稿后继续。'
}
function openCase() {
  if (linkedCase.value) void router.push(disputeLocation(linkedCase.value.shopId, 'EBAY_CASE', linkedCase.value.id))
}
</script>

<template>
  <section v-prototype="disputeAnnotations.handling" class="dispute-work" aria-label="纠纷办理操作栏">
    <header><h2>{{ title[record.kind] }}</h2></header>
    <div v-if="record.pending" class="receipt pending"><strong>{{ actionLabels[record.pending.action] }}已提交</strong>
      <p>正在等待平台回执。请先核查本次办理结果。</p>
      <ElButton size="small" type="primary" @click="recheck">核查办理结果</ElButton>
    </div>
    <template v-else>
      <div v-if="allowed.length" class="action-list" aria-label="本案可办操作">
        <ElButton v-for="action in allowed" :key="action" :aria-pressed="view.active === action" :type="view.active === action ? 'primary' : 'default'" @click="choose(action)">{{ actionLabels[action] }}</ElButton>
      </div>
      <p v-if="allowed.length && !view.active && !view.feedback" class="next-step">
        <template v-if="record.inquiry?.primaryAction && allowed.includes(record.inquiry.primaryAction)">平台要求：{{ actionLabels[record.inquiry.primaryAction] }}。 </template>{{ record.nextStep }}
      </p>
      <ActionForm v-if="view.active" :key="view.active + formGeneration" :record="record" :action="view.active" @close="close" @submitted="submitted" @reload="reviewDraft" @evidence="choose('EVIDENCE')" />
      <div v-if="!allowed.length && !view.active" class="receipt">
        <strong>{{ record.progress || record.statusText || '办理资格待核实' }}</strong>
        <p v-if="decision && decision !== record.progress">{{ decision }}</p>
        <p>{{ record.nextStep || '请刷新并核对卖家后台的当前状态。' }}</p>
        <dl v-if="record.date"><dt>{{ record.date.label }}</dt><dd>{{ dateText(record.date.value) }}</dd></dl>
        <ElButton v-if="linkedCase" size="small" plain type="primary" @click="openCase">查看关联 Case</ElButton>
      </div>
      <p v-if="record.inquiry?.refundBlockReason" class="limit">退款受限：{{ record.inquiry.refundBlockReason }}</p>
      <div v-if="canRecheckRefund" class="platform-note"><strong>退款明确未成功</strong><p>处理原失败原因后，先取得最新退款资格和估算，再决定是否重新申请。</p><ElButton size="small" plain type="primary" @click="recheckRefund">重新核验退款条件</ElButton></div>
      <div v-if="deliveryRequests.length" class="platform-note delivery-follow-up"><strong>投递跟踪核对</strong>
        <p>{{ missingDelivery ? '平台尚未确认全部相关订单行的投递跟踪，请先核对原订单标发。' : '平台已取得本案投递跟踪，可继续核对包裹和证据记录。' }}</p>
        <ElButton v-if="shippingLocation" size="small" plain type="primary" @click="openShipping">查看原订单标发</ElButton>
        <p v-else class="limit">关联订单尚未唯一核实，请先核对店铺及平台订单号。</p>
        <p>无对应标发记录时，请核对原订单的有效出库及标发结果。完成原订单办理后返回本案回查。</p>
        <ElButton size="small" @click="recheck">回查投递证据</ElButton>
      </div>
      <div v-if="platformMessage" class="platform-note"><p>{{ platformMessage }}</p><p>查找 {{ idLabels[record.kind] }}：{{ record.id }}</p><a v-if="sellerHub" :href="sellerHub" target="_blank" rel="noopener noreferrer">打开卖家后台 · 请求与纠纷 ↗</a><p v-else>请在本店所属站点的卖家后台查找本案。</p></div>
    </template>
    <div v-if="view.feedback && (allowed.length || record.pending || view.feedback !== record.progress)" class="receipt feedback" role="status">
      <span>{{ view.feedback }}</span>
      <ElButton v-if="view.followContest && allowed.includes('CONTEST')" type="primary" size="small" @click="choose('CONTEST')">继续抗辩</ElButton>
    </div>
  </section>
</template>

<style scoped>
.dispute-work { min-width:0; color:#394756; font-size:13px; overflow-wrap:anywhere; }
h2 { margin:0 0 16px; color:var(--yy-text-heading); font-size:16px; font-weight:600; }
.action-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
.action-list :deep(.el-button) { width:100%; height:auto; min-height:32px; margin:0; padding:4px 6px; font-size:12px; white-space:normal; line-height:1.45; }
.next-step,.platform-note,.receipt,.limit { font-size:12px; line-height:1.65; }
.next-step { color:#637488;margin:12px 0 0;line-height:1.8; }.receipt { background:#f5f7fa; border-radius:4px; padding:10px 12px; }.receipt p,.platform-note p { margin:4px 0; }
.receipt strong { font-size:13px;color:var(--yy-text-heading); }.receipt .el-button { margin-top:5px; }
.receipt dl { margin:7px 0 0;display:flex;flex-wrap:wrap;gap:6px 10px; }.receipt dt {color:#728093}.receipt dd {margin:0}
.pending,.limit { background:#fff6e5; color:#845b10; }.limit { padding:6px 9px; border-radius:4px; margin:10px 0 0;}
.platform-note { margin-top:10px; border-top:1px solid #e6ebf1; padding-top:8px; color:#687689; } .platform-note a { color:var(--el-color-primary) }
.feedback { display:flex;align-items:center;justify-content:space-between;gap:8px; margin-top:10px;color:#346548;background:#f0f7f2; }.feedback .el-button {margin:0}
</style>
