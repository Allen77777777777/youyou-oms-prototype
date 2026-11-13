<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElAlert, ElButton, ElCollapse, ElCollapseItem, ElEmpty, ElMessage, ElMessageBox, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { 读取拆单试算订单, 试算拆单规则, 拆单试算已过期, 应用拆单规则结果, 试算当前拆单草稿, 拆单草稿试算已过期, type 拆单规则试算, type 拆单草稿试算 } from './拆单规则会话'
import { 拆单标注 } from './拆单规则标注'
import SplitExecutionTrace from './拆单执行轨迹.vue'
import { 构建拆单包裹编号 } from './拆单轨迹展示'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 订单规则 } from './规则逻辑'

const props = defineProps<{ draft?: 订单规则 }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const orders = computed(() => 读取拆单试算订单())
const orderNo = ref(orders.value.find(order => order.systemOrderNo.startsWith('OMS-SPLIT'))?.systemOrderNo || orders.value[0]?.systemOrderNo || '')
const order = computed(() => orders.value.find(item => item.systemOrderNo === orderNo.value))
const result = ref<拆单规则试算 | 拆单草稿试算>()
const source = ref<全渠道订单>(), beforeCount = ref(1)
const packageNumbers = computed(() => result.value ? 构建拆单包裹编号(result.value.trace, result.value.packages) : new Map<string, string>())
const originalPackages = computed(() => {
  if (!source.value) return []
  if (source.value.ruleSplitDraft) return source.value.ruleSplitDraft.packages
  if (source.value.manualShippingPlan) return source.value.manualShippingPlan.packages
  return [{ key: 'original', items: source.value.items.map(item => ({ orderNo: source.value!.systemOrderNo, externalLineId: item.externalLineId, quantity: item.fulfillableQuantity })) }]
})
const applied = ref(false), applying = ref(false)
const stale = computed(() => !!result.value && !applied.value && (result.value.mode === 'draft'
  ? !props.draft || 拆单草稿试算已过期(result.value, props.draft)
  : 拆单试算已过期(result.value)))
const canApply = computed(() => !props.draft && result.value?.mode === 'saved' && !applied.value && !applying.value && !stale.value && result.value.splitOccurred && !result.value.errors.length)
watch(orderNo, () => { result.value = undefined; applied.value = false })
function run() {
  if (!order.value) return
  source.value = JSON.parse(JSON.stringify(order.value)) as 全渠道订单
  beforeCount.value = order.value.ruleSplitDraft?.packages.length || order.value.manualShippingPlan?.packages.length || 1
  result.value = props.draft ? 试算当前拆单草稿(orderNo.value, props.draft) : 试算拆单规则(orderNo.value)
  applied.value = false
}
function itemName(lineId: string) { const line = source.value?.items.find(item => item.externalLineId === lineId); return line?.systemItemName || line?.platformItemTitle || '商品信息待核实' }
function itemSku(lineId: string) { const line = source.value?.items.find(item => item.externalLineId === lineId); return line?.systemSku || line?.platformSku || '—' }
async function apply() {
  if (!canApply.value || !result.value || result.value.mode !== 'saved' || props.draft) return
  const snapshot = result.value
  applying.value = true
  try {
    await ElMessageBox.confirm(`将订单 ${snapshot.orderNo} 保存为 ${snapshot.packages.length} 个待分仓包裹。实际拆分后跳过合单，后续仍须逐包分仓、审单及系统默认审单。`, '保存拆分结果', { confirmButtonText: '确认保存', cancelButtonText: '取消', type: 'warning' })
    if (result.value !== snapshot || 拆单试算已过期(snapshot)) { ElMessage.warning('订单、规则或来源资料已变化，请重新试算'); return }
    const response = 应用拆单规则结果(snapshot)
    if (response.成功) { applied.value = true; ElMessage.success(response.信息) }
    else ElMessage.warning(response.信息)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('未能保存拆分结果，请重新试算后再试')
  } finally { applying.value = false }
}
function viewOrder() {
  if (!orderNo.value) return
  void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: orderNo.value } })
  emit('close')
}
</script>

