<script setup lang="ts">
import { computed } from 'vue'
import { afterSaleFacts, type AfterSaleRecord } from './会话'

const props = defineProps<{ record: AfterSaleRecord }>()
const facts = computed(() => afterSaleFacts(props.record))
const codes = computed(() => [
  facts.value.platformStateCode && '处理状态 ' + facts.value.platformStateCode,
  facts.value.platformStatusCode && '总体状态 ' + facts.value.platformStatusCode,
  facts.value.platformReadNote,
].filter(Boolean).join(' · '))
</script>

<template>
  <div class="platform-state" :title="codes">
    <span>{{ facts.platformState }}</span>
    <small v-if="facts.platformStatus !== facts.platformState">总体 · {{ facts.platformStatus }}</small>
    <small v-if="facts.platformReadNote">{{ facts.platformReadNote }}</small>
  </div>
</template>

<style scoped>
.platform-state { display: grid; gap: 2px; }
.platform-state small { color: #697483; font-size: 11px; font-weight: 400; }
</style>
