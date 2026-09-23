<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Refresh, ArrowRight, Document, CircleCheck, Warning } from '@element-plus/icons-vue'
import { ElButton, ElInput, ElSelect, ElOption, ElIcon, ElTag, ElTable, ElTableColumn, ElDrawer, ElDescriptions, ElDescriptionsItem, ElAlert, ElEmpty, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem, ElPagination } from 'element-plus'
import { 共享订单 } from '../订单处理/演示会话'
import { 标发阻断原因, 标发状态列表, type 标发单, type 标发状态 } from './标发逻辑'
import { 共享标发单 } from './演示会话'
import type { 原型标注 } from '@/类型/标注'

const router = useRouter()
const route = useRoute()
const 单据 = 共享标发单
const 当前状态 = ref<标发状态 | '全部'>('全部')
const 关键词 = ref(''); const 已查关键词 = ref(''); const 平台 = ref(''); const 已查平台 = ref(''); const 仅待核查 = ref(false)
const 选中 = ref<标发单[]>([]); const 详情 = ref<标发单>(); const 抽屉 = ref(false); const 正在执行 = ref(false)
const 批量结果 = ref<{ total: number; success: number; failed: number; skipped: number; details: string[] }>()
const 页码 = ref(1); const 每页 = 10
const 表格 = ref<{ clearSelection: () => void }>()
function 清除勾选() { 选中.value = []; 表格.value?.clearSelection() }
const 来源 = (单: 标发单) => 共享订单.value.find((订单) => 订单.systemOrderNo === 单.orderNo)
const 阻断 = (单: 标发单) => 标发阻断原因(单, 来源(单))
const 结果 = computed(() => 单据.value.filter((单) => (当前状态.value === '全部' || 单.status === 当前状态.value)
  && (!仅待核查.value || 单.pendingVerification) && (!已查平台.value || 来源(单)?.platformCode === 已查平台.value)
  && [单.no, 单.orderNo, 单.fulfillmentNo, 单.tracking, 来源(单)?.platformOrderNo].join(' ').toLowerCase().includes(已查关键词.value.toLowerCase())))
