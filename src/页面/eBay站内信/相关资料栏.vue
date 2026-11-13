<script setup lang="ts">
import BuyerLink from '@/组件/买家/买家链接.vue'
import NumberCopy from '@/组件/单号复制.vue'
import OrderContents from './商品包裹资料.vue'
import RelatedTickets from './关联工单摘要.vue'
import AfterSaleProgress from './售后办理摘要.vue'
import { getOrderAfterSalesContext } from './关联办理资料'
import { getOrderItems } from './多商品包裹'
import { computed, ref, watch } from 'vue'
import { ElIcon, ElOption, ElSelect, ElTag } from 'element-plus'
import { ArrowLeft, ArrowRight, Box, Document, Link } from '@element-plus/icons-vue'
import { formatMailTime, getBuyerHistory, getContextCount, getRelatedOrders } from './模型'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'
import { mailAnnotation } from './站内信标注'
import { getMessageOrderContext } from './消息订单'
import type { ContextDataset, ContextTab, Conversation, RelatedOrder, MailMessage } from './类型'

const props = defineProps<{
  conversation: Conversation
  orders: RelatedOrder[]
  activeTab: ContextTab
  selectedOrderId: string
  message?: MailMessage
  showIdentity?: boolean
}>()
const emit = defineEmits<{
  close: []
  'update:activeTab': [value: ContextTab]
  'update:selectedOrderId': [value: string]
}>()

type DatasetKey = 'logistics' | 'afterSales' | 'disputes' | 'reviews'
const sections: Array<{ key: DatasetKey; label: string; singular: string; action: string }> = [
  { key: 'logistics', label: '物流', singular: '物流', action: '查看物流' },
  { key: 'afterSales', label: '售后', singular: '售后申请', action: '查看申请' },
  { key: 'disputes', label: '纠纷', singular: '纠纷', action: '查看纠纷' },
  { key: 'reviews', label: '评价', singular: '评价', action: '查看评价' },
]
const tabs: Array<{ value: ContextTab; label: string }> = [
  { value: 'overview', label: '概览' }, { value: 'order', label: '订单' },
  { value: 'logistics', label: '物流' }, { value: 'afterSales', label: '售后' },
  { value: 'disputes', label: '纠纷' }, { value: 'reviews', label: '评价' },
  { value: 'activity', label: '动态' },
]
const messageContext = computed(() => props.message ? getMessageOrderContext(props.conversation, props.message, props.orders) : undefined)
const linkedOrders = computed(() => messageContext.value?.orders ?? getRelatedOrders(props.conversation, props.orders))
const currentOrder = computed(() => linkedOrders.value.find(order => order.id === props.selectedOrderId)
  ?? (linkedOrders.value.length === 1 ? linkedOrders.value[0] : undefined))
const historyOrders = computed(() => getBuyerHistory(props.conversation, props.orders, linkedOrders.value))
const historyOpen = ref(false)
const historyShopId = ref('')
const historyOrderId = ref('')
const historyTab = ref<ContextTab>('overview')
const historyShops = computed(() => [...new Map(historyOrders.value.map(order => [order.shopId, { id: order.shopId, name: orderShopName(order) }])).values()])
const visibleHistoryOrders = computed(() => historyOrders.value.filter(order => !historyShopId.value || order.shopId === historyShopId.value))
// 其他订单仅是独立只读浏览态，不改变父组件当前关联订单、模板变量和资料页签。
const historyOrder = computed(() => historyOrders.value.find(order => order.id === historyOrderId.value))
const displayOrder = computed(() => historyOrder.value ?? currentOrder.value)
const displayTab = computed(() => historyOrder.value ? historyTab.value : props.activeTab)
const currentSection = computed(() => sections.find(section => section.key === displayTab.value))
const currentDataset = computed(() => displayOrder.value && currentSection.value ? displayOrder.value[currentSection.value.key] : undefined)
const activities = computed(() => [...(displayOrder.value?.activity ?? [])].sort((left, right) =>
  (读取排序时刻(right.at) ?? -Infinity) - (读取排序时刻(left.at) ?? -Infinity)))
