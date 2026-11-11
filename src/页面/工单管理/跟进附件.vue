<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { ElButton, ElDialog, ElIcon } from 'element-plus'
import { isRasterImage, readFile } from './附件存储'
import type { TicketAttachment } from './会话'

const props = defineProps<{ attachment: TicketAttachment; pendingFile?: File; disabled?: boolean }>()
const emit = defineEmits<{ remove: [] }>()
const url = ref('')
const failed = ref(false)
const imageFailed = ref(false)
const preview = ref(false)
const retry = ref(0)
const isImage = computed(() => isRasterImage(props.attachment.type))
const sizeLabel = computed(() => {
  const bytes = props.attachment.size
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
})
watch([() => props.attachment.id, () => props.pendingFile, retry], async ([id, file], _previous, cleanup) => {
  let active = true
  let objectUrl = ''
  cleanup(() => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) })
  url.value = ''
  failed.value = false
  imageFailed.value = false
  preview.value = false
  try {
    const blob = file || await readFile(id)
    if (!active) return
    objectUrl = URL.createObjectURL(blob)
    url.value = objectUrl
  } catch { if (active) failed.value = true }
}, { immediate: true })
</script>
<template>
  <div class="ticket-file" :class="{ 'is-image': isImage }">
    <button v-if="isImage && url && !imageFailed" type="button" class="thumbnail" :aria-label="'预览 ' + attachment.name" @click="preview = true">
      <img :src="url" :alt="attachment.name" @error="imageFailed = true" />
    </button>
    <span v-else class="file-icon" aria-hidden="true"><ElIcon><Document /></ElIcon></span>
    <div class="file-info"><span class="file-name">{{ attachment.name }}</span><small>{{ sizeLabel }}<template v-if="imageFailed"> · 图片无法预览</template></small></div>
    <div class="file-actions">
      <span v-if="failed" class="file-error" role="status">读取失败 <button type="button" @click="retry++">重试</button></span>
      <a v-else-if="url" :href="url" :download="attachment.name" :aria-label="'下载 ' + attachment.name">下载</a>
      <button v-if="pendingFile" type="button" :disabled="disabled" :aria-label="'移除 ' + attachment.name" @click="emit('remove')">移除</button>
    </div>
    <ElDialog v-if="preview" v-model="preview" :title="attachment.name" width="min(760px, 86vw)" append-to-body>
      <img class="full-image" :src="url" :alt="attachment.name" />
      <template #footer><a :href="url" :download="attachment.name">下载图片</a><ElButton @click="preview = false">关闭预览</ElButton></template>
    </ElDialog>
  </div>
</template>
<style scoped>
.ticket-file { box-sizing:border-box; display:flex; gap:10px; align-items:center; grid-column:1 / -1; padding:10px 12px; border:1px solid #e0e6ee; border-radius:6px; min-width:0; max-width:100%; font-size:12px; background:#fff; }
.thumbnail, .file-icon { display:grid; place-items:center; flex:0 0 36px; width:36px; height:40px; border:0; border-radius:4px; background:#f1f5fa; overflow:hidden; }
.thumbnail { padding:0; cursor:zoom-in; }
.thumbnail img { display:block; width:100%; height:100%; object-fit:contain; }
.file-icon { font-size:20px; color:#6e849d; }
.file-info { display:grid; gap:3px; flex:1; min-width:0; overflow-wrap:anywhere; color:#354356; }
.file-name { line-height:1.5; word-break:break-word; }
.file-info small { font-size:11px; color:#728097; }
.file-actions { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:7px 12px; flex:0 0 auto; max-width:100%; }
.ticket-file.is-image { display:grid; grid-column:auto; grid-template-columns:minmax(0,1fr); gap:8px; align-content:start; padding:8px; }
.is-image .thumbnail { width:100%; height:132px; background:#f4f6f9; }
.is-image .file-icon { width:100%; height:132px; font-size:26px; }
.is-image .file-info { padding:0 2px; }
.is-image .file-actions { justify-content:flex-start; padding:0 2px 1px; }
.ticket-file a, .ticket-file button:not(.thumbnail), :deep(.el-dialog__footer a) { font:inherit; color:#176dc9; border:0; background:transparent; padding:0; cursor:pointer; text-decoration:none; }
.ticket-file a:hover, .ticket-file button:not(.thumbnail):hover { text-decoration:underline; }
.ticket-file button:disabled { opacity:.6; }
.file-error { color:#ac4438; }
.full-image { display:block; max-width:100%; max-height:65vh; object-fit:contain; margin:auto; }
:deep(.el-dialog__footer a) { margin-right:14px; font-size:13px; }
@media (max-width:520px) { .ticket-file:not(.is-image) { flex-wrap:wrap; } .ticket-file:not(.is-image) .file-actions { margin-left:46px; } }
</style>
