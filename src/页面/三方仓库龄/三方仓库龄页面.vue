<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Search, Refresh, Download, ArrowDown, ArrowUp, QuestionFilled } from '@element-plus/icons-vue'
import { ElButton, ElSelect, ElOption, ElInput, ElIcon, ElTable, ElTableColumn, ElPagination, ElDialog, ElTooltip, ElTag, ElMessage, ElRadioGroup, ElRadioButton, ElRadio, ElDatePicker, ElConfigProvider, ElCheckbox } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { agingRecords, agingBands, defaultFilters, filterAgingRecords, summarizeAgingRecords, groupAgingDetails, validateAgingFilters, qualityQuantities, quantityText, isValidAge, isValidQuantity, type AgingRecord, type AgingSummary, type AgingDetailGroup, type AgingFilters } from './库龄模型'
import { agingAnnotation as note } from './库龄标注'
import { createAgingWorkbook } from './库龄导出'
import { 时间文本 } from '../三方仓库存/库存模型'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import ListSort from '@/组件/筛选/列表排序.vue'
import { 排序列表, 读取排序时刻 } from '@/组件/筛选/筛选工具'

type Row = AgingDetailGroup | AgingSummary
type ExportRow = AgingRecord | AgingSummary
const AgingColumn = ElTableColumn<Row>
const BatchColumn = ElTableColumn<AgingRecord>
const quantityColumns = [
  { key: 'goodQty', label: '在库数量（良品）', anchor: 'good-quantity' },
  { key: 'defectiveQty', label: '在库数量（不良品）', anchor: 'defective-quantity' },
] as const
const view = ref<'summary' | 'detail'>('summary')
const draft = reactive(defaultFilters()), applied = ref(defaultFilters()), autoDate = ref(true)
const more = ref(false), extraColumns = ref(false), queryError = ref('')
const sorting = ref({ field: '', direction: 'asc' as 'asc' | 'desc' })
const searchFields = [{ value: 'systemSku', label: '系统 SKU', kind: 'identifier' as const }, { value: 'warehouseSku', label: '仓库 SKU', kind: 'identifier' as const }, { value: 'name', label: '商品名称', kind: 'text' as const }]
const batchField = ref('batchNo'), batchFields = [{ value: 'batchNo', label: '批次号', kind: 'identifier' as const }]
const sortFields = [{ value: 'warehouseSku', label: '仓库 SKU', kind: 'text' as const }, { value: 'systemSku', label: '系统 SKU', kind: 'text' as const }, { value: 'name', label: '商品名称', kind: 'text' as const }, { value: 'updatedAt', label: '最近成功更新', kind: 'time' as const }]
watch(() => draft.keywordType, type => { draft.searchMatch = type === 'name' ? 'contains' : 'exact' })
const page = ref(1), pageSize = ref(50), selection = ref<Row[]>([])
const expandedKeys = ref<string[]>([])
const table = ref<{ clearSelection: () => void }>()
const refreshing = ref(false)
const exportOpen = ref(false), exporting = ref(false), exportScope = ref<'all' | 'selected'>('all')
const exportSnapshot = ref<{ view: 'summary' | 'detail'; date: string; scope: string; all: ExportRow[]; selected: ExportRow[]; selectedGroups: number }>({ view: 'summary', date: '', scope: '', all: [], selected: [], selectedGroups: 0 })
const providers = [...new Set(agingRecords.map(r => r.provider))]
const accounts = computed(() => [...new Map(agingRecords.filter(r => !draft.providers.length || draft.providers.includes(r.provider)).map(r => [r.accountId, { id: r.accountId, label: `${r.provider} · ${r.account}` }])).values()])
const warehouses = computed(() => [...new Map(agingRecords.filter(r => (!draft.providers.length || draft.providers.includes(r.provider)) && (!draft.accounts.length || draft.accounts.includes(r.accountId))).map(r => [r.warehouseId, { id: r.warehouseId, label: r.warehouse }])).values()])
const qualities = [...new Set(agingRecords.map(r => r.quality))]
watch(() => [...draft.providers], () => { draft.accounts = draft.accounts.filter(id => accounts.value.some(a => a.id === id)); draft.warehouses = draft.warehouses.filter(id => warehouses.value.some(w => w.id === id)) })
watch(() => [...draft.accounts], () => { draft.warehouses = draft.warehouses.filter(id => warehouses.value.some(w => w.id === id)) })
const detailRows = computed(() => filterAgingRecords(agingRecords, applied.value))
const rows = computed<Row[]>(() => {
  const list = view.value === 'summary' ? summarizeAgingRecords(detailRows.value) : groupAgingDetails(detailRows.value)
  if (sorting.value.field === 'updatedAt') return 排序列表<Row>(list, row => 读取排序时刻(row.updatedAt), sorting.value.direction, row => row.id)
  if (['warehouseSku', 'systemSku', 'name'].includes(sorting.value.field)) return 排序列表<Row>(list, row => row[sorting.value.field as 'warehouseSku' | 'systemSku' | 'name'], sorting.value.direction, row => row.id)
  return list
})
const currentRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const exportCount = computed(() => exportScope.value === 'selected' ? exportSnapshot.value.selected.length : exportSnapshot.value.all.length)
function cloneFilters(f: AgingFilters): AgingFilters { return { ...f, providers: [...f.providers], accounts: [...f.accounts], warehouses: [...f.warehouses], quality: [...f.quality], issue: [...f.issue] } }
function clearSelection() { table.value?.clearSelection(); selection.value = []; expandedKeys.value = [] }
function toggleBatches(row: Row) { expandedKeys.value = expandedKeys.value.includes(row.id) ? expandedKeys.value.filter(id => id !== row.id) : [...expandedKeys.value, row.id] }
function changeExpansion(_row: Row, expandedRows: Row[] | boolean) { if (Array.isArray(expandedRows)) expandedKeys.value = expandedRows.map(row => row.id) }
function query() {
  queryError.value = validateAgingFilters(draft)
  if (queryError.value) return
  const next = cloneFilters(draft)
  if (view.value === 'summary') { next.batchNo = ''; next.minAge = ''; next.maxAge = '' }
  if (autoDate.value) {
    next.snapshotDate = ''
    next.snapshotDate = filterAgingRecords(agingRecords, next)[0]?.snapshotDate || ''
    draft.snapshotDate = next.snapshotDate
  }
  applied.value = next; page.value = 1; clearSelection()
}
function reset() { Object.assign(draft, defaultFilters()); sorting.value = { field: '', direction: 'asc' }; autoDate.value = true; query() }
function applySorting() { page.value = 1; clearSelection() }
function changeView() {
  draft.batchNo = ''; draft.minAge = ''; draft.maxAge = ''
  applied.value = { ...applied.value, batchNo: '', minAge: '', maxAge: '' }
  queryError.value = ''; extraColumns.value = false; page.value = 1; clearSelection()
}
function latest() { autoDate.value = true; query() }
function resizePage() { page.value = 1; clearSelection() }
function group(row: Row): AgingDetailGroup { return row as AgingDetailGroup }
function summary(row: Row): AgingSummary { return row as AgingSummary }
function raw(value: string | number | null | undefined) { return value === null || value === undefined || value === '' ? '—' : String(value) }
function badAge(row: AgingRecord) { return row.agingDays !== null && !isValidAge(row.agingDays) }
function quantityClass(value: string | null) { return value !== null && !isValidQuantity(value) ? 'invalid' : value === null ? 'muted' : '' }
function exportRows(list: Row[]): ExportRow[] { return view.value === 'detail' ? list.flatMap(row => group(row).children) : list as AgingSummary[] }
async function refresh() {
  refreshing.value = true
  await Promise.resolve()
  clearSelection(); refreshing.value = false
  ElMessage.success('已重读保存的快照，快照日期、来源库龄及更新时间保持不变')
}
function openExport() {
  const f = applied.value
  const accountNames = new Map(agingRecords.map(r => [r.accountId, `${r.provider} · ${r.account}`]))
  const warehouseNames = new Map(agingRecords.map(r => [r.warehouseId, r.warehouse]))
  exportSnapshot.value = { view: view.value, date: f.snapshotDate || '无可用快照', scope: [f.providers.join('、') || '全部服务商', f.accounts.map(id => accountNames.get(id) || id).join('、') || '全部账号', f.warehouses.map(id => warehouseNames.get(id) || id).join('、') || '全部仓库', f.keyword ? `${f.keywordType === 'name' ? '商品名称' : f.keywordType === 'systemSku' ? '系统 SKU' : '仓库 SKU'}（${f.searchMatch === 'exact' ? '精确' : '模糊'}）：${f.keyword}` : '', f.quality.length ? `质量：${f.quality.join('、')}` : '', f.batchNo ? `批次（${f.batchMatch === 'exact' ? '精确' : '模糊'}）：${f.batchNo}` : '', f.minAge || f.maxAge ? `库龄：${f.minAge || '不限'} ～ ${f.maxAge || '不限'} 天` : ''].filter(Boolean).join(' / '), all: JSON.parse(JSON.stringify(exportRows(rows.value))), selected: JSON.parse(JSON.stringify(exportRows(selection.value))), selectedGroups: selection.value.length }
  exportScope.value = selection.value.length ? 'selected' : 'all'; exportOpen.value = true
}
async function download() {
  if (!exportCount.value || exporting.value) return
  exporting.value = true
  try {
    const snap = exportSnapshot.value, list = exportScope.value === 'all' ? snap.all : snap.selected
    const bytes = createAgingWorkbook(snap.view, list as AgingRecord[] | AgingSummary[], new Date().toISOString())
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a'); link.href = url; link.download = `三方仓库龄_${snap.view === 'summary' ? '分段汇总' : '批次明细'}_${snap.date}_演示.xlsx`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportOpen.value = false; ElMessage.success(`已生成 ${list.length} 条${snap.view === 'summary' ? '汇总' : '明细'}记录的文件`)
  } catch { ElMessage.error('文件生成失败，请重试。保存的快照未改变。') } finally { exporting.value = false }
}
reset()
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <section class="aging-page" v-prototype="note('page', '三方仓库龄', '每日保存接口实际查询日的快照；分段汇总和批次明细来自同一份来源记录，库龄直接取来源值。', '页面', '已确认')">
      <div class="view-bar">
        <ElRadioGroup v-model="view" aria-label="库龄视图" @change="changeView" v-prototype="note('view', '切换库龄视图', '保留已应用的通用筛选，清空批次号、库龄范围和勾选，回第 1 页。两个视图使用同一日期同一份来源明细。')"><ElRadioButton value="summary">分段汇总</ElRadioButton><ElRadioButton value="detail">批次明细</ElRadioButton></ElRadioGroup>
        <div class="review-note"><ElTooltip content="分段区间、展示分组与缺失值处理按 PRD V0.5 提案演示，尚待业务评审；接口未联调。"><ElTag type="info" effect="plain">{{ view === 'summary' ? '分段规则待评审' : '来源字段待联调' }}</ElTag></ElTooltip></div>
      </div>
      <form class="filters" @submit.prevent="query" v-prototype="note('filters', '库龄条件查询', '公共多选及字段多行搜索：分类内 OR、条件间 AND；SKU 和批次默认精确，名称默认模糊。快照仍为中文单日日期，缺日不补；排序只调整主行，不改变来源批次、质量隔离及平铺导出。')">
        <div class="filter-main">
          <MultiFilter v-model="draft.providers" :options="providers.map(value => ({ value, label: value }))" placeholder="服务商" />
          <MultiFilter v-model="draft.accounts" :options="accounts.map(a => ({ value: a.id, label: a.label }))" placeholder="仓库账号" />
          <MultiFilter v-model="draft.warehouses" :options="warehouses.map(w => ({ value: w.id, label: w.label }))" placeholder="仓库" />
          <div class="filter date-filter" v-prototype="note('snapshot-date', '快照日期', '日期为实际调用海外仓接口当天，按 Asia/Shanghai 记录。查看历史和刷新列表不会改变日期，不是仓库返回的统计日期。', '字段', '已确认')"><span>快照日期</span><ElDatePicker v-model="draft.snapshotDate" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" :clearable="false" aria-label="快照日期" placeholder="最近有数据的日期" @change="autoDate = false" /><ElTooltip content="按当前查询范围选择最近有数据的日期"><ElButton link type="primary" @click="latest">最近快照</ElButton></ElTooltip></div>
        </div>
        <div class="search-row">
          <FieldSearch v-model="draft.keyword" v-model:field="draft.keywordType" v-model:mode="draft.searchMatch" :fields="searchFields" aria-prefix="库龄" @search="query" />
          <ElButton type="primary" native-type="submit" :icon="Search">查询</ElButton><ElButton @click="reset">重置</ElButton><ElButton text :icon="more ? ArrowUp : ArrowDown" @click="more = !more">{{ more ? '收起条件' : '更多条件' }}</ElButton>
          <ListSort v-model="sorting" :fields="sortFields" aria-prefix="库龄主行" @change="applySorting" />
        </div>
        <div v-if="more || view === 'detail'" class="more-filters">
          <MultiFilter v-if="more" v-model="draft.quality" :options="qualities.map(value => ({ value, label: value }))" placeholder="库存质量" />
          <template v-if="view === 'detail'"><FieldSearch v-model="draft.batchNo" v-model:field="batchField" v-model:mode="draft.batchMatch" :fields="batchFields" aria-prefix="库龄批次" @search="query" /><div class="age-range" v-prototype="note('age-filter', '库龄天数范围', '仅批次明细提供，按来源非负整数天筛选，包含上下界；空值、负数和小数天不因强制取整而命中。')"><span>库龄天数</span><ElInput v-model="draft.minAge" aria-label="最小库龄天数" placeholder="最小天数" clearable /><span>至</span><ElInput v-model="draft.maxAge" aria-label="最大库龄天数" placeholder="最大天数" clearable /><span>天</span></div></template>
        </div>
        <p v-if="queryError" class="query-error" role="alert">{{ queryError }}</p>
      </form>
      <div class="table-toolbar">
        <div class="result-info">共 <strong>{{ rows.length }}</strong> {{ view === 'summary' ? '组' : '个 SKU 组' }}<span v-if="view === 'detail'"> · {{ detailRows.length }} 条批次明细</span><span v-if="selection.length"> · 已选 {{ selection.length }} {{ view === 'summary' ? '组' : '个 SKU 组' }}</span><span class="snapshot-caption">快照日期 {{ applied.snapshotDate || '无可用快照' }}<ElTooltip content="接口实际查询日（UTC+8），各仓不代表同一统计时刻；历史值不随查看日期变化。"><ElIcon><QuestionFilled /></ElIcon></ElTooltip></span></div>
        <div class="toolbar-actions"><ElCheckbox v-if="view === 'detail'" v-model="extraColumns" aria-label="显示扩展列">扩展列</ElCheckbox><ElButton :icon="Refresh" :loading="refreshing" v-prototype="note('refresh', '刷新列表', '只重读已保存结果，不触发海外仓接口，不增加库龄天数，不改变快照日期或最近成功更新时间。', '交互', '已确认')" @click="refresh">刷新列表</ElButton><ElButton :icon="Download" :disabled="!rows.length" v-prototype="note('export', '导出库龄', '打开确认弹窗后固定本次数据，展示视图、日期、筛选范围与条数。明细视图勾选 SKU 主行时导出其下所有匹配批次明细，折叠状态不影响范围；文件仍按来源明细平铺。汇总视图按汇总行导出。')" @click="openExport">导出</ElButton></div>
      </div>
      <div class="aging-table" v-prototype="note('table', '库龄来源与展示分组', '批次明细按仓库 SKU 主行折叠展示来源批次，查询先筛选明细再组织主行，分页与勾选按主行。两视图按日期、组织、服务商、账号、仓库、来源客户、仓库 SKU、质量及单位隔离；明细主行不汇总数量或计算平均库龄。', '规则')">
        <ElTable :key="view" ref="table" :data="currentRows" row-key="id" :tree-props="{ children: 'treeChildren' }" :expand-row-keys="expandedKeys" height="100%" scrollbar-always-on @selection-change="selection = $event" @expand-change="changeExpansion">
          <AgingColumn type="selection" width="42" fixed />
          <AgingColumn v-if="view === 'detail'" type="expand" width="40" fixed>
            <template #default="{ row }">
              <div class="batch-panel" v-prototype="note('batch-expand', '展开 SKU 批次明细', '已确认按仓库 SKU 主行展开多条批次库存。本轮默认折叠，子表按有效来源库龄降序，空值与异常值末尾，分页或查询后收起为实现方案；同批次多条来源明细保持原值，不按批次号去重。', '交互', '合理假设')">
                <div class="batch-heading"><span>{{ row.warehouseSku }} · 批次明细</span><span>{{ group(row).detailCount }} 条</span></div>
                <ElTable :data="group(row).children" row-key="id" class="batch-table" size="small" :max-height="360">
                  <BatchColumn prop="batchNo" label="批次号" min-width="160"><template #default="{ row: batch }">{{ batch.batchNo || '—' }}</template></BatchColumn>
                  <BatchColumn label="入库委托单号" min-width="170"><template #header><span v-prototype="note('consignment-no', '入库委托单号', '保留来源 consignment_no。结合 4PX 入库委托接口同名字段，按仓库侧入库委托单号展示；与库龄记录的真实编号对应待联调，不等同 OMS 采购入库单号或客户参考号 ref_no。', '字段', '合理假设')">入库委托单号</span></template><template #default="{ row: batch }">{{ batch.consignmentNo || '—' }}</template></BatchColumn>
                  <BatchColumn v-for="column in quantityColumns" :key="column.key" :label="column.label" min-width="166" align="right"><template #header><span v-prototype="note(column.anchor, column.label, '已确认拆为良品与不良品两列。本轮按来源已明确的质量，将原在库数量展示在对应列，另一列为空；缺失或未知质量不猜分类、不补零、不从总数反算。真实仓库质量映射仍需联调核验。', '字段')">{{ column.label }}</span></template><template #default="{ row: batch }"><span class="quantity" :class="quantityClass(qualityQuantities(batch)[column.key])">{{ quantityText(qualityQuantities(batch)[column.key]) }}</span></template></BatchColumn>
                  <BatchColumn label="库龄天数 ↓" min-width="110" align="right"><template #header><span v-prototype="note('source-age', '库龄天数', '库龄直接取 inventory_age；不通过上架时间或快照日期相减。按天数降序，空值和异常值放末尾，保留负数或小数原值提示核查。', '字段', '已确认')">库龄天数 ↓</span></template><template #default="{ row: batch }"><span class="quantity" :class="{ invalid: badAge(batch), muted: batch.agingDays === null }">{{ raw(batch.agingDays) }}</span></template></BatchColumn>
                  <BatchColumn v-if="extraColumns" label="上架时间（UTC+8）" min-width="174"><template #default="{ row: batch }">{{ batch.putawayAt ? 时间文本(batch.putawayAt) : '—' }}</template></BatchColumn>
                  <BatchColumn v-if="extraColumns" label="失效日期" min-width="112"><template #default="{ row: batch }">{{ batch.expiryDate || '—' }}</template></BatchColumn>
                  <BatchColumn label="最近成功更新（UTC+8）" min-width="174"><template #default="{ row: batch }"><span class="time-cell">{{ 时间文本(batch.updatedAt) }}</span></template></BatchColumn>
                </ElTable>
              </div>
            </template>
          </AgingColumn>
          <AgingColumn label="商品信息" width="226" fixed><template #default="{ row }"><div class="product-name">{{ row.name || '商品资料未关联' }}</div><div class="sku-line"><span>系统</span>{{ row.systemSku || '—' }}<ElTag v-if="!row.systemSku" size="small" type="warning">未映射</ElTag></div><div class="sku-line"><span>仓库</span>{{ row.warehouseSku }}</div></template></AgingColumn>
          <AgingColumn label="仓库信息" width="200"><template #default="{ row }"><div class="warehouse-name">{{ row.warehouse }}</div><div class="secondary">{{ row.provider }} · {{ row.account }}</div><div class="secondary">客户 {{ row.sourceCustomer || '—' }}</div></template></AgingColumn>
          <AgingColumn prop="snapshotDate" label="快照日期" width="110" />
          <AgingColumn label="库存单位" width="108"><template #default="{ row }"><span :class="{ muted: !row.unit }">{{ row.unit || '单位未提供' }}</span></template></AgingColumn>
          <AgingColumn prop="quality" label="库存质量" width="88" />
          <template v-if="view === 'summary'">
            <AgingColumn v-for="band in agingBands" :key="band.key" :label="band.label" width="112" align="right"><template #header><span class="band-heading" v-prototype="note(`band.${band.key}`, `${band.label}数量`, '候选固定区间：仅按接口来源非负整数天归段并精确汇总同组数量；不重算库龄，不回写当前库存。具体区间待评审。', '字段', '待确认')">{{ band.label }}<small>数量</small></span></template><template #default="{ row }"><span class="quantity" :class="{ muted: summary(row).bands[band.key] == null }">{{ quantityText(summary(row).bands[band.key] ?? null) }}</span></template></AgingColumn>
            <AgingColumn label="库龄未提供数量" width="128" align="right"><template #header><span class="band-heading" v-prototype="note('unknown-age', '库龄未提供数量', '来源库龄为空且数量有效时归入此列；不会视为 0 天。非法天数单独提示异常，不混入本列。', '字段')">库龄未提供<small>数量</small></span></template><template #default="{ row }"><span class="quantity" :class="{ muted: summary(row).unknownQty == null }">{{ quantityText(summary(row).unknownQty) }}</span></template></AgingColumn>
          </template>
          <AgingColumn v-else label="批次明细" min-width="136"><template #default="{ row }"><ElButton link type="primary" :aria-label="`${expandedKeys.includes(row.id) ? '收起' : '展开'} ${row.warehouseSku} 批次明细`" :aria-expanded="expandedKeys.includes(row.id)" @click="toggleBatches(row)">{{ group(row).detailCount }} 条明细 <ElIcon class="batch-toggle"><ArrowUp v-if="expandedKeys.includes(row.id)" /><ArrowDown v-else /></ElIcon></ElButton></template></AgingColumn>
          <AgingColumn label="最近成功更新" width="164"><template #default="{ row }"><div class="time-cell">{{ 时间文本(row.updatedAt) }}</div><div class="secondary">UTC+8</div></template></AgingColumn>
          <template #empty><div class="empty-state">所选日期及条件下暂无快照记录<small>没有记录不代表库存为零，不会自动填入其他日期的数据。</small><ElButton text type="primary" @click="latest">查看当前范围最近快照</ElButton><ElButton text @click="reset">重置筛选</ElButton></div></template>
        </ElTable>
      </div>
      <footer class="aging-footer"><ElPagination v-model:current-page="page" v-model:page-size="pageSize" :total="rows.length" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" @current-change="clearSelection" @size-change="resizePage" /></footer>
      <ElDialog v-model="exportOpen" title="导出库龄" width="560px" append-to-body>
        <dl class="export-details"><dt>导出视图</dt><dd>{{ exportSnapshot.view === 'summary' ? '分段汇总' : '批次明细' }}</dd><dt>快照日期</dt><dd>{{ exportSnapshot.date }} <small>接口实际查询日 · UTC+8</small></dd><dt>筛选范围</dt><dd>{{ exportSnapshot.scope }}</dd></dl>
        <ElRadioGroup v-model="exportScope" class="export-options"><ElRadio value="all">当前筛选全部（{{ exportSnapshot.all.length }} 条{{ exportSnapshot.view === 'detail' ? '明细' : '汇总' }}）</ElRadio><ElRadio value="selected" :disabled="!exportSnapshot.selected.length">当前页勾选（<template v-if="exportSnapshot.view === 'detail'">{{ exportSnapshot.selectedGroups }} 个 SKU 组，</template>{{ exportSnapshot.selected.length }} 条{{ exportSnapshot.view === 'detail' ? '明细' : '汇总' }}）</ElRadio></ElRadioGroup>
        <p>共导出 <strong>{{ exportCount }}</strong> 条，格式为 XLSX。</p><p class="dialog-note">已固定本次结果。<template v-if="exportSnapshot.view === 'detail'">文件按匹配的批次明细逐行导出，折叠状态不影响范围。</template>文件包含快照日期、单位和更新时间，标记为虚构原型数据。</p>
        <template #footer><ElButton @click="exportOpen = false">取消</ElButton><ElButton type="primary" :loading="exporting" :disabled="!exportCount" @click="download">确认导出</ElButton></template>
      </ElDialog>
    </section>
  </ElConfigProvider>
