<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Search, Refresh, Download, ArrowRight, OfficeBuilding, FolderOpened } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElConfigProvider, ElDialog, ElForm, ElFormItem, ElIcon, ElInput, ElInputNumber, ElMessage, ElOption, ElPagination, ElRadio, ElRadioGroup, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTag, ElTooltip, ElTree } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { 原型标注 } from '@/类型/标注'
import ChannelFieldHelp from './渠道字段说明.vue'
import { 仓储服务商, 演示时间 } from './仓配模型'
import { 渠道会话, 渠道会话审计 } from './仓配会话'
import { 渠道国家, 创建空白标发设置, 创建渠道配置样例, 复制渠道, 校验渠道配置, 渠道变更摘要, 追加渠道日志, 批量渠道启停, 同步渠道清单, 渠道CSV, type 渠道配置, type 渠道处理结果 } from './物流渠道配置'

const 渠道列表 = 渠道会话
const 账号列表 = computed(() => [...new Map(渠道列表.value.map(r => [r.accountId, { id: r.accountId, label: `${r.provider} · ${r.account}`, provider: r.provider }])).values()])
interface 导航节点 { id: string; label: string; provider?: string; warehouseId?: string; count: number; children?: 导航节点[] }
const 导航搜索 = ref(''), 当前导航 = ref<导航节点>({ id: 'all', label: '全部三方仓', count: 0 })
const 树 = ref<InstanceType<typeof ElTree>>()
const 导航数据 = computed<导航节点[]>(() => [{ id: 'all', label: '全部三方仓', count: 渠道列表.value.length }, ...仓储服务商.map(provider => {
  const rows = 渠道列表.value.filter(r => r.provider === provider)
  return { id: provider, label: provider, provider, count: rows.length, children: [...new Map(rows.map(r => [r.warehouseId, { id: r.warehouseId, label: r.warehouse, provider, warehouseId: r.warehouseId, count: rows.filter(x => x.warehouseId === r.warehouseId).length }])).values()] }
})])
watch(导航搜索, v => 树.value?.filter(v))
function 过滤导航(value: string, data: Record<string, unknown>) { return !value || `${data.label} ${data.provider || ''}`.toLowerCase().includes(value.trim().toLowerCase()) }
const 筛选 = reactive({ keyword: '', accountId: '', state: '', country: '' }), 已应用 = reactive({ ...筛选 })
const 页码 = ref(1), 页大小 = ref(20), 选择 = ref<渠道配置[]>([]), 表格 = ref<{ clearSelection: () => void }>()
const 可选账号 = computed(() => 账号列表.value.filter(r => !当前导航.value.provider || r.provider === 当前导航.value.provider))
const 查询结果 = computed(() => 渠道列表.value.filter(r => (!当前导航.value.provider || r.provider === 当前导航.value.provider) && (!当前导航.value.warehouseId || r.warehouseId === 当前导航.value.warehouseId) && (!已应用.keyword.trim() || [r.name, r.code].some(s => s.toLowerCase().includes(已应用.keyword.trim().toLowerCase()))) && (!已应用.accountId || r.accountId === 已应用.accountId) && (!已应用.state || r.enabled === (已应用.state === '启用')) && (!已应用.country || (已应用.country === 'unknown' ? !r.countries.length : r.countries.includes(已应用.country)))))
const 当前页 = computed(() => 查询结果.value.slice((页码.value - 1) * 页大小.value, 页码.value * 页大小.value))
function 清空选择() { 选择.value = []; 表格.value?.clearSelection() }
function 查询() { Object.assign(已应用, 筛选); 页码.value = 1; 清空选择() }
function 重置() { Object.assign(筛选, { keyword: '', accountId: '', state: '', country: '' }); 查询() }
function 选择导航(node: 导航节点) { 当前导航.value = node; 筛选.accountId = ''; 已应用.accountId = ''; 页码.value = 1; 清空选择() }
function 翻页() { 清空选择() }
function 改每页() { 页码.value = 1; 清空选择() }
function 刷新() { 查询(); ElMessage.success('已按当前条件刷新列表') }

