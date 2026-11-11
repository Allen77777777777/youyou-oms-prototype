<script setup lang="ts">
import { computed } from 'vue'
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import CopyNumber from '@/组件/单号复制.vue'
import { getReturnDetail, formatReturnTime, isEscalated, isReturnClosed, isReturnTimePast, type ReturnRecord } from './模型'
import { activityNames, type ReturnAddress, type ReturnAttachment, type ReturnShipment } from './接口契约'
import { booleanText, feeLabels, reasonTypeText, refundStatusLabels, returnTypeText } from './展示工具'
import { originalAttachmentUrl } from './附件媒体'
import { returnAnnotation as annotation } from './标注'
import ReturnAttachments from './申请附件.vue'
import ReturnMoney from './金额资料.vue'
import ReturnLabelData from './面单返回资料.vue'
import { refundAmountFixed, refundRangeText, refundSubmissionBlock, type ReturnRefundItem } from './接口契约'
const props = defineProps<{ row: ReturnRecord; area: 'status' | 'application' | 'refund' | 'shipping' | 'aside'; orderAddress?: ReturnAddress | null }>()
const detail = computed(() => getReturnDetail(props.row))
const refundBlock = computed(() => {
  if (isReturnClosed(props.row) || isEscalated(props.row)) return ''
  if (detail.value.readStatus.summary.status !== 'success' || detail.value.readStatus.detail.status !== 'success' || !props.row.options.includes('SELLER_ISSUE_REFUND')) return ''
  return refundSubmissionBlock(detail.value.refund)
})
const returnClosed = computed(() => isReturnClosed(props.row))
const hasSourceValue = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0
const hasEscalationInfo = computed(() => props.row.escalation.eligible === true || hasSourceValue(props.row.escalation.start) || hasSourceValue(props.row.escalation.end))
const hasPlatformTimeLimits = computed(() => hasSourceValue(detail.value.timeoutAt) || hasEscalationInfo.value)
const time = (value?: string | null) => formatReturnTime(value, props.row)
const activity = (value: string) => activityNames[value] || value
const late = isReturnTimePast
const sourceLabels = { summary: '状态与操作资格', detail: '申请详情', files: '附件', tracking: '退回轨迹' }
const readIssues = computed(() => Object.entries(detail.value.readStatus).filter(([,value]) => value.status !== 'success'))
const initiators: Record<string,string> = { SELLER_INITIATED: '卖家发起', AUTO_REFUND: '平台自动退款' }
const closeReasons: Record<string,string> = { FULL_REFUNDED: '已全额退款', PARTIALLY_REFUNDED: '已部分退款', REQUEST_DECLINED: '退货申请被拒绝', AUTO_REFUNDED: '平台已自动退款', BUYER_CLOSED: '买家关闭申请', SELLER_DECLINED: '卖家拒绝退货', OTHER: '其他原因' }
const buyerCloseReasons: Record<string,string> = { BUYER_NO_LONGER_WANTS_RETURN: '买家不再需要退货', UNKNOWN: '原因未知' }
const holdStatuses: Record<string,string> = { HOLD_CREATION_SUCCESS: '暂缓处理中' }
const shipmentStatuses: Record<string,string> = { DELIVERED: '已送达', IN_TRANSIT: '运输中', UNKNOWN: '状态待核实', LABEL_CREATED: '面单已生成', SHIPPED: '已寄出' }
const shipmentStatus = (shipment: ReturnShipment) => { const value = shipment.readStatus === 'success' && shipment.trackingStatus ? shipment.trackingStatus : shipment.deliveryStatus; return shipmentStatuses[value] || value || '物流状态待核实' }
const roles: Record<string,string> = { BUYER: '买家', SELLER: '卖家', EBAY: 'eBay', SYSTEM: '平台系统', OTHER: '其他来源' }
const fundingTypes: Record<string,string> = { AVAILABLE_FUNDS: '可用资金', CREDIT_CARD: '信用卡', DIRECT_DEBIT: '直接扣款', PAY_UPON_INVOICE: '按账单付款' }
const fundingStatuses: Record<string,string> = { FUNDED: '已提供资金', FAILED: '资金提供失败' }
const shippingCostTypes: Record<string,string> = { LABEL_COST: '面单费用', INSURANCE: '保险费', SIGNATURE_CONFIRMATION_COST: '签收确认费', OTHER: '其他费用' }
const fileUrl = (file: ReturnAttachment): string => detail.value.contentOnHold || detail.value.readStatus.files.status !== 'success' || !['CREATED', 'PUBLISHED'].includes(file.fileStatus) ? '' : originalAttachmentUrl(file)
const labelFile = (fileId?: string) => detail.value.files.find(file => file.fileId === fileId && file.filePurpose === 'LABEL_RELATED')
const addressText = (address: ReturnAddress) => [address.addressLine1, address.addressLine2, [address.city, address.stateOrProvince, address.postalCode].filter(Boolean).join(', '), address.country].filter(Boolean).join('\n')
const shipmentAddress = (address: ReturnAddress | null) => address ? [address.name,addressText(address)].filter(Boolean).join('\n') : '未提供'
const addresses = computed(() => [
  { label: '买家默认收货地址', source: '退货申请资料', value: detail.value.buyerAddress },
  { label: '原订单收货地址', source: '关联订单资料', value: props.orderAddress || null },
  { label: '卖家退货地址资料', source: '退货申请资料', value: detail.value.sellerAddress },
])
const refundIssues = computed(() => {
  const refund = detail.value.refund, issues = [...(refund.integrityIssues || [])]
  if (!issues.length) {
    if (refund.actualItemsComplete === false && (refund.actualItems.length || refund.actualTotal)) issues.push('实际退款分项不完整，请核实来源资料。')
    else if (refund.actualTotalMatches === false) issues.push('实际退款分项合计与退款实际总额不一致，请核实。')
  }
  return [...new Set(issues)]
})
const keepItemText = computed(() => detail.value.keepItemInfo?.value === true ? '买家保留商品，无需寄回' : detail.value.keepItemInfo?.value === false ? '买家退回商品' : '商品去向待核实')
const keepItemSource = computed(() => ({ state: '平台当前阶段', history: '平台处理历史', unknown: '来源待核实', conflict: '来源存在冲突' } as Record<string,string>)[detail.value.keepItemInfo?.source || 'unknown'])
</script>

