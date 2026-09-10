<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  ArrowDown,
  Coin,
  DocumentCopy,
  Filter,
  MoreFilled,
  QuestionFilled,
  RefreshRight,
  Search,
  Tickets,
  WarningFilled,
} from '@element-plus/icons-vue'
import {
  ElButton,
  ElDatePicker,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElPopover,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import type { 原型标注 } from '@/类型/标注'
import 手机商品占位图 from '@/资源/eBay订单/旗舰手机商品占位-概念图.png'
import eBay订单详情 from './eBay订单详情.vue'
import { eBay订单模拟数据 } from './模拟数据'
import {
  格式化eBay站点,
  格式化列表时间,
  格式化金额,
  获取状态说明,
  计算商品单价,
  金额非零,
  筛选eBay订单,
} from './订单工具'
import type { eBay订单, eBay订单商品, eBay订单筛选条件 } from './类型'

const route = useRoute()
const router = useRouter()
const 订单列表 = ref<eBay订单[]>(
  eBay订单模拟数据.map((订单) => ({ ...订单, sync: { ...订单.sync } })),
)

const 创建默认筛选条件 = (): eBay订单筛选条件 => ({
  keyword: '',
  store: '',
  marketplace: '',
  fulfillmentStatus: '',
  dateType: 'creationDate',
  dateRange: [],
  paymentStatus: '',
  cancelStatus: '',
  omsStatus: '',
  syncStatus: '',
})

const 筛选条件 = reactive<eBay订单筛选条件>(创建默认筛选条件())
const 已应用筛选条件 = reactive<eBay订单筛选条件>(创建默认筛选条件())
const 高级筛选展开 = ref(false)
const 当前页 = ref(1)
const 每页条数 = ref(20)
const 刷新中的订单 = ref<Set<string>>(new Set())
const 日期快捷项 = [
  {
    text: '近 7 天',
    value: () => {
      const 结束 = new Date()
      const 开始 = new Date()
      开始.setDate(开始.getDate() - 6)
      return [开始, 结束]
    },
  },
  {
    text: '近 30 天',
    value: () => {
      const 结束 = new Date()
      const 开始 = new Date()
      开始.setDate(开始.getDate() - 29)
      return [开始, 结束]
    },
  },
]

const 店铺选项 = computed(() => [...new Set(订单列表.value.map((订单) => 订单.store))])
const 站点选项 = computed(() => [...new Set(订单列表.value.flatMap((订单) => 订单.purchaseMarketplaces))])
const 筛选结果 = computed(() => 筛选eBay订单(订单列表.value, 已应用筛选条件))
const 当前页数据 = computed(() => {
  const 起始 = (当前页.value - 1) * 每页条数.value
  return 筛选结果.value.slice(起始, 起始 + 每页条数.value)
})
const 当前订单 = computed(() => {
  const orderId = typeof route.params.orderId === 'string'
    ? route.params.orderId
    : typeof route.query.order === 'string' ? route.query.order : ''
  const sellerId = typeof route.params.sellerId === 'string'
    ? route.params.sellerId
    : typeof route.query.seller === 'string' ? route.query.seller : ''
  return 订单列表.value.find((订单) => 订单.orderId === orderId && (!sellerId || 订单.sellerId === sellerId))
})
const 高级筛选数量 = computed(() => [筛选条件.paymentStatus, 筛选条件.cancelStatus, 筛选条件.omsStatus, 筛选条件.syncStatus].filter(Boolean).length)
const 有生效筛选 = computed(() => Boolean([
  已应用筛选条件.keyword,
  已应用筛选条件.store,
  已应用筛选条件.marketplace,
  已应用筛选条件.fulfillmentStatus,
  已应用筛选条件.paymentStatus,
  已应用筛选条件.cancelStatus,
  已应用筛选条件.omsStatus,
  已应用筛选条件.syncStatus,
].filter(Boolean).length || 已应用筛选条件.dateRange?.length))

const 标注 = (
  id: string,
  标题: string,
  说明: string,
  事实等级: 原型标注['事实等级'],
  prd引用: string[],
  交互规则: string[] = [],
  逻辑: Pick<原型标注, '前置条件' | '触发方式' | '系统动作' | '成功结果' | '异常处理' | '数据来源' | '权限与审计' | '验收要点'> = {},
): 原型标注 => ({
  id,
  标题,
  说明,
  路由: '/oms/orders/ebay',
  锚点: id,
  版本: '0.6.0',
  状态: '待评审',
  事实等级,
  prd引用,
  交互规则,
  ...逻辑,
})

const 筛选标注 = 标注(
  'oms.ebay-order.list.filters',
  '紧凑检索与日期筛选',
  '采用无外置字段标题的紧凑 Element Plus 筛选栏，通过明确占位和 aria-label 识别关键词、店铺、站点、平台状态及日期条件；日期类型首版支持下单时间与最晚发货时间。',
  '合理假设',
  ['PRD/eBay订单功能PRD.md#EB-03'],
  [],
  {
    前置条件: ['用户已进入 OMS → 销售订单 → eBay订单，且只看到有权限访问的店铺数据。'],
    触发方式: ['输入关键词、选择筛选条件或打开更多筛选。', '点击查询提交本轮条件；回车提交关键词检索。'],
    系统动作: ['仅在本地 eBay 专业订单投影上执行筛选，不在列表加载时逐行请求 eBay 接口。', '日期范围按业务时区解释后转换为查询条件。'],
    成功结果: ['列表刷新为匹配结果，分页回到第 1 页。', '清空日期范围后不再附加日期条件。'],
    异常处理: ['无匹配时保留筛选条件并展示空态；不得把“暂无订单”误判为接口无数据。'],
    数据来源: ['本地 eBay 专业订单投影；字段口径见文档/集成/eBay/eBay订单功能与字段接入说明.md。'],
    权限与审计: ['店铺、平台和敏感字段遵循访问者数据范围；查询条件不得绕过权限范围。'],
    验收要点: ['覆盖关键词、日期类型/日期范围、更多筛选、查询、重置和空结果场景。'],
  },
)

const 表格标注 = 标注(
  'oms.ebay-order.list.table',
  'eBay订单高密度列表',
  '一行一个 eBay 订单，多商品以首项摘要加商品行数量呈现；未关联系统订单、未配对系统 SKU 和数据更新异常的记录仍保留。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-01', 'PRD/eBay订单功能PRD.md#EB-02', 'PRD/eBay订单功能PRD.md#AC-04'],
  ['单击订单号或“详情”在系统顶部新增订单详情页签。', '点击多商品行入口可先在列表中快速核对全部商品。', '同一店铺同一订单重复打开时复用已有页签。'],
  {
    前置条件: ['列表已完成当前筛选查询；每行代表一个 eBay 平台订单。'],
    触发方式: ['单击订单号/详情进入详情；单击多商品入口打开快览；双击行也进入详情。'],
    系统动作: ['按 sellerId + orderId 定位专业订单；打开详情时通过系统内部页签路由承载。'],
    成功结果: ['订单专业事实、OMS 关联信息和 eBay 数据更新状态按各自维度展示。'],
    异常处理: ['未关联 OMS 时保留 eBay 订单并展示“暂无关联单据”；未知枚举保留原值并标记待核查。'],
    数据来源: ['eBay order、shipping_fulfillment 本地投影；OMS 关联单据只读读取。'],
    权限与审计: ['只允许访问授权店铺；跨模块跳转不得扩大数据范围。'],
    验收要点: ['验证多商品、未配对系统 SKU、未关联 OMS、未知状态、平台履约和系统外履约样例。'],
  },
)

