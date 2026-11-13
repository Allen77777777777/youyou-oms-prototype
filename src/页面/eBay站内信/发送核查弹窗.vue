<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElMessage, ElTag } from 'element-plus'
import { 格式化北京时间 } from '@/页面/订单处理/时间展示工具'
import { canOperateMail, canViewMail } from './权限与协作'
import { mailAnnotation } from './站内信标注'
import { acceptMailVerification, confirmMailVerification, ensureMailVerification, queryMailVerification } from './发送核查'
import type { Conversation, MailMessage } from './类型'

const props = defineProps<{ modelValue: boolean; conversation?: Conversation; message?: MailMessage }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; resolved: [] }>()
const feedback = ref('')
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const allowed = computed(() => Boolean(props.conversation && canViewMail(props.conversation)))
const record = computed(() => props.modelValue && allowed.value && props.conversation && props.message ? ensureMailVerification(props.conversation, props.message) : undefined)
const canQuery = computed(() => Boolean(props.conversation && canOperateMail(props.conversation, 'recall')))
const canConfirm = computed(() => Boolean(props.conversation && canOperateMail(props.conversation, 'verify')))
const hasConclusion = computed(() => Boolean(record.value?.conclusion))
const evidenceReady = computed(() => record.value?.evidence && record.value.evidence.kind !== 'unresolved')
const overdue = computed(() => Boolean(record.value?.reviewDueAt && !record.value.firstReviewedAt && Date.parse(record.value.reviewDueAt) < Date.now()))
const resultText = computed(() => record.value?.conflict ? '证据冲突待复核' : props.message?.delivery === 'success' ? '已确认成功' : props.message?.delivery === 'failed' ? '已确认未受理' : '结果待核查')
watch(() => [props.modelValue, props.message?.id], () => { feedback.value = '' })

function query() {
  if (!props.conversation || !props.message) return
  const result = queryMailVerification(props.conversation, props.message)
  feedback.value = result.message
  if (!result.ok) ElMessage.warning(result.message)
}
function accept() {
  if (!props.conversation || !props.message) return
  const result = acceptMailVerification(props.conversation, props.message)
  feedback.value = result.message
  if (!result.ok) ElMessage.warning(result.message)
}
function confirm() {
  if (!props.conversation || !props.message) return
  const result = confirmMailVerification(props.conversation, props.message)
  feedback.value = result.message
  if (!result.ok) return void ElMessage.warning(result.message)
  ElMessage.success(result.message)
  emit('resolved')
}
</script>

