<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { ElAlert, ElButton, ElCheckbox, ElDialog, ElInput, ElMessage, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 原型标注 } from '@/类型/标注'
import type { 作业行 } from './展示工具'
import { 共享订单, 操作核查证据, 当前版本, 审核阻断原因, 推单阻断原因, 执行演示审核, 执行演示推单, 演示库存, type 仓库执行, type 命令结果 } from './演示会话'
import { 不发货阻断原因, 执行演示不发货 } from './批量操作模型'
import { 订单关联仓库执行, 仓单来源订单, 仓单期望版本, 重新推单阻断原因, 截单阻断原因, 退回待审核阻断原因, 恢复发货目标, 恢复发货阻断原因, 撤销不发货阻断原因, 执行演示重新推单, 执行演示截单, 执行演示退回待审核, 执行演示恢复发货, 执行演示撤销不发货 } from './操作功能模型'
import { 获取作业来源订单 } from './筛选模型'
import { 展示处理原因 } from './处理提示展示'

export type 设置操作 = '审核' | '推单' | '重新推单' | '截单' | '退回待审核' | '不发货' | '恢复发货' | '撤销不发货'
type 目标 = { key: string; order: 全渠道订单; row?: 作业行; execution?: 仓库执行; sources: 全渠道订单[]; version: number; versions: Record<string, number>; selected: boolean; reasons: string[] }
const emit = defineEmits<{ result: [action: string, results: Array<{ key: string; result: 命令结果 }>] }>()
const 打开 = ref(false)
const 操作 = ref<设置操作>('审核')
const 批量 = ref(false)
const 目标列表 = ref<目标[]>([])
const 来源选择 = ref('')
const 保存中 = ref(false)
const 草稿 = reactive({ reason: '', confirmed: false })
const 是仓单操作 = computed(() => ['重新推单', '截单'].includes(操作.value))
const 需选择来源 = computed(() => !批量.value && !是仓单操作.value && 操作.value !== '推单' && 目标列表.value.length > 1)
const 当前目标 = computed(() => 需选择来源.value ? 目标列表.value.filter(项 => 项.key === 来源选择.value) : 目标列表.value)
function 可执行(项: 目标) { return 操作.value === '审核' ? 项.order.processingStatus === '待审核' && !项.order.reviews.some(记录 => 记录.status === '审核中') && !(项.order.platformCode === 'eBay' && 项.order.platformOrderStatus === 'IN_PROGRESS') : !项.reasons.length }
const 合格选择 = computed(() => 当前目标.value.filter(项 => 项.selected && 可执行(项)))
const 选中数 = computed(() => 当前目标.value.filter(项 => 项.selected).length)
const 原因标签 = computed(() => ({ 审核: '审核说明', 推单: '', 重新推单: '修复说明', 截单: '截单原因', 退回待审核: '退回原因', 不发货: '不发货原因', 恢复发货: '恢复原因', 撤销不发货: '撤销原因' })[操作.value])
const 确认勾选文案 = computed(() => ({ 截单: '我已核对全部受影响订单，确认申请终止本次仓库执行', 不发货: '我已核实所选订单无需 OMS 继续发货', 恢复发货: '我已完成异常复核，确认按所示目标阶段继续处理', 撤销不发货: '我已核实仍需 OMS 发货，撤销后必须重新审核' } as Record<string, string>)[操作.value] || '')
const 恢复目标 = computed(() => 当前目标.value[0] ? 恢复发货目标(当前目标.value[0].order) : undefined)
const 确认文案 = computed(() => {
  const n = 合格选择.value.length
  switch (操作.value) {
    case '审核': return `对 ${n} 张订单执行审核。通过后生成或确认有效履约方案并进入待推单；不通过的订单保留审核结果，不会推单。`
    case '推单': return `将 ${n} 张履约单按当前发货方案推送到仓库。推单受理不代表仓库建单成功，也不代表已发货。`
    case '重新推单': return `对已确认未生效且问题已修复的 ${n} 张出库单重新推单。结果未明的请求不会重新发送。`
    case '截单': return `向仓库申请截停 ${n} 张出库单，影响 ${new Set(合格选择.value.flatMap(项 => 项.sources.map(order => order.systemOrderNo))).size} 张订单。受理不代表截单成功，请同步仓库状态确认结果；本次不直接改变订单处理状态。`
    case '退回待审核': return `将符合条件的 ${n} 张订单退回待审核，原审核及履约记录保留。重新配置并审核通过后才能再次推单。`
    case '不发货': return `将符合条件的 ${n} 张订单设为不发货，停止后续 OMS 发货。不会删除平台或出库历史，也不会代替仓库截单。`
    case '恢复发货': return `订单将恢复到 ${恢复目标.value || '待核实'}。本次不会重新推单，${恢复目标.value === '待发货' ? '继续原仓库执行' : 恢复目标.value === '待推单' ? '保留原执行历史，按有效方案等待推单' : '修复发货资料后必须重新审核'}。`
    case '撤销不发货': return '将撤销本订单的不发货结论并返回待审核。原记录保留，旧仓库单不会恢复，也不会立即推单。'
  }
})
const 表单有效 = computed(() => 合格选择.value.length > 0 && (['审核', '推单'].includes(操作.value) || !!草稿.reason.trim()) && (!确认勾选文案.value || 草稿.confirmed))
const 操作标注: 原型标注 = { id: 'oms.processing.action-settings', 锚点: 'oms.processing.action-settings', 标题: '六态操作设置与逐项资格', 说明: '按操作专题 PRD 提供本地评审交互；完整来源、历史执行、零出库、版本及待核查保护逐项重验。新增截单、退回、恢复及终态纠错仍为评审方案，外部接口未接入。', 路由: '/oms/self-fulfillment/processing', prd引用: ['PRD/订单处理-操作功能PRD.md'], 事实等级: '合理假设', 版本: '2026-10-10', 状态: '待评审', 交互规则: ['单个多来源先明确订单；批量目标去重、允许取消勾选，仅处理合格对象。', '普通审核可执行并记录通过或拦截摘要；平台部分履约仍仅展示拦截，不开放人工解除与剩余范围改写。', '截单受理保留原处理阶段，等待同步明确取消；恢复阶段由事实判断，不供手工选择。'], 数据来源: ['虚构订单及仓库执行证据；刷新恢复初始值，未调用真实 API。'] }

