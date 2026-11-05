<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElButton, ElMessage, ElOption, ElSelect } from 'element-plus'
import { getReturnBlockedReason, getReturnDetail, returnKey, uploadReturnAttachment, type ReturnRecord } from './模型'
import type { ReturnAttachment } from './接口契约'

const props = defineProps<{ row: ReturnRecord; mode: 'message' | 'label' | 'decline' }>()
const emit = defineEmits<{ uploaded: [file: ReturnAttachment]; busy: [value: boolean] }>()
const purpose = ref<'ITEM_RELATED' | 'REFUND_RELATED'>('ITEM_RELATED')
const uploading = ref(false), fileInput = ref<HTMLInputElement>(), uploadedId = ref('')
const detail = computed(() => getReturnDetail(props.row))
const blockedReason = computed(() => detail.value.contentOnHold ? '平台已隐藏本申请内容，暂不能上传附件' : detail.value.caseClosed ? '关联案件已结束，暂不能上传附件' : getReturnBlockedReason(props.row, props.mode))
const latestFile = computed(() => detail.value.files.find(file => file.fileId === uploadedId.value))
const fileStates: Record<string, string> = { CREATED: '已上传，待关联', PUBLISHED: '已关联', DELETED: '已移除' }
let current = true
onBeforeUnmount(() => { current = false; emit('busy', false) })

async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file || uploading.value) return
  if (blockedReason.value) { input.value = ''; return void ElMessage.warning(blockedReason.value) }
  const row = props.row, identity = returnKey(row), mode = props.mode
  const selectedPurpose = mode === 'label' ? 'LABEL_RELATED' : purpose.value
  const types: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/gif': 'GIF', 'image/bmp': 'BMP', 'application/pdf': 'PDF' }
  const format = types[file.type]
  if (!format || (format === 'PDF' && selectedPurpose !== 'LABEL_RELATED')) { input.value = ''; return void ElMessage.warning('图片支持 PNG、JPEG、GIF、BMP；PDF 仅用于退货面单') }
  if (file.size > 5 * 1024 * 1024) { input.value = ''; return void ElMessage.warning('单个文件不能超过 5 MiB') }
  uploading.value = true; emit('busy', true)
  try {
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('读取文件失败')); reader.readAsDataURL(file) })
    if (!current) return
    if (returnKey(props.row) !== identity || props.mode !== mode) return void ElMessage.warning('当前申请或操作已切换，请重新选择附件')
    if (blockedReason.value) return void ElMessage.warning(blockedReason.value)
    const result = uploadReturnAttachment(row, { fileName: file.name, filePurpose: selectedPurpose, fileFormat: format, data })
    if (result.error || !result.file) return void ElMessage.warning(result.error || '附件上传未取得文件回执')
    uploadedId.value = result.file.fileId; emit('uploaded', result.file)
    ElMessage.success(mode === 'label' ? '面单已上传并选中，请继续确认提供面单' : mode === 'decline' ? '材料已上传至本申请，拒绝退货尚未提交' : '附件已上传至本申请，留言尚未发送')
  } catch { if (current) ElMessage.error('文件读取失败，请重新选择') }
  finally { uploading.value = false; input.value = ''; if (current) emit('busy', false) }
}
</script>

<template>
  <section class="return-upload" :aria-label="mode === 'label' ? '上传退货面单' : mode === 'decline' ? '上传申请材料' : '上传沟通附件'">
    <label>{{ mode === 'label' ? '上传退货面单' : mode === 'decline' ? '申请材料（可选）' : '沟通附件' }}</label>
    <div class="upload-controls">
      <ElSelect v-if="mode !== 'label'" v-model="purpose" :aria-label="mode === 'decline' ? '申请材料用途' : '沟通附件用途'" :disabled="!!blockedReason || uploading"><ElOption label="商品凭证" value="ITEM_RELATED" /><ElOption label="退款资料" value="REFUND_RELATED" /></ElSelect>
      <ElButton :loading="uploading" :disabled="!!blockedReason" @click="fileInput?.click()">{{ mode === 'label' ? '上传面单' : '上传附件' }}</ElButton>
      <input ref="fileInput" type="file" :accept="mode === 'label' ? 'image/png,image/jpeg,image/gif,image/bmp,application/pdf' : 'image/png,image/jpeg,image/gif,image/bmp'" :aria-label="mode === 'label' ? '选择退货面单' : mode === 'decline' ? '选择申请材料' : '选择沟通附件'" :disabled="!!blockedReason || uploading" hidden @change="upload" />
    </div>
    <p class="upload-hint">{{ mode === 'label' ? '上传后将选为本次面单；确认提供并取得平台回执后，才完成面单关联。' : mode === 'decline' ? '材料独立上传到本次申请；拒绝退货另行确认提交，取消操作不会撤回已上传材料。' : '附件上传到本次退货申请，与下方文字留言分别提交。' }}</p>
    <p v-if="latestFile" class="upload-result" role="status">{{ latestFile.fileName }} · {{ fileStates[latestFile.fileStatus] || '状态待核实' }}</p>
    <p v-if="blockedReason" class="upload-hint blocked">{{ blockedReason }}</p>
  </section>
</template>

<style scoped>
.return-upload{margin:16px 0;padding:13px 0;border-top:1px solid #e3e9f1;border-bottom:1px solid #e3e9f1}.return-upload>label{display:block;color:#606266;font-size:12px;margin-bottom:10px}.upload-controls{display:flex;align-items:center;gap:8px;min-width:0}.upload-controls .el-select{width:auto;min-width:0;flex:1}.upload-controls .el-button{font-size:12px;flex:none}.upload-hint{font-size:11px;line-height:1.7;color:#909399;margin:9px 0 0}.upload-result{font-size:12px;line-height:1.7;color:#41754a;margin:9px 0 0;overflow-wrap:anywhere}.blocked{color:#b88230}
</style>