<template>
  <ElDialog v-model="visible" title="发送结果核查" width="min(680px, 94vw)" :close-on-click-modal="false" destroy-on-close>
    <div v-if="record && message && conversation" class="mail-verification" v-prototype="mailAnnotation('verification', '发送结果待核查')">
      <div class="mail-verification-heading"><strong>{{ conversation.buyerId }}</strong><ElTag :type="record.conflict ? 'danger' : hasConclusion ? 'success' : 'warning'">{{ resultText }}</ElTag></div>
      <dl>
        <dt>店铺</dt><dd>{{ conversation.shopName }}</dd>
        <dt>原消息编号</dt><dd>{{ record.messageId }}</dd>
        <dt>本次尝试编号</dt><dd>{{ record.attemptId }}</dd>
        <dt>原发起人</dt><dd>{{ record.operator || '未记录' }}</dd>
        <dt>提交时间</dt><dd>{{ 格式化北京时间(record.submittedAt) }}</dd>
        <dt>失败原因</dt><dd>{{ message.failureReason || '—' }}</dd>
        <dt>最近回查</dt><dd>{{ record.lastCheckedAt ? 格式化北京时间(record.lastCheckedAt) : '尚未回查' }}</dd>
        <template v-if="record.handedAt">
          <dt>核查责任人</dt><dd>{{ record.reviewerName || '待主管指定核查人' }}</dd>
          <dt>交接时间</dt><dd>{{ 格式化北京时间(record.handedAt) }}</dd>
          <dt>首次人工复核</dt><dd>{{ record.firstReviewedAt ? 格式化北京时间(record.firstReviewedAt) : '待复核' }}</dd>
          <dt>复核期限</dt><dd>{{ 格式化北京时间(record.reviewDueAt) }}<span v-if="overdue" class="mail-verification-overdue"> 已超时</span></dd>
        </template>
        <template v-if="record.conclusion"><dt>确认人</dt><dd>{{ record.concludedBy }}</dd><dt>确认时间</dt><dd>{{ 格式化北京时间(record.concludedAt) }}</dd></template>
      </dl>
      <ElAlert v-if="record.conflict" title="证据存在冲突，已暂停后续发送，请继续复核原尝试。" type="error" :closable="false" />
      <section v-if="record.evidenceHistory.length" class="mail-verification-evidence" aria-label="核查证据">
        <h3>核查证据</h3>
        <article v-for="evidence in record.evidenceHistory" :key="`${evidence.id}-${evidence.kind}`">
          <strong>{{ evidence.id }}</strong><p>{{ evidence.description }}</p>
          <p v-if="evidence.platformMessageId">平台消息编号 {{ evidence.platformMessageId }}</p>
        </article>
      </section>
      <p v-else class="mail-verification-hint">回查原发送尝试后，按取得的证据确认结果。</p>
      <section v-if="record.history.length" class="mail-verification-evidence" aria-label="历史发送尝试">
        <h3>历史发送尝试</h3>
        <article v-for="attempt in record.history" :key="attempt.attemptId">
          <strong>{{ attempt.attemptId }}</strong>
          <p>{{ attempt.operator }} · {{ 格式化北京时间(attempt.submittedAt) }}</p>
          <p>{{ attempt.conclusion === 'success' ? '已确认成功' : attempt.conclusion === 'not_accepted' ? '已确认未受理' : '明确失败' }}</p>
          <p v-for="evidence in attempt.evidenceHistory" :key="evidence.id">{{ evidence.id }} · {{ evidence.description }}</p>
        </article>
      </section>
      <p v-if="feedback" class="mail-verification-feedback" role="status">{{ feedback }}</p>
    </div>
    <p v-else role="alert">当前发送记录不可访问，请核对来源及查看权限。</p>
    <template #footer>
      <ElButton @click="visible = false">关闭</ElButton>
      <ElButton v-if="record && canConfirm && !record.acceptedAt && !hasConclusion" @click="accept">接手核查</ElButton>
      <ElButton v-if="record" :disabled="!canQuery" @click="query">回查发送结果</ElButton>
      <ElButton v-if="record && !hasConclusion" type="primary" :disabled="!canConfirm || !evidenceReady || record.conflict" @click="confirm">按证据确认</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.mail-verification{font-size:13px;max-height:65vh;overflow:auto;color:var(--yy-text-body,#303133)}
.mail-verification-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.mail-verification-heading>strong{color:var(--yy-text-heading,#000);overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px 14px;margin:0 0 18px;line-height:1.6}
dt{color:var(--yy-text-secondary,#748196)}dd{margin:0;overflow-wrap:anywhere}
.mail-verification-evidence{border-top:1px solid #e5eaf1;margin-top:16px;padding-top:14px}
h3{font-size:13px;color:var(--yy-text-heading,#000);margin:0 0 10px}
article{background:#f6f8fb;padding:10px 12px;margin-bottom:8px;border-radius:4px}
article strong{color:var(--yy-text-heading,#000);font-weight:500}article p{margin:6px 0 0;line-height:1.6;overflow-wrap:anywhere}
.mail-verification-hint{color:#748196;line-height:1.7}.mail-verification-feedback{line-height:1.7;color:#476985;margin:12px 0 0}.mail-verification-overdue{color:#c45656}
</style>
