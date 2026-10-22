<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElFormItem, ElRadioGroup, ElRadio, ElSelect, ElOption, ElSwitch, ElInput, ElPopover, ElIcon, ElButton } from 'element-plus'
import { QuestionFilled, Plus, Delete } from '@element-plus/icons-vue'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 读取分仓策略, 校验分仓策略, 分仓仓库键, type 分仓路由动作, type 分仓策略配置 } from './规则路由'
import type { 订单规则 } from './规则逻辑'
import { 比价费用说明 } from './比价分仓'
import { 规则标注 } from './规则标注'
import { 比价币种选项 } from './比价币种'

const props = defineProps<{ rule: 订单规则; validate: boolean }>()
const emit = defineEmits<{ change: [] }>()
const 配置 = computed(() => 读取分仓策略(props.rule))
const 错误 = computed(() => props.validate ? 校验分仓策略(props.rule) : '')
const 帮助打开 = ref(false)
const 综合帮助打开 = ref(false)
const 仓库键 = 分仓仓库键
const 可用渠道 = computed(() => 渠道会话.value.filter(项 => 项.enabled && 项.labelMode === '仓库回传'))
const 仓库选项 = computed(() => [...new Map(可用渠道.value.map(项 => [仓库键(项), 项])).entries()])
const 选中仓库 = computed(() => props.rule.routeAction ? 仓库键(props.rule.routeAction) : '')
const 当前渠道 = computed(() => 可用渠道.value.filter(项 => 仓库键(项) === 选中仓库.value))
const 是比价 = computed(() => 配置.value.mode === 'price')
const 综合比较 = computed(() => 配置.value.priceComparison === 'priceAge')
const 综合判断 = computed(() => 配置.value.priceAgeLogic ?? 'priceGap')
const 候选路由 = computed(() => 是比价.value ? (配置.value.priceRoutes ??= []) : (配置.value.ageRoutes ??= []))
function 选择仓库(value: string) {
  if (value === 选中仓库.value) return
  const source = 可用渠道.value.find(项 => 仓库键(项) === value)
  props.rule.routeAction = source ? { providerId: source.providerId, accountId: source.accountId, warehouseId: source.warehouseId, channelId: '' } : undefined
  props.rule.action = source?.warehouse || ''
  emit('change')
}
function 选择渠道(value: string) { if (props.rule.routeAction) props.rule.routeAction.channelId = value; emit('change') }
function 空候选(): 分仓路由动作 { return { providerId: '', accountId: '', warehouseId: '', channelId: '' } }
function 切换模式(value: string | number | boolean | undefined) {
  if (value !== 'basic' && value !== 'age' && value !== 'price') return
  配置.value.mode = value as 分仓策略配置['mode']
  if (value === 'age' && !配置.value.ageRoutes?.length) 配置.value.ageRoutes = [props.rule.routeAction ? { ...props.rule.routeAction } : 空候选()]
  if (value === 'price' && !配置.value.priceRoutes?.length) 配置.value.priceRoutes = [props.rule.routeAction ? { ...props.rule.routeAction } : 空候选()]
  emit('change')
}
function 切换比较(value: string | number | boolean | undefined) {
  if (value !== 'lowest' && value !== 'priceAge') return
  配置.value.priceComparison = value
  if (value === 'priceAge' && 配置.value.agePreference === undefined) 配置.value.agePreference = 'recent'
  emit('change')
}
function 切换综合判断(value: string | number | boolean | undefined) {
  if (value !== 'priceGap' && value !== 'ageGap') return
  配置.value.priceAgeLogic = value
  emit('change')
}
function 候选仓库值(项: 分仓路由动作) { return 项.warehouseId ? 仓库键(项) : '' }
function 候选渠道(项: 分仓路由动作) { return 可用渠道.value.filter(条 => 仓库键(条) === 仓库键(项)) }
function 仓库已选(key: string, index: number) { return !是比价.value && 候选路由.value.some((项, i) => i !== index && 候选仓库值(项) === key) }
function 选择候选仓库(index: number, key: string) {
  const 当前 = 候选路由.value[index]
  if (!当前 || key === 候选仓库值(当前) || 仓库已选(key, index)) return
  const 项 = 可用渠道.value.find(条 => 仓库键(条) === key)
  候选路由.value[index] = 项 ? { providerId: 项.providerId, accountId: 项.accountId, warehouseId: 项.warehouseId, channelId: '' } : 空候选()
  emit('change')
}
</script>

