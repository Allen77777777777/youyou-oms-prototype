<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, Refresh, Document, CircleCheck, Warning, Clock, ArrowRight } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElDialog, ElDrawer, ElEmpty, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElSelect, ElTable, ElTableColumn, ElTag, ElTimeline, ElTimelineItem, ElTooltip } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 仓库状态, 物流状态, 仓储服务商, type 作业类型, type 作业动作, type 仓配单据 } from './仓配模型'
import { 仓库会话单据, 物流会话单据, 仓配会话操作拦截 as 取得操作拦截, 执行仓配会话动作 as 执行样例动作 } from './仓配会话'

const props = defineProps<{ 类型: 作业类型 }>()
const route = useRoute()
const 是仓库 = props.类型 === '仓库'
const 标题 = 是仓库 ? '三方仓出库单' : '物流下单'
const 前缀 = 是仓库 ? 'oms.outbound' : 'oms.logistics'
const 单据 = 是仓库 ? 仓库会话单据 : 物流会话单据
const 状态集 = 是仓库 ? 仓库状态 : 物流状态
const 当前状态 = ref('全部')
const 筛选 = reactive({ keyword: '', provider: '', review: '', dates: [] as string[] })
const 已应用 = reactive({ ...筛选 })
const 当前页 = ref(1)
const 每页 = ref(10)
const 勾选 = ref<仓配单据[]>([])
const 表格 = ref<{ clearSelection: () => void }>()
const 详情 = ref<仓配单据>()
const 详情打开 = ref(false)
const 详情页签 = ref('业务详情')
const 确认打开 = ref(false)
const 当前动作 = ref<作业动作>('查询结果')
const 目标单据 = ref<仓配单据[]>([])
const 结果打开 = ref(false)
const 批次结果 = ref<Array<{ no: string; success: boolean; status: string; awaitingCheck: boolean; reason: string }>>([])
const 确认中 = ref(false)