const 订单时间标注 = 标注(
  'oms.ebay-order.list.order-times',
  '订单时间',
  '列表同时展示平台下单时间与最晚发货时间；时间保留来源时区，不再使用“履约时效”作为列名。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-02'],
  [],
  {
    数据来源: ['下单时间取 Order.creationDate；最晚发货取订单级 shipByDate 派生值，行级原值在详情保留。'],
    异常处理: ['平台未返回时间时显示“—”，不得用当前时间或其他订单时间补造。'],
    验收要点: ['检查来源时区保留、无时限订单、临期订单和多商品时限的待确认提示。'],
  },
)

const 多商品快览标注 = 标注(
  'oms.ebay-order.list.multi-item-preview',
  '多商品行快速核对',
  '用户已确认列表需要多商品行交互；首版采用点击浮层展示全部商品行，完整字段仍进入订单详情。',
  '合理假设',
  ['PRD/eBay订单功能PRD.md#EB-02', 'PRD/eBay订单功能PRD.md#AC-04'],
  ['点击“共 N 个商品行”打开快速核对浮层。', '点击“查看完整详情”进入订单详情。'],
  {
    前置条件: ['订单包含 2 个及以上商品行。'],
    触发方式: ['点击“共 N 个商品行”按钮；标注模式关闭时不拦截该按钮的正常打开行为。'],
    系统动作: ['打开当前订单商品行的本地快览，不改变订单状态和筛选条件。'],
    成功结果: ['显示每个商品行的平台 SKU、Item ID、系统 SKU、数量、单价、行金额和履约状态。'],
    异常处理: ['完整字段缺失时显示对应占位，不隐藏其他商品行；需要完整属性时进入详情。'],
    验收要点: ['快览可关闭；“查看完整详情”进入当前订单详情页签；不触发整行双击。'],
  },
)

const OMS空态标注 = 标注(
  'oms.ebay-order.list.oms-empty',
  'OMS关联单据空态',
  '没有 OMS 系统订单号时显示“暂无关联单据”，不再使用醒目的异常卡片；eBay 专业订单本身仍可查看。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-01', 'PRD/eBay订单功能PRD.md#EB-09'],
  [],
  {
    成功结果: ['显示“暂无关联单据”，同时保留 eBay 专业订单可查询、可进入详情。'],
    异常处理: ['不得创建虚构系统订单号，也不得因为未关联 OMS 而隐藏该 eBay 订单。'],
    数据来源: ['OMS 关联单据字段；空值表示当前未关联，不代表平台订单不存在。'],
    验收要点: ['未关联样例显示空态；已关联样例显示系统订单号及 OMS 处理状态。'],
  },
)

const 状态标注 = 标注(
  'oms.ebay-order.list.independent-statuses',
  '并行状态维度',
  'eBay 履约、付款、取消三项平台状态与 OMS 处理状态分别展示，不拼接成综合订单状态。未知枚举保留原值并标记待核查。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-07', 'PRD/eBay订单功能PRD.md#AC-05'],
  [],
  {
    数据来源: ['eBay orderFulfillmentStatus、orderPaymentStatus、cancelStatus.cancelState；OMS order_processing_status。'],
    系统动作: ['按字段分别映射状态展示，不拼接或互相覆盖。'],
    异常处理: ['未知枚举显示原始值和“待核查”，不得静默映射为成功或失败。'],
    验收要点: ['分别验证平台履约、付款、取消和 OMS 六态；确认平台状态不替代 OMS 状态。'],
  },
)