const afterSalesContext = computed(() => getOrderAfterSalesContext(displayOrder.value))
const platformReturns = computed(() => afterSalesContext.value.returns)
const sectionCount = (key: DatasetKey) => key === 'afterSales' ? afterSalesContext.value.count : getContextCount(displayOrder.value?.[key])
const emptySections = computed(() => displayOrder.value ? sections.filter(section => sectionCount(section.key) === 0) : [])
const overviewSections = computed(() => sections.filter(section => !emptySections.value.some(empty => empty.key === section.key)))
const associationState = computed(() => messageContext.value?.state ?? props.conversation.association)
const associationTitle = computed(() => associationState.value === 'pending' ? '订单关联待确认' : associationState.value === 'confirmed' ? '关联资料待核实' : '暂无关联订单')
const associationDescription = computed(() => {
  if (associationState.value === 'pending') return '当前消息对应的订单尚待确认，可查看买家其他订单核实。'
  if (associationState.value === 'confirmed') return '当前消息关联资料暂不可用，请核实店铺、买家和订单对应关系。'
  return props.conversation.source === 'ebay' ? '此通知没有关联订单，可直接阅读通知正文。' : '售前沟通可以仅关联商品，无需指定订单。'
})

watch(() => props.conversation.id, () => { historyOpen.value = false; historyShopId.value = ''; returnToConversation() })
watch(() => props.message?.id, () => { historyOpen.value = false; historyShopId.value = ''; returnToConversation() })
watch(historyOrders, () => {
  if (!historyOrders.value.some(order => order.id === historyOrderId.value)) returnToConversation()
  if (historyShopId.value && !historyShops.value.some(shop => shop.id === historyShopId.value)) historyShopId.value = ''
})
watch(() => linkedOrders.value.map(order => order.id).join('|'), () => {
  if (props.message) return
  if (!linkedOrders.value.some(order => order.id === props.selectedOrderId)) {
    emit('update:selectedOrderId', linkedOrders.value.length === 1 ? linkedOrders.value[0]!.id : '')
  }
}, { immediate: true })

function openTab(tab: ContextTab) {
  if (historyOrder.value) historyTab.value = tab
  else emit('update:activeTab', tab)
}
function orderShopName(order: RelatedOrder) { return order.shopName || (order.shopId === props.conversation.shopId ? props.conversation.shopName : order.shopId) }
function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (!historyOpen.value) { historyShopId.value = ''; returnToConversation() }
}
function viewHistoryOrder(id: string) { historyOrderId.value = id; historyTab.value = 'overview' }
function returnToConversation() { historyOrderId.value = ''; historyTab.value = 'overview' }
function datasetState(dataset: ContextDataset) {
  return { not_synced: '尚未同步', failed: '同步失败', forbidden: '无查看权限', ready: '已同步' }[dataset.state]
}
function datasetDescription(dataset: ContextDataset, label: string) {
  if (dataset.state === 'not_synced') return `${label}资料尚未取得，暂不能判断是否存在记录。`
  if (dataset.state === 'failed') return `最近一次${label}资料同步失败，请待核实后再处理。`
  if (dataset.state === 'forbidden') return `当前无权限查看这笔订单的${label}资料。`
  return `当前订单暂无${label}记录`
}
function timeLabel(value?: string) {
  if (!value) return '时间未提供'
  return 读取排序时刻(value) === undefined ? '时间待核实' : formatMailTime(value)
}
function statusTone(value: string): 'success' | 'warning' | 'danger' | 'info' {
  if (/失败|差评/.test(value)) return 'danger'
  if (/待|中评|处理中/.test(value)) return 'warning'
  if (/成功|签收|完成|好评/.test(value)) return 'success'
  return 'info'
}
</script>