<template>
  <div v-if="area === 'status'" class="return-source-status">
    <div v-if="readIssues.length" class="read-warning" role="status"><strong>部分资料尚未完成刷新</strong><span v-for="[key,value] in readIssues" :key="key">{{ sourceLabels[key as keyof typeof sourceLabels] }}：{{ value.error || (value.status === 'failed' ? '读取失败，保留上次资料' : '尚未取得') }}</span></div>
    <section v-if="!returnClosed" v-prototype="annotation('responsibility')" class="responsibility-panel">
      <div><small>卖家当前待办</small><strong>{{ detail.readStatus.summary.status !== 'success' ? '当前待办待核实' : detail.sellerDue ? activity(detail.sellerDue.activity) : '暂无待办' }}</strong><span :class="{ overdue: detail.sellerDue && late(detail.sellerDue.at) }">{{ detail.sellerDue?.at ? '截止 ' + time(detail.sellerDue.at) : '未提供截止时间' }}</span></div>
      <div><small>买家当前待办</small><strong>{{ detail.readStatus.summary.status !== 'success' ? '当前待办待核实' : detail.buyerDue ? activity(detail.buyerDue.activity) : '暂无待办' }}</strong><span>{{ detail.buyerDue?.at ? '截止 ' + time(detail.buyerDue.at) : '未提供截止时间' }}</span></div>
      <dl v-if="hasPlatformTimeLimits" class="platform-time-limits">
        <template v-if="hasSourceValue(detail.timeoutAt)"><dt>平台可能关闭时间</dt><dd>{{ time(detail.timeoutAt) }}</dd></template>
        <template v-if="hasEscalationInfo">
          <dt>卖家介入资格</dt><dd>{{ detail.readStatus.summary.status !== 'success' || typeof row.escalation.eligible !== 'boolean' ? '资格待核实' : row.escalation.eligible ? '具备资格' : '不具备资格' }}</dd>
          <template v-if="hasSourceValue(row.escalation.start)"><dt>介入开始时间</dt><dd>{{ time(row.escalation.start) }}</dd></template>
          <template v-if="hasSourceValue(row.escalation.end)"><dt>介入结束时间</dt><dd>{{ time(row.escalation.end) }}</dd></template>
        </template>
      </dl>
    </section>
    <p v-if="detail.contentOnHold" class="read-warning">平台已隐藏本申请部分内容，隐藏资料不从历史缓存补回。</p>
    <details v-if="detail.holdInfo" v-prototype="annotation('hold-detail')" class="detail-panel hold-panel"><summary>平台暂缓处理：{{ holdStatuses[detail.holdInfo.status] || detail.holdInfo.status || '状态待核实' }}</summary><dl><dt>创建时间</dt><dd>{{ time(detail.holdInfo.createdAt) }}</dd><dt>预计解除时间</dt><dd>{{ time(detail.holdInfo.until) }}</dd><template v-if="detail.holdInfo.reason"><dt>来源说明</dt><dd>{{ detail.holdInfo.reason }}</dd></template><dt>暂缓参考 ID</dt><dd><CopyNumber :value="detail.holdInfo.referenceId" label="暂缓参考 ID" /></dd><dt>暂缓交易 ID</dt><dd><CopyNumber :value="detail.holdInfo.transactionId" label="暂缓交易 ID" /></dd></dl></details>
    <section v-if="returnClosed && detail.closeInfo" v-prototype="annotation('responsibility')" class="detail-panel close-panel"><h3>申请关闭结果</h3><dl><dt>关闭时间</dt><dd>{{ time(detail.closeInfo.at) }}</dd><dt>平台关闭原因</dt><dd :title="detail.closeInfo.reason">{{ closeReasons[detail.closeInfo.reason] || detail.closeInfo.reason || '未提供' }}</dd><dt>买家关闭原因</dt><dd :title="detail.closeInfo.buyerReason">{{ buyerCloseReasons[detail.closeInfo.buyerReason] || detail.closeInfo.buyerReason || '未提供' }}</dd><dt>买家说明</dt><dd>{{ detail.contentOnHold ? '平台已隐藏内容' : detail.closeInfo.buyerComment || '未提供' }}</dd></dl></section>
  </div>
  <section v-else-if="area === 'application'" v-prototype="annotation('application')" class="detail-panel application-panel"><h3>申请信息</h3><dl class="application-fields"><dt>当前诉求</dt><dd>{{ returnTypeText(detail.currentType) }}</dd><dt>初始诉求</dt><dd>{{ returnTypeText(row.returnType) }}</dd><dt>退货原因</dt><dd>{{ row.reason || '未提供' }}</dd><dt>原因类型</dt><dd>{{ reasonTypeText(row.reasonType) }}</dd><dt>申请时间</dt><dd>{{ time(row.createdAt) }}</dd><dt>RMA 策略</dt><dd>{{ detail.rmaRequired === null ? '待核实' : detail.rmaRequired ? '要求提供编号' : '无需提供编号' }}<span v-if="detail.rmaNumber"> · {{ detail.rmaNumber }}</span></dd><dt>商品去向</dt><dd>{{ keepItemText }}<small v-if="detail.keepItemInfo" class="field-source">{{ keepItemSource }}</small></dd></dl><p v-if="detail.keepItemInfo?.source === 'conflict'" class="read-warning">{{ detail.keepItemInfo.note || '商品去向来源存在冲突，请核实。' }}</p><slot name="order-context" /><div class="buyer-comment"><small>买家申请说明</small><p>{{ detail.contentOnHold ? '平台已隐藏内容' : detail.buyerComment || '买家未提供文字说明' }}</p></div></section>
  <section v-else-if="area === 'refund'" v-prototype="annotation('refund-detail')" class="detail-panel refund-detail-panel">
    <h3>退款信息 <ElTag v-if="detail.refund.status" size="small" :type="detail.refund.status === 'FAILED' ? 'danger' : detail.refund.status === 'SUCCESS' ? 'success' : 'warning'">{{ refundStatusLabels[detail.refund.status] || detail.refund.status }}</ElTag></h3>
    <div class="refund-totals"><div><small>卖家预计承担</small><strong><ReturnMoney :value="detail.refund.sellerEstimated" /></strong></div><div><small>买家预计所得</small><strong><ReturnMoney :value="detail.refund.buyerEstimated" /></strong></div><div><small>卖家实际退款</small><strong><ReturnMoney :value="detail.refund.sellerActual" /></strong></div><div><small>买家实际所得</small><strong><ReturnMoney :value="detail.refund.buyerActual" /></strong></div><div><small>退款实际总额</small><strong><ReturnMoney :value="detail.refund.actualTotal" /></strong></div><div><small>卖家实际扣款</small><strong><ReturnMoney :value="detail.refund.netChargeAmount" /></strong></div><div><small>费用抵扣／返还</small><strong><ReturnMoney :value="detail.refund.feeCreditAmount" /></strong></div></div>
    <div v-if="refundIssues.length" class="read-warning" role="status"><span v-for="issue in refundIssues" :key="issue">{{ issue }}</span></div>
    <ElTable v-if="detail.refund.items.length" :data="detail.refund.items" border class="refund-items"><ElTableColumn label="退款费用" min-width="140"><template #default="{ row: item }">{{ item.label }}<small v-if="item.optional" class="optional">可选</small></template></ElTableColumn><ElTableColumn label="预计金额" min-width="110"><template #default="{ row: item }">{{ item.currency }} {{ item.estimated }}<small v-if="refundAmountFixed(item as ReturnRefundItem)" class="optional">固定金额</small></template></ElTableColumn><ElTableColumn label="允许范围" min-width="140"><template #default="{ row: item }">{{ refundRangeText(item as ReturnRefundItem) }}</template></ElTableColumn></ElTable>
    <p v-else class="muted">退款分项尚未取得，不能用预计总额代替本次退款。</p>
    <p v-if="refundBlock" class="read-warning">平台提供退款选项。{{ refundBlock }}。</p>
    <dl class="refund-meta"><dt>资金发起来源</dt><dd>{{ initiators[detail.refund.initiator || ''] || detail.refund.initiator || '未提供' }}</dd><dt>退款时间</dt><dd>{{ time(detail.refund.issuedAt) }}</dd><dt>剩余待退</dt><dd><ReturnMoney :value="detail.refund.outstanding" /></dd></dl>
    <p v-if="detail.refund.provisional" class="read-warning">{{ detail.refund.provisional }}</p><p v-if="detail.refund.recoup" class="read-warning">{{ detail.refund.recoup }}</p>
    <details v-if="detail.refund.actualItems.length || detail.refund.moneyMovements.length || detail.refund.fundings?.length" class="money-history"><summary>查看实际退款与资金记录</summary><p v-if="detail.refund.actualTotalMatches === true" class="muted">实际退款分项与退款实际总额一致。</p><p v-else-if="detail.refund.actualTotalMatches === null && detail.refund.actualItems.length" class="muted">实际退款分项一致性待核实。</p><div v-for="(item,index) in detail.refund.actualItems" :key="'actual'+index" class="plain-row"><span>{{ feeLabels[item.refundFeeType] || item.refundFeeType }}</span><strong><ReturnMoney :value="item.amount" /></strong></div><div v-for="item in detail.refund.moneyMovements" :key="item.id" class="plain-row"><span>{{ item.type }} · {{ item.status }}<small>{{ time(item.at) }}</small><small v-if="item.id">资金记录引用 {{ item.id }}</small></span><span class="movement-money"><small v-if="item.requestedAmount">请求金额 <ReturnMoney :value="item.requestedAmount" /></small><strong>实际金额 <ReturnMoney :value="item.actualAmount || item.amount" /></strong></span></div><section v-if="detail.refund.fundings?.length" class="funding-section"><h4>资金来源</h4><article v-for="(funding,index) in detail.refund.fundings" :key="index" class="funding-card"><dl><dt>资金类型</dt><dd>{{ fundingTypes[funding.fundingSource?.type || ''] || funding.fundingSource?.type || '未提供' }}</dd><dt>资金品牌</dt><dd>{{ funding.fundingSource?.brand || '未提供' }}</dd><dt>资金状态</dt><dd>{{ fundingStatuses[funding.fundingStatus] || funding.fundingStatus || '未提供' }}</dd><dt>资金金额</dt><dd><ReturnMoney :value="funding.amount" /></dd><dt>资金时间</dt><dd>{{ time(funding.at) }}</dd></dl></article></section></details>
  </section>
  <section v-else-if="area === 'shipping'" v-prototype="annotation('return-shipping')" class="detail-panel return-shipping-panel">
    <h3>退货物流</h3><dl><dt>退回进度</dt><dd>{{ row.shipping }}</dd><dt>运费承担方</dt><dd>{{ detail.shippingPayer ? roles[detail.shippingPayer] || detail.shippingPayer : '待核实' }}</dd><dt>退货授权编号</dt><dd><CopyNumber :value="detail.rmaNumber" label="退货授权编号" /></dd></dl>
    <details v-if="detail.shippingLabelCost" class="shipping-costs"><summary>退回面单费用</summary><div class="plain-row"><span>面单费用合计</span><strong><ReturnMoney :value="detail.shippingLabelCost.totalAmount" /></strong></div><div v-for="(cost,index) in detail.shippingLabelCost.itemizedCosts" :key="index" class="plain-row"><span>{{ shippingCostTypes[cost.costType] || cost.costType || '费用类型待核实' }}</span><ReturnMoney :value="cost.amount" /></div></details>
    <div v-for="shipment in detail.shipments" :key="JSON.stringify([shipment.shipmentId,shipment.carrierEnum,shipment.trackingNumber])" class="shipment-card">
      <header><strong>{{ shipment.carrierName || shipment.carrierUsed || shipment.carrierEnum || '承运商待核实' }}</strong><ElTag size="small">{{ shipmentStatus(shipment) }}</ElTag></header><div class="shipment-number"><CopyNumber :value="shipment.trackingNumber" label="退货跟踪号" /></div>
      <dl><dt>寄出时间</dt><dd>{{ time(shipment.actualShipDate) }}</dd><dt>送达时间</dt><dd>{{ time(shipment.actualDeliveryDate) }}</dd><template v-if="shipment.minDeliveryEstimate || shipment.maxDeliveryEstimate"><dt>预计到达时间</dt><dd>{{ time(shipment.minDeliveryEstimate) }}<span v-if="shipment.maxDeliveryEstimate"> ～ {{ time(shipment.maxDeliveryEstimate) }}</span></dd></template><dt>卖家确认收货</dt><dd>{{ shipment.markAsReceived ? '已确认' : '尚未确认' }}</dd><dt>本运单始发地</dt><dd class="address-text">{{ shipmentAddress(shipment.originAddress) }}</dd><dt>本运单目的地</dt><dd class="address-text">{{ shipmentAddress(shipment.destinationAddress) }}</dd></dl>
      <p v-if="shipment.errorCode" class="read-warning">物流错误代码：{{ shipment.errorCode }}，请核实承运商资料。</p><p v-if="shipment.labelFileId" class="shipment-label"><span>退货面单：</span><a v-if="labelFile(shipment.labelFileId) && fileUrl(labelFile(shipment.labelFileId)!)" :href="fileUrl(labelFile(shipment.labelFileId)!)" target="_blank" rel="noopener noreferrer">查看面单</a><span v-else class="muted">文件尚未取得或已失效</span></p>
      <details class="shipment-source"><summary>运输与面单资料</summary><dl><dt>运单 ID</dt><dd>{{ shipment.shipmentId || '未提供' }}</dd><dt>承运商来源值</dt><dd>{{ shipment.carrierUsed || shipment.carrierEnum || '未提供' }}</dd><dt>运输方式</dt><dd>{{ shipment.shippingMethod || '未提供' }}</dd><dt>寄件方</dt><dd>{{ roles[shipment.shippedBy || ''] || shipment.shippedBy || '未提供' }}</dd><dt>申请物流状态</dt><dd>{{ shipmentStatuses[shipment.deliveryStatus] || shipment.deliveryStatus || '未提供' }}</dd><dt>轨迹查询状态</dt><dd>{{ shipment.readStatus === 'success' ? shipmentStatuses[shipment.trackingStatus || ''] || shipment.trackingStatus || '未提供' : '尚未成功刷新' }}</dd><dt>运单有效</dt><dd>{{ booleanText(shipment.active) }}</dd><dt>面单 ID</dt><dd><CopyNumber :value="shipment.labelId" label="面单 ID" /></dd><dt>面单创建时间</dt><dd>{{ time(shipment.labelDate) }}</dd><dt>面单可用截止</dt><dd>{{ time(shipment.labelAvailableUntilDate) }}</dd><dt>面单打印已过期</dt><dd>{{ booleanText(shipment.labelPrintExpired) }}</dd><dt>面单作废已过期</dt><dd>{{ booleanText(shipment.labelVoidExpired) }}</dd></dl></details>
      <details class="tracking-details"><summary>查看退回轨迹（{{ shipment.scans.length }}）</summary><p v-if="shipment.readStatus !== 'success'" class="read-warning">{{ shipment.trackingRead?.error || (shipment.readStatus === 'failed' ? '轨迹读取失败，请刷新重试' : '轨迹尚未取得') }}</p><ol v-else-if="shipment.scans.length"><li v-for="(scan,index) in shipment.scans" :key="index"><time>{{ time(scan.at) }}</time><p>{{ scan.description }} <span class="muted">{{ scan.location }}</span></p><details v-if="scan.eventCode || scan.eventStatus || scan.eventCity || scan.eventPostalCode || scan.eventStateOrProvince" class="scan-source"><summary>扫描来源资料</summary><dl><dt>事件代码</dt><dd>{{ scan.eventCode || '未提供' }}</dd><dt>事件状态</dt><dd>{{ scan.eventStatus || '未提供' }}</dd><dt>城市</dt><dd>{{ scan.eventCity || '未提供' }}</dd><dt>州省</dt><dd>{{ scan.eventStateOrProvince || '未提供' }}</dd><dt>邮编</dt><dd>{{ scan.eventPostalCode || '未提供' }}</dd></dl></details></li></ol><p v-else class="muted">承运商暂无轨迹</p></details>
    </div>
    <p v-if="!detail.shipments.length" class="empty-inline">{{ row.keepItem ? '当前申请无需寄回商品' : '暂无退回运单资料' }}</p><ReturnLabelData :row="row" />
  </section>
  <template v-else-if="area === 'aside'">
    <ReturnAttachments :row="row" />
    <slot name="before-addresses" />
    <section v-prototype="annotation('addresses')" class="detail-panel addresses-panel"><h3>相关地址</h3><article v-for="address in addresses" :key="address.label" class="address-card"><header><strong>{{ address.label }}</strong><small>{{ address.source }}</small></header><template v-if="address.value"><p>{{ address.value.name }}</p><p class="address-text">{{ addressText(address.value) }}</p></template><p v-else class="muted">尚未取得</p></article><p class="muted">退回目的地以对应运单资料为准。</p></section>
  </template>
