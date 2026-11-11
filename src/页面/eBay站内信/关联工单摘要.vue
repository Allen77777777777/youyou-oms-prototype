<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { routerKey, type RouteLocationRaw } from 'vue-router'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
import { getRelatedTicketGroups } from './关联办理资料'
import type { Conversation, RelatedOrder } from './类型'

const props = defineProps<{ conversation?: Conversation; order?: RelatedOrder; compact?: boolean }>()
const router = inject(routerKey, null)
const expanded = ref<string[]>([])
const groups = computed(() => {
  const rows = getRelatedTicketGroups(props.conversation, props.order)
  return [
    { key: 'conversation', label: '本会话关联工单', rows: rows.conversation },
    { key: 'order', label: '本订单其他来源工单', rows: rows.order },
  ].filter(group => group.rows.length)
})
const count = computed(() => groups.value.reduce((n, group) => n + group.rows.length, 0))
watch(() => [props.conversation?.id, props.order?.id], () => { expanded.value = [] })
function toggle(key: string) { expanded.value = expanded.value.includes(key) ? expanded.value.filter(value => value !== key) : [...expanded.value, key] }
function open(location: RouteLocationRaw) { if (router) void router.push(location) }
</script>

<template>
  <section class="related-tickets" aria-label="关联工单摘要">
    <div class="ticket-heading"><h3>关联工单 <span>{{ count }}</span></h3></div>
    <p v-if="!count" class="ticket-empty">暂无关联工单</p>
    <div v-for="group in groups" :key="group.key" class="ticket-group" :data-ticket-scope="group.key">
      <div class="ticket-group-heading"><span>{{ group.label }}</span><small>{{ group.rows.length }}</small></div>
      <article v-for="ticket in compact && !expanded.includes(group.key) ? group.rows.slice(0, 2) : group.rows" :key="ticket.id" class="related-ticket" :data-related-ticket="ticket.id">
        <div class="ticket-title"><button type="button" @click="open(ticket.location)">{{ ticket.title }}</button><span class="ticket-status" :class="{ closed: ticket.status === '已完成' || ticket.status === '已放弃' }">{{ ticket.status }}</span></div>
        <p class="ticket-meta"><button type="button" :aria-label="`查看工单 ${ticket.id}`" @click="open(ticket.location)">{{ ticket.id }}</button><span>负责人 {{ ticket.owner || '未记录' }}</span></p>
        <p v-if="ticket.timeLabel" class="ticket-schedule">{{ ticket.timeLabel }} <time v-if="ticket.time" :datetime="ticket.time" :title="`${格式化北京时间(ticket.time)} 北京时间`">{{ 格式化北京时间(ticket.time) }}</time><span v-else>{{ ticket.timeIssue }}</span></p>
        <p v-if="group.key === 'order'" class="ticket-source">来源 {{ ticket.sourceLabel }} · {{ ticket.sourceId }}</p>
      </article>
      <button v-if="compact && group.rows.length > 2" type="button" class="ticket-more" :aria-expanded="expanded.includes(group.key)" @click="toggle(group.key)">{{ expanded.includes(group.key) ? '收起' : `查看全部 ${group.rows.length} 张` }}</button>
    </div>
  </section>
</template>

<style scoped>
.related-tickets{min-width:0;color:#4b5a6e;font-size:12px}.ticket-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.ticket-heading h3{margin:0;color:var(--yy-text-heading);font-size:13px;line-height:1.6;font-weight:600}.ticket-heading h3>span{margin-left:5px;font-weight:500;font-variant-numeric:tabular-nums}.ticket-empty{margin:0;color:#8792a2;line-height:1.6}.ticket-group+.ticket-group{margin-top:11px;padding-top:9px;border-top:1px dashed #e7edf3}.ticket-group-heading{display:flex;gap:6px;align-items:center;margin-bottom:3px;color:#7c8899;font-size:11px}.ticket-group-heading small{font:inherit}.related-ticket{padding:7px 0}.related-ticket+.related-ticket{border-top:1px solid #f0f3f7}.ticket-title{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;min-width:0}.ticket-title button{color:#34465c;line-height:1.6;text-align:left;overflow-wrap:anywhere}.ticket-status{flex:none;color:#b17821;font-size:11px;line-height:19px;padding:0 5px;background:#fff7e9;border:1px solid #f1dfbd;border-radius:3px}.ticket-status.closed{color:#7c8896;background:#f5f7fa;border-color:#e5eaf0}.ticket-meta,.ticket-schedule,.ticket-source{display:flex;gap:8px;flex-wrap:wrap;margin:5px 0 0;color:#7f8b9b;font-size:11px;line-height:1.6}.ticket-meta button{color:#358ee2}.ticket-schedule{gap:5px}.ticket-source{color:#8a96a5}button{border:0;background:transparent;padding:0;font:inherit;cursor:pointer}button:hover{color:#1675cb}button:focus-visible{outline:2px solid #409eff;outline-offset:2px;border-radius:2px}.ticket-more{margin-top:5px;color:#358ee2;font-size:12px}
</style>
