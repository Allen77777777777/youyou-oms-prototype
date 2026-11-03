<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElAlert, ElButton, ElCheckbox, ElDialog, ElForm, ElInput, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import type { 仓库执行, 命令结果 } from './演示会话'
import { 计算可合并订单, 创建合并发货草稿, 校验人工发货方案 } from './拆合发货模型'
import { 路由仓库键, 查找所选仓库物流 } from './仓库物流选择模型'
import { 拆合发货标注 } from './拆合发货原型标注'
import { 展示处理原因 } from './处理提示展示'
import WarehouseRoute from './仓库物流选择.vue'
import PlanSummary from './拆合发货方案展示.vue'
import ShippingSteps from './发货步骤条.vue'

const props = defineProps<{
  allOrders: readonly 全渠道订单[]
  executions: readonly 仓库执行[]
  routeOptions: readonly 订单路由[]
  versionOf: (orderNo: string) => number
  save: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果>
  saveAndReview?: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果>
}>()
const emit = defineEmits<{ saved: [action: string, orderNos: string[]] }>()
type 分组草稿 = { key: string; selected: boolean; plan: 人工发货方案; warehouse: string }
const 打开 = ref(false)
const 步骤 = ref(0)
const 保存中 = ref(false)
const 提交动作 = ref<'save' | 'review'>('save')
const 计算中 = ref(false)
const 所选编号 = ref<string[]>([])
const 期望版本 = ref<Record<string, number>>({})
const 计算结果 = ref<ReturnType<typeof 计算可合并订单>>({ groups: [], unmergedOrders: [] })
const 分组草稿 = ref<分组草稿[]>([])
const 原因 = ref('')
const 提交错误 = ref('')
const 展开校验 = ref(false)
const 上下文 = computed(() => ({ 订单: [...props.allOrders], 仓库执行: [...props.executions], 当前版本: props.versionOf, 记录操作: () => {}, 可选路由: props.routeOptions }))
const 已选组 = computed(() => 分组草稿.value.filter(group => group.selected))
const 可合并数量 = computed(() => 计算结果.value.groups.reduce((sum, group) => sum + group.orderNos.length, 0))
const 已选数量 = computed(() => 已选组.value.reduce((sum, group) => sum + group.plan.orderNos.length, 0))
const 全选 = computed({ get: () => 分组草稿.value.length > 0 && 已选组.value.length === 分组草稿.value.length, set: (value: boolean) => { 分组草稿.value.forEach(group => { group.selected = value }) } })
const 未合并行 = computed(() => 计算结果.value.unmergedOrders.map(row => ({ ...row, order: props.allOrders.find(order => order.systemOrderNo === row.orderNo) })))
const 来源订单 = (group: 分组草稿) => group.plan.orderNos.flatMap(no => { const order = props.allOrders.find(item => item.systemOrderNo === no); return order ? [order] : [] })
const 总数量 = (group: 分组草稿) => group.plan.packages.reduce((sum, parcel) => sum + parcel.items.reduce((count, item) => count + item.quantity, 0), 0)
const 地址 = (order?: 全渠道订单) => order ? [order.address.countryCode, order.address.stateProvince, order.address.city, order.address.district, order.address.addressLine1, order.address.addressLine2, order.address.postalCode].filter(Boolean).join(' · ') : '收货地址待核实'
const 空路由 = (): 订单路由 => ({ warehouse: '', warehouseProvider: '', warehouseAccount: '', shippingChannel: '', shippingChannelCode: '', labelMode: '仓配一体' })
function 方案(group: 分组草稿): 人工发货方案 { return { ...group.plan, reason: 原因.value.trim() } }
const 校验原因 = computed(() => {
  const reasons: string[] = []
  if (!已选组.value.length) reasons.push('请至少选择一组可合并订单')
  for (const group of 已选组.value) {
    const index = 分组草稿.value.indexOf(group) + 1
    for (const reason of 校验人工发货方案(上下文.value, 方案(group))) reasons.push(`合并组 ${index}：${reason}`)
    if (group.plan.orderNos.some(no => props.versionOf(no) !== 期望版本.value[no])) reasons.push(`合并组 ${index}：订单已变化，请重新计算可合并订单`)
  }
  return [...new Set(reasons)]
})
async function 重新计算() {
  if (保存中.value || 计算中.value) return
  计算中.value = true
  try {
    await nextTick()
    计算结果.value = 计算可合并订单(上下文.value, [...所选编号.value])
    分组草稿.value = 计算结果.value.groups.map(group => {
      const orders = group.orderNos.flatMap(no => { const order = props.allOrders.find(item => item.systemOrderNo === no); return order ? [order] : [] })
      const plan = 创建合并发货草稿(orders)
      // 原路由不一致时由用户明确指定共同路线，不默取第一张订单。
      if (new Set(orders.map(order => JSON.stringify(order.defaultRoute ?? null))).size > 1) plan.packages[0]!.route = 空路由()
      const route = plan.packages[0]!.route
      return { key: group.key, selected: true, plan, warehouse: route.warehouse ? 路由仓库键(route) : '' }
    })
    期望版本.value = Object.fromEntries(所选编号.value.map(no => [no, props.versionOf(no)]))
    步骤.value = 0; 提交错误.value = ''; 展开校验.value = false
  } finally { 计算中.value = false }
}
async function open(orders: readonly 全渠道订单[]) {
  if (保存中.value || 计算中.value) return
  所选编号.value = [...new Set(orders.map(order => order.systemOrderNo))]
  原因.value = ''; 分组草稿.value = []; 计算结果.value = { groups: [], unmergedOrders: [] }
  打开.value = true
  await 重新计算()
}
function 选择仓库(group: 分组草稿, value: string) {
  group.warehouse = value
  const route = props.routeOptions.find(item => 路由仓库键(item) === value)
  group.plan.packages[0]!.route = route ? { ...route, shippingChannel: '', shippingChannelCode: '', shippingChannelId: undefined } : 空路由()
  提交错误.value = ''
}
function 选择渠道(group: 分组草稿, value: string) {
  const route = 查找所选仓库物流(props.routeOptions, group.warehouse, value)
  group.plan.packages[0]!.route = route ? { ...route } : { ...group.plan.packages[0]!.route, shippingChannel: '', shippingChannelCode: '', shippingChannelId: undefined }
  提交错误.value = ''
}
function 预览() {
  展开校验.value = true
  if (校验原因.value.length) { 提交错误.value = '请先处理校验项，再预览合并发货方案'; return }
  步骤.value = 1; 展开校验.value = false; 提交错误.value = ''
}
async function 保存(action: 'save' | 'review' = 'save') {
  if (保存中.value || 步骤.value !== 1 || !打开.value) return
  if (action === 'review' && !props.saveAndReview) return
  展开校验.value = true
  if (校验原因.value.length) { 提交错误.value = '订单或方案已变化，请返回检查后重新预览'; return }
  保存中.value = true; 提交动作.value = action; 提交错误.value = ''
  try {
    await nextTick()
    if (校验原因.value.length) { 提交错误.value = '订单或方案已变化，请返回检查后重新预览'; return }
    const plans = JSON.parse(JSON.stringify(已选组.value.map(方案))) as 人工发货方案[]
    const result = action === 'review' ? await props.saveAndReview!(plans, { ...期望版本.value }) : await props.save(plans, { ...期望版本.value })
    if (!result.成功) { 提交错误.value = result.信息; return }
    const orderNos = plans.flatMap(plan => plan.orderNos)
    打开.value = false
    emit('saved', action === 'review' ? '保存并审核订单' : '合并发货', orderNos)
  } catch (error) { 提交错误.value = error instanceof Error ? error.message : '保存未完成，请稍后重试' }
  finally { 保存中.value = false }
}
function 关闭(done?: () => void) { if (!保存中.value && !计算中.value) { 打开.value = false; done?.() } }
function 清空() { if (!打开.value) { 分组草稿.value = []; 所选编号.value = []; 原因.value = ''; 提交错误.value = '' } }
defineExpose({ open })
</script>

