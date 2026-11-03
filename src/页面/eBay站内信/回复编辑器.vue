<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { routerKey } from 'vue-router'
import { ElButton, ElCheckbox, ElDialog, ElEmpty, ElIcon, ElInput } from 'element-plus'
import { ChatDotRound, Close, Document, FullScreen, Link, Lock, MagicStick, Paperclip, Refresh, Upload } from '@element-plus/icons-vue'
import { getTemplateVariables, renderReplyTemplate, templateSession, type MessageTemplate, type TemplateContext, type TemplateKind } from '../消息模板管理/模型'
import RichEditor from '../消息模板管理/富文本编辑器.vue'
import { plainTextToHtml, richHtmlToSendText, richHtmlToText, sanitizeRichHtml } from '../消息模板管理/富文本'
import { formatMailTime, MAX_NOTE_BODY_LENGTH, MAX_REPLY_ATTACHMENTS, MAX_REPLY_BODY_LENGTH, validateDraft } from './模型'
import { validateAttachmentUrl } from './邮箱模型'
import { mailAnnotation } from './站内信标注'
import { reviewAnnotation } from '../eBay评价/标注'
import type { Conversation, MessageAttachment, ReplyDraft } from './类型'

const props = withDefaults(defineProps<{ conversation: Conversation; draft: ReplyDraft; mode: 'reply' | 'note'; sending: boolean; uncertain: boolean; templateContext?: TemplateContext; markProcessedOnSend?: boolean; purpose?: 'mailbox' | 'review-contact' }>(), { markProcessedOnSend: true, purpose: 'mailbox' })
const emit = defineEmits<{ 'update:mode': [value: 'reply' | 'note']; 'update:markProcessedOnSend': [value: boolean]; send: []; save: [] }>()
const router = inject(routerKey, undefined)
const embeddedContact = computed(() => props.purpose === 'review-contact')
const contactEditorAnnotation = { ...reviewAnnotation('contact', '联系买家回复编辑器'), id: 'oms.ebay-reviews.contactEditor', 锚点: 'oms.ebay-reviews.contactEditor' }
const contactSendAnnotation = { ...reviewAnnotation('contact', '联系买家发送站内信'), id: 'oms.ebay-reviews.contactSend', 锚点: 'oms.ebay-reviews.contactSend' }
const managementPath = '/oms/ebay-service/message-templates'
const expanded = ref(false), templatesOpen = ref(false), templateSearch = ref(''), uploadOpen = ref(false), urlValue = ref(''), urlError = ref(''), uploadDragging = ref(false)
const templateKind = ref<TemplateKind>('message'), selectedTemplate = ref<MessageTemplate>(), templateError = ref('')
const expandedTemplateIds = ref(new Set<string>())
const selectedContext = ref(''), selectedDefinitions = ref('')
const pendingTemplate = ref<{ content: string; replyNow: boolean; context: string; draftSignature: string }>()
const attachmentError = ref(''), dragging = ref(false), bodyHeight = ref<number>(), resizing = ref(false)
const fileInput = ref<HTMLInputElement>(), richEditor = ref<InstanceType<typeof RichEditor>>(), bodyElement = ref<HTMLElement>()
const plainEditor = ref<HTMLTextAreaElement>(), plainSelection = ref<{ start: number; end: number; body: string }>()
const plainBody = computed({ get: () => props.draft.body, set: (value: string) => { props.draft.body = value; delete props.draft.bodyHtml } })
const richBody = computed({ get: () => props.draft.bodyHtml ?? plainTextToHtml(props.draft.body), set: (value: string) => { props.draft.bodyHtml = sanitizeRichHtml(value); props.draft.body = richHtmlToText(props.draft.bodyHtml) } })
const generating = ref(false), aiOpen = ref(false)
const aiSuggestion = ref<{ english: string; chinese: string; context: string }>()
const chineseReference = ref<{ bodySnapshot: string; chinese: string; appended: boolean }>()
const sendDisabled = computed(() => !props.draft.body.trim() || (props.mode === 'reply' && (!props.conversation.canReply || props.sending || props.uncertain)))
const bodyLengthLimit = computed(() => props.mode === 'note' ? MAX_NOTE_BODY_LENGTH : MAX_REPLY_BODY_LENGTH)
const visibleTemplates = computed(() => templateSession.templates.filter(template => template.enabled && template.kind === templateKind.value && `${template.title} ${template.subject ?? ''} ${template.body}`.toLowerCase().includes(templateSearch.value.trim().toLowerCase())).map(template => template.kind === 'phrase' ? { ...template } : template))
const reliableTemplateContext = computed<TemplateContext>(() => ({ buyerId: props.conversation.buyerId, ...props.templateContext }))
const templateContextSignature = computed(() => JSON.stringify([props.conversation.id, props.mode, reliableTemplateContext.value]))
const renderedTemplate = computed(() => selectedTemplate.value ? renderReplyTemplate(selectedTemplate.value, reliableTemplateContext.value) : { subject: '', body: '', bodyHtml: '', attachments: [], missing: [], unknown: [] })
const selectedVariables = computed(() => getTemplateVariables(selectedTemplate.value?.body ?? ''))
const templateSelectionIssue = computed(() => {
  const selected = selectedTemplate.value
  if (!selected) return ''
  const latest = templateSession.templates.find(item => item.id === selected.id)
  if (!latest) return '该模板已被删除，请选择其他内容。'
  if (!latest.enabled) return '该模板已停用，请选择其他内容。'
  if (JSON.stringify(latest) !== JSON.stringify(selected) || JSON.stringify(templateSession.variables) !== selectedDefinitions.value) return '模板或变量已更新，请重新预览后使用。'
  if (selectedContext.value !== templateContextSignature.value) return '当前会话资料已变化，请重新预览后使用。'
  return ''
})
const unresolvedTokens = (body: string) => /\{\{|\}\}/.test(body)
const templateBodyError = computed(() => validateDraft({ ...renderedTemplate.value }))
const templateReady = computed(() => Boolean(selectedTemplate.value && !templateSelectionIssue.value && !renderedTemplate.value.missing.length && !renderedTemplate.value.unknown.length && renderedTemplate.value.body.trim() && !templateBodyError.value && !unresolvedTokens(renderedTemplate.value.body)))
const expandedProps = computed(() => expanded.value ? { modelValue: true, title: props.mode === 'reply' ? '展开写信' : '展开内部备注', width: 'min(1120px, 94vw)', top: '4vh', appendToBody: true, closeOnClickModal: false, destroyOnClose: true, class: 'reply-expanded-dialog' } : {})
const textareaStyle = computed(() => !expanded.value && bodyHeight.value ? { '--reply-body-height': `${bodyHeight.value}px` } : {})
const contextSignature = computed(() => {
  const incoming = [...props.conversation.messages].reverse().find(message => message.kind === 'incoming')
  return JSON.stringify([props.conversation.id, props.conversation.shopId, props.conversation.buyerId, incoming?.id, incoming?.body, props.conversation.association, props.conversation.relatedOrderIds])
})
let generation = 0
let aiTimer: ReturnType<typeof setTimeout> | undefined
let dragStartY = 0, dragStartHeight = 180
const knownTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf' }

