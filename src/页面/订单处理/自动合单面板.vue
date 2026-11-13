<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElCheckbox, ElDialog, ElEmpty, ElMessage, ElMessageBox, ElTable, ElTableColumn, ElTabs, ElTabPane, ElTag } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { 校验字段搜索, 命中字段搜索, type 搜索字段, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { 共享合单记录, 共享合单执行结果 } from './自动合单状态'
import { 共享订单 } from './演示会话'
import { 执行合单轮次, 结束合单等待, 重试合单分仓, 解除合单组合 } from './自动合单会话'
import { 是合单等待, 北京时间文本, type 合单等待记录 } from './自动合单模型'
import { 共享自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 自动合单标注 } from './自动合单标注'
import { 合单动作摘要, 解析合单重量 } from '../订单规则/合单规则模型'
import { 创建合单展示组, 筛选合单展示组, 合单组成员签名, 合单整组确认文本, 合单临近截止分钟, type 合单展示组, type 合单组筛选 } from './合单分组展示'
import MergeRuntimeStatus from './合单运行状态.vue'
import { 合单操作复核快照, 校验合单操作来源一致性 } from './合单操作快照'

const emit = defineEmits<{ executed: [] }>()
const router = useRouter()
const 打开 = ref(false), 当前页签 = ref('waiting'), 勾选 = ref<合单展示组[]>([])
const 执行中 = ref(false), 当前时间 = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
watch(打开, value => {
  clearInterval(clock)
  if (value) { 当前时间.value = Date.now(); clock = setInterval(() => { 当前时间.value = Date.now() }, 30_000) }
})
onBeforeUnmount(() => clearInterval(clock))
const 搜索字段列表: 搜索字段[] = [{ value: 'orderNo', label: '系统订单号', kind: 'identifier' }]
const 搜索字段名 = ref('orderNo'), 搜索词 = ref(''), 搜索方式 = ref<搜索模式>('contains'), 店铺 = ref<string[]>([]), 临近截止 = ref(false)
const 已应用 = ref<合单组筛选>({ keyword: '', mode: 'contains', storeIds: [], nearDeadline: false })
const 表格版本 = ref(0)
const 等单 = computed(() => 共享合单记录.value.filter(是合单等待))
const 待处理 = computed(() => 共享合单记录.value.filter(项 => 项.status === '分仓待处理'))
const 等待组 = computed(() => 创建合单展示组(共享合单记录.value, 共享订单.value, 'waiting'))
const 待处理组 = computed(() => 创建合单展示组(共享合单记录.value, 共享订单.value, 'blocked'))
const 当前完整组 = computed(() => 当前页签.value === 'waiting' ? 等待组.value : 待处理组.value)
const 当前组 = computed(() => 筛选合单展示组(当前完整组.value, { ...已应用.value, nearDeadline: 当前页签.value === 'waiting' && 已应用.value.nearDeadline }, 当前时间.value))
const 订单索引 = computed(() => new Map(共享订单.value.map(order => [order.systemOrderNo, order])))
const 店铺选项 = computed(() => {
  const result = new Map<string, string>()
  for (const record of 共享合单记录.value) {
    const order = 订单索引.value.get(record.orderNo)
    if (order?.storeId) result.set(order.storeId, order.storeName || order.storeId)
  }
  return [...result].map(([value, label]) => ({ value, label }))
})
const 来源店铺 = (orderNo: string) => 订单索引.value.get(orderNo)?.storeName || '店铺待核实'
const 可查看 = (orderNo: string) => 订单索引.value.has(orderNo)
const 命中记录 = (row: { orderNo: string }) => 命中字段搜索(row.orderNo, 已应用.value.keyword, 已应用.value.mode)
  && (!已应用.value.storeIds.length || 已应用.value.storeIds.includes(订单索引.value.get(row.orderNo)?.storeId ?? ''))
const 历史记录 = computed(() => 共享合单记录.value.filter(row => !是合单等待(row) && row.status !== '分仓待处理').filter(命中记录))
const 结果记录 = computed(() => 共享合单执行结果.value?.rows.filter(命中记录) ?? [])
const 当前订单数 = computed(() => 当前组.value.reduce((sum, group) => sum + group.orderNos.length, 0))
const 勾选订单数 = computed(() => 勾选.value.reduce((sum, group) => sum + group.orderNos.length, 0))
const 组店铺文字 = (group: 合单展示组) => group.stores.map(store => store.label).join('、') || '店铺待核实'
const 来源重量 = (row: 合单等待记录) => 解析合单重量(row.weightKg) === undefined ? '重量待核实' : `${row.weightKg} kg`
function 清除勾选() { 勾选.value = []; 表格版本.value++ }
function 查询() {
  const error = 校验字段搜索(搜索词.value, 搜索方式.value)
  if (error) return void ElMessage.warning(error)
  已应用.value = { keyword: 搜索词.value, mode: 搜索方式.value, storeIds: [...店铺.value], nearDeadline: 临近截止.value }
  当前时间.value = Date.now(); 清除勾选()
}
function 重置() { 搜索词.value = ''; 搜索方式.value = 'contains'; 店铺.value = []; 临近截止.value = false; 查询() }
function 打开处理() { 清除勾选(); 当前页签.value = 'waiting'; 重置(); 打开.value = true }
async function 打开设置() { 打开.value = false; await router.push('/oms/self-fulfillment/order-rules?type=merge') }
async function 查看订单(orderNo: string) {
  if (!可查看(orderNo)) return
  打开.value = false
  await router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: orderNo } })
}
async function 立即执行() {
  if (执行中.value) return
  执行中.value = true
  try { await 执行合单轮次(); 当前页签.value = 'result'; emit('executed') }
  finally { 执行中.value = false }
}
function 重试分仓(group: 合单展示组) {
  const current = 待处理组.value.find(item => item.key === group.key)
  if (!current) return void ElMessage.warning('组内订单已变化，请重新查看后操作')
  if (!current.records[0]?.groupId) return void ElMessage.warning('原合单组标识缺失，请先核实原组范围')
  重试合单分仓(current.orderNos); emit('executed'); 当前页签.value = 'result'
}
async function 解除组合(group: 合单展示组) {
  const current = 待处理组.value.find(item => item.key === group.key)
  if (!current) return void ElMessage.warning('组内订单已变化，请重新查看后操作')
  if (!current.records[0]?.groupId) return void ElMessage.warning('原合单组标识缺失，请先核实原组范围')
  const error = 校验合单操作来源一致性(current.orderNos, '解除组合')
  if (error) return void ElMessage.warning(error)
  const sourceSnapshot = 合单操作复核快照(current.orderNos)
  try { await ElMessageBox.confirm(合单整组确认文本([current], '解除组合'), '解除合单组合', { confirmButtonText: '解除并独立分仓', cancelButtonText: '取消', type: 'warning', customClass: '合单整组确认' }) } catch { return }
  if (!待处理组.value.some(item => item.key === current.key)) return void ElMessage.warning('确认期间组内订单已变化，请重新查看后操作')
  if (合单操作复核快照(current.orderNos) !== sourceSnapshot) return void ElMessage.warning('确认期间来源订单或合单资料已变化，请重新查看并确认完整组')
  const currentError = 校验合单操作来源一致性(current.orderNos, '解除组合')
  if (currentError) return void ElMessage.warning(currentError)
  解除合单组合(current.orderNos); emit('executed'); 当前页签.value = 'result'
}
async function 放单() {
  const selectedKeys = new Set(勾选.value.map(group => group.key))
  const groups = 等待组.value.filter(group => selectedKeys.has(group.key))
  if (!groups.length) return void 清除勾选()
  const signature = 合单组成员签名(groups)
  const orderNos = groups.flatMap(group => group.orderNos)
  const error = 校验合单操作来源一致性(orderNos)
  if (error) { 清除勾选(); return void ElMessage.warning(error) }
  const sourceSnapshot = 合单操作复核快照(orderNos)
  try { await ElMessageBox.confirm(合单整组确认文本(groups, '结束等待'), '结束合单等待', { confirmButtonText: '确认放单', cancelButtonText: '取消', type: 'warning', customClass: '合单整组确认' }) } catch { return }
  const latest = 等待组.value.filter(group => selectedKeys.has(group.key))
  if (合单组成员签名(latest) !== signature) { 清除勾选(); return void ElMessage.warning('确认期间组内订单已变化，请重新选择并确认完整组') }
  if (合单操作复核快照(orderNos) !== sourceSnapshot) { 清除勾选(); return void ElMessage.warning('确认期间来源订单或合单资料已变化，请重新查看并确认完整组') }
  const currentError = 校验合单操作来源一致性(orderNos)
  if (currentError) { 清除勾选(); return void ElMessage.warning(currentError) }
  await 结束合单等待(orderNos)
  清除勾选(); emit('executed'); ElMessage.success('已处理所选合单组，请查看放单结果'); 当前页签.value = 'result'
}
function 来源期限(row: 合单等待记录) { return row.deadlineAt !== null ? 北京时间文本(row.deadlineAt) : '—' }
</script>

