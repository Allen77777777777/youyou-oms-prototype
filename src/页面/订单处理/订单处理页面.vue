<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, CircleCheck, Clock, Document, InfoFilled, Refresh, Search, Setting, Van, Warning } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElDrawer, ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import type { 全渠道订单, 履约单摘要, 订单处理状态 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 当前版本, 审核阻断原因, 推单阻断原因, 执行演示审核, 执行演示推单, 核查演示仓库结果, 演示库存, 演示路由, 记录操作, type 仓库执行, type 命令结果 } from './演示会话'
import { 展示计划数量, 提取发货时区 } from './展示工具'

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
interface 作业行 { key: string; order: 全渠道订单; fulfillment?: 履约单摘要; execution?: 仓库执行; stage: 订单处理状态 }
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
const 当前结果 = computed(() => 筛选后作业.value.filter((行) => 行.stage === 当前队列.value).sort((甲, 乙) => 甲.key.localeCompare(乙.key)))
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
function 查询() { Object.assign(已应用筛选, 筛选); 当前页.value = 1; 清除选择() }
function 重置() { Object.assign(筛选, 默认筛选()); 查询() }
watch([当前队列, 当前页, 每页条数], 清除选择)
watch(当前队列, () => { 当前页.value = 1 })
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
const 详情执行 = computed(() => 当前详情.value?.fulfillment ? 仓库执行记录.value.find((项) => 项.履约单号 === 当前详情.value!.fulfillment!.fulfillmentOrderNo) : undefined)

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

