<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElCheckbox, ElInput, ElOption, ElRadio, ElRadioGroup, ElSelect } from 'element-plus'
import { actionNames, escalationReasons, getReturnDetail, formatReturnTime, type ReturnRecord } from './模型'
import { formatMinor, moneyText, noLabelReasons, parseMoney, type ReturnAction, type ReturnActionDraft } from './接口契约'
import { beijingWallTimeToISO } from './展示工具'
import AttachmentUpload from './附件上传.vue'
const props = defineProps<{ row: ReturnRecord; action: ReturnAction; draft: ReturnActionDraft; error: string }>()
defineEmits<{ prepare: []; cancel: [] }>()
const detail = computed(() => getReturnDetail(props.row))
const uploading = ref(false)
const descriptions: Record<ReturnAction,string> = {
  approve: '接受买家已经提出的退货申请，按平台返回的安排继续处理。', decline: '仅在平台允许时拒绝当前申请；说明会随本次处理提交。',
  offerReturn: '接受买家的退货申请，选择本次商品处理方式。', partial: '提出部分退款报价，等待买家决定；报价提交不代表已退款。',
  refund: '核对本次退货的费用分项和金额，提交后以实际退款结果为准。', message: '留言发送到本次退货申请，与普通站内信分开。',
  escalate: '提交给 eBay 审核处理；升级成功后继续跟进关联纠纷。', provideRma: '提供买家寄回商品使用的退货授权编号。',
  receive: '向 eBay 确认已收到退货。此操作不会生成仓库入库或自动退款。', label: '提供本次申请的退货面单及物流信息。',
}
const total = computed(() => {
  const items = props.draft.refundItems.filter(item => item.selected), currency = items[0]?.currency
  if (!currency || items.some(item => item.currency !== currency)) return '—'
  let sum = 0n
  for (const item of items) { const value = parseMoney(item.value, currency); if (value === null) return '—'; sum += value }
  return `${currency} ${formatMinor(sum,currency)}`
})
const sentWall = computed({ get: () => props.draft.label.labelSentDate ? formatReturnTime(props.draft.label.labelSentDate, props.row).slice(0,16).replace(' ','T') : '', set: value => { props.draft.label.labelSentDate = beijingWallTimeToISO(value) || '' } })
const labelFiles = computed(() => detail.value.files.filter(file => file.filePurpose === 'LABEL_RELATED' && file.submitter === 'SELLER' && ['CREATED','PUBLISHED'].includes(file.fileStatus)))
const fieldText = computed(() => props.action === 'message' ? '给买家的留言' : props.action === 'escalate' ? '提交给 eBay 的介入说明' : '随本次处理提交的说明')
const saleAction = computed(() => ['approve', 'offerReturn', 'refund', 'partial'].includes(props.action))
</script>
<template>
  <div class="action-form"><h4>{{ actionNames[action] }}</h4><p class="form-description">{{ descriptions[action] }}</p>
    <div v-if="action === 'approve' || action === 'offerReturn'" class="return-arrangement"><label class="required-label">商品处理方式</label><ElRadioGroup v-model="draft.keepOriginalItem" aria-label="接受退货商品处理方式" aria-required="true"><ElRadio :value="false">买家退回商品</ElRadio><ElRadio :value="true">买家保留商品，无需寄回</ElRadio></ElRadioGroup></div>
    <div v-if="action === 'provideRma' || (action === 'approve' && detail.rmaRequired && !draft.keepOriginalItem)" class="form-row"><label for="return-rma">退货授权编号</label><ElInput id="return-rma" v-model="draft.rmaNumber" aria-label="退货授权编号" placeholder="填写提供给买家的 RMA" maxlength="100" /></div>
    <div v-if="action === 'partial'" class="partial-fields">
      <label class="required-label" for="return-partial-amount">部分退款金额</label>
      <ElInput id="return-partial-amount" v-model="draft.partialAmount" inputmode="decimal" aria-label="部分退款金额" aria-required="true" placeholder="输入报价金额">
        <template #append>{{ detail.refund.partialOfferLimit?.currency || row.currency }}</template>
      </ElInput>
      <small>报价须小于 {{ moneyText(detail.refund.partialOfferLimit) }}</small>
    </div>
    <template v-if="action === 'refund'">
      <div class="refund-edit-table">
        <div v-for="(item,index) in draft.refundItems" :key="item.refundFeeType" class="refund-edit-item">
          <ElCheckbox v-model="item.selected" :disabled="!detail.refund.items[index]?.optional" :aria-label="'退还' + (detail.refund.items[index]?.label || item.refundFeeType)">
            <span :class="{ 'required-label': !detail.refund.items[index]?.optional }">{{ detail.refund.items[index]?.label || item.refundFeeType }}</span>
          </ElCheckbox>
          <ElInput v-model="item.value" :disabled="!item.selected" inputmode="decimal" :aria-required="item.selected" :aria-label="'退款金额 ' + item.refundFeeType">
            <template #prepend>{{ item.currency }}</template>
          </ElInput>
          <small>允许范围 {{ detail.refund.items[index]?.min }} ～ {{ detail.refund.items[index]?.max }}</small>
        </div>
      </div>
      <p class="refund-total">本次退款合计 <strong>{{ total }}</strong></p>
    </template>
    <div v-if="action === 'escalate'" class="form-row"><label>介入原因</label><ElSelect v-model="draft.reason" aria-label="介入原因" placeholder="请选择介入原因"><ElOption v-for="option in escalationReasons" :key="option.value" :value="option.value" :label="option.label" /></ElSelect></div>
    <template v-if="action === 'label'"><div class="form-row"><label>面单处理方式</label><ElSelect v-model="draft.label.labelAction" aria-label="面单处理方式"><ElOption label="提供已上传的面单" value="UPLOAD_LABEL" /><ElOption label="面单已通过其他方式提供" value="MARK_AS_SENT" /><ElOption label="不提供面单，说明退回安排" value="NO_LABEL" /></ElSelect></div>
      <template v-if="draft.label.labelAction === 'UPLOAD_LABEL'"><AttachmentUpload :row="row" mode="label" @uploaded="draft.label.fileId = $event.fileId" @busy="uploading = $event" /><div class="form-row"><label>面单文件</label><ElSelect v-model="draft.label.fileId" aria-label="面单文件" placeholder="上传或选择已有退货面单"><ElOption v-for="file in labelFiles" :key="file.fileId" :value="file.fileId" :label="file.fileName" /></ElSelect></div></template>
      <template v-if="draft.label.labelAction !== 'NO_LABEL'"><div class="form-row"><label>承运商</label><ElSelect v-model="draft.label.carrierEnum" aria-label="退回承运商" placeholder="请选择承运商"><ElOption label="USPS" value="USPS" /><ElOption label="UPS" value="UPS" /></ElSelect></div><div class="form-row"><label>退货跟踪号</label><ElInput v-model="draft.label.trackingNumber" aria-label="退货跟踪号" placeholder="填写面单上的跟踪号" /></div></template>
      <div v-if="draft.label.labelAction === 'MARK_AS_SENT'" class="form-row"><label>面单发送时间</label><input v-model="sentWall" type="datetime-local" class="site-date-input" aria-label="面单发送时间" /></div>
      <div v-if="draft.label.labelAction === 'NO_LABEL'" class="form-row"><label>不提供面单原因</label><ElSelect v-model="draft.label.noLabelReason" aria-label="不提供面单原因" placeholder="请选择原因"><ElOption v-for="item in noLabelReasons" :key="item.value" :label="item.label" :value="item.value" /></ElSelect></div>
      <div class="form-row"><label>面单费用（可选）</label><ElInput v-model="draft.label.returnLabelCost" inputmode="decimal" aria-label="退货面单费用" placeholder="未提供则留空" /><span>{{ row.currency }}</span></div>
    </template>
    <AttachmentUpload v-if="action === 'message' || action === 'decline'" :key="action" :row="row" :mode="action" @busy="uploading = $event" />
    <label class="comment-label" :class="{ 'required-label': action === 'message' || action === 'escalate' }">{{ saleAction ? '对客说明（选填）' : fieldText }}</label>
    <ElInput v-model="draft.text" type="textarea" :autosize="{ minRows: saleAction ? 1 : 3, maxRows: 6 }" :maxlength="2000" :show-word-limit="!saleAction" :placeholder="saleAction ? '随本次操作提交至 eBay' : action === 'message' ? '输入发送给买家的消息' : '填写随本次操作提交的说明'" aria-label="退货退款处理说明" />
    <slot name="after-sale" />
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p><div class="form-actions"><ElButton @click="$emit('cancel')">取消</ElButton><ElButton type="primary" :disabled="uploading" @click="$emit('prepare')">确认内容</ElButton></div>
  </div>
