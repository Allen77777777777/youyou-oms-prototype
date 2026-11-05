<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElAlert, ElButton, ElCollapse, ElCollapseItem, ElDialog, ElForm, ElInput, ElMessage, ElTable, ElTableColumn, ElTag } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import type { 原型标注 } from '@/类型/标注'
import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import type { 仓库执行, 命令结果 } from './演示会话'
import { 创建合并发货草稿, 人工发货操作阻断原因, 人工发货撤销阻断原因, 校验人工发货方案, 关联人工发货订单号 } from './拆合发货模型'
import { 创建拆分矩阵草稿, 校验拆分商品分配 } from './拆分包裹分配'
import { 路由仓库键, 查找所选仓库物流 } from './仓库物流选择模型'
import { 拆合发货标注 } from './拆合发货原型标注'
import { 展示处理原因 } from './处理提示展示'
import type { 人工发货库存结果 } from './拆合发货库存'
import WarehouseRoute from './仓库物流选择.vue'
import PlanSummary from './拆合发货方案展示.vue'
import PackageAllocation from './拆分包裹设置.vue'
import PackageInventory from './拆分包裹库存.vue'
import MergeShippingOperation from './合并发货操作.vue'
import ShippingSteps from './发货步骤条.vue'

type 操作模式 = '拆分发货' | '合并发货' | '编辑发货方案' | '撤销方案'
type 标注集合 = Record<'范围' | '分配' | '路由' | '原因' | '预览' | '撤销', 原型标注>
const props = defineProps<{
  orders: readonly 全渠道订单[]
  allOrders: readonly 全渠道订单[]
  executions: readonly 仓库执行[]
  routeOptions: readonly 订单路由[]
  versionOf: (orderNo: string) => number
  save: (plan: 人工发货方案, versions: Record<string, number>) => 命令结果 | Promise<命令结果>
  saveBatch?: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果>
  saveBatchAndReview?: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果>
  inventory?: (plan: 人工发货方案) => 人工发货库存结果
  saveAndReview?: (plan: 人工发货方案, versions: Record<string, number>) => 命令结果 | Promise<命令结果>
  withdraw: (orderNos: string[], versions: Record<string, number>, reason: string) => 命令结果 | Promise<命令结果>
  annotations?: 标注集合
}>()
const emit = defineEmits<{ saved: [action: string, orderNos: string[]] }>()
const 标注 = computed(() => props.annotations || 拆合发货标注)
const 合并操作 = ref<InstanceType<typeof MergeShippingOperation>>()
async function 保存合并组(plans: 人工发货方案[], versions: Record<string, number>): Promise<命令结果> {
  if (props.saveBatch) return props.saveBatch(plans, versions)
  if (plans.length === 1) return props.save(plans[0]!, versions)
  return { 成功: false, 信息: '当前不能保存多组合并方案，请重新打开后重试' }
}
const 打开 = ref(false)
const 模式 = ref<操作模式>('拆分发货')
const 来源编号 = ref<string[]>([])
const 来源订单 = computed(() => 来源编号.value.flatMap(no => { const order = props.allOrders.find(item => item.systemOrderNo === no); return order ? [order] : [] }))
const 草稿 = ref<人工发货方案>()
const 期望版本 = ref<Record<string, number>>({})
const 仓库选择 = ref<Record<string, string>>({})
const 步骤 = ref(0)
const 保存中 = ref(false)
const 提交动作 = ref<'save' | 'review'>('save')
const 库存刷新次数 = ref(0)
const 提交错误 = ref('')
const 撤销原因 = ref('')
const 展开收件 = ref<string[]>([])
const 是撤销 = computed(() => 模式.value === '撤销方案')
const 是拆分 = computed(() => 草稿.value?.kind === '拆分发货')
const 是三步拆分 = computed(() => 是拆分.value && !是撤销.value)
const 库存读取启用 = computed(() => 是三步拆分.value && !!props.inventory)
const 预览步骤 = computed(() => 是三步拆分.value ? 2 : 1)
const 是预览 = computed(() => 步骤.value === 预览步骤.value)
const 显示路由 = computed(() => !是撤销.value && 步骤.value === (是三步拆分.value ? 1 : 0))
const 显示原因输入 = computed(() => !是预览.value && (!是三步拆分.value || 步骤.value === 1))
const 标题 = computed(() => 是撤销.value ? `撤销${草稿.value?.kind || '发货方案'}` : 模式.value)
const 上下文 = computed(() => ({ 订单: [...props.allOrders], 仓库执行: [...props.executions], 当前版本: props.versionOf, 记录操作: () => {}, 可选路由: props.routeOptions }))
const 来源行 = computed(() => 来源订单.value.flatMap(order => order.items.map((item, index) => ({ key: JSON.stringify([order.systemOrderNo, item.externalLineId]), order, item, index }))))
const 可发总量 = computed(() => 来源行.value.reduce((sum, row) => sum + (row.item.fulfillableQuantity || 0), 0))
const 资格原因 = computed(() => {
  if (!草稿.value) return ['未取得发货方案']
  const reasons = 是撤销.value ? 人工发货撤销阻断原因(上下文.value, 来源编号.value) : 人工发货操作阻断原因(上下文.value, 来源编号.value, 草稿.value.kind)
  if (草稿.value.orderNos.length !== 来源编号.value.length || 草稿.value.orderNos.some(no => !来源编号.value.includes(no))) reasons.push('所选订单包含已有发货方案；请先撤销原方案，再与其他订单合并')
  return reasons
})
const 校验原因 = computed(() => !草稿.value ? ['未取得发货方案'] : 是撤销.value ? [...资格原因.value, ...(!撤销原因.value.trim() ? ['请填写撤销原因'] : []), ...(撤销原因.value.trim().length > 2000 ? ['撤销原因最多 2000 字符'] : [])] : [...new Set([...资格原因.value, ...校验人工发货方案(上下文.value, 草稿.value)])])
function 读取库存(): 人工发货库存结果 {
  if (!库存读取启用.value || !草稿.value || !props.inventory) return { rows: [], reasons: [] }
  try { return props.inventory(草稿.value) }
  catch { return { rows: [], reasons: ['暂未取得仓库库存，请核实后继续'] } }
}
function 库存阻断原因(result: 人工发货库存结果): string[] {
  if (!库存读取启用.value) return []
  const reasons = [...result.reasons]
  for (const row of result.rows) if (row.status !== '充足') reasons.push(row.reason || `${row.systemSku || '商品'}库存待核实`)
  草稿.value?.packages.forEach((parcel, index) => {
    if (parcel.items.some(item => item.quantity > 0) && !result.rows.some(row => row.packageKey === parcel.key)) reasons.push(`包裹 ${index + 1} 库存尚未取得，请核实后继续`)
  })
  return [...new Set(reasons)]
}
function 复验库存(): 人工发货库存结果 { 库存刷新次数.value += 1; return 读取库存() }
const 库存结果 = computed<人工发货库存结果>(() => {
  void 库存刷新次数.value
  return 步骤.value >= 1 && 打开.value ? 读取库存() : { rows: [], reasons: [] }
})
const 库存校验原因 = computed(() => 库存读取启用.value && 步骤.value >= 1 ? 库存阻断原因(库存结果.value) : [])
const 当前步骤校验 = computed(() => {
  if (是三步拆分.value && 步骤.value === 0 && 草稿.value && 来源订单.value[0]) return [...new Set([...资格原因.value, ...校验拆分商品分配(草稿.value, 来源订单.value[0])])]
  return [...new Set([...校验原因.value, ...库存校验原因.value])]
})
const 校验展开 = ref(false)
const 显示原因 = computed(() => [...new Set([...资格原因.value, ...(校验展开.value ? 当前步骤校验.value : [])])])

