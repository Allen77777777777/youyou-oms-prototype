<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElButton, ElPopover } from 'element-plus'
import { routerKey } from 'vue-router'
import { currentActor, relatedTickets, type Ticket, type TicketSource } from './会话'
import { ticketAnnotations } from './标注'
import TicketCreateDialog from './建单弹窗.vue'

const props = defineProps<{ source?: TicketSource; manual?: boolean; compact?: boolean; buttonStyle?: 'plain' }>()
const emit = defineEmits<{ created: [ticket: Ticket] }>()
const router = inject(routerKey, null)
const related = computed(() => props.source && !props.compact ? relatedTickets(props.source) : [])
const showForm = ref(false)
const showRelated = ref(false)

watch([() => props.source?.kind, () => props.source?.shopId, () => props.source?.id, () => props.source?.contextId, currentActor], () => {
  showForm.value = false
  showRelated.value = false
})
function openForm() {
  showRelated.value = false
  showForm.value = true
}
function created(item: Ticket) {
  showForm.value = false
  emit('created', item)
}
function openTicket(id: string) {
  showRelated.value = false
  void router?.push({ name: 'oms-tickets', query: { ticketId: id } })
}
</script>
<template>
  <span class="ticket-source-actions" @click.stop>
    <ElButton v-if="manual" v-prototype="ticketAnnotations.create" type="primary" :icon="Plus" @click="openForm">新建工单</ElButton>
    <ElButton v-else v-prototype="ticketAnnotations.source" :link="buttonStyle !== 'plain'" :plain="buttonStyle === 'plain'" type="primary" size="small" @click="openForm">创建工单</ElButton>
    <ElPopover v-if="related.length" v-model:visible="showRelated" trigger="click" :width="320" placement="bottom-end">
      <template #reference><ElButton link type="primary" size="small">关联工单（{{ related.length }}）</ElButton></template>
      <ul class="related-tickets">
        <li v-for="item in related" :key="item.id">
          <button type="button" @click="openTicket(item.id)">{{ item.id }} · {{ item.title }}</button>
          <small>{{ item.owner }} · {{ item.status }}</small>
        </li>
      </ul>
    </ElPopover>
    <TicketCreateDialog v-if="showForm" :manual="manual" :source="source" @created="created" @close="showForm = false" />
  </span>
</template>
<style scoped>
.ticket-source-actions { display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; vertical-align:middle; }
.ticket-source-actions .el-button + .el-button { margin-left:0; }
.related-tickets { max-height:300px; overflow:auto; list-style:none; margin:0; padding:0; }
.related-tickets li { padding:8px 4px; display:grid; gap:4px; }
.related-tickets li + li { border-top:1px solid var(--el-border-color-lighter); }
.related-tickets button { background:none; border:0; padding:0; text-align:left; color:var(--el-color-primary); font:inherit; cursor:pointer; overflow-wrap:anywhere; }
.related-tickets small { color:var(--el-text-color-secondary); }
</style>
