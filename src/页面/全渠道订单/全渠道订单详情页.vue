<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CopyDocument, InfoFilled, Lock, WarningFilled } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElMessage, ElTable, ElTableColumn, ElTooltip } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import OrderFlags from '../订单处理/订单标志组件.vue'
import OrderNotes from '../订单处理/订单备注组件.vue'
import OrderProductImage from './商品缩略图.vue'
import PlatformProductTitle from './平台商品标题.vue'
import WarehouseInventoryDetails from '../订单处理/库存关联明细.vue'
import { 计算订单标志 } from '../订单处理/订单标志模型'
import { 订单标志演示证据 } from '../订单处理/订单标志演示'
import { 订单关联仓库执行 } from '../订单处理/操作功能模型'
import { 共享订单 } from '../订单处理/演示会话'
import { 共享标发单 } from '../订单标发/演示会话'
import { 格式化北京时间, 计算剩余发货时间 } from '../订单处理/时间展示工具'
import type { 作业行 } from '../订单处理/展示工具'
import { 格式化金额, 获取OMS状态说明, 获取SKU状态说明, 获取同步状态说明, 获取平台状态说明 } from './订单工具'
import type { 全渠道订单, 订单商品行, 订单路由 } from './类型'

const props = defineProps<{ order: 全渠道订单 }>()
const router = useRouter()
const 页面 = ref<HTMLElement>()
const 页头 = ref<HTMLElement>()
const 当前分区 = ref('basic')
const 库存打开 = ref(false)
const 当前时刻 = ref(Date.now())
let 时钟: ReturnType<typeof setInterval> | undefined
onMounted(() => { 时钟 = setInterval(() => { 当前时刻.value = Date.now() }, 1000) })
onUnmounted(() => { if (时钟) clearInterval(时钟) })
const 剩余时间 = computed(() => props.order.processingStatus ? 计算剩余发货时间(props.order.shipByAt, props.order.processingStatus, 当前时刻.value) : undefined)
const 分区 = [
  { id: 'basic', label: '订单信息' }, { id: 'recipient', label: '收件信息' }, { id: 'amount', label: '金额信息' },
  { id: 'times', label: '时间信息' }, { id: 'items', label: '商品信息' }, { id: 'fulfillment', label: '履约与物流' },
  { id: 'notes', label: '订单备注' }, { id: 'sync', label: '同步信息' }, { id: 'logs', label: '操作日志' },
]
const OMS状态 = computed(() => 获取OMS状态说明(props.order))
const 平台状态 = computed(() => 获取平台状态说明(props.order))
const 当前标志 = computed(() => 计算订单标志(props.order, 订单标志演示证据))
const 仓库执行 = computed(() => 订单关联仓库执行(props.order))
const 标发记录 = computed(() => 共享标发单.value.filter(单 => 单.orderNo === props.order.systemOrderNo))
const 库存作业 = computed<作业行>(() => ({ key: props.order.systemOrderNo, order: props.order, stage: props.order.processingStatus ?? '待审核' }))
const 字段 = (label: string, value?: string, wide = false) => ({ label, value: value?.trim() || '—', wide })
const 基础字段 = computed(() => [
  字段('系统订单号', props.order.systemOrderNo), 字段('平台订单号', props.order.platformOrderNo),
  字段('平台订单 ID', props.order.platformOrderId), 字段('平台', props.order.platformCode),
  字段('店铺', props.order.storeName), 字段('店铺 ID', props.order.storeId),
  字段('订单类型', props.order.orderType), 字段('平台订单类型原值', props.order.platformOrderType),
  字段('买家 ID', props.order.buyerExternalId), 字段('履约模式', props.order.fulfillmentMode),
])
const 收件字段 = computed(() => [
  字段('收件人', props.order.address.fullName), 字段('公司名称', props.order.address.companyName),
  字段('国家 / 地区', props.order.address.countryCode), 字段('省 / 州', props.order.address.stateProvince),
  字段('城市', props.order.address.city), 字段('县 / 区', props.order.address.district),
  字段('地址行 1', props.order.address.addressLine1, true), 字段('地址行 2', props.order.address.addressLine2, true),
  字段('邮政编码', props.order.address.postalCode), 字段('手机', props.order.address.mobilePhone),
  字段('电话', props.order.address.telephone), 字段('邮箱', props.order.address.email),
])
const 金额字段 = computed(() => [
  { label: '订单总金额', value: props.order.amount.orderAmount }, { label: '客付运费', value: props.order.amount.buyerPaidShipping },
  { label: '客付税费', value: props.order.amount.buyerPaidTax }, { label: '交易费', value: props.order.amount.transactionFee },
  { label: '平台补贴', value: props.order.amount.platformSubsidy }, { label: '其他费用', value: props.order.amount.otherFee },
])
const 时间字段 = computed(() => [
  { label: '下单时间', source: props.order.orderedAt }, { label: '付款时间', source: props.order.paidAt },
  { label: '最晚发货时间', source: props.order.shipByAt }, { label: '订单创建时间', source: props.order.createdAt },
  { label: '平台更新时间', source: props.order.platformUpdatedAt }, { label: '最近同步时间', source: props.order.lastSyncedAt },
  { label: '履约完成时间', source: props.order.fulfillmentCompletedAt }, { label: '最终取消时间', source: props.order.cancelledAt },
])
const 处理说明 = computed(() => [
  字段('发货拦截原因', props.order.blockReason), 字段('不发货原因', props.order.noShipmentReason),
  字段('进入 / 准入说明', props.order.admissionReason), 字段('最终取消原因', props.order.cancelledReason),
].filter(项 => 项.value !== '—'))
function 路由字段(路由?: 订单路由) {
  return [字段('发货仓库', 路由?.warehouse), 字段('仓储服务商', 路由?.warehouseProvider), 字段('仓库账号', 路由?.warehouseAccount),
    字段('物流渠道', 路由?.shippingChannel), 字段('渠道代码', 路由?.shippingChannelCode), 字段('面单获取模式', 路由?.labelMode)]
}
function 履约来源(编号: string) {
  return [...new Set([props.order.systemOrderNo, ...共享订单.value.filter(单 => 单.fulfillmentOrders.some(履约 => 履约.fulfillmentOrderNo === 编号)).map(单 => 单.systemOrderNo)])]
}
function 跳转分区(id: string) {
  const 目标 = 页面.value?.querySelector<HTMLElement>('[data-section="' + id + '"]')
  if (!目标 || !页面.value) return
  当前分区.value = id
  页面.value.scrollTo({ top: 页面.value.scrollTop + 目标.getBoundingClientRect().top - 页面.value.getBoundingClientRect().top - (页头.value?.offsetHeight ?? 0) - 12, behavior: 'auto' })
}
function 同步导航() {
  if (!页面.value || !页头.value) return
  const 底线 = 页头.value.getBoundingClientRect().bottom + 20
  const 可见 = 分区.filter(项 => {
    const 元素 = 页面.value?.querySelector<HTMLElement>('[data-section="' + 项.id + '"]')
    return 元素 && 元素.getBoundingClientRect().top <= 底线
  })
  const 最后 = 可见[可见.length - 1]
  if (!最后) { 当前分区.value = 'basic'; return }
  const 末行 = 页面.value.querySelector<HTMLElement>('[data-section=' + 最后.id + ']')!.getBoundingClientRect().top
  const 同行 = 可见.filter(项 => Math.abs(页面.value!.querySelector<HTMLElement>('[data-section=' + 项.id + ']')!.getBoundingClientRect().top - 末行) < 2)
  if (!同行.some(项 => 项.id === 当前分区.value)) 当前分区.value = 同行[0]!.id
}
watch(() => props.order.systemOrderNo, async () => { 当前分区.value = 'basic'; 库存打开.value = false; await nextTick(); 页面.value?.scrollTo({ top: 0 }) })
async function 复制系统订单号() {
  try { await navigator.clipboard.writeText(props.order.systemOrderNo); ElMessage.success('已复制系统订单号') }
  catch { ElMessage.warning('当前浏览器未允许复制，请手动选择订单号') }
}
async function 查看仓单(履约号: string, 出库号: string) {
  const { 仓库会话单据 } = await import('../仓配管理/仓配会话')
  if (!仓库会话单据.value.some(单 => 单.fulfillment === 履约号 && 单.no === 出库号)) {
    ElMessage.info('未找到可查看的关联三方仓出库单，请核对该执行记录。')
    return
  }
  void router.push({ path: '/oms/warehouse-delivery/outbound-orders', query: { fulfillmentOrderNo: 履约号 } })
}
function 查看标发(编号: string) { void router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { shippingConfirmationNo: 编号 } }) }

