<script setup lang="ts">
import { ref } from 'vue'
import { ElIcon, ElPopover, ElRadio, ElRadioGroup } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { type 规则条件 } from './规则条件定义'
import RangeInput from './范围条件输入.vue'
defineProps<{ condition: 规则条件; index: number; validate?: boolean }>()
const 帮助打开 = ref(false)
const 维度 = [{ key: 'length', label: '长度' }, { key: 'width', label: '宽度' }, { key: 'height', label: '高度' }] as const
</script>

<template>
  <div v-if="condition.field === 'warehouseSkuQuantity'" class="产品数量面板">
    <div class="数量类型"><ElRadioGroup :model-value="condition.quantityMode ?? 'total'" :aria-label="`第${index + 1}项产品数量类型`" @update:model-value="condition.quantityMode = $event as 'total' | 'sku'"><ElRadio value="total">总数量</ElRadio><ElRadio value="sku">SKU数量</ElRadio></ElRadioGroup><ElPopover v-model:visible="帮助打开" trigger="hover" placement="top" :width="560" :popper-style="{ maxWidth: 'calc(100vw - 36px)' }"><template #reference><button class="数量问号" type="button" aria-label="SKU数量说明" @click="帮助打开 = true" @focus="帮助打开 = true" @keydown.esc.stop.prevent="帮助打开 = false"><ElIcon><QuestionFilled /></ElIcon></button></template><span>单个条件中包含多个 SKU 时，订单包含其中一个 SKU 并符合条件，即视为命中该条件</span></ElPopover></div>
    <div class="数量边界"><span>{{ condition.quantityMode === 'sku' ? '当SKU数量' : '当产品总数量' }}</span><RangeInput :range="condition" :name="`第${index + 1}项产品数量`" label="产品数量" integer :validate="validate" /></div>
  </div>
  <div v-else-if="condition.field === 'lengthWidthHeight' && condition.dimensionRanges" class="长宽高面板">
    <RangeInput v-for="dim in 维度" :key="dim.key" :range="condition.dimensionRanges[dim.key]" :name="`第${index + 1}项长宽高${dim.label}`" :label="dim.label" :prefix-label="dim.label" unit="cm" :validate="validate" />
  </div>
</template>

<style scoped>
.产品数量面板,.长宽高面板{padding:12px 16px;background:#f7f8fb;border-radius:4px;min-width:0}.数量类型{display:flex;align-items:center;gap:2px;margin-bottom:10px}.数量类型 :deep(.el-radio){height:28px;margin-right:24px}.数量类型 :deep(.el-radio:last-child){margin-right:0}.数量类型 :deep(.el-radio__label){font-size:12px}.数量边界{display:flex;align-items:flex-start;gap:18px}.数量边界>span{font-size:12px;line-height:32px;white-space:nowrap}.数量边界>.范围条件输入{flex:1}.数量问号{display:inline-flex;border:0;background:none;color:#9ca4af;padding:2px;cursor:help}.数量问号:focus-visible{outline:1px solid var(--yy-primary)}.长宽高面板{display:flex;flex-direction:column;gap:14px}.长宽高面板 :deep(.范围边界){flex-basis:310px}
@media(max-width:1350px){.数量边界{flex-direction:column;gap:4px}.数量边界>.范围条件输入{width:100%}}
</style>