const 页数据 = computed(() => 结果.value.slice((页码.value - 1) * 每页, 页码.value * 每页))
const 色 = (状态: 标发状态) => 状态 === '标发成功' ? 'success' : 状态 === '标发失败' ? 'danger' : 状态 === '无需标发' ? 'info' : 'warning'
function 标注(id: string, 标题: string, 分类: 原型标注['分类'], 说明: string, 规则: string[], 等级: 原型标注['事实等级'] = '已确认'): 原型标注 {
  return { id: `oms.confirmation.${id}`, 标题, 说明, ...{ 分类 }, 事实等级: 等级, 状态: '待评审', 版本: '0.3.0', 路由: '/oms/self-fulfillment/shipping-confirmation', 锚点: `oms.confirmation.${id}`, prd引用: ['PRD/订单标发功能PRD.md#6-功能与操作定义'], 触发方式: ['点击页面对应入口。'], 系统动作: 规则, 成功结果: ['更新标发对象及本地接口尝试，保留订单的有效出库事实。'], 异常处理: ['外部结果无法确认时记为标发失败并标记待核查；核查完成前禁止重提。'], 验收要点: 规则 }
}
function 查询() { 已查关键词.value = 关键词.value.trim(); 已查平台.value = 平台.value; 页码.value = 1; 清除勾选() }
function 切状态(状态: 标发状态 | '全部') { 当前状态.value = 状态; 页码.value = 1; 清除勾选() }
function 重置() { 关键词.value = ''; 已查关键词.value = ''; 平台.value = ''; 已查平台.value = ''; 仅待核查.value = false; 切状态('全部') }
watch(() => [route.path, route.query.fulfillmentOrderNo, route.query.systemOrderNo], ([路径, 履约号, 订单号]) => {
  if (路径 !== '/oms/self-fulfillment/shipping-confirmation') return
  const 编号 = typeof 履约号 === 'string' ? 履约号 : typeof 订单号 === 'string' ? 订单号 : ''
  if (!编号) return
  重置(); 关键词.value = 编号; 查询()
}, { immediate: true })
function 查看(单: 标发单) { 详情.value = 单; 抽屉.value = true }
function 记尝试(单: 标发单, action: string, result: string, evidence: string) { 单.attempts.unshift({ time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8', action, result, evidence }) }
async function 提交(列表: 标发单[]) {
  const 可执行 = 列表.filter((单) => 阻断(单).length === 0)
  if (!可执行.length) { ElMessage.warning('没有符合提交条件的标发单，请打开详情查看阻断原因'); return }
  try { await ElMessageBox.confirm(`选中 ${列表.length} 张标发单，其中 ${可执行.length} 张可提交，${列表.length - 可执行.length} 张将跳过。确认提交可执行单据？`, '确认标发范围', { confirmButtonText: '确认提交', cancelButtonText: '返回检查', type: 'warning' }) } catch { return }
  正在执行.value = true
  let success = 0; let skipped = 0; const details: string[] = []
  for (const 单 of 列表) {
    const 原因 = 阻断(单)
    if (原因.length) { skipped++; details.push(`${单.no}：${原因.join('；')}`); continue }
    单.status = '标发中'; 记尝试(单, '标发提交', '处理中', `复用幂等键 ${单.idempotencyKey}；提交前重新校验来源与门禁`)
    await new Promise((完成) => setTimeout(完成, 320))
    单.status = '标发成功'; 单.reason = ''; 单.externalId = `DEMO-FULFILLMENT-${单.no}`; success++
    记尝试(单, '模拟平台响应', '标发成功', `模拟 201 + 可解析 Location；${单.externalId}`)
  }
  批量结果.value = { total: 列表.length, success, failed: 0, skipped, details }
  正在执行.value = false; 清除勾选(); ElMessage.success(`标发完成：成功 ${success}，跳过 ${skipped}`)
}
async function 核查(单: 标发单) {
  if (!单.pendingVerification && 单.status !== '标发中') return
  正在执行.value = true
  await new Promise((完成) => setTimeout(完成, 350))
  单.status = '标发成功'; 单.pendingVerification = false; 单.reason = ''; 单.externalId = `DEMO-VERIFIED-${单.no}`
  记尝试(单, '查询平台结果（模拟）', '核查确认成功', '模拟响应中的来源订单行、数量、承运商、跟踪号与本次载荷完全一致；认领原单，未重复创建')
  正在执行.value = false; ElMessage.success('模拟查询已确认平台成功，原标发单补记成功')
}
</script>

<template>
  <main class="标发页面">
    <header class="页首" v-prototype="标注('overview', '订单标发工作台', '页面', '以平台标发单为粒度核对发货回传，五态与订单处理、仓库出库独立。', ['一张标发单对应一个来源订单及其本次履约依据。', '无需标发必须展示豁免原因，不能伪装为成功。'])">
      <div><h1>订单标发 <span>平台发货回传</span></h1><p>核对实际出库依据，追踪平台接收结果</p></div><ElTag effect="plain" type="info">本地演示 · 未连接平台</ElTag>
    </header>
    <div class="概览卡">
      <button @click="切状态('待标发')"><ElIcon class="蓝"><Document /></ElIcon><div><span>待回传</span><strong>{{ 单据.filter(单 => 单.status === '待标发').length }}</strong></div></button>
      <button @click="切状态('标发失败')"><ElIcon class="红"><Warning /></ElIcon><div><span>标发失败</span><strong>{{ 单据.filter(单 => 单.status === '标发失败').length }}</strong></div></button>
      <button @click="仅待核查 = !仅待核查; 切状态('全部')"><ElIcon class="橙"><Search /></ElIcon><div><span>平台结果待核查</span><strong>{{ 单据.filter(单 => 单.pendingVerification).length }}</strong></div><ElTag v-if="仅待核查" size="small" type="warning">筛选中</ElTag></button>
      <button @click="切状态('标发成功')"><ElIcon class="绿"><CircleCheck /></ElIcon><div><span>标发成功</span><strong>{{ 单据.filter(单 => 单.status === '标发成功').length }}</strong></div></button>
    </div>
    <section class="工作区">
      <nav class="状态栏" v-prototype="标注('states', '标发五态', '规则', '状态数量只统计平台标发单，不汇总成订单数。', ['待标发、标发中、标发成功、标发失败、无需标发。', '待核查是失败原因分类，不增加第六种业务状态。'])">
        <button v-for="状态 in ['全部', ...标发状态列表] as const" :key="状态" :class="{ active: 当前状态 === 状态 }" @click="切状态(状态)">{{ 状态 }} <b>{{ 状态 === '全部' ? 单据.length : 单据.filter(单 => 单.status === 状态).length }}</b></button>
      </nav>
      <div class="搜索栏"><ElInput v-model="关键词" placeholder="标发单号 / 系统订单号 / 履约单号 / 跟踪号" clearable @keyup.enter="查询" :prefix-icon="Search" /><ElSelect v-model="平台" placeholder="全部平台" clearable><ElOption label="eBay" value="eBay" /></ElSelect><ElButton type="primary" @click="查询">查询</ElButton><ElButton @click="重置">重置</ElButton></div>
      <div class="操作栏" v-prototype="标注('submit', '提交与重试资格', '交互', '提交前检查发货依据、平台门禁、行数量与幂等约束；批量提交逐张重新校验。', ['选中后展示总数、可执行和跳过数量，经二次确认后提交。', '标发失败且待核查不得重试；核查确认成功直接补记成功。', '重试复用原标发单与幂等键，只增加接口尝试。'])"><span>已选 <b>{{ 选中.length }}</b> 张标发单</span><ElButton type="primary" :disabled="!选中.length || 正在执行" @click="提交(选中)">批量提交标发</ElButton><span class="辅助">提交前逐单校验 · 待核查单据自动跳过</span></div>
      <ElAlert v-if="批量结果" :title="`最近批次：共 ${批量结果.total} 张，成功 ${批量结果.success}，失败 ${批量结果.failed}，跳过 ${批量结果.skipped}，处理中 0`" :description="批量结果.details.join('；')" type="info" show-icon @close="批量结果 = undefined" />
      <ElTable ref="表格" :data="页数据" row-key="no" @selection-change="选中 = $event" @row-dblclick="查看">
        <ElTableColumn type="selection" width="44" />
        <ElTableColumn label="标发单 / 来源订单" min-width="240"><template #default="{ row }"><ElButton class="单号" link type="primary" @click="查看(row as 标发单)">{{ row.no }}</ElButton><small>{{ row.orderNo }}</small></template></ElTableColumn>
        <ElTableColumn label="平台 / 店铺" min-width="170"><template #default="{ row }"><strong>{{ 来源(row as 标发单)?.platformCode || '—' }}</strong><small>{{ 来源(row as 标发单)?.storeName || '来源待核查' }}</small></template></ElTableColumn>
        <ElTableColumn label="标发状态" min-width="165"><template #default="{ row }"><ElTag :type="色(row.status)" effect="light">{{ row.status }}</ElTag><small :class="{ 警示: row.pendingVerification }">{{ row.pendingVerification ? '平台结果待核查 · 禁止重提' : row.status === '无需标发' ? '演示豁免 · 场景待评审' : row.reason || '—' }}</small></template></ElTableColumn>
        <ElTableColumn label="物流与发货依据" min-width="225"><template #default="{ row }"><span>{{ row.carrier }} · {{ row.tracking || '跟踪号缺失' }}</span><small>{{ row.fulfillmentNo }} · {{ row.quantity }} 件</small></template></ElTableColumn>
        <ElTableColumn label="实际发货时间" min-width="180"><template #default="{ row }"><span>{{ row.shippedAt || '—' }}</span><small>来源：仓库有效出库事实</small></template></ElTableColumn>
        <ElTableColumn label="操作" width="155" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="查看(row as 标发单)">详情</ElButton><ElButton v-if="row.pendingVerification || row.status === '标发中'" link type="primary" :disabled="正在执行" @click="核查(row as 标发单)">查询结果</ElButton><ElButton v-else-if="row.status === '待标发' || row.status === '标发失败'" link type="primary" :disabled="正在执行 || 阻断(row as 标发单).length > 0" @click="提交([row as 标发单])">{{ row.status === '标发失败' ? '重试' : '提交' }}</ElButton></template></ElTableColumn>
        <template #empty><ElEmpty description="没有符合条件的标发单" :image-size="70"><ElButton @click="重置">清空条件</ElButton></ElEmpty></template>
      </ElTable>
      <footer>共 {{ 结果.length }} 张标发单 <ElPagination v-model:current-page="页码" :page-size="每页" :total="结果.length" layout="prev, pager, next" @current-change="清除勾选" /></footer>
    </section>
    <ElDrawer v-model="抽屉" size="min(760px, calc(100vw - 84px))" :title="详情?.no" append-to-body>
      <template v-if="详情"><div class="详情标题"><h2>标发详情</h2><ElTag :type="色(详情.status)">{{ 详情.status }}</ElTag></div>
        <ElAlert v-if="详情.pendingVerification" title="平台结果待核查" description="请求可能已经被平台受理。先查询已有发货记录，核对订单行、数量、承运商和跟踪号；禁止直接重新提交。" type="warning" :closable="false" show-icon />
        <ElAlert v-if="详情.exemptionReason" title="无需标发：保留豁免事实" :description="详情.exemptionReason" type="info" :closable="false" />
        <section class="详情节" v-prototype="标注('source', '标发载荷与来源证据', '字段', '保留本次实际提交快照、来源行、履约单与幂等键。', ['来源订单、履约明细、有效已发货数量必须可追溯。', 'eBay 同一来源订单行不能分散在多个跟踪号下提交。'])"><h3>来源与提交快照</h3><ElDescriptions :column="2" border>
          <ElDescriptionsItem label="来源订单"><ElButton link type="primary" @click="router.push('/oms/orders/all/' + 详情.orderNo)">{{ 详情.orderNo }}<ElIcon><ArrowRight /></ElIcon></ElButton></ElDescriptionsItem><ElDescriptionsItem label="履约单">{{ 详情.fulfillmentNo }}</ElDescriptionsItem>
          <ElDescriptionsItem label="平台 / 店铺" :span="2">{{ 来源(详情)?.platformCode }} / {{ 来源(详情)?.storeName }}</ElDescriptionsItem>
          <ElDescriptionsItem label="平台订单行" :span="2">{{ 详情.lineId }}</ElDescriptionsItem><ElDescriptionsItem label="承运商">{{ 详情.carrier }}</ElDescriptionsItem><ElDescriptionsItem label="提交数量">{{ 详情.quantity }}</ElDescriptionsItem>
          <ElDescriptionsItem label="跟踪号" :span="2">{{ 详情.tracking }}</ElDescriptionsItem><ElDescriptionsItem label="实际发货时间" :span="2">{{ 详情.shippedAt }}</ElDescriptionsItem><ElDescriptionsItem label="幂等键" :span="2">{{ 详情.idempotencyKey }}</ElDescriptionsItem><ElDescriptionsItem label="平台回执" :span="2">{{ 详情.externalId || '—' }}</ElDescriptionsItem>
        </ElDescriptions></section>
        <section v-if="详情.status === '待标发' || 详情.status === '标发失败'" class="详情节"><h3>提交前检查</h3><ElAlert :title="阻断(详情).length ? '存在提交阻断' : '本地演示校验通过'" :description="阻断(详情).join('；') || '已找到有效出库、完整物流信息与对应订单行。付款时间仅用于展示；实际提交仍须按平台适配规则核对当前订单级状态。'" :type="阻断(详情).length ? 'warning' : 'success'" :closable="false" /></section>
        <section class="详情节" v-prototype="标注('attempts', '接口尝试与结果核查', '规则', '每次提交、查询单独记录，成功必须有可核验平台回执。', ['超时记录 EXTERNAL_RESULT_PENDING_VERIFICATION。', '查询匹配既有 fulfillment 后在原标发单补记成功，不新增第二张单。'])"><h3>接口尝试与核查记录 <span>UTC+8</span></h3><ElTimeline v-if="详情.attempts.length"><ElTimelineItem v-for="(记录, index) in 详情.attempts" :key="index" :timestamp="记录.time" placement="top"><strong>{{ 记录.action }} · {{ 记录.result }}</strong><p>{{ 记录.evidence }}</p></ElTimelineItem></ElTimeline><ElEmpty v-else description="尚无接口尝试" :image-size="50" /></section>
      </template>
      <template #footer><ElButton @click="抽屉 = false">关闭</ElButton><ElButton v-if="详情 && (详情.pendingVerification || 详情.status === '标发中')" type="primary" :loading="正在执行" @click="核查(详情)"><ElIcon><Refresh /></ElIcon>查询结果</ElButton><ElButton v-else-if="详情 && ['待标发','标发失败'].includes(详情.status)" type="primary" :disabled="阻断(详情).length > 0" :loading="正在执行" @click="提交([详情])">提交标发</ElButton></template>
    </ElDrawer>
  </main>
</template>

<style scoped>
.标发页面 { padding: 20px; color: #28364a; min-width: 0; height: 100%; overflow: auto; background: #f3f5f8; }
.页首,.详情标题 { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px; }.页首 h1 {font-size:21px;margin:0 0 8px;font-weight:650}.页首 h1 span {font-size:12px;font-weight:400;color:#8792a3;margin-left:12px}.页首 p{margin:0;font-size:13px;color:#8792a3}.概览卡 {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.概览卡 button{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid #e8edf3;border-radius:8px;padding:17px 20px;text-align:left;cursor:pointer}.概览卡 .el-icon{font-size:25px;padding:11px;box-sizing:content-box;border-radius:12px;background:#f3f7ff}.概览卡 span{display:block;color:#8792a3;font-size:12px}.概览卡 strong{display:block;font-size:25px;color:#28364a;margin-top:5px}.蓝{color:#367be8}.红{color:#d96064}.橙{color:#bd8a26}.绿{color:#30a586}.工作区{background:#fff;border:1px solid #e5eaf1;border-radius:8px;overflow:hidden}.状态栏{display:flex;flex-wrap:wrap;border-bottom:1px solid #edf0f4;padding:0 18px;gap:24px}.状态栏 button{border:0;background:none;padding:17px 0;font-size:13px;color:#778598;border-bottom:2px solid transparent;cursor:pointer}.状态栏 button.active{color:#2776da;border-bottom-color:#2776da}.状态栏 b{font-size:11px;margin-left:5px;background:#f0f3f8;border-radius:4px;padding:2px 5px}.搜索栏{display:flex;gap:10px;padding:18px;flex-wrap:wrap}.搜索栏>.el-input{width:360px}.搜索栏>.el-select{width:160px}.操作栏{display:flex;gap:14px;align-items:center;padding:0 18px 16px;font-size:12px;color:#8993a3}.操作栏 b{color:#347add}.辅助{margin-left:auto}.单号{font-variant-numeric:tabular-nums}small{display:block;font-size:11px;color:#8a96a7;margin-top:5px;line-height:1.6}.警示{color:#bc8019}.el-table{font-size:12px}.el-table :deep(th.el-table__cell){background:#f8fafc;color:#798699;font-weight:500}.el-table :deep(td.el-table__cell){padding:15px 0}footer{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;color:#8b95a4;font-size:12px}.详情标题 h2{font-size:18px;margin:0}.详情节{margin-top:26px}.详情节 h3{font-size:14px;margin:0 0 14px}.详情节 h3 span{font-size:11px;font-weight:400;color:#98a3b4;margin-left:8px}.详情节 p{font-size:12px;color:#8792a3;line-height:1.8}.详情节 :deep(.el-descriptions__content){word-break:break-word;font-size:12px}.详情节 :deep(.el-descriptions__label){font-size:12px}.详情节 :deep(.el-timeline){padding-left:10px}
@media(max-width:1300px){.标发页面{padding:16px}.概览卡{gap:10px}.概览卡 button{padding:14px;gap:10px}.概览卡 .el-icon{font-size:20px;padding:8px}.辅助{display:none}.状态栏{gap:20px}}
</style>
