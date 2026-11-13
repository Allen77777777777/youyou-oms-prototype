<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDrawer, ElEmpty, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 试算规则, type 订单规则 } from './规则逻辑'
import { 准备收件信息请求, 收件处理状态名称 } from './收件信息执行'
import { 收件信息标注 } from './收件信息规则标注'
import { 创建物流渠道选项, 物流渠道条件键 } from './规则渠道条件'
import { 渠道会话 } from '../仓配管理/渠道状态'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ rules: 订单规则[]; orders: 全渠道订单[] }>()
const orderNo = ref('')
const order = computed(() => props.orders.find(item => item.systemOrderNo === orderNo.value))
type 规则试算轨迹 = ReturnType<typeof 试算规则>['trace'][number]
const trigger = ref<'freight_quote' | 'logistics_order' | 'warehouse_push'>('warehouse_push')
const channelKey = ref('')
const channelOptions = computed(() => 创建物流渠道选项(渠道会话.value))
const channel = computed(() => 渠道会话.value.find(item => 物流渠道条件键(item) === channelKey.value))
const route = computed<订单路由 | undefined>(() => channel.value ? {
  warehouse: channel.value.warehouse, warehouseProvider: channel.value.provider,
  warehouseAccount: channel.value.account, shippingChannel: channel.value.name,
  shippingChannelCode: channel.value.code, shippingChannelId: channel.value.id,
  labelMode: channel.value.labelMode === '仓库回传' ? '仓配一体' : '仓配分离',
} : undefined)
const prepared = ref<ReturnType<typeof 准备收件信息请求>>()
const result = computed(() => prepared.value?.trial)
const record = computed(() => prepared.value?.record)
const snapshot = ref('')
const currentSnapshot = computed(() => JSON.stringify([props.rules.filter(item => item.type === '收件信息规则'), order.value, 渠道会话.value, trigger.value, channelKey.value]))
const stale = computed(() => !!result.value && snapshot.value !== currentSnapshot.value)
watch(open, value => { if (value) { orderNo.value ||= props.orders.find(item => item.fulfillmentMode === '自配送')?.systemOrderNo || ''; prepared.value = undefined } })
watch(orderNo, () => { prepared.value = undefined })
function run() {
  if (!order.value) return
  snapshot.value = currentSnapshot.value
  prepared.value = 准备收件信息请求({ requestId: `preview-${order.value.systemOrderNo}`, trigger: trigger.value,
    order: order.value, originalAddress: order.value.address, route: route.value,
    rules: props.rules, channels: 渠道会话.value })
}
const rows = computed(() => record.value ? [
  { field: '地址 1', before: record.value.before.addressLine1, after: record.value.after.addressLine1 },
  { field: '地址 2', before: record.value.before.addressLine2, after: record.value.after.addressLine2 },
  { field: '独立门牌号', before: record.value.before.houseNumber, after: record.value.after.houseNumber },
] : [])
function traceLabel(row: NonNullable<typeof result.value>['trace'][number]) {
  if (!row.rule.enabled) return '停用跳过'
  if (row.rule.id === result.value?.blockedRule?.rule.id) return '待核实 · 停止匹配'
  if (row.rule.id === result.value?.hit?.id) return '首条命中'
  const stopped = result.value?.trace.findIndex(item => item.rule.id === (result.value?.hit?.id || result.value?.blockedRule?.rule.id)) ?? -1
  const index = result.value?.trace.findIndex(item => item.rule.id === row.rule.id) ?? -1
  if (stopped >= 0 && index > stopped) return '后续不执行'
  return row.configError ? '范围外 · 配置待核实' : row.pending ? '资料待核实' : '未命中'
}
</script>