const 标注 = (id: string, 标题: string, 说明: string, 事实等级: 原型标注['事实等级'], prd引用: string[], 交互规则: string[] = []): 原型标注 => ({
  id, 标题, 说明, 路由: '/oms/orders/all/:systemOrderNo', 锚点: id, 版本: '2026-10-10', 状态: '待评审', 事实等级, prd引用, 交互规则,
  数据来源: ['共享标准订单、仓库执行、标发及备注会话；仅虚构评审数据，真实 API、生产权限和持久审计未接入。'],
})
const 本轮引用 = ['PRD/全渠道订单功能PRD.md#21-2026-10-10-订单详情排版与业务信息完整性', 'PRD/订单处理功能PRD.md#75-完整订单详情与履约执行摘要']
const 详情标注 = 标注('oms.all-order.detail', '订单完整详情与分区导航', '订单处理与全渠道列表打开同一顶部详情页签。详情完整展示已有通用业务事实，分区导航只滚动定位，不卸载字段；长编号、地址、原因及商品标题完整换行。', '合理假设', 本轮引用, ['同一系统订单复用同一路径页签。', '完整性不表示展示数据库全部技术字段或平台专业字段，不恢复独立审核记录及已删除的按钮。'])
const 状态标注 = 标注('oms.all-order.detail.statuses', '平台状态与 OMS 状态分离', '平台订单状态、OMS 六态、仓库状态、标发状态各自展示；不以其中任一状态推算或覆盖另一状态。', '已确认', ['PRD/订单单据字段标准.md#61-订单头-oms_order'])
const 商品标注 = 标注('oms.all-order.detail.items', '全部商品行与金额', '逐行展示图片、来源行和商品 ID、平台 SKU 与规格、系统 SKU 与品名、映射结果、下单及可履约数量、单价、行金额和商品实收金额。缺失不按单价乘数量补造实收，零值保留；不分摊共享履约金额。', '合理假设', 本轮引用)
const 路由标注 = 标注('oms.all-order.detail.routing', '履约路由与全部关联执行', '订单保存路由与每张履约执行快照分别展示。包括历史履约与所有稳定关联仓单、标发单；共享单据数量标为整张单据，不作为本订单实际量、不分摊、不从状态反推数量。仓库库存沿用只读来源明细。', '合理假设', 本轮引用)
const 敏感信息标注 = 标注('oms.all-order.detail.masked-address', '完整收件信息默认脱敏', '原型仅用虚构脱敏信息；公司、县区、地址两行、手机、电话、邮箱和买家留言分别展示。明文权限、原因及审计待评审。', '待确认', ['PRD/订单单据字段标准.md#63-收件信息-oms_order_address', ...本轮引用])
const 日志标注 = 标注('oms.all-order.detail.operation-logs', '订单操作日志', '只展示已有操作时间、操作者、类型、结果及内容；无记录显示空态，不将审核轮次改名充当操作日志，不单独恢复审核记录分区。', '已确认', ['PRD/全渠道订单功能PRD.md#19-2026-09-14-详情页评审调整'])
const 追溯标注 = 标注('oms.all-order.detail.trace', '同步信息与时间口径', '已有时间按明确来源时区转为北京时间至秒；缺失显示—，无时区或非法时间显示时间待核实，悬停保留原值。同步与操作日志独立展示，不直接铺开原始报文。', '合理假设', 本轮引用)
</script>

