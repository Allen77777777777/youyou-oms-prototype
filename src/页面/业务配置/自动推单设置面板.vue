<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, EditPen } from '@element-plus/icons-vue'
import { ElButton, ElCheckbox, ElCheckboxGroup, ElIcon, ElInputNumber, ElMessage, ElSwitch, ElTag } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 共享自动推单设置 as settings, 保存自动推单设置, 星期选项 } from './自动推单设置'
import { 最近自动推单轮次, 自动推单调度错误 } from './自动推单执行'

const editing = ref(false)
const enabled = ref(false)
const hours = ref<number | undefined>(1)
const weekdays = ref<number[]>([])
const error = ref('')
const 日期摘要 = computed(() => 星期选项.filter(day => settings.value.weekdays.includes(day.value)).map(day => day.label).join('、'))
function edit() {
  enabled.value = settings.value.enabled
  hours.value = settings.value.intervalHours
  weekdays.value = [...settings.value.weekdays]
  error.value = ''
  editing.value = true
}
function save() {
  error.value = 保存自动推单设置({ enabled: enabled.value, intervalHours: hours.value ?? NaN, weekdays: weekdays.value })
  if (error.value) return
  editing.value = false
  ElMessage.success('自动推单设置已保存')
}
const annotation: 原型标注 = {
  id: 'business-settings-auto-push', 锚点: 'business-settings-auto-push', 路由: '/oms/self-fulfillment/business-settings',
  标题: '定时自动推单', 分类: '规则', 状态: '待评审', 版本: '0.3', 事实等级: '合理假设',
  说明: '用户确认新增自动推仓配置。截图作为交互参考，执行范围使用本系统待推单。默认关闭、每天、每1小时、1～24整小时及按北京时间判断星期为本轮方案。',
  prd引用: ['PRD/业务配置功能PRD.md#7-自动推单设置', 'PRD/订单处理-操作功能PRD.md#54-推单'],
  交互规则: [
    '保存启停、执行日期与频率；至少选一天。变更保存后满一个间隔执行首轮，相同设置不重置，取消不改变生效值。切换配置项保留各自草稿。',
    '每轮扫描全部待推单自配送订单的有效履约，按履约去重；合并检查全部来源，拆分逐包执行，复用人工推单校验。失败不自动重推，异常恢复路径保留人工办理。',
    '仅提交受理时仍待推单。自动任务每分钟查询已认领的下单中请求，明确建单后按全部有效履约聚合；未知或查询失败保留原请求，不重复发送。关闭自动推单仅停止新提交，已提交请求继续核查。',
    '仅本地虚构会话：切页继续计时，刷新或关闭结束。真实仓库API、服务端调度、持久化、权限与审计未接入。运行结果可在本卡片及订单操作记录核对。',
  ],
}
</script>

