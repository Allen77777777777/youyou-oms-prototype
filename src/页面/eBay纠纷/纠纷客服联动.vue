<script setup lang="ts">
import { getDisputeSystemSkus } from './处理人'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInput, ElMessage } from 'element-plus'
import NumberCopy from '@/组件/单号复制.vue'
import BuyerMail from '../eBay取消订单申请/买家站内信.vue'
import { 获取状态说明 } from '../eBay订单/订单工具'
import { 共享订单 } from '../订单处理/演示会话'
import { addDisputeNote, disputePackageScope, disputeRecipient, initializeDisputeContext, notesForDispute, resolveDisputeOrder } from './客服关联'
import { dateText, recordKey, type DisputeRecord } from './模型'
import type { 原型标注 } from '@/类型/标注'

type ContextSection = 'order' | 'mail' | 'note'
const props = defineProps<{ record: DisputeRecord; section?: ContextSection }>()
const router = useRouter()
const draft = ref('')
const orderPanel = ref<HTMLElement>(), mailPanel = ref<HTMLElement>(), notePanel = ref<HTMLElement>()
function reveal(section: ContextSection) {
  const panel = { order: orderPanel, mail: mailPanel, note: notePanel }[section].value
  panel?.scrollIntoView?.({ block: 'start' })
  panel?.focus({ preventScroll: true })
}
defineExpose({ reveal })
const identity = computed(() => recordKey(props.record))
watch(() => [identity.value, props.record.orderId, props.record.buyer, props.section], () => {
  draft.value = ''
  if (props.section !== 'note') initializeDisputeContext(props.record, props.section)
}, { immediate: true })
const order = computed(() => resolveDisputeOrder(props.record, 共享订单.value))
const packages = computed(() => {
  const linked = order.value
  return linked?.fulfillmentOrders.map(pack => ({
    pack, scope: disputePackageScope(props.record, linked, pack),
    lines: (pack.items ?? []).filter(item => item.orderNo === linked.systemOrderNo),
  })) ?? []
})
const notes = computed(() => notesForDispute(props.record))
const mailContext = computed(() => ({
  kind: props.record.kind, applicationId: props.record.id, shopName: props.record.shopName,
  orderNo: props.record.orderId, recipient: disputeRecipient(props.record), systemSkus: getDisputeSystemSkus(props.record),
}))
function openOrder() {
  const linked = resolveDisputeOrder(props.record, 共享订单.value)
  if (!linked) return void ElMessage.warning('订单关联待核实')
  void router.push({ name: 'oms-all-order-detail', params: { systemOrderNo: linked.systemOrderNo } })
}
function saveNote() {
  const error = addDisputeNote(props.record, draft.value)
  if (error) return void ElMessage.warning(error)
  draft.value = ''
  ElMessage.success('内部备注已保存')
}
function annotation(key: string, title: string, description: string): 原型标注 {
  const id = 'oms.ebay-disputes.service.' + key
  return { id, 锚点: id, 标题: title, 分类: '交互', 说明: description, 版本: '2026-11-05',
    prd引用: ['PRD/eBay纠纷功能PRD.md'], 状态: '待评审', 事实等级: '合理假设' }
}
const annotations = {
  order: annotation('order', '核对关联订单与发货记录', '按店铺、eBay 订单标识及买家核对全渠道订单。存在重复或冲突时保留待核实，办理时单独选择平台允许的证据。'),
  mail: annotation('mail', '查看本店来信、联系买家', '按店铺和已核验收件身份展示来信。主动点开来信跳至共享站内信，外发保留来源对象类型及编号。请求内留言、证据和站内信分别办理。'),
  note: annotation('note', '内部备注', '同一店铺、纠纷类型和编号单独记录。保存作者、时间和正文，仅团队可见。原型备注保存在当前页面会话中。'),
}
</script>
<template>
  <div class="dispute-service">
    <section v-if="!section || section === 'order'" ref="orderPanel" tabindex="-1" v-prototype="annotations.order" class="service-card" aria-label="关联订单">
      <header><h2>关联订单</h2><ElButton v-if="order" link type="primary" @click="openOrder">查看订单详情</ElButton></header>
      <template v-if="order">
        <div class="order-summary">
          <div><small>系统订单号</small><NumberCopy :value="order.systemOrderNo" label="系统订单号" /></div>
          <div><small>订单总额</small><strong>{{ order.amount.orderAmount.currency }} {{ order.amount.orderAmount.value }}</strong></div>
        </div>
        <dl class="order-facts">
          <dt>平台履约状态</dt><dd>{{ 获取状态说明('fulfillment', order.platformOrderStatus).text }}</dd>
          <dt>OMS 处理状态</dt><dd>{{ order.processingStatus || '—' }}</dd>
          <dt>下单时间</dt><dd>{{ dateText(order.orderedAt) }}</dd>
          <dt>付款时间</dt><dd>{{ dateText(order.paidAt) }}</dd>
        </dl>
        <h3 v-if="packages.length" class="packages-title">整单履约记录（{{ packages.length }}）</h3>
        <details v-for="({ pack, scope, lines }, index) in packages" :key="identity + pack.fulfillmentOrderNo" class="fulfillment">
          <summary><span class="caret" aria-hidden="true"></span><span class="package-label">包裹 {{ index + 1 }}<small>{{ pack.route.shippingChannel || '渠道待核实' }} · {{ pack.status }}</small></span>
            <span class="package-scope" :class="{ matched: scope === '含本纠纷订单行' }">{{ scope }}</span></summary>
          <div class="package-body"><dl class="order-facts">
            <dt>发货仓库</dt><dd>{{ pack.route.warehouse || '—' }}</dd>
            <dt>履约单号</dt><dd><NumberCopy :value="pack.fulfillmentOrderNo" label="履约单号" /></dd>
            <dt>跟踪号</dt><dd><NumberCopy :value="pack.trackingNumber" label="跟踪号" /></dd>
            <dt>发货时间</dt><dd>{{ dateText(pack.shippedAt) }}</dd>
          </dl>
          <ul v-if="lines.length" class="package-lines">
            <li v-for="line in lines" :key="line.externalLineId">
              <span>本单商品行</span><NumberCopy :value="line.externalLineId" label="商品行号" /> · {{ line.quantity }} 件
            </li>
          </ul></div>
        </details>
        <p v-if="!packages.length" class="muted empty-packs">该订单暂无履约记录</p>
      </template>
      <p v-else class="muted">尚未核实店铺、平台订单号和买家均一致的 OMS 订单。</p>
    </section>
    <div v-if="!section || section === 'mail'" ref="mailPanel" tabindex="-1" v-prototype="annotations.mail" class="service-card" aria-label="买家站内信区">
      <BuyerMail :key="identity" :shop-id="record.shopId" :buyer-id="record.buyer" :application="mailContext" :format-time="dateText" />
    </div>
    <section v-if="!section || section === 'note'" ref="notePanel" tabindex="-1" v-prototype="annotations.note" class="service-card" aria-label="内部备注">
      <header><h2>内部备注</h2><small>仅团队可见</small></header>
      <ElInput v-model="draft" type="textarea" aria-label="内部备注内容" placeholder="记录核查结果或交接事项" :rows="2" maxlength="500" show-word-limit />
      <div class="note-action"><ElButton size="small" type="primary" plain :disabled="!draft.trim()" @click="saveNote">保存备注</ElButton></div>
      <ol v-if="notes.length" class="notes"><li v-for="(note, index) in notes" :key="note.at + index">
        <div><b>{{ note.author }}</b><time>{{ dateText(note.at) }}</time></div><p>{{ note.text }}</p>
      </li></ol>
    </section>
  </div>
