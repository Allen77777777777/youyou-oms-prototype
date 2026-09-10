<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  ArrowDown,
  Collection,
  CopyDocument,
  DocumentAdd,
  Filter,
  InfoFilled,
  Link,
  MoreFilled,
  QuestionFilled,
  Search,
  Setting,
} from '@element-plus/icons-vue'
import {
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElDatePicker,
  ElDialog,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElDrawer,
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
import { useRouter } from 'vue-router'

import type { 原型标注 } from '@/类型/标注'
import { 全渠道订单模拟数据 } from './模拟数据'
import {
  格式化列表时间,
  格式化金额,
  获取OMS状态说明,
  获取SKU状态说明,
  获取同步状态说明,
  获取平台状态说明,
  获取平台简称,
  获取订单商品数量,
  获取路由摘要,
  筛选全渠道订单,
} from './订单工具'
import type { 全渠道订单, 全渠道订单筛选条件, 快速视图 } from './类型'

const router = useRouter()
const 订单列表 = ref<全渠道订单[]>(全渠道订单模拟数据)

type 可选列键 = 'platform' | 'time' | 'items' | 'status' | 'amount' | 'route' | 'sync'
type 方案作用域 = '系统' | '个人' | '团队'

interface 查询方案 {
  id: string
  name: string
  scope: 方案作用域
  updatedAt: string
  filters: 全渠道订单筛选条件
  quickView: 快速视图
  columns: 可选列键[]
}

interface 查询方案存储内容 {
  version: 1
  currentSchemeId: string
  schemes: 查询方案[]
}

const 查询方案存储键 = 'uyoyou.oms.all-order.query-schemes.v1'

const 可选列定义: Array<{ key: 可选列键; label: string }> = [
  { key: 'platform', label: '平台 / 店铺' },
  { key: 'time', label: '订单时间' },
  { key: 'items', label: '商品摘要' },
  { key: 'status', label: '平台状态 / OMS 状态' },
  { key: 'amount', label: '订单金额' },
  { key: 'route', label: '履约模式 / 当前路由' },
  { key: 'sync', label: '数据更新' },
]
const 默认显示列 = 可选列定义.map((列) => 列.key)

const 创建默认筛选条件 = (): 全渠道订单筛选条件 => ({
  keyword: '',
  platform: '',
  store: '',
  processingStatus: '',
  dateType: 'orderedAt',
  dateRange: [],
  platformStatus: '',
  syncStatus: '',
  skuStatus: '',
  countryCode: '',
})

const 筛选条件 = reactive<全渠道订单筛选条件>(创建默认筛选条件())
const 已应用筛选条件 = reactive<全渠道订单筛选条件>(创建默认筛选条件())
const 当前快速视图 = ref<快速视图>('全部')
const 已应用快速视图 = ref<快速视图>('全部')
const 高级筛选展开 = ref(false)
const 当前页 = ref(1)
const 每页条数 = ref(20)
const 已显示列 = ref<可选列键[]>([...默认显示列])
const 列设置草稿 = ref<可选列键[]>([...默认显示列])
const 列设置打开 = ref(false)
const 列搜索词 = ref('')
const 表格引用 = ref<{ clearSelection: () => void }>()
const 已选订单 = ref<全渠道订单[]>([])
const 选择全部匹配 = ref(false)

const 复制筛选条件 = (来源: 全渠道订单筛选条件): 全渠道订单筛选条件 => ({
  ...来源,
  dateRange: 来源.dateRange?.length === 2 ? [...来源.dateRange] as [string, string] : [],
})

const 查询方案列表 = ref<查询方案[]>([
  {
    id: 'system-default',
    name: '系统默认方案',
    scope: '系统',
    updatedAt: '随产品版本更新',
    filters: 创建默认筛选条件(),
    quickView: '全部',
    columns: [...默认显示列],
  },
])
const 当前方案Id = ref('system-default')
const 方案另存为打开 = ref(false)
const 新方案 = reactive<{ name: string; scope: Exclude<方案作用域, '系统'> }>({
  name: '',
  scope: '个人',
})

function 格式化方案更新时间() {
  const 当前 = new Date()
  const 补零 = (数值: number) => String(数值).padStart(2, '0')
  return `${当前.getFullYear()}-${补零(当前.getMonth() + 1)}-${补零(当前.getDate())} ${补零(当前.getHours())}:${补零(当前.getMinutes())}`
}

function 规范化已保存方案(原始方案: unknown): 查询方案 | undefined {
  if (!原始方案 || typeof 原始方案 !== 'object') return undefined
  const 方案 = 原始方案 as Partial<查询方案>
  if (typeof 方案.id !== 'string' || typeof 方案.name !== 'string') return undefined
  if (方案.scope !== '个人' && 方案.scope !== '团队') return undefined
  if (方案.quickView !== '全部' && 方案.quickView !== '自配送' && 方案.quickView !== '平台履约') return undefined
  const 可用列 = Array.isArray(方案.columns)
    ? 方案.columns.filter((列): 列 is 可选列键 => 默认显示列.includes(列 as 可选列键))
    : []
  const 原始筛选 = 方案.filters && typeof 方案.filters === 'object' ? 方案.filters : 创建默认筛选条件()
  return {
    id: 方案.id,
    name: 方案.name,
    scope: 方案.scope,
    updatedAt: typeof 方案.updatedAt === 'string' ? 方案.updatedAt : '更新时间未知',
    filters: 复制筛选条件({ ...创建默认筛选条件(), ...原始筛选 }),
    quickView: 方案.quickView,
    columns: 可用列.length ? [...new Set(可用列)] : [...默认显示列],
  }
}

function 持久化查询方案() {
  if (typeof window === 'undefined') return
  const 内容: 查询方案存储内容 = {
    version: 1,
    currentSchemeId: 当前方案Id.value,
    schemes: 查询方案列表.value.filter((方案) => 方案.scope !== '系统'),
  }
  try {
    window.localStorage.setItem(查询方案存储键, JSON.stringify(内容))
  } catch {
    ElMessage.warning('当前浏览器无法保存查询方案，本次设置仅在当前页面有效')
  }
}

function 恢复查询方案() {
  if (typeof window === 'undefined') return
  try {
    const 原始内容 = window.localStorage.getItem(查询方案存储键)
    if (!原始内容) return
    const 内容 = JSON.parse(原始内容) as Partial<查询方案存储内容>
    if (内容.version !== 1 || !Array.isArray(内容.schemes)) return
    const 已保存方案 = 内容.schemes
      .map(规范化已保存方案)
      .filter((方案): 方案 is 查询方案 => Boolean(方案))
    查询方案列表.value.push(...已保存方案)
    const 目标方案 = 查询方案列表.value.find((方案) => 方案.id === 内容.currentSchemeId)
      ?? 查询方案列表.value[0]
    if (!目标方案) return
    当前方案Id.value = 目标方案.id
    const 条件 = 复制筛选条件(目标方案.filters)
    Object.assign(筛选条件, 条件)
    Object.assign(已应用筛选条件, 条件)
    当前快速视图.value = 目标方案.quickView
    已应用快速视图.value = 目标方案.quickView
    已显示列.value = [...目标方案.columns]
    列设置草稿.value = [...目标方案.columns]
  } catch {
    window.localStorage.removeItem(查询方案存储键)
  }
}

恢复查询方案()

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

const 平台选项 = computed(() => [...new Set(订单列表.value.map((订单) => 订单.platformCode))])
const 店铺选项 = computed(() => [...new Set(订单列表.value.map((订单) => 订单.storeName))])
const 平台状态选项 = computed(() => [
  ...[...new Set(订单列表.value
    .filter((订单) => 订单.platformCode === 'eBay')
    .map((订单) => 订单.platformOrderStatus)
    .filter((状态): 状态 is string => Boolean(状态)))]
    .map((状态) => ({ label: 状态, value: 状态 })),
  { label: '状态映射待接入', value: '__NOT_INTEGRATED__' },
])
const 国家选项 = computed(() => [...new Set(订单列表.value.map((订单) => 订单.address.countryCode))])
const 视图数量 = computed(() => ({
  全部: 订单列表.value.length,
  自配送: 订单列表.value.filter((订单) => 订单.fulfillmentMode === '自配送').length,
  平台履约: 订单列表.value.filter((订单) => 订单.fulfillmentMode === '平台履约').length,
}))

const 筛选结果 = computed(() => 筛选全渠道订单(
  订单列表.value,
  已应用筛选条件,
  已应用快速视图.value,
))

const 当前页数据 = computed(() => {
  const 起始 = (当前页.value - 1) * 每页条数.value
  return 筛选结果.value.slice(起始, 起始 + 每页条数.value)
})

const 当前方案 = computed(() => 查询方案列表.value.find((方案) => 方案.id === 当前方案Id.value) ?? 查询方案列表.value[0])
const 可见列选项 = computed(() => {
  const 关键词 = 列搜索词.value.trim().toLocaleLowerCase()
  return 关键词 ? 可选列定义.filter((列) => 列.label.toLocaleLowerCase().includes(关键词)) : 可选列定义
})
const 已选数量 = computed(() => 选择全部匹配.value ? 筛选结果.value.length : 已选订单.value.length)
const 方案有未保存更改 = computed(() => {
  const 方案 = 当前方案.value
  if (!方案) return false
  return JSON.stringify({
    filters: 复制筛选条件(筛选条件),
    quickView: 当前快速视图.value,
    columns: [...已显示列.value].sort(),
  }) !== JSON.stringify({
    filters: 复制筛选条件(方案.filters),
    quickView: 方案.quickView,
    columns: [...方案.columns].sort(),
  })
})

const 高级筛选数量 = computed(() => [
  筛选条件.platformStatus,
  筛选条件.syncStatus,
  筛选条件.skuStatus,
  筛选条件.countryCode,
].filter(Boolean).length)

const 有生效筛选 = computed(() => Boolean([
  已应用筛选条件.keyword,
  已应用筛选条件.platform,
  已应用筛选条件.store,
  已应用筛选条件.processingStatus,
  已应用筛选条件.platformStatus,
  已应用筛选条件.syncStatus,
  已应用筛选条件.skuStatus,
  已应用筛选条件.countryCode,
].filter(Boolean).length || 已应用筛选条件.dateRange?.length || 已应用快速视图.value !== '全部'))

const 标注 = (
  id: string,
  标题: string,
  说明: string,
  事实等级: 原型标注['事实等级'],
  prd引用: string[],
  交互规则: string[] = [],
): 原型标注 => ({
  id,
  标题,
  说明,
  路由: '/oms/orders/all',
  锚点: id,
  版本: '0.2.0',
  状态: '待评审',
  事实等级,
  prd引用,
  交互规则,
})

const 视图标注 = 标注(
  'oms.all-order.list.views',
  '全渠道订单快捷视图',
  '首版只按已确认的履约模式提供全部、自配送和平台履约三个快捷视图，不把 OMS 六态误作全渠道订单唯一分类。',
  '合理假设',
  ['文档/产品规划/OMS与eBay客服UI设计建议.md#52-订单列表', '文档/架构/领域模型与状态机.md#31-订单类型'],
  ['切换后立即筛选并回到第一页。'],
)

const 筛选标注 = 标注(
  'oms.all-order.list.filters',
  '多平台通用字段筛选',
  '筛选项只使用全渠道通用订单字段；具体默认项和排列顺序仍需按真实作业频率评审。',
  '合理假设',
  ['PRD/全渠道订单功能PRD.md#AC-01-列表查询', 'PRD/订单单据字段标准.md#6-全渠道标准订单'],
)

const 查询方案标注 = 标注(
  'oms.all-order.list.query-scheme',
  '保存查询方案',
  '全渠道订单需要保存并再次应用查询条件与列显示；个人/团队作用域已作为原型结构，团队方案权限仍待确认。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#AC-02-查询方案与自定义列'],
  ['系统默认方案不可覆盖，只能另存为。', '切换方案会同时应用筛选、快捷视图与列显示。'],
)

