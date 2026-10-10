<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, CircleCheck, Clock, CopyDocument, Document, InfoFilled, Refresh, Setting, Van, Warning } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElCheckbox, ElConfigProvider, ElDialog, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTag, ElTooltip } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { 原型标注 } from '@/类型/标注'
import type { 全渠道订单, 订单处理状态 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 当前版本, 审核阻断原因, 推单阻断原因, 执行演示审核, 执行演示推单, 核查演示仓库结果, 演示库存, 演示路由, type 命令结果 } from './演示会话'
import { 展示处理原因, 获取处理建议, 获取仓库结束提示 } from './处理提示展示'
import { 获取作业路由, 展示计划数量, 展示剩余数量, 命中作业关注, type 作业行, type 作业关注 } from './展示工具'
import { 共享标发单 } from '../订单标发/演示会话'
import { 标注状态 } from '@/原型标注/标注状态'
import WorkProductSummary from './作业商品摘要.vue'
import OrderNotes from './订单备注组件.vue'
import WarehouseChannelSelect from './仓库物流选择.vue'
import ActionSettings, { type 设置操作 } from './操作设置弹窗.vue'
import { 订单关联仓库执行, 同步演示仓库状态 } from './操作功能模型'
import { 路由仓库键, 查找所选仓库物流 } from './仓库物流选择模型'
import WarehouseInventoryDetails from './库存关联明细.vue'
import RecipientSummary from './收件信息摘要.vue'
import OrderFlags from './订单标志组件.vue'
import OrderAmountSummary from './订单金额摘要.vue'
import OrderTimeSummary from './订单时间摘要.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import ListSort from '@/组件/筛选/列表排序.vue'
import type { 列表排序条件, 搜索字段 } from '@/组件/筛选/筛选工具'
import { 计算订单标志, 合并来源订单标志 } from './订单标志模型'
import { 订单标志演示证据 } from './订单标志演示'
import { 获取平台状态说明 } from '../全渠道订单/订单工具'
import { 订单备注字数上限 } from './订单备注模型'
import { 修改仓库物流阻断原因, 不发货阻断原因, 执行演示修改仓库物流, 执行演示不发货, 执行批量备注 } from './批量操作模型'
import { 默认订单处理筛选, 获取作业来源订单, 命中订单处理筛选, 校验订单处理筛选, 排序订单处理作业, 订单处理剩余发货时间选项, type 订单处理日期类型 } from './筛选模型'

const { 标注模式 } = 标注状态

const router = useRouter()
const route = useRoute()
const 六态: 订单处理状态[] = ['待审核', '待推单', '待发货', '已发货', '异常', '不发货']
const 当前队列 = ref<订单处理状态>('待审核')
const 当前页 = ref(1)
const 每页条数 = ref(20)
const 高级筛选 = ref(false)
const 表格 = ref<{ clearSelection: () => void }>()
const 已选 = ref<作业行[]>([])
const 刷新时间 = ref('尚未手动刷新')
const 当前关注 = ref<作业关注>('全部')
const 标发记录 = (行: 作业行) => 共享标发单.value.find(单 => 单.fulfillmentNo === 行.fulfillment?.fulfillmentOrderNo && 单.orderNo === 行.order.systemOrderNo)
function 行标志(行: 作业行) {
  const 来源 = 行.fulfillment ? 共享订单.value.filter(订单 => 订单.fulfillmentOrders.some(履约 => 履约.isActive && 履约.fulfillmentOrderNo === 行.fulfillment!.fulfillmentOrderNo)) : [行.order]
  return 合并来源订单标志(来源.map(订单 => 计算订单标志(订单, 订单标志演示证据)))
}
const 阶段任务: Record<订单处理状态, string> = { 待审核: '校验商品 · 分仓选物流', 待推单: '提交仓库 · 核查接单', 待发货: '跟踪仓库 · 核对出库', 已发货: '核对物流 · 跟进标发', 异常: '停止发货 · 人工复核', 不发货: '核对终止原因与证据' }
const 关注配置: Record<订单处理状态, 作业关注[]> = { 待审核: ['全部', '可审核', '审核待处理'], 待推单: ['全部', '可推仓', '结果待核查', '下单失败'], 待发货: ['全部', '待出库', '部分出库', '出库异常', '取消中'], 已发货: ['全部', '待标发', '标发中', '标发失败', '标发成功', '无需标发', '无标发记录'], 异常: ['全部'], 不发货: ['全部'] }
const 默认筛选 = 默认订单处理筛选
const 筛选 = reactive(默认筛选())
const 已应用筛选 = reactive(默认筛选())
const 查询时刻 = ref(Date.now())
const 搜索类型选项: 搜索字段[] = [
  { value: 'platformOrderNo', label: '平台订单号' },
  { value: 'systemOrderNo', label: '系统订单号' }, { value: 'fulfillmentOrderNo', label: '履约单号' },
  { value: 'warehouseOrderNo', label: '仓库单号' }, { value: 'trackingNumber', label: '跟踪号' },
  { value: 'buyerExternalId', label: '买家 ID', kind: 'text' },
  { value: 'platformItemTitle', label: '平台商品名称', kind: 'text' }, { value: 'systemItemName', label: '系统商品名称', kind: 'text' },
  { value: 'platformSku', label: '平台 SKU' }, { value: 'systemSku', label: '系统 SKU' },
]
const 日期类型选项 = [{ value: 'orderedAt', label: '下单时间' }, { value: 'paidAt', label: '付款时间' }, { value: 'shipByAt', label: '最晚发货' }, { value: 'lastSyncedAt', label: '最近同步' }]
const 平台选项 = [{ value: 'eBay', label: 'eBay' }, { value: 'Temu', label: 'Temu' }, { value: 'Mercado Libre', label: '美客多' }, { value: 'Coupang', label: 'Coupang' }, { value: 'OZON', label: 'OZON' }, { value: 'TikTok Shop', label: 'TikTok Shop' }, { value: 'Rakuten', label: '乐天' }]
const 标志选项 = [{ value: 'REFUND', label: '退款（退）' }, { value: 'CANCEL', label: '取消（消）' }, { value: 'EBAY_MESSAGE', label: 'eBay 站内信（信）' }, { value: 'BUYER_NOTE', label: '买家留言（言）' }, { value: 'NONE', label: '当前无标志' }]
const 更多条件数量 = computed(() => [筛选.inventory, 筛选.remainingShippingTime].filter(值 => 值.length).length)
const 条件已修改 = computed(() => JSON.stringify(筛选) !== JSON.stringify(已应用筛选))
const 排序 = ref<列表排序条件>({ field: 'orderedAt', direction: 'desc' })
function 应用排序() { 当前页.value = 1; 清除选择() }

const 队列说明: Record<订单处理状态, string> = {
  待审核: '核对订单、现有 SKU 映射与库存结果，完成分仓及物流选择后审核。',
  待推单: '按履约单提交仓库；已受理的请求先核查结果，仓库明确建单后才进入待发货。',
  待发货: '跟踪仓库作业与实际出库；取得跟踪号、推仓成功均不等于已发货。',
  已发货: '按履约单核对有效出库事实及后续标发；标发失败不回退已发货。',
  异常: '查看平台变化和仓库执行，人工复核后操作不发货；平台恢复不自动退出异常。',
  不发货: '已确认无需 OMS 继续发货。区分最终取消与系统外履约，历史执行事实保留。',
}
const 当前单位 = computed(() => ['待推单', '待发货', '已发货'].includes(当前队列.value) ? '履约单' : '订单')
const 行路由 = 获取作业路由
const 路由字段 = (行: 作业行, 字段: 'warehouseProvider' | 'labelMode') => [...new Set(行路由(行).map(项 => 项[字段]).filter(Boolean))].join(' / ') || '—'
const 列表仓库 = (行: 作业行) => [...new Set(行路由(行).map(项 => 项.warehouse))].join(' / ') || '尚未分配仓库'
const 列表渠道 = (行: 作业行) => [...new Set(行路由(行).map(项 => 项.shippingChannel))].join(' / ') || '尚未分配渠道'
async function 复制编号(编号: string) {
  try { await navigator.clipboard.writeText(编号); ElMessage.success('编号已复制') }
  catch { ElMessage.warning('复制未完成，请选中编号手动复制') }
}
const 库存明细打开 = ref(false)
const 当前库存行 = ref<作业行>()
function 查看库存明细(行: 作业行) { 当前库存行.value = 行; 库存明细打开.value = true }
const 全部作业 = computed<作业行[]>(() => {
  const 结果: 作业行[] = []
  const 已有履约 = new Set<string>()
  for (const 订单 of 共享订单.value) {
    if (订单.fulfillmentMode !== '自配送' || !订单.processingStatus) continue
    if (['待审核', '异常', '不发货'].includes(订单.processingStatus)) {
      结果.push({ key: 订单.systemOrderNo, order: 订单, stage: 订单.processingStatus })
      continue
    }
    for (const 履约 of 订单.fulfillmentOrders.filter((项) => 项.isActive)) {
      if (已有履约.has(履约.fulfillmentOrderNo)) continue
      已有履约.add(履约.fulfillmentOrderNo)
      const 执行 = 仓库执行记录.value.find((项) => 项.履约单号 === 履约.fulfillmentOrderNo)
      const 阶段 = 订单.processingStatus
      结果.push({ key: 履约.fulfillmentOrderNo, order: 订单, fulfillment: 履约, execution: 执行, stage: 阶段 })
    }
    if (!订单.fulfillmentOrders.some(项 => 项.isActive)) { const 历史执行 = 订单关联仓库执行(订单); 结果.push({ key: 订单.systemOrderNo, order: 订单, stage: 订单.processingStatus, execution: 历史执行[历史执行.length - 1] }) }
  }
  return 结果
})
const 命中筛选 = (行: 作业行) => 命中订单处理筛选(行, 已应用筛选, { orders: 共享订单.value, executions: 仓库执行记录.value, inventory: 演示库存.value, flags: 订单 => 计算订单标志(订单, 订单标志演示证据), now: 查询时刻.value })
function 匹配来源订单(行: 作业行) {
  return 获取作业来源订单(行, 共享订单.value).filter(订单 => 命中订单处理筛选({ ...行, order: 订单 }, 已应用筛选, { orders: [订单], executions: 仓库执行记录.value, inventory: 演示库存.value, flags: 项 => 计算订单标志(项, 订单标志演示证据), now: 查询时刻.value }))
}
const 共享履约行 = (行: 作业行) => !!行.fulfillment && 获取作业来源订单(行, 共享订单.value).length > 1
const 筛选后作业 = computed(() => 全部作业.value.filter(命中筛选))
const 阶段作业 = computed(() => 筛选后作业.value.filter(行 => 行.stage === 当前队列.value))
const 关注命中 = (行: 作业行, 关注: 作业关注) => 命中作业关注(行, 关注, 资格原因(行), 标发记录(行)?.status)
const 当前结果 = computed(() => 排序订单处理作业(阶段作业.value.filter(行 => 关注命中(行, 当前关注.value)), (排序.value.field || 'orderedAt') as 订单处理日期类型, 排序.value.field ? 排序.value.direction : 'desc'))
const 关注数量 = (关注: 作业关注) => 阶段作业.value.filter(行 => 关注命中(行, 关注)).length
function 切换关注(关注: 作业关注) { 当前关注.value = 关注; 当前页.value = 1; 清除选择() }
const 当前页数据 = computed(() => 当前结果.value.slice((当前页.value - 1) * 每页条数.value, 当前页.value * 每页条数.value))
const 可选仓库 = computed(() => [...new Set(全部作业.value.flatMap(行 => 行路由(行).map(项 => 项.warehouse)).filter(Boolean))] as string[])
const 可选来源订单 = computed(() => [...new Map(全部作业.value.flatMap(行 => 获取作业来源订单(行, 共享订单.value)).map(订单 => [订单.systemOrderNo, 订单])).values()])
const 可选店铺 = computed(() => [...new Map(可选来源订单.value.filter(订单 => !筛选.platform.length || 筛选.platform.includes(订单.platformCode)).map(订单 => [订单.storeId, { value: 订单.storeId, label: 订单.storeName }])).values()])
const 可选渠道 = computed(() => [...new Map(全部作业.value.flatMap(行 => 行路由(行)).filter(路由 => !筛选.warehouse.length || 筛选.warehouse.includes(路由.warehouse) || (筛选.warehouse.includes('UNASSIGNED') && !路由.warehouse.trim())).filter(路由 => 路由.shippingChannelCode).map(路由 => [路由.shippingChannelCode, { value: 路由.shippingChannelCode, label: 路由.shippingChannel }])).values()])
const 仓库选项 = computed(() => [{ value: 'UNASSIGNED', label: '未分配仓库' }, ...可选仓库.value.map(value => ({ value, label: value }))])
const 渠道选项 = computed(() => [{ value: 'UNASSIGNED', label: '未分配渠道' }, ...可选渠道.value])
const 国家名称 = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
const 可选国家 = computed(() => [...new Set(可选来源订单.value.map(订单 => 订单.address.countryCode?.trim().toUpperCase()).filter(Boolean))].sort().map(代码 => ({ value: 代码, label: /^[A-Z]{2}$/.test(代码) ? `${国家名称.of(代码) || 代码} [${代码}]` : 代码 })))
watch(可选店铺, 店铺 => { 筛选.store = 筛选.store.filter(value => 店铺.some(项 => 项.value === value)) })
watch(渠道选项, 渠道 => { 筛选.channel = 筛选.channel.filter(value => 渠道.some(项 => 项.value === value)) })
const 批量操作配置 = computed(() => ({
  待审核: ['审核', '修改仓库物流', '增加备注', '不发货', '同步仓库状态'],
  待推单: ['推单', '重新推单', '同步仓库状态', '截单', '退回待审核', '增加备注', '不发货'],
  待发货: ['同步仓库状态', '截单', '退回待审核', '增加备注', '不发货'],
  已发货: ['同步仓库状态', '增加备注'],
  异常: ['同步仓库状态', '截单', '增加备注', '不发货'],
  不发货: ['同步仓库状态', '增加备注'],
})[当前队列.value])
const 操作设置 = ref<InstanceType<typeof ActionSettings>>()
const 同步中 = ref(false)
function 设置操作入口(类型: 设置操作, 行?: 作业行) { 操作设置.value?.open(类型, 行 ? [行] : 已选.value, !行) }
function 接收操作结果(类型: string, 结果: Array<{ key: string; result: 命令结果 }>) { 批次结果.value = 结果; 结果标题.value = `${类型}结果`; 结果打开.value = true; 清除选择() }
function 行关联执行(行: 作业行) { return [...new Map(获取作业来源订单(行, 共享订单.value).flatMap(订单关联仓库执行).filter(项 => !行.fulfillment || 项.履约单号 === 行.fulfillment.fulfillmentOrderNo).map(项 => [项.出库单号, 项])).values()] }
async function 同步仓库状态(行?: 作业行) {
  if (同步中.value) return
  const 范围 = 行 ? [行] : 已选.value
  if (!范围.length) return ElMessage.warning('请先勾选需要同步仓库状态的对象')
  const 执行 = [...new Map(范围.flatMap(行关联执行).map(项 => [项.出库单号, 项])).values()]
  if (!执行.length) return ElMessage.warning('暂无可查询的出库单，或查询所需单号不完整')
  同步中.value = true
  try {
    await nextTick()
    const 结果 = 执行.map(项 => ({ key: 项.出库单号, result: 同步演示仓库状态(项.出库单号) }))
    if (行 && 结果.length === 1) { const 项 = 结果[0]!.result; 项.成功 ? ElMessage.success(展示处理原因(项.信息)) : ElMessage.warning(展示处理原因(项.信息)) }
    else 接收操作结果('同步仓库状态', 结果)
  } finally { 同步中.value = false }
}
function 批量入口(操作: string) {
  if (操作 === '同步仓库状态') return void 同步仓库状态()
  if (操作 === '修改仓库物流' || 操作 === '增加备注') return 打开批量操作(操作 === '增加备注' ? '批量备注' : '修改仓库物流')
  设置操作入口(操作 as 设置操作)
}
type 来源动作 = '订单详情' | '增加备注' | '修改仓库物流' | '查看订单标发' | '查看终止原因'
const 来源窗口 = ref(false)
const 来源动作 = ref<来源动作>('订单详情')
const 来源目标行 = ref<作业行>()
const 目标来源 = ref('')
const 全部来源 = computed(() => 来源目标行.value ? 获取作业来源订单(来源目标行.value, 共享订单.value) : [])
const 备注控制 = ref<InstanceType<typeof OrderNotes>>()
const 备注订单号 = ref('')
const 记录订单 = ref<全渠道订单>()
const 终止窗口 = ref(false)
async function 执行来源动作(行: 作业行, 订单: 全渠道订单) {
  switch (来源动作.value) {
    case '订单详情': return 查看全渠道(订单)
    case '修改仓库物流': return 调整路由(订单)
    case '增加备注': 备注订单号.value = 订单.systemOrderNo; await nextTick(); return 备注控制.value?.open()
    case '查看终止原因': 记录订单.value = 订单; 终止窗口.value = true; return
    case '查看订单标发': return void router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { systemOrderNo: 订单.systemOrderNo } })
  }
}
function 选择来源操作(类型: 来源动作, 行: 作业行) {
  来源动作.value = 类型; 来源目标行.value = 行; 目标来源.value = ''
  const 来源 = 获取作业来源订单(行, 共享订单.value)
  if (来源.length === 1) return void 执行来源动作(行, 来源[0]!)
  来源窗口.value = true
}
function 确认来源() { const 订单 = 全部来源.value.find(项 => 项.systemOrderNo === 目标来源.value); if (!订单 || !来源目标行.value) return; 来源窗口.value = false; void 执行来源动作(来源目标行.value, 订单) }
function 行主要操作(行: 作业行): string[] {
  if (行.stage === '待审核') return ['审核', '修改仓库物流']
  if (行.stage === '待推单') return [行.execution?.状态 === '下单失败' ? '重新推单' : 行.execution ? '同步仓库状态' : '推单']
  if (行.stage === '待发货') return ['同步仓库状态']
  if (行.stage === '已发货') return ['查看订单标发']
  if (行.stage === '异常') return ['恢复发货', '不发货']
  return ['查看终止原因']
}
function 行更多操作(行: 作业行): string[] {
  const 操作: string[] = []
  if (行关联执行(行).length && !行主要操作(行).includes('同步仓库状态')) 操作.push('同步仓库状态')
  if (['待推单', '待发货', '异常'].includes(行.stage)) 操作.push('截单')
  if (['待推单', '待发货'].includes(行.stage)) 操作.push('退回待审核')
  if (['待审核', '待推单', '待发货'].includes(行.stage)) 操作.push('不发货')
  if (行.stage === '不发货') 操作.push('撤销不发货')
  if (行.stage !== '已发货') 操作.push('查看订单标发')
  return 操作
}
function 行操作入口(操作: string, 行: 作业行) {
  if (操作 === '同步仓库状态') return void 同步仓库状态(行)
  if (['审核', '推单', '重新推单', '截单', '退回待审核', '不发货', '恢复发货', '撤销不发货'].includes(操作)) return 设置操作入口(操作 as 设置操作, 行)
  选择来源操作(操作 as 来源动作, 行)
}
const 已选来源订单 = computed(() => {
  const 来源 = 已选.value.flatMap(行 => 行.fulfillment ? 共享订单.value.filter(订单 => 订单.fulfillmentOrders.some(履约 => 履约.isActive && 履约.fulfillmentOrderNo === 行.fulfillment!.fulfillmentOrderNo)) : [行.order])
  return [...new Map(来源.map(订单 => [订单.systemOrderNo, 订单])).values()]
})