const 刷新标注 = 标注(
  'oms.ebay-order.list.refresh-one',
  '刷新单笔 eBay 数据',
  '“eBay数据更新”表示从 eBay 拉取订单与平台发货记录到本页面，不代表仓库出库、OMS 标发或平台履约。单笔刷新保留最后可信数据。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-05'],
  [],
  {
    前置条件: ['当前订单不处于“更新中”；用户具有当前店铺的更新权限。'],
    触发方式: ['在行操作菜单选择“刷新 eBay 数据”。'],
    系统动作: ['提交单笔 order 与 shipping_fulfillment 更新任务，先显示“更新中”。'],
    成功结果: ['更新成功后显示最近成功时间；OMS 状态和仓库出库事实不变。'],
    异常处理: ['失败时保留最后一次可信数据，展示失败原因并禁止把失败当成无包裹。'],
    数据来源: ['eBay order、shipping_fulfillment；更新任务和原始快照由后台保留。'],
    权限与审计: ['更新任务记录订单、店铺、操作者和结果，普通页面只显示必要反馈。'],
    验收要点: ['验证重复点击门禁、成功、失败、未知枚举和状态不推进。'],
  },
)

const 查询标注 = 标注(
  'oms.ebay-order.list.query',
  '提交查询',
  '提交当前筛选条件并重新计算本地结果，查询是列表页的显式提交动作。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-03'],
  [],
  {
    触发方式: ['点击“查询”或在关键词输入框按 Enter。'],
    系统动作: ['复制当前筛选条件为已应用条件，并将当前页重置为第 1 页。'],
    成功结果: ['表格和分页仅呈现当前已应用条件的结果。'],
    验收要点: ['修改条件但未提交时不改变已应用结果；提交后结果更新。'],
  },
)

const 重置标注 = 标注(
  'oms.ebay-order.list.reset',
  '重置筛选',
  '清空关键词、店铺、站点、平台状态、OMS 状态、更新状态和日期范围。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-03'],
  [],
  {
    触发方式: ['点击“重置”。'],
    系统动作: ['恢复默认筛选条件并将列表回到第 1 页。'],
    成功结果: ['结果恢复为当前权限范围内的全部本地投影订单。'],
    验收要点: ['确认日期类型恢复为下单时间、日期范围为空、更多筛选值清空。'],
  },
)

const 打开详情标注 = 标注(
  'oms.ebay-order.list.open-detail',
  '打开 eBay 订单详情页签',
  '从订单号或行操作进入以 eBay 订单为粒度的专业详情，不使用列表内抽屉或浏览器新窗口。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-01', 'PRD/eBay订单功能PRD.md#EB-04'],
  [],
  {
    前置条件: ['订单存在于当前列表结果且用户有该店铺访问权限。'],
    触发方式: ['点击订单号、详情按钮或双击订单行。'],
    系统动作: ['使用 sellerId + orderId 路由到详情；同一订单已有页签时激活原页签。'],
    成功结果: ['详情页保留 eBay 专业字段，并可从页签关闭后回到原列表状态。'],
    异常处理: ['订单不存在或不在权限范围时不得显示其他订单数据；原型中以路由无匹配处理。'],
    验收要点: ['验证同订单复用页签、不同订单独立页签、关闭后筛选条件和滚动位置保留。'],
  },
)

const 更多操作标注 = 标注(
  'oms.ebay-order.list.more-actions',
  '订单更多操作',
  '更多操作只提供跨模块跳转和单笔 eBay 数据更新，不在 eBay 专业订单页直接执行发货、取消或退款。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-06', 'PRD/eBay订单功能PRD.md#EB-05'],
  [],
  {
    触发方式: ['点击某行“更多操作”打开菜单。'],
    系统动作: ['根据订单关联和履约模式启用/禁用对应菜单项。'],
    成功结果: ['查看全渠道订单、订单标发中心、eBay 客服和刷新动作跳转到所属模块。'],
    异常处理: ['无 OMS 系统订单时禁用全渠道订单；平台履约订单不进入自配送标发中心。'],
    权限与审计: ['跨模块跳转继续执行目标模块权限校验；刷新记录单笔更新任务。'],
    验收要点: ['检查菜单项禁用条件和每项跳转携带的 eBay 订单关联参数。'],
  },
)

async function 打开详情(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  await router.push({
    name: 'oms-ebay-order-detail',
    params: { sellerId: 订单.sellerId, orderId: 订单.orderId },
  })
}

function 标记刷新中(orderId: string, 刷新中: boolean) {
  const 新集合 = new Set(刷新中的订单.value)
  if (刷新中) 新集合.add(orderId)
  else 新集合.delete(orderId)
  刷新中的订单.value = 新集合
}

