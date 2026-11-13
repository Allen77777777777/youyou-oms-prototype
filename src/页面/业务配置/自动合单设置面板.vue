<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, EditPen, VideoPlay } from '@element-plus/icons-vue'
import { ElButton, ElDrawer, ElIcon, ElInputNumber, ElMessage, ElMessageBox, ElRadioButton, ElRadioGroup, ElSwitch, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 共享自动合单设置 as settings, 共享下次合单时间, 自动合单调度错误, 保存自动合单设置 } from './自动合单设置'
import { 共享合单记录, 共享合单执行结果 as result, 执行合单轮次 } from '../订单处理/自动合单会话'

const editing = ref(false)
const enabled = ref(false)
const frequency = ref<30 | 60 | 'custom'>(30)
const minutes = ref<number | undefined>(30)
const error = ref('')
const running = ref(false)
const resultVisible = ref(false)
const waitingCount = computed(() => 共享合单记录.value.filter(row => row.status === '等单中' || row.status === '待本轮处理').length)
function formatTime(value: number | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }).replace(/\//g, '-')
}
function edit() {
  enabled.value = settings.value.enabled
  minutes.value = settings.value.intervalMinutes
  frequency.value = minutes.value === 30 || minutes.value === 60 ? minutes.value : 'custom'
  error.value = ''
  editing.value = true
}
async function save() {
  const intervalMinutes = frequency.value === 'custom' ? minutes.value ?? NaN : frequency.value
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    error.value = '执行间隔须为 1～1440 的整数分钟'
    return
  }
  if (settings.value.enabled && !enabled.value && waitingCount.value > 0) {
    try {
      await ElMessageBox.confirm(
        `当前有 ${waitingCount.value} 个订单正在等待合单。关闭后将结束这些等待，订单继续分仓和审核；放单不代表审核通过或发货。`,
        '关闭自动合单',
        { confirmButtonText: '关闭并结束等待', cancelButtonText: '继续开启', type: 'warning' },
      )
    } catch { return }
  }
  error.value = 保存自动合单设置({ enabled: enabled.value, intervalMinutes })
  if (error.value) return
  editing.value = false
  ElMessage.success('自动合单设置已保存')
}
async function run() {
  running.value = true
  try {
    自动合单调度错误.value = ''
    await 执行合单轮次(Date.now(), '立即执行')
    resultVisible.value = true
  } catch (cause) {
    自动合单调度错误.value = `自动合单执行失败：${cause instanceof Error ? cause.message : String(cause)}`
  } finally { running.value = false }
}
const annotation: 原型标注 = {
  id: 'business-settings-auto-merge', 锚点: 'business-settings-auto-merge', 路由: '/oms/self-fulfillment/business-settings?section=merge',
  标题: '自动合单调度与结果', 分类: '规则', 状态: '待评审', 版本: '0.1', 事实等级: '合理假设',
  说明: '用户授权基础及高级等单、放单原型。全局任务默认关闭、每30分钟，以及1～1440整数分钟为本轮方案，规则内独立配置匹配、等单与放单条件。',
  prd引用: ['PRD/合单规则功能PRD.md', 'PRD/业务配置功能PRD.md', 'PRD/订单规则功能PRD.md#11-自动处理主链顺序2026-11-12-已确认'],
  交互规则: [
    '开启或变更间隔后满一个周期执行首轮；保存相同设置不重置周期。取消不改变生效设置。基础模式在一轮内尝试合单后结束等待，高级模式按规则持续等单。',
    '仅处理待审核且未拆单、未进入后续执行的自发货订单。合单完成或放单后继续分仓、审单及系统默认发货条件校验，不表示审核通过。',
    '放单截止独立于批次调度计时，最长等待、发货截止保护与指定放单时间不等待下一轮扫描。关闭自动任务结束已有等待并停止定时扫描。',
    '立即执行不受全局启停影响，关闭状态下立即执行仍可按高级规则等单并按时放单。执行结果列按订单数统计，最近一次结果替换前次。',
    '仅本地虚构会话：切页继续，刷新或关闭结束。真实后台任务、接口、持久化、权限与审计未接入；浏览器计时不能替代服务端截止保障。',
  ],
}
</script>

