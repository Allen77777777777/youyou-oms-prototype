<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import CustomerServiceLogList from '@/组件/客服日志/日志列表.vue'
import { ElButton, ElDialog, ElEmpty, ElInput, ElMessage, ElMessageBox } from 'element-plus'
import { countMailTagReferences, deleteMailTag, mailTagDefinitions, mailTagOperationLogs, mailTagPresetColors, MAX_MAIL_TAG_NAME_LENGTH, MAX_MAIL_TAGS, saveMailTag, tagStyle } from './设置模型'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { canAdminMailTags } from './权限与协作'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const editing = ref(false), editingId = ref<string>(), error = ref(''), deletingId = ref('')
const draft = reactive({ label: '', color: mailTagPresetColors[0]! })
const canManage = computed(() => canAdminMailTags())
function cancelEdit() { editing.value = false; editingId.value = undefined; error.value = ''; draft.label = ''; draft.color = mailTagPresetColors[0]! }
watch(() => props.modelValue, () => { cancelEdit() })
watch(canManage, allowed => { if (!allowed) cancelEdit() })
function beginEdit(id?: string) {
  if (!canManage.value) return void ElMessage.warning('没有业务标签字典维护权限')
  if (!id && mailTagDefinitions.length >= MAX_MAIL_TAGS) return void ElMessage.warning(`最多可创建 ${MAX_MAIL_TAGS} 个标签`)
  const tag = id ? mailTagDefinitions.find(item => item.id === id) : undefined
  if (id && !tag) return
  editingId.value = id; draft.label = tag?.label ?? ''; draft.color = tag?.color ?? mailTagPresetColors[0]!; error.value = ''; editing.value = true
}
function save() {
  if (!canManage.value) return void ElMessage.warning('没有业务标签字典维护权限')
  const result = saveMailTag(draft, editingId.value)
  if (!result.ok) { error.value = result.error; return }
  ElMessage.success(editingId.value ? '标签已更新' : '标签已新增')
  cancelEdit()
}
async function remove(id: string) {
  if (!canManage.value) return void ElMessage.warning('没有业务标签字典维护权限')
  if (deletingId.value) return
  const tag = mailTagDefinitions.find(item => item.id === id)
  if (!tag) return
  const affected = countMailTagReferences(id)
  const actor = currentHandlerId.value
  deletingId.value = id
  try {
    await ElMessageBox.confirm(`删除“${tag.label}”？当前有 ${affected} 个会话使用此标签，确认后会同时移除这些会话上的该标签，消息和其他标签保留。`, '删除标签', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    if (!props.modelValue) return
    if (actor !== currentHandlerId.value || !canManage.value) return void ElMessage.warning('操作身份或权限已变化，请重新确认删除')
    const result = deleteMailTag(id, affected)
    if (!result.ok) return void ElMessage.warning(result.error)
    if (editingId.value === id) cancelEdit()
    ElMessage.success(`标签已删除，已更新 ${result.affected} 个会话`)
  } catch { /* 用户取消，不更改字典或会话引用。 */ }
  finally { deletingId.value = '' }
}
</script>

<template>
  <ElDialog v-model="visible" title="站内信设置" width="min(720px, 94vw)" top="6vh" append-to-body :close-on-click-modal="false" destroy-on-close class="mail-settings-dialog">
    <section class="mail-tag-settings" aria-label="标签管理">
      <header><div><h3>标签管理 <span>{{ mailTagDefinitions.length }} / {{ MAX_MAIL_TAGS }}</span></h3><p>维护业务标签名称与颜色，供信件分类使用。</p></div><ElButton type="primary" :disabled="!canManage || mailTagDefinitions.length >= MAX_MAIL_TAGS" @click="beginEdit()">新增标签</ElButton></header>
      <section v-if="editing" class="mail-tag-form" :aria-label="editingId ? '编辑标签' : '新增标签'">
        <h4>{{ editingId ? '编辑标签' : '新增标签' }}</h4>
        <label class="mail-tag-label" for="mail-tag-name">标签名称</label><ElInput id="mail-tag-name" v-model="draft.label" aria-label="标签名称" :maxlength="MAX_MAIL_TAG_NAME_LENGTH" show-word-limit placeholder="请输入标签名称" @keyup.enter="save" />
        <span class="mail-tag-label">标签颜色</span><div class="mail-tag-color-options"><button v-for="color in mailTagPresetColors" :key="color" type="button" class="mail-tag-color-option" :class="{ selected: draft.color.toUpperCase() === color }" :style="{ backgroundColor: color }" :aria-label="`选择颜色 ${color}`" :aria-pressed="draft.color.toUpperCase() === color" @click="draft.color = color"><span v-if="draft.color.toUpperCase() === color">✓</span></button><label class="mail-tag-custom-color">自定义<input v-model="draft.color" type="color" aria-label="自定义标签颜色" /></label><span class="mail-tag-color-value">{{ draft.color.toUpperCase() }}</span></div>
        <p v-if="error" class="mail-tag-error" role="alert">{{ error }}</p><footer><ElButton @click="cancelEdit">取消编辑</ElButton><ElButton type="primary" @click="save">保存标签</ElButton></footer>
      </section>
      <div class="mail-tag-list"><ElEmpty v-if="!mailTagDefinitions.length" description="暂无标签，可新增业务标签" :image-size="50" /><article v-for="tag in mailTagDefinitions" :key="tag.id" class="mail-tag-row" :data-tag-id="tag.id"><span class="mail-tag-preview" :style="tagStyle(tag.id)" :title="tag.label">{{ tag.label }}</span><span class="mail-tag-usage">{{ countMailTagReferences(tag.id) }} 个会话</span><div class="mail-tag-actions"><ElButton link type="primary" :disabled="!canManage" :aria-label="`编辑标签 ${tag.label}`" @click="beginEdit(tag.id)">编辑</ElButton><ElButton link type="danger" :loading="deletingId === tag.id" :disabled="!canManage || (!!deletingId && deletingId !== tag.id)" :aria-label="`删除标签 ${tag.label}`" @click="remove(tag.id)">删除</ElButton></div></article></div>
      <CustomerServiceLogList v-if="canManage" :entries="mailTagOperationLogs" />
    </section>
    <template #footer><ElButton @click="visible = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.mail-tag-settings{max-height:calc(88vh - 115px);overflow-y:auto;padding-right:3px;color:var(--yy-text,#526176);font-size:13px}.mail-tag-settings>header{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:16px}.mail-tag-settings h3{margin:0;font-size:15px;color:var(--yy-text-heading,#202d40);font-weight:600}.mail-tag-settings h3 span{font-size:12px;font-weight:400;color:#93a0b2;margin-left:8px}.mail-tag-settings header p{margin:7px 0 0;color:#8b98a9;font-size:12px;line-height:1.5}.mail-tag-form{padding:15px 16px;border:1px solid #dce8f6;border-radius:6px;background:#f8fbff;margin-bottom:14px}.mail-tag-form h4{margin:0 0 12px;color:var(--yy-text-heading,#202d40);font-size:13px;font-weight:500}.mail-tag-label{display:block;font-size:12px;margin:10px 0 7px;color:#64758c}.mail-tag-color-options{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.mail-tag-color-option{width:23px;height:23px;padding:0;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #dce3ed;cursor:pointer;color:#fff;text-shadow:0 1px 2px #334155;font-size:13px;line-height:19px}.mail-tag-color-option.selected{box-shadow:0 0 0 2px #9aafc6}.mail-tag-color-option:focus-visible{outline:2px solid #409eff;outline-offset:3px}.mail-tag-custom-color{display:flex;gap:7px;align-items:center;margin-left:3px;font-size:12px}.mail-tag-custom-color input{width:28px;height:25px;border:0;padding:0;background:transparent;cursor:pointer}.mail-tag-color-value{font-size:11px;color:#8290a3}.mail-tag-error{font-size:12px;color:#c15a42;margin:10px 0 0}.mail-tag-form footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.mail-tag-form :deep(.el-button){margin:0}.mail-tag-list{max-height:min(390px,45vh);overflow:auto}.mail-tag-row{display:flex;align-items:center;gap:14px;min-height:51px;border-bottom:1px solid #edf1f6;padding:7px 3px}.mail-tag-preview{display:inline-block;padding:4px 9px;border:1px solid;border-radius:4px;line-height:1.4;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mail-tag-usage{margin-left:auto;white-space:nowrap;color:#9ba6b4;font-size:12px}.mail-tag-actions{display:flex;gap:12px;flex-shrink:0}.mail-tag-actions :deep(.el-button){margin:0;font-size:12px}@media(max-width:600px){.mail-tag-settings>header{gap:8px}.mail-tag-row{gap:8px}.mail-tag-preview{max-width:150px}.mail-tag-actions{gap:7px}}
</style>
