<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Close, Plus } from '@element-plus/icons-vue'

type Item = { text: string; done: boolean }
const props = withDefaults(defineProps<{ disabled?: boolean; label?: string }>(), { label: '待办清单' })
const items = defineModel<Item[]>({ required: true })
const group = ref<HTMLElement>()
const addButton = ref<HTMLButtonElement>()
const composing = new WeakSet<HTMLInputElement>()

async function focusRow(index: number, caret?: number) {
  await nextTick()
  const input = group.value?.querySelectorAll<HTMLInputElement>('.checklist-text')[index]
  if (!input) { addButton.value?.focus(); return }
  input.focus()
  const position = caret ?? input.value.length
  input.setSelectionRange(position, position)
}
function addRow() {
  if (props.disabled) return
  const index = items.value.length
  items.value = [...items.value, { text: '', done: false }]
  void focusRow(index)
}
function removeRow(index: number) {
  if (props.disabled) return
  const remaining = items.value.filter((_, position) => position !== index)
  items.value = remaining
  void focusRow(Math.min(index, remaining.length - 1))
}
function updateRow(index: number, patch: Partial<Item>) {
  if (props.disabled) return
  items.value = items.value.map((row, position) => position === index ? { ...row, ...patch } : row)
}
function writeText(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  if (!composing.has(input) && items.value[index]?.text !== input.value) updateRow(index, { text: input.value })
}
function finishComposition(index: number, event: CompositionEvent) {
  composing.delete(event.target as HTMLInputElement)
  writeText(index, event)
}
// 插入换行时保留选区外的文字；只有原行沿用其勾选状态。
function insertLines(index: number, input: HTMLInputElement, lines: string[]) {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const replacements = lines.map((line, offset) => ({
    text: (offset === 0 ? input.value.slice(0, start) : '') + line + (offset === lines.length - 1 ? input.value.slice(end) : ''),
    done: offset === 0 && items.value[index]!.done,
  }))
  items.value = [...items.value.slice(0, index), ...replacements, ...items.value.slice(index + 1)]
  void focusRow(index + lines.length - 1, lines[lines.length - 1]!.length)
}
function enter(index: number, event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if (props.disabled || composing.has(input) || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  event.stopPropagation()
  insertLines(index, input, ['', ''])
}
function paste(index: number, event: ClipboardEvent) {
  const clipboard = event.clipboardData
  const input = event.target as HTMLInputElement
  if (props.disabled || composing.has(input) || !clipboard) return
  // 含文件的剪贴板继续冒泡给外围附件编辑器，包括同时带有纯文本的截图。
  if (clipboard.files?.length || Array.from(clipboard.items || []).some(item => item.kind === 'file')) return
  const lines = clipboard.getData('text/plain').split(/\r\n?|\n/)
  if (lines.length < 2) return
  event.preventDefault()
  insertLines(index, input, lines)
}
</script>

<template>
  <div ref="group" class="ticket-checklist-input" role="group" :aria-label="label">
    <ul v-if="items.length">
      <li v-for="(item, index) in items" :key="index" class="checklist-row" :class="{ checked: item.done }">
        <input class="checklist-check" type="checkbox" :aria-label="'第' + (index + 1) + '项完成状态'" :checked="item.done" :disabled="disabled"
          @change="updateRow(index, { done: ($event.target as HTMLInputElement).checked })" />
        <input class="checklist-text" type="text" :aria-label="'第' + (index + 1) + '项待办内容'" :value="item.text" :disabled="disabled"
          placeholder="填写待办事项" autocomplete="off" @input="writeText(index, $event)" @keydown.enter="enter(index, $event)" @paste="paste(index, $event)"
          @compositionstart="composing.add($event.target as HTMLInputElement)" @compositionend="finishComposition(index, $event)" />
        <button class="checklist-remove" type="button" :aria-label="'删除第' + (index + 1) + '项'" title="删除此项" :disabled="disabled" @click="removeRow(index)"><Close aria-hidden="true" /></button>
      </li>
    </ul>
    <button ref="addButton" class="checklist-add" type="button" :disabled="disabled" @click="addRow"><Plus aria-hidden="true" />添加待办项</button>
  </div>
</template>

<style scoped>
.ticket-checklist-input { width:100%; min-width:0; }
.ticket-checklist-input ul { list-style:none; padding:0; margin:0 0 4px; }
.checklist-row { display:flex; align-items:center; gap:9px; min-height:33px; padding:1px 4px; border-bottom:1px solid #e8edf2; }
.checklist-check { flex:none; width:15px; height:15px; margin:0; accent-color:#347ac5; cursor:pointer; }
.checklist-text { flex:1; min-width:0; border:0; border-radius:3px; background:transparent; color:#34465b; font:inherit; font-size:13px; padding:5px 2px; }
.checklist-text::placeholder { color:#8895a6; }
.checked .checklist-text { text-decoration:line-through; color:#6e7a89; }
.checklist-text:focus-visible, .checklist-remove:focus-visible, .checklist-add:focus-visible { outline:2px solid #85b4de; outline-offset:1px; }
.checklist-add, .checklist-remove { display:inline-flex; align-items:center; justify-content:center; border:0; border-radius:3px; background:transparent; font:inherit; cursor:pointer; }
.checklist-remove { flex:none; width:26px; height:26px; color:#77869a; }
.checklist-remove:hover:not(:disabled) { color:#a64842; background:#fdf1ef; }
.checklist-add { gap:5px; min-height:28px; padding:2px 5px; color:#286ca7; font-size:12px; line-height:1.5; }
.checklist-add:hover:not(:disabled) { background:#edf5ff; }
.checklist-add svg, .checklist-remove svg { width:14px; height:14px; }
.ticket-checklist-input :disabled { opacity:.6; cursor:default; }
</style>
