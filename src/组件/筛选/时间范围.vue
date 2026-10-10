<script setup lang="ts">
import { computed } from 'vue'
import { ElConfigProvider, ElDatePicker } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { 中文快捷日期名称, 中文快捷日期范围 } from './筛选工具'
const props = withDefaults(defineProps<{ modelValue: null | string[]; precision?: 'date' | 'datetime'; width?: number; ariaPrefix?: string; timeZone?: string; shortcutsEnabled?: boolean; hint?: string }>(), { precision: 'datetime', width: 306, ariaPrefix: '列表', timeZone: 'Asia/Shanghai', shortcutsEnabled: true, hint: '' })
const emit = defineEmits<{ 'update:modelValue': [value: null | string[]] }>()
const 默认时间: [Date, Date] = [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)]
const 格式 = computed(() => props.precision === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss')
const 快捷 = computed(() => props.shortcutsEnabled ? 中文快捷日期名称.map(text => ({ text, value: () => 中文快捷日期范围(text, props.timeZone) })) : [])
</script>
<template>
  <span class="公共时间范围" :style="{ width: `${width}px` }"><ElConfigProvider :locale="zhCn"><ElDatePicker class="公共时间范围输入" :model-value="modelValue" :type="precision === 'date' ? 'daterange' : 'datetimerange'" :value-format="格式" :format="格式" :default-time="默认时间" :shortcuts="快捷" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至" :aria-label="`${ariaPrefix}日期范围`" :title="hint || (timeZone === 'Asia/Shanghai' ? '按北京时间筛选，包含起止秒' : '按所选时区筛选，包含起止秒')" clearable unlink-panels placement="bottom-start" @update:model-value="emit('update:modelValue', $event)" /></ElConfigProvider></span>
</template>
<style scoped>
.公共时间范围{display:inline-flex;flex:none;min-width:0;max-width:100%;height:32px}.公共时间范围 :deep(.公共时间范围输入.el-date-editor){width:100%!important;min-width:0;height:32px;padding:0 5px;box-sizing:border-box}.公共时间范围 :deep(.el-range-input){font-size:11px;font-variant-numeric:tabular-nums;flex:1;width:0;min-width:0}.公共时间范围 :deep(.el-range-separator){flex:0 0 18px;padding:0;font-size:12px}.公共时间范围 :deep(.el-range__icon){margin-right:2px;font-size:13px}
</style>