function 刷新单笔订单(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  if (刷新中的订单.value.has(订单.orderId)) return
  标记刷新中(订单.orderId, true)
  订单.sync.status = '同步中'
  订单.sync.latestAttempt = '刚刚 · UTC+8'
  订单.sync.message = '刷新任务已提交，正在更新订单与平台发货记录'
  ElMessage.info(`已提交 ${订单.orderId} 的异步刷新`)

  window.setTimeout(() => {
    标记刷新中(订单.orderId, false)
    if (订单.paymentStatus === 'REVIEW_REQUIRED') {
      订单.sync.status = '同步失败'
      订单.sync.message = '已拉取最新数据，但未知付款枚举 REVIEW_REQUIRED 仍需平台接入核查'
      ElMessage.warning('数据已拉取；未知枚举仍待核查，OMS 状态未推进')
      return
    }
    订单.sync.status = '已同步'
    订单.sync.lastSuccess = '刚刚 · UTC+8'
    订单.sync.message = '订单与平台发货记录刷新成功；OMS 状态未变更'
    ElMessage.success(`${订单.orderId} 已刷新`)
  }, 1200)
}

async function 前往系统订单(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  if (!订单.oms.systemOrderNo) return
  await router.push({
    name: 'oms-all-order-detail',
    params: { systemOrderNo: 订单.oms.systemOrderNo },
  })
}

async function 前往标发中心(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  await router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { ebayOrder: 订单.orderId } })
}

async function 前往客服(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  await router.push({ path: '/oms/ebay-service/messages', query: { ebayOrder: 订单.orderId } })
}

function 处理更多操作(命令: string, 原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  if (命令 === 'refresh') 刷新单笔订单(订单)
  if (命令 === 'system') void 前往系统订单(订单)
  if (命令 === 'shipping') void 前往标发中心(订单)
  if (命令 === 'service') void 前往客服(订单)
}

function 格式化商品单价(原始商品?: eBay订单商品) {
  if (!原始商品) return '—'
  return 格式化金额(计算商品单价(原始商品.lineCost, 原始商品.quantity))
}

function 格式化站点列表(站点列表: string[]) {
  return [...new Set(站点列表.map(格式化eBay站点))].join(' / ')
}

function 是否存在不同刊登站点(原始订单: unknown) {
  const 订单 = 原始订单 as eBay订单
  return 格式化站点列表(订单.purchaseMarketplaces) !== 格式化站点列表(订单.listingMarketplaces)
}

function 重置筛选() {
  Object.assign(筛选条件, 创建默认筛选条件())
  Object.assign(已应用筛选条件, 创建默认筛选条件())
  当前页.value = 1
}

function 执行查询() {
  Object.assign(已应用筛选条件, {
    ...筛选条件,
    dateRange: [...(筛选条件.dateRange ?? [])],
  })
  当前页.value = 1
}
</script>