<template>
  <div id="auto-merge-settings">
    <h2>自动合单设置</h2>
    <section v-prototype="annotation" class="merge-panel" aria-labelledby="auto-merge-title">
      <header class="panel-heading">
        <span class="clock-icon"><ElIcon :size="18"><Clock /></ElIcon></span>
        <h3 id="auto-merge-title">定时执行合单规则</h3>
        <ElTag :type="settings.enabled ? 'success' : 'info'" effect="light" size="small">{{ editing ? '当前' : '' }}{{ settings.enabled ? '已开启' : '已关闭' }}</ElTag>
        <ElButton v-if="!editing" :icon="EditPen" class="edit-button" @click="edit">编辑</ElButton>
      </header>
      <p class="description">按设定间隔检查待审核订单，按各条合单规则完成匹配、等单和放单。</p>
      <dl>
        <div class="setting-row"><dt>状态</dt><dd v-if="editing"><ElSwitch v-model="enabled" aria-label="开启自动合单" /><span class="switch-label">{{ enabled ? '开启' : '关闭' }}</span></dd><dd v-else>{{ settings.enabled ? '开启' : '关闭' }}</dd></div>
        <div class="setting-row"><dt>任务类型</dt><dd>重复任务</dd></div>
        <div class="setting-row"><dt>执行频率</dt><dd v-if="editing"><ElRadioGroup v-model="frequency" aria-label="自动合单执行频率"><ElRadioButton :value="30">每 30 分钟</ElRadioButton><ElRadioButton :value="60">每 1 小时</ElRadioButton><ElRadioButton value="custom">自定义</ElRadioButton></ElRadioGroup><div v-if="frequency === 'custom'" class="minutes-input"><span>每</span><ElInputNumber v-model="minutes" aria-label="自动合单频率（分钟）" :min="1" :max="1440" :step="1" controls-position="right" /><span>分钟执行一轮</span><small>可设 1～1440 的整数分钟</small></div></dd><dd v-else>每 <strong>{{ settings.intervalMinutes }}</strong> 分钟执行一轮</dd></div>
        <div class="setting-row"><dt>下次执行</dt><dd>{{ settings.enabled ? formatTime(共享下次合单时间) : '未开启定时执行' }}<span v-if="settings.enabled" class="muted time-zone">北京时间</span></dd></div>
        <div class="setting-row"><dt>订单范围</dt><dd>待审核、未拆单且尚未进入后续处理的自发货订单；按已启用的合单规则匹配。</dd></div>
        <div class="setting-row"><dt>放单处理</dt><dd>基础模式每轮尝试后放单；高级模式按规则等单，到达放单条件即结束等待，继续分仓和审核。</dd></div>
      </dl>
      <p v-if="editing && error" role="alert" class="error">{{ error }}</p>
      <footer v-if="editing"><ElButton type="primary" @click="save">保存</ElButton><ElButton @click="editing = false">取消</ElButton></footer>
    </section>
    <div class="execution-bar">
      <div><strong>当前等待合单 <span>{{ waitingCount }}</span> 单</strong><p>最长等待、发货截止保护和指定放单时间独立生效，无需等到下一轮。</p></div>
      <div class="execution-actions"><ElButton :icon="VideoPlay" :loading="running" :disabled="editing" @click="run">立即执行一轮</ElButton><ElButton :disabled="!result" @click="resultVisible = true">查看执行结果</ElButton></div>
    </div>
    <p v-if="自动合单调度错误" role="alert" class="error schedule-error">{{ 自动合单调度错误 }}</p>
    <p v-if="result" class="recent-result">最近执行：{{ formatTime(result.executedAt) }} · {{ result.source || '立即执行' }} · 已合并 {{ result.merged }} 单 · 已放单 {{ result.released }} 单 · 继续等单 {{ result.waiting }} 单</p>
    <ElDrawer v-model="resultVisible" title="合单执行结果" size="760px" append-to-body>
      <template v-if="result">
        <p class="result-time">{{ formatTime(result.executedAt) }} · {{ result.source || '立即执行' }} · 北京时间</p>
        <div class="result-stats"><div><span>检查订单</span><strong>{{ result.total }}</strong></div><div><span>已合并</span><strong>{{ result.merged }}</strong></div><div><span>已放单</span><strong>{{ result.released }}</strong></div><div><span>继续等单</span><strong>{{ result.waiting }}</strong></div><div><span>未参与</span><strong>{{ result.skipped }}</strong></div></div>
        <ElTable :data="result.rows" border empty-text="本轮没有需要处理的订单" max-height="560"><ElTableColumn prop="orderNo" label="订单号" min-width="180" /><ElTableColumn prop="status" label="处理结果" width="112" /><ElTableColumn prop="reason" label="原因" min-width="260" /></ElTable>
        <p class="result-note">已合并订单包含在已放单数量内。放单表示结束合单等待；订单仍需完成分仓、审核及系统默认发货条件校验。</p>
      </template>
    </ElDrawer>
  </div>
