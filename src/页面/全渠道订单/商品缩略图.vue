<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElPopover, ElTooltip, type PopoverInstance } from 'element-plus'
import 原型商品占位图 from '@/资源/eBay订单/旗舰手机商品占位-概念图.png'

const props = withDefaults(defineProps<{ src?: string; hoverPreview?: boolean }>(), { hoverPreview: false })
const 加载失败 = ref(false)
const 图片预览 = ref<PopoverInstance>()
const 使用占位 = computed(() => !props.src || 加载失败.value)
const 图片来源 = computed(() => 使用占位.value ? 原型商品占位图 : props.src)
const 图片说明 = computed(() => 使用占位.value ? '原型商品占位图' : '商品图片')
watch(() => props.src, () => { 加载失败.value = false })
</script>

<template>
  <ElPopover
    v-if="hoverPreview"
    ref="图片预览"
    :trigger="['hover', 'focus']"
    placement="right-start"
    :fallback-placements="['left-start', 'bottom-start', 'top-start']"
    :width="344"
    :show-after="120"
    :hide-after="80"
    :enterable="false"
    :teleported="true"
    :persistent="false"
    :popper-style="{ maxWidth: 'calc(100vw - 24px)', padding: '12px' }"
    :popper-options="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: true } }] }"
  >
    <template #reference>
      <img class="商品缩略图 可预览" :src="图片来源" :alt="图片说明" tabindex="0" :aria-label="`${图片说明}，悬停或聚焦查看大图`" @error="加载失败 = true" @keydown.esc="图片预览?.hide()" />
    </template>
    <div class="商品大图预览">
      <img class="商品预览图" :src="图片来源" :alt="图片说明" @error="加载失败 = true" />
      <span v-if="使用占位" class="商品图片说明">原型商品占位图；正式图片取已确认的商品图片引用</span>
    </div>
  </ElPopover>
  <ElTooltip v-else :content="使用占位 ? '原型商品占位图；正式图片取已确认的商品图片引用' : '商品图片'" placement="top">
    <img class="商品缩略图" :src="图片来源" :alt="图片说明" @error="加载失败 = true" />
  </ElTooltip>
</template>

<style scoped>
.商品缩略图 { width: 52px; height: 52px; flex: 0 0 52px; object-fit: contain; border: 1px solid #e2e6eb; border-radius: 4px; background: #f7f8fa; }
.商品缩略图.可预览 { cursor: zoom-in; }
.商品缩略图.可预览:focus-visible { outline: 2px solid #409eff; outline-offset: 2px; }
.商品大图预览 { display: flex; flex-direction: column; gap: 8px; }
.商品预览图 { display: block; width: 100%; height: min(320px, calc(100vh - 112px)); object-fit: contain; background: #f7f8fa; border-radius: 4px; }
.商品图片说明 { font-size: 11px; line-height: 1.5; color: #7c899c; overflow-wrap: anywhere; }
</style>
