<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElEmpty } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import AllOrderDetailPage from './全渠道订单详情页.vue'
import { 共享订单 } from '../订单处理/演示会话'

const route = useRoute()
const router = useRouter()

const 当前订单 = computed(() => 共享订单.value.find(
  (订单) => 订单.systemOrderNo === route.params.systemOrderNo,
))

</script>

<template>
  <AllOrderDetailPage
    v-if="当前订单"
    :order="当前订单"
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
