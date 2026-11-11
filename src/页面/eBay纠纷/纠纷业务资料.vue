<script setup lang="ts">
import { computed } from 'vue'
import NumberCopy from '@/组件/单号复制.vue'
import { dateText, type DisputeRecord, type Money } from './模型'
import { caseSources } from './导航'
import { disputeAnnotations } from './标注'
import RefundBreakdown from './退款明细.vue'
import CaseFunds from './案件资金结果.vue'
import { paymentHasAnswered } from './支付争议证据'

const props = defineProps<{ record: DisputeRecord; section: 'issue' | 'refund' | 'goods' }>()
const title = { INR_REQUEST: '请求信息', EBAY_CASE: '案件信息', PAYMENT_DISPUTE: '争议信息' }
const annotation = computed(() => ({
  INR_REQUEST: disputeAnnotations.inquiry, EBAY_CASE: disputeAnnotations.case, PAYMENT_DISPUTE: disputeAnnotations.payment,
})[props.record.kind])
const money = (value?: Money) => value?.currency && value.value ? value.currency + ' ' + value.value : '—'
const packages = computed(() => {
  const info = props.record.inquiry
  return info?.trackings ?? (info?.tracking ? [{ carrier: info.carrier, tracking: info.tracking }] : [])
})
const goodsTitle = computed(() => ({
  INR_REQUEST: '本次请求涉及商品', EBAY_CASE: '本案涉及商品', PAYMENT_DISPUTE: '本次争议涉及商品',
})[props.record.kind])
const inquiryGoods = computed(() => props.record.kind === 'INR_REQUEST' ? props.record.inquiry?.lineItems || [] : [])
const paymentGoods = computed(() => props.record.kind === 'PAYMENT_DISPUTE' ? props.record.payment?.details?.lines || [] : [])
const hasGoods = computed(() => props.record.title || props.record.sku || packages.value.length || inquiryGoods.value.length || paymentGoods.value.length)
const hasRefund = computed(() => {
  const info = props.record.inquiry
  return !!info && !!(info.refundEstimate || info.refundStatus || info.refunds?.length ||
    info.refundFailure || info.refundOutcome || info.refundEstimateBreakdown ||
    info.provisionalRefund?.provided != null || info.provisionalRefund?.reversed != null)
})
</script>

