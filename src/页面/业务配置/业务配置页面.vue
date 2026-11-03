<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Clock, EditPen, Setting } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElInputNumber, ElMessage, ElSwitch, ElTag } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 共享审单执行设置 as settings, 保存审单执行设置 } from './规则执行设置'
import PushSettingsPanel from './自动推单设置面板.vue'

const section = ref<'review' | 'push'>('review')
const editing = ref(false)
const draftEnabled = ref(false)
const draftHours = ref<number | undefined>(2)
const error = ref('')
const settingsHeading = ref<HTMLElement>()

async function openRuleSettings() {
  section.value = 'review'
  await nextTick()
  settingsHeading.value?.scrollIntoView?.({ block: 'start' })
  settingsHeading.value?.focus({ preventScroll: true })
}

function edit() {
  draftEnabled.value = settings.value.enabled
  draftHours.value = settings.value.intervalHours
  error.value = ''
  editing.value = true
}

function save() {
  error.value = 保存审单执行设置({ enabled: draftEnabled.value, intervalHours: draftHours.value ?? NaN })
  if (error.value) return
  editing.value = false
  ElMessage.success('规则执行设置已保存')
}

const annotation: 原型标注 = {
  id: 'business-settings-review-schedule',
  锚点: 'business-settings-review-schedule',
  路由: '/oms/self-fulfillment/business-settings',
  标题: '规则执行设置',
  分类: '规则',
  状态: '待评审',
  版本: '0.2',
  事实等级: '合理假设',
  说明: '用户确认循环执行与立即执行使用同一套审单规则。默认关闭、间隔初值 2 小时及 1 至 24 整小时范围为本轮实现方案。',
  prd引用: ['PRD/订单规则功能PRD.md', 'PRD/业务配置功能PRD.md'],
  交互规则: [
    '保存后按当前间隔启动或调整循环，取消编辑保留原设置。关闭循环后仍可在订单处理立即执行一轮。',
    '每轮按当时的待审核队列逐单检查。命中团队审单规则的订单留待人工复核，人工审核只校验系统默认发货条件。',
    '本地会话内切换页面继续计时，刷新或关闭原型结束会话。正式后台调度、配置持久化、权限及审计待接入。',
  ],
}
const navigationAnnotation: 原型标注 = {
  ...annotation,
  id: 'business-settings-navigation',
  锚点: 'business-settings-navigation',
  标题: '业务配置左侧导航',
  分类: '交互',
  事实等级: '已确认',
  版本: '0.3',
  说明: '左侧提供规则执行设置、自动推单设置，分别维护审单与推仓任务。',
  交互规则: ['规则执行设置默认高亮。切换或重复选择保留各自未保存草稿，只有保存使设置生效。'],
}
</script>

<template>
  <section class="business-settings">
    <header class="page-heading"><h1>业务配置</h1></header>
    <div class="settings-layout">
      <nav v-prototype="navigationAnnotation" class="settings-navigation" aria-label="业务配置导航">
        <button type="button" class="navigation-item" :class="{ active: section === 'review' }" :aria-current="section === 'review' ? 'page' : undefined"
          aria-controls="rule-execution-settings" @click="openRuleSettings">
          <ElIcon :size="17"><Setting /></ElIcon>
          <span>规则执行设置</span>
        </button>
        <button type="button" class="navigation-item" :class="{ active: section === 'push' }"
          :aria-current="section === 'push' ? 'page' : undefined" aria-controls="auto-push-settings" @click="section = 'push'">
          <ElIcon :size="17"><Clock /></ElIcon><span>自动推单设置</span>
        </button>
      </nav>
      <div v-show="section === 'review'" class="settings-body">
        <h2 id="rule-execution-settings" ref="settingsHeading" tabindex="-1">规则执行设置</h2>
        <section v-prototype="annotation" class="settings-panel" aria-labelledby="review-schedule-title">
          <header class="panel-heading">
            <span class="clock-icon"><ElIcon :size="18"><Clock /></ElIcon></span>
            <h3 id="review-schedule-title">定时执行审单规则</h3>
            <ElTag :type="settings.enabled ? 'success' : 'info'" effect="light" size="small">
              {{ editing ? '当前' : '' }}{{ settings.enabled ? '已开启' : '已关闭' }}
            </ElTag>
            <ElButton v-if="!editing" :icon="EditPen" class="edit-button" @click="edit">编辑</ElButton>
          </header>
          <dl class="setting-rows">
            <div v-if="editing" class="setting-row">
              <dt>循环执行</dt>
              <dd><ElSwitch v-model="draftEnabled" aria-label="循环执行审单规则" /></dd>
            </div>
            <div class="setting-row">
              <dt>执行间隔</dt>
              <dd v-if="editing">
                <div class="hours-input">
                  <span>每</span>
                  <ElInputNumber v-model="draftHours" aria-label="执行间隔（小时）" :min="1" :max="24" :step="1"
                    controls-position="right" @change="error = ''" />
                  <span>小时执行一轮</span>
                  <small>可设 1～24 小时</small>
                </div>
                <p v-if="error" role="alert" class="error">{{ error }}</p>
              </dd>
              <dd v-else>每 <strong>{{ settings.intervalHours }}</strong> 小时执行一轮</dd>
            </div>
            <div class="setting-row"><dt>订单范围</dt><dd>执行时全部处于「待审核」的自发货订单</dd></div>
            <div class="setting-row"><dt>审单依据</dt><dd>系统默认审单规则、当前已启用的自定义审单规则</dd></div>
            <div class="setting-row"><dt>执行结果</dt><dd>审核通过的订单进入「待推单」，被拦截的订单留待处理。</dd></div>
          </dl>
          <footer v-if="editing" class="panel-actions">
            <ElButton type="primary" @click="save">保存</ElButton>
            <ElButton @click="editing = false">取消</ElButton>
          </footer>
        </section>
        <p class="schedule-tip">需要立即检查时，可在「订单处理 → 待审核」点击「执行审单规则」。</p>
      </div>
      <div v-show="section === 'push'" class="settings-body"><PushSettingsPanel /></div>
    </div>
  </section>
