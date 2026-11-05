<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import CopyNumber from '@/组件/单号复制.vue'
import { getReturnDetail, returnKey, type ReturnRecord } from './模型'
import { returnLabelMedia } from './展示工具'
defineOptions({ name: 'ReturnLabelResponseData' })
const props = defineProps<{ row: ReturnRecord }>()
const detail = computed(() => getReturnDetail(props.row)), response = computed(() => detail.value.labelResponse)
const blocked = computed(() => detail.value.contentOnHold ? '平台已隐藏面单内容' : detail.value.labelRead?.status !== 'success' ? detail.value.labelRead?.error || '面单返回资料尚未读取成功' : '')
const media = computed(() => {
  if (blocked.value || !response.value) return null
  const data = response.value.labelData.trim().startsWith('data:') ? returnLabelMedia(response.value.labelData) : null
  const url = returnLabelMedia(response.value.labelURL)
  return data || (url?.kind === 'source' ? url : null)
})
const labelText = computed(() => !blocked.value && response.value?.labelData && !response.value.labelData.trim().startsWith('data:') ? response.value.labelData : '')
const visible = ref(false), failed = ref(false)
watch(() => [returnKey(props.row), media.value?.url], () => { visible.value = false; failed.value = false })
</script>
<template><details v-if="response || (detail.labelRead && detail.labelRead.status === 'failed')" class="label-response"><summary>面单返回资料</summary><dl v-if="response"><dt>面单 ID</dt><dd><CopyNumber :value="response.labelId" label="面单 ID" /></dd><dt>面单跟踪号</dt><dd><CopyNumber :value="response.trackingNumber" label="面单跟踪号" /></dd><dt>面单文件</dt><dd><span v-if="blocked" class="muted">{{ blocked }}</span><template v-else-if="media"><a v-if="media.kind === 'source'" :href="media.url" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">查看面单原件</a><ElButton v-else link type="primary" @click="visible = true">查看面单</ElButton></template><span v-else class="muted">{{ labelText ? '提供面单文本' : response.labelData || response.labelURL ? '文件格式或地址待核实' : '未提供可查看的面单文件' }}</span></dd></dl><p v-else class="muted">{{ blocked }}</p><details v-if="labelText" class="label-text"><summary>查看面单文本</summary><pre>{{ labelText }}</pre></details>
  <ElDialog v-model="visible" title="退货面单" width="min(1000px, calc(100vw - 48px))" append-to-body destroy-on-close><template v-if="media"><div v-if="media.kind === 'image'" class="label-image"><img v-if="!failed" :src="media.url" alt="退货面单" @error="failed = true" /><p v-else>面单图片未能加载，请刷新后重试。</p></div><iframe v-else-if="media.kind === 'pdf'" :src="media.url" title="退货面单" sandbox="" referrerpolicy="no-referrer" class="label-pdf" /></template><template #footer><ElButton @click="visible = false">关闭</ElButton></template></ElDialog>
</details></template>
<style scoped>.label-response{border-top:1px solid #ebeef5;padding-top:14px;margin-top:16px;font-size:12px}.label-response summary{color:#1677ff;cursor:pointer}.label-response dl{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px 8px;line-height:1.8;margin:15px 0 0}.label-response dt,.muted{color:#909399}.label-response dd{margin:0;overflow-wrap:anywhere}.label-response a{color:#1677ff;text-decoration:none}.label-response .el-button{padding:0;font-size:12px}.label-text{margin-top:14px}.label-text pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;border:1px solid #ebeef5;border-radius:3px;background:#fafbfc;padding:12px;font-size:12px;line-height:1.8;font-family:inherit}.label-image{display:flex;justify-content:center;align-items:center;min-height:260px;max-height:72vh;overflow:auto;background:#f5f7fa}.label-image img{max-width:100%;max-height:72vh;object-fit:contain}.label-image p{font-size:13px;color:#737b87}.label-pdf{width:100%;height:67vh;border:1px solid #ebeef5}</style>

