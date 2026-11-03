<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { plainTextToHtml, richTextFontSizes, sanitizeRichHtml } from './富文本'

const props = withDefaults(defineProps<{ modelValue: string; label?: string }>(), { label: '模板正文' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = ref<HTMLElement>(), block = ref('p'), fontSize = ref(14)
const blockFontSizes: Record<string, number> = { h1: 24, h2: 20, h3: 18 }
let savedRange: Range | undefined
let lastPublished = ''

function syncSelectionFormat(range: Range) {
  const root = editor.value
  let start = range.startContainer
  if (start instanceof Element) start = start.childNodes[range.startOffset] ?? start.childNodes[range.startOffset - 1] ?? start
  while (start instanceof Element && start.firstChild) start = start.firstChild
  let element = start instanceof Element ? start : start.parentElement
  let foundBlock = '', foundSize: number | undefined
  while (element && element !== root) {
    const tag = element.tagName.toLowerCase()
    if (!foundBlock && ['p', 'h1', 'h2', 'h3'].includes(tag)) foundBlock = tag
    const size = Number.parseFloat((element as HTMLElement).style.fontSize)
    if (foundSize === undefined && tag === 'span' && richTextFontSizes.includes(size)) foundSize = size
    element = element.parentElement
  }
  block.value = foundBlock || 'p'
  fontSize.value = foundSize ?? (blockFontSizes[foundBlock] ?? 14)
}
function rememberSelection() {
  const selection = window.getSelection()
  if (!editor.value || !selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (editor.value.contains(range.commonAncestorContainer)) {
    savedRange = range.cloneRange()
    if (document.activeElement === editor.value || editor.value.contains(document.activeElement)) syncSelectionFormat(range)
  }
}
function restoreSelection() {
  const element = editor.value, selection = window.getSelection()
  if (!element || !selection) return
  element.focus()
  const range = savedRange && element.contains(savedRange.commonAncestorContainer) ? savedRange.cloneRange() : document.createRange()
  if (!savedRange || !element.contains(range.commonAncestorContainer)) { range.selectNodeContents(element); range.collapse(false) }
  selection.removeAllRanges(); selection.addRange(range)
  return range
}
function publish() {
  const element = editor.value; if (!element) return
  const clean = sanitizeRichHtml(element.innerHTML)
  if (element.innerHTML !== clean) { element.innerHTML = clean; savedRange = undefined; restoreSelection() }
  lastPublished = clean; emit('update:modelValue', clean); rememberSelection()
}
function syncFromModel() {
  const element = editor.value; if (!element) return
  const clean = sanitizeRichHtml(props.modelValue)
  if (element.innerHTML !== clean) { element.innerHTML = clean; savedRange = undefined }
  lastPublished = clean
  const first = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() ?? element
  const range = document.createRange(); range.setStart(first, 0); range.collapse(true); syncSelectionFormat(range)
}
watch(() => props.modelValue, () => { if (props.modelValue !== lastPublished || editor.value?.innerHTML !== props.modelValue) syncFromModel() }, { flush: 'post' })
onMounted(() => { syncFromModel(); document.addEventListener('selectionchange', rememberSelection) })
onBeforeUnmount(() => document.removeEventListener('selectionchange', rememberSelection))

function insertHtml(value: string) {
  const range = restoreSelection(); if (!range) return
  const clean = sanitizeRichHtml(value), fragment = range.createContextualFragment(clean), last = fragment.lastChild
  range.deleteContents(); range.insertNode(fragment)
  if (last) { range.setStartAfter(last); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
  rememberSelection(); publish()
}
function insertText(value: string) {
  const range = restoreSelection(); if (!range) return
  range.deleteContents()
  const parts = value.split(/\r?\n/), fragment = document.createDocumentFragment()
  parts.forEach((part, index) => { if (index) fragment.appendChild(document.createElement('br')); fragment.appendChild(document.createTextNode(part)) })
  const last = fragment.lastChild
  range.insertNode(fragment)
  if (last) { range.setStartAfter(last); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
  rememberSelection(); publish()
}
function focus() { restoreSelection() }
function command(name: string, value?: string, requestedSize?: number) {
  restoreSelection()
  if (typeof document.execCommand !== 'function') return
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(name, false, value)
  if (name === 'fontSize') editor.value?.querySelectorAll('font[size]').forEach(node => {
    const span = document.createElement('span'); span.style.fontSize = `${requestedSize ?? fontSize.value}px`
    while (node.firstChild) span.appendChild(node.firstChild)
    node.replaceWith(span)
  })
  rememberSelection(); publish()
}
function changeBlock() { command('formatBlock', block.value) }
function changeSize() { const requested = Number(fontSize.value); command('fontSize', String(richTextFontSizes.indexOf(requested) + 1), requested) }
function clearFormat() { command('removeFormat'); block.value = 'p'; command('formatBlock', 'p') }
function paste(event: ClipboardEvent) {
  event.preventDefault()
  const html = event.clipboardData?.getData('text/html'), text = event.clipboardData?.getData('text/plain') ?? ''
  insertHtml(html ? sanitizeRichHtml(html) : plainTextToHtml(text))
}
function drop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files.length) return
  const html = event.dataTransfer?.getData('text/html'), text = event.dataTransfer?.getData('text/plain') ?? ''
  if (html || text) insertHtml(html ? sanitizeRichHtml(html) : plainTextToHtml(text))
}
async function input() { rememberSelection(); await nextTick(); publish() }
defineExpose({ focus, insertText })
</script>

<template>
  <div class="message-rich-editor">
    <div class="message-rich-toolbar" role="toolbar" :aria-label="`${label}格式`">
      <select v-model="block" aria-label="段落格式" @pointerdown="rememberSelection" @change="changeBlock"><option value="p">正文</option><option value="h1">标题 1</option><option value="h2">标题 2</option><option value="h3">标题 3</option></select>
      <select v-model.number="fontSize" aria-label="字号" @pointerdown="rememberSelection" @change="changeSize"><option v-for="size in richTextFontSizes" :key="size" :value="size">{{ size }} px</option></select>
      <button type="button" aria-label="加粗" title="加粗" @mousedown.prevent @click="command('bold')"><b>B</b></button>
      <button type="button" aria-label="斜体" title="斜体" @mousedown.prevent @click="command('italic')"><i>I</i></button>
      <button type="button" aria-label="下划线" title="下划线" @mousedown.prevent @click="command('underline')"><u>U</u></button>
      <span class="message-rich-divider" />
      <button type="button" aria-label="无序列表" title="无序列表" @mousedown.prevent @click="command('insertUnorderedList')">• 列表</button>
      <button type="button" aria-label="有序列表" title="有序列表" @mousedown.prevent @click="command('insertOrderedList')">1. 列表</button>
      <button type="button" aria-label="清除格式" title="清除格式" @mousedown.prevent @click="clearFormat">清除格式</button>
    </div>
    <div ref="editor" class="message-rich-content" contenteditable="true" role="textbox" aria-multiline="true" :aria-label="label" spellcheck="false" @input="input" @focus="rememberSelection" @blur="rememberSelection" @keyup="rememberSelection" @mouseup="rememberSelection" @paste="paste" @dragover.prevent @drop="drop" />
  </div>
</template>

<style scoped>
.message-rich-editor { min-width: 0; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; background: white; overflow: hidden; }
.message-rich-editor:focus-within { border-color: var(--el-color-primary, #409eff); }
.message-rich-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border-bottom: 1px solid #ebeef5; background: #f8fafc; }
.message-rich-toolbar select, .message-rich-toolbar button { color: #303133; height: 28px; border: 1px solid #dcdfe6; border-radius: 3px; background: white; padding: 0 7px; font-size: 12px; }
.message-rich-toolbar button { min-width: 28px; cursor: pointer; }
.message-rich-toolbar button:hover { color: #409eff; border-color: #a0cfff; }
.message-rich-toolbar button:focus-visible, .message-rich-toolbar select:focus-visible { outline: 2px solid #409eff; outline-offset: 1px; }
.message-rich-divider { width: 1px; height: 18px; margin: 0 3px; background: #dcdfe6; }
.message-rich-content { min-height: 180px; max-height: 440px; overflow: auto; padding: 12px; outline: none; color: #303133; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.message-rich-content :deep(p) { margin: 0 0 8px; }
.message-rich-content :deep(h1) { font-size: 24px; margin: 10px 0; }
.message-rich-content :deep(h2) { font-size: 20px; margin: 8px 0; }
.message-rich-content :deep(h3) { font-size: 18px; margin: 8px 0; }
.message-rich-content :deep(ul), .message-rich-content :deep(ol) { margin: 8px 0; padding-left: 26px; }
</style>