<template>
  <div class="拆单试算" v-prototype="拆单标注('simulation', '拆单规则试算与逐包结果')">
    <div class="拆单试算正文">
      <div class="拆单试算选择"><label for="split-order-select">选择订单</label><ElSelect id="split-order-select" v-model="orderNo" filterable aria-label="选择拆单试算订单"><ElOption v-for="item in orders" :key="item.systemOrderNo" :value="item.systemOrderNo" :label="`${item.systemOrderNo} · ${item.storeName} · ${item.processingStatus || '未进入处理'}`" /></ElSelect><ElButton type="primary" :disabled="!order" @click="run">开始试算</ElButton></div>
      <p v-if="draft" class="拆单试算帮助"><strong>仅试算当前草稿</strong> · {{ draft.name || '未命名规则' }}。停用状态不影响本次预览；不执行后续规则，不代表整套规则的最终结果，不保存规则或订单。</p><p v-else class="拆单试算帮助">试算仅预览商品拆分。保存后跳过合单，继续逐包分仓、审单及系统默认审单。</p>
      <template v-if="order">
        <div class="拆单订单摘要"><span>平台<strong>{{ order.platformCode }}</strong></span><span>店铺<strong>{{ order.storeName }}</strong></span><span>收货国家<strong>{{ order.address.countryCode || '—' }}</strong></span><span>处理状态<strong>{{ order.processingStatus || '未进入处理' }}</strong></span></div>
        <section class="拆单来源区"><h3>来源商品 <span>{{ order.items.length }} 行</span></h3><ElTable :data="order.items" size="small" class="拆单来源表"><ElTableColumn label="商品" min-width="180"><template #default="{ row }"><div>{{ row.systemItemName || row.platformItemTitle || '—' }}</div><small>{{ row.systemSku || '—' }}</small></template></ElTableColumn><ElTableColumn prop="platformSku" label="平台 SKU" min-width="140" /><ElTableColumn prop="externalLineId" label="来源商品行" min-width="110" /><ElTableColumn prop="orderedQuantity" label="下单数量" width="90" align="right" /><ElTableColumn label="本次可发" width="90" align="right"><template #default="{ row }">{{ row.fulfillableQuantity ?? '待核实' }}</template></ElTableColumn></ElTable></section>
      </template>
      <template v-if="result">
        <ElAlert v-if="applied" title="拆分结果已保存，等待逐包分仓" type="success" :closable="false" show-icon class="拆单结果提示" />
        <ElAlert v-else-if="stale" :title="draft ? '草稿、订单或来源资料已变化，请重新试算' : '订单、规则或来源资料已变化，请重新试算'" type="warning" :closable="false" show-icon class="拆单结果提示" />
        <div class="拆单结果总览"><div><small>拆分前</small><strong>{{ beforeCount }}<span> 包</span></strong></div><span class="拆单箭头">→</span><div><small>本次拆分结果</small><strong>{{ result.packages.length }}<span> 包</span></strong></div><div><small>商品数量</small><strong>{{ result.totalQuantity }}<span> 件</span></strong></div><div><small>生效规则</small><strong>{{ result.matchedRuleIds.length }}<span> 条</span></strong></div><ElTag :type="result.errors.length ? 'danger' : result.splitOccurred ? 'success' : 'info'" effect="light">{{ result.errors.length ? '需处理后重试' : result.splitOccurred ? (draft ? '预览结果' : '待分仓') : '无需拆分' }}</ElTag></div>
        <ElCollapse class="拆单原安排"><ElCollapseItem name="original" title="查看拆分前商品分配"><div v-for="(pack,index) in originalPackages" :key="pack.key" class="拆单原包裹"><div><strong>原包裹 {{ index + 1 }}</strong></div><p v-for="item in pack.items" :key="`${item.orderNo}-${item.externalLineId}`">{{ itemSku(item.externalLineId) }} · 来源行 {{ item.externalLineId }}<b>× {{ item.quantity ?? '待核实' }}</b></p></div></ElCollapseItem></ElCollapse>
        <section v-if="result.errors.length" class="拆单阻断"><h3>执行条件需处理</h3><ul><li v-for="(error,index) in result.errors" :key="index">{{ error }}</li></ul></section>
        <div v-if="result.warnings.length" class="拆单提醒"><p v-for="(warning,index) in result.warnings" :key="index">{{ warning }}</p></div>
        <section v-if="result.packages.length" class="拆单结果区"><h3>拆分结果 <span>{{ draft ? '仅展示当前草稿效果，未生成发货安排' : result.splitOccurred ? '保存后由分仓规则为各包分配仓库和物流渠道' : '本次无需拆分，未生成待分仓候选' }}</span></h3><div class="拆单包裹网格">
          <article v-for="pack in result.packages" :key="pack.key" class="拆单包裹卡"><header><h4>包裹 {{ packageNumbers.get(pack.key) }}</h4><div class="拆单包裹标签"><ElTag size="small" :type="result.errors.length ? 'danger' : result.splitOccurred ? 'warning' : 'info'">{{ result.errors.length ? '待处理' : draft ? '预览' : result.splitOccurred ? '待分仓' : '无需拆分' }}</ElTag><ElTag size="small" type="info">{{ pack.quantity }} 件 · {{ pack.items.length }} 行</ElTag></div></header><div class="拆单包裹商品"><div v-for="item in pack.items" :key="`${item.orderNo}-${item.externalLineId}`" class="拆单商品行"><div><strong>{{ itemName(item.externalLineId) }}</strong><small>{{ itemSku(item.externalLineId) }} · 来源行 {{ item.externalLineId }}</small></div><b>× {{ item.quantity }}</b></div></div><dl class="拆单包裹信息"><div v-if="pack.weightKg !== undefined"><dt>商品重量</dt><dd>{{ pack.weightKg }} kg</dd></div><div v-if="pack.volumeCm3 !== undefined"><dt>商品体积合计</dt><dd>{{ pack.volumeCm3 }} cm³</dd></div><div v-if="pack.amount !== undefined"><dt>商品金额</dt><dd>{{ pack.currency }} {{ pack.amount }}</dd></div></dl><p v-for="(reason,reasonIndex) in pack.reasons" :key="reasonIndex" class="拆单包裹原因">{{ reason }}</p></article>
        </div></section>
        <SplitExecutionTrace :trace="result.trace" :packages="result.packages" />
      </template>
      <ElEmpty v-else description="选择订单后，查看拆分方案及执行依据" :image-size="75" />
    </div>
    <footer class="拆单试算底栏" v-prototype="draft ? 拆单标注('draft', '只读草稿试算') : 拆单标注('apply', '保存拆分结果')"><span>{{ draft ? '验证后返回编辑；保存规则后可在列表试算整套规则' : applied ? '前往订单详情继续逐包分仓' : '保存后保留原订单、来源商品数量与交易金额' }}</span><div><ElButton @click="emit('close')">{{ draft ? '返回编辑' : '关闭' }}</ElButton><ElButton v-if="applied && !draft" type="primary" @click="viewOrder">查看订单</ElButton><ElButton v-else-if="!draft" type="primary" :disabled="!canApply" :loading="applying" @click="apply">保存拆分结果</ElButton></div></footer>
  </div>
