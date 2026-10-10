<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Refresh, Download, ArrowDown, Document, CopyDocument } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElCheckbox, ElDescriptions, ElDescriptionsItem, ElDialog, ElDrawer, ElEmpty, ElIcon, ElInput, ElMessage, ElOption, ElPagination, ElRadio, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTag, ElTimeline, ElTimelineItem, ElTooltip } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import TimeRange from '@/组件/筛选/时间范围.vue'
import ListSort from '@/组件/筛选/列表排序.vue'
import RecipientSummary from '../订单处理/收件信息摘要.vue'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 仓单期望版本 } from '../订单处理/操作功能模型'
import type { 仓配单据 } from './仓配模型'
import { 仓库会话单据, 仓配会话操作拦截, 执行仓配会话动作, 取得出库截单影响范围 } from './仓配会话'
import { 取得出库详情, 出库搜索字段, 默认出库筛选, 校验出库筛选, 命中出库筛选, 排序出库单据 } from './三方仓出库模型'
import type { 出库作业动作 } from './三方仓出库模型'
import { 出库标注 } from './三方仓出库标注'

const route = useRoute(), router = useRouter()
const 当前状态 = ref('全部'), 更多打开 = ref(false)
const 出库页签顺序 = ['全部', '下单中', '待出库', '已出库', '下单失败', '出库异常', '取消中', '已取消']
const 显示重新推单 = computed(() => ['全部', '下单失败'].includes(当前状态.value))
const 显示批量截单 = computed(() => ['全部', '待出库', '出库异常'].includes(当前状态.value))
const 筛选 = reactive(默认出库筛选()), 已应用 = reactive(默认出库筛选())
const 排序 = ref<{ field: string; direction: 'asc' | 'desc' }>({ field: 'createdAt', direction: 'desc' })
const 当前页 = ref(1), 每页 = ref(10), 勾选 = ref<仓配单据[]>([])
const 表格 = ref<{ clearSelection: () => void }>()
const 详情单据 = ref<仓配单据>(), 详情打开 = ref(false), 详情页签 = ref('基本信息')
const 详情 = computed(() => 详情单据.value ? 取得出库详情(详情单据.value) : undefined)
const 明细表 = computed(() => new Map(仓库会话单据.value.map(row => [row.id, 取得出库详情(row)])))
const d = (row: 仓配单据) => 明细表.value.get(row.id)!
const 截单范围 = (row: 仓配单据) => 取得出库截单影响范围(row, 批量动作.value)
const 过滤结果 = computed(() => 仓库会话单据.value.filter(row => 命中出库筛选(row, 已应用)))
const 可见单据 = computed(() => 排序出库单据(过滤结果.value.filter(row => 当前状态.value === '全部' || row.status === 当前状态.value), 排序.value))
const 分页数据 = computed(() => 可见单据.value.slice((当前页.value - 1) * 每页.value, 当前页.value * 每页.value))
const 选项 = (entries: Array<{ value: string; label: string }>) => [...new Map(entries.map(item => [item.value, item])).values()]
const 服务商选项 = computed(() => 选项(仓库会话单据.value.map(row => ({ value: row.provider, label: row.provider }))))
const 仓库选项 = computed(() => 选项(仓库会话单据.value.filter(row => !筛选.provider.length || 筛选.provider.includes(row.provider)).map(row => ({ value: JSON.stringify([row.provider, row.warehouse]), label: `${row.provider} · ${row.warehouse}` }))))
const 账号选项 = computed(() => 选项(仓库会话单据.value.filter(row => !筛选.provider.length || 筛选.provider.includes(row.provider)).map(row => ({ value: JSON.stringify([row.provider, row.account]), label: row.account }))))
const 平台选项 = computed(() => 选项(仓库会话单据.value.flatMap(row => d(row).sourceOrders.map(s => ({ value: s.platform, label: s.platform })))))
const 店铺选项 = computed(() => 选项(仓库会话单据.value.flatMap(row => d(row).sourceOrders.filter(s => !筛选.platform.length || 筛选.platform.includes(s.platform)).map(s => ({ value: s.shopId, label: s.shop })))))
const 渠道选项 = computed(() => 选项(仓库会话单据.value.filter(row => (!筛选.provider.length || 筛选.provider.includes(row.provider)) && (!筛选.warehouse.length || 筛选.warehouse.includes(JSON.stringify([row.provider, row.warehouse])))).map(row => ({ value: JSON.stringify([row.provider, row.account, row.warehouse, row.channelCode]), label: `${row.channel} · ${row.warehouse}` }))))
const 关注选项 = [{ value: '待核查', label: '待核查' }, { value: '执行中', label: '执行中' }, { value: '明确失败', label: '明确下单失败' }, { value: '部分出库', label: '部分出库' }, { value: '缺跟踪号', label: '已出库缺跟踪号' }]
const 日期类型 = [{ value: 'createdAt', label: '创建时间' }, { value: 'submittedAt', label: '推仓时间' }, { value: 'acceptedAt', label: '受理时间' }, { value: 'operationStartedAt', label: '首次作业时间' }, { value: 'shippedAt', label: '完成出库时间' }, { value: 'lastSyncedAt', label: '最后同步时间' }, { value: 'updatedAt', label: '最近更新时间' }]
const 排序字段 = 日期类型.map(item => ({ ...item, kind: 'time' as const }))
watch(仓库选项, options => { 筛选.warehouse = 筛选.warehouse.filter(v => options.some(o => o.value === v)) })
watch(账号选项, options => { 筛选.account = 筛选.account.filter(v => options.some(o => o.value === v)) })
watch(店铺选项, options => { 筛选.shop = 筛选.shop.filter(v => options.some(o => o.value === v)) })
watch(渠道选项, options => { 筛选.channel = 筛选.channel.filter(v => options.some(o => o.value === v)) })
const 状态颜色 = (s: string) => s === '已出库' ? 'success' : ['下单失败', '出库异常'].includes(s) ? 'danger' : s === '已取消' ? 'info' : s === '待出库' ? 'primary' : 'warning'
function 清除选择() { 勾选.value = []; 表格.value?.clearSelection() }
function 查询() { const error = 校验出库筛选(筛选); if (error) return void ElMessage.warning(error); Object.assign(已应用, JSON.parse(JSON.stringify(筛选))); 当前页.value = 1; 清除选择() }
function 重置() { Object.assign(筛选, 默认出库筛选()); 当前状态.value = '全部'; 排序.value = { field: 'createdAt', direction: 'desc' }; 查询() }
function 查看(row: 仓配单据) { 详情单据.value = row; 详情页签.value = '基本信息'; 详情打开.value = true }
async function 复制单号(no: string, label: string) {
  if (!no) return
  try { await navigator.clipboard.writeText(no); ElMessage.success(`已复制${label}`) }
  catch { ElMessage.warning('当前浏览器未允许复制，请手动选择单号') }
}
function 来源可查看(no: string) { return 共享订单.value.some(order => order.systemOrderNo === no) }
function 查看订单(no: string) { if (来源可查看(no)) { 详情打开.value = false; void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: no } }) } }
function 查看履约(row: 仓配单据) { const no = d(row).sourceOrders.find(s => 来源可查看(s.systemOrderNo))?.systemOrderNo; if (no) { 详情打开.value = false; void router.push({ path: '/oms/self-fulfillment/processing', query: { systemOrderNo: no } }) } }
function 查看标发(row: 仓配单据) { 详情打开.value = false; void router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { fulfillmentOrderNo: row.fulfillment } }) }
function 原因文案(text: string) {
  const known: Record<string, string> = {
    '演示请求已受理，等待读取仓库结果；提交受理不代表建仓成功。': '请求已提交，等待查询仓库接单结果。',
    '演示查询仍未取得明确结果；保留下单中，禁止重复推仓。': '尚未取得仓库明确结果，请继续核查原请求，禁止重复推仓。',
    '请求已发出但响应超时，外部结果待核查': '请求响应超时，请同步仓库状态核查原请求。',
    '服务商明确未受理；本地样例已完成前置校验': '仓库明确未受理，前置条件已完成核查。',
    '本地查询样例确认原请求未受理，可按门禁重新提交': '已确认原请求未受理，请检查发货条件后重新推单。',
    '本地查询样例与当前状态一致，未产生新的出库或运单事实': '查询完成，仓库状态与当前记录一致。',
    '本地样例：仓库仍未返回撤单结论，保留取消中并继续核查': '仓库尚未返回撤单结论，继续查询撤单结果。',
    '原出库单重新提交演示，等待仓库明确受理': '原出库单已重新推单，等待仓库明确受理。',
  }; return known[text] || text
}
function 拦截(row: 仓配单据, action: 出库作业动作, batch = false) {
  const reason = 仓配会话操作拦截(row, action, { 批量: batch })
  return reason === '账号开通/映射修复由现有中台及接入支持处理，原型未接入修复回执；当前保持阻断，可使用独立明确失败样例评审重提流程' ? '尚未取得有效的修复结果，请先核查原请求并修复发货条件。' : 原因文案(reason)
}
const 确认打开 = ref(false), 确认中 = ref(false), 当前动作 = ref<出库作业动作>('查询结果'), 目标单据 = ref<仓配单据[]>([])
const 修复说明 = ref(''), 预检版本 = ref<Record<string, Record<string, number>>>({})
const 截单原因 = ref(''), 已确认截单范围 = ref(false), 批量动作 = ref(false)
const 动作名称 = computed(() => 当前动作.value === '查询结果' ? '同步仓库状态' : 当前动作.value === '截单' ? '截单' : '重新推单')
const 可执行数量 = computed(() => 目标单据.value.filter(row => !拦截(row, 当前动作.value, 批量动作.value)).length)
const 结果打开 = ref(false), 批次结果 = ref<Array<{ no: string; success: boolean; status: string; awaitingCheck: boolean; reason: string }>>([])
function 准备动作(action: 出库作业动作, rows = 勾选.value, batch = false) {
  if (!rows.length) return void ElMessage.warning('请先选择出库单')
  当前动作.value = action; 目标单据.value = [...new Map(rows.map(row => [row.id, row])).values()]; 修复说明.value = ''; 预检版本.value = {}
  截单原因.value = ''; 已确认截单范围.value = false; 批量动作.value = batch
  for (const row of 目标单据.value) { const execution = 仓库执行记录.value.find(e => e.出库单号 === row.no); if (execution) 预检版本.value[row.no] = { ...(action === '截单' ? 截单范围(row).versions : 仓单期望版本(execution)) } }
  确认打开.value = true
}
function 确认执行() {
  if (确认中.value) return
  if (当前动作.value === '重新提交' && (!修复说明.value.trim() || 修复说明.value.trim().length > 500)) return void ElMessage.warning('请填写修复说明，最多500字')
  if (当前动作.value === '截单' && (!截单原因.value.trim() || 截单原因.value.trim().length > 500)) return void ElMessage.warning('请填写截单原因，最多500字')
  if (当前动作.value === '截单' && !已确认截单范围.value) return void ElMessage.warning('请先核对并确认全部来源订单与截单范围')
  确认中.value = true
  try { 批次结果.value = 目标单据.value.map(row => {
    const latest = 仓库会话单据.value.find(item => item.id === row.id)
    if (!latest) return { no: row.no, success: false, status: row.status, awaitingCheck: row.awaitingCheck, reason: '原出库单已发生变化，请重新查询后再操作。' }
    const result = 执行仓配会话动作(latest, 当前动作.value, { 修复说明: 修复说明.value, 版本表: 预检版本.value[row.no], 截单原因: 截单原因.value, 批量: 批量动作.value, 确认全部来源: 已确认截单范围.value })
    return { no: latest.no, ...result, reason: 原因文案(result.reason), status: latest.status, awaitingCheck: latest.awaitingCheck }
  }); 确认打开.value = false; 详情打开.value = false; 结果打开.value = true; 清除选择() } finally { 确认中.value = false }
}
function 下载CSV(name: string, rows: unknown[][]) {
  const cell = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return `"${(/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` }
  const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function 下载结果() { 下载CSV(`三方仓出库单处理结果_虚构评审数据_${Date.now()}.csv`, [['出库单号', '操作', '操作结果', '业务状态', '待核查', '处理说明', '数据性质'], ...批次结果.value.map(row => [row.no, 动作名称.value, row.success ? '成功' : '失败', row.status, row.awaitingCheck ? '是' : '否', row.reason, '本地虚构评审数据'])]) }