const 创建标注 = (id: string, 标题: string, 说明: string, 分类: '页面' | '字段' | '交互' | '规则' | '待确认', 其他: Partial<原型标注> = {}): 原型标注 & { 分类: string } => ({ id: `oms.processing.${id}`, 标题, 说明, 分类, 事实等级: '已确认', 版本: '2026-09-12', 状态: '待评审', 路由: '/oms/self-fulfillment/processing', prd引用: ['PRD/订单处理功能PRD.md'], ...其他 })
const 标注 = {
  队列: 创建标注('queues', '六态队列与对象粒度', '订单处理复用全渠道订单主事实，仅收录已进入六态的自配送订单。待推单、待发货、已发货以履约单为主行，其余以系统订单为主行。', '页面', { 前置条件: ['已有标准订单及已确认的处理状态。'], 触发方式: ['点击六态页签。'], 系统动作: ['切换阶段并清空选择；通过有效履约路径派生作业行，不新增同名六态字段。'], 成功结果: ['页签明确数量单位；履约单号去重。'], 异常处理: ['处理状态为空及平台履约不进入队列；多履约单聚合、部分出库仍按提案演示。'], 验收要点: ['验证待审核订单粒度、待推单履约粒度及空态。'], prd引用: ['PRD/订单处理功能PRD.md#72-页签数量与行粒度'] }),
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
  <section class="订单处理页面">
    <header class="工作台标题">
      <div><ElIcon class="标题图标"><Document /></ElIcon><h1>订单处理</h1><span>自配送履约工作台</span></div>
      <div class="标题工具"><ElTag v-prototype="标注.边界" size="small" type="info" effect="plain">演示数据 · 待评审</ElTag><ElButton text @click="router.push('/oms/orders/all')">全渠道订单</ElButton></div>
    </header>
    <nav v-prototype="标注.队列" class="队列栏" aria-label="订单处理六态队列">
      <button v-for="状态 in 六态" :key="状态" type="button" :class="{ 激活: 当前队列 === 状态 }" @click="当前队列 = 状态">
        <span class="状态圆点" :class="`状态-${状态}`"></span>{{ 状态 }}<b>{{ 筛选后作业.filter(行 => 行.stage === 状态).length }}</b><small>{{ ['待推单', '待发货', '已发货'].includes(状态) ? '履约单' : '订单' }}</small>
      </button>
    </nav>
    <div class="队列提示"><ElIcon><InfoFilled /></ElIcon><span>{{ 队列说明[当前队列] }}</span><ElButton v-if="当前队列 === '待审核'" link @click="router.push('/oms/self-fulfillment/order-rules')">订单规则</ElButton></div>
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
    <section v-prototype="可批量 ? 标注.批量 : 标注.发货条件" class="作业工具栏" :class="{ 已选择: 已选.length }">
      <div class="选择摘要"><template v-if="已选.length"><strong>已选 {{ 已选.length }} 张{{ 当前单位 }}</strong><span>当前页 · 可执行 {{ 已选可执行 }} · 阻断 {{ 已选.length - 已选可执行 }}</span><ElButton link @click="清除选择">清空</ElButton></template><template v-else><strong>{{ 当前结果.length }} 张{{ 当前单位 }}</strong><span v-if="当前单位 === '履约单'">涉及 {{ 关联订单数 }} 张系统订单</span><span v-else>勾选当前页对象后批量操作</span></template></div>
      <div class="作业工具"><ElButton v-if="可批量" type="primary" :disabled="!已选.length" @click="打开命令()">{{ 当前队列 === '待审核' ? '批量审核' : '批量推单' }}</ElButton><ElButton v-if="批次结果.length" @click="结果打开 = true">批次结果</ElButton><ElTooltip :content="刷新时间 === '尚未手动刷新' ? 刷新时间 : `最近刷新 ${刷新时间} UTC+8`"><ElButton :icon="Refresh" aria-label="刷新订单处理列表" @click="刷新" /></ElTooltip></div>
    </section>
    <div class="表格区">
      <ElTable ref="表格" :data="当前页数据" row-key="key" height="100%" class="作业表格" @selection-change="已选 = $event">
        <ElTableColumn v-if="可批量" type="selection" width="42" fixed="left" />
        <ElTableColumn :label="当前单位 === '履约单' ? '履约单 / 来源订单' : '系统订单 / 平台订单'" min-width="222" fixed="left">
          <template #default="{ row }"><div class="信息格"><button class="编号" @click="row.fulfillment ? 查看详情(row as 作业行) : 查看全渠道(row.order)">{{ row.key }}</button><button v-if="row.fulfillment" class="次编号" @click="查看全渠道(row.order)">{{ row.order.systemOrderNo }}</button><span v-else class="等宽">{{ row.order.platformOrderNo }}</span><span>{{ row.order.platformCode }} · {{ row.order.storeName }}</span></div></template>
        </ElTableColumn>
        <ElTableColumn label="商品 / 履约数量" min-width="205"><template #default="{ row }"><div class="信息格"><strong>{{ row.order.items[0]?.systemItemName || '商品待识别' }}</strong><span class="等宽">{{ row.order.items[0]?.systemSku || row.order.items[0]?.platformSku }}</span><div><ElTag v-if="row.order.items.some((项: any) => 项.skuResolutionStatus !== '成功')" size="small" type="danger">SKU 待处理</ElTag><span v-else>{{ row.order.items.length }} 行商品</span><span class="数量">{{ 展示计划数量(row.order.items, row.fulfillment?.plannedQuantity) }} · 已发 {{ row.fulfillment?.shippedQuantity ?? 0 }}</span></div></div></template></ElTableColumn>
        <ElTableColumn label="发货仓库 / 物流渠道" min-width="212"><template #default="{ row }"><div v-prototype="标注.路由" class="信息格"><strong>{{ (row.fulfillment?.route ?? row.order.defaultRoute)?.warehouse || '尚未分配仓库' }}</strong><span>{{ (row.fulfillment?.route ?? row.order.defaultRoute)?.shippingChannel || '尚未分配渠道' }}</span><span>{{ row.fulfillment ? '实际执行快照' : '首次 / 默认路由' }} · {{ (row.fulfillment?.route ?? row.order.defaultRoute)?.labelMode || '—' }}</span></div></template></ElTableColumn>
        <ElTableColumn label="处理 / 执行状态" min-width="176"><template #default="{ row }"><div class="信息格"><div><ElTag size="small" :type="row.order.processingStatus === '异常' ? 'danger' : row.order.processingStatus === '已发货' ? 'success' : row.order.processingStatus === '不发货' ? 'info' : 'primary'">{{ row.order.processingStatus }}</ElTag><small>订单状态</small></div><span v-if="row.execution">仓库：{{ row.execution.状态 }}<b v-if="row.execution.待核查" class="危险字"> · 待核查</b></span><span v-else-if="row.stage === '待审核'">库存：{{ 演示库存[row.order.systemOrderNo] ?? '充足' }}（演示）</span><span v-else>仓库：{{ row.stage === '待推单' ? '尚未提交' : '无当前执行' }}</span><span>平台：{{ row.order.platformOrderStatus || '未接入 · 占位' }}</span></div></template></ElTableColumn>
        <ElTableColumn label="发货时限" width="155"><template #default="{ row }"><div class="信息格"><div class="时效"><ElIcon><Clock /></ElIcon><strong>{{ row.order.shipByLabel }}</strong></div><span>{{ 提取发货时区(row.order.shipByAt) }}</span><span>{{ row.order.urgency === '正常' ? '按当前计划履约' : row.order.urgency }}</span></div></template></ElTableColumn>
        <ElTableColumn label="原因 / 下一步" min-width="252"><template #default="{ row }"><div class="信息格 原因格"><span :class="{ 危险字: row.order.blockReason || row.execution?.待核查 || (row.stage === '待审核' && 资格原因(row as 作业行).length) }">{{ row.execution?.原因 || row.order.blockReason || row.order.noShipmentReason || (row.stage === '待审核' ? 资格原因(row as 作业行).join('；') || '校验条件齐备，可执行审核' : row.stage === '待推单' ? 资格原因(row as 作业行).join('；') || '审核已通过，等待提交仓库' : row.stage === '已发货' ? '仓库出库事实已保留，继续核对标发结果' : '等待仓库回传出库事实') }}</span><small v-if="row.stage === '异常'">人工复核后操作不发货（原型暂未实现该操作）</small><small v-else-if="row.stage === '不发货'">无需 OMS 再次发货</small><small v-else-if="row.execution?.待核查">先核查原请求，禁止重复提交</small></div></template></ElTableColumn>
        <ElTableColumn label="操作" width="144" fixed="right"><template #default="{ row }"><div class="行操作"><template v-if="row.stage === '待审核'"><ElButton v-prototype="标注.审核" link type="primary" @click="打开命令(row as 作业行)">审核</ElButton><ElButton link type="primary" @click="调整路由(row.order)">调整路由</ElButton></template><template v-else-if="row.stage === '待推单'"><ElButton v-if="row.execution?.状态 === '下单中'" v-prototype="标注.仓库" link type="primary" @click="核查(row as 作业行)">核查结果</ElButton><ElTooltip v-else :disabled="!资格原因(row as 作业行).length" :content="资格原因(row as 作业行).join('；')"><span><ElButton v-prototype="标注.仓库" link type="primary" :disabled="!!资格原因(row as 作业行).length" @click="打开命令(row as 作业行)">提交仓库</ElButton></span></ElTooltip></template><ElButton v-else-if="row.stage === '待发货'" link type="primary" @click="查看执行(row as 作业行)">查看出库单</ElButton><ElButton v-else-if="row.stage === '已发货'" link type="primary" @click="查看执行(row as 作业行, '标发')">查看标发</ElButton><ElButton v-prototype="标注.证据" link @click="查看详情(row as 作业行)">{{ ['异常', '不发货'].includes(row.stage) ? '查看证据' : '快速查看' }}</ElButton></div></template></ElTableColumn>
        <template #empty><ElEmpty :description="`当前${当前队列}队列没有符合条件的${当前单位}`" :image-size="70"><ElButton plain @click="重置">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
    </div>
    <footer class="分页栏"><span>仅包含已进入六态的自配送订单 · 全部数据为虚构演示</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页条数" :page-sizes="[20, 50, 100]" :total="当前结果.length" background layout="total, sizes, prev, pager, next" /></footer>

    <ElDialog v-model="命令打开" :title="`${命令目标.length > 1 ? '批量' : ''}${命令类型} · 操作预检`" width="min(860px, 92vw)" append-to-body :close-on-click-modal="false">
      <div v-prototype="标注.批量"><ElAlert type="info" :closable="false" show-icon :title="命令类型 === '审核' ? '审核通过将创建有效履约单，固化路由快照并进入待推单。' : '确认后提交仓库请求；受理不等于建仓成功，需继续核查结果。'" /><div class="预检摘要"><strong>{{ 命令目标.length }} 张{{ 命令类型 === '审核' ? '订单' : '履约单' }}</strong><span>可执行 {{ 命令目标.filter(项 => !项.reason.length).length }}</span><span class="危险字">阻断 {{ 命令目标.filter(项 => 项.reason.length).length }}</span></div><ElTable :data="命令目标" max-height="340"><ElTableColumn label="作用对象" min-width="220"><template #default="{ row }"><span class="等宽">{{ row.row.key }}</span><div class="浅色字">版本 {{ row.version }}</div></template></ElTableColumn><ElTableColumn label="资格结果" min-width="340"><template #default="{ row }"><span :class="row.reason.length ? '危险字' : '通过字'">{{ row.reason.join('；') || '校验条件齐备，将在执行前再次校验' }}</span></template></ElTableColumn></ElTable><p class="原型说明">本地交互演示。批量范围、人工审核语义及权限阈值仍待评审；阻断对象不会被强制通过。</p></div>
      <template #footer><ElButton @click="命令打开 = false">返回检查</ElButton><ElButton type="primary" :loading="批次执行中" @click="确认命令">确认{{ 命令类型 }}</ElButton></template>
    </ElDialog>

    <ElDialog v-model="结果打开" :title="`${命令类型}结果`" width="min(900px, 94vw)" append-to-body><div class="结果统计"><div v-for="(数量, 类型) in 结果统计" :key="类型"><span>{{ 类型 }}</span><strong>{{ 数量 }}</strong></div></div><ElTable :data="批次结果" max-height="380"><ElTableColumn prop="key" label="作用对象" min-width="230" /><ElTableColumn label="结果" width="105"><template #default="{ row }"><ElTag :type="!row.result.成功 ? 'danger' : row.result.待核查 ? 'warning' : 'success'">{{ !row.result.成功 ? '失败' : row.result.待核查 ? '处理中' : '成功' }}</ElTag></template></ElTableColumn><ElTableColumn label="结果说明 / 下一步" min-width="380"><template #default="{ row }">{{ row.result.信息 }}<div v-if="row.result.对象号" class="等宽 浅色字">{{ row.result.对象号 }}</div></template></ElTableColumn></ElTable><template #footer><ElButton @click="导出结果">下载逐项结果</ElButton><ElButton type="primary" @click="结果打开 = false">完成</ElButton></template></ElDialog>

    <ElDialog v-model="路由打开" title="调整首次 / 默认路由" width="min(620px, 92vw)" append-to-body :close-on-click-modal="false"><div v-prototype="标注.路由"><div class="路由订单">{{ 路由目标?.systemOrderNo }}<ElTag size="small">待审核</ElTag></div><ElForm label-position="top"><ElFormItem label="发货仓库与物流渠道" required><ElSelect v-model="路由草稿.code" placeholder="选择已配置路由" style="width: 100%"><ElOption v-for="选项 in 演示路由" :key="选项.shippingChannelCode" :value="选项.shippingChannelCode" :label="`${选项.warehouse} · ${选项.shippingChannel}`" /></ElSelect></ElFormItem><div class="路由信息"><div><span>仓储服务商</span><strong>{{ 所选路由?.warehouseProvider || '—' }}</strong></div><div><span>仓库账号</span><strong>{{ 所选路由?.warehouseAccount || '—' }}</strong></div><div><span>渠道代码</span><strong>{{ 所选路由?.shippingChannelCode || '—' }}</strong></div><div><span>面单获取模式</span><strong>{{ 所选路由?.labelMode || '—' }}</strong></div></div><ElFormItem label="调整原因" required><ElInput v-model="路由草稿.reason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="说明本次路由调整依据，写入操作日志" /></ElFormItem></ElForm><ElAlert title="保存路由后仍为待审核；审核通过时履约单再固化执行快照。候选路由及库存校验为演示数据。" type="info" :closable="false" /></div><template #footer><ElButton @click="路由打开 = false">取消</ElButton><ElButton type="primary" @click="保存路由">保存路由</ElButton></template></ElDialog>

    <ElDrawer v-model="详情打开" size="min(700px, 94vw)" append-to-body :with-header="false"><template v-if="当前详情"><div v-prototype="标注.证据" class="详情页眉"><div><small>{{ 当前详情.fulfillment ? '履约单快速查看' : '订单快速查看' }}</small><h2>{{ 当前详情.key }}</h2></div><ElButton @click="详情打开 = false">关闭</ElButton></div><div class="详情状态"><ElTag :type="当前详情.order.processingStatus === '异常' ? 'danger' : 'primary'">{{ 当前详情.order.processingStatus }}</ElTag><span>{{ 当前详情.order.platformCode }} · {{ 当前详情.order.storeName }}</span></div><ElAlert v-if="当前详情.order.blockReason || 当前详情.order.noShipmentReason" v-prototype="标注.发货条件" :title="当前详情.order.blockReason || 当前详情.order.noShipmentReason" :type="当前详情.order.blockReason ? 'warning' : 'info'" :closable="false" show-icon /><section class="详情分区"><h3>订单与履约</h3><dl><dt>系统订单号</dt><dd><ElButton link type="primary" @click="查看全渠道(当前详情.order)">{{ 当前详情.order.systemOrderNo }}<ElIcon><Document /></ElIcon></ElButton></dd><dt>平台订单号</dt><dd class="等宽">{{ 当前详情.order.platformOrderNo }}</dd><dt>平台状态</dt><dd>{{ 当前详情.order.platformOrderStatus || '未接入 · 原型占位' }}</dd><dt>当前版本</dt><dd>v{{ 当前版本(当前详情.order.systemOrderNo) }}</dd><dt v-if="当前详情.order.admissionReason">进入 / 准入证据</dt><dd v-if="当前详情.order.admissionReason">{{ 当前详情.order.admissionReason }}</dd><dt>取消时间 / 原因</dt><dd>{{ 当前详情.order.cancelledAt || '无最终取消事实' }}<br v-if="当前详情.order.cancelledReason">{{ 当前详情.order.cancelledReason }}</dd></dl></section><section class="详情分区"><h3>商品与数量 <small>中台既有 SKU 映射结果 · 只读</small></h3><div v-for="商品 in 当前详情.order.items" :key="商品.externalLineId" class="商品行"><div><strong>{{ 商品.systemItemName || 商品.platformItemTitle }}</strong><span>{{ 商品.systemSku || '未识别系统 SKU' }} · {{ 商品.skuResolutionStatus }}</span><span>平台 SKU：{{ 商品.platformSku }}</span></div><b>{{ 商品.fulfillableQuantity ?? '—' }} 件</b></div></section><section class="详情分区"><h3>{{ 当前详情.fulfillment ? '履约执行快照' : '订单头首次 / 默认路由' }}</h3><dl><dt>仓库 / 账号</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouse || '待分配' }}<br>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.warehouseAccount || '—' }}</dd><dt>物流渠道</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.shippingChannel || '待分配' }}</dd><dt>面单获取模式</dt><dd>{{ (当前详情.fulfillment?.route ?? 当前详情.order.defaultRoute)?.labelMode || '待分配' }}</dd><dt v-if="当前详情.fulfillment">计划 / 有效出库</dt><dd v-if="当前详情.fulfillment">{{ 当前详情.fulfillment.plannedQuantity }} / {{ 当前详情.fulfillment.shippedQuantity }}</dd></dl><ElButton v-if="当前详情.stage === '待审核'" :icon="Setting" @click="调整路由(当前详情.order)">调整默认路由</ElButton></section><section class="详情分区"><h3>关联仓库执行</h3><template v-if="详情执行"><dl><dt>OMS 出库单号</dt><dd class="等宽">{{ 详情执行.出库单号 }}</dd><dt>外部仓库单号</dt><dd>{{ 详情执行.外部仓库单号 || '尚未认领' }}</dd><dt>仓库状态</dt><dd>{{ 详情执行.状态 }}{{ 详情执行.待核查 ? ' · 待核查' : '' }}</dd><dt>最近更新</dt><dd>{{ 详情执行.更新时间 }}</dd><dt v-if="详情执行.原因">结果说明</dt><dd v-if="详情执行.原因">{{ 详情执行.原因 }}</dd></dl><ElButton :icon="Van" @click="查看执行(当前详情)">查看三方仓出库单</ElButton></template><p v-else class="浅色字">尚无关联仓库执行。先审核形成履约单，再提交仓库。</p></section><section class="详情分区"><h3>审核记录 <small>每轮一段结果摘要</small></h3><p v-if="!当前详情.order.reviews.length" class="浅色字">尚未执行审核。</p><article v-for="记录 in [...当前详情.order.reviews].reverse()" :key="记录.round" class="审核记录"><header><strong>第 {{ 记录.round }} 轮 · {{ 记录.type }}</strong><ElTag size="small" :type="记录.status === '已通过' ? 'success' : 'warning'">{{ 记录.status }}</ElTag></header><p>{{ 记录.decisionNote || '本轮尚无最终结论' }}</p><small>{{ 记录.completedAt || '—' }}</small></article></section><section class="详情分区"><h3>操作日志</h3><p v-if="!当前详情.order.operationLogs.length" class="浅色字">当前占位样例暂无操作日志。</p><div v-for="(日志, 索引) in [...当前详情.order.operationLogs].reverse()" :key="索引" class="日志行"><ElIcon><CircleCheck /></ElIcon><div><strong>{{ 日志.operationType }} · {{ 日志.operationResult }}</strong><p>{{ 日志.content }}</p><small>{{ 日志.operatedAt }} · {{ 日志.operator }}</small></div></div></section></template><template #footer><ElButton v-if="当前详情" type="primary" @click="查看全渠道(当前详情.order)">打开全渠道订单详情</ElButton></template></ElDrawer>
  </section>