<template>
  <ElButton v-prototype="自动合单标注('workbench', '合单处理入口')" class="合单处理入口" aria-label="合单处理" @click="打开处理">
    合单处理<span v-if="等单.length" class="等单数量">{{ 等单.length }}</span>
  </ElButton>
  <ElDialog v-model="打开" title="合单处理" width="min(1240px, calc(100vw - 100px))" top="5vh" append-to-body destroy-on-close class="合单处理弹窗" @closed="清除勾选">
    <section v-if="打开" v-prototype="自动合单标注('waiting-pool', '合单处理弹窗')" class="合单弹窗内容">
      <div class="合单概况">
        <span>{{ 共享自动合单设置.policy.mode === 'basic' ? '基础模式' : '高级等单' }}</span>
        <span v-if="共享下次合单时间">{{ 共享自动合单设置.policy.mode === 'basic' ? '下轮处理' : '下次补查' }} {{ 北京时间文本(共享下次合单时间) }}</span>
        <ElButton link type="primary" class="设置入口" @click="打开设置">合单设置</ElButton>
      </div>
      <MergeRuntimeStatus />
      <p class="合单说明">等待中的订单保留在待审核。结束等待后继续分仓和审核，不代表审核通过或发货。</p>
      <ElTabs v-model="当前页签" @tab-change="清除勾选"><ElTabPane :label="`等待中（${等单.length}）`" name="waiting"/><ElTabPane :label="`分仓待处理（${待处理.length}）`" name="blocked"/><ElTabPane label="已结束记录" name="history"/><ElTabPane label="最近执行结果" name="result"/></ElTabs>
      <div class="合单筛选">
        <FieldSearch v-model="搜索词" v-model:field="搜索字段名" v-model:mode="搜索方式" :fields="搜索字段列表" aria-prefix="合单处理" :width="370" @search="查询" />
        <MultiFilter v-model="店铺" :options="店铺选项" placeholder="订单店铺" :width="145" />
        <ElCheckbox v-if="当前页签 === 'waiting'" v-model="临近截止" aria-label="仅看临近截止">{{ 合单临近截止分钟 }} 分钟内截止（含已到期）</ElCheckbox>
        <ElButton type="primary" @click="查询">查询</ElButton><ElButton @click="重置">重置</ElButton>
      </div>
      <template v-if="当前页签 === 'result'">
        <template v-if="共享合单执行结果">
          <p class="合单统计">{{ 北京时间文本(共享合单执行结果.executedAt) }} · 本轮全部 {{ 共享合单执行结果.total }} 单 · 放单 {{ 共享合单执行结果.released }}（其中合并 {{ 共享合单执行结果.merged }}） · 等单 {{ 共享合单执行结果.waiting }} · 跳过 {{ 共享合单执行结果.skipped }}<span>当前筛选显示 {{ 结果记录.length }} 单</span></p>
          <ElTable :data="结果记录" max-height="min(42vh, 450px)" empty-text="暂无匹配结果"><ElTableColumn label="系统订单号" min-width="220"><template #default="{row}"><ElButton v-if="可查看(row.orderNo)" link type="primary" @click="查看订单(row.orderNo)">{{ row.orderNo }}</ElButton><span v-else>{{ row.orderNo }}</span></template></ElTableColumn><ElTableColumn prop="status" label="结果" width="130"/><ElTableColumn prop="reason" label="处理说明" min-width="320"/></ElTable>
        </template>
        <ElEmpty v-else description="暂无合单执行记录"/>
      </template>
      <template v-else-if="当前页签 === 'history'">
        <p class="次要">共 {{ 历史记录.length }} 张订单，保留原组与每张来源订单的处理记录。</p>
        <ElTable :data="历史记录" row-key="orderNo" max-height="min(42vh, 450px)" empty-text="暂无匹配记录">
          <ElTableColumn label="系统订单号" min-width="205"><template #default="{row}"><ElButton v-if="可查看(row.orderNo)" link type="primary" @click="查看订单(row.orderNo)">{{ row.orderNo }}</ElButton><span v-else>{{ row.orderNo }}</span></template></ElTableColumn>
          <ElTableColumn prop="groupId" label="原合单组" min-width="165"/><ElTableColumn prop="ruleName" label="入池规则" min-width="170"/>
          <ElTableColumn label="状态 / 处理说明" min-width="300"><template #default="{row}"><ElTag size="small" :type="row.status === '已放单' ? 'success' : 'info'">{{ row.status }}</ElTag><div class="次要">{{ row.reason }}</div></template></ElTableColumn>
        </ElTable>
      </template>
      <template v-else>
        <div class="等单工具"><span>当前 {{ 当前组.length }} 组 / {{ 当前订单数 }} 张订单<span v-if="勾选.length"> · 已选 {{ 勾选.length }} 组 / {{ 勾选订单数 }} 单</span></span><ElButton v-if="当前页签 === 'waiting'" type="primary" :disabled="!勾选.length" @click="放单">结束所选等待</ElButton></div>
        <p class="组筛选说明">按完整组展示与处理；搜索命中组内任一订单时，仍展示该组全部来源。时间均为北京时间。</p>
        <ElTable :key="`${当前页签}-${表格版本}`" :data="当前组" row-key="key" max-height="min(45vh, 500px)" empty-text="当前没有匹配的合单组" @selection-change="勾选 = $event">
          <ElTableColumn v-if="当前页签 === 'waiting'" type="selection" width="44"/>
          <ElTableColumn type="expand" width="40"><template #default="{row: group}">
            <div class="合单组详情">
              <details class="入池快照"><summary>入池时设置 · V{{ group.records[0].settingsVersion }}</summary><p>{{ 合单动作摘要(group.records[0].action) }}</p><p>分组要求：同平台、同店铺、同买家、同收件人、完整收货地址一致{{ group.records[0].action.groupBySite ? '、同站点' : '' }}。已有等待沿用此快照。</p></details>
              <ElTable :data="group.records" size="small" row-key="orderNo">
                <ElTableColumn label="来源订单 / 店铺" min-width="220"><template #default="{row}"><ElButton v-if="可查看(row.orderNo)" link type="primary" @click="查看订单(row.orderNo)">{{ row.orderNo }}</ElButton><span v-else>{{ row.orderNo }}</span><div class="次要">{{ 来源店铺(row.orderNo) }}</div></template></ElTableColumn>
                <ElTableColumn label="命中规则" min-width="185"><template #default="{row}">{{ row.ruleName }}<div class="次要">规则 V{{ row.ruleVersion }} · 设置 V{{ row.settingsVersion }}</div></template></ElTableColumn>
                <ElTableColumn label="件数 / 重量" min-width="120"><template #default="{row}">{{ row.quantity }} 件<div class="次要">{{ 来源重量(row as 合单等待记录) }}</div></template></ElTableColumn>
                <ElTableColumn label="时间记录" min-width="225"><template #default="{row}"><div>入池：{{ 北京时间文本(row.enteredAt) }}</div><div v-if="row.action.mode === 'advanced'" class="次要">等待起点：{{ 北京时间文本(row.waitStartedAt ?? row.enteredAt) }}</div><div class="次要">本单截止：{{ 来源期限(row as 合单等待记录) }}</div></template></ElTableColumn>
                <ElTableColumn prop="reason" label="处理说明" min-width="230"/>
              </ElTable>
            </div>
          </template></ElTableColumn>
          <ElTableColumn label="合单组 / 店铺" min-width="170"><template #default="{row}"><strong class="组名称">{{ row.label }}</strong><div class="次要">{{ 组店铺文字(row as 合单展示组) }}</div></template></ElTableColumn>
          <ElTableColumn label="订单 / 合并限制" min-width="165"><template #default="{row}"><strong class="组数量">{{ row.progress }}</strong><div class="次要">最多 {{ row.records[0].action.maxOrders }} 单 · {{ row.quantity }}{{ row.records[0].action.maxQuantity !== undefined ? ` / ${row.records[0].action.maxQuantity}` : '' }} 件</div><div class="次要">{{ row.weightKg === undefined ? '重量待核实' : `${row.weightKg} kg` }}{{ row.records[0].action.maxWeightKg !== undefined ? ` / 上限 ${row.records[0].action.maxWeightKg} kg` : '' }}</div></template></ElTableColumn>
          <ElTableColumn label="最早截止 / 依据" min-width="205"><template #default="{row}"><span>{{ row.deadlineAt !== null ? 北京时间文本(row.deadlineAt) : '—' }}</span><div class="次要">{{ row.deadlineReason }}</div><ElTag v-if="当前页签 === 'waiting' && row.deadlineAt !== null && row.deadlineAt <= 当前时间" size="small" type="warning">已到期，等待处理</ElTag></template></ElTableColumn>
          <ElTableColumn label="状态 / 处理说明" min-width="235"><template #default="{row}"><ElTag size="small" :type="row.status === '分仓待处理' ? 'danger' : 'info'">{{ row.status }}</ElTag><div class="次要">{{ row.reason }}</div></template></ElTableColumn>
          <ElTableColumn v-if="当前页签 === 'blocked'" label="操作" width="120" fixed="right"><template #default="{row}"><div class="组操作"><ElButton link type="primary" :disabled="!row.records[0].groupId" @click="重试分仓(row as 合单展示组)">整组重试分仓</ElButton><ElButton link type="warning" :disabled="!row.records[0].groupId" @click="解除组合(row as 合单展示组)">解除组合</ElButton><span v-if="!row.records[0].groupId" class="次要">原组标识待核实</span></div></template></ElTableColumn>
        </ElTable>
      </template>
    </section>
    <template #footer><ElButton @click="打开 = false">关闭</ElButton><ElButton plain type="primary" :loading="执行中" @click="立即执行">立即执行合单</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.合单处理入口{flex-shrink:0}.等单数量{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;min-width:18px;height:18px;padding:0 4px;background:var(--el-color-primary-light-9);color:var(--el-color-primary);border-radius:9px;font-size:12px}