function 空路由(): 订单路由 { return { warehouse: '', warehouseProvider: '', warehouseAccount: '', shippingChannel: '', shippingChannelCode: '', labelMode: '仓配一体' } }
function 校验文案(reason: string) {
  let text = reason
  草稿.value?.packages.forEach((parcel, index) => { text = text.split(`包裹 ${parcel.key}`).join(`包裹 ${index + 1}`) })
  return 展示处理原因(text)
}
function 包裹仓库(key: string) { return 仓库选择.value[key] || '' }
function 选择仓库(key: string, value: string) {
  const parcel = 草稿.value?.packages.find(item => item.key === key)
  if (!parcel) return
  仓库选择.value[key] = value
  const route = props.routeOptions.find(item => 路由仓库键(item) === value)
  parcel.route = route ? { ...route, shippingChannel: '', shippingChannelCode: '', shippingChannelId: undefined } : 空路由()
  提交错误.value = ''
}
function 选择渠道(key: string, value: string) {
  const parcel = 草稿.value?.packages.find(item => item.key === key)
  if (!parcel) return
  const route = 查找所选仓库物流(props.routeOptions, 包裹仓库(key), value)
  if (route) parcel.route = { ...route }
  else parcel.route = { ...parcel.route, shippingChannel: '', shippingChannelCode: '', shippingChannelId: undefined }
  提交错误.value = ''
}
function 行数量(key: string, orderNo: string, externalLineId: string) {
  return 草稿.value?.packages.find(parcel => parcel.key === key)?.items.filter(item => item.orderNo === orderNo && item.externalLineId === externalLineId).reduce((sum, item) => sum + item.quantity, 0) || 0
}
function 已分配(orderNo: string, externalLineId: string) {
  return 草稿.value?.packages.reduce((sum, parcel) => sum + 行数量(parcel.key, orderNo, externalLineId), 0) || 0
}
function 分配变更() {
  提交错误.value = ''
  仓库选择.value = Object.fromEntries((草稿.value?.packages || []).map(parcel => [parcel.key, parcel.route.warehouse ? 路由仓库键(parcel.route) : '']))
}
function open(mode: 操作模式, orders?: readonly 全渠道订单[]) {
  if (保存中.value) return
  const chosen = orders || props.orders
  if (!chosen.length) { ElMessage.warning('请先选择订单'); return }
  if (mode === '合并发货') { void 合并操作.value?.open(chosen); return }
  模式.value = mode
  const nos = [...new Set(chosen.map(order => order.systemOrderNo))]
  来源编号.value = 关联人工发货订单号(上下文.value, nos)
  const sources = 来源订单.value
  if (!sources.length) { ElMessage.warning('来源订单已变化，请刷新列表后重试'); return }
  const existing = sources.find(order => order.manualShippingPlan)?.manualShippingPlan
  if ((mode === '编辑发货方案' || mode === '撤销方案') && !existing) { ElMessage.warning('当前没有可操作的发货方案'); return }
  if (existing && mode === '拆分发货' && existing.kind !== mode) { ElMessage.warning(`当前已有${existing.kind}方案，请先撤销后重新编排`); return }
  if (existing) 草稿.value = JSON.parse(JSON.stringify(existing)) as 人工发货方案
  else 草稿.value = mode === '拆分发货' ? 创建拆分矩阵草稿(sources[0]!) : 创建合并发货草稿(sources)
  期望版本.value = Object.fromEntries(来源编号.value.map(no => [no, props.versionOf(no)]))
  仓库选择.value = Object.fromEntries(草稿.value.packages.map(parcel => [parcel.key, parcel.route.warehouse ? 路由仓库键(parcel.route) : '']))
  步骤.value = 0; 提交错误.value = ''; 撤销原因.value = ''; 校验展开.value = false; 展开收件.value = []; 提交动作.value = 'save'
  打开.value = true
}
function 下一步() {
  校验展开.value = true
  const reasons = 是三步拆分.value && 步骤.value === 0 ? 当前步骤校验.value : [...校验原因.value, ...(库存读取启用.value ? 库存阻断原因(复验库存()) : [])]
  if (reasons.length) { 提交错误.value = 是三步拆分.value && 步骤.value === 0 ? '请先完成包裹数量分配' : '请先处理校验项，再确认发货方案'; return }
  提交错误.value = ''; 校验展开.value = false; 步骤.value += 1
}
function 上一步() { if (步骤.value > 0) 步骤.value -= 1; 提交错误.value = ''; 校验展开.value = false }
async function 提交(action: 'save' | 'review' = 'save') {
  if (!草稿.value || 保存中.value || !是预览.value) return
  if (action === 'review' && (!是三步拆分.value || !props.saveAndReview)) return
  校验展开.value = true
  if (校验原因.value.length) { 提交错误.value = 校验原因.value.join('；'); return }
  保存中.value = true; 提交动作.value = action; 提交错误.value = ''
  try {
    await nextTick()
    if (!打开.value) return
    const reasons = [...new Set([...校验原因.value, ...库存阻断原因(复验库存())])]
    if (reasons.length) { 提交错误.value = reasons.join('；'); return }
    const plan = JSON.parse(JSON.stringify(草稿.value)) as 人工发货方案
    const result = 是撤销.value ? await props.withdraw([...来源编号.value], { ...期望版本.value }, 撤销原因.value.trim()) : action === 'review' ? await props.saveAndReview!(plan, { ...期望版本.value }) : await props.save(plan, { ...期望版本.value })
    if (!result.成功) { 提交错误.value = result.信息; return }
    const actionName = action === 'review' ? '保存并审核订单' : 是撤销.value ? `撤销${plan.kind}` : 模式.value === '编辑发货方案' ? '编辑发货方案' : plan.kind
    打开.value = false
    emit('saved', actionName, [...来源编号.value])
  } catch (error) {
    提交错误.value = error instanceof Error ? error.message : '操作未完成，请稍后重试'
  } finally { 保存中.value = false }
}
function 关闭(done?: () => void) { if (!保存中.value) { 打开.value = false; done?.() } }
function 清空() { if (打开.value) return; 草稿.value = undefined; 仓库选择.value = {}; 提交错误.value = ''; 撤销原因.value = '' }
defineExpose({ open })
</script>

