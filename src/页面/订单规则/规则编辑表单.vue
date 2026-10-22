<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElButton, ElInput, ElForm, ElFormItem, ElSelect, ElOption, ElCheckbox, ElRadioGroup, ElRadio, ElTag, ElIcon } from 'element-plus'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 条件字段名, 规则动作, eBay平台订单状态选项, 校验规则配置, type 订单规则, type 条件字段 } from './规则逻辑'
import { 规则标注 } from './规则标注'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 读取可选条件分组, 条件定义, 条件操作符, 创建空条件, 是否多选条件字段, 是否多行文本字段, 是否已移除条件, 格式化条件值, 读取条件多选值 } from './规则条件定义'
import ConditionValue from './规则条件输入.vue'
import SizeHelp from './尺寸材积帮助.vue'
import ShippingAction from './标发动作输入.vue'
import WarehouseAction from './分仓动作输入.vue'
import { 初始化分仓策略, 校验分仓策略, 读取分仓路由 } from './规则路由'
import { 初始化标发动作, 校验标发动作 } from './标发动作'
import { 规则基础选项, 中台系统用户资料 } from './规则基础选项'
import { 订单备注字数上限 } from '../订单处理/订单备注模型'

const props = defineProps<{ draft: 订单规则; rules: 订单规则[]; orders: 全渠道订单[] }>()
const emit = defineEmits<{ cancel: []; save: [rule: 订单规则] }>()
const 编辑 = props.draft
编辑.mode = '全部满足'
初始化标发动作(编辑)
初始化分仓策略(编辑)
const 错误 = reactive<Record<string, string>>({})
const 尝试保存 = ref(false)
watch(() => 编辑.conditions, () => { delete 错误.conditions }, { deep: true })
const 已选字段 = computed(() => [...new Set(编辑.conditions.map(项 => 项.field))])
const 可选条件分组 = computed(() => 读取可选条件分组(编辑.type))
function 选项(field: 条件字段): { value: string; label: string }[] {
  if (是否多选条件字段(field)) return 规则基础选项(field, props.orders, 渠道会话.value)
  if (field === 'salesOwner') return 中台系统用户资料.value
  if (field === 'platformOrderStatus') return eBay平台订单状态选项.map(项 => ({ ...项 }))
  if (field === 'fulfillmentMode') return [{ value: '自配送', label: '自配送' }, { value: '平台履约', label: '平台履约' }]
  return [...new Set(props.orders.map(项 => 项.storeName))].filter(Boolean).map(value => ({ value, label: value }))
}
function 切条件(field: 条件字段, selected: boolean) {
  if (selected && !已选字段.value.includes(field)) 编辑.conditions.push(创建空条件(field))
  if (!selected) 编辑.conditions = 编辑.conditions.filter(项 => 项.field !== field)
  错误.conditions = ''
}
function 保存() {
  尝试保存.value = true
  Object.keys(错误).forEach(key => delete 错误[key])
  if (!编辑.name.trim()) { 错误.name = '请输入规则名称'; return }
  const message = 校验规则配置(编辑, props.rules, 渠道会话.value)
  if (message) {
    // 动作配置由动作区即时展示错误，避免条件区残留重复提示。
    if (message !== 校验标发动作(编辑) && message !== 校验分仓策略(编辑)) 错误.conditions = message
    return
  }
  for (const 条件 of 编辑.conditions) {
    if (!是否多选条件字段(条件.field)) continue
    const allowed = new Set(选项(条件.field).map(项 => 项.value))
    if (读取条件多选值(条件).some(value => !allowed.has(value))) { 错误.conditions = `${条件字段名[条件.field]}包含已失效的选项，请重新选择`; return }
  }
  const 保存项 = JSON.parse(JSON.stringify(编辑)) as 订单规则
  if (保存项.type === '审单规则' && 保存项.orderNote?.trim()) 保存项.orderNote = 保存项.orderNote.trim()
  else delete 保存项.orderNote
  if (保存项.type !== '订单标发规则' || 保存项.action === '无需标发') delete 保存项.shippingAction
  if (保存项.type !== '分仓规则') delete 保存项.warehouseAction
  else 保存项.action = 保存项.warehouseAction?.mode === 'age' ? '按所选批次口径优先分配库龄合计较高的仓库' : 保存项.warehouseAction?.mode === 'price' ? (保存项.warehouseAction.priceComparison === 'priceAge' ? '按价格与库龄综合匹配仓库及渠道' : '优先分配接口试算总费用最低的仓库及渠道') : 读取分仓路由(保存项, 渠道会话.value)!.warehouse
  emit('save', 保存项)
}
</script>

