<script setup lang="ts">
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 人工发货方案, 全渠道订单 } from '../全渠道订单/类型'

const props = withDefaults(defineProps<{ plan: 人工发货方案; orders: readonly 全渠道订单[]; showReason?: boolean }>(), { showReason: true })
function 商品名称(orderNo: string, externalLineId: string) {
  const item = props.orders.find(order => order.systemOrderNo === orderNo)?.items.find(row => row.externalLineId === externalLineId)
  return { title: item?.systemItemName || item?.platformItemTitle || externalLineId, sku: item?.systemSku || item?.platformSku || '—' }
}
</script>

<template>
  <div class="拆合方案只读">
    <div class="方案摘要"><ElTag size="small">{{ plan.kind }}</ElTag><span>{{ plan.orderNos.length }} 张来源订单</span><span>{{ plan.packages.length }} 个包裹</span></div>
    <article v-for="(parcel, index) in plan.packages" :key="parcel.key" class="包裹预览">
      <header><strong>包裹 {{ index + 1 }}</strong><span>{{ parcel.items.reduce((sum, item) => sum + item.quantity, 0) }} 件</span></header>
      <div class="路由预览"><strong>{{ parcel.route.warehouse || '未选择仓库' }}</strong><span>{{ parcel.route.shippingChannel || '未选择物流渠道' }}</span><small>{{ parcel.route.warehouseProvider || '—' }} · {{ parcel.route.warehouseAccount || '—' }} · {{ parcel.route.labelMode || '—' }}</small></div>
      <ElTable :data="parcel.items" size="small" class="预览商品表">
        <ElTableColumn label="来源系统订单" prop="orderNo" min-width="180" />
        <ElTableColumn label="商品 / SKU" min-width="240"><template #default="{ row }"><div class="商品预览"><span>{{ 商品名称(row.orderNo, row.externalLineId).title }}</span><small>{{ 商品名称(row.orderNo, row.externalLineId).sku }}</small></div></template></ElTableColumn>
        <ElTableColumn label="平台商品行" prop="externalLineId" min-width="145" show-overflow-tooltip />
        <ElTableColumn label="发货数量" prop="quantity" width="92" align="right" />
      </ElTable>
    </article>
    <div v-if="showReason !== false" class="原因预览"><span>操作原因</span><p>{{ plan.reason || '—' }}</p></div>
  </div>
</template>

<style scoped>
.拆合方案只读{display:flex;flex-direction:column;gap:12px;min-width:0}.方案摘要{display:flex;gap:14px;align-items:center;color:#738197;font-size:12px}.包裹预览{border:1px solid #e5eaf1;border-radius:5px;overflow:hidden}.包裹预览>header{display:flex;justify-content:space-between;padding:10px 13px;background:#f7f9fc;font-size:12px;color:#63758e}.包裹预览>header strong{color:var(--yy-text-heading)}.路由预览{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;padding:12px 13px;font-size:12px}.路由预览 strong{font-weight:500;color:var(--yy-text-heading)}.路由预览 small{width:100%;color:#7d8ba1;font-size:11px}.商品预览{display:flex;flex-direction:column;gap:3px;line-height:1.6;overflow-wrap:anywhere}.商品预览 small{color:#8491a4}.预览商品表 :deep(.el-table__cell){vertical-align:top}.预览商品表 :deep(th.el-table__cell){color:var(--yy-text-heading)}.原因预览{display:grid;grid-template-columns:68px minmax(0,1fr);gap:10px;font-size:12px;line-height:1.7;color:#7b899c}.原因预览 p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#3c506b}
</style>
