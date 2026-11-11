<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElButton, ElDialog, ElEmpty, ElInput, ElMessage, ElMessageBox, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import { 命中字段搜索, 校验字段搜索 } from '@/组件/筛选/筛选工具'
import { formatMailTime } from '../eBay站内信/模型'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { copyFeedbackTemplate, deleteFeedbackTemplate, feedbackTemplateSession, feedbackTemplateTypes, saveFeedbackTemplate, setFeedbackTemplateEnabled, type FeedbackTemplate, type FeedbackTemplateInput } from './评价模板模型'
import { templateAnnotation as annotation } from './标注'
import TemplateChangeHistory from './模板变更记录.vue'

const historyOpen = ref(false), historyId = ref('')
function openChanges(id = '', type = '') { historyId.value = id ? JSON.stringify([type, id]) : ''; historyOpen.value = true }
const filters = reactive({ types: [] as string[], statuses: [] as string[], query: '', field: 'name', mode: 'contains' as 'contains' | 'exact' })
const applied = reactive({ ...filters, types: [] as string[], statuses: [] as string[] }), page = ref(1), queryError = ref('')
const fields = [{ value: 'name', label: '名称', kind: 'text' as const }, { value: 'text', label: '正文', kind: 'text' as const }]
const statuses = [{ value: 'enabled', label: '已启用' }, { value: 'disabled', label: '已停用' }]
const typeLabel = (type: string) => feedbackTemplateTypes.find(item => item.value === type)?.label ?? type
const results = computed(() => feedbackTemplateSession.templates.filter(item => (!applied.types.length || applied.types.includes(item.type))
  && (!applied.statuses.length || applied.statuses.includes(item.enabled ? 'enabled' : 'disabled'))
  && 命中字段搜索(item[applied.field === 'text' ? 'text' : 'name'], applied.query, applied.mode, 'text'))
  .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id)))
const rows = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20))
watch(() => results.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / 20))) })
function query() {
  queryError.value = 校验字段搜索(filters.query, filters.mode, 'text') ?? ''
  if (queryError.value) return
  Object.assign(applied, filters, { types: [...filters.types], statuses: [...filters.statuses] }); page.value = 1
}
function reset() { Object.assign(filters, { types: [], statuses: [], query: '', field: 'name', mode: 'contains' }); query() }
const editorOpen = ref(false), editId = ref(''), editError = ref('')
const draft = reactive<FeedbackTemplateInput>({ type: 'buyer-positive', name: '', text: '', enabled: true })
function edit(item?: FeedbackTemplate) {
  editId.value = item?.id ?? ''; editError.value = ''
  Object.assign(draft, item ? { type: item.type, name: item.name, text: item.text, enabled: item.enabled } : { type: filters.types.length === 1 ? filters.types[0] : 'buyer-positive', name: '', text: '', enabled: true })
  editorOpen.value = true
}
function save() {
  const result = saveFeedbackTemplate({ ...draft, enabled: true }, editId.value || undefined)
  if (result.error) { editError.value = result.error; return }
  editorOpen.value = false; ElMessage.success('评价模板已保存')
}
function duplicate(item: FeedbackTemplate) { const result = copyFeedbackTemplate(item.id); if (result.error) ElMessage.warning(result.error); else ElMessage.success('已复制为停用副本') }
function toggle(item: FeedbackTemplate) { const error = setFeedbackTemplateEnabled(item.id, !item.enabled); if (error) ElMessage.warning(error); else ElMessage.success(item.enabled ? '已启用' : '已停用') }
async function remove(item: FeedbackTemplate) {
  const id = item.id
  try { await ElMessageBox.confirm(`删除“${item.name}”后，评价页将不能再选择该模板。已填入的内容和历史评价不受影响。`, '删除评价模板', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }) } catch { return }
  const error = deleteFeedbackTemplate(id); if (error) ElMessage.warning(error); else ElMessage.success('已删除')
}
const preview = ref<{ name: string; type: string; text: string }>()
const previewOpen = computed({ get: () => !!preview.value, set: (value: boolean) => { if (!value) preview.value = undefined } })
</script>

