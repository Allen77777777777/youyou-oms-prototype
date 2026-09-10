<script setup lang="ts">
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'

import { 标注状态 } from './标注状态'

const 是否打开 = computed({
  get: () => Boolean(标注状态.当前标注.value),
  set: (value) => {
    if (!value) 标注状态.关闭()
  },
})

const 当前逻辑区块 = computed(() => {
  const 标注 = 标注状态.当前标注.value
  if (!标注) return []
  return [
    { 标题: '前置条件', 内容: 标注.前置条件 },
    { 标题: '触发方式', 内容: 标注.触发方式 },
    { 标题: '系统动作', 内容: 标注.系统动作 },
    { 标题: '成功结果', 内容: 标注.成功结果 },
    { 标题: '异常处理', 内容: 标注.异常处理 },
    { 标题: '数据来源', 内容: 标注.数据来源 },
    { 标题: '权限与审计', 内容: 标注.权限与审计 },
    { 标题: '验收要点', 内容: 标注.验收要点 },
  ].filter((区块): 区块 is { 标题: string; 内容: string[] } => Boolean(区块.内容?.length))
})
</script>

<template>
  <ElDrawer v-model="是否打开" class="标注抽屉" direction="rtl" size="380px" :with-header="false">
    <div v-if="标注状态.当前标注.value" class="标注正文">
      <button class="关闭标注" type="button" aria-label="关闭交互说明" @click="标注状态.关闭()">
        <ElIcon :size="18"><Close /></ElIcon>
      </button>
      <span class="标注眉题">交互说明</span>
      <h2>{{ 标注状态.当前标注.value.标题 }}</h2>
      <ElTag v-if="标注状态.当前标注.value.事实等级" size="small" effect="plain">
        {{ 标注状态.当前标注.value.事实等级 }}
      </ElTag>
      <p>{{ 标注状态.当前标注.value.说明 }}</p>
      <dl
        v-if="标注状态.当前标注.value.路由 || 标注状态.当前标注.value.锚点 || 标注状态.当前标注.value.版本 || 标注状态.当前标注.value.状态"
        class="标注元数据"
      >
        <template v-if="标注状态.当前标注.value.路由">
          <dt>路由</dt>
          <dd>{{ 标注状态.当前标注.value.路由 }}</dd>
        </template>
        <template v-if="标注状态.当前标注.value.锚点">
          <dt>锚点</dt>
          <dd>{{ 标注状态.当前标注.value.锚点 }}</dd>
        </template>
        <template v-if="标注状态.当前标注.value.版本">
          <dt>版本</dt>
          <dd>{{ 标注状态.当前标注.value.版本 }}</dd>
        </template>
        <template v-if="标注状态.当前标注.value.状态">
          <dt>评审</dt>
          <dd>{{ 标注状态.当前标注.value.状态 }}</dd>
        </template>
      </dl>
      <template v-if="标注状态.当前标注.value.交互规则?.length">
        <h3>交互规则</h3>
        <ol>
          <li v-for="规则 in 标注状态.当前标注.value.交互规则" :key="规则">{{ 规则 }}</li>
        </ol>
      </template>
      <section v-for="区块 in 当前逻辑区块" :key="区块.标题" class="逻辑区块">
        <h3>{{ 区块.标题 }}</h3>
        <ol>
          <li v-for="内容 in 区块.内容" :key="内容">{{ 内容 }}</li>
        </ol>
      </section>
      <template v-if="标注状态.当前标注.value.prd引用?.length">
        <h3>PRD 引用</h3>
        <code v-for="引用 in 标注状态.当前标注.value.prd引用" :key="引用">{{ 引用 }}</code>
      </template>
    </div>
  </ElDrawer>
</template>

<style scoped>
.标注正文 {
  position: relative;
  color: var(--yy-text-regular);
  font-size: 14px;
  line-height: 1.75;
}

.关闭标注 {
  position: absolute;
  top: -4px;
  right: -4px;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: var(--yy-radius);
  background: transparent;
  color: var(--yy-text-secondary);
  cursor: pointer;
}

.关闭标注:hover {
  background: #f5f7fa;
  color: var(--yy-text-primary);
}

.标注眉题 {
  color: var(--yy-primary);
  font-size: 12px;
  font-weight: 600;
}

h2 {
  margin: 8px 0 12px;
  color: var(--yy-text-primary);
  font-size: 20px;
  letter-spacing: 0;
}

h3 {
  margin: 24px 0 8px;
  color: var(--yy-text-primary);
  font-size: 14px;
}

.逻辑区块 + .逻辑区块 h3 {
  margin-top: 18px;
}

p,
ol {
  margin: 16px 0 0;
}

ol {
  padding-left: 20px;
}

.标注元数据 {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 20px 0 0;
  padding: 12px;
  border: 1px solid var(--yy-border-light);
  border-radius: var(--yy-radius);
  background: #f7f8fa;
  font-size: 12px;
}

.标注元数据 dt {
  color: var(--yy-text-secondary);
}

.标注元数据 dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--yy-text-regular);
}

code {
  display: block;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--yy-border);
  border-radius: var(--yy-radius);
  background: #f7f8fa;
  color: var(--yy-text-regular);
  font-family: Consolas, monospace;
  font-size: 12px;
}
</style>
