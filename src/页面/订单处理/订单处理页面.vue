<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, CircleCheck, Clock, CopyDocument, Document, InfoFilled, QuestionFilled, Refresh, Setting, Van, Warning } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElCheckbox, ElConfigProvider, ElDialog, ElDrawer, ElDropdown, ElDropdownItem, ElDropdownMenu, ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTag, ElTooltip } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { 订单处理标注 as 标注 } from './订单处理原型标注'
import type { 全渠道订单, 订单处理状态 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 当前版本, 审核阻断原因, 推单阻断原因, 执行演示审核, 执行演示推单, 核查演示仓库结果, 演示库存, 演示路由, type 命令结果 } from './演示会话'
import { 展示处理原因, 获取处理建议, 获取仓库结束提示 } from './处理提示展示'
import { 获取作业路由, 展示计划数量, 命中作业关注, type 作业行, type 作业关注 } from './展示工具'
import { 共享标发单 } from '../订单标发/演示会话'
import type { 标发单 } from '../订单标发/标发逻辑'
import { 获取作业标发记录 } from './标发状态展示'
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
const 行标发记录 = (行: 作业行) => 获取作业标发记录(行, 共享订单.value, 共享标发单.value)
const 行标发状态 = (行: 作业行) => [...new Set(行标发记录(行).map(单 => 单.status))].join(' / ')
const 标发说明 = (行: 作业行) => [...new Set(行标发记录(行).map(单 => 单.reason || 单.exemptionReason).filter(Boolean))].join('；')
const 标发承运商 = (行: 作业行) => [...new Set(行标发记录(行).map(单 => 单.carrier).filter(Boolean))].join(' / ')
const 有标发失败 = (行: 作业行) => 行标发记录(行).some(单 => 单.status === '标发失败')
function 查看标发详情(单: 标发单) { router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { shippingConfirmationNo: 单.no } }) }
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
  { value: 'outboundOrderNo', label: 'OMS 出库单号' }, { value: 'externalOutboundNo', label: '三方仓出库单号' }, { value: 'trackingNumber', label: '跟踪号' },
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
const 关注命中 = (行: 作业行, 关注: 作业关注) => {
  const 记录 = 行标发记录(行)
  return 记录.length ? 记录.some(单 => 命中作业关注(行, 关注, 资格原因(行), 单.status)) : 命中作业关注(行, 关注, 资格原因(行))
}
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
  待推单: ['推单', '同步仓库状态', '退回待审核', '增加备注', '不发货'],
  待发货: ['同步仓库状态', '退回待审核', '增加备注', '不发货'],
  已发货: ['同步仓库状态', '增加备注'],
  异常: ['不发货', '同步仓库状态', '增加备注'],
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
type 来源动作 = '订单详情' | '增加备注' | '修改仓库物流' | '查看终止原因'
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
  if (行.stage === '已发货') return []
  if (行.stage === '异常') return ['恢复发货', '不发货']
  return ['查看终止原因']
}
function 行更多操作(行: 作业行): string[] {
  const 操作: string[] = []
  if (行关联执行(行).length && !行主要操作(行).includes('同步仓库状态')) 操作.push('同步仓库状态')
  if (['待推单', '待发货'].includes(行.stage)) 操作.push('退回待审核')
  if (['待审核', '待推单', '待发货'].includes(行.stage)) 操作.push('不发货')
  if (行.stage === '不发货') 操作.push('撤销不发货')

  return 操作
}
function 行操作入口(操作: string, 行: 作业行) {
  if (操作 === '同步仓库状态') return void 同步仓库状态(行)
  if (['审核', '推单', '重新推单', '退回待审核', '不发货', '恢复发货', '撤销不发货'].includes(操作)) return 设置操作入口(操作 as 设置操作, 行)
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
function 查看执行(行: 作业行, 目标: '仓库' | '物流' = '仓库') {
  const 路径 = 目标 === '仓库' ? '/oms/warehouse-delivery/outbound-orders' : '/oms/warehouse-delivery/logistics-orders'
  router.push({ path: 路径, query: { fulfillmentOrderNo: 行.fulfillment?.fulfillmentOrderNo, systemOrderNo: 行.order.systemOrderNo } })
}
const 详情打开 = ref(false)
const 当前详情 = ref<作业行>()
function 查看履约摘要(行: 作业行) { 当前详情.value = 行; 详情打开.value = true }
const 详情执行列表 = computed(() => 仓库执行记录.value.filter(项 => 当前详情.value?.fulfillment ? 项.履约单号 === 当前详情.value.fulfillment.fulfillmentOrderNo : 项.订单号.includes(当前详情.value?.order.systemOrderNo ?? '')))
const 详情执行 = computed(() => 详情执行列表.value[0])
function 下一步(行: 作业行): string { return 获取处理建议(行, 资格原因(行), 有标发失败(行) ? '标发失败' : 行标发状态(行)) }
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
  const 已建仓 = !!仓单.length && 仓单.every(项 => !!项.三方仓出库单号)
  const 已出库 = 行.fulfillment ? 行.fulfillment.shippedQuantity >= 行.fulfillment.plannedQuantity && 行.fulfillment.plannedQuantity > 0 : 行.order.processingStatus === '已发货'
  const 标发 = 行标发记录(行)
  return [{ 标题: '订单审核', 内容: 已审 ? '已有通过记录' : '无通过记录', 完成: 已审 }, { 标题: '仓库接单', 内容: 已建仓 ? '已有三方仓出库单号' : 仓单.length ? '查看执行结果' : '尚未提交', 完成: 已建仓 }, { 标题: '实际出库', 内容: 已出库 ? '已有足量出库事实' : 行.fulfillment?.shippedQuantity ? `已出库 ${行.fulfillment.shippedQuantity} / ${行.fulfillment.plannedQuantity} 件` : '无有效出库事实', 完成: 已出库 }, { 标题: '平台标发', 内容: 行标发状态(行) || '暂无标发记录', 完成: 标发.length > 0 && 标发.every(单 => 单.status === '标发成功') }]
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
      <div v-prototype="标注.分类条件" class="主筛选">
        <MultiFilter v-model="筛选.platform" :options="平台选项" placeholder="平台" :width="110" />
        <MultiFilter v-model="筛选.store" :options="可选店铺" placeholder="店铺" :width="140" />
        <MultiFilter v-model="筛选.warehouse" :options="仓库选项" placeholder="发货仓库" :width="145" />
        <MultiFilter v-model="筛选.channel" :options="渠道选项" placeholder="物流渠道" :width="145" />
        <MultiFilter v-model="筛选.country" :options="可选国家" placeholder="国家/地区" :width="120" />
        <MultiFilter v-model="筛选.flag" :options="标志选项" placeholder="订单标志" :width="120" />
      </div>
      <div class="查询筛选行">
        <div v-prototype="标注.日期查询" class="组合筛选 日期筛选组">
          <ElSelect v-model="筛选.dateType" class="类型选择" aria-label="订单处理日期类型"><ElOption v-for="日期 in 日期类型选项" :key="日期.value" :value="日期.value" :label="日期.label" /></ElSelect>
          <DateRange v-model="筛选.dateRange" aria-prefix="订单处理" />
        </div>
        <FieldSearch class="单号字段搜索" :width="425" v-prototype="标注.字段搜索" v-model="筛选.keyword" v-model:field="筛选.searchType" v-model:mode="筛选.searchMatch" :fields="搜索类型选项" aria-prefix="订单处理" @search="查询" />
        <div v-prototype="标注.排序"><ListSort v-model="排序" :fields="日期类型选项" aria-prefix="订单处理" :width="130" @change="应用排序" /></div>
        <div v-prototype="标注.查询重置" class="筛选操作"><ElButton type="primary" :title="条件已修改 ? '条件已修改，点击查询后生效' : '应用筛选条件'" @click="查询">查询<i v-if="条件已修改" class="查询修改提示" /></ElButton><ElButton @click="重置">重置</ElButton><ElButton text :aria-expanded="高级筛选" @click="高级筛选 = !高级筛选">更多筛选<span v-if="更多条件数量" class="更多条件数量">{{ 更多条件数量 }}</span><ElIcon :class="{ 翻转: 高级筛选 }"><ArrowDown /></ElIcon></ElButton></div>
      </div>
      <div v-if="高级筛选" v-prototype="标注.更多条件" class="高级筛选">
        <MultiFilter v-model="筛选.inventory" :options="['充足', '不足', '结果未知'].map(value => ({ value, label: value }))" placeholder="库存校验" :width="145" />
        <MultiFilter v-model="筛选.remainingShippingTime" :options="订单处理剩余发货时间选项.map(value => ({ value, label: value }))" placeholder="剩余发货时间" :width="145" />
      </div>
    </section>
    <div v-prototype="标注.关注" class="关注栏"><strong>作业关注</strong><div class="关注选项"><button v-for="关注 in 关注配置[当前队列]" :key="关注" :class="{ 激活: 当前关注 === 关注 }" :aria-pressed="当前关注 === 关注" @click="切换关注(关注)">{{ 关注 }} <b>{{ 关注数量(关注) }}</b></button></div><span v-if="标注模式">当前查询范围 · 标签可重叠</span></div>
    <section v-prototype="标注.批量扩展" class="作业工具栏" :class="{ 已选择: 已选.length }">
      <div class="批量操作组">
        <ElButton v-for="操作 in 批量操作配置" :key="操作" :type="['审核', '推单'].includes(操作) || (当前队列 === '异常' && 操作 === '不发货') ? 'primary' : 'default'" :disabled="!已选.length || 同步中" :loading="操作 === '同步仓库状态' && 同步中" @click="批量入口(操作)">{{ 操作 === '增加备注' ? '批量备注' : '批量' + 操作 }}</ElButton>
      </div>
      <div v-prototype="标注.选择" class="作业工具"><span v-if="已选.length" class="勾选摘要">已选 {{ 已选.length }} 项<template v-if="已选来源订单.length !== 已选.length"> · {{ 已选来源订单.length }} 张来源订单</template></span><ElButton v-if="已选.length" link @click="清除选择">清空</ElButton><ElButton v-if="批次结果.length" @click="结果打开 = true">批次结果</ElButton><ElTooltip :content="刷新时间 === '尚未手动刷新' ? 刷新时间 : `最近刷新 ${刷新时间} UTC+8`"><ElButton v-prototype="标注.刷新" :icon="Refresh" aria-label="刷新订单处理列表" @click="刷新" /></ElTooltip></div>
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
          <template #default="{ row }"><WorkProductSummary v-prototype="标注.商品" :key="row.key" :order="row.order" :source-order="!!row.fulfillment" /></template>
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
                <div class="关联编号"><span>OMS 出库单号</span><button class="次编号" @click="查看执行(row as 作业行)">{{ row.execution.出库单号 }}</button></div>
                <span class="外部编号">三方仓出库单号：{{ row.execution.三方仓出库单号 || '尚未取得' }}</span>
              </template>
              <span v-if="row.fulfillment" class="外部编号">跟踪号：{{ row.fulfillment.trackingNumber || '尚未回传' }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态 / 进度" min-width="160">
          <template #default="{ row }">
            <div v-prototype="标注.进度" class="信息格 状态格">
              <div><span class="字段名">OMS</span><ElTag size="small" :type="row.order.processingStatus === '异常' ? 'danger' : row.order.processingStatus === '已发货' ? 'success' : row.order.processingStatus === '不发货' ? 'info' : 'primary'">{{ row.order.processingStatus }}</ElTag></div>
              <ElTooltip :content="获取平台状态说明(row.order).helper || '平台订单状态，与 OMS 处理状态分别保存'" placement="top"><span v-prototype="标注.平台状态" tabindex="0">平台：<b :class="{ 危险字: 获取平台状态说明(row.order).tone === 'warning' }">{{ 获取平台状态说明(row.order).text }}</b></span></ElTooltip>
              <span v-if="row.execution">仓库：{{ row.execution.状态 }}<b v-if="row.execution.待核查" class="危险字"> · 待核查</b></span>
              <ElTooltip v-else-if="row.stage === '待审核'" content="查看仓库 SKU、可用库存和最大库龄" placement="top"><ElButton v-prototype="标注.数量库存" class="库存明细入口" link type="primary" @click="查看库存明细(row as 作业行)">库存校验：{{ 演示库存[row.order.systemOrderNo] ?? '充足' }}</ElButton></ElTooltip>
              <span v-else>仓库：{{ row.stage === '待推单' ? '尚未提交' : '见关联执行' }}</span>
              <ElButton v-if="row.stage !== '待审核'" v-prototype="标注.数量库存" class="库存明细入口" link type="primary" @click="查看库存明细(row as 作业行)">查看仓库库存</ElButton>
              <template v-if="row.fulfillment">
                <div class="数量进度"><b>{{ row.fulfillment.shippedQuantity }}</b><span>/ {{ row.fulfillment.plannedQuantity }} 件出库</span><ElTag v-if="row.fulfillment.shippedQuantity > row.fulfillment.plannedQuantity" size="small" type="danger">数量待核查</ElTag><ElTag v-if="关注命中(row as 作业行, '部分出库')" size="small" type="warning">部分</ElTag></div>
              </template>
              <ElTooltip v-else-if="row.stage === '待审核'" content="读取订单商品的可履约数量；数量未核实则不合计，不表示已创建履约单或已占用库存。" placement="top"><span tabindex="0">{{ 展示计划数量(row.order.items) }}</span></ElTooltip>
              <div v-if="row.stage === '待发货' || row.stage === '已发货'" v-prototype="标注.标发状态" class="订单标发状态">
                <div v-if="!行标发记录(row as 作业行).length" class="标发记录行"><span>标发：</span><span class="浅色字">无标发记录</span></div>
                <div v-for="单 in 行标发记录(row as 作业行)" :key="单.no" class="标发记录行">
                  <span>标发：</span>
                  <ElTooltip :content="单.no + ' · ' + 单.orderNo + ' · ' + 单.fulfillmentNo" placement="top">
                    <ElButton class="标发状态入口" link :type="单.status === '标发失败' ? 'danger' : 单.status === '标发成功' ? 'success' : 'primary'" :aria-label="'查看标发详情 ' + 单.no" @click="查看标发详情(单)">{{ 单.status }}<template v-if="单.pendingVerification"> · 待核查</template></ElButton>
                  </ElTooltip>
                </div>
              </div>
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
          <template #header><div class="时间表头"><span>时间</span><ElTooltip content="所有时间均按北京时间（UTC+8）显示，精确到秒。" :trigger="['hover', 'focus', 'click']" placement="top"><button class="时间列帮助" aria-label="订单处理时间说明" type="button"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></div></template>
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
            <div v-prototype="标注.提示" class="信息格 原因格">
              <OrderNotes :order-no="row.order.systemOrderNo" mode="list" />
              <strong :class="{ 危险字: row.order.blockReason || row.execution?.待核查 || row.execution?.状态 === '下单失败' || 有标发失败(row as 作业行) }">{{ 下一步(row as 作业行) }}</strong>
              <span v-if="row.stage === '已发货'">{{ 展示处理原因(标发说明(row as 作业行) || 默认原因[row.stage as 订单处理状态]) }}</span>
              <span v-else>{{ 原因正文(row as 作业行) }}</span>
              <span v-if="row.stage === '已发货'">标发承运商：{{ 标发承运商(row as 作业行) || '未提供' }}</span>
              <small v-if="row.stage === '异常'">人工复核后可操作不发货</small>
              <div v-if="row.order.address.buyerMessage" v-prototype="标注.买家留言" class="买家留言"><span>买家留言</span><ElTooltip :content="row.order.address.buyerMessage" placement="top"><p class="两行摘要" tabindex="0">{{ row.order.address.buyerMessage }}</p></ElTooltip></div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="124" fixed="right"><template #default="{ row }"><div class="行操作">
          <ElButton v-for="操作 in 行主要操作(row as 作业行)" :key="操作" v-prototype="标注.批量" link type="primary" :loading="操作 === '同步仓库状态' && 同步中" @click="行操作入口(操作, row as 作业行)">{{ 操作 }}</ElButton>
          <ElButton link type="primary" @click="选择来源操作('增加备注', row as 作业行)">增加备注</ElButton>
          <ElButton v-prototype="标注.证据" link type="primary" @click="选择来源操作('订单详情', row as 作业行)">订单详情</ElButton>
          <ElDropdown v-if="行更多操作(row as 作业行).length" trigger="click" placement="bottom-end" @command="行操作入口($event, row as 作业行)"><ElButton link type="primary" aria-label="更多订单操作">更多<ElIcon><ArrowDown /></ElIcon></ElButton><template #dropdown><ElDropdownMenu><ElDropdownItem v-for="操作 in 行更多操作(row as 作业行)" :key="操作" :command="操作">{{ 操作 }}</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
        </div></template></ElTableColumn>
        <template #empty><ElEmpty :description="`当前${当前队列}队列没有符合条件的${当前单位}`" :image-size="70"><ElButton plain @click="重置">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
    </div>
    <footer v-prototype="标注.分页" class="分页栏"><span v-if="标注模式">仅包含已进入六态的自配送订单 · 全部数据为虚构演示</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页条数" :page-sizes="[20, 50, 100]" :total="当前结果.length" background layout="total, sizes, prev, pager, next" /></footer>

    <WarehouseInventoryDetails v-if="当前库存行" v-model="库存明细打开" :row="当前库存行" />

    <ActionSettings ref="操作设置" @result="接收操作结果" />
    <OrderNotes ref="备注控制" :order-no="备注订单号" mode="controller" />
    <ElDialog v-model="来源窗口" :title="来源动作 + ' · 选择来源订单'" width="min(620px, 92vw)" append-to-body>
      <p v-if="来源窗口" v-prototype="标注.来源选择" class="浅色字">请选择本次操作的来源订单，不默认第一张。</p><ElSelect v-model="目标来源" placeholder="请选择来源订单" aria-label="选择来源订单" style="width:100%"><ElOption v-for="订单 in 全部来源" :key="订单.systemOrderNo" :value="订单.systemOrderNo" :label="订单.systemOrderNo" /></ElSelect>

      <template #footer><ElButton @click="来源窗口 = false">取消</ElButton><ElButton type="primary" :disabled="!目标来源" @click="确认来源">确认来源</ElButton></template>
    </ElDialog>
    <ElDialog v-model="终止窗口" title="不发货原因" width="min(660px, 92vw)" append-to-body><div v-if="终止窗口 && 记录订单" v-prototype="标注.不发货原因" class="终止原因"><strong>{{ 记录订单.systemOrderNo }}</strong><p>{{ 记录订单.noShipmentReason || '暂无对应记录' }}</p><p class="浅色字">原订单、审核及仓库执行历史保留。</p></div><template #footer><ElButton @click="终止窗口 = false">关闭</ElButton></template></ElDialog>

    <ElDialog v-model="结果打开" :title="结果标题" width="min(900px, 94vw)" append-to-body><div v-if="结果打开" v-prototype="标注.批次结果" class="结果统计"><div v-for="(数量, 类型) in 结果统计" :key="类型"><span>{{ 类型 }}</span><strong>{{ 数量 }}</strong></div></div><ElTable :data="批次结果" max-height="380"><ElTableColumn prop="key" label="作用对象" min-width="230" /><ElTableColumn label="结果" width="105"><template #default="{ row }"><ElTag :type="是跳过(row.result) ? 'info' : !row.result.成功 ? 'danger' : row.result.待核查 ? 'warning' : 'success'">{{ 是跳过(row.result) ? '跳过' : !row.result.成功 ? '失败' : row.result.待核查 ? '处理中' : '成功' }}</ElTag></template></ElTableColumn><ElTableColumn label="结果说明 / 下一步" min-width="380"><template #default="{ row }">{{ 展示处理原因(row.result.信息) }}<div v-if="row.result.对象号" class="等宽 浅色字">{{ row.result.对象号 }}</div></template></ElTableColumn></ElTable><template #footer><ElButton @click="导出结果">下载逐项结果</ElButton><ElButton v-if="(结果统计.成功 || 结果统计.处理中) && ['审核结果', '推单结果'].includes(结果标题)" type="primary" @click="结果打开 = false; 当前队列 = '待推单'; 重置()">{{ 结果标题 === '审核结果' ? '进入待推单' : '查看待推单' }}</ElButton><ElButton v-if="结果标题 === '不发货结果' && 结果统计.成功" type="primary" @click="结果打开 = false; 当前队列 = '不发货'; 重置()">查看不发货订单</ElButton><ElButton @click="结果打开 = false">关闭</ElButton></template></ElDialog>

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

    <ElDrawer v-model="详情打开" size="min(800px, 94vw)" append-to-body :with-header="false"><template v-if="当前详情"><div v-prototype="标注.证据" class="详情页眉"><div><small>履约执行摘要</small><h2>{{ 当前详情.key }}</h2></div><ElButton @click="详情打开 = false">关闭</ElButton></div><div class="详情状态"><ElTag :type="当前详情.order.processingStatus === '异常' ? 'danger' : 'primary'">{{ 当前详情.order.processingStatus }}</ElTag><span>{{ 当前详情.order.platformCode }} · {{ 当前详情.order.storeName }}</span></div><OrderFlags class="详情订单标志" :flags="行标志(当前详情)" /><ElAlert v-if="当前详情.order.blockReason || 当前详情.order.noShipmentReason" v-prototype="标注.发货条件" :title="当前详情.order.blockReason || 当前详情.order.noShipmentReason" :type="当前详情.order.blockReason ? 'warning' : 'info'" :closable="false" show-icon /><div v-prototype="标注.进度" class="履约节点"><div v-for="步骤 in 详情步骤" :key="步骤.标题" :class="{ 已完成: 步骤.完成 }"><ElIcon><CircleCheck v-if="步骤.完成" /><Clock v-else /></ElIcon><strong>{{ 步骤.标题 }}</strong><span>{{ 步骤.内容 }}</span></div></div><div class="下一步卡"><span>当前下一步</span><strong>{{ 下一步(当前详情) }}</strong><p>{{ 队列说明[当前详情.stage] }}</p></div><section class="详情分区"><h3>订单与履约</h3><dl><dt>系统订单号</dt><dd><ElButton link type="primary" @click="查看全渠道(当前详情.order)">{{ 当前详情.order.systemOrderNo }}<ElIcon><Document /></ElIcon></ElButton></dd><dt>平台订单号</dt><dd class="等宽">{{ 当前详情.order.platformOrderNo }}</dd><dt>平台状态</dt><dd>{{ 当前详情.order.platformOrderStatus || '—' }}</dd><dt>当前版本</dt><dd>v{{ 当前版本(当前详情.order.systemOrderNo) }}</dd><dt v-if="当前详情.order.admissionReason">进入 / 准入证据</dt><dd v-if="当前详情.order.admissionReason">{{ 当前详情.order.admissionReason }}</dd><dt>取消时间 / 原因</dt><dd>{{ 当前详情.order.cancelledAt || '无最终取消事实' }}<br v-if="当前详情.order.cancelledReason">{{ 展示处理原因(当前详情.order.cancelledReason) }}</dd></dl></section><section class="详情分区"><h3>收件信息 <small>标准订单只读摘要</small></h3><RecipientSummary v-prototype="标注.收件" :address="当前详情.order.address" /></section><section class="详情分区"><h3>商品与数量 <small>中台既有 SKU 映射结果 · 只读</small></h3><div v-for="商品 in 当前详情.order.items" :key="商品.externalLineId" class="商品行"><div><strong>{{ 商品.systemItemName || 商品.platformItemTitle }}</strong><span>{{ 商品.systemSku || '—' }}<template v-if="!商品.systemSku?.trim()"> · 未匹配系统 SKU</template></span><span>平台 SKU：{{ 商品.platformSku }}</span></div><b>下单 {{ 商品.orderedQuantity }} 件</b></div></section><section v-prototype="标注.路由" class="详情分区"><h3>{{ 当前详情.fulfillment ? '履约执行快照' : '订单头首次 / 默认路由' }}</h3><dl><dt>仓库 / 账号</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouse || '待分配' }}<br>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouseAccount || '—' }}</dd><dt>物流渠道</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.shippingChannel || '待分配' }}</dd><dt>面单模式</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.labelMode || '待分配' }}</dd><dt v-if="当前详情.fulfillment">计划 / 有效出库</dt><dd v-if="当前详情.fulfillment">{{ 当前详情.fulfillment.plannedQuantity }} / {{ 当前详情.fulfillment.shippedQuantity }}</dd></dl><ElButton v-if="当前详情.stage === '待审核'" :icon="Setting" @click="调整路由(当前详情.order)">修改仓库物流</ElButton></section><section class="详情分区"><h3>订单标发状态</h3><p v-if="!行标发记录(当前详情).length" class="浅色字">无标发记录</p><div v-for="单 in 行标发记录(当前详情)" :key="单.no" class="详情标发记录"><span>{{ 单.no }} · {{ 单.orderNo }}</span><ElButton link type="primary" @click="详情打开 = false; 查看标发详情(单)">{{ 单.status }}{{ 单.pendingVerification ? ' · 待核查' : '' }}</ElButton></div></section><section v-prototype="标注.仓库" class="详情分区"><h3>关联仓库执行</h3><template v-if="详情执行"><article v-for="执行 in 详情执行列表" :key="JSON.stringify([执行.履约单号, 执行.出库单号])" class="关联执行卡"><strong>{{ 执行.履约单号 }}</strong><dl><dt>OMS 出库单号</dt><dd class="等宽">{{ 执行.出库单号 }}</dd><dt>三方仓出库单号</dt><dd>{{ 执行.三方仓出库单号 || '尚未认领' }}</dd><dt>物流商单号</dt><dd class="等宽">{{ 执行.externalLogisticsOrderNo || '—' }}</dd><dt>仓库状态</dt><dd>{{ 执行.状态 }}{{ 执行.待核查 ? ' · 待核查' : '' }}</dd><dt>最近更新</dt><dd>{{ 执行.更新时间 }}</dd><dt v-if="执行.原因">结果说明</dt><dd v-if="执行.原因">{{ 展示处理原因(执行.原因) }}</dd></dl></article><ElButton :icon="Van" @click="查看执行(当前详情)">查看三方仓出库单</ElButton></template><p v-else class="浅色字">当前对象没有关联仓库执行记录。</p></section><section v-prototype="标注.审核" class="详情分区"><h3>审核记录 <small>每轮一段结果摘要</small></h3><p v-if="!当前详情.order.reviews.length" class="浅色字">尚未执行审核。</p><article v-for="记录 in [...当前详情.order.reviews].reverse()" :key="记录.round" class="审核记录"><header><strong>第 {{ 记录.round }} 轮 · {{ 记录.type }}</strong><ElTag size="small" :type="记录.status === '已通过' ? 'success' : 'warning'">{{ 记录.status }}</ElTag></header><p>{{ 展示处理原因(记录.decisionNote) || '尚无最终结论' }}</p><small>{{ 记录.completedAt || '—' }}</small></article></section><section class="详情分区"><h3>系统备注</h3><OrderNotes :order-no="当前详情.order.systemOrderNo" mode="detail" /></section><section v-prototype="标注.摘要日志" class="详情分区"><h3>操作日志</h3><p v-if="!当前详情.order.operationLogs.length" class="浅色字">暂无操作日志。</p><div v-for="(日志, 索引) in [...当前详情.order.operationLogs].reverse()" :key="索引" class="日志行"><ElIcon><CircleCheck /></ElIcon><div><strong>{{ 展示处理原因(日志.operationType) }} · {{ 日志.operationResult }}</strong><p>{{ 展示处理原因(日志.content) }}</p><small>{{ 日志.operatedAt }} · {{ 展示处理原因(日志.operator) }}</small></div></div></section></template><template #footer><div v-if="当前详情" class="详情动作"><ElButton @click="查看全渠道(当前详情.order)">完整订单详情</ElButton><ElButton v-if="当前详情.stage === '待审核'" type="primary" @click="详情打开 = false; 设置操作入口('审核', 当前详情)">审核</ElButton><ElButton v-else-if="当前详情.stage === '待推单' && !资格原因(当前详情).length" type="primary" @click="详情打开 = false; 设置操作入口('推单', 当前详情)">推单</ElButton><ElButton v-else-if="详情执行" type="primary" @click="详情打开 = false; 查看执行(当前详情)">查看仓库执行</ElButton></div></template></ElDrawer>
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
.状态格 b{font-weight:500}.数量进度{margin-top:4px;padding-top:7px;border-top:1px solid #edf0f4;gap:5px!important}.数量进度>b{font-size:18px;font-weight:600;color:#2875c9}.数量进度>span{font-size:11px;color:#7e8c9e}.订单标发状态{display:flex!important;flex-direction:column;align-items:flex-start!important;gap:3px!important;padding-top:4px}.标发记录行{display:flex;align-items:baseline;flex-wrap:nowrap;gap:0;min-width:0;max-width:100%;white-space:nowrap}.标发状态入口{height:auto;line-height:1.5;font-size:11px;white-space:nowrap;text-align:left;justify-content:flex-start;padding:0}.详情标发记录{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:8px 0}
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
.时间表头{display:flex;align-items:center;gap:5px}.时间列帮助{display:inline-flex;padding:0;border:0;background:transparent;color:#9099a7;cursor:help;font-size:13px}.时间列帮助:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}.状态格 .列表订单标志{padding-top:4px;align-self:flex-start}
.单号字段搜索 :deep(.字段选择){width:150px;flex:0 0 150px}
</style>