<template>
  <ElDialog v-model="打开" title="合并发货" width="min(1260px, 96vw)" top="3vh" class="合并发货弹窗" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!保存中 && !计算中" :show-close="!保存中 && !计算中" :before-close="关闭" @closed="清空">
    <div class="合并工作区">
      <ShippingSteps class="步骤区" :active="步骤" :titles="['判断可合并订单', '方案预览']" :note="saveAndReview ? '保存待审核 · 审核后待推单' : '保存后仍待审核'" />
      <template v-if="步骤 === 0">
        <section v-prototype="拆合发货标注.合并计算" class="计算范围">
          <div class="计算摘要"><div><span>已勾选订单</span><strong>{{ 所选编号.length }}<small> 张</small></strong></div><div><span>可合并订单</span><strong class="可合并数">{{ 可合并数量 }}<small> 张</small></strong></div><div><span>可合并组</span><strong>{{ 计算结果.groups.length }}<small> 组</small></strong></div><div><span>未合并订单</span><strong>{{ 计算结果.unmergedOrders.length }}<small> 张</small></strong></div></div>
          <div class="条件说明"><span>合并条件：同平台、同店铺、同买家、同收件人、收货地址一致。</span><ElButton link type="primary" :loading="计算中" @click="重新计算">重新计算</ElButton></div>
        </section>
        <section class="合并结果">
          <div class="分区标题"><h3>可合并订单 <small>每组生成一个合并发货方案</small></h3><ElCheckbox v-if="分组草稿.length" v-model="全选" :indeterminate="已选组.length > 0 && !全选" aria-label="选择全部可合并组">全选 {{ 分组草稿.length }} 组</ElCheckbox></div>
          <p v-if="!分组草稿.length" class="无匹配">所选订单暂无可合并组，请查看下方判断结果。</p>
          <article v-for="(group, index) in 分组草稿" :key="group.plan.id" class="合并组" :class="{ 未选组: !group.selected }">
            <header><ElCheckbox v-model="group.selected" :aria-label="`选择合并组 ${index + 1}`"><strong>合并组 {{ index + 1 }}</strong></ElCheckbox><span class="组汇总">{{ group.plan.orderNos.length }} 张订单 → 1 个包裹 · {{ 总数量(group) }} 件</span><ElTag size="small" type="success">五项一致</ElTag></header>
            <div class="共同收件"><div><strong>{{ 来源订单(group)[0]?.platformCode }} · {{ 来源订单(group)[0]?.storeName }}</strong><span>买家：{{ 来源订单(group)[0]?.buyerExternalId }}<i>｜</i>收件人：{{ 来源订单(group)[0]?.address.fullName }}</span></div><p>{{ 地址(来源订单(group)[0]) }}</p></div>
            <ElTable :data="来源订单(group)" size="small" class="来源表">
              <ElTableColumn label="系统订单 / 平台订单" min-width="240"><template #default="{ row }"><div class="双行信息"><strong>{{ row.systemOrderNo }}</strong><small>{{ row.platformOrderNo }}</small></div></template></ElTableColumn>
              <ElTableColumn label="商品 / 可发数量" min-width="220"><template #default="{ row }"><div v-for="item in row.items" :key="item.externalLineId" class="商品摘要"><span>{{ item.systemSku || item.platformSku || 'SKU 待核实' }}</span><small>{{ item.fulfillableQuantity ?? '待核实' }} 件</small></div></template></ElTableColumn>
              <ElTableColumn label="原发货仓库 / 物流渠道" min-width="220"><template #default="{ row }"><div class="双行信息"><span>{{ row.defaultRoute?.warehouse || '未选择' }}</span><small>{{ row.defaultRoute?.shippingChannel || '未选择' }}</small></div></template></ElTableColumn>
            </ElTable>
            <div v-prototype="拆合发货标注.路由" class="共同路由"><h4>共同发货仓库和物流渠道</h4><ElForm label-position="top" size="small" :disabled="!group.selected"><WarehouseRoute :routes="routeOptions" :warehouse="group.warehouse" :channel="group.plan.packages[0]!.route.shippingChannelCode" @update:warehouse="选择仓库(group, $event)" @update:channel="选择渠道(group, $event)" /></ElForm></div>
          </article>
        </section>
        <section v-if="未合并行.length" class="未合并区">
          <div class="分区标题"><h3>未合并订单 <small>本次保持原发货安排</small></h3><span>{{ 未合并行.length }} 张</span></div>
          <ElTable :data="未合并行" size="small"><ElTableColumn label="系统订单 / 平台订单" min-width="240"><template #default="{ row }"><div class="双行信息"><strong>{{ row.orderNo }}</strong><small>{{ row.order?.platformOrderNo || '订单待核实' }}</small></div></template></ElTableColumn><ElTableColumn label="平台 / 店铺" min-width="170"><template #default="{ row }"><div class="双行信息"><span>{{ row.order?.platformCode || '—' }}</span><small>{{ row.order?.storeName || '—' }}</small></div></template></ElTableColumn><ElTableColumn label="判断结果" min-width="330"><template #default="{ row }"><div class="未合并原因" v-for="reason in row.reasons" :key="reason">{{ 展示处理原因(reason) }}</div></template></ElTableColumn></ElTable>
        </section>
        <section v-if="分组草稿.length" v-prototype="拆合发货标注.原因" class="原因区"><label for="merge-shipping-reason">操作原因 <small>（选填）</small></label><ElInput id="merge-shipping-reason" v-model="原因" aria-label="操作原因" type="textarea" :rows="2" :maxlength="2000" show-word-limit placeholder="选填，保存到发货安排和各来源订单的操作日志" /></section>
      </template>
      <section v-else v-prototype="拆合发货标注.合并预览" class="预览区">
        <div class="分区标题"><h3>合并发货方案预览</h3><span>{{ 已选组.length }} 组 · {{ 已选数量 }} 张订单 → {{ 已选组.length }} 个包裹</span></div>
        <article v-for="group in 已选组" :key="group.key" class="预览组"><h4>合并组 {{ 分组草稿.indexOf(group) + 1 }}</h4><div class="共同收件"><div><strong>{{ 来源订单(group)[0]?.platformCode }} · {{ 来源订单(group)[0]?.storeName }}</strong><span>买家：{{ 来源订单(group)[0]?.buyerExternalId }}<i>｜</i>收件人：{{ 来源订单(group)[0]?.address.fullName }}</span></div><p>{{ 地址(来源订单(group)[0]) }}</p></div><PlanSummary :plan="方案(group)" :orders="来源订单(group)" :show-reason="true" /></article>
        <ElAlert :title="`本次处理 ${已选组.length} 组合并发货方案，涉及 ${已选数量} 张订单。${saveAndReview ? '保存后仍待审核；保存并审核通过后进入待推单。' : '保存后仍待审核。'}其余 ${所选编号.length - 已选数量} 张订单保持原发货安排。`" type="info" :closable="false" show-icon />
      </section>
      <div v-if="展开校验 && 校验原因.length" class="校验问题"><strong>请处理以下校验项</strong><ul><li v-for="reason in 校验原因" :key="reason">{{ 展示处理原因(reason) }}</li></ul></div>
      <ElAlert v-if="提交错误" :title="展示处理原因(提交错误)" type="error" :closable="false" show-icon />
    </div>
    <template #footer><div class="窗口底栏"><span>已选择 {{ 已选组.length }} 组 · {{ 已选数量 }} 张订单</span><div><ElButton :disabled="保存中 || 计算中" @click="关闭()">取消</ElButton><ElButton v-if="步骤 === 1" :disabled="保存中" @click="步骤 = 0; 提交错误 = ''; 展开校验 = false">返回编辑</ElButton><ElButton v-if="步骤 === 0" type="primary" :disabled="!已选组.length || 计算中" @click="预览">预览</ElButton><template v-else><ElButton :type="saveAndReview ? 'default' : 'primary'" :loading="保存中 && 提交动作 === 'save'" :disabled="保存中" @click="保存('save')">确认保存</ElButton><ElButton v-if="saveAndReview" v-prototype="拆合发货标注.合并保存审核" type="primary" :loading="保存中 && 提交动作 === 'review'" :disabled="保存中" @click="保存('review')">保存并审核</ElButton></template></div></div></template>
  </ElDialog>
