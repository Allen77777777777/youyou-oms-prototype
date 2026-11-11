<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElFormItem, ElOption, ElSelect } from 'element-plus'
import { businessMessages, findBusinessMessage, mailSession } from '../eBay站内信/会话'
import { reviewSession } from '../eBay评价/会话'
import { cancellationSession } from '../eBay取消订单申请/会话'
import { returnSession } from '../eBay退换货申请/数据'
import { sourceLabels, type TicketKind, type TicketSource } from './会话'
import { disputeRecords } from '../eBay纠纷/模型'
import { disputeTicketSource } from '../eBay纠纷/导航'

const kind = ref<TicketKind | 'none'>('none')
const emit = defineEmits<{ select: [value: TicketSource | undefined] }>()
const selectedKey = ref('')
watch(kind, () => { selectedKey.value = '' }, { flush: 'sync' })
const sourceKey = (row: TicketSource) => JSON.stringify([row.shopId, row.contextId, row.id])
const records = computed<TicketSource[]>(() => {
  switch (kind.value) {
    case 'none': return []
    case 'message': return mailSession.conversations.flatMap(thread =>
      [...businessMessages(thread).values()].map(message => ({
        kind: 'message', id: message.id, shopId: thread.shopId, shopName: thread.shopName,
        contextId: thread.id, summary: message.subject || thread.subject,
      })),
    )
    case 'review': return reviewSession.reviews.map(row => ({ kind: 'review', id: row.id, shopId: row.shopId, shopName: row.shopName, summary: row.title }))
    case 'cancel': return cancellationSession.records.map(row => ({ kind: 'cancel', id: row.cancelId, shopId: row.shopId, shopName: row.shop, summary: row.products[0]?.title || row.orderId }))
    case 'return': return returnSession.records.map(row => ({ kind: 'return', id: row.id, shopId: row.shopId, shopName: row.shopName, summary: row.title }))
    case 'dispute': return disputeRecords.value.map(disputeTicketSource)
  }
})
const choices = computed(() => {
  const unique = new Map<string, TicketSource | undefined>()
  for (const row of records.value) {
    if (!row.shopId || !row.id) continue
    const key = sourceKey(row)
    unique.set(key, unique.has(key) ? undefined : row)
  }
  return [...unique.values()].filter((row): row is TicketSource => row !== undefined)
})
// Undefined represents an explicit choice of no source. A selected type must resolve to an actual record.
function resolve(): TicketSource | undefined | false {
  if (kind.value === 'none') return undefined
  const record = choices.value.find(row => sourceKey(row) === selectedKey.value)
  if (record?.kind === 'message' && !findBusinessMessage(record.shopId, record.contextId || '', record.id)) return false
  return record ?? false
}
defineExpose({ resolve })
watch(() => resolve(), value => emit('select', value || undefined), { immediate: true })
</script>
<template>
  <ElFormItem label="工单来源">
    <ElSelect v-model="kind" aria-label="工单来源">
      <ElOption label="无来源" value="none" />
      <ElOption v-for="(label, value) in sourceLabels" :key="value" :value="value" :label="label" />
    </ElSelect>
  </ElFormItem>
  <ElFormItem v-if="kind !== 'none'" label="来源单据" required>
    <ElSelect v-model="selectedKey" filterable clearable aria-label="来源单据" placeholder="搜索单号、店铺或摘要">
      <ElOption v-for="row in choices" :key="sourceKey(row)" :value="sourceKey(row)" :label="[row.id, row.shopName, row.summary].filter(Boolean).join(' · ')" />
    </ElSelect>
  </ElFormItem>
</template>
