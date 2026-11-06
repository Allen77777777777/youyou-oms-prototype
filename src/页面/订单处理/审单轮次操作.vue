<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { ElButton, ElDialog, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import { 最近审单轮次, 运行审单轮次 } from './审单轮次会话'
import { 订单处理标注 } from './订单处理原型标注'
import { 展示处理原因 } from './处理提示展示'
import { 共享订单 } from './演示会话'
import { 是未匹配审单异常 } from '../全渠道订单/类型'

const emit = defineEmits<{ executed: [] }>()
const 结果打开 = ref(false)
const 查看轮次 = shallowRef(最近审单轮次.value)
const 结果分类 = ['人工截留', '审核通过', '未匹配转异常', '发货条件拦截', '跳过'] as const
const 结果颜色 = { 人工截留: 'warning', 审核通过: 'success', 未匹配转异常: 'danger', 发货条件拦截: 'warning', 跳过: 'info' } as const
const 待审数 = computed(() => 共享订单.value.filter(订单 => 订单.fulfillmentMode === '自配送' && 订单.processingStatus === '待审核').length)
const 未匹配数 = computed(() => 共享订单.value.filter(是未匹配审单异常).length)
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
    <span class="执行范围">待审核 {{ 待审数 }} 单 · 未匹配异常 {{ 未匹配数 }} 单</span>
    <ElTooltip content="检查全部待审核及未匹配审单规则的异常订单，不受当前队列、筛选或分页限制。按最新规则匹配，强制人工及其他异常阻断仍跳过。手动执行不受自动重跑上限限制，不占次数或重置期限。" placement="top">
      <ElButton plain type="primary" @click="执行规则">执行审单规则</ElButton>
    </ElTooltip>
    <ElButton v-if="最近审单轮次" link type="primary" @click="查看结果">最近执行结果</ElButton>
  </div>
  <ElDialog v-model="结果打开" title="审单规则执行结果" width="min(940px, 94vw)" append-to-body>
    <template v-if="查看轮次">
      <p class="轮次时间">{{ 查看轮次.来源 }} · {{ 查看轮次.执行时间 }}（北京时间）</p>
      <div class="轮次摘要">
        <span>本轮订单 <b>{{ 查看轮次.总数 }}</b></span>
        <span v-for="分类 in 结果分类" :key="分类">{{ 分类 }} <b>{{ 查看轮次[分类] }}</b></span>
      </div>
      <ElTable :data="查看轮次.明细" row-key="订单号" max-height="min(50vh, 480px)" empty-text="执行时没有待审核或未匹配审单异常订单">
        <ElTableColumn prop="订单号" label="系统订单号" min-width="190" />
        <ElTableColumn label="本轮结果" width="128">
          <template #default="{ row }"><ElTag size="small" :type="结果颜色[row.结果 as keyof typeof 结果颜色]">{{ row.结果 }}</ElTag></template>
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
.审单入口{margin-left:auto;flex-wrap:wrap;justify-content:flex-end;min-width:0}
.执行范围{font-size:12px;color:var(--el-text-color-secondary)}
.轮次时间{margin:0 0 12px;color:var(--el-text-color-secondary);font-size:12px}
.轮次摘要{flex-wrap:wrap;gap:24px;padding:12px 16px;margin-bottom:14px;background:var(--el-fill-color-light);border-radius:4px}
.轮次摘要 b{margin-left:4px;color:var(--yy-text-heading)}
</style>