function 资格(项: 目标): string[] {
  switch (操作.value) {
    case '审核': return 审核阻断原因(项.order, 演示库存.value[项.order.systemOrderNo] ?? '充足')
    case '推单': return 项.row?.fulfillment ? 推单阻断原因(项.order, 项.row.fulfillment.fulfillmentOrderNo) : ['暂无有效履约方案']
    case '重新推单': return 重新推单阻断原因(项.execution!)
    case '截单': return 截单阻断原因(项.execution!, 批量.value)
    case '退回待审核': return 退回待审核阻断原因(项.order)
    case '不发货': return 不发货阻断原因(项.order)
    case '恢复发货': return 恢复发货阻断原因(项.order)
    case '撤销不发货': return 撤销不发货阻断原因(项.order)
  }
}
function open(action: 设置操作, rows: 作业行[], batch = false) {
  if (!rows.length) return ElMessage.warning('请先勾选当前页对象')
  操作.value = action; 批量.value = batch; 来源选择.value = ''
  Object.assign(草稿, { reason: '', confirmed: false })
  const 范围: 目标[] = []
  for (const row of rows) {
    const sources = 获取作业来源订单(row, 共享订单.value)
    if (['重新推单', '截单'].includes(action)) {
      const executions = sources.flatMap(order => 订单关联仓库执行(order)).filter(项 => !row.fulfillment || 项.履约单号 === row.fulfillment.fulfillmentOrderNo)
      for (const execution of executions) { const orders = 仓单来源订单(execution); 范围.push({ key: execution.出库单号, order: orders[0] || row.order, row, execution, sources: orders, version: 0, versions: 仓单期望版本(execution), selected: true, reasons: [] }) }
    } else if (action === '推单') {
      范围.push({ key: row.key, order: row.order, row, sources, version: 当前版本(row.order.systemOrderNo), versions: Object.fromEntries(sources.map(项 => [项.systemOrderNo, 当前版本(项.systemOrderNo)])), selected: true, reasons: [] })
    } else for (const order of sources) 范围.push({ key: order.systemOrderNo, order, row, sources: [order], version: 当前版本(order.systemOrderNo), versions: {}, selected: true, reasons: [] })
  }
  目标列表.value = [...new Map(范围.map(项 => [项.key, 项])).values()].map(项 => ({ ...项, reasons: 资格(项) }))
  if (!batch && ['截单', '重新推单'].includes(action) && 目标列表.value.length > 1) 目标列表.value.forEach(项 => { 项.selected = false })
  打开.value = true
}
async function 提交() {
  if (保存中.value || !表单有效.value) return
  保存中.value = true
  try {
    await nextTick()
    if (!打开.value) return
    const results = 当前目标.value.filter(项 => 项.selected).map(项 => {
      const reasons = 资格(项)
      if (!可执行({ ...项, reasons })) return { key: 项.key, result: { 成功: false, 信息: `已跳过：${展示处理原因(reasons.join('；')) || '当前不满足操作条件'}` } as 命令结果 }
      let result: 命令结果
      switch (操作.value) {
        case '审核': result = 执行演示审核(项.key, 项.version, 草稿.reason); break
        case '推单': result = 执行演示推单(项.order.systemOrderNo, 项.row!.fulfillment!.fulfillmentOrderNo, 项.version, 项.versions); break
        case '重新推单': result = 执行演示重新推单(项.key, 项.versions, 草稿.reason); break
        case '截单': result = 执行演示截单(项.key, 项.versions, 草稿.reason, 批量.value); break
        case '退回待审核': result = 执行演示退回待审核(项.key, 项.version, 草稿.reason); break
        case '不发货': result = 执行演示不发货(项.key, 项.version, 草稿.reason); break
        case '恢复发货': result = 执行演示恢复发货(项.key, 项.version, 草稿.reason); break
        case '撤销不发货': result = 执行演示撤销不发货(项.key, 项.version, 草稿.reason); break
      }
      return { key: 项.key, result }
    })
    打开.value = false; emit('result', 操作.value, results)
  } finally { 保存中.value = false }
}
defineExpose({ open })
</script>