<template>
  <eBay订单详情
    v-if="当前订单"
    :order="当前订单"
    :refreshing="刷新中的订单.has(当前订单.orderId)"
    @refresh="刷新单笔订单"
  />

  <section v-else class="eBay订单页面">
    <section v-prototype="筛选标注" class="筛选面板">
      <ElForm :model="筛选条件" class="筛选表单" @submit.prevent="执行查询">
        <div class="筛选主网格">
          <ElFormItem>
            <ElInput
              v-model="筛选条件.keyword"
              clearable
              aria-label="eBay订单关键词"
              placeholder="订单号 / 买家 / SKU / Item ID / 跟踪号"
              @keyup.enter="执行查询"
            >
              <template #prefix><ElIcon><Search /></ElIcon></template>
            </ElInput>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.store" clearable filterable aria-label="店铺" placeholder="全部店铺">
              <ElOption v-for="店铺 in 店铺选项" :key="店铺" :label="店铺" :value="店铺" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.marketplace" clearable filterable aria-label="成交站点" placeholder="全部成交站点">
              <ElOption v-for="站点 in 站点选项" :key="站点" :label="格式化eBay站点(站点)" :value="站点" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.fulfillmentStatus" clearable aria-label="eBay履约状态" placeholder="eBay履约状态">
              <ElOption label="未开始履约" value="NOT_STARTED" />
              <ElOption label="部分履约中" value="IN_PROGRESS" />
              <ElOption label="已履约" value="FULFILLED" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <div class="日期筛选组合">
              <ElSelect v-model="筛选条件.dateType" aria-label="日期类型" class="日期类型选择">
                <ElOption label="下单时间" value="creationDate" />
                <ElOption label="最晚发货" value="shipBy" />
              </ElSelect>
              <ElDatePicker
                v-model="筛选条件.dateRange"
                class="日期范围选择"
                type="daterange"
                unlink-panels
                clearable
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                aria-label="订单日期范围"
                :shortcuts="日期快捷项"
              />
            </div>
          </ElFormItem>
          <div class="筛选操作">
            <ElButton v-prototype="查询标注" type="primary" native-type="submit">查询</ElButton>
            <ElButton v-prototype="重置标注" @click="重置筛选">重置</ElButton>
            <ElButton v-prototype="筛选标注" @click="高级筛选展开 = !高级筛选展开">
              <ElIcon><Filter /></ElIcon>
              更多筛选
              <b v-if="高级筛选数量">{{ 高级筛选数量 }}</b>
              <ElIcon class="展开箭头" :class="{ 展开: 高级筛选展开 }"><ArrowDown /></ElIcon>
            </ElButton>
          </div>
        </div>
        <Transition name="高级筛选">
          <div v-if="高级筛选展开" class="筛选高级网格">
            <ElFormItem>
              <ElSelect v-model="筛选条件.paymentStatus" clearable aria-label="eBay付款状态" placeholder="eBay付款状态">
                <ElOption label="付款失败" value="FAILED" />
                <ElOption label="付款处理中" value="PENDING" />
                <ElOption label="已付款" value="PAID" />
                <ElOption label="部分退款" value="PARTIALLY_REFUNDED" />
                <ElOption label="全额退款" value="FULLY_REFUNDED" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.cancelStatus" clearable aria-label="eBay取消状态" placeholder="eBay取消状态">
                <ElOption label="无取消申请" value="NONE_REQUESTED" />
                <ElOption label="取消处理中" value="IN_PROGRESS" />
                <ElOption label="已取消" value="CANCELED" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.omsStatus" clearable aria-label="OMS处理状态" placeholder="OMS处理状态">
                <ElOption v-for="状态 in ['待审核', '待推单', '待发货', '已发货', '异常', '不发货']" :key="状态" :label="状态" :value="状态" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.syncStatus" clearable aria-label="eBay数据更新状态" placeholder="eBay数据更新状态">
                <ElOption label="更新正常" value="已同步" />
                <ElOption label="更新中" value="同步中" />
                <ElOption label="更新失败" value="同步失败" />
                <ElOption label="待更新" value="待同步" />
              </ElSelect>
            </ElFormItem>
          </div>
        </Transition>
      </ElForm>
    </section>

    <section v-prototype="表格标注" class="表格区域">
      <ElTable
        :data="当前页数据"
        height="100%"
        row-key="orderId"
        table-layout="fixed"
        scrollbar-always-on
        class="订单表格"
        @row-dblclick="打开详情"
      >
        <ElTableColumn width="184" fixed="left">
          <template #header>
            <span v-prototype="订单时间标注">订单时间</span>
          </template>
          <template #default="{ row }">
            <div class="订单时间单元格">
              <div>
                <span>下单</span>
                <ElTooltip :content="row.creationDate" placement="top">
                  <time>{{ 格式化列表时间(row.creationDate) }}</time>
                </ElTooltip>
              </div>
              <div>
                <span>最晚发货</span>
                <ElTooltip :content="row.shipBy || '平台未提供最晚发货时间'" placement="top">
                  <time>{{ 格式化列表时间(row.shipBy) }}</time>
                </ElTooltip>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="订单与商品" width="430" fixed="left">
          <template #default="{ row }">
            <div class="订单复合列">
              <div class="订单编号行">
                <button v-prototype="打开详情标注" type="button" @click="打开详情(row)">{{ row.orderId }}</button>
                <span v-if="row.salesRecordReference">销售记录 {{ row.salesRecordReference }}</span>
              </div>
              <div class="买家行"><span>买家</span><strong>{{ row.buyerUsername }}</strong></div>
              <div class="商品摘要">
                <ElTooltip content="原型占位图，非订单真实商品图" placement="top">
                  <img class="列表商品图" :src="手机商品占位图" alt="原型商品占位图" />
                </ElTooltip>
                <div>
                  <ElTooltip :content="row.items[0]?.title" placement="top"><strong>{{ row.items[0]?.title || '商品标题未返回' }}</strong></ElTooltip>
                  <span>平台 SKU {{ row.items[0]?.platformSku || '—' }} · Item {{ row.items[0]?.itemId || '—' }}</span>
                  <span>单价 {{ 格式化商品单价(row.items[0]) }} · 下单数量 × {{ row.items[0]?.quantity || 0 }}</span>
                  <span v-if="row.items[0]?.systemSku">系统SKU {{ row.items[0].systemSku }}</span>
                  <span v-else class="异常文字">未配对系统SKU</span>
                </div>
                <ElPopover v-if="row.items.length > 1" placement="bottom-start" :width="520" trigger="click" :teleported="true">
                  <template #reference>
                    <button
                      v-prototype="多商品快览标注"
                      type="button"
                      class="多商品入口"
                      :aria-label="`查看 ${row.items.length} 个商品行`"
                      @click.stop
                      @dblclick.stop
                    >
                      共 {{ row.items.length }} 个商品行
                      <ElIcon><ArrowDown /></ElIcon>
                    </button>
                  </template>
                  <div class="商品快览">
                    <div class="商品快览标题">
                      <strong>商品行快速核对</strong>
                      <span>{{ row.orderId }} · 共 {{ row.items.length }} 行</span>
                    </div>
                    <div class="商品快览列表">
                      <div v-for="(商品, 索引) in row.items" :key="商品.lineItemId" class="商品快览行">
                        <img class="快览商品图" :src="手机商品占位图" :alt="`第 ${Number(索引) + 1} 个原型商品占位图`" />
                        <div class="快览商品信息">
                          <strong>{{ 商品.title || '商品标题未返回' }}</strong>
                          <span>平台 SKU {{ 商品.platformSku || '—' }} · Item {{ 商品.itemId || '—' }}</span>
                          <span>{{ 商品.systemSku ? `系统SKU ${商品.systemSku}` : '未配对系统SKU' }}</span>
                        </div>
                        <div class="快览商品结果">
                          <strong>单价 {{ 格式化商品单价(商品) }}</strong>
                          <span>下单数量 × {{ 商品.quantity }}</span>
                          <span>行总额 {{ 格式化金额(商品.total) }}</span>
                          <span>{{ 获取状态说明('fulfillment', 商品.fulfillmentStatus).text }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="商品快览底部">
                      <span>完整变体、适配属性、费用与履约指令请进入详情核对</span>
                      <ElButton link type="primary" @click="打开详情(row)">查看完整详情</ElButton>
                    </div>
                  </div>
                </ElPopover>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="店铺名称 / 站点" min-width="146">
          <template #default="{ row }">
            <div class="纵向单元格">
              <strong>{{ row.store }}</strong>
              <span>站点 {{ 格式化站点列表(row.purchaseMarketplaces) }}</span>
              <span v-if="是否存在不同刊登站点(row)">刊登站点 {{ 格式化站点列表(row.listingMarketplaces) }}</span>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="订单金额" min-width="208" align="right">
          <template #default="{ row }">
            <div class="金额单元格">
              <div class="订单总额"><span>订单总额</span><strong>{{ 格式化金额(row.pricing.total) }}</strong></div>
              <div class="订单金额构成">
                <span>商品小计</span><b>{{ 格式化金额(row.pricing.subtotal) }}</b>
                <span v-if="金额非零(row.pricing.delivery)">配送费</span><b v-if="金额非零(row.pricing.delivery)">{{ 格式化金额(row.pricing.delivery) }}</b>
                <span v-if="金额非零(row.pricing.tax)">税费</span><b v-if="金额非零(row.pricing.tax)">{{ 格式化金额(row.pricing.tax) }}</b>
                <span v-if="金额非零(row.pricing.discount)">商品优惠</span><b v-if="金额非零(row.pricing.discount)">{{ 格式化金额(row.pricing.discount) }}</b>
                <span v-if="金额非零(row.pricing.deliveryDiscount)">配送优惠</span><b v-if="金额非零(row.pricing.deliveryDiscount)">{{ 格式化金额(row.pricing.deliveryDiscount) }}</b>
                <span v-if="金额非零(row.pricing.fee)">订单费用</span><b v-if="金额非零(row.pricing.fee)">{{ 格式化金额(row.pricing.fee) }}</b>
                <span v-if="金额非零(row.pricing.adjustment)">调整金额</span><b v-if="金额非零(row.pricing.adjustment)">{{ 格式化金额(row.pricing.adjustment) }}</b>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="eBay 平台状态" min-width="184">
          <template #header>
            <span v-prototype="状态标注" class="状态列表标题">eBay 平台状态 <ElIcon><QuestionFilled /></ElIcon></span>
          </template>
          <template #default="{ row }">
            <div class="三状态">
              <div><span>履约</span><b class="状态徽标" :class="`tone-${获取状态说明('fulfillment', row.fulfillmentStatus).tone}`">{{ 获取状态说明('fulfillment', row.fulfillmentStatus).text }}</b></div>
              <div><span>付款</span><b class="状态徽标" :class="`tone-${获取状态说明('payment', row.paymentStatus).tone}`">{{ 获取状态说明('payment', row.paymentStatus).text }}</b></div>
              <div><span>取消</span><b class="状态徽标" :class="`tone-${获取状态说明('cancel', row.cancelStatus).tone}`">{{ 获取状态说明('cancel', row.cancelStatus).text }}</b></div>
              <small v-if="获取状态说明('payment', row.paymentStatus).unknown"><ElIcon><WarningFilled /></ElIcon>原值待核查</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="OMS关联单据" min-width="182">
          <template #default="{ row }">
            <div v-if="row.oms.systemOrderNo" class="OMS单元格">
              <button type="button" @click="前往系统订单(row)">{{ row.oms.systemOrderNo }}</button>
              <div>
                <b class="状态徽标" :class="`tone-${获取状态说明('oms', row.oms.processingStatus).tone}`">{{ row.oms.processingStatus || '未进入处理' }}</b>
                <span>{{ row.oms.fulfillmentMode }}</span>
              </div>
              <small v-if="row.oms.fulfillmentNo">履约单 {{ row.oms.fulfillmentNo }}</small>
              <small v-if="row.oms.confirmationNo">标发单 {{ row.oms.confirmationNo }}</small>
              <small v-if="row.oms.noShipmentReason" class="不发货原因">{{ row.oms.noShipmentReason }}</small>
              <small v-if="!row.oms.fulfillmentNo && !row.oms.confirmationNo && !row.oms.noShipmentReason">
                {{ row.oms.fulfillmentMode === '平台履约' ? 'OMS 处理不适用' : '暂无下游履约单据' }}
              </small>
            </div>
            <div v-else v-prototype="OMS空态标注" class="无OMS关联">
              <span>暂无关联单据</span>
              <ElTooltip content="当前仅有 eBay 平台订单，尚未关联 OMS 系统订单号。">
                <ElIcon><QuestionFilled /></ElIcon>
              </ElTooltip>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn min-width="154">
          <template #header>
            <ElTooltip content="表示从 eBay 获取订单与平台发货记录的最近结果，不代表仓库出库、OMS 标发或平台履约。" placement="top">
              <span class="状态列表标题">eBay数据更新 <ElIcon><QuestionFilled /></ElIcon></span>
            </ElTooltip>
          </template>
          <template #default="{ row }">
            <div class="同步单元格">
              <b v-if="row.sync.status !== '已同步'" class="状态徽标" :class="`tone-${获取状态说明('sync', row.sync.status).tone}`">
                {{ 获取状态说明('sync', row.sync.status).text }}
              </b>
              <ElTooltip :content="row.sync.lastSuccess || '暂无成功更新时间'" placement="top">
                <span>{{ row.sync.status === '已同步' ? '最近更新' : '上次成功' }} {{ 格式化列表时间(row.sync.lastSuccess) }}</span>
              </ElTooltip>
              <ElTooltip v-if="row.sync.status !== '已同步'" :content="row.sync.message" placement="top"><small>{{ row.sync.message }}</small></ElTooltip>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="操作" width="80" fixed="right" align="center">
          <template #default="{ row }">
            <div class="行操作">
              <ElButton v-prototype="打开详情标注" link type="primary" @click="打开详情(row)">详情</ElButton>
              <ElDropdown trigger="click" @command="处理更多操作($event, row)">
                <button v-prototype="更多操作标注" class="更多按钮" type="button" aria-label="更多操作"><ElIcon><MoreFilled /></ElIcon></button>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem command="refresh" :disabled="刷新中的订单.has(row.orderId)"><span v-prototype="刷新标注" class="菜单项标注"><ElIcon><RefreshRight /></ElIcon>刷新 eBay 数据</span></ElDropdownItem>
                    <ElDropdownItem command="system" :disabled="!row.oms.systemOrderNo"><ElIcon><DocumentCopy /></ElIcon>查看全渠道订单</ElDropdownItem>
                    <ElDropdownItem command="shipping" :disabled="row.oms.fulfillmentMode === '平台履约'"><ElIcon><Coin /></ElIcon>前往订单标发中心</ElDropdownItem>
                    <ElDropdownItem command="service"><ElIcon><Tickets /></ElIcon>前往 eBay 客服</ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </div>
          </template>
        </ElTableColumn>

        <template #empty>
          <ElEmpty :image-size="72" :description="有生效筛选 ? '未找到符合当前筛选条件的订单' : '暂无订单数据'">
            <ElButton type="primary" plain @click="重置筛选">清除筛选条件</ElButton>
          </ElEmpty>
        </template>
      </ElTable>
    </section>

    <footer class="分页栏">
      <ElPagination
        v-model:current-page="当前页"
        v-model:page-size="每页条数"
        background
        layout="sizes, prev, pager, next"
        :page-sizes="[20, 50, 100]"
        :total="筛选结果.length"
      />
    </footer>

  </section>
</template>

<style scoped>
.eBay订单页面 {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: white;
  color: var(--yy-text-primary);
}

.筛选面板 {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-bottom: 1px solid #eef0f3;
  background: #fafbfc;
}

.筛选表单 :deep(.el-form-item) {
  min-width: 0;
  margin: 0;
}

.筛选表单 :deep(.el-select),
.筛选表单 :deep(.el-date-editor) {
  width: 100%;
}

.筛选主网格 {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(240px, 1.4fr) 150px 120px 140px minmax(330px, 1.2fr) max-content;
  align-items: center;
  gap: 8px;
}

.日期筛选组合 {
  display: grid;
  min-width: 0;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 6px;
}

.日期类型选择,
.日期范围选择 {
  min-width: 0;
}

.筛选操作 {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  white-space: nowrap;
}

.筛选操作 b {
  display: inline-grid;
  min-width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 8px;
  background: #409eff;
  color: white;
  font-size: 10px;
}

.展开箭头 {
  transition: transform 150ms ease;
}

.展开箭头.展开 {
  transform: rotate(180deg);
}

.筛选高级网格 {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #dfe3e8;
}

.高级筛选-enter-active,
.高级筛选-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.高级筛选-enter-from,
.高级筛选-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.表格区域 {
  min-width: 0;
  min-height: 280px;
  flex: 1;
  overflow: hidden;
}

.订单表格 {
  width: 100%;
  height: 100%;
  --el-table-border-color: #edf0f3;
  --el-table-header-bg-color: #f7f8fa;
  --el-table-row-hover-bg-color: #f7fbff;
}

.订单表格 :deep(th.el-table__cell) {
  height: 40px;
  padding: 0;
  background: #f7f8fa;
  color: #697382;
  font-size: 12px;
  font-weight: 600;
}

.订单表格 :deep(td.el-table__cell) {
  padding: 6px 0;
  vertical-align: top;
}

.订单表格 :deep(.cell) {
  padding: 0 8px;
}

.订单表格 :deep(.el-table-fixed-column--left),
.订单表格 :deep(.el-table-fixed-column--right) {
  background: white;
}

.订单表格 :deep(.el-table__row:hover .el-table-fixed-column--left),
.订单表格 :deep(.el-table__row:hover .el-table-fixed-column--right) {
  background: #f7fbff;
}

.订单时间单元格 {
  display: flex;
  min-height: 108px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
}

.订单时间单元格 > div {
  display: grid;
  width: 100%;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: start;
  gap: 6px;
}

.订单时间单元格 span {
  color: #7b8491;
  font-size: 11px;
  line-height: 1.45;
}

.订单时间单元格 time {
  color: #3d4652;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  white-space: nowrap;
}

.订单复合列 {
  display: flex;
  min-width: 0;
  min-height: 108px;
  flex-direction: column;
  gap: 4px;
}

.订单编号行 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  line-height: 18px;
}

