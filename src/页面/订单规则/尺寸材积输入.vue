<script setup lang="ts">
import { ElButton, ElCheckbox, ElInput, ElOption, ElRadio, ElSelect } from 'element-plus'
import { CirclePlus, Remove } from '@element-plus/icons-vue'
import type { 规则条件 } from './规则条件定义'
import { 格式化条件值 } from './规则条件定义'
import { 创建尺寸配置, 创建尺寸公式行, 创建材积组, 尺寸匹配方式, 尺寸操作类型, 材积方式, 校验尺寸公式 } from './尺寸材积模型'
import SizeHelp from './尺寸材积帮助.vue'
const props = defineProps<{ condition: 规则条件; index: number; validate?: boolean }>()
const 维度 = [{ key: 'length', label: '长' }, { key: 'width', label: '宽' }, { key: 'height', label: '高' }] as const
function 重新配置() {
  if (props.condition.field === 'productDimensions') { props.condition.dimensionRules = 创建尺寸配置(); props.condition.operator = '等于' }
  else { props.condition.volumeGroups = [创建材积组()]; props.condition.operator = '介于' }
}
const 名称 = (row: number) => `第${props.index + 1}项尺寸第${row + 1}条`
const 组名 = (group: number) => `第${props.index + 1}项材积第${group + 1}组`
</script>

<template>
  <div v-if="condition.field === 'productDimensions' && condition.dimensionRules" class="产品尺寸面板">
    <ElSelect v-model="condition.dimensionRules.mode" :aria-label="`第${index + 1}项产品尺寸匹配方式`" class="尺寸匹配"><ElOption v-for="mode in 尺寸匹配方式" :key="mode" :value="mode" :label="mode" /></ElSelect>
    <div v-for="(row, rowIndex) in condition.dimensionRules.rows" :key="rowIndex" class="尺寸公式行">
      <ElSelect v-model="row.type" :aria-label="`${名称(rowIndex)}操作类型`" :title="尺寸操作类型.find(type => type.value === row.type)?.label"><ElOption v-for="type in 尺寸操作类型" :key="type.value" :label="type.label" :value="type.value" /></ElSelect>
      <div class="公式输入"><ElInput v-model="row.expression" :aria-label="`${名称(rowIndex)}公式`" placeholder="请输入公式如: L>200 and W>150" maxlength="1000" :aria-invalid="validate && !!校验尺寸公式(row.expression)" /><p v-if="validate && 校验尺寸公式(row.expression)" class="公式错误" role="alert">{{ 校验尺寸公式(row.expression) }}</p></div>
      <ElInput v-model="row.note" :aria-label="`${名称(rowIndex)}备注`" placeholder="请填写备注" maxlength="200" />
      <div class="尺寸增删"><ElButton text :icon="CirclePlus" :aria-label="`增加第${rowIndex + 1}条后的尺寸公式`" @click="condition.dimensionRules.rows.splice(rowIndex + 1, 0, 创建尺寸公式行())" /><ElButton text :icon="Remove" :disabled="condition.dimensionRules.rows.length === 1" :aria-label="`移除第${rowIndex + 1}条尺寸公式`" @click="condition.dimensionRules.rows.splice(rowIndex, 1)" /></div>
    </div>
  </div>
  <div v-else-if="condition.field === 'volume' && condition.volumeGroups" class="材积组列表">
    <div v-for="(group, groupIndex) in condition.volumeGroups" :key="groupIndex" class="材积组">
      <div class="材积主体">
        <div v-for="method in 材积方式" :key="method.value" class="材积计算行">
          <ElRadio :model-value="group.method" :value="method.value" :aria-label="`${组名(groupIndex)}${method.label}`" @update:model-value="group.method = method.value">{{ method.label }}</ElRadio>
          <div class="材积端点"><ElSelect v-model="group[method.value].minInclusive" :disabled="group.method !== method.value" :aria-label="`${组名(groupIndex)}${method.value}下限比较`"><ElOption label="大于" :value="false" /><ElOption label="大于等于" :value="true" /></ElSelect><ElInput v-model="group[method.value].min" :disabled="group.method !== method.value" :aria-label="`${组名(groupIndex)}${method.value}下限`" placeholder="请输入" inputmode="decimal"><template #append>cm³</template></ElInput></div>
          <div class="材积端点"><ElSelect v-model="group[method.value].maxInclusive" :disabled="group.method !== method.value" :aria-label="`${组名(groupIndex)}${method.value}上限比较`"><ElOption label="小于" :value="false" /><ElOption label="小于等于" :value="true" /></ElSelect><ElInput v-model="group[method.value].max" :disabled="group.method !== method.value" :aria-label="`${组名(groupIndex)}${method.value}上限`" placeholder="请输入" inputmode="decimal"><template #append>cm³</template></ElInput></div>
        </div>
        <div class="材积尺寸区"><span>材积的尺寸范围</span><div class="材积维度列表"><div v-for="dim in 维度" :key="dim.key" class="材积维度"><label>{{ dim.label }}:</label><ElInput v-model="group[dim.key].min" :aria-label="`${组名(groupIndex)}${dim.label}最小值`" placeholder="最小值" inputmode="decimal" /><span>～</span><ElInput v-model="group[dim.key].max" :aria-label="`${组名(groupIndex)}${dim.label}最大值`" placeholder="最大值" inputmode="decimal"><template #suffix>cm</template></ElInput><ElCheckbox v-model="group[dim.key].stack" :aria-label="`${组名(groupIndex)}${dim.label}叠加`">叠加</ElCheckbox></div><div class="叠加换算"><ElCheckbox v-model="group.convert" :aria-label="`${组名(groupIndex)}叠加换算`">叠加换算</ElCheckbox><SizeHelp type="convert" /></div></div></div>
      </div>
      <div class="尺寸增删"><ElButton text :icon="CirclePlus" :aria-label="`增加第${groupIndex + 1}组后的材积范围`" @click="condition.volumeGroups.splice(groupIndex + 1, 0, 创建材积组())" /><ElButton text :icon="Remove" :disabled="condition.volumeGroups.length === 1" :aria-label="`移除第${groupIndex + 1}组材积范围`" @click="condition.volumeGroups.splice(groupIndex, 1)" /></div>
    </div>
  </div>
  <div v-else class="旧尺寸配置"><span>原配置：{{ condition.operator }} {{ 格式化条件值(condition) || '未填写' }}</span><p>请核对原值，按新的{{ condition.field === 'volume' ? '材积计算方式' : '公式规则' }}重新配置。</p><ElButton size="small" @click="重新配置">重新配置</ElButton></div>
