<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { canViewAfterSale, createAfterSale } from '../售后单管理/会话'
import { 原订单关联阻断原因 } from '../手工订单/模型'
import { 共享订单 } from '../订单处理/演示会话'
import { resolveReturnOrder } from './关联导航'
import { createReturnSaleDraft, prepareReship, returnSaleItem, validateSaleQuantity } from './售后联动'
import { returnKey, type ReturnRecord } from './模型'
import { readReturnDetailView } from './视图会话'
import SaleFields from './售后联填.vue'
import { returnAnnotation as annotation } from './标注'

const props = defineProps<{ row: ReturnRecord }>()
const emit = defineEmits<{ close: []; submitted: [no: string] }>()
const view = readReturnDetailView(returnKey(props.row))
view.reshipWork ??= createReturnSaleDraft(props.row)
const fields = view.reshipWork
const original = computed(() => resolveReturnOrder(props.row, 共享订单.value))
const error = ref(''), submitted = ref(false)
watch(fields, () => { error.value = '' })
const blocked = computed(() => {
  if (!canViewAfterSale(props.row)) return '当前人员没有该店铺的办理权限。'
  if (props.row.detail?.contentOnHold || props.row.detail?.itemOnHold) return '申请商品资料受限，请先核实。'
  if (!original.value || !returnSaleItem(props.row).sku) return '重发需核实原系统订单及本次申请的系统 SKU。'
  return 原订单关联阻断原因(original.value.systemOrderNo).join('；')
})
function submit() {
  if (submitted.value) return
  error.value = blocked.value || validateSaleQuantity(props.row, fields)
  if (error.value) return
  const result = createAfterSale(prepareReship(props.row, fields))
  if (!result.ok || !result.record) { error.value = result.message; return }
  submitted.value = true
  ElMessage.success('重发售后单已提交审核')
  emit('submitted', result.record.no)
}
</script>
<template>
  <section v-prototype="annotation('after-sale-reship')" class="reship-form" aria-label="重发售后单">
    <h4>重发</h4>
    <p class="form-help">提交到售后单管理，审核通过后生成手工订单。</p>
    <p v-if="blocked" class="reship-error" role="alert">{{ blocked }}</p>
    <SaleFields v-else :row="row" :draft="fields" kind="重发" :original-order="original?.systemOrderNo" :has-error="!!error" />
    <p v-if="error && !blocked" class="reship-error" role="alert">{{ error }}</p>
    <div class="reship-actions"><ElButton @click="emit('close')">取消</ElButton><ElButton v-if="!blocked" type="primary" :disabled="submitted" @click="submit">提交售后单</ElButton></div>
  </section>
</template>
<style scoped>
.reship-form{min-width:0;color:#354154;font-size:12px;line-height:1.6}
.reship-form>h4{color:var(--yy-text-heading);font-size:14px;margin:0}
.form-help{color:#778495;margin:4px 0 0}
.reship-error{color:#bd4e43;overflow-wrap:anywhere}
.reship-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.reship-actions .el-button{margin:0}
</style>
