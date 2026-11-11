<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElDrawer, ElOption, ElSelect } from 'element-plus'
import ServiceLogs from '@/组件/客服日志/日志列表.vue'
import { formatMailTime } from '../eBay站内信/模型'
import { templateAnnotation as annotation } from './标注'
import { templateChanges, type TemplateChangeKind } from './变更记录'

const props = defineProps<{ kinds: TemplateChangeKind[]; templateId?: string }>()
const emit = defineEmits<{ close: [] }>()
const selected = ref(props.templateId || '')
watch(() => props.templateId, value => { selected.value = value || '' })
const eligible = computed(() => templateChanges.filter(entry => props.kinds.includes(entry.kind)))
const keyOf = (kind: string, id: string) => JSON.stringify([kind, id])
const objects = computed(() => {
  const items = new Map<string, { key: string; id: string; name: string; deleted: boolean }>()
  for (const entry of eligible.value) items.set(keyOf(entry.kind, entry.templateId), { key: keyOf(entry.kind, entry.templateId), id: entry.templateId, name: entry.templateName, deleted: !!entry.deleted })
  return [...items.values()]
})
const entries = computed(() => eligible.value.filter(entry => !selected.value || selected.value === keyOf(entry.kind, entry.templateId))
  .map(entry => ({ ...entry, content: `${entry.templateName} · ${entry.templateId}\n${entry.content}` })))
</script>

<template>
  <ElDrawer :model-value="true" title="变更记录" size="min(660px, calc(100vw - 64px))" append-to-body @close="emit('close')">
    <section v-prototype="annotation('changes', '模板变更记录')" class="template-changes">
      <ElSelect v-model="selected" clearable filterable placeholder="全部模板（含已删除）" aria-label="变更记录模板" style="width:100%">
        <ElOption v-if="selected && !objects.some(item => item.key === selected)" :value="selected" label="当前模板（暂无变更）" />
        <ElOption v-for="item in objects" :key="item.key" :value="item.key" :label="item.name + (item.deleted ? '（已删除）' : '')" />
      </ElSelect>
      <ServiceLogs :key="JSON.stringify([kinds, selected])" :entries="entries" title="变更记录" :show-heading="false" :collapsed="false" :format-time="formatMailTime" />
    </section>
  </ElDrawer>
</template>

<style scoped>
.template-changes{display:grid;gap:16px;min-width:0}
</style>
