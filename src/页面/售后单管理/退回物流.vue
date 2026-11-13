<script setup lang="ts">
import { computed } from 'vue'
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import NumberCopy from '@/组件/单号复制.vue'
import { formatReturnTime, type ReturnRecord } from '../eBay退换货申请/模型'
import type { ReturnAddress, ReturnShipment } from '../eBay退换货申请/接口契约'
import { originalAttachmentUrl } from '../eBay退换货申请/附件媒体'
import ReturnLabelData from '../eBay退换货申请/面单返回资料.vue'
import { afterSaleAnnotation as annotation } from './标注'

const props = defineProps<{ row?: ReturnRecord; issue?: string }>()
const detail = computed(() => props.row?.detail)
const read = computed(() => detail.value?.readStatus.detail)
const blocked = computed(() => props.issue || (!props.row ? '未找到可靠的来源申请，请核对来源后查询。' : detail.value?.contentOnHold ? '平台已隐藏本申请内容，退回物流暂不可查看。' : ''))
// 读取失败时只展示有成功读取时间的历史资料，并在表格之前明确标识；隐藏内容不回填。
const canShow = computed(() => !blocked.value && !!detail.value && (read.value?.status === 'success' || !!read.value?.succeededAt))
const shipments = computed(() => canShow.value ? detail.value!.shipments : [])
const stale = computed(() => canShow.value && read.value?.status !== 'success')
const time = (value?: string | null) => formatReturnTime(value)
const statuses: Record<string, string> = { DELIVERED: '已送达', IN_TRANSIT: '运输中', UNKNOWN: '状态待核实', LABEL_CREATED: '面单已生成', SHIPPED: '已寄出' }
function status(shipment: ReturnShipment) {
  const value = shipment.readStatus === 'success' && shipment.trackingStatus ? shipment.trackingStatus : shipment.deliveryStatus
  return statuses[value] || value || '状态待核实'
}
const shipmentKey = (shipment: ReturnShipment) => JSON.stringify([shipment.shipmentId, shipment.carrierUsed || shipment.carrierEnum, shipment.trackingNumber])
const address = (value: ReturnAddress | null) => value ? [value.name, value.addressLine1, value.addressLine2, value.city, value.stateOrProvince, value.postalCode, value.country].filter(Boolean).join(' · ') : '未提供'
function labelUrl(shipment: ReturnShipment) {
  if (!canShow.value || stale.value || detail.value?.readStatus.files.status !== 'success') return ''
  const file = detail.value.files.find(value => value.fileId === shipment.labelFileId && value.filePurpose === 'LABEL_RELATED' && ['CREATED', 'PUBLISHED'].includes(value.fileStatus))
  return file ? originalAttachmentUrl(file) : ''
}
</script>