const 编辑打开 = ref(false), 只读 = ref(false), 表单错误 = ref('')
const 草稿 = reactive<渠道配置>({ ...复制渠道(渠道列表.value[0]!), shipmentMappings: 复制渠道(渠道列表.value[0]?.shipmentMappings ?? 创建空白标发设置()) })
const 已填标发平台数 = computed(() => 草稿.shipmentMappings.filter(mapping => mapping.carrierCode.trim()).length)
function 打开配置(row: 渠道配置, readonly = false) { Object.assign(草稿, 复制渠道(row), { shipmentMappings: 复制渠道(row.shipmentMappings ?? 创建空白标发设置()) }); 只读.value = readonly; 表单错误.value = ''; 编辑打开.value = true }
function 保存() {
  草稿.name = 草稿.name.trim(); 草稿.remark = 草稿.remark.trim()
  草稿.shipmentMappings.forEach(mapping => { mapping.carrierCode = mapping.carrierCode.trim(); mapping.trackingUrl = (mapping.trackingUrl ?? '').trim() })
  表单错误.value = 校验渠道配置(草稿)
  if (表单错误.value) return
  const row = 渠道列表.value.find(r => r.id === 草稿.id)
  if (!row) { 表单错误.value = '原渠道已不存在，请刷新列表'; return }
  const before = 渠道变更摘要(row), next = 渠道变更摘要(草稿)
  if (before === next) { 编辑打开.value = false; ElMessage.info('配置未发生变化'); return }
  const time = 演示时间()
  Object.assign(row, 复制渠道(草稿), { providerCode: row.providerCode, updatedAt: time })
  追加渠道日志(渠道会话审计.value, row, '编辑配置', before, time, '保存业务名称、备注、限制及各平台标发设置；不修改来源身份、实际发运事实及历史提交快照。')
  编辑打开.value = false; 清空选择(); ElMessage.success('渠道配置已保存')
}
const 日志打开 = ref(false), 日志渠道 = ref<渠道配置>()
const 当前日志 = computed(() => 渠道会话审计.value.filter(l => l.channelId === 日志渠道.value?.id))
function 打开日志(row: 渠道配置) { 日志渠道.value = row; 日志打开.value = true }
function 日志字段差异(before: string, after: string) {
  const parse = (value: string): Record<string, unknown> => { try { return JSON.parse(value) } catch { return {} } }
  const oldValues = parse(before), newValues = parse(after)
  const display = (key: string, value: unknown): string => {
    if (value === undefined) return '无记录'
    if (value === null || value === '') return '未配置'
    if (Array.isArray(value)) {
      if (!value.length) return '未配置'
      return value.map(v => v === null ? '未配置' : String(v)).join(key === '重量kg' ? ' 至 ' : ' / ')
    }
    return String(value)
  }
  const changes = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])].filter(key => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])).map(key => ({ field: key === '重量kg' ? '实重范围（kg）' : key === '尺寸cm' ? '最长 / 次长 / 最短边（cm）' : key, before: display(key, oldValues[key]), after: display(key, newValues[key]) }))
  return changes.length ? changes : [{ field: '业务配置', before: '保持原值', after: '无变化（已更新成功同步时间）' }]
}
const 状态打开 = ref(false), 目标启用 = ref(false), 状态快照 = ref<渠道配置[]>([])
const 结果打开 = ref(false), 处理结果 = ref<渠道处理结果[]>([]), 结果标题 = ref('操作结果')
function 打开启停(enabled: boolean, rows = 选择.value) { 状态快照.value = 复制渠道(rows); 目标启用.value = enabled; 状态打开.value = true }
function 确认启停() {
  处理结果.value = 批量渠道启停(渠道列表.value, 状态快照.value.map(r => r.id), 目标启用.value, 渠道会话审计.value, 演示时间())
  状态打开.value = false; 结果标题.value = `批量${目标启用.value ? '启用' : '停用'}结果`; 结果打开.value = true; 清空选择()
}
const 同步中 = ref(false)
async function 同步渠道() {
  if (同步中.value) return
  // 固定点击时的来源范围，不使用列表结果、勾选或分页作为 API 查询范围。
  const { provider, warehouseId } = 当前导航.value, accountId = 已应用.accountId
  const sources = 创建渠道配置样例(true).filter(r => (!provider || r.provider === provider) && (!warehouseId || r.warehouseId === warehouseId) && (!accountId || r.accountId === accountId))
  if (!sources.length) { ElMessage.info('当前范围没有可同步的仓库账号'); return }
  同步中.value = true
  try {
    // 当前原型模拟海外仓返回；真实接口由服务端复用已有授权调用，见同步标注。
    await new Promise(resolve => setTimeout(resolve, 450))
    处理结果.value = 同步渠道清单(渠道列表.value, sources, 渠道会话审计.value, 演示时间())
    结果标题.value = '渠道同步结果 · 本地模拟'; 结果打开.value = true; 清空选择()
  } finally { 同步中.value = false }
}
const 导出打开 = ref(false), 导出范围 = ref('all'), 导出全部 = ref<渠道配置[]>([]), 导出已选 = ref<渠道配置[]>([]), 导出说明 = ref('')
const 导出数据 = computed(() => 导出范围.value === 'all' ? 导出全部.value : 导出已选.value)
function 打开导出() { 导出全部.value = 复制渠道(查询结果.value); 导出已选.value = 复制渠道(选择.value); 导出范围.value = 选择.value.length ? 'selected' : 'all'; 导出说明.value = `${当前导航.value.provider || '全部服务商'} / ${当前导航.value.warehouseId ? 当前导航.value.label : '全部仓库'}；关键词：${已应用.keyword || '全部'}；账号：${账号列表.value.find(a => a.id === 已应用.accountId)?.label || '全部'}${已应用.accountId ? `（${已应用.accountId}）` : ''}；状态：${已应用.state || '全部'}；目的国家：${已应用.country === 'unknown' ? '未配置' : 渠道国家.find(c => c.code === 已应用.country)?.name || '全部'}`; 导出打开.value = true }
function 导出() {
  if (!导出数据.value.length) return
  const count = 导出数据.value.length, url = URL.createObjectURL(new Blob([渠道CSV(导出数据.value)], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = `物流渠道_虚构评审数据_${Date.now()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  导出打开.value = false; ElMessage.success(`已导出 ${count} 条渠道配置`)
}
function 数值输入(key: 'minWeight' | 'maxWeight' | 'maxLength' | 'maxWidth' | 'maxHeight', value: number | undefined | null) { 草稿[key] = value ?? null }
const 标注细则: Record<string, Partial<原型标注>> = {
  overview: { 分类: '页面', 前置条件: ['从 OMS → 仓配管理 → 物流渠道管理进入。'], 触发方式: ['进入三方仓物流分类。'], 系统动作: ['加载当前浏览器会话的 60 条虚构渠道；四类入口仅开放三方仓物流。'], 成功结果: ['账号、仓库与来源身份完整区分；切中台页签保留编辑，刷新浏览器恢复初始样例。'], 验收要点: ['API 对接物流、自定义物流、平台物流均不可进入。'] },
  filters: { 触发方式: ['左侧选择服务商或仓库；输入关键词并点击查询或按 Enter。'], 系统动作: ['导航范围、渠道名称/渠道代码模糊搜索、稳定账号 ID、启停、目的国取交集；查询回首页并清除勾选。'], 成功结果: ['表格展示当前页，页脚显示命中总数。'], 异常处理: ['国家未配置单独筛选，不视为全球可达。'], 验收要点: ['同名账号不跨服务商串行；重置保留当前导航范围。'] },
  navigation: { 触发方式: ['搜索服务商或仓库，展开服务商并选择节点。'], 系统动作: ['以服务商→仓库缩小范围，账号通过右侧稳定 ID 筛选；切节点清空账号和勾选。'], 验收要点: ['同名美西仓分属不同服务商，筛选结果不能合并。'] },
  mapping: { 分类: '字段', 触发方式: ['点击详情、编辑或日志。'], 系统动作: ['一行代表服务商、账号、仓库及来源渠道的独立组合；渠道代码为原型生成的 DEMO 码。', '仓库在左侧导航定位，列表不重复展示适用仓库；详情和导出保留来源仓库身份。', '业务列按最小宽度弹性分配剩余空间，宽屏填满右侧内容区；勾选、状态和操作列维持固定宽度，窄屏在表格内部横向滚动。'], 异常处理: ['不以同名渠道、同名账号或来源代码单独合并记录。'], 验收要点: ['同名渠道跨账号分别编辑与记日志。'] },
  scope: { 分类: '规则', 事实等级: '已确认', 触发方式: ['查看面单设置。'], 系统动作: ['本期固定仓配一体、仓库提供面单；仓配分离为后续范围。', '页面以业务含义解释两种模式：仓配一体由仓库提供面单并发货；仓配分离由卖家提供面单，仓库按面单发货。'], 异常处理: ['没有自传面单、API 购买面单或平台面单操作。'], 验收要点: ['不能切换到其他面单模式。'] },
  form: { 触发方式: ['编辑后点击保存，或点击取消。'], 系统动作: ['只在保存时写回业务配置；来源身份及渠道代码只读；校验名称、非负数字及重量上下限。', '基础信息仓库字段显示为所属仓库名称；详情删除来源与核验展示模块，sourceId、sourceName、syncedAt 等来源数据及同步逻辑保留。'], 成功结果: ['保存后更新时间和日志；取消后原记录不变。'], 异常处理: ['无效表单保持打开；未配置限制保留空值，限制草案不自动成为订单门禁。'], 验收要点: ['最小重量大于最大重量被拒绝；取消编辑不改变渠道。'] },
  shipment: {
    分类: '规则',
    前置条件: ['按当前渠道的服务商、账号、仓库及来源渠道身份维护平台映射；该配置不依赖已删除的实际承运商主数据及单一/多个承运商模式。'],
    触发方式: ['在渠道详情查看“标发设置”，或在编辑中填写各平台承运商代码、查询地址后保存。'],
    系统动作: ['承运商、标发单号、配送服务、查询地址表头各有问号提示，解释业务含义；悬停、聚焦或点击显示，Esc 关闭提示。详情只读和原型标注关闭时仍可使用。配送服务仅 Amazon 可填、查询地址是否提交等适配说明保留在本标注，不再以表格脚注展示。', '按渠道×平台分别维护一期 eBay、Temu、美客多、Coupang、OZON、TikTok Shop、乐天的标发配置；不引入竞品截图中的其他平台。', '承运商填写平台接受的代码；当前字典未接入，输入仅保存待核验配置，空白表示该平台尚未配置。eBay 合法字典应从 GeteBayDetails 的 ShippingCarrierDetails 取得，不跨平台共用代码。', '标发单号表示单号来源；默认且仅提供“使用跟踪号”选项，读取仓库回传的当前有效 tracking_number，不是标发单据编号、仓库单号或固定手填单号。', '配送服务按用户确认仅 Amazon 可填写；Amazon 不在一期范围，当前七个平台均禁用且不保存配送服务。', '查询地址全部开放输入并按平台保存，可留空；去除首尾空格，非空须为 http/https 完整地址且最多 2048 字符，此校验为实现方案。填写是保存渠道查询网址，不自动拼接订单跟踪号、不请求该地址，也不等于平台接口需要或允许提交。', 'eBay 创建标发仅映射 shippingCarrierCode＋trackingNumber，不提交查询地址。美客多 ME1 seller_notifications 支持 tracking_url 与 tracking_number 成对回传；优优是否使用 ME1、渠道级网址如何成为订单级可用链接仍待核验，其他平台逐一按接口适配。', '保存时按平台写入配置差异日志，CSV 导出保留各平台配置和待核验标记；同步海外仓来源清单时保留人工标发设置和查询地址，新渠道初始化为空配置。'],
    成功结果: ['当前渠道详情显示保存后的各平台代码与查询地址；同名渠道及不同平台互不覆盖，历史标发快照保持原值。'],
    异常处理: ['未配置平台不阻止其他平台配置或渠道启用；真实标发前必须针对订单平台校验映射、实际出库与跟踪号。缺少或未知代码保持待处理，不回退为仓库名、渠道名或其他平台代码。', '配置与仓库实际发运承运商不一致时先核查，不用配置改写实际发运事实。保存配置不触发标发、不修改成功标发记录，也不解除现有失败单的执行阻断。'],
    数据来源: ['用户提供的领星截图仅作交互参考；平台标发边界以订单标发 PRD、订单单据字段标准及 eBay 接口说明为准。单号默认只提供使用跟踪号、承运商表头、配送服务仅 Amazon 可填及查询地址全部可填为用户确认；URL 长度和格式校验为实现方案，各平台真实提交规则仍须核验。'],
    prd引用: ['PRD/物流渠道管理功能PRD.md#44-编辑弹窗', 'PRD/订单标发功能PRD.md#3-主流程与资格校验', 'PRD/订单单据字段标准.md', '文档/集成/eBay/eBay订单API对接说明.md#63-订单标发请求参数'],
    验收要点: ['仅显示一期七平台；不恢复实际承运商或单/多模式。', '修改一行只影响该渠道的对应平台；取消编辑不写回，重复同步不覆盖人工映射，日志可读。', '空映射可保存；已填写仍是待核验配置，不作为真实平台自动标发已接通的证据。'],
  },
  toggle: { 触发方式: ['点击行内开关或批量启停，再确认。'], 系统动作: ['固定当前目标 ID 与数量；每条独立校验，已有目标状态跳过；记录每条成功动作前后值。'], 成功结果: ['反馈成功、失败、跳过数量和逐条结果。'], 异常处理: ['确认取消不改动；失败不回退其他成功项；启用不等于外部能力已核验。'], 验收要点: ['停用后旧单状态不变，启用不解除共享失败单阻断。'] },
  sync: {
    前置条件: ['生产接入复用已实现的海外仓授权；具体渠道 API、请求参数及页面映射见五仓对接 PRD 第 3 节，真实账号范围、来源唯一键、完整清单及仓库面单能力仍须联调。'],
    触发方式: ['点击“同步渠道”即发起海外仓渠道查询，获取并刷新最新物流渠道信息（2026-09-29 用户确认）。'],
    系统动作: ['生产目标：由服务端读取既有授权，调用对应海外仓的物流渠道 API，完整取得本次范围内的渠道信息后更新来源资料，再刷新列表。', '本轮范围方案（合理假设）：按当前左侧服务商/仓库及已应用的账号筛选查询；未限定账号时查询范围内全部既有授权账号，全部三方仓节点查询全部范围。关键词、启停、目的国家、勾选及分页不缩小 API 查询范围。', '按已核验来源身份幂等匹配，更新来源名称和成功同步时间；新增默认停用且标发映射为空，保留已有渠道人工维护的名称、备注、启停、限制及各平台标发设置。', '当前原型：按钮直接模拟上述流程，处理中阻止重复点击；使用本地虚构来源，尚未调用真实 API。'],
    成功结果: ['展示总数、成功、失败及跳过明细，按当前查询条件刷新列表；重复同步不重复新增。'],
    异常处理: ['生产要求：授权失效、超时或分页未取全时提示原因和可执行的下一步；失败范围保留旧资料及最后成功时间，修复后重试。', '来源身份冲突不取首条覆盖；一次清单未返回某渠道不删除旧记录。'],
    数据来源: ['五仓对接 PRD 第 3 节按系统字段、系统定义、API字段下载、API字段释义维护映射。外部渠道代码仅作为后台可空字段保存，不进入业务界面、搜索、日志或导出；缺少外部代码不单独阻止同步，来源身份仍须完整。4PX 目的地条件、西邮参数拼写等文档差异及真实账号能力待核验，当前仍使用虚构渠道资料。'],
    prd引用: ['PRD/物流渠道管理功能PRD.md#ch-02-同步渠道', 'PRD/4PX海外仓对接PRD.md#3-三方仓物流渠道对接', 'PRD/万邑通海外仓对接PRD.md#3-三方仓物流渠道对接', 'PRD/谷仓海外仓对接PRD.md#3-三方仓物流渠道对接', 'PRD/西邮海外仓API对接PRD.md#3-三方仓物流渠道对接', 'PRD/出口易海外仓对接PRD.md#3-三方仓物流渠道对接'],
    验收要点: ['点击即进入处理中并刷新渠道资料；相同范围同步两次不重复新增。', '关键词查询无结果时仍可同步当前来源范围；失败保留原资料和成功时间。', '真实 API 调用、账号授权及分页失败待接入阶段验收，当前本地模拟通过不代表接口已联调。'],
  },
  export: { 触发方式: ['点击导出后确认范围。'], 系统动作: ['打开弹窗时固定筛选结果和已选行的数据快照；导出带虚构性质、单位及时区的 CSV。'], 异常处理: ['没有勾选时禁用已选范围；空结果不可导出。'], 验收要点: ['分页选择不跨页；导出数量等于确认数量，名称以等号开头不会执行公式。'] },
  logs: { 触发方式: ['点击当前行日志。'], 系统动作: ['按稳定渠道 ID 查询本会话记录，展示动作、操作者、UTC+8 时间、前后值和说明。'], 异常处理: ['尚无记录明确显示空态；浏览器刷新不保留日志，不冒充服务端审计。'], 验收要点: ['跨账号同名渠道日志相互隔离。'] },
}
function 标注(id: string, 标题: string, 说明: string): 原型标注 {
  return { id: `oms.channels.${id}`, 标题, 说明, 分类: '交互', 事实等级: '合理假设', 路由: '/oms/warehouse-delivery/logistics-channels', 锚点: `oms.channels.${id}`, 版本: '2026-09-29', 状态: '待评审', prd引用: ['PRD/物流渠道管理功能PRD.md#4-页面与交互', 'PRD/物流渠道管理功能PRD.md#6-功能与操作', 'PRD/物流渠道管理功能PRD.md#10-验收标准'], 数据来源: ['本地虚构资料；现有中台的真实主数据归属及各仓渠道接口仍待核验。'], 权限与审计: ['未接入服务端权限和审计；当前会话日志仅用于交互评审。'], ...标注细则[id] }
}
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <section class="渠道页面" v-prototype="标注('overview', '渠道分类及本期范围', '按用户列出的四类展示；本期开放三方仓物流，其他三类作为后续入口。')">
      <ElTabs model-value="warehouse" class="渠道分类">
        <ElTabPane name="warehouse" label="三方仓物流" />
        <ElTabPane v-for="category in ['API对接物流', '自定义物流', '平台物流']" :key="category" :name="category" disabled><template #label><span>{{ category }}<small>未开放</small></span></template></ElTabPane>
      </ElTabs>
      <div class="渠道工作区">
        <aside class="渠道导航" v-prototype="标注('navigation', '按服务商及仓库定位', '服务商和仓库使用稳定身份筛选；账号在右侧选择，同名仓库不跨服务商合并。')">
          <div class="导航标题"><ElIcon><OfficeBuilding /></ElIcon><strong>仓储服务商</strong><span>{{ 仓储服务商.length }}</span></div>
          <ElInput v-model="导航搜索" aria-label="搜索服务商或仓库" clearable :prefix-icon="Search" placeholder="搜索服务商 / 仓库" size="small" />
          <ElTree ref="树" :data="导航数据" node-key="id" :default-expanded-keys="仓储服务商" current-node-key="all" highlight-current :expand-on-click-node="false" :filter-node-method="过滤导航" @node-click="选择导航">
            <template #default="{ data }"><span class="导航树行"><ElIcon v-if="data.id === 'all'"><FolderOpened /></ElIcon><span>{{ data.label }}</span><small>{{ data.count }}</small></span></template>
          </ElTree>
        </aside>
        <main class="渠道主体">
          <form class="渠道筛选" @submit.prevent="查询" v-prototype="标注('filters', '组合筛选及分页', '关键词支持渠道名称和渠道代码；所有筛选取交集，查询清除勾选并回到首页。')">
            <ElInput v-model="筛选.keyword" aria-label="渠道查询" :prefix-icon="Search" clearable placeholder="渠道名称 / 代码" class="渠道关键词" />
            <ElSelect v-model="筛选.accountId" aria-label="仓库账号" clearable placeholder="全部仓库账号" class="渠道账号筛选"><ElOption v-for="a in 可选账号" :key="a.id" :label="a.label" :value="a.id" /></ElSelect>
            <ElSelect v-model="筛选.state" aria-label="启停状态" clearable placeholder="启停状态" class="渠道状态筛选"><ElOption label="启用" value="启用" /><ElOption label="停用" value="停用" /></ElSelect>
            <ElSelect v-model="筛选.country" aria-label="目的国家" clearable placeholder="目的国家 / 地区" class="渠道国家筛选"><ElOption v-for="c in 渠道国家" :key="c.code" :value="c.code" :label="c.name" /><ElOption label="未配置" value="unknown" /></ElSelect>
            <div class="渠道查询动作"><ElButton type="primary" native-type="submit">查询</ElButton><ElButton @click="重置">重置</ElButton></div>
          </form>
          <div class="渠道工具栏">
            <div class="渠道工具左"><ElButton type="primary" :icon="Refresh" :loading="同步中" @click="同步渠道" v-prototype="标注('sync', '调用海外仓 API 刷新物流渠道', '点击按钮即调用海外仓 API 获取最新物流渠道并刷新列表；接口和字段映射参见五仓对接 PRD 第 3 节。当前原型为本地模拟，真实接口待联调。')">同步渠道</ElButton><ElButton :disabled="!选择.length" @click="打开启停(true)">批量启用</ElButton><ElButton :disabled="!选择.length" @click="打开启停(false)">批量停用</ElButton><ElButton :icon="Download" :disabled="!查询结果.length" @click="打开导出" v-prototype="标注('export', '导出范围确认', '可导出当前筛选结果或本页已选，打开确认即固定数据快照。')">导出</ElButton><span class="已选提示">已选 <b>{{ 选择.length }}</b> 项</span></div>
            <ElTooltip content="刷新列表"><ElButton :icon="Refresh" circle aria-label="刷新列表" @click="刷新" /></ElTooltip>
          </div>
          <div class="渠道范围行"><span>{{ 当前导航.provider || '全部服务商' }}<ElIcon><ArrowRight /></ElIcon>{{ 当前导航.warehouseId ? 当前导航.label : '全部仓库' }}</span><span>共 {{ 查询结果.length }} 个渠道</span></div>
          <div class="渠道表格容器" v-prototype="标注('mapping', '渠道与账号仓库的对应关系', '仓库通过左侧导航定位；各行按服务商、账号、仓库及来源渠道独立保存，同名不能合并。')">
            <ElTable ref="表格" :data="当前页" row-key="id" height="100%" @selection-change="选择 = $event" class="渠道表格">
              <ElTableColumn type="selection" width="43" fixed="left" />
              <ElTableColumn label="渠道名称 / 渠道代码" min-width="194" fixed="left"><template #default="{ row }"><button class="渠道名称链接" @click="打开配置(row as 渠道配置, true)">{{ row.name }}</button><div class="渠道次行 渠道代码">{{ row.code }}</div></template></ElTableColumn>
              <ElTableColumn label="服务商 / 仓库账号" min-width="149"><template #default="{ row }">{{ row.provider }}<div class="渠道次行">{{ row.account }}</div></template></ElTableColumn>
              <ElTableColumn label="目的国家 / 地区" min-width="135"><template #default="{ row }">{{ row.countries.length ? row.countries.join('、') : '未配置' }}</template></ElTableColumn>
              <ElTableColumn label="面单模式" min-width="132"><template #default><span>仓配一体</span><div class="渠道次行">仓库提供面单</div></template></ElTableColumn>
              <ElTableColumn label="状态" width="102" fixed="right"><template #default="{ row }"><ElSwitch :model-value="row.enabled" :aria-label="`${row.name} ${row.code}启停`" @click="打开启停(!row.enabled, [row as 渠道配置])" /><span class="渠道开关文字">{{ row.enabled ? '启用' : '停用' }}</span></template></ElTableColumn>
              <ElTableColumn label="更新时间（UTC+8）" min-width="171"><template #default="{ row }"><span class="渠道时间">{{ row.updatedAt }}</span></template></ElTableColumn>
              <ElTableColumn label="操作" width="137" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="打开配置(row as 渠道配置, true)">详情</ElButton><ElButton link type="primary" @click="打开配置(row as 渠道配置)">编辑</ElButton><ElButton link type="primary" @click="打开日志(row as 渠道配置)">日志</ElButton></template></ElTableColumn>
              <template #empty><div class="渠道空态">暂无匹配的物流渠道<ElButton link type="primary" @click="重置">重置查询条件</ElButton></div></template>
            </ElTable>
          </div>
          <footer class="渠道分页"><span>勾选仅保留在当前页</span><ElPagination v-model:current-page="页码" v-model:page-size="页大小" :page-sizes="[10, 20, 50]" :total="查询结果.length" layout="total, sizes, prev, pager, next, jumper" @current-change="翻页" @size-change="改每页" /></footer>
        </main>
      </div>
    </section>

    <ElDialog v-model="编辑打开" :title="只读 ? '物流渠道详情' : '编辑物流渠道'" class="渠道配置弹窗" width="min(1120px, calc(100vw - 110px))" top="6vh" :close-on-click-modal="false" destroy-on-close>
      <div class="渠道配置正文" v-prototype="标注('form', '物流渠道配置及输入校验', '来源只读，配置草案保存后写入当前会话；重量单位 kg，尺寸单位 cm，空值表示未配置。')">
        <div class="渠道配置摘要"><span>{{ 草稿.provider }} / {{ 草稿.account }} / {{ 草稿.warehouse }}</span><ElTag size="small" :type="草稿.enabled ? 'success' : 'info'">{{ 草稿.enabled ? '启用' : '停用' }}</ElTag></div>
        <ElForm label-position="top" :disabled="只读" class="渠道编辑表单">
          <section class="渠道表单分区"><h3>基础信息</h3><div class="渠道表单三列">
            <ElFormItem label="仓储服务商"><ElInput :model-value="草稿.provider" disabled /></ElFormItem><ElFormItem label="仓库账号"><ElInput :model-value="`${草稿.account} / ${草稿.accountId}`" disabled /></ElFormItem><ElFormItem label="所属仓库名称"><ElInput :model-value="草稿.warehouse" disabled /></ElFormItem>
            <ElFormItem label="渠道名称" required><ElInput v-model="草稿.name" maxlength="60" show-word-limit /></ElFormItem><ElFormItem label="渠道代码"><ElInput :model-value="草稿.code" disabled /></ElFormItem>
            <ElFormItem label="备注" class="渠道跨三列"><ElInput v-model="草稿.remark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="填写渠道使用说明" /></ElFormItem>
          </div></section>
          <section class="渠道表单分区"><h3>渠道限制 <span>未填写表示未配置，实际限制以核实的渠道资料为准</span></h3><div class="渠道表单三列">
            <ElFormItem label="可送达国家 / 地区" class="渠道跨三列"><ElSelect v-model="草稿.countries" multiple clearable placeholder="未配置"><ElOption v-for="c in 渠道国家" :key="c.code" :value="c.code" :label="c.name" /></ElSelect></ElFormItem>
            <ElFormItem label="包裹实重（kg）" class="渠道跨两列"><div class="渠道数值范围"><ElInputNumber :model-value="草稿.minWeight" :controls="false" :precision="3" placeholder="最小重量" @update:model-value="v => 数值输入('minWeight', v)" /><span>至</span><ElInputNumber :model-value="草稿.maxWeight" :controls="false" :precision="3" placeholder="最大重量" @update:model-value="v => 数值输入('maxWeight', v)" /><span>kg</span></div></ElFormItem><div />
            <ElFormItem label="最长边上限（cm）"><ElInputNumber :model-value="草稿.maxLength" :controls="false" :precision="2" placeholder="未配置" @update:model-value="v => 数值输入('maxLength', v)" /></ElFormItem><ElFormItem label="次长边上限（cm）"><ElInputNumber :model-value="草稿.maxWidth" :controls="false" :precision="2" placeholder="未配置" @update:model-value="v => 数值输入('maxWidth', v)" /></ElFormItem><ElFormItem label="最短边上限（cm）"><ElInputNumber :model-value="草稿.maxHeight" :controls="false" :precision="2" placeholder="未配置" @update:model-value="v => 数值输入('maxHeight', v)" /></ElFormItem>
          </div></section>
          <section class="渠道表单分区" v-prototype="标注('scope', '本期仓库提供面单', '用户确认本期仓配一体、由仓库提供面单，仓配分离为后续范围。')"><h3>面单设置</h3><div class="渠道面单设置"><ElRadioGroup model-value="warehouse"><ElRadio value="warehouse">仓库提供面单（仓配一体）</ElRadio><ElRadio value="separate" disabled>自传面单（后期开放）</ElRadio></ElRadioGroup><p>仓配一体由仓库提供面单并发货；仓配分离由卖家提供面单，仓库按面单发货。</p></div></section>
          <section class="渠道表单分区" v-prototype="标注('shipment', '按渠道与平台维护标发映射', '为当前物流渠道分别配置各平台的承运商代码、标发单号来源和查询地址。该配置不依赖实际承运商、单一/多个承运商设定；保存不触发标发。')">
            <h3>标发设置 <span>已填写 {{ 已填标发平台数 }} / {{ 草稿.shipmentMappings.length }} 个平台</span></h3>
            <p class="渠道标发说明">按平台配置标发时使用的承运商，标发单号取仓库回传的跟踪号。未配置的平台需补齐后才能自动标发。</p>
            <ElTable :data="草稿.shipmentMappings" row-key="platform" border class="渠道标发表">
              <ElTableColumn prop="platform" label="平台" width="105" />
              <ElTableColumn label="承运商" min-width="200">
                <template #header><ChannelFieldHelp 标题="承运商" 内容="订单向对应平台标记发货时使用的承运商代码。" /></template>
                <template #default="{ row }">
                  <ElInput v-if="!只读" v-model="row.carrierCode" :aria-label="`${row.platform}承运商代码`" placeholder="填写承运商代码" maxlength="128" clearable />
                  <span v-else class="渠道代码">{{ row.carrierCode || '未配置' }}</span>
                  <span v-if="row.carrierCode.trim()" class="渠道标发核验">待核验</span>
                </template>
              </ElTableColumn>
              <ElTableColumn label="标发单号" min-width="154"><template #header><ChannelFieldHelp 标题="标发单号" 内容="选择提交给平台的物流单号来源；使用跟踪号表示采用仓库回传的包裹跟踪号。" /></template><template #default="{ row }"><ElSelect v-model="row.trackingNumberSource" :aria-label="`${row.platform}标发单号`"><ElOption label="使用跟踪号" value="tracking_number" /></ElSelect></template></ElTableColumn>
              <ElTableColumn label="配送服务" min-width="140"><template #header><ChannelFieldHelp 标题="配送服务" 内容="承运商提供的具体运输服务，如标准配送、加急配送。" /></template><template #default="{ row }"><ElInput model-value="" :aria-label="`${row.platform}配送服务`" placeholder="不适用" disabled /></template></ElTableColumn>
              <ElTableColumn label="查询地址" min-width="260"><template #header><ChannelFieldHelp 标题="查询地址" 内容="用于查询包裹物流轨迹的网页地址。" /></template><template #default="{ row }"><ElInput v-model="row.trackingUrl" :aria-label="`${row.platform}查询地址`" placeholder="填写物流查询地址" maxlength="2048" clearable /></template></ElTableColumn>
            </ElTable>
          </section>
        </ElForm>
        <ElAlert v-if="表单错误" type="error" :title="表单错误" :closable="false" show-icon />
      </div>
      <template #footer><span class="渠道弹窗页脚说明">配置变更不改写已有履约快照</span><ElButton @click="编辑打开 = false">{{ 只读 ? '关闭' : '取消' }}</ElButton><ElButton v-if="只读" type="primary" @click="只读 = false">编辑配置</ElButton><ElButton v-else type="primary" @click="保存">保存</ElButton></template>
    </ElDialog>

    <ElDialog v-model="状态打开" :title="`确认${目标启用 ? '启用' : '停用'}渠道`" width="620px" :close-on-click-modal="false"><div v-prototype="标注('toggle', '启停确认与逐条反馈', '固定本次渠道范围；确认后逐条处理，并展示成功、失败及跳过结果。')"><p class="渠道确认主文">将{{ 目标启用 ? '启用' : '停用' }} <strong>{{ 状态快照.length }}</strong> 个物流渠道</p><ElAlert :closable="false" :type="目标启用 ? 'info' : 'warning'" :title="目标启用 ? '启用只改变业务开关，外部可用性仍需核验' : '停用后不再作为新的路由候选'" description="历史履约快照保持不变；本页不改路由、不撤销在途订单，也不解除订单执行阻断。" show-icon /><ElTable :data="状态快照" max-height="250" class="渠道确认表"><ElTableColumn prop="name" label="渠道名称" /><ElTableColumn prop="code" label="渠道代码" /><ElTableColumn label="来源范围"><template #default="{ row }">{{ row.provider }} / {{ row.account }}<div class="渠道次行">{{ row.warehouse }}</div></template></ElTableColumn></ElTable></div><template #footer><ElButton @click="状态打开 = false">取消</ElButton><ElButton :type="目标启用 ? 'primary' : 'danger'" @click="确认启停">确认{{ 目标启用 ? '启用' : '停用' }}</ElButton></template></ElDialog>
    <ElDialog v-model="结果打开" :title="结果标题" width="760px"><div class="渠道结果统计"><span>总数 <b>{{ 处理结果.length }}</b></span><span>成功 <b class="结果成功">{{ 处理结果.filter(r => r.result === '成功').length }}</b></span><span>失败 <b class="结果失败">{{ 处理结果.filter(r => r.result === '失败').length }}</b></span><span>跳过 <b>{{ 处理结果.filter(r => r.result === '跳过').length }}</b></span><span>处理中 <b>0</b></span></div><ElTable :data="处理结果" max-height="360"><ElTableColumn label="渠道" width="185"><template #default="{ row }">{{ row.name }}<div class="渠道次行">{{ row.code }}</div></template></ElTableColumn><ElTableColumn label="结果" width="83"><template #default="{ row }"><ElTag size="small" :type="row.result === '成功' ? 'success' : row.result === '失败' ? 'danger' : 'info'">{{ row.result }}</ElTag></template></ElTableColumn><ElTableColumn prop="detail" label="处理说明" /></ElTable><template #footer><ElButton type="primary" @click="结果打开 = false">完成</ElButton></template></ElDialog>
    <ElDialog v-model="导出打开" title="导出物流渠道" width="560px"><p class="渠道辅助说明">{{ 导出说明 }}</p><ElRadioGroup v-model="导出范围" class="渠道导出选项"><ElRadio value="all">当前筛选结果（{{ 导出全部.length }} 条）</ElRadio><ElRadio value="selected" :disabled="!导出已选.length">本页已选渠道（{{ 导出已选.length }} 条）</ElRadio></ElRadioGroup><ElAlert :closable="false" type="info" :title="`本次导出 ${导出数据.length} 条配置，数据已固定`" description="CSV 包含账号/仓库标识、限制、各平台标发设置（待核验）、更新时间（UTC+8）及虚构数据标记。" /><template #footer><ElButton @click="导出打开 = false">取消</ElButton><ElButton type="primary" :disabled="!导出数据.length" @click="导出">确认导出</ElButton></template></ElDialog>
    <ElDialog v-model="日志打开" title="渠道操作日志" width="min(1000px, calc(100vw - 110px))"><div v-prototype="标注('logs', '按渠道身份查询日志', '日志按稳定渠道 ID 隔离；展示操作者、动作时间及可核对的前后值。')"><p class="渠道日志对象">{{ 日志渠道?.name }} <span>{{ 日志渠道?.code }} · {{ 日志渠道?.provider }} / {{ 日志渠道?.account }} / {{ 日志渠道?.warehouse }}</span></p><ElTable :data="当前日志" max-height="470"><ElTableColumn type="expand"><template #default="{ row }"><div class="渠道日志差异"><ElTable :data="日志字段差异(row.before, row.after)" border><ElTableColumn prop="field" label="变更字段" width="210" /><ElTableColumn prop="before" label="变更前" /><ElTableColumn prop="after" label="变更后" /></ElTable></div></template></ElTableColumn><ElTableColumn prop="time" label="时间（UTC+8）" width="172" /><ElTableColumn prop="operator" label="操作人" width="104" /><ElTableColumn prop="action" label="操作" width="110" /><ElTableColumn prop="detail" label="说明" /><template #empty>该渠道尚无本次会话操作记录</template></ElTable><p class="渠道辅助说明">日志仅保留于当前原型会话，刷新浏览器后恢复初始数据。</p></div><template #footer><ElButton @click="日志打开 = false">关闭</ElButton></template></ElDialog>
  </ElConfigProvider>
</template>

<style scoped src="./物流渠道样式.css"></style>