function cancelAi() {
  generation += 1
  if (aiTimer) clearTimeout(aiTimer)
  aiTimer = undefined; generating.value = false
}
watch(contextSignature, () => { cancelAi(); aiSuggestion.value = undefined; chineseReference.value = undefined; aiOpen.value = false })
watch(() => props.conversation.id, () => {
  expanded.value = false; templatesOpen.value = false; closeUpload(); attachmentError.value = ''; dragging.value = false; plainSelection.value = undefined; stopResize()
})
watch(templatesOpen, value => { if (!value) { pendingTemplate.value = undefined; selectedTemplate.value = undefined; templateError.value = '' } })
watch([templateKind, templateSearch], () => {
  expandedTemplateIds.value.clear(); pendingTemplate.value = undefined; templateError.value = ''
  if (templatesOpen.value) selectFirstTemplate()
})
watch(() => props.mode, () => {
  cancelAi(); aiSuggestion.value = undefined; chineseReference.value = undefined; aiOpen.value = false; templatesOpen.value = false; attachmentError.value = ''; plainSelection.value = undefined; closeUpload()
})
watch([() => props.draft, () => props.mode, () => props.draft.bodyHtml], () => {
  if (props.mode !== 'reply' || props.draft.bodyHtml === undefined) return
  if (props.draft.bodyHtml) props.draft.body = richHtmlToSendText(props.draft.bodyHtml)
  delete props.draft.bodyHtml
}, { immediate: true })
watch(() => props.draft.body, value => {
  if (chineseReference.value && value !== chineseReference.value.bodySnapshot) { chineseReference.value = undefined; props.draft.translation = undefined }
})
watch(() => props.draft, draft => {
  chineseReference.value = props.mode === 'reply' && draft.translation ? { bodySnapshot: draft.body, chinese: draft.translation, appended: false } : undefined
}, { immediate: true })

function setMode(value: 'reply' | 'note') { emit('update:mode', value) }
function submit() {
  if (sendDisabled.value) return
  if (props.mode === 'reply' && unresolvedTokens(props.draft.body)) { attachmentError.value = '正文仍含未填写的模板变量，请补齐关联资料或移除后再发送。'; return }
  const error = validateDraft(props.draft, props.mode)
  if (error) { attachmentError.value = error; return }
  if (props.mode === 'reply') delete props.draft.subject
  attachmentError.value = ''; emit('send')
}
function focusEditor() { if (props.mode === 'reply') plainEditor.value?.focus(); else richEditor.value?.focus() }
function rememberPlainSelection() {
  const element = plainEditor.value
  if (element) plainSelection.value = { start: element.selectionStart, end: element.selectionEnd, body: props.draft.body }
}
async function insertPlainText(text: string): Promise<boolean> {
  const body = props.draft.body, selection = plainSelection.value
  const start = selection?.body === body ? selection.start : body.length, end = selection?.body === body ? selection.end : body.length
  const proposed = body.slice(0, start) + text + body.slice(end)
  if (proposed.length > MAX_REPLY_BODY_LENGTH) { templateError.value = `使用后正文超过 ${MAX_REPLY_BODY_LENGTH} 个字符，请先精简内容。`; return false }
  plainBody.value = proposed
  await nextTick()
  plainEditor.value?.setSelectionRange(start + text.length, start + text.length)
  rememberPlainSelection()
  return true
}
async function expandEditor() { expanded.value = true; await nextTick(); focusEditor() }
async function closeExpanded() { expanded.value = false; await nextTick(); focusEditor() }
function onDialogValue(value: boolean) { if (!value) void closeExpanded() }

function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  dragStartY = event.clientY
  dragStartHeight = bodyElement.value?.getBoundingClientRect().height || bodyHeight.value || 180
  resizing.value = true
  document.addEventListener('pointermove', resizeMove)
  document.addEventListener('pointerup', stopResize)
  document.addEventListener('pointercancel', stopResize)
}
function resizeMove(event: PointerEvent) { bodyHeight.value = Math.max(180, Math.min(500, Math.round(dragStartHeight + dragStartY - event.clientY))) }
function stopResize() {
  resizing.value = false
  document.removeEventListener('pointermove', resizeMove)
  document.removeEventListener('pointerup', stopResize)
  document.removeEventListener('pointercancel', stopResize)
}
function resizeByKey(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = bodyHeight.value ?? Math.round(bodyElement.value?.getBoundingClientRect().height || 180)
  bodyHeight.value = event.key === 'Home' ? 180 : event.key === 'End' ? 500 : Math.max(180, Math.min(500, current + (event.key === 'ArrowUp' ? 20 : -20)))
}