<template>
  <div class="feedback-manager" v-prototype="annotation('feedback', '评价模板管理')">
    <div class="feedback-filters">
      <MultiFilter v-model="filters.types" :options="feedbackTemplateTypes" placeholder="全部模板类型" :width="160" />
      <MultiFilter v-model="filters.statuses" :options="statuses" placeholder="全部状态" :width="132" />
      <FieldSearch v-model="filters.query" v-model:field="filters.field" v-model:mode="filters.mode" :fields="fields" aria-prefix="评价模板" :width="380" @search="query" />
      <ElButton type="primary" @click="query">查询</ElButton><ElButton @click="reset">重置</ElButton>
    </div>
    <p v-if="queryError" class="feedback-error" role="alert">{{ queryError }}</p>
    <div class="feedback-tools"><ElButton type="primary" @click="edit()">新增评价模板</ElButton><ElButton @click="openChanges()">变更记录</ElButton></div>
    <div class="feedback-table"><ElTable :data="rows" row-key="id" height="100%" stripe>
      <ElTableColumn label="名称" min-width="160"><template #default="{ row }"><button class="feedback-name" @click="edit(row as FeedbackTemplate)">{{ row.name }}</button></template></ElTableColumn>
      <ElTableColumn label="模板类型" width="140"><template #default="{ row }">{{ typeLabel(row.type) }}</template></ElTableColumn>
      <ElTableColumn label="正文摘要" min-width="260"><template #default="{ row }"><p class="feedback-summary" :title="row.text">{{ row.text }}</p></template></ElTableColumn>
      <ElTableColumn label="状态" width="85"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">{{ row.enabled ? '已启用' : '已停用' }}</ElTag></template></ElTableColumn>
      <ElTableColumn label="更新时间" width="132"><template #default="{ row }"><span :title="格式化北京时间(row.updatedAt)">{{ formatMailTime(row.updatedAt) }}</span></template></ElTableColumn>
      <ElTableColumn label="操作" width="300" fixed="right"><template #default="{ row }"><div class="feedback-actions"><ElButton link type="primary" @click="preview = { name: row.name, type: row.type, text: row.text }">预览</ElButton><ElButton link type="primary" @click="edit(row as FeedbackTemplate)">编辑</ElButton><ElButton link type="primary" @click="duplicate(row as FeedbackTemplate)">复制</ElButton><ElButton link :type="row.enabled ? 'warning' : 'primary'" @click="toggle(row as FeedbackTemplate)">{{ row.enabled ? '停用' : '启用' }}</ElButton><ElButton link type="primary" @click="openChanges(row.id, row.type)">变更记录</ElButton><ElButton link type="danger" @click="remove(row as FeedbackTemplate)">删除</ElButton></div></template></ElTableColumn>
      <template #empty><ElEmpty description="没有匹配的评价模板" :image-size="64" /></template>
    </ElTable></div>
    <footer class="feedback-pagination"><span>共 {{ results.length }} 条</span><ElPagination v-model:current-page="page" :page-size="20" :total="results.length" layout="prev, pager, next" size="small" :pager-count="5" /></footer>
    <TemplateChangeHistory v-if="historyOpen" :kinds="['buyer-positive', 'review-reply']" :template-id="historyId" @close="historyOpen = false" />
    <ElDialog v-model="editorOpen" :title="`${editId ? '编辑' : '新增'}评价模板`" width="min(680px, 94vw)" align-center :close-on-click-modal="false" destroy-on-close>
      <div class="feedback-form" v-prototype="annotation('feedbackEditor', '评价模板编辑')">
        <label><span>模板类型 <i>*</i></span><ElSelect v-model="draft.type" aria-label="评价模板类型" :disabled="!!editId"><ElOption v-for="item in feedbackTemplateTypes" :key="item.value" :value="item.value" :label="item.label" /></ElSelect></label>
        <label><span>模板名称 <i>*</i></span><ElInput v-model="draft.name" aria-label="评价模板名称" maxlength="80" show-word-limit placeholder="输入便于识别的名称" /></label>
        <label><span>评价内容 <i>*</i></span><ElInput v-model="draft.text" aria-label="评价模板正文" type="textarea" :rows="7" placeholder="输入完整的评价内容" /></label>
        <div class="feedback-meta"><span>纯文本，不支持变量和附件</span><span :class="{ 'feedback-overlimit': Array.from(draft.text.trim()).length > 500 }">{{ Array.from(draft.text.trim()).length }} / 500</span></div>
        <p v-if="editError" class="feedback-error" role="alert">{{ editError }}</p>
      </div>
      <template #footer><ElButton @click="editorOpen = false">取消</ElButton><ElButton type="primary" @click="save">保存</ElButton></template>
    </ElDialog>
    <ElDialog v-model="previewOpen" :title="`评价模板预览 · ${preview?.name ?? ''}`" width="min(640px, 94vw)" align-center><template v-if="preview"><ElTag effect="plain">{{ typeLabel(preview.type) }}</ElTag><p class="feedback-preview">{{ preview.text }}</p></template><template #footer><ElButton @click="previewOpen = false">关闭</ElButton></template></ElDialog>
  </div>
</template>

<style scoped>
.feedback-manager{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.feedback-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:13px 16px 10px}.feedback-filters :deep(.el-button),.feedback-tools :deep(.el-button){margin:0;font-size:12px}.feedback-tools{padding:0 16px 12px}.feedback-table{flex:1;min-height:0;padding:0 15px;overflow:hidden}
.feedback-table :deep(.el-table) {
  --el-table-header-bg-color: #f5f7fa;
  font-size: 12px;
}
.feedback-table :deep(th) {
  color: var(--yy-text-heading);
}
.feedback-table :deep(.el-table__cell){padding:12px 0}.feedback-name{background:none;border:0;padding:0;text-align:left;color:#2789e3;font-size:12px;cursor:pointer;overflow-wrap:anywhere}.feedback-summary{margin:0;line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}.feedback-actions{display:flex;gap:9px;white-space:nowrap}.feedback-actions :deep(.el-button){margin:0;font-size:12px}.feedback-pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid #edf0f5;color:#8a98a9}.feedback-form{display:flex;flex-direction:column;gap:16px;max-height:calc(100vh - 220px);overflow:auto}.feedback-form label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:var(--yy-text-heading)}.feedback-form i{font-style:normal;color:#e07878}.feedback-form :deep(.el-select){width:100%}.feedback-meta{display:flex;justify-content:space-between;gap:12px;color:#96a2b2;font-size:11px;margin-top:-8px}.feedback-error,.feedback-overlimit{color:#c45656}.feedback-error{font-size:12px;margin:0 16px 10px;line-height:1.6}.feedback-form .feedback-error{margin:0}.feedback-preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;padding:16px;background:#f8fafc;border:1px solid #e5ebf3;font-size:13px;line-height:1.8}@media(max-width:1280px){.feedback-filters{padding:11px 12px 9px}.feedback-tools{padding:0 12px 11px}.feedback-table{padding:0 10px}.feedback-actions{gap:7px}}
</style>
