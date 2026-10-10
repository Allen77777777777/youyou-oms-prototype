<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { 订单处理状态 } from '../全渠道订单/类型'
import { 格式化北京时间, 解析来源时刻, 计算剩余发货时间 } from './时间展示工具'

const props = defineProps<{
  orderedAt?: string
  paidAt?: string
  deadline?: string
  stage: 订单处理状态
  shippedAt?: string
  warehouseUpdatedAt?: string
  showFulfillment?: boolean
  showWarehouse?: boolean
}>()
const 当前时刻 = ref(Date.now())
const 剩余 = computed(() => 计算剩余发货时间(props.deadline, props.stage, 当前时刻.value))
const 需要计时 = computed(() => !['已发货', '不发货'].includes(props.stage) && 解析来源时刻(props.deadline) !== undefined)
const 时间字段 = computed(() => [
  { 名称: '下单时间', 来源: props.orderedAt },
  { 名称: '付款时间', 来源: props.paidAt },
  { 名称: '最晚发货', 来源: props.deadline },
])
let 已挂载 = false
let 定时器: ReturnType<typeof setInterval> | undefined
function 清理计时() { if (定时器 !== undefined) { clearInterval(定时器); 定时器 = undefined } }
function 更新计时() {
  清理计时()
  当前时刻.value = Date.now()
  if (已挂载 && 需要计时.value) 定时器 = setInterval(() => { 当前时刻.value = Date.now() }, 1_000)
}
onMounted(() => { 已挂载 = true; 更新计时() })
watch(需要计时, 更新计时)
onUnmounted(() => { 已挂载 = false; 清理计时() })
</script>

<template>
  <dl class="订单时间摘要">
    <template v-for="字段 in 时间字段" :key="字段.名称">
      <dt>{{ 字段.名称 }}：</dt><dd>{{ 格式化北京时间(字段.来源) }}</dd>
    </template>
    <dt>剩余发货时间：</dt><dd :class="{ 已超时: 剩余.kind === 'overdue' }" data-shipping-remaining>{{ 剩余.text }}</dd>
    <template v-if="showFulfillment"><dt>实际出库：</dt><dd>{{ 格式化北京时间(shippedAt) }}</dd></template>
    <template v-if="showWarehouse"><dt>仓库回传：</dt><dd>{{ 格式化北京时间(warehouseUpdatedAt) }}</dd></template>
  </dl>
</template>

<style scoped>
.订单时间摘要{display:grid;grid-template-columns:70px max-content;gap:5px 6px;margin:0;align-items:start;font-size:11px;line-height:1.55}
.订单时间摘要 dt{color:#8c98a9;font-size:10px;font-weight:400;white-space:nowrap}
.订单时间摘要 dd{margin:0;color:#5c6f86;font-weight:400;white-space:nowrap;font-variant-numeric:tabular-nums}
.订单时间摘要 .已超时{color:var(--el-color-danger);font-weight:600}
</style>