function makeSuggestion() {
  const incoming = [...props.conversation.messages].reverse().find(message => message.kind === 'incoming')?.body.toLowerCase() || ''
  const subject = props.conversation.subject
  if (/return|refund/.test(incoming) || /退货|售后/.test(subject)) return { english: 'Thank you for your message. I will review the information you shared about your request and follow up with the next steps.', chinese: '感谢您的来信。我会核对您提供的诉求和相关信息，并跟进后续处理步骤。' }
  if (/shipping|tracking|parcel|delivery/.test(incoming) || /物流/.test(subject)) return { english: 'Thank you for contacting us. I will check the available shipping information and follow up with an update.', chinese: '感谢您联系我们。我会核对现有物流信息，并向您跟进最新情况。' }
  if (/fit|vehicle|model|install/.test(incoming) || /适配|安装/.test(subject)) return { english: 'Thank you for the details. Please share your vehicle make, model and part number so we can check compatibility and advise you further.', chinese: '感谢您提供信息。请补充车辆品牌、车型和零件编号，以便我们核对适配情况并进一步为您解答。' }
  return { english: 'Thank you for your message. I will review the details you provided and get back to you with further information.', chinese: '感谢您的来信。我会核对您提供的详细信息，并进一步回复您。' }
}
function generateAi() {
  if (props.mode !== 'reply' || !props.conversation.canReply || generating.value) return
  const token = ++generation, context = contextSignature.value
  const suggestion = makeSuggestion()
  aiOpen.value = true; generating.value = true; aiSuggestion.value = undefined
  aiTimer = setTimeout(() => {
    aiTimer = undefined
    if (token !== generation || context !== contextSignature.value || props.mode !== 'reply') return
    aiSuggestion.value = { ...suggestion, context }; generating.value = false
  }, 650)
}
function applyAi(append: boolean) {
  const suggestion = aiSuggestion.value
  if (!suggestion || suggestion.context !== contextSignature.value || props.mode !== 'reply') return
  const prefix = append && props.draft.body.trim() ? props.draft.body : ''
  const proposed = prefix ? `${prefix}\n\n${suggestion.english}` : suggestion.english
  if (proposed.length > MAX_REPLY_BODY_LENGTH) { attachmentError.value = `追加后正文超过 ${MAX_REPLY_BODY_LENGTH} 个字符，请先精简内容。`; return }
  plainBody.value = proposed
  props.draft.translation = prefix ? undefined : suggestion.chinese
  chineseReference.value = { bodySnapshot: props.draft.body, chinese: suggestion.chinese, appended: Boolean(prefix) }
  aiOpen.value = false
  void nextTick(focusEditor)
}
function openTemplates() {
  templateError.value = ''; pendingTemplate.value = undefined; selectedTemplate.value = undefined; expandedTemplateIds.value.clear(); templatesOpen.value = true
  selectFirstTemplate()
}
function selectFirstTemplate() {
  const first = visibleTemplates.value[0]
  if (!first) { selectedTemplate.value = undefined; return }
  // Filtering must not silently refresh an invalidated snapshot of the same selection.
  if (first.id === selectedTemplate.value?.id && templateSelectionIssue.value) return
  previewTemplate(first)
}
function canExpandTemplate(template: MessageTemplate) { return template.body.length > 140 || template.body.split('\n').length > 4 }
function toggleTemplateBody(id: string) { if (expandedTemplateIds.value.has(id)) expandedTemplateIds.value.delete(id); else expandedTemplateIds.value.add(id) }
function manageTemplates(event: MouseEvent) {
  templatesOpen.value = false
  if (router) { event.preventDefault(); void router.push(managementPath) }
}
function previewTemplate(template: MessageTemplate) {
  const latest = templateSession.templates.find(item => item.id === template.id)
  if (!latest?.enabled) { templateError.value = '该模板已停用或删除，请重新选择。'; return }
  selectedTemplate.value = JSON.parse(JSON.stringify(latest)); selectedContext.value = templateContextSignature.value; selectedDefinitions.value = JSON.stringify(templateSession.variables)
  pendingTemplate.value = undefined; templateError.value = ''
}
function insertPhrase(template: MessageTemplate) {
  if (template.kind !== 'phrase') return
  if (props.mode !== 'reply' || !props.conversation.canReply) { templateError.value = '当前会话不能插入常用语。'; return }
  if (selectedTemplate.value?.id === template.id && templateSelectionIssue.value) { templateError.value = templateSelectionIssue.value; return }
  const latest = templateSession.templates.find(item => item.id === template.id)
  if (!latest?.enabled || latest.kind !== 'phrase') { templateError.value = '该常用语已停用或删除，请重新选择。'; return }
  if (JSON.stringify(latest) !== JSON.stringify(template)) { templateError.value = '该常用语已更新，请先点击卡片重新核对。'; return }
  if (selectedTemplate.value?.id !== template.id) previewTemplate(template)
  void applyTemplate()
}
function draftSignature() { return JSON.stringify([props.draft.body, props.draft.bodyHtml, props.draft.attachments]) }
function mergeAttachments(existing: MessageAttachment[], incoming: MessageAttachment[]): MessageAttachment[] {
  const values = new Map<string, MessageAttachment>()
  for (const attachment of [...existing, ...incoming]) {
    const key = attachment.source === 'url' && attachment.url ? `url:${attachment.url}` : attachment.id ? `id:${attachment.id}` : JSON.stringify([attachment.name, attachment.size, attachment.type, attachment.source])
    if (!values.has(key)) values.set(key, { ...attachment })
  }
  return [...values.values()]
}
async function applyTemplate(replyNow = false, confirmed = false) {
  if (props.mode !== 'reply' || !props.conversation.canReply || (replyNow && (props.sending || props.uncertain))) return
  if (!templateReady.value || !selectedTemplate.value) { templateError.value = templateSelectionIssue.value || '请先补齐变量，并核对可用的模板预览。'; return }
  const context = templateContextSignature.value, kind = selectedTemplate.value.kind
  const rendered = renderedTemplate.value
  if (kind === 'phrase') {
    if (!await insertPlainText(rendered.body)) return
    delete props.draft.subject
    templatesOpen.value = false; props.draft.translation = undefined; chineseReference.value = undefined
    await nextTick(); focusEditor(); return
  }
  const proposal: ReplyDraft = { body: rendered.body, attachments: mergeAttachments(props.draft.attachments, rendered.attachments) }
  const error = validateDraft(proposal)
  if (error) { templateError.value = `无法采用模板：${error}；原草稿和附件未改变。`; return }
  if (!embeddedContact.value && !confirmed && props.draft.body.trim() && JSON.stringify([props.draft.body, props.draft.bodyHtml ?? '']) !== JSON.stringify([proposal.body, proposal.bodyHtml ?? ''])) {
    pendingTemplate.value = { content: JSON.stringify(proposal), replyNow, context, draftSignature: draftSignature() }; return
  }
  Object.assign(props.draft, proposal); delete props.draft.subject; delete props.draft.bodyHtml; props.draft.translation = undefined; chineseReference.value = undefined; templatesOpen.value = false
  await nextTick()
  if (context !== templateContextSignature.value || props.mode !== 'reply') return
  if (replyNow) submit()
  else focusEditor()
}
function confirmTemplate() {
  const pending = pendingTemplate.value
  const rendered = renderedTemplate.value
  const proposal = { body: rendered.body, attachments: mergeAttachments(props.draft.attachments, rendered.attachments) }
  if (!pending || pending.context !== templateContextSignature.value || pending.draftSignature !== draftSignature() || pending.content !== JSON.stringify(proposal)) { pendingTemplate.value = undefined; templateError.value = '草稿或预览已变化，请重新核对后使用。'; return }
  void applyTemplate(pending.replyNow, true)
}

function addLocalFiles(files: File[]) {
  attachmentError.value = ''; urlError.value = ''
  if (!files.length) return
  const candidates: MessageAttachment[] = []
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const expectedType = knownTypes[extension]
    if (!expectedType || (file.type && file.type !== expectedType)) { attachmentError.value = '附件仅支持 PNG、JPG 或 PDF，请检查文件格式。'; return }
    candidates.push({ id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name, size: file.size, type: expectedType, source: 'local' })
  }
  const error = validateDraft({ body: '附件校验', attachments: [...props.draft.attachments, ...candidates] })
  if (error) { attachmentError.value = error; return }
  props.draft.attachments.push(...candidates)
}
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addLocalFiles(Array.from(input.files || [])); input.value = ''
}
function onDrop(event: DragEvent) { event.preventDefault(); event.stopPropagation(); dragging.value = false; addLocalFiles(Array.from(event.dataTransfer?.files || [])) }
function onDragOver(event: DragEvent) { event.preventDefault(); if (event.dataTransfer?.types.includes('Files')) dragging.value = true }
function onDragLeave(event: DragEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) dragging.value = false }
function openUpload() { urlValue.value = ''; urlError.value = ''; attachmentError.value = ''; uploadDragging.value = false; uploadOpen.value = true }
function closeUpload() { uploadOpen.value = false; urlValue.value = ''; urlError.value = ''; uploadDragging.value = false }
function onUploadDrop(event: DragEvent) { event.preventDefault(); event.stopPropagation(); uploadDragging.value = false; urlError.value = ''; addLocalFiles(Array.from(event.dataTransfer?.files || [])) }
function onUploadDragOver(event: DragEvent) { event.preventDefault(); if (event.dataTransfer?.types.includes('Files')) uploadDragging.value = true }
function onUploadDragLeave(event: DragEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) uploadDragging.value = false }
function addUrlAttachment() {
  attachmentError.value = ''
  const value = urlValue.value.trim(), error = validateAttachmentUrl(value)
  if (error) { urlError.value = error; return }
  const parsed = new URL(value), name = decodeURIComponent(parsed.pathname.split('/').pop() || '链接附件'), extension = name.split('.').pop()?.toLowerCase() || ''
  if (props.draft.attachments.some(attachment => attachment.source === 'url' && attachment.url === parsed.href)) { urlError.value = '该链接已添加'; return }
  const attachment: MessageAttachment = { id: `url-${Date.now()}-${Math.random().toString(16).slice(2)}`, name, type: knownTypes[extension] || '', size: 0, source: 'url', url: parsed.href }
  const validation = validateDraft({ body: '附件校验', attachments: [...props.draft.attachments, attachment] })
  if (validation) { urlError.value = validation; return }
  props.draft.attachments.push(attachment); urlValue.value = ''; urlError.value = ''; attachmentError.value = ''
}
function removeAttachment(id: string) { const index = props.draft.attachments.findIndex(attachment => attachment.id === id); if (index >= 0) props.draft.attachments.splice(index, 1); attachmentError.value = ''; urlError.value = '' }
function attachmentSize(attachment: MessageAttachment) { return attachment.source === 'url' ? '链接附件 · 待获取' : `${Math.max(1, Math.round(attachment.size / 1024))} KB · 本地文件` }

