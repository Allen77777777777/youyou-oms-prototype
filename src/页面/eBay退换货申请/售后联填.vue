<script setup lang="ts">
import { computed, watch } from 'vue'
import { ElFormItem, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import { afterSaleReasons } from '../售后单管理/会话'
import { directRefundCoverage, returnSaleItem, type ReturnSaleDraft } from './售后联动'
import type { ReturnActionDraft } from './接口契约'
import type { ReturnRecord } from './模型'
import { returnAnnotation as annotation } from './标注'

const props = defineProps<{
  row: ReturnRecord
  draft: ReturnSaleDraft
  kind: string
  hasError?: boolean
  originalOrder?: string
  refundItems?: ReturnActionDraft['refundItems']
}>()
const item = computed(() => returnSaleItem(props.row))
const coverage = computed(() => props.refundItems && directRefundCoverage(props.row, props.refundItems))
const kindLabel = computed(() => props.refundItems ? props.draft.refundScope || '退款' : props.kind)
watch(coverage, (value, oldValue) => {
  if (value) props.draft.refundScope = value
  else if (oldValue) props.draft.refundScope = ''
}, { immediate: true })
</script>
<template>
  <section v-prototype="annotation('after-sale-fields')" class="sale-fields" aria-label="售后单信息">
    <header class="sale-heading"><h4>售后单信息</h4><span class="sale-kind">{{ kindLabel }}</span></header>
    <div class="sale-item">
      <strong>{{ item.title }}</strong>
      <div class="sale-identity">
        <span>系统 SKU <b>{{ item.sku || '待核实' }}</b></span>
        <span v-if="originalOrder">原订单 <b>{{ originalOrder }}</b></span>
      </div>
    </div>
    <div class="sale-inputs">
      <ElFormItem v-if="refundItems && !coverage" label="退款类型" required class="wide">
        <ElSelect v-model="draft.refundScope" aria-label="退款类型" aria-required="true" placeholder="核实后选择">
          <ElOption label="全额退款" value="全额退款" /><ElOption label="部分退款" value="部分退款" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="系统售后原因" required :class="{ 'is-error': hasError && !draft.reason }">
        <ElSelect v-model="draft.reason" aria-label="系统售后原因" aria-required="true" :aria-invalid="hasError && !draft.reason" placeholder="请选择售后原因" filterable clearable>
          <ElOption v-for="reason in afterSaleReasons" :key="reason" :value="reason" :label="reason" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="本次数量" required>
        <div v-if="kind === '退货' && !refundItems" class="sale-fixed-qty" aria-label="售后本次数量">{{ row.quantity == null ? '待核实' : row.quantity + ' 件' }}</div>
        <ElInputNumber v-else v-model="draft.quantity" :min="1" :max="row.quantity || undefined" :precision="0" controls-position="right" aria-label="售后本次数量" aria-required="true" />
      </ElFormItem>
      <ElFormItem label="内部备注（选填）" class="wide">
        <ElInput v-model="draft.note" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" resize="vertical" maxlength="500" aria-label="售后单备注" placeholder="仅在售后单中保存" />
      </ElFormItem>
    </div>
  </section>
</template>
<style scoped>
.sale-fields{min-width:0;margin:14px 0 0;padding:13px 14px;border:1px solid #dfe5ed;border-radius:6px;background:#fff;color:#303b49;font-size:12px}
.sale-heading,.sale-identity{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.sale-heading h4{margin:0;font-size:13px;font-weight:600;color:var(--yy-text-heading,#202936)}
.sale-kind{padding:2px 7px;border-radius:3px;color:#316dad;background:#edf4fc;font-size:11px;line-height:16px}
.sale-item{padding:10px 0;border-bottom:1px solid #edf0f4;overflow-wrap:anywhere}
.sale-item>strong{font-size:12px;font-weight:500;line-height:1.5}
.sale-identity{gap:2px 14px;margin-top:3px;color:#7a8696;font-size:11px;line-height:1.6}
.sale-identity b{margin-left:3px;font-weight:400;color:#515f71}
.sale-inputs{display:grid;grid-template-columns:minmax(0,1fr) minmax(90px,32%);gap:10px 12px;margin-top:11px}
.sale-inputs .wide{grid-column:1/-1}
.sale-inputs :deep(.el-form-item){display:block;min-width:0;margin:0}
.sale-inputs :deep(.el-form-item__label){display:block;height:auto;padding:0;margin:0 0 5px;color:#546170;font-size:12px;line-height:16px;text-align:left}
.sale-inputs :deep(.el-form-item__content){display:block;margin-left:0!important;min-width:0}
.sale-inputs :deep(.el-select),.sale-inputs :deep(.el-input-number){width:100%;min-width:0}
.sale-inputs :deep(.el-textarea__inner){font-size:12px}
.sale-fixed-qty{box-sizing:border-box;min-height:32px;padding:0 10px;border:1px solid #e4e8ed;border-radius:4px;background:#f7f9fb;line-height:30px;color:#526275;font-size:13px}
</style>
