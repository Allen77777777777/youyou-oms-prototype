<script setup lang="ts">
import { handlerNames } from '@/组件/客服处理人/处理人'
import { getDisputeHandlerIds, refreshDisputeWithHandlers } from './处理人'
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElButton, ElMessage, ElTag, ElTooltip } from 'element-plus'
import NumberCopy from '@/组件/单号复制.vue'
import OperationLogs from '@/组件/客服日志/日志列表.vue'
import { returnSession } from '../eBay退换货申请/数据'
import { findReturnRecord, returnKey } from '../eBay退换货申请/模型'
import { afterSaleFacts, recordsForReturn } from '../售后单管理/会话'
import BusinessFacts from './纠纷业务资料.vue'
import DisputeHandling from './纠纷办理工作区.vue'
import DisputeServiceContext from './纠纷客服联动.vue'
import PostOrderFacts from './请求材料与裁决.vue'
import PaymentEvidence from './支付争议材料.vue'
import { dateText, findRecord, isSellerOverdue, kindLabels, type DisputeKind, type DisputeRecord } from './模型'
import { disputeAnnotations } from './标注'
import { idLabels } from './导航'

const props = defineProps<{ record: DisputeRecord }>()
const emit = defineEmits<{ back: []; 'open-record': [kind: DisputeKind, id: string, shopId: string] }>()
const router = useRouter()
const orderCard = ref<InstanceType<typeof DisputeServiceContext>>()
const mailCard = ref<InstanceType<typeof DisputeServiceContext>>()
const title = { INR_REQUEST: '未收到货请求', EBAY_CASE: 'eBay 介入案件', PAYMENT_DISPUTE: '支付争议' }
const statusTone = computed(() => {
  if (props.record.pending || props.record.owner === '待核实') return 'warning'
  return props.record.owner === '已结束' ? 'info' : 'primary'
})
const taskLabel = computed(() => {
  const row = props.record
  if (row.pending) return '提交后核查'
  if (row.owner === '卖家') return '卖家当前待办'
  if (row.owner === '已结束') return '结案后跟进'
  if (row.owner === '待核实') return '办理进度待核实'
  return '当前等待' + row.owner
})
const timeLabel = computed(() => {
  if (props.record.date) return props.record.date.label
  if (props.record.payment?.waitEstimate) return '付款机构预计用时'
  return ''
})
const timeValue = computed(() => props.record.date ? dateText(props.record.date.value) : props.record.payment?.waitEstimate)
const returnSources = computed(() => props.record.links
  .filter(link => link.kind === 'RETURN' && link.shopId === props.record.shopId)
  .map(link => {
    const candidate = findReturnRecord(returnSession.records, returnKey(link))
    const verified = candidate && candidate.orderNo === props.record.orderId && candidate.buyerId === props.record.buyer
    const source = verified ? candidate : undefined
    const sales = source ? recordsForReturn(link.shopId, link.id).filter(sale => sale.orderNo === props.record.orderId) : []
    return { link, source, sales }
  }))
const disputeLinks = computed(() => props.record.links.flatMap(link => {
  if (link.kind === 'RETURN' || link.shopId !== props.record.shopId) return []
  const candidate = findRecord(link.shopId, link.kind, link.id)
  const verified = candidate && candidate.orderId === props.record.orderId && candidate.buyer === props.record.buyer
  return [{ ...link, kind: link.kind, verified }]
}))
function refresh() {
  ElMessage.info(refreshDisputeWithHandlers(props.record))
}
function openReturn(shopId: string, returnId: string) {
  void router.push({ name: 'oms-ebay-return-detail', params: { shopId, returnId } })
}
</script>

