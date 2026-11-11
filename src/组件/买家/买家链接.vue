<script setup lang="ts">
import { computed, inject } from 'vue'
import { routerKey } from 'vue-router'
import { buyerLocation } from '@/页面/eBay买家详情/导航'
import type { 原型标注 } from '@/类型/标注'

const props = defineProps<{ shopId?: string; buyerId?: string }>()
const router = inject(routerKey, undefined)
const available = computed(() => !!props.shopId?.trim() && !!props.buyerId?.trim())
const location = computed(() => buyerLocation(props.shopId || '', props.buyerId || ''))
const annotation: 原型标注 = {
  id: 'oms.ebay-buyer.entry', 锚点: 'oms.ebay-buyer.entry', 分类: '交互', 标题: '查看统一买家详情',
  说明: '按来源店铺与买家标识进入共用详情，查看订单和客服记录。',
  prd引用: ['PRD/eBay买家详情功能PRD.md'], 版本: '0.1 / 2026-11-06', 状态: '待评审', 事实等级: '合理假设',
  交互规则: ['点击仅查看买家资料，不触发所在行的查看、已读、办理或提交动作。', '跨店资料仅按已核验买家映射和可见范围取得；不按姓名或显示名猜测关联。'],
  数据来源: ['来源业务的店铺及买家标识；原型使用虚构资料。'],
}
function open() { if (available.value && router) void router.push(location.value) }
</script>

<template>
  <button v-if="available" v-prototype="annotation" type="button" class="buyer-detail-link" :aria-label="`查看买家 ${buyerId} 的详情`" @click.stop="open" @keydown.stop><slot>{{ buyerId }}</slot></button>
  <span v-else class="buyer-detail-text"><slot>{{ buyerId || '—' }}</slot></span>
</template>

<style scoped>
.buyer-detail-link { border:0; padding:0; background:none; text-align:inherit; color:var(--el-color-primary, #337cc2); cursor:pointer; font:inherit; text-decoration:none; overflow-wrap:anywhere; }
.buyer-detail-link:hover { text-decoration:underline; }
.buyer-detail-link:focus-visible { outline:2px solid var(--el-color-primary, #337cc2); outline-offset:2px; border-radius:2px; }
.buyer-detail-text { overflow-wrap:anywhere; }
</style>
