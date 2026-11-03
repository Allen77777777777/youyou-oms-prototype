<script setup lang="ts">
import { computed, ref } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import { ElIcon, ElMessage, ElTooltip } from 'element-plus'

const props = defineProps<{ value?: string | null; label: string }>()
const copying = ref(false)
const available = computed(() => !!props.value?.trim() && !['—', '-'].includes(props.value.trim()))
async function copy() {
  if (!available.value || copying.value) return
  const value = props.value!
  copying.value = true
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`已复制${props.label}`)
  } catch {
    ElMessage.warning('当前浏览器未允许复制，请手动选择单号')
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <span class="number-copy">
    <span class="number-copy-value"><slot>{{ available ? value : '—' }}</slot></span>
    <ElTooltip v-if="available" :content="`复制${label}`" placement="top" :trigger="['hover', 'focus']" :trigger-keys="[]">
      <button type="button" class="number-copy-button" :aria-label="`复制${label}`" :disabled="copying" @click.stop.prevent="copy"><ElIcon><CopyDocument /></ElIcon></button>
    </ElTooltip>
  </span>
</template>

<style scoped>
.number-copy{display:inline-flex;align-items:center;gap:4px;max-width:100%;vertical-align:middle;line-height:inherit}.number-copy-value{min-width:0;overflow-wrap:anywhere}.number-copy-button{display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;padding:4px;border:0;border-radius:4px;background:transparent;color:#7b8ca0;font-size:14px;cursor:pointer}.number-copy-button:hover{color:var(--yy-primary,#409eff);background:#ecf5ff}.number-copy-button:focus-visible{outline:2px solid var(--yy-primary,#409eff);outline-offset:1px}.number-copy-button:disabled{cursor:wait;opacity:.5}
</style>
