<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import type { 原型标注 } from '@/类型/标注'

const route = useRoute()
const 页面名称 = computed(() => String(route.meta.title ?? '页面'))
const 页面来源 = computed(() => String(route.meta.source ?? '现有中台'))
const 占位标注 = computed<原型标注>(() => ({
  id: `placeholder.${String(route.name ?? 'page')}`,
  标题: `${页面名称.value}页面占位`,
  说明: '该位置已接入菜单、路由和原型标注底座，具体页面交互将在对应 PRD 阶段补充。',
  路由: route.path,
  锚点: 'page.placeholder',
  版本: '0.1.0',
  状态: '草稿',
  事实等级: '已确认',
}))
</script>

<template>
  <section class="占位页面">
    <div v-prototype="占位标注" class="占位内容">
      <span class="占位来源">{{ 页面来源 }}</span>
      <h1>{{ 页面名称 }}</h1>
      <p>页面位置已预留，具体原型内容将在对应 PRD 阶段补充。</p>
    </div>
  </section>
</template>

<style scoped>
.占位页面 {
  display: grid;
  min-height: 100%;
  place-items: center;
}

.占位内容 {
  color: var(--yy-text-secondary);
  text-align: center;
}

.占位来源 {
  color: var(--yy-primary);
  font-size: 12px;
  font-weight: 600;
}

h1 {
  margin: 12px 0 8px;
  color: var(--yy-text-primary);
  font-size: 22px;
  letter-spacing: 0;
}

p {
  margin: 0;
  font-size: 14px;
}
</style>