</template>

<style scoped>
h2, h3, p, dl, dd { margin: 0; }
h2, h3 { color: var(--yy-text-heading); font-weight: 600; }
h2 { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; font-size: 16px; }
h2::before { width: 3px; height: 15px; border-radius: 2px; background: var(--yy-primary); content: ''; }
h3 { font-size: 15px; }
.merge-panel { border: 1px solid var(--yy-border); border-radius: 6px; overflow: hidden; }
.panel-heading { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 12px 20px; background: #f7f9fc; border-bottom: 1px solid var(--yy-border-light); }
.clock-icon { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; border-radius: 5px; color: #337ecc; background: #e7f1ff; }
.edit-button { margin-left: auto; }
.description { padding: 18px 22px 4px; color: var(--yy-text-secondary); line-height: 1.7; }
dl { padding: 3px 22px 9px; }
.setting-row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 13px 0; line-height: 22px; }
.setting-row + .setting-row { border-top: 1px solid var(--yy-border-light); }
dt, .muted { color: var(--yy-text-secondary); }
dd { min-width: 0; overflow-wrap: anywhere; }
.minutes-input { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.minutes-input .el-input-number { width: 112px; flex: 0 0 112px; }
.minutes-input small, .recent-result, .result-time, .result-note { color: var(--yy-text-secondary); font-size: 13px; }
.switch-label, .time-zone { margin-left: 10px; }
footer { display: flex; padding: 12px 22px; border-top: 1px solid var(--yy-border-light); }
.error { margin: 0 22px 12px; color: var(--yy-danger); font-size: 13px; }
.schedule-error { margin: 12px 0; }
.execution-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; }
.execution-bar strong { color: var(--yy-text-heading); font-size: 14px; }
.execution-bar strong span { color: var(--yy-primary); margin: 0 4px; }
.execution-bar p { margin-top: 8px; color: var(--yy-text-secondary); font-size: 13px; line-height: 1.6; }
.execution-actions { display: flex; flex-shrink: 0; }
.recent-result { padding: 12px 16px; background: #f7f9fc; border: 1px solid var(--yy-border-light); border-radius: 5px; line-height: 1.8; }
.result-time { margin-bottom: 18px; }
.result-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-bottom: 20px; padding: 16px; border: 1px solid var(--yy-border-light); border-radius: 6px; background: #f7f9fc; }
.result-stats div { display: grid; gap: 10px; text-align: center; }
.result-stats span { color: var(--yy-text-secondary); font-size: 13px; }
.result-stats strong { color: var(--yy-text-heading); font-size: 24px; }
.result-note { margin-top: 16px; line-height: 1.7; }
@media (max-width: 1100px) { .execution-bar { align-items: flex-start; flex-direction: column; } }
</style>