</template>

<style scoped>
.aging-page { height:100%; min-height:590px; min-width:0; display:flex; flex-direction:column; font-size:13px; color:#303133; }
.view-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px 0; flex-wrap:wrap; }.review-note { display:flex; align-items:center; gap:10px; color:#9098a4; font-size:12px; }
.filters { margin:14px 20px 0; padding:14px 16px; background:#f8fafc; border:1px solid #eef1f5; border-radius:5px; }
.filter-main,.more-filters { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }.filter { display:flex; gap:8px; align-items:center; min-width:0; }.filter>span { min-width:56px; color:#606976; flex-shrink:0; }.filter .el-select,.filter .el-input { width:130px; flex:none; }.date-filter :deep(.el-date-editor) { width:150px; flex:none; }.date-filter .el-button { margin-left:0; }
.search-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; }.search-row .el-button+.el-button { margin-left:0; }.keyword-type { width:130px; flex:none; }.keyword-input { width:286px; flex:none; }.more-filters { margin-top:12px; padding-top:12px; border-top:1px dashed #dce2ea; }.age-range { display:flex; align-items:center; gap:10px; color:#606976; }.age-range .el-input { width:110px; }.query-error { color:#d94e45; margin:10px 0 0; }
.batch-panel { margin:0 14px 0 82px; padding:12px 14px 16px; background:#f8fafc; border:1px solid #e8edf3; border-radius:4px; }.batch-heading { display:flex; justify-content:space-between; gap:16px; margin-bottom:10px; font-size:12px; color:var(--yy-text-heading); }.batch-heading>span:last-child { color:#8b94a2; }.batch-toggle { margin-left:6px; }.aging-table :deep(.el-table__expanded-cell) { padding:8px 0 14px !important; background:#fff; }.aging-table :deep(.batch-table th.el-table__cell) { height:36px; background:#edf2f7; }.aging-table :deep(.batch-table td.el-table__cell) { padding:9px 0; }
.table-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:12px 20px; }.result-info { color:#7b8493; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }.result-info strong { color:#303b49; font-weight:600; }.snapshot-caption { display:inline-flex; align-items:center; gap:6px; margin-left:14px; color:#8b94a2; font-size:12px; }.toolbar-actions { display:flex; align-items:center; gap:8px; }.toolbar-actions .el-button+.el-button { margin-left:0; }.toolbar-actions .el-checkbox { margin-right:8px; }
.aging-table { flex:1; min-height:180px; margin:0 20px; min-width:0; }.aging-table :deep(.el-table th.el-table__cell) { background:#f5f7fa; color:var(--yy-text-heading); font-weight:500; height:48px; }.aging-table :deep(.el-table td.el-table__cell) { padding:10px 0; }.aging-table :deep(.el-table .cell) { padding:0 10px; }.aging-table :deep(.el-table__row:hover>td.el-table__cell) { background:#f7faff; }.product-name,.warehouse-name { font-weight:500; line-height:22px; color:var(--yy-text-heading); }.sku-line { font-size:12px; line-height:21px; white-space:nowrap; }.sku-line>span:first-child { color:#939aa5; margin-right:7px; }.sku-line .el-tag { margin-left:5px; }.secondary { color:#8b94a2; font-size:12px; line-height:21px; }.quantity { font-variant-numeric:tabular-nums; font-size:14px; font-weight:500; }.muted { color:#a3aab5; }.invalid { color:#d95145; }.band-heading { display:block; white-space:nowrap; font-size:12px; line-height:18px; }.band-heading small { display:block; color:var(--yy-text-heading); font-size:11px; font-weight:400; }.time-cell { font-size:12px; font-variant-numeric:tabular-nums; }.empty-state { padding:32px 12px; line-height:24px; }.empty-state small { display:block; color:#9199a4; }
.aging-footer { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:10px; padding:13px 20px; border-top:1px solid #eef1f5; }.export-details { display:grid; grid-template-columns:70px 1fr; gap:14px 12px; margin:0 0 20px; }.export-details dt { color:#7b8493; }.export-details dd { margin:0; overflow-wrap:anywhere; line-height:1.6; }.export-details small,.dialog-note { color:#9098a4; font-size:12px; }.export-options { display:flex; flex-direction:column; align-items:flex-start; }.dialog-note { line-height:1.8; }
@media (max-width:1300px) { .aging-footer { justify-content:flex-end; } }
@media (max-width:900px) { .view-bar,.table-toolbar { align-items:flex-start; }.keyword-input { width:240px; }.aging-page { min-height:660px; } }
</style>
