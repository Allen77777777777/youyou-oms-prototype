<script setup lang="ts">
import { computed } from 'vue'
import { ElTooltip } from 'element-plus'
import type { 全渠道订单, 订单商品行 } from './类型'
import { 获取订单商品链接 } from './订单商品链接'

const props = withDefaults(defineProps<{ order: 全渠道订单; item: 订单商品行; compact?: boolean; fallback?: string }>(), { compact: false, fallback: '未提供商品名称' })
const 链接 = computed(() => 获取订单商品链接(props.order, props.item))
const 标题 = computed(() => props.item.platformItemTitle?.trim() || (props.order.platformCode === 'eBay' ? '商品标题未返回' : props.item.systemItemName?.trim() || props.fallback))
const 完整标题提示 = computed(() => props.compact ? 标题.value : '')
</script>

<template>
  <span class="平台商品标题容器" :class="{ 紧凑: compact }">
    <ElTooltip :content="完整标题提示" :disabled="!完整标题提示" placement="top">
      <a v-if="链接.href" class="平台商品标题" :href="链接.href" target="_blank" rel="noopener noreferrer" @click.stop>{{ 标题 }}</a>
      <strong v-else class="平台商品标题">{{ 标题 }}</strong>
    </ElTooltip>
  </span>
</template>

<style scoped>
.平台商品标题容器{display:block;min-width:0;max-width:100%}
.平台商品标题{display:block;color:var(--yy-text-heading);font-size:12px;font-weight:500;line-height:1.5;white-space:normal;overflow-wrap:anywhere;text-decoration:none}
a.平台商品标题{color:var(--yy-primary)}
a.平台商品标题:hover{text-decoration:underline;text-underline-offset:3px}
.平台商品标题:focus-visible{outline:2px solid #409eff;outline-offset:2px;border-radius:2px}
.紧凑 .平台商品标题{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
</style>