onBeforeUnmount(() => { cancelAi(); stopResize() })
</script>

<template>
  <component :is="expanded ? ElDialog : 'section'" v-bind="expandedProps" class="reply-editor-host" @update:model-value="onDialogValue" @opened="focusEditor">
    <section v-prototype="embeddedContact ? contactEditorAnnotation : mailAnnotation('composer', '回复编辑器')" class="mail-composer mail-reply-editor" :class="{ 'editor-note': mode === 'note', 'editor-expanded': expanded, 'editor-dragging': dragging, 'editor-resizing': resizing }" :style="textareaStyle" @dragover="onDragOver" @dragenter="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
      <div v-if="!expanded" class="reply-resize-handle" role="separator" tabindex="0" aria-label="调整回复区高度，上下方向键调整" aria-orientation="horizontal" :aria-valuenow="bodyHeight ?? 180" :aria-valuemin="180" :aria-valuemax="500" @pointerdown="startResize" @keydown="resizeByKey"><span /></div>
      <div class="reply-toolbar">
        <div v-if="!embeddedContact" class="reply-mode-tabs"><button type="button" :class="{ active: mode === 'reply' }" @click="setMode('reply')"><ElIcon><ChatDotRound /></ElIcon>回复买家</button><button type="button" :class="{ active: mode === 'note' }" @click="setMode('note')"><ElIcon><Lock /></ElIcon>内部备注</button></div>
        <div class="reply-tools"><ElButton text :disabled="mode === 'note'" @click="openTemplates">常用回复</ElButton><ElButton text :disabled="mode === 'note' || !conversation.canReply" :loading="generating" @click="generateAi"><ElIcon v-if="!generating"><MagicStick /></ElIcon>AI 回复</ElButton><ElButton text :aria-label="expanded ? '收起写信窗口' : '展开写信'" @click="expanded ? closeExpanded() : expandEditor()"><ElIcon><FullScreen /></ElIcon>{{ expanded ? '收起' : '展开写信' }}</ElButton></div>
      </div>
      <div class="reply-recipient"><template v-if="mode === 'reply'">发送至 <strong>{{ conversation.buyerId }}</strong><span>· {{ conversation.shopName }}</span></template><template v-else><ElIcon><Lock /></ElIcon>内部记录，仅客服可见，不发送给买家</template></div>
      <p v-if="uncertain && mode === 'reply'" class="reply-send-block" role="alert">上一条发送结果待核查，暂不能再次发送。请先核对平台记录。</p>

      <div v-if="aiOpen && mode === 'reply'" v-prototype="mailAnnotation('ai-reply', 'AI 回复建议')" class="reply-ai-panel">
        <div class="ai-heading"><strong><ElIcon><MagicStick /></ElIcon>AI 回复建议</strong><button type="button" aria-label="关闭AI建议" @click="aiOpen = false"><ElIcon><Close /></ElIcon></button></div>
        <p class="ai-disclosure">AI 生成内容仅供参考，请核对后使用</p>
        <div v-if="generating" role="status" class="ai-loading">正在根据当前会话整理英文回复与中文参考…</div>
        <template v-else-if="aiSuggestion"><div class="ai-suggestion"><p lang="en">{{ aiSuggestion.english }}</p><p class="ai-chinese">{{ aiSuggestion.chinese }}</p></div><div class="ai-actions"><ElButton text @click="generateAi"><ElIcon><Refresh /></ElIcon>重新生成</ElButton><span /><ElButton @click="applyAi(true)">追加到正文</ElButton><ElButton type="primary" plain @click="applyAi(false)">{{ draft.body.trim() ? '替换正文' : '采用建议' }}</ElButton></div></template>
      </div>

      <div ref="bodyElement" class="reply-body">
        <textarea v-if="mode === 'reply'" ref="plainEditor" v-model="plainBody" :aria-label="embeddedContact ? '联系买家站内信正文' : '回复正文'" placeholder="输入要发送给买家的消息" @select="rememberPlainSelection" @keyup="rememberPlainSelection" @mouseup="rememberPlainSelection" @blur="rememberPlainSelection" @keydown.ctrl.enter.prevent="submit" />
        <RichEditor v-else ref="richEditor" v-model="richBody" label="内部备注正文" @keydown.ctrl.enter.prevent="submit" />
        <span class="reply-word-count">{{ draft.body.length }} / {{ bodyLengthLimit }}</span>
        <div v-if="dragging" class="reply-drop-overlay"><ElIcon><Upload /></ElIcon><strong>松开添加附件</strong><span>PNG、JPG、PDF · 每份不超过 5 MB</span></div>
      </div>
      <div v-if="chineseReference && chineseReference.bodySnapshot === draft.body && mode === 'reply'" class="reply-chinese-reference"><strong>翻译参考</strong><p>{{ chineseReference.chinese }}</p><small>{{ chineseReference.appended ? '仅对应追加内容；' : '' }}编辑英文正文后，此参考自动失效</small></div>
      <div v-prototype="mailAnnotation('attachments', '回复附件')" class="reply-attachment-tools"><button type="button" @click="openUpload"><ElIcon><Paperclip /></ElIcon>上传附件</button><span>可拖入文件 · {{ draft.attachments.length }}/{{ MAX_REPLY_ATTACHMENTS }}</span></div>
      <div v-if="draft.attachments.length" class="reply-attachments"><div v-for="attachment in draft.attachments" :key="attachment.id" class="reply-attachment"><ElIcon><Document /></ElIcon><div><strong :title="attachment.name">{{ attachment.name }}</strong><small>{{ attachmentSize(attachment) }}</small></div><button type="button" :aria-label="`移除附件 ${attachment.name}`" @click="removeAttachment(attachment.id)"><ElIcon><Close /></ElIcon></button></div></div>
      <p v-if="attachmentError && !uploadOpen" class="reply-error" role="alert">{{ attachmentError }}</p>
      <footer v-prototype="embeddedContact ? contactSendAnnotation : mailAnnotation('drafts', '回复草稿与发送')" class="reply-footer"><div v-if="!embeddedContact" class="reply-footer-options"><ElCheckbox v-if="mode === 'reply'" :model-value="markProcessedOnSend" :disabled="sending" aria-label="回复买家并标注为已处理" @update:model-value="value => emit('update:markProcessedOnSend', Boolean(value))">回复买家并标注为已处理</ElCheckbox><span>{{ draft.savedAt ? `草稿已保留 ${formatMailTime(draft.savedAt)}` : '切换会话保留草稿' }}</span></div><div class="reply-footer-actions"><ElButton v-if="!embeddedContact" @click="emit('save')">保存草稿</ElButton><span v-if="!embeddedContact" class="reply-submit-target" v-prototype="mode === 'reply' ? mailAnnotation('send', '发送站内信与结果核查') : mailAnnotation('notes', '添加内部备注')"><ElButton type="primary" :disabled="sendDisabled" @click="submit">{{ mode === 'reply' ? (sending ? '发送中…' : '发送') : '添加备注' }}</ElButton></span><ElButton v-else type="primary" :disabled="sendDisabled" @click="submit">{{ mode === 'reply' ? (sending ? '发送中…' : '发送站内信') : '添加备注' }}</ElButton></div></footer>
    </section>
  </component>

  <ElDialog v-model="templatesOpen" title="常用回复" width="min(1100px, 94vw)" align-center append-to-body class="reply-template-dialog" destroy-on-close>
    <div class="reply-template-heading"><div class="reply-template-kinds"><button type="button" :aria-pressed="templateKind === 'message'" @click="templateKind = 'message'">站内信模板</button><button type="button" :aria-pressed="templateKind === 'phrase'" @click="templateKind = 'phrase'">常用语</button></div><a :href="router?.resolve(managementPath).href ?? `#${managementPath}`" @click="manageTemplates">管理模板</a></div>
    <div class="reply-template-workspace">
      <aside class="reply-template-browser" aria-label="回复模板列表">
        <ElInput v-model="templateSearch" clearable placeholder="搜索名称、内部参考标题或正文" aria-label="搜索回复模板" />
        <div class="reply-template-list-heading"><span>{{ templateKind === 'message' ? '站内信模板' : '常用语' }} · {{ visibleTemplates.length }}</span><span>点击卡片查看完整内容</span></div>
        <div class="reply-template-list">
          <article v-for="template in visibleTemplates" :key="template.id" :class="{ 'is-selected': selectedTemplate?.id === template.id }">
            <button type="button" class="reply-template-card" :data-template-id="template.id" :aria-label="`选择${template.title}`" :aria-pressed="selectedTemplate?.id === template.id" @click="previewTemplate(template)">
              <span class="reply-template-card-heading"><strong>{{ template.title }}</strong><span v-if="selectedTemplate?.id === template.id">已选</span></span>
              <span class="reply-template-card-body" :class="{ 'is-expanded': !canExpandTemplate(template) || expandedTemplateIds.has(template.id) }">{{ template.body }}</span>
              <span v-if="template.attachments?.length" class="reply-template-card-meta"><ElIcon><Paperclip /></ElIcon>{{ template.attachments.length }} 个附件</span>
            </button>
            <div v-if="canExpandTemplate(template) || template.kind === 'phrase'" class="reply-template-card-actions">
              <button v-if="canExpandTemplate(template)" type="button" class="reply-template-expand" :aria-expanded="expandedTemplateIds.has(template.id)" :aria-label="`${expandedTemplateIds.has(template.id) ? '收起' : '展开'}${template.title}全文`" @click="toggleTemplateBody(template.id)">{{ expandedTemplateIds.has(template.id) ? '收起全文' : '展开全文' }}</button>
              <ElButton v-if="template.kind === 'phrase'" class="reply-phrase-insert" type="primary" text :aria-label="`插入${template.title}`" @click="insertPhrase(template)">插入</ElButton>
            </div>
          </article>
          <ElEmpty v-if="!visibleTemplates.length" description="没有匹配的已启用内容" :image-size="45" />
        </div>
      </aside>
      <section v-if="selectedTemplate" class="reply-template-preview" aria-label="当前回复内容">
        <div class="reply-template-preview-heading"><div><span>{{ selectedTemplate.kind === 'message' ? '站内信模板' : '常用语' }}</span><strong>{{ selectedTemplate.title }}</strong></div><ElButton v-if="templateSelectionIssue" text @click="previewTemplate(selectedTemplate)">重新预览</ElButton></div>
        <div class="reply-template-preview-content">
          <p v-if="templateSelectionIssue" role="alert" class="reply-error">{{ templateSelectionIssue }}</p>
          <p v-if="renderedTemplate.unknown.length" class="reply-error" role="alert">存在未定义或无效变量：{{ renderedTemplate.unknown.join('、') }}</p>
          <div class="reply-template-message"><div class="reply-template-rendered" aria-label="模板使用预览">{{ renderedTemplate.body }}</div></div>
          <div v-if="renderedTemplate.attachments.length" class="reply-template-attachments"><strong>模板附件 · {{ renderedTemplate.attachments.length }}</strong><div v-for="attachment in renderedTemplate.attachments" :key="attachment.id"><ElIcon><Document /></ElIcon><span>{{ attachment.name }}</span><small>{{ attachmentSize(attachment) }}</small></div></div>
          <section v-if="selectedVariables.length" class="reply-template-variable-section"><h4>本次变量取值</h4><div class="reply-template-variables"><label v-for="variable in selectedVariables" :key="variable.id"><span>{{ variable.label }}<em v-if="renderedTemplate.missing.some(item => item.id === variable.id)">待关联资料</em></span><small>{{ reliableTemplateContext[variable.source] || '当前无可靠取值，请补齐关联资料或选择其他模板。' }}</small></label></div></section>
          <p v-if="renderedTemplate.missing.length" class="reply-template-hint">变量尚未补齐，当前不能填入或发送。</p><p v-else-if="unresolvedTokens(renderedTemplate.body)" class="reply-error" role="alert">取值仍包含模板占位符，请修改后使用。</p><p v-else-if="templateBodyError" class="reply-error" role="alert">{{ templateBodyError }}</p>
        </div>
        <footer class="reply-template-actions">
          <p v-if="templateError" role="alert" class="reply-error">{{ templateError }}</p>
          <div v-if="pendingTemplate" class="reply-replace-confirm" role="alert"><strong>替换当前回复草稿？</strong><p>使用模板将替换正文，模板附件与已有附件合并；超出限制时不采用。</p><div><ElButton @click="pendingTemplate = undefined">保留原文</ElButton><ElButton type="primary" :disabled="!templateReady || (pendingTemplate.replyNow && (sending || uncertain))" @click="confirmTemplate">{{ pendingTemplate.replyNow ? '替换并回复' : '替换并填入' }}</ElButton></div></div>
          <div class="reply-template-use"><span>{{ selectedTemplate.kind === 'message' ? '填入后可继续编辑' : '插入当前光标或选区' }}</span><template v-if="selectedTemplate.kind === 'message'"><ElButton :disabled="!templateReady || !conversation.canReply" @click="applyTemplate()">填入回复</ElButton><ElButton type="primary" plain :disabled="!templateReady || sending || uncertain || !conversation.canReply" @click="applyTemplate(true)">使用并回复</ElButton></template><ElButton v-else type="primary" plain :disabled="!templateReady || !conversation.canReply" @click="applyTemplate()">插入常用语</ElButton></div>
        </footer>
      </section>
      <div v-else class="reply-template-empty"><ElEmpty description="调整搜索条件以查看回复内容" :image-size="70" /><p v-if="templateError" role="alert" class="reply-error">{{ templateError }}</p></div>
    </div>
  </ElDialog>
  <ElDialog v-model="uploadOpen" title="上传附件" width="min(600px, 92vw)" append-to-body :close-on-click-modal="false" destroy-on-close @closed="closeUpload">
    <div class="reply-upload-panel" @dragover="onUploadDragOver" @dragenter="onUploadDragOver" @dragleave="onUploadDragLeave" @drop="onUploadDrop">
      <button type="button" class="reply-upload-dropzone" :class="{ 'is-dragging': uploadDragging }" aria-label="选择或拖入本地附件" @click="fileInput?.click()"><ElIcon><Upload /></ElIcon><strong>{{ uploadDragging ? '松开添加文件' : '拖拽文件到此处，或点击选择' }}</strong><span>支持 PNG、JPG、PDF，每份不超过 5 MB</span></button>
      <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.pdf" multiple aria-label="选择本地附件" class="reply-file-input" @change="onFileChange" />
      <div class="reply-upload-link"><label class="url-field-label" for="reply-attachment-url"><ElIcon><Link /></ElIcon>链接上传</label><div class="reply-upload-url-input"><ElInput id="reply-attachment-url" v-model="urlValue" aria-label="附件文件链接" placeholder="https://example.com/photo.jpg" @keyup.enter="addUrlAttachment" /><ElButton @click="addUrlAttachment">添加链接</ElButton></div><p class="url-hint">支持公网 HTTP/HTTPS 文件链接。</p></div>
      <p v-if="urlError" role="alert" class="reply-error">{{ urlError }}</p><p v-if="attachmentError" role="alert" class="reply-error">{{ attachmentError }}</p>
      <section class="reply-upload-current"><div class="reply-upload-count"><strong>已添加附件</strong><span>{{ draft.attachments.length }} / {{ MAX_REPLY_ATTACHMENTS }}</span></div><div v-if="draft.attachments.length" class="reply-attachments"><div v-for="attachment in draft.attachments" :key="attachment.id" class="reply-attachment"><ElIcon><Document /></ElIcon><div><strong :title="attachment.name">{{ attachment.name }}</strong><small>{{ attachmentSize(attachment) }}</small></div><button type="button" :aria-label="`移除附件 ${attachment.name}`" @click="removeAttachment(attachment.id)"><ElIcon><Close /></ElIcon></button></div></div><p v-else class="reply-upload-empty">尚未添加附件</p></section>
    </div>
    <template #footer><ElButton type="primary" @click="closeUpload">完成</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.reply-editor-host{min-width:0;flex:none}.reply-editor-host:not(.reply-expanded-dialog){max-height:60%;min-height:min(230px,50%);overflow-y:auto;overscroll-behavior:contain}.mail-reply-editor.mail-composer{position:relative;min-width:0;flex:none;padding:0 18px 12px;border-top:1px solid #e7edf4;background:#fff;font-size:12px;color:#526176;container-type:inline-size}.mail-reply-editor.editor-note{background:#fffdf5}.reply-resize-handle{height:10px;margin:0 -18px;display:flex;align-items:center;justify-content:center;cursor:ns-resize;touch-action:none;outline:none}.reply-resize-handle span{height:3px;width:38px;background:#d7e0eb;border-radius:3px}.reply-resize-handle:hover span,.reply-resize-handle:focus-visible span{background:#7bb7ef}.editor-resizing{user-select:none}
