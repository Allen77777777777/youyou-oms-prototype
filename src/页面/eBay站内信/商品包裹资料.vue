<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElIcon, ElTag } from 'element-plus'
import { Box } from '@element-plus/icons-vue'
import NumberCopy from '@/组件/单号复制.vue'
import { getOrderItems, getPackageItems, getItemPackageAllocations } from './多商品包裹'
import { formatMailTime } from './模型'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import type { RelatedOrder } from './类型'

const props = defineProps<{ order: RelatedOrder; mode: 'products' | 'packages'; compact?: boolean }>()
const expanded = ref(false)
const failedImages = ref(new Set<string>())
watch(() => [props.order.id, props.mode, props.compact], () => { expanded.value = false; failedImages.value = new Set() })
const items = computed(() => getOrderItems(props.order))
const packages = computed(() => props.order.logistics.state === 'ready' ? props.order.logistics.records : [])
const visibleItems = computed(() => props.compact && !expanded.value ? items.value.slice(0, 2) : items.value)
const visiblePackages = computed(() => props.compact && !expanded.value ? packages.value.slice(0, 2) : packages.value)
const remaining = computed(() => (props.mode === 'products' ? items.value.length : packages.value.length) - 2)
function time(value?: string) { return !value ? '时间未提供' : 读取排序时刻(value) === undefined ? '时间待核实' : `${formatMailTime(value)} 北京时间` }
function quantityText(value: number) { return Number.isSafeInteger(value) && value > 0 ? `× ${value}` : '数量待核实' }
function tone(status: string): 'success' | 'danger' | 'warning' | 'info' {
  if (/异常|失败|退回/.test(status)) return 'danger'
  if (/签收|妥投/.test(status)) return 'success'
  if (/待|运输|派送/.test(status)) return 'warning'
  return 'info'
}
</script>

<template>
  <div class="mail-order-detail" :data-detail-mode="mode">
    <template v-if="mode === 'products'">
      <article v-for="(item, index) in visibleItems" :key="item.id || `legacy-${index}`" class="order-item" :data-order-item="item.id || 'unmapped'">
        <div class="item-image"><img v-if="item.imageUrl && !failedImages.has(item.imageUrl)" :src="item.imageUrl" :alt="item.title" @error="failedImages.add(item.imageUrl!)" /><ElIcon v-else><Box /></ElIcon></div>
        <div class="item-body">
          <div class="item-heading"><strong>{{ item.title }}</strong><span class="item-quantity">{{ quantityText(item.quantity) }}</span></div>
          <p v-if="item.specification" class="item-specification">{{ item.specification }}</p>
          <dl class="sku-lines"><dt>平台 SKU</dt><dd>{{ item.platformSku || '—' }}</dd><dt>系统 SKU</dt><dd>{{ item.systemSku || '—' }}</dd></dl>
          <p v-if="!compact && getItemPackageAllocations(order, item.id).length" class="item-packages">对应包裹：<span v-for="allocation in getItemPackageAllocations(order, item.id)" :key="allocation.package.id">{{ allocation.package.title }} {{ quantityText(allocation.quantity) }}</span></p>
        </div>
      </article>
    </template>
    <template v-else>
      <article v-for="parcel in visiblePackages" :key="parcel.id" class="package-item" :data-package-id="parcel.id">
        <header class="package-heading"><strong>{{ parcel.title }}</strong><span v-if="parcel.carrier && !parcel.title.includes(parcel.carrier)" class="carrier">{{ parcel.carrier }}</span><ElTag size="small" effect="plain" :type="tone(parcel.status)">{{ parcel.status }}</ElTag></header>
        <p v-if="parcel.trackingNumber" class="tracking-number"><span>运单号</span><NumberCopy :value="parcel.trackingNumber" label="运单号" /></p>
        <div v-if="getPackageItems(order, parcel).lines.length" class="package-goods">
          <p v-for="(line, index) in getPackageItems(order, parcel).lines" :key="`${line.orderItemId}-${index}`" :class="{ 'unverified-line': !line.verified }"><span>{{ line.verified ? line.item?.title : '商品关联待核实' }}</span><b>{{ quantityText(line.quantity) }}</b><small v-if="line.warning">{{ line.warning }}</small></p>
        </div>
        <p v-if="getPackageItems(order, parcel).state === 'unconfirmed'" class="package-warning">{{ getPackageItems(order, parcel).message || '包裹商品范围待核实' }}</p>
        <p class="package-event">{{ parcel.latestEvent || parcel.description || '暂无轨迹记录' }}</p>
        <time v-if="parcel.latestEventAt || !parcel.latestEvent">{{ time(parcel.latestEventAt || parcel.at) }}</time><span v-else class="package-time">轨迹时间未提供</span>
        <details v-if="!compact && parcel.details?.length" class="package-details"><summary>更多物流资料</summary><dl class="sku-lines"><template v-for="(detail, index) in parcel.details" :key="index"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></template></dl></details>
      </article>
    </template>
    <button v-if="compact && remaining > 0" type="button" class="detail-expand" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : `展开其余 ${remaining} ${mode === 'products' ? '项商品' : '个包裹'}` }}</button>
  </div>