const 列设置标注 = 标注(
  'oms.all-order.list.column-config',
  '自定义列',
  '用户可调整跨平台通用字段的显隐；系统订单识别列、勾选列与操作列在原型中固定保留。列排序、冻结和宽度保存仍待确认。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#AC-02-查询方案与自定义列'],
)

const 批量标注 = 标注(
  'oms.all-order.list.batch-bar',
  '批量处理框架',
  '勾选订单后显示选中范围、跨页选择入口和资格统计框架。具体批量动作、门禁、权限和上限尚未确认，因此当前不开放提交。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#AC-03-批量操作'],
  ['表头全选默认只覆盖当前页。', '显式选择当前筛选全部后才形成跨页范围。', '选择具体动作后才能计算可执行与不可执行数量。'],
)

const 表格标注 = 标注(
  'oms.all-order.list.table',
  '一行一张全渠道系统订单',
  '系统订单号作为主展示编号；列表保留未进入处理的自配送订单和平台履约订单，不展示 eBay 等平台专业字段。',
  '合理假设',
  ['PRD/订单单据字段标准.md#14-各功能的事实表与默认展示粒度', 'PRD/订单领域模型设计.md#21-全渠道订单承载通用事实ebay-订单承载平台专业事实'],
  ['单击系统订单号或“查看详情”打开应用内详情页签。', '双击订单行执行相同跳转。'],
)

