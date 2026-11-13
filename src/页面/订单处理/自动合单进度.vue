<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import { 读取订单合单进度, 共享合单记录 } from './自动合单状态'
import { 合单展示期限 } from './自动合单展示'
import { 北京时间文本 } from './自动合单模型'
defineOptions({ name: 'AutoMergeProgress' })
const props = defineProps<{ orderNo: string }>()
const 记录 = computed(() => 读取订单合单进度(props.orderNo))
const 期限 = computed(() => 记录.value && 合单展示期限(记录.value, 共享合单记录.value))
</script>
<template>
  <div v-if="记录" class="合单进度">
    <ElTag size="small" :type="记录.status === '已放单' ? 'success' : 记录.status === '分仓待处理' ? 'danger' : 'warning'">合单 · {{ 记录.status }}</ElTag>
    <span v-if="期限?.at && ['等单中', '待本轮处理'].includes(记录.status)">预计放单 {{ 北京时间文本(期限.at) }}</span>
  </div>
</template>
<style scoped>.合单进度{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:3px 0;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.合单进度>span{color:var(--el-text-color-secondary)}</style>
