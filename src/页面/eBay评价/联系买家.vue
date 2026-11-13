<script setup lang="ts">
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElDialog, ElMessage, ElTag } from 'element-plus'
import ReplyEditor from '../eBay站内信/回复编辑器.vue'
import MailVerificationLink from '../eBay站内信/发送核查入口.vue'
import { mailSession } from '../eBay站内信/会话'
import { canViewMail } from '../eBay站内信/权限与协作'
import { getVisibleBlockingMailVerifications, getVisibleContactMailVerifications } from '../eBay站内信/发送核查'
import type { ReplyDraft } from '../eBay站内信/类型'
import type { TemplateContext } from '../消息模板管理/模型'
import { formatReviewTime } from './模型'
import { reviewAnnotation } from './标注'
import { resolveReviewContact } from './联系买家模型'
import { discardContactDraft, getContactBlockedReason, getContactDraft, getContactEditorConversation, isContactSending, sendBuyerContact } from '../eBay站内信/联系买家发送'
import { getApplicationMailConversations, hasApplicationMailThread, needsApplicationThreadChoice, NEW_APPLICATION_MAIL, resolveApplicationMailContact, applicationContactAnnotation, mailBusinessSourceLabel, type ApplicationMailContext } from '../eBay站内信/申请联系上下文'

const props = defineProps<{ modelValue: boolean; reviewId?: string; application?: ApplicationMailContext }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; sent: [value: { conversationId: string; messageId: string }] }>()
const router = useRouter(), identity = ref(''), error = ref(''), success = ref('')
const selectedConversationId = ref('')
const draft = shallowRef<ReplyDraft>()
let windowVersion = 0
function discardWindow() {
  windowVersion++
  discardContactDraft(draft.value); draft.value = undefined
  identity.value = ''; error.value = ''; success.value = ''
}
const opened = computed({ get: () => props.modelValue, set: value => { if (!value) discardWindow(); emit('update:modelValue', value) } })
const sourceKey = computed(() => props.application
  ? JSON.stringify([props.application.kind, props.application.shopId, props.application.applicationId])
  : props.reviewId)
const candidates = computed(() => props.application ? getApplicationMailConversations(props.application) : [])
const threadChoice = computed(() => props.application && needsApplicationThreadChoice(props.application, candidates.value))
const target = computed(() => props.application ? resolveApplicationMailContact(props.application, selectedConversationId.value) : resolveReviewContact(props.reviewId ?? ''))
const record = computed(() => typeof target.value === 'string' ? undefined : target.value.record)
const conversation = computed(() => typeof target.value === 'string' ? undefined : target.value.conversation)
const blocked = computed(() => getContactBlockedReason(target.value, identity.value))
const sending = computed(() => isContactSending(target.value))
const uncertain = computed(() => Boolean(conversation.value?.messages.some(message => message.delivery === 'unknown')))
const editorConversation = computed(() => {
  const context = getContactEditorConversation(target.value)
  return context ? { ...context, canReply: context.canReply && !blocked.value } : undefined
})
const templateContext = computed<TemplateContext>(() => {
  const r = record.value
  if (!r || !editorConversation.value) return {}
  const order = r.orderId ? mailSession.orders.find(item => item.id === r.orderId && item.shopId === r.shopId && item.buyerId === r.buyerId) : undefined
  return { buyerId: r.buyerId, orderNo: r.orderNo, productName: order?.product.title, platformProductName: r.title, platformSku: r.platformSku }
})
const history = computed(() => {
  const c = conversation.value
  return c && canViewMail(c) ? c.messages.filter(m => m.kind === 'outgoing').slice(-4).reverse() : []
})
const blockingChecks = computed(() => {
  const selection = target.value
  if (typeof selection !== 'string') return getVisibleContactMailVerifications(selection)
  const source = props.application
  return source && !source.blockedReason && source.buyerId ? getVisibleBlockingMailVerifications({ shopId: source.shopId, buyerId: source.buyerId, originApplication: source }) : []
})
const checksOutsideHistory = computed(() => blockingChecks.value.filter(({ message }) => !history.value.includes(message)))
function prepareWindow() {
  discardWindow()
  if (!props.modelValue || typeof target.value === 'string') return
  identity.value = target.value.identity
  draft.value = getContactDraft(target.value)
}
watch([() => props.modelValue, sourceKey], () => {
  selectedConversationId.value = ''
  prepareWindow()
}, { immediate: true, flush: 'sync' })
function selectConversation(event: Event) {
  selectedConversationId.value = (event.target as HTMLSelectElement).value
  prepareWindow()
}
watch(() => [draft.value?.body, draft.value?.bodyHtml, JSON.stringify(draft.value?.attachments)], () => { error.value = ''; success.value = '' })
onBeforeUnmount(discardWindow)
async function send() {
  const expectedIdentity = identity.value, version = windowVersion
  const submission = sendBuyerContact(target.value, expectedIdentity)
  if (props.application && selectedConversationId.value === NEW_APPLICATION_MAIL && conversation.value) {
    selectedConversationId.value = conversation.value.id
  }
  const result = await submission
  if (version !== windowVersion || typeof target.value === 'string' || target.value.identity !== expectedIdentity || !props.modelValue) return
  if (!result.ok) { error.value = result.message; return }
  error.value = ''; success.value = result.message; ElMessage.success(result.message)
  emit('sent', { conversationId: result.conversationId!, messageId: result.messageId! })
}
function openMail() {
  const c = conversation.value
  if (!c) return
  mailSession.activeSource = 'buyer'; mailSession.activeId = c.id; mailSession.folder = 'outbox'
  mailSession.onlyPendingFolders = false; mailSession.listOpen = true; mailSession.readerOpen = true
  opened.value = false; void router.push('/oms/ebay-service/messages')
}
const deliveryLabel = { sending: '发送中', success: '已发送', failed: '发送失败', unknown: '结果待核查' }
const buyerPageActive = useBuyerPageActive()
</script>

