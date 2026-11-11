<script setup lang="ts">
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, ref, toRefs } from 'vue'
import { ElButton, ElCheckbox, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import { actionLabels, availableActions, submitAction, validateAction, type ActionCode, type ActionDraft, type DisputeRecord } from './模型'
import { allPaymentFiles, evidenceLabel, fileRequests, isPaymentDecision, knownPaymentRevision, requestCoverage } from './支付争议证据'
import { actionView, handlingBasis } from './办理会话'
import OriginalTrackingPicker from './选择原单跟踪.vue'
import RefundBreakdown from './退款明细.vue'
import { normalizedInquiryTrackings } from './办理接口边界'
import type { OriginalTracking } from './原单跟踪'

const props = defineProps<{ record: DisputeRecord; action: ActionCode }>()
const emit = defineEmits<{ close: []; submitted: []; reload: []; evidence: [] }>()
const view = actionView(props.record, props.action)
const { revision, draft, address } = view
const { parcels, attachments, prepared } = toRefs(view)
const confirmed = ref(false)
const requiresReview = computed(() => ['REFUND','ESCALATE','APPEAL','ACCEPT','ACCEPT_RETURN','CONTEST'].includes(props.action))
const description: Record<ActionCode, string> = {
  TRACKING: '核对实际发运的包裹，提交后将更新本请求的物流信息。',
  MESSAGE: '买家将在这条未收到货请求中看到你的回复。',
  REFUND: '按平台的卖家侧估算申请全额退款，实际金额和退款结果以回执为准。',
  ESCALATE: '将尚未解决的问题提交给 eBay，受理后可进入关联案件继续跟进。',
  APPEAL: '说明原裁决遗漏的新事实，提交给 eBay 复核。',
  ACCEPT: '同意买家的支付争议，后续跟进平台的退款及结案记录。',
  ACCEPT_RETURN: '同意争议并要求退回商品，买家将按本次地址寄回。',
  EVIDENCE: '按平台要求归集材料。完成后可以继续补充，或正式提交抗辩。',
  CONTEST: '向付款机构提出异议。正式抗辩后，本次已归集的证据将锁定。',
}
const normalLabel = computed(() => ({ TRACKING: '提交跟踪信息', MESSAGE: '发送请求内留言', EVIDENCE: '归集证据' } as Partial<Record<ActionCode,string>>)[props.action])
const confirmLabel = computed(() => ({
  REFUND: '确认申请全额退款', ESCALATE: '确认请求介入', APPEAL: '确认提交申诉', ACCEPT: '确认接受争议',
  ACCEPT_RETURN: '确认接受并要求退回', CONTEST: '确认正式抗辩',
} as Partial<Record<ActionCode, string>>)[props.action])
const error = ref('')
const evidenceForm = computed(() => props.action === 'CONTEST' || props.action === 'EVIDENCE')
const needsAddress = computed(() => props.action === 'ACCEPT_RETURN' || (props.action === 'CONTEST' && props.record.payment?.reasonCode === 'SIGNIFICANTLY_NOT_AS_DESCRIBED'))
const moneyAction = computed(() => ['ACCEPT', 'ACCEPT_RETURN', 'REFUND'].includes(props.action))
const platformStale = computed(() => isPaymentDecision(props.action) &&
  (!knownPaymentRevision(draft.platformRevision) || draft.platformRevision !== props.record.payment?.platformRevision))
const stale = computed(() => {
  const latest = handlingBasis(props.record, props.action)
  return revision !== props.record.revision || platformStale.value || latest.amount !== view.basis.amount || latest.refundBreakdown !== view.basis.refundBreakdown || latest.decisionId !== view.basis.decisionId ||
    latest.decision !== view.basis.decision || !availableActions(props.record).includes(props.action)
})
const amount = computed(() => view.basis.amount)

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files || [])
  input.value = ''
  if (!selected.length) return
  if (selected.some(file => !/\.(jpe?g|png)$/i.test(file.name) || file.size === 0 || (file.type && !['image/jpeg', 'image/png'].includes(file.type)))) {
    error.value = '请选择有内容的 JPG 或 PNG 图片'; return
  }
  const files = [...new Map([...attachments.value, ...selected].map(file => [[file.name, file.size, file.lastModified].join('|'), file])).values()]
  if (files.length > 5) { error.value = '最多可选择 5 份举证图片'; return }
  attachments.value = files
  error.value = ''
}
function pickTracking(source: OriginalTracking) {
  const tracking = source.tracking.trim()
  if (!tracking) return
  const same = parcels.value.find(parcel => parcel.tracking.trim() === tracking)
  if (same) {
    if (!same.carrier.trim()) same.carrier = source.carrier?.trim() || ''
    if (!same.carrierCode?.trim() && source.carrierCode) {
      same.carrierCode = source.carrierCode
      same.unsupportedCarrierName = source.unsupportedCarrierName
    }
    ElMessage.info('该跟踪号已在包裹 ' + (parcels.value.indexOf(same) + 1) + ' 中')
    error.value = ''
    return
  }
  const free = parcels.value.find(parcel => !parcel.tracking.trim())
  if (free) {
    free.tracking = tracking
    if (!free.carrier.trim()) free.carrier = source.carrier?.trim() || ''
    if (!free.carrierCode?.trim() && source.carrierCode) {
      free.carrierCode = source.carrierCode
      free.unsupportedCarrierName = source.unsupportedCarrierName
    }
  } else parcels.value.push({ tracking, carrier: source.carrier?.trim() || '', carrierCode: source.carrierCode, unsupportedCarrierName: source.unsupportedCarrierName })
  ElMessage.success(source.carrier || free?.carrier?.trim() ? '已带入原单跟踪号' : '已带入跟踪号，请填写实际承运商')
  error.value = ''
}

