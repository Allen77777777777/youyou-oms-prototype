<script setup lang="ts">
import { ref } from 'vue'
import { Paperclip } from '@element-plus/icons-vue'
import { ElButton } from 'element-plus'
import { prepareFile, type PendingFile } from './附件存储'
import Attachment from './跟进附件.vue'

const props = withDefaults(defineProps<{ disabled?: boolean; inputLabel?: string }>(), { inputLabel: '选择跟进附件' })
const pending = defineModel<PendingFile[]>({ required: true })
const emit = defineEmits<{ change: [] }>()
const fileInput = ref<HTMLInputElement>()

function addFiles(files: File[]) {
  if (props.disabled || !files.length) return
  pending.value = [...pending.value, ...files.map(prepareFile)]
  emit('change')
}
function removeFile(id: string) {
  if (props.disabled) return
  pending.value = pending.value.filter(file => file.attachment.id !== id)
  emit('change')
}
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files || []))
  input.value = ''
}
function pasteImages(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard || props.disabled) return
  const files = Array.from(clipboard.files || []).filter(file => file.type.startsWith('image/'))
  if (!files.length) {
    for (const item of Array.from(clipboard.items || [])) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) return
  // 文字由文本域按光标位置粘贴；同时携带的图片独立加入草稿。
  if (!clipboard.getData('text/plain')) event.preventDefault()
  addFiles(files)
}
</script>
<template>
  <div class="progress-editor" @paste="pasteImages">
    <slot />
    <div class="attachment-toolbar"><ElButton :icon="Paperclip" size="small" native-type="button" :disabled="disabled" @click="fileInput?.click()">上传附件</ElButton>
      <input ref="fileInput" type="file" multiple hidden :disabled="disabled" :aria-label="inputLabel" @change="selectFiles" />
    </div>
    <div v-if="pending.length" class="pending-files" aria-label="待保存附件">
      <Attachment v-for="item in pending" :key="item.attachment.id" :attachment="item.attachment" :pending-file="item.file" :disabled="disabled" @remove="removeFile(item.attachment.id)" />
    </div>
  </div>
</template>
<style scoped>
.progress-editor, .pending-files { display:grid; min-width:0; width:100%; gap:9px; }
.pending-files { grid-template-columns:repeat(auto-fill,minmax(min(152px,100%),1fr)); align-items:start; }
</style>
