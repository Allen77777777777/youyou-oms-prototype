<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElTooltip } from 'element-plus'
import 原型商品占位图 from '@/资源/eBay订单/旗舰手机商品占位-概念图.png'

const props = defineProps<{ src?: string }>()
const 加载失败 = ref(false)
watch(() => props.src, () => { 加载失败.value = false })
</script>

<template>
  <ElTooltip :content="!src || 加载失败 ? '原型商品占位图；正式图片取已确认的商品图片引用' : '商品图片'" placement="top">
    <img class="商品缩略图" :src="!src || 加载失败 ? 原型商品占位图 : src" :alt="!src || 加载失败 ? '原型商品占位图' : '商品图片'" @error="加载失败 = true" />
  </ElTooltip>
</template>

<style scoped>
.商品缩略图 { width: 52px; height: 52px; flex: 0 0 52px; object-fit: contain; border: 1px solid #e2e6eb; border-radius: 4px; background: #f7f8fa; }
</style>