function prepare() {
  if (stale.value) { error.value = '办理资格已变化，请关闭后重新核对'; return }
  if (props.action === 'TRACKING') {
    if (parcels.value.some(item => !item.carrierCode?.trim())) { error.value = '请填写每个包裹的平台承运商代码；其他承运商使用 UNSUPPORTED 并填写名称'; return }
    draft.trackings = normalizedInquiryTrackings({ trackings: parcels.value.map(item => ({ ...item,
      carrierCode: item.carrierCode?.trim(), carrier: item.carrierCode === 'UNSUPPORTED' ? item.unsupportedCarrierName || '' : item.carrierCode || '',
    })) })
  }
  const addressParts = Object.values(address).map(value => value.trim())
  const required = [address.recipient, address.phone, address.street, address.city, address.country]
  if ((needsAddress.value || addressParts.some(Boolean)) && required.some(value => !value.trim())) { error.value = '请补全退回地址，包括收件人、电话、街道、城市和国家'; return }
  if (address.country && !/^[A-Z]{2}$/.test(address.country.trim())) { error.value = '国家请填写两位大写代码，如 GB'; return }
  if (address.phone && !/^\d+$/.test(address.phone.trim())) { error.value = '联系电话请使用连续数字'; return }
  if (address.phoneCountry && !/^[A-Z]{2}$/.test(address.phoneCountry.trim())) { error.value = '电话国家请填写两位大写代码'; return }
  draft.returnAddress = addressParts.filter(Boolean).join(' · ')
  if (draft.returnAddress) {
    draft.paymentReturnAddress = {
      fullName: address.recipient.trim(), addressLine1: address.street.trim(), city: address.city.trim(), country: address.country.trim(),
      addressLine2: address.street2.trim() || undefined, county: address.county.trim() || undefined,
      stateOrProvince: address.region.trim() || undefined, postalCode: address.postal.trim() || undefined,
      primaryPhone: { number: address.phone.trim(), countryCode: address.phoneCountry.trim() || undefined },
    }
  } else draft.paymentReturnAddress = undefined
  const payload = { ...draft, evidenceFiles: props.action === 'EVIDENCE' ? attachments.value : undefined }
  const invalid = validateAction(props.record, props.action, payload)
  if (invalid) { error.value = invalid; return }
  if (requiresReview.value) {
    prepared.value = payload
    confirmed.value = false
    error.value = ''
    return
  }
  submit(payload)
}
function submit(payload: ActionDraft) {
  if (stale.value) { prepared.value = null; error.value = '办理资格已变化，请关闭后重新核对'; return }
  if (moneyAction.value && !confirmed.value) { error.value = '请先核对金额并勾选确认'; return }
  const failure = submitAction(props.record, props.action, payload, revision)
  if (failure) { prepared.value = null; error.value = failure; return }
  prepared.value = null
  ElMessage.success(props.record.pending ? '已记录提交，请刷新核查结果' : '本次办理已记录')
  emit('submitted')
}
const buyerPageActive = useBuyerPageActive()
</script>