</template>

<style scoped>
.产品尺寸面板,.材积主体{padding:16px;background:#f7f8fb;border-radius:4px;min-width:0}.尺寸匹配{width:150px;margin-bottom:18px}.尺寸公式行{display:grid;grid-template-columns:minmax(150px,200px) minmax(170px,1fr) minmax(110px,160px) 58px;gap:10px;align-items:start;margin-bottom:18px}.尺寸公式行:last-child{margin-bottom:0}.公式输入{min-width:0}.公式错误{font-size:12px;color:var(--yy-danger);margin:6px 0 0;line-height:1.7}.尺寸增删{display:flex;align-items:center;padding-top:2px;gap:0}.尺寸增删 .el-button{width:28px;height:28px;padding:0;margin:0!important;color:#929cae}.尺寸增删 .el-button:disabled{color:#cbd0d8}.材积组列表{display:flex;flex-direction:column;gap:16px}.材积组{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:10px;align-items:start}.材积主体{padding:14px}.材积计算行{display:grid;grid-template-columns:180px minmax(170px,1fr) minmax(170px,1fr);align-items:center;gap:10px;margin-bottom:14px}.材积计算行>.el-radio{margin:0;min-width:0}.材积计算行 :deep(.el-radio__label){font-size:12px;padding-left:7px}.材积端点{display:flex;gap:8px;min-width:0}.材积端点>.el-select{width:100px;flex:0 0 100px}.材积端点>.el-input{min-width:85px;flex:1}.材积端点 :deep(.el-input-group__append){padding:0 8px;color:var(--yy-text-regular);background:white}.材积尺寸区{display:grid;grid-template-columns:140px minmax(0,1fr);gap:14px;margin:18px 0 0 24px;font-size:12px}.材积尺寸区>span{padding-top:8px}.材积维度列表{max-width:540px;min-width:0}.材积维度{display:grid;grid-template-columns:22px minmax(90px,1fr) 12px minmax(90px,1fr) 65px;gap:10px;align-items:center;margin-bottom:14px}.材积维度>.el-checkbox{margin:0}.材积维度 :deep(.el-checkbox__label){font-size:12px}.叠加换算{display:flex;align-items:center;margin-left:32px}.叠加换算>.el-checkbox{margin-right:3px}.旧尺寸配置{padding:16px;background:#fff8ee;color:#8b6b35;font-size:12px;line-height:1.8}.旧尺寸配置 p{margin:5px 0 10px}
@media(max-width:1450px){.材积计算行{grid-template-columns:175px minmax(0,1fr)}.材积计算行>.材积端点:last-child{grid-column:2}.材积尺寸区{grid-template-columns:110px minmax(0,1fr);gap:8px;margin-left:0}.尺寸公式行{grid-template-columns:190px minmax(0,1fr) 58px}.尺寸公式行>.el-input{grid-column:2;grid-row:2}.尺寸公式行>.尺寸增删{grid-column:3;grid-row:1}.材积端点>.el-input{max-width:210px}.材积端点>.el-select{width:112px;flex-basis:112px}}
@media(max-width:1100px){.尺寸公式行{grid-template-columns:minmax(0,1fr) 58px}.尺寸公式行>.el-select{grid-column:1}.尺寸公式行>.公式输入{grid-column:1;grid-row:2}.尺寸公式行>.el-input{grid-column:1;grid-row:3}.尺寸公式行>.尺寸增删{grid-column:2;grid-row:1}.材积计算行{grid-template-columns:minmax(0,1fr)}.材积计算行>.材积端点:last-child{grid-column:1}.材积尺寸区{grid-template-columns:minmax(0,1fr)}.材积维度{gap:6px;grid-template-columns:18px minmax(60px,1fr) 10px minmax(60px,1fr) 60px}}
</style>
