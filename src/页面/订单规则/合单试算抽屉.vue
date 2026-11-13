<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDrawer, ElEmpty, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { 共享规则 } from './演示会话'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 自动合单样例资料 } from '../订单处理/自动合单演示'
import { 试算自动合单规则 } from '../订单处理/自动合单会话'
import { 北京时间文本 } from '../订单处理/自动合单模型'
import { 自动合单标注 } from '../订单处理/自动合单标注'
import { 合单展示期限 } from '../订单处理/自动合单展示'
import { 共享自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 合单动作摘要, 校验合单动作, 校验合单时长输入, type 合单动作配置 } from './合单规则模型'
import { 校验规则配置, type 订单规则 } from './规则逻辑'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 解释合单试算 } from './合单试算解释'

const props = defineProps<{ draftRule?: 订单规则; draftPolicy?: 合单动作配置; draftIntervalMinutes?: number; draftTaskEnabled?: boolean }>()
const 打开 = defineModel<boolean>({ default: false })
const 规则ID = ref(''), 订单号 = ref<string[]>([]), 快照 = ref(''), 错误 = ref('')
const 结果 = ref<ReturnType<typeof 试算自动合单规则>>()
const 解释 = ref<ReturnType<typeof 解释合单试算>>()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const 是草稿 = computed(() => !!props.draftRule || !!props.draftPolicy)
const 标题 = computed(() => props.draftRule ? '试算当前合单规则草稿' : props.draftPolicy ? '试算当前合单设置草稿' : '合单规则试算')
const 规则 = computed(() => 共享规则.value.filter(item => item.type === '合单规则'))
const 当前规则 = computed(() => 规则.value.find(item => item.id === 规则ID.value))
const 试算规则 = computed(() => props.draftRule ?? (props.draftPolicy || 规则ID.value === 'all' ? 规则.value.filter(item => item.enabled) : 当前规则.value))
const 使用策略 = computed(() => props.draftPolicy ?? 共享自动合单设置.value.policy)
const 来源 = computed(() => 共享订单.value.filter(item => 订单号.value.includes(item.systemOrderNo)))
const 关联仓库执行 = computed(() => {
  const nos = new Set(来源.value.map(order => order.systemOrderNo)), fulfillments = new Set(来源.value.flatMap(order => order.fulfillmentOrders.map(item => item.fulfillmentOrderNo)))
  return 仓库执行记录.value.filter(record => record.订单号.some(no => nos.has(no)) || fulfillments.has(record.履约单号))
})
const 相关合单资料 = computed(() => 来源.value.map(order => ({ orderNo: order.systemOrderNo,
  weightKg: 使用策略.value.maxWeightKg !== undefined ? 自动合单样例资料[order.systemOrderNo]?.weightKg : undefined,
  siteId: 使用策略.value.groupBySite ? 自动合单样例资料[order.systemOrderNo]?.siteId : undefined,
})))
const 当前快照 = computed(() => JSON.stringify([试算规则.value, 来源.value, 使用策略.value, 共享自动合单设置.value.version, props.draftIntervalMinutes, props.draftTaskEnabled, 渠道会话.value, 相关合单资料.value, 关联仓库执行.value, 共享下次合单时间.value]))
const 需重算 = computed(() => !!结果.value && 快照.value !== 当前快照.value)
const 放单组 = (orderNo: string) => 结果.value?.groups.find(group => group.orderNos.includes(orderNo))
const 展示期限 = (orderNo: string) => { const records = 结果.value?.records ?? []; const record = records.find(item => item.orderNo === orderNo); return record ? 合单展示期限(record, records) : { at: null, reason: '' } }
const 预计时间 = (orderNo: string) => { const time = 展示期限(orderNo).at; return 放单组(orderNo) ? '本轮处理时放单' : time ? 北京时间文本(time) : '等待处理' }
const 结果名称 = (status: string) => status === '可合并放单' ? '可组成合单候选组' : status === '独立放单' ? '独立进入分仓' : status
watch(打开, value => { if (value) { 规则ID.value = 'all'; 订单号.value = 共享订单.value.filter(item => item.systemOrderNo.startsWith('OMS-DEMO-AM-')).map(item => item.systemOrderNo); 结果.value = undefined; 解释.value = undefined; 错误.value = '' } }, { immediate: true })
function 试算() {
  if (!试算规则.value || !来源.value.length) return
  错误.value = (props.draftPolicy ? 校验合单时长输入(使用策略.value) : '') || 校验合单动作(使用策略.value)
  if (props.draftPolicy && (!Number.isInteger(props.draftIntervalMinutes) || props.draftIntervalMinutes! < 1 || props.draftIntervalMinutes! > 1440)) 错误.value ||= '执行间隔须为 1～1440 的整数分钟'
  if (props.draftRule) 错误.value ||= 校验规则配置({ ...props.draftRule, name: props.draftRule.name.trim() || '当前草稿' }, [], 渠道会话.value)
  if (错误.value) { 结果.value = undefined; 解释.value = undefined; return }
  const rules = clone(试算规则.value), orders = clone(来源.value), policy = clone(使用策略.value)
  快照.value = 当前快照.value
  结果.value = 试算自动合单规则(rules, orders, Date.now(), policy, 共享自动合单设置.value.version)
  解释.value = 解释合单试算(结果.value, Array.isArray(rules) ? rules : [{ ...rules, enabled: true }], orders, clone(渠道会话.value))
}
</script>
<template>
  <ElDrawer v-model="打开" :title="标题" size="min(1080px, calc(100vw - 70px))" append-to-body>
    <section v-prototype="自动合单标注('simulation', '多订单合单只读试算')" class="合单只读试算">
      <p v-if="draftRule" class="试算范围"><strong>仅试算当前入池规则草稿</strong> · 按启用该规则的假设计算，使用已保存的统一设置；不接着运行其他规则。</p>
      <p v-else-if="draftPolicy" class="试算范围"><strong>仅试算当前统一设置草稿</strong> · 使用当前全部已启用入池规则；不会保存设置或开启任务。</p>
      <p v-else class="试算说明">选择入池规则与多张订单，按已保存的统一设置试算。全部启用规则预览公共订单池；单条规则按启用该规则的假设试算。</p>
      <p class="试算说明">试算不修改订单或等待池，不启动任务。候选组还须通过共同分仓、整组库存及审核校验。</p>
      <p class="试算说明">{{ draftPolicy ? '设置草稿' : '已保存的统一设置' }}：{{ 合单动作摘要(使用策略) }}</p>
      <div class="合单试算表单"><template v-if="!是草稿"><label>入池规则</label><ElSelect v-model="规则ID" aria-label="试算合单规则"><ElOption value="all" label="全部已启用规则"/><ElOption v-for="item in 规则" :key="item.id" :value="item.id" :label="`${item.name}${item.enabled ? '' : '（停用）'}`"/></ElSelect></template><template v-else><label>规则范围</label><span>{{ draftRule ? (draftRule.name || '当前未命名草稿') : `全部已启用入池规则（${规则.filter(item => item.enabled).length} 条）` }}</span></template><label>参与订单</label><ElSelect v-model="订单号" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" aria-label="合单试算订单"><ElOption v-for="order in 共享订单" :key="order.systemOrderNo" :value="order.systemOrderNo" :label="`${order.systemOrderNo} · ${order.storeName}`"/></ElSelect></div>
      <div class="试算操作"><span>已选 {{ 订单号.length }} 张订单</span><ElButton type="primary" :disabled="!试算规则 || !订单号.length" @click="试算">开始试算</ElButton></div>
      <p v-if="错误" role="alert" class="试算错误">{{ 错误 }}</p>
      <p v-if="需重算" role="status" class="试算过期">草稿、设置、规则、来源订单或相关资料已变化，请重新试算。</p>
      <template v-if="结果 && 解释 && !需重算">
        <div class="试算摘要"><ElTag effect="plain">候选组 {{ 解释.groups.length }} 组</ElTag><ElTag effect="plain">本轮计划放单 {{ 结果.groups.length }} 组</ElTag><ElTag type="info" effect="plain">参与判定 {{ 结果.rows.length }} 单</ElTag></div>
        <h3>1. 入池判断</h3>
        <ElTable :data="解释.rows" max-height="36vh"><ElTableColumn prop="orderNo" label="系统订单号" min-width="215"/><ElTableColumn label="试算结果" width="150"><template #default="{row}">{{ 结果名称(row.status) }}</template></ElTableColumn><ElTableColumn label="判断依据" min-width="300"><template #default="{row}"><div>{{ row.reason }}</div><div v-if="row.ruleName" class="次要">命中规则：{{ row.ruleName }}<template v-if="row.groupNumber"> · 候选组 {{ row.groupNumber }}</template></div><details v-if="row.ruleDetails.length" class="条件轨迹"><summary>查看条件判断</summary><p v-for="(rule,index) in row.ruleDetails" :key="index"><strong>{{ rule.name }}</strong>：{{ rule.explanation }}</p></details><div v-else class="次要">当前没有启用的入池规则</div></template></ElTableColumn></ElTable>
        <h3>2. 候选分组</h3><p v-if="!解释.groups.length" class="试算说明">没有符合入池条件的候选订单。</p>
        <div v-for="group in 解释.groups" :key="group.number" class="候选组"><div class="组标题"><strong>候选组 {{ group.number }}</strong><span>{{ group.orderNos.length }} 单 · {{ group.quantity }} 件</span><ElTag size="small" :type="group.release ? 'success' : 'info'">{{ group.release ? '计划放单' : '继续等单' }}</ElTag></div><p class="组成员">{{ group.orderNos.join('、') }}</p><p>{{ group.separation }}</p><p>{{ group.progress }}</p></div>
        <h3>3. 等单与放单计划</h3><ElTable :data="结果.records" max-height="30vh" empty-text="无进入本次试算范围的订单"><ElTableColumn prop="orderNo" label="系统订单号" min-width="210"/><ElTableColumn label="预计进度" width="120"><template #default="{row}">{{ 放单组(row.orderNo) ? '本轮放单' : row.status }}</template></ElTableColumn><ElTableColumn label="预计放单" min-width="195"><template #default="{row}">{{ 预计时间(row.orderNo) }}</template></ElTableColumn><ElTableColumn label="放单依据" min-width="170"><template #default="{row}">{{ 放单组(row.orderNo)?.reason || 展示期限(row.orderNo).reason }}</template></ElTableColumn></ElTable>
      </template><ElEmpty v-else-if="!结果 && !错误" description="选择规则和订单后开始试算"/>
    </section>
    <template #footer><ElButton @click="打开 = false">{{ 是草稿 ? '返回编辑' : '关闭' }}</ElButton></template>
  </ElDrawer>