const 状态标注 = 标注(
  'oms.all-order.list.status-projection',
  '平台状态投影与 OMS 六态',
  '平台状态和 OMS 处理状态分开显示。eBay 来源已确认为 orderFulfillmentStatus；尚未接入的平台显示“状态映射待接入”，该占位不写入平台状态字段。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#AC-05-未接入平台占位', 'PRD/订单单据字段标准.md#61-订单头-oms_order'],
)

const 空处理状态标注 = 标注(
  'oms.all-order.list.processing-empty',
  '订单处理状态为空的语义',
  '页面必须区分平台履约不适用和自配送等待准入。准入原因是新增通用字段还是查询派生，当前仍待确认。',
  '待确认',
  ['文档/架构/领域模型与状态机.md#16-待确认问题'],
)

const 路由标注 = 标注(
  'oms.all-order.list.route-summary',
  '订单路由聚合展示',
  '待审核阶段展示订单头首次/默认路由；形成履约单后按当前有效履约单聚合多仓、多渠道。聚合的物理实现方式仍待研发评审。',
  '已确认',
  ['PRD/订单单据字段标准.md#61-订单头-oms_order', 'PRD/订单领域模型设计.md#22-订单头先保存路由结果履约单保存执行快照'],
)

const 详情入口标注 = 标注(
  'oms.all-order.list.detail-entry',
  '全渠道订单详情页签入口',
  '完整详情固定通过中台顶部新页签承载，不再使用右侧抽屉；相同系统订单号复用已有页签。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#AC-04-应用内详情页签'],
)

const 空态标注 = 标注(
  'oms.all-order.list.empty-state',
  '筛选空状态',
  '空状态区分无订单与当前筛选无结果，并提供清除筛选的下一步。',
  '合理假设',
  ['文档/产品规划/OMS与eBay客服UI设计建议.md#8-视觉与交互基线建议'],
)

function 清除选择(提示 = false) {
  if (提示 && 已选数量.value) ElMessage.info('筛选范围已变化，原选择范围已清除')
  选择全部匹配.value = false
  已选订单.value = []
  表格引用.value?.clearSelection()
}

function 执行查询() {
  清除选择(true)
  Object.assign(已应用筛选条件, 筛选条件)
  已应用快速视图.value = 当前快速视图.value
  当前页.value = 1
}

function 切换快速视图(视图: 快速视图) {
  清除选择(true)
  当前快速视图.value = 视图
  已应用快速视图.value = 视图
  当前页.value = 1
}

function 重置筛选() {
  清除选择(true)
  const 默认值 = 创建默认筛选条件()
  Object.assign(筛选条件, 默认值)
  Object.assign(已应用筛选条件, 默认值)
  当前快速视图.value = '全部'
  已应用快速视图.value = '全部'
  当前页.value = 1
}

function 处理选择变更(订单: 全渠道订单[]) {
  if (选择全部匹配.value) return
  已选订单.value = 订单
}

function 选择当前筛选全部() {
  选择全部匹配.value = true
  已选订单.value = []
}

function 列可见(列: 可选列键) {
  return 已显示列.value.includes(列)
}

function 打开列设置() {
  列设置草稿.value = [...已显示列.value]
  列搜索词.value = ''
  列设置打开.value = true
}

function 应用列设置() {
  if (!列设置草稿.value.length) {
    ElMessage.warning('至少保留一个可选业务列')
    return
  }
  已显示列.value = [...列设置草稿.value]
  列设置打开.value = false
}

function 恢复默认列() {
  列设置草稿.value = [...默认显示列]
}

function 应用查询方案(方案Id: string) {
  const 方案 = 查询方案列表.value.find((项目) => 项目.id === 方案Id)
  if (!方案) return
  清除选择(true)
  const 条件 = 复制筛选条件(方案.filters)
  Object.assign(筛选条件, 条件)
  Object.assign(已应用筛选条件, 条件)
  当前快速视图.value = 方案.quickView
  已应用快速视图.value = 方案.quickView
  已显示列.value = [...方案.columns]
  当前页.value = 1
  持久化查询方案()
}

function 保存当前方案() {
  const 方案 = 当前方案.value
  if (!方案 || 方案.scope === '系统') {
    新方案.name = ''
    新方案.scope = '个人'
    方案另存为打开.value = true
    return
  }
  方案.filters = 复制筛选条件(筛选条件)
  方案.quickView = 当前快速视图.value
  方案.columns = [...已显示列.value]
  方案.updatedAt = 格式化方案更新时间()
  持久化查询方案()
  ElMessage.success('查询方案已更新')
}

function 打开另存为() {
  新方案.name = ''
  新方案.scope = '个人'
  方案另存为打开.value = true
}

