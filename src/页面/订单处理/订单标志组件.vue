<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElTooltip } from 'element-plus'
import { 订单处理标注 } from './订单处理原型标注'
import { 合并来源订单标志, 订单标志短释义, type 订单标志, type 订单标志代码 } from './订单标志模型'

const props = defineProps<{ flags: 订单标志[] }>()
const displayed = computed(() => 合并来源订单标志([props.flags]))
const hoverCode = ref<订单标志代码>()
const focusCode = ref<订单标志代码>()
function open(code: 订单标志代码, mode: 'hover' | 'focus') { if (mode === 'hover') hoverCode.value = code; else focusCode.value = code }
function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  hoverCode.value = undefined
  focusCode.value = undefined
  // 只收起标志提示，不拦截详情抽屉等父级的原生 Escape 行为。
}
onMounted(() => document.addEventListener('keydown', closeOnEscape))
onUnmounted(() => document.removeEventListener('keydown', closeOnEscape))
function tooltip(flag: 订单标志) { return 订单标志短释义[flag.code] }
const 标志标注 = 订单处理标注.标志
</script>

<template>
  <div v-if="displayed.length" v-prototype="标志标注" class="订单标志组" role="group" aria-label="订单标志">
    <ElTooltip v-for="flag in displayed" :key="flag.code" :content="tooltip(flag)" :visible="hoverCode === flag.code || focusCode === flag.code" placement="top" :enterable="false" :persistent="false">
      <button type="button" class="订单标志" :class="`标志-${flag.tone}`" tabindex="0" :aria-label="tooltip(flag)" :data-flag-code="flag.code"
        @mouseenter="open(flag.code, 'hover')" @mouseleave="hoverCode = undefined" @focus="open(flag.code, 'focus')" @blur="focusCode = undefined">{{ flag.text }}</button>
    </ElTooltip>
  </div>
</template>

<style scoped>
.订单标志组[role="group"]{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}.订单标志组 .订单标志{display:inline-flex;box-sizing:border-box;flex:0 0 22px;align-items:center;justify-content:center;width:22px;height:22px;padding:0;margin:0;appearance:none;border:1px solid;border-radius:4px;font-family:inherit;font-size:14px;font-weight:600;line-height:1;cursor:default}.订单标志组 .订单标志.标志-red{color:#c73535;background:#fdebec;border-color:#f4bfc0}.订单标志组 .订单标志.标志-orange{color:#9a5700;background:#fff1d6;border-color:#e9bb62}.订单标志组 .订单标志.标志-blue{color:#2558a8;background:#eaf2ff;border-color:#afc8eb}.订单标志:focus-visible{outline:2px solid #287ad2;outline-offset:2px}
</style>