<template>
  <article v-prototype="disputeAnnotations.detail" class="dispute-detail">
    <header class="page-bar">
      <h1>eBay纠纷详情</h1>
      <div class="page-tools">
        <ElButton text size="small" aria-label="返回纠纷列表" @click="emit('back')">返回列表</ElButton>
        <slot name="ticket-actions" />
        <ElTooltip content="获取本案最新进展与办理回执" placement="bottom"><ElButton :icon="Refresh" @click="refresh">刷新数据</ElButton></ElTooltip>
      </div>
    </header>
    <div class="workbench">
      <main class="reading-pane" aria-label="纠纷资料">
        <header class="case-identity">
          <div class="identity-row">
            <div class="case-number"><span>{{ idLabels[record.kind] }}</span><strong><NumberCopy :value="record.id" :label="idLabels[record.kind]" /></strong></div>
            <ElTag :type="statusTone" effect="light" disable-transitions>{{ record.statusText }}</ElTag>
          </div>
          <div class="metadata"><b>{{ title[record.kind] }}</b><span lang="en">{{ kindLabels[record.kind] }}</span></div>
          <div class="identity-meta">
            <span>当前应办方 {{ record.owner }}</span>
            <span>处理人 {{ handlerNames(getDisputeHandlerIds(record)) }}</span>
            <span>{{ record.shopName }} · {{ record.site }}</span>
            <span v-if="record.buyer">买家 <BuyerLink :shop-id="record.shopId" :buyer-id="record.buyer" /></span>
            <NumberCopy v-if="record.orderId" :value="record.orderId" label="平台订单号"><button type="button" @click="orderCard?.reveal('order')">{{ record.orderId }}</button></NumberCopy>
          </div>
        </header>
        <section v-prototype="disputeAnnotations.deadlines" class="status-summary" :class="{ 'single-task': !timeLabel }" aria-label="当前待办与时限">
          <div><small>{{ taskLabel }}</small><strong>{{ record.nextStep || record.progress || '等待平台更新' }}</strong><span v-if="record.progress && record.progress !== record.statusText && record.progress !== record.nextStep">{{ record.progress }}</span></div>
          <div v-if="timeLabel"><small>{{ timeLabel }}</small><strong :class="{ overdue: isSellerOverdue(record) }">{{ timeValue }}</strong>
            <span v-if="record.date?.source">{{ record.date.source }}</span>
          </div>
        </section>
        <div class="reading-columns">
          <div class="reading-stack case-data">
            <BusinessFacts :record="record" section="issue">
              <template #origin>
                <div v-if="returnSources.length || disputeLinks.length" class="origins">
                  <div v-for="item in disputeLinks" :key="item.kind + item.id">
                    <span>{{ item.kind === 'EBAY_CASE' ? '关联案件' : title[item.kind] }}</span>
                    <NumberCopy :value="item.id" label="关联编号"><button v-if="item.verified" class="link-button" @click="emit('open-record',item.kind,item.id,item.shopId)">{{ item.id }}</button><span v-else>{{ item.id }} · 待核实</span></NumberCopy>
                  </div>
                  <div v-for="item in returnSources" :key="item.link.id">
                    <span>来源退货申请</span><NumberCopy :value="item.link.id" label="Return ID"><button v-if="item.source" class="link-button" @click="openReturn(item.link.shopId,item.link.id)">{{ item.link.id }}</button><span v-else>{{ item.link.id }} · 待核实</span></NumberCopy>
                  </div>
                </div>
              </template>
            </BusinessFacts>
            <PostOrderFacts v-if="record.caseInfo" :record="record" />
            <PaymentEvidence v-if="record.payment" :record="record" section="funds" />
            <DisputeServiceContext ref="orderCard" :record="record" section="order" />
            <BusinessFacts :record="record" section="goods" />
            <BusinessFacts v-if="record.inquiry" :record="record" section="refund" />
            <template v-for="item in returnSources" :key="item.link.id">
              <section v-if="item.source?.tracking || item.sales.length" class="panel">
                <h2>原申请的退回与售后记录</h2>
                <p v-if="item.source?.tracking">退回跟踪　<NumberCopy :value="item.source.tracking" label="退回跟踪号" /></p>
                <div v-for="sale in item.sales" :key="sale.no" class="linked-sale"><button class="link-button" @click="router.push({ name: 'oms-ebay-after-sale-orders', query: { documentNo: sale.no } })">{{ sale.no }}</button>
                  <span>{{ sale.kind }} · {{ sale.executionResult }}</span><small v-if="sale.kind === '退货'">仓库实收 {{ afterSaleFacts(sale).receivedQty != null ? afterSaleFacts(sale).receivedQty + ' 件' : '待凭证确认' }}</small></div>
              </section>
            </template>
          </div>
          <div class="reading-stack case-activity">
            <section v-prototype="disputeAnnotations.history" class="panel case-history">
              <h2>处理过程</h2>
              <ol v-if="record.history.length">
                <li v-for="(event,i) in record.history" :key="i" :class="{ 'seller-event': event.actor === '卖家' }">
                  <div><b>{{ event.actor }}</b><time>{{ dateText(event.at) }}</time></div>
                  <strong>{{ event.title }}</strong><p v-if="event.detail && event.detail !== event.title">{{ event.detail }}</p>
                </li>
              </ol><p v-else class="muted">暂无处理记录</p>
            </section>
            <PostOrderFacts v-if="record.inquiry" :record="record" />
            <PaymentEvidence v-if="record.payment" :record="record" section="evidence" />
            <DisputeServiceContext ref="mailCard" :record="record" section="mail" />
            <PaymentEvidence v-if="record.payment" :record="record" section="return" />
          </div>
        </div>
        <p class="synced">最近同步 {{ dateText(record.syncedAt) }}</p>
      </main>
      <aside class="operation-pane" aria-label="纠纷办理栏">
        <DisputeHandling :record="record" />
        <DisputeServiceContext :record="record" section="note" class="internal-note-context" />
        <section v-prototype="disputeAnnotations.operationLogs" class="panel operation-log-panel">
          <OperationLogs :key="JSON.stringify([record.shopId, record.kind, record.id])" :entries="record.operationLogs || []" :format-time="dateText" />
        </section>
      </aside>
    </div>
  </article>
