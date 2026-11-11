<script setup lang="ts">
import NumberCopy from '@/组件/单号复制.vue'
import { dateText } from './模型'
import type { PaymentFile } from './支付争议证据'

defineProps<{ files: PaymentFile[] }>()
defineEmits<{ preview: [file: PaymentFile] }>()
</script>

<template>
  <div v-for="(file,index) in files" :key="file.fileId || index" class="evidence-file">
    <div class="file-heading">
      <strong>{{ file.name || '材料文件' }}</strong>
      <button v-if="file.content" type="button" @click="$emit('preview', file)">查看图片</button>
    </div>
    <p v-if="file.note">{{ file.note }}</p>
    <small v-if="file.type">文件类型　{{ file.type }}</small>
    <small v-if="file.uploadedAt">上传时间　{{ dateText(file.uploadedAt) }}</small>
    <small v-if="file.providedAt && !file.uploadedAt">{{ dateText(file.providedAt) }} 归集</small>
    <small v-if="!file.content">仅有文件信息，未取得原件</small>
    <details v-if="file.evidenceId || file.fileId"><summary>文件编号</summary>
      <div v-if="file.evidenceId">证据组 <NumberCopy :value="file.evidenceId" label="证据组编号" /></div>
      <div v-if="file.fileId">文件 <NumberCopy :value="file.fileId" label="文件编号" /></div>
    </details>
  </div>
</template>
<style scoped>
.evidence-file { min-width: 0; margin: 6px 0 0; border-left: 2px solid #cad9e6; padding-left: 9px; }
.file-heading { display: flex; gap: 4px 10px; align-items: baseline; flex-wrap: wrap; }
.file-heading strong { overflow-wrap: anywhere; color: var(--yy-text-heading); }
.file-heading button { padding: 0; border: 0; color: var(--el-color-primary); background: none; font: inherit; cursor: pointer; }
.evidence-file small { display: block; font-size: 12px; color: #63748a; }
.evidence-file p { margin: 2px 0; white-space: pre-wrap; }
.evidence-file summary { color: #536a82; cursor: pointer; }
</style>