<template>
  <div class="分仓动作配置">
    <ElFormItem label="分仓模式" required>
      <ElRadioGroup :model-value="配置.mode" aria-label="分仓模式" class="分仓模式选项" @update:model-value="切换模式">
        <ElRadio value="basic">基础</ElRadio>
        <ElRadio value="price">比价分仓</ElRadio>
        <ElRadio value="age">库龄分仓（优先分配库龄较大者）</ElRadio>
      </ElRadioGroup>
    </ElFormItem>
    <div class="分仓执行面板">
    <div v-if="配置.mode === 'age' || 是比价" class="库龄分仓面板" :class="{ 比价分仓面板: 是比价 }">
      <template v-if="是比价">
        <p class="库龄匹配说明">对所选仓库及物流渠道逐一试算，按比较逻辑匹配仓库及渠道；同一仓库可配置不同渠道。</p>
        <p class="比价费用说明" v-prototype="规则标注('price', '比价分仓与总费用口径')">{{ 比价费用说明 }}</p>
        <div class="比价比较配置" v-prototype="规则标注('price-comparison', '比价比较逻辑与库龄口径')">
          <ElFormItem label="比较逻辑" required>
            <ElRadioGroup :model-value="配置.priceComparison ?? 'lowest'" aria-label="比较逻辑" @update:model-value="切换比较">
              <ElRadio value="lowest">取价格最低</ElRadio>
              <div class="综合比较选项">
                <ElRadio value="priceAge">价格与库龄综合</ElRadio>
                <ElPopover v-model:visible="综合帮助打开" trigger="hover" placement="top-start" :width="620" :show-after="150" :popper-style="{ maxWidth: 'calc(100vw - 36px)' }">
                  <template #reference><button type="button" class="库存问号 综合问号" aria-label="价格与库龄综合说明" :aria-expanded="综合帮助打开" v-prototype="规则标注('price-age-help', '价格与库龄综合业务说明')" @click="综合帮助打开 = true" @focus="综合帮助打开 = true" @keydown.esc.stop.prevent="综合帮助打开 = false"><ElIcon><QuestionFilled /></ElIcon></button></template>
                  <div class="综合帮助正文" aria-label="价格与库龄综合帮助内容" @keydown.esc.stop.prevent="综合帮助打开 = false">
                    <h4>一票一件与一票多件</h4>
                    <p>一票一件订单，优先比较对应产品的库龄。</p>
                    <p>一票多件订单，多个仓库满足条件时，将各 SKU 的库龄累加，优先取整单库龄合计较高的仓库。同一 SKU 不按件数重复累加。</p>
                    <h4>最近批次与全批次</h4>
                    <p>最近批次：比较各 SKU 最近有货批次的库龄。全批次：比较各 SKU 所有有货批次中的最大库龄。</p>
                    <table><caption>库龄口径示例</caption><thead><tr><th>SKU</th><th>仓库</th><th>库龄（批次）</th><th>库龄（批次）</th></tr></thead><tbody><tr><td>a1</td><td>001</td><td>30 天（2025-06-03 批次）</td><td>60 天（2025-05-03 批次）</td></tr><tr><td>a2</td><td>002</td><td>33 天（2025-06-01 批次）</td><td>53 天（2025-05-10 批次）</td></tr></tbody></table>
                    <p>选择“库龄高（最近批次）”时，比较 30 天与 33 天，选择仓库 002。</p>
                    <p>选择“库龄高（全批次）”时，比较 60 天与 53 天，选择仓库 001。</p>
                  </div>
                </ElPopover>
              </div>
            </ElRadioGroup>
          </ElFormItem>
          <div v-if="综合比较" class="综合阈值配置">
            <ElRadioGroup :model-value="综合判断" aria-label="综合判断逻辑" class="综合判断选项" @update:model-value="切换综合判断">
              <div class="综合条件句" :class="{ 未选中: 综合判断 !== 'priceGap' }"><ElRadio value="priceGap" aria-label="价格差额优先逻辑">当价格相差不到</ElRadio><ElInput v-model="配置.priceDifference" :disabled="综合判断 !== 'priceGap'" aria-label="价格差额" placeholder="填写金额" maxlength="25" inputmode="decimal" @input="emit('change')" /><ElSelect v-model="配置.priceDifferenceCurrency" class="价差币种选择" :disabled="综合判断 !== 'priceGap'" aria-label="价格差额币种" placeholder="选择币种" filterable clearable @change="emit('change')"><ElOption v-for="币种 in 比价币种选项" :key="币种.value" :label="币种.label" :value="币种.value" /></ElSelect><span>时，优先库龄高，否则优先价格低</span></div>
              <div class="综合条件句" :class="{ 未选中: 综合判断 !== 'ageGap' }"><ElRadio value="ageGap" aria-label="库龄差额优先逻辑">当库龄相差不到</ElRadio><ElInput v-model="配置.ageDifferenceDays" :disabled="综合判断 !== 'ageGap'" aria-label="库龄差额天数" placeholder="填写天数" maxlength="24" inputmode="numeric" @input="emit('change')" /><span>天时，优先价格低，否则优先库龄高</span></div>
            </ElRadioGroup>
            <ElFormItem label="库龄口径" required class="综合库龄口径"><ElSelect v-model="配置.agePreference" aria-label="库龄优先口径" placeholder="请选择" @change="emit('change')"><ElOption label="库龄高（最近批次）" value="recent" /><ElOption label="库龄高（全批次）" value="all" /></ElSelect></ElFormItem>
          </div>
          <p v-else class="综合口径说明">按接口试算总费用从低到高比较，优先匹配价格最低的仓库及渠道。</p>
        </div>
      </template>
      <template v-else>
        <p class="库龄匹配说明">按所选批次口径取得订单各 SKU 的库龄，订单包含多个 SKU 时累加比较，优先分配库龄较高的仓库。</p>
        <ElFormItem label="库龄口径" required class="库龄口径选择"><ElSelect :model-value="配置.ageBatchPreference ?? 'all'" aria-label="库龄分仓批次口径" @update:model-value="配置.ageBatchPreference = $event; emit('change')"><ElOption label="库龄高（最近批次）" value="recent" /><ElOption label="库龄高（全批次）" value="all" /></ElSelect></ElFormItem>
        <p class="综合口径说明 库龄口径说明">{{ 配置.ageBatchPreference === 'recent' ? '最近批次：每个 SKU 取最近有货批次的库龄。' : '全批次：每个 SKU 取所有有货批次中的最大库龄。' }}多个 SKU 按各自库龄相加后比较。</p>
      </template>
      <div class="库龄候选标题"><strong>发货仓库及物流渠道</strong><span>{{ 是比价 ? '可选择多个仓库及渠道组合' : '可选择多个仓库' }}</span></div>
      <div v-for="(项, index) in 候选路由" :key="index" class="库龄候选行">
        <span class="库龄候选序号">{{ String(index + 1).padStart(2, '0') }}</span>
        <ElFormItem label="发货仓库" required><ElSelect :model-value="候选仓库值(项)" :aria-label="`第${index + 1}个候选发货仓库`" placeholder="请选择发货仓库" filterable @update:model-value="选择候选仓库(index, $event)"><ElOption v-if="候选仓库值(项) && !仓库选项.some(([key]) => key === 候选仓库值(项))" :value="候选仓库值(项)" label="当前仓库不可用，请重新选择" disabled /><ElOption v-for="[key, 仓] in 仓库选项" :key="key" :label="`${仓.warehouse} · ${仓.provider} · ${仓.account}`" :value="key" :disabled="仓库已选(key, index)" /></ElSelect></ElFormItem>
        <ElFormItem label="物流渠道" required><ElSelect v-model="项.channelId" :aria-label="`第${index + 1}个候选物流渠道`" :disabled="!项.warehouseId" :placeholder="项.warehouseId ? '请选择物流渠道' : '请先选择发货仓库'" filterable @change="emit('change')"><ElOption v-if="项.channelId && !候选渠道(项).some(条 => 条.id === 项.channelId)" :value="项.channelId" label="当前渠道不可用，请重新选择" disabled /><ElOption v-for="渠道 in 候选渠道(项)" :key="渠道.id" :value="渠道.id" :label="`${渠道.name}（${渠道.code}）`" /></ElSelect></ElFormItem>
        <ElButton text :icon="Delete" :aria-label="`删除第${index + 1}个候选仓库`" @click="候选路由.splice(index, 1); emit('change')" />
      </div>
      <ElButton link type="primary" :icon="Plus" @click="候选路由.push(空候选()); emit('change')">{{ 是比价 ? '添加候选组合' : '添加发货仓库' }}</ElButton>
      <p v-if="是比价 && 综合比较" class="库龄来源说明">报价或价差阈值币种不一致时，按汇率统一换算为人民币后比较。</p>
      <p class="库龄来源说明">{{ 是比价 ? (综合比较 ? '仅所选逻辑参与比较；相差不到不包含等于阈值。库龄取自三方仓库龄资料。' : '总费用相同时按候选顺序优先匹配。不同币种报价按汇率换算为人民币后比较。') : '库龄取自三方仓库龄资料；库龄相同时按所选仓库顺序优先匹配。' }}</p>
    </div>
    <div v-else class="基础分仓面板">
      <ElFormItem label="发货仓库" required><ElSelect :model-value="选中仓库" aria-label="发货仓库" placeholder="请选择发货仓库" filterable @update:model-value="选择仓库"><ElOption v-if="选中仓库 && !仓库选项.some(([key]) => key === 选中仓库)" :value="选中仓库" label="当前仓库不可用，请重新选择" disabled /><ElOption v-for="[key, 项] in 仓库选项" :key="key" :label="`${项.warehouse} · ${项.provider} · ${项.account}`" :value="key" /></ElSelect></ElFormItem>
      <ElFormItem label="物流渠道" required><ElSelect :model-value="rule.routeAction?.channelId || ''" :disabled="!选中仓库" :placeholder="选中仓库 ? '请选择物流渠道' : '请先选择发货仓库'" aria-label="物流渠道" filterable @update:model-value="选择渠道"><ElOption v-if="rule.routeAction?.channelId && !当前渠道.some(项 => 项.id === rule.routeAction?.channelId)" :value="rule.routeAction.channelId" label="当前渠道不可用，请重新选择" disabled /><ElOption v-for="项 in 当前渠道" :key="项.id" :value="项.id" :label="`${项.name}（${项.code}）`" /></ElSelect></ElFormItem>
    </div>
    <div class="分仓库存检测">
      <div class="库存检测标题"><span>是否检测库存</span>
        <ElPopover v-model:visible="帮助打开" trigger="hover" placement="top-start" :width="760" :show-after="150" :popper-style="{ maxWidth: 'calc(100vw - 36px)' }">
          <template #reference><button type="button" class="库存问号" aria-label="剩余库存检测说明" @click="帮助打开 = true" @focus="帮助打开 = true" @keydown.esc.stop.prevent="帮助打开 = false"><ElIcon><QuestionFilled /></ElIcon></button></template>
          <div class="库存帮助正文" aria-label="剩余库存检测帮助内容"><p>开启后，当订单分入某个仓库时，系统会计算分仓后的剩余可用库存。若库存值满足您设置的条件，则本规则生效，系统将跳过该仓库。</p><p class="库存公式">剩余可用库存 = 仓库总库存 - 所有已被订单锁定的库存（包含当前正尝试分仓的订单数量）</p><table><thead><tr><th>规则条件</th><th>仓库库存</th><th>订单需求</th><th>计算过程</th><th>校验结果</th></tr></thead><tbody><tr><td>剩余库存 &lt; 5 时，跳过该仓库</td><td>深圳仓：10个</td><td>分配9个</td><td>10-9=1（&lt;5）</td><td>规则生效，跳过深圳仓</td></tr></tbody></table></div>
        </ElPopover>
        <ElSwitch v-model="配置.checkRemainingStock" aria-label="是否检测库存" />
      </div>
      <div class="库存阈值行"><span>分仓后，仓库剩余库存小于</span><ElInput v-model="配置.minimumRemainingStock" aria-label="剩余库存阈值" :disabled="!配置.checkRemainingStock" maxlength="24" inputmode="numeric" placeholder="非负整数" /><span>则跳过该仓库</span></div>
      <p v-if="配置.mode === 'age'" class="库龄库存说明">开启后，跳过剩余库存不满足要求的仓库，再按库龄优先匹配。</p>
      <p v-if="是比价" class="库龄库存说明">开启后，跳过剩余库存不满足要求的仓库，再按所选比较逻辑匹配。</p>
    </div>
    </div>
    <p v-if="错误" class="分仓校验错误" role="alert">{{ 错误 }}</p>
  </div>