function 资格原因(行: 作业行) {
  if (行.stage === '待审核') return 审核阻断原因(行.order, 演示库存.value[行.order.systemOrderNo] ?? '充足')
  if (行.stage === '待推单' && 行.fulfillment) return 推单阻断原因(行.order, 行.fulfillment.fulfillmentOrderNo)
  return [行.order.blockReason ?? 行.order.noShipmentReason ?? '当前阶段仅查看执行事实']
}
function 清除选择() { 已选.value = []; 表格.value?.clearSelection() }
function 查询() {
  const 错误 = 校验订单处理筛选(筛选)
  if (错误) { ElMessage.warning(错误); return }
  查询时刻.value = Date.now()
  Object.assign(已应用筛选, Object.fromEntries(Object.entries(筛选).map(([字段, 值]) => [字段, Array.isArray(值) ? [...值] : 值])))
  切换关注('全部')
}
function 重置() { Object.assign(筛选, 默认筛选()); 排序.value = { field: 'orderedAt', direction: 'desc' }; 查询() }
watch([当前队列, 当前页, 每页条数], 清除选择)
watch(每页条数, () => { 当前页.value = 1 })
watch(当前队列, () => { 当前页.value = 1; 当前关注.value = '全部' })
watch(() => route.query.systemOrderNo, (编号) => {
  if (typeof 编号 !== 'string') return
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 编号)
  if (订单?.processingStatus) 当前队列.value = 订单.processingStatus
  Object.assign(筛选, 默认筛选())
  筛选.searchType = 'systemOrderNo'; 筛选.searchMatch = 'exact'; 筛选.keyword = 编号; 查询()
}, { immediate: true })
function 刷新() { 查询时刻.value = Date.now(); 刷新时间.value = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); 当前页.value = 1; 清除选择(); ElMessage.success('订单列表已刷新') }
function 查看全渠道(订单: 全渠道订单) { router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: 订单.systemOrderNo } }) }
function 查看执行(行: 作业行, 目标: '仓库' | '标发' | '物流' = '仓库') {
  const 路径 = 目标 === '仓库' ? '/oms/warehouse-delivery/outbound-orders' : 目标 === '标发' ? '/oms/self-fulfillment/shipping-confirmation' : '/oms/warehouse-delivery/logistics-orders'
  router.push({ path: 路径, query: { fulfillmentOrderNo: 行.fulfillment?.fulfillmentOrderNo, systemOrderNo: 行.order.systemOrderNo } })
}
const 详情打开 = ref(false)
const 当前详情 = ref<作业行>()
function 查看履约摘要(行: 作业行) { 当前详情.value = 行; 详情打开.value = true }
const 详情执行列表 = computed(() => 仓库执行记录.value.filter(项 => 当前详情.value?.fulfillment ? 项.履约单号 === 当前详情.value.fulfillment.fulfillmentOrderNo : 项.订单号.includes(当前详情.value?.order.systemOrderNo ?? '')))
const 详情执行 = computed(() => 详情执行列表.value[0])
function 下一步(行: 作业行): string { return 获取处理建议(行, 资格原因(行), 标发记录(行)?.status) }
const 默认原因: Record<订单处理状态, string> = { 待审核: '当前发货条件齐备', 待推单: '当前推单条件齐备', 待发货: '等待仓库出库结果', 已发货: '请核对仓库出库与平台标发结果', 异常: '异常原因待核实', 不发货: '不发货原因待核实' }
function 原因正文(行: 作业行): string {
  const 结束提示 = 获取仓库结束提示(行)
  if (结束提示) return 结束提示.原因
  const 系统原因 = 行.execution?.原因 || 行.order.blockReason
  if (系统原因) return 展示处理原因(系统原因)
  // 人工填写的不发货原因按原文展示。
  if (行.order.noShipmentReason) return 行.order.noShipmentReason
  return 展示处理原因((行.stage === '待审核' || 行.stage === '待推单' ? 资格原因(行).join('；') : '') || 默认原因[行.stage])
}
const 详情步骤 = computed(() => {
  const 行 = 当前详情.value
  if (!行) return []
  const 已审 = 行.order.reviews.some(项 => 项.status === '已通过')
  const 仓单 = 详情执行列表.value
  const 已建仓 = !!仓单.length && 仓单.every(项 => !!项.外部仓库单号)
  const 已出库 = 行.fulfillment ? 行.fulfillment.shippedQuantity >= 行.fulfillment.plannedQuantity && 行.fulfillment.plannedQuantity > 0 : 行.order.processingStatus === '已发货'
  const 标发 = 标发记录(行)
  return [{ 标题: '订单审核', 内容: 已审 ? '已有通过记录' : '无通过记录', 完成: 已审 }, { 标题: '仓库接单', 内容: 已建仓 ? '已有外部仓库单号' : 仓单.length ? '查看执行结果' : '尚未提交', 完成: 已建仓 }, { 标题: '实际出库', 内容: 已出库 ? '已有足量出库事实' : 行.fulfillment?.shippedQuantity ? `已出库 ${行.fulfillment.shippedQuantity} / ${行.fulfillment.plannedQuantity} 件` : '无有效出库事实', 完成: 已出库 }, { 标题: '平台标发', 内容: 标发?.status ?? '暂无标发记录', 完成: 标发?.status === '标发成功' }]
})