const 作业标注说明: Record<string, Partial<原型标注>> = {
  overview: {
    前置条件: [是仓库 ? '进入三方仓出库单工作台，展示独立仓配样例以及从订单处理共享的执行记录。' : '进入物流下单流程演示，当前 API 物流生产适用组合未获确认；列表均为本地虚构物流单。'],
    触发方式: ['进入页面查看全量卡片；从订单处理携带履约单号或系统订单号跳转时自动填入查询条件。'],
    系统动作: ['顶部卡片统计全量会话单据；页签按当前筛选匹配集计数，主列表按所属业务对象分页。', '浏览器会话中保留执行结果；切中台页签不重建业务样例，浏览器刷新重新初始化。'],
    成功结果: ['用户可从单号定位原履约、当前状态、失败性质与下一步；订单数、履约数和执行单数不混合计数。'],
    异常处理: ['本地页面没有接入真实仓库或物流 API；布局、批量范围、权限及上线组合仍待评审，不能以样例状态作为接入完成证据。'],
    验收要点: [是仓库 ? '按同一履约从订单处理跳转后能够找到共享出库单；刷新列表不产生外部写或额外业务单。' : '物流单只来自独立 API 流程虚构样例，不为每张仓配一体出库单自动生成物流单；刷新不产生新单。'],
  },
  filters: {
    前置条件: ['列表已经加载；关键词、服务商、处理关注和创建日期可单独使用或组合使用。'],
    系统动作: ['对业务单号、来源履约/订单、外部单号、跟踪号和 SKU 作不区分大小写的包含匹配；日期按 UTC+8 创建日比较。', '应用查询回到第 1 页并清空选择；重置清空所有查询条件和状态页签。'],
    成功结果: ['表格及页签数量对应当前匹配集；顶部指标与“全量需关注”提示仍统计全部会话单据。'],
    异常处理: ['外部待核查为独立查询标记，不另建业务状态；当前搜索仅执行本地过滤，生产权限和服务端分页尚未接入。'],
    验收要点: ['用跨页来源编号查询可找到目标；叠加不匹配服务商后为空；重置后恢复列表，原勾选已清空。'],
  },
  states: {
    前置条件: ['每张单据保存所属业务状态；接口超时和待核查原因同时保留，不能只看状态文案决定重试。'],
    触发方式: ['点击全部或某一状态页签；点击执行中/待核查卡片进入对应状态集合或标记筛选。'],
    系统动作: ['页签切换回到第 1 页并清空选择；卡片先清除原条件，再按其统计口径筛选。', 是仓库 ? '三方仓保持七态；下单中、取消中可叠加待核查标记，出库异常只表达建单后的仓内问题。' : '物流保持五态；可能已受理但结果未明确的请求在下单失败中以原因表达，核查前不得重提。'],
    成功结果: ['状态筛选只改变视图，不改写单据、实际出库量或订单处理状态。'],
    异常处理: ['当前卡片与队列是交互提案；生产未知状态映射、告警和异常恢复规则仍待平台/仓库契约确认。'],
    验收要点: ['页面不出现第八种仓库或第六种物流业务状态；进入待核查筛选后仍可看到原业务状态。'],
  },
  batch: {
    触发方式: ['勾选当前页记录后点击查询结果、重提交失败单或恢复待下单；物流待下单还可点击提交下单，先进入执行前确认。'],
    成功结果: ['确认框显示本次选择、可执行和被拦截数量；确认后结果逐项列出业务状态、操作结果与下一步。', '查询/受理操作成功不等于出库或物流建单完成；处理中、待核查与操作成功/失败是不同统计维度。'],
    异常处理: ['待核查、已出库/已成功或前置条件缺失的项目不能混入重提；没有可执行项目时确认按钮禁用。', '共享账号失败样例因修复回执未接入保持阻断；渠道草案保存不会自动解除它。撤单发起、物流作废及替代单尚未开放。'],
    验收要点: ['混合选择时只对满足条件项演示执行；失败项保留原因；取消确认不更改状态或日志；重复提交已进入下单中的原单被门禁拒绝。'],
  },
  table: {
    前置条件: ['表格行是稳定业务 ID 对应的执行单，不因同一来源订单或多商品展开而重复选择。'],
    触发方式: ['点击 OMS 业务编号或详情打开该行详情；勾选复选框加入当前页批次；表格内部可横向滚动查看完整列。'],
    系统动作: ['固定业务编号与操作列，展示状态、失败原因、仓库/物流路由、数量摘要、外部单号和 UTC+8 时间。'],
    成功结果: ['未返回的外部单号和跟踪号明确显示空缺；多 SKU 共享履约只展示摘要，并提示逐行数量映射待出库明细接口补齐。'],
    异常处理: ['表格不允许手填外部编号、实际出库量、成功时间或仓库状态；原始仓库状态未接入时明确标识，不能伪造映射。'],
    验收要点: ['分别打开共享履约和独立样例，数据不会串行；已有跟踪号不被用来直接增加出库量。'],
  },
  'detail.snapshot': {
    前置条件: ['已从列表选中单据并打开业务详情页签；读取该业务单对应的原履约和执行快照。'],
    触发方式: ['查看关联与执行路由、商品数量摘要及当前处理说明；点击底部查询结果可进入原请求核查确认。'],
    系统动作: ['并列展示履约/订单身份、执行账号、仓库、渠道代码、面单模式、外部编号、脱敏收件快照和幂等引用。'],
    成功结果: ['能核对本次使用的路由和数量；缺失外部结果显示未取得，历史渠道代码不因当前配置编辑而变化。'],
    异常处理: ['面单、收件和申报引用为本地虚构样例；不提供真实文件下载或买家明文。共享多 SKU 数量是履约汇总，不能据此对单个 SKU 标发。'],
    验收要点: ['编辑渠道草案后旧业务详情仍保留当次代码；取消中的单据没有直接写已取消的入口。'],
  },
  'detail.history': {
    前置条件: ['已打开某张单据详情；当前记录包含初始化样例及本次会话追加的演示操作。'],
    触发方式: ['点击状态时间线页签查看；执行受控查询或重提后再次查看最新一项。'],
    系统动作: ['以最近事件优先排列时间线，展示 UTC+8 时间、动作、前后状态和结果说明。'],
    成功结果: ['原业务单的查询、待核查和重提过程可以连续追溯；已发生事实不被最新状态文本抹除。'],
    异常处理: ['当前是演示摘要，真实事件发生/接收时间、来源版本和不可修改审计尚待后端实现；页面不提供编辑或删除历史。'],
    验收要点: ['重提原单后新增记录且旧记录保留；取消执行前确认不生成虚假的成功事件。'],
  },
  'detail.attempts': {
    前置条件: ['已打开单据详情；未提交的物流单可以没有接口尝试，不能用占位成功记录填充。'],
    触发方式: ['点击接口尝试页签查看每次动作、结果、失败原因、时间和演示尝试编号。'],
    系统动作: [是仓库 ? '查询或重提演示追加一次尝试，业务编号不变；共享出库查询调用同源演示函数回写可信状态。' : '查询、恢复待下单或提交下单追加本地尝试记录，业务编号不变；不购买真实面单或生成并行运单。'],
    成功结果: ['可以分辨外部明确失败、外部结果待核查和本次查询受理结果；没有尝试时展示明确空态。'],
    异常处理: ['这里不是生产接口控制台，不暴露原始请求、响应、密钥或敏感快照；物流建单核查与仓库建单/撤单核查遵循各自状态边界。'],
    验收要点: [是仓库 ? '共享超时样例重复查询后仍为下单中且不能重提；正常共享样例核查受理后仅进入待出库，不伪造出库量。' : '物流待核查失败先确认未受理，再恢复待下单；后续提交仍使用原业务编号，不新增并行运单。'],
  },
}
function 标注(id: string, title: string, explanation: string, extra: Partial<原型标注> = {}): 原型标注 {
  const 细则 = 作业标注说明[id] || {}
  const 结果: 原型标注 = { id: `${前缀}.${id}`, 标题: title, 说明: explanation, 分类: id === 'overview' ? '页面' : id === 'states' ? '规则' : id.includes('snapshot') || id === 'table' ? '字段' : '交互', 事实等级: '合理假设', 版本: '2026-09-12', 状态: '待评审', prd引用: [`PRD/${是仓库 ? '三方仓出库单功能PRD.md#4-统一状态及操作资格' : '物流下单功能PRD.md#3-状态及逆向规则'}`], ...细则, ...extra }
  for (const key of ['前置条件', '触发方式', '系统动作', '成功结果', '异常处理', '数据来源', '权限与审计', '验收要点'] as const) {
    结果[key] = [...new Set([...(细则[key] || []), ...(extra[key] || [])])]
  }
  return 结果
}
const 过滤结果 = computed(() => 单据.value.filter(row => {
  const keyword = 已应用.keyword.trim().toLowerCase()
  return (!keyword || [row.no, row.order, row.fulfillment, row.externalNo, row.tracking, row.sku].some(v => v.toLowerCase().includes(keyword))) &&
    (!已应用.provider || row.provider === 已应用.provider) &&
    (!已应用.review || (已应用.review === '待核查' ? row.awaitingCheck : 已应用.review === '执行中' ? ['下单中', '取消中', '待出库'].includes(row.status) : !row.awaitingCheck && row.reason !== '')) &&
    (!已应用.dates?.length || (row.createdAt.slice(0, 10) >= 已应用.dates[0]! && row.createdAt.slice(0, 10) <= 已应用.dates[1]!))
}))
const 可见单据 = computed(() => 过滤结果.value.filter(r => 当前状态.value === '全部' || r.status === 当前状态.value))
const 分页数据 = computed(() => 可见单据.value.slice((当前页.value - 1) * 每页.value, 当前页.value * 每页.value))
const 待核查数 = computed(() => 单据.value.filter(r => r.awaitingCheck).length)
const 失败数 = computed(() => 单据.value.filter(r => ['下单失败', '出库异常'].includes(r.status)).length)
const 处理中数 = computed(() => 单据.value.filter(r => ['下单中', '取消中', '待出库'].includes(r.status)).length)
const 完成数 = computed(() => 单据.value.filter(r => r.status === (是仓库 ? '已出库' : '下单成功')).length)
const 可执行数量 = computed(() => 目标单据.value.filter(r => !取得操作拦截(r, 当前动作.value)).length)
const 状态颜色 = (s: string) => ['已出库', '下单成功'].includes(s) ? 'success' : ['下单失败', '出库异常'].includes(s) ? 'danger' : ['已取消', '已作废'].includes(s) ? 'info' : 'warning'
function 查询() { Object.assign(已应用, { ...筛选, dates: [...(筛选.dates || [])] }); 当前页.value = 1; 表格.value?.clearSelection() }
function 重置() { Object.assign(筛选, { keyword: '', provider: '', review: '', dates: [] }); 当前状态.value = '全部'; 查询() }
function 快速查看(status = '全部', review = '') { 重置(); 当前状态.value = status; 筛选.review = review; 查询() }
function 查看(row: 仓配单据) { 详情.value = row; 详情页签.value = '业务详情'; 详情打开.value = true }
function 准备动作(action: 作业动作, rows = 勾选.value) {
  if (!rows.length) return void ElMessage.warning('请先选择需要处理的单据')
  当前动作.value = action; 目标单据.value = [...rows]; 确认打开.value = true
}
function 确认执行() {
  if (确认中.value) return
  确认中.value = true
  批次结果.value = 目标单据.value.map(row => ({ no: row.no, ...执行样例动作(row, 当前动作.value), status: row.status, awaitingCheck: row.awaitingCheck }))
  确认打开.value = false; 结果打开.value = true; 确认中.value = false
  表格.value?.clearSelection()
  ElMessage.success('本地演示已完成，可逐项查看结果')
}
watch([当前状态, 每页], () => { 当前页.value = 1; 表格.value?.clearSelection() })
watch(当前页, () => 表格.value?.clearSelection())
watch(() => [route.query.fulfillmentOrderNo, route.query.systemOrderNo], ([fulfillment, order]) => {
  const keyword = typeof fulfillment === 'string' ? fulfillment : typeof order === 'string' ? order : ''
  if (keyword) { 重置(); 筛选.keyword = keyword; 查询() }
}, { immediate: true })
</script>