</template>

<style scoped>
.分仓模式选项{display:flex;flex-wrap:wrap;gap:4px 24px}.分仓模式选项 .el-radio{margin:0;max-width:100%;height:auto;min-height:30px}.分仓模式选项 :deep(.el-radio__label){white-space:normal;line-height:1.7;font-size:13px}.分仓动作配置 :deep(.el-form-item__label){font-size:12px}.基础分仓面板{padding:18px 20px;background:#fafbfc;border:1px solid var(--yy-border-light);border-radius:4px}.库存检测标题{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--yy-text-heading)}.库存检测标题>.el-switch{margin-left:12px}.库存阈值行{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:12px;line-height:1.8}.库存阈值行>.el-input{width:120px}.库存阈值行>span{white-space:nowrap}.库存问号{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;background:none;color:#9ca4af;cursor:help;padding:0;border-radius:3px}.库存问号:hover,.库存问号:focus-visible{color:var(--yy-primary)}.库存问号:focus-visible{outline:1px solid var(--yy-primary)}.库存帮助正文{max-height:65vh;overflow:auto;font-size:12px;line-height:1.9;color:var(--yy-text-regular);overflow-wrap:anywhere}.库存帮助正文 p{margin:0 0 12px}.库存公式{color:var(--yy-text-heading)}.库存帮助正文 table{border-collapse:collapse;width:100%;line-height:1.7}.库存帮助正文 th,.库存帮助正文 td{border:1px solid var(--yy-border);padding:8px 10px;text-align:left}.库存帮助正文 th{background:#f7f9fc;font-weight:500;color:var(--yy-text-heading)}.分仓校验错误{margin:12px 0 0;color:var(--yy-danger);font-size:12px;line-height:1.8}
</style>

<style scoped>
.分仓执行面板{padding:18px 20px;background:#fafbfc;border:1px solid var(--yy-border-light);border-radius:4px}.分仓执行面板>.基础分仓面板,.分仓执行面板>.库龄分仓面板{padding:0;border:0;background:none}.库龄分仓面板+.分仓库存检测{margin-top:20px;padding-top:18px;border-top:1px solid var(--yy-border-light)}.库龄库存说明{margin:10px 0 0;color:var(--yy-text-secondary);font-size:12px;line-height:1.8}
</style>

<style scoped>
.库龄分仓面板{padding:18px 20px;background:#fafbfc;border:1px solid var(--yy-border-light);border-radius:4px}.库龄匹配说明{font-size:12px;line-height:1.9;color:var(--yy-text-regular);margin:0 0 20px}.库龄候选标题{display:flex;align-items:center;gap:12px;margin-bottom:14px;font-size:12px}.库龄候选标题 strong{font-weight:500;color:var(--yy-text-heading)}.库龄候选标题 span,.库龄来源说明{font-size:12px;color:var(--yy-text-secondary)}.库龄候选行{display:grid;grid-template-columns:22px minmax(0,1.3fr) minmax(0,1fr) 32px;gap:10px;align-items:start}.库龄候选行>.el-form-item{min-width:0;margin-bottom:16px}.库龄候选行>.el-button{margin:28px 0 0}.库龄候选序号{padding-top:35px;color:var(--yy-text-secondary);font-size:11px}.库龄来源说明{line-height:1.8;margin:16px 0 0}
.比价费用说明{font-size:12px;line-height:1.9;color:var(--yy-text-regular);background:#fff8eb;border-left:3px solid #e6a23c;padding:10px 12px;margin:-6px 0 20px;overflow-wrap:anywhere}
.综合比较选项{display:inline-flex;align-items:center;gap:4px}.综合比较选项>.el-radio{margin-right:0}.综合问号{flex-shrink:0;font-size:14px}.综合判断选项{display:flex;flex-direction:column;align-items:stretch;width:100%}.综合条件句>.el-radio{margin:0;height:auto;min-height:32px}.综合条件句 :deep(.el-radio__label){font-size:12px;white-space:normal;line-height:1.8}.综合条件句.未选中{color:var(--yy-text-secondary)}.综合库龄口径{display:flex;flex-direction:row;align-items:center;gap:8px;margin:16px 0 0}.综合库龄口径 :deep(.el-form-item__label){margin:0;padding:0;height:auto;line-height:32px}.综合库龄口径 :deep(.el-form-item__content){flex:0 0 210px;max-width:210px}.综合帮助正文{max-height:65vh;overflow:auto;font-size:12px;line-height:1.9;color:var(--yy-text-regular);overflow-wrap:anywhere}.综合帮助正文 h4{font-size:13px;color:var(--yy-text-heading);margin:0 0 8px}.综合帮助正文 h4:not(:first-child){margin-top:16px}.综合帮助正文 p{margin:8px 0}.综合帮助正文 table{width:100%;border-collapse:collapse;margin:10px 0}.综合帮助正文 caption{text-align:left;color:var(--yy-text-secondary);font-size:12px;margin-bottom:6px}.综合帮助正文 th,.综合帮助正文 td{border:1px solid var(--yy-border);padding:7px 8px;text-align:left}.综合帮助正文 th{color:var(--yy-text-heading);background:#f7f9fc;font-weight:500}
.库龄口径选择{max-width:260px;margin-bottom:0}.库龄口径说明{margin-bottom:24px}
.比价比较配置{margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid var(--yy-border-light)}.比价比较配置>.el-form-item{margin-bottom:12px}.综合阈值配置{padding:16px;background:#fff;border:1px solid var(--yy-border-light);border-radius:4px}.综合条件句{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;line-height:1.8;color:var(--yy-text-regular)}.综合条件句+.综合条件句{margin-top:14px}.综合条件句>.el-input{width:120px;flex:0 0 120px}.综合条件句>.el-select{width:210px;flex:0 0 210px}.综合条件句>.价差币种选择{width:168px;flex:0 0 168px}.阈值币种{color:var(--yy-text-secondary);font-size:12px}.综合口径说明{font-size:12px;line-height:1.9;color:var(--yy-text-secondary);margin:12px 0 0}
@media(max-width:1350px){.库龄候选行{grid-template-columns:22px minmax(0,1fr) 32px}.库龄候选行>.el-form-item:nth-child(3){grid-column:2;grid-row:2}.库龄候选行>.el-button{grid-column:3;grid-row:1}.库龄候选行{border-bottom:1px dashed var(--yy-border-light);margin-bottom:16px}}
</style>