<template>
  <section v-prototype="annotation('returnShipping')" class="return-shipping detail-section" aria-label="来源申请的退回物流">
    <div class="heading"><h3>退回物流</h3><span>来源申请 {{ row?.id || '待核实' }}</span></div>
    <p class="scope-note">来源申请的退回运单；未按本次处理商品分摊。物流送达、卖家确认收货与仓库实收分别核实。</p>
    <p v-if="blocked" class="warning" role="status">{{ blocked }}</p>
    <p v-else-if="!canShow" class="warning" role="status">{{ read?.error || '退回物流尚未取得，请刷新办理结果。' }}</p>
    <template v-else>
      <p v-if="stale" class="warning" role="status">{{ read?.error || '本次申请详情读取未成功' }}；以下为上次成功读取资料（{{ time(read?.succeededAt) }}），当前情况待核实。</p>
      <ElTable v-if="shipments.length" :data="shipments" :row-key="shipmentKey" border size="small" aria-label="退回运单列表">
        <ElTableColumn type="expand" width="38"><template #default="{ row: shipment }">
          <div class="shipment-extra">
            <dl>
              <dt>卖家确认收货</dt><dd>{{ shipment.markAsReceived ? '已确认' : '尚未确认' }}</dd>
              <dt>运单始发地</dt><dd>{{ address(shipment.originAddress) }}</dd>
              <dt>运单目的地</dt><dd>{{ address(shipment.destinationAddress) }}</dd>
              <template v-if="shipment.minDeliveryEstimate || shipment.maxDeliveryEstimate"><dt>预计到达时间</dt><dd>{{ time(shipment.minDeliveryEstimate) }} ～ {{ time(shipment.maxDeliveryEstimate) }}</dd></template>
              <dt>面单 ID</dt><dd><NumberCopy :value="shipment.labelId" label="面单 ID" /></dd>
              <dt>退货面单</dt><dd><a v-if="labelUrl(shipment as ReturnShipment)" :href="labelUrl(shipment as ReturnShipment)" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">查看面单</a><span v-else>{{ shipment.labelFileId ? '面单未取得、已失效或读取待核实' : '未提供关联面单文件' }}</span></dd>
            </dl>
            <p v-if="shipment.errorCode" class="warning">物流错误代码：{{ shipment.errorCode }}</p>
            <details class="tracking"><summary>查看退回轨迹（{{ shipment.readStatus === 'success' ? shipment.scans.length : '待核实' }}）</summary>
              <p v-if="shipment.readStatus !== 'success'" class="warning">{{ shipment.trackingRead?.error || '退回轨迹尚未读取成功，请刷新办理结果。' }}<span v-if="shipment.trackingRead?.succeededAt"> 上次成功读取：{{ time(shipment.trackingRead.succeededAt) }}</span></p>
              <ol v-else-if="shipment.scans.length"><li v-for="(scan, index) in shipment.scans" :key="index"><time>{{ time(scan.at) }}</time><div>{{ scan.description }}</div><small>{{ scan.location }}</small></li></ol>
              <p v-else class="muted">承运商暂无轨迹。</p>
            </details>
          </div>
        </template></ElTableColumn>
        <ElTableColumn label="承运商" min-width="88"><template #default="{ row: shipment }">{{ shipment.carrierName || shipment.carrierUsed || shipment.carrierEnum || '待核实' }}</template></ElTableColumn>
        <ElTableColumn label="退货跟踪号" min-width="168"><template #default="{ row: shipment }"><NumberCopy :value="shipment.trackingNumber" label="退货跟踪号" /></template></ElTableColumn>
        <ElTableColumn label="运输状态" min-width="100"><template #default="{ row: shipment }"><ElTag size="small" :type="stale ? 'warning' : 'info'">{{ status(shipment as ReturnShipment) }}</ElTag><small v-if="stale" class="stale-label">上次资料</small></template></ElTableColumn>
        <ElTableColumn label="寄出 / 送达时间" min-width="154"><template #default="{ row: shipment }"><div>寄出 {{ time(shipment.actualShipDate) }}</div><div>送达 {{ time(shipment.actualDeliveryDate) }}</div></template></ElTableColumn>
      </ElTable>
      <p v-else class="empty">{{ row?.keepItem ? '当前申请无需寄回商品，暂无退回运单。' : '来源申请暂无退回运单。' }}</p>
      <ReturnLabelData v-if="row && !stale" :row="row" />
    </template>
  </section>
</template>

<style scoped>
.return-shipping { min-width: 0; font-size: 12px; }
.heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.heading h3 { margin: 0; color: var(--yy-text-heading); font-size: 14px; }
.heading span,.scope-note,.muted,.stale-label,time,small { color: #687587; }
.scope-note { margin: 9px 0 13px; line-height: 1.65; }
.warning { margin: 10px 0; padding: 9px 12px; background: #fff8e9; color: #935c11; line-height: 1.75; border-radius: 4px; overflow-wrap: anywhere; }
.shipment-extra { padding: 14px 18px; background: #fafbfd; }
dl { display: grid; grid-template-columns: 105px minmax(0,1fr); gap: 9px 12px; margin: 0; line-height: 1.7; }
dt { color: #687587; } dd { margin: 0; overflow-wrap: anywhere; }
a,summary { color: #176dc9; cursor: pointer; } a { text-decoration: none; }
.tracking { margin-top: 12px; } .tracking ol { padding-left: 18px; margin-bottom: 0; } .tracking li { padding: 8px 0; line-height: 1.7; overflow-wrap: anywhere; }
.empty { background: #f7f8fa; padding: 12px; color: #687587; text-align: center; }
.stale-label { display: block; font-size: 11px; }
.return-shipping :deep(th.el-table__cell) { color: var(--yy-text-heading); background: #f7f8fa; }
.return-shipping :deep(.el-table) { font-size: 12px; }
.return-shipping :deep(.cell) { line-height: 1.7; overflow-wrap: anywhere; }
</style>
