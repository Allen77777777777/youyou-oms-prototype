<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import { formatReturnTime, getReturnDetail, returnKey, type ReturnRecord } from './模型'
import type { ReturnAttachment } from './接口契约'
import { attachmentDownloadName, attachmentIsImage, attachmentIsPdf, originalAttachmentUrl, thumbnailAttachmentUrl } from './附件媒体'
import { returnAnnotation as annotation } from './标注'

const props = defineProps<{ row: ReturnRecord }>()
const detail = computed(() => getReturnDetail(props.row))
const roles: Record<string, string> = { BUYER: '买家', SELLER: '卖家', EBAY: 'eBay', SYSTEM: '平台系统', OTHER: '其他来源' }
const purposes: Record<string, string> = { ITEM_RELATED: '商品凭证', LABEL_RELATED: '退货面单', REFUND_RELATED: '退款资料' }
const fileStatuses: Record<string, string> = { CREATED: '已上传·待关联', PUBLISHED: '已关联', DELETED: '已移除', UNKNOWN: '状态待核实' }
const groups = computed(() => [
  { title: '买家附件', files: detail.value.files.filter(file => file.submitter === 'BUYER') },
  { title: '卖家与平台材料', files: detail.value.files.filter(file => file.submitter !== 'BUYER') },
])
const unavailable = (file: ReturnAttachment): string => detail.value.contentOnHold ? '平台已隐藏附件内容' : file.fileStatus === 'DELETED' ? '附件已移除' : !['CREATED', 'PUBLISHED'].includes(file.fileStatus) ? '附件状态待核实' : detail.value.readStatus.files.status !== 'success' ? '附件读取尚未成功，请刷新后查看' : ''
const originalUrl = (file: ReturnAttachment) => unavailable(file) ? '' : originalAttachmentUrl(file)
const thumbnailUrl = (file: ReturnAttachment) => unavailable(file) ? '' : thumbnailAttachmentUrl(file)
const previewable = (file: ReturnAttachment) => !!originalUrl(file) && (attachmentIsImage(file) || attachmentIsPdf(file))
const thumbnailFailures = ref<string[]>([]), previewId = ref(''), visible = ref(false), previewFailed = ref(false)
const downloadErrors = ref<Record<string, string>>({}), downloading = ref<string[]>([])
const active = computed(() => detail.value.files.find(file => file.fileId === previewId.value))
const activeUrl = computed(() => active.value ? originalUrl(active.value) : '')
const controllers = new Set<AbortController>()
const time = (file: ReturnAttachment) => formatReturnTime(file.creationDate, props.row)

function preview(file: ReturnAttachment) {
  if (!previewable(file)) return
  previewId.value = file.fileId; previewFailed.value = false; visible.value = true
}
function reset() {
  visible.value = false; previewId.value = ''; thumbnailFailures.value = []; downloadErrors.value = {}; downloading.value = []
  for (const controller of controllers) controller.abort()
  controllers.clear()
}
watch(() => returnKey(props.row), reset)
watch(() => activeUrl.value, value => { if (!value) visible.value = false })
watch(() => props.row.lastSyncedAt, () => { thumbnailFailures.value = []; downloadErrors.value = {} })
onBeforeUnmount(reset)

async function download(file: ReturnAttachment) {
  const source = originalUrl(file), identity = returnKey(props.row)
  if (!source || downloading.value.includes(file.fileId)) return
  const controller = new AbortController(); controllers.add(controller)
  downloading.value.push(file.fileId); delete downloadErrors.value[file.fileId]
  try {
    const response = await fetch(source, { credentials: 'omit', mode: 'cors', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal })
    if (!response.ok) throw new Error('原文件获取失败')
    const blob = await response.blob()
    if (controller.signal.aborted || identity !== returnKey(props.row) || originalUrl(file) !== source || !detail.value.files.includes(file)) return
    if (!blob.size) throw new Error('原文件为空')
    const objectUrl = URL.createObjectURL(blob), revokeUrl = URL.revokeObjectURL.bind(URL), link = document.createElement('a')
    link.href = objectUrl; link.download = attachmentDownloadName(file); link.rel = 'noopener'; document.body.appendChild(link)
    try { link.click() } finally { link.remove(); setTimeout(() => revokeUrl(objectUrl), 1000) }
  } catch {
    if (!controller.signal.aborted && identity === returnKey(props.row) && originalUrl(file) === source) downloadErrors.value[file.fileId] = '原文件下载失败，可打开来源文件后保存，或刷新重试。'
  } finally {
    controllers.delete(controller); downloading.value = downloading.value.filter(id => id !== file.fileId)
  }
}
</script>

