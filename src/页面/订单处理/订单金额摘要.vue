<script setup lang="ts">
import type { 订单金额 } from '../全渠道订单/类型'
import { 格式化金额 } from '../全渠道订单/订单工具'
import { 订单金额字段 as 字段 } from '../全渠道订单/订单金额字段'
import AmountFieldHelp from '../全渠道订单/金额字段帮助.vue'

defineProps<{ amount: 订单金额 }>()

</script>

<template>
  <dl class="订单金额摘要">
    <div v-for="项 in 字段" :key="项.key" :class="{ 总金额: 项.key === 'orderAmount' }">
      <dt>{{ 项.label }}<AmountFieldHelp :label="项.label" :description="项.description" />：</dt>
      <dd>{{ 格式化金额(amount[项.key]) }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.订单金额摘要{display:flex;flex-direction:column;gap:6px;margin:0;font-size:11px;line-height:1.5}
.订单金额摘要>div{display:flex;align-items:baseline;justify-content:space-between;gap:4px;min-width:0}
dt{flex-shrink:0;color:#8a96a6;font-weight:400}
dd{margin:0;min-width:0;text-align:right;color:#53657b;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.总金额 dd{font-size:12px;font-weight:600;color:#263e59}
</style>