<template>
  <article ref="页面" v-prototype="详情标注" class="详情页" @scroll.passive="同步导航">
    <div ref="页头" class="固定页头">
      <header class="详情头部">
        <div class="标题区">
          <div class="标题行"><h1>订单详情</h1><strong class="订单编号">{{ order.systemOrderNo }}</strong><ElTooltip content="复制系统订单号"><button type="button" class="复制按钮" aria-label="复制系统订单号" @click="复制系统订单号"><ElIcon><CopyDocument /></ElIcon></button></ElTooltip><OrderFlags :flags="当前标志" /></div>
          <p>{{ order.platformCode }}<span>·</span>{{ order.storeName }}<span>·</span>平台订单号 <b>{{ order.platformOrderNo }}</b></p>
        </div>
        <div v-prototype="状态标注" class="头部状态">
          <div><span>OMS 处理状态</span><b class="状态徽标" :class="'tone-' + OMS状态.tone">{{ OMS状态.text }}</b></div>
          <div><span>平台订单状态</span><b class="状态徽标" :class="'tone-' + 平台状态.tone">{{ 平台状态.text }}</b></div>
          <div class="头部金额"><span>订单总金额</span><strong>{{ 格式化金额(order.amount.orderAmount) }}</strong></div>
        </div>
      </header>
      <nav class="分区导航" aria-label="订单详情分区"><button v-for="区 in 分区" :key="区.id" type="button" :class="{ 当前: 当前分区 === 区.id }" :aria-current="当前分区 === 区.id ? 'location' : undefined" @click="跳转分区(区.id)">{{ 区.label }}</button><span>所有时间为北京时间</span></nav>
    </div>

    <main class="详情内容">
      <div v-if="处理说明.length" class="业务提示" :class="{ 阻断: Boolean(order.blockReason) }"><ElIcon><WarningFilled v-if="order.blockReason" /><InfoFilled v-else /></ElIcon><dl><div v-for="项 in 处理说明" :key="项.label"><dt>{{ 项.label }}</dt><dd>{{ 项.value }}</dd></div></dl></div>
      <div class="概览网格">
        <section data-section="basic" class="详情分区 基础卡"><div class="分区标题"><h2>订单信息</h2><span>{{ order.orderType }}</span></div><dl class="字段网格"><div v-for="项 in 基础字段" :key="项.label"><dt>{{ 项.label }}</dt><dd>{{ 项.value }}</dd></div></dl></section>
        <section data-section="recipient" v-prototype="敏感信息标注" class="详情分区 收件卡"><div class="分区标题"><h2>收件信息</h2><span class="锁定提示"><ElIcon><Lock /></ElIcon>默认脱敏</span></div><dl class="字段网格 收件字段"><div v-for="项 in 收件字段" :key="项.label" :class="{ 跨行: 项.wide }"><dt>{{ 项.label }}</dt><dd>{{ 项.value }}</dd></div></dl><div class="买家留言"><span>买家留言</span><p>{{ order.address.buyerMessage || '—' }}</p></div></section>
        <section data-section="amount" class="详情分区 金额卡"><div class="分区标题"><h2>金额信息</h2></div><dl class="金额明细"><div v-for="(项, 索引) in 金额字段" :key="项.label" :class="{ 总金额: 索引 === 0 }"><dt>{{ 项.label }}</dt><dd>{{ 格式化金额(项.value) }}</dd></div></dl></section>
      </div>

      <section data-section="times" class="详情分区"><div class="分区标题"><h2>时间信息</h2><span v-if="剩余时间" :class="{ 超时: 剩余时间.kind === 'overdue' }">剩余发货时间：{{ 剩余时间.text }}</span><span v-else>北京时间</span></div><dl class="字段网格 时间网格"><div v-for="项 in 时间字段" :key="项.label"><dt>{{ 项.label }}</dt><dd :title="项.source">{{ 格式化北京时间(项.source) }}</dd></div></dl></section>

      <section data-section="items" v-prototype="商品标注" class="详情分区"><div class="分区标题"><h2>商品信息</h2><span>共 {{ order.items.length }} 个商品行 · 全部展示</span></div>
        <ElTable :data="order.items" row-key="externalLineId" table-layout="fixed" class="明细表 商品表" empty-text="暂无订单商品">
          <ElTableColumn type="index" label="序号" width="52" />
          <ElTableColumn label="商品 / 平台信息" min-width="330"><template #default="{ row }"><div class="商品资料"><OrderProductImage :src="row.itemImageUrl" hover-preview /><div class="复合信息"><PlatformProductTitle :order="order" :item="row as 订单商品行" fallback="—" /><dl class="单元字段"><div><dt>平台 SKU</dt><dd>{{ row.platformSku || '—' }}</dd></div><div><dt>规格</dt><dd>{{ row.platformVariant || '—' }}</dd></div><div><dt>平台商品 ID</dt><dd>{{ row.platformItemId || '—' }}</dd></div><div><dt>平台订单行 ID</dt><dd>{{ row.externalLineId || '—' }}</dd></div></dl></div></div></template></ElTableColumn>
          <ElTableColumn label="系统商品 / 映射" min-width="205"><template #default="{ row }"><div class="复合信息"><strong>{{ row.systemItemName || '—' }}</strong><span class="等宽">{{ row.systemSku || '—' }}</span><b class="状态徽标" :class="'tone-' + 获取SKU状态说明(row.skuResolutionStatus).tone">{{ 获取SKU状态说明(row.skuResolutionStatus).text }}</b></div></template></ElTableColumn>
          <ElTableColumn label="数量" width="110" align="right"><template #default="{ row }"><dl class="单元字段 数量金额"><div><dt>下单</dt><dd>{{ row.orderedQuantity }}</dd></div><div><dt>可履约</dt><dd>{{ row.fulfillableQuantity ?? '—' }}</dd></div></dl></template></ElTableColumn>
          <ElTableColumn label="商品金额" min-width="225" align="right"><template #default="{ row }"><dl class="单元字段 数量金额"><div><dt>商品单价</dt><dd>{{ 格式化金额(row.unitPrice) }}</dd></div><div><dt>行金额</dt><dd>{{ 格式化金额(row.itemTotal) }}</dd></div><div><dt>商品实收金额</dt><dd>{{ 格式化金额(row.actualReceived) }}</dd></div></dl><span v-if="row.actualReceived" class="实收来源">实收来源：{{ row.actualReceivedSource === 'PLATFORM' ? '平台返回' : row.actualReceivedSource === 'OMS_ALLOCATED' ? 'OMS 已有分摊' : '—' }}</span></template></ElTableColumn>
        </ElTable>
      </section>

      <section data-section="fulfillment" v-prototype="路由标注" class="详情分区"><div class="分区标题"><h2>履约与物流</h2><ElButton v-if="order.fulfillmentMode === '自配送'" link type="primary" @click="库存打开 = true">查看仓库库存</ElButton><span v-else>平台履约</span></div>
        <dl class="字段网格 路由网格"><div v-for="项 in 路由字段(order.defaultRoute)" :key="项.label"><dt>{{ 项.label }}</dt><dd>{{ 项.value }}</dd></div></dl>
        <p v-if="order.fulfillmentMode === '平台履约'" class="空态">平台负责仓储与配送，OMS 自配送履约链路不适用。</p>
        <h3 class="子标题">履约单 <span>{{ order.fulfillmentOrders.length }} 张</span></h3>
        <ElTable :data="order.fulfillmentOrders" row-key="fulfillmentOrderNo" class="明细表 履约表" table-layout="fixed" empty-text="尚未创建履约单">
          <ElTableColumn label="履约单 / 范围" min-width="218"><template #default="{ row }"><div class="复合信息"><strong class="等宽">{{ row.fulfillmentOrderNo }}</strong><div class="内联状态"><b class="状态徽标" :class="row.isActive ? 'tone-info' : 'tone-neutral'">{{ row.status }}</b><span>{{ row.isActive ? '当前有效' : '历史版本' }}</span></div><span v-if="履约来源(row.fulfillmentOrderNo).length > 1" class="范围提示">共享履约 · 以下数量为整张履约单</span><span v-for="来源 in 履约来源(row.fulfillmentOrderNo)" :key="来源" class="等宽">来源：{{ 来源 }}</span></div></template></ElTableColumn>
          <ElTableColumn label="本次仓储物流" min-width="280"><template #default="{ row }"><dl class="单元字段"><div v-for="项 in 路由字段(row.route)" :key="项.label"><dt>{{ 项.label }}</dt><dd>{{ 项.value }}</dd></div></dl></template></ElTableColumn>
          <ElTableColumn label="履约数量" width="114" align="right"><template #default="{ row }"><dl class="单元字段 数量金额"><div><dt>计划</dt><dd>{{ row.plannedQuantity ?? '—' }}</dd></div><div><dt>有效出库</dt><dd>{{ row.shippedQuantity ?? '—' }}</dd></div></dl></template></ElTableColumn>
          <ElTableColumn label="发货信息" min-width="210"><template #default="{ row }"><dl class="单元字段 垂直字段"><div><dt>跟踪号</dt><dd>{{ row.trackingNumber || '—' }}</dd></div><div><dt>实际出库时间</dt><dd :title="row.shippedAt">{{ 格式化北京时间(row.shippedAt) }}</dd></div></dl></template></ElTableColumn>
        </ElTable>
        <h3 class="子标题">关联仓库出库单 <span>{{ 仓库执行.length }} 张</span></h3>
        <ElTable :data="仓库执行" row-key="出库单号" class="明细表 仓库执行表" table-layout="fixed" empty-text="暂无关联仓库执行记录">
          <ElTableColumn label="出库单 / 来源" min-width="270"><template #default="{ row }"><div class="复合信息"><strong class="等宽">{{ row.出库单号 }}</strong><dl class="单元字段 垂直字段"><div><dt>外部仓库单号</dt><dd>{{ row.外部仓库单号 || '—' }}</dd></div><div><dt>履约单号</dt><dd>{{ row.履约单号 }}</dd></div></dl><span v-for="来源 in row.订单号" :key="来源" class="等宽">来源：{{ 来源 }}</span><span v-if="row.订单号.length > 1" class="范围提示">共享仓单 · 数量为整张出库单</span><ElButton link type="primary" class="表内入口" @click="查看仓单(row.履约单号, row.出库单号)">查看仓库执行</ElButton></div></template></ElTableColumn>
          <ElTableColumn label="仓库执行状态" min-width="145"><template #default="{ row }"><div class="复合信息"><b class="状态徽标" :class="row.待核查 || ['下单失败', '出库异常'].includes(row.状态) ? 'tone-warning' : row.状态 === '已出库' ? 'tone-success' : 'tone-info'">{{ row.状态 }}</b><span v-if="row.待核查" class="待核查字">外部结果待核查</span><span :title="row.更新时间">{{ 格式化北京时间(row.更新时间) }}</span></div></template></ElTableColumn>
          <ElTableColumn label="出库事实" min-width="190"><template #default="{ row }"><dl class="单元字段 垂直字段"><div><dt>整单计划 / 有效出库</dt><dd>{{ row.出库事实?.planned ?? '—' }} / {{ row.出库事实?.shipped ?? '—' }}</dd></div><div><dt>跟踪号</dt><dd>{{ row.出库事实?.tracking || '—' }}</dd></div><div><dt>实际出库时间</dt><dd :title="row.出库事实?.shippedAt">{{ 格式化北京时间(row.出库事实?.shippedAt ?? undefined) }}</dd></div></dl></template></ElTableColumn>
          <ElTableColumn label="处理原因 / 结果说明" min-width="240"><template #default="{ row }"><span class="完整正文">{{ row.原因 || '—' }}</span></template></ElTableColumn>
        </ElTable>
        <h3 class="子标题">订单标发记录 <span>{{ 标发记录.length }} 张</span></h3>
        <ElTable :data="标发记录" row-key="no" class="明细表 标发表" table-layout="fixed" empty-text="暂无订单标发记录">
          <ElTableColumn label="标发单 / 履约单" min-width="210"><template #default="{ row }"><div class="复合信息"><ElButton link type="primary" class="表内入口 等宽" @click="查看标发(row.no)">{{ row.no }}</ElButton><span class="等宽">{{ row.fulfillmentNo }}</span><span class="等宽">订单行：{{ row.lineId }}</span></div></template></ElTableColumn>
          <ElTableColumn label="标发状态" width="120"><template #default="{ row }"><div class="复合信息"><b class="状态徽标" :class="row.status === '标发失败' ? 'tone-danger' : row.status === '标发成功' ? 'tone-success' : 'tone-info'">{{ row.status }}</b><span v-if="row.pendingVerification" class="待核查字">平台结果待核查</span></div></template></ElTableColumn>
          <ElTableColumn label="标发内容" min-width="245"><template #default="{ row }"><dl class="单元字段"><div><dt>承运商</dt><dd>{{ row.carrier || '—' }}</dd></div><div><dt>跟踪号</dt><dd>{{ row.tracking || '—' }}</dd></div><div><dt>标发数量</dt><dd>{{ row.quantity ?? '—' }}</dd></div><div><dt>发货时间</dt><dd :title="row.shippedAt">{{ 格式化北京时间(row.shippedAt) }}</dd></div></dl></template></ElTableColumn>
          <ElTableColumn label="结果 / 无需标发原因" min-width="260"><template #default="{ row }"><span class="完整正文">{{ row.reason || row.exemptionReason || '—' }}</span></template></ElTableColumn>
        </ElTable>
      </section>
      <section data-section="notes" class="详情分区"><OrderNotes :order-no="order.systemOrderNo" mode="detail" /></section>
      <section data-section="sync" v-prototype="追溯标注" class="详情分区"><div class="分区标题"><h2>同步信息</h2><b class="状态徽标" :class="'tone-' + 获取同步状态说明(order.sync.status).tone">{{ 获取同步状态说明(order.sync.status).text }}</b></div><dl class="字段网格 同步网格"><div><dt>最近成功时间</dt><dd :title="order.sync.lastSuccess">{{ 格式化北京时间(order.sync.lastSuccess) }}</dd></div><div><dt>最近尝试时间</dt><dd :title="order.sync.latestAttempt">{{ 格式化北京时间(order.sync.latestAttempt) }}</dd></div><div><dt>外部版本</dt><dd>{{ order.sync.externalVersion || '—' }}</dd></div><div><dt>标准化结果</dt><dd>{{ order.sync.normalizationStatus || '—' }}</dd></div></dl><p v-if="order.sync.message" class="同步说明 完整正文">{{ order.sync.message }}</p></section>
      <section data-section="logs" v-prototype="日志标注" class="详情分区"><div class="分区标题"><h2>订单操作日志</h2><span>{{ order.operationLogs.length }} 条</span></div><ElTable :data="order.operationLogs" table-layout="fixed" class="明细表 日志表" empty-text="暂无订单操作日志"><ElTableColumn label="操作时间" width="176"><template #default="{ row }"><span :title="row.operatedAt">{{ 格式化北京时间(row.operatedAt) }}</span></template></ElTableColumn><ElTableColumn prop="operator" label="操作人" width="116" /><ElTableColumn prop="operationType" label="操作类型" min-width="156" /><ElTableColumn label="操作结果" width="100"><template #default="{ row }"><b class="状态徽标" :class="'tone-' + (row.operationResult === '成功' ? 'success' : row.operationResult === '失败' ? 'danger' : 'info')">{{ row.operationResult }}</b></template></ElTableColumn><ElTableColumn prop="content" label="操作内容" min-width="310" /></ElTable></section>
    </main>
    <WarehouseInventoryDetails v-if="order.fulfillmentMode === '自配送'" v-model="库存打开" :row="库存作业" />
  </article>
</template>

<style scoped src="./订单详情样式.css"></style>
