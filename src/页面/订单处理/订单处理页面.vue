<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, CircleCheck, Clock, Document, InfoFilled, Refresh, Search, Setting, Van, Warning } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElDrawer, ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTag, ElTooltip } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import type { 全渠道订单, 订单处理状态 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 当前版本, 审核阻断原因, 推单阻断原因, 执行演示审核, 执行演示推单, 核查演示仓库结果, 演示库存, 演示路由, 记录操作, type 命令结果 } from './演示会话'
import { 展示计划数量, 提取发货时区, 展示剩余数量, 命中作业关注, type 作业行, type 作业关注 } from './展示工具'
import { 共享标发单 } from '../订单标发/演示会话'
import { 标注状态 } from '@/原型标注/标注状态'

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
const 阶段任务: Record<订单处理状态, string> = { 待审核: '校验商品 · 分仓选物流', 待推单: '提交仓库 · 核查接单', 待发货: '跟踪仓库 · 核对出库', 已发货: '核对物流 · 跟进标发', 异常: '停止发货 · 人工复核', 不发货: '核对终止原因与证据' }
const 关注配置: Record<订单处理状态, 作业关注[]> = { 待审核: ['全部', '可审核', '审核待处理'], 待推单: ['全部', '可推仓', '结果待核查', '下单失败'], 待发货: ['全部', '待出库', '部分出库', '出库异常', '取消中'], 已发货: ['全部', '待标发', '标发中', '标发失败', '标发成功', '无需标发', '无标发记录'], 异常: ['全部'], 不发货: ['全部'] }
const 默认筛选 = () => ({ keyword: '', platform: '', warehouse: '', store: '', inventory: '', urgency: '', sku: '' })
const 筛选 = reactive(默认筛选())
const 已应用筛选 = reactive(默认筛选())

const 队列说明: Record<订单处理状态, string> = {
  待审核: '核对订单、现有 SKU 映射与库存结果，完成分仓及物流选择后审核。',
  待推单: '按履约单提交仓库；已受理的请求先核查结果，仓库明确建单后才进入待发货。',
  待发货: '跟踪仓库作业与实际出库；取得跟踪号、推仓成功均不等于已发货。',
  已发货: '按履约单核对有效出库事实及后续标发；标发失败不回退已发货。',
  异常: '查看平台变化和仓库执行，人工复核后操作不发货；平台恢复不自动退出异常。',
  不发货: '已确认无需 OMS 继续发货。区分最终取消与系统外履约，历史执行事实保留。',
}
const 当前单位 = computed(() => ['待推单', '待发货', '已发货'].includes(当前队列.value) ? '履约单' : '订单')
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
      const 阶段 = 履约.shippedQuantity >= 履约.plannedQuantity && 履约.plannedQuantity > 0 ? '已发货' : 执行 && ['待出库', '出库异常', '取消中'].includes(执行.状态) ? '待发货' : '待推单'
      结果.push({ key: 履约.fulfillmentOrderNo, order: 订单, fulfillment: 履约, execution: 执行, stage: 阶段 })
    }
  }
  return 结果
})
const 命中筛选 = (行: 作业行) => {
  const 路由 = 行.fulfillment?.route ?? 行.order.defaultRoute
  const 关键字 = 已应用筛选.keyword.trim().toLowerCase()
  const 可检索值 = [行.key, 行.order.systemOrderNo, 行.order.platformOrderNo, 行.execution?.出库单号, 行.execution?.外部仓库单号, ...行.order.items.flatMap((项) => [项.systemSku, 项.platformSku, 项.systemItemName])].join(' ').toLowerCase()
  return (!关键字 || 可检索值.includes(关键字)) && (!已应用筛选.platform || 行.order.platformCode === 已应用筛选.platform) && (!已应用筛选.store || 行.order.storeName === 已应用筛选.store) && (!已应用筛选.warehouse || 路由?.warehouse === 已应用筛选.warehouse) && (!已应用筛选.inventory || (演示库存.value[行.order.systemOrderNo] ?? '充足') === 已应用筛选.inventory) && (!已应用筛选.urgency || 行.order.urgency === 已应用筛选.urgency) && (!已应用筛选.sku || 行.order.items.some((项) => 项.skuResolutionStatus === 已应用筛选.sku))
}
const 筛选后作业 = computed(() => 全部作业.value.filter(命中筛选))
const 阶段作业 = computed(() => 筛选后作业.value.filter(行 => 行.stage === 当前队列.value))
const 关注命中 = (行: 作业行, 关注: 作业关注) => 命中作业关注(行, 关注, 资格原因(行), 标发记录(行)?.status)
const 当前结果 = computed(() => 阶段作业.value.filter(行 => 关注命中(行, 当前关注.value)).sort((甲, 乙) => 甲.key.localeCompare(乙.key)))
const 关注数量 = (关注: 作业关注) => 阶段作业.value.filter(行 => 关注命中(行, 关注)).length
function 切换关注(关注: 作业关注) { 当前关注.value = 关注; 当前页.value = 1; 清除选择() }
const 当前页数据 = computed(() => 当前结果.value.slice((当前页.value - 1) * 每页条数.value, 当前页.value * 每页条数.value))
const 关联订单数 = computed(() => new Set(当前结果.value.map((行) => 行.order.systemOrderNo)).size)
const 可选仓库 = computed(() => [...new Set(全部作业.value.map((行) => (行.fulfillment?.route ?? 行.order.defaultRoute)?.warehouse).filter(Boolean))] as string[])
const 可选店铺 = computed(() => [...new Set(全部作业.value.map((行) => 行.order.storeName))])
const 可批量 = computed(() => ['待审核', '待推单'].includes(当前队列.value))
const 已选可执行 = computed(() => 已选.value.filter((行) => !资格原因(行).length).length)