function 确认另存为() {
  const 名称 = 新方案.name.trim()
  if (!名称) {
    ElMessage.warning('请输入方案名称')
    return
  }
  const id = 'scheme-' + Date.now()
  查询方案列表.value.push({
    id,
    name: 名称,
    scope: 新方案.scope,
    updatedAt: 格式化方案更新时间(),
    filters: 复制筛选条件(筛选条件),
    quickView: 当前快速视图.value,
    columns: [...已显示列.value],
  })
  当前方案Id.value = id
  持久化查询方案()
  方案另存为打开.value = false
  ElMessage.success('查询方案已保存')
}

async function 打开详情(原始订单: unknown) {
  const 订单 = 原始订单 as 全渠道订单
  await router.push({
    name: 'oms-all-order-detail',
    params: { systemOrderNo: 订单.systemOrderNo },
  })
}

async function 打开专业订单(订单: 全渠道订单) {
  if (!订单.professionalOrder) return
  await router.push({
    name: 订单.professionalOrder.routeName,
    params: {
      sellerId: 订单.professionalOrder.sellerId,
      orderId: 订单.professionalOrder.orderId,
    },
  })
}

async function 复制编号(订单: 全渠道订单) {
  try {
    await navigator.clipboard.writeText(订单.systemOrderNo)
    ElMessage.success('已复制系统订单号')
  } catch {
    ElMessage.warning('当前浏览器未允许复制，请手动选择订单号')
  }
}

function 处理更多操作(命令: string, 原始订单: unknown) {
  const 订单 = 原始订单 as 全渠道订单
  if (命令 === 'copy') void 复制编号(订单)
  if (命令 === 'professional') void 打开专业订单(订单)
}

function 获取行平台简称(原始订单: unknown) {
  return 获取平台简称(原始订单 as 全渠道订单)
}

function 获取行商品数量(原始订单: unknown) {
  return 获取订单商品数量(原始订单 as 全渠道订单)
}

function 获取行路由摘要(原始订单: unknown) {
  return 获取路由摘要(原始订单 as 全渠道订单)
}

function 获取行平台状态(原始订单: unknown) {
  return 获取平台状态说明(原始订单 as 全渠道订单)
}

function 获取行OMS状态(原始订单: unknown) {
  return 获取OMS状态说明(原始订单 as 全渠道订单)
}
</script>

