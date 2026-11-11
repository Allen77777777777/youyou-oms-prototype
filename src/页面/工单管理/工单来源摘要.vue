<script setup lang="ts">
import BuyerLink from '@/组件/买家/买家链接.vue'
import { computed, ref, watch } from 'vue'
import { findBusinessMessage } from '../eBay站内信/会话'
import { formatMailTime } from '../eBay站内信/模型'
import { getMessageBodyText } from '../eBay站内信/邮箱模型'
import { reviewSession } from '../eBay评价/会话'
import { reviewCommentLabels } from '../eBay评价/数据'
import { getReviewDisplay } from '../eBay评价/模型'
import { cancellationSession } from '../eBay取消订单申请/会话'
import { cancelReasonLabel } from '../eBay取消订单申请/原因映射'
import { returnSession } from '../eBay退换货申请/数据'
import { disputeRecords, kindLabels } from '../eBay纠纷/模型'
import { sourceLabels, type TicketSource } from './会话'

const props = defineProps<{ source: TicketSource }>()
interface Preview { label: string; shop: string; party?: string; buyerId?: string; time?: string; title?: string; body?: string }
function unique<T>(matches: T[]) { return matches.length === 1 ? matches[0] : undefined }

const preview = computed<Preview | undefined>(() => {
  const { kind, shopId, id, contextId } = props.source
  if (!shopId?.trim() || !id?.trim()) return
  switch (kind) {
    case 'message': {
      const source = findBusinessMessage(shopId, contextId || '', id)
      if (!source) return
      const { conversation, message } = source
      const notice = conversation.source === 'ebay'
      const sent = message.kind === 'outgoing'
      return {
        label: notice ? 'eBay 平台通知' : sent ? '已发站内信' : '买家来信',
        buyerId: notice ? undefined : conversation.buyerId, shop: conversation.shopName, party: !notice && conversation.buyerId ? (sent ? '收件买家 ' : '买家 ') + conversation.buyerId : '',
        time: formatMailTime(message.at), title: message.subject?.trim() || conversation.subject, body: getMessageBodyText(message),
      }
    }
    case 'review': {
      const row = unique(reviewSession.reviews.filter(item => item.shopId === shopId && item.id === id))
      if (row) return { label: '评价', shop: row.shopName, party: row.buyerId, buyerId: row.buyerId, title: reviewCommentLabels[row.commentType], body: getReviewDisplay(row).content }
      return
    }
    case 'return': {
      const row = unique(returnSession.records.filter(item => item.shopId === shopId && item.id === id))
      if (row) return { label: '退货退款申请', shop: row.shopName, party: row.buyerId, buyerId: row.buyerId, title: row.title, body: row.reason ? '退货原因 · ' + row.reason : '' }
      return
    }
    case 'cancel': {
      const row = unique(cancellationSession.records.filter(item => item.shopId === shopId && item.cancelId === id))
      if (row) return { label: '取消订单申请', shop: row.shop, party: row.buyer, buyerId: row.buyer, title: row.orderId && '平台订单 ' + row.orderId, body: '取消原因 · ' + cancelReasonLabel(row.reasonCode) }
      return
    }
    case 'dispute': {
      const row = unique(disputeRecords.value.filter(item => item.shopId === shopId && item.id === id && item.kind === (contextId || 'EBAY_CASE')))
      if (row) return { label: '纠纷', shop: row.shopName, party: row.buyer, buyerId: row.buyer, title: [kindLabels[row.kind], row.statusText].filter(Boolean).join(' · '), body: row.reason }
      return
    }
  }
})
const expanded = ref(false)
watch([() => props.source.kind, () => props.source.shopId, () => props.source.contextId, () => props.source.id], () => { expanded.value = false })
const fullText = computed(() => preview.value?.body?.replace(/\r\n?/g, '\n').trim() ?? '')
const excerpt = computed(() => Array.from(fullText.value.split('\n').slice(0, 4).join('\n')).slice(0, 180).join('').trimEnd())
const truncated = computed(() => excerpt.value !== fullText.value)
</script>

<template>
  <section class="ticket-source-preview" aria-label="工单来源摘要">
    <header><strong>{{ preview?.label || sourceLabels[source.kind] }}</strong><span>{{ source.id }}</span></header>
    <div v-if="preview" class="source-meta"><span>{{ preview.shop || source.shopId }}</span><span v-if="preview.party"><BuyerLink :shop-id="source.shopId" :buyer-id="preview.buyerId">{{ preview.party }}</BuyerLink></span><time v-if="preview.time && preview.time !== '—'">{{ preview.time }}</time></div>
    <h3 v-if="preview?.title">{{ preview.title }}</h3>
    <p v-if="fullText" class="source-original">{{ expanded ? fullText : excerpt }}{{ truncated && !expanded ? '…' : '' }}</p>
    <button v-if="truncated" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起原文' : '展开原文' }}</button>
    <p v-if="!preview" class="source-unavailable">当前无法查看这条来源记录</p>
  </section>
</template>

<style scoped>
.ticket-source-preview { min-width:0; margin:0 0 16px; padding:12px 15px; border:1px solid #d7e6f7; border-radius:6px; background:#f2f7fd; color:#34465a; font-size:13px; overflow-wrap:anywhere; }
.ticket-source-preview header, .source-meta { display:flex; align-items:baseline; flex-wrap:wrap; gap:3px 12px; }
.ticket-source-preview header { justify-content:space-between; color:#315477; }
.ticket-source-preview header strong { font-size:13px; }
.ticket-source-preview header span { font-size:11px; color:#607792; }
.source-meta { margin-top:4px; color:#596f85; font-size:12px; }
.source-meta time { white-space:nowrap; }
.ticket-source-preview h3 { margin:9px 0 0; font-size:13px; font-weight:600; line-height:1.5; }
.source-original { white-space:pre-line; line-height:1.55; margin:5px 0 0; }
.ticket-source-preview button { padding:2px 0; margin-top:3px; color:#286aab; background:none; border:0; cursor:pointer; font:inherit; font-size:12px; }
.source-unavailable { margin:6px 0 0; }
</style>
