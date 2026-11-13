<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElButton, ElCheckbox, ElFormItem, ElInput, ElInputNumber, ElOption, ElRadio, ElRadioGroup, ElSelect, ElTag } from 'element-plus'
import type { 订单规则 } from './规则逻辑'
import { 创建默认拆单动作, 校验拆单动作, type 拆单动作配置, type 拆单方式 } from './拆单规则模型'
import { 拆单标注 } from './拆单规则标注'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 读取拆单平台SKU选项, 保留拆单平台SKU旧值, 校验拆单平台SKU选择 } from './拆单平台SKU'
import SplitExample from './拆单方式示例.vue'

const props = defineProps<{ rule: 订单规则; orders: 全渠道订单[]; validate?: boolean }>()
if (!props.rule.splitAction) props.rule.splitAction = 创建默认拆单动作()
const action = computed(() => props.rule.splitAction!)
const 错误 = computed(() => props.validate || !['system', 'platform'].includes(action.value.basis) || !方式.value.some(item => item.value === action.value.strategy) ? 校验拆单动作(action.value) || 校验拆单平台SKU选择(action.value, props.orders) : '')
const 平台SKU选项 = computed(() => 读取拆单平台SKU选项(props.orders))
const 指定平台SKU选项 = computed(() => 保留拆单平台SKU旧值(平台SKU选项.value, action.value.selectedSkus))
const 混装平台SKU选项 = computed(() => 保留拆单平台SKU旧值(平台SKU选项.value, action.value.mixing.skus))
const 指定不可用 = computed(() => 指定平台SKU选项.value.some(item => item.disabled))
const 混装不可用 = computed(() => 混装平台SKU选项.value.some(item => item.disabled))
function 移除不可用(scope: 'selected' | 'mixing') {
  const available = new Set(平台SKU选项.value.map(item => item.value))
  if (scope === 'selected') action.value.selectedSkus = action.value.selectedSkus.filter(value => available.has(value))
  else action.value.mixing.skus = action.value.mixing.skus.filter(value => available.has(value))
}
const selectedText = computed({ get: () => action.value.selectedSkus.join('\n'), set: (text: string) => { action.value.selectedSkus = text.split(/\r?\n/) } })
const mixingText = computed({ get: () => action.value.mixing.skus.join('\n'), set: (text: string) => { action.value.mixing.skus = text.split(/\r?\n/) } })
const basisLabel = computed(() => ({ platform: '平台 SKU', system: '系统 SKU', warehouse: '原仓库 SKU（已移除）' })[action.value.basis])
const 方式 = computed<{ value: 拆单方式; label: string; description: string }[]>(() => [
  { value: 'unit', label: '每件产品拆为一包', description: '每包只放一件商品' },
  { value: 'sku', label: '一种 SKU 拆为一包', description: '相同 SKU 放在同一包' },
  { value: 'selected', label: '指定 SKU 合为一包', description: '所选商品一起发，其余商品另成一包' },
  { value: 'selectedQty', label: '指定 SKU 按件数分包', description: '每个所选 SKU 分别按数量拆分' },
  { value: 'capacity', label: '智能分包', description: '结合容量、尺寸和混装条件分包' },
])
type LimitKey = 'maxWeightKg' | 'maxVolumeCm3' | 'maxAmount' | 'maxLongestDifferenceCm'
const 限制项: { key: LimitKey; label: string; unit: string; value: string }[] = [
  { key: 'maxWeightKg', label: '每包最大重量', unit: 'kg', value: '20' },
  { key: 'maxVolumeCm3', label: '每包最大商品体积', unit: 'cm³', value: '100000' },
  { key: 'maxAmount', label: '每包最大商品金额', unit: '', value: '500' },
  { key: 'maxLongestDifferenceCm', label: '商品最长边最大差值', unit: 'cm', value: '30' },
]
function 开关限制(key: LimitKey, enabled: boolean, value: string) { if (enabled) action.value.limits[key] = value; else delete action.value.limits[key] }
function 件数限制(enabled: boolean) { if (enabled) action.value.limits.maxQuantity = 5; else delete action.value.limits.maxQuantity }
function 修改混装(mode: 拆单动作配置['mixing']['mode']) { action.value.mixing.mode = mode }
</script>

