<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import { ElButton, ElCheckbox, ElIcon, ElInput, ElPopover } from 'element-plus'

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: Array<{ value: string; label: string }>
  placeholder: string
  width?: number
}>(), { width: 130 })
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const 打开 = ref(false)
const 搜索词 = ref('')
const 草稿 = ref<string[]>([])
const 触发按钮 = ref<HTMLButtonElement>()
const 可用值 = computed(() => new Set(props.options.map(项 => 项.value)))
const 有效选择 = (值: string[]) => [...new Set(值)].filter(项 => 可用值.value.has(项))
const 已提交 = computed(() => 有效选择(props.modelValue))
const 触发文字 = computed(() => {
  if (!已提交.value.length) return props.placeholder
  if (已提交.value.length > 1) return `${props.placeholder} ${已提交.value.length}项`
  return props.options.find(项 => 项.value === 已提交.value[0])?.label ?? props.placeholder
})
const 可见选项 = computed(() => {
  const 关键词 = 搜索词.value.trim().toLocaleLowerCase()
  return props.options.filter(项 => !关键词 || 项.label.toLocaleLowerCase().includes(关键词) || 项.value.toLocaleLowerCase().includes(关键词))
})
const 可见选中数 = computed(() => 可见选项.value.filter(项 => 草稿.value.includes(项.value)).length)
const 全选 = computed(() => 可见选项.value.length > 0 && 可见选中数.value === 可见选项.value.length)
const 部分选择 = computed(() => 可见选中数.value > 0 && !全选.value)

watch(打开, 值 => {
  if (!值) return
  搜索词.value = ''
  草稿.value = 有效选择(props.modelValue)
}, { flush: 'sync' })
watch(可用值, () => { 草稿.value = 有效选择(草稿.value) })

function 选择选项(值: string, 已选: boolean) {
  if (已选 && !草稿.value.includes(值)) 草稿.value = [...草稿.value, 值]
  if (!已选) 草稿.value = 草稿.value.filter(项 => 项 !== 值)
}
function 选择全部(值: string | number | boolean) {
  const 可见值 = new Set(可见选项.value.map(项 => 项.value))
  草稿.value = 值 === true ? [...new Set([...草稿.value, ...可见值])] : 草稿.value.filter(项 => !可见值.has(项))
}
function 关闭() {
  打开.value = false
  触发按钮.value?.focus()
}
function 确定() {
  emit('update:modelValue', 有效选择(草稿.value))
  关闭()
}
function 键盘关闭(事件: KeyboardEvent) {
  if (!打开.value || 事件.key !== 'Escape') return
  事件.preventDefault()
  事件.stopPropagation()
  关闭()
}
onMounted(() => document.addEventListener('keydown', 键盘关闭, true))
onBeforeUnmount(() => document.removeEventListener('keydown', 键盘关闭, true))
</script>

<template>
  <ElPopover v-model:visible="打开" trigger="click" placement="bottom-start" role="dialog" :width="280" :show-arrow="false" :hide-after="0">
    <template #reference>
      <button ref="触发按钮" type="button" class="多选触发" :class="{ 已选: 已提交.length, 打开 }" :style="{ width: `${width}px` }" :aria-label="placeholder" :aria-expanded="打开" aria-haspopup="dialog" :title="触发文字">
        <span>{{ 触发文字 }}</span><ElIcon class="下拉箭头" aria-hidden="true"><ArrowDown /></ElIcon>
      </button>
    </template>
    <div class="多选弹层" role="group" :aria-label="`${placeholder}多选`">
      <ElInput v-model="搜索词" size="small" clearable :placeholder="`搜索${placeholder}`" :aria-label="`搜索${placeholder}`">
        <template #prefix><ElIcon><Search /></ElIcon></template>
      </ElInput>
      <div class="全选栏">
        <ElCheckbox :model-value="全选" :indeterminate="部分选择" :disabled="!可见选项.length" :aria-label="`${placeholder}全选当前搜索结果`" @change="选择全部">全选</ElCheckbox>
        <span v-if="搜索词.trim()">当前搜索结果</span>
      </div>
      <div class="选项列表">
        <ElCheckbox v-for="项 in 可见选项" :key="项.value" class="筛选选项" :model-value="草稿.includes(项.value)" :aria-label="项.label" @change="值 => 选择选项(项.value, 值 === true)">{{ 项.label }}</ElCheckbox>
        <p v-if="!可见选项.length" class="空选项" role="status">{{ 搜索词.trim() ? '暂无匹配选项' : '暂无可选项' }}</p>
      </div>
      <footer class="确认栏">
        <span aria-live="polite">已选 {{ 草稿.length }} 项</span>
        <ElButton size="small" @click="关闭">取消</ElButton>
        <ElButton size="small" type="primary" @click="确定">确定</ElButton>
      </footer>
    </div>
  </ElPopover>
</template>

<style scoped>
.多选触发{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;height:32px;min-width:0;padding:0 10px;border:1px solid var(--el-border-color,#dcdfe6);border-radius:4px;background:#fff;color:var(--el-text-color-placeholder,#a8abb2);font:inherit;font-size:12px;cursor:pointer;transition:border-color .15s}
.多选触发>span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.多选触发:hover{border-color:var(--el-border-color-hover,#c0c4cc)}
.多选触发:focus-visible,.多选触发.打开{outline:2px solid var(--el-color-primary-light-7,#c6e2ff);outline-offset:1px;border-color:var(--el-color-primary,#409eff)}
.多选触发.已选{border-color:var(--el-color-primary-light-5,#a0cfff);color:var(--el-color-primary,#409eff);background:var(--el-color-primary-light-9,#ecf5ff)}
.下拉箭头{flex-shrink:0;font-size:12px;color:var(--el-text-color-placeholder,#a8abb2);transition:transform .15s}
.打开 .下拉箭头{transform:rotate(180deg)}
.多选弹层{font-size:12px;color:var(--el-text-color-regular,#606266)}
.全选栏{display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-bottom:4px;border-bottom:1px solid var(--el-border-color-lighter,#ebeef5)}
.全选栏>span{font-size:12px;color:var(--el-text-color-secondary,#909399)}
.选项列表{display:flex;flex-direction:column;max-height:230px;overflow-y:auto;padding:4px 0}
.筛选选项{display:flex;align-items:flex-start;height:auto;min-height:30px;margin-right:0;padding:6px 0;box-sizing:border-box}
.筛选选项 :deep(.el-checkbox__input){padding-top:2px}
.筛选选项 :deep(.el-checkbox__label){min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:18px;font-size:12px}
.全选栏 :deep(.el-checkbox__label){font-size:12px}
.空选项{margin:20px 0;text-align:center;color:var(--el-text-color-secondary,#909399)}
.确认栏{display:flex;align-items:center;gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid var(--el-border-color-lighter,#ebeef5)}
.确认栏>span{margin-right:auto;font-size:12px}
.确认栏 :deep(.el-button+.el-button){margin-left:0}
</style>
