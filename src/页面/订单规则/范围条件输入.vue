<script setup lang="ts">
import { computed, reactive } from 'vue'
import { ElCheckbox, ElInput, ElOption, ElSelect } from 'element-plus'
import { 读取范围边界, 解析条件定点值, type 规则范围 } from './规则条件定义'
const props = defineProps<{ range: 规则范围; name: string; label: string; money?: boolean; integer?: boolean; unit?: string; validate?: boolean; prefixLabel?: string }>()
const 币种 = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'CAD', 'AUD', 'BRL', 'MXN', 'PLN', 'RUB']
const 范围边界 = computed(() => 读取范围边界(props.range))
const 失焦 = reactive({ lower: false, upper: false })
const 边界项 = [
  { key: 'lower', label: '下限', enabledKey: 'lowerEnabled', inclusiveKey: 'lowerInclusive', valueKey: 'value', options: [{ label: '大于', value: false }, { label: '大于等于', value: true }] },
  { key: 'upper', label: '上限', enabledKey: 'upperEnabled', inclusiveKey: 'upperInclusive', valueKey: 'upperValue', options: [{ label: '小于', value: false }, { label: '小于等于', value: true }] },
] as const
function 边界错误(边: typeof 边界项[number]): string {
  if (!范围边界.value[边.enabledKey] || (!props.validate && !失焦[边.key])) return ''
  const value = props.range[边.valueKey]
  if (!value?.trim()) return `请输入${props.label}${边.label}`
  if (解析条件定点值(value, props.integer) === undefined) return props.integer ? '请输入非负整数' : '请输入非负数，最多6位小数'
  if (props.money && !props.range.currency?.trim()) return '请选择币种'
  return ''
}
</script>

<template>
  <div class="范围条件输入">
    <div v-for="边 in 边界项" :key="边.key" class="范围边界">
      <div class="范围边界控件">
        <ElCheckbox :model-value="范围边界[边.enabledKey]" :aria-label="`${name}启用${边.label}`" @change="range[边.enabledKey] = Boolean($event)">{{ prefixLabel }}</ElCheckbox>
        <div class="边界输入组">
          <ElSelect :model-value="范围边界[边.inclusiveKey]" :disabled="!范围边界[边.enabledKey]" :aria-label="`${name}${边.label}比较方式`" class="边界比较" @update:model-value="range[边.inclusiveKey] = $event"><ElOption v-for="项 in 边.options" :key="String(项.value)" :label="项.label" :value="项.value" /></ElSelect>
          <ElInput v-model="range[边.valueKey]" :disabled="!范围边界[边.enabledKey]" :aria-label="`${name}${边.label}`" :aria-invalid="!!边界错误(边)" :aria-describedby="边界错误(边) ? `${name}-${边.key}-error` : undefined" :inputmode="integer ? 'numeric' : 'decimal'" class="边界数值" :class="{ 边界输入错误: !!边界错误(边) }" @blur="失焦[边.key] = true" />
          <ElSelect v-if="money" v-model="range.currency" :disabled="!范围边界[边.enabledKey]" filterable :aria-label="`${name}${边.label}币种`" placeholder="币种" class="边界币种"><ElOption v-for="币 in 币种" :key="币" :value="币" :label="币" /></ElSelect>
          <span v-else-if="unit" class="边界单位">{{ unit }}</span>
        </div>
      </div>
      <p v-if="边界错误(边)" :id="`${name}-${边.key}-error`" class="边界错误" role="alert">{{ 边界错误(边) }}</p>
    </div>
  </div>
</template>

<style scoped>
.范围条件输入{display:flex;flex-wrap:wrap;align-items:flex-start;gap:14px 24px;max-width:780px;min-width:0}.范围边界{flex:1 1 300px;min-width:0;max-width:378px}.范围边界控件{display:flex;align-items:center;gap:8px}.范围边界控件>.el-checkbox{height:32px;margin:0;flex:0 0 auto}.范围边界控件 :deep(.el-checkbox__label){font-size:12px;padding-left:6px}.边界输入组{display:flex;min-width:0;flex:1}.边界比较{width:112px;flex:0 0 112px}.边界币种{width:84px;flex:0 0 84px}.边界数值{min-width:70px;flex:1}.边界输入组>:not(:first-child){margin-left:-1px}.边界输入组 :deep(.el-select__wrapper),.边界输入组 :deep(.el-input__wrapper){border-radius:0}.边界输入组>:first-child :deep(.el-select__wrapper){border-radius:4px 0 0 4px}.边界输入组>:last-child :deep(.el-select__wrapper),.边界输入组>:last-child :deep(.el-input__wrapper){border-radius:0 4px 4px 0}.边界单位{display:flex;align-items:center;flex-shrink:0;font-size:12px;padding:0 9px;color:var(--yy-text-secondary);background:#fafbfc;border:1px solid var(--yy-border);border-radius:0 4px 4px 0}.边界输入错误 :deep(.el-input__wrapper){box-shadow:0 0 0 1px var(--el-color-danger) inset;position:relative;z-index:1}.边界错误{margin:5px 0 0 22px;font-size:12px;line-height:1.6;color:var(--el-color-danger)}
@media(max-width:1350px){.范围条件输入{column-gap:16px}}
</style>
