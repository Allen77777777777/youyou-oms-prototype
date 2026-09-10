<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import AnnotationDrawer from '@/原型标注/标注抽屉.vue'
import type { 菜单节点 } from '@/类型/菜单'
import PrimaryRail from './主导航.vue'
import FeatureMenu from './功能菜单.vue'
import AppHeader from './顶部导航.vue'

const route = useRoute()
const 已打开菜单 = ref<菜单节点>()

function 切换功能菜单(菜单?: 菜单节点) {
  已打开菜单.value = 菜单?.id === 已打开菜单.value?.id ? undefined : 菜单
}

watch(
  () => route.fullPath,
  () => {
    已打开菜单.value = undefined
  },
)
</script>

<template>
  <div class="中台布局">
    <PrimaryRail :已打开菜单="已打开菜单?.id" @打开菜单="切换功能菜单" />
    <section class="工作区">
      <AppHeader />
      <main class="页面内容">
        <RouterView />
      </main>
    </section>
    <FeatureMenu :菜单="已打开菜单" @关闭="已打开菜单 = undefined" />
    <AnnotationDrawer />
  </div>
</template>

<style scoped>
.中台布局 {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.工作区 {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.页面内容 {
  min-height: 0;
  flex: 1;
  overflow: auto;
  margin: 10px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: var(--yy-bg-panel);
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
}
</style>
