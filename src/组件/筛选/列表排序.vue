<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElButton, ElOption, ElPopover, ElSelect } from 'element-plus'
import type { 列表排序条件, 排序字段 } from './筛选工具'
const props = withDefaults(defineProps<{ modelValue: 列表排序条件; fields: 排序字段[]; ariaPrefix?: string; width?: number }>(), { ariaPrefix: '列表', width: 130 })
const emit = defineEmits<{ 'update:modelValue': [value: 列表排序条件]; change: [value: 列表排序条件] }>()
const 打开 = ref(false), 草稿 = reactive<列表排序条件>({ field: '', direction: 'desc' })
watch(打开, visible => { if (visible) Object.assign(草稿, props.modelValue) })
watch(() => [props.modelValue.field, props.modelValue.direction], () => { 打开.value = false })
const 字段 = computed(() => props.fields.find(项 => 项.value === props.modelValue.field))
const 临时字段 = computed(() => props.fields.find(项 => 项.value === 草稿.field))
const 方向文案 = computed(() => 临时字段.value?.kind === 'number' ? ['小 → 大', '大 → 小'] : 临时字段.value?.kind === 'text' ? ['升序', '降序'] : ['早 → 晚', '晚 → 早'])
function 确定() { const value = { ...草稿 }; emit('update:modelValue', value); emit('change', value); 打开.value = false }
</script>
<template>
  <ElPopover v-model:visible="打开" role="dialog" placement="bottom-start" :width="320" :hide-after="0" trigger="click">
    <template #reference><ElButton class="排序触发" :style="{ width: `${width}px` }" :aria-label="`${ariaPrefix}排序`" :title="字段?.label || '默认顺序'" @keydown.esc="打开 = false"><span>排序 {{ 字段?.label || '默认顺序' }} {{ modelValue.field ? modelValue.direction === 'desc' ? '↓' : '↑' : '' }}</span></ElButton></template>
    <div class="排序面板" @keydown.esc.stop="打开 = false"><p>列表排序</p><div class="排序选择"><ElSelect v-model="草稿.field" :teleported="false" placeholder="默认顺序" :aria-label="`${ariaPrefix}排序字段`"><ElOption label="默认顺序" value="" /><ElOption v-for="项 in fields" :key="项.value" :value="项.value" :label="项.label" /></ElSelect><div class="排序方向"><button type="button" :class="{ 激活: 草稿.direction === 'asc' }" :aria-pressed="草稿.direction === 'asc'" :disabled="!草稿.field" @click="草稿.direction = 'asc'">{{ 方向文案[0] }}</button><button type="button" :class="{ 激活: 草稿.direction === 'desc' }" :aria-pressed="草稿.direction === 'desc'" :disabled="!草稿.field" @click="草稿.direction = 'desc'">{{ 方向文案[1] }}</button></div></div><footer><ElButton @click="打开 = false">取消</ElButton><ElButton type="primary" @click="确定">确定</ElButton></footer></div>
  </ElPopover>
</template>
<style scoped>
.排序触发{height:32px;max-width:100%;flex:none;padding:0 10px;font-size:12px;margin:0;color:#62758f}.排序触发>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.排序面板>p{margin:0 0 10px;color:var(--yy-text-heading,#303133);font-size:12px}.排序选择{display:flex;gap:8px;align-items:center}.排序选择>.el-select{width:140px;flex:0 0 140px}.排序选择 :deep(.el-select__selected-item){font-size:12px}.排序方向{display:flex;flex:1}.排序方向>button{font-size:12px;white-space:nowrap;height:32px;padding:0 8px;border:1px solid #dce5ef;background:#f8fafc;color:#6c7d92;cursor:pointer}.排序方向>button:first-child{border-radius:4px 0 0 4px}.排序方向>button:last-child{border-radius:0 4px 4px 0;margin-left:-1px}.排序方向>button.激活{border-color:#8dbcfa;color:#2877cc;background:#edf6ff;position:relative}.排序方向>button:disabled{cursor:default;opacity:.5}footer{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid #eef1f5}footer :deep(.el-button){height:28px;font-size:12px;margin:0;padding:0 10px}
</style>
