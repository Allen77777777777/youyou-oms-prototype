<script setup lang="ts">
import { DArrowLeft } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

import type { 菜单节点 } from '@/类型/菜单'

const props = defineProps<{ 菜单?: 菜单节点 }>()
const emit = defineEmits<{ 关闭: [] }>()
const router = useRouter()

async function 前往页面(页面: 菜单节点) {
  if (!页面.路径) return
  await router.push(页面.路径)
  emit('关闭')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="功能菜单">
      <div v-if="props.菜单" class="功能菜单遮罩" @click.self="emit('关闭')">
        <aside class="功能菜单面板" :aria-label="`${props.菜单.标题}功能菜单`">
          <div class="功能菜单内容">
            <section v-for="分组 in props.菜单.子菜单" :key="分组.id" class="功能分组">
              <h2>{{ 分组.标题 }}</h2>
              <button
                v-for="页面 in 分组.子菜单"
                :key="页面.id"
                type="button"
                @click="前往页面(页面)"
              >
                {{ 页面.标题 }}
              </button>
            </section>
          </div>
          <ElTooltip content="收起功能菜单" placement="right">
            <button class="收起按钮" type="button" aria-label="收起功能菜单" @click="emit('关闭')">
              <ElIcon :size="16"><DArrowLeft /></ElIcon>
            </button>
          </ElTooltip>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.功能菜单遮罩 {
  position: fixed;
  z-index: 30;
  inset: 0 0 0 var(--yy-sidebar-width);
  background: rgb(0 0 0 / 48%);
}

.功能菜单面板 {
  position: relative;
  width: fit-content;
  min-width: 220px;
  max-width: calc(100vw - var(--yy-sidebar-width) - 4px);
  height: 100vh;
  background: white;
  box-shadow: 0 16px 48px 16px rgb(0 0 0 / 8%), 0 12px 32px rgb(0 0 0 / 12%), 0 8px 16px -8px rgb(0 0 0 / 16%);
}

.功能菜单内容 {
  display: flex;
  width: fit-content;
  min-width: 220px;
  max-width: calc(100vw - var(--yy-sidebar-width) - 4px);
  height: 100%;
  align-content: flex-start;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 20px;
  overflow: auto;
  padding: 16px 36px 24px 20px;
}

.功能分组 {
  width: max-content;
  min-width: 132px;
  padding-right: 24px;
}

.功能分组 h2 {
  position: relative;
  height: 22px;
  margin: 14px 0 12px;
  padding-left: 12px;
  color: #909399;
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
  letter-spacing: 0;
}

.功能分组 h2::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: #409eff;
  content: '';
}

.功能分组 button {
  display: block;
  width: 100%;
  height: 36px;
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #303133;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  text-align: left;
  white-space: nowrap;
}

.功能分组 button:hover {
  background: #ecf5ff;
  color: #409eff;
}

.收起按钮 {
  position: absolute;
  top: 50%;
  right: 0;
  display: grid;
  width: 24px;
  height: 72px;
  padding: 0;
  place-items: center;
  transform: translate(0, -50%);
  border: 1px solid #edf0f5;
  border-right: 0;
  border-radius: 10px 0 0 10px;
  background: #f7f8fa;
  color: #9aa1ac;
  cursor: pointer;
  box-shadow: -2px 0 8px rgb(0 0 0 / 4%);
}

.收起按钮:hover {
  color: #409eff;
}

.功能菜单-enter-active,
.功能菜单-leave-active {
  transition: opacity 150ms ease;
}

.功能菜单-enter-active .功能菜单面板,
.功能菜单-leave-active .功能菜单面板 {
  transition: transform 150ms ease;
}

.功能菜单-enter-from,
.功能菜单-leave-to {
  opacity: 0;
}

.功能菜单-enter-from .功能菜单面板,
.功能菜单-leave-to .功能菜单面板 {
  transform: translateX(-18px);
}
</style>
