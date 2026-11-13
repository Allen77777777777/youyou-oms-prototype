<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElPopover } from 'element-plus'
import type { 拆单动作配置 } from './拆单规则模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 拆单列表摘要, 拆单配置摘要 } from './拆单配置展示'

const props = defineProps<{ action?: 拆单动作配置; channels: readonly 渠道配置[] }>()
const visible = ref(false)
const lines = computed(() => 拆单列表摘要(props.action))
const detail = computed(() => 拆单配置摘要(props.action, props.channels))
</script>

<template>
  <ElPopover v-model:visible="visible" trigger="hover" role="dialog" placement="left-start" :width="460" :show-after="180" :popper-style="{ maxWidth: 'calc(100vw - 40px)' }">
    <template #reference><button type="button" class="拆单列表动作摘要" aria-label="查看完整拆单动作" :aria-expanded="visible" @click="visible = true" @focus="visible = true" @blur="visible = false" @keydown.esc.stop="visible = false"><span v-for="(line,index) in lines" :key="index" :class="{ 拆单摘要标题: index === 0 }">{{ line }}</span></button></template>
    <div class="拆单完整动作"><strong>完整拆单动作</strong><p v-for="(line,index) in detail" :key="index">{{ line }}</p></div>
  </ElPopover>
</template>

<style scoped>
.拆单列表动作摘要{display:block;width:100%;padding:0;border:0;background:none;text-align:left;font:inherit;font-size:12px;line-height:20px;color:var(--yy-text-secondary);cursor:help}.拆单列表动作摘要>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;max-height:40px}.拆单列表动作摘要>span+span{margin-top:3px}.拆单列表动作摘要>.拆单摘要标题{-webkit-line-clamp:1;max-height:20px;color:var(--yy-text-heading);font-weight:500}.拆单列表动作摘要:focus-visible{outline:1px solid var(--yy-primary);outline-offset:3px;border-radius:2px}.拆单完整动作{max-height:55vh;overflow:auto;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.拆单完整动作>strong{display:block;color:var(--yy-text-heading);font-size:13px;margin-bottom:10px}.拆单完整动作 p{margin:6px 0;color:var(--yy-text-regular)}
</style>
