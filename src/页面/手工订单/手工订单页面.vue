<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ElButton, ElForm, ElFormItem, ElInput, ElInputNumber, ElSelect, ElOption, ElCheckbox, ElAlert, ElMessage, ElMessageBox } from 'element-plus'
import { 手工订单场景, 手工订单币种, 手工商品资料, 手工店铺选项, 手工订单路由, 可关联原订单, 原订单关联阻断原因, 创建手工订单草稿, 创建手工订单, 校验手工订单 } from './模型'
import WarehouseShippingFields from '../订单处理/仓库物流选择.vue'
import { 共享订单 } from '../订单处理/演示会话'
import { 订单备注字数上限 } from '../订单处理/订单备注模型'
import { 手工建单界面 as session } from './界面会话'
import { 手工订单标注 as annotation } from './标注'
import './样式.css'

const router = useRouter()
const editorBody = ref<HTMLElement>(), submitting = ref(false), errors = ref<string[]>([])
const countries = [{ value: 'US', label: '美国 US' }, { value: 'GB', label: '英国 GB' }, { value: 'DE', label: '德国 DE' }, { value: 'FR', label: '法国 FR' }, { value: 'CA', label: '加拿大 CA' }, { value: 'AU', label: '澳大利亚 AU' }, { value: 'JP', label: '日本 JP' }, { value: 'KR', label: '韩国 KR' }, { value: 'MX', label: '墨西哥 MX' }, { value: 'BR', label: '巴西 BR' }, { value: 'RU', label: '俄罗斯 RU' }, { value: 'PL', label: '波兰 PL' }, { value: 'IT', label: '意大利 IT' }, { value: 'ES', label: '西班牙 ES' }, { value: 'NL', label: '荷兰 NL' }]
const originalOptions = computed(() => 可关联原订单.value.filter(order => !原订单关联阻断原因(order.systemOrderNo).length))
const draft = computed(() => session.draft)
const tagOptions = computed(() => [...new Set(共享订单.value.flatMap(order => order.tags).map(tag => tag.trim()).filter(tag => tag && tag.length <= 20))])
if (!draft.value.items.length) draft.value.items.push({ systemSku: '', quantity: 1 })
const itemCount = computed(() => draft.value.items.filter(item => item.systemSku).reduce((sum, item) => sum + (Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0), 0))
async function clearDraft() {
  if (submitting.value) return
  try { await ElMessageBox.confirm('清空本次已填写的建单信息？', '清空表单', { confirmButtonText: '清空', cancelButtonText: '保留', type: 'warning' }) } catch { return }
  session.draft = 创建手工订单草稿(); session.draft.items.push({ systemSku: '', quantity: 1 }); errors.value = []
}
function productName(sku: string) { return 手工商品资料.find(item => item.systemSku === sku)?.systemItemName ?? '' }
function showErrors() { void nextTick(() => { editorBody.value?.scrollTo?.({ top: 0, behavior: 'smooth' }) }) }
async function submit() {
  if (submitting.value) return
  errors.value = 校验手工订单(draft.value)
  if (errors.value.length) { showErrors(); return void ElMessage.warning('请完善必填信息后创建') }
  submitting.value = true
  try {
    const result = 创建手工订单(draft.value)
    if (!result.成功 || !result.订单) { errors.value = [result.信息]; showErrors(); return }
    const systemOrderNo = result.订单.systemOrderNo
    session.draft = 创建手工订单草稿(); errors.value = []
    ElMessage.success('订单已创建，已进入待审核')
    await router.push({ name: 'oms-order-processing', query: { systemOrderNo } })
  } finally { submitting.value = false }
}
</script>