</template>

<style scoped>
.mail-order-detail{min-width:0}.order-item{display:flex;gap:9px;padding:9px 0;min-width:0}.order-item+.order-item{border-top:1px solid #edf1f5}.item-image{display:grid;place-items:center;flex:0 0 38px;height:38px;border:1px solid #e7edf4;border-radius:5px;background:#f5f8fc;color:#8b9db2;font-size:22px;overflow:hidden}.item-image img{width:100%;height:100%;object-fit:contain}.item-body{min-width:0;flex:1}.item-heading{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;line-height:1.6}.item-heading strong{font-size:12px;font-weight:500;color:var(--yy-text-heading);overflow-wrap:anywhere}.item-quantity{white-space:nowrap;color:#59677c;font-size:12px}.item-specification{margin:2px 0 4px;color:#7a8799;font-size:11px}.sku-lines{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;margin:3px 0 0;font-size:11px;line-height:1.65}.sku-lines dt{color:#8a96a7}.sku-lines dd{margin:0;color:#637187;overflow-wrap:anywhere}.item-packages{font-size:11px;color:#748198;line-height:1.8;margin:4px 0 0}.item-packages span+span:before{content:'；'}.package-item{padding:9px 0}.package-item+.package-item{border-top:1px solid #edf1f5}.package-heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;line-height:1.6}.package-heading strong{color:var(--yy-text-heading);font-weight:500}.carrier{color:#738198}.package-heading :deep(.el-tag){font-size:11px;height:auto;white-space:normal}.tracking-number{display:flex;align-items:center;gap:7px;margin:3px 0;color:#6d7d94;font-size:11px;min-width:0}.tracking-number>span:first-child{flex-shrink:0;color:#8a96a7}.tracking-number :deep(.number-copy-button){width:21px;height:21px;font-size:12px}.package-goods{background:#f7f9fc;border-radius:3px;padding:4px 7px;margin:4px 0 6px}.package-goods p{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 6px;margin:2px 0;color:#5d6e85;font-size:11px;line-height:1.7}.package-goods b{font-weight:400;white-space:nowrap}.package-goods span{min-width:0;overflow-wrap:anywhere}.package-goods small{flex-basis:100%;font-size:11px}.package-warning,.unverified-line{color:#9a742e!important}.package-warning{font-size:11px;line-height:1.65;margin:3px 0}.package-event{color:#65748a;font-size:11px;line-height:1.7;margin:4px 0 2px;overflow-wrap:anywhere}.package-item time,.package-time{color:#929daf;font-size:10px}.package-details{margin-top:7px;font-size:11px}.package-details summary{color:#358ee2;cursor:pointer}.detail-expand{border:0;background:none;padding:5px 0 0;font-size:11px;color:#358ee2;cursor:pointer}.detail-expand:focus-visible{outline:2px solid #409eff;outline-offset:3px}
</style>