<template>
  <section v-if="section === 'issue'" v-prototype="annotation" class="issue-card">
    <h2>{{ title[record.kind] }}</h2>
    <p v-if="record.inquiry?.inquiryContentOnHold || record.caseInfo?.caseContentOnHold" class="content-limited" role="status">平台限制展示部分商品资料，未返回的资料不显示。</p>
    <dl>
      <dt>{{ record.caseInfo ? '原申请问题' : record.inquiry ? '买家诉求' : '争议原因' }}</dt>
      <dd>{{ record.reason || '待核实' }}</dd>
      <template v-if="record.caseInfo">
        <dt>案件来源</dt><dd>{{ caseSources[record.caseInfo.type] }}</dd>
        <dt>介入发起方</dt><dd>{{ record.caseInfo.initiator || '待核实' }}</dd>
        <dt>介入原因</dt><dd>{{ record.caseInfo.escalationReason || '待核实' }}</dd>
        <template v-if="record.caseInfo.decision"><dt>当前裁决</dt><dd>{{ record.caseInfo.decision }}</dd></template>
        <template v-if="record.caseInfo.appeal"><dt>申诉进展</dt><dd>{{ record.caseInfo.appeal }}</dd></template>
        <template v-if="record.caseInfo.legacyClosure?.buyerReasonText || record.caseInfo.legacyClosure?.buyerReasonCode"><dt>买家关案原因</dt><dd>{{ record.caseInfo.legacyClosure.buyerReasonText || record.caseInfo.legacyClosure.buyerReasonCode }}</dd></template>
        <template v-if="record.caseInfo.legacyClosure?.sellerReasonText || record.caseInfo.legacyClosure?.sellerReasonCode"><dt>卖家关案原因</dt><dd>{{ record.caseInfo.legacyClosure.sellerReasonText || record.caseInfo.legacyClosure.sellerReasonCode }}</dd></template>
      </template>
      <template v-if="record.inquiry?.creationReason"><dt>开案原因</dt><dd>{{ record.inquiry.creationReason.text }}</dd></template>
      <template v-if="record.inquiry?.initiator || record.inquiry?.responder">
        <dt>发起方 / 回应方</dt><dd>{{ record.inquiry?.initiator || '待核实' }} / {{ record.inquiry?.responder || '待核实' }}</dd>
      </template>
      <template v-if="!record.payment && record.amount?.value">
        <dt>{{ record.inquiry ? '请求金额' : '案件金额' }}</dt><dd>{{ money(record.amount) }}</dd>
      </template>
      <template v-if="record.payment?.response">
        <dt>{{ paymentHasAnswered(record) ? '卖家答复' : '应答情况' }}</dt><dd class="response-detail">{{ record.payment.response }}
          <details v-if="record.payment.responseNote || record.payment.returnAddress"><summary>查看答复内容</summary>
            <p v-if="record.payment.responseNote">{{ record.payment.responseNote }}</p>
            <p v-if="record.payment.returnAddress">退回地址　{{ record.payment.returnAddress }}</p>
          </details>
        </dd>
      </template>
      <template v-if="record.payment?.outcome"><dt>付款机构裁决</dt><dd>{{ record.payment.outcome }}</dd></template>
      <dt>发起时间</dt><dd>{{ dateText(record.createdAt) }}</dd>
      <template v-if="record.inquiry?.closedAt"><dt>请求关闭时间</dt><dd>{{ dateText(record.inquiry.closedAt) }}</dd></template>
      <template v-if="record.inquiry?.resolutionEstimate"><dt>平台预计解决</dt><dd>{{ dateText(record.inquiry.resolutionEstimate) }}</dd></template>
    </dl>
    <slot name="origin" />
    <div v-if="record.buyerNote" class="buyer-statement">
      <small>{{ record.payment ? '买家陈述（争议通知）' : '买家申请说明' }}</small><p>{{ record.buyerNote }}</p>
    </div>
    <details class="raw-data"><summary>平台记录</summary><dl>
      <template v-if="record.status"><dt>平台状态原值</dt><dd>{{ record.status }}</dd></template>
      <template v-if="record.payment?.reasonCode || record.inquiry?.creationReason?.code"><dt>平台原因码</dt><dd>{{ record.payment?.reasonCode || record.inquiry?.creationReason?.code }}</dd></template>
      <template v-if="record.caseInfo?.referralReasonCode"><dt>介入原因码</dt><dd>{{ record.caseInfo.referralReasonCode }}</dd></template>
      <template v-if="record.caseInfo?.legacyClosure?.buyerReasonCode"><dt>买家关案原因码</dt><dd>{{ record.caseInfo.legacyClosure.buyerReasonCode }}</dd></template>
      <template v-if="record.caseInfo?.legacyClosure?.sellerReasonCode"><dt>卖家关案原因码</dt><dd>{{ record.caseInfo.legacyClosure.sellerReasonCode }}</dd></template>
      <dt>最近更新</dt><dd>{{ dateText(record.updatedAt) }}</dd>
    </dl></details>
    <CaseFunds v-if="record.caseInfo" :funds="record.caseInfo.funds" :appeal="record.caseInfo.legacyAppeal" />
  </section>
  <section v-else-if="section === 'goods' && hasGoods" v-prototype="disputeAnnotations.goods" class="issue-card scoped-goods">
    <h2>{{ goodsTitle }}</h2>
    <template v-if="inquiryGoods.length">
      <article v-for="(line,index) in inquiryGoods" :key="line.id || line.orderLineId || index" class="scoped-goods-row">
        <b v-if="line.title" class="goods-name">{{ line.title }}</b>
        <dl class="goods-fields">
          <template v-if="line.orderLineId"><dt>平台订单行</dt><dd><NumberCopy :value="line.orderLineId" label="平台订单行号" /></dd></template>
          <template v-else-if="line.id"><dt>请求商品行</dt><dd><NumberCopy :value="line.id" label="请求商品行号" /></dd></template>
          <template v-if="line.quantity != null"><dt>涉及数量</dt><dd>{{ line.quantity }}</dd></template>
        </dl>
      </article>
      <dl v-if="inquiryGoods.length === 1 && record.sku" class="goods-fields"><dt>系统 SKU</dt><dd><NumberCopy :value="record.sku" label="系统 SKU" /></dd></dl>
    </template>
    <template v-else-if="record.kind === 'PAYMENT_DISPUTE'">
      <div v-if="record.title" class="goods-summary"><small>商品摘要</small><b>{{ record.title }}</b></div>
      <dl v-if="record.sku" class="goods-fields"><dt>摘要系统 SKU</dt><dd><NumberCopy :value="record.sku" label="摘要系统 SKU" /></dd></dl>
      <article v-for="(line,index) in paymentGoods" :key="JSON.stringify([line.itemId,line.lineItemId,index])" class="scoped-goods-row">
        <dl class="goods-fields">
          <template v-if="line.itemId"><dt>平台商品编号</dt><dd><NumberCopy :value="line.itemId" label="平台商品编号" /></dd></template>
          <template v-if="line.lineItemId"><dt>平台订单行</dt><dd><NumberCopy :value="line.lineItemId" label="平台订单行号" /></dd></template>
        </dl>
      </article>
    </template>
    <template v-else>
      <div v-if="record.title" class="goods-summary"><small>{{ record.kind === 'EBAY_CASE' ? '来源申请商品摘要' : '商品摘要' }}</small><b>{{ record.title }}</b></div>
      <dl class="goods-fields">
        <template v-if="record.quantity != null"><dt>涉及数量</dt><dd>{{ record.quantity }}</dd></template>
        <template v-if="record.sku"><dt>系统 SKU</dt><dd><NumberCopy :value="record.sku" label="系统 SKU" /></dd></template>
      </dl>
    </template>
    <div v-if="packages.length" class="request-tracking">
      <h3>本次请求跟踪</h3>
      <dl><template v-for="(item,i) in packages" :key="i"><dt>包裹 {{ i + 1 }}</dt><dd>{{ item.carrier }} <NumberCopy :value="item.tracking" label="请求跟踪号" /></dd></template></dl>
    </div>
  </section>
  <section v-else-if="section === 'refund' && hasRefund && record.inquiry" class="issue-card">
    <h2>退款信息</h2>
    <dl>
      <template v-if="record.inquiry.refundEstimate"><dt>卖家侧预计退款</dt><dd class="money">{{ money(record.inquiry.refundEstimate) }}</dd></template>
      <template v-if="record.inquiry.refundStatus"><dt>退款进度</dt><dd>{{ record.inquiry.refundStatus }}</dd></template>
      <template v-if="record.inquiry.provisionalRefund?.provided != null"><dt>临时退款</dt><dd>{{ record.inquiry.provisionalRefund.provided ? '已提供' : '未提供' }}</dd></template>
      <template v-if="record.inquiry.provisionalRefund?.reversed != null"><dt>临时退款撤回</dt><dd>{{ record.inquiry.provisionalRefund.reversed ? '已撤回' : '未撤回' }}</dd></template>
    </dl>
    <details v-if="record.inquiry.refundEstimateBreakdown" class="refund-estimate" open><summary>预计退款明细</summary><RefundBreakdown :amounts="record.inquiry.refundEstimateBreakdown" estimated /></details>
    <div v-if="record.inquiry.refundOutcome === 'UNKNOWN'" class="content-limited" role="status">退款提交结果尚未确认，请继续核查本次办理结果。</div>
    <div v-if="record.inquiry.refundFailure" class="refund-failure" role="status">
      <h3>退款未成功</h3><p>{{ record.inquiry.refundFailure.message }}</p>
      <p>{{ record.inquiry.refundFailure.retryable ? '处理原因后，可重新核对本案退款资格。' : '当前退款条件不满足，请按平台指引处理后刷新。' }}</p>
      <details><summary>失败记录</summary><dl><dt>原因码</dt><dd>{{ record.inquiry.refundFailure.code }}</dd><template v-if="record.inquiry.refundFailure.at"><dt>记录时间</dt><dd>{{ dateText(record.inquiry.refundFailure.at) }}</dd></template></dl></details>
    </div>
    <div v-for="refund in record.inquiry.refunds" :key="refund.id" class="trade">
      <h3>平台退款记录</h3><dl><dt>退款编号</dt><dd><NumberCopy :value="refund.id" label="退款编号" /></dd>
        <dt>卖家侧退款总额</dt><dd>{{ money(refund.amount) }}</dd><dt>退款状态</dt><dd>{{ refund.status }}</dd></dl>
      <RefundBreakdown v-if="refund.breakdown" :amounts="refund.breakdown" />
      <div v-for="(funding,fundingIndex) in refund.fundings || []" :key="fundingIndex" class="funding">
        <h3>退款出资 {{ (refund.fundings?.length || 0) > 1 ? fundingIndex + 1 : '' }}</h3>
        <p v-if="funding.stateText || funding.stateCode">{{ funding.stateText || funding.stateCode }}</p>
        <div v-for="(execution,index) in funding.executions || []" :key="index" class="funding-execution"><dl>
          <template v-if="execution.amount"><dt>本次出资金额</dt><dd>{{ money(execution.amount) }}</dd></template>
          <template v-if="execution.attemptedAt"><dt>出资尝试</dt><dd>{{ dateText(execution.attemptedAt) }}</dd></template>
          <template v-if="execution.completedAt"><dt>执行结束</dt><dd>{{ dateText(execution.completedAt) }}</dd></template>
          <template v-if="execution.stateText || execution.stateCode"><dt>执行结果</dt><dd>{{ execution.stateText || execution.stateCode }}</dd></template>
          <template v-if="execution.paymentMethod"><dt>付款方式</dt><dd>{{ execution.paymentMethod }}</dd></template>
        </dl></div>
        <p class="funding-caption">执行结束时间不代表买家到账时间。</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.issue-card{min-width:0;padding:16px;border:1px solid #e4e8ed;border-radius:5px;background:#fff;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
h2,h3{color:var(--yy-text-heading);line-height:1.4}h2{margin:0 0 16px;font-size:14px}h3{font-size:12px;margin:0 0 8px}
dl{display:grid;grid-template-columns:88px minmax(0,1fr);gap:9px 10px;margin:0}dt,small{color:#657384}dd{margin:0}
.buyer-statement,.trade,.raw-data{border-top:1px solid #e8ecf0;margin-top:13px;padding-top:12px}
.buyer-statement p,.response-detail p{white-space:pre-wrap;margin:5px 0 0}.trade small,.trade-line small{display:inline-flex;align-items:center;flex-wrap:wrap;font-size:12px}
.raw-data summary,.response-detail summary{color:#657384;cursor:pointer;font-size:12px}.raw-data[open] dl{margin-top:10px}.money{font-size:15px;font-weight:600}
.goods-fields{margin-top:9px}
.scoped-goods-row+.scoped-goods-row,.goods-summary+.scoped-goods-row{margin-top:12px;padding-top:11px;border-top:1px solid #edf0f4}.goods-name{display:block;color:var(--yy-text-heading);font-weight:550}.goods-summary{display:flex;flex-direction:column;gap:3px}.goods-summary b{font-weight:550;color:var(--yy-text-heading)}.goods-summary small{font-size:11px}.request-tracking{margin-top:15px;padding-top:12px;border-top:1px solid #e8ecf0}.request-tracking h3{margin-bottom:10px}
.refund-estimate,.funding,.funding-execution{margin-top:12px;padding-top:10px;border-top:1px solid #edf0f4}.refund-estimate summary{cursor:pointer;color:var(--yy-text-heading);font-weight:500}
.content-limited,.refund-failure{padding:9px 11px;background:#fff7e8;border:1px solid #f3dfb8;border-radius:4px;color:#825a25;margin:0 0 13px}.refund-failure{margin:12px 0 0}.refund-failure p{margin:5px 0}.refund-failure details[open] dl{margin-top:8px}.refund-failure summary{cursor:pointer}.funding-caption{margin:9px 0 0;color:#657384;font-size:11px}
</style>
