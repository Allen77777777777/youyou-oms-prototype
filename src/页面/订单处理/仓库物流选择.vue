<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElFormItem, ElOption, ElSelect } from 'element-plus'
import type { 订单路由 } from '../全渠道订单/类型'
import { 路由仓库键 } from './仓库物流选择模型'

const props = defineProps<{ routes: readonly 订单路由[]; warehouse: string; channel: string }>()
const emit = defineEmits<{ 'update:warehouse': [value: string]; 'update:channel': [value: string] }>()
const 服务商 = ref('')
const 账号 = ref('')
watch(() => props.warehouse, value => { const route = props.routes.find(项 => 路由仓库键(项) === value); if (route) { 服务商.value = route.warehouseProvider; 账号.value = route.warehouseAccount } }, { immediate: true })
const 服务商选项 = computed(() => [...new Set(props.routes.map(route => route.warehouseProvider))])
const 账号选项 = computed(() => [...new Set(props.routes.filter(route => !服务商.value || route.warehouseProvider === 服务商.value).map(route => route.warehouseAccount))])
const 仓库选项 = computed(() => [...new Map(props.routes.filter(route => (!服务商.value || route.warehouseProvider === 服务商.value) && (!账号.value || route.warehouseAccount === 账号.value)).map(route => [路由仓库键(route), route])).entries()])
const 渠道选项 = computed(() => props.routes.filter(route => 路由仓库键(route) === props.warehouse))
function 选择仓库(value: string) {
  if (value === props.warehouse) return
  emit('update:warehouse', value)
  emit('update:channel', '')
}
function 选择服务商(value: string) { 服务商.value = value; 账号.value = ''; emit('update:warehouse', ''); emit('update:channel', '') }
function 选择账号(value: string) { 账号.value = value; emit('update:warehouse', ''); emit('update:channel', '') }
</script>

<template>
  <div class="仓库物流字段">
    <ElFormItem label="仓储服务商" required><ElSelect :model-value="服务商" placeholder="请选择仓储服务商" aria-label="仓储服务商" @update:model-value="选择服务商"><ElOption v-for="value in 服务商选项" :key="value" :value="value" :label="value" /></ElSelect></ElFormItem>
    <ElFormItem label="仓库账号" required><ElSelect :model-value="账号" placeholder="请选择仓库账号" aria-label="仓库账号" @update:model-value="选择账号"><ElOption v-for="value in 账号选项" :key="value" :value="value" :label="value" /></ElSelect></ElFormItem>
    <ElFormItem label="发货仓库" required>
      <ElSelect :model-value="warehouse" placeholder="请选择发货仓库" aria-label="发货仓库" @update:model-value="选择仓库">
        <ElOption v-for="[key, route] in 仓库选项" :key="key" :value="key" :label="route.warehouse">
          <span>{{ route.warehouse }}</span><small>{{ route.warehouseAccount }}</small>
        </ElOption>
      </ElSelect>
    </ElFormItem>
    <ElFormItem label="物流渠道" required>
      <ElSelect :model-value="channel" :disabled="!warehouse" :placeholder="warehouse ? '请选择物流渠道' : '请先选择发货仓库'" aria-label="物流渠道" no-data-text="该仓库暂无可选物流渠道" @update:model-value="emit('update:channel', $event)">
        <ElOption v-for="route in 渠道选项" :key="route.shippingChannelCode" :value="route.shippingChannelCode" :label="route.shippingChannel" />
      </ElSelect>
    </ElFormItem>
  </div>
</template>

<style scoped>
.仓库物流字段 :deep(.el-select){width:100%}small{float:right;margin-left:16px;color:#8995a6;font-size:11px}
</style>
