<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { customerServiceLogResultTone, formatCustomerServiceLogTime, type CustomerServiceLog } from './日志工具'

const props = withDefaults(defineProps<{
  entries: readonly CustomerServiceLog[]
  title?: string
  collapsed?: boolean
  /** 独立弹窗、抽屉或日志页签已有标题时，直接展示日志内容。 */
  showHeading?: boolean
  formatTime?: (value: string) => string
}>(), { title: '操作日志', collapsed: true, showHeading: true })
const pageSize = 10
const contentId = useId()
const operatorFilter = ref('')
const actionFilter = ref('')
const resultFilter = ref('')
const visibleCount = ref(pageSize)
const expanded = ref(new Set<string>())
const operator = (entry: CustomerServiceLog) => entry.operator?.trim() || '未记录'
const result = (entry: CustomerServiceLog) => entry.result?.trim() || '未记录'
const ordered = computed(() => {
  const occurrences = new Map<string, number>()
  return props.entries.map((entry, index) => {
    // 历史投影可能每次产生新对象；按原始内容建立稳定身份，前插日志不转移展开状态。
    const identity = entry.id ? JSON.stringify(['id', entry.id])
      : JSON.stringify(['legacy', entry.at, entry.operator ?? null, entry.action, entry.content, entry.result ?? null])
    const occurrence = occurrences.get(identity) ?? 0
    occurrences.set(identity, occurrence + 1)
    return { entry, index, key: `${identity}:${occurrence}` }
  }).sort((a, b) => {
    const aTime = 读取排序时刻(a.entry.at), bTime = 读取排序时刻(b.entry.at)
    if (aTime === undefined && bTime !== undefined) return 1
    if (aTime !== undefined && bTime === undefined) return -1
    const delta = (bTime ?? 0) - (aTime ?? 0)
    if (Number.isFinite(delta) && delta !== 0) return delta
    const first = a.entry.id?.match(/^service-log-\d+-(\d+)$/)?.[1]
    const second = b.entry.id?.match(/^service-log-\d+-(\d+)$/)?.[1]
    return first && second ? Number(second) - Number(first) : a.index - b.index
  })
})
const operators = computed(() => [...new Set(ordered.value.map(item => operator(item.entry)))])
const actions = computed(() => [...new Set(ordered.value.map(item => item.entry.action))])
const results = computed(() => [...new Set(ordered.value.map(item => result(item.entry)))])
const hasFilters = computed(() => !!(operatorFilter.value || actionFilter.value || resultFilter.value))
const filtered = computed(() => ordered.value.filter(({ entry }) =>
  (!operatorFilter.value || operator(entry) === operatorFilter.value)
  && (!actionFilter.value || entry.action === actionFilter.value)
  && (!resultFilter.value || result(entry) === resultFilter.value)))
