<script setup lang="ts">
import { computed } from 'vue'
import { ElInput, ElOption, ElSelect } from 'element-plus'
import { 条件定义, 条件字段名, 条件操作符, 是否多行文本字段, 读取条件多选值, type 规则条件 } from './规则条件定义'
import BaseMultiSelect from './基础条件多选.vue'
import DimensionVolume from './尺寸材积输入.vue'
import RangeInput from './范围条件输入.vue'
import ProductRanges from './货品范围输入.vue'

const props = defineProps<{ condition: 规则条件; index: number; options: { value: string; label: string }[]; validate?: boolean }>()
const 定义 = computed(() => 条件定义[props.condition.field])
const 名称 = computed(() => `第${props.index + 1}项${条件字段名[props.condition.field]}`)
const 多行占位映射: Partial<Record<规则条件['field'], string>> = { stateProvince: '省/州信息中存在的字符，多个规则换行输入', city: '城市信息中存在的字符，多个规则换行输入', platformShippingMethod: '平台配送方式中的字符，多个规则换行输入', buyerMessage: '每行输入一个留言关键词或完整内容', warehouseSku: '每行输入一个仓库SKU', platformSku: '每行输入一个平台SKU' }
const 多行占位 = computed(() => 多行占位映射[props.condition.field])
const 多行帮助 = computed(() => ['buyerMessage', 'warehouseSku', 'platformSku'].includes(props.condition.field) ? '多个值换行输入；等于匹配任一完整值，包含匹配任一关键词。' : '多个字符换行输入，不区分英文大小写')
const 无需输入 = computed(() => props.condition.operator === '存在' || props.condition.operator === '不存在')
</script>

<template>
  <DimensionVolume v-if="condition.field === 'productDimensions' || condition.field === 'volume'" :condition="condition" :index="index" :validate="validate" />
  <ProductRanges v-else-if="condition.field === 'warehouseSkuQuantity' || condition.field === 'lengthWidthHeight'" :condition="condition" :index="index" :validate="validate" />
  <RangeInput v-else-if="定义.kind === 'range'" :range="condition" :name="名称" :label="定义.label" :money="定义.money" :integer="定义.integer" :unit="定义.unit" :validate="validate" />
  <div v-else-if="condition.field === 'orderAddress'" class="地址字符条件">
    <div class="地址字符标题"><span>地址1、2、3</span><ElSelect v-model="condition.operator" :aria-label="`第${index + 1}项比较方式`"><ElOption v-for="操作符 in 条件操作符(condition.field)" :key="操作符" :label="操作符" :value="操作符" /></ElSelect><span>以下字符</span></div>
    <p>下方输入指定自定义字符，存在多个时换行输入；字符识别时不区分英文大小写</p>
    <ElInput v-model="condition.value" :aria-label="名称" type="textarea" :rows="4" placeholder="输入详细地址中包含的字符，多个字符换行输入" />
  </div>
  <span v-else-if="无需输入" class="条件无需取值">无需填写内容</span>
  <div v-else-if="是否多行文本字段(condition.field)" class="多行字符条件"><ElInput v-model="condition.value" :aria-label="名称" type="textarea" :rows="3" :placeholder="多行占位" /><p>{{ 多行帮助 }}</p></div>
  <BaseMultiSelect v-else-if="定义.kind === 'multi'" :model-value="读取条件多选值(condition)" :options="options" :ariaLabel="名称" :placeholder="`请选择${条件字段名[condition.field]}`" @update:model-value="condition.values = $event" />
  <ElSelect v-else-if="定义.kind === 'select'" :model-value="condition.field === 'salesOwner' && !options.some(项 => 项.value === condition.value) ? undefined : condition.value" filterable :aria-label="名称" :placeholder="`请选择${条件字段名[condition.field]}`" @update:model-value="condition.value = $event">
    <ElOption v-for="项 in options" :key="项.value" :label="项.label" :value="项.value" />
  </ElSelect>
  <ElInput v-else v-model="condition.value" :aria-label="名称" :placeholder="`请输入${条件字段名[condition.field]}`" maxlength="500" />
</template>

<style scoped>
.尺寸条件输入{display:flex;align-items:center;gap:10px;min-width:0}.尺寸条件输入>.el-input{min-width:0;flex:1}.范围连接,.条件单位{flex-shrink:0;font-size:12px;color:var(--yy-text-secondary)}.条件无需取值{display:flex;align-items:center;color:var(--yy-text-secondary);font-size:12px}.尺寸条件输入 :deep(.el-input-group__prepend){padding:0 10px;color:var(--yy-text-regular)}
.地址字符条件{min-width:0;background:#f7f9fc;border-radius:4px;padding:14px}.地址字符标题{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--yy-text-regular)}.地址字符标题>.el-select{width:96px;flex:0 0 96px}.地址字符条件 p,.多行字符条件 p{margin:8px 0;font-size:12px;line-height:1.6;color:var(--yy-text-secondary)}.多行字符条件{min-width:0}.多行字符条件 p{margin-bottom:0}
@media(max-width:1350px){.尺寸条件输入{gap:7px}.尺寸条件输入 :deep(.el-input-group__prepend){padding:0 6px}.范围条件输入{column-gap:16px}}
</style>