.reply-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;min-height:35px;margin-bottom:5px}.reply-mode-tabs{display:flex;gap:17px;align-items:center;flex-shrink:0}.reply-mode-tabs button{display:flex;gap:6px;align-items:center;padding:8px 0 10px;position:relative;border:0;background:none;cursor:pointer;color:#7d8898;font-size:13px;white-space:nowrap}.reply-mode-tabs button.active{color:#2e8de9;font-weight:600}.reply-mode-tabs button.active:after{content:'';height:2px;position:absolute;bottom:0;left:0;right:0;background:#409eff}.editor-note .reply-mode-tabs button.active{color:#9c792f}.editor-note .reply-mode-tabs button.active:after{background:#c69b4a}.reply-tools{display:flex;align-items:center;gap:3px;flex-wrap:wrap}.reply-tools :deep(.el-button){height:28px;padding:4px 6px;margin:0;font-size:12px}.reply-tools .el-icon{margin-right:4px}.reply-recipient{display:flex;align-items:center;gap:5px;flex-wrap:wrap;line-height:1.65;font-size:11px;color:#8b96a5;margin:4px 0 9px}.reply-recipient strong{font-weight:500;color:#5d6e84}.editor-note .reply-recipient{color:#a1834d}
.reply-body{height:var(--reply-body-height,clamp(160px,23vh,220px));min-height:160px;max-height:500px;position:relative;flex:none}.reply-body textarea{display:block;box-sizing:border-box;width:100%;height:100%;min-height:160px;resize:none;border:1px solid #dce4ee;border-radius:5px;padding:12px 12px 24px;outline:none;background:#fff;font-family:inherit;font-size:13px;line-height:1.75;color:#2f3d50;transition:border-color .15s;overflow:auto}.reply-body textarea:focus{border-color:#8bbdea;box-shadow:0 0 0 2px #eaf4ff}.reply-body textarea::placeholder{color:#9ba5b4}.reply-word-count{position:absolute;right:10px;bottom:6px;font-size:10px;color:#9ca8b7;pointer-events:none;background:#fff;padding-left:5px}.reply-drop-overlay{position:absolute;inset:0;background:#f1f8fff5;border:2px dashed #86baf0;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;pointer-events:none;color:#448ccf}.reply-drop-overlay>.el-icon{font-size:25px}.reply-drop-overlay strong{font-weight:500;font-size:14px}.reply-drop-overlay span{font-size:11px}
.reply-attachment-tools{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:9px 0 2px}.reply-attachment-tools button{display:flex;align-items:center;gap:5px;background:none;border:0;padding:0;font-size:12px;color:#6d87a5;cursor:pointer}.reply-attachment-tools button:hover{color:#268be8}.reply-attachment-tools>span{color:#a2acba;font-size:10px;margin-left:auto}.reply-file-input{display:none}.reply-attachments{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.reply-attachment{display:flex;gap:6px;align-items:center;padding:6px 7px;border:1px solid #e2e9f2;background:#f6f9fc;border-radius:4px;min-width:0;max-width:100%}.reply-attachment>.el-icon{color:#8a9eb4;font-size:16px}.reply-attachment>div{min-width:0;display:flex;flex-direction:column;gap:3px}.reply-attachment strong{font-size:11px;font-weight:400;color:#61758e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}.reply-attachment small{color:#99a5b5;font-size:10px}.reply-attachment button{padding:2px;background:none;border:0;color:#9ca9b8;cursor:pointer}.reply-error{font-size:12px;line-height:1.65;color:#c0694b;margin:8px 0 0}.reply-send-block{margin:0 0 9px;padding:7px 9px;border:1px solid #f3e6c9;background:#fff8e8;border-radius:4px;color:#a18349;font-size:11px;line-height:1.7}
.reply-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:11px}.reply-footer-options{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1 1 280px;min-width:0}.reply-footer-options>span{flex:none;margin-left:auto;text-align:right;white-space:nowrap;font-size:11px;color:#9da8b7;line-height:1.6}.reply-footer-options :deep(.el-checkbox){flex:none;height:auto;margin:0;align-items:center}.reply-footer-options :deep(.el-checkbox__label){font-size:12px;line-height:18px;white-space:nowrap}.reply-footer-actions{display:flex;align-items:center;gap:8px;flex:none;margin-left:auto}.reply-footer :deep(.el-button){margin:0;height:31px;min-width:72px;font-size:12px;padding:0 11px}.reply-expanded-dialog .mail-reply-editor,.mail-reply-editor.editor-expanded{border:0;padding:0;max-height:calc(90vh - 100px);overflow:auto;container-type:normal}.editor-expanded .reply-body{height:clamp(240px,35vh,440px);max-height:none}.editor-expanded .reply-toolbar{margin-top:-4px}
.reply-ai-panel{padding:11px 12px;border:1px solid #d9e8f7;background:#f8fbff;border-radius:5px;margin-bottom:10px}.ai-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.ai-heading strong{display:flex;gap:5px;align-items:center;font-size:12px;font-weight:600;color:var(--yy-text-heading)}.ai-heading button{display:flex;border:0;background:none;color:#90a1b7;cursor:pointer}.ai-disclosure{font-size:11px;color:#8d9bae;line-height:1.7;margin:6px 0 0}.ai-loading{padding:15px 0 8px;font-size:12px;color:#6c8fb8;line-height:1.8}.ai-suggestion{max-height:145px;overflow:auto;margin-top:8px}.ai-suggestion p{margin:0;font-size:12px;line-height:1.8;color:#4b627d;white-space:pre-wrap}.ai-suggestion .ai-chinese{margin-top:7px;padding-top:7px;border-top:1px solid #e4edf7;color:#8796a9;font-size:11px}.ai-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px}.ai-actions>span{flex:1}.ai-actions :deep(.el-button){font-size:11px;margin:0;height:27px;padding:0 8px}.ai-actions .el-icon{margin-right:4px}.reply-chinese-reference{border-left:2px solid #d7e4f4;padding:6px 10px;margin-top:9px;background:#f9fbfe}.reply-chinese-reference strong{font-size:11px;font-weight:500;color:#7f94ad}.reply-chinese-reference p{font-size:11px;line-height:1.75;color:#8494a9;margin:5px 0}.reply-chinese-reference small{color:#aab4c3;font-size:10px}
.url-field-label{display:block;font-size:12px;color:#586a80;margin-bottom:8px}.url-hint{font-size:12px;line-height:1.9;color:#8493a7;margin:10px 0 0}
.reply-replace-confirm{margin-top:12px;padding:12px;border:1px solid #ead9b5;border-radius:5px;background:#fffbf1}.reply-replace-confirm>strong{font-size:13px;color:#746444;font-weight:500}.reply-replace-confirm>p{font-size:12px;color:#9c8a66;line-height:1.7;margin:6px 0 10px}.reply-replace-confirm>div{display:flex;justify-content:flex-end;gap:8px}.reply-replace-confirm :deep(.el-button){height:29px;font-size:12px;margin:0}
.reply-template-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.reply-template-heading>a{color:#409eff;font-size:12px;text-decoration:none}.reply-template-kinds{display:flex;gap:22px}.reply-template-kinds button{border:0;border-bottom:2px solid transparent;background:none;padding:5px 0 8px;color:#7c8a9c;font-size:13px;cursor:pointer}.reply-template-kinds button[aria-pressed=true]{color:#409eff;border-bottom-color:#409eff}
.reply-template-workspace{display:grid;grid-template-columns:minmax(290px,35%) minmax(0,1fr);height:min(590px,calc(100vh - 180px));min-height:300px;border:1px solid #e3eaf3;border-radius:6px;overflow:hidden}.reply-template-browser{display:flex;flex-direction:column;min-width:0;min-height:0;padding:16px 12px 0;background:#f7f9fc;border-right:1px solid #e3eaf3}.reply-template-list-heading{display:flex;justify-content:space-between;gap:8px;margin:12px 2px 10px;font-size:11px;line-height:1.5;color:#8594a8}.reply-template-list-heading>span:first-child{color:#62748c}.reply-template-list{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:1px 3px 12px 1px}.reply-template-list article{border:1px solid #e2e9f2;border-radius:5px;margin-bottom:9px;background:#fff;overflow:hidden}.reply-template-list article.is-selected{border-color:#7eb9f0;background:#f0f7ff;box-shadow:0 0 0 1px #7eb9f022}.reply-template-card{display:block;width:100%;padding:13px 12px;text-align:left;background:none;border:0;font-family:inherit;cursor:pointer}.reply-template-card:hover{background:#eaf3ff66}.reply-template-card:focus-visible{outline:2px solid #409eff;outline-offset:-2px}.reply-template-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;line-height:1.5}.reply-template-card-heading strong{font-weight:600;font-size:13px;color:var(--yy-text-heading);overflow-wrap:anywhere}.reply-template-card-heading>span{font-size:10px;color:#409eff;flex:none;padding-top:1px}.reply-template-card-subject{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:8px;font-size:11px;line-height:1.6;color:#526d8b;overflow-wrap:anywhere}.reply-template-card-body{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;color:#6d7e94;line-height:1.8;font-size:12px;margin-top:7px}.reply-template-card-body.is-expanded{display:block;-webkit-line-clamp:unset}.reply-template-card-meta{display:flex;align-items:center;gap:4px;margin-top:9px;font-size:10px;color:#8296ae}.reply-template-expand{display:block;margin:-3px 12px 11px;padding:0;border:0;background:none;font-size:11px;line-height:1.6;color:#438bcf;cursor:pointer}.reply-template-expand:hover{text-decoration:underline}
.reply-template-preview{display:flex;flex-direction:column;min-width:0;min-height:0;background:#fff}.reply-template-preview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px 14px;border-bottom:1px solid #e9eef5;flex:none}.reply-template-preview-heading>div{display:flex;flex-direction:column;gap:5px;min-width:0}.reply-template-preview-heading>div>span{font-size:10px;color:#8c9aae}.reply-template-preview-heading strong{font-size:15px;line-height:1.5;font-weight:600;color:var(--yy-text-heading);overflow-wrap:anywhere}.reply-template-preview-heading :deep(.el-button){flex:none;font-size:12px;margin:0}.reply-template-preview-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:18px 20px}.reply-template-preview-content>.reply-error:first-child{margin:0 0 12px;padding:8px 10px;background:#fff7ec;border-radius:4px}.reply-template-message{border:1px solid #e5ebf3;border-radius:5px;overflow:hidden}.reply-template-subject{display:flex;flex-direction:column;gap:7px;margin:0;padding:13px 16px;border-bottom:1px solid #e5ebf3;background:#f8fafd;color:var(--yy-text-heading);font-size:14px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.reply-template-subject>span{font-size:10px;font-weight:400;color:#8a9bb0}.reply-template-rendered{padding:14px 16px;min-height:110px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:13px;color:#435a76;line-height:1.9}.reply-template-rendered :deep(p){margin:0 0 8px}.reply-template-rendered :deep(p:last-child){margin-bottom:0}.reply-template-rendered :deep(h1),.reply-template-rendered :deep(h2),.reply-template-rendered :deep(h3){line-height:1.5;margin:0 0 10px}.reply-template-rendered :deep(h1){font-size:22px}.reply-template-rendered :deep(h2){font-size:18px}.reply-template-rendered :deep(h3){font-size:16px}.reply-template-attachments{margin-top:16px;font-size:12px;color:#71849d}.reply-template-attachments>strong{font-size:11px;font-weight:500;color:#637991}.reply-template-attachments>div{display:flex;align-items:center;gap:7px;margin-top:8px;padding:8px 10px;background:#f7f9fc;border:1px solid #e6edf5;border-radius:4px}.reply-template-attachments>div>span{flex:1;min-width:0;overflow-wrap:anywhere}.reply-template-attachments small{font-size:10px;color:#95a2b4;flex:none}.reply-template-variable-section{margin-top:18px;padding-top:14px;border-top:1px solid #edf1f6}.reply-template-variable-section h4{font-size:11px;font-weight:500;color:#637991;margin:0 0 12px}.reply-template-variables{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px}.reply-template-variables label>span{display:flex;align-items:center;gap:6px;font-size:11px;color:#71849d;margin-bottom:5px}.reply-template-variables label em{font-style:normal;color:#bc8951;font-size:10px}.reply-template-variables label small{font-size:12px;color:#526e8d;line-height:1.7;overflow-wrap:anywhere}.reply-template-hint{font-size:11px;color:#95a2b4;line-height:1.8;margin:10px 0 0}.reply-template-actions{flex:none;padding:13px 20px;border-top:1px solid #e6edf5;background:#fbfcfe}.reply-template-actions>.reply-error{margin:0 0 10px}.reply-template-actions .reply-replace-confirm{margin:0 0 12px}.reply-template-use{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.reply-template-use>span{margin-right:auto;font-size:11px;color:#8c9aae}.reply-template-use :deep(.el-button){margin:0;height:32px;font-size:12px}.reply-template-empty{display:flex;align-items:center;justify-content:center;background:#fff;min-width:0}
@media(max-width:900px){.reply-template-workspace{grid-template-columns:minmax(240px,40%) minmax(0,1fr)}.reply-template-preview-heading,.reply-template-preview-content{padding:12px}.reply-template-actions{padding:12px}.reply-template-list-heading>span:last-child{display:none}.reply-template-use>span{width:100%;margin-bottom:2px}.reply-template-variables{grid-template-columns:minmax(0,1fr)}.reply-template-attachments>div{flex-wrap:wrap}.reply-template-attachments small{width:100%;padding-left:19px}}
.reply-upload-panel{max-height:calc(80vh - 145px);overflow:auto;padding:1px}.reply-upload-dropzone{width:100%;min-height:128px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px;padding:20px 12px;border:1px dashed #b9cbdf;background:#f8fbff;border-radius:6px;color:#8493a7;cursor:pointer}.reply-upload-dropzone:hover,.reply-upload-dropzone.is-dragging,.reply-upload-dropzone:focus-visible{border-color:#409eff;background:#eef7ff;outline:none}.reply-upload-dropzone>.el-icon{font-size:27px;color:#7ba2cb}.reply-upload-dropzone>strong{font-size:13px;font-weight:500;color:#4776a8}.reply-upload-dropzone>span{font-size:11px}.reply-upload-link{border-top:1px solid #e7edf5;padding-top:16px;margin-top:17px}.reply-upload-link .url-field-label{display:flex;align-items:center;gap:5px}.reply-upload-url-input{display:flex;gap:8px}.reply-upload-url-input :deep(.el-input){min-width:0}.reply-upload-url-input :deep(.el-button){margin:0;flex:none}.reply-upload-current{margin-top:18px;padding-top:14px;border-top:1px solid #e7edf5}.reply-upload-count{display:flex;justify-content:space-between;align-items:center;color:#8e9bae;font-size:12px}.reply-upload-count>strong{font-weight:500;color:var(--yy-text-heading)}.reply-upload-current .reply-attachments{flex-direction:column;margin-top:10px}.reply-upload-current .reply-attachment>div{flex:1}.reply-upload-current .reply-attachment strong{max-width:none}.reply-upload-empty{margin:13px 0 4px;color:#a5afbd;font-size:12px}
@container (max-width:600px){.reply-toolbar{gap:4px}.reply-tools{margin-left:auto}.reply-mode-tabs{gap:12px}.reply-tools :deep(.el-button){padding:4px;font-size:11px}.reply-footer :deep(.el-button){min-width:64px;padding:0 8px}.ai-actions>span{display:none}.ai-actions{justify-content:flex-end}.ai-actions>:first-child{margin-right:auto}}
@media (max-height:800px){.mail-reply-editor:not(.editor-expanded){padding-bottom:8px}.mail-reply-editor:not(.editor-expanded) .reply-body{height:var(--reply-body-height,140px);min-height:120px}.mail-reply-editor:not(.editor-expanded) .reply-body textarea{min-height:120px}.mail-reply-editor:not(.editor-expanded) .reply-resize-handle{height:8px}.mail-reply-editor:not(.editor-expanded) .reply-toolbar{min-height:28px;margin-bottom:2px}.mail-reply-editor:not(.editor-expanded) .reply-mode-tabs button{padding-top:5px;padding-bottom:5px}.mail-reply-editor:not(.editor-expanded) .reply-tools :deep(.el-button){height:25px}.mail-reply-editor:not(.editor-expanded) .reply-recipient{margin:2px 0 6px;line-height:1.4}.mail-reply-editor:not(.editor-expanded) .reply-attachment-tools{margin-top:6px}.mail-reply-editor:not(.editor-expanded) .reply-footer{margin-top:7px}.mail-reply-editor:not(.editor-expanded) .reply-footer :deep(.el-button){height:28px}}
.reply-subject{margin-bottom:8px}.reply-body :deep(.message-rich-editor){height:100%;box-sizing:border-box;display:flex;flex-direction:column}.reply-body :deep([contenteditable="true"]){flex:1;min-height:80px;overflow:auto;padding-bottom:24px}
.reply-editor-host:not(.reply-expanded-dialog) .reply-footer{position:sticky;bottom:0;z-index:1;padding:7px 0 5px;background:#fff;box-shadow:0 -5px 0 #fff}.reply-editor-host:not(.reply-expanded-dialog) .editor-note .reply-footer{background:#fffdf5;box-shadow:0 -5px 0 #fffdf5}
.reply-template-card-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px 10px;margin-top:-3px}.reply-template-card-actions .reply-template-expand{margin:0}.reply-template-card-actions .reply-phrase-insert{margin:0 0 0 auto;height:26px;padding:0 10px;font-size:12px}.reply-template-empty{flex-direction:column}.reply-template-empty>.reply-error{margin:0 20px}
</style>
