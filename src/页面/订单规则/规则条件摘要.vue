<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElPopover } from 'element-plus'
const props = defineProps<{ lines: string[] }>()
const 文本 = ref<HTMLElement>(), 溢出 = ref(false), 展开 = ref(false)
let observer: ResizeObserver | undefined
async function 测量() { await nextTick(); const element = 文本.value; 溢出.value = !!element && element.scrollHeight > element.clientHeight + 1; if (!溢出.value) 展开.value = false }
watch(() => props.lines, 测量, { deep: true })
onMounted(() => { void 测量(); if (typeof ResizeObserver !== 'undefined' && 文本.value) { observer = new ResizeObserver(() => { void 测量() }); observer.observe(文本.value) } })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <ElPopover v-model:visible="展开" :disabled="!溢出" trigger="hover" placement="right" :width="440" :show-after="150" popper-class="订单规则条件浮窗">
    <template #reference><div ref="文本" class="条件摘要三行" :class="{ '可展开': 溢出 }" :tabindex="溢出 ? 0 : undefined" :aria-label="溢出 ? '查看完整匹配条件' : undefined" @focus="展开 = 溢出" @blur="展开 = false" @keydown.esc="展开 = false">{{ lines.join('\n') }}</div></template>
    <div class="完整条件"><strong>完整匹配条件</strong><p v-for="(line,index) in lines" :key="index">{{ line }}</p></div>
  </ElPopover>
</template>

<style scoped>
.条件摘要三行{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;white-space:pre-line;overflow-wrap:anywhere;line-height:20px;font-size:12px;color:#637185;max-height:60px}.条件摘要三行.可展开{cursor:help}.条件摘要三行:focus-visible{outline:1px solid var(--yy-primary);outline-offset:3px}.完整条件{max-height:50vh;overflow:auto;font-size:12px;line-height:1.8;white-space:pre-line;overflow-wrap:anywhere}.完整条件>strong{display:block;color:var(--yy-text-heading);font-size:13px;margin-bottom:10px}.完整条件 p{margin:6px 0;color:var(--yy-text-regular)}
</style>