</template>
<style scoped>
.试算说明,.试算范围{font-size:13px;line-height:1.8;margin:0 0 14px;color:var(--yy-text-secondary)}.试算范围{padding:10px 12px;background:var(--el-color-primary-light-9);color:var(--yy-text-regular)}.试算范围 strong{color:var(--yy-text-heading)}.合单试算表单{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center;gap:14px;font-size:13px}.试算操作{display:flex;align-items:center;justify-content:space-between;margin:16px 0;font-size:12px;color:var(--yy-text-secondary)}.试算摘要{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}h3{font-size:14px;margin:22px 0 12px;color:var(--yy-text-heading)}.试算过期{color:var(--el-color-warning);font-size:13px}.试算错误{color:var(--el-color-danger);font-size:13px}.候选组{padding:12px;margin-top:10px;background:var(--el-fill-color-light);font-size:12px;line-height:1.7;overflow-wrap:anywhere}.候选组 p{margin:6px 0 0}.组标题{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.组标题 strong{color:var(--yy-text-heading)}.组成员{font-weight:500}.次要,.条件轨迹{font-size:12px;line-height:1.8;color:var(--yy-text-secondary);margin-top:5px}.条件轨迹 summary{cursor:pointer;color:var(--el-color-primary)}.条件轨迹 p{margin:6px 0}.条件轨迹 strong{font-weight:500;color:var(--yy-text-heading)}
</style>
