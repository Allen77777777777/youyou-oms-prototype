<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus'
import { 手工店铺选项, 手工订单路由 } from '../手工订单/模型'
import WarehouseFields from '../订单处理/仓库物流选择.vue'
import { 查找所选仓库物流 } from '../订单处理/仓库物流选择模型'
import { activeAfterSaleActor, approveReship, canApproveReship, canViewAfterSale, getReshipReviewDraft, type AfterSaleRecord } from './会话'

const props = defineProps<{ record: AfterSaleRecord }>()
const emit = defineEmits<{ close: [] }>()
const draft = ref(getReshipReviewDraft(props.record))
const contactKey = !draft.value.address.telephone && draft.value.address.mobilePhone ? 'mobilePhone' : 'telephone'
const addressFields = [
  { key: 'fullName', label: '收件人', required: true, max: 100 },
  { key: contactKey, label: '联系电话', required: true, max: 40 },
  { key: 'countryCode', label: '国家 / 地区代码', required: true, max: 2 },
  { key: 'stateProvince', label: '州 / 省', required: false, max: 100 },
  { key: 'city', label: '城市', required: true, max: 100 },
  { key: 'postalCode', label: '邮编', required: true, max: 30 },
  { key: 'addressLine1', label: '详细地址', required: true, max: 300 },
  { key: 'addressLine2', label: '地址 2', required: false, max: 300 },
] as const
const additionalFields = [
  { key: 'district', label: '区 / 县', required: false, max: 100 },
  { key: 'companyName', label: '公司名称', required: false, max: 100 },
  { key: 'email', label: '电子邮箱', required: false, max: 254 },
  { key: 'mobilePhone', label: '备用电话', required: false, max: 40 },
] as const
const missingFields = addressFields.filter(field => field.required && !draft.value.address[field.key]?.trim())
const editableFields = [...addressFields, ...additionalFields.filter(field => field.key !== contactKey && draft.value.address[field.key])]
const editAddress = ref(false)
const fields = computed(() => editAddress.value ? editableFields : missingFields)
const addressText = computed(() => {
  const a = draft.value.address
  return [a.countryCode, a.stateProvince, a.city, a.district, a.addressLine1, a.addressLine2, a.postalCode].filter(Boolean).join(' · ')
})
const stores = computed(() => 手工店铺选项.value.filter(store => canViewAfterSale({ shopId: store.storeId })))
const store = computed(() => stores.value.find(entry => entry.storeId === draft.value.storeId))
const route = computed(() => 查找所选仓库物流(手工订单路由.value, draft.value.warehouse, draft.value.channel))
const editRoute = ref(!route.value || !store.value)
const submitting = ref(false)
const error = ref('')
function approve() {
  if (submitting.value) return
  submitting.value = true
  try {
    const result = approveReship(props.record.no, activeAfterSaleActor.value, draft.value)
    if (!result.ok) { error.value = result.message; return }
    ElMessage.success('重发审核通过，已生成手工订单')
    emit('close')
  } finally { submitting.value = false }
}
</script>
<template>
  <ElDialog :model-value="true" title="审核重发" width="min(660px, 96vw)" top="6vh" append-to-body destroy-on-close
    :close-on-click-modal="false" @update:model-value="value => { if (!value) emit('close') }">
    <div class="review-body">
      <div class="goods"><span>{{ record.no }}</span><strong v-for="item in record.items" :key="item.lineId">{{ item.sku || item.title }} × {{ item.quantity }}</strong></div>
      <ElForm label-position="top" size="small" @submit.prevent>
        <section>
          <div class="section-heading"><h3>收件信息</h3><ElButton link type="primary" @click="editAddress = !editAddress">{{ editAddress ? '收起' : '修改收件信息' }}</ElButton></div>
          <div v-if="!editAddress" class="summary"><strong>{{ draft.address.fullName || '收件人待补' }}</strong><span>{{ draft.address[contactKey] }}</span><p v-if="addressText">{{ addressText }}</p></div>
          <div v-if="fields.length" class="field-grid">
            <ElFormItem v-for="field in fields" :key="field.key" :label="field.label" :required="field.required" :class="{ wide: field.key.startsWith('addressLine') }">
              <ElInput :model-value="draft.address[field.key]" :aria-label="'重发' + field.label" :maxlength="field.max" :placeholder="field.key === 'countryCode' ? '如 US' : '请输入' + field.label"
                @update:model-value="value => draft.address[field.key] = field.key === 'countryCode' ? value.toUpperCase() : value" />
            </ElFormItem>
          </div>
        </section>
        <section>
          <div class="section-heading"><h3>发货安排</h3><ElButton v-if="store && route" link type="primary" @click="editRoute = !editRoute">{{ editRoute ? '收起' : '修改发货安排' }}</ElButton></div>
          <template v-if="editRoute">
            <ElFormItem label="发货店铺" required><ElSelect v-model="draft.storeId" aria-label="发货店铺" placeholder="请选择发货店铺"><ElOption v-for="option in stores" :key="option.storeId" :label="option.storeName" :value="option.storeId" /></ElSelect></ElFormItem>
            <WarehouseFields class="field-grid" :routes="手工订单路由" v-model:warehouse="draft.warehouse" v-model:channel="draft.channel" />
          </template>
          <div v-else class="summary"><strong>{{ store?.storeName }}</strong><span>{{ route?.warehouse }} · {{ route?.shippingChannel }}</span><p>{{ route?.warehouseProvider }} · {{ route?.warehouseAccount }}</p></div>
        </section>
      </ElForm>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <template #footer><div class="review-footer"><span>通过后生成一张待 OMS 审单的手工订单</span><div><ElButton @click="emit('close')">取消</ElButton><ElButton type="primary" :disabled="!canApproveReship(record) || submitting" @click="approve">确认审核通过</ElButton></div></div></template>
  </ElDialog>
</template>

<style scoped>
.review-body { max-height: 63vh; overflow: auto; padding-right: 4px; font-size: 13px; }
.goods { display: flex; flex-wrap: wrap; gap: 6px 14px; background: #f1f6fb; border-radius: 4px; padding: 9px 12px; color: #465970; }
.goods span { color: #62758a; } .goods strong { font-weight: 500; }
section { padding: 13px 0 4px; } section + section { border-top: 1px solid #e6ebf1; margin-top: 6px; }
.section-heading,.review-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { font-size: 14px; margin: 0; color: #303e50; }
.section-heading { min-height: 25px; margin-bottom: 7px; }
.summary { line-height: 1.7; margin-bottom: 6px; overflow-wrap: anywhere; }
.summary strong { margin-right: 12px; color: #38475a; }
.summary p { margin: 2px 0 0; color: #627082; }
.field-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 12px; }
.wide { grid-column: 1 / -1; } .review-body :deep(.el-form-item) { margin-bottom: 9px; }
.review-body :deep(.el-form-item__label) { margin-bottom: 4px; font-size: 12px; }
.review-footer { flex-wrap: wrap; text-align: left; }
.review-footer span { color: #647183; font-size: 12px; }
.error { background: #fdf1ee; color: #aa3b2e; border-radius: 4px; margin: 7px 0 0; padding: 8px 10px; }
</style>
