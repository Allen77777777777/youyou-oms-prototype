<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import { ElButton, ElCheckbox, ElIcon, ElInput, ElPopover } from 'element-plus'

const props = defineProps<{
  modelValue: string[]
  options: { value: string; label: string }[]
  placeholder: string
  ariaLabel: string
}>()
const emit = defineEmits<{ 'update:modelValue': [values: string[]] }>()
const 打开 = ref(false), 搜索词 = ref(''), 草稿 = ref<string[]>([])
const 触发按钮 = ref<HTMLButtonElement>(), 弹层宽度 = ref(560)
let 观察器: ResizeObserver | undefined
let 上次位置: number | undefined, 按住Shift = false
const 有效选项 = computed(() => [...new Map(props.options.map(项 => [项.value, 项])).values()])
const 已选 = computed(() => [...new Set(props.modelValue)])
const 显示名称 = (value: string) => 有效选项.value.find(项 => 项.value === value)?.label || `已失效选项（${value}）`
const 触发文字 = computed(() => 已选.value.map(显示名称).join('、') || props.placeholder)
const 可见选项 = computed(() => {
  const keyword = 搜索词.value.trim().toLocaleLowerCase()
  return 有效选项.value.filter(项 => !keyword || 项.label.toLocaleLowerCase().includes(keyword) || 项.value.toLocaleLowerCase().includes(keyword))
})
const 失效选择 = computed(() => 草稿.value.filter(value => !有效选项.value.some(项 => 项.value === value)))
const 可见选中数 = computed(() => 可见选项.value.filter(项 => 草稿.value.includes(项.value)).length)
const 全选 = computed(() => 可见选项.value.length > 0 && 可见选中数.value === 可见选项.value.length)
const 部分选择 = computed(() => 可见选中数.value > 0 && !全选.value)
function 更新宽度() {
  const width = 触发按钮.value?.getBoundingClientRect().width || 560
  弹层宽度.value = Math.min(Math.max(width, 320), document.documentElement.clientWidth - 32)
}
watch(打开, value => {
  if (!value) return
  草稿.value = [...已选.value]; 搜索词.value = ''; 上次位置 = undefined; 按住Shift = false
  更新宽度()
}, { flush: 'sync' })
watch(搜索词, () => { 上次位置 = undefined })
function 设置选择(values: string[], checked: boolean) {
  草稿.value = checked ? [...new Set([...草稿.value, ...values])] : 草稿.value.filter(value => !values.includes(value))
}
function 记录Shift(event: MouseEvent | KeyboardEvent) { 按住Shift = event.shiftKey }
function 选择选项(index: number, checked: boolean) {
  const start = 按住Shift && 上次位置 !== undefined ? Math.min(index, 上次位置) : index
  const end = 按住Shift && 上次位置 !== undefined ? Math.max(index, 上次位置) : index
  设置选择(可见选项.value.slice(start, end + 1).map(项 => 项.value), checked)
  上次位置 = index; 按住Shift = false
}
function 关闭() { 打开.value = false; 触发按钮.value?.focus() }
function 确定() { emit('update:modelValue', [...草稿.value]); 关闭() }
function 键盘关闭(event: KeyboardEvent) {
  if (!打开.value || event.key !== 'Escape') return
  event.preventDefault(); event.stopPropagation(); 关闭()
}
onMounted(() => {
  更新宽度()
  if (typeof ResizeObserver !== 'undefined' && 触发按钮.value) { 观察器 = new ResizeObserver(更新宽度); 观察器.observe(触发按钮.value) }
  document.addEventListener('keydown', 键盘关闭, true)
})
onBeforeUnmount(() => { 观察器?.disconnect(); document.removeEventListener('keydown', 键盘关闭, true) })
</script>