</template>

<style scoped>
:global(.合并发货弹窗){max-height:94vh;margin-bottom:3vh}:global(.合并发货弹窗 .el-dialog__body){max-height:calc(94vh - 125px);overflow:auto;padding-top:0}:global(.合并发货弹窗 .el-dialog__title){color:var(--yy-text-heading)}
.合并工作区{display:flex;flex-direction:column;gap:18px;min-width:0;color:#46596f;font-size:12px}.合并工作区>section{min-width:0;max-width:100%}.步骤区{display:flex;align-items:center;gap:24px;padding:11px 14px;background:#f7f9fc;border-radius:5px}.步骤区>.el-steps{flex:1;padding:0;background:none}.步骤区>span{font-size:12px;color:#8693a6;white-space:nowrap}.步骤区 :deep(.el-step__title){font-size:12px;color:var(--yy-text-heading)}
.计算摘要{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #e5eaf1;border-radius:5px;padding:15px 0}.计算摘要>div{display:flex;flex-direction:column;gap:7px;padding:0 24px;border-right:1px solid #e5eaf1}.计算摘要>div:last-child{border-right:0}.计算摘要 span{font-size:12px;color:#75859a}.计算摘要 strong{font-size:25px;font-weight:600;line-height:1.2;color:var(--yy-text-heading)}.计算摘要 strong.可合并数{color:#2879df}.计算摘要 small{font-size:12px;font-weight:400;color:#8492a4}.条件说明{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;font-size:12px;color:#7b899b;line-height:1.6}.条件说明 .el-button{flex-shrink:0}
.分区标题{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.分区标题 h3{margin:0;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--yy-text-heading);font-weight:600}.分区标题 h3 small{font-size:11px;font-weight:400;color:#8794a5}.分区标题>span{color:#8492a4;font-size:12px}.合并结果{display:flex;flex-direction:column;gap:12px}.合并结果>.分区标题{margin-bottom:0}.合并组{border:1px solid #e1e7ef;border-radius:5px;min-width:0;overflow:hidden}.合并组.未选组{border-style:dashed}.合并组>header{display:flex;align-items:center;gap:16px;background:#f7f9fc;padding:7px 14px}.合并组>header>.组汇总{color:#8290a3;font-size:12px;flex:1}.合并组 strong,.预览组 h4,.共同路由 h4{color:var(--yy-text-heading);font-weight:500}.共同收件{padding:12px 14px;line-height:1.6}.共同收件>div{display:flex;align-items:center;flex-wrap:wrap;gap:10px 24px}.共同收件 p{margin:5px 0 0;color:#7b899b;overflow-wrap:anywhere}.共同收件 i{font-style:normal;color:#c5ceda;margin:0 7px}.双行信息{display:flex;flex-direction:column;gap:4px;line-height:1.55;overflow-wrap:anywhere}.双行信息 strong{font-weight:500;color:#3d526e}.双行信息 small{font-size:11px;color:#8492a4}.商品摘要{display:flex;justify-content:space-between;gap:12px;padding:2px 0;overflow-wrap:anywhere}.商品摘要 small{white-space:nowrap;color:#75859a}.合并工作区 :deep(th.el-table__cell){color:var(--yy-text-heading);background:#f7f9fc}.合并工作区 :deep(.el-table__cell){vertical-align:top}.共同路由{padding:12px 14px 0}.共同路由 h4{font-size:12px;margin:0 0 12px}.共同路由 :deep(.仓库物流字段){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 14px}.共同路由 :deep(.el-form-item){min-width:0;margin-bottom:12px}.共同路由 :deep(.el-form-item__label){font-size:11px;line-height:1.4;height:auto;margin-bottom:6px}.原因区{display:flex;flex-direction:column;gap:8px}.原因区>label{font-size:12px}.原因区>label>span{color:#f56c6c}.原因区 :deep(.el-textarea__inner){font-size:12px;line-height:1.7;padding-bottom:20px}.未合并原因{line-height:1.7;color:#9a793e;overflow-wrap:anywhere}.无匹配{background:#f7f9fc;text-align:center;padding:28px 16px;border-radius:5px;color:#8492a4;margin:0}.校验问题{padding:11px 14px;border:1px solid #f0d8b8;background:#fffaf2;border-radius:5px;font-size:12px;line-height:1.7;color:#a97430}.校验问题 ul{margin:4px 0 0;padding-left:18px}.预览区{display:flex;flex-direction:column;gap:14px}.预览区>.分区标题{margin-bottom:0}.预览组{border:1px solid #e1e7ef;padding:12px 14px;border-radius:5px;min-width:0}.预览组 h4{font-size:13px;margin:0 0 12px}.窗口底栏{display:flex;justify-content:space-between;align-items:center;gap:15px}.窗口底栏>span{font-size:12px;color:#8492a5}@media(max-width:760px){.共同路由 :deep(.仓库物流字段){grid-template-columns:repeat(2,minmax(0,1fr))}.计算摘要>div{padding:0 12px}.步骤区>span{display:none}.分区标题 h3{flex-wrap:wrap}.窗口底栏>span{display:none}.窗口底栏{justify-content:flex-end}}
</style>