.合单弹窗内容{min-width:0;max-height:calc(90vh - 145px);overflow:auto}.合单概况{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:0 0 10px;font-size:12px;color:var(--el-text-color-secondary)}.设置入口{margin-left:auto}
.次要,.合单说明,.合单统计,.组筛选说明{color:var(--el-text-color-secondary);font-size:12px;line-height:1.7}.次要{margin-top:4px;overflow-wrap:anywhere}.合单说明{margin:10px 0 12px}.合单筛选{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0}.合单筛选 :deep(.el-checkbox__label){font-size:12px}.合单筛选 :deep(.el-button + .el-button){margin-left:0}
.等单工具{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:13px}.组筛选说明{margin:0 0 10px}.合单统计{padding:10px;background:var(--el-fill-color-light);margin:0 0 12px}.合单统计>span{display:block}.组名称,.组数量{font-size:13px;color:var(--yy-text-heading);font-weight:500;overflow-wrap:anywhere}.组操作{display:flex;align-items:flex-start;flex-direction:column;gap:10px}.组操作 :deep(.el-button){margin:0}.合单组详情{padding:12px 18px 18px;background:#f8fafc;min-width:0}.入池快照{margin:0 0 12px;font-size:12px;line-height:1.7}.入池快照 summary{cursor:pointer;color:var(--yy-text-heading);font-weight:500}.入池快照 p{margin:8px 0 0;color:var(--yy-text-secondary)}.合单组详情 :deep(.el-button){font-size:12px;white-space:normal;text-align:left}.合单弹窗内容 :deep(.el-table__header th){color:var(--yy-text-heading)}
:global(.合单整组确认){width:min(640px,calc(100vw - 60px));max-width:640px}:global(.合单整组确认 .el-message-box__message){white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font-size:13px;line-height:1.8}
</style>