const 结果打开 = ref(false)
const 结果标题 = ref('批次结果')
const 批次结果 = ref<Array<{ key: string; result: 命令结果 }>>([])
const 批次执行中 = ref(false)
const 是跳过 = (结果: 命令结果) => 结果.信息.startsWith('已跳过：')
const 结果统计 = computed(() => ({ 总数: 批次结果.value.length, 成功: 批次结果.value.filter((项) => 项.result.成功 && !项.result.待核查).length, 失败: 批次结果.value.filter((项) => !项.result.成功 && !是跳过(项.result)).length, 跳过: 批次结果.value.filter(项 => 是跳过(项.result)).length, 处理中: 批次结果.value.filter((项) => 项.result.成功 && 项.result.待核查).length, 待核查: 批次结果.value.filter((项) => 项.result.待核查).length }))
function 导出结果() {
  const 内容 = ['对象号\t结果\t原因', ...批次结果.value.map((项) => `${项.key}\t${是跳过(项.result) ? '跳过' : 项.result.成功 ? 项.result.待核查 ? '处理中' : '成功' : '失败'}\t${展示处理原因(项.result.信息)}`)].join('\n')
  const 地址 = URL.createObjectURL(new Blob(['\uFEFF', 内容], { type: 'text/tab-separated-values;charset=utf-8' }))
  const 链接 = document.createElement('a'); 链接.href = 地址; 链接.download = '订单处理批次结果.tsv'; 链接.click(); URL.revokeObjectURL(地址)
}
type 批量操作类型 = '批量备注' | '修改仓库物流'
const 批量操作打开 = ref(false)
const 批量操作类型 = ref<批量操作类型>('批量备注')
const 批量操作目标 = ref<Array<{ order: 全渠道订单; version: number; reasons: string[]; selected: boolean }>>([])
const 批量操作草稿 = reactive({ content: '', warehouse: '', code: '', reason: '' })
const 批量所选路由 = computed(() => 查找所选仓库物流(演示路由, 批量操作草稿.warehouse, 批量操作草稿.code))
const 批量可处理数量 = computed(() => 批量操作目标.value.filter(目标 => 目标.selected && !目标.reasons.length).length)
const 批量表单有效 = computed(() => {
  if (!批量可处理数量.value) return false
  if (批量操作类型.value === '批量备注') return !!批量操作草稿.content.trim()
  return !!批量操作草稿.reason.trim() && !!批量所选路由.value
})
function 打开批量操作(类型: 批量操作类型) {
  if (!已选来源订单.value.length) return ElMessage.warning('请先勾选当前页订单')
  批量操作类型.value = 类型
  批量操作目标.value = 已选来源订单.value.map(order => ({ order, selected: true, version: 当前版本(order.systemOrderNo), reasons: 类型 === '修改仓库物流' ? 修改仓库物流阻断原因(order) : [] }))
  Object.assign(批量操作草稿, { content: '', warehouse: '', code: '', reason: '' })
  批量操作打开.value = true
}
async function 确认批量操作() {
  if (批次执行中.value || !批量表单有效.value) return
  批次执行中.value = true
  try {
    await nextTick()
    if (!批量操作打开.value) return
    批次结果.value = 批量操作类型.value === '批量备注'
      ? 执行批量备注(批量操作目标.value.filter(目标 => 目标.selected).map(目标 => 目标.order.systemOrderNo), 批量操作草稿.content)
      : 批量操作目标.value.filter(目标 => 目标.selected).map(({ order, version }) => ({ key: order.systemOrderNo, result: 修改仓库物流阻断原因(order).length ? { 成功: false, 信息: '已跳过：' + 修改仓库物流阻断原因(order).join('；') } : order.defaultRoute?.shippingChannelCode === 批量操作草稿.code ? { 成功: false, 信息: '已跳过：仓库物流未变化，无需重复修改' } : 执行演示修改仓库物流(order.systemOrderNo, version, 批量操作草稿.code, 批量操作草稿.reason) }))
    结果标题.value = `${批量操作类型.value}结果`
    批量操作打开.value = false; 结果打开.value = true; 清除选择()
  } finally { 批次执行中.value = false }
}

const 路由打开 = ref(false)
const 路由目标 = ref<全渠道订单>()
const 路由版本 = ref(0)
const 路由草稿 = reactive({ warehouse: '', code: '', reason: '' })
const 所选路由 = computed(() => 查找所选仓库物流(演示路由, 路由草稿.warehouse, 路由草稿.code))
function 调整路由(订单: 全渠道订单) {
  if (订单.processingStatus !== '待审核') return
  路由目标.value = 订单; 路由版本.value = 当前版本(订单.systemOrderNo)
  路由草稿.warehouse = 订单.defaultRoute ? 路由仓库键(订单.defaultRoute) : ''
  路由草稿.code = 订单.defaultRoute?.shippingChannelCode ?? ''; 路由草稿.reason = ''; 路由打开.value = true
}
function 保存路由() {
  const 订单 = 路由目标.value
  if (!订单 || !所选路由.value || !路由草稿.reason.trim()) return ElMessage.warning('请选择有效仓库物流并填写修改原因')
  const 结果 = 执行演示修改仓库物流(订单.systemOrderNo, 路由版本.value, 路由草稿.code, 路由草稿.reason)
  if (!结果.成功) return ElMessage.error(展示处理原因(结果.信息))
  路由打开.value = false; ElMessage.success('已保存仓库物流，订单仍为待审核')
}