</template>
<style scoped>
.required-label::before{content:'*';color:var(--el-color-danger);margin-right:4px}
.partial-fields{display:grid;gap:6px;margin:12px 0}
.partial-fields label{color:#546170}
.partial-fields small{font-size:11px;color:#738090}
.partial-fields :deep(.el-input-group__append){padding:0 12px}
.action-form{padding:16px;background:#f8fafc;border:1px solid #e3e9f1;border-radius:5px;font-size:12px}.action-form h4{margin:0 0 12px;color:var(--yy-text-heading);font-size:14px}.form-description{color:#909399;line-height:1.8;margin:0 0 15px}.form-row{display:flex;gap:10px;align-items:center;margin:16px 0;flex-wrap:wrap}.form-row>label{min-width:110px;color:#606266}.form-row .el-input,.form-row .el-select{width:min(300px,100%)}.form-row>span{color:#909399}.comment-label{display:block;color:#606266;margin:16px 0 9px}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.inline-error{color:#c45656;line-height:1.7}.refund-edit-table{margin-top:16px;font-size:12px;display:grid;gap:12px}.refund-edit-item{display:grid;gap:8px;padding:10px 0;border-bottom:1px solid #e3e9f1}.refund-edit-item>small{color:#909399;line-height:1.6}.refund-edit-item :deep(.el-input){width:100%}.refund-edit-item :deep(.el-input-group__prepend){padding:0 12px}.refund-edit-table :deep(.el-checkbox__label){font-size:12px}.refund-total{text-align:right;font-size:13px;color:#606266}.refund-total strong{font-size:18px;color:#303133;margin-left:12px;font-variant-numeric:tabular-nums}.site-date-input{height:32px;border:1px solid #dcdfe6;border-radius:4px;color:#606266;font-family:inherit;padding:0 10px}.action-form :deep(.el-checkbox){max-width:100%;height:auto;min-height:32px}.action-form :deep(.el-checkbox__label){white-space:normal}
</style>
<style scoped>
.return-arrangement{margin:16px 0}.return-arrangement>label{display:block;color:#606266;margin-bottom:10px}.return-arrangement :deep(.el-radio-group){display:flex;flex-direction:column;align-items:flex-start;gap:8px}.return-arrangement :deep(.el-radio){height:auto;min-height:24px;margin:0;max-width:100%}.return-arrangement :deep(.el-radio__label){font-size:12px;line-height:1.7;white-space:normal}
.refund-edit-table{margin-top:10px;gap:0}
.refund-edit-item{grid-template-columns:minmax(82px,.8fr) minmax(0,1fr);align-items:center;gap:3px 10px;padding:7px 0}
.refund-edit-item>small{grid-column:2;font-size:11px;line-height:1.5}
.refund-total{margin:10px 0 0}.refund-total strong{font-size:16px}
</style>