</template>

<style scoped>
.订单处理页面{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:#fff;color:#344054}
.工作台标题{display:flex;min-height:55px;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:1px solid #e9edf2;gap:10px}.工作台标题>div{display:flex;align-items:center;gap:10px}.工作台标题 h1{margin:0;font-size:17px;font-weight:650}.工作台标题 span{color:#8390a2;font-size:12px}.标题图标{width:30px;height:30px;border-radius:7px;background:#eaf3ff;color:#287ad2;font-size:18px}.标题工具{flex-shrink:0}.队列栏{display:flex;min-height:48px;flex:0 0 48px;border-bottom:1px solid #e9edf2;padding:0 10px;gap:3px}.队列栏 button{position:relative;display:flex;align-items:center;gap:7px;padding:0 15px;border:0;background:transparent;font-size:13px;color:#667085;cursor:pointer;white-space:nowrap}.队列栏 button.激活{color:#287ad2}.队列栏 button.激活:after{position:absolute;bottom:0;left:14px;right:14px;height:3px;border-radius:2px;background:#3286e5;content:''}.队列栏 b{font-size:12px;padding:2px 6px;background:#f0f3f7;border-radius:5px}.队列栏 button.激活 b{background:#eaf3ff}.队列栏 small{font-size:10px;color:#8995a5}.状态圆点{width:6px;height:6px;background:#8295b0;border-radius:50%}.状态-待审核{background:#d5a248}.状态-待推单{background:#6b99e8}.状态-待发货{background:#699fc6}.状态-已发货{background:#55ad8c}.状态-异常{background:#e07878}.状态-不发货{background:#9aa3af}.队列提示{display:flex;align-items:center;gap:7px;min-height:33px;padding:5px 16px;background:#f8fafc;border-bottom:1px solid #edf0f4;font-size:12px;color:#778598}.队列提示>span{flex:1}.队列提示 .el-icon{color:#86a4c9;flex-shrink:0}.筛选区{padding:10px 14px;border-bottom:1px solid #e9edf2;background:#fff}.主筛选{display:grid;grid-template-columns:minmax(290px,1.5fr) minmax(130px,.6fr) minmax(180px,.8fr) max-content;gap:9px}.筛选操作{display:flex;align-items:center;white-space:nowrap}.高级筛选{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:10px;padding-top:10px;border-top:1px dashed #e4e8ed}.翻转{transform:rotate(180deg)}.作业工具栏{display:flex;align-items:center;justify-content:space-between;min-height:49px;padding:7px 14px;gap:10px;border-bottom:1px solid #e8edf4}.作业工具栏.已选择{background:#f0f7ff}.选择摘要,.作业工具{display:flex;align-items:center;gap:12px}.选择摘要 strong{font-size:12px}.选择摘要 span{color:#8390a2;font-size:11px}.表格区{flex:1;min-height:210px;min-width:0;overflow:hidden}.作业表格{--el-table-border-color:#edf0f4;--el-table-header-bg-color:#f7f9fc;--el-table-row-hover-bg-color:#f6faff;font-size:12px}.作业表格 :deep(th.el-table__cell){font-size:12px;font-weight:600;color:#68788e;height:39px;background:#f7f9fc}.作业表格 :deep(td.el-table__cell){padding:9px 0;vertical-align:top}.作业表格 :deep(.cell){padding:0 10px}.作业表格 :deep(.el-table-fixed-column--left),.作业表格 :deep(.el-table-fixed-column--right){background:#fff}.信息格{display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:65px}.信息格 strong{font-weight:600;font-size:12px;color:#394962}.信息格>span,.信息格 small{color:#8390a2;font-size:11px;line-height:1.5}.信息格>div{display:flex;align-items:center;gap:6px}.信息格 small{margin-left:4px}.等宽{font-family:Consolas,'Microsoft YaHei',monospace}.编号,.次编号{display:block;width:max-content;max-width:100%;padding:0;border:0;background:none;color:#2875c9;cursor:pointer;font-family:Consolas,'Microsoft YaHei',monospace;white-space:nowrap;text-align:left}.编号{font-size:12px;font-weight:700}.次编号{font-size:11px}.编号:hover,.次编号:hover{text-decoration:underline}.数量{font-size:10px;color:#7e8a9b}.时效{display:flex;align-items:center;gap:5px;color:#8a9db7}.原因格{max-width:340px}.原因格>span{white-space:normal;line-height:1.55;color:#798496}.行操作{display:flex;min-height:65px;flex-wrap:wrap;align-content:center;gap:3px 8px}.行操作 .el-button+.el-button{margin:0}.行操作 .el-button{font-size:11px;min-height:20px;padding:0}.危险字{color:#c8773d!important;font-size:11px}.通过字{color:#388d67}.浅色字{color:#8592a5;font-size:12px;line-height:1.6}.分页栏{display:flex;align-items:center;justify-content:space-between;min-height:48px;gap:10px;padding:0 14px;border-top:1px solid #e9edf2}.分页栏>span{color:#8a96a7;font-size:11px}.预检摘要{display:flex;align-items:center;gap:20px;padding:16px 2px}.预检摘要 strong{font-size:14px}.预检摘要 span{font-size:12px;color:#77879b}.原型说明{font-size:12px;color:#8b97a7;line-height:1.6}.结果统计{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}.结果统计>div{display:flex;flex-direction:column;gap:7px;padding:13px;border:1px solid #e7edf5;border-radius:6px;background:#f8fafc}.结果统计 span{color:#8290a2;font-size:12px}.结果统计 strong{font-size:24px}.路由订单{display:flex;align-items:center;gap:10px;padding-bottom:20px;font-family:Consolas,monospace;font-size:15px}.路由信息{display:grid;grid-template-columns:1fr 1fr;gap:15px;padding:16px;background:#f7f9fc;border-radius:6px;margin-bottom:18px}.路由信息>div{display:flex;flex-direction:column;gap:5px}.路由信息 span{color:#8c98a8;font-size:11px}.路由信息 strong{font-size:12px;font-weight:500}.详情页眉{display:flex;align-items:center;justify-content:space-between;gap:15px}.详情页眉 small{color:#8b98aa}.详情页眉 h2{margin:7px 0 0;font-size:18px;font-family:Consolas,monospace;overflow-wrap:anywhere}.详情状态{display:flex;align-items:center;gap:10px;margin:14px 0 20px}.详情状态 span{color:#7c8b9e;font-size:12px}.详情分区{padding:18px 0;border-bottom:1px solid #edf0f4}.详情分区 h3{display:flex;align-items:center;gap:9px;margin:0 0 15px;font-size:14px}.详情分区 h3 small{font-size:11px;font-weight:400;color:#8a99ad}.详情分区 dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;margin:0}.详情分区 dt{color:#8a97aa;font-size:12px}.详情分区 dd{margin:0;color:#47566c;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.商品行{display:flex;justify-content:space-between;gap:12px;padding:12px;background:#f8fafc;border:1px solid #eef1f6;border-radius:6px;margin-top:8px}.商品行>div{display:flex;flex-direction:column;gap:5px;min-width:0}.商品行 strong{font-size:12px;font-weight:500}.商品行 span{color:#8391a4;font-size:11px}.商品行 b{color:#73829b;font-size:13px;white-space:nowrap}.审核记录{padding:13px;border:1px solid #e5ebf3;border-radius:6px;margin:10px 0}.审核记录 header{display:flex;justify-content:space-between;gap:10px}.审核记录 strong{font-size:12px}.审核记录 p,.日志行 p{font-size:12px;color:#78869b;line-height:1.7;margin:9px 0}.审核记录 small,.日志行 small{color:#9ba6b6;font-size:11px}.日志行{display:flex;gap:10px;padding:12px 0}.日志行>.el-icon{color:#78a4ce;margin-top:2px}.日志行 strong{font-size:12px;font-weight:500}.日志行 p{margin:5px 0}
@media(max-width:1400px){.队列栏{gap:0}.队列栏 button{padding:0 11px;gap:5px}.主筛选{grid-template-columns:minmax(230px,1.2fr) 130px minmax(170px,.8fr) max-content}.分页栏>span{max-width:300px;line-height:1.5}.工作台标题>div>span{display:none}}
@media(max-width:1050px){.主筛选{grid-template-columns:minmax(210px,1fr) 130px minmax(160px,1fr)}.筛选操作{grid-column:1/-1;justify-self:end}.队列栏{overflow-x:auto}.队列栏 button{padding:0 9px}.作业工具栏{align-items:flex-start}.选择摘要{flex-wrap:wrap;gap:5px 10px}.分页栏>span{display:none}.分页栏{justify-content:flex-end}.高级筛选{grid-template-columns:1fr 1fr}}
</style>