<template>
  <div class="action-form">
    <h3>{{ actionLabels[action] }}</h3>
    <p class="form-description">{{ description[action] }}</p>
    <ElForm label-position="top" class="dispute-form" @submit.prevent="prepare" @input="error = ''">
      <template v-if="action === 'TRACKING'">
        <OriginalTrackingPicker :record="record" @pick="pickTracking" />
        <div v-for="(pkg,i) in parcels" :key="i" class="tracking-row">
          <div class="package-title"><b>包裹 {{ i + 1 }}</b><ElButton v-if="parcels.length > 1" link size="small" @click="parcels.splice(i,1)">移除此行</ElButton></div>
          <ElFormItem label="承运商代码" required><ElInput v-model="pkg.carrierCode" :aria-label="'包裹 ' + (i + 1) + ' 承运商'" placeholder="平台承运商代码" /></ElFormItem>
          <ElFormItem label="跟踪号" required><ElInput v-model="pkg.tracking" :aria-label="'包裹 ' + (i + 1) + ' 跟踪号'" maxlength="500" placeholder="本请求对应的包裹跟踪号" /></ElFormItem>
          <div class="carrier-options"><ElCheckbox :model-value="pkg.carrierCode === 'UNSUPPORTED'" :aria-label="'包裹 ' + (i + 1) + ' 其他承运商'" @change="pkg.carrierCode = $event ? 'UNSUPPORTED' : ''">其他承运商</ElCheckbox><small v-if="pkg.carrier && !pkg.carrierCode">已知名称：{{ pkg.carrier }}，请核对代码。</small></div>
          <ElFormItem v-if="pkg.carrierCode === 'UNSUPPORTED'" class="other-carrier" label="其他承运商名称" required><ElInput v-model="pkg.unsupportedCarrierName" :aria-label="'包裹 ' + (i + 1) + ' 其他承运商名称'" placeholder="填写实际承运商名称" /></ElFormItem>
        </div>
        <ElButton class="add-tracking" size="small" plain @click="parcels.push({ carrier: '', tracking: '' })">添加包裹</ElButton>
      </template>
      <ElFormItem v-if="action === 'MESSAGE'" label="给买家的留言（本请求内）" required><ElInput v-model="draft.message" aria-label="给买家的留言" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="填写对本次未收到货请求的答复" /></ElFormItem>
      <template v-if="action === 'APPEAL'">
        <div class="appeal-decision"><span>原裁决</span><strong>{{ view.basis.decision }}</strong></div>
        <ElFormItem label="新证据说明" required><ElInput v-model="draft.message" aria-label="新证据说明" type="textarea" :rows="4" placeholder="说明原裁决未考虑的新事实，以及相应证明" /></ElFormItem>
        <p class="attachment-guide">如需提交原始图片或文件，请按 Seller Hub 中该案的要求提供。</p>
      </template>
      <template v-if="action === 'ESCALATE'">
        <ElFormItem label="介入原因" required><ElSelect v-model="draft.reason" aria-label="介入原因" placeholder="选择本请求可用的原因"><ElOption v-for="option in record.inquiry?.referralOptions || []" :key="option.code" :label="option.label" :value="option.code" /></ElSelect></ElFormItem>
      </template>
      <div v-if="moneyAction" class="amount-row"><span>{{ action === 'REFUND' ? '本次预计退款（以平台回执为准）' : '本次争议金额' }}</span><strong>{{ amount }}</strong></div>
      <RefundBreakdown v-if="action === 'REFUND' && record.inquiry?.refundEstimateBreakdown" :amounts="record.inquiry.refundEstimateBreakdown" estimated />
      <fieldset v-if="needsAddress || action === 'CONTEST'" class="return-address"><legend>退回地址{{ needsAddress ? '（必填）' : '（要求退回时填写）' }}</legend><div>
        <ElInput v-model="address.recipient" aria-label="收件人" placeholder="收件人" /><ElInput v-model="address.phone" aria-label="联系电话" placeholder="联系电话" />
        <ElInput v-model="address.street" class="street" aria-label="街道地址" placeholder="街道与门牌号" /><ElInput v-model="address.street2" class="street" aria-label="地址第二行" placeholder="地址第二行：楼层／单元（选填）" /><ElInput v-model="address.city" aria-label="城市" placeholder="城市／地区" />
        <ElInput v-model="address.county" aria-label="县或郡" placeholder="县／郡（适用时填写）" />
        <ElInput v-model="address.region" aria-label="州或省" placeholder="州／省（适用时填写）" /><ElInput v-model="address.postal" aria-label="邮编" placeholder="邮编（适用时填写）" />
        <ElInput v-model="address.country" aria-label="国家" placeholder="国家代码，例如 GB" maxlength="2" /><ElInput v-model="address.phoneCountry" aria-label="电话国家" placeholder="电话国家代码（跨国退回时填写）" maxlength="2" />
      </div></fieldset>
      <template v-if="evidenceForm">
        <ElFormItem v-if="action === 'EVIDENCE'" label="对应举证要求" required><ElSelect v-model="draft.evidenceRequest" aria-label="对应举证要求"><ElOption v-for="request in fileRequests(record)" :key="request.key" :value="request.key" :label="evidenceLabel(request.type) + ' · ' + request.lines.map(line => line.lineItemId).join('、')" /></ElSelect></ElFormItem>
        <ElFormItem :label="action === 'CONTEST' ? '卖家抗辩说明（提交平台）' : '材料说明（仅内部）'"><ElInput v-model="draft.evidenceNote" aria-label="证据说明" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="填写与争议商品和举证材料有关的说明" /></ElFormItem>
        <div v-if="action === 'CONTEST'" class="review-evidence"><b>本次抗辩材料</b>
          <p v-for="request in record.payment?.details?.requests" :key="request.key">{{ evidenceLabel(request.type) }} · {{ requestCoverage(record, request) }}</p>
          <p v-if="!record.payment?.details?.requests.length">当前未返回具体举证要求。</p>
          <ElButton v-if="availableActions(record).includes('EVIDENCE')" link type="primary" @click="emit('evidence')">去准备证据</ElButton>
        </div>
        <ElFormItem v-if="action === 'EVIDENCE'" label="举证附件"><div class="file-picker"><label><span>选择图片</span><input aria-label="选择举证图片" type="file" accept=".jpg,.jpeg,.png" multiple @change="selectFiles" /></label><small>JPG、PNG，最多 5 份，合计不超过 1.5 MB</small></div>
          <ul v-if="attachments.length" class="file-list"><li v-for="(file,index) in attachments" :key="file.name + file.size + file.lastModified"><span>{{ file.name }}</span><ElButton link size="small" type="primary" :aria-label="'移除 ' + file.name" @click="attachments.splice(index,1)">移除</ElButton></li></ul>
        </ElFormItem>
      </template>
      <p v-if="!prepared && (stale || error)" class="action-error" role="alert">{{ platformStale ? '支付争议的平台版本已变化或尚未取得，请重新核对当前资格。' : stale ? '本案已更新，请重新核对当前资格。' : error }}</p>
    </ElForm>
    <div class="form-actions"><ElButton @click="emit('close')">取消</ElButton>
      <ElButton v-if="stale && availableActions(record).includes(action)" plain @click="emit('reload')">重新核对当前资格</ElButton>
      <ElButton type="primary" :disabled="stale" @click="prepare">{{ requiresReview ? '确认内容' : normalLabel }}</ElButton></div>
    <ElDialog v-if="prepared" :model-value="buyerPageActive" :title="'确认' + actionLabels[action]" width="min(490px,94vw)" append-to-body :close-on-click-modal="false" @close="buyerPageActive && (prepared = null)">
      <dl class="confirmation"><dt>办理对象</dt><dd>{{ record.id }}</dd><dt>店铺 / 买家</dt><dd>{{ record.shopName }} · <BuyerLink :shop-id="record.shopId" :buyer-id="record.buyer" /></dd>
        <template v-if="moneyAction"><dt>{{ action === 'REFUND' ? '本次预计退款' : '争议金额' }}</dt><dd class="confirm-amount">{{ amount }}</dd></template>
        <template v-if="action === 'ESCALATE'"><dt>介入原因</dt><dd>{{ record.inquiry?.referralOptions?.find(item => item.code === prepared?.reason)?.label || prepared.reason }}</dd></template>
        <template v-if="action === 'APPEAL'"><dt>原裁决</dt><dd>{{ view.basis.decision }}</dd><dt>新证据说明</dt><dd>{{ prepared.message }}</dd></template>
        <template v-if="action === 'CONTEST'"><dt>争议金额</dt><dd>{{ amount }}</dd><dt>抗辩材料</dt><dd>
          <div v-for="file in allPaymentFiles(record)" :key="file.evidenceId + ':' + (file.fileId || file.name)">{{ file.name }}</div>
          <div v-for="parcel in record.payment?.details?.deliveryEvidence" :key="parcel.requestKey + parcel.carrier + parcel.tracking">{{ parcel.carrier }} · {{ parcel.tracking }}</div>
          <span v-if="!allPaymentFiles(record).length && !record.payment?.details?.deliveryEvidence?.length">本次无附加材料</span>
        </dd><dt v-if="prepared.evidenceNote">卖家抗辩说明</dt><dd v-if="prepared.evidenceNote">{{ prepared.evidenceNote }}</dd></template>
        <template v-if="prepared.returnAddress"><dt>退回地址</dt><dd>{{ prepared.returnAddress }}</dd></template>
      </dl>
      <RefundBreakdown v-if="action === 'REFUND' && record.inquiry?.refundEstimateBreakdown" :amounts="record.inquiry.refundEstimateBreakdown" estimated />
      <p class="review-effect">{{ description[action] }}</p>
      <ElCheckbox v-if="moneyAction" v-model="confirmed" @change="error = ''">{{ action === 'REFUND' ? '已核对退款金额和币种' : '已核对争议金额，同意接受此争议' }}</ElCheckbox>
      <p v-if="error || stale" role="alert" class="action-error">{{ stale ? '资料或办理资格已变化，请返回重新核对。' : error }}</p>
      <template #footer><ElButton @click="prepared = null">返回修改</ElButton><ElButton type="primary" :disabled="stale" @click="submit(prepared!)">{{ confirmLabel }}</ElButton></template>
    </ElDialog>
  </div>
