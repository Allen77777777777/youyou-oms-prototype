<script setup lang="ts">
import { computed } from 'vue'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 共享审单执行设置 } from '../业务配置/规则执行设置'
import { 读取审单重跑状态 } from './审单重跑'

const props = defineProps<{ order: 全渠道订单; now: number }>()
const 状态 = computed(() => 读取审单重跑状态(props.order, 共享审单执行设置.value, props.now))
const 截止 = computed(() => 状态.value.截止时间 ? new Date(状态.value.截止时间).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) : '')
const 停止 = computed(() => ['今日已达上限', '已到期', '待核查'].includes(状态.value.状态))
</script>

<template>
  <div v-if="状态.状态 !== '已退出'" class="重跑提示" :class="{ '重跑停止': 停止 }" :data-retry-status="状态.状态">
    <strong v-if="停止">{{ 状态.原因 }}</strong>
    <span v-else-if="!共享审单执行设置.enabled">自动审单未开启</span>
    <span v-else>{{ 状态.原因 }}</span>
    <small v-if="order.reviewRetry">今日自动重跑 {{ 状态.今日次数 }} / {{ 共享审单执行设置.dailyRetryLimit }} 次</small>
    <small v-if="截止">重跑截止 {{ 截止 }}（北京时间）</small>
  </div>
</template>

<style scoped>
.重跑提示[data-retry-status] { display: flex; flex-direction: column; align-items: stretch; gap: 3px; margin-top: 4px; padding-top: 5px; border-top: 1px dashed var(--yy-border-light); color: var(--yy-text-secondary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.重跑提示 strong { font-weight: 500; }
.重跑提示 small { font-size: 12px; }
.重跑停止 strong { color: var(--el-color-warning-dark-2); }
</style>
