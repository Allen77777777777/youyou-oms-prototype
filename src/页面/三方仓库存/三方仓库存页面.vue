<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, Refresh, Download, ArrowDown, ArrowUp, QuestionFilled, Document } from '@element-plus/icons-vue'
import { ElButton, ElSelect, ElOption, ElInput, ElIcon, ElTable, ElTableColumn, ElPagination, ElDrawer, ElDialog, ElTooltip, ElTag, ElMessage, ElRadioGroup, ElRadio, ElDatePicker, ElAlert, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import type { 原型标注 } from '@/类型/标注'
import { 库存样例, 数量定义, 初始筛选, 校验筛选, 查询库存, 数据提示, 空值说明, 数量文本, 时间文本, type 库存记录, type 数量键 } from './库存模型'
import { 生成库存工作簿 } from './库存导出'

const InventoryColumn = ElTableColumn<库存记录>
const route = useRoute()
const 草稿 = reactive(初始筛选()), 已应用 = ref(初始筛选())
const 更多条件 = ref(false), 批量打开 = ref(false), 批量文本 = ref(''), 查询错误 = ref('')
const 页码 = ref(1), 页大小 = ref(50), 选择 = ref<库存记录[]>([]), 表格 = ref<{ clearSelection: () => void; clearSort: () => void }>()
const 详情 = ref<库存记录>(), 详情打开 = ref(false), 定义打开 = ref(false), 导出打开 = ref(false), 导出范围 = ref('all'), 导出中 = ref(false)
const 刷新中 = ref(false), 读取时间 = ref(new Date().toISOString())
const 排序 = ref<{ prop: string; order: string | null }>({ prop: '', order: null })
const 服务商选项 = [...new Set(库存样例.map(r => r.provider))]
const 账号选项 = computed(() => [...new Map(库存样例.filter(r => !草稿.providers.length || 草稿.providers.includes(r.provider)).map(r => [r.accountId, { id: r.accountId, label: `${r.provider} · ${r.account}` }])).values()])
const 仓库选项 = computed(() => [...new Map(库存样例.filter(r => (!草稿.providers.length || 草稿.providers.includes(r.provider)) && (!草稿.accounts.length || 草稿.accounts.includes(r.accountId))).map(r => [r.warehouseId, { id: r.warehouseId, label: r.warehouse }])).values()])
const 提示选项 = [...new Set(库存样例.flatMap(数据提示))]
watch(() => [...草稿.providers], () => { 草稿.accounts = 草稿.accounts.filter(id => 账号选项.value.some(a => a.id === id)); 草稿.warehouses = 草稿.warehouses.filter(id => 仓库选项.value.some(w => w.id === id)) })
watch(() => [...草稿.accounts], () => { 草稿.warehouses = 草稿.warehouses.filter(id => 仓库选项.value.some(w => w.id === id)) })
const 结果 = computed(() => {
  const rows = 查询库存(库存样例, 已应用.value)
  const key = 数量定义.find(d => d.key === 排序.value.prop)?.key
  if (key && 排序.value.order) return [...rows].sort((a, b) => { const x = a.quantities[key], y = b.quantities[key]; return x === null ? (y === null ? 0 : 1) : y === null ? -1 : (x - y) * (排序.value.order === 'ascending' ? 1 : -1) })
  return rows
})
const 当前页 = computed(() => 结果.value.slice((页码.value - 1) * 页大小.value, 页码.value * 页大小.value))
const 导出条数 = computed(() => 导出范围.value === 'all' ? 结果.value.length : 选择.value.length)
function 标注(id: string, 标题: string, 说明: string, 分类: 原型标注['分类'] = '交互'): 原型标注 {
  return { id: `oms.warehouse-inventory.${id}`, 标题, 说明, 分类, 路由: '/oms/warehouse-delivery/inventory', 锚点: `oms.warehouse-inventory.${id}`, 版本: '2026-09-23', 状态: '待评审', 事实等级: id === 'source' ? '已确认' : '合理假设',
    prd引用: ['PRD/三方仓库存功能PRD.md#4-页面与交互', 'PRD/三方仓库存功能PRD.md#52-库存业务字段'],
    前置条件: ['页面使用 62 条虚构库存记录，尚未连接中台或海外仓。'], 触发方式: [标题], 系统动作: [说明], 成功结果: ['按来源记录展示，不合并多个 SKU，不在 OMS 加减库存。'],
    异常处理: ['真实零与未取得、未提供分别展示；来源失败保留原数量和时间。'], 数据来源: ['本地虚构数据；正式来源为既有中台承接的三方仓库存。'], 权限与审计: ['原型未实现服务端权限或审计，生产版须按组织、账号与仓库控制。'], 验收要点: ['标注开关不阻断查询、详情或导出；所有中文数量字段无三方仓前缀。'] }
}
function 清空选择() { 表格.value?.clearSelection(); 选择.value = [] }
function 查询() { 查询错误.value = 校验筛选(草稿); if (查询错误.value) return; 已应用.value = structuredClone({ ...草稿, providers: [...草稿.providers], accounts: [...草稿.accounts], warehouses: [...草稿.warehouses], dates: [...草稿.dates] }); 页码.value = 1; 清空选择() }
function 重置() { Object.assign(草稿, 初始筛选()); 查询(); 排序.value = { prop: '', order: null }; 表格.value?.clearSort() }
function 翻页() { 清空选择() }
function 改页大小() { 页码.value = 1; 清空选择() }
function 改排序(v: { prop: string | null; order: string | null }) { 排序.value = { prop: v.prop || '', order: v.order }; 页码.value = 1; 清空选择() }
function 查看(r: 库存记录) { 详情.value = r; 详情打开.value = true }
async function 刷新() { if (刷新中.value) return; 刷新中.value = true; await new Promise(resolve => setTimeout(resolve, 250)); 读取时间.value = new Date().toISOString(); 刷新中.value = false; ElMessage.success('已刷新列表，来源数据时间保持不变') }
function 打开批量() { 批量文本.value = 草稿.keyword; 批量打开.value = true }
function 应用批量() { const f = { ...草稿, keyword: 批量文本.value }; const error = 校验筛选(f); if (error) return void ElMessage.error(error); 草稿.keyword = [...new Set(批量文本.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean))].join('\n'); 批量打开.value = false; 查询() }
function 打开导出() { 导出范围.value = 选择.value.length ? 'selected' : 'all'; 导出打开.value = true }
async function 导出() {
  if (!导出条数.value || 导出中.value) return
  导出中.value = true
  try { const bytes = 生成库存工作簿(导出范围.value === 'all' ? 结果.value : 选择.value, new Date().toISOString()); const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); const a = document.createElement('a'); a.href = url; a.download = `三方仓库存_演示_${Date.now()}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); 导出打开.value = false; ElMessage.success(`已生成 ${导出条数.value} 条库存记录的文件`) } catch { ElMessage.error('导出失败，请重试。库存数据未改变。') } finally { 导出中.value = false }
}
function 说明(r: 库存记录, key: 数量键): string { return r.quantities[key] === null ? 空值说明(r, key) : r.quantities[key]! < 0 ? '来源返回负数，需核查；未截为零。' : '直接展示来源数量' }
watch(() => route.query, q => {
  if (typeof q.sku === 'string' || typeof q.warehouseId === 'string' || typeof q.accountId === 'string') {
    Object.assign(草稿, 初始筛选()); 草稿.keyword = typeof q.sku === 'string' ? q.sku : ''; 草稿.warehouses = typeof q.warehouseId === 'string' ? [q.warehouseId] : []; 草稿.accounts = typeof q.accountId === 'string' ? [q.accountId] : []; 查询()
  }
}, { immediate: true })
</script>

<template>
  <section class="inventory-page" v-prototype="标注('source', '库存来源与页面范围', '只做一套三方仓来源库存；列表展示全部八项数量，不设置共享库存分类。', '页面')">
    <form class="filters" @submit.prevent="查询" v-prototype="标注('filters', '库存条件查询', '服务商、账号、仓库逐级联动，SKU 精确匹配；组合筛选作用于完整结果，查询回到第 1 页。')">
      <div class="filter-main">
        <label class="filter"><span>服务商</span><ElSelect v-model="草稿.providers" aria-label="服务商" multiple collapse-tags clearable placeholder="全部服务商"><ElOption v-for="p in 服务商选项" :key="p" :label="p" :value="p" /></ElSelect></label>
        <label class="filter"><span>仓库账号</span><ElSelect v-model="草稿.accounts" aria-label="仓库账号" multiple collapse-tags clearable placeholder="全部账号"><ElOption v-for="a in 账号选项" :key="a.id" :label="a.label" :value="a.id" /></ElSelect></label>
        <label class="filter"><span>仓库</span><ElSelect v-model="草稿.warehouses" aria-label="仓库" multiple collapse-tags clearable placeholder="全部仓库"><ElOption v-for="w in 仓库选项" :key="w.id" :label="w.label" :value="w.id" /></ElSelect></label>
      </div>
      <div class="search-row">
        <ElSelect v-model="草稿.keywordType" aria-label="关键词类型" class="keyword-type"><ElOption label="系统 SKU" value="systemSku" /><ElOption label="仓库 SKU" value="warehouseSku" /><ElOption label="商品名称" value="name" /></ElSelect>
        <ElInput v-model="草稿.keyword" aria-label="库存关键词" :placeholder="草稿.keywordType === 'name' ? '输入商品名称，支持包含查询' : '输入 SKU，精确查询'" clearable class="keyword-input" />
        <ElButton v-if="草稿.keywordType !== 'name'" text @click="打开批量">批量输入</ElButton>
        <ElButton type="primary" :icon="Search" native-type="submit">查询</ElButton><ElButton @click="重置">重置</ElButton>
        <ElButton text :icon="更多条件 ? ArrowUp : ArrowDown" @click="更多条件 = !更多条件">{{ 更多条件 ? '收起条件' : '更多条件' }}</ElButton>
      </div>
      <div v-if="更多条件" class="more-filters">
        <label class="filter"><span>国家 / 地区</span><ElSelect v-model="草稿.country" clearable aria-label="仓库国家" placeholder="全部国家"><ElOption v-for="c in ['美国', '英国', '德国', '加拿大']" :key="c" :value="c" /></ElSelect></label>
        <label class="filter"><span>映射情况</span><ElSelect v-model="草稿.mapping" clearable aria-label="映射情况" placeholder="全部"><ElOption v-for="m in ['已映射', '未映射', '映射冲突']" :key="m" :value="m" /></ElSelect></label>
        <label class="filter"><span>数据提示</span><ElSelect v-model="草稿.issue" clearable aria-label="数据提示" placeholder="全部"><ElOption v-for="i in 提示选项" :key="i" :value="i" /></ElSelect></label>
        <label class="filter date-filter"><span>最近成功更新</span><ElDatePicker v-model="草稿.dates" @update:model-value="草稿.dates = $event || []" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" /></label>
        <div class="quantity-filter"><span>数量条件</span><ElSelect v-model="草稿.metric" aria-label="数量指标"><ElOption v-for="d in 数量定义" :key="d.key" :label="d.label" :value="d.key" /></ElSelect><ElSelect v-model="草稿.operator" aria-label="数量运算符" clearable placeholder="不限"><ElOption label="等于" value="eq" /><ElOption label="大于" value="gt" /><ElOption label="小于" value="lt" /><ElOption label="区间" value="range" /></ElSelect><ElInput v-model="草稿.minimum" aria-label="数量条件值" placeholder="数值" :disabled="!草稿.operator" /><template v-if="草稿.operator === 'range'"><span>至</span><ElInput v-model="草稿.maximum" aria-label="数量结束值" placeholder="结束值" /></template></div>
      </div>
      <p v-if="查询错误" class="query-error" role="alert">{{ 查询错误 }}</p>
    </form>
    <div class="table-toolbar">
      <div class="record-count">共 <strong>{{ 结果.length }}</strong> 条库存记录<span v-if="选择.length"> · 已选 {{ 选择.length }} 条</span></div>
      <div class="toolbar-actions"><span class="read-time">读取时间 {{ 时间文本(读取时间) }} · UTC+8</span><ElButton :icon="Refresh" :loading="刷新中" v-prototype="标注('refresh', '刷新列表', '只更新页面读取时间；来源库存与最近成功更新时间不变，不触发海外仓同步。')" @click="刷新">刷新列表</ElButton><ElButton :icon="Download" :disabled="!结果.length" v-prototype="标注('export', '导出库存', '选择当前筛选全部或当前页勾选，输出 XLSX；空值留空、SKU 为文本，来源数量与单位不加工。')" @click="打开导出">导出</ElButton></div>
    </div>
    <div class="inventory-table" v-prototype="标注('table', '库存来源记录', '一行对应账号、仓库及仓库 SKU 下的原库存。多个仓库 SKU 不汇总；真实零显示 0，未提供显示破折号。', '规则')">
      <ElTable ref="表格" :data="当前页" row-key="id" height="100%" scrollbar-always-on @selection-change="选择 = $event" @sort-change="改排序">
        <InventoryColumn type="selection" width="42" fixed />
        <InventoryColumn label="商品信息" min-width="202" fixed><template #default="{ row }"><div class="product-name">{{ row.name || '商品资料未关联' }}</div><div class="sku-line"><span>系统</span> {{ row.systemSku || '—' }}<ElTag v-if="row.mapping !== '已映射'" size="small" type="warning">{{ row.mapping }}</ElTag></div><div class="sku-line"><span>仓库</span> {{ row.warehouseSku }}</div></template></InventoryColumn>
        <InventoryColumn label="仓库信息" min-width="188"><template #default="{ row }"><div class="warehouse-name">{{ row.warehouse }}</div><div class="secondary">{{ row.provider }} · {{ row.account }}</div><div class="secondary">{{ row.country }}<span v-if="!row.enabled" class="disabled-text"> · 已停用</span></div></template></InventoryColumn>
        <InventoryColumn prop="unit" label="库存单位" width="82" />
        <InventoryColumn v-for="d in 数量定义" :key="d.key" :prop="d.key" :label="d.label" width="132" align="right" sortable="custom">
          <template #header><span class="quantity-heading" v-prototype="标注(`quantity.${d.key}`, d.label, d.definition, '字段')">{{ d.label }}<ElTooltip :content="d.definition" placement="top" :show-after="250"><ElIcon class="help-icon"><QuestionFilled /></ElIcon></ElTooltip></span></template>
          <template #default="{ row }"><ElTooltip :content="说明(row, d.key)" :disabled="row.quantities[d.key] !== null && (row.quantities[d.key] ?? 0) >= 0"><span class="quantity" :class="{ 'quantity-null': row.quantities[d.key] === null, 'quantity-negative': (row.quantities[d.key] ?? 0) < 0, 'quantity-zero': row.quantities[d.key] === 0 }">{{ 数量文本(row, d.key) }}</span></ElTooltip></template>
        </InventoryColumn>
        <InventoryColumn label="最近成功更新" width="162"><template #default="{ row }"><div class="time-cell">{{ 时间文本(row.updatedAt) }}</div><div class="secondary">UTC+8</div></template></InventoryColumn>
        <InventoryColumn label="操作" width="78" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="查看(row)">详情</ElButton></template></InventoryColumn>
        <template #empty><div class="empty-state">暂无匹配的库存记录<small>请调整筛选条件；没有记录不代表库存为零。</small><ElButton text type="primary" @click="重置">重置筛选</ElButton></div></template>
      </ElTable>
    </div>
    <footer class="inventory-footer"><ElConfigProvider :locale="zhCn"><ElPagination v-model:current-page="页码" v-model:page-size="页大小" :total="结果.length" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" @current-change="翻页" @size-change="改页大小" /></ElConfigProvider></footer>

    <ElDrawer v-model="详情打开" title="库存详情" size="min(900px, calc(100vw - 80px))" append-to-body destroy-on-close>
      <div v-if="详情" class="detail-body" v-prototype="标注('detail', '库存详情与来源时间', '库存只读；逐项展示字段定义、原数量、单位、缺失原因，分别展示来源时间、最近成功更新和读取时间。')">
        <div class="detail-title"><div><h2>{{ 详情.name || '商品资料未关联' }}</h2><span>{{ 详情.systemSku || '系统 SKU 未关联' }}</span></div><ElTag :type="详情.mapping === '已映射' ? 'info' : 'warning'">{{ 详情.mapping }}</ElTag></div>
        <ElAlert v-if="详情.issues.length" :title="详情.issues.join('；')" type="warning" :closable="false" show-icon description="请核对来源、映射或更新时间，由对应责任人处理。本页保留来源数量。" />
        <section class="detail-section"><h3>商品与仓库</h3><dl class="detail-grid"><dt>仓库 SKU</dt><dd>{{ 详情.warehouseSku }}</dd><dt>商品规格</dt><dd>{{ 详情.specification || '—' }}</dd><dt>服务商</dt><dd>{{ 详情.provider }}</dd><dt>仓库账号</dt><dd>{{ 详情.account }}</dd><dt>仓库</dt><dd>{{ 详情.warehouse }}</dd><dt>国家 / 地区</dt><dd>{{ 详情.country }}</dd><dt>资料状态</dt><dd>{{ 详情.enabled ? '启用' : '停用' }}</dd></dl></section>
        <section class="detail-section"><div class="section-heading"><h3>库存数量</h3><span>库存单位：{{ 详情.unit || '未确认' }}</span></div><div class="quantity-grid"><div v-for="d in 数量定义" :key="d.key" class="quantity-card" v-prototype="标注(`detail.quantity.${d.key}`, d.label, d.definition, '字段')"><ElTooltip :content="d.definition" placement="top"><div class="card-label">{{ d.label }} <ElIcon><QuestionFilled /></ElIcon></div></ElTooltip><strong :class="{ 'quantity-negative': (详情.quantities[d.key] ?? 0) < 0 }">{{ 数量文本(详情, d.key) }}</strong><small v-if="详情.quantities[d.key] === null">{{ 空值说明(详情, d.key) }}</small><small v-else-if="详情.quantities[d.key]! < 0">数量异常</small></div></div><p class="detail-note">各指标可能存在包含或重叠关系，按来源分别展示，不相加或倒推缺失字段。</p></section>
        <section class="detail-section"><h3>数据时间与来源</h3><dl class="time-grid"><dt>来源数据时间</dt><dd>{{ 时间文本(详情.sourceAt) }}</dd><dt>最近成功更新时间</dt><dd>{{ 时间文本(详情.updatedAt) }}</dd><dt>最近更新尝试</dt><dd>{{ 时间文本(详情.lastAttempt) }} · {{ 详情.attemptResult }}</dd><dt>本次记录覆盖</dt><dd>{{ 详情.presence }}</dd><dt>页面读取时间</dt><dd>{{ 时间文本(读取时间) }}</dd></dl><p class="detail-note">时间统一展示为 UTC+8。原型使用固定虚构时点，未设定生产时效阈值。</p></section>
      </div>
      <template #footer><ElButton :icon="Document" @click="定义打开 = true">字段说明</ElButton><ElButton @click="详情打开 = false">关闭</ElButton></template>
    </ElDrawer>
    <ElDrawer v-model="定义打开" title="库存字段说明" size="min(760px, calc(100vw - 80px))" append-to-body><div class="definitions"><p class="definition-intro">库存数量直接取三方仓来源数据。以下为业务字段定义，各仓实际口径待核验。</p><section><h3>库存单位</h3><p>数量使用的计量单位，如件、箱。保留来源单位，不自行换算。</p></section><section v-for="d in 数量定义" :key="d.key"><h3>{{ d.label }}</h3><p>{{ d.definition }}</p></section><ElAlert title="字段不是互斥分类" description="在库描述存量，可用和占用描述分配，次品描述质量，冻结描述管控，待上架描述作业阶段；不能相加推算库存。" :closable="false" type="info" /></div></ElDrawer>
    <ElDialog v-model="批量打开" title="批量输入 SKU" width="520px" append-to-body><p class="dialog-note">每行一个，最多 200 个；自动去重，按当前 SKU 类型精确查询。</p><ElInput v-model="批量文本" type="textarea" :rows="9" aria-label="批量 SKU" placeholder="DEMO-BRK-001&#10;DEMO-FLT-002" /><template #footer><ElButton @click="批量打开 = false">取消</ElButton><ElButton type="primary" @click="应用批量">应用并查询</ElButton></template></ElDialog>
    <ElDialog v-model="导出打开" title="导出库存" width="500px" append-to-body><div class="export-body"><ElRadioGroup v-model="导出范围"><ElRadio value="all">当前筛选全部（{{ 结果.length }} 条）</ElRadio><ElRadio value="selected" :disabled="!选择.length">当前页勾选（{{ 选择.length }} 条）</ElRadio></ElRadioGroup><p>导出 <strong>{{ 导出条数 }}</strong> 条原始粒度记录，格式为 XLSX。</p><p class="dialog-note">包含全部数量字段、单位、空值说明与数据时间。文件标记为虚构原型数据；不生成库存合计。</p></div><template #footer><ElButton @click="导出打开 = false">取消</ElButton><ElButton type="primary" :disabled="!导出条数" :loading="导出中" @click="导出">确认导出</ElButton></template></ElDialog>
  </section>
</template>

<style scoped>
.inventory-page { height:100%; min-height:560px; display:flex; flex-direction:column; min-width:0; color:#303133; font-size:13px; }
.filters { margin:16px 20px 0; padding:14px 16px; background:#f8fafc; border:1px solid #eef1f5; border-radius:5px; }
.filter-main { display:flex; flex-wrap:wrap; gap:12px 24px; }
.filter { display:flex; align-items:center; gap:10px; min-width:0; }.filter>span { flex-shrink:0; color:#606976; min-width:64px; }.filter .el-select { flex:none; width:200px; min-width:0; }
.search-row { display:flex; align-items:center; margin-top:12px; gap:8px; flex-wrap:wrap; }.search-row .el-button+.el-button { margin-left:0; }
.keyword-type { width:132px; }.keyword-input { width:300px; flex:none; }
.more-filters { display:flex; flex-wrap:wrap; gap:14px 24px; margin-top:14px; padding-top:14px; border-top:1px dashed #dce2ea; }
.date-filter { width:552px; }.date-filter :deep(.el-date-editor) { flex:1; min-width:0; width:auto; }.quantity-filter { width:100%; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }.quantity-filter>.el-select { width:130px; }.quantity-filter>.el-input { width:125px; }
.query-error { color:#d94e45; margin:10px 0 0; }.table-toolbar { padding:13px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; }.record-count { white-space:nowrap; color:#7b8493; }.record-count strong { color:#303b49; font-weight:600; }.toolbar-actions { display:flex; gap:8px; align-items:center; }.toolbar-actions .el-button+.el-button { margin-left:0; }.read-time { color:#929aa5; font-size:12px; margin-right:8px; }
.inventory-table { flex:1; min-height:180px; margin:0 20px; min-width:0; }.inventory-table :deep(.el-table th.el-table__cell) { background:#f5f7fa; color:var(--yy-text-heading); font-weight:500; height:42px; }.inventory-table :deep(.el-table td.el-table__cell) { padding:11px 0; }.inventory-table :deep(.el-table .cell) { padding:0 10px; }.inventory-table :deep(.el-table__row:hover>td.el-table__cell) { background:#f7faff; }
.product-name,.warehouse-name { font-weight:500; line-height:22px; color:#303a49; }.sku-line { font-size:12px; line-height:21px; white-space:nowrap; }.sku-line>span:first-child { color:#939aa5; margin-right:5px; }.sku-line .el-tag { margin-left:5px; }.secondary { color:#8b94a2; font-size:12px; line-height:21px; }.disabled-text { color:#bd7b20; }.quantity-heading { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; font-size:12px; }.help-icon { color:#a4acb9; font-size:12px; }.quantity { font-variant-numeric:tabular-nums; font-weight:500; font-size:14px; }.quantity-null { color:#afb6c0; }.quantity-zero { color:#9098a4; }.quantity-negative { color:#da4e43!important; }.time-cell { font-size:12px; font-variant-numeric:tabular-nums; }.inventory-footer { display:flex; align-items:center; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid #eef1f5; }.empty-state { padding:35px; color:#7d8795; }.empty-state small { display:block; margin:7px; }
.detail-body { font-size:13px; }.detail-title { display:flex; align-items:center; justify-content:space-between; padding-bottom:22px; }.detail-title h2 { margin:0 0 7px; font-size:19px; color:var(--yy-text-heading); }.detail-title span { color:#7b8493; }.detail-section { margin-top:24px; }.detail-section h3,.definitions h3 { font-size:14px; color:var(--yy-text-heading); margin:0 0 16px; }.detail-grid { display:grid; grid-template-columns:90px 1fr 90px 1fr; gap:16px 10px; background:#f8fafc; padding:18px; border-radius:5px; }.detail-grid dt,.time-grid dt { color:#7b8493; }.detail-grid dd,.time-grid dd { margin:0; overflow-wrap:anywhere; }.section-heading { display:flex; justify-content:space-between; align-items:baseline; }.section-heading>span { color:#7b8493; }.quantity-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }.quantity-card { border:1px solid #e9edf2; border-radius:5px; padding:16px; min-height:103px; }.card-label { display:flex; align-items:center; gap:6px; color:#657080; }.card-label .el-icon { color:#a2aab5; }.quantity-card strong { display:block; font-size:25px; margin-top:12px; color:#303b49; font-weight:500; }.quantity-card small { display:block; color:#a0a6b0; margin-top:4px; }.detail-note,.dialog-note { font-size:12px; color:#8a939f; line-height:1.8; }.time-grid { display:grid; grid-template-columns:150px 1fr; gap:14px; padding:16px 0; border-top:1px solid #edf0f4; }.definitions section { padding:16px 0; border-bottom:1px solid #eef1f5; }.definitions h3 { margin-bottom:8px; }.definitions p { line-height:1.8; color:#657080; margin:0; }.definition-intro { background:#f6f8fb; padding:14px; }.definitions .el-alert { margin-top:20px; }.export-body .el-radio-group { display:flex; flex-direction:column; align-items:flex-start; }.export-body { line-height:1.8; }
@media (max-width:1300px) { .read-time { display:none; }.filter-main,.more-filters { gap:12px 20px; } }
@media (max-width:1000px) { .date-filter { max-width:100%; }.quantity-filter { flex-wrap:wrap; }.quantity-grid { grid-template-columns:repeat(2,1fr); } }
</style>