<template>
  <div class="订单规则编辑表单">
    <div class="编辑布局">
      <aside class="条件侧栏" v-prototype="规则标注('editor', '规则基本信息与条件选择')">
        <h3>基本信息</h3>
        <ElForm label-position="top" @submit.prevent>
          <ElFormItem label="规则名称" required :error="错误.name"><ElInput v-model="编辑.name" aria-label="规则名称" placeholder="请输入规则名称" maxlength="40" show-word-limit /></ElFormItem>
          <ElFormItem label="规则类型"><ElInput :model-value="编辑.type" disabled /></ElFormItem>
          <ElFormItem label="规则状态"><ElSelect v-model="编辑.enabled" aria-label="规则状态"><ElOption label="停用" :value="false" /><ElOption label="启用" :value="true" /></ElSelect></ElFormItem>
        </ElForm>
        <div class="可选标题"><h3>可选条件</h3><span>已选 {{ 已选字段.length }} 类</span></div>
        <section v-for="组 in 可选条件分组" :key="组.title" class="可选分组"><h4>{{ 组.title }}</h4><ElCheckbox v-for="field in 组.fields" :key="field" :model-value="已选字段.includes(field)" @change="切条件(field, Boolean($event))">{{ 条件字段名[field] }}</ElCheckbox></section>
        <p class="侧栏帮助">勾选左侧条件，在右侧填写适用范围。</p>
      </aside>
      <div class="编辑正文">
        <section class="编辑分区" v-prototype="规则标注('conditions', '匹配条件配置')"><div class="分区标题"><h3>规则条件</h3><ElTag size="small" type="info">{{ 编辑.conditions.length }} 项条件</ElTag></div>
          <div v-if="!编辑.conditions.length" class="空条件">请从左侧选择至少一项条件</div>
          <div v-for="(条件, index) in 编辑.conditions" :key="`${条件.field}-${index}`" class="编辑条件行">
            <div class="条件标签"><span class="条件序号">{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ 条件字段名[条件.field] }}</strong><SizeHelp v-if="条件.field === 'productDimensions' || 条件.field === 'volume'" :type="条件.field === 'volume' ? 'volume' : 'dimensions'" /></div>
            <div class="条件控件" :class="{ 整行条件: 是否已移除条件(条件.field) || 条件.field === 'orderAddress' || ['range', 'dimensions', 'volume', 'dimensionRange'].includes(条件定义[条件.field]?.kind), 多行条件: 是否多行文本字段(条件.field) }"><ElSelect v-if="!是否已移除条件(条件.field) && 条件.field !== 'orderAddress' && !['range', 'dimensions', 'volume', 'dimensionRange'].includes(条件定义[条件.field]?.kind)" v-model="条件.operator" :aria-label="`第${index + 1}项比较方式`"><ElOption v-for="操作符 in 条件操作符(条件.field)" :key="操作符" :label="操作符" :value="操作符" /></ElSelect><div v-if="是否已移除条件(条件.field)" class="字段帮助">{{ 格式化条件值(条件) || '未填写' }} · 此条件已移除，请删除后保存规则。</div><ConditionValue v-else :condition="条件" :index="index" :options="选项(条件.field)" :validate="尝试保存" /><ElButton :icon="Delete" text :aria-label="`删除第${index + 1}项条件`" @click="编辑.conditions.splice(index, 1)" /></div>
            <p v-if="条件.field === 'salesOwner' && 条件.value && !选项('salesOwner').some(项 => 项.value === 条件.value)" class="字段帮助">原值：{{ 条件.value }}，请重新选择系统用户。</p>
            <p v-if="条件.field === 'siteCode' && !条件.values && 条件.value.trim()" class="字段帮助">原站点条件需重新选择。</p>
            <p v-if="条件.field === 'platformOrderStatus'" class="字段帮助">当前支持 eBay 履约状态，需同时设置“订单平台等于 eBay”。</p>
          </div>
          <p v-if="错误.conditions" class="校验错误" role="alert">{{ 错误.conditions }}</p>
        </section>
        <section class="编辑分区" v-prototype="规则标注('actions', '按类型设定动作')"><div class="分区标题"><h3>执行动作</h3></div>
          <ElForm label-position="top"><ShippingAction v-if="编辑.type === '订单标发规则'" :rule="编辑" :validate="尝试保存" /><WarehouseAction v-else-if="编辑.type === '分仓规则'" :rule="编辑" :validate="尝试保存" @change="错误.conditions = ''" /><ElFormItem v-else label="命中后执行" required>
            <ElRadioGroup v-model="编辑.action" class="动作选项" aria-label="执行动作"><ElRadio v-for="动作 in 规则动作[编辑.type]" :key="动作" :value="动作">{{ 动作 }}</ElRadio></ElRadioGroup>
          </ElFormItem></ElForm>
          <div v-if="编辑.type !== '订单标发规则'" class="动作帮助"><ElIcon><component :is="Plus" /></ElIcon><p v-if="编辑.type === '审单规则'">命中规则条件的订单，需要人工复核，订单将保留在待审核</p><p v-else>在待审核阶段分配发货仓库和物流渠道；更换仓库后须重新选择渠道。</p></div>
          <ElForm v-if="编辑.type === '审单规则'" label-position="top" class="订单备注配置"><ElFormItem label="订单备注"><ElInput v-model="编辑.orderNote" aria-label="订单备注" placeholder="选填，命中规则后追加到订单备注" type="textarea" :rows="3" :maxlength="订单备注字数上限" show-word-limit /></ElFormItem></ElForm>
        </section>
        <section class="编辑分区"><div class="分区标题"><h3>规则说明</h3><span>选填</span></div><ElInput v-model="编辑.note" aria-label="规则说明" placeholder="填写规则适用场景，便于团队维护" type="textarea" :rows="3" maxlength="300" show-word-limit /></section>
      </div>
    </div>
    <footer class="编辑底栏"><span>保存后可在规则试算中检查命中结果</span><div><ElButton @click="emit('cancel')">取消</ElButton><ElButton type="primary" @click="保存">保存规则</ElButton></div></footer>
  </div>
