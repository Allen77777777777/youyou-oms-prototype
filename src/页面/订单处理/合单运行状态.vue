<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import { 共享自动合单设置, 共享合单运行状态 } from '../业务配置/自动合单设置'
import { 北京时间文本 } from './自动合单模型'
import { 自动合单标注 } from './自动合单标注'
const props = withDefaults(defineProps<{ annotationRoute?: string }>(), { annotationRoute: '/oms/self-fulfillment/processing' })
const annotation = computed(() => ({ ...自动合单标注('runtime-status', '合单运行状态'), 路由: props.annotationRoute }))
const state = 共享合单运行状态
const failed = computed(() => state.value.status === '执行失败')
</script>

<template>
  <section v-prototype="annotation" class="合单运行状态" aria-label="合单任务运行状态" :class="{ '执行失败': failed }">
    <div class="运行摘要">
      <span>自动任务 <ElTag size="small" type="info" effect="plain">{{ 共享自动合单设置.enabled ? '已开启' : '已关闭' }}</ElTag></span>
      <span>最近执行 <ElTag size="small" :type="failed ? 'danger' : state.status === '执行成功' ? 'success' : 'info'" effect="plain">{{ state.status }}</ElTag></span>
      <span v-if="state.source">{{ state.source }}</span>
      <span>最近成功：{{ state.lastSuccessAt === null ? '暂无成功记录' : 北京时间文本(state.lastSuccessAt) }}</span>
    </div>
    <div v-if="failed" class="失败详情" role="alert">
      <strong>{{ state.failureReason }}</strong>
      <span v-if="state.lastFailureAt !== null">失败时间：{{ 北京时间文本(state.lastFailureAt) }}</span>
      <p>{{ state.nextAction }}</p>
    </div>
    <p v-else-if="state.status === '执行成功'" class="运行说明">执行成功表示本轮检查已完成；订单是否放单及受阻原因请查看合单处理结果。</p>
  </section>
</template>

<style scoped>
.合单运行状态{padding:10px 12px;border:1px solid var(--yy-border-light);border-radius:4px;background:#fafbfd;font-size:12px;line-height:1.7;color:var(--yy-text-secondary)}.运行摘要{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px}.运行摘要>span{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere}.执行失败{border-color:var(--el-color-danger-light-7);background:var(--el-color-danger-light-9)}.失败详情{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:8px}.失败详情 strong{color:var(--yy-text-heading);font-weight:600}.失败详情 p,.运行说明{flex-basis:100%;margin:4px 0 0}.失败详情 p{color:var(--yy-text-heading)}
</style>
