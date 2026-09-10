<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import 品牌标识 from '@/资源/优优侧栏标识.png'
import { 获取菜单路径, 菜单配置 } from '@/配置/菜单'
import type { 菜单节点 } from '@/类型/菜单'

const props = defineProps<{ 已打开菜单?: string }>()
const emit = defineEmits<{ 打开菜单: [菜单?: 菜单节点] }>()
const route = useRoute()
const router = useRouter()

async function 前往(菜单: 菜单节点) {
  if (菜单.类型 === '分组') {
    emit('打开菜单', 菜单)
    return
  }

  emit('打开菜单')
  if (菜单.路径) await router.push(菜单.路径)
}

function 是否激活(菜单: 菜单节点) {
  if (props.已打开菜单) return props.已打开菜单 === 菜单.id
  const 激活菜单路径 = typeof route.meta.activeMenu === 'string' ? route.meta.activeMenu : route.path
  return 获取菜单路径(激活菜单路径)[0]?.id === 菜单.id
}
</script>

<template>
  <aside class="主导航" aria-label="主导航">
    <RouterLink class="品牌标识" to="/index" aria-label="优优业务中台">
      <img :src="品牌标识" alt="" />
    </RouterLink>
    <nav class="主导航列表">
      <template v-for="菜单 in 菜单配置" :key="菜单.id">
        <button
          class="主导航项"
          :class="{ 激活: 是否激活(菜单) }"
          type="button"
          :aria-label="菜单.标题"
          @click="前往(菜单)"
        >
          <ElIcon :size="20"><component :is="菜单.图标" /></ElIcon>
          <span>{{ 菜单.标题 }}</span>
        </button>
      </template>
    </nav>
  </aside>
</template>

<style scoped>
.主导航 {
  position: relative;
  z-index: 20;
  display: flex;
  width: var(--yy-sidebar-width);
  flex: 0 0 var(--yy-sidebar-width);
  flex-direction: column;
  align-items: center;
  background: var(--yy-sidebar-bg);
}

.品牌标识 {
  display: grid;
  width: 54px;
  height: 56px;
  flex: 0 0 56px;
  place-items: center;
}

.品牌标识 img {
  display: block;
  width: 42px;
  height: 48px;
  object-fit: contain;
}

.主导航列表 {
  display: flex;
  width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: #4f5867 transparent;
  scrollbar-width: thin;
}

.主导航项 {
  position: relative;
  display: flex;
  width: 100%;
  height: 64px;
  flex: 0 0 64px;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #8b949e;
  cursor: pointer;
  font-size: 14px;
}

.主导航项:hover {
  background: rgb(255 255 255 / 6%);
  color: white;
}

.主导航项.激活 {
  color: white;
}
</style>