<template>
  <div id="auto-push-settings">
    <h2>自动推单设置</h2>
    <section v-prototype="annotation" class="push-panel" aria-labelledby="auto-push-title">
      <header class="panel-heading">
        <span class="clock-icon"><ElIcon :size="18"><Clock /></ElIcon></span>
        <h3 id="auto-push-title">定时自动推单</h3>
        <ElTag :type="settings.enabled ? 'success' : 'info'" effect="light" size="small">{{ editing ? '当前' : '' }}{{ settings.enabled ? '已开启' : '已关闭' }}</ElTag>
        <ElButton v-if="!editing" :icon="EditPen" class="edit-button" @click="edit">编辑</ElButton>
      </header>
      <p class="description">按设置的日期和频率，将「待推单」中符合发货条件的订单自动推送至海外仓。</p>
      <dl>
        <div class="setting-row"><dt>状态</dt><dd v-if="editing"><ElSwitch v-model="enabled" aria-label="开启自动推单" /><span class="switch-label">{{ enabled ? '开启' : '关闭' }}</span></dd><dd v-else>{{ settings.enabled ? '开启' : '关闭' }}</dd></div>
        <div class="setting-row"><dt>任务类型</dt><dd>重复任务</dd></div>
        <div class="setting-row"><dt>执行日期</dt><dd v-if="editing"><ElCheckboxGroup v-model="weekdays" aria-label="自动推单执行日期"><ElCheckbox v-for="day in 星期选项" :key="day.value" :value="day.value">{{ day.label }}</ElCheckbox></ElCheckboxGroup></dd><dd v-else>{{ 日期摘要 }}</dd></div>
        <div class="setting-row"><dt>执行频率</dt><dd v-if="editing"><div class="hours-input"><span>每</span><ElInputNumber v-model="hours" aria-label="自动推单频率（小时）" :min="1" :max="24" :step="1" controls-position="right" /><span>小时执行一轮</span><small>可设 1～24 小时</small></div></dd><dd v-else>每 <strong>{{ settings.intervalHours }}</strong> 小时执行一轮</dd></div>
        <div class="setting-row"><dt>订单范围</dt><dd>全部「待推单」自发货订单，按履约单检查并推送。</dd></div>
        <div class="setting-row"><dt>执行结果</dt><dd>自动同步仓库结果，确认建单成功后进入「待发货」。</dd></div>
      </dl>
      <p v-if="editing && error" role="alert" class="error">{{ error }}</p>
      <footer v-if="editing"><ElButton type="primary" @click="save">保存</ElButton><ElButton @click="editing = false">取消</ElButton></footer>
    </section>
    <p class="schedule-tip">执行日期按北京时间判断。已提交、结果待核查或明确失败的履约不会重复推送；异常恢复的履约需人工推单。</p>
    <p v-if="自动推单调度错误" role="alert" class="error">{{ 自动推单调度错误 }}</p>
    <details v-if="最近自动推单轮次" class="run-result">
      <summary>最近执行：{{ 最近自动推单轮次.time }} · 已提交 {{ 最近自动推单轮次.submitted }} · 拦截 {{ 最近自动推单轮次.blocked }} · 跳过 {{ 最近自动推单轮次.skipped }}</summary>
      <p v-if="!最近自动推单轮次.rows.length">本轮没有待推单履约。</p>
      <ul v-else><li v-for="row in 最近自动推单轮次.rows" :key="row.fulfillmentNo"><strong>{{ row.fulfillmentNo }}</strong> · {{ row.status }}：{{ row.message }}</li></ul>
    </details>
  </div>
</template>

<style scoped>
h2, h3, p, dl, dd { margin: 0; }
h2, h3 { color: var(--yy-text-heading); font-weight: 600; }
h2 { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; font-size: 16px; }
h2::before { width: 3px; height: 15px; border-radius: 2px; background: var(--yy-primary); content: ''; }
h3 { font-size: 15px; }
.push-panel { border: 1px solid var(--yy-border); border-radius: 6px; overflow: hidden; }
.panel-heading { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 12px 20px; background: #f7f9fc; border-bottom: 1px solid var(--yy-border-light); }
.clock-icon { display: inline-flex; justify-content: center; align-items: center; width: 30px; height: 30px; border-radius: 5px; color: #337ecc; background: #e7f1ff; }
.edit-button { margin-left: auto; }
.description { padding: 18px 22px 4px; color: var(--yy-text-secondary); line-height: 1.7; }
dl { padding: 3px 22px 9px; }
.setting-row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 13px 0; line-height: 22px; }
.setting-row + .setting-row { border-top: 1px solid var(--yy-border-light); }
dt { color: var(--yy-text-secondary); }
dd { min-width: 0; overflow-wrap: anywhere; }
.hours-input { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.hours-input .el-input-number { width: 100px; flex: 0 0 100px; }
.hours-input small { color: var(--yy-text-secondary); }
.switch-label { margin-left: 10px; }
.el-checkbox-group { display: flex; flex-wrap: wrap; gap: 0 20px; }
.el-checkbox { margin-right: 0; }
footer { display: flex; padding: 12px 22px; border-top: 1px solid var(--yy-border-light); }
.schedule-tip { margin: 14px 2px; color: var(--yy-text-secondary); line-height: 1.6; font-size: 13px; }
.error { margin: 0 22px 12px; color: var(--yy-danger); font-size: 13px; }
.run-result { padding: 14px 16px; border: 1px solid var(--yy-border-light); border-radius: 6px; line-height: 1.8; overflow-wrap: anywhere; }
summary { cursor: pointer; }
.run-result ul { max-height: 240px; overflow: auto; padding-left: 20px; }
</style>