</template>

<style scoped>
.拆单试算{display:flex;flex-direction:column;height:100%;min-width:0;font-size:13px;color:var(--yy-text-regular)}.拆单试算正文{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}.拆单试算选择{display:grid;grid-template-columns:60px minmax(0,1fr) auto;align-items:center;gap:12px}.拆单试算选择 label{font-weight:500;color:var(--yy-text-heading)}.拆单试算帮助{font-size:12px;color:var(--yy-text-secondary);line-height:1.8;margin:9px 0 18px}.拆单订单摘要{display:flex;flex-wrap:wrap;gap:12px 26px;padding:14px 16px;background:#f8fafc;border-radius:4px}.拆单订单摘要>span{display:flex;gap:10px;font-size:12px;color:var(--yy-text-secondary)}.拆单订单摘要 strong{font-weight:500;color:var(--yy-text-heading)}.拆单试算 h3{font-size:14px;color:var(--yy-text-heading);margin:22px 0 14px;line-height:1.7}.拆单试算 h3>span{font-size:12px;font-weight:400;margin-left:10px;color:var(--yy-text-secondary)}.拆单来源表 small{font-size:11px;color:var(--yy-text-secondary)}.拆单结果提示{margin-top:20px}.拆单结果总览{display:flex;gap:28px;align-items:center;flex-wrap:wrap;padding:18px 20px;background:#f4f8ff;border:1px solid #e5edf9;border-radius:5px;margin-top:22px}.拆单结果总览>div{min-width:94px}.拆单结果总览 small{display:block;font-size:12px;color:var(--yy-text-secondary);margin-bottom:7px}.拆单结果总览 strong{font-size:26px;font-weight:600;color:var(--yy-text-heading);line-height:1.1}.拆单结果总览 strong>span{font-size:12px;font-weight:400;color:var(--yy-text-secondary)}.拆单箭头{font-size:24px;color:#98aac3}.拆单结果总览>.el-tag{margin-left:auto}.拆单阻断{padding:2px 18px 12px;background:#fff6f5;border:1px solid #f6dfdb;border-radius:4px;margin-top:16px}.拆单阻断 h3{margin:12px 0 8px}.拆单阻断 ul{margin:0;padding-left:18px;color:#b95748;line-height:1.9;font-size:12px}.拆单提醒{background:#fff9ee;padding:9px 14px;border-radius:4px;margin-top:12px}.拆单提醒 p{font-size:12px;line-height:1.7;color:#8b6b35;margin:4px 0}.拆单包裹网格{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.拆单包裹卡{min-width:0;border:1px solid var(--yy-border-light);border-radius:6px;overflow:hidden;align-self:start}.拆单包裹卡>header{display:flex;align-items:center;justify-content:space-between;background:#fafbfc;padding:12px 14px;border-bottom:1px solid var(--yy-border-light)}.拆单包裹卡 h4{font-size:13px;color:var(--yy-text-heading);margin:0}.拆单包裹商品{padding:0 14px}.拆单商品行{display:flex;gap:12px;justify-content:space-between;padding:12px 0;border-bottom:1px dashed var(--yy-border-light)}.拆单商品行>div{min-width:0}.拆单商品行 strong{display:block;font-size:12px;line-height:1.7;font-weight:500;overflow-wrap:anywhere}.拆单商品行 small{display:block;font-size:11px;line-height:1.7;color:var(--yy-text-secondary);overflow-wrap:anywhere}.拆单商品行>b{font-weight:600;font-size:13px;flex-shrink:0;color:var(--yy-text-heading);padding-top:2px}.拆单包裹信息{margin:12px 14px;font-size:12px}.拆单包裹信息>div{display:grid;grid-template-columns:86px minmax(0,1fr);gap:8px;margin:7px 0;line-height:1.7}.拆单包裹信息 dt{color:var(--yy-text-secondary)}.拆单包裹信息 dd{margin:0;overflow-wrap:anywhere}.拆单包裹原因{margin:8px 14px;font-size:11px;color:var(--yy-text-secondary);line-height:1.7}.拆单轨迹区 .el-timeline{padding-left:5px}.拆单轨迹标题{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.拆单轨迹标题 strong{font-size:13px;color:var(--yy-text-heading);font-weight:500}.拆单轨迹说明{font-size:12px;line-height:1.8;margin:6px 0}.拆单轨迹区 small{color:var(--yy-text-secondary);font-size:11px}.拆单试算底栏{flex-shrink:0;display:flex;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--yy-border-light);padding:14px 22px;background:#fff}.拆单试算底栏>span{font-size:12px;color:var(--yy-text-secondary)}.拆单试算底栏>div{display:flex;gap:10px}.拆单试算底栏 .el-button{margin:0}@media(max-width:1350px){.拆单试算正文{padding:0 18px 20px}.拆单结果总览{gap:20px}.拆单试算底栏{padding:12px 18px}.拆单试算底栏>span{max-width:48%;line-height:1.7}}
.拆单原安排{margin-top:10px;border-top:0}.拆单原安排 :deep(.el-collapse-item__header){font-size:12px;height:38px;color:var(--yy-text-secondary)}.拆单原包裹{background:#fafbfc;padding:10px 14px;margin:8px 0;border-radius:4px;font-size:12px}.拆单原包裹>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:7px}.拆单原包裹 strong{font-weight:500;color:var(--yy-text-heading)}.拆单原包裹 span{color:var(--yy-text-secondary)}.拆单原包裹 p{display:flex;justify-content:space-between;gap:12px;line-height:1.7;margin:4px 0;overflow-wrap:anywhere}.拆单原包裹 b{font-weight:500;flex-shrink:0}
.拆单包裹标签{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
</style>