<template>
  <ElDrawer v-model="open" title="收件信息规则试算" size="min(880px, calc(100vw - 80px))" append-to-body destroy-on-close>
    <section class="收件规则试算" v-prototype="收件信息标注('rule-simulation', '收件信息规则命中与结果预览')">
      <p class="试算说明">预览本次请求的收件资料。按所选场景和目标路线匹配规则，仅供核对，不发出请求或修改订单。</p>
      <label for="recipient-order-select">选择订单</label>
      <div class="试算选择行"><ElSelect id="recipient-order-select" v-model="orderNo" filterable aria-label="收件信息试算订单"><ElOption v-for="item in orders" :key="item.systemOrderNo" :value="item.systemOrderNo" :label="`${item.systemOrderNo} · ${item.address.countryCode} · ${item.address.addressLine1}`" /></ElSelect></div>
      <div class="请求条件行">
        <div><label for="recipient-trigger-select">处理场景</label><ElSelect id="recipient-trigger-select" v-model="trigger" aria-label="收件信息处理场景"><ElOption label="对外运费试算前" value="freight_quote" /><ElOption label="物流下单前" value="logistics_order" /><ElOption label="推仓前" value="warehouse_push" /></ElSelect></div>
        <div><label for="recipient-channel-select">{{ trigger === 'freight_quote' ? '本次候选渠道' : '本次目标渠道' }}</label><ElSelect id="recipient-channel-select" v-model="channelKey" clearable filterable aria-label="收件信息请求渠道" placeholder="选择本次请求的物流渠道"><ElOption v-for="item in channelOptions" :key="item.value" :value="item.value" :label="item.label" /></ElSelect></div>
      </div>
      <p class="路线说明">发货仓库：{{ channel?.warehouse || '未选择渠道' }}<span v-if="channel"> · {{ channel.provider }} · {{ channel.account }}</span>。未选择时，仓库和渠道条件按资料待核实处理。</p>
      <div class="开始试算行"><ElButton type="primary" :disabled="!order" @click="run">开始试算</ElButton></div>
      <ElAlert v-if="stale" title="规则、订单或请求场景已变化，请重新试算" type="warning" :closable="false" show-icon />
      <template v-if="result && !stale">
        <div class="结果标题"><h3>{{ result.blockedRule ? '规则待核实' : result.hit?.name || '未匹配到收件信息规则' }}</h3><ElTag v-if="result.hit" size="small">v{{ result.hit.version }} · 优先级 {{ result.hit.priority }}</ElTag></div>
        <ElAlert v-if="result.gates.length" :title="result.gates.join('；')" type="warning" :closable="false" show-icon />
        <ElAlert v-else-if="result.blockedRule" :title="result.blockedRule.configError || `规则条件资料待核实：${result.blockedRule.unknownFields.join('、')}`" description="本轮停止匹配，不使用较低优先级规则代替。" type="warning" :closable="false" show-icon />
        <template v-else-if="record">
          <ElAlert :title="收件处理状态名称[record.status]" :description="record.reason" :type="['parsed','preserved'].includes(record.status) ? 'success' : 'info'" :closable="false" show-icon />
          <table class="结果对照"><thead><tr><th>字段</th><th>请求原始资料</th><th>本次请求副本</th></tr></thead><tbody><tr v-for="row in rows" :key="row.field"><th>{{ row.field }}</th><td>{{ row.before || '—' }}</td><td :class="{ 已变化: row.before !== row.after }">{{ row.after || '—' }}</td></tr></tbody></table>
          <p class="试算说明">实际提交前仍需校验目标接口的必填项、长度与格式；解析结果不代表可直接发货。</p>
        </template>
        <p v-else class="试算说明">保留原始资料，不生成新的门牌号。</p>
        <h3>匹配轨迹</h3><ElTable :data="result.trace" empty-text="暂无本类型规则"><ElTableColumn prop="rule.priority" label="优先级" width="80" /><ElTableColumn prop="rule.name" label="规则名称" min-width="180" /><ElTableColumn label="结果" min-width="155"><template #default="{ row }">{{ traceLabel(row as 规则试算轨迹) }}</template></ElTableColumn></ElTable>
      </template>
      <ElEmpty v-else-if="!stale" description="选择订单后开始试算" :image-size="85" />
    </section>
    <template #footer><ElButton @click="open = false">关闭</ElButton></template>
  </ElDrawer>
</template>

<style scoped>
.收件规则试算{font-size:13px;line-height:1.7;min-width:0}.试算说明{color:var(--yy-text-secondary);margin:0 0 18px}.试算选择行{display:flex;gap:10px;margin:8px 0 20px}.试算选择行 .el-select{flex:1;min-width:0}.结果标题{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:24px 0 12px}.结果标题 h3{margin:0}.收件规则试算 h3{color:var(--yy-text-heading);font-size:14px}.结果对照{width:100%;border-collapse:collapse;table-layout:fixed;margin:16px 0 24px}.结果对照 th,.结果对照 td{padding:12px;border:1px solid var(--yy-border-light);overflow-wrap:anywhere;text-align:left;white-space:pre-wrap}.结果对照 th{color:var(--yy-text-heading);font-weight:500;background:var(--el-fill-color-light)}.结果对照 th:first-child{width:90px}.已变化{color:var(--yy-primary);background:var(--el-color-primary-light-9)}
.请求条件行{display:grid;grid-template-columns:180px minmax(0,1fr);gap:16px}.请求条件行 label{display:block;margin-bottom:8px}.路线说明{margin:10px 0 16px;font-size:12px;color:var(--yy-text-secondary);overflow-wrap:anywhere}.开始试算行{display:flex;justify-content:flex-end;margin-bottom:18px}@media(max-width:700px){.请求条件行{grid-template-columns:1fr}}
</style>
