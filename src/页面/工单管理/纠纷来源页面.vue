<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElDescriptions, ElDescriptionsItem, ElEmpty, ElTable, ElTableColumn } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import TicketSourceActions from './来源工单操作.vue'
import { disputeSample, sourceLocation } from './会话'
import { ticketAnnotations } from './标注'

const route = useRoute()
const router = useRouter()
const inDetail = computed(() => route.query.caseId !== undefined || route.query.shopId !== undefined)
const found = computed(() => route.query.caseId === disputeSample.id && route.query.shopId === disputeSample.shopId)
const backToList = () => router.push({ name: 'oms-ebay-disputes' })
</script>
<template>
  <section v-prototype="ticketAnnotations.dispute" class="case-page">
    <header><h2>{{ inDetail ? '纠纷详情' : 'eBay纠纷' }}</h2><ElButton v-if="inDetail" size="small" @click="backToList">返回纠纷列表</ElButton></header>
    <template v-if="!inDetail">
      <ElTable :data="[disputeSample]" border size="small">
        <ElTableColumn label="纠纷编号" width="210"><template #default><ElButton link type="primary" @click="router.push(sourceLocation(disputeSample))">{{ disputeSample.id }}</ElButton></template></ElTableColumn>
        <ElTableColumn prop="shopName" label="店铺" width="180" />
        <ElTableColumn prop="summary" label="事项" min-width="220" />
      </ElTable>
    </template>
    <template v-else-if="found">
      <ElDescriptions border :column="1" size="small" class="case-info">
        <ElDescriptionsItem label="纠纷编号">{{ disputeSample.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="店铺">{{ disputeSample.shopName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="事项">{{ disputeSample.summary }}</ElDescriptionsItem>
        <ElDescriptionsItem label="关联工单"><TicketSourceActions :source="disputeSample" /></ElDescriptionsItem>
      </ElDescriptions>
    </template>
    <ElEmpty v-else description="找不到此店铺的纠纷记录" />
  </section>
</template>
<style scoped>
.case-page { padding:16px 20px; }
.case-page header { display:flex; align-items:center; gap:24px; margin-bottom:16px; }
.case-page h2 { margin:0; font-size:16px; color:var(--yy-text-heading); }
.case-info { max-width:780px; }
.case-info :deep(.el-descriptions__label) { width:116px; }
</style>
