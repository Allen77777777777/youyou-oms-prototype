<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { routerKey, type RouteLocationRaw } from 'vue-router'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { getOrderReturnProgress } from './关联办理资料'
import type { RelatedOrder } from './类型'

const props = defineProps<{ order?: RelatedOrder; compact?: boolean }>()
const router = inject(routerKey, null)
const expanded = ref(false)
const expandedInternal = ref<string[]>([])
const rows = computed(() => getOrderReturnProgress(props.order))
const visible = computed(() => props.compact && !expanded.value ? rows.value.slice(0, 1) : rows.value)
watch(() => props.order?.id, () => { expanded.value = false; expandedInternal.value = [] })
function open(location: RouteLocationRaw) { if (router) void router.push(location) }
function toggleInternal(id: string) { expandedInternal.value = expandedInternal.value.includes(id) ? expandedInternal.value.filter(value => value !== id) : [...expandedInternal.value, id] }
</script>

<template>
  <div class="return-progress" aria-label="平台申请与内部办理进展">
    <p v-if="!rows.length" class="progress-empty">暂无已关联平台申请</p>
    <article v-for="row in visible" :key="row.returnId" class="return-progress-card" :data-return-progress="row.returnId">
      <div class="platform-heading"><strong>平台退货申请</strong><button type="button" @click="open(row.location)">查看申请</button></div>
      <p class="application-identity"><button type="button" @click="open(row.location)">{{ row.returnId }}</button><span>{{ row.quantity == null ? '数量待核实' : `${row.quantity} 件` }}</span></p>
      <p class="platform-state"><span>{{ row.platformState }}</span><span v-if="row.platformStatus !== row.platformState">{{ row.platformStatus }}</span></p>
      <p class="application-summary">{{ row.title }}<span v-if="row.reason"> · {{ row.reason }}</span></p>
      <p v-if="row.platformReadNote" class="progress-issue">{{ row.platformReadNote }}</p>
      <p v-if="!compact && row.updatedAt" class="source-time">来源更新 {{ 格式化北京时间(row.updatedAt) }} 北京时间</p>

      <div class="internal-progress">
        <div class="internal-heading"><strong>内部办理</strong><small>{{ row.internalRecords.length }} 笔售后单</small></div>
        <p v-if="!row.internalRecords.length" class="progress-empty">暂无关联售后单</p>
        <article v-for="record in compact && !expandedInternal.includes(row.returnId) ? row.internalRecords.slice(0, 2) : row.internalRecords" :key="record.no" class="internal-record" :data-after-sale="record.no">
          <div class="internal-title"><strong>{{ record.kind }}</strong><span v-if="record.approval" class="approval">{{ record.approval }}</span><button type="button" :aria-label="`查看售后单 ${record.no}`" @click="open(record.location)">查看售后单</button></div>
          <p class="internal-number"><button type="button" @click="open(record.location)">{{ record.no }}</button><span>{{ record.quantity }} 件</span></p>
          <p class="execution-result">{{ record.executionResult }}</p>
          <dl v-if="record.kind === '全额退款' || record.kind === '部分退款'" class="progress-facts">
            <template v-if="record.amount"><dt>{{ record.amountLabel }}</dt><dd>{{ record.amount.value }} {{ record.amount.currency }}</dd></template>
            <dt>本笔实退</dt><dd>{{ record.actualAmount ? `${record.actualAmount.value} ${record.actualAmount.currency}` : '金额未确认' }}</dd>
          </dl>
          <dl v-else-if="record.kind === '退货'" class="progress-facts"><dt>批准退回</dt><dd>{{ record.approvedReturnQty == null ? '数量未确认' : `${record.approvedReturnQty} 件` }}</dd><dt>仓库实收</dt><dd>{{ record.receivedQty == null ? '数量未确认' : `${record.receivedQty} 件` }}</dd></dl>
          <template v-else-if="record.kind === '重发'">
            <p v-if="!record.manualOrderNo" class="reship-state">尚未生成重发订单</p>
            <p v-else-if="record.manualIssue" class="progress-issue">{{ record.manualIssue }}</p>
            <template v-else>
              <p class="reship-order"><button v-if="record.manualLocation" type="button" @click="open(record.manualLocation)">{{ record.manualOrderNo }}</button><span>OMS {{ record.manualStatus }}</span></p>
              <p v-if="!record.packages.length" class="reship-state">尚无有效履约单</p>
              <p v-for="parcel in record.packages" :key="parcel.no" class="reship-parcel"><span>{{ parcel.no }} · {{ parcel.status }}</span><span>实际发出 {{ parcel.shippedQuantity }} 件</span><small v-if="parcel.trackingNumber">{{ parcel.trackingNumber }}</small></p>
            </template>
          </template>
        </article>
        <button v-if="compact && row.internalRecords.length > 2" type="button" class="progress-more" :aria-expanded="expandedInternal.includes(row.returnId)" @click="toggleInternal(row.returnId)">{{ expandedInternal.includes(row.returnId) ? '收起办理记录' : `查看全部 ${row.internalRecords.length} 笔办理` }}</button>
      </div>
    </article>
    <button v-if="compact && rows.length > 1" type="button" class="progress-more" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起其他申请' : `查看全部 ${rows.length} 笔平台申请` }}</button>
  </div>