</template>
<style scoped>
.dispute-service{display:grid;align-content:start;gap:14px;min-width:0;container-type:inline-size}
.service-card{min-width:0;padding:14px;background:#fff;border:1px solid #e1e6ec;border-radius:5px}
.service-card:focus{outline:2px solid #8fb5df;outline-offset:-2px}.service-card{scroll-margin-top:8px}
.packages-title{font-size:12px;color:var(--yy-text-heading);margin:16px 0 6px}
.order-summary{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 16px;background:#f6f8fb;border-radius:4px;padding:10px 12px;margin-bottom:12px}
.order-summary>div{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere;font-size:13px;color:var(--yy-text-heading)}
.order-summary small{font-size:11px}.order-summary strong{font-weight:600;font-variant-numeric:tabular-nums}
.package-lines{list-style:none;padding:0;margin:6px 0 0;font-size:12px}.package-lines li{display:flex;align-items:baseline;flex-wrap:wrap;gap:5px}.package-lines span{margin-right:8px}
.service-card>header,.notes li>div{display:flex;align-items:center;justify-content:space-between;gap:6px 12px;flex-wrap:wrap}
.service-card>header{margin-bottom:14px;min-height:20px}.service-card h2{margin:0;font-size:14px;font-weight:600;color:var(--yy-text-heading)}
.service-card small,.muted,.order-facts dt,.notes time{color:#738093;font-size:12px}
.muted{margin:0;line-height:1.65}.empty-packs{margin-top:12px}
.order-facts{display:grid;grid-template-columns:80px minmax(0,1fr);gap:5px 8px;margin:0;font-size:12px;line-height:1.6}
.order-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
.fulfillment{border-top:1px solid #e8ecf1;font-size:12px}
.fulfillment>summary{display:flex;align-items:center;gap:7px;padding:9px 1px;list-style:none;cursor:pointer}
.fulfillment>summary::-webkit-details-marker{display:none}.fulfillment>summary:focus-visible{outline:2px solid #8fb5df;outline-offset:-1px}
.caret{width:6px;height:6px;flex:none;border-right:1.5px solid #738093;border-bottom:1.5px solid #738093;transform:rotate(-45deg);margin:0 3px 0 2px}
.fulfillment[open] .caret{transform:rotate(45deg)}.package-label{display:grid;gap:2px;color:var(--yy-text-heading);min-width:0;overflow-wrap:anywhere}
.package-label small{font-size:11px}.package-scope{margin-left:auto;color:#728094;font-size:11px}.package-scope.matched{color:#365e89}
.package-body{margin:0 0 9px 15px;padding:9px 10px;background:#f7f9fc;border-radius:4px;min-width:0}
.note-action{margin-top:8px;text-align:right}
.notes{margin:12px 0 0;padding:0;list-style:none}.notes li{border-top:1px solid #e8ecf1;padding:10px 0 0;margin-top:8px;font-size:12px}
.notes p{margin:5px 0 0;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
@container(min-width:540px){.order-facts{grid-template-columns:80px minmax(0,1fr) 80px minmax(0,1fr)}}
</style>
