<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElButton, ElDialog, ElEmpty, ElInput, ElMessage, ElMessageBox, ElPagination, ElTable, ElTableColumn, ElTag } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 命中字段搜索, 校验字段搜索 } from '@/组件/筛选/筛选工具'
import { formatMailTime, MAX_REPLY_ATTACHMENTS, MAX_REPLY_BODY_LENGTH, validateDraft } from '../eBay站内信/模型'
import type { MessageAttachment } from '../eBay站内信/类型'
import RichTextEditor from './富文本编辑器.vue'
import FeedbackTemplateManager from './评价模板管理.vue'
import { plainTextToHtml, richHtmlToSendText, richHtmlToText, sanitizeRichHtml } from './富文本'
import { copyTemplate, deleteTemplate, getTemplateVariables, renderMessageTemplate, saveTemplate, setTemplateEnabled, templateSession, variableSources, type MessageTemplate, type TemplateContext, type TemplateInput, type TemplateKind, type TemplateVariable } from './模型'
import { templateAnnotation as annotation } from './标注'

const kind = ref<TemplateKind | 'feedback'>('message'), page = ref(1)
const fields = [{ value: 'title', label: '名称', kind: 'text' as const }, { value: 'body', label: '正文', kind: 'text' as const }]
const filter = reactive({ query: '', field: 'title', mode: 'contains' as 'contains' | 'exact', statuses: [] as string[] })
const applied = reactive({ ...filter, statuses: [] as string[] }), queryError = ref('')
const statusOptions = [{ value: 'enabled', label: '已启用' }, { value: 'disabled', label: '已停用' }]
const results = computed(() => templateSession.templates.filter(item => item.kind === kind.value
  && (!applied.statuses.length || applied.statuses.includes(item.enabled ? 'enabled' : 'disabled'))
  && 命中字段搜索(item[applied.field === 'body' ? 'body' : 'title'], applied.query, applied.mode, 'text'))
  .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id)))
const rows = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20))
const kindLabel = (value: TemplateKind | 'feedback') => value === 'message' ? '站内信模板' : value === 'phrase' ? '常用语' : '评价模板'
const variablesFor = (item: TemplateInput) => getTemplateVariables(`${item.kind === 'message' ? item.subject ?? '' : ''}\n${item.body}`)
watch(kind, () => { page.value = 1 })
watch(() => results.value.length, () => { page.value = Math.min(page.value, Math.max(1, Math.ceil(results.value.length / 20))) })
function query() { queryError.value = 校验字段搜索(filter.query, filter.mode, 'text') ?? ''; if (queryError.value) return; Object.assign(applied, filter, { statuses: [...filter.statuses] }); page.value = 1 }
function resetFilters() { Object.assign(filter, { query: '', field: 'title', mode: 'contains', statuses: [] }); query() }