</template>

<style scoped>
.business-settings { display: flex; flex-direction: column; min-height: 100%; color: var(--yy-text-regular); font-size: 14px; }
.page-heading { flex-shrink: 0; border-bottom: 1px solid var(--yy-border-light); padding: 17px 22px; }
h1, h2, h3, p, dl, dd { margin: 0; }
h1, h2, h3 { color: var(--yy-text-heading); font-weight: 600; }
h1 { font-size: 18px; }
.settings-layout { display: grid; grid-template-columns: 196px minmax(0, 1fr); flex: 1; }
.settings-navigation { padding: 16px 12px; border-right: 1px solid var(--yy-border-light); background: #fafbfd; }
.navigation-item { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 15px; border: 0; border-radius: 4px; background: transparent; color: var(--yy-text-regular); font: inherit; text-align: left; cursor: pointer; }
.navigation-item.active { background: #eaf3ff; color: #287ad2; font-weight: 500; }
.navigation-item.active::before { position: absolute; inset: 10px auto 10px 0; width: 3px; border-radius: 2px; background: #3286e5; content: ''; }
.navigation-item:hover { background: #e5f0ff; }
.navigation-item:focus-visible { outline: 2px solid #3286e5; outline-offset: 2px; }
.settings-body { min-width: 0; width: 100%; max-width: 1140px; padding: 24px; }
h2 { display: flex; gap: 9px; align-items: center; margin-bottom: 16px; font-size: 16px; }
h2::before { width: 3px; height: 15px; background: var(--yy-primary); border-radius: 2px; content: ''; }
h2:focus-visible { outline: 2px solid #3286e5; outline-offset: 5px; }
.settings-panel { border: 1px solid var(--yy-border); border-radius: 6px; overflow: hidden; }
.panel-heading { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 12px 20px; background: #f7f9fc; border-bottom: 1px solid var(--yy-border-light); }
.clock-icon { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; color: #337ecc; background: #e7f1ff; border-radius: 5px; }
h3 { font-size: 15px; }
.edit-button { margin-left: auto; }
.setting-rows { padding: 9px 22px; }
.setting-row { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: baseline; gap: 12px; padding: 13px 0; line-height: 22px; }
.setting-row + .setting-row { border-top: 1px solid var(--yy-border-light); }
dt { color: var(--yy-text-secondary); }
.hours-input, .panel-actions { display: flex; align-items: center; }
.hours-input { gap: 8px; }
.hours-input small { color: var(--yy-text-secondary); }
.hours-input .el-input-number { width: 100px; }
.panel-actions { padding: 12px 22px; border-top: 1px solid var(--yy-border-light); }
.schedule-tip { margin: 14px 2px; color: var(--yy-text-secondary); line-height: 1.6; font-size: 13px; }
.error { color: var(--yy-danger); font-size: 13px; margin-top: 6px; }
</style>
