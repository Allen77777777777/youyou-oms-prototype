<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CustomerServiceLogList from '@/组件/客服日志/日志列表.vue'
import { ElButton, ElDialog, ElInput, ElMessage, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { reviewSession } from './会话'
import { getReviewReasonRenameBlockedReason, getReviewReasonUsage, saveReviewReason, setReviewReasonEnabled } from './原因分类模型'
import type { ReviewReasonCategory } from './类型'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const opened = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const newName = ref(''), editingId = ref(''), editingName = ref(''), error = ref('')
watch(() => props.modelValue, () => { newName.value = ''; editingId.value = ''; editingName.value = ''; error.value = '' })
function add() {
  const result = saveReviewReason(newName.value)
  if (!result.ok) { error.value = result.message; return }
  newName.value = ''; error.value = ''; ElMessage.success(result.message)
}
function edit(row: ReviewReasonCategory) {
  const blocked = getReviewReasonRenameBlockedReason(row.id)
  if (blocked) { error.value = blocked; return }
  editingId.value = row.id; editingName.value = row.name; error.value = ''
}
function save() {
  const result = saveReviewReason(editingName.value, editingId.value)
  if (!result.ok) { error.value = result.message; return }
  editingId.value = ''; error.value = ''; ElMessage.success(result.message)
}
function toggle(row: ReviewReasonCategory) {
  const result = setReviewReasonEnabled(row.id, !row.enabled)
  if (!result.ok) { error.value = result.message; return }
  error.value = ''; ElMessage.success(result.message)
}
</script>

<template>
  <ElDialog v-model="opened" title="原因分类管理" width="min(780px, 94vw)" align-center :close-on-click-modal="false">
    <div class="review-reason-manager">
      <div class="review-reason-add"><ElInput v-model="newName" aria-label="新增原因分类名称" placeholder="输入新的原因分类" maxlength="30" clearable @keyup.enter="add" /><ElButton type="primary" @click="add">新增分类</ElButton></div>
      <p class="review-reason-help">停用后历史评价保留原分类；仅未使用的自定义分类可修改名称。</p>
      <p v-if="error" role="alert" class="review-reason-error">{{ error }}</p>
      <ElTable :data="reviewSession.reasonCategories" size="small" max-height="420" row-key="id" class="review-reason-table">
        <ElTableColumn label="分类名称" min-width="180"><template #default="{ row }"><ElInput v-if="editingId === row.id" v-model="editingName" aria-label="编辑原因分类名称" maxlength="30" @keyup.enter="save" /><span v-else>{{ row.name }}</span></template></ElTableColumn>
        <ElTableColumn label="来源" width="80"><template #default="{ row }"><span>{{ row.builtin ? '内置' : '自定义' }}</span></template></ElTableColumn>
        <ElTableColumn label="使用评价数" width="100" align="center"><template #default="{ row }">{{ getReviewReasonUsage(row.id) }}</template></ElTableColumn>
        <ElTableColumn label="状态" width="85"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</ElTag></template></ElTableColumn>
        <ElTableColumn label="操作" width="175"><template #default="{ row }"><div class="review-reason-actions"><template v-if="editingId === row.id"><ElButton link type="primary" @click="save">保存</ElButton><ElButton link @click="editingId = ''; error = ''">取消</ElButton></template><template v-else><ElButton link type="primary" :disabled="!!getReviewReasonRenameBlockedReason(row.id)" :title="getReviewReasonRenameBlockedReason(row.id)" @click="edit(row as ReviewReasonCategory)">编辑</ElButton><ElButton link :type="row.enabled ? 'danger' : 'primary'" @click="toggle(row as ReviewReasonCategory)">{{ row.enabled ? '停用' : '启用' }}</ElButton></template></div></template></ElTableColumn>
      </ElTable>
      <CustomerServiceLogList :entries="reviewSession.reasonOperationLogs" />
    </div>
    <template #footer><ElButton @click="opened = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.review-reason-manager{font-size:13px;color:#52657b}.review-reason-add{display:flex;align-items:center;gap:10px;max-width:440px}.review-reason-add .el-button{margin:0}.review-reason-help{margin:12px 0 16px;color:#8795a5;font-size:12px;line-height:1.65}.review-reason-error{color:#cc615c;font-size:12px;margin:10px 0}.review-reason-actions{display:flex;gap:12px}.review-reason-actions .el-button{margin:0;font-size:12px}.review-reason-table{width:100%;font-size:12px}
</style>
