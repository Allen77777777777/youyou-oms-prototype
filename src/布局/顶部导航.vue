<script setup lang="ts">
import { computed, ref } from 'vue'
import { Bell, FullScreen, Operation, ScaleToOriginal, Search } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

import { 获取全部页面菜单 } from '@/配置/菜单'
import { 标注状态 } from '@/原型标注/标注状态'
import RouteTabs from './页面页签.vue'

const router = useRouter()
const 搜索打开 = ref(false)
const 关键词 = ref('')
const 搜索结果 = computed(() => {
  const 值 = 关键词.value.trim().toLocaleLowerCase()
  if (!值) return []
  return 获取全部页面菜单().filter((菜单) => 菜单.标题.toLocaleLowerCase().includes(值)).slice(0, 12)
})

function 切换全屏() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen()
  } else {
    void document.exitFullscreen()
  }
}

function 设置密度(密度: string) {
  document.documentElement.dataset.density = 密度
}

async function 打开搜索结果(路径?: string) {
  if (!路径) return
  搜索打开.value = false
  关键词.value = ''
  await router.push(路径)
}
</script>

<template>
  <header class="顶部导航">
    <RouteTabs />
    <div class="顶部工具">
      <ElPopover placement="bottom-end" :width="280" trigger="click">
        <template #reference>
          <ElBadge is-dot class="通知标记">
            <button class="图标按钮" type="button" aria-label="公告通知"><ElIcon :size="19"><Bell /></ElIcon></button>
          </ElBadge>
        </template>
        <div class="通知空状态">
          <strong>公告</strong>
          <span>暂无新通知</span>
        </div>
      </ElPopover>
      <ElTooltip content="搜索" placement="bottom">
        <button class="图标按钮" type="button" aria-label="搜索" @click="搜索打开 = true"><ElIcon :size="19"><Search /></ElIcon></button>
      </ElTooltip>
      <ElTooltip content="全屏" placement="bottom">
        <button class="图标按钮" type="button" aria-label="全屏" @click="切换全屏"><ElIcon :size="19"><FullScreen /></ElIcon></button>
      </ElTooltip>
      <ElDropdown trigger="click" @command="设置密度">
        <button class="图标按钮" type="button" aria-label="界面尺寸"><ElIcon :size="19"><ScaleToOriginal /></ElIcon></button>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem command="compact">紧凑</ElDropdownItem>
            <ElDropdownItem command="default">默认</ElDropdownItem>
            <ElDropdownItem command="large">较大</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <ElTooltip content="标注模式" placement="bottom">
        <button class="图标按钮" :class="{ 开启: 标注状态.标注模式.value }" type="button" aria-label="标注模式" @click="标注状态.切换模式()">
          <ElIcon :size="19"><Operation /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip content="原型环境" placement="bottom-end">
        <button class="用户入口" type="button" aria-label="用户菜单">U</button>
      </ElTooltip>
    </div>
  </header>

  <ElDialog v-model="搜索打开" class="菜单搜索弹窗" width="600px" :show-close="false" align-center>
    <ElInput v-model="关键词" size="large" clearable autofocus placeholder="搜索功能菜单">
      <template #prefix><ElIcon><Search /></ElIcon></template>
    </ElInput>
    <div class="搜索结果">
      <button v-for="菜单 in 搜索结果" :key="菜单.id" type="button" @click="打开搜索结果(菜单.路径)">
        <span>{{ 菜单.标题 }}</span>
        <small>{{ 菜单.来源 }}</small>
      </button>
      <div v-if="关键词 && !搜索结果.length" class="无搜索结果">没有匹配的功能</div>
    </div>
  </ElDialog>
</template>

<style scoped>
.顶部导航 {
  position: relative;
  z-index: 10;
  display: flex;
  height: var(--yy-header-height);
  flex: 0 0 var(--yy-header-height);
  align-items: center;
  background: white;
  box-shadow: 0 1px 3px rgb(0 0 0 / 4%);
}

.顶部工具 {
  display: flex;
  height: 100%;
  margin-left: auto;
  flex: 0 0 auto;
  align-items: center;
  padding-right: 14px;
}

.图标按钮 {
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #51565e;
  cursor: pointer;
}

.图标按钮:hover,
.图标按钮.开启 {
  background: #f5f7fa;
  color: #409eff;
}

.通知标记 {
  height: 38px;
}

.用户入口 {
  display: grid;
  width: 30px;
  height: 30px;
  margin-left: 8px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: #e1ecff;
  color: #377de8;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.通知空状态 {
  display: flex;
  min-height: 88px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  color: var(--yy-text-secondary);
  text-align: center;
}

.通知空状态 strong {
  color: var(--yy-text-primary);
  font-size: 14px;
}

.搜索结果 {
  display: flex;
  max-height: 360px;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;
  overflow: auto;
}

.搜索结果 button {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--yy-text-regular);
  cursor: pointer;
  text-align: left;
}

.搜索结果 button:hover {
  background: #ecf5ff;
  color: #409eff;
}

.搜索结果 small {
  color: #a1a7b1;
}

.无搜索结果 {
  padding: 28px 0;
  color: var(--yy-text-secondary);
  text-align: center;
}
</style>