function 资格原因(行: 作业行) {
  if (行.stage === '待审核') return 审核阻断原因(行.order, 演示库存.value[行.order.systemOrderNo] ?? '充足')
  if (行.stage === '待推单' && 行.fulfillment) return 推单阻断原因(行.order, 行.fulfillment.fulfillmentOrderNo)
  return [行.order.blockReason ?? 行.order.noShipmentReason ?? '当前阶段仅查看执行事实']
}
function 清除选择() { 已选.value = []; 表格.value?.clearSelection() }
function 查询() { Object.assign(已应用筛选, 筛选); 切换关注('全部') }
function 重置() { Object.assign(筛选, 默认筛选()); 查询() }
watch([当前队列, 当前页, 每页条数], 清除选择)
watch(当前队列, () => { 当前页.value = 1; 当前关注.value = '全部' })
watch(() => route.query.systemOrderNo, (编号) => {
  if (typeof 编号 !== 'string') return
  const 订单 = 共享订单.value.find((项) => 项.systemOrderNo === 编号)
  if (订单?.processingStatus) 当前队列.value = 订单.processingStatus
  筛选.keyword = 编号; 查询()
}, { immediate: true })
function 刷新() { 刷新时间.value = new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); 清除选择(); ElMessage.success('已重新读取当前演示会话事实') }
function 查看全渠道(订单: 全渠道订单) { router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: 订单.systemOrderNo } }) }
function 查看执行(行: 作业行, 目标: '仓库' | '标发' | '物流' = '仓库') {
  const 路径 = 目标 === '仓库' ? '/oms/warehouse-delivery/outbound-orders' : 目标 === '标发' ? '/oms/self-fulfillment/shipping-confirmation' : '/oms/warehouse-delivery/logistics-orders'
  router.push({ path: 路径, query: { fulfillmentOrderNo: 行.fulfillment?.fulfillmentOrderNo, systemOrderNo: 行.order.systemOrderNo } })
}
const 详情打开 = ref(false)
const 当前详情 = ref<作业行>()
function 查看详情(行: 作业行) { 当前详情.value = 行; 详情打开.value = true }
const 详情执行列表 = computed(() => 仓库执行记录.value.filter(项 => 当前详情.value?.fulfillment ? 项.履约单号 === 当前详情.value.fulfillment.fulfillmentOrderNo : 项.订单号.includes(当前详情.value?.order.systemOrderNo ?? '')))
const 详情执行 = computed(() => 详情执行列表.value[0])
function 下一步(行: 作业行): string {
  if (行.stage === '待审核') return 资格原因(行).length ? '核对拦截原因，补齐发货条件' : '审核通过，生成履约单'
  if (行.stage === '待推单') return 行.execution?.状态 === '下单失败' ? '查看出库单，处理仓库拒绝原因' : 行.execution ? '核查原请求，确认仓库是否接单' : '提交仓库，等待明确接单结果'
  if (行.stage === '待发货') return 行.execution?.原因 ? '查看出库单，核对剩余履约范围' : '跟进仓库作业，等待有效出库回传'
  if (行.stage === '已发货') return 标发记录(行)?.status === '标发失败' ? '进入订单标发，处理平台回传失败' : '核对发货事实与平台回传结果'
  return 行.stage === '异常' ? '人工复核平台变化及仓库执行' : '查看终止原因，保留历史执行证据'
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

const 命令打开 = ref(false)
const 命令类型 = ref<'审核' | '推单'>('审核')
const 命令目标 = ref<Array<{ row: 作业行; version: number; reason: string[] }>>([])
const 结果打开 = ref(false)
const 批次结果 = ref<Array<{ key: string; result: 命令结果 }>>([])
const 批次执行中 = ref(false)
function 打开命令(行?: 作业行) {
  const 范围 = 行 ? [行] : 已选.value
  if (!范围.length) return ElMessage.warning(`请先勾选${当前单位.value}`)
  命令类型.value = 当前队列.value === '待审核' ? '审核' : '推单'
  命令目标.value = 范围.map((目标) => ({ row: 目标, version: 当前版本(目标.order.systemOrderNo), reason: 资格原因(目标) }))
  命令打开.value = true
}
async function 确认命令() {
  if (批次执行中.value) return
  批次执行中.value = true
  try {
    批次结果.value = 命令目标.value.map(({ row, version }) => ({ key: row.key, result: 命令类型.value === '审核' ? 执行演示审核(row.order.systemOrderNo, version) : 执行演示推单(row.order.systemOrderNo, row.fulfillment!.fulfillmentOrderNo, version) }))
    命令打开.value = false; 结果打开.value = true; 清除选择()
  } finally { 批次执行中.value = false }
}
const 结果统计 = computed(() => ({ 总数: 批次结果.value.length, 成功: 批次结果.value.filter((项) => 项.result.成功 && !项.result.待核查).length, 失败: 批次结果.value.filter((项) => !项.result.成功).length, 处理中: 批次结果.value.filter((项) => 项.result.成功 && 项.result.待核查).length, 待核查: 批次结果.value.filter((项) => 项.result.待核查).length }))
function 导出结果() {
  const 内容 = ['对象号\t结果\t原因', ...批次结果.value.map((项) => `${项.key}\t${项.result.成功 ? 项.result.待核查 ? '处理中' : '成功' : '失败'}\t${项.result.信息}`)].join('\n')
  const 地址 = URL.createObjectURL(new Blob(['\uFEFF', 内容], { type: 'text/tab-separated-values;charset=utf-8' }))
  const 链接 = document.createElement('a'); 链接.href = 地址; 链接.download = '订单处理批次结果.tsv'; 链接.click(); URL.revokeObjectURL(地址)
}
function 核查(行: 作业行) {
  if (!行.fulfillment) return
  const 结果 = 核查演示仓库结果(行.fulfillment.fulfillmentOrderNo)
  结果.成功 ? ElMessage.success(结果.信息) : ElMessage.warning(结果.信息)
}

const 路由打开 = ref(false)
const 路由目标 = ref<全渠道订单>()
const 路由版本 = ref(0)
const 路由草稿 = reactive({ code: '', reason: '' })
const 所选路由 = computed(() => 演示路由.find((项) => 项.shippingChannelCode === 路由草稿.code))
function 调整路由(订单: 全渠道订单) {
  if (订单.processingStatus !== '待审核') return
  路由目标.value = 订单; 路由版本.value = 当前版本(订单.systemOrderNo)
  路由草稿.code = 订单.defaultRoute?.shippingChannelCode ?? ''; 路由草稿.reason = ''; 路由打开.value = true
}
function 保存路由() {
  const 订单 = 路由目标.value
  if (!订单 || !所选路由.value || !路由草稿.reason.trim()) return ElMessage.warning('请选择有效路由并填写调整原因')
  if (订单.processingStatus !== '待审核' || 当前版本(订单.systemOrderNo) !== 路由版本.value || 订单.blockReason || 订单.cancelledAt) return ElMessage.error('订单状态或版本已变化，请关闭后重新预检')
  const 原路由 = 订单.defaultRoute
  订单.defaultRoute = { ...所选路由.value }
  记录操作(订单, '调整默认路由', `由${原路由?.warehouse ?? '未分配'} / ${原路由?.shippingChannel ?? '未分配'}调整为${所选路由.value.warehouse} / ${所选路由.value.shippingChannel}；原因：${路由草稿.reason.trim()}。订单保持待审核。`)
  路由打开.value = false; ElMessage.success('已保存订单头默认路由，订单仍为待审核')
}

const 创建标注 = (id: string, 标题: string, 说明: string, 分类: '页面' | '字段' | '交互' | '规则' | '待确认', 其他: Partial<原型标注> = {}): 原型标注 & { 分类: string } => ({ id: `oms.processing.${id}`, 标题, 说明, 分类, 事实等级: '已确认', 版本: '2026-09-23', 锚点: `oms.processing.${id}`, 状态: '待评审', 路由: '/oms/self-fulfillment/processing', prd引用: ['PRD/订单处理功能PRD.md'], ...其他 })
const 标注 = {
  关注: 创建标注('work-focus', '阶段作业关注', '按当前阶段筛选可审核、待处理、待核查、失败或部分出库。关注标签只改变列表范围，不增加业务状态。', '交互', { 事实等级: '合理假设', 触发方式: ['点击阶段卡片后点击关注标签。'], 系统动作: ['阶段数量按已应用查询条件统计，关注标签只筛选本阶段列表。', '切换阶段、查询或重置时清除关注和已选项；关注标签可以重叠，数量不能相加。'], 验收要点: ['查询后计数一致，切换关注清空选择；部分出库不显示整单已发货。'], prd引用: ['PRD/订单处理功能PRD.md#18-2026-09-23-完整发货链路界面优化'] }),
  进度: 创建标注('shipment-progress', '实际出库与平台回传', '待发货和已发货优先展示计划、实际出库、剩余数量、跟踪号及时间；平台标发读取独立标发单。', '字段', { 事实等级: '合理假设', 数据来源: ['共享履约单的 plannedQuantity、shippedQuantity、trackingNumber、shippedAt；关联仓库执行与标发单。'], 系统动作: ['缺失跟踪号或标发记录如实显示，不依据渠道名称猜测承运商，不推算出库时间。'], 异常处理: ['已发数量超过计划时显示数量待核查；部分出库仍保留剩余范围。', '没有标发记录不等于无需标发；平台标发失败不回退已发货。'], 验收要点: ['无跟踪号、部分出库、已有出库但标发失败分别展示。'], prd引用: ['PRD/订单处理功能PRD.md#op-04待发货跟踪', 'PRD/订单处理功能PRD.md#op-05已发货与履约闭环'] }),
  队列: 创建标注('queues', '六态队列与对象粒度', '普通模式使用状态名称与数量组成的 Tab；标注模式使用阶段卡片及说明。两者共用队列、筛选与数量，不改变对象粒度。待推单、待发货、已发货以履约单为主行，其余以系统订单为主行。', '页面', { 前置条件: ['已有标准订单及已确认的处理状态。'], 触发方式: ['点击六态页签或标注模式阶段卡片。'], 交互规则: ['用户评审确认：普通模式隐藏阶段任务、序号与解释性提示，删除顶部标题整行及订单规则快捷入口；标注模式保留阶段卡片与解释。', '开关标注只改变展现方式，保留当前队列、查询条件与已选范围。'], 系统动作: ['切换阶段并清空选择；通过有效履约路径派生作业行，不新增同名六态字段。'], 成功结果: ['页签明确数量单位；履约单号去重。'], 异常处理: ['处理状态为空及平台履约不进入队列；多履约单聚合、部分出库仍按提案演示。'], 验收要点: ['验证待审核订单粒度、待推单履约粒度及空态。'], prd引用: ['PRD/订单处理功能PRD.md#72-页签数量与行粒度', 'PRD/订单处理功能PRD.md#185-界面评审修订普通模式与标注模式'] }),
  筛选: 创建标注('filters', '查询与筛选', '按编号 / SKU、平台、仓库及折叠条件查询；切换筛选、队列或分页后清除选择，防止隐藏对象被误操作。', '交互', { 事实等级: '合理假设', 触发方式: ['输入条件后点击查询或按 Enter；点击重置清空全部条件。'], 系统动作: ['所有筛选在完整演示集合生效，然后按主对象稳定排序分页。'], 成功结果: ['数量、当前列表和关联订单数一致。'], 异常处理: ['无匹配结果保留队列定义及重置入口。'], 验收要点: ['折叠条件重置、精确编号与 SKU 关联查询。'] }),
  批量: 创建标注('batch', '批量审核 / 推单资格预检', '当前页选择先冻结对象与版本，再展示可执行及阻断原因，确认后逐项复核；不同业务对象不共用选择键。批量范围与权限为待评审提案。', '交互', { 事实等级: '合理假设', 前置条件: ['选中当前页至少一项待审核订单或待推单履约单。'], 触发方式: ['勾选后点击批量审核 / 批量推单。'], 系统动作: ['显示作用对象、当前版本、资格原因和影响；用户确认后逐对象调用会话内演示命令。'], 成功结果: ['返回成功、失败、处理中、待核查及逐项结果；跨模块共用订单事实。'], 异常处理: ['版本冲突不执行；单项失败不回滚成功项；待核查禁止盲目重试。'], 验收要点: ['混合合格 / 不合格对象、重复点击、跨页清选及结果下载。'], prd引用: ['PRD/订单处理功能PRD.md#op-10批量作业'] }),
  路由: 创建标注('default-route', '待审核的首次 / 默认路由', '待审核阶段写入订单头仓库、服务商、账号、物流渠道及面单模式；保存路由不会推进状态，审核通过后履约单固化执行快照。', '字段', { 前置条件: ['订单处于待审核，无取消或订单级阻断。'], 触发方式: ['点击调整路由，选择已配置路由并填写原因。'], 系统动作: ['校验期望版本并保存前后路由与操作者、原因。'], 成功结果: ['订单仍为待审核，默认路由同步到全渠道详情。'], 异常处理: ['缺失路由、无原因或订单版本变化不能保存。'], 验收要点: ['未分仓订单先保存路由再审；审核后的快照不随订单头变更。'], prd引用: ['PRD/订单处理功能PRD.md#62-分仓与物流选择'] }),
  审核: 创建标注('review', '审核轮次与结果', '已进入待审核表示通过首次准入；本地审核校验商品行、既有履约、现有 SKU 映射及库存结果，每轮只保存一段 decision_note。eBay 订单级 PAID 由平台适配链路判断，paidAt 仅展示、不得替代当前状态；履约 IN_PROGRESS 由用户配置规则拦截并交人工核实范围。', '规则', { 前置条件: ['订单已进入待审核；审核通过前须由平台适配链路确认当前订单级 PAID，并确认默认路由及剩余可履约数量。'], 触发方式: ['系统审核规则执行；单行审核或批量审核预检确认。本地固定样例只演示规则命中结果。'], 系统动作: ['命中 IN_PROGRESS 规则时保留待审核并写入审核摘要，不自动进入异常或清空状态，不生成整单履约。', '重新检查版本和发货条件；全部通过后才增加有效履约单及明细，订单转待推单。'], 成功结果: ['全渠道订单详情同步展示审核摘要；只有通过审核才产生执行快照。'], 异常处理: ['部分履约样例的人工解除、已履约范围核实与剩余数量处置尚未实现，不能自动通过后发整单。', 'SKU / 地址 / 库存正式分流与人工权限仍待确认；人工强制通过、SKU 配对和库存同步不在这里提供。'], 验收要点: ['部分履约样例保留待审核、提示人工核实且不可审核通过；无 OMS 履约单或仓库执行。', '付款时间缺失不产生付款门禁；平台非 PAID 新单不进入处理，准入后非 PAID 更新先转异常。', '通过、SKU 未识别、库存未知、无路由、已取消及已有履约不重复建单。'], prd引用: ['PRD/订单处理功能PRD.md#op-02待审核处理'] }),
  仓库: 创建标注('warehouse', '推仓受理和仓库明确结果', '推单生成独立仓库出库记录，受理仅进入下单中；核查取得外部仓库单号等明确建仓证据后，才聚合为待发货。', '规则', { 前置条件: ['当前有效履约、审核通过、完整路由，且无阻断或已有待核查请求。'], 触发方式: ['点击提交仓库并二次确认；点击核查结果读取仓库事实。'], 系统动作: ['演示生成下单中记录；本地核查正常样例返回待出库，固定超时样例继续等待。'], 成功结果: ['三方仓出库页能按履约单查看相同执行对象；请求受理不提前推进订单。'], 异常处理: ['明确拒绝保持下单失败；结果未确认保持下单中，禁止重复推仓。'], 验收要点: ['已受理、明确建单、固定待核查与失败原因。'], prd引用: ['PRD/订单处理功能PRD.md#op-03待推单处理'] }),
  证据: 创建标注('evidence', '快速查看与权威详情', '快速查看当前阶段、只读商品与默认 / 实际路由、审核摘要、执行证据和操作日志；完整订单统一跳转全渠道详情。', '交互', { 触发方式: ['点击快速查看或主编号。'], 系统动作: ['Drawer 只读展示同一共享订单，关联执行按稳定履约单号跳转。'], 成功结果: ['不复制可编辑商品、金额和地址；不产生第二套订单主数据。'], 异常处理: ['没有关联执行时解释尚未创建。'], 验收要点: ['审核后跳全渠道详情能读到最新状态与审核摘要。'] }),
  发货条件: 创建标注('terminal-gates', '平台变化转异常与人工不发货', 'eBay 已进入订单处理且当前为待审核、待推单、待发货时，cancelStatus.cancelState=IN_PROGRESS/CANCELED 或准入后 orderPaymentStatus 从 PAID 变为 PENDING/FAILED/PARTIALLY_REFUNDED/FULLY_REFUNDED，转为异常，停止后续发货，交人工复核。已发货、不发货保持不变；异常不因平台恢复自动退出。', '规则', { 版本: '2026-09-14', 前置条件: ['订单已经准入；未准入的非 PAID 或取消中新单仍只保留全渠道事实。'], 系统动作: ['记录原阶段、平台前后值、异常原因及来源。仅 FULFILLED 更新交订单标发核对，不直接改处理状态。', '人工复核确认不再发货、OMS 发货量为零且无未结束仓库执行后，操作不发货才转换。'], 异常处理: ['取消中不写最终取消原因/时间，CANCELED 才保存最终取消事实；进入异常不等于仓库撤单成功。', '本地只展示取消中转异常后的固定样例；实时增量、人工不发货操作尚未实现。'], 验收要点: ['取消中样例在异常队列且不能审核，无最终取消原因/时间。', '首次部分履约仍在待审核由规则拦截；已有出库、不发货终态及待核查请求不被覆盖。'], prd引用: ['PRD/订单处理功能PRD.md#43-ebay-履约过程中的平台状态更新'] }),
  边界: 创建标注('prototype-scope', '本轮原型评审边界', '本轮交付本地可交互原型，未连接平台、仓库和库存服务。原型中的批量资格、演示库存与路由候选供评审，不代表所有一期组合已可发布。', '待确认', { 事实等级: '待确认', 数据来源: ['全渠道已有虚构样例及独立新增的本地虚构作业样例。'], 验收要点: ['仅已确认范围可进入生产设计；首发组合、权限、接口、库存责任和恢复规则仍须关闭 PRD 待确认项。'] }),
}
</script>

<template>
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
        <ElInput v-model="筛选.keyword" clearable placeholder="系统订单 / 平台订单 / 履约单 / SKU" aria-label="订单处理关键字" @keyup.enter="查询"><template #prefix><ElIcon><Search /></ElIcon></template></ElInput>
        <ElSelect v-model="筛选.platform" clearable placeholder="全部平台" aria-label="订单处理平台"><ElOption v-for="平台 in ['eBay', 'Temu', 'Mercado Libre', 'Coupang', 'OZON', 'TikTok Shop', 'Rakuten']" :key="平台" :value="平台" /></ElSelect>
        <ElSelect v-model="筛选.warehouse" clearable placeholder="全部发货仓库" aria-label="订单处理发货仓库"><ElOption v-for="仓库 in 可选仓库" :key="仓库" :value="仓库" /></ElSelect>
        <div class="筛选操作"><ElButton type="primary" @click="查询">查询</ElButton><ElButton @click="重置">重置</ElButton><ElButton text @click="高级筛选 = !高级筛选">更多筛选<ElIcon :class="{ 翻转: 高级筛选 }"><ArrowDown /></ElIcon></ElButton></div>
      </div>
      <div v-if="高级筛选" class="高级筛选">
        <ElSelect v-model="筛选.store" clearable placeholder="全部店铺" aria-label="订单处理店铺"><ElOption v-for="店铺 in 可选店铺" :key="店铺" :value="店铺" /></ElSelect>
        <ElSelect v-model="筛选.inventory" clearable placeholder="库存结果" aria-label="订单处理库存结果"><ElOption v-for="值 in ['充足', '不足', '结果未知']" :key="值" :value="值" /></ElSelect>
        <ElSelect v-model="筛选.sku" clearable placeholder="SKU 解析状态" aria-label="订单处理SKU解析状态"><ElOption v-for="值 in ['成功', '缺失', '冲突', '失效', '查询失败', '待解析']" :key="值" :value="值" /></ElSelect>
        <ElSelect v-model="筛选.urgency" clearable placeholder="发货时效" aria-label="订单处理发货时效"><ElOption v-for="值 in ['临期', '今日', '正常', '无时限']" :key="值" :value="值" /></ElSelect>
      </div>
    </section>
    <div v-prototype="标注.关注" class="关注栏"><strong>作业关注</strong><div class="关注选项"><button v-for="关注 in 关注配置[当前队列]" :key="关注" :class="{ 激活: 当前关注 === 关注 }" :aria-pressed="当前关注 === 关注" @click="切换关注(关注)">{{ 关注 }} <b>{{ 关注数量(关注) }}</b></button></div><span v-if="标注模式">当前查询范围 · 标签可重叠</span></div>
    <section v-prototype="可批量 ? 标注.批量 : 标注.发货条件" class="作业工具栏" :class="{ 已选择: 已选.length }">
      <div class="选择摘要"><template v-if="已选.length"><strong>已选 {{ 已选.length }} 张{{ 当前单位 }}</strong><span>当前页 · 可执行 {{ 已选可执行 }} · 阻断 {{ 已选.length - 已选可执行 }}</span><ElButton link @click="清除选择">清空</ElButton></template><template v-else><strong>{{ 当前结果.length }} 张{{ 当前单位 }}</strong><span v-if="当前单位 === '履约单'">涉及 {{ 关联订单数 }} 张系统订单</span><span v-else-if="标注模式">{{ 可批量 ? '勾选当前页对象后批量操作' : '核对原因与关联执行证据' }}</span></template></div>
      <div class="作业工具"><ElButton v-if="可批量" type="primary" :disabled="!已选.length" @click="打开命令()">{{ 当前队列 === '待审核' ? '批量审核' : '批量推单' }}</ElButton><ElButton v-if="批次结果.length" @click="结果打开 = true">批次结果</ElButton><ElTooltip :content="刷新时间 === '尚未手动刷新' ? 刷新时间 : `最近刷新 ${刷新时间} UTC+8`"><ElButton :icon="Refresh" aria-label="刷新订单处理列表" @click="刷新" /></ElTooltip></div>
    </section>
    <div class="表格区">
      <ElTable ref="表格" :data="当前页数据" row-key="key" height="100%" class="作业表格" @selection-change="已选 = $event">
        <ElTableColumn v-if="可批量" type="selection" width="42" fixed="left" />
        <ElTableColumn :label="当前单位 === '履约单' ? '履约单 / 来源订单' : '系统订单 / 平台订单'" min-width="195" fixed="left">
          <template #default="{ row }"><div class="信息格"><button class="编号" @click="row.fulfillment ? 查看详情(row as 作业行) : 查看全渠道(row.order)">{{ row.key }}</button><button v-if="row.fulfillment" class="次编号" @click="查看全渠道(row.order)">{{ row.order.systemOrderNo }}</button><span v-else class="等宽">{{ row.order.platformOrderNo }}</span><span>{{ row.order.platformCode }} · {{ row.order.storeName }}</span><span v-if="当前队列 === '待发货'">发货时限 {{ row.order.shipByLabel }} · {{ 提取发货时区(row.order.shipByAt) }}</span></div></template>
        </ElTableColumn>
        <ElTableColumn label="商品 / 数量" min-width="160"><template #default="{ row }"><div class="信息格"><strong>{{ row.order.items[0]?.systemItemName || '商品待识别' }}</strong><span class="等宽">{{ row.order.items[0]?.systemSku || row.order.items[0]?.platformSku }}</span><div><ElTag v-if="row.order.items.some((项: any) => 项.skuResolutionStatus !== '成功')" size="small" type="danger">SKU 待处理</ElTag><span v-else>{{ row.fulfillment ? '来源 ' : '' }}{{ row.order.items.length }} 行商品</span><span class="数量">{{ 展示计划数量(row.order.items, row.fulfillment?.plannedQuantity) }}</span></div></div></template></ElTableColumn>
        <ElTableColumn label="发货仓库 / 物流渠道" min-width="170"><template #default="{ row }"><div v-prototype="标注.路由" class="信息格"><strong>{{ (row.fulfillment?.route ?? row.order.defaultRoute)?.warehouse || '尚未分配仓库' }}</strong><span>{{ (row.fulfillment?.route ?? row.order.defaultRoute)?.shippingChannel || '尚未分配渠道' }}</span><span>{{ row.fulfillment ? '实际执行快照' : '首次 / 默认路由' }} · {{ (row.fulfillment?.route ?? row.order.defaultRoute)?.labelMode || '—' }}</span></div></template></ElTableColumn>
        <ElTableColumn label="处理 / 执行状态" min-width="140"><template #default="{ row }"><div class="信息格"><div><ElTag size="small" :type="row.order.processingStatus === '异常' ? 'danger' : row.order.processingStatus === '已发货' ? 'success' : row.order.processingStatus === '不发货' ? 'info' : 'primary'">{{ row.order.processingStatus }}</ElTag><small>订单状态</small></div><span v-if="row.execution">仓库：{{ row.execution.状态 }}<b v-if="row.execution.待核查" class="危险字"> · 待核查</b></span><span v-else-if="row.stage === '待审核'">库存：{{ 演示库存[row.order.systemOrderNo] ?? '充足' }}（演示）</span><span v-else>仓库：{{ row.stage === '待推单' ? '尚未提交' : '无当前执行' }}</span><span>平台：{{ row.order.platformOrderStatus || '未接入 · 占位' }}</span></div></template></ElTableColumn>
        <ElTableColumn v-if="!['待发货', '已发货', '不发货'].includes(当前队列)" label="发货时限" width="120"><template #default="{ row }"><div class="信息格"><div class="时效"><ElIcon><Clock /></ElIcon><strong>{{ row.order.shipByLabel }}</strong></div><span>{{ 提取发货时区(row.order.shipByAt) }}</span><span>{{ row.order.urgency === '正常' ? '按当前计划履约' : row.order.urgency }}</span></div></template></ElTableColumn>
        <ElTableColumn v-if="['待发货', '已发货'].includes(当前队列)" label="出库进度 / 物流跟踪" min-width="200"><template #default="{ row }"><div v-prototype="标注.进度" class="信息格"><div class="出库数量"><strong>{{ row.fulfillment?.shippedQuantity ?? 0 }}</strong><span>/ {{ row.fulfillment?.plannedQuantity ?? '—' }} 件出库</span><ElTag v-if="关注命中(row as 作业行, '部分出库')" size="small" type="warning">部分</ElTag></div><span>剩余 {{ 展示剩余数量(row.fulfillment) }} 件</span><span class="等宽">{{ row.fulfillment?.trackingNumber || '跟踪号尚未回传' }}</span><span v-if="row.fulfillment?.shippedAt">{{ row.fulfillment.shippedAt }}</span><span v-else>出库时间尚未回传</span></div></template></ElTableColumn>
        <ElTableColumn v-if="当前队列 === '已发货'" label="平台标发" min-width="160"><template #default="{ row }"><div class="信息格"><ElTag :type="标发记录(row as 作业行)?.status === '标发失败' ? 'danger' : 标发记录(row as 作业行)?.status === '标发成功' ? 'success' : 'info'" size="small">{{ 标发记录(row as 作业行)?.status || '无标发记录' }}</ElTag><span>{{ 标发记录(row as 作业行)?.carrier || '承运商未提供' }}</span><span>{{ 标发记录(row as 作业行)?.reason || 标发记录(row as 作业行)?.exemptionReason || '与仓库出库结果分别核对' }}</span></div></template></ElTableColumn>
        <ElTableColumn v-if="当前队列 !== '已发货'" :label="当前队列 === '待发货' ? '仓库回传 / 下一步' : '处理提示 / 下一步'" min-width="200"><template #default="{ row }"><div class="信息格 原因格"><strong :class="{ 危险字: row.order.blockReason || row.execution?.待核查 || row.execution?.状态 === '下单失败' }">{{ 下一步(row as 作业行) }}</strong><span>{{ row.execution?.原因 || row.order.blockReason || row.order.noShipmentReason || (row.stage === '待审核' || row.stage === '待推单' ? 资格原因(row as 作业行).join('；') || '当前发货条件齐备' : '等待仓库回传有效出库事实') }}</span><small v-if="row.execution">最近回传：{{ row.execution.更新时间 }}</small><small v-if="row.stage === '异常'">人工不发货操作待实现</small></div></template></ElTableColumn>
        <ElTableColumn label="操作" width="130" fixed="right"><template #default="{ row }"><div class="行操作"><template v-if="row.stage === '待审核'"><ElButton v-prototype="标注.审核" link type="primary" @click="打开命令(row as 作业行)">审核</ElButton><ElButton link type="primary" @click="调整路由(row.order)">调整路由</ElButton></template><template v-else-if="row.stage === '待推单'"><ElButton v-if="row.execution?.状态 === '下单失败'" link type="primary" @click="查看执行(row as 作业行)">处理失败</ElButton><ElButton v-else-if="row.execution?.状态 === '下单中'" v-prototype="标注.仓库" link type="primary" @click="核查(row as 作业行)">核查结果</ElButton><ElTooltip v-else :disabled="!资格原因(row as 作业行).length" :content="资格原因(row as 作业行).join('；')"><span><ElButton v-prototype="标注.仓库" link type="primary" :disabled="!!资格原因(row as 作业行).length" @click="打开命令(row as 作业行)">提交仓库</ElButton></span></ElTooltip></template><ElButton v-else-if="row.stage === '待发货'" link type="primary" @click="查看执行(row as 作业行)">查看出库单</ElButton><ElButton v-else-if="row.stage === '已发货'" link type="primary" @click="查看执行(row as 作业行, '标发')">查看标发</ElButton><ElButton v-prototype="标注.证据" link @click="查看详情(row as 作业行)">{{ ['异常', '不发货'].includes(row.stage) ? '查看证据' : '快速查看' }}</ElButton></div></template></ElTableColumn>
        <template #empty><ElEmpty :description="`当前${当前队列}队列没有符合条件的${当前单位}`" :image-size="70"><ElButton plain @click="重置">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
    </div>
    <footer class="分页栏"><span v-if="标注模式">仅包含已进入六态的自配送订单 · 全部数据为虚构演示</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页条数" :page-sizes="[20, 50, 100]" :total="当前结果.length" background layout="total, sizes, prev, pager, next" /></footer>

    <ElDialog v-model="命令打开" :title="`${命令目标.length > 1 ? '批量' : ''}${命令类型} · 操作预检`" width="min(860px, 92vw)" append-to-body :close-on-click-modal="false">
      <div v-prototype="标注.批量"><ElAlert type="info" :closable="false" show-icon :title="命令类型 === '审核' ? '审核通过将创建有效履约单，固化路由快照并进入待推单。' : '确认后提交仓库请求；受理不等于建仓成功，需继续核查结果。'" /><div class="预检摘要"><strong>{{ 命令目标.length }} 张{{ 命令类型 === '审核' ? '订单' : '履约单' }}</strong><span>可执行 {{ 命令目标.filter(项 => !项.reason.length).length }}</span><span class="危险字">阻断 {{ 命令目标.filter(项 => 项.reason.length).length }}</span></div><ElTable :data="命令目标" max-height="340"><ElTableColumn label="作用对象" min-width="220"><template #default="{ row }"><span class="等宽">{{ row.row.key }}</span><div class="浅色字">版本 {{ row.version }}</div></template></ElTableColumn><ElTableColumn label="执行仓库 / 数量" min-width="190"><template #default="{ row }"><div>{{ (row.row.fulfillment?.route ?? row.row.order.defaultRoute)?.warehouse || '待分配' }}</div><span class="浅色字">{{ 展示计划数量(row.row.order.items, row.row.fulfillment?.plannedQuantity) }}</span></template></ElTableColumn><ElTableColumn label="资格结果" min-width="280"><template #default="{ row }"><span :class="row.reason.length ? '危险字' : '通过字'">{{ row.reason.join('；') || '校验条件齐备，将在执行前再次校验' }}</span></template></ElTableColumn></ElTable><p class="原型说明">本地交互演示。批量范围、人工审核语义及权限阈值仍待评审；阻断对象不会被强制通过。</p></div>
      <template #footer><ElButton @click="命令打开 = false">返回检查</ElButton><ElButton type="primary" :loading="批次执行中" @click="确认命令">确认{{ 命令类型 }}</ElButton></template>
    </ElDialog>

    <ElDialog v-model="结果打开" :title="`${命令类型}结果`" width="min(900px, 94vw)" append-to-body><div class="结果统计"><div v-for="(数量, 类型) in 结果统计" :key="类型"><span>{{ 类型 }}</span><strong>{{ 数量 }}</strong></div></div><ElTable :data="批次结果" max-height="380"><ElTableColumn prop="key" label="作用对象" min-width="230" /><ElTableColumn label="结果" width="105"><template #default="{ row }"><ElTag :type="!row.result.成功 ? 'danger' : row.result.待核查 ? 'warning' : 'success'">{{ !row.result.成功 ? '失败' : row.result.待核查 ? '处理中' : '成功' }}</ElTag></template></ElTableColumn><ElTableColumn label="结果说明 / 下一步" min-width="380"><template #default="{ row }">{{ row.result.信息 }}<div v-if="row.result.对象号" class="等宽 浅色字">{{ row.result.对象号 }}</div></template></ElTableColumn></ElTable><template #footer><ElButton @click="导出结果">下载逐项结果</ElButton><ElButton v-if="结果统计.成功 || 结果统计.处理中" type="primary" @click="结果打开 = false; 当前队列 = '待推单'; 重置()">{{ 命令类型 === '审核' ? '进入待推单' : '查看推仓结果' }}</ElButton><ElButton @click="结果打开 = false">关闭</ElButton></template></ElDialog>

    <ElDialog v-model="路由打开" title="调整首次 / 默认路由" width="min(620px, 92vw)" append-to-body :close-on-click-modal="false"><div v-prototype="标注.路由"><div class="路由订单">{{ 路由目标?.systemOrderNo }}<ElTag size="small">待审核</ElTag></div><ElForm label-position="top"><ElFormItem label="发货仓库与物流渠道" required><ElSelect v-model="路由草稿.code" placeholder="选择已配置路由" style="width: 100%"><ElOption v-for="选项 in 演示路由" :key="选项.shippingChannelCode" :value="选项.shippingChannelCode" :label="`${选项.warehouse} · ${选项.shippingChannel}`" /></ElSelect></ElFormItem><div class="路由信息"><div><span>仓储服务商</span><strong>{{ 所选路由?.warehouseProvider || '—' }}</strong></div><div><span>仓库账号</span><strong>{{ 所选路由?.warehouseAccount || '—' }}</strong></div><div><span>渠道代码</span><strong>{{ 所选路由?.shippingChannelCode || '—' }}</strong></div><div><span>面单获取模式</span><strong>{{ 所选路由?.labelMode || '—' }}</strong></div></div><ElFormItem label="调整原因" required><ElInput v-model="路由草稿.reason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="说明本次路由调整依据，写入操作日志" /></ElFormItem></ElForm><ElAlert title="保存路由后仍为待审核；审核通过时履约单再固化执行快照。候选路由及库存校验为演示数据。" type="info" :closable="false" /></div><template #footer><ElButton @click="路由打开 = false">取消</ElButton><ElButton type="primary" @click="保存路由">保存路由</ElButton></template></ElDialog>

    <ElDrawer v-model="详情打开" size="min(800px, 94vw)" append-to-body :with-header="false"><template v-if="当前详情"><div v-prototype="标注.证据" class="详情页眉"><div><small>{{ 当前详情.fulfillment ? '履约单快速查看' : '订单快速查看' }}</small><h2>{{ 当前详情.key }}</h2></div><ElButton @click="详情打开 = false">关闭</ElButton></div><div class="详情状态"><ElTag :type="当前详情.order.processingStatus === '异常' ? 'danger' : 'primary'">{{ 当前详情.order.processingStatus }}</ElTag><span>{{ 当前详情.order.platformCode }} · {{ 当前详情.order.storeName }}</span></div><ElAlert v-if="当前详情.order.blockReason || 当前详情.order.noShipmentReason" v-prototype="标注.发货条件" :title="当前详情.order.blockReason || 当前详情.order.noShipmentReason" :type="当前详情.order.blockReason ? 'warning' : 'info'" :closable="false" show-icon /><div v-prototype="标注.进度" class="履约节点"><div v-for="步骤 in 详情步骤" :key="步骤.标题" :class="{ 已完成: 步骤.完成 }"><ElIcon><CircleCheck v-if="步骤.完成" /><Clock v-else /></ElIcon><strong>{{ 步骤.标题 }}</strong><span>{{ 步骤.内容 }}</span></div></div><div class="下一步卡"><span>当前下一步</span><strong>{{ 下一步(当前详情) }}</strong><p>{{ 队列说明[当前详情.stage] }}</p></div><section class="详情分区"><h3>订单与履约</h3><dl><dt>系统订单号</dt><dd><ElButton link type="primary" @click="查看全渠道(当前详情.order)">{{ 当前详情.order.systemOrderNo }}<ElIcon><Document /></ElIcon></ElButton></dd><dt>平台订单号</dt><dd class="等宽">{{ 当前详情.order.platformOrderNo }}</dd><dt>平台状态</dt><dd>{{ 当前详情.order.platformOrderStatus || '未接入 · 原型占位' }}</dd><dt>当前版本</dt><dd>v{{ 当前版本(当前详情.order.systemOrderNo) }}</dd><dt v-if="当前详情.order.admissionReason">进入 / 准入证据</dt><dd v-if="当前详情.order.admissionReason">{{ 当前详情.order.admissionReason }}</dd><dt>取消时间 / 原因</dt><dd>{{ 当前详情.order.cancelledAt || '无最终取消事实' }}<br v-if="当前详情.order.cancelledReason">{{ 当前详情.order.cancelledReason }}</dd></dl></section><section class="详情分区"><h3>收件信息 <small>标准订单只读摘要</small></h3><dl><dt>国家 / 地区</dt><dd>{{ 当前详情.order.address.countryCode }} · {{ 当前详情.order.address.stateProvince || '—' }} · {{ 当前详情.order.address.city || '—' }}</dd><dt>邮编</dt><dd>{{ 当前详情.order.address.postalCode || '未提供' }}</dd><dt>地址</dt><dd>{{ 当前详情.order.address.addressLine1 }} {{ 当前详情.order.address.addressLine2 }}</dd></dl></section><section class="详情分区"><h3>商品与数量 <small>中台既有 SKU 映射结果 · 只读</small></h3><div v-for="商品 in 当前详情.order.items" :key="商品.externalLineId" class="商品行"><div><strong>{{ 商品.systemItemName || 商品.platformItemTitle }}</strong><span>{{ 商品.systemSku || '未识别系统 SKU' }} · {{ 商品.skuResolutionStatus }}</span><span>平台 SKU：{{ 商品.platformSku }}</span></div><b>{{ 商品.fulfillableQuantity ?? '—' }} 件</b></div></section><section class="详情分区"><h3>{{ 当前详情.fulfillment ? '履约执行快照' : '订单头首次 / 默认路由' }}</h3><dl><dt>仓库 / 账号</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouse || '待分配' }}<br>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouseAccount || '—' }}</dd><dt>物流渠道</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.shippingChannel || '待分配' }}</dd><dt>面单获取模式</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.labelMode || '待分配' }}</dd><dt v-if="当前详情.fulfillment">计划 / 有效出库</dt><dd v-if="当前详情.fulfillment">{{ 当前详情.fulfillment.plannedQuantity }} / {{ 当前详情.fulfillment.shippedQuantity }}</dd></dl><ElButton v-if="当前详情.stage === '待审核'" :icon="Setting" @click="调整路由(当前详情.order)">调整默认路由</ElButton></section><section class="详情分区"><h3>关联仓库执行</h3><template v-if="详情执行"><article v-for="执行 in 详情执行列表" :key="执行.履约单号" class="关联执行卡"><strong>{{ 执行.履约单号 }}</strong><dl><dt>OMS 出库单号</dt><dd class="等宽">{{ 执行.出库单号 }}</dd><dt>外部仓库单号</dt><dd>{{ 执行.外部仓库单号 || '尚未认领' }}</dd><dt>仓库状态</dt><dd>{{ 执行.状态 }}{{ 执行.待核查 ? ' · 待核查' : '' }}</dd><dt>最近更新</dt><dd>{{ 执行.更新时间 }}</dd><dt v-if="执行.原因">结果说明</dt><dd v-if="执行.原因">{{ 执行.原因 }}</dd></dl></article><ElButton :icon="Van" @click="查看执行(当前详情)">查看三方仓出库单</ElButton></template><p v-else class="浅色字">当前对象没有关联仓库执行记录。</p></section><section class="详情分区"><h3>审核记录 <small>每轮一段结果摘要</small></h3><p v-if="!当前详情.order.reviews.length" class="浅色字">尚未执行审核。</p><article v-for="记录 in [...当前详情.order.reviews].reverse()" :key="记录.round" class="审核记录"><header><strong>第 {{ 记录.round }} 轮 · {{ 记录.type }}</strong><ElTag size="small" :type="记录.status === '已通过' ? 'success' : 'warning'">{{ 记录.status }}</ElTag></header><p>{{ 记录.decisionNote || '本轮尚无最终结论' }}</p><small>{{ 记录.completedAt || '—' }}</small></article></section><section class="详情分区"><h3>操作日志</h3><p v-if="!当前详情.order.operationLogs.length" class="浅色字">当前占位样例暂无操作日志。</p><div v-for="(日志, 索引) in [...当前详情.order.operationLogs].reverse()" :key="索引" class="日志行"><ElIcon><CircleCheck /></ElIcon><div><strong>{{ 日志.operationType }} · {{ 日志.operationResult }}</strong><p>{{ 日志.content }}</p><small>{{ 日志.operatedAt }} · {{ 日志.operator }}</small></div></div></section></template><template #footer><div v-if="当前详情" class="详情动作"><ElButton @click="查看全渠道(当前详情.order)">完整订单详情</ElButton><ElButton v-if="当前详情.stage === '待审核'" type="primary" @click="详情打开 = false; 打开命令(当前详情)">审核预检</ElButton><ElButton v-else-if="当前详情.stage === '待推单' && !资格原因(当前详情).length" type="primary" @click="详情打开 = false; 打开命令(当前详情)">提交仓库</ElButton><ElButton v-else-if="当前详情.stage === '已发货'" type="primary" @click="详情打开 = false; 查看执行(当前详情, '标发')">查看订单标发</ElButton><ElButton v-else-if="详情执行" type="primary" @click="详情打开 = false; 查看执行(当前详情)">查看仓库执行</ElButton></div></template></ElDrawer>
  </section>
