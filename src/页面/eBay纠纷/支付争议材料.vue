<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import NumberCopy from '@/组件/单号复制.vue'
import EvidenceFiles from './举证文件列.vue'
import { dateText, type DisputeRecord, type Money } from './模型'
import { evidenceLabel, requestCoverage, type PaymentFile, type PaymentLine } from './支付争议证据'
import { disputeAnnotations } from './标注'
import './平台资料阅读.css'

const props = withDefaults(defineProps<{ record: DisputeRecord; section?: 'all' | 'evidence' | 'return' | 'funds' }>(), { section: 'all' })
const payment = computed(() => props.record.payment)
const details = computed(() => payment.value?.details)
const requests = computed(() => details.value?.requests || [])
const evidenceSets = computed(() => details.value?.evidenceSets || [])
const representedFiles = computed(() => new Set(evidenceSets.value.flatMap(set => set.files.filter(file => file.fileId).map(file => JSON.stringify([file.evidenceId || set.id, file.fileId])))))
const files = computed(() => (payment.value?.evidence || []).filter(file => !file.fileId || !representedFiles.value.has(JSON.stringify([file.evidenceId, file.fileId]))))
const deliveries = computed(() => (details.value?.deliveryEvidence || []).filter(parcel => {
  return !evidenceSets.value.some(set => set.requestKey === parcel.requestKey && set.shipments.some(provided =>
    provided.carrier === parcel.carrier && provided.tracking === parcel.tracking && JSON.stringify(provided.lines) === JSON.stringify(parcel.lines)))
}))
const groups = computed(() => requests.value.map(request => ({
  request, coverage: requestCoverage(props.record, request),
  files: files.value.filter(file => file.requestKey === request.key),
  parcels: deliveries.value.filter(parcel => parcel.requestKey === request.key),
})))
const requestKeys = computed(() => new Set(requests.value.map(request => request.key)))
const unmatchedFiles = computed(() => files.value.filter(file => !file.requestKey || !requestKeys.value.has(file.requestKey)))
const unmatchedParcels = computed(() => deliveries.value.filter(parcel => !requestKeys.value.has(parcel.requestKey)))
const lineKey = (line: PaymentLine) => JSON.stringify([line.itemId, line.lineItemId])
const extraLines = computed(() => {
  const inRequests = new Set([...requests.value.flatMap(request => request.lines.map(lineKey)), ...evidenceSets.value.flatMap(set => set.lines.map(lineKey))])
  return details.value?.lines.filter(line => !inRequests.has(lineKey(line))) || []
})
const returnInfo = computed(() => details.value?.buyerReturn)
const returnAddress = computed(() => details.value?.returnAddress)
const addressFacts = computed(() => returnAddress.value ? [
  { label: '收件人', value: returnAddress.value.fullName }, { label: '街道地址', value: returnAddress.value.addressLine1 },
  { label: '补充地址', value: returnAddress.value.addressLine2 }, { label: '城市', value: returnAddress.value.city },
  { label: '县／郡', value: returnAddress.value.county }, { label: '州／省', value: returnAddress.value.stateOrProvince },
  { label: '邮编', value: returnAddress.value.postalCode }, { label: '国家', value: returnAddress.value.country },
  { label: '联系电话', value: returnAddress.value.primaryPhone?.number }, { label: '电话国家', value: returnAddress.value.primaryPhone?.countryCode },
].filter(fact => fact.value?.trim()) : [])
const money = (amount: Money) => amount.currency + ' ' + amount.value
const financialFacts = computed(() => [
  { label: '争议金额', amount: props.record.amount },
  { label: '暂扣金额', amount: payment.value?.held, converted: payment.value?.convertedHold },
  { label: '卖家受保护金额', amount: details.value?.protectedAmount },
  { label: '平台追偿金额', amount: details.value?.recoupAmount },
  { label: '卖家实际承担', amount: payment.value?.liability },
  { label: '争议费用', amount: details.value?.fees },
  { label: '费用返还', amount: details.value?.feeCredit },
  { label: '捐赠返还', amount: details.value?.donationCredit },
].filter(row => row.amount?.currency && row.amount.value))
const preview = ref<{ name: string; url: string }>()
const previewFailed = ref(false)
function closePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value.url)
  preview.value = undefined
  previewFailed.value = false
}
function openPreview(file: PaymentFile) {
  closePreview()
  if (file.content) preview.value = { name: file.name, url: URL.createObjectURL(file.content) }
}
watch(() => [props.record.shopId, props.record.kind, props.record.id], closePreview)
onBeforeUnmount(closePreview)
</script>