<template>
  <div class="仓配页面">
    <header v-prototype="标注('overview', `${标题}的对象与范围`, 是仓库 ? '每行是一张仓库出库单；同一履约单可保留多条历史执行，外部仓库单号必须结合仓库账号识别。' : '每行是一张物流下单单，仅演示 OMS 自有物流 API 先取面单的目标流程；一期适用组合待评审。', { 事实等级: 是仓库 ? '已确认' : '待确认', 数据来源: [是仓库 ? 'warehouse_outbound_order、warehouse_outbound_item 与接口尝试' : 'logistics_order、发运申报快照与接口尝试'], 验收要点: ['页签计数采用当前主对象数量，不与系统订单数混合比较。'] })" class="仓配页头">
      <div><div class="仓配面包屑">OMS <span>/</span> 仓配管理</div><h1>{{ 标题 }} <ElTag size="small" type="info" effect="plain">{{ 是仓库 ? '交互原型' : '流程演示 · 范围待评审' }}</ElTag></h1><p>{{ 是仓库 ? '跟进仓库受理、出库进度与异常，保留每一次执行事实。' : '集中查看物流建单、面单与跟踪号，按原业务单据核查和重提。' }}</p></div>
      <div class="仓配页头操作"><span>本地虚构样例 · 时间 UTC+8</span><ElButton :icon="Refresh" @click="查询">刷新列表</ElButton></div>
    </header>

    <div class="仓配指标">
      <button @click="重置"><ElIcon class="blue"><Document /></ElIcon><span>全部{{ 是仓库 ? '出库单' : '物流单' }}<strong>{{ 单据.length }}<small>单</small></strong></span></button>
      <button @click="快速查看('全部', '执行中')"><ElIcon class="amber"><Clock /></ElIcon><span>执行中<strong>{{ 处理中数 }}<small>单</small></strong></span></button>
      <button @click="快速查看('全部', '待核查')"><ElIcon class="red"><Warning /></ElIcon><span>外部结果待核查<strong>{{ 待核查数 }}<small>单</small></strong></span></button>
      <button @click="快速查看(是仓库 ? '已出库' : '下单成功')"><ElIcon class="green"><CircleCheck /></ElIcon><span>{{ 是仓库 ? '已确认出库' : '已取得物流结果' }}<strong>{{ 完成数 }}<small>单</small></strong></span></button>
    </div>

    <section class="仓配卡片">
      <div v-prototype="标注('filters', '筛选与稳定编号查询', '按业务编号、来源履约、服务商、创建日期和失败性质查询；搜索与重置清空跨页选择。', { 触发方式: ['输入条件后点击搜索或按 Enter。'], 成功结果: ['按全部已应用条件取交集；状态角标按筛选结果统计。'], 异常处理: ['无匹配记录显示空结果及重置入口。'], 验收要点: ['重置恢复全部数据；翻页和换状态不保留不可见行的选择。'] })" class="仓配筛选">
        <label class="宽查询"><span>单据查询</span><ElInput v-model="筛选.keyword" clearable placeholder="业务单号 / 履约单 / 订单 / SKU / 跟踪号" :prefix-icon="Search" @keyup.enter="查询" /></label>
        <label><span>{{ 是仓库 ? '仓储服务商' : '来源仓储服务商' }}</span><ElSelect v-model="筛选.provider" clearable placeholder="全部服务商"><ElOption v-for="p in 仓储服务商" :key="p" :label="p" :value="p" /></ElSelect></label>
        <label><span>处理关注</span><ElSelect v-model="筛选.review" clearable placeholder="全部"><ElOption label="外部结果待核查" value="待核查" /><ElOption label="执行中" value="执行中" /><ElOption label="明确失败 / 业务异常" value="明确失败" /></ElSelect></label>
        <label class="日期查询"><span>创建日期</span><ElDatePicker v-model="筛选.dates" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" /></label>
        <div class="仓配筛选按钮"><ElButton type="primary" :icon="Search" @click="查询">搜索</ElButton><ElButton @click="重置">重置</ElButton></div>
      </div>

      <nav v-prototype="标注('states', '独立业务状态与失败性质', 是仓库 ? '七种出库状态单独保存。请求超时保留下单中或取消中，不能归入仓内出库异常。' : '五种物流状态单独保存。结果无法确认归入下单失败，以原因标记待核查。', { 事实等级: '已确认', 交互规则: ['点击页签按业务状态过滤；待核查是失败性质或接口核查标记，不新增业务状态。'], 异常处理: ['失败原因与下一步必须可见，业务状态不直接覆盖订单处理状态。'] })" class="仓配状态栏">
        <button v-for="s in ['全部', ...状态集]" :key="s" :class="{ active: 当前状态 === s }" @click="当前状态 = s">{{ s }}<span>{{ s === '全部' ? 过滤结果.length : 过滤结果.filter(r => r.status === s).length }}</span></button>
      </nav>

      <div class="仓配作业栏">
        <div v-prototype="标注('batch', '批量操作按单据逐项校验', '勾选当前页单据后，先预览资格和影响范围；确认时再次执行门禁，结果显示成功、失败、处理中与待核查数量。', { 前置条件: ['至少选择一张单据。'], 系统动作: ['对每个稳定业务 ID 校验当前状态、核查标记和前置阻断。', '单据状态不符合时逐项拒绝，成功项与失败项分别反馈。'], 权限与审计: ['生产版须校验仓库/账号/动作权限，记录操作者、时间、前后状态和任务 ID。当前仅模拟日志。'], 验收要点: ['混选下单中、失败待核查和明确失败时，不允许全量无差别重试。'] })" class="仓配批量按钮">
          <ElButton v-if="!是仓库" type="primary" :disabled="!勾选.length" @click="准备动作('提交下单')">提交下单</ElButton>
          <ElButton :disabled="!勾选.length" @click="准备动作('查询结果')">查询结果</ElButton>
          <ElButton :disabled="!勾选.length" @click="准备动作('重新提交')">{{ 是仓库 ? '重提交失败单' : '恢复待下单' }}</ElButton>
          <span v-if="勾选.length" class="已选文本">已选 <b>{{ 勾选.length }}</b> 单 <button @click="表格?.clearSelection()">清空</button></span>
        </div>
        <span class="仓配表格提示">全量 {{ 失败数 }} 单需关注 · 按{{ 是仓库 ? '出库单' : '物流单' }}计数</span>
      </div>

      <ElTable ref="表格" v-prototype="标注('table', '执行对象与数量追溯', '保留 OMS 业务编号、来源履约单、执行路由与外部单号；实际出库数量只来自明确仓库事实。', { 数据来源: ['履约单实际路由快照；仓库/物流 API 外部事实；接口尝试失败原因。'], 交互规则: ['点击业务编号或详情打开右侧面板。表格内部横向滚动，操作列固定。'], 验收要点: ['跟踪号存在不等于已出库；部分数量不能显示全部完成。'] })" :data="分页数据" row-key="id" class="仓配表格" @selection-change="勾选 = $event">
        <ElTableColumn type="selection" width="42" fixed="left" />
        <ElTableColumn :label="是仓库 ? '出库单 / 来源' : '物流单 / 来源'" min-width="208" fixed="left"><template #default="{ row }"><button class="单号按钮" @click="查看(row as 仓配单据)">{{ row.no }}</button><div class="次行">履约 {{ row.fulfillment }}</div><div class="次行">订单 {{ row.order }}</div></template></ElTableColumn>
        <ElTableColumn label="当前状态" min-width="188"><template #default="{ row }"><ElTag :type="状态颜色(row.status)" size="small" effect="light">{{ row.status }}</ElTag><div v-if="row.awaitingCheck" class="核查提示">● 外部结果待核查</div><div v-if="row.reason" class="原因摘要">{{ row.reason }}</div><span v-else class="次行">{{ 是仓库 ? '独立出库状态' : '独立物流下单状态' }}</span></template></ElTableColumn>
        <ElTableColumn :label="是仓库 ? '仓储服务商 / 仓库' : '服务商 / 物流渠道'" min-width="184"><template #default="{ row }"><div>{{ 是仓库 ? row.provider : '演示物流服务商' }}</div><div class="次行">{{ 是仓库 ? row.warehouse : row.channel }}</div><div class="次行">{{ row.account }}</div></template></ElTableColumn>
        <ElTableColumn :label="是仓库 ? '商品 / 出库进度' : '商品 / 目的地'" min-width="180"><template #default="{ row }"><div>{{ row.goods }}</div><div class="次行">{{ row.sku }}</div><div class="次行">{{ 是仓库 ? `已出库 ${row.shipped} / 计划 ${row.planned} 件` : `${row.country} · ${row.planned} 件` }}</div></template></ElTableColumn>
        <ElTableColumn :label="是仓库 ? '外部单号 / 跟踪号' : '物流商单号 / 跟踪号'" min-width="172"><template #default="{ row }"><div class="数字文本">{{ row.externalNo || '—' }}</div><div class="次行 数字文本">{{ row.tracking || '暂未取得跟踪号' }}</div></template></ElTableColumn>
        <ElTableColumn label="创建 / 最近更新" min-width="164"><template #default="{ row }"><div class="时间文本">{{ row.createdAt }}</div><div class="次行 时间文本">{{ row.updatedAt }}</div><div class="次行">UTC+8</div></template></ElTableColumn>
        <ElTableColumn label="操作" width="105" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="查看(row as 仓配单据)">详情</ElButton><ElTooltip v-if="row.status === '下单失败'" :content="取得操作拦截(row as 仓配单据, '重新提交') || '预览当前单据的执行资格'" placement="left"><span><ElButton link type="primary" :disabled="!!取得操作拦截(row as 仓配单据, '重新提交')" @click="准备动作('重新提交', [row as 仓配单据])">重提</ElButton></span></ElTooltip><ElButton v-else-if="row.awaitingCheck" link type="primary" @click="准备动作('查询结果', [row as 仓配单据])">核查</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty description="没有符合条件的单据"><ElButton @click="重置">重置筛选</ElButton></ElEmpty></template>
      </ElTable>
      <footer class="仓配分页"><span>共 {{ 可见单据.length }} 单 · 当前页选择 {{ 勾选.length }} 单</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页" :total="可见单据.length" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next, jumper" /></footer>
    </section>

    <ElDrawer v-model="详情打开" :size="'min(850px, calc(100vw - 84px))'" class="仓配详情抽屉" :title="`${标题}详情`">
      <template v-if="详情">
        <div class="仓配详情标题"><div><p>{{ 是仓库 ? 'OMS 出库单号' : 'OMS 物流下单号' }}</p><h2>{{ 详情.no }}</h2></div><ElTag :type="状态颜色(详情.status)">{{ 详情.status }}</ElTag></div>
        <ElAlert v-if="详情.reason" :type="详情.awaitingCheck ? 'warning' : 'info'" :closable="false" :title="详情.reason" :description="详情.awaitingCheck ? '先查询原请求或对账核查。未确认外部未受理前，禁止自动和人工重复下单。' : 详情.blocker || '保留当前业务事实，按详情中的下一步处理。'" show-icon />
        <div class="仓配详情页签"><button v-for="tab in ['业务详情', '状态时间线', '接口尝试']" :key="tab" :class="{ active: 详情页签 === tab }" @click="详情页签 = tab">{{ tab }}<span v-if="tab === '接口尝试'">{{ 详情.attempts.length }}</span></button></div>
        <section v-if="详情页签 === '业务详情'" v-prototype="标注('detail.snapshot', '本次执行快照', '详情读取实际执行使用的仓库、账号、渠道、收件与申报快照，不读取会随主数据编辑变化的当前值。', { 事实等级: '已确认', 数据来源: ['履约单、业务单及收件/申报快照版本。'], 验收要点: ['渠道更名不改写历史路由；外部单号为空不补造。'] })" class="仓配详情内容">
          <h3>关联与执行路由</h3>
          <ElDescriptions :column="2" border><ElDescriptionsItem label="履约单">{{ 详情.fulfillment }}</ElDescriptionsItem><ElDescriptionsItem label="系统订单">{{ 详情.order }}</ElDescriptionsItem><ElDescriptionsItem label="平台">{{ 详情.platform }} · 演示订单</ElDescriptionsItem><ElDescriptionsItem label="目的地">{{ 详情.country }}</ElDescriptionsItem><ElDescriptionsItem label="仓储服务商">{{ 详情.provider }}</ElDescriptionsItem><ElDescriptionsItem label="发货仓库">{{ 详情.warehouse }}</ElDescriptionsItem><ElDescriptionsItem label="执行账号">{{ 详情.account }}</ElDescriptionsItem><ElDescriptionsItem label="物流渠道">{{ 详情.channel }}</ElDescriptionsItem><ElDescriptionsItem label="渠道快照代码">{{ 详情.channelCode }}</ElDescriptionsItem><ElDescriptionsItem label="面单模式">{{ 详情.labelMode }}</ElDescriptionsItem><ElDescriptionsItem :label="是仓库 ? '仓库外部单号' : '物流商单号'">{{ 详情.externalNo || '暂未取得' }}</ElDescriptionsItem><ElDescriptionsItem label="跟踪号">{{ 详情.tracking || '暂未取得' }}</ElDescriptionsItem><ElDescriptionsItem label="收件快照">DEMO-ADDRESS-V1 · 脱敏</ElDescriptionsItem><ElDescriptionsItem v-if="是仓库" label="仓库原始状态">未接入 · 仅统一状态演示</ElDescriptionsItem><ElDescriptionsItem label="幂等键">DEMO-{{ 详情.id }}</ElDescriptionsItem></ElDescriptions>
          <h3>{{ 是仓库 ? '商品与出库数量摘要' : '商品与申报快照' }}</h3><div v-if="详情.id.startsWith('shared-')" class="仓配解释">关联履约摘要：数量为本履约总量，多 SKU 逐行分配需由出库明细接口补齐，不能将汇总量用于单个 SKU 标发。</div>
          <ElTable :data="[详情]" border><ElTableColumn prop="sku" label="系统 SKU" min-width="160" /><ElTableColumn prop="goods" label="商品" min-width="130" /><ElTableColumn prop="planned" :label="是仓库 ? '计划出库' : '申报数量'" width="100" /><ElTableColumn v-if="是仓库" prop="shipped" label="已出库" width="90" /><ElTableColumn v-else label="申报资料"><template #default>本地快照 V1（演示）</template></ElTableColumn></ElTable>
          <div v-if="!是仓库" class="仓配解释">{{ 详情.status === '下单成功' ? '面单：演示引用 DEMO-LABEL-V1。原型不提供真实面单文件；取得跟踪号不等于已完成出库。' : '尚未取得成功且有效的面单结果，依赖此面单的推仓动作保持阻断。' }}</div>
          <h3>当前处理说明</h3><div class="仓配说明框"><strong>{{ 详情.awaitingCheck ? '先核查外部结果' : 详情.blocker ? '补齐前置条件' : ['已出库', '下单成功'].includes(详情.status) ? '保留已完成事实' : '按当前业务阶段继续' }}</strong><p>{{ 详情.reason || (是仓库 ? '仓库出库事实与订单处理、标发分别保存；本页不直接修改订单状态。' : '物流下单与仓库出库独立；成功结果只能来自查询、回调或受控核查证据。') }}</p><code v-if="详情.reasonCode">{{ 详情.reasonCode }}</code></div>
          <div v-if="['取消中', '已取消'].includes(详情.status)" class="仓配解释">取消状态为已接收的仓库执行事实。仓库撤单发起方及库存释放时点待评审；本页不提供订单取消申请或人工改为已取消的入口。</div>
        </section>
        <section v-else-if="详情页签 === '状态时间线'" v-prototype="标注('detail.history', '状态变化证据链', '按最近事件优先显示前后状态、触发来源、时间与原因。历史只追加，不用当前状态覆盖历史。', { 事实等级: '已确认', 权限与审计: ['操作者、对象 ID、事件时间、接收时间和原因码在生产审计中分别保存。'] })" class="仓配详情内容"><ElTimeline><ElTimelineItem v-for="(event, index) in 详情.history" :key="`${event.time}-${index}`" :timestamp="`${event.time} UTC+8`" placement="top" :type="index === 0 ? 'primary' : 'info'"><h4>{{ event.title }}</h4><p>{{ event.detail }}</p></ElTimelineItem></ElTimeline></section>
        <section v-else v-prototype="标注('detail.attempts', '单次接口尝试与核查', '业务单保留当前状态，接口尝试保留每次结果。超时记录失败原因与待核查标记，不把传输成功当作业务成功。', { 事实等级: '已确认', 异常处理: ['请求或响应中断后先定位原请求，核查前禁止重放外部写。'], 数据来源: ['integration_attempt；敏感原文通过受控快照访问，不进入普通日志。'], 验收要点: ['重提增加接口尝试，但保留原业务编号与幂等范围。'] })" class="仓配详情内容"><div class="仓配解释">以下为虚构接口尝试；原始请求、响应、账号凭据不在原型展示。</div><ElTable :data="详情.attempts" border><ElTableColumn prop="action" label="动作" width="130" /><ElTableColumn label="结果" width="75"><template #default="{ row }"><ElTag :type="row.result === '失败' ? 'danger' : 'success'" size="small">{{ row.result }}</ElTag></template></ElTableColumn><ElTableColumn prop="reason" label="业务说明 / 原因" min-width="240" /><ElTableColumn prop="time" label="时间 UTC+8" width="172" /><template #empty><ElEmpty description="当前尚未发生接口尝试" /></template></ElTable><div v-for="attempt in 详情.attempts" :key="attempt.id" class="接口编号">{{ attempt.id }}</div></section>
      </template>
      <template #footer><div class="仓配详情底栏"><span>本地样例，不调用外部服务</span><div><ElButton @click="详情打开 = false">关闭</ElButton><ElButton v-if="详情 && !取得操作拦截(详情, '查询结果')" type="primary" @click="准备动作('查询结果', [详情])">查询结果</ElButton></div></div></template>
    </ElDrawer>

    <ElDialog v-model="确认打开" :title="`${当前动作} · 执行前确认`" width="760px" append-to-body>
      <div class="仓配确认摘要"><strong>{{ 目标单据.length }}<small>本次选择</small></strong><strong class="green-text">{{ 可执行数量 }}<small>可执行</small></strong><strong class="red-text">{{ 目标单据.length - 可执行数量 }}<small>将被拦截</small></strong></div>
      <ElAlert type="info" :closable="false" show-icon :title="当前动作 === '查询结果' ? '回放固定的本地查询样例，保留查询证据' : '仅在当前原型中演示，不发送仓库或物流请求'" :description="当前动作 === '查询结果' ? '独立超时样例回放明确未受理；订单处理关联样例按共享请求回放受理或继续核查。撤单未明确仍保留取消中。不会手工写入已出库或跟踪号。' : '确认后对原业务单逐项检查，保留原编号和历史；不符合资格的项目不会执行。'" />
      <ElTable :data="目标单据" max-height="300" class="仓配确认表"><ElTableColumn prop="no" label="业务单据" width="176" /><ElTableColumn prop="status" label="当前状态" width="95" /><ElTableColumn label="资格 / 预期结果"><template #default="{ row }"><span :class="取得操作拦截(row as 仓配单据, 当前动作) ? 'red-text' : 'green-text'">{{ 取得操作拦截(row as 仓配单据, 当前动作) || (当前动作 === '查询结果' ? '可核查原请求，不重复提交' : 当前动作 === '重新提交' && !是仓库 ? '恢复原物流单至待下单' : '受理后进入下单中') }}</span></template></ElTableColumn></ElTable>
      <template #footer><ElButton @click="确认打开 = false">取消</ElButton><ElButton type="primary" :loading="确认中" :disabled="!可执行数量" @click="确认执行">确认{{ 当前动作 === '查询结果' ? '回放查询' : '演示执行' }}</ElButton></template>
    </ElDialog>
    <ElDialog v-model="结果打开" title="本次处理结果" width="800px" append-to-body><div class="仓配结果摘要"><span>总数 <b>{{ 批次结果.length }}</b></span><span>成功 <b>{{ 批次结果.filter(r => r.success).length }}</b></span><span>失败 <b>{{ 批次结果.filter(r => !r.success).length }}</b></span><span>业务处理中 <b>{{ 批次结果.filter(r => ['下单中', '取消中'].includes(r.status)).length }}</b></span><span>待核查 <b>{{ 批次结果.filter(r => r.awaitingCheck).length }}</b></span></div><ElTable :data="批次结果" max-height="370"><ElTableColumn prop="no" label="业务单据" width="175" /><ElTableColumn label="操作结果" width="90"><template #default="{ row }"><ElTag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</ElTag></template></ElTableColumn><ElTableColumn prop="status" label="业务状态" width="95" /><ElTableColumn prop="reason" label="处理说明与下一步" min-width="260" /></ElTable><div class="仓配解释">操作成功只表示本次演示操作受理完成；业务处理中与待核查为重叠统计，不能与成功/失败相加。</div><template #footer><ElButton type="primary" @click="结果打开 = false">完成</ElButton></template></ElDialog>
  </div>
</template>

<style scoped src="./仓配样式.css"></style>