<template>
  <ElDialog :model-value="buyerPageActive && opened" @update:model-value="value => { if (buyerPageActive) opened = value }" title="联系买家" :append-to-body="!!application" width="min(960px, 94vw)" align-center :close-on-click-modal="false" :destroy-on-close="buyerPageActive" class="review-contact-dialog">
    <div v-if="modelValue" class="review-contact-compose" v-prototype="application ? applicationContactAnnotation(application.kind, 'compose') : reviewAnnotation('contact', '联系买家与发送站内信')">
      <dl v-if="application || record" class="review-contact-recipient">
        <dt>发件店铺</dt><dd>{{ application?.shopName || record?.shopName }}</dd>
        <dt>收件买家</dt><dd><BuyerLink :shop-id="application?.shopId || record?.shopId" :buyer-id="application?.buyerId || record?.buyerId" /></dd>
        <template v-if="application">
          <dt>平台订单号</dt><dd>{{ application.orderNo || '—' }}</dd>
          <dt>{{ application.kind === 'cancel' || application.kind === 'return' ? '来源申请' : '来源纠纷' }}</dt><dd>{{ mailBusinessSourceLabel(application.kind) }} · {{ application.applicationId }}</dd>
        </template>
        <template v-else-if="record"><dt>关联交易</dt><dd>{{ record.orderNo || record.orderLineItemId }} · {{ record.title }}</dd></template>
      </dl>
      <label v-if="threadChoice" class="contact-thread-picker">站内信会话
        <select aria-label="选择站内信会话" :value="selectedConversationId" :disabled="sending" @change="selectConversation">
          <option value="" disabled>请选择会话</option>
          <option v-if="application && !hasApplicationMailThread(application)" :value="NEW_APPLICATION_MAIL">发起新会话</option>
          <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.subject }} · {{ c.id }}</option>
        </select>
      </label>
      <ReplyEditor v-if="draft && editorConversation" :key="`${sourceKey}:${identity}`" :purpose="application ? 'application-contact' : 'review-contact'" :application-kind="application?.kind" :conversation="editorConversation" :draft="draft" mode="reply" :sending="sending" :uncertain="uncertain" :mark-processed-on-send="false" :template-context="templateContext" @send="send" />
      <div v-if="blocked && !sending" class="review-contact-blocked">
        <p role="alert" class="review-contact-error">{{ blocked }}</p>
        <MailVerificationLink :targets="checksOutsideHistory" @resolved="error = ''" />
      </div>
      <p v-if="error" role="alert" class="review-contact-error">{{ error }}</p>
      <p v-if="success" role="status" class="review-contact-success">{{ success }}</p>
      <details v-if="conversation && history.length" class="review-contact-history" :open="!!success || !!error || blockingChecks.length > 0">
        <summary>最近发送记录（{{ history.length }}）</summary>
        <article v-for="message in history" :key="message.id">
          <header>
            <ElTag :type="message.delivery === 'success' ? 'success' : message.delivery === 'sending' ? 'info' : 'danger'" size="small">{{ message.delivery ? deliveryLabel[message.delivery] : '已记录' }}</ElTag>
            <span>{{ message.sender }} · {{ formatReviewTime(message.at) }}</span>
            <MailVerificationLink :targets="[{ conversation, message }]" @resolved="error = ''" />
          </header>
          <strong v-if="message.subject">{{ message.subject }}</strong>
          <p :title="message.body">{{ message.body }}</p>
          <small v-if="message.failureReason">{{ message.failureReason }}</small>
        </article>
      </details>
    </div>
    <template #footer><div class="review-contact-footer"><ElButton v-if="conversation" link type="primary" @click="openMail">查看站内信</ElButton><span /><ElButton @click="opened = false">关闭</ElButton></div></template>
  </ElDialog>