<template>
  <section v-if="(section === 'all' || section === 'evidence') && (groups.length || files.length || deliveries.length || evidenceSets.length || extraLines.length)"
    v-prototype="disputeAnnotations.paymentEvidence" class="material-panel" data-dispute-section="payment-evidence" aria-label="举证要求与材料">
    <h2>{{ groups.length || files.length || deliveries.length || evidenceSets.length ? '举证要求与材料' : '争议涉及的订单行' }}</h2>
    <article v-for="group in groups" :key="group.request.key" class="material-group request">
      <h3>{{ evidenceLabel(group.request.type) }}</h3>
      <p class="coverage" :class="{ missing: group.coverage !== '已提供材料' }">{{ group.coverage }}</p>
      <dl class="material-facts">
        <template v-if="group.request.dueAt"><dt>材料截止</dt><dd><strong>{{ dateText(group.request.dueAt) }}</strong></dd></template>
        <template v-if="group.request.requestedAt"><dt>请求时间</dt><dd>{{ dateText(group.request.requestedAt) }}</dd></template>
        <dt>适用订单行</dt><dd>
          <div v-for="line in group.request.lines" :key="lineKey(line)" class="order-line">
            <NumberCopy :value="line.lineItemId" label="订单行号" />
            <small v-if="line.itemId">商品编号 <NumberCopy :value="line.itemId" label="商品编号" /></small>
          </div>
          <span v-if="!group.request.lines.length">待核实</span>
        </dd>
      </dl>
      <p v-if="group.request.type === 'PROOF_OF_DELIVERY'" class="meta">核对订单履约记录中的承运商和跟踪号。跟踪缺失或错误时，从关联订单核查标发，再刷新本案确认平台已取得的资料。</p>
      <EvidenceFiles :files="group.files" @preview="openPreview" />
      <div v-for="(parcel,index) in group.parcels" :key="index" class="submitted">
        <p><b>{{ parcel.carrier }}</b> · <NumberCopy :value="parcel.tracking" label="物流举证跟踪号" /></p>
        <small class="meta">对应订单行 {{ parcel.lines.map(line => line.lineItemId).join('、') || '待核实' }}</small>
      </div>
    </article>
    <article v-for="set in evidenceSets" :key="set.id" class="material-group evidence-set" aria-label="已提供的证据组">
      <h3>{{ evidenceLabel(set.type) }}</h3>
      <small class="meta">{{ requests.some(request => request.key === set.requestKey || (!!request.evidenceId && request.evidenceId === set.id)) ? '已提供的证据' : '历史已提供的证据' }}</small>
      <dl class="material-facts">
        <template v-if="set.id"><dt>证据组编号</dt><dd><NumberCopy :value="set.id" label="证据组编号" /></dd></template>
        <template v-if="set.requestedAt"><dt>原请求时间</dt><dd>{{ dateText(set.requestedAt) }}</dd></template>
        <template v-if="set.dueAt"><dt>原材料截止</dt><dd>{{ dateText(set.dueAt) }}</dd></template>
        <template v-if="set.providedAt"><dt>证据提供时间</dt><dd>{{ dateText(set.providedAt) }}</dd></template>
        <template v-if="set.lines.length"><dt>适用订单行</dt><dd>
          <div v-for="line in set.lines" :key="lineKey(line)" class="order-line"><NumberCopy :value="line.lineItemId" label="订单行号" />
            <small v-if="line.itemId">商品编号 <NumberCopy :value="line.itemId" label="商品编号" /></small>
          </div>
        </dd></template>
      </dl>
      <EvidenceFiles :files="set.files" @preview="openPreview" />
      <div v-for="(parcel,index) in set.shipments" :key="index" class="submitted">
        <p><b>{{ parcel.carrier }}</b> · <NumberCopy :value="parcel.tracking" label="物流举证跟踪号" /></p>
        <small v-if="parcel.lines.length" class="meta">对应订单行 {{ parcel.lines.map(line => line.lineItemId).join('、') }}</small>
      </div>
    </article>
    <article v-if="unmatchedFiles.length || unmatchedParcels.length" class="material-group"><h3>未关联具体要求的材料</h3>
      <EvidenceFiles :files="unmatchedFiles" @preview="openPreview" />
      <p v-for="(parcel,index) in unmatchedParcels" :key="index">{{ parcel.carrier }} · <NumberCopy :value="parcel.tracking" label="物流举证跟踪号" />
        <small class="meta">对应订单行 {{ parcel.lines.map(line => line.lineItemId).join('、') || '待核实' }}</small></p>
    </article>
    <div v-if="extraLines.length" class="material-group">
      <h3 v-if="groups.length || files.length || deliveries.length || evidenceSets.length">其他争议订单行</h3>
      <div v-for="line in extraLines" :key="lineKey(line)" class="order-line">
        订单行 <NumberCopy :value="line.lineItemId" label="订单行号" />
        <small v-if="line.itemId">商品编号 <NumberCopy :value="line.itemId" label="商品编号" /></small>
      </div>
    </div>
    <ElDialog v-if="preview" :model-value="true" :title="preview.name" width="min(680px,94vw)" append-to-body @close="closePreview">
      <p v-if="previewFailed" role="alert">图片无法预览，请核对原文件。</p>
      <img v-else class="evidence-image" :src="preview.url" :alt="preview.name" @error="previewFailed = true" />
    </ElDialog>
  </section>

  <section v-if="(section === 'all' || section === 'return') && addressFacts.length" class="material-panel" data-dispute-section="payment-return-address" aria-label="平台退回地址">
    <h2>平台退回地址</h2>
    <dl class="material-facts"><template v-for="fact in addressFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></template></dl>
  </section>

  <section v-if="(section === 'all' || section === 'return') && returnInfo && (returnInfo.onHold || returnInfo.note || returnInfo.packages.length)"
    class="material-panel" data-dispute-section="payment-return" aria-label="买家退回信息">
    <h2>买家退回信息</h2>
    <div v-if="returnInfo.onHold || returnInfo.note" class="material-group"><h3>买家留言</h3>
      <p>{{ returnInfo.onHold ? '平台已隐藏留言内容' : returnInfo.note }}</p>
    </div>
    <div v-if="returnInfo.packages.length" class="material-group"><h3>退回包裹</h3>
      <div v-for="(parcel,index) in returnInfo.packages" :key="index" class="returned-parcel">
        <b>{{ parcel.carrier || '承运商待核实' }}</b><NumberCopy :value="parcel.tracking" label="退回跟踪号" />
      </div>
    </div>
  </section>

  <section v-if="(section === 'all' || section === 'funds') && payment && (financialFacts.length || payment.protection || details?.closedAt || details?.transactions?.length)"
    class="material-panel" data-dispute-section="payment-funds" aria-label="资金与卖家保护">
    <h2>资金与卖家保护</h2>
    <dl class="material-facts">
      <template v-for="fact in financialFacts" :key="fact.label"><dt>{{ fact.label }}</dt>
        <dd><b>{{ money(fact.amount!) }}</b><small v-if="fact.converted" class="meta">平台折算 {{ money(fact.converted) }}</small></dd>
      </template>
      <template v-if="payment.protection"><dt>卖家保护</dt><dd>{{ payment.protection }}</dd></template>
      <template v-if="details?.closedAt"><dt>平台结案时间</dt><dd>{{ dateText(details.closedAt) }}</dd></template>
    </dl>
    <details v-if="details?.transactions?.length" class="transactions"><summary>资金流水（{{ details.transactions.length }} 笔）</summary>
      <article v-for="(tx,index) in details.transactions" :key="index" class="submitted">
        <p><b>{{ tx.reason }} · {{ tx.type }}</b>　{{ money(tx.amount) }}</p><time>{{ dateText(tx.at) }}</time>
        <small v-if="tx.originalAmount" class="meta">折算前 {{ money(tx.originalAmount) }}<template v-if="tx.exchangeRate"> · 平台汇率 {{ tx.exchangeRate }}</template></small>
      </article>
    </details>
  </section>
</template>

<style scoped>
.coverage { color: #427055; }
.order-line small, small.meta { display: block; }
.order-line small { font-size: 12px; color: #63748a; }
.order-line + .order-line, .returned-parcel + .returned-parcel { margin-top: 5px; }
.returned-parcel { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.transactions { padding-top: 7px; border-top: 1px solid #e5e9ef; }
.transactions > summary { color: #536a82; }
.evidence-image { display: block; max-width: 100%; max-height: 65vh; object-fit: contain; margin: auto; }
</style>