const 创建标注 = (id: string, 标题: string, 说明: string, 分类: '页面' | '字段' | '交互' | '规则' | '待确认', 其他: Partial<原型标注> = {}): 原型标注 & { 分类: string } => ({ id: `oms.processing.${id}`, 标题, 说明, 分类, 事实等级: '已确认', 版本: '2026-09-23', 锚点: `oms.processing.${id}`, 状态: '待评审', 路由: '/oms/self-fulfillment/processing', prd引用: ['PRD/订单处理功能PRD.md'], ...其他 })
const 标注 = {
  金额: 创建标注('amount-fields', '订单层六项金额', '按字段名称在前、值在后展示订单总金额、客付运费、客付税费、交易费、平台补贴和其他费用；缺值显示 —，不补零。', '字段', { 版本: '2026-10-09', 数据来源: ['标准订单已有 amount 六项字段；各金额保留自身币种。'], 系统动作: ['履约单行显示来源订单金额，不分摊、不计算利润或新增折扣及实付字段。'], 验收要点: ['订单总金额名称在值前；明确零值显示 0.00，未知金额为 —；来源订单金额范围清晰。'], prd引用: ['PRD/订单单据字段标准.md#64-订单金额明细-oms_order_amount', 'PRD/订单处理功能PRD.md#73-默认列表信息'] }),
  时间: 创建标注('time-fields', '北京时间与剩余发货时间', '时间表头小号注明所有时间均为北京时间；时间值显示完整年月日时分秒。未完成发货的订单显示距最晚发货时间的剩余时长，到期红色显示已超时。', '字段', { 版本: '2026-10-09', 数据来源: ['标准订单 orderedAt、paidAt、shipByAt，履约 shippedAt 与仓库回传时刻。'], 系统动作: ['显式来源时区转换至 Asia/Shanghai，原始时间保留；每秒刷新显示，不改变订单状态、审核资格或 urgency。', '已发货及不发货停止倒计时，分别显示已发货及无需发货；这是本轮合理展示方案。'], 异常处理: ['缺值显示 —；非法值或无法确定来源时区时显示时间待核实，不补截止时间。'], 验收要点: ['跨时区完整日期秒正确；截止相等或已过期红字已超时；倒计时动态更新并在卸载清理。'], prd引用: ['PRD/订单处理功能PRD.md#73-默认列表信息'] }),
  收件: 创建标注('recipient-summary', '逐字段收件信息', '列表逐行显示国家 / 地区、省 / 州、城市、邮编、收件人、电话及邮箱，隐藏详细地址；订单详情与履约摘要仍显示完整脱敏地址。', '字段', { 版本: '2026-10-09', 数据来源: ['共享订单 address 的脱敏字段；国家名称按有效国家代码本地显示。'], 系统动作: ['缺值显示 —，不补联系人或联系方式，不解密、不提供第二套编辑入口。'], 验收要点: ['长地址、邮箱和缺失字段可读；列表与订单详情同源；无页面级横向溢出。'], prd引用: ['PRD/订单处理功能PRD.md#21-2026-10-09-本地备注与关联明细评审'] }),
  数量库存: 创建标注('inventory-quantity', '库存校验与待发数量', '商品区与履约执行摘要隐藏可履约数量，只显示下单数量；底层字段及审核、标发引用保留。库存校验仅为本地虚构样例结果，不是仓库可用库存数量；待发数量仍按订单商品可履约数量汇总，已有履约单则读取计划发货数量。', '字段', { 事实等级: '合理假设', 版本: '2026-10-09', 数据来源: ['演示库存中的充足 / 不足 / 结果未知；标准订单商品 fulfillableQuantity；履约单 plannedQuantity。'], 系统动作: ['未创建履约单时显示待发数量，任一商品数量未知或无商品行则显示待核实；已有履约计划优先，并保留明确零值。', '点击库存校验查看系统 SKU 配对的仓库 SKU、逐来源可用数量及同来源在库批次最大库龄；当前为虚构关联样例，真实接口仍须联调，不增加占用或释放。'], 异常处理: ['未知数量不按零合计，不以本地充足结果冒充实际仓库可用库存。'], 验收要点: ['待审核待发量与审核后计划发货量名称不同；部分履约未知量、明确零值保留；虚构数据及接口边界由原型标注记录，普通界面不显示开发说明。'], prd引用: ['PRD/订单处理功能PRD.md#213-关联库存及最大库龄', 'PRD/4PX海外仓对接PRD.md#18-订单处理关联展示'] }),
  列表: 创建标注('list-fields', '订单处理列表信息分组', '复用全渠道共享字段，补齐商品、收件、金额、时间与买家留言；本地备注沿用已有模型追加，库存关联只读展示；不新增订单主数据或库存账。', '页面', { 事实等级: '合理假设', 版本: '2026-10-09', 数据来源: ['共享标准订单、商品行与脱敏地址；现有路由、履约单、仓库执行及独立标发单。'], 系统动作: ['订单与履约单的主行粒度保持不变；履约单行的商品和金额标明来源订单，不按履约计划分摊。', '商品默认首行，可展开全部来源商品；每行显示商品单价及商品实收金额，分别读取 unitPrice 和 actualReceived，保留各自币种、零值及缺失值，不反算；不显示成功映射提示，仅未取得系统 SKU 的商品显示未匹配系统 SKU；仅调整展示，不改变共享映射及审核资格。固定身份与操作列，窄屏在表格内部横向滚动。', '时间统一转换为北京时间并显示完整年月日时分秒，不带时区后缀；按当前时刻显示剩余发货时间，到期红色显示已超时。付款时间不代替付款状态，未知金额与截止不补零或推算。'], 异常处理: ['本地备注按订单共享追加；库存关联使用明确标识的独立虚构样例，不作为真实库存或审核事实。利润、重量本轮不引入。', '异常及不发货订单的路由复用全部当前有效路由摘要，关联执行在订单详情中逐条核对。'], 验收要点: ['多商品与拆单范围清晰；三种桌面宽度、长编号、缺失值及标注模式无页面级横溢。'], prd引用: ['PRD/订单处理功能PRD.md#73-默认列表信息'] }),
  关注: 创建标注('work-focus', '阶段作业关注', '按当前阶段筛选可审核、待处理、待核查、失败或部分出库。关注标签只改变列表范围，不增加业务状态。', '交互', { 事实等级: '合理假设', 触发方式: ['点击阶段卡片后点击关注标签。'], 系统动作: ['阶段数量按已应用查询条件统计，关注标签只筛选本阶段列表。', '切换阶段、查询或重置时清除关注和已选项；关注标签可以重叠，数量不能相加。'], 验收要点: ['查询后计数一致，切换关注清空选择；部分出库不显示整单已发货。'], prd引用: ['PRD/订单处理功能PRD.md#18-2026-09-23-完整发货链路界面优化'] }),
  进度: 创建标注('shipment-progress', '实际出库与平台回传', '待发货和已发货优先展示计划、实际出库、剩余数量、跟踪号及时间；平台标发读取独立标发单。', '字段', { 事实等级: '合理假设', 数据来源: ['共享履约单的 plannedQuantity、shippedQuantity、trackingNumber、shippedAt；关联仓库执行与标发单。'], 系统动作: ['缺失跟踪号或标发记录如实显示，不依据渠道名称猜测承运商，不推算出库时间。'], 异常处理: ['已发数量超过计划时显示数量待核查；部分出库仍保留剩余范围。', '没有标发记录不等于无需标发；平台标发失败不回退已发货。'], 验收要点: ['无跟踪号、部分出库、已有出库但标发失败分别展示。'], prd引用: ['PRD/订单处理功能PRD.md#op-04待发货跟踪', 'PRD/订单处理功能PRD.md#op-05已发货与履约闭环'] }),
  队列: 创建标注('queues', '六态队列与对象粒度', '普通模式使用状态名称与数量组成的 Tab；标注模式使用阶段卡片及说明。两者共用队列、筛选与数量，不改变对象粒度。待推单、待发货、已发货以履约单为主行，其余以系统订单为主行。', '页面', { 前置条件: ['已有标准订单及已确认的处理状态。'], 触发方式: ['点击六态页签或标注模式阶段卡片。'], 交互规则: ['用户评审确认：普通模式隐藏阶段任务、序号与解释性提示，删除顶部标题整行及订单规则快捷入口；标注模式保留阶段卡片与解释。', '开关标注只改变展现方式，保留当前队列、查询条件与已选范围。'], 系统动作: ['切换阶段并清空选择；通过有效履约路径派生作业行，不新增同名六态字段。'], 成功结果: ['页签明确数量单位；履约单号去重。'], 异常处理: ['处理状态为空及平台履约不进入队列；多履约单聚合、部分出库仍按提案演示。'], 验收要点: ['验证待审核订单粒度、待推单履约粒度及空态。'], prd引用: ['PRD/订单处理功能PRD.md#72-页签数量与行粒度', 'PRD/订单处理功能PRD.md#185-界面评审修订普通模式与标注模式'] }),
  筛选: 创建标注('filters', '多选查询与排序', '平台、店铺、仓库、渠道、国家和标志使用紧凑多选；更多条件仅库存校验与剩余发货时间，删除 SKU 解析筛选。剩余时间按最晚发货截止与本次查询时刻比较，提供已超时、不足12/24/36/48小时及大于48小时；不读取业务 urgency。仅查询，不改变六态与履约事实。', '交互', { 事实等级: '合理假设', 版本: '2026-10-09', 触发方式: ['多选弹层支持搜索、当前可见项全选、取消与确定；确认写入筛选草稿，点击查询或 Enter 才应用。', '多行搜索切换为精确模式并查询；排序弹层确认立即重排当前结果，取消不提交。'], 系统动作: ['分类条件内为 OR，字段间为 AND；平台多选联动店铺、仓库多选联动渠道；来源订单、商品行与路由条件不跨来源拼接。', '默认平台订单号模糊搜索，其他编号、买家 ID 和商品字段从同一下拉切换；多行精确搜索去重后最多 1000 项，超限不截断。', '日期按北京时间含起止秒，默认不限时间；快捷日期及日历按钮均中文；近 N 天含今天，最近2月为上月1日至今天。', '默认按下单时间晚到早；下单、付款、最晚发货、最近同步可早到晚或晚到早，缺失及非法时间始终排末尾，同刻按主行编号稳定排序；履约行仍使用代表来源的时间，不虚构聚合时间。', '查询与重置清空勾选和关注并回第一页，排序确认只清勾选并回第一页；重置恢复默认字段、模式、条件及排序。共享履约操作范围保持原有全部来源。'], 异常处理: ['无效、倒序、不完整日期或精确搜索超限时保留上次已应用结果；无可信时区的来源时间不推算。', '更多条件折叠仍生效，库存继续为虚构样例结果；当前筛选和排序的具体组合语义为本轮实现方案。'], 验收要点: ['多选取消及外部关闭不提交；切换依赖剔除失效店铺或渠道；多行搜索的计数、结果及模式一致。', '中文年、月、星期、快捷按钮和确定可用；1280、1440、1920 及标注侧栏下控件按组换行，无页面级横溢。'], prd引用: ['PRD/订单处理功能PRD.md#31-2026-10-09-订单处理九项批注评审', 'PRD/列表筛选组件规范.md', 'PRD/订单处理功能PRD.md#28-2026-10-09-多选筛选统一搜索与排序纠正', 'PRD/订单标志功能PRD.md'] }),
  批量: 创建标注('batch', '批量审核 / 推单资格预检', '当前页选择先冻结对象与版本，再展示可执行及阻断原因，确认后逐项复核；不同业务对象不共用选择键。批量范围与权限为待评审提案。', '交互', { 事实等级: '合理假设', 前置条件: ['选中当前页至少一项待审核订单或待推单履约单。'], 触发方式: ['勾选后点击批量审核 / 批量推单。'], 系统动作: ['显示作用对象、当前版本、资格原因和影响；用户确认后逐对象调用会话内演示命令。'], 成功结果: ['返回成功、失败、处理中、待核查及逐项结果；跨模块共用订单事实。'], 异常处理: ['版本冲突不执行；单项失败不回滚成功项；待核查禁止盲目重试。'], 验收要点: ['混合合格 / 不合格对象、重复点击、跨页清选及结果下载。'], 版本: '2026-10-10', prd引用: ['PRD/订单处理-操作功能PRD.md#3-六态操作矩阵', 'PRD/订单处理-操作功能PRD.md#4-操作设置与确认方式'] }),
  批量扩展: 创建标注('batch-actions', '左侧批量操作与订单级结果', '移除订单总数文字，左侧放主操作、批量备注、修改仓库物流及不发货；仅操作当前页勾选范围，按订单、履约单或出库单去重后预检并确认。', '交互', { 事实等级: '合理假设', 版本: '2026-10-09', 前置条件: ['勾选当前页对象；待审核主按钮为批量审核，待推单沿用批量推单。'], 触发方式: ['点击批量备注、修改仓库物流或不发货，核对订单范围及原因后确认。'], 系统动作: ['备注逐来源系统订单追加，不写普通日志或改变版本。修改仓库物流仅改待审核订单头；当前有效履约、未结束或待核查执行阻断，已结束历史仍保留；原因及版本逐单复核。', '不发货须人工确认无需继续发货、全部历史履约出库为零且无未结束／待核查仓库执行；共享路径或未知事实阻断。仅终止本地有效计划，不模拟仓库撤单，保留原阻断证据与全部执行历史。'], 成功结果: ['逐单返回结果，成功项不因其他项失败回滚；备注及状态在订单详情共享。'], 异常处理: ['无选择禁用；非待审核不开放改路由，终态不开放再次不发货；部分出库、共享履约、未结束请求和版本冲突跳过。'], 验收要点: ['空选择、去重、多项部分成功、取消零写入、版本重验、历史出库和在途执行保护。'], prd引用: ['PRD/订单处理-操作功能PRD.md#22-批量方式', 'PRD/订单处理功能PRD.md#26-2026-10-09-批量操作栏与商品金额评审'] }),
  路由: 创建标注('default-route', '发货仓库与物流渠道联动选择', '待审核阶段写入订单头仓库、服务商、账号、物流渠道及面单模式；保存路由不会推进状态，审核通过后履约单固化执行快照。', '字段', { 版本: '2026-10-10', 前置条件: ['订单处于待审核，无取消或订单级阻断。'], 触发方式: ['先选择发货仓库，再选择该服务商、账号和仓库内的物流渠道；切换仓库清空原渠道，再填写修改原因。'], 系统动作: ['校验期望版本并保存前后路由与操作者、原因。'], 成功结果: ['订单仍为待审核，默认路由同步到全渠道详情。'], 异常处理: ['缺失路由、无原因或订单版本变化不能保存。'], 验收要点: ['未分仓订单先保存路由再审；审核后的快照不随订单头变更。'], prd引用: ['PRD/订单处理功能PRD.md#33-2026-10-10-增加备注历史与仓库渠道分开选择', 'PRD/物流渠道管理功能PRD.md#7-订单执行衔接'] }),
  审核: 创建标注('review', '审核轮次与结果', '已进入待审核表示通过首次准入；本地审核校验商品行、既有履约、现有 SKU 映射及库存结果，每轮只保存一段 decision_note。eBay 订单级 PAID 由平台适配链路判断，paidAt 仅展示、不得替代当前状态；履约 IN_PROGRESS 由用户配置规则拦截并交人工核实范围。', '规则', { 前置条件: ['订单已进入待审核；审核通过前须由平台适配链路确认当前订单级 PAID，并确认默认路由及剩余可履约数量。'], 触发方式: ['系统审核规则执行；单行审核或批量审核预检确认。本地固定样例只演示规则命中结果。'], 系统动作: ['命中 IN_PROGRESS 规则时保留待审核并写入审核摘要，不自动进入异常或清空状态，不生成整单履约。', '重新检查版本和发货条件；全部通过后才增加有效履约单及明细，订单转待推单。'], 成功结果: ['全渠道订单详情同步展示审核摘要；只有通过审核才产生执行快照。'], 异常处理: ['部分履约样例的人工解除、已履约范围核实与剩余数量处置尚未实现，不能自动通过后发整单。', 'SKU / 地址 / 库存正式分流与人工权限仍待确认；人工强制通过、SKU 配对和库存同步不在这里提供。'], 验收要点: ['部分履约样例保留待审核、提示人工核实且不可审核通过；无 OMS 履约单或仓库执行。', '付款时间缺失不产生付款门禁；平台非 PAID 新单不进入处理，准入后非 PAID 更新先转异常。', '通过、SKU 未识别、库存未知、无路由、已取消及已有履约不重复建单。'], prd引用: ['PRD/订单处理功能PRD.md#op-02待审核处理'] }),
  仓库: 创建标注('warehouse', '推仓受理和仓库明确结果', '推单生成独立仓库出库记录，受理仅进入下单中；核查取得外部仓库单号等明确建仓证据后，才聚合为待发货。', '规则', { 前置条件: ['当前有效履约、审核通过、完整路由，且无阻断或已有待核查请求。'], 触发方式: ['点击推单或重新推单并确认；点击同步仓库状态读取仓库事实。'], 系统动作: ['演示生成下单中记录；本地核查正常样例返回待出库，固定超时样例继续等待。'], 成功结果: ['三方仓出库页能按履约单查看相同执行对象；请求受理不提前推进订单。'], 异常处理: ['明确拒绝保持下单失败；结果未确认保持下单中，禁止重复推仓。'], 验收要点: ['已受理、明确建单、固定待核查与失败原因。'], prd引用: ['PRD/订单处理功能PRD.md#op-03待推单处理'] }),
  证据: 创建标注('evidence', '订单详情统一页签与履约摘要', '订单详情与系统订单号统一打开同一全渠道完整详情页签；详细地址在详情查看。履约单号保留右侧履约执行摘要。', '交互', { 事实等级: '合理假设', 版本: '2026-10-09', 触发方式: ['点击蓝色订单详情或系统订单号打开同一全渠道详情页签；点击履约单号打开履约执行摘要。'], 系统动作: ['普通界面将已知系统开发措辞转换为业务文案，源原因、审核摘要和日志原文保留；未知原因不按关键词删除，留言及备注不转换。右侧抽屉展示同一共享订单的处理事实，商品、金额和地址只读；阶段操作仍走既有命令。系统订单号及订单详情进入同一全渠道新页签；完整详情复用共享备注全文与标志。履约单号打开本次履约执行摘要抽屉；关联执行按稳定履约单号跳转。'], 成功结果: ['不复制可编辑商品、金额和地址；不产生第二套订单主数据。'], 异常处理: ['没有关联执行时解释尚未创建。'], 验收要点: ['审核后跳全渠道详情能读到最新状态与审核摘要。'] }),
  发货条件: 创建标注('terminal-gates', '平台变化转异常与人工不发货', 'eBay 已进入订单处理且当前为待审核、待推单、待发货时，cancelStatus.cancelState=IN_PROGRESS/CANCELED 或准入后 orderPaymentStatus 从 PAID 变为 PENDING/FAILED/PARTIALLY_REFUNDED/FULLY_REFUNDED，转为异常，停止后续发货，交人工复核。已发货、不发货保持不变；异常不因平台恢复自动退出。', '规则', { 版本: '2026-10-09', 前置条件: ['订单已经准入；未准入的非 PAID 或取消中新单仍只保留全渠道事实。'], 系统动作: ['记录原阶段、平台前后值、异常原因及来源。仅 FULFILLED 更新交订单标发核对，不直接改处理状态。', '人工复核确认不再发货、OMS 发货量为零且无未结束仓库执行后，操作不发货才转换。'], 异常处理: ['取消中不写最终取消原因/时间，CANCELED 才保存最终取消事实；进入异常不等于仓库撤单成功。', '本地已增加受控不发货预检、确认和逐项结果；实时平台增量、生产权限、原因码及仓库撤单仍未接入。'], 验收要点: ['取消中样例在异常队列且不能审核，无最终取消原因/时间；人工不发货不补造最终取消事实。', '首次部分履约仍在待审核由规则拦截；已有出库、不发货终态及待核查请求不被覆盖。'], prd引用: ['PRD/订单处理功能PRD.md#43-ebay-履约过程中的平台状态更新', 'PRD/订单处理功能PRD.md#26-2026-10-09-批量操作栏与商品金额评审'] }),
  边界: 创建标注('prototype-scope', '本轮原型评审边界', '本轮交付本地可交互原型，未连接平台、仓库和库存服务；操作行为以独立虚构样例呈现。原型中的批量资格、演示库存与路由候选供评审，不代表所有一期组合已可发布。', '待确认', { 事实等级: '待确认', 数据来源: ['全渠道已有虚构样例及独立新增的本地虚构作业样例。'], 验收要点: ['仅已确认范围可进入生产设计；首发组合、权限、接口、库存责任和恢复规则仍须关闭 PRD 待确认项。'] }),
}
</script>

