<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElEmpty } from 'element-plus'
import { returnSession } from './数据'
import { initializeAfterSaleDemo } from '../售后单管理/演示数据'
import { findReturnRecord, returnKey } from './模型'
import ReturnWorkbench from './退货详情工作台.vue'

initializeAfterSaleDemo()
const route = useRoute(), router = useRouter()
const record = computed(() => {
  const shopId = typeof route.params.shopId === 'string' ? route.params.shopId : ''
  const id = typeof route.params.returnId === 'string' ? route.params.returnId : ''
  return shopId && id ? findReturnRecord(returnSession.records, returnKey({ shopId, id })) : undefined
})
</script>

<template>
  <ReturnWorkbench v-if="record" :key="returnKey(record)" :row="record" />
  <section v-else class="return-detail-empty"><ElEmpty description="未找到唯一对应的退货退款申请，请核对店铺与 ReturnID"><ElButton type="primary" plain @click="router.push('/oms/ebay-service/returns')">返回申请列表</ElButton></ElEmpty></section>
</template>

<style scoped>
.return-detail-empty{display:grid;height:100%;place-items:center;background:#fff}
</style>