</template>

<style scoped>
.tracking-row{display:grid;grid-template-columns:1fr 1.4fr;gap:0 10px}.package-title{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e3e9f0;padding:3px 0;margin-bottom:6px}.add-tracking{margin:0 0 14px}
.carrier-options,.other-carrier{grid-column:1/-1}.carrier-options{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:-8px;margin-bottom:8px}.carrier-options small{color:#647387}
.action-form { padding:14px; background:#f7f9fc; border:1px solid #e1e7ef; border-radius:5px; min-width:0; font-size:12px; }
.action-form h3 { font-size:14px; margin:0 0 7px; color:var(--yy-text-heading); }
.form-description,.review-effect{margin:0 0 14px;color:#647387;line-height:1.7}
.form-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-top:14px}
.confirmation{display:grid;grid-template-columns:84px minmax(0,1fr);gap:9px 12px;margin:0 0 16px;line-height:1.65;font-size:13px}
.confirmation dt{color:#708095}.confirmation dd{margin:0;color:#303c49;overflow-wrap:anywhere;white-space:pre-wrap}.confirm-amount{font-size:17px;font-weight:600}
.review-effect{background:#f5f7fa;padding:9px 12px;border-radius:4px;font-size:12px}
.review-evidence { border-top:1px solid #dfe5ec; padding-top:10px; color:#53657a; line-height:1.6; }.review-evidence p{ margin:3px 0; }
.dispute-form :deep(.el-form-item) { margin-bottom: 16px; }.dispute-form :deep(.el-form-item__label) { margin-bottom: 5px; }
.return-address { padding: 0; margin: 0 0 16px; border: 0; }.return-address legend { padding: 0 0 6px; font-size: 14px; }.return-address>div { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; }.return-address .street { grid-column: 1 / -1; }
.amount-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1px solid var(--el-border-color-lighter); padding: 0 0 12px; margin-bottom: 12px; }.amount-row strong { color: var(--yy-text-heading); font-variant-numeric: tabular-nums; }
.action-error { color: var(--el-color-danger); font-size: 12px; margin: 10px 0 0; }
.appeal-decision { display: grid; grid-template-columns: 64px 1fr; gap: 10px; align-items: baseline; margin: 0 0 15px; }.appeal-decision span,.attachment-guide { color: #657386; }.attachment-guide { font-size: 12px; line-height: 1.65; margin: 0; }
.file-picker,.file-list li { display: flex; align-items: center; gap: 10px; }.file-picker label { position: relative; cursor: pointer; overflow: hidden; display: inline-flex; height: 28px; line-height: 28px; padding: 0 12px; border: 1px solid var(--el-border-color); border-radius: 4px; }
.file-picker input { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }.file-picker label:focus-within { outline: 2px solid var(--el-color-primary); }.file-picker small { color: #75808f; }
.file-list { width: 100%; list-style: none; padding: 0; margin: 5px 0 0; }.file-list li { justify-content: space-between; font-size: 12px; line-height: 1.5; padding: 4px 0; }.file-list span { overflow-wrap: anywhere; }
</style>
