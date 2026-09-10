<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElEmpty } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import AllOrderDetailPage from './全渠道订单详情页.vue'
import { 全渠道订单模拟数据 } from './模拟数据'
import type { 全渠道订单 } from './类型'

const route = useRoute()
const router = useRouter()

const 当前订单 = computed(() => 全渠道订单模拟数据.find(
  (订单) => 订单.systemOrderNo === route.params.systemOrderNo,
))

async function 打开专业订单(订单: 全渠道订单) {
  if (!订单.professionalOrder) return
  await router.push({
    name: 订单.professionalOrder.routeName,
    params: {
      sellerId: 订单.professionalOrder.sellerId,
      orderId: 订单.professionalOrder.orderId,
    },
  })
}
</script>

<template>
  <AllOrderDetailPage
    v-if="当前订单"
    :order="当前订单"
    @open-professional="打开专业订单"
  />
  <section v-else class="详情空态">
    <ElEmpty description="未找到对应的全渠道订单">
      <ElButton type="primary" plain @click="router.push('/oms/orders/all')">返回全渠道订单</ElButton>
    </ElEmpty>
  </section>
</template>

<style scoped>
.详情空态 {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: #fff;
}
</style>
