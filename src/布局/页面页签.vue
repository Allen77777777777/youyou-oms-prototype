<script setup lang="ts">
import { ref, watch } from 'vue'
import { Close, HomeFilled, RefreshRight } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'

interface 页签 {
  路径: string
  标题: string
}

const route = useRoute()
const router = useRouter()
const 已打开页签 = ref<页签[]>([])

function 获取当前页签标题() {
  const 基础标题 = String(route.meta.title ?? '')
  const 标题参数名 = route.meta.tabTitleParam
  if (typeof 标题参数名 !== 'string') return 基础标题

  const 路由参数 = route.params[标题参数名]
  const 标题参数 = Array.isArray(路由参数) ? 路由参数[0] : 路由参数
  if (!标题参数) return 基础标题

  const 标题前缀 = String(route.meta.tabTitlePrefix ?? 基础标题)
  return `${标题前缀} · ${标题参数}`
}

watch(
  () => route.fullPath,
  () => {
    const 标题 = 获取当前页签标题()
    if (!标题 || route.path === '/index' || 已打开页签.value.some((页签) => 页签.路径 === route.path)) return
    已打开页签.value.push({ 路径: route.path, 标题 })
  },
  { immediate: true },
)

async function 关闭页签(页签: 页签) {
  const 索引 = 已打开页签.value.findIndex((项目) => 项目.路径 === 页签.路径)
  已打开页签.value.splice(索引, 1)
  if (页签.路径 !== route.path) return

  const 下一页签 = 已打开页签.value[Math.max(0, 索引 - 1)]
  await router.push(下一页签?.路径 ?? '/index')
}
</script>

<template>
  <nav class="页面页签" aria-label="已打开页面">
    <div class="固定页签">
      <ElTooltip content="刷新当前页" placement="bottom">
        <button class="刷新按钮" type="button" aria-label="刷新当前页" @click="router.go(0)">
          <ElIcon :size="15"><RefreshRight /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip content="首页" placement="bottom">
        <button class="首页页签" :class="{ 激活: route.path === '/index' }" type="button" aria-label="首页" @click="router.push('/index')">
          <ElIcon :size="15"><HomeFilled /></ElIcon>
        </button>
      </ElTooltip>
    </div>
    <div class="滚动页签">
      <button
        v-for="页签 in 已打开页签"
        :key="页签.路径"
        class="页签项"
        :class="{ 激活: 页签.路径 === route.path }"
        type="button"
        @click="router.push(页签.路径)"
      >
        <span>{{ 页签.标题 }}</span>
        <ElIcon class="关闭页签" :size="12" aria-label="关闭页签" @click.stop="关闭页签(页签)">
          <Close />
        </ElIcon>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.页面页签 {
  display: flex;
  min-width: 0;
  height: 44px;
  flex: 1;
  align-items: center;
  overflow: hidden;
}

.固定页签 {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding-left: 14px;
}

.刷新按钮,
.首页页签,
.页签项 {
  display: flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: #606266;
  cursor: pointer;
}

.刷新按钮,
.首页页签 {
  width: 28px;
  padding: 0;
  border-radius: 6px;
}

.刷新按钮:hover,
.首页页签:hover,
.页签项:hover {
  background: #f2f5f9;
  color: #409eff;
}

.首页页签.激活,
.页签项.激活 {
  border-color: #409eff;
  background: #409eff;
  color: white;
}

.滚动页签 {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.滚动页签::-webkit-scrollbar {
  display: none;
}

.页签项 {
  max-width: 180px;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0 8px 0 10px;
  border-radius: 4px;
  font-size: 12px;
}

.页签项 span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.关闭页签 {
  border-radius: 50%;
}

.关闭页签:hover {
  background: rgb(255 255 255 / 22%);
}
</style>