<template>
  <section class="全渠道订单页面">
    <header v-prototype="视图标注" class="快捷视图栏">
      <nav aria-label="全渠道订单快捷视图">
        <button
          v-for="视图 in (['全部', '自配送', '平台履约'] as 快速视图[])"
          :key="视图"
          type="button"
          :class="{ 激活: 当前快速视图 === 视图 }"
          @click="切换快速视图(视图)"
        >
          {{ 视图 === '全部' ? '全部订单' : 视图 }}
          <b>{{ 视图数量[视图] }}</b>
        </button>
      </nav>
      <div class="边界说明">
        <ElIcon><InfoFilled /></ElIcon>
        <span>仅展示多平台通用订单事实；平台专业字段请进入对应平台订单。</span>
      </div>
    </header>

    <section v-prototype="查询方案标注" class="方案工具栏">
      <div class="方案选择区">
        <span class="工具栏标签"><ElIcon><Collection /></ElIcon>查询方案</span>
        <ElSelect
          v-model="当前方案Id"
          class="方案选择"
          aria-label="查询方案"
          @change="应用查询方案"
        >
          <ElOption
            v-for="方案 in 查询方案列表"
            :key="方案.id"
            :label="`[${方案.scope}] ${方案.name}`"
            :value="方案.id"
          />
        </ElSelect>
        <span class="方案元数据">{{ 当前方案?.scope }} · {{ 当前方案?.updatedAt }}</span>
        <span v-if="方案有未保存更改" class="未保存提示">● 有未保存更改</span>
      </div>
      <div class="方案操作区">
        <ElButton :disabled="当前方案?.scope === '系统' || !方案有未保存更改" @click="保存当前方案">保存方案</ElButton>
        <ElButton @click="打开另存为"><ElIcon><DocumentAdd /></ElIcon>另存为</ElButton>
        <ElButton v-prototype="列设置标注" @click="打开列设置"><ElIcon><Setting /></ElIcon>自定义列</ElButton>
      </div>
    </section>

    <section v-prototype="筛选标注" class="筛选面板">
      <ElForm :model="筛选条件" class="筛选表单" @submit.prevent="执行查询">
        <div class="筛选主网格">
          <ElFormItem>
            <ElInput
              v-model="筛选条件.keyword"
              clearable
              aria-label="全渠道订单关键词"
              placeholder="系统单号 / 平台单号 / SKU / 履约单 / 跟踪号"
              @keyup.enter="执行查询"
            >
              <template #prefix><ElIcon><Search /></ElIcon></template>
            </ElInput>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.platform" clearable filterable aria-label="平台" placeholder="全部平台">
              <ElOption v-for="平台 in 平台选项" :key="平台" :label="平台" :value="平台" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.store" clearable filterable aria-label="店铺" placeholder="全部店铺">
              <ElOption v-for="店铺 in 店铺选项" :key="店铺" :label="店铺" :value="店铺" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <ElSelect v-model="筛选条件.processingStatus" clearable aria-label="OMS处理状态" placeholder="OMS处理状态">
              <ElOption label="未进入处理 / 不适用" value="__EMPTY__" />
              <ElOption v-for="状态 in ['待审核', '待推单', '待发货', '已发货', '异常', '不发货']" :key="状态" :label="状态" :value="状态" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem>
            <div class="日期筛选组合">
              <ElSelect v-model="筛选条件.dateType" aria-label="日期类型" class="日期类型选择">
                <ElOption label="下单时间" value="orderedAt" />
                <ElOption label="最晚发货" value="shipByAt" />
                <ElOption label="最近同步" value="lastSyncedAt" />
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
            <ElButton type="primary" native-type="submit">查询</ElButton>
            <ElButton @click="重置筛选">重置</ElButton>
            <ElButton @click="高级筛选展开 = !高级筛选展开">
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
              <ElSelect v-model="筛选条件.platformStatus" clearable filterable aria-label="平台订单状态" placeholder="平台订单状态原值">
                <ElOption v-for="状态 in 平台状态选项" :key="状态.value" :label="状态.label" :value="状态.value" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.syncStatus" clearable aria-label="数据同步状态" placeholder="数据同步状态">
                <ElOption v-for="状态 in ['已同步', '同步中', '同步失败', '待同步', '未接入']" :key="状态" :label="获取同步状态说明(状态 as any).text" :value="状态" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.skuStatus" clearable aria-label="SKU解析状态" placeholder="SKU解析状态">
                <ElOption v-for="状态 in ['成功', '待解析', '缺失', '冲突', '失效', '查询失败']" :key="状态" :label="获取SKU状态说明(状态 as any).text" :value="状态" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem>
              <ElSelect v-model="筛选条件.countryCode" clearable filterable aria-label="目的国家或地区" placeholder="目的国家 / 地区">
                <ElOption v-for="国家 in 国家选项" :key="国家" :label="国家" :value="国家" />
              </ElSelect>
            </ElFormItem>
          </div>
        </Transition>
      </ElForm>
    </section>

    <section v-if="已选数量" v-prototype="批量标注" class="批量栏">
      <div class="批量范围">
        <strong>已选 {{ 已选数量 }} 条</strong>
        <span>{{ 选择全部匹配 ? '范围：当前筛选全部订单' : '范围：当前页已勾选订单' }}</span>
        <ElButton
          v-if="!选择全部匹配 && 筛选结果.length > 已选订单.length"
          link
          type="primary"
          @click="选择当前筛选全部"
        >
          选择当前筛选全部 {{ 筛选结果.length }} 条
        </ElButton>
      </div>
      <div class="资格框架">
        <span>选中 <b>{{ 已选数量 }}</b></span>
        <span>可执行 <b>—</b></span>
        <span>不可执行 <b>—</b></span>
        <span>待核查 <b>—</b></span>
        <small>选择具体动作后逐单校验资格</small>
      </div>
      <div class="批量操作">
        <ElTooltip content="批量动作、资格规则、权限及确认内容待业务评审后接入">
          <span><ElButton disabled>批量操作待确认</ElButton></span>
        </ElTooltip>
        <ElButton link @click="清除选择()">清除选择</ElButton>
      </div>
    </section>

    <section v-prototype="表格标注" class="表格区域">
      <ElTable
        ref="表格引用"
        :data="当前页数据"
        height="100%"
        row-key="systemOrderNo"
        table-layout="fixed"
        scrollbar-always-on
        class="订单表格"
        @selection-change="处理选择变更"
        @row-dblclick="打开详情"
      >
        <ElTableColumn type="selection" width="46" fixed="left" reserve-selection />
        <ElTableColumn label="系统订单 / 平台订单" width="210" fixed="left">
          <template #default="{ row }">
            <div class="订单识别">
              <div class="系统单号行">
                <button type="button" @click="打开详情(row)">{{ row.systemOrderNo }}</button>
                <span v-for="标签 in row.tags" :key="标签" class="订单标签">{{ 标签 }}</span>
              </div>
              <span>平台单号 {{ row.platformOrderNo }}</span>
              <small>买家 {{ row.buyerExternalId || '平台未返回' }}</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('platform')" label="平台 / 店铺" width="170">
          <template #default="{ row }">
            <div class="平台店铺">
              <span class="平台简称">{{ 获取行平台简称(row) }}</span>
              <div>
                <strong>{{ row.platformCode }}</strong>
                <ElTooltip :content="row.storeName" placement="top">
                  <span>{{ row.storeName }}</span>
                </ElTooltip>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('time')" label="订单时间" width="184">
          <template #default="{ row }">
            <div class="订单时间">
              <div><span>下单</span><ElTooltip :content="row.orderedAt"><time>{{ 格式化列表时间(row.orderedAt) }}</time></ElTooltip></div>
              <div>
                <span>最晚发货</span>
                <ElTooltip :content="row.shipByAt || row.shipByLabel">
                  <time :class="'时效-' + row.urgency">{{ 格式化列表时间(row.shipByAt) }}</time>
                </ElTooltip>
              </div>
              <small :class="'时效-' + row.urgency">{{ row.shipByLabel }}</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('items')" label="商品摘要" width="318">
          <template #default="{ row }">
            <div class="商品摘要">
              <ElTooltip :content="row.items[0]?.platformItemTitle || '平台未返回商品标题'" placement="top">
                <strong>{{ row.items[0]?.platformItemTitle || '平台未返回商品标题' }}</strong>
              </ElTooltip>
              <span>平台 SKU {{ row.items[0]?.platformSku || '—' }} · 数量 × {{ 获取行商品数量(row) }}</span>
              <div class="SKU行">
                <span>{{ row.items[0]?.systemSku ? '系统 SKU ' + row.items[0].systemSku : '系统 SKU 尚未取得' }}</span>
                <b
                  v-if="row.items[0]"
                  class="状态徽标"
                  :class="'tone-' + 获取SKU状态说明(row.items[0].skuResolutionStatus).tone"
                >
                  {{ 获取SKU状态说明(row.items[0].skuResolutionStatus).text }}
                </b>
                <ElPopover v-if="row.items.length > 1" placement="bottom-start" :width="560" trigger="click" :teleported="true">
                  <template #reference>
                    <button type="button" class="多商品入口" @click.stop @dblclick.stop>
                      {{ row.items.length }} 个商品行
                      <ElIcon><ArrowDown /></ElIcon>
                    </button>
                  </template>
                  <div class="商品快览">
                    <header><strong>商品行快速核对</strong><span>{{ row.systemOrderNo }}</span></header>
                    <div v-for="商品 in row.items" :key="商品.externalLineId" class="商品快览行">
                      <div>
                        <strong>{{ 商品.platformItemTitle || '平台未返回商品标题' }}</strong>
                        <span>平台 SKU {{ 商品.platformSku || '—' }}</span>
                        <span>系统 SKU {{ 商品.systemSku || '尚未取得' }}</span>
                      </div>
                      <div>
                        <strong>{{ 格式化金额(商品.itemTotal) }}</strong>
                        <span>数量 × {{ 商品.orderedQuantity }}</span>
                        <b class="状态徽标" :class="'tone-' + 获取SKU状态说明(商品.skuResolutionStatus).tone">
                          {{ 获取SKU状态说明(商品.skuResolutionStatus).text }}
                        </b>
                      </div>
                    </div>
                    <footer>
                      <span>完整行字段、金额口径与可履约数量请进入订单详情。</span>
                      <ElButton link type="primary" @click="打开详情(row)">打开订单详情</ElButton>
                    </footer>
                  </div>
                </ElPopover>
              </div>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('status')" width="232">
          <template #header>
            <span v-prototype="状态标注" class="带帮助标题">平台状态 / OMS 状态 <ElIcon><QuestionFilled /></ElIcon></span>
          </template>
          <template #default="{ row }">
            <div class="状态单元格">
              <div>
                <span>平台</span>
                <b class="状态徽标" :class="'tone-' + 获取行平台状态(row).tone">{{ 获取行平台状态(row).text }}</b>
                <ElTooltip v-if="获取行平台状态(row).sourcePending" :content="获取行平台状态(row).helper || '状态原值待核查'">
                  <ElIcon class="待确认图标"><QuestionFilled /></ElIcon>
                </ElTooltip>
              </div>
              <div v-prototype="!row.processingStatus ? 空处理状态标注 : 状态标注">
                <span>OMS</span>
                <b class="状态徽标" :class="'tone-' + 获取行OMS状态(row).tone">{{ 获取行OMS状态(row).text }}</b>
              </div>
              <small :class="{ 阻断文字: Boolean(row.blockReason) }">{{ 获取行OMS状态(row).helper || '当前状态正常' }}</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('amount')" label="订单金额" width="134" align="right">
          <template #default="{ row }">
            <div class="金额单元格">
              <strong>{{ 格式化金额(row.amount.orderAmount) }}</strong>
              <span>订单总金额</span>
              <small v-if="row.amount.buyerPaidShipping">运费 {{ 格式化金额(row.amount.buyerPaidShipping) }}</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('route')" width="238">
          <template #header>
            <span v-prototype="路由标注" class="带帮助标题">履约模式 / 当前路由 <ElIcon><QuestionFilled /></ElIcon></span>
          </template>
          <template #default="{ row }">
            <div class="路由单元格">
              <div>
                <b class="状态徽标" :class="row.fulfillmentMode === '平台履约' ? 'tone-neutral' : 'tone-info'">{{ row.fulfillmentMode }}</b>
                <span v-if="获取行路由摘要(row).aggregated" class="聚合提示">{{ 获取行路由摘要(row).count }} 条当前路由</span>
              </div>
              <strong>{{ row.fulfillmentMode === '平台履约' ? 'OMS 路由不适用' : 获取行路由摘要(row).warehouses }}</strong>
              <ElTooltip :content="获取行路由摘要(row).channels" placement="top">
                <span>{{ row.fulfillmentMode === '平台履约' ? '平台负责仓储与配送' : 获取行路由摘要(row).channels }}</span>
              </ElTooltip>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn v-if="列可见('sync')" label="数据更新" width="176">
          <template #default="{ row }">
            <div class="同步单元格">
              <b v-if="row.sync.status !== '已同步'" class="状态徽标" :class="'tone-' + 获取同步状态说明(row.sync.status).tone">
                {{ 获取同步状态说明(row.sync.status).text }}
              </b>
              <ElTooltip :content="row.sync.lastSuccess || '暂无成功同步时间'" placement="top">
                <span>{{ row.sync.status === '已同步' ? '最近同步' : '上次成功' }} {{ 格式化列表时间(row.sync.lastSuccess) }}</span>
              </ElTooltip>
              <small>{{ row.sync.normalizationStatus }} · {{ row.sync.message }}</small>
            </div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="操作" width="104" fixed="right" align="center">
          <template #default="{ row }">
            <div class="行操作">
              <ElButton v-prototype="详情入口标注" link type="primary" @click="打开详情(row)">查看详情</ElButton>
              <ElDropdown trigger="click" @command="处理更多操作($event, row)">
                <button class="更多按钮" type="button" aria-label="更多操作"><ElIcon><MoreFilled /></ElIcon></button>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem command="copy"><ElIcon><CopyDocument /></ElIcon>复制系统订单号</ElDropdownItem>
                    <ElDropdownItem command="professional" :disabled="!row.professionalOrder">
                      <ElIcon><Link /></ElIcon>查看平台专业订单
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </div>
          </template>
        </ElTableColumn>

        <template #empty>
          <div v-prototype="空态标注">
            <ElEmpty :image-size="68" :description="有生效筛选 ? '未找到符合当前条件的全渠道订单' : '暂无全渠道订单数据'">
              <ElButton type="primary" plain @click="重置筛选">清除筛选条件</ElButton>
            </ElEmpty>
          </div>
        </template>
      </ElTable>
    </section>

    <footer class="分页栏">
      <span>共 {{ 筛选结果.length }} 张系统订单</span>
      <ElPagination
        v-model:current-page="当前页"
        v-model:page-size="每页条数"
        background
        layout="sizes, prev, pager, next"
        :page-sizes="[20, 50, 100]"
        :total="筛选结果.length"
      />
    </footer>

    <ElDialog v-model="方案另存为打开" title="另存为查询方案" width="480px" append-to-body>
      <ElForm label-position="top">
        <ElFormItem label="方案名称" required>
          <ElInput v-model="新方案.name" maxlength="30" show-word-limit placeholder="例如：我的日常核对" @keyup.enter="确认另存为" />
        </ElFormItem>
        <ElFormItem label="作用范围">
          <ElSelect v-model="新方案.scope" aria-label="查询方案作用范围">
            <ElOption label="仅本人" value="个人" />
            <ElOption label="团队共享（权限待确认）" value="团队" />
          </ElSelect>
        </ElFormItem>
        <div class="保存内容摘要">
          <strong>将保存</strong>
          <span>当前筛选条件、快捷视图与 {{ 已显示列.length }} 个可选列</span>
          <small v-if="新方案.scope === '团队'">团队方案的创建、编辑与发布权限仍待确认。</small>
        </div>
      </ElForm>
      <template #footer>
        <ElButton @click="方案另存为打开 = false">取消</ElButton>
        <ElButton type="primary" @click="确认另存为">保存方案</ElButton>
      </template>
    </ElDialog>

    <ElDrawer v-model="列设置打开" title="自定义列" size="380px" append-to-body>
      <div class="列设置说明">
        <strong>已显示 {{ 列设置草稿.length + 2 }} / {{ 可选列定义.length + 2 }} 列</strong>
        <span>仅包含全渠道通用字段</span>
      </div>
      <ElInput v-model="列搜索词" clearable placeholder="搜索字段" aria-label="搜索自定义列字段">
        <template #prefix><ElIcon><Search /></ElIcon></template>
      </ElInput>
      <section class="列设置分区">
        <h3>固定列</h3>
        <ElCheckbox :model-value="true" disabled>系统订单 / 平台订单</ElCheckbox>
        <ElCheckbox :model-value="true" disabled>操作</ElCheckbox>
        <small>用于订单识别与进入详情，首版固定保留。</small>
      </section>
      <section class="列设置分区">
        <h3>可选业务列</h3>
        <ElCheckboxGroup v-model="列设置草稿" class="列选项">
          <ElCheckbox v-for="列 in 可见列选项" :key="列.key" :value="列.key">{{ 列.label }}</ElCheckbox>
        </ElCheckboxGroup>
      </section>
      <template #footer>
        <div class="抽屉底部">
          <ElButton @click="恢复默认列">恢复默认</ElButton>
          <span></span>
          <ElButton @click="列设置打开 = false">取消</ElButton>
          <ElButton type="primary" @click="应用列设置">应用</ElButton>
        </div>
      </template>
    </ElDrawer>
  </section>