</template>

<style scoped>
.dispute-detail{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#303a49;font-size:13px}
.page-bar,.page-tools,.identity-row,.case-number,.metadata,.identity-meta{display:flex;align-items:center}
.page-bar{flex:none;justify-content:space-between;gap:12px;padding:10px 18px;min-height:54px;box-sizing:border-box;border-bottom:1px solid #e5e9ee}
.page-bar h1,.panel h2{margin:0;color:var(--yy-text-heading);line-height:1.45}.page-bar h1{font-size:17px}.page-tools{gap:8px;flex-wrap:wrap}.page-tools :deep(.el-button){margin:0}
.workbench{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 460px}
.reading-pane,.operation-pane{min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain}
.reading-pane{padding:19px 20px}.operation-pane{padding:20px 17px;border-left:1px solid #dfe5ec;background:#fbfcfe}.operation-pane>:last-child{margin-top:22px}
.identity-row{justify-content:space-between;gap:12px}.case-number{gap:8px;min-width:0}.case-number>span,.identity-meta,.metadata,.synced,.muted{color:#647386}
.case-number>span{font-size:12px}.case-number strong{font-size:19px;color:var(--yy-text-heading);line-height:1.4}
.metadata{gap:8px;margin-top:4px;flex-wrap:wrap;font-size:12px}.metadata b{font-weight:550;color:#43536a}.identity-meta{gap:3px 13px;flex-wrap:wrap;margin:3px 0 9px;font-size:12px}
.identity-meta button,.link-button{border:0;padding:0;background:transparent;font:inherit;color:var(--el-color-primary);cursor:pointer;overflow-wrap:anywhere;text-align:left}
.identity-meta button:hover,.link-button:hover{text-decoration:underline}
.status-summary{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:12px;padding:13px 16px;background:#f3f8fd;border:1px solid #dfe9f2;border-radius:4px;margin:0 0 16px}
.status-summary.single-task{grid-template-columns:1fr}.status-summary>div{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0;overflow-wrap:anywhere}
.status-summary>div+div{padding-left:16px;border-left:1px solid #dce6f0}.status-summary small,.status-summary span{font-size:12px;color:#607186}
.status-summary strong{font-size:14px;line-height:1.85;margin:2px 0;color:var(--yy-text-heading)}.status-summary strong.overdue{color:#b64726}
.status-summary small,.status-summary span{line-height:1.6}
.operation-pane>.internal-note-context{margin-top:20px}
.reading-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.reading-stack{display:flex;flex-direction:column;min-width:0;gap:14px}
.panel{min-width:0;padding:16px;border:1px solid #e4e8ed;border-radius:5px;overflow-wrap:anywhere;font-size:12px;line-height:1.65}
.panel h2{font-size:14px;margin:0 0 15px}.case-history ol{list-style:none;margin:0;padding:0}.case-history li{background:#f8fafb;border:1px solid #e6ebf0;border-radius:4px;padding:10px 12px}.case-history li+li{margin-top:10px}.case-history li.seller-event{background:#edf5fe;border-color:#dceaf7}
.case-history li>div{display:flex;gap:4px 8px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}.case-history b,.case-history strong{color:var(--yy-text-heading)}.case-history li>strong{display:block;font-weight:500;margin-top:5px}.case-history time{font-size:11px;color:#67768a}.case-history p{margin:5px 0 0;white-space:pre-wrap}
.origins{border-top:1px solid #e8ecf0;margin-top:12px;padding-top:9px}.origins>div{display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap}.origins>div>span:first-child{color:#687687}
.linked-sale{display:grid;justify-items:start;gap:3px;border-top:1px solid #edf0f4;padding-top:9px}.synced{font-size:11px;margin:14px 0 0}
.operation-log-panel{margin-top:14px!important}.operation-log-panel :deep(.service-operation-logs){margin-top:0;padding-top:0;border-top:0}
@media(max-width:1350px){.reading-pane{padding:16px}.reading-columns{gap:12px}.operation-pane{padding:16px}.panel{padding:14px}}
@media(max-width:1050px){.reading-columns{grid-template-columns:1fr}.workbench{grid-template-columns:minmax(0,1fr) 380px}}
@media(max-width:760px){.workbench{display:block;overflow:auto}.reading-pane,.operation-pane{overflow:visible;scrollbar-gutter:auto}.operation-pane{border-left:0;border-top:1px solid #dfe5ec}.page-bar{padding:8px 10px;flex-wrap:wrap}.reading-pane{padding:12px}.case-number strong{font-size:16px}.status-summary{padding:10px;gap:8px}}
</style>