</template>

<style scoped>
.detail-panel{border:1px solid #e8ebef;border-radius:5px;padding:16px;margin-bottom:16px;min-width:0;font-size:12px;color:#303133}.detail-panel h3{margin:0 0 16px;font-size:14px;color:var(--yy-text-heading);display:flex;align-items:center;gap:8px}.detail-panel h4{font-size:12px;color:var(--yy-text-heading);margin:12px 0}.detail-panel dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px 10px;margin:0}.detail-panel dt,small,.muted{color:#909399}.detail-panel dd{margin:0;line-height:1.6;overflow-wrap:anywhere}.buyer-comment{border-top:1px solid #ebeef5;margin-top:16px;padding-top:12px}.buyer-comment p{white-space:pre-wrap;line-height:1.8;margin:7px 0 0}.responsibility-panel{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#f4f8ff;border:1px solid #dfeafb;border-radius:5px;margin-bottom:16px;padding:14px 16px}.responsibility-panel>div{display:flex;flex-direction:column;gap:7px;font-size:12px}.responsibility-panel strong{font-size:14px;color:#303133}.responsibility-panel>div+div{padding-left:16px;border-left:1px solid #dfeafb}.overdue{color:#c45656}.read-warning{background:#fff8e9;color:#986618;padding:10px 12px;line-height:1.8;font-size:12px;margin:0 0 12px;border-radius:4px}.read-warning span{display:block}.refund-totals{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.refund-totals div{display:flex;flex-direction:column;gap:8px}.refund-totals strong{font-size:16px;color:#303133;font-variant-numeric:tabular-nums}.refund-items{margin-bottom:16px;font-size:12px}.optional{margin-left:6px;font-size:10px}.refund-meta{margin:16px 0!important}.money-history summary,.tracking-details summary{cursor:pointer;color:#1677ff;font-size:12px}.plain-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #ebeef5;padding:12px 0}.movement-money{display:flex;flex-direction:column;gap:5px;text-align:right}.plain-row small{display:block;margin-top:6px}.shipment-card{margin-top:16px;border:1px solid #e8ebef;border-radius:4px;padding:14px}.shipment-card header{display:flex;align-items:center;justify-content:space-between;gap:8px}.shipment-label a{color:#1677ff;text-decoration:none}.shipment-number{margin:10px 0 16px;color:#1677ff}.tracking-details{margin-top:14px}.tracking-details ol{padding-left:18px}.tracking-details li{padding:8px 0}.tracking-details p{margin:6px 0}.tracking-details time{color:#909399}.address-text{white-space:pre-line;line-height:1.8;overflow-wrap:anywhere}.address-card{border-bottom:1px solid #ebeef5;padding:0 0 12px;margin-bottom:14px}.address-card:last-of-type{border-bottom:0;margin-bottom:0}.address-card header{display:flex;flex-direction:column;gap:5px}.address-card header strong{font-weight:500}.address-card p{margin:8px 0 0}.empty-inline{background:#fafbfc;padding:13px;text-align:center;color:#909399;border-radius:3px}.inline-error{color:#c45656}@media(max-width:1350px){.detail-panel{padding:14px}.responsibility-panel{padding:13px 14px}}@media(max-width:650px){.responsibility-panel{grid-template-columns:1fr}.responsibility-panel>div+div{border-left:0;border-top:1px solid #dfeafb;padding:12px 0 0}}
</style>
<style scoped>
.application-panel{container-type:inline-size;container-name:return-application}
@container return-application (min-width:600px){.application-panel>.application-fields{grid-template-columns:100px minmax(0,1fr) 100px minmax(0,1fr);gap:12px 8px}}
.responsibility-panel>div{min-width:0;overflow-wrap:anywhere}.platform-time-limits{display:grid;grid-column:1/-1;grid-template-columns:120px minmax(0,1fr) 120px minmax(0,1fr);gap:10px 8px;border-top:1px solid #dfeafb;padding-top:13px;margin:0;font-size:12px;line-height:1.7}.platform-time-limits dt{color:#909399}.platform-time-limits dd{margin:0;overflow-wrap:anywhere}.hold-panel summary{cursor:pointer;color:var(--yy-text-heading);line-height:1.7}.hold-panel dl{margin-top:16px}.refund-totals{grid-template-columns:repeat(2,minmax(0,1fr))}.refund-totals>div{min-width:0}.refund-totals strong{font-size:15px;overflow-wrap:anywhere}.refund-items{max-width:100%}.plain-row{overflow-wrap:anywhere}.plain-row>span,.plain-row>strong{min-width:0}.funding-card{padding:12px 0;border-bottom:1px solid #ebeef5}.funding-card:last-child{border:0}.shipment-card{min-width:0}.shipment-card header{flex-wrap:wrap;overflow-wrap:anywhere}.shipment-source,.shipping-costs{border-top:1px solid #ebeef5;padding-top:12px;margin-top:16px}.shipment-source summary,.shipping-costs summary,.scan-source summary{color:#1677ff;cursor:pointer;font-size:12px}.shipment-source dl,.scan-source dl{margin-top:14px}.scan-source{margin-top:10px}.shipment-card .read-warning{margin:14px 0 0}.tracking-details li{overflow-wrap:anywhere}.field-source{display:block;font-size:11px;margin-top:4px}.read-warning,.buyer-comment p{overflow-wrap:anywhere}@media(max-width:1350px){.platform-time-limits{grid-template-columns:120px minmax(0,1fr)}}
</style>