</template>

<style scoped>
.全渠道订单页面 {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: var(--yy-text-primary);
}

.快捷视图栏 {
  display: flex;
  min-height: 42px;
  flex: 0 0 42px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 12px;
  border-bottom: 1px solid #e8ebef;
  background: #fff;
}

.快捷视图栏 nav {
  display: flex;
  align-self: stretch;
  gap: 2px;
}

.快捷视图栏 nav button {
  position: relative;
  display: flex;
  height: 100%;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  border: 0;
  background: transparent;
  color: #65707e;
  cursor: pointer;
  font-size: 13px;
}

.快捷视图栏 nav button::after {
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 2px;
  background: transparent;
  content: "";
}

.快捷视图栏 nav button:hover,
.快捷视图栏 nav button.激活 {
  color: #2878d0;
}

.快捷视图栏 nav button.激活::after {
  background: #409eff;
}

.快捷视图栏 nav b {
  min-width: 20px;
  padding: 1px 5px;
  border-radius: 9px;
  background: #f0f2f5;
  color: #7a8491;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
}

.快捷视图栏 nav button.激活 b {
  background: #eaf4ff;
  color: #2878d0;
}

.边界说明 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: #7c8693;
  font-size: 11px;
}

.边界说明 span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.方案工具栏 {
  display: flex;
  min-height: 42px;
  flex: 0 0 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 12px;
  border-bottom: 1px solid #e8ebef;
  background: #fff;
}