const visible = computed(() => filtered.value.slice(0, visibleCount.value))
const time = (value: string) => value.trim() ? (props.formatTime || formatCustomerServiceLogTime)(value) : '未记录'
const isLong = (value: string) => value.length > 180 || value.split('\n').length > 3
function toggleContent(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
function resetFilters() {
  operatorFilter.value = ''
  actionFilter.value = ''
  resultFilter.value = ''
}
watch([operatorFilter, actionFilter, resultFilter], () => {
  visibleCount.value = pageSize
  expanded.value = new Set()
})
</script>

<template>
  <component :is="showHeading ? 'details' : 'section'" class="service-operation-logs" :class="{ 'without-heading': !showHeading }" :open="showHeading ? !collapsed : undefined" :aria-label="showHeading ? undefined : title">
    <summary v-if="showHeading">{{ title }}（{{ entries.length }}）</summary>
    <div v-if="entries.length >= 8 || hasFilters" class="log-filters" aria-label="日志筛选">
      <label class="log-filter-field"><span>操作人</span><select v-model="operatorFilter" aria-label="日志操作人"><option value="">全部操作人</option><option v-for="name in operators" :key="name" :value="name">{{ name }}</option></select></label>
      <label class="log-filter-field"><span>动作</span><select v-model="actionFilter" aria-label="日志动作"><option value="">全部动作</option><option v-for="action in actions" :key="action" :value="action">{{ action }}</option></select></label>
      <label class="log-filter-field"><span>结果</span><select v-model="resultFilter" aria-label="日志结果"><option value="">全部结果</option><option v-for="value in results" :key="value" :value="value">{{ value }}</option></select></label>
      <button v-if="hasFilters" type="button" class="log-link log-filter-reset" @click="resetFilters">重置筛选</button>
    </div>
    <ol v-if="visible.length" :aria-label="title">
      <li v-for="item in visible" :key="item.key">
        <div class="log-heading"><strong>{{ item.entry.action }}</strong><span class="log-result" :data-tone="customerServiceLogResultTone(item.entry.result)" :title="item.entry.result?.trim() ? undefined : '结果未记录'">{{ result(item.entry) }}</span></div>
        <div v-if="item.entry.content" class="log-body">
          <p :id="`${contentId}-${item.index}`" :class="{ 'log-content-collapsed': isLong(item.entry.content) && !expanded.has(item.key) }">{{ item.entry.content }}</p>
          <button v-if="isLong(item.entry.content)" type="button" class="log-link log-expand" :aria-expanded="expanded.has(item.key)" :aria-controls="`${contentId}-${item.index}`" @click="toggleContent(item.key)">{{ expanded.has(item.key) ? '收起内容' : '展开内容' }}</button>
        </div>
        <div class="log-meta"><span>操作人：{{ operator(item.entry) }}</span><time>{{ time(item.entry.at) }}</time></div>
      </li>
    </ol>
    <p v-else class="log-empty">{{ hasFilters ? '暂无符合筛选条件的记录' : `暂无${title}` }}</p>
    <div v-if="ordered.length && (hasFilters || filtered.length > pageSize || !showHeading)" class="log-footer">
      <span role="status">{{ hasFilters ? `筛选到 ${filtered.length} 条 · ` : '' }}已显示 {{ visible.length }} / {{ filtered.length }} 条</span>
      <button v-if="visible.length < filtered.length" type="button" class="log-link" @click="visibleCount += pageSize">加载更多</button>
    </div>
  </component>
</template>

<style scoped>
.service-operation-logs{min-width:0;container-type:inline-size;border-top:1px solid #e5e9ef;margin-top:14px;padding-top:10px;font-size:12px;color:#354354;line-height:1.6}
.service-operation-logs.without-heading{border-top:0;margin-top:0;padding-top:0}
summary{font-weight:600;color:var(--yy-text-heading,#253447);cursor:pointer;line-height:1.8;overflow-wrap:anywhere}
summary:focus-visible,.log-link:focus-visible,select:focus-visible{outline:2px solid var(--el-color-primary,#2877cb);outline-offset:3px}
ol{padding:0;margin:8px 0 0;list-style:none}.without-heading>ol:first-child{margin-top:0}
li{padding:12px 0;border-top:1px solid #e9edf2;overflow-wrap:anywhere;min-width:0}
li:first-child{border-top:0;padding-top:8px}.without-heading>ol:first-child>li:first-child{padding-top:0}
.log-heading,.log-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;min-width:0}
.log-heading{justify-content:space-between}.log-heading strong{font-size:13px;font-weight:600;color:var(--yy-text-heading,#253447);min-width:0;flex:1 1 110px;line-height:1.7}
.log-result{color:#5e6c7d;background:#f1f4f7;border:1px solid #e1e7ed;padding:1px 7px;border-radius:4px;font-size:12px;line-height:1.6;max-width:100%;box-sizing:border-box;flex:0 1 auto}
.log-result[data-tone="success"]{color:#247548;background:#eef8f1;border-color:#cce9d6}
.log-result[data-tone="danger"]{color:#b3443c;background:#fff1f0;border-color:#f2d2ce}
.log-result[data-tone="warning"]{color:#946015;background:#fff7e8;border-color:#edd9b1}
.log-result[data-tone="info"]{color:#2866a5;background:#eef5ff;border-color:#d0e1f5}
.log-body{margin:5px 0 7px;min-width:0}.log-body p{margin:0;white-space:pre-wrap;line-height:1.8;font-size:12px;color:#455367;overflow-wrap:anywhere}
.log-content-collapsed{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.log-meta{justify-content:space-between;color:#758194;font-size:12px;line-height:1.7}.log-meta time{font-variant-numeric:tabular-nums}
.log-link{border:0;background:none;padding:2px 0;color:var(--el-color-primary,#2877cb);font:inherit;line-height:1.6;cursor:pointer;text-align:left;flex:none}.log-expand{margin-top:3px}
.log-empty{margin:12px 0;color:#758194;font-size:12px;line-height:1.8}
.log-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 4px}.without-heading>.log-filters:first-child{margin-top:0}
.log-filter-field{display:flex;flex-direction:column;gap:3px;min-width:0;font-size:12px;color:#758194}
.log-filter-field select{min-width:0;width:100%;height:30px;box-sizing:border-box;border:1px solid #dce3eb;border-radius:4px;padding:3px 5px;background:#fff;color:#455367;font:inherit;cursor:pointer}
.log-filter-reset{grid-column:1/-1;justify-self:end;padding:0}
.log-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;border-top:1px solid #e9edf2;padding-top:10px;margin-top:2px;color:#758194;font-size:12px}
@container (max-width:280px){.log-filters{grid-template-columns:1fr}.log-meta{gap:2px 8px}}
</style>