</template>

<style scoped>
.订单规则编辑表单{display:flex;flex-direction:column;height:100%;min-height:0}.编辑布局{display:grid;grid-template-columns:280px minmax(0,1fr);flex:1;min-height:0;overflow:auto;font-size:13px;color:var(--yy-text-regular)}.条件侧栏{background:#fafbfc;padding:24px;border-right:1px solid var(--yy-border-light)}h3,h4{margin:0;color:var(--yy-text-heading)}h3{font-size:14px;font-weight:600}.条件侧栏>h3{margin-bottom:22px}.条件侧栏 :deep(.el-form-item){margin-bottom:20px}.条件侧栏 :deep(.el-form-item__label){font-size:12px}.可选标题{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--yy-border);margin-top:25px;padding-top:24px}.可选标题 span,.侧栏帮助{font-size:12px;color:var(--yy-text-secondary)}.可选分组{padding-top:22px}.可选分组 h4{font-size:12px;margin-bottom:9px}.可选分组 .el-checkbox{display:flex;height:30px;margin-right:0}.可选分组 :deep(.el-checkbox__label){font-size:12px}.侧栏帮助{line-height:1.8;margin-top:28px}.编辑正文{padding:26px 30px;min-width:0;width:100%;max-width:1180px}.编辑分区{padding-bottom:28px;margin-bottom:28px;border-bottom:1px solid var(--yy-border-light)}.编辑分区:last-child{border:0;margin-bottom:0}.分区标题{display:flex;align-items:center;gap:12px;margin-bottom:20px}.分区标题 h3{border-left:3px solid var(--yy-primary);padding-left:9px}.分区标题>span{font-size:12px;color:var(--yy-text-secondary)}.匹配方式{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:12px;background:#f7f9fc;padding:10px 14px;margin-bottom:8px}.匹配方式 .el-radio{height:28px;margin-right:16px}.匹配方式 :deep(.el-radio__label){font-size:12px}.编辑条件行{padding:18px 0;border-bottom:1px dashed #e8ebf0}.条件标签{display:flex;align-items:center;gap:10px;margin-bottom:10px}.条件标签 strong{font-weight:500;font-size:12px}.条件序号{color:#9ba4b1;font-size:11px;font-variant-numeric:tabular-nums}.条件控件{display:grid;grid-template-columns:100px minmax(0,1fr) 32px;gap:10px}.条件控件 .el-button{margin:0}.字段帮助{font-size:12px;line-height:1.7;color:#8b6b35;margin:10px 0 0}.加条件{margin-top:14px;display:flex;align-items:center;gap:12px}.加条件 span{font-size:11px;color:var(--yy-text-secondary)}.空条件{padding:35px 16px;text-align:center;color:var(--yy-text-secondary);border:1px dashed var(--yy-border);margin-top:18px}.动作选项{display:flex;align-items:flex-start;flex-direction:column}.动作选项 .el-radio{margin-right:0}.动作选项 :deep(.el-radio__label){white-space:normal;line-height:1.6;font-size:13px}.动作帮助{display:flex;gap:8px;background:#f5f8fd;border-radius:4px;padding:12px;color:#63758e;font-size:12px;line-height:1.8}.动作帮助 .el-icon{margin-top:4px}.动作帮助 p{margin:0}.编辑底栏{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:14px 24px;border-top:1px solid var(--yy-border-light)}.编辑底栏>span{font-size:12px;color:var(--yy-text-secondary)}.校验错误{color:var(--yy-danger);font-size:12px;line-height:1.8;margin-bottom:0}
@media(max-width:1350px){.编辑布局{grid-template-columns:230px minmax(0,1fr)}.条件侧栏{padding:20px}.编辑正文{padding:24px}.匹配方式{gap:6px}.匹配方式>.el-radio-group{width:100%}}
.编辑布局{overflow:hidden}.条件侧栏,.编辑正文{overflow:auto;min-height:0}.可选分组{padding-top:18px}.可选分组 .el-checkbox{height:28px}.范围帮助{margin:9px 0 0 110px;font-size:12px;line-height:1.7;color:var(--yy-text-secondary)}
.订单备注配置{margin-top:20px}.订单备注配置 :deep(.el-form-item){margin-bottom:0}.订单备注配置 :deep(.el-form-item__label){font-size:12px}
.条件控件.整行条件{grid-template-columns:minmax(0,1fr) 32px;align-items:start}.条件控件.多行条件{align-items:start}
</style>

