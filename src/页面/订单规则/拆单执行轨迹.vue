<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElTag } from 'element-plus'
import type { 拆单轨迹 } from './拆单规则模型'
import { 构建拆单包裹编号, 格式化拆单包裹流向, 分组拆单轨迹, 拆单其他轨迹摘要 } from './拆单轨迹展示'
import { 拆单标注 } from './拆单规则标注'

const props = defineProps<{ trace: readonly 拆单轨迹[]; packages?: readonly { key: string }[] }>()
const revision = ref(0)
watch(() => props.trace, () => { revision.value += 1 })
const groups = computed(() => 分组拆单轨迹(props.trace))
const numbers = computed(() => 构建拆单包裹编号(props.trace, props.packages))
const otherSummary = computed(() => 拆单其他轨迹摘要(props.trace))
function tagType(status: 拆单轨迹['status']) { return status === '失败' ? 'danger' : status === '资料待核实' ? 'warning' : status === '命中' ? 'success' : 'info' }
</script>

<template>
  <section class="拆单执行轨迹" aria-label="拆单规则执行过程" v-prototype="拆单标注('trace', '拆单执行轨迹与包裹关联')">
    <h3>规则执行过程 <span>{{ trace.length }} 条记录</span></h3>
    <ol v-if="groups.important.length" class="轨迹列表 关键轨迹">
      <li v-for="row in groups.important" :key="row.index" class="轨迹记录" :class="{ 阻断轨迹: row.entry.status !== '命中' }">
        <div class="轨迹标题"><strong>{{ row.entry.ruleName }}</strong><ElTag :type="tagType(row.entry.status)" size="small">{{ row.entry.status }}</ElTag></div>
        <p class="包裹流向">{{ 格式化拆单包裹流向(row.entry, numbers) }}</p>
        <p class="轨迹说明">{{ row.entry.detail }}</p>
        <small>优先级 {{ row.entry.priority }} · v{{ row.entry.version }}</small>
      </li>
    </ol>
    <p v-else class="轨迹空提示">{{ trace.length ? '本次没有命中规则，可展开查看未命中或跳过原因。' : '暂无执行记录。' }}</p>
    <details v-if="groups.other.length" :key="revision" class="其他轨迹">
      <summary>查看其他 {{ groups.other.length }} 条记录 <span>{{ otherSummary }}</span></summary>
      <ol class="轨迹列表">
        <li v-for="row in groups.other" :key="row.index" class="轨迹记录">
          <div class="轨迹标题"><strong>{{ row.entry.ruleName }}</strong><ElTag type="info" size="small">{{ row.entry.status }}</ElTag></div>
          <p class="包裹流向">{{ 格式化拆单包裹流向(row.entry, numbers) }}</p>
          <p class="轨迹说明">{{ row.entry.detail }}</p>
          <small>优先级 {{ row.entry.priority }} · v{{ row.entry.version }}</small>
        </li>
      </ol>
    </details>
  </section>
</template>

<style scoped>
.拆单执行轨迹{font-size:12px;min-width:0}.拆单执行轨迹 h3{font-size:14px;color:var(--yy-text-heading);margin:22px 0 14px;line-height:1.7}.拆单执行轨迹 h3>span{font-size:12px;font-weight:400;margin-left:10px;color:var(--yy-text-secondary)}.轨迹列表{list-style:none;margin:0;padding:0}.轨迹记录{position:relative;border-left:2px solid #dce8f5;padding:0 0 18px 15px;margin-left:4px;overflow-wrap:anywhere}.轨迹记录:last-child{padding-bottom:8px}.阻断轨迹{border-left-color:#e8b36c}.轨迹标题{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.轨迹标题 strong{font-size:13px;color:var(--yy-text-heading);font-weight:500;line-height:1.7}.包裹流向{font-weight:500;color:var(--yy-text-heading);line-height:1.8;margin:7px 0 4px}.轨迹说明{line-height:1.8;margin:4px 0 6px;color:var(--yy-text-regular)}.轨迹记录 small,.轨迹空提示{font-size:12px;color:var(--yy-text-secondary);line-height:1.8}.其他轨迹{margin-top:10px;border:1px solid var(--yy-border-light);border-radius:4px;background:#fafbfc}.其他轨迹 summary{cursor:pointer;padding:12px 14px;color:var(--yy-text-regular);line-height:1.8}.其他轨迹 summary:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:2px}.其他轨迹 summary>span{color:var(--yy-text-secondary);margin-left:10px;font-size:12px}.其他轨迹 .轨迹列表{padding:3px 14px 10px}.其他轨迹 .轨迹记录{border-left-color:var(--yy-border-light)}
</style>