<template>
  <div class="拆单动作" v-prototype="拆单标注('action', '拆单依据与方式')">
    <ElFormItem label="拆分依据" required>
      <ElRadioGroup v-model="action.basis" aria-label="拆分依据">
        <ElRadio value="system">按系统 SKU</ElRadio><ElRadio value="platform">按平台 SKU</ElRadio>
      </ElRadioGroup>
      <p v-if="action.basis === 'warehouse'" class="拆单旧依据提示" role="alert">原拆分依据“按仓库 SKU”已移除。请明确选择按系统 SKU 或按平台 SKU，并核对指定 SKU 配置。</p>
    </ElFormItem>
    <ElFormItem label="拆分方式" required>
      <ElRadioGroup v-model="action.strategy" aria-label="拆分方式" class="拆单方式网格">
        <div v-for="item in 方式" :key="item.value" class="拆单方式卡 含拆法示例"><ElRadio :value="item.value" border><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span></ElRadio><SplitExample :type="item.value" /></div>
      </ElRadioGroup>
    </ElFormItem>
    <section v-if="action.strategy === 'selected' || action.strategy === 'selectedQty'" class="拆单参数区">
      <ElFormItem :label="`指定${basisLabel}`" required><ElSelect v-if="action.basis === 'platform'" v-model="action.selectedSkus" multiple filterable placeholder="搜索平台 SKU 或商品名称" aria-label="指定平台 SKU" class="拆单宽选项"><ElOption v-for="item in 指定平台SKU选项" :key="item.value" :value="item.value" :label="item.label" :disabled="item.disabled" /></ElSelect><ElInput v-else v-model="selectedText" type="textarea" :rows="3" :placeholder="`每行填写一个${basisLabel}`" :aria-label="`指定${basisLabel}`" /><ElButton v-if="action.basis === 'platform' && 指定不可用" link type="warning" class="不可用SKU操作" @click="移除不可用('selected')">移除不可用 SKU</ElButton><p class="拆单帮助">按完整编码匹配，未选中的商品放入其余包裹。</p></ElFormItem>
      <ElFormItem v-if="action.strategy === 'selectedQty'" label="每个指定 SKU 每包最多件数" required><ElInputNumber v-model="action.quantityPerPackage" :min="1" :max="2000" :precision="0" controls-position="right" aria-label="每包最多件数" /><span class="拆单单位">件</span></ElFormItem>
    </section>
    <section v-if="action.strategy === 'capacity'" class="拆单参数区" v-prototype="拆单标注('capacity', '包裹容量和混装要求')">
      <div class="拆单容量布局"><div class="拆单容量限制">
      <h4>包裹限制 <span>各项已开启限制同时满足，边界值可用</span></h4>
      <div class="拆单容量输入行"><ElCheckbox :model-value="action.limits.maxQuantity !== undefined" @change="件数限制(Boolean($event))">每包最多件数</ElCheckbox><ElInputNumber v-model="action.limits.maxQuantity" :disabled="action.limits.maxQuantity === undefined" :min="1" :max="2000" :precision="0" controls-position="right" aria-label="智能分包最多件数" /><span>件</span></div>
      <div v-for="item in 限制项" :key="item.key" class="拆单容量输入行"><ElCheckbox :model-value="action.limits[item.key] !== undefined" @change="开关限制(item.key, Boolean($event), item.value)">{{ item.label }}</ElCheckbox><ElInput v-model="action.limits[item.key]" :disabled="action.limits[item.key] === undefined" :aria-label="item.label" placeholder="输入上限" /><ElSelect v-if="item.key === 'maxAmount'" v-model="action.limits.currency" aria-label="包裹金额币种" :disabled="action.limits.maxAmount === undefined"><ElOption v-for="currency in ['USD', 'CNY', 'EUR', 'GBP', 'CAD', 'JPY']" :key="currency" :value="currency" :label="currency" /></ElSelect><span v-else>{{ item.unit }}</span></div>
      <p class="拆单帮助">重量和体积使用商品资料；商品体积限制不等于包装外箱尺寸。</p>
      </div><div class="拆单容量混装">
      <h4 class="混装小标题">混装要求</h4>
      <ElSelect :model-value="action.mixing.mode" @update:model-value="修改混装" aria-label="混装要求" class="拆单宽选项"><ElOption label="允许混装" value="free" /><ElOption label="指定 SKU 与其他商品分开发" value="separateSelected" /><ElOption label="指定 SKU 必须放在同一包" value="togetherSelected" /><ElOption label="特殊属性商品与普通商品分开发" value="separateAttributes" /></ElSelect>
      <template v-if="['separateSelected','togetherSelected'].includes(action.mixing.mode)"><ElSelect v-if="action.basis === 'platform'" v-model="action.mixing.skus" multiple filterable placeholder="搜索平台 SKU 或商品名称" aria-label="混装指定平台 SKU" class="混装输入 拆单宽选项"><ElOption v-for="item in 混装平台SKU选项" :key="item.value" :value="item.value" :label="item.label" :disabled="item.disabled" /></ElSelect><ElInput v-else v-model="mixingText" type="textarea" :rows="3" :placeholder="`每行填写一个${basisLabel}`" aria-label="混装指定SKU" class="混装输入" /><ElButton v-if="action.basis === 'platform' && 混装不可用" link type="warning" class="不可用SKU操作" @click="移除不可用('mixing')">移除不可用 SKU</ElButton></template>
      <ElSelect v-if="action.mixing.mode === 'separateAttributes'" v-model="action.mixing.attributes" multiple filterable allow-create default-first-option placeholder="选择或输入特殊属性" aria-label="拆单特殊属性" class="混装输入 拆单宽选项"><ElOption v-for="attribute in ['带电', '液体', '易碎', '磁性', '粉末']" :key="attribute" :value="attribute" :label="attribute" /></ElSelect>
      </div></div>
    </section>
    <section class="拆单后续分区" v-prototype="拆单标注('continuation', '后续规则匹配')"><ElCheckbox v-model="action.continueMatching" aria-label="继续匹配后续拆单规则">本规则执行后，继续匹配后续拆单规则</ElCheckbox><p class="拆单帮助">未勾选：本规则命中并执行成功后，不再匹配后续拆单规则，继续后续订单处理流程。</p><p class="拆单帮助">已勾选：本规则处理后的每个包裹分别匹配后续拆单规则；后续规则只能继续细分各自包裹，不能跨包合并。</p><p class="拆单帮助">本规则未命中时，仍会继续匹配下一条拆单规则。</p></section>
    <ElAlert v-if="错误" :title="错误" type="error" :closable="false" show-icon class="拆单配置错误" />
    <div class="拆单流程"><ElTag size="small" effect="plain">实际拆分后</ElTag><span>跳过合单 → 逐包分仓 → 审单 → 系统默认审单</span></div>
  </div>