const 导出打开 = ref(false), 导出范围 = ref('all'), 导出全部 = ref<仓配单据[]>([]), 导出已选 = ref<仓配单据[]>([])
const 导出数据 = computed(() => 导出范围.value === 'all' ? 导出全部.value : 导出已选.value)
function 准备导出() { 导出全部.value = JSON.parse(JSON.stringify(可见单据.value)); 导出已选.value = JSON.parse(JSON.stringify(勾选.value)); 导出范围.value = 勾选.value.length ? 'selected' : 'all'; 导出打开.value = true }
function 确认导出() {
  下载CSV(`三方仓出库单_虚构评审数据_${Date.now()}.csv`, [
    ['OMS出库单号', '三方仓出库单号', '履约单号', '系统订单号', '平台订单号', '平台', '店铺', '仓储服务商', '发货仓库', '仓库账号', '物流渠道', '渠道代码', '出库状态', '三方仓原始状态', '系统SKU', '仓库SKU', '商品名称', '计划出库数量', '已出库数量', '单位', '跟踪号', '创建时间（北京时间）', '推仓时间（北京时间）', '受理时间（北京时间）', '首次作业时间（北京时间）', '完成出库时间（北京时间）', '最后同步时间（北京时间）', '最近更新时间（北京时间）', '待核查', '原因', '本出库单计划总量', '本出库单已出库总量', '汇总单位', '数据性质'],
    ...导出数据.value.flatMap(row => { const detail = 取得出库详情(row); return (detail.items.length ? detail.items : [null]).map(item => { const sources = item ? detail.sourceOrders.filter(s => s.systemOrderNo === item.sourceOrderNo) : detail.sourceOrders; return [row.no, row.externalNo, row.fulfillment, sources.map(s => s.systemOrderNo).join('、'), sources.map(s => s.platformOrderNo).join('、'), sources.map(s => s.platform).join('、'), sources.map(s => s.shop).join('、'), row.provider, row.warehouse, row.account, row.channel, row.channelCode, row.status, detail.warehouseStatusRaw, item?.systemSku, item?.warehouseSku, item?.goods, item?.plannedQuantity, item?.shippedQuantity, item?.unit, row.tracking, row.createdAt, detail.submittedAt, detail.acceptedAt, detail.operationStartedAt, detail.shippedAt, detail.lastSyncedAt, row.updatedAt, row.awaitingCheck ? '是' : '否', row.reason, detail.quantitySummary.plannedQuantity, detail.quantitySummary.shippedQuantity, detail.quantitySummary.unit, '本地虚构评审数据']; }) }),
  ]); 导出打开.value = false
}
watch(当前状态, () => { 当前页.value = 1; 清除选择() }); watch(每页, () => { 当前页.value = 1; 清除选择() }); watch(当前页, 清除选择)
watch(() => [route.query.fulfillmentOrderNo, route.query.systemOrderNo], ([fulfillment, order]) => { const keyword = typeof fulfillment === 'string' ? fulfillment : typeof order === 'string' ? order : ''; if (keyword) { 重置(); 筛选.searchType = typeof fulfillment === 'string' ? 'fulfillment' : 'order'; 筛选.searchMatch = 'exact'; 筛选.keyword = keyword; 查询() } }, { immediate: true })
</script>

