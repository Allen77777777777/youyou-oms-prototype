<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Document, Search } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElInput, ElMessage, ElOption, ElPopover, ElSelect } from 'element-plus'
import { 多行搜索上限, 校验字段搜索, 解析搜索值, type 搜索字段, type 搜索模式 } from './筛选工具'
const props = withDefaults(defineProps<{ modelValue: string; field: string; mode: 搜索模式; fields: 搜索字段[]; ariaPrefix?: string; width?: number }>(), { ariaPrefix: '列表', width: 385 })
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:field': [value: string]; 'update:mode': [value: 搜索模式]; search: [] }>()
const 字段 = computed(() => props.fields.find(项 => 项.value === props.field))
const 类型 = computed(() => 字段.value?.kind ?? 'identifier')
const 打开 = ref(false), 草稿 = ref('')
watch(打开, visible => { if (visible) 打开多行() })
watch(() => [props.modelValue, props.field, props.mode], () => { 打开.value = false })
const 数量 = computed(() => 解析搜索值(草稿.value, 类型.value).length)
function 打开多行() { 草稿.value = props.mode === 'exact' ? 解析搜索值(props.modelValue, 类型.value).join('\n') : props.modelValue }
function 搜索() { const 错误 = 校验字段搜索(props.modelValue, props.mode, 类型.value); if (错误) return void ElMessage.warning(错误); emit('search') }
function 提交多行() {
  const 错误 = 校验字段搜索(草稿.value, 'exact', 类型.value)
  if (错误 || !数量.value) return void ElMessage.warning(错误 || '请先输入搜索内容')
  emit('update:modelValue', 解析搜索值(草稿.value, 类型.value).join(', ')); emit('update:mode', 'exact'); 打开.value = false; emit('search')
}
</script>
<template>
  <div class="字段搜索" :style="{ width: `${width}px` }" @keydown.esc="打开 = false">
    <ElSelect :model-value="field" class="字段选择" :aria-label="`${ariaPrefix}搜索字段`" @update:model-value="emit('update:field', $event)"><ElOption v-for="项 in fields" :key="项.value" :value="项.value" :label="项.label" /></ElSelect>
    <ElSelect :model-value="mode" class="匹配选择" :aria-label="`${ariaPrefix}匹配方式`" @update:model-value="emit('update:mode', $event)"><ElOption value="contains" label="模糊" /><ElOption value="exact" label="精确" /></ElSelect>
    <ElInput :model-value="modelValue" clearable :placeholder="`输入${字段?.label || '搜索内容'}`" :aria-label="`${ariaPrefix}搜索内容`" @update:model-value="emit('update:modelValue', $event)" @keyup.enter="搜索" />
    <ElButton class="搜索按钮" :aria-label="`${ariaPrefix}查询搜索内容`" title="查询" @click="搜索"><ElIcon><Search /></ElIcon></ElButton>
    <ElPopover v-model:visible="打开" role="dialog" placement="bottom-end" :width="330" :hide-after="0" trigger="click">
      <template #reference><ElButton class="多行按钮" :aria-label="`${ariaPrefix}多行输入搜索`" title="多行精确搜索"><ElIcon><Document /></ElIcon></ElButton></template>
      <div class="多行面板" @keydown.esc.stop="打开 = false"><p>{{ 字段?.label }}精确搜索，一行一项，最多 {{ 多行搜索上限 }} 项</p><ElInput v-model="草稿" type="textarea" :rows="8" placeholder="每行输入一项搜索内容" :aria-label="`${ariaPrefix}多行搜索内容`" /><div class="搜索计数" :class="{ 超限: 数量 > 多行搜索上限 }">已识别 {{ 数量 }} 项</div><footer><ElButton @click="草稿 = ''">清空</ElButton><span /><ElButton @click="打开 = false">关闭</ElButton><ElButton type="primary" @click="提交多行">搜索</ElButton></footer></div>
    </ElPopover>
  </div>
</template>
<style scoped>
.字段搜索{display:flex;align-items:center;min-width:0;max-width:100%;flex-shrink:0;height:32px}.字段选择{width:110px;flex:0 0 110px;min-width:0}.匹配选择{width:76px;flex:0 0 76px;min-width:0;margin-left:-1px}.字段搜索>.el-input{flex:1;width:0;min-width:0}.字段搜索 :deep(.el-select__selected-item),.字段搜索 :deep(.el-input__inner){font-size:12px}.字段选择 :deep(.el-select__wrapper){border-radius:4px 0 0 4px}.匹配选择 :deep(.el-select__wrapper){border-radius:0}.字段搜索>.el-input :deep(.el-input__wrapper){border-radius:0;margin-left:-1px}.搜索按钮,.多行按钮{width:28px;flex:0 0 28px;padding:0;margin:0 0 0 -1px;height:32px;border-radius:0;color:#6684a8}.多行按钮{border-radius:0 4px 4px 0}.多行面板 p{margin:0 0 12px;font-size:12px;color:#738197;line-height:1.7}.多行面板 :deep(.el-textarea__inner){font-size:12px;line-height:1.7;resize:vertical}.搜索计数{margin-top:8px;text-align:right;font-size:12px;color:#738197}.搜索计数.超限{color:#b85c43}footer{display:flex;gap:8px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #eef1f5}footer>span{flex:1}footer :deep(.el-button){height:28px;font-size:12px;margin:0;padding:0 10px}
</style>