</template>

<style scoped>
.拆单动作{font-size:13px;min-width:0}.拆单动作 :deep(.el-form-item){margin-bottom:20px}.拆单动作 :deep(.el-form-item__content){min-width:0}.拆单宽选项{width:100%}.拆单帮助{font-size:12px;line-height:1.8;color:var(--yy-text-secondary);margin:8px 0 0;width:100%}.拆单方式网格{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%}.拆单方式网格 .el-radio{height:auto;min-height:66px;margin:0!important;padding:12px;align-items:flex-start;max-width:100%}.拆单方式网格 :deep(.el-radio__input){margin-top:3px}.拆单方式网格 :deep(.el-radio__label){white-space:normal;min-width:0;padding-left:9px}.拆单方式网格 strong{display:block;font-weight:500;font-size:13px;line-height:1.6}.拆单方式网格 small{display:block;color:var(--yy-text-secondary);font-size:12px;line-height:1.6;margin-top:3px}.拆单参数区{padding:18px;background:#f8fafc;border:1px solid var(--yy-border-light);border-radius:5px;margin-bottom:22px}.拆单参数区 h4,.拆单后续分区 h4{margin:0 0 14px;font-size:13px;color:var(--yy-text-heading);line-height:1.8}.拆单参数区 h4>span{display:block;font-weight:400;font-size:12px;color:var(--yy-text-secondary)}.拆单参数区 :deep(.el-form-item:last-child){margin-bottom:0}.拆单单位{margin-left:10px;color:var(--yy-text-secondary)}.拆单参数区 .混装小标题{margin-top:22px}.混装输入{margin-top:12px}.拆单后续分区{padding:18px 0;border-top:1px solid var(--yy-border-light)}.拆单配置错误{margin:8px 0 16px}.拆单流程{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#f5f8fd;padding:12px;border-radius:4px;color:var(--yy-text-secondary);font-size:12px;line-height:1.8}@media(max-width:1350px){.拆单方式网格{gap:8px}.拆单参数区{padding:14px}}
.不可用SKU操作{margin:8px 0 0;display:flex;font-size:12px}
.拆单旧依据提示{width:100%;font-size:12px;line-height:1.8;margin:8px 0 0;color:var(--yy-danger)}
.拆单方式卡{position:relative;min-width:0}.拆单方式卡>.el-radio{width:100%;min-height:72px}.拆单方式卡.含拆法示例 :deep(.el-radio__label){padding-right:68px}.拆单方式卡 :deep(.拆法示例入口){position:absolute;right:12px;top:10px}.拆单容量布局{display:grid;grid-template-columns:minmax(490px,550px) minmax(240px,1fr);gap:28px}.拆单容量限制,.拆单容量混装{min-width:0}.拆单容量输入行{display:grid;grid-template-columns:190px 160px 106px;gap:10px;align-items:center;margin:10px 0;width:476px;max-width:100%}.拆单容量输入行>.el-checkbox{margin-right:0;min-width:0}.拆单容量输入行 :deep(.el-checkbox__label){font-size:12px}.拆单容量输入行>.el-input-number,.拆单容量输入行>.el-input,.拆单容量输入行>.el-select{width:100%;min-width:0}.拆单容量输入行>span{font-size:12px;color:var(--yy-text-secondary)}.拆单容量输入行 :deep(.el-select__selection){min-width:3em}.拆单容量混装 .混装小标题{margin-top:0}.拆单容量混装{border-left:1px solid var(--yy-border-light);padding-left:24px}.拆单后续分区{padding:14px 0}.拆单动作 :deep(.el-form-item){margin-bottom:16px}
@media(max-width:1600px){.拆单容量布局{grid-template-columns:minmax(0,1fr);gap:22px}.拆单容量混装{border-left:0;border-top:1px solid var(--yy-border-light);padding:18px 0 0;max-width:680px}.拆单容量限制{max-width:680px}.拆单容量输入行{grid-template-columns:190px 160px 106px}}
@media(max-width:1100px){.拆单方式网格{grid-template-columns:minmax(0,1fr)}.拆单容量输入行{grid-template-columns:minmax(160px,1fr) 132px 100px;width:100%}}
</style>