.订单编号行 button,
.OMS单元格 button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #216bc1;
  cursor: pointer;
  font-family: Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  line-height: 18px;
}

.订单编号行 button:hover,
.OMS单元格 button:hover {
  text-decoration: underline;
}

.订单编号行 > span {
  overflow: hidden;
  color: #959da8;
  font-size: 11px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.买家行 {
  display: flex;
  gap: 5px;
  color: #8b939e;
  font-size: 12px;
  line-height: 18px;
}

.买家行 strong {
  color: #5e6774;
  font-weight: 500;
}

.商品摘要 {
  display: grid;
  min-width: 0;
  grid-template-columns: 56px minmax(0, 1fr) max-content;
  align-items: center;
  gap: 9px;
  padding-top: 3px;
  border-top: 1px dashed #eceff3;
}

.列表商品图 {
  display: block;
  width: 56px;
  height: 56px;
  box-sizing: border-box;
  border: 1px solid #e2e6eb;
  border-radius: 5px;
  background: #f7f8fa;
  object-fit: contain;
}

.商品摘要 > div:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.商品摘要 strong {
  display: block;
  overflow: hidden;
  color: #3b4450;
  font-size: 13px;
  font-weight: 600;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.商品摘要 span {
  overflow: hidden;
  color: #8b939e;
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.商品摘要 .异常文字 {
  color: #af6708;
}

.多商品入口 {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border: 1px solid #d8e5f5;
  border-radius: 4px;
  background: #f4f8fd;
  color: #3f6f9f;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.多商品入口:hover {
  border-color: #a9cdf5;
  background: #edf6ff;
  color: #216bc1;
}

.多商品入口 .el-icon {
  font-size: 11px;
}

.商品快览 {
  color: #303844;
}

.商品快览标题 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #edf0f3;
}

.商品快览标题 strong {
  font-size: 14px;
}

.商品快览标题 span {
  color: #7f8996;
  font-family: Consolas, monospace;
  font-size: 11px;
}

.商品快览列表 {
  max-height: 320px;
  overflow-y: auto;
}

.商品快览行 {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 88px;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f5;
}

.快览商品图 {
  display: block;
  width: 44px;
  height: 44px;
  box-sizing: border-box;
  border: 1px solid #e2e6eb;
  border-radius: 4px;
  background: #f7f8fa;
  object-fit: contain;
}

.快览商品信息,
.快览商品结果 {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.快览商品信息 strong {
  overflow: hidden;
  color: #3a4350;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.快览商品信息 span,
.快览商品结果 span {
  overflow: hidden;
  color: #7f8996;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.快览商品结果 {
  align-items: flex-end;
  text-align: right;
}

.快览商品结果 strong {
  color: #303844;
  font-size: 12px;
}

.商品快览底部 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 9px;
}

.商品快览底部 > span {
  color: #929aa5;
  font-size: 11px;
}

.纵向单元格,
.金额单元格,
.OMS单元格,
.同步单元格 {
  display: flex;
  min-width: 0;
  min-height: 108px;
  flex-direction: column;
  gap: 6px;
}

.纵向单元格 strong {
  color: #424b57;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.纵向单元格 span,
.金额单元格 span,
.金额单元格 small,
.OMS单元格 small,
.同步单元格 span,
.同步单元格 small {
  color: #89919d;
  font-size: 11px;
  line-height: 1.45;
}

.金额单元格 {
  align-items: stretch;
  gap: 5px;
  text-align: right;
}

.订单总额 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #edf0f3;
}

.订单总额 strong {
  color: #29323e;
  font-family: Consolas, monospace;
  font-size: 14px;
}

.订单金额构成 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 2px 8px;
}

.订单金额构成 b {
  color: #586270;
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
}

.状态列表标题 {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.三状态 {
  display: flex;
  min-height: 108px;
  flex-direction: column;
  gap: 6px;
}

.三状态 > div {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
}

.三状态 > div > span {
  color: #8b939e;
  font-size: 11px;
}

.状态徽标 {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-height: 20px;
  align-items: center;
  padding: 1px 6px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-neutral { border-color: #dfe3e8; background: #f5f6f8; color: #667085; }
.tone-info { border-color: #bad9ff; background: #edf6ff; color: #2878d0; }
.tone-success { border-color: #b7e1cb; background: #eef9f2; color: #237a4b; }
.tone-warning { border-color: #f1d0a6; background: #fff7e8; color: #a65e00; }
.tone-danger { border-color: #efb7ba; background: #fff0f0; color: #c6363d; }

.三状态 small {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #b0690a;
  font-size: 11px;
}

.OMS单元格 > div {
  display: flex;
  align-items: center;
  gap: 6px;
}

.OMS单元格 > div > span {
  color: #7f8996;
  font-size: 11px;
}

.OMS单元格 .不发货原因 {
  display: -webkit-box;
  overflow: hidden;
  color: #707987;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.无OMS关联 {
  display: flex;
  min-height: 108px;
  align-items: center;
  gap: 6px;
  color: #858e9a;
  font-size: 12px;
}

.无OMS关联 .el-icon {
  color: #a1a8b2;
  cursor: help;
  font-size: 14px;
}

.同步单元格 > span {
  max-width: 100%;
  overflow: hidden;
  font-family: Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.同步单元格 small {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.行操作 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.更多按钮 {
  display: grid;
  width: 26px;
  height: 26px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #7d8693;
  cursor: pointer;
}

.更多按钮:hover {
  background: #edf4fc;
  color: #2878d0;
}

.菜单项标注 {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.分页栏 {
  display: flex;
  min-height: 48px;
  flex: 0 0 48px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 12px 0 16px;
  border-top: 1px solid #e8ebef;
  background: white;
}

@media (max-width: 1360px) {
  .筛选主网格 {
    grid-template-columns: minmax(240px, 1.5fr) 146px 118px 132px minmax(330px, 1.35fr);
  }

  .筛选操作 {
    grid-column: 1 / -1;
  }
}
</style>
