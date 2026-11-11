<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElEmpty } from 'element-plus'
import TicketSourceActions from '../工单管理/来源工单操作.vue'
import DisputeDetail from './纠纷详情.vue'
import { findRecord, recordKey, type DisputeKind } from './模型'
import { disputeLocation, disputeTicketSource, validKind } from './导航'

const route = useRoute()
const router = useRouter()
const record = computed(() => {
  const { shopId, kind, recordId } = route.params
  return typeof shopId === 'string' && validKind(kind) && typeof recordId === 'string'
    ? findRecord(shopId, kind, recordId) : undefined
})
function back() {
  const kind = route.params.kind
  void router.push({ name: 'oms-ebay-disputes', query: validKind(kind) ? { issueType: kind } : {} })
}
function openRecord(kind: DisputeKind, id: string, shopId: string) {
  void router.push(disputeLocation(shopId, kind, id))
}
</script>
<template>
  <DisputeDetail v-if="record" :key="recordKey(record)" :record="record" @back="back" @open-record="openRecord">
    <template #ticket-actions><TicketSourceActions :source="disputeTicketSource(record)" button-style="plain" /></template>
  </DisputeDetail>
  <ElEmpty v-else description="未找到此店铺和类型下的纠纷记录"><ElButton @click="back">返回纠纷列表</ElButton></ElEmpty>
</template>