<template>
  <aside v-prototype="mailAnnotation('context', '相关资料侧栏')" class="mail-context" aria-label="相关资料">
    <header class="context-heading">
      <h2>相关资料</h2>
      <button type="button" class="context-link close-context" aria-label="收起相关资料" @click="emit('close')"><ElIcon><ArrowLeft /></ElIcon>收起</button>
    </header>
    <p v-if="showIdentity" class="context-buyer-identity"><strong><BuyerLink :shop-id="conversation.shopId" :buyer-id="conversation.buyerId" /></strong><span>{{ conversation.shopName }} · {{ conversation.subject }}</span></p>

    <div v-if="historyOrder" v-prototype="mailAnnotation('history', '查看买家其他订单')" class="context-scope history-preview-scope">
      <button type="button" class="context-link history-back" @click="returnToConversation"><ElIcon><ArrowLeft /></ElIcon>返回当前会话资料</button>
      <div class="scope-order"><span>查看买家订单</span><strong>{{ historyOrder.orderNo }}</strong></div>
      <p class="history-source">{{ orderShopName(historyOrder) }} · <BuyerLink :shop-id="historyOrder.shopId" :buyer-id="historyOrder.buyerId" /></p>
    </div>
    <div v-else v-prototype="mailAnnotation('association', '当前订单关联范围')" class="context-scope">
      <ElSelect v-if="linkedOrders.length > 1" :model-value="currentOrder?.id || ''" aria-label="当前关联订单" placeholder="选择当前关联订单" @update:model-value="emit('update:selectedOrderId', $event)">
        <ElOption v-for="order in linkedOrders" :key="order.id" :value="order.id" :label="order.orderNo" />
      </ElSelect>
      <div v-else-if="currentOrder" class="scope-order"><span>当前订单</span><strong><NumberCopy :value="currentOrder.orderNo" label="订单号" /></strong></div>
      <div v-else class="scope-order muted-scope"><ElIcon><Link /></ElIcon><span>{{ linkedOrders.length > 1 ? '请选择关联订单' : associationTitle }}</span></div>
      <div v-if="currentOrder" class="scope-meta"><span>{{ orderShopName(currentOrder) }}</span><ElTag size="small" effect="plain" type="info">{{ currentOrder.omsStatus }}</ElTag></div>
      <div v-prototype="mailAnnotation('history', '同买家其他订单')" class="history-container">
        <button v-if="conversation.buyerId && conversation.source === 'buyer'" type="button" class="context-link history-trigger" :aria-expanded="historyOpen" aria-controls="mail-buyer-history" @click="toggleHistory">买家其他订单<ElIcon :class="{ rotated: historyOpen }"><ArrowRight /></ElIcon></button>
        <div v-if="historyOpen" id="mail-buyer-history" class="buyer-history">
          <p class="history-hint">全部可见店铺 · 不计入当前订单</p>
          <ElSelect v-model="historyShopId" v-prototype="mailAnnotation('buyerScope', '买家订单店铺范围')" class="history-shop-filter" aria-label="买家订单店铺" placeholder="全部可见店铺" size="small">
            <ElOption label="全部可见店铺" value="" />
            <ElOption v-for="shop in historyShops" :key="shop.id" :value="shop.id" :label="shop.name" />
          </ElSelect>
          <button v-for="order in visibleHistoryOrders" :key="order.id" type="button" class="history-order" :data-history-order="order.id" @click="viewHistoryOrder(order.id)"><strong>{{ order.orderNo }}</strong><span>{{ order.omsStatus }}</span><small class="history-order-shop">{{ orderShopName(order) }}</small><small>{{ order.product.title }}</small></button>
          <p v-if="!visibleHistoryOrders.length" class="context-muted">暂无其他订单记录</p>
        </div>
      </div>
    </div>

    <nav v-if="displayOrder" class="context-tabs" aria-label="相关资料分类" role="tablist">
      <button v-for="tab in tabs" :key="tab.value" :id="`mail-context-tab-${tab.value}`" type="button" role="tab" :aria-selected="displayTab === tab.value" aria-controls="mail-context-content" :class="{ active: displayTab === tab.value }" @click="openTab(tab.value)">{{ tab.label }}</button>
    </nav>

    <div id="mail-context-content" class="context-scroll" :role="displayOrder ? 'tabpanel' : undefined" :aria-labelledby="displayOrder ? `mail-context-tab-${displayTab}` : undefined" tabindex="0">
      <template v-if="!displayOrder">
        <section v-if="linkedOrders.length > 1" class="context-empty"><ElIcon><Document /></ElIcon><h3>请选择当前订单</h3><p>当前消息已确认关联多笔订单。选择本次查看和回复使用的订单。</p></section>
        <section v-else class="context-empty"><ElIcon><Link /></ElIcon><h3>{{ associationTitle }}</h3><p>{{ associationDescription }}</p></section>
        <section v-if="conversation.product && (!message || associationState === 'none')" class="context-section standalone-product"><h3>关联商品</h3><div class="context-product"><div class="product-art"><ElIcon><Box /></ElIcon></div><div><strong>{{ conversation.product.title }}</strong><small>SKU {{ conversation.product.sku }}</small></div></div></section>
        <section v-prototype="mailAnnotation('relatedTickets', '关联工单摘要')" class="context-section ticket-summary"><RelatedTickets :conversation="conversation" compact /></section>
      </template>

      <template v-else-if="displayTab === 'overview' || displayTab === 'order'">
        <section class="context-section order-summary">
          <div class="section-heading"><h3>{{ displayTab === 'order' ? '订单资料' : '订单与商品' }}<span class="section-count item-count">{{ getOrderItems(displayOrder).length }} 项商品</span></h3><button v-if="displayTab === 'overview'" type="button" class="context-link" @click="openTab('order')">查看订单<ElIcon><ArrowRight /></ElIcon></button></div>
          <dl v-if="displayTab === 'order'" class="context-facts"><dt>订单号</dt><dd><NumberCopy :value="displayOrder.orderNo" label="订单号" /></dd><dt>OMS 状态</dt><dd>{{ displayOrder.omsStatus }}</dd><dt>店铺</dt><dd>{{ orderShopName(displayOrder) }}</dd><dt>买家</dt><dd><BuyerLink :shop-id="displayOrder.shopId" :buyer-id="displayOrder.buyerId" /></dd><dt>订单金额</dt><dd>{{ displayOrder.currency }} {{ displayOrder.amount }}</dd></dl>
          <div v-prototype="mailAnnotation('orderContents', '订单商品与包裹分配')"><OrderContents :order="displayOrder" mode="products" :compact="displayTab === 'overview'" /></div>
          <p v-if="displayTab === 'order'" class="context-muted order-readonly">当前为订单资料摘要，完整订单详情尚未关联。</p>
        </section>
        <template v-if="displayTab === 'overview'">
          <section v-prototype="mailAnnotation('relatedTickets', '关联工单摘要')" class="context-section ticket-summary"><RelatedTickets :conversation="historyOrder ? undefined : conversation" :order="displayOrder" compact /></section>
          <section v-for="section in overviewSections" :key="section.key" class="context-section" :data-context-section="section.key">
            <div class="section-heading"><h3>{{ section.label }}<span v-if="sectionCount(section.key) !== null" class="section-count">{{ sectionCount(section.key) }}</span></h3><button type="button" class="context-link" @click="openTab(section.key)">{{ section.action }}<ElIcon><ArrowRight /></ElIcon></button></div>
            <template v-if="section.key === 'afterSales' && platformReturns.length">
              <div v-prototype="mailAnnotation('afterSaleProgress', '平台申请与内部办理进展')"><AfterSaleProgress :order="displayOrder" compact /></div>
              <div v-for="record in afterSalesContext.records.slice(0, 2)" :key="record.id" class="overview-record fallback-application"><div class="record-line"><strong>{{ record.title }}</strong><ElTag size="small" :type="statusTone(record.status)" effect="plain">{{ record.status }}</ElTag></div><p>{{ record.description }}</p></div>
              <button v-if="afterSalesContext.records.length > 2" type="button" class="context-link show-all" @click="openTab('afterSales')">查看其余 {{ afterSalesContext.records.length }} 条申请摘要</button>
            </template>
            <div v-else-if="section.key === 'logistics' && displayOrder.logistics.state === 'ready' && displayOrder.logistics.records.length" v-prototype="mailAnnotation('packageContents', '多包裹物流与商品范围')"><OrderContents :order="displayOrder" mode="packages" compact /></div>
            <template v-else-if="displayOrder[section.key].state === 'ready' && displayOrder[section.key].records.length">
              <div v-for="record in displayOrder[section.key].records.slice(0, 2)" :key="record.id" class="overview-record"><div class="record-line"><strong>{{ record.title }}</strong><ElTag size="small" :type="statusTone(record.status)" effect="plain">{{ record.status }}</ElTag></div><p>{{ record.description }}</p></div>
              <button v-if="displayOrder[section.key].records.length > 2" type="button" class="context-link show-all" @click="openTab(section.key)">查看全部 {{ displayOrder[section.key].records.length }} 条</button>
            </template>
            <div v-else class="context-state" :class="{ 'state-unknown': displayOrder[section.key].state !== 'ready' }"><strong v-if="displayOrder[section.key].state !== 'ready'">{{ datasetState(displayOrder[section.key]) }}</strong><p>{{ datasetDescription(displayOrder[section.key], section.singular) }}</p></div>
          </section>
          <div v-if="emptySections.length" class="context-empty-categories" aria-label="暂无记录的分类"><button v-for="section in emptySections" :key="section.key" type="button" :aria-label="`当前订单暂无${section.singular}记录，查看${section.label}`" @click="openTab(section.key)">{{ section.label }} <b>0</b></button></div>
          <section v-prototype="mailAnnotation('compactOverview', '概览信息密度与近期动态')" class="context-section recent-activity"><div class="section-heading"><h3>近期动态</h3><button type="button" class="context-link" @click="openTab('activity')">查看关联动态<ElIcon><ArrowRight /></ElIcon></button></div><ol v-if="activities.length" class="recent-events"><li v-for="record in activities.slice(0, 3)" :key="record.id"><span>{{ record.title }}</span><time>{{ timeLabel(record.at) }}</time></li></ol><p v-else class="context-muted">暂无关联动态</p></section>
        </template>
      </template>

      <section v-else-if="currentSection && currentDataset" v-prototype="mailAnnotation('relatedStatus', '资料状态与记录')" class="context-section records-section" :data-context-section="currentSection.key">
        <div class="section-heading"><h3>{{ currentSection.label }}记录<span v-if="sectionCount(currentSection.key) !== null" class="section-count">{{ sectionCount(currentSection.key) }}</span></h3></div>
        <p v-if="currentDataset.updatedAt" class="source-time" :title="`${currentDataset.updatedAt}（显示为北京时间）`">来源更新 {{ timeLabel(currentDataset.updatedAt) }}</p>
        <template v-if="currentSection.key === 'afterSales' && platformReturns.length">
          <div v-prototype="mailAnnotation('afterSaleProgress', '平台申请与内部办理进展')"><AfterSaleProgress :order="displayOrder!" /></div>
          <article v-for="record in afterSalesContext.records" :key="record.id" class="context-record fallback-application"><div class="record-line"><strong>{{ record.title }}</strong><ElTag size="small" :type="statusTone(record.status)" effect="plain">{{ record.status }}</ElTag></div><p class="record-identifier">{{ record.id }}</p><p class="record-description">{{ record.description }}</p><time :datetime="record.at">{{ timeLabel(record.at) }} 北京时间</time><details v-if="record.details?.length" class="record-details"><summary>记录详情</summary><dl class="context-facts"><template v-for="(detail, index) in record.details" :key="index"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></template></dl></details></article>
        </template>
        <div v-else-if="currentSection.key === 'logistics' && currentDataset.state === 'ready' && currentDataset.records.length" v-prototype="mailAnnotation('packageContents', '多包裹物流与商品范围')"><OrderContents :order="displayOrder!" mode="packages" /></div>
        <template v-else-if="currentDataset.state === 'ready' && currentDataset.records.length">
          <article v-for="record in currentDataset.records" :key="record.id" class="context-record">
            <div class="record-line"><strong>{{ record.title }}</strong><ElTag size="small" :type="statusTone(record.status)" effect="plain">{{ record.status }}</ElTag></div>
            <p class="record-identifier">{{ record.id }}</p><p class="record-description">{{ record.description }}</p><time :datetime="record.at" :title="格式化北京时间(record.at)">{{ timeLabel(record.at) }} 北京时间</time>
            <details v-if="record.details?.length" class="record-details"><summary>记录详情</summary><dl class="context-facts"><template v-for="(item, index) in record.details" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></template></dl></details>
          </article>
        </template>
        <div v-else class="context-state large-state" :class="{ 'state-unknown': currentDataset.state !== 'ready' }"><ElIcon><Document /></ElIcon><strong>{{ currentDataset.state === 'ready' ? '暂无记录' : datasetState(currentDataset) }}</strong><p>{{ datasetDescription(currentDataset, currentSection.singular) }}</p></div>
      </section>

      <section v-else-if="displayTab === 'activity'" class="context-section activity-section">
        <div class="section-heading"><h3>关联动态</h3><span class="source-time">北京时间</span></div>
        <ol v-if="activities.length" class="context-timeline"><li v-for="record in activities" :key="record.id"><time :datetime="record.at">{{ timeLabel(record.at) }}</time><strong>{{ record.title }}</strong><p>{{ record.description }}</p><span>{{ record.status }}</span></li></ol>
        <p v-else class="context-muted">当前订单暂无关联动态</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.scope-meta{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:6px 1px 0;color:#8491a4;font-size:11px;line-height:1.6}.scope-meta>span{min-width:0;overflow-wrap:anywhere}.scope-meta :deep(.el-tag){font-size:10px;flex-shrink:0}.scope-order :deep(.number-copy-button){width:20px;height:20px;font-size:12px}.item-count{font-size:11px;color:#8895a7;font-weight:400}.context-empty-categories{display:flex;gap:9px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--yy-border-light);background:#fafbfd}.context-empty-categories button{border:0;background:none;font:inherit;font-size:11px;color:#8390a4;cursor:pointer;padding:2px}.context-empty-categories b{font-weight:500;margin-left:3px}.context-empty-categories button:focus-visible{outline:2px solid #409eff;outline-offset:2px}.recent-events{list-style:none;margin:0;padding:0}.recent-events li{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-top:7px;font-size:11px;color:#617189;line-height:1.7}.recent-events time{flex-shrink:0;color:#98a2b0;font-size:10px}.recent-activity .context-muted{margin:0}.ticket-summary{padding-top:11px!important;padding-bottom:11px!important}
.mail-context{display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden;border-left:1px solid var(--yy-border-light);background:#fff;color:var(--yy-text-primary);font-size:12px}
.context-buyer-identity{display:flex;flex-wrap:wrap;gap:6px 12px;padding:0 16px 12px;margin:0;line-height:1.6}.context-buyer-identity strong{color:var(--yy-text-heading);font-weight:600}.context-buyer-identity span{color:#8894a5}
.context-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;padding:17px 16px 12px}.context-heading h2{margin:0;font-size:15px;font-weight:600;color:var(--yy-text-heading)}
.context-link{display:inline-flex;align-items:center;justify-content:flex-start;gap:3px;padding:0;border:0;background:transparent;color:#358ee2;font-size:12px;line-height:1.7;cursor:pointer;text-align:left;flex-shrink:0}.context-link:hover{color:#1675cb}.context-link:focus-visible,.context-tabs button:focus-visible{outline:2px solid #409eff;outline-offset:3px;border-radius:3px}.context-link .el-icon{font-size:12px}.close-context{padding:2px 0}
.context-scope{padding:0 16px 12px;flex:none}.context-scope :deep(.el-select){width:100%}.scope-order{display:flex;align-items:center;gap:10px;min-height:33px;padding:7px 10px;border:1px solid var(--yy-border-light);border-radius:4px;line-height:1.5}.scope-order>span{color:#6f7b8e;flex-shrink:0}.scope-order>strong{color:#268be8;overflow-wrap:anywhere;font-weight:600}.muted-scope{border-style:dashed}.muted-scope .el-icon{color:#8693a4}
.history-trigger{margin-top:8px}.history-trigger .el-icon{transition:transform .15s}.history-trigger .rotated{transform:rotate(90deg)}.buyer-history{margin-top:8px;padding:10px;background:#f7f9fc;border:1px solid #eaf0f6;border-radius:4px;max-height:180px;overflow:auto}.history-hint{margin:0 0 8px;color:#7d8795;font-size:11px}.history-order{display:grid;grid-template-columns:1fr auto;gap:4px 8px;padding:8px 0;border-top:1px solid #e8edf3}.history-order strong{font-weight:500;overflow-wrap:anywhere}.history-order span{color:#7c8797}.history-order small{grid-column:1/-1;color:#6c7889;font-size:11px;overflow-wrap:anywhere}
.history-shop-filter{margin-bottom:8px}.history-order{width:100%;min-width:0;border-right:0;border-bottom:0;border-left:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.history-order:hover{background:#edf5ff}.history-order:focus-visible{outline:2px solid #409eff;outline-offset:1px}.history-order strong{color:#258ceb}.history-order .history-order-shop{color:#8291a5}.history-back{margin:0 0 8px}.history-source{margin:7px 0 0;color:#6f7b8e;line-height:1.6;overflow-wrap:anywhere}
.context-tabs{display:flex;flex:none;padding:0 10px;border-bottom:1px solid var(--yy-border-light);gap:0;min-width:0}.context-tabs button{position:relative;flex:1;min-width:0;border:0;background:#fff;padding:10px 1px 11px;font-size:12px;white-space:nowrap;color:#596576;cursor:pointer}.context-tabs button.active{color:#258ceb;font-weight:600}.context-tabs button.active:after{content:'';position:absolute;height:2px;bottom:-1px;left:4px;right:4px;background:#409eff}
.context-scroll{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;outline:none}.context-scroll:focus-visible{outline:2px solid #c5e2ff;outline-offset:-2px}.context-section{padding:11px 14px;border-bottom:1px solid var(--yy-border-light);overflow-wrap:anywhere}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;margin-bottom:6px}.section-heading h3,.standalone-product h3{font-size:13px;color:var(--yy-text-heading);font-weight:600;margin:0;line-height:1.6}.section-count{margin-left:7px;font-variant-numeric:tabular-nums}
.context-facts{display:grid;grid-template-columns:minmax(58px, 30%) minmax(0, 1fr);gap:7px 10px;margin:0;font-size:12px;line-height:1.6}.context-facts dt{color:#7f8998}.context-facts dd{margin:0;color:#48566a;overflow-wrap:anywhere}.context-product{display:flex;gap:10px;align-items:center;margin-top:12px;min-width:0}.product-art{display:grid;place-items:center;flex:0 0 45px;width:45px;height:45px;border-radius:5px;background:linear-gradient(150deg,#f3f6f9,#e9eef4);color:#8c9bae;border:1px solid #e8edf3}.product-art .el-icon{font-size:26px}.context-product>div:last-child{min-width:0;display:flex;flex-direction:column;gap:3px}.context-product strong{color:#313b49;font-size:12px;font-weight:500;line-height:1.5}.context-product small{color:#7f8a9a;font-size:11px;line-height:1.5}
.overview-record+.overview-record{margin-top:10px}.record-line{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.record-line strong{font-weight:500;line-height:1.6;color:#3f4c5f}.record-line :deep(.el-tag){font-size:11px;line-height:18px;min-height:20px;max-width:100%;white-space:normal;height:auto}.overview-record p,.context-state p{margin:6px 0 0;color:#778395;font-size:12px;line-height:1.65;overflow-wrap:anywhere}.show-all{margin-top:8px}.context-state>strong{font-weight:500;color:#8b6638}.context-state.state-unknown{border-left:2px solid #e2c5a0;padding-left:9px}.context-overview-footer{display:flex;justify-content:flex-end;padding:12px 16px}
.context-empty{display:flex;flex-direction:column;align-items:center;padding:35px 18px 22px;text-align:center;color:#8c98a8}.context-empty>.el-icon{font-size:26px;padding:12px;background:#f5f8fb;border-radius:50%;width:52px;height:52px;box-sizing:border-box}.context-empty h3{font-weight:500;font-size:14px;margin:14px 0 7px}.context-empty p{margin:0;font-size:12px;line-height:1.9;color:#8591a2}.standalone-product h3{margin-bottom:12px}.context-muted{font-size:12px;color:#8792a2;line-height:1.75}.order-readonly{margin:18px 0 0;padding-top:12px;border-top:1px dashed #e5eaf0}
.source-time{color:#8b95a4;font-size:11px;margin:0 0 12px;line-height:1.7}.section-heading .source-time{margin:0}.context-record{padding:12px 0;border-top:1px solid #edf1f5}.record-identifier{font-size:11px;color:#7d8b9f;margin:7px 0;overflow-wrap:anywhere}.record-description{color:#5d6b7e;line-height:1.8;margin:7px 0}.context-record time{color:#939dab;font-size:11px;line-height:1.5}.record-details{margin-top:10px;border-top:1px dashed #e8edf4;padding-top:9px}.record-details summary{cursor:pointer;color:#3889cf;font-size:12px}.record-details .context-facts{padding:10px 0 2px;font-size:11px}.large-state{text-align:center;padding:25px 10px}.large-state>.el-icon{display:block;margin:0 auto 12px;font-size:28px;color:#a7b2bf}.large-state>strong{font-size:13px;font-weight:500;color:#7d8899}.large-state.state-unknown{border-left:0;border-radius:4px;background:#faf8f5}
.context-timeline{list-style:none;margin:0;padding:4px 0 0 8px}.context-timeline li{position:relative;border-left:1px solid #e2e9f1;padding:0 0 22px 17px}.context-timeline li:before{content:'';position:absolute;left:-4px;top:4px;width:7px;height:7px;background:#8ab9eb;border-radius:50%;box-shadow:0 0 0 3px white}.context-timeline time{display:block;color:#939dac;font-size:11px;margin-bottom:7px}.context-timeline strong{display:block;font-weight:500;font-size:12px;color:#39485c;line-height:1.6}.context-timeline p{margin:6px 0;color:#788697;line-height:1.75;font-size:12px}.context-timeline span{color:#8b97a6;font-size:11px}.context-timeline li:last-child{padding-bottom:3px;border-color:transparent}
</style>