<template>
  <MergeShippingOperation ref="合并操作" :all-orders="allOrders" :executions="executions" :route-options="routeOptions" :version-of="versionOf" :save="保存合并组" :save-and-review="saveBatchAndReview" @saved="(action, orderNos) => emit('saved', action, orderNos)" />
  <ElDialog v-model="打开" :title="标题" width="min(1260px, 96vw)" top="3vh" class="拆合发货弹窗" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!保存中" :show-close="!保存中" :before-close="关闭" @closed="清空">
    <div v-if="草稿" class="拆合工作区">
      <ShippingSteps class="步骤区" :active="步骤" :titles="是三步拆分 ? ['拆分包裹', '仓库和物流渠道', '预览'] : 是撤销 ? ['填写撤销原因', '确认撤销'] : ['编辑发货方案', '确认发货方案']" :note="是三步拆分 && saveAndReview ? '审核通过后进入待推单' : '保存后仍待审核'" />
      <section v-prototype="标注.范围" class="来源区">
        <div class="分区标题"><h3>来源订单 <small>{{ 来源订单.length }} 张订单 · {{ 来源行.length }} 个商品行 · {{ 可发总量 }} 件</small></h3><ElTag size="small" :type="资格原因.length ? 'warning' : 'success'">{{ 资格原因.length ? '需处理' : 是拆分 ? '可拆分' : '兼容校验通过' }}</ElTag></div>
        <ElTable :data="来源订单" size="small" class="来源表">
          <ElTableColumn label="系统订单 / 平台订单" min-width="240"><template #default="{ row }"><div class="双行信息"><strong>{{ row.systemOrderNo }}</strong><small>{{ row.platformOrderNo }}</small></div></template></ElTableColumn>
          <ElTableColumn label="平台 / 店铺" min-width="180"><template #default="{ row }"><div class="双行信息"><span>{{ row.platformCode }}</span><small>{{ row.storeName }}</small></div></template></ElTableColumn>
          <ElTableColumn label="买家 / 收件人" min-width="170"><template #default="{ row }"><div class="双行信息"><span>{{ row.buyerExternalId || '买家待核实' }}</span><small>{{ row.address.fullName }} · {{ row.address.countryCode }} {{ row.address.postalCode }}</small></div></template></ElTableColumn>
          <ElTableColumn label="原发货仓库 / 物流渠道" min-width="215"><template #default="{ row }"><div class="双行信息"><span>{{ row.defaultRoute?.warehouse || '未选择' }}</span><small>{{ row.defaultRoute?.shippingChannel || '未选择' }}</small></div></template></ElTableColumn>
          <ElTableColumn label="当前阶段" width="88"><template #default="{ row }"><ElTag size="small" :type="row.processingStatus === '待审核' ? 'info' : 'warning'">{{ row.processingStatus }}</ElTag></template></ElTableColumn>
        </ElTable>
        <ElCollapse v-model="展开收件" class="收件展开"><ElCollapseItem name="address" title="查看完整收件信息"><div class="收件网格"><div v-for="order in 来源订单" :key="order.systemOrderNo" class="收件卡"><strong>{{ order.systemOrderNo }}</strong><span>{{ order.address.fullName }} <template v-if="order.address.companyName">· {{ order.address.companyName }}</template></span><span>{{ [order.address.countryCode, order.address.stateProvince, order.address.city, order.address.district, order.address.addressLine1, order.address.addressLine2, order.address.postalCode].filter(Boolean).join(' · ') }}</span><small>{{ [order.address.mobilePhone, order.address.telephone, order.address.email].filter(Boolean).join(' · ') || '—' }}</small></div></div></ElCollapseItem></ElCollapse>
      </section>
      <div v-if="显示原因.length" class="校验问题"><strong>请处理以下校验项</strong><ul><li v-for="reason in 显示原因" :key="reason">{{ 校验文案(reason) }}</li></ul></div>
      <section v-if="是三步拆分 && 步骤 === 0 && 来源订单[0]" v-prototype="标注.分配" class="分配区"><PackageAllocation :plan="草稿" :order="来源订单[0]" @changed="分配变更" /></section>
      <section v-if="!是拆分 && !是撤销 && 步骤 === 0" v-prototype="标注.分配" class="分配区"><div class="分区标题"><h3>合并发货商品</h3><span class="合并数量">{{ 可发总量 }} 件</span></div><ElTable :data="来源行" size="small" class="商品分配表"><ElTableColumn label="商品 / SKU" min-width="230"><template #default="{ row }"><div class="商品信息"><img v-if="row.item.itemImageUrl" :src="row.item.itemImageUrl" alt="" /><div><span>{{ row.item.systemItemName || row.item.platformItemTitle || '—' }}</span><small>{{ row.item.systemSku || row.item.platformSku || 'SKU 待核实' }}</small><small>{{ row.order.systemOrderNo }}</small><small>平台行：{{ row.item.externalLineId }}</small></div></div></template></ElTableColumn><ElTableColumn label="下单" width="70" align="right"><template #default="{ row }">{{ row.item.orderedQuantity }}</template></ElTableColumn><ElTableColumn label="可发" width="75" align="right"><template #default="{ row }">{{ row.item.fulfillableQuantity ?? '待核实' }}</template></ElTableColumn><ElTableColumn label="合并发货数量" width="120" align="right"><template #default="{ row }">{{ 已分配(row.order.systemOrderNo, row.item.externalLineId) }}</template></ElTableColumn></ElTable></section>
      <section v-if="显示路由" v-prototype="标注.路由" class="路由区" :class="{ 含库存: 库存读取启用 }"><div class="分区标题"><h3>{{ 是拆分 ? '每包仓库和物流渠道' : '共同发货信息' }}<small>{{ 是拆分 ? '分别确认各包裹的发货仓库及物流渠道' : '全部来源商品使用同一仓库及渠道' }}</small></h3></div><div class="包裹网格"><article v-for="(parcel, index) in 草稿.packages" :key="parcel.key" class="包裹编辑"><header><div><strong>{{ 是拆分 ? '包裹 ' + (index + 1) : '合并包裹' }}</strong><span>{{ parcel.items.length }} 个商品行 · {{ parcel.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</span></div></header><ElForm label-position="top" size="small"><WarehouseRoute :routes="routeOptions" :warehouse="包裹仓库(parcel.key)" :channel="parcel.route.shippingChannelCode" @update:warehouse="选择仓库(parcel.key, $event)" @update:channel="选择渠道(parcel.key, $event)" /></ElForm><PackageInventory v-if="库存读取启用" :rows="库存结果.rows.filter(row => row.packageKey === parcel.key)" :selected="!!parcel.route.warehouse" /></article></div></section>
      <section v-if="步骤 === 0 && 是撤销" v-prototype="标注.撤销" class="撤销区"><ElAlert :title="`将撤销全部 ${来源订单.length} 张来源订单的${草稿.kind}方案，各单保留当前处理阶段。`" type="warning" :closable="false" show-icon /><PlanSummary :plan="草稿" :orders="来源订单" :show-reason="false" /></section>
      <section v-if="显示原因输入" v-prototype="标注.原因" class="原因区"><label :for="是撤销 ? 'manual-shipping-withdraw-reason' : 'manual-shipping-reason'">{{ 是撤销 ? '撤销原因' : '操作原因' }} <span v-if="是撤销">*</span><small v-else>（选填）</small></label><ElInput v-if="是撤销" id="manual-shipping-withdraw-reason" v-model="撤销原因" type="textarea" :rows="2" :maxlength="2000" show-word-limit placeholder="请输入撤销原因" aria-label="撤销原因" /><ElInput v-else id="manual-shipping-reason" v-model="草稿.reason" type="textarea" :rows="2" :maxlength="2000" show-word-limit placeholder="选填，保存到发货安排和各来源订单的操作日志" aria-label="操作原因" /></section>
      <section v-if="是预览" v-prototype="标注.预览" class="预览区"><div class="分区标题"><h3>{{ 是撤销 ? '确认撤销范围' : '发货方案预览' }}</h3><ElTag size="small" :type="是撤销 ? 'warning' : 库存校验原因.length ? 'warning' : 'success'">{{ 是撤销 ? '撤销全部来源方案' : 库存校验原因.length ? '库存需核实' : '校验通过' }}</ElTag></div><PlanSummary :plan="草稿" :orders="来源订单" :show-reason="!是撤销" /><div v-if="库存读取启用" class="预览库存"><PackageInventory :rows="库存结果.rows" show-package /></div><div v-if="是撤销" class="撤销原因预览"><span>撤销原因</span><p>{{ 撤销原因 }}</p></div><ElAlert :title="是撤销 ? '确认后各来源订单恢复独立发货准备，仍需审核通过后推仓。' : 是三步拆分 && saveAndReview ? '保存方案后保留待审核；保存并审核订单通过后进入待推单。' : '确认后保存发货方案，全部来源订单仍待审核；审核通过后才能继续推仓。'" type="info" :closable="false" show-icon /></section>
      <ElAlert v-if="提交错误" :title="校验文案(提交错误)" type="error" :closable="false" show-icon />
    </div>
    <template #footer><div class="窗口底栏"><span>{{ 来源订单.length }} 张来源订单<template v-if="草稿"> · {{ 草稿.packages.length }} 个包裹</template></span><div><ElButton :disabled="保存中" @click="关闭()">取消</ElButton><ElButton v-if="步骤 > 0" :disabled="保存中" @click="上一步">{{ 是三步拆分 ? '上一步' : '返回编辑' }}</ElButton><ElButton v-if="!是预览" type="primary" :icon="ArrowRight" :disabled="资格原因.length > 0" @click="下一步">{{ 是三步拆分 && 步骤 === 0 ? '下一步' : 是撤销 ? '预览撤销' : '预览发货方案' }}</ElButton><ElButton v-else :type="是撤销 ? 'danger' : 是三步拆分 && saveAndReview ? 'default' : 'primary'" :loading="保存中 && 提交动作 === 'save'" :disabled="保存中" @click="提交('save')">{{ 是撤销 ? '确认撤销' : '确认保存' }}</ElButton><ElButton v-if="是预览 && 是三步拆分 && saveAndReview" v-prototype="拆合发货标注.保存审核" type="primary" :loading="保存中 && 提交动作 === 'review'" :disabled="保存中" @click="提交('review')">保存并审核订单</ElButton></div></div></template>
  </ElDialog>
</template>

<style scoped>
:global(.拆合发货弹窗){max-height:94vh;margin-bottom:3vh}:global(.拆合发货弹窗 .el-dialog__header){margin-right:20px;padding-bottom:13px}:global(.拆合发货弹窗 .el-dialog__body){max-height:calc(94vh - 125px);overflow:auto;padding-top:0}.拆合工作区{display:flex;flex-direction:column;gap:18px;min-width:0;color:#3b506c}.步骤区{display:flex;align-items:center;gap:25px;padding:10px 14px;background:#f7f9fc;border-radius:5px}.步骤区>.el-steps{flex:1;padding:0;background:none}.步骤区>span{font-size:12px;color:#8794a7;white-space:nowrap}.步骤区 :deep(.el-step__title){font-size:12px;line-height:1.7}.分区标题{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.分区标题 h3{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:600;color:#233b59}.分区标题 h3 small{margin-left:5px;font-size:11px;font-weight:400;color:#8996a7}.双行信息{display:flex;flex-direction:column;gap:3px;line-height:1.55;overflow-wrap:anywhere}.双行信息 strong{font-weight:500;color:#2c4564}.双行信息 small{color:#8693a6;font-size:11px}.来源表 :deep(.el-table__cell),.商品分配表 :deep(.el-table__cell){vertical-align:top}.来源表 :deep(th.el-table__cell),.商品分配表 :deep(th.el-table__cell){background:#f7f9fc;color:#6a7c93}.收件展开{border-top:0}.收件展开 :deep(.el-collapse-item__header){height:31px;font-size:11px;color:#71829a;font-weight:400}.收件展开 :deep(.el-collapse-item__content){padding:8px 0 12px}.收件网格{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.收件卡{display:flex;flex-direction:column;gap:5px;border-left:2px solid #e0e8f3;padding-left:10px;line-height:1.6;font-size:12px;overflow-wrap:anywhere}.收件卡 strong{font-size:11px;font-weight:500}.收件卡 small{color:#8593a6}.校验问题{padding:11px 14px;border:1px solid #f0d8b8;background:#fffaf2;border-radius:5px;font-size:12px;line-height:1.7;color:#a97430}.校验问题 strong{font-weight:500}.校验问题 ul{margin:4px 0 0;padding-left:18px}.帮助图标{font-size:13px;color:#9aa7b7;cursor:help}.帮助图标:focus-visible{outline:2px solid #409eff;outline-offset:2px;border-radius:50%}.分配摘要{display:flex;align-items:center;gap:15px;font-size:12px;color:#75869b}.数量错误{color:#d06a38!important;font-weight:500}.商品信息{display:flex;gap:9px;min-width:0;line-height:1.55}.商品信息 img{width:36px;height:36px;object-fit:contain;flex-shrink:0;border:1px solid #edf0f4;border-radius:3px}.商品信息>div{display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere}.商品信息 small{color:#8492a5;font-size:11px}.商品分配表 :deep(.el-input-number){width:115px}.商品分配表 :deep(.el-select){width:100%}.包裹网格{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.包裹编辑{border:1px solid #e2e8f0;border-radius:5px;min-width:0}.包裹编辑>header{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f7f9fc;padding:8px 12px;border-radius:5px 5px 0 0}.包裹编辑>header>div{display:flex;align-items:center;flex-wrap:wrap;gap:12px;font-size:11px;color:#8a97a8}.包裹编辑>header strong{font-size:12px;color:#35506f;font-weight:500}.包裹编辑>.el-form{padding:12px 14px 0}.包裹编辑 :deep(.仓库物流字段){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}.包裹编辑 :deep(.el-form-item){margin-bottom:13px;min-width:0}.包裹编辑 :deep(.el-form-item__label){font-size:11px;line-height:1.3;height:auto;margin-bottom:6px}.包裹网格:has(>.包裹编辑:only-child){grid-template-columns:minmax(0,1fr)}.包裹编辑:only-child :deep(.仓库物流字段){grid-template-columns:repeat(4,minmax(0,1fr))}.原因区{display:flex;flex-direction:column;gap:8px}.原因区>label{font-size:12px;color:#465d79}.原因区>label>span{color:#f56c6c}.原因区 :deep(.el-textarea__inner){font-size:12px;line-height:1.7;padding-bottom:20px}.预览区,.撤销区{display:flex;flex-direction:column;gap:12px}.预览区>.分区标题{margin-bottom:0}.窗口底栏{display:flex;justify-content:space-between;align-items:center;gap:15px}.窗口底栏>span{font-size:12px;color:#8492a5}.撤销原因预览{display:grid;grid-template-columns:68px minmax(0,1fr);gap:10px;font-size:12px;line-height:1.7;color:#7b899c}.撤销原因预览 p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#3c506b}@media(max-width:1100px){.包裹编辑 :deep(.仓库物流字段){column-gap:10px}.分区标题 h3{flex-wrap:wrap}.步骤区{gap:15px}}@media(max-width:760px){.包裹网格,.收件网格{grid-template-columns:minmax(0,1fr)}.包裹编辑:only-child :deep(.仓库物流字段){grid-template-columns:repeat(2,minmax(0,1fr))}.步骤区>span{display:none}.窗口底栏>span{display:none}.窗口底栏{justify-content:flex-end}}
</style>

<style scoped>
:global(.拆合发货弹窗 .el-dialog__title){color:var(--yy-text-heading)}.步骤区 :deep(.el-step__title),.分区标题 h3,.包裹编辑>header strong,.来源表 :deep(th.el-table__cell),.商品分配表 :deep(th.el-table__cell){color:var(--yy-text-heading)!important}.拆合工作区>section{min-width:0;max-width:100%}.合并数量{font-size:12px;color:#75869b}
.路由区.含库存 .包裹网格{grid-template-columns:minmax(0,1fr)}.路由区.含库存 .包裹编辑 :deep(.仓库物流字段){grid-template-columns:repeat(4,minmax(0,1fr))}.预览库存{border:1px solid #e5eaf1;border-radius:5px;padding-top:10px}@media(max-width:760px){.路由区.含库存 .包裹编辑 :deep(.仓库物流字段){grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