<template>
  <ElConfigProvider :locale="zhCn">
  <section v-prototype="标注.边界" class="订单处理页面">
    <div v-if="!标注模式" v-prototype="标注.队列" class="状态页签">
      <ElTabs v-model="当前队列" aria-label="订单处理六态队列">
        <ElTabPane v-for="状态 in 六态" :key="状态" :name="状态">
          <template #label><span class="状态页签标签">{{ 状态 }}<b>{{ 筛选后作业.filter(行 => 行.stage === 状态).length }}</b></span></template>
        </ElTabPane>
      </ElTabs>
    </div>
    <nav v-else v-prototype="标注.队列" class="阶段导航" aria-label="订单处理六态队列">
      <button v-for="(状态, 索引) in 六态" :key="状态" type="button" :class="['阶段卡', { 激活: 当前队列 === 状态, 例外阶段: 索引 > 3 }]" :aria-pressed="当前队列 === 状态" @click="当前队列 = 状态">
        <span class="阶段卡首行"><span><i class="状态圆点" :class="`状态-${状态}`"></i>{{ 状态 }}</span><small>{{ 索引 < 4 ? `0${索引 + 1}` : '独立队列' }}</small></span>
        <span class="阶段数量"><b>{{ 筛选后作业.filter(行 => 行.stage === 状态).length }}</b><small>{{ ['待推单', '待发货', '已发货'].includes(状态) ? '履约单' : '订单' }}</small></span>
        <span class="阶段任务">{{ 阶段任务[状态] }}</span>
      </button>
    </nav>
    <div v-if="标注模式" class="队列提示"><ElIcon><InfoFilled /></ElIcon><span>{{ 队列说明[当前队列] }}</span></div>
    <section v-prototype="标注.筛选" class="筛选区">
      <div class="主筛选">
        <MultiFilter v-model="筛选.platform" :options="平台选项" placeholder="平台" :width="110" />
        <MultiFilter v-model="筛选.store" :options="可选店铺" placeholder="店铺" :width="140" />
        <MultiFilter v-model="筛选.warehouse" :options="仓库选项" placeholder="发货仓库" :width="145" />
        <MultiFilter v-model="筛选.channel" :options="渠道选项" placeholder="物流渠道" :width="145" />
        <MultiFilter v-model="筛选.country" :options="可选国家" placeholder="国家/地区" :width="120" />
        <MultiFilter v-model="筛选.flag" :options="标志选项" placeholder="订单标志" :width="120" />
      </div>
      <div class="查询筛选行">
        <div class="组合筛选 日期筛选组">
          <ElSelect v-model="筛选.dateType" class="类型选择" aria-label="订单处理日期类型"><ElOption v-for="日期 in 日期类型选项" :key="日期.value" :value="日期.value" :label="日期.label" /></ElSelect>
          <DateRange v-model="筛选.dateRange" aria-prefix="订单处理" />
        </div>
        <FieldSearch v-model="筛选.keyword" v-model:field="筛选.searchType" v-model:mode="筛选.searchMatch" :fields="搜索类型选项" aria-prefix="订单处理" @search="查询" />
        <ListSort v-model="排序" :fields="日期类型选项" aria-prefix="订单处理" :width="130" @change="应用排序" />
        <div class="筛选操作"><ElButton type="primary" :title="条件已修改 ? '条件已修改，点击查询后生效' : '应用筛选条件'" @click="查询">查询<i v-if="条件已修改" class="查询修改提示" /></ElButton><ElButton @click="重置">重置</ElButton><ElButton text :aria-expanded="高级筛选" @click="高级筛选 = !高级筛选">更多筛选<span v-if="更多条件数量" class="更多条件数量">{{ 更多条件数量 }}</span><ElIcon :class="{ 翻转: 高级筛选 }"><ArrowDown /></ElIcon></ElButton></div>
      </div>
      <div v-if="高级筛选" class="高级筛选">
        <MultiFilter v-model="筛选.inventory" :options="['充足', '不足', '结果未知'].map(value => ({ value, label: value }))" placeholder="库存校验" :width="145" />
        <MultiFilter v-model="筛选.remainingShippingTime" :options="订单处理剩余发货时间选项.map(value => ({ value, label: value }))" placeholder="剩余发货时间" :width="145" />
      </div>
    </section>
    <div v-prototype="标注.关注" class="关注栏"><strong>作业关注</strong><div class="关注选项"><button v-for="关注 in 关注配置[当前队列]" :key="关注" :class="{ 激活: 当前关注 === 关注 }" :aria-pressed="当前关注 === 关注" @click="切换关注(关注)">{{ 关注 }} <b>{{ 关注数量(关注) }}</b></button></div><span v-if="标注模式">当前查询范围 · 标签可重叠</span></div>
    <section v-prototype="标注.批量扩展" class="作业工具栏" :class="{ 已选择: 已选.length }">
      <div class="批量操作组">
        <ElButton v-for="操作 in 批量操作配置" :key="操作" :type="['审核', '推单'].includes(操作) ? 'primary' : 'default'" :disabled="!已选.length || 同步中" :loading="操作 === '同步仓库状态' && 同步中" @click="批量入口(操作)">{{ 操作 === '增加备注' ? '批量备注' : '批量' + 操作 }}</ElButton>
      </div>
      <div class="作业工具"><span v-if="已选.length" class="勾选摘要">已选 {{ 已选.length }} 项<template v-if="已选来源订单.length !== 已选.length"> · {{ 已选来源订单.length }} 张来源订单</template></span><ElButton v-if="已选.length" link @click="清除选择">清空</ElButton><ElButton v-if="批次结果.length" @click="结果打开 = true">批次结果</ElButton><ElTooltip :content="刷新时间 === '尚未手动刷新' ? 刷新时间 : `最近刷新 ${刷新时间} UTC+8`"><ElButton :icon="Refresh" aria-label="刷新订单处理列表" @click="刷新" /></ElTooltip></div>
    </section>
    <div class="表格区">
      <ElTable ref="表格" :data="当前页数据" row-key="key" height="100%" class="作业表格" @selection-change="已选 = $event">
        <ElTableColumn type="selection" width="42" fixed="left" />
        <ElTableColumn label="订单信息" width="208" fixed="left">
          <template #default="{ row }">
            <div v-prototype="标注.列表" class="信息格 订单身份">
              <div class="平台店铺"><ElTag size="small" effect="plain">{{ row.order.platformCode }}</ElTag><span>{{ row.order.storeName }}</span></div>
              <template v-if="row.fulfillment">
                <span class="字段名">履约单号</span>
                <div class="编号行"><button class="编号" @click="查看履约摘要(row as 作业行)">{{ row.key }}</button><button class="复制按钮" :aria-label="'复制履约单号 ' + row.key" @click="复制编号(row.key)"><ElIcon><CopyDocument /></ElIcon></button></div>
              </template>
              <span class="字段名">{{ row.fulfillment ? '来源系统订单号' : '系统订单号' }}</span>
              <div class="编号行"><button class="编号" @click="查看全渠道(row.order)">{{ row.order.systemOrderNo }}</button><button class="复制按钮" :aria-label="'复制系统订单号 ' + row.order.systemOrderNo" @click="复制编号(row.order.systemOrderNo)"><ElIcon><CopyDocument /></ElIcon></button></div>
              <span class="字段名">平台订单号</span>
              <div class="编号行"><span class="等宽">{{ row.order.platformOrderNo }}</span><button class="复制按钮" :aria-label="'复制平台订单号 ' + row.order.platformOrderNo" @click="复制编号(row.order.platformOrderNo)"><ElIcon><CopyDocument /></ElIcon></button></div>
              <span>买家 ID：{{ row.order.buyerExternalId || '—' }}</span>
              <div v-if="共享履约行(row as 作业行)" class="匹配来源订单">
                <ElTooltip :content="`商品、金额、时间等订单摘要取自 ${row.order.systemOrderNo}；本履约的操作范围仍包含全部来源订单。`" placement="top"><span class="字段名" tabindex="0">代表来源摘要 · 查询命中来源：</span></ElTooltip>
                <ElButton v-for="来源 in 匹配来源订单(row as 作业行)" :key="来源.systemOrderNo" link type="primary" :aria-label="'查看命中来源订单 ' + 来源.systemOrderNo" @click="查看全渠道(来源)">{{ 来源.systemOrderNo }}</ElButton>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="当前单位 === '履约单' ? '来源订单商品' : '商品信息'" min-width="245">
          <template #default="{ row }"><WorkProductSummary :key="row.key" :order="row.order" :source-order="!!row.fulfillment" /></template>
        </ElTableColumn>
        <ElTableColumn label="收件信息" min-width="210">
          <template #default="{ row }">
            <RecipientSummary v-prototype="标注.收件" :address="row.order.address" :show-address="false" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="仓储物流" min-width="230">
          <template #default="{ row }">
            <div v-prototype="标注.路由" class="信息格 仓储格">
              <dl class="仓储字段">
                <div><dt>发货仓库：</dt><dd class="仓库值">{{ 列表仓库(row as 作业行) }}</dd></div>
                <div><dt>物流渠道：</dt><dd>{{ 列表渠道(row as 作业行) }}</dd></div>
                <div><dt>仓储服务商：</dt><dd>{{ 路由字段(row as 作业行, 'warehouseProvider') }}</dd></div>
                <div><dt>面单模式：</dt><dd>{{ 路由字段(row as 作业行, 'labelMode') }}</dd></div>
              </dl>
              <template v-if="row.execution">
                <div class="关联编号"><span>OMS 出库</span><button class="次编号" @click="查看执行(row as 作业行)">{{ row.execution.出库单号 }}</button></div>
                <span class="外部编号">外部仓单：{{ row.execution.外部仓库单号 || '尚未取得' }}</span>
              </template>
              <span v-if="row.fulfillment" class="外部编号">跟踪号：{{ row.fulfillment.trackingNumber || '尚未回传' }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态 / 进度" min-width="160">
          <template #default="{ row }">
            <div v-prototype="标注.进度" class="信息格 状态格">
              <div><span class="字段名">OMS</span><ElTag size="small" :type="row.order.processingStatus === '异常' ? 'danger' : row.order.processingStatus === '已发货' ? 'success' : row.order.processingStatus === '不发货' ? 'info' : 'primary'">{{ row.order.processingStatus }}</ElTag></div>
              <ElTooltip :content="获取平台状态说明(row.order).helper || '平台订单状态，与 OMS 处理状态分别保存'" placement="top"><span tabindex="0">平台：<b :class="{ 危险字: 获取平台状态说明(row.order).tone === 'warning' }">{{ 获取平台状态说明(row.order).text }}</b></span></ElTooltip>
              <span v-if="row.execution">仓库：{{ row.execution.状态 }}<b v-if="row.execution.待核查" class="危险字"> · 待核查</b></span>
              <ElTooltip v-else-if="row.stage === '待审核'" content="查看仓库 SKU、可用库存和最大库龄" placement="top"><ElButton v-prototype="标注.数量库存" class="库存明细入口" link type="primary" @click="查看库存明细(row as 作业行)">库存校验：{{ 演示库存[row.order.systemOrderNo] ?? '充足' }}</ElButton></ElTooltip>
              <span v-else>仓库：{{ row.stage === '待推单' ? '尚未提交' : '见关联执行' }}</span>
              <ElButton v-if="row.stage !== '待审核'" v-prototype="标注.数量库存" class="库存明细入口" link type="primary" @click="查看库存明细(row as 作业行)">查看仓库库存</ElButton>
              <template v-if="row.fulfillment">
                <div class="数量进度"><b>{{ row.fulfillment.shippedQuantity }}</b><span>/ {{ row.fulfillment.plannedQuantity }} 件出库</span><ElTag v-if="关注命中(row as 作业行, '部分出库')" size="small" type="warning">部分</ElTag></div>
                <span>本次剩余：{{ 展示剩余数量(row.fulfillment) }} 件</span>
              </template>
              <ElTooltip v-else-if="row.stage === '待审核'" content="读取订单商品的可履约数量；数量未核实则不合计，不表示已创建履约单或已占用库存。" placement="top"><span tabindex="0">{{ 展示计划数量(row.order.items) }}</span></ElTooltip>
              <div v-if="row.stage === '已发货'" class="标发结果"><span class="字段名">标发</span><ElTag :type="标发记录(row as 作业行)?.status === '标发失败' ? 'danger' : 标发记录(row as 作业行)?.status === '标发成功' ? 'success' : 'info'" size="small">{{ 标发记录(row as 作业行)?.status || '无标发记录' }}</ElTag></div>
              <OrderFlags class="列表订单标志" :flags="行标志(row as 作业行)" />
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="当前单位 === '履约单' ? '来源订单金额' : '订单金额'" min-width="172">
          <template #default="{ row }">
            <OrderAmountSummary v-prototype="标注.金额" :amount="row.order.amount" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="时间" min-width="240">
          <template #header><div class="时间表头"><span>时间</span><small>所有时间均为北京时间</small></div></template>
          <template #default="{ row }">
            <OrderTimeSummary
              v-prototype="标注.时间"
              :ordered-at="row.order.orderedAt" :paid-at="row.order.paidAt"
              :deadline="row.order.shipByAt" :stage="row.stage"
              :shipped-at="row.fulfillment?.shippedAt" :warehouse-updated-at="row.execution?.更新时间"
              :show-fulfillment="!!row.fulfillment" :show-warehouse="!!row.execution"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="处理提示 / 备注 / 留言" min-width="240">
          <template #default="{ row }">
            <div class="信息格 原因格">
              <OrderNotes :order-no="row.order.systemOrderNo" mode="list" />
              <strong :class="{ 危险字: row.order.blockReason || row.execution?.待核查 || row.execution?.状态 === '下单失败' || 标发记录(row as 作业行)?.status === '标发失败' }">{{ 下一步(row as 作业行) }}</strong>
              <span v-if="row.stage === '已发货'">{{ 展示处理原因(标发记录(row as 作业行)?.reason || 标发记录(row as 作业行)?.exemptionReason || 默认原因[row.stage as 订单处理状态]) }}</span>
              <span v-else>{{ 原因正文(row as 作业行) }}</span>
              <span v-if="row.stage === '已发货'">标发承运商：{{ 标发记录(row as 作业行)?.carrier || '未提供' }}</span>
              <small v-if="row.stage === '异常'">人工复核后可操作不发货</small>
              <div v-if="row.order.address.buyerMessage" class="买家留言"><span>买家留言</span><ElTooltip :content="row.order.address.buyerMessage" placement="top"><p class="两行摘要" tabindex="0">{{ row.order.address.buyerMessage }}</p></ElTooltip></div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="124" fixed="right"><template #default="{ row }"><div class="行操作">
          <ElButton v-for="操作 in 行主要操作(row as 作业行)" :key="操作" v-prototype="标注.批量" link type="primary" :loading="操作 === '同步仓库状态' && 同步中" @click="行操作入口(操作, row as 作业行)">{{ 操作 }}</ElButton>
          <ElButton link type="primary" @click="选择来源操作('增加备注', row as 作业行)">增加备注</ElButton>
          <ElButton v-prototype="标注.证据" link type="primary" @click="选择来源操作('订单详情', row as 作业行)">订单详情</ElButton>
          <ElDropdown trigger="click" placement="bottom-end" @command="行操作入口($event, row as 作业行)"><ElButton link type="primary" aria-label="更多订单操作">更多<ElIcon><ArrowDown /></ElIcon></ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="操作 in 行更多操作(row as 作业行)" :key="操作" :command="操作">{{ 操作 }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
        </div></template></ElTableColumn>
        <template #empty><ElEmpty :description="`当前${当前队列}队列没有符合条件的${当前单位}`" :image-size="70"><ElButton plain @click="重置">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
    </div>
    <footer class="分页栏"><span v-if="标注模式">仅包含已进入六态的自配送订单 · 全部数据为虚构演示</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页条数" :page-sizes="[20, 50, 100]" :total="当前结果.length" background layout="total, sizes, prev, pager, next" /></footer>

    <WarehouseInventoryDetails v-if="当前库存行" v-model="库存明细打开" :row="当前库存行" />

    <ActionSettings ref="操作设置" @result="接收操作结果" />
    <OrderNotes ref="备注控制" :order-no="备注订单号" mode="controller" />
    <ElDialog v-model="来源窗口" :title="来源动作 + ' · 选择来源订单'" width="min(620px, 92vw)" append-to-body>
      <p class="浅色字">请选择本次操作的来源订单，不默认第一张。</p><ElSelect v-model="目标来源" placeholder="请选择来源订单" aria-label="选择来源订单" style="width:100%"><ElOption v-for="订单 in 全部来源" :key="订单.systemOrderNo" :value="订单.systemOrderNo" :label="订单.systemOrderNo" /></ElSelect>
      <ElButton v-if="来源动作 === '查看订单标发' && 来源目标行?.fulfillment" style="margin-top:16px" @click="来源窗口 = false; 查看执行(来源目标行, '标发')">查看该履约全部关联标发记录</ElButton>
      <template #footer><ElButton @click="来源窗口 = false">取消</ElButton><ElButton type="primary" :disabled="!目标来源" @click="确认来源">确认来源</ElButton></template>
    </ElDialog>
    <ElDialog v-model="终止窗口" title="不发货原因" width="min(660px, 92vw)" append-to-body><div v-if="记录订单" class="终止原因"><strong>{{ 记录订单.systemOrderNo }}</strong><p>{{ 记录订单.noShipmentReason || '暂无对应记录' }}</p><p class="浅色字">原订单、审核及仓库执行历史保留。</p></div><template #footer><ElButton @click="终止窗口 = false">关闭</ElButton></template></ElDialog>

    <ElDialog v-model="结果打开" :title="结果标题" width="min(900px, 94vw)" append-to-body><div class="结果统计"><div v-for="(数量, 类型) in 结果统计" :key="类型"><span>{{ 类型 }}</span><strong>{{ 数量 }}</strong></div></div><ElTable :data="批次结果" max-height="380"><ElTableColumn prop="key" label="作用对象" min-width="230" /><ElTableColumn label="结果" width="105"><template #default="{ row }"><ElTag :type="是跳过(row.result) ? 'info' : !row.result.成功 ? 'danger' : row.result.待核查 ? 'warning' : 'success'">{{ 是跳过(row.result) ? '跳过' : !row.result.成功 ? '失败' : row.result.待核查 ? '处理中' : '成功' }}</ElTag></template></ElTableColumn><ElTableColumn label="结果说明 / 下一步" min-width="380"><template #default="{ row }">{{ 展示处理原因(row.result.信息) }}<div v-if="row.result.对象号" class="等宽 浅色字">{{ row.result.对象号 }}</div></template></ElTableColumn></ElTable><template #footer><ElButton @click="导出结果">下载逐项结果</ElButton><ElButton v-if="(结果统计.成功 || 结果统计.处理中) && ['审核结果', '推单结果'].includes(结果标题)" type="primary" @click="结果打开 = false; 当前队列 = '待推单'; 重置()">{{ 结果标题 === '审核结果' ? '进入待推单' : '查看待推单' }}</ElButton><ElButton v-if="结果标题 === '不发货结果' && 结果统计.成功" type="primary" @click="结果打开 = false; 当前队列 = '不发货'; 重置()">查看不发货订单</ElButton><ElButton @click="结果打开 = false">关闭</ElButton></template></ElDialog>

    <ElDialog v-model="批量操作打开" :title="批量操作类型" width="min(1280px, 96vw)" top="3vh" class="订单批量编辑弹窗" append-to-body destroy-on-close :close-on-click-modal="false">
      <div v-prototype="标注.批量扩展" class="批量操作表单">
        <div class="批量范围摘要"><strong>{{ 批量操作目标.length }} 张订单</strong><span>可处理 {{ 批量可处理数量 }}</span><span v-if="批量操作目标.length !== 批量可处理数量" class="危险字">拦截 {{ 批量操作目标.length - 批量可处理数量 }}</span></div>
        <ElTable :data="批量操作目标" max-height="calc(94vh - 450px)"><ElTableColumn label="选择" width="60"><template #default="{ row }"><ElCheckbox v-model="row.selected" :aria-label="'选择批量目标 ' + row.order.systemOrderNo" /></template></ElTableColumn><ElTableColumn label="订单信息" min-width="270"><template #default="{ row }"><strong>{{ row.order.systemOrderNo }}</strong><div>{{ row.order.platformCode }} · {{ row.order.storeName || '—' }}</div><div>平台订单号：{{ row.order.platformOrderNo || '—' }}</div></template></ElTableColumn><ElTableColumn prop="order.processingStatus" label="当前阶段" width="95" /><ElTableColumn label="处理范围 / 校验结果" min-width="310"><template #default="{ row }"><span :class="row.reasons.length ? '危险字' : '通过字'">{{ 展示处理原因(row.reasons.join('；')) || (批量操作类型 === '批量备注' ? '追加至本地备注，保留原有历史' : '当前可处理，确认时再次校验') }}</span></template></ElTableColumn></ElTable>
        <template v-if="批量操作类型 === '批量备注'"><label for="批量备注输入">备注内容</label><ElInput id="批量备注输入" v-model="批量操作草稿.content" type="textarea" :rows="4" :maxlength="订单备注字数上限" show-word-limit placeholder="输入要追加到所选订单的备注" aria-label="批量备注内容" /><p class="批量说明">相同内容逐单追加，仅供内部查看，不向平台或仓库发送。</p></template>
        <template v-else>
          <template v-if="批量操作类型 === '修改仓库物流'"><ElForm label-position="top"><WarehouseChannelSelect v-model:warehouse="批量操作草稿.warehouse" v-model:channel="批量操作草稿.code" :routes="演示路由" /></ElForm><div v-if="批量所选路由" class="批量路由摘要">仓储服务商：{{ 批量所选路由.warehouseProvider }}<br>仓库账号：{{ 批量所选路由.warehouseAccount }}<br>面单模式：{{ 批量所选路由.labelMode }}</div></template>
          <label for="批量原因输入">修改原因</label><ElInput id="批量原因输入" v-model="批量操作草稿.reason" type="textarea" :rows="3" :maxlength="订单备注字数上限" show-word-limit placeholder="填写修改仓库物流的原因" aria-label="批量操作原因" />
        </template>
      </div>
      <template #footer><ElButton :disabled="批次执行中" @click="批量操作打开 = false">取消</ElButton><ElButton type="primary" :disabled="!批量表单有效" :loading="批次执行中" @click="确认批量操作">{{ 批量操作类型 === '批量备注' ? '保存备注' : '确认修改仓库物流' }}</ElButton></template>
    </ElDialog>

    <ElDialog v-model="路由打开" title="修改仓库物流" width="min(620px, 92vw)" append-to-body :close-on-click-modal="false"><div v-prototype="标注.路由"><div class="路由订单">{{ 路由目标?.systemOrderNo }}<ElTag size="small">待审核</ElTag></div><p class="浅色字">原方案：{{ 路由目标?.defaultRoute?.warehouse || '未分配' }} / {{ 路由目标?.defaultRoute?.shippingChannel || '未分配' }}</p><ElAlert v-if="路由目标 && 修改仓库物流阻断原因(路由目标).length" :title="展示处理原因(修改仓库物流阻断原因(路由目标).join('；'))" type="warning" :closable="false" /><ElForm label-position="top"><WarehouseChannelSelect v-model:warehouse="路由草稿.warehouse" v-model:channel="路由草稿.code" :routes="演示路由" /><div class="路由信息"><div><span>仓储服务商</span><strong>{{ 所选路由?.warehouseProvider || '—' }}</strong></div><div><span>仓库账号</span><strong>{{ 所选路由?.warehouseAccount || '—' }}</strong></div><div><span>渠道代码</span><strong>{{ 所选路由?.shippingChannelCode || '—' }}</strong></div><div><span>面单模式</span><strong>{{ '仓配一体，由仓库提供面单并发货' }}</strong></div></div><ElFormItem label="修改原因" required><ElInput v-model="路由草稿.reason" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="说明本次仓库物流修改依据，写入操作日志" /></ElFormItem></ElForm><ElAlert title="将默认发货方案修改为所选仓库／渠道，订单保持待审核。后续审核通过后再推单，本次不会向仓库发货。" type="info" :closable="false" /></div><template #footer><ElButton @click="路由打开 = false">取消</ElButton><ElButton type="primary" :disabled="!所选路由 || !路由草稿.reason.trim() || !!(路由目标 && 修改仓库物流阻断原因(路由目标).length)" @click="保存路由">保存仓库物流</ElButton></template></ElDialog>

    <ElDrawer v-model="详情打开" size="min(800px, 94vw)" append-to-body :with-header="false"><template v-if="当前详情"><div v-prototype="标注.证据" class="详情页眉"><div><small>履约执行摘要</small><h2>{{ 当前详情.key }}</h2></div><ElButton @click="详情打开 = false">关闭</ElButton></div><div class="详情状态"><ElTag :type="当前详情.order.processingStatus === '异常' ? 'danger' : 'primary'">{{ 当前详情.order.processingStatus }}</ElTag><span>{{ 当前详情.order.platformCode }} · {{ 当前详情.order.storeName }}</span></div><OrderFlags class="详情订单标志" :flags="行标志(当前详情)" /><ElAlert v-if="当前详情.order.blockReason || 当前详情.order.noShipmentReason" v-prototype="标注.发货条件" :title="当前详情.order.blockReason || 当前详情.order.noShipmentReason" :type="当前详情.order.blockReason ? 'warning' : 'info'" :closable="false" show-icon /><div v-prototype="标注.进度" class="履约节点"><div v-for="步骤 in 详情步骤" :key="步骤.标题" :class="{ 已完成: 步骤.完成 }"><ElIcon><CircleCheck v-if="步骤.完成" /><Clock v-else /></ElIcon><strong>{{ 步骤.标题 }}</strong><span>{{ 步骤.内容 }}</span></div></div><div class="下一步卡"><span>当前下一步</span><strong>{{ 下一步(当前详情) }}</strong><p>{{ 队列说明[当前详情.stage] }}</p></div><section class="详情分区"><h3>订单与履约</h3><dl><dt>系统订单号</dt><dd><ElButton link type="primary" @click="查看全渠道(当前详情.order)">{{ 当前详情.order.systemOrderNo }}<ElIcon><Document /></ElIcon></ElButton></dd><dt>平台订单号</dt><dd class="等宽">{{ 当前详情.order.platformOrderNo }}</dd><dt>平台状态</dt><dd>{{ 当前详情.order.platformOrderStatus || '—' }}</dd><dt>当前版本</dt><dd>v{{ 当前版本(当前详情.order.systemOrderNo) }}</dd><dt v-if="当前详情.order.admissionReason">进入 / 准入证据</dt><dd v-if="当前详情.order.admissionReason">{{ 当前详情.order.admissionReason }}</dd><dt>取消时间 / 原因</dt><dd>{{ 当前详情.order.cancelledAt || '无最终取消事实' }}<br v-if="当前详情.order.cancelledReason">{{ 展示处理原因(当前详情.order.cancelledReason) }}</dd></dl></section><section class="详情分区"><h3>收件信息 <small>标准订单只读摘要</small></h3><RecipientSummary v-prototype="标注.收件" :address="当前详情.order.address" /></section><section class="详情分区"><h3>商品与数量 <small>中台既有 SKU 映射结果 · 只读</small></h3><div v-for="商品 in 当前详情.order.items" :key="商品.externalLineId" class="商品行"><div><strong>{{ 商品.systemItemName || 商品.platformItemTitle }}</strong><span>{{ 商品.systemSku || '—' }}<template v-if="!商品.systemSku?.trim()"> · 未匹配系统 SKU</template></span><span>平台 SKU：{{ 商品.platformSku }}</span></div><b>下单 {{ 商品.orderedQuantity }} 件</b></div></section><section class="详情分区"><h3>{{ 当前详情.fulfillment ? '履约执行快照' : '订单头首次 / 默认路由' }}</h3><dl><dt>仓库 / 账号</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouse || '待分配' }}<br>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouseAccount || '—' }}</dd><dt>物流渠道</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.shippingChannel || '待分配' }}</dd><dt>面单模式</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.labelMode || '待分配' }}</dd><dt v-if="当前详情.fulfillment">计划 / 有效出库</dt><dd v-if="当前详情.fulfillment">{{ 当前详情.fulfillment.plannedQuantity }} / {{ 当前详情.fulfillment.shippedQuantity }}</dd></dl><ElButton v-if="当前详情.stage === '待审核'" :icon="Setting" @click="调整路由(当前详情.order)">修改仓库物流</ElButton></section><section class="详情分区"><h3>关联仓库执行</h3><template v-if="详情执行"><article v-for="执行 in 详情执行列表" :key="执行.履约单号" class="关联执行卡"><strong>{{ 执行.履约单号 }}</strong><dl><dt>OMS 出库单号</dt><dd class="等宽">{{ 执行.出库单号 }}</dd><dt>外部仓库单号</dt><dd>{{ 执行.外部仓库单号 || '尚未认领' }}</dd><dt>仓库状态</dt><dd>{{ 执行.状态 }}{{ 执行.待核查 ? ' · 待核查' : '' }}</dd><dt>最近更新</dt><dd>{{ 执行.更新时间 }}</dd><dt v-if="执行.原因">结果说明</dt><dd v-if="执行.原因">{{ 展示处理原因(执行.原因) }}</dd></dl></article><ElButton :icon="Van" @click="查看执行(当前详情)">查看三方仓出库单</ElButton></template><p v-else class="浅色字">当前对象没有关联仓库执行记录。</p></section><section class="详情分区"><h3>审核记录 <small>每轮一段结果摘要</small></h3><p v-if="!当前详情.order.reviews.length" class="浅色字">尚未执行审核。</p><article v-for="记录 in [...当前详情.order.reviews].reverse()" :key="记录.round" class="审核记录"><header><strong>第 {{ 记录.round }} 轮 · {{ 记录.type }}</strong><ElTag size="small" :type="记录.status === '已通过' ? 'success' : 'warning'">{{ 记录.status }}</ElTag></header><p>{{ 展示处理原因(记录.decisionNote) || '尚无最终结论' }}</p><small>{{ 记录.completedAt || '—' }}</small></article></section><section class="详情分区"><h3>系统备注</h3><OrderNotes :order-no="当前详情.order.systemOrderNo" mode="detail" /></section><section class="详情分区"><h3>操作日志</h3><p v-if="!当前详情.order.operationLogs.length" class="浅色字">暂无操作日志。</p><div v-for="(日志, 索引) in [...当前详情.order.operationLogs].reverse()" :key="索引" class="日志行"><ElIcon><CircleCheck /></ElIcon><div><strong>{{ 展示处理原因(日志.operationType) }} · {{ 日志.operationResult }}</strong><p>{{ 展示处理原因(日志.content) }}</p><small>{{ 日志.operatedAt }} · {{ 展示处理原因(日志.operator) }}</small></div></div></section></template><template #footer><div v-if="当前详情" class="详情动作"><ElButton @click="查看全渠道(当前详情.order)">完整订单详情</ElButton><ElButton v-if="当前详情.stage === '待审核'" type="primary" @click="详情打开 = false; 设置操作入口('审核', 当前详情)">审核</ElButton><ElButton v-else-if="当前详情.stage === '待推单' && !资格原因(当前详情).length" type="primary" @click="详情打开 = false; 设置操作入口('推单', 当前详情)">推单</ElButton><ElButton v-else-if="当前详情.stage === '已发货'" type="primary" @click="详情打开 = false; 查看执行(当前详情, '标发')">查看订单标发</ElButton><ElButton v-else-if="详情执行" type="primary" @click="详情打开 = false; 查看执行(当前详情)">查看仓库执行</ElButton></div></template></ElDrawer>
  </section>
  </ElConfigProvider>