</template>

<style scoped>
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
.工作台标题{display:flex;min-height:55px;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #e9edf2;gap:10px}.工作台标题>div{display:flex;align-items:center;gap:10px}.工作台标题 h1{margin:0;font-size:17px;font-weight:650}.工作台标题 span{color:#8390a2;font-size:12px}.标题图标{width:30px;height:30px;border-radius:7px;background:#eaf3ff;color:#287ad2;font-size:18px}.标题工具{flex-shrink:0}.队列栏{display:flex;min-height:48px;flex:0 0 48px;border-bottom:1px solid #e9edf2;padding:0 10px;gap:3px}.队列栏 button{position:relative;display:flex;align-items:center;gap:7px;padding:0 15px;border:0;background:transparent;font-size:13px;color:#667085;cursor:pointer;white-space:nowrap}.队列栏 button.激活{color:#287ad2}.队列栏 button.激活:after{position:absolute;bottom:0;left:14px;right:14px;height:3px;border-radius:2px;background:#3286e5;content:''}.队列栏 b{font-size:12px;padding:2px 6px;background:#f0f3f7;border-radius:5px}.队列栏 button.激活 b{background:#eaf3ff}.队列栏 small{font-size:10px;color:#8995a5}.状态圆点{width:6px;height:6px;background:#8295b0;border-radius:50%}.状态-待审核{background:#d5a248}.状态-待推单{background:#6b99e8}.状态-待发货{background:#699fc6}.状态-已发货{background:#55ad8c}.状态-异常{background:#e07878}.状态-不发货{background:#9aa3af}.队列提示{display:flex;align-items:center;gap:7px;min-height:33px;padding:5px 16px;background:#f8fafc;border-bottom:1px solid #edf0f4;font-size:12px;color:#778598}.队列提示>span{flex:1}.队列提示 .el-icon{color:#86a4c9;flex-shrink:0}.筛选区{padding:10px 14px;border-bottom:1px solid #e9edf2;background:#fff}.主筛选{display:grid;grid-template-columns:minmax(290px,1.5fr) minmax(130px,.6fr) minmax(180px,.8fr) max-content;gap:9px}.筛选操作{display:flex;align-items:center;white-space:nowrap}.高级筛选{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:10px;padding-top:10px;border-top:1px dashed #e4e8ed}.翻转{transform:rotate(180deg)}.作业工具栏{display:flex;align-items:center;justify-content:space-between;min-height:49px;padding:7px 14px;gap:10px;border-bottom:1px solid #e8edf4}.作业工具栏.已选择{background:#f0f7ff}.选择摘要,.作业工具{display:flex;align-items:center;gap:12px}.选择摘要 strong{font-size:12px}.选择摘要 span{color:#8390a2;font-size:11px}.表格区{flex:1;min-height:210px;min-width:0;overflow:hidden}.作业表格{--el-table-border-color:#edf0f4;--el-table-header-bg-color:#f7f9fc;--el-table-row-hover-bg-color:#f6faff;font-size:12px}.作业表格 :deep(th.el-table__cell){font-size:12px;font-weight:600;color:#68788e;height:39px;background:#f7f9fc}.作业表格 :deep(td.el-table__cell){padding:9px 0;vertical-align:top}.作业表格 :deep(.cell){padding:0 10px}.作业表格 :deep(.el-table-fixed-column--left),.作业表格 :deep(.el-table-fixed-column--right){background:#fff}.信息格{display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:65px}.信息格 strong{font-weight:600;font-size:12px;color:#394962}.信息格>span,.信息格 small{color:#8390a2;font-size:11px;line-height:1.5}.信息格>div{display:flex;align-items:center;gap:6px}.信息格 small{margin-left:4px}.等宽{font-family:Consolas,'Microsoft YaHei',monospace}.编号,.次编号{display:block;width:max-content;max-width:100%;padding:0;border:0;background:none;color:#2875c9;cursor:pointer;font-family:Consolas,'Microsoft YaHei',monospace;white-space:nowrap;text-align:left}.编号{font-size:12px;font-weight:700}.次编号{font-size:11px}.编号:hover,.次编号:hover{text-decoration:underline}.数量{font-size:10px;color:#7e8a9b}.时效{display:flex;align-items:center;gap:5px;color:#8a9db7}.原因格{max-width:340px}.原因格>span{white-space:normal;line-height:1.55;color:#798496}.行操作{display:flex;min-height:65px;flex-wrap:wrap;align-content:center;gap:3px 8px}.行操作 .el-button+.el-button{margin:0}.行操作 .el-button{font-size:11px;min-height:20px;padding:0}.危险字{color:#c8773d!important;font-size:11px}.通过字{color:#388d67}.浅色字{color:#8592a5;font-size:12px;line-height:1.6}.分页栏{display:flex;align-items:center;justify-content:space-between;min-height:48px;gap:10px;padding:0 14px;border-top:1px solid #e9edf2}.分页栏>span{color:#8a96a7;font-size:11px}.预检摘要{display:flex;align-items:center;gap:20px;padding:16px 2px}.预检摘要 strong{font-size:14px}.预检摘要 span{font-size:12px;color:#77879b}.原型说明{font-size:12px;color:#8b97a7;line-height:1.6}.结果统计{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}.结果统计>div{display:flex;flex-direction:column;gap:7px;padding:13px;border:1px solid #e7edf5;border-radius:6px;background:#f8fafc}.结果统计 span{color:#8290a2;font-size:12px}.结果统计 strong{font-size:24px}.路由订单{display:flex;align-items:center;gap:10px;padding-bottom:20px;font-family:Consolas,monospace;font-size:15px}.路由信息{display:grid;grid-template-columns:1fr 1fr;gap:15px;padding:16px;background:#f7f9fc;border-radius:6px;margin-bottom:18px}.路由信息>div{display:flex;flex-direction:column;gap:5px}.路由信息 span{color:#8c98a8;font-size:11px}.路由信息 strong{font-size:12px;font-weight:500}.详情页眉{display:flex;align-items:center;justify-content:space-between;gap:15px}.详情页眉 small{color:#8b98aa}.详情页眉 h2{margin:7px 0 0;font-size:18px;font-family:Consolas,monospace;overflow-wrap:anywhere}.详情状态{display:flex;align-items:center;gap:10px;margin:14px 0 20px}.详情状态 span{color:#7c8b9e;font-size:12px}.详情分区{padding:18px 0;border-bottom:1px solid #edf0f4}.详情分区 h3{display:flex;align-items:center;gap:9px;margin:0 0 15px;font-size:14px}.详情分区 h3 small{font-size:11px;font-weight:400;color:#8a99ad}.详情分区 dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;margin:0}.详情分区 dt{color:#8a97aa;font-size:12px}.详情分区 dd{margin:0;color:#47566c;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.商品行{display:flex;justify-content:space-between;gap:12px;padding:12px;background:#f8fafc;border:1px solid #eef1f6;border-radius:6px;margin-top:8px}.商品行>div{display:flex;flex-direction:column;gap:5px;min-width:0}.商品行 strong{font-size:12px;font-weight:500}.商品行 span{color:#8391a4;font-size:11px}.商品行 b{color:#73829b;font-size:13px;white-space:nowrap}.审核记录{padding:13px;border:1px solid #e5ebf3;border-radius:6px;margin:10px 0}.审核记录 header{display:flex;justify-content:space-between;gap:10px}.审核记录 strong{font-size:12px}.审核记录 p,.日志行 p{font-size:12px;color:#78869b;line-height:1.7;margin:9px 0}.审核记录 small,.日志行 small{color:#9ba6b6;font-size:11px}.日志行{display:flex;gap:10px;padding:12px 0}.日志行>.el-icon{color:#78a4ce;margin-top:2px}.日志行 strong{font-size:12px;font-weight:500}.日志行 p{margin:5px 0}
@media(max-width:1400px){.队列栏{gap:0}.队列栏 button{padding:0 11px;gap:5px}.主筛选{grid-template-columns:minmax(230px,1.2fr) 130px minmax(170px,.8fr) max-content}.分页栏>span{max-width:300px;line-height:1.5}.工作台标题>div:first-child>span{display:none}}
@media(max-width:1050px){.主筛选{grid-template-columns:minmax(210px,1fr) 130px minmax(160px,1fr)}.筛选操作{grid-column:1/-1;justify-self:end}.队列栏{overflow-x:auto}.队列栏 button{padding:0 9px}.作业工具栏{align-items:flex-start}.选择摘要{flex-wrap:wrap;gap:5px 10px}.分页栏>span{display:none}.分页栏{justify-content:flex-end}.高级筛选{grid-template-columns:1fr 1fr}}
@container(max-width:1050px){.阶段导航{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px;padding:10px}.阶段卡{display:grid;grid-template-columns:1fr auto;gap:4px;padding:10px}.阶段卡首行 small{display:none}.阶段卡首行>span{white-space:nowrap}.阶段数量{grid-column:2;grid-row:1/3;align-self:center}.阶段数量 b{font-size:21px}.阶段任务{font-size:10px}.关注栏>span{display:none}}
@container(max-width:780px){.主筛选{grid-template-columns:minmax(180px,1fr) 110px 140px!important}.筛选操作{grid-column:1/-1;justify-self:end}.分页栏>span{display:none}.高级筛选{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
</style>