</template>

<style scoped>
.review-contact-compose :deep(.reply-editor-host:not(.reply-expanded-dialog)){max-height:none;min-height:0;overflow:visible}.review-contact-compose :deep(.mail-reply-editor.mail-composer){border:1px solid #e7edf4;border-radius:4px}
.review-contact-count{display:block;margin-top:4px;text-align:right;font-size:12px;line-height:1.2;color:#8a99ab}.review-contact-count.is-over-limit{color:#cc615c}
.contact-thread-picker select{display:block;max-width:100%;margin-top:5px;padding:5px 8px;border:1px solid #cdd8e5;border-radius:4px;font:inherit;color:inherit}.review-contact-compose{font-size:13px;line-height:1.65;color:#52657b;max-height:calc(100vh - 220px);overflow:auto;padding-right:3px}.review-contact-recipient{display:grid;grid-template-columns:74px minmax(0,1fr);gap:8px;margin:0 0 20px;padding:14px 16px;background:#f6f8fb;border:1px solid #e8edf4;border-radius:4px}.review-contact-recipient dt{color:#8a98aa}.review-contact-recipient dd{margin:0;overflow-wrap:anywhere;color:#3e536c}.review-contact-compose>label{display:block;margin:14px 0;font-size:12px;color:#5d7088}.review-contact-compose>label>span{color:#a0abba;margin-left:5px}.review-contact-compose>label .el-input,.review-contact-compose>label .el-textarea{display:block;margin-top:7px}.review-contact-help{font-size:12px;color:#8a99ab;margin:12px 0}.review-contact-error{font-size:12px;color:#cc615c;white-space:pre-wrap;overflow-wrap:anywhere}.review-contact-success{font-size:12px;color:#4a9978}.review-contact-history{border-top:1px solid #e8edf4;padding-top:10px;margin-top:16px;font-size:12px}.review-contact-history summary{cursor:pointer;color:#7189a2}.review-contact-history article{padding:12px 0;border-bottom:1px solid #edf0f5}.review-contact-history header{display:flex;align-items:center;gap:10px;color:#94a1b2;font-size:11px}.review-contact-history strong{display:block;font-size:12px;font-weight:500;margin-top:6px;overflow-wrap:anywhere}.review-contact-history p{margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.review-contact-history small{color:#cc615c}.review-contact-footer{display:flex;align-items:center;gap:8px}.review-contact-footer>span{flex:1}.review-contact-footer .el-button{margin:0;font-size:12px}
</style>
