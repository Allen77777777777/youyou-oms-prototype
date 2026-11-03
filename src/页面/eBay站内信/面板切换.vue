<script setup lang="ts">
import { ElTooltip } from 'element-plus'
defineProps<{ label: string; side: 'left' | 'middle' | 'right'; active: boolean; disabled?: boolean }>()
defineEmits<{ toggle: [] }>()
</script>
<template>
  <ElTooltip :content="disabled ? `至少保留一个窗口 · ${label}` : `${active ? '隐藏' : '显示'}${label}`" placement="bottom">
    <button type="button" class="mail-panel-toggle" :class="{ active }" :aria-label="`${active ? '隐藏' : '显示'}${label}`" :aria-pressed="active" :aria-disabled="disabled || undefined" @click="!disabled && $emit('toggle')">
      <svg width="21" height="19" viewBox="0 0 24 22" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="16" rx="3" stroke="currentColor" stroke-width="1.4" /><path d="M8 3v16M16 3v16" stroke="currentColor" stroke-width="1.1" opacity=".6" /><rect :x="side === 'left' ? 3.4 : side === 'middle' ? 9.4 : 17.4" y="4.5" :width="side === 'middle' ? 5.2 : 3.2" height="13" rx=".8" fill="currentColor" :opacity="active ? .8 : .18" /></svg>
    </button>
  </ElTooltip>
</template>
<style scoped>
.mail-panel-toggle{display:grid;place-items:center;flex:none;width:32px;height:30px;border:0;border-radius:4px;background:transparent;color:#7e8897;cursor:pointer}.mail-panel-toggle:hover{background:#edf1f6;color:#3e526b}.mail-panel-toggle.active{background:#eaf2ff;color:#347fc8}.mail-panel-toggle:focus-visible{outline:2px solid #409eff;outline-offset:1px}.mail-panel-toggle[aria-disabled=true]{cursor:default}
</style>