<template>
  <div v-prototype="出库标注('overview')" class="出库页面">
    <nav v-prototype="出库标注('states')" class="出库状态栏" aria-label="出库状态"><button v-for="state in 出库页签顺序" :key="state" :class="{ active: 当前状态 === state }" @click="当前状态 = state">{{ state }}<span>{{ state === '全部' ? 过滤结果.length : 过滤结果.filter(row => row.status === state).length }}</span></button></nav>
    <section v-prototype="出库标注('filters')" class="出库筛选">
      <div class="筛选主行"><FieldSearch v-model="筛选.keyword" v-model:field="筛选.searchType" v-model:mode="筛选.searchMatch" :fields="出库搜索字段" aria-prefix="三方仓出库单" @search="查询" /><MultiSelectFilter v-model="筛选.provider" :options="服务商选项" placeholder="仓储服务商" /><MultiSelectFilter v-model="筛选.warehouse" :options="仓库选项" placeholder="发货仓库" :width="145" /><MultiSelectFilter v-model="筛选.account" :options="账号选项" placeholder="仓库账号" :width="145" /><MultiSelectFilter v-model="筛选.review" :options="关注选项" placeholder="处理关注" /><ElButton text @click="更多打开 = !更多打开">更多<ElIcon :class="{ 翻转: 更多打开 }"><ArrowDown /></ElIcon></ElButton></div>
      <div v-if="更多打开" class="筛选更多"><MultiSelectFilter v-model="筛选.platform" :options="平台选项" placeholder="平台" /><MultiSelectFilter v-model="筛选.shop" :options="店铺选项" placeholder="店铺" :width="145" /><MultiSelectFilter v-model="筛选.channel" :options="渠道选项" placeholder="物流渠道" :width="145" /></div>
      <div class="筛选日期行"><div class="日期组合"><ElSelect v-model="筛选.dateType" aria-label="出库单日期类型" class="日期类型"><ElOption v-for="item in 日期类型" :key="item.value" :label="item.label" :value="item.value" /></ElSelect><TimeRange v-model="筛选.dates" aria-prefix="三方仓出库单" /></div><ElButton type="primary" :icon="Search" @click="查询">搜索</ElButton><ElButton @click="重置">重置</ElButton><ListSort v-model="排序" :fields="排序字段" aria-prefix="三方仓出库单" @change="当前页 = 1; 清除选择()" /></div>
    </section>
    <div class="出库工具栏" :class="{ selected: 勾选.length }">
      <div v-prototype="出库标注('batch')" class="工具左">
        <ElButton v-prototype="出库标注('sync')" :icon="Refresh" :disabled="!勾选.length" @click="准备动作('查询结果')">同步仓库状态</ElButton>
        <ElTooltip v-if="显示重新推单" content="仅限下单失败、原请求确认未生效且问题已修复的出库单" placement="top"><span><ElButton v-prototype="出库标注('retry')" :disabled="!勾选.some(row => row.status === '下单失败')" @click="准备动作('重新提交')">重新推单</ElButton></span></ElTooltip>
        <ElTooltip v-if="显示批量截单" content="仅申请取消已建单且零出库的仓单；共享履约请逐单核查" placement="top"><span><ElButton :disabled="!勾选.some(row => ['待出库', '出库异常'].includes(row.status))" @click="准备动作('截单', 勾选, true)">批量截单</ElButton></span></ElTooltip>
        <span v-if="勾选.length" class="选择文字">已选 <b>{{ 勾选.length }}</b> 单 <button @click="清除选择">清空</button></span>
      </div>
      <div class="工具右"><ElButton v-prototype="出库标注('export')" :icon="Download" :disabled="!可见单据.length" @click="准备导出">导出</ElButton></div>
    </div>
    <div class="出库表格区"><ElTable ref="表格" v-prototype="出库标注('table')" :data="分页数据" row-key="id" height="100%" class="出库表格" @selection-change="勾选 = $event">
      <ElTableColumn type="selection" width="42" fixed="left" />
      <ElTableColumn label="出库单号" width="214" fixed="left"><template #default="{ row }"><div class="信息格"><button class="单号" @click="查看(row as 仓配单据)">{{ row.no }}</button><div class="字段行"><span>三方仓单号</span><b class="等宽">{{ row.externalNo || '—' }}</b></div><ElTag size="small" effect="plain" :type="状态颜色(row.status)">{{ row.status }}</ElTag><small v-if="row.awaitingCheck" class="警示字">待核查</small></div></template></ElTableColumn>
      <ElTableColumn label="履约 / 来源订单" min-width="235"><template #header><span v-prototype="出库标注('table.sources')">履约 / 来源订单</span></template><template #default="{ row }"><div class="信息格"><button v-if="d(row as 仓配单据).sourceOrders.some(s => 来源可查看(s.systemOrderNo))" class="单号 履约号" @click="查看履约(row as 仓配单据)">{{ row.fulfillment }}</button><strong v-else class="等宽">{{ row.fulfillment }}</strong><div v-for="source in d(row as 仓配单据).sourceOrders" :key="source.systemOrderNo" class="来源行"><button v-if="来源可查看(source.systemOrderNo)" class="单号" @click="查看订单(source.systemOrderNo)">{{ source.systemOrderNo }}</button><strong v-else class="等宽">{{ source.systemOrderNo }}</strong><span class="等宽">{{ source.platformOrderNo || '—' }}</span><small>{{ source.platform }} · {{ source.shop }}</small></div></div></template></ElTableColumn>
      <ElTableColumn label="商品 / 出库数量" min-width="275"><template #header><span v-prototype="出库标注('table.quantities')">商品 / 出库数量</span></template><template #default="{ row }"><div class="信息格 商品格"><div v-for="item in d(row as 仓配单据).items" :key="item.id" class="商品行"><strong>{{ item.goods }}</strong><div class="字段行"><span>系统 SKU</span><b class="等宽">{{ item.systemSku || '—' }}</b></div><div class="字段行"><span>仓库 SKU</span><b class="等宽">{{ item.warehouseSku || '—' }}</b></div><div class="商品数量"><span>计划 <b>{{ item.plannedQuantity ?? '—' }}</b></span><span>已出库 <b>{{ item.shippedQuantity ?? '—' }}</b></span><small>{{ item.unit || '—' }}</small></div></div><div v-if="!d(row as 仓配单据).items.length" class="数量汇总"><small>本出库单数量摘要</small><div>计划 <b>{{ d(row as 仓配单据).quantitySummary.plannedQuantity ?? '—' }}</b></div><div>已出库 <b>{{ d(row as 仓配单据).quantitySummary.shippedQuantity ?? '—' }}</b></div><small>{{ d(row as 仓配单据).quantitySummary.unit || '单位待核实' }}</small><span class="浅色字">逐行出库明细待核查</span></div></div></template></ElTableColumn>
      <ElTableColumn label="仓储物流" min-width="220"><template #header><span v-prototype="出库标注('table.route')">仓储物流</span></template><template #default="{ row }"><div class="信息格"><div class="字段行"><span>发货仓</span><b>{{ row.warehouse }}</b></div><div class="字段行"><span>服务商</span><b>{{ row.provider }}</b></div><div class="字段行"><span>账号</span><b>{{ row.account }}</b></div><div class="字段行"><span>渠道</span><b>{{ row.channel }}</b></div><ElTag size="small" type="info" effect="plain">{{ row.labelMode === '仓库回传' ? '仓配一体' : row.labelMode }}</ElTag></div></template></ElTableColumn>
      <ElTableColumn label="仓库状态 / 处理说明" min-width="210"><template #default="{ row }"><div class="信息格"><div class="字段行"><span>仓库原状态</span><b>{{ d(row as 仓配单据).warehouseStatusRaw || '—' }}</b></div><span v-if="row.reason" :class="{ 警示字: row.awaitingCheck || row.status === '出库异常' }">{{ 原因文案(row.reason) }}</span><span v-else>{{ row.status === '已出库' ? '仓库已确认出库' : row.status === '已取消' ? '仓库已确认取消' : row.status === '待出库' ? '仓库已受理，等待出库' : '等待仓库明确结果' }}</span><small v-if="!d(row as 仓配单据).snapshotReliable" class="警示字">出库明细待核查</small></div></template></ElTableColumn>
      <ElTableColumn label="实际发运" min-width="190"><template #header><span v-prototype="出库标注('table.shipment')">实际发运</span></template><template #default="{ row }"><div class="信息格"><div class="字段行"><span>跟踪号</span><b class="等宽">{{ row.tracking || '—' }}</b></div><div class="字段行"><span>完成出库时间</span><b>{{ d(row as 仓配单据).shippedAt || '—' }}</b></div><small v-if="row.status === '已出库' && !row.tracking" class="警示字">跟踪信息待核查</small></div></template></ElTableColumn>
      <ElTableColumn label="收件信息" min-width="165"><template #default="{ row }"><RecipientSummary v-if="d(row as 仓配单据).recipient" :address="d(row as 仓配单据).recipient!" :show-address="false" /><span v-else>—</span></template></ElTableColumn>
      <ElTableColumn min-width="245"><template #header><span v-prototype="出库标注('table.times')">时间 <small class="表头说明">（全部为北京时间）</small></span></template><template #default="{ row }"><div class="信息格 时间格"><div class="字段行"><span>创建</span><b>{{ row.createdAt || '—' }}</b></div><div class="字段行"><span>推仓</span><b>{{ d(row as 仓配单据).submittedAt || '—' }}</b></div><div class="字段行"><span>受理</span><b>{{ d(row as 仓配单据).acceptedAt || '—' }}</b></div><div class="字段行"><span>首次作业</span><b>{{ d(row as 仓配单据).operationStartedAt || '—' }}</b></div><div class="字段行"><span>最近更新</span><b>{{ row.updatedAt || '—' }}</b></div><div class="字段行"><span>最后同步</span><b>{{ d(row as 仓配单据).lastSyncedAt || '—' }}</b></div></div></template></ElTableColumn>
      <ElTableColumn label="操作" width="122" fixed="right"><template #default="{ row }"><div class="行操作">
        <ElButton link type="primary" @click="查看(row as 仓配单据)">出库单详情</ElButton>
        <ElTooltip :content="拦截(row as 仓配单据, '查询结果') || '查询原仓库出库单的最新状态'" placement="left"><span v-prototype="出库标注('sync')"><ElButton link type="primary" :disabled="!!拦截(row as 仓配单据, '查询结果')" @click="准备动作('查询结果', [row as 仓配单据])">同步仓库状态</ElButton></span></ElTooltip>
        <ElTooltip v-if="row.status === '下单失败'" :content="拦截(row as 仓配单据, '重新提交') || '仅限下单失败；仓库明确未受理且问题已修复后，重新推送原出库单'" placement="left"><span v-prototype="出库标注('retry')"><ElButton link type="primary" :disabled="!!拦截(row as 仓配单据, '重新提交')" @click="准备动作('重新提交', [row as 仓配单据])">重新推单</ElButton></span></ElTooltip>
        <ElTooltip v-if="['待出库', '出库异常'].includes(row.status)" :content="拦截(row as 仓配单据, '截单') || '向仓库申请取消整张出库单，提交前确认全部来源订单'" placement="left"><span v-prototype="出库标注('cancel')"><ElButton link type="primary" :disabled="!!拦截(row as 仓配单据, '截单')" @click="准备动作('截单', [row as 仓配单据])">截单</ElButton></span></ElTooltip>
      </div></template></ElTableColumn>
      <template #empty><ElEmpty description="没有符合条件的三方仓出库单"><ElButton @click="重置">重置筛选</ElButton></ElEmpty></template>
    </ElTable></div>
    <footer class="出库分页"><span>共 {{ 可见单据.length }} 单</span><ElPagination v-model:current-page="当前页" v-model:page-size="每页" :total="可见单据.length" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next, jumper" /></footer>

    <ElDrawer v-model="详情打开" title="三方仓出库单详情" size="min(1060px, calc(100vw - 84px))" append-to-body class="出库详情 出库详情抽屉"><template v-if="详情单据 && 详情">
      <div v-prototype="出库标注('detail.identity')" class="详情概要">
        <div class="详情单号区">
          <small class="详情单号标签">OMS 出库单号</small>
          <div class="详情主单号行">
            <h2>{{ 详情单据.no }}</h2>
            <ElTooltip v-if="详情单据.no" content="复制OMS出库单号" placement="top" :trigger="['hover', 'focus']" :trigger-keys="[]"><button type="button" class="详情复制按钮" aria-label="复制OMS出库单号" @click="复制单号(详情单据.no, 'OMS出库单号')"><ElIcon><CopyDocument /></ElIcon></button></ElTooltip>
          </div>
          <div class="详情仓库单号行">
            <span class="详情单号标签">三方仓出库单号</span>
            <span class="详情仓库单号等宽">{{ 详情单据.externalNo || '—' }}</span>
            <ElTooltip v-if="详情单据.externalNo" content="复制三方仓出库单号" placement="top" :trigger="['hover', 'focus']" :trigger-keys="[]"><button type="button" class="详情复制按钮" aria-label="复制三方仓出库单号" @click="复制单号(详情单据.externalNo, '三方仓出库单号')"><ElIcon><CopyDocument /></ElIcon></button></ElTooltip>
          </div>
        </div>
        <div class="详情状态标签"><ElTag :type="状态颜色(详情单据.status)">{{ 详情单据.status }}</ElTag><ElTag v-if="详情单据.awaitingCheck" type="warning">待核查</ElTag></div>
      </div>
      <ElAlert v-if="详情单据.reason" :title="原因文案(详情单据.reason)" :type="详情单据.awaitingCheck ? 'warning' : 'info'" :closable="false" show-icon />
      <ElAlert v-if="详情单据.status === '出库异常'" title="请联系海外仓处理出库异常" description="仓库处理完成后，请同步仓库状态获取最新出库结果。" type="warning" :closable="false" show-icon /><nav class="详情页签" aria-label="出库详情页签"><button v-for="item in ['基本信息', '商品明细', '实际发运', '状态时间线', '请求与核查']" :key="item" :class="{ active: 详情页签 === item }" @click="详情页签 = item">{{ item }}</button></nav>
      <section v-if="详情页签 === '基本信息'" v-prototype="出库标注('detail.snapshot')" class="详情内容">
        <h3>仓储与路由</h3><ElDescriptions :column="2" border><ElDescriptionsItem label="履约单号">{{ 详情单据.fulfillment }}</ElDescriptionsItem><ElDescriptionsItem label="出库状态">{{ 详情单据.status }}</ElDescriptionsItem><ElDescriptionsItem label="仓储服务商">{{ 详情单据.provider }}</ElDescriptionsItem><ElDescriptionsItem label="发货仓库">{{ 详情单据.warehouse }}</ElDescriptionsItem><ElDescriptionsItem label="仓库账号">{{ 详情单据.account }}</ElDescriptionsItem><ElDescriptionsItem label="仓库原始状态">{{ 详情.warehouseStatusRaw || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="物流渠道">{{ 详情单据.channel }}</ElDescriptionsItem><ElDescriptionsItem label="渠道代码">{{ 详情单据.channelCode }}</ElDescriptionsItem><ElDescriptionsItem label="面单获取模式">{{ 详情单据.labelMode === '仓库回传' ? '仓配一体' : 详情单据.labelMode }}</ElDescriptionsItem></ElDescriptions>
        <div v-prototype="出库标注('detail.times')" class="详情时间信息"><h3>时间信息 <small>北京时间</small></h3><ElDescriptions :column="2" border><ElDescriptionsItem label="创建时间">{{ 详情单据.createdAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="推仓时间">{{ 详情.submittedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="受理时间">{{ 详情.acceptedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="首次作业时间">{{ 详情.operationStartedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="完成出库时间">{{ 详情.shippedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="最后同步时间">{{ 详情.lastSyncedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="最近更新时间" :span="2">{{ 详情单据.updatedAt || '—' }}</ElDescriptionsItem></ElDescriptions></div>
        <h3>来源订单 <small>{{ 详情.sourceOrders.length }} 单</small></h3><ElTable :data="详情.sourceOrders" border><ElTableColumn label="系统订单号" min-width="185"><template #default="{ row }"><ElButton v-if="来源可查看(row.systemOrderNo)" link type="primary" @click="查看订单(row.systemOrderNo)">{{ row.systemOrderNo }}</ElButton><span v-else>{{ row.systemOrderNo }}</span></template></ElTableColumn><ElTableColumn prop="platformOrderNo" label="平台订单号" min-width="190" /><ElTableColumn prop="platform" label="平台" width="110" /><ElTableColumn prop="shop" label="店铺" min-width="180" /></ElTable>
        <h3>收件信息</h3><RecipientSummary v-if="详情.recipient" :address="详情.recipient" /><ElEmpty v-else description="暂无收件快照" :image-size="60" />
      </section>
      <section v-else-if="详情页签 === '商品明细'" v-prototype="出库标注('detail.items')" class="详情内容">
        <ElAlert v-if="!详情.snapshotReliable" type="warning" :closable="false" title="出库商品明细待核查" description="请核对本次履约的来源行与数量，确认前保留原执行路径。" show-icon />
        <div class="数量摘要"><span>本出库单计划 <b>{{ 详情.quantitySummary.plannedQuantity ?? '—' }}</b></span><span>已出库 <b>{{ 详情.quantitySummary.shippedQuantity ?? '—' }}</b></span><span>{{ 详情.quantitySummary.unit || '单位待核实' }}</span></div><ElTable :data="详情.items" border class="详情商品表"><ElTableColumn type="index" label="序号" width="55" /><ElTableColumn prop="sourceOrderNo" label="来源系统订单" min-width="190" /><ElTableColumn prop="systemSku" label="系统 SKU" min-width="170" /><ElTableColumn label="仓库 SKU" min-width="170"><template #default="{ row }">{{ row.warehouseSku || '—' }}</template></ElTableColumn><ElTableColumn prop="goods" label="商品" min-width="155" /><ElTableColumn label="计划出库" width="92"><template #default="{ row }">{{ row.plannedQuantity ?? '—' }}</template></ElTableColumn><ElTableColumn label="已出库" width="80"><template #default="{ row }">{{ row.shippedQuantity ?? '—' }}</template></ElTableColumn><ElTableColumn label="单位" width="65"><template #default="{ row }">{{ row.unit || '—' }}</template></ElTableColumn><ElTableColumn prop="lineStatus" label="明细状态" width="110" /><template #empty><ElEmpty description="暂无可信的出库商品明细" /></template></ElTable>
      </section>
      <section v-else-if="详情页签 === '实际发运'" v-prototype="出库标注('detail.shipment')" class="详情内容">
        <h3>发运信息</h3><ElDescriptions :column="2" border><ElDescriptionsItem label="跟踪号">{{ 详情单据.tracking || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="完成出库时间">{{ 详情.shippedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="首次作业时间">{{ 详情.operationStartedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="最后成功同步">{{ 详情.lastSyncedAt || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="实际重量">{{ 详情.actualWeight ?? '—' }} {{ 详情.weightUnit || '' }}</ElDescriptionsItem><ElDescriptionsItem label="实际尺寸">{{ 详情.length ?? '—' }} × {{ 详情.width ?? '—' }} × {{ 详情.height ?? '—' }} {{ 详情.dimensionUnit || '' }}</ElDescriptionsItem><ElDescriptionsItem label="跟踪链接" :span="2">{{ 详情.trackingUrl || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="仓库面单" :span="2">{{ 详情.labelFileRef || '尚未取得有效面单文件' }}</ElDescriptionsItem></ElDescriptions>
        <div v-if="详情单据.status === '已出库'" class="发运后续"><ElButton :icon="Document" @click="查看标发(详情单据)">查看订单标发</ElButton><span v-if="!详情单据.tracking" class="警示字">缺少跟踪号，请先核查实际发运信息</span></div>
      </section>
      <section v-else-if="详情页签 === '状态时间线'" v-prototype="出库标注('detail.history')" class="详情内容"><ElTimeline><ElTimelineItem v-for="(event, i) in 详情单据.history" :key="`${event.time}-${i}`" :timestamp="event.time" placement="top" :type="i === 0 ? 'primary' : 'info'"><h4>{{ event.title }}</h4><p>{{ event.detail }}</p></ElTimelineItem></ElTimeline></section>
      <section v-else v-prototype="出库标注('detail.attempts')" class="详情内容">
        <div class="核查卡"><h3>{{ 详情单据.awaitingCheck ? '先核查外部结果' : 详情单据.status === '下单失败' ? '检查重新推单资格' : '当前执行事实' }}</h3><p>{{ 详情单据.awaitingCheck ? '按原仓库账号及出库单号查询原请求，未确认原请求未生效前请勿重新推单或换仓。' : 拦截(详情单据, '重新提交') || '原请求明确失败，核验最新发货条件后可重新推送原出库单。' }}</p><dl><dt>原业务编号</dt><dd>{{ 详情单据.no }}</dd><dt>履约单号</dt><dd>{{ 详情单据.fulfillment }}</dd><dt>仓库账号</dt><dd>{{ 详情单据.account }}</dd><dt>原因码</dt><dd>{{ 详情单据.reasonCode || '—' }}</dd></dl></div>
        <h3>接口尝试 <small>{{ 详情单据.attempts.length }} 次 · 北京时间</small></h3><ElTable :data="详情单据.attempts" border><ElTableColumn prop="id" label="请求记录" min-width="210" /><ElTableColumn prop="action" label="动作" min-width="140" /><ElTableColumn prop="result" label="结果" width="70" /><ElTableColumn prop="reason" label="结果说明" min-width="230" /><ElTableColumn prop="time" label="时间" width="175" /><template #empty><ElEmpty description="暂无接口尝试记录" :image-size="60" /></template></ElTable>
        <div v-if="['取消中', '已取消'].includes(详情单据.status)" v-prototype="出库标注('detail.cancelled')" class="撤单事实"><h3>仓库撤单结果</h3><p>{{ 详情单据.status === '取消中' ? '尚未取得仓库最终撤单结果，请继续核查原出库单。' : '仓库已明确取消本出库路径，原记录及已发数量继续保留。' }}</p><p>{{ 详情单据.status === '取消中' ? '等待明确取消结果期间，订单保留原处理阶段，不能重新推单或安排新出库。平台付款或取消变化仍按订单规则处理。' : '仓库取消成功不会自动将OMS订单设为不发货或待审核。确认整单零出库、所有仓库执行已结束后，无需继续发货可操作不发货；仍需重新安排则退回待审核。异常订单先复核，部分出库或共享履约先核查范围。' }}</p><small>仓库撤单结果与销售订单取消事实分别保存。</small></div>
      </section>
    </template><template #footer><div v-if="详情单据" class="详情底栏"><span>所有时间均为北京时间</span><div>
      <ElButton @click="详情打开 = false">关闭</ElButton>
      <ElTooltip v-if="['待出库', '出库异常'].includes(详情单据.status)" :content="拦截(详情单据, '截单') || '申请取消整张出库单'" placement="top"><span v-prototype="出库标注('cancel')"><ElButton :disabled="!!拦截(详情单据, '截单')" @click="准备动作('截单', [详情单据])">截单</ElButton></span></ElTooltip>
      <ElButton v-if="!拦截(详情单据, '查询结果')" v-prototype="出库标注('sync')" type="primary" :icon="Refresh" @click="准备动作('查询结果', [详情单据])">同步仓库状态</ElButton>
    </div></div></template></ElDrawer>
    <ElDialog v-model="确认打开" :title="`${动作名称} · 执行确认`" :width="当前动作 === '截单' ? 'min(1080px, 94vw)' : 'min(850px, 94vw)'" :align-center="当前动作 === '截单'" append-to-body>
      <div v-prototype="出库标注('confirm')" class="确认摘要"><span>选择 <b>{{ 目标单据.length }}</b> 单</span><span class="完成字">可执行 <b>{{ 可执行数量 }}</b> 单</span><span class="警示字">将被拦截 <b>{{ 目标单据.length - 可执行数量 }}</b> 单</span></div>
      <ElAlert v-if="当前动作 === '截单'" :closable="false" show-icon type="warning" title="截单操作将会通过API发起取消出库单。">
        <div class="截单提示文案">
          <p>系统会持续更新【取消出库】的状态值。</p>
          <p>截单原因会通过接口提供给仓库，部分海外仓要求必填截单原因。</p>
          <p>注意：截单操作成功后将取消仓库订单，请确认仓库已停止出库作业，以避免订单发货风险。</p>
        </div>
      </ElAlert>
      <ElAlert v-else :closable="false" show-icon type="info" :title="当前动作 === '查询结果' ? '查询原出库单，更新仓库明确返回的结果' : '复用原出库单及请求身份，重新核验发货条件'" :description="当前动作 === '查询结果' ? '结果未明确时继续待核查；不会再次向仓库创建出库单。' : '原请求未核实、前置条件未修复或已有出库事实的单据将被拦截。'" />
      <div v-if="当前动作 === '重新提交'" class="修复说明"><label for="outbound-repair-note">修复说明</label><ElInput id="outbound-repair-note" v-model="修复说明" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="填写已完成的修复与核查结果" /></div>
      <div v-if="当前动作 === '截单'" v-prototype="出库标注('cancel')" class="截单表单">
        <label for="outbound-cancel-note">截单原因 <span class="必填标记">*</span></label><ElInput id="outbound-cancel-note" v-model="截单原因" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="填写申请截单的业务原因" />
      </div>
      <ElTable :data="目标单据" max-height="320" class="确认表">
        <ElTableColumn prop="no" label="出库单号" :width="当前动作 === '截单' ? 200 : 220" /><ElTableColumn prop="status" label="当前状态" width="95" />
        <ElTableColumn v-if="当前动作 === '截单'" label="发货与全部来源订单" min-width="370"><template #default="{ row }"><div class="截单影响范围">
          <strong>{{ row.fulfillment }}</strong><span>{{ row.provider }} · {{ row.warehouse }} · {{ row.account }}</span>
          <span>计划 {{ 截单范围(row as 仓配单据).quantitySummary.plannedQuantity ?? '—' }} / 已出库 {{ 截单范围(row as 仓配单据).quantitySummary.shippedQuantity ?? '—' }} {{ 截单范围(row as 仓配单据).quantitySummary.unit || '单位待核实' }}</span>
          <div v-for="source in 截单范围(row as 仓配单据).sourceOrders" :key="source.systemOrderNo" class="来源行"><strong>{{ source.systemOrderNo }}</strong><span>{{ source.platform || '—' }} · {{ source.shop || '—' }} · {{ source.platformOrderNo || '—' }}</span><span>OMS {{ source.processingStatus || '—' }}</span></div>
        </div></template></ElTableColumn>
        <ElTableColumn label="执行资格与预期结果" :min-width="当前动作 === '截单' ? 235 : 250"><template #default="{ row }"><span :class="拦截(row as 仓配单据, 当前动作, 批量动作) ? '警示字' : '完成字'">{{ 拦截(row as 仓配单据, 当前动作, 批量动作) || (当前动作 === '查询结果' ? '查询最新状态，保留原业务编号' : 当前动作 === '截单' ? '申请整张仓单截单，进入取消中等待仓库确认' : '重新推送原出库单，等待仓库明确受理') }}</span></template></ElTableColumn>
      </ElTable>
      <ElCheckbox v-if="当前动作 === '截单'" v-model="已确认截单范围" class="截单范围确认">已核对全部来源订单和零出库事实，确认申请整张仓单截单</ElCheckbox>
      <template #footer><ElButton @click="确认打开 = false">取消</ElButton><ElButton type="primary" :loading="确认中" :disabled="!可执行数量 || (当前动作 === '截单' && !已确认截单范围)" @click="确认执行">确认{{ 动作名称 }}</ElButton></template>
    </ElDialog>
    <ElDialog v-model="结果打开" title="出库单处理结果" width="min(900px, 94vw)" append-to-body><div v-prototype="出库标注('result')" class="确认摘要"><span>共 <b>{{ 批次结果.length }}</b> 单</span><span class="完成字">成功 <b>{{ 批次结果.filter(r => r.success).length }}</b></span><span class="警示字">失败 <b>{{ 批次结果.filter(r => !r.success).length }}</b></span><span>处理中 <b>{{ 批次结果.filter(r => ['下单中', '取消中'].includes(r.status)).length }}</b></span><span>待核查 <b>{{ 批次结果.filter(r => r.awaitingCheck).length }}</b></span></div><ElTable :data="批次结果" max-height="350"><ElTableColumn prop="no" label="出库单号" width="220" /><ElTableColumn label="操作结果" width="100"><template #default="{ row }"><ElTag size="small" :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</ElTag></template></ElTableColumn><ElTableColumn prop="status" label="出库状态" width="100" /><ElTableColumn prop="reason" label="结果说明" min-width="260" /></ElTable><p class="结果说明">操作结果与出库状态分别展示；处理中、待核查可同时存在。</p><template #footer><ElButton :icon="Download" @click="下载结果">下载逐项结果</ElButton><ElButton type="primary" @click="结果打开 = false">完成</ElButton></template></ElDialog>
    <ElDialog v-model="导出打开" title="导出三方仓出库单" width="520px" append-to-body><ElRadioGroup v-prototype="出库标注('export.confirm')" v-model="导出范围" class="导出选项"><ElRadio value="all">当前筛选及状态结果（{{ 导出全部.length }} 单）</ElRadio><ElRadio value="selected" :disabled="!导出已选.length">本页已选出库单（{{ 导出已选.length }} 单）</ElRadio></ElRadioGroup><p class="结果说明">将导出 {{ 导出数据.length }} 张出库单的商品明细，数据已固定。</p><template #footer><ElButton @click="导出打开 = false">取消</ElButton><ElButton type="primary" :disabled="!导出数据.length" @click="确认导出">确认导出</ElButton></template></ElDialog>
  </div>
</template>
<style scoped src="./三方仓出库样式.css"></style>