<template>
  <ElPopover v-model:visible="打开" trigger="click" placement="bottom-start" role="dialog" :width="弹层宽度" :show-arrow="false" :hide-after="0" popper-class="规则基础多选浮层">
    <template #reference>
      <button ref="触发按钮" type="button" class="基础多选触发" :class="{ 打开, 已选: 已选.length }" :aria-label="ariaLabel" :aria-expanded="打开" aria-haspopup="dialog" :title="触发文字">
        <span>{{ 触发文字 }}</span><ElIcon aria-hidden="true"><ArrowDown /></ElIcon>
      </button>
    </template>
    <section class="基础多选内容" role="group" :aria-label="`${ariaLabel}多选`">
      <ElInput v-model="搜索词" clearable placeholder="搜索内容" :aria-label="`搜索${ariaLabel}`"><template #prefix><ElIcon><Search /></ElIcon></template></ElInput>
      <div class="基础全选栏"><ElCheckbox :model-value="全选" :indeterminate="部分选择" :disabled="!可见选项.length" :aria-label="`${ariaLabel}全选当前搜索结果`" @change="value => 设置选择(可见选项.map(项 => 项.value), value === true)">全选</ElCheckbox><span v-if="搜索词.trim()">当前搜索结果</span></div>
      <div class="基础选项列表">
        <div v-for="(项, index) in 可见选项" :key="项.value" class="基础选项行" @click.capture="记录Shift" @keydown.capture="记录Shift">
          <ElCheckbox :model-value="草稿.includes(项.value)" :aria-label="项.label" @change="value => 选择选项(index, value === true)">{{ 项.label }}</ElCheckbox>
        </div>
        <ElCheckbox v-for="value in 失效选择" :key="value" class="失效选项" :model-value="true" @change="设置选择([value], false)">{{ 显示名称(value) }}</ElCheckbox>
        <p v-if="!可见选项.length" class="暂无选项" role="status">{{ 搜索词.trim() ? '暂无匹配选项' : '暂无可选项' }}</p>
      </div>
      <footer class="基础多选确认"><span>已选 {{ 草稿.length }} 项<span class="多选帮助"> · 按住 Shift 可快速多选</span></span><ElButton @click="关闭">取消</ElButton><ElButton type="primary" plain @click="确定">确定</ElButton></footer>
    </section>
  </ElPopover>
</template>

<style scoped>
.基础多选触发{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-width:0;height:32px;padding:0 11px;border:1px solid var(--el-border-color);border-radius:4px;background:#fff;color:var(--yy-text-secondary);font:inherit;font-size:13px;text-align:left;cursor:pointer}.基础多选触发>span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.基础多选触发.已选{color:var(--yy-text-regular)}.基础多选触发:hover{border-color:var(--el-border-color-hover)}.基础多选触发:focus-visible,.基础多选触发.打开{outline:0;border-color:var(--yy-primary);box-shadow:0 0 0 1px var(--yy-primary)}.基础多选触发>.el-icon{flex-shrink:0;color:var(--yy-text-secondary);transition:transform .15s}.基础多选触发.打开>.el-icon{transform:rotate(180deg)}.基础多选内容{font-size:13px}.基础多选内容 :deep(.el-input__wrapper){box-shadow:none;border-bottom:1px solid var(--yy-primary);border-radius:0;padding:0 2px}.基础全选栏{display:flex;align-items:center;justify-content:space-between;padding-top:8px}.基础全选栏>span,.多选帮助{color:var(--yy-text-secondary);font-size:12px}.基础选项列表{max-height:285px;overflow:auto;margin:2px -12px 0}.基础选项行{padding:2px 12px}.基础选项行:hover{background:var(--el-color-primary-light-9)}.基础选项行>.el-checkbox,.失效选项{display:flex;margin:0;height:auto;min-height:32px}.基础选项行 :deep(.el-checkbox__label){white-space:normal;overflow-wrap:anywhere;line-height:20px;font-size:13px}.失效选项{margin:0 12px;color:var(--yy-danger)}.暂无选项{margin:22px 12px;text-align:center;color:var(--yy-text-secondary)}.基础多选确认{display:flex;align-items:center;gap:8px;border-top:1px solid var(--yy-border-light);margin-top:8px;padding-top:10px}.基础多选确认>span{margin-right:auto;font-size:12px;color:var(--yy-text-secondary)}.基础多选确认 :deep(.el-button+.el-button){margin-left:0}
@media(max-width:1350px){.多选帮助{display:none}}
</style>