</template>

<style scoped>
:global(.订单批量编辑弹窗){max-height:94vh;margin-bottom:3vh}
:global(.订单批量编辑弹窗 .el-dialog__body){max-height:calc(94vh - 110px);overflow:auto}
.作业工具栏{flex-wrap:wrap}.批量操作组{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.批量操作组 :deep(.el-button){margin:0;font-size:12px;height:30px;padding:0 12px}.批量操作组>span{display:inline-flex}.勾选摘要{font-size:12px;color:#738197;white-space:nowrap}.批量操作表单{display:flex;flex-direction:column;gap:12px}.批量操作表单>label{color:var(--yy-text-heading);font-size:12px}.批量范围摘要{display:flex;flex-wrap:wrap;align-items:center;gap:16px;font-size:12px;color:#738197}.批量范围摘要>strong{color:var(--yy-text-heading)}.批量说明{margin:0;color:#738197;font-size:12px;line-height:1.6}.批量路由摘要{padding:10px 12px;background:#f7f9fc;border:1px solid #edf0f4;border-radius:4px;color:#53657b;font-size:12px;line-height:1.8}
.作业表格 :deep(th.el-table__cell){color:var(--yy-text-heading)!important}
.作业表格 .信息格{gap:6px;justify-content:flex-start;line-height:1.5}
.作业表格 .字段名{font-size:10px;color:#8a96a6;font-weight:400}
.作业表格 .订单身份{gap:3px}.平台店铺{margin-bottom:5px;gap:5px!important}.平台店铺>span:last-child{font-size:11px;color:#66768a;overflow-wrap:anywhere}
.作业表格 .编号行{display:flex;flex-wrap:nowrap;align-items:flex-start;gap:3px}.编号行 .编号,.编号行>.等宽{flex:1;min-width:0;font-size:11px;overflow-wrap:anywhere;line-height:1.6}.复制按钮{border:0;padding:2px;background:none;color:#a0aaba;cursor:pointer;flex:0 0 16px;font-size:12px}.复制按钮:hover,.复制按钮:focus-visible{color:#2875c9}
.地区{align-items:baseline!important;gap:7px!important}.地区>b{font-size:12px;color:#3c506a}.地区>span{font-size:11px;color:#778599}.收件格 b{font-weight:500}.两行摘要{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;line-height:1.6}
.仓储字段{display:flex;flex-direction:column;gap:6px;margin:0;font-size:11px;line-height:1.5}.仓储字段>div{display:grid;grid-template-columns:77px minmax(0,1fr);gap:4px;align-items:baseline}.仓储字段 dt{color:#8a96a6;white-space:nowrap}.仓储字段 dd{margin:0;color:#53657b;overflow-wrap:anywhere}.仓储字段 .仓库值{font-weight:600;color:#394962}.关联编号{display:flex;flex-direction:column;align-items:flex-start!important;gap:2px!important;padding-top:5px;border-top:1px dashed #e5eaf1}.关联编号>span{color:#8a96a6;font-size:10px}.外部编号{font-family:Consolas,'Microsoft YaHei',monospace}
.状态格 b{font-weight:500}.数量进度{margin-top:4px;padding-top:7px;border-top:1px solid #edf0f4;gap:5px!important}.数量进度>b{font-size:18px;font-weight:600;color:#2875c9}.数量进度>span{font-size:11px;color:#7e8c9e}.标发结果{padding-top:4px}
.库存明细入口{font-size:11px;white-space:normal;text-align:left;justify-content:flex-start;line-height:1.6;height:auto;padding:0;align-self:flex-start}.库存明细入口+.el-button{margin-left:0}
.作业表格 .买家留言{flex-direction:column;align-items:flex-start;gap:3px;padding-top:8px;margin-top:3px;border-top:1px dashed #e4e9f0}.买家留言>span{font-size:10px;color:#8a96a6}.买家留言 p{margin:0;color:#6b7d93;font-size:11px}.作业表格 .行操作{display:flex;flex-direction:column;flex-wrap:nowrap;align-content:flex-start;align-items:flex-start;gap:2px;min-height:0;padding-top:2px}.行操作 :deep(.el-button){font-size:12px;height:22px;min-height:22px;line-height:22px;font-weight:400;margin:0!important;padding:0;justify-content:flex-start;text-align:left}.行操作 :deep(.el-button>span){font-size:inherit;line-height:inherit;margin:0;justify-content:flex-start}.行操作>span{display:inline-flex;align-self:flex-start;margin:0;padding:0;line-height:22px}.详情订单标志{margin:-8px 0 18px}
.状态页签{flex-shrink:0;padding:0 16px;border-bottom:1px solid #e9edf2}
.状态页签 :deep(.el-tabs__header){margin:0}.状态页签 :deep(.el-tabs__nav-wrap::after){display:none}.状态页签 :deep(.el-tabs__item){height:48px;font-size:13px}.状态页签 :deep(.el-tabs__content){display:none}
.状态页签标签{display:inline-flex;align-items:center;gap:8px}.状态页签标签 b{padding:1px 7px;border-radius:4px;background:#f0f3f7;font-size:12px;font-weight:500;color:#78879a}.状态页签 :deep(.is-active) .状态页签标签 b{background:#edf6ff;color:#287ad2}
.分页栏 :deep(.el-pagination){margin-left:auto}

.订单处理页面{container-type:inline-size}


.信息格>span,.信息格 strong{overflow-wrap:anywhere}.信息格 .编号,.信息格 .次编号{white-space:normal;overflow-wrap:anywhere}.信息格>div{flex-wrap:wrap}.信息格 .时效{flex-wrap:nowrap}
.详情动作{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.详情动作 .el-button+.el-button{margin-left:0}
.阶段导航{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) repeat(2,minmax(0,.85fr));gap:10px;padding:14px 16px;background:#f8fafc;flex-shrink:0;border-bottom:1px solid #e9edf2}
.阶段卡{display:flex;flex-direction:column;align-items:stretch;gap:7px;min-width:0;padding:12px 14px;text-align:left;border:1px solid #e3e8ef;border-radius:6px;background:#fff;cursor:pointer;transition:border-color .15s,background .15s;color:#526176;font-family:inherit}
.阶段卡:hover{border-color:#9cc6f3}.阶段卡.激活{border-color:#409eff;background:#f0f7ff;box-shadow:inset 0 3px #409eff}.阶段卡.例外阶段{background:#fafbfc}.阶段卡.例外阶段.激活{background:#f0f7ff}
.阶段卡首行,.阶段卡首行>span{display:flex;align-items:center;gap:7px}.阶段卡首行{justify-content:space-between;font-size:13px;font-weight:600;color:var(--yy-text-heading)}.阶段卡首行 small{font-size:10px;color:#8795a8;font-weight:400}.阶段数量{display:flex;align-items:baseline;gap:8px}.阶段数量 b{font-size:25px;font-weight:600;line-height:1.1;font-variant-numeric:tabular-nums;color:#233b56}.阶段卡.激活 .阶段数量 b{color:#2176cc}.阶段数量 small,.阶段任务{font-size:11px;color:#77869a;line-height:1.5}.阶段任务{white-space:normal}
.关注栏{display:flex;align-items:center;gap:14px;padding:9px 16px 0;flex-shrink:0;min-height:35px}.关注栏>strong{font-size:12px;color:var(--yy-text-heading);white-space:nowrap}.关注栏>span{margin-left:auto;font-size:11px;color:#8693a5;white-space:nowrap}.关注选项{display:flex;gap:6px;flex-wrap:wrap}.关注选项 button{border:1px solid transparent;border-radius:4px;padding:5px 9px;background:#f5f7fa;color:#68788b;font-family:inherit;font-size:12px;cursor:pointer;white-space:nowrap}.关注选项 button b{font-size:11px;font-weight:500;margin-left:3px}.关注选项 button.激活{color:#2176cc;border-color:#bbd9fa;background:#edf6ff}.关注选项 button:hover{color:#2176cc}
.信息格 .出库数量 strong{font-size:19px;color:#2176cc}.出库数量>span{font-size:11px;color:#77869a}.信息格>.el-tag{align-self:flex-start}.履约节点{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:18px 0}.履约节点>div{display:flex;align-items:center;flex-direction:column;gap:7px;text-align:center;padding:12px 4px;background:#f7f9fc;border-radius:5px}.履约节点 .el-icon{font-size:20px;color:#a1adbc}.履约节点 .已完成 .el-icon{color:#36a579}.履约节点 strong{font-size:12px;color:var(--yy-text-heading)}.履约节点 span{font-size:11px;color:#7a889a}.下一步卡{padding:14px 16px;background:#f0f7ff;border-left:3px solid #409eff;border-radius:4px;display:flex;flex-direction:column;gap:7px}.下一步卡>span{font-size:11px;color:#6d7f97}.下一步卡 strong{font-size:13px;color:var(--yy-text-heading)}.下一步卡 p{margin:0;font-size:12px;line-height:1.7;color:#64778e}.关联执行卡{border:1px solid #e7edf5;border-radius:5px;padding:14px;margin-bottom:12px}.关联执行卡>strong{display:block;font-size:12px;margin-bottom:13px;overflow-wrap:anywhere}
.工作台标题,.队列提示,.筛选区,.作业工具栏,.分页栏{flex-shrink:0}
@media(max-width:1400px){.阶段导航{gap:7px;padding:12px}.阶段卡{padding:11px 10px}.关注栏>span{display:none}}
@media(max-width:1000px){.阶段导航{grid-template-columns:repeat(3,minmax(0,1fr))}.阶段卡{gap:4px;padding:9px}.阶段数量 b{font-size:20px}.阶段任务{display:none}.关注栏{align-items:flex-start}.履约节点{grid-template-columns:repeat(2,minmax(0,1fr))}}
.订单处理页面{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:#fff;color:#344054}
.工作台标题{display:flex;min-height:55px;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #e9edf2;gap:10px}.工作台标题>div{display:flex;align-items:center;gap:10px}.工作台标题 h1{margin:0;font-size:17px;font-weight:650}.工作台标题 span{color:#8390a2;font-size:12px}.标题图标{width:30px;height:30px;border-radius:7px;background:#eaf3ff;color:#287ad2;font-size:18px}.标题工具{flex-shrink:0}.队列栏{display:flex;min-height:48px;flex:0 0 48px;border-bottom:1px solid #e9edf2;padding:0 10px;gap:3px}.队列栏 button{position:relative;display:flex;align-items:center;gap:7px;padding:0 15px;border:0;background:transparent;font-size:13px;color:#667085;cursor:pointer;white-space:nowrap}.队列栏 button.激活{color:#287ad2}.队列栏 button.激活:after{position:absolute;bottom:0;left:14px;right:14px;height:3px;border-radius:2px;background:#3286e5;content:''}.队列栏 b{font-size:12px;padding:2px 6px;background:#f0f3f7;border-radius:5px}.队列栏 button.激活 b{background:#eaf3ff}.队列栏 small{font-size:10px;color:#8995a5}.状态圆点{width:6px;height:6px;background:#8295b0;border-radius:50%}.状态-待审核{background:#d5a248}.状态-待推单{background:#6b99e8}.状态-待发货{background:#699fc6}.状态-已发货{background:#55ad8c}.状态-异常{background:#e07878}.状态-不发货{background:#9aa3af}.队列提示{display:flex;align-items:center;gap:7px;min-height:33px;padding:5px 16px;background:#f8fafc;border-bottom:1px solid #edf0f4;font-size:12px;color:#778598}.队列提示>span{flex:1}.队列提示 .el-icon{color:#86a4c9;flex-shrink:0}.筛选区{padding:10px 14px;border-bottom:1px solid #e9edf2;background:#fff}.主筛选{display:grid;grid-template-columns:minmax(290px,1.5fr) minmax(130px,.6fr) minmax(180px,.8fr) max-content;gap:9px}.筛选操作{display:flex;align-items:center;white-space:nowrap}.高级筛选{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:10px;padding-top:10px;border-top:1px dashed #e4e8ed}.翻转{transform:rotate(180deg)}.作业工具栏{display:flex;align-items:center;justify-content:space-between;min-height:49px;padding:7px 14px;gap:10px;border-bottom:1px solid #e8edf4}.作业工具栏.已选择{background:#f0f7ff}.选择摘要,.作业工具{display:flex;align-items:center;gap:12px}.选择摘要 strong{font-size:12px}.选择摘要 span{color:#8390a2;font-size:11px}.表格区{flex:1;min-height:210px;min-width:0;overflow:hidden}.作业表格{--el-table-border-color:#edf0f4;--el-table-header-bg-color:#f7f9fc;--el-table-row-hover-bg-color:#f6faff;font-size:12px}.作业表格 :deep(th.el-table__cell){font-size:12px;font-weight:600;color:#68788e;height:39px;background:#f7f9fc}.作业表格 :deep(td.el-table__cell){padding:9px 0;vertical-align:top}.作业表格 :deep(.cell){padding:0 10px}.作业表格 :deep(.el-table-fixed-column--left),.作业表格 :deep(.el-table-fixed-column--right){background:#fff}.信息格{display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:65px}.信息格 strong{font-weight:600;font-size:12px;color:#394962}.信息格>span,.信息格 small{color:#8390a2;font-size:11px;line-height:1.5}.信息格>div{display:flex;align-items:center;gap:6px}.信息格 small{margin-left:4px}.等宽{font-family:Consolas,'Microsoft YaHei',monospace}.编号,.次编号{display:block;width:max-content;max-width:100%;padding:0;border:0;background:none;color:#2875c9;cursor:pointer;font-family:Consolas,'Microsoft YaHei',monospace;white-space:nowrap;text-align:left}.编号{font-size:12px;font-weight:700}.次编号{font-size:11px}.编号:hover,.次编号:hover{text-decoration:underline}.数量{font-size:10px;color:#7e8a9b}.时效{display:flex;align-items:center;gap:5px;color:#8a9db7}.原因格{max-width:340px}.原因格>span{white-space:normal;line-height:1.55;color:#798496}.危险字{color:#c8773d!important;font-size:11px}.通过字{color:#388d67}.浅色字{color:#8592a5;font-size:12px;line-height:1.6}.分页栏{display:flex;align-items:center;justify-content:space-between;min-height:48px;gap:10px;padding:0 14px;border-top:1px solid #e9edf2}.分页栏>span{color:#8a96a7;font-size:11px}.预检摘要{display:flex;align-items:center;gap:20px;padding:16px 2px}.预检摘要 strong{font-size:14px}.预检摘要 span{font-size:12px;color:#77879b}.原型说明{font-size:12px;color:#8b97a7;line-height:1.6}.结果统计{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px}.结果统计>div{display:flex;flex-direction:column;gap:7px;padding:13px;border:1px solid #e7edf5;border-radius:6px;background:#f8fafc}.结果统计 span{color:#8290a2;font-size:12px}.结果统计 strong{font-size:24px}.路由订单{display:flex;align-items:center;gap:10px;padding-bottom:20px;font-family:Consolas,monospace;font-size:15px}.路由信息{display:grid;grid-template-columns:1fr 1fr;gap:15px;padding:16px;background:#f7f9fc;border-radius:6px;margin-bottom:18px}.路由信息>div{display:flex;flex-direction:column;gap:5px}.路由信息 span{color:#8c98a8;font-size:11px}.路由信息 strong{font-size:12px;font-weight:500}.详情页眉{display:flex;align-items:center;justify-content:space-between;gap:15px}.详情页眉 small{color:#8b98aa}.详情页眉 h2{margin:7px 0 0;font-size:18px;font-family:Consolas,monospace;overflow-wrap:anywhere}.详情状态{display:flex;align-items:center;gap:10px;margin:14px 0 20px}.详情状态 span{color:#7c8b9e;font-size:12px}.详情分区{padding:18px 0;border-bottom:1px solid #edf0f4}.详情分区 h3{display:flex;align-items:center;gap:9px;margin:0 0 15px;font-size:14px}.详情分区 h3 small{font-size:11px;font-weight:400;color:#8a99ad}.详情分区 dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;margin:0}.详情分区 dt{color:#8a97aa;font-size:12px}.详情分区 dd{margin:0;color:#47566c;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.商品行{display:flex;justify-content:space-between;gap:12px;padding:12px;background:#f8fafc;border:1px solid #eef1f6;border-radius:6px;margin-top:8px}.商品行>div{display:flex;flex-direction:column;gap:5px;min-width:0}.商品行 strong{font-size:12px;font-weight:500}.商品行 span{color:#8391a4;font-size:11px}.商品行 b{color:#73829b;font-size:13px;white-space:nowrap}.审核记录{padding:13px;border:1px solid #e5ebf3;border-radius:6px;margin:10px 0}.审核记录 header{display:flex;justify-content:space-between;gap:10px}.审核记录 strong{font-size:12px}.审核记录 p,.日志行 p{font-size:12px;color:#78869b;line-height:1.7;margin:9px 0}.审核记录 small,.日志行 small{color:#9ba6b6;font-size:11px}.日志行{display:flex;gap:10px;padding:12px 0}.日志行>.el-icon{color:#78a4ce;margin-top:2px}.日志行 strong{font-size:12px;font-weight:500}.日志行 p{margin:5px 0}
@media(max-width:1400px){.队列栏{gap:0}.队列栏 button{padding:0 11px;gap:5px}.主筛选{grid-template-columns:minmax(230px,1.2fr) 130px minmax(170px,.8fr) max-content}.分页栏>span{max-width:300px;line-height:1.5}.工作台标题>div:first-child>span{display:none}}
@media(max-width:1050px){.主筛选{grid-template-columns:minmax(210px,1fr) 130px minmax(160px,1fr)}.筛选操作{grid-column:1/-1;justify-self:end}.队列栏{overflow-x:auto}.队列栏 button{padding:0 9px}.作业工具栏{align-items:flex-start}.选择摘要{flex-wrap:wrap;gap:5px 10px}.分页栏>span{display:none}.分页栏{justify-content:flex-end}.高级筛选{grid-template-columns:1fr 1fr}}
@container(max-width:1050px){.阶段导航{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px;padding:10px}.阶段卡{display:grid;grid-template-columns:1fr auto;gap:4px;padding:10px}.阶段卡首行 small{display:none}.阶段卡首行>span{white-space:nowrap}.阶段数量{grid-column:2;grid-row:1/3;align-self:center}.阶段数量 b{font-size:21px}.阶段任务{font-size:10px}.关注栏>span{display:none}}
@container(max-width:780px){.主筛选{grid-template-columns:minmax(180px,1fr) 110px 140px!important}.筛选操作{grid-column:1/-1;justify-self:end}.分页栏>span{display:none}.高级筛选{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
/* 高频条件两行展现；组合控件只共享外观，各字段独立参与查询。 */
.主筛选{display:flex;flex-wrap:wrap;gap:8px}
.查询筛选行{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center}
.组合筛选{display:flex;min-width:0;align-items:center}
.组合筛选>.类型选择{flex:0 0 110px;width:110px;min-width:0}
.日期筛选组{flex:0 0 400px;width:400px}
.日期筛选组>.类型选择{flex-basis:94px;width:94px}
.编号筛选组{flex:0 0 385px;width:385px}
.组合筛选>.匹配选择{flex:0 0 76px;width:76px;min-width:0;margin-left:-1px}
.组合筛选>.el-input{flex:1;min-width:0;width:0}
.组合筛选 :deep(.el-select__wrapper){border-radius:4px 0 0 4px}
.组合筛选>.匹配选择 :deep(.el-select__wrapper){border-radius:0}
.组合筛选>.el-input :deep(.el-input__wrapper){border-radius:0;margin-left:-1px}
.日期筛选组 :deep(.el-date-editor){flex:1;width:0!important;min-width:0!important;height:32px;padding:0 5px;border-radius:0 4px 4px 0;margin-left:-1px}
.日期筛选组 :deep(.el-range-input){font-size:11px;width:44%;min-width:0}
.日期筛选组 :deep(.el-range-separator){flex:0 0 18px;padding:0;font-size:12px}
.日期筛选组 :deep(.el-range__icon){margin-right:2px;font-size:13px}
.筛选区 :deep(.el-input__inner),.筛选区 :deep(.el-select__selected-item){font-size:12px}
.筛选操作{gap:8px;grid-column:auto;justify-self:start}
.筛选操作 :deep(.el-button){height:32px;margin:0;padding:0 14px;font-size:12px}
.筛选操作 :deep(.el-button.is-text){padding:0 4px}
.组合筛选>.批量输入按钮,.组合筛选>.文本查询按钮{flex:0 0 28px;width:28px;height:32px;padding:0;margin:0 0 0 -1px;color:#6684a8;border-radius:0;box-shadow:none}
.组合筛选>.批量输入按钮{border-radius:0 4px 4px 0}
.排序按钮{height:32px;padding:0 10px;font-size:12px;margin:0;color:#62758f}
.查询修改提示{width:5px;height:5px;background:#fff;border-radius:50%;margin-left:5px}
.更多条件数量{padding:1px 5px;background:#edf6ff;color:#287ad2;border-radius:3px;font-size:11px;margin:0 3px}
.高级筛选{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;padding-top:10px}
.批量查询说明,.批量查询计数{font-size:12px;line-height:1.8;color:#738197;margin:0 0 12px}
.批量查询计数{margin:10px 0 0;text-align:right}
.多行搜索面板 :deep(.el-textarea__inner){font-size:12px;line-height:1.7;resize:vertical}
.弹层操作{display:flex;gap:8px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #eef1f5}
.弹层操作>span{flex:1}.弹层操作 :deep(.el-button){height:28px;font-size:12px;margin:0;padding:0 10px}
.排序面板>p{margin:0 0 10px;color:#697b92;font-size:12px}
.排序选择行{display:flex;gap:8px;align-items:center}.排序选择行>.el-select{width:124px;flex:0 0 124px}
.排序选择行 :deep(.el-select__selected-item){font-size:12px}
.排序方向{display:flex;flex:1}.排序方向>button{font-size:12px;white-space:nowrap;height:32px;padding:0 8px;border:1px solid #dce5ef;background:#f8fafc;color:#6c7d92;cursor:pointer}
.排序方向>button:first-child{border-radius:4px 0 0 4px}.排序方向>button:last-child{border-radius:0 4px 4px 0;margin-left:-1px}.排序方向>button.激活{border-color:#8dbcfa;color:#2877cc;background:#edf6ff;position:relative}
.信息格>.匹配来源订单{display:flex;flex-direction:column;align-items:flex-start;gap:3px;margin-top:4px;padding-top:5px;border-top:1px dashed #e5eaf1}
.匹配来源订单 :deep(.el-button){height:auto;min-height:18px;margin:0;font-size:11px;white-space:normal;text-align:left;overflow-wrap:anywhere}
.时间表头{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.时间表头 small{font-size:11px;font-weight:400;line-height:1.4;color:#8792a2}.状态格 .列表订单标志{padding-top:4px;align-self:flex-start}
</style>