<template>
  <ElDialog v-model="打开" :title="`${批量 ? '批量' : ''}${操作}`" width="min(1480px, 96vw)" top="3vh" class="操作设置弹窗" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!保存中" :show-close="!保存中">
    <div v-prototype="操作标注" class="操作设置">
      <div v-if="需选择来源" class="来源选择"><label>来源订单</label><ElSelect v-model="来源选择" placeholder="请选择本次需要操作的来源订单" aria-label="操作来源订单"><ElOption v-for="项 in 目标列表" :key="项.key" :value="项.key" :label="项.key" /></ElSelect></div>
      <div class="范围摘要"><strong>共 {{ 当前目标.length }} 个对象</strong><span>已选 {{ 选中数 }} 个</span><span class="可处理">可处理 {{ 合格选择.length }} 个</span><span>订单及出库时间均为北京时间</span></div>
      <ElTable :data="当前目标" max-height="calc(94vh - 390px)" class="目标表">
        <ElTableColumn label="选择" width="58"><template #default="{ row }"><ElCheckbox v-model="row.selected" :aria-label="'选择操作对象 ' + row.key" :disabled="保存中" /></template></ElTableColumn>
        <ElTableColumn label="目标及全部来源" min-width="300"><template #default="{ row }"><strong class="对象编号">{{ row.key }}</strong><div v-for="order in row.sources" :key="order.systemOrderNo" class="来源事实"><span v-if="order.systemOrderNo !== row.key">系统订单号：{{ order.systemOrderNo }}</span><span class="来源店铺">{{ order.platformCode }} · {{ order.storeName || '—' }}</span><span>平台订单号：{{ order.platformOrderNo || '—' }}</span><span>当前阶段：{{ order.processingStatus }}</span><span v-if="order.blockReason">{{ 展示处理原因(order.blockReason) }}</span><span v-if="order.noShipmentReason">不发货原因：{{ order.noShipmentReason }}</span><span v-if="order.cancelledAt">最终取消：{{ order.cancelledAt }}</span></div></template></ElTableColumn>
        <ElTableColumn label="发货信息" min-width="285"><template #default="{ row }"><div v-for="order in row.sources" :key="order.systemOrderNo" class="执行事实"><span>{{ (row.row?.fulfillment?.route || order.defaultRoute)?.warehouse || '未分配仓库' }} / {{ (row.row?.fulfillment?.route || order.defaultRoute)?.shippingChannel || '未分配渠道' }}</span><span>账号：{{ (row.row?.fulfillment?.route || order.defaultRoute)?.warehouseAccount || '—' }}</span><span v-for="item in order.items" :key="item.externalLineId">{{ item.systemSku || item.platformSku }} · 待发 {{ item.fulfillableQuantity ?? '待核实' }} 件</span><span v-if="row.row?.fulfillment">本次计划 {{ row.row.fulfillment.plannedQuantity }} 件 · 实际出库 {{ row.row.fulfillment.shippedQuantity ?? '待核实' }} 件</span><span v-for="execution in 订单关联仓库执行(order)" :key="execution.出库单号">{{ execution.出库单号 }} · {{ execution.状态 }}{{ execution.待核查 ? ' · 待核查' : '' }}<br>{{ 展示处理原因(execution.原因) }}</span><span v-if="!订单关联仓库执行(order).length">尚无仓库执行</span>
          <div v-for="fulfillment in order.fulfillmentOrders" :key="fulfillment.fulfillmentOrderNo" class="履约事实"><strong>{{ fulfillment.fulfillmentOrderNo }} · {{ fulfillment.isActive ? '当前方案' : '历史方案' }}</strong><span>实际路由：{{ fulfillment.route.warehouse }} / {{ fulfillment.route.shippingChannel }} / {{ fulfillment.route.warehouseAccount }}</span><span>计划 {{ fulfillment.plannedQuantity }} 件 · 实际出库 {{ Number.isFinite(fulfillment.shippedQuantity) ? fulfillment.shippedQuantity : '待核实' }} 件 · {{ fulfillment.status }}</span></div>
          <span>平台发货条件：{{ 操作核查证据[order.systemOrderNo]?.平台允许 === true ? '已核实，允许继续准备发货' : 操作核查证据[order.systemOrderNo]?.平台允许 === false ? '当前不允许继续发货' : '按当前准入与平台记录检查' }}</span>
          <span v-if="操作核查证据[order.systemOrderNo]">剩余发货范围：{{ 操作核查证据[order.systemOrderNo]?.剩余已核实 ? '已核实' : '尚未核实' }} · 零出库：{{ 操作核查证据[order.systemOrderNo]?.零出库已核实 ? '已核实' : '尚未核实' }}</span><span v-if="操作 === '恢复发货'">系统判定恢复到：{{ 恢复发货目标(order) || '待核实' }}</span><span v-if="操作 === '撤销不发货'">纠正成功后返回待审核</span></div></template></ElTableColumn>
        <ElTableColumn label="业务校验" min-width="240"><template #default="{ row }"><ElTag size="small" :type="row.reasons.length ? 'warning' : 'success'">{{ row.reasons.length ? 操作 === '审核' && 可执行(row as 目标) ? '审核将记录拦截' : '不能执行' : '可处理' }}</ElTag><p class="校验原因">{{ 展示处理原因(row.reasons.join('；')) || '当前条件齐备，提交前将再次检查' }}</p><p v-if="操作 === '审核' && row.order.platformOrderStatus === 'IN_PROGRESS'" class="校验原因">该订单需逐单人工核实已履约与剩余范围。</p></template></ElTableColumn>
      </ElTable>
      <p v-if="!当前目标.length" class="不可处理">{{ 需选择来源 ? '请先选择来源订单，不默认操作第一张。' : '暂无关联操作对象，请核实原执行。' }}</p>
      <ElAlert v-if="当前目标.length && !合格选择.length" title="所选对象均不满足操作条件，请查看原因或调整选择" type="warning" :closable="false" show-icon />
      <ElAlert v-else-if="合格选择.length < 选中数" :title="`本次仅处理符合条件的 ${合格选择.length} 个对象，其余对象将跳过。是否继续？`" type="warning" :closable="false" show-icon />
      <label v-if="原因标签" class="表单标签">{{ 原因标签 }}{{ 操作 === '审核' ? '（可选）' : ' *' }}<ElInput v-model="草稿.reason" type="textarea" :rows="2" :maxlength="2000" show-word-limit :placeholder="`请输入${原因标签}`" :aria-label="原因标签" /></label>
      <ElCheckbox v-if="确认勾选文案" v-model="草稿.confirmed" class="确认勾选">{{ 确认勾选文案 }}</ElCheckbox>
      <ElAlert :title="确认文案" :type="['截单', '不发货', '撤销不发货'].includes(操作) ? 'warning' : 'info'" :closable="false" show-icon />
    </div>
    <template #footer><ElButton :disabled="保存中" @click="打开 = false">取消</ElButton><ElButton type="primary" :loading="保存中" :disabled="!表单有效" @click="提交">确认{{ 操作 }}</ElButton></template>
  </ElDialog>