<template>
  <section v-prototype="annotation('attachments')" class="detail-panel attachments-panel"><h3>申请附件</h3>
    <p v-if="detail.readStatus.files.status !== 'success'" class="read-warning">{{ detail.readStatus.files.error || '附件尚未完成读取' }}，保留已取得的附件信息；刷新成功后可预览和下载。</p>
    <div v-for="group in groups" :key="group.title" class="attachment-group"><h4>{{ group.title }} <span>{{ group.files.length }}</span></h4>
      <div v-if="!group.files.length" class="empty-inline">{{ detail.readStatus.files.status === 'success' ? '暂无附件' : '附件情况待核实' }}</div>
      <article v-for="file in group.files" :key="file.fileId" class="file-card" :data-file-id="file.fileId">
        <button class="file-thumbnail" type="button" :disabled="!previewable(file)" :aria-label="`预览${detail.contentOnHold ? '附件' : file.fileName}`" @click="preview(file)"><img v-if="thumbnailUrl(file) && !thumbnailFailures.includes(file.fileId)" :src="thumbnailUrl(file)" alt="" @error="thumbnailFailures.push(file.fileId)" /><span v-else>{{ detail.contentOnHold ? '已隐藏' : file.fileStatus === 'DELETED' ? '已移除' : file.fileFormat || '文件' }}</span></button>
        <div class="file-copy"><button v-if="previewable(file)" class="file-name" type="button" @click="preview(file)">{{ file.fileName }}</button><strong v-else class="file-name plain">{{ detail.contentOnHold ? '平台已隐藏附件' : file.fileName }}</strong><span class="file-source">{{ roles[file.submitter] || '来源待核实' }} · {{ purposes[file.filePurpose] || file.filePurpose }}</span></div>
        <time class="file-time">{{ time(file) }}</time>
        <span class="file-state">{{ fileStatuses[file.fileStatus] || '状态待核实' }}</span>
        <div class="file-actions"><ElButton v-if="previewable(file)" link type="primary" @click="preview(file)">预览</ElButton><ElButton v-if="originalUrl(file)" link type="primary" :loading="downloading.includes(file.fileId)" @click="download(file)">下载</ElButton><a v-if="originalUrl(file) && ((!attachmentIsImage(file) && !attachmentIsPdf(file)) || downloadErrors[file.fileId])" :href="originalUrl(file)" target="_blank" rel="noopener noreferrer">打开原文件</a><span v-if="!originalUrl(file)" class="file-unavailable">{{ unavailable(file) || '未取得原件' }}</span></div>
        <p v-if="downloadErrors[file.fileId] && originalUrl(file)" class="file-error" role="alert">{{ downloadErrors[file.fileId] }}</p>
      </article>
    </div>
    <ElDialog v-model="visible" :title="activeUrl ? active?.fileName || '附件预览' : '附件预览'" width="min(1100px, calc(100vw - 48px))" class="return-file-preview" append-to-body destroy-on-close>
      <template v-if="active && activeUrl"><div v-if="attachmentIsImage(active)" class="preview-image"><img v-if="!previewFailed" :src="activeUrl" :alt="active.fileName" @error="previewFailed = true" /><p v-else role="alert">图片加载失败，请下载原文件或刷新后重试。</p></div><template v-else-if="attachmentIsPdf(active)"><iframe v-if="!previewFailed" :src="activeUrl" :title="active.fileName" class="preview-pdf" sandbox="" referrerpolicy="no-referrer" @error="previewFailed = true" /><p class="preview-hint">{{ previewFailed ? 'PDF 预览失败。' : '若浏览器无法展示 PDF，' }}可下载原文件后查看。</p></template></template>
      <template #footer><a v-if="activeUrl && (previewFailed || (active && attachmentIsPdf(active)))" :href="activeUrl" target="_blank" rel="noopener noreferrer" class="original-link">打开原文件</a><ElButton v-if="active && activeUrl" :loading="downloading.includes(active.fileId)" @click="download(active)">下载原文件</ElButton><ElButton @click="visible = false">关闭</ElButton></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.detail-panel{border:1px solid #e8ebef;border-radius:5px;padding:16px;margin-bottom:16px;min-width:0;font-size:13px;color:#303133}.detail-panel h3{margin:0 0 16px;font-size:14px;color:var(--yy-text-heading)}.attachment-group h4{display:flex;gap:8px;margin:15px 0 5px;font-size:13px;color:var(--yy-text-heading)}.attachment-group h4 span{color:#909399;font-weight:400}.file-card{display:grid;grid-template-columns:58px minmax(160px,1fr) minmax(170px,.65fr) minmax(85px,.35fr) auto;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #ebeef5;min-width:0}.file-thumbnail{height:58px;width:58px;padding:0;border:1px solid #e4e7ed;border-radius:4px;display:grid;place-items:center;background:#f7f9fc;color:#909399;font-size:12px;cursor:pointer;overflow:hidden}.file-thumbnail:disabled{cursor:default}.file-thumbnail img{width:100%;height:100%;object-fit:contain}.file-thumbnail:focus-visible,.file-name:focus-visible{outline:2px solid #1677ff;outline-offset:3px}.file-copy{min-width:0;display:flex;flex-direction:column;gap:7px}.file-name{padding:0;border:0;background:none;color:#1677ff;font:inherit;font-weight:500;line-height:1.6;text-align:left;overflow-wrap:anywhere;cursor:pointer}.file-name.plain{color:#606266;cursor:default}.file-source{color:#737b87;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.file-time{font-size:13px;color:#737b87;line-height:1.7;overflow-wrap:anywhere}.file-state{font-size:12px;color:#737b87;line-height:1.7;overflow-wrap:anywhere}.file-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;min-width:0}.file-actions .el-button{margin:0;padding:0;font-size:13px}.file-actions a,.original-link{color:#1677ff;text-decoration:none}.file-unavailable{color:#909399;font-size:12px;line-height:1.6;max-width:145px}.file-error{grid-column:2/-1;margin:0;color:#c45656;line-height:1.6;font-size:12px}.empty-inline{background:#fafbfc;padding:13px;text-align:center;color:#909399;border-radius:3px}.read-warning{background:#fff8e9;color:#986618;padding:10px 12px;line-height:1.8;font-size:12px;margin:0 0 12px;border-radius:4px}.preview-image{display:flex;justify-content:center;align-items:center;min-height:260px;max-height:72vh;overflow:auto;background:#f5f7fa}.preview-image img{max-width:100%;max-height:72vh;object-fit:contain}.preview-image p,.preview-hint{color:#737b87;font-size:13px;line-height:1.8}.preview-pdf{width:100%;height:67vh;border:1px solid #ebeef5}.original-link{font-size:13px;margin-right:16px}.attachments-panel{container-type:inline-size}@container(max-width:800px){.file-card{grid-template-columns:58px minmax(140px,1fr) auto;gap:9px 12px}.file-thumbnail{grid-row:1/3}.file-copy{grid-column:2;grid-row:1}.file-time{grid-column:2;grid-row:2}.file-state{grid-column:3;grid-row:1}.file-actions{grid-column:3;grid-row:2}.file-error{grid-column:2/-1}}@container(max-width:440px){.file-card{grid-template-columns:50px minmax(0,1fr);gap:7px 10px}.file-thumbnail{width:50px;height:50px;grid-row:1/3}.file-copy,.file-time{grid-column:2}.file-state{grid-column:2;grid-row:3}.file-actions{grid-column:2;grid-row:4}.file-error{grid-column:2}}@media(max-width:1350px){.detail-panel{padding:14px}}
</style>
