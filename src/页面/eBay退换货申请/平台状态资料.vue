<script setup lang="ts">
import { computed } from 'vue'
import { ElTag, ElTooltip } from 'element-plus'
import { isEscalated, isReturnClosed, returnPlatformPresentation, type ReturnRecord } from './模型'
const props = defineProps<{ row: ReturnRecord; small?: boolean }>()
const platform = computed(() => returnPlatformPresentation(props.row))
const tone = computed(() => isReturnClosed(props.row) ? 'info' : isEscalated(props.row) ? 'danger' : ['ITEM_DELIVERED', 'ITEM_KEPT', 'UNKNOWN'].includes(props.row.state) ? 'warning' : 'primary')
</script>
<template>
  <ElTooltip :content="platform.platformStateCode" :disabled="!platform.platformStateCode"><ElTag :type="tone" :size="small ? 'small' : undefined">{{ platform.platformState }}</ElTag></ElTooltip>
  <ElTooltip :content="platform.platformStatusCode" :disabled="!platform.platformStatusCode"><div class="muted platform-status">{{ platform.platformStatus }}</div></ElTooltip>
  <small v-if="platform.platformReadNote" class="platform-read-note">{{ platform.platformReadNote }}</small>
</template>
<style scoped>
.platform-status{font-size:12px;color:#909399;line-height:1.8}.platform-read-note{display:block;line-height:1.6;color:#9b742b;font-size:11px}
</style>
