<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { ElButton, ElDialog, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import { 最近审单轮次, 运行审单轮次 } from './审单轮次会话'
import { 订单处理标注 } from './订单处理原型标注'
import { 展示处理原因 } from './处理提示展示'
import { 共享订单 } from './演示会话'

const emit = defineEmits<{ executed: [] }>()
const 结果打开 = ref(false)
const 查看轮次 = shallowRef(最近审单轮次.value)
const 待审数 = computed(() => 共享订单.value.filter(订单 => 订单.fulfillmentMode === '自配送' && 订单.processingStatus === '待审核').length)
function 查看结果() {
  查看轮次.value = 最近审单轮次.value
  结果打开.value = true
}
function 执行规则() {
  运行审单轮次('立即执行')
  emit('executed')
  查看结果()
}
</script>

<template>
  <div class="审单入口" v-prototype="订单处理标注.执行审单规则">
    <span class="执行范围">全部待审核订单 · {{ 待审数 }} 单</span>
    <ElTooltip content="对全部待审核订单执行已启用的审单规则和系统默认检查，包含筛选之外的订单。" placement="top">
      <ElButton plain type="primary" @click="执行规则">执行审单规则</ElButton>
    </ElTooltip>
    <ElButton v-if="最近审单轮次" link type="primary" @click="查看结果">最近执行结果</ElButton>
  </div>
  <ElDialog v-model="结果打开" title="审单规则执行结果" width="min(820px, 92vw)" append-to-body>
    <template v-if="查看轮次">
      <p class="轮次时间">{{ 查看轮次.来源 }} · {{ 查看轮次.执行时间 }}（北京时间）</p>
      <div class="轮次摘要">
        <span>本轮订单 <b>{{ 查看轮次.总数 }}</b></span>
        <span>通过 <b>{{ 查看轮次.通过 }}</b></span>
        <span>拦截 <b>{{ 查看轮次.拦截 }}</b></span>
        <span>跳过 <b>{{ 查看轮次.跳过 }}</b></span>
      </div>
      <ElTable :data="查看轮次.明细" row-key="订单号" max-height="min(50vh, 480px)" empty-text="执行时没有待审核订单">
        <ElTableColumn prop="订单号" label="系统订单号" min-width="190" />
        <ElTableColumn label="结果" width="84">
          <template #default="{ row }"><ElTag size="small" :type="row.结果 === '通过' ? 'success' : row.结果 === '拦截' ? 'warning' : 'info'">{{ row.结果 }}</ElTag></template>
        </ElTableColumn>
        <ElTableColumn label="审核说明" min-width="255">
          <template #default="{ row }">{{ 展示处理原因(row.原因) }}</template>
        </ElTableColumn>
      </ElTable>
    </template>
    <template #footer><ElButton @click="结果打开 = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.审单入口,.轮次摘要{display:flex;align-items:center;gap:12px}
.审单入口{margin-left:auto;flex-shrink:0}
.执行范围{font-size:12px;color:var(--el-text-color-secondary)}
.轮次时间{margin:0 0 12px;color:var(--el-text-color-secondary);font-size:12px}
.轮次摘要{flex-wrap:wrap;gap:24px;padding:12px 16px;margin-bottom:14px;background:var(--el-fill-color-light);border-radius:4px}
.轮次摘要 b{margin-left:4px;color:var(--yy-text-heading)}
</style>