<template>
  <main class="manual-create-page" v-prototype="annotation('overview', '手工订单创建入口')">
    <header class="manual-page-header"><h2>手工订单</h2><span>填写本次发货资料，创建后进入订单处理</span></header>
    <div ref="editorBody" class="manual-editor-scroll">
      <div class="manual-editor-body" v-prototype="annotation('form', '手工订单录入表单')">
        <ElAlert v-if="errors.length" title="请完善以下信息" type="error" :closable="false" show-icon><ul class="manual-errors"><li v-for="error in errors" :key="error">{{ error }}</li></ul></ElAlert>
        <ElForm label-position="top" @submit.prevent="submit">
          <section class="manual-form-section"><h3>业务信息</h3><div class="manual-form-grid">
            <ElFormItem label="业务场景" required><ElSelect v-model="draft.scenario" aria-label="业务场景"><ElOption v-for="scenario in 手工订单场景" :key="scenario" :label="scenario" :value="scenario" /></ElSelect></ElFormItem>
            <ElFormItem label="发货店铺" required v-prototype="annotation('store', '手工订单发货店铺')"><ElSelect v-model="draft.storeId" filterable clearable placeholder="请选择发货店铺" aria-label="发货店铺"><ElOption v-for="store in 手工店铺选项" :key="store.storeId" :value="store.storeId" :label="`${store.storeName} · ${store.platformCode}`" /></ElSelect></ElFormItem>
            <ElFormItem label="关联原订单" :required="draft.scenario === '售后补寄'"><ElSelect v-model="draft.originalOrderNo" clearable filterable placeholder="按系统订单号搜索并选择" aria-label="关联原订单"><ElOption v-for="order in originalOptions" :key="order.systemOrderNo" :value="order.systemOrderNo" :label="`${order.systemOrderNo} · ${order.platformCode} ${order.platformOrderNo}`" /></ElSelect></ElFormItem>
            <ElFormItem class="manual-span-3" label="建单原因" required><ElInput v-model="draft.reason" aria-label="建单原因" placeholder="填写此次发货的业务原因" maxlength="500" show-word-limit /></ElFormItem>
          </div></section>
          <section class="manual-form-section" v-prototype="annotation('items', '手工订单商品')"><div class="manual-section-heading"><h3>商品信息 <small>已选 {{ draft.items.filter(item => item.systemSku).length }} 种 · 共 {{ itemCount }} 件</small></h3><ElButton link type="primary" :icon="Plus" :disabled="draft.items.length >= 50" @click="draft.items.push({ systemSku: '', quantity: 1 })">添加商品</ElButton></div>
            <div class="manual-product-header"><span>系统 SKU / 商品名称 <em>*</em></span><span>数量 <em>*</em></span><span /></div>
            <div v-for="(item, index) in draft.items" :key="index" class="manual-product-row"><div><ElSelect v-model="item.systemSku" filterable placeholder="选择系统 SKU" :aria-label="`第${index + 1}行系统SKU`"><ElOption v-for="product in 手工商品资料" :key="product.systemSku" :label="`${product.systemSku} · ${product.systemItemName}`" :value="product.systemSku" :disabled="draft.items.some((other, position) => position !== index && other.systemSku === product.systemSku)" /></ElSelect><span v-if="item.systemSku" class="manual-product-name">{{ productName(item.systemSku) }}</span></div><ElInputNumber v-model="item.quantity" :min="1" :max="9999" :precision="0" controls-position="right" :aria-label="`第${index + 1}行数量`" /><ElButton link type="danger" :icon="Delete" :aria-label="`移除第${index + 1}行商品`" @click="draft.items.splice(index, 1)" /></div>
            <div class="manual-money-row"><ElFormItem label="订单金额（选填）"><ElInput v-model="draft.amount" aria-label="订单金额" placeholder="填写金额" inputmode="decimal" /></ElFormItem><ElFormItem label="币种"><ElSelect v-model="draft.currency" aria-label="币种" clearable placeholder="请选择"><ElOption v-for="currency in 手工订单币种" :key="currency" :value="currency" :label="currency" /></ElSelect></ElFormItem><ElCheckbox v-if="draft.scenario === '线下销售'" v-model="draft.paidConfirmed" aria-label="已确认收到货款">已确认收到货款</ElCheckbox></div>
          </section>
          <section class="manual-form-section" v-prototype="annotation('address', '本次发货收件信息')"><h3>收件信息</h3><div class="manual-form-grid">
            <ElFormItem label="收件人" required><ElInput v-model="draft.address.fullName" aria-label="收件人" maxlength="100" /></ElFormItem>
            <ElFormItem label="联系电话" required><ElInput v-model="draft.address.telephone" aria-label="联系电话" required maxlength="40" /></ElFormItem>
            <ElFormItem label="国家 / 地区" required><ElSelect v-model="draft.address.countryCode" aria-label="国家地区" filterable placeholder="请选择"><ElOption v-for="country in countries" :key="country.value" :value="country.value" :label="country.label" /></ElSelect></ElFormItem>
            <ElFormItem label="州 / 省"><ElInput v-model="draft.address.stateProvince" aria-label="州省" maxlength="100" /></ElFormItem>
            <ElFormItem label="城市" required><ElInput v-model="draft.address.city" aria-label="城市" maxlength="100" /></ElFormItem>
            <ElFormItem label="邮编" required><ElInput v-model="draft.address.postalCode" aria-label="邮编" maxlength="30" /></ElFormItem>
            <ElFormItem label="收件公司（选填）"><ElInput v-model="draft.address.companyName" aria-label="收件公司" maxlength="100" /></ElFormItem>
            <ElFormItem class="manual-span-2" label="邮箱（选填）"><ElInput v-model="draft.address.email" aria-label="收件邮箱" maxlength="254" placeholder="用于本次收件联系" /></ElFormItem>
            <ElFormItem class="manual-span-3" label="地址 1" required><ElInput v-model="draft.address.addressLine1" aria-label="地址1" placeholder="街道、门牌号等" maxlength="300" /></ElFormItem>
            <ElFormItem class="manual-span-3" label="地址 2"><ElInput v-model="draft.address.addressLine2" aria-label="地址2" placeholder="公寓、楼层等补充信息（选填）" maxlength="300" /></ElFormItem>
          </div></section>
          <section class="manual-form-section" v-prototype="annotation('routing', '本次发货仓库与物流')"><h3>发货信息</h3>
            <WarehouseShippingFields :key="draft.requestId" :routes="手工订单路由" v-model:warehouse="draft.warehouse" v-model:channel="draft.channel" />
          </section>
          <section class="manual-form-section" v-prototype="annotation('notes', '订单备注与标签')"><h3>备注与标签</h3><div class="manual-form-grid">
            <ElFormItem class="manual-span-3" label="订单标签（选填）"><ElSelect v-model="draft.tags" aria-label="订单标签" multiple filterable allow-create default-first-option :multiple-limit="10" placeholder="选择或输入标签，回车添加；最多10个，每个20字"><ElOption v-for="tag in tagOptions" :key="tag" :value="tag" :label="tag" /></ElSelect></ElFormItem>
            <ElFormItem class="manual-span-3" label="订单备注（选填）"><ElInput v-model="draft.note" type="textarea" :rows="3" :maxlength="订单备注字数上限" show-word-limit aria-label="订单备注" placeholder="填写内部交接或本次发货的补充说明" /></ElFormItem>
          </div></section>
        </ElForm>
      </div>
    </div>
    <footer class="manual-page-footer"><div class="manual-editor-footer"><ElButton :disabled="submitting" @click="clearDraft">清空表单</ElButton><span>创建后进入待审核，审核通过后安排发货</span><ElButton type="primary" :loading="submitting" v-prototype="annotation('submit', '创建并进入订单处理')" @click="submit">创建并进入订单处理</ElButton></div></footer>
  </main>
</template>