</template>

<style scoped>
:global(.操作设置弹窗){max-height:94vh;margin-bottom:3vh}
:global(.操作设置弹窗 .el-dialog__body){max-height:calc(94vh - 110px);overflow:auto}
.操作设置>.目标表,.操作设置>.范围摘要,.操作设置>.表单标签,.操作设置>.el-alert,.操作设置>.确认勾选{flex-shrink:0}
.来源店铺{color:var(--yy-text-heading);font-weight:500}
.操作设置{display:flex;flex-direction:column;gap:14px}.范围摘要{display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;color:#738197}.范围摘要 strong,.表单标签,.来源选择 label{color:var(--yy-text-heading)}.可处理{color:#388d67}.对象编号{font-size:12px;overflow-wrap:anywhere}.来源事实,.执行事实{display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.65;color:#61738b;overflow-wrap:anywhere;margin:8px 0}.来源事实+.来源事实,.执行事实+.执行事实{padding-top:8px;border-top:1px dashed #e1e7ef}.履约事实{display:flex;flex-direction:column;gap:4px;padding:7px 9px;background:#f6f8fb;border-radius:4px}.履约事实 strong{color:var(--yy-text-heading);font-size:12px}.校验原因{font-size:12px;line-height:1.7;margin:8px 0;color:#687b93}.表单标签{font-size:12px;display:flex;flex-direction:column;gap:8px}.来源选择{display:flex;gap:12px;align-items:center;font-size:12px}.来源选择 .el-select{flex:1}.不可处理{color:#ba7d37;font-size:12px}.确认勾选{height:auto;white-space:normal}.确认勾选 :deep(.el-checkbox__label){white-space:normal;line-height:1.7}.目标表 :deep(td.el-table__cell){vertical-align:top}.目标表 :deep(th){color:var(--yy-text-heading)}
</style>