const editorOpen = ref(false), editId = ref(''), editError = ref('')
const editDraft = reactive<TemplateInput>({ kind: 'message', title: '', subject: '', body: '', bodyHtml: '', attachments: [], enabled: true })
const richEditor = ref<{ focus(): void; insertText(value: string): void }>()
const subjectInput = ref<InstanceType<typeof ElInput>>(), bodyInput = ref<HTMLTextAreaElement>(), attachmentInput = ref<HTMLInputElement>()
const editTarget = ref<'subject' | 'body'>('body'), subjectCursor = ref({ start: 0, end: 0 }), bodyCursor = ref({ start: 0, end: 0 })
const htmlBody = computed({ get: () => editDraft.bodyHtml ?? plainTextToHtml(editDraft.body), set: (value: string) => { editDraft.bodyHtml = value; editDraft.body = richHtmlToText(value) } })
const outgoingBodyLength = computed(() => editDraft.kind === 'message' && editDraft.bodyHtml !== undefined ? richHtmlToSendText(editDraft.bodyHtml).length : editDraft.body.length)
function snapshot(input: TemplateInput): TemplateInput {
  return { kind: input.kind, title: input.title, enabled: input.enabled, subject: input.kind === 'message' ? input.subject ?? '' : undefined,
    body: input.body, bodyHtml: input.kind === 'message' ? input.bodyHtml ?? plainTextToHtml(input.body) : plainTextToHtml(input.body),
    attachments: input.kind === 'message' ? (input.attachments ?? []).map(item => ({ ...item })) : [] }
}
function openEditor(item?: MessageTemplate) {
  editId.value = item?.id ?? ''; editError.value = ''; editTarget.value = 'body'
  Object.assign(editDraft, item ? snapshot(item) : { kind: kind.value, title: '', subject: '', body: '', bodyHtml: '', attachments: [], enabled: true })
  subjectCursor.value = { start: editDraft.subject?.length ?? 0, end: editDraft.subject?.length ?? 0 }
  bodyCursor.value = { start: editDraft.body.length, end: editDraft.body.length }; editorOpen.value = true
}
function rememberSubject() {
  editTarget.value = 'subject'
  const input = subjectInput.value?.input
  if (input) subjectCursor.value = { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length }
}
function rememberBody() {
  editTarget.value = 'body'
  if (bodyInput.value) bodyCursor.value = { start: bodyInput.value.selectionStart, end: bodyInput.value.selectionEnd }
}
async function insertVariable(variable: TemplateVariable) {
  const token = `{{${variable.key}}}`
  if (editTarget.value === 'subject' && editDraft.kind === 'message') {
    const value = editDraft.subject ?? '', { start, end } = subjectCursor.value
    if (value.length - (end - start) + token.length > 200) { editError.value = '插入后内部参考标题超过 200 个字符'; return }
    editDraft.subject = value.slice(0, start) + token + value.slice(end)
    const position = start + token.length
    await nextTick(); subjectInput.value?.focus(); subjectInput.value?.input?.setSelectionRange(position, position)
    subjectCursor.value = { start: position, end: position }
  } else if (editDraft.kind === 'message') richEditor.value?.insertText(token)
  else {
    const { start, end } = bodyCursor.value
    if (editDraft.body.length - (end - start) + token.length > MAX_REPLY_BODY_LENGTH) { editError.value = `插入后正文超过 ${MAX_REPLY_BODY_LENGTH} 个字符`; return }
    editDraft.body = editDraft.body.slice(0, start) + token + editDraft.body.slice(end)
    const position = start + token.length
    await nextTick(); bodyInput.value?.focus(); bodyInput.value?.setSelectionRange(position, position)
    bodyCursor.value = { start: position, end: position }
  }
  editError.value = ''
}
function addAttachments(event: Event) {
  const input = event.target as HTMLInputElement, files = [...(input.files ?? [])]
  input.value = ''; if (!files.length) return
  const added: MessageAttachment[] = files.map(file => ({ id: `template-file-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, name: file.name, size: file.size, type: file.type, source: 'local' }))
  const attachments = [...(editDraft.attachments ?? []), ...added]
  const error = validateDraft({ body: 'Attachment validation', attachments })
  if (error) { editError.value = error; return }
  editDraft.attachments = attachments; editError.value = ''
}
function removeAttachment(id: string) { editDraft.attachments = (editDraft.attachments ?? []).filter(item => item.id !== id) }
function attachmentSize(size: number) { return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` }
function save() {
  const result = saveTemplate(snapshot({ ...editDraft, enabled: true }), editId.value || undefined)
  if (result.error) { editError.value = result.error; return }
  kind.value = editDraft.kind; editorOpen.value = false; ElMessage.success('已保存')
}
function duplicate(item: MessageTemplate) { const result = copyTemplate(item.id); if (result.error) ElMessage.warning(result.error); else ElMessage.success('已复制为停用副本') }
function toggleEnabled(item: MessageTemplate) { const error = setTemplateEnabled(item.id, !item.enabled); if (error) ElMessage.warning(error); else ElMessage.success(item.enabled ? '已启用' : '已停用') }
async function remove(item: MessageTemplate) {
  const targetId = item.id
  try { await ElMessageBox.confirm(`删除“${item.title}”后，将不能再从回复面板选择。已填写的草稿和历史消息不受影响。`, '删除内容', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  const error = deleteTemplate(targetId); if (error) ElMessage.warning(error); else ElMessage.success('已删除')
}

const previewOpen = ref(false), previewContent = ref<TemplateInput>({ kind: 'message', title: '', subject: '', body: '', enabled: true })
const previewContext = reactive<TemplateContext>({})
const previewVariables = computed(() => variablesFor(previewContent.value))
const rendered = computed(() => renderMessageTemplate(previewContent.value, previewContext))
const previewSources = computed(() => variableSources.filter(source => previewVariables.value.some(variable => variable.source === source.value)))
const previewHtml = computed(() => sanitizeRichHtml(rendered.value.bodyHtml))
function openPreview(item: TemplateInput) {
  previewContent.value = snapshot(item)
  for (const key of Object.keys(previewContext)) delete previewContext[key as keyof TemplateContext]
  previewOpen.value = true
}
function setPreviewValue(source: string, value: string) { previewContext[source as keyof TemplateContext] = value }
</script>

<template>
  <section class="template-manager" v-prototype="annotation('overview', '消息模板管理')">
    <header class="template-topbar"><div class="template-kind-tabs" role="tablist" aria-label="内容类型"><button v-for="value in (['message', 'phrase', 'feedback'] as const)" :key="value" role="tab" :aria-selected="kind === value" :class="{ active: kind === value }" @click="kind = value">{{ kindLabel(value) }}</button></div></header>
    <FeedbackTemplateManager v-if="kind === 'feedback'" />
    <template v-else>
    <div class="template-filters" v-prototype="annotation('filters', '模板查询')"><MultiFilter v-model="filter.statuses" :options="statusOptions" placeholder="全部状态" :width="132" /><FieldSearch v-model="filter.query" v-model:field="filter.field" v-model:mode="filter.mode" :fields="fields" aria-prefix="模板" :width="380" @search="query" /><ElButton type="primary" @click="query">查询</ElButton><ElButton @click="resetFilters">重置</ElButton></div>
    <p v-if="queryError" class="template-error" role="alert">{{ queryError }}</p>
    <div class="template-actions" aria-label="模板操作"><ElButton type="primary" @click="openEditor()">新增{{ kindLabel(kind) }}</ElButton></div>
    <div class="template-table"><ElTable :data="rows" row-key="id" height="100%" stripe>
      <ElTableColumn prop="title" label="名称" min-width="175"><template #default="{ row }"><button class="template-name" @click="openEditor(row as MessageTemplate)">{{ row.title }}</button></template></ElTableColumn>
      <ElTableColumn label="正文摘要" min-width="270"><template #default="{ row }"><p class="template-body-summary" :title="row.body">{{ row.body }}</p></template></ElTableColumn>
      <ElTableColumn label="使用变量" min-width="150"><template #default="{ row }"><div class="template-variable-tags"><ElTag v-for="variable in variablesFor(row as MessageTemplate)" :key="variable.id" size="small" effect="plain">{{ variable.label }}</ElTag><span v-if="!variablesFor(row as MessageTemplate).length" class="template-muted">—</span></div></template></ElTableColumn>
      <ElTableColumn label="状态" width="85"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">{{ row.enabled ? '已启用' : '已停用' }}</ElTag></template></ElTableColumn>
      <ElTableColumn label="更新时间" width="132"><template #default="{ row }"><span :title="`${row.updatedAt}（显示为北京时间）`">{{ formatMailTime(row.updatedAt) }}</span></template></ElTableColumn>
      <ElTableColumn label="操作" width="230" fixed="right"><template #default="{ row }"><div class="template-row-actions" v-prototype="annotation('lifecycle', '模板复制启停与删除')"><ElButton link type="primary" @click="openPreview(row as MessageTemplate)">预览</ElButton><ElButton link type="primary" @click="openEditor(row as MessageTemplate)">编辑</ElButton><ElButton link type="primary" @click="duplicate(row as MessageTemplate)">复制</ElButton><ElButton link :type="row.enabled ? 'warning' : 'primary'" @click="toggleEnabled(row as MessageTemplate)">{{ row.enabled ? '停用' : '启用' }}</ElButton><ElButton link type="danger" @click="remove(row as MessageTemplate)">删除</ElButton></div></template></ElTableColumn>
      <template #empty><ElEmpty description="没有匹配的内容" :image-size="64" /></template>
    </ElTable></div>
    <footer class="template-pagination"><span>共 {{ results.length }} 条</span><ElPagination v-model:current-page="page" :page-size="20" :total="results.length" layout="prev, pager, next" size="small" :pager-count="5" /></footer>
    </template>

    <ElDialog v-model="editorOpen" :title="`${editId ? '编辑' : '新增'}${kindLabel(editDraft.kind)}`" width="min(860px, 94vw)" align-center :close-on-click-modal="false" destroy-on-close class="template-editor-dialog">
      <section class="template-edit-content" v-prototype="annotation('editor', '模板标题正文与附件')">
        <label class="template-field"><span>{{ editDraft.kind === 'message' ? '模板名称' : '名称' }} <i>*</i></span><ElInput v-model="editDraft.title" maxlength="80" show-word-limit aria-label="模板名称" placeholder="输入便于识别的名称" /></label>
        <label v-if="editDraft.kind === 'message'" class="template-field template-subject-field"><span>内部参考标题</span><ElInput ref="subjectInput" v-model="editDraft.subject" maxlength="200" show-word-limit aria-label="内部参考标题" placeholder="选填，仅用于内部参考，不发送给买家" @focus="rememberSubject" @click="rememberSubject" @keyup="rememberSubject" @select="rememberSubject" /></label>
        <div class="template-body-heading"><span>{{ editDraft.kind === 'message' ? '站内信正文' : '正文' }} <i>*</i></span></div>
        <div class="template-variable-picker" v-prototype="annotation('variables', '内置变量插入')"><span>插入变量</span><div><button v-for="variable in templateSession.variables" :key="variable.id" :title="variable.key" :aria-label="`插入变量 ${variable.label}`" @mousedown.prevent @click="insertVariable(variable)">{{ variable.label }}</button></div></div>
        <RichTextEditor v-if="editDraft.kind === 'message'" ref="richEditor" v-model="htmlBody" label="模板正文" @focusin="editTarget = 'body'" />
        <textarea v-else ref="bodyInput" v-model="editDraft.body" class="template-body-input" aria-label="模板正文" placeholder="输入常用语，在需要的位置插入变量…" @focus="rememberBody" @click="rememberBody" @keyup="rememberBody" @select="rememberBody" @input="rememberBody" />
        <div class="template-body-meta"><span v-pre>变量使用 {{标识}} 格式</span><span>{{ outgoingBodyLength }} / {{ MAX_REPLY_BODY_LENGTH }}</span></div>
        <section v-if="editDraft.kind === 'message'" class="template-attachments" aria-label="模板附件">
          <div class="template-attachments-heading"><span>附件</span><ElButton size="small" @click="attachmentInput?.click()">添加附件</ElButton><small>PNG / JPG / PDF · 最多 {{ MAX_REPLY_ATTACHMENTS }} 个，每个不超过 5 MiB</small></div>
          <input ref="attachmentInput" class="template-file-input" type="file" multiple accept="image/png,image/jpeg,application/pdf" aria-label="选择模板附件" @change="addAttachments" />
          <ul v-if="editDraft.attachments?.length" class="template-attachment-list"><li v-for="attachment in editDraft.attachments" :key="attachment.id"><span>{{ attachment.name }}</span><small>{{ attachmentSize(attachment.size) }}</small><button :aria-label="`移除附件 ${attachment.name}`" @click="removeAttachment(attachment.id)">移除</button></li></ul>
        </section>
        <p v-if="editError" class="template-error" role="alert">{{ editError }}</p>
      </section>
      <template #footer><div class="template-dialog-footer"><ElButton @click="openPreview(editDraft)">预览内容</ElButton><span /><ElButton @click="editorOpen = false">取消</ElButton><ElButton type="primary" @click="save">保存</ElButton></div></template>
    </ElDialog>

    <ElDialog v-model="previewOpen" :title="`内容预览 · ${previewContent.title || '未命名内容'}`" width="min(760px, 94vw)" append-to-body align-center class="template-preview-dialog">
      <section v-prototype="annotation('preview', '完整内容预览')">
        <div v-if="previewVariables.length" class="template-preview-fields" v-prototype="annotation('source', '变量示例值')"><h4>填写示例值</h4><p>仅用于当前预览，不修改模板。</p><label v-for="source in previewSources" :key="source.value" class="template-field"><span>{{ source.label }}</span><ElInput :model-value="previewContext[source.value as keyof TemplateContext]" :aria-label="`预览 ${source.label}`" placeholder="填写示例值" @update:model-value="value => setPreviewValue(source.value, value)" /></label></div>
        <p v-if="rendered.missing.length" class="template-preview-warning">待填写：{{ rendered.missing.map(variable => variable.label).join('、') }}</p><p v-if="rendered.unknown.length" class="template-error" role="alert">未知或无效变量：{{ rendered.unknown.join('、') }}</p>
        <div v-if="previewContent.kind === 'message'" class="template-preview-subject"><span>内部参考标题（不发送给买家）</span><h3>{{ rendered.subject || '未填写' }}</h3></div>
        <div class="template-preview-body" v-html="previewHtml || '暂无正文'" />
        <ul v-if="rendered.attachments.length" class="template-attachment-list template-preview-attachments" aria-label="预览附件"><li v-for="attachment in rendered.attachments" :key="attachment.id"><span>{{ attachment.name }}</span><small>{{ attachmentSize(attachment.size) }}</small></li></ul>
      </section><template #footer><ElButton @click="previewOpen = false">关闭</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.template-manager{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;background:#fff;border:1px solid #e5eaf1;border-radius:4px;color:#46576b;font-size:12px;overflow:hidden}.template-topbar{display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid #e8edf3;flex-shrink:0}.template-kind-tabs{display:flex;gap:28px;align-self:stretch}.template-kind-tabs button{position:relative;border:0;background:none;padding:16px 0;color:#697b90;font-size:14px;cursor:pointer;white-space:nowrap}.template-kind-tabs button.active{color:#2689e6;font-weight:600}.template-kind-tabs button.active:after{content:'';height:2px;background:#409eff;position:absolute;bottom:0;left:0;right:0}.template-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:13px 16px 10px;flex-shrink:0}.template-filters :deep(.el-button),.template-actions :deep(.el-button){margin:0;font-size:12px}.template-actions{display:flex;align-items:center;padding:0 16px 12px;flex-shrink:0}.template-table{flex:1;min-height:0;padding:0 15px;overflow:hidden}.template-table :deep(.el-table){font-size:12px}.template-table :deep(.el-table th){background:#f5f7fa;color:var(--yy-text-heading)}.template-table :deep(.el-table__cell){padding:12px 0}.template-name{border:0;background:none;color:#2789e3;padding:0;cursor:pointer;text-align:left;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.template-body-summary{margin:0;line-height:1.65;color:#63758a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}.template-variable-tags{display:flex;flex-wrap:wrap;gap:4px}.template-variable-tags :deep(.el-tag){font-size:10px}.template-muted{color:#99a5b4}.template-row-actions{display:flex;gap:9px;flex-wrap:nowrap}.template-row-actions :deep(.el-button){margin:0;font-size:12px}.template-pagination{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid #edf0f5;flex-shrink:0;color:#8a98a9}.template-edit-content{display:flex;flex-direction:column;min-height:0}.template-field{display:flex;flex-direction:column;gap:7px;min-width:0;flex:1;font-size:12px;color:#4c5d71}.template-field>span{color:var(--yy-text-heading)}.template-field i,.template-body-heading i{font-style:normal;color:#e07878;margin-left:3px}.template-subject-field{margin-top:16px}.template-body-heading{display:flex;align-items:center;justify-content:space-between;margin-top:16px;margin-bottom:8px;color:var(--yy-text-heading);font-size:12px}.template-variable-picker{display:flex;align-items:flex-start;gap:10px;padding:10px 11px;background:#f7f9fc;border:1px solid #e5eaf2;border-bottom:0;border-radius:4px 4px 0 0;font-size:11px}.template-variable-picker>span{flex-shrink:0;padding-top:4px;color:#8996a8}.template-variable-picker>div{display:flex;flex-wrap:wrap;gap:6px;max-height:100px;overflow:auto}.template-variable-picker button{border:1px solid #dae7f5;border-radius:3px;background:#fff;color:#488ac8;padding:4px 7px;font-size:11px;cursor:pointer}.template-variable-picker button:hover{background:#eaf5ff}.template-body-input{box-sizing:border-box;width:100%;height:230px;min-height:150px;max-height:40vh;resize:vertical;outline:none;border:1px solid #dce4ee;border-radius:0 0 4px 4px;padding:13px;font-family:inherit;font-size:13px;line-height:1.8;color:#42566e}.template-body-input:focus{border-color:#409eff}.template-body-meta{display:flex;justify-content:space-between;gap:15px;color:#9ba7b5;font-size:11px;margin-top:7px}.template-error{margin:8px 0;color:#c45656;font-size:12px;line-height:1.6}.template-manager>.template-error{padding:0 16px}.template-dialog-footer{display:flex;align-items:center;gap:8px}.template-dialog-footer>span{flex:1}.template-dialog-footer :deep(.el-button){margin:0}.template-preview-fields{display:grid;grid-template-columns:1fr 1fr;gap:13px 16px;padding:14px;background:#f8fafc;border:1px solid #e7edf5;border-radius:4px}.template-preview-fields h4{grid-column:1/-1;margin:0;color:var(--yy-text-heading);font-size:13px}.template-preview-fields>p{grid-column:1/-1;margin:-5px 0 0;color:#96a2b1;font-size:11px}.template-preview-warning{font-size:12px;color:#ac823f;margin:12px 0}.template-preview-subject{margin:16px 0 0}.template-preview-subject>span{font-size:12px;color:#8493a7}.template-preview-subject h3{margin:8px 0;font-size:16px;line-height:1.5;color:var(--yy-text-heading);overflow-wrap:anywhere}.template-preview-body{margin:16px 0 0;padding:17px;background:#fafcff;border:1px solid #e3ebf6;border-radius:4px;overflow-wrap:anywhere;word-break:break-word;max-height:320px;overflow:auto;font-family:inherit;font-size:13px;line-height:1.8;color:#40546a}.template-preview-body :deep(p){margin:0 0 8px}.template-preview-body :deep(h1),.template-preview-body :deep(h2),.template-preview-body :deep(h3){color:var(--yy-text-heading);line-height:1.4}.template-attachments{margin-top:16px}.template-attachments-heading{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.template-attachments-heading>span{color:var(--yy-text-heading)}.template-attachments-heading small,.template-attachment-list small{color:#93a0b1;font-size:11px}.template-file-input{display:none}.template-attachment-list{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:6px}.template-attachment-list li{display:flex;align-items:center;gap:10px;border:1px solid #e5ebf3;border-radius:4px;padding:7px 10px;min-width:0;font-size:12px}.template-attachment-list li>span{flex:1;min-width:0;overflow-wrap:anywhere}.template-attachment-list button{background:none;border:0;color:#409eff;cursor:pointer;font-size:12px}.template-preview-attachments{margin-top:12px}:global(.template-editor-dialog .el-dialog__body){max-height:calc(100vh - 215px);overflow:auto}:global(.template-preview-dialog .el-dialog__body){max-height:calc(100vh - 200px);overflow:auto}@media(max-width:1280px){.template-topbar{padding:0 12px}.template-filters{padding:11px 12px 9px}.template-actions{padding:0 12px 11px}.template-table{padding:0 10px}.template-row-actions{gap:7px}.template-kind-tabs{gap:22px}}@media(max-width:700px){.template-preview-fields{grid-template-columns:1fr}}
</style>