</template>

<style scoped>
.return-progress{min-width:0;font-size:12px;color:#536276}.return-progress-card+.return-progress-card{border-top:1px solid #e9eef4;margin-top:13px;padding-top:13px}.platform-heading,.internal-heading,.internal-title{display:flex;align-items:center;gap:7px;min-width:0}.platform-heading>strong{color:var(--yy-text-heading);font-size:12px;font-weight:500}.platform-heading>button,.internal-title>button{margin-left:auto;flex:none;color:#358ee2}.application-identity,.internal-number{display:flex;gap:8px;flex-wrap:wrap;line-height:1.6;margin:6px 0;color:#8792a1;font-size:11px}.application-identity>button,.internal-number>button{color:#358ee2;overflow-wrap:anywhere}.platform-state{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}.platform-state>span{color:#8d713e;background:#fff8ec;border:1px solid #f2e4c7;line-height:19px;padding:0 5px;font-size:11px;border-radius:3px}.application-summary{color:#788597;font-size:12px;line-height:1.65;margin:6px 0;overflow-wrap:anywhere}.source-time{font-size:11px;color:#8a96a6;line-height:1.6;margin:7px 0}.internal-progress{margin-top:10px;border-left:2px solid #e7edf4;padding-left:10px}.internal-heading{margin-bottom:4px}.internal-heading>strong{font-size:11px;color:var(--yy-text-heading);font-weight:500}.internal-heading>small{font-size:11px;color:#8b96a5}.internal-record{padding:7px 0}.internal-record+.internal-record{border-top:1px dashed #e6ecf3}.internal-title>strong{font-size:12px;color:#3b4c61;font-weight:500}.approval{color:#a07632;font-size:11px}.internal-title>button{font-size:11px}.execution-result{margin:5px 0;color:#54667e;line-height:1.65;overflow-wrap:anywhere}.progress-facts{display:grid;grid-template-columns:auto 1fr;gap:3px 9px;margin:6px 0 0;line-height:1.6;font-size:11px}.progress-facts>dt{color:#8591a0}.progress-facts>dd{margin:0;color:#536477}.progress-empty,.reship-state{margin:5px 0;color:#8b96a5;font-size:11px;line-height:1.6}.progress-issue{margin:6px 0;color:#9b773c;font-size:11px;line-height:1.7}.reship-order{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;margin:6px 0;color:#7d8998}.reship-order button{color:#358ee2}.reship-parcel{display:flex;gap:3px;flex-direction:column;margin:7px 0 0;color:#7f8b9b;font-size:11px;line-height:1.6;overflow-wrap:anywhere}.reship-parcel small{font:inherit}.progress-more{margin-top:9px;color:#358ee2}button{font:inherit;border:0;padding:0;background:transparent;cursor:pointer;text-align:left}button:hover{color:#1675cb}button:focus-visible{outline:2px solid #409eff;outline-offset:2px;border-radius:2px}
</style>