.方案选择区,
.方案操作区 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.工具栏标签 {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  color: #596574;
  font-size: 12px;
  font-weight: 600;
}

.方案选择 {
  width: 230px;
}

.方案元数据 {
  color: #858e9a;
  font-size: 11px;
  white-space: nowrap;
}

.未保存提示 {
  color: #ad6800;
  font-size: 11px;
  white-space: nowrap;
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
  grid-template-columns: minmax(250px, 1.4fr) 128px 168px 158px minmax(342px, 1.25fr) max-content;
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
  color: #fff;
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

.批量栏 {
  display: grid;
  min-height: 46px;
  flex: 0 0 46px;
  grid-template-columns: minmax(280px, 1fr) max-content minmax(235px, 1fr);
  align-items: center;
  gap: 14px;
  padding: 5px 12px;
  border-bottom: 1px solid #bdd8f6;
  background: #eef6ff;
}

.批量范围,
.资格框架,
.批量操作 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.批量范围 strong {
  color: #2669ad;
  font-size: 13px;
}

.批量范围 > span,
.资格框架 span,
.资格框架 small {
  color: #657383;
  font-size: 11px;
  white-space: nowrap;
}

.资格框架 {
  padding: 4px 9px;
  border: 1px solid #d3e3f5;
  border-radius: 4px;
  background: rgb(255 255 255 / 68%);
}

.资格框架 b {
  color: #344150;
}

.资格框架 small {
  color: #83909e;
}

.批量操作 {
  justify-content: flex-end;
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
  padding: 7px 0;
  vertical-align: top;
}

.订单表格 :deep(.cell) {
  padding: 0 8px;
}

.订单表格 :deep(.el-table-fixed-column--left),
.订单表格 :deep(.el-table-fixed-column--right) {
  background: #fff;
}

.订单表格 :deep(.el-table__row:hover .el-table-fixed-column--left),
.订单表格 :deep(.el-table__row:hover .el-table-fixed-column--right) {
  background: #f7fbff;
}

.订单识别,
.订单时间,
.商品摘要,
.金额单元格,
.路由单元格,
.状态单元格,
.同步单元格 {
  display: flex;
  min-width: 0;
  min-height: 72px;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.系统单号行 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.系统单号行 button {
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #216bc1;
  cursor: pointer;
  font-family: Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.系统单号行 button:hover {
  text-decoration: underline;
}

.订单标签 {
  display: inline-grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  place-items: center;
  border: 1px solid #f0c88e;
  border-radius: 3px;
  background: #fff8ec;
  color: #a6630a;
  font-size: 10px;
  font-weight: 600;
}

.订单识别 > span,
.订单识别 > small {
  overflow: hidden;
  color: #7e8794;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.平台店铺 {
  display: grid;
  min-height: 72px;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.平台简称 {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #dce1e7;
  border-radius: 4px;
  background: #f5f7f9;
  color: #535e6b;
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
}

.平台店铺 > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.平台店铺 strong {
  color: #414b58;
  font-size: 12px;
}

.平台店铺 span {
  overflow: hidden;
  color: #7f8995;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.订单时间 > div {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 6px;
}

.订单时间 span,
.订单时间 small {
  color: #848d99;
  font-size: 11px;
}

.订单时间 time {
  color: #46515e;
  font-family: Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
}

.时效-临期,
.时效-今日 {
  color: #b96700 !important;
}

.商品摘要 > strong {
  overflow: hidden;
  color: #3b4552;
  font-size: 12px;
  font-weight: 600;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.商品摘要 > span,
.SKU行 > span {
  overflow: hidden;
  color: #7e8794;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.SKU行 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.SKU行 > span {
  min-width: 0;
}

.状态徽标 {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-height: 20px;
  flex: 0 0 auto;
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

.多商品入口 {
  display: inline-flex;
  height: 22px;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid #d8e5f5;
  border-radius: 3px;
  background: #f4f8fd;
  color: #3f6f9f;
  cursor: pointer;
  font-size: 10px;
}

.多商品入口:hover {
  border-color: #a9cdf5;
  background: #edf6ff;
  color: #216bc1;
}

.商品快览 header,
.商品快览 footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.商品快览 header {
  padding-bottom: 9px;
  border-bottom: 1px solid #edf0f3;
}

.商品快览 header strong {
  font-size: 13px;
}

.商品快览 header span,
.商品快览 footer span {
  color: #87909c;
  font-size: 11px;
}

.商品快览行 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 126px;
  gap: 14px;
  padding: 9px 0;
  border-bottom: 1px solid #edf0f3;
}

.商品快览行 > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.商品快览行 > div:last-child {
  align-items: flex-end;
}

.商品快览行 strong {
  overflow: hidden;
  color: #3c4653;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.商品快览行 span {
  color: #7f8995;
  font-size: 11px;
}

.商品快览 footer {
  padding-top: 8px;
}

.金额单元格 {
  align-items: flex-end;
  text-align: right;
}

.金额单元格 strong {
  color: #293441;
  font-family: Consolas, monospace;
  font-size: 13px;
}

.金额单元格 span,
.金额单元格 small {
  color: #858e9a;
  font-size: 11px;
}

.路由单元格 > div,
.状态单元格 > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
}

.路由单元格 strong {
  overflow: hidden;
  color: #414c59;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.路由单元格 > span {
  overflow: hidden;
  color: #7f8995;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.聚合提示 {
  color: #5f6c7a;
  font-size: 10px;
}

.带帮助标题 {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.状态单元格 > div > span {
  width: 30px;
  flex: 0 0 30px;
  color: #858e9a;
  font-size: 11px;
}

.状态单元格 small {
  display: -webkit-box;
  overflow: hidden;
  color: #7f8995;
  font-size: 11px;
  line-height: 15px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.状态单元格 .阻断文字 {
  color: #b63c42;
}

.待确认图标 {
  color: #a76a13;
  cursor: help;
}

.同步单元格 > span {
  overflow: hidden;
  color: #6f7986;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.同步单元格 small {
  display: -webkit-box;
  overflow: hidden;
  color: #858e9a;
  font-size: 11px;
  line-height: 15px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.行操作 {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: center;
  gap: 3px;
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

.分页栏 {
  display: flex;
  min-height: 48px;
  flex: 0 0 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px 0 16px;
  border-top: 1px solid #e8ebef;
  background: #fff;
}

.分页栏 > span {
  color: #7e8794;
  font-size: 11px;
}

.保存内容摘要 {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #dfe5ec;
  border-radius: 4px;
  background: #f8fafc;
}

.保存内容摘要 strong {
  color: #3e4956;
  font-size: 12px;
}

.保存内容摘要 span,
.保存内容摘要 small {
  color: #778391;
  font-size: 11px;
}

.保存内容摘要 small {
  color: #a3640b;
}

.列设置说明 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  padding: 9px 10px;
  border-left: 3px solid #409eff;
  background: #f4f8fd;
}

.列设置说明 strong {
  color: #3b4653;
  font-size: 12px;
}

.列设置说明 span,
.列设置分区 small {
  color: #808b98;
  font-size: 11px;
}

.列设置分区 {
  margin-top: 18px;
}

.列设置分区 h3 {
  margin: 0 0 10px;
  color: #36414e;
  font-size: 13px;
}

.列设置分区 > .el-checkbox {
  display: flex;
  margin: 0 0 8px;
}

.列设置分区 small {
  display: block;
  margin-top: 3px;
}

.列选项 {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.列选项 :deep(.el-checkbox) {
  margin-right: 0;
}

.抽屉底部 {
  display: grid;
  grid-template-columns: max-content 1fr max-content max-content;
  width: 100%;
  gap: 8px;
}

@media (max-width: 1500px) {
  .筛选主网格 {
    grid-template-columns: minmax(240px, 1.45fr) 124px 160px 154px minmax(330px, 1.3fr);
  }

  .筛选操作 {
    grid-column: 1 / -1;
  }

  .方案元数据 {
    display: none;
  }

  .批量栏 {
    min-height: 74px;
    flex-basis: 74px;
    grid-template-columns: minmax(250px, 1fr) max-content;
    grid-template-rows: 34px 30px;
    gap: 0 12px;
  }

  .资格框架 {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: start;
    padding-block: 3px;
  }
}

@media (max-width: 1280px) {
  .边界说明 {
    max-width: 340px;
  }

  .方案选择 {
    width: 190px;
  }

}
</style>
