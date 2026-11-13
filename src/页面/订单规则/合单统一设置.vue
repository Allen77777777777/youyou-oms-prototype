<script setup lang="ts">
import { computed, ref } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { ElButton, ElInputNumber, ElMessage, ElMessageBox, ElRadioButton, ElRadioGroup, ElSwitch } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import MergeAction from './合单动作输入.vue'
import MergePreview from './合单试算抽屉.vue'
import MergeRuntimeStatus from '../订单处理/合单运行状态.vue'
import { 合单动作摘要, 合单时长显示, 校验合单动作, 校验合单时长输入, type 合单动作配置 } from './合单规则模型'
import { 共享自动合单设置 as settings, 保存自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 共享合单记录 } from '../订单处理/自动合单状态'
import { 接入下一张合单节点样例 } from '../订单处理/自动合单会话'
import { 标注状态 } from '@/原型标注/标注状态'
const clone = (value: 合单动作配置): 合单动作配置 => JSON.parse(JSON.stringify(value)) as 合单动作配置
const editing = ref(false)
const previewOpen = ref(false)
const enabled = ref(false)
const frequency = ref<30 | 60 | 'custom'>(30)
const minutes = ref<number | undefined>(30)
const policy = ref(clone(settings.value.policy))
const error = ref('')
const saving = ref(false)
const annotationMode = 标注状态.标注模式
const arrivalMessage = ref('')
function demonstrateArrival() {
  if (!annotationMode.value) return
  const result = 接入下一张合单节点样例()
  arrivalMessage.value = `${result.订单号}：${result.信息}`
}
const waitingCount = computed(() => 共享合单记录.value.filter(row => row.status === '等单中' || row.status === '待本轮处理').length)
const nextTime = computed(() => 共享下次合单时间.value ? new Date(共享下次合单时间.value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '开启后按执行周期安排')
const modeText = computed(() => settings.value.policy.mode === 'basic' ? '基础模式' : '高级等单')
const releaseText = computed(() => {
  const value = settings.value.policy
  if (value.mode === 'basic') return '本轮尝试后放单'
  const text = value.releaseMode === 'ready' ? `达到 ${value.readyOrderCount} 单提前放单` : '到点集中放单'
  return `${text} · 最多等待 ${合单时长显示(value.maxWaitMinutes)}`
})
function edit() {
  enabled.value = settings.value.enabled
  minutes.value = settings.value.intervalMinutes
  frequency.value = minutes.value === 30 || minutes.value === 60 ? minutes.value : 'custom'
  policy.value = clone(settings.value.policy)
  error.value = ''
  editing.value = true
}
async function save() {
  const intervalMinutes = frequency.value === 'custom' ? minutes.value ?? NaN : frequency.value
  error.value = !Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440 ? '执行间隔须为 1～1440 的整数分钟' : 校验合单时长输入(policy.value) || 校验合单动作(policy.value)
  if (error.value || saving.value) return
  saving.value = true
  try {
    if (settings.value.enabled && !enabled.value && waitingCount.value > 0) {
      try {
        await ElMessageBox.confirm(`当前有 ${waitingCount.value} 个订单正在等待合单。关闭后将结束这些等待，订单继续分仓和审核；放单不代表审核通过或发货。`, '关闭自动合单', { confirmButtonText: '关闭并结束等待', cancelButtonText: '继续开启', type: 'warning' })
      } catch { return }
    }
    error.value = 保存自动合单设置({ enabled: enabled.value, intervalMinutes, policy: policy.value })
    if (error.value) return
    editing.value = false
    ElMessage.success('合单统一设置已保存')
  } finally { saving.value = false }
}
const annotation: 原型标注 = {
  id: 'order-rules-merge-global-settings', 锚点: 'order-rules-merge-global-settings', 路由: '/oms/self-fulfillment/order-rules?type=merge',
  标题: '合单统一设置', 分类: '规则', 状态: '待评审', 版本: '0.6', 事实等级: '合理假设',
  说明: '用户确认将等单、放单与合并限制统一放在合单规则列表上方；单条规则仅筛选入池订单。默认关闭、30分钟及各项上限仍为本轮可调整方案。',
  prd引用: ['PRD/合单规则功能PRD.md', 'PRD/业务配置功能PRD.md#8-自动合单设置'],
  交互规则: [
    '编辑设置支持只读试算当前未保存草稿，使用当前全部已启用入池规则；不保存、不启动任务、不改变等待池。返回编辑保留草稿；输入变化后旧结果失效。单条入池规则编辑中另有独立草稿试算，使用已保存统一设置。',
    '试算按入池判断、候选分组、等单与放单计划说明，差异仅展示必要字段名称，不复制买家地址或联系方式；候选结果不表示共同分仓、库存或审核已经通过。运行概况区分任务开关与最近执行结果，并显示失败原因及处理入口。',
    '用户确认最长等待与履约预留改为小时，最长等待按0.5小时调整。两项默认2小时；预留可为0并沿用0.5小时步进是本轮一致性方案。界面换算为原分钟字段，已有等待快照和截止不变。',
    '高级参数集中左侧；右侧按入池计时、当前放单方式、到期兜底分段，正文提高对比度，最长等待到期规则单独突出。两种方式各有独立问号，可悬停、键盘聚焦或点击查看，查看说明不切换放单方式。',
    '最长等待是兜底上限，不受提前放单数量阈值限制；到期按合并限制组合放单，无法合并的独立放单。固定时点、最长等待与发货保护先到先放；资格已失效的订单仍先排除，所有放单继续分仓及审单。此轮澄清现有逻辑，不修改计时或运行模型。',
    '统一保存任务启停、周期、处理模式、分组要求、整组限制、等单与放单条件；基础与高级切换保留草稿，基础不启用隐藏的高级字段。',
    '用户确认基础模式按周期处理；高级模式在前置处理完成、到达合单节点后立即入池并检查放单条件，周期仅用于补查，放单截止独立计时。待审核状态本身不是前置已完成的证据。',
    '开启原型标注后可逐张接入完成前置的虚构订单，连续两张为同买家；演示走实际本地节点事件，规则试算仍为只读，不替代真实上游服务。',
    '单条规则按优先级筛选公共池，匹配不同规则不自动隔离合单；仍须满足固定收件分组及同一统一配置快照。',
    '设置变化只作用于之后新入池订单；旧等待保留配置快照与截止。仅策略变化不重置扫描周期，保存相同值不更改版本。',
    '关闭时明确结束当前等待。所有放单仍须继续分仓和审单，不跳过系统默认发货条件。',
    '仅本地虚构会话；刷新重置。真实后台任务、外部接口、持久化、权限和审计尚未接入。',
  ],
}
</script>

<template>
  <section v-prototype="annotation" class="merge-global-settings" aria-labelledby="merge-global-title">
    <header class="global-heading"><div><h3 id="merge-global-title">合单统一设置</h3><span>下方规则筛选入池订单，统一按此设置合单</span></div><ElButton v-if="!editing" :icon="EditPen" @click="edit">编辑设置</ElButton><div v-else class="heading-actions"><ElButton @click="editing = false" :disabled="saving">取消</ElButton><ElButton @click="previewOpen = true" :disabled="saving">试算当前草稿</ElButton><ElButton type="primary" :loading="saving" @click="save">保存设置</ElButton></div></header>
    <div class="runtime-summary"><MergeRuntimeStatus annotation-route="/oms/self-fulfillment/order-rules?type=merge" /></div>
    <template v-if="!editing">
      <div class="settings-summary"><div><span>处理模式</span><strong>{{ modeText }}</strong></div><div><span>{{ settings.policy.mode === 'advanced' ? '补查周期' : '执行周期' }}</span><strong>每 {{ settings.intervalMinutes }} 分钟</strong></div><div><span>等单与放单</span><strong>{{ releaseText }}</strong></div><div><span>合并限制</span><strong>每组最多 {{ settings.policy.maxOrders }} 单<span v-if="settings.policy.maxQuantity !== undefined"> · {{ settings.policy.maxQuantity }} 件</span><span v-if="settings.policy.maxWeightKg !== undefined"> · {{ settings.policy.maxWeightKg }} kg</span></strong></div></div>
      <p class="summary-detail">{{ 合单动作摘要(settings.policy) }}</p>
      <div v-if="annotationMode" class="arrival-demo"><strong>原型评审 · 新单到达</strong><span>每次加入一张已完成前置的虚构订单，连续两张为同买家；按当前已保存设置运行。</span><ElButton size="small" @click="demonstrateArrival">接入下一张订单</ElButton><span v-if="arrivalMessage" role="status">{{ arrivalMessage }}</span></div>
      <div class="settings-foot"><span>设置变更仅对新入池订单生效，已有等待按原设置继续。</span><span v-if="settings.enabled">{{ settings.policy.mode === 'advanced' ? '下次补查' : '下次执行' }} {{ nextTime }}（北京时间）</span><span v-else>开启任务后定时处理</span></div>
    </template>
    <div v-else class="settings-editor">
      <div class="task-settings"><label class="task-switch">自动合单任务<ElSwitch v-model="enabled" aria-label="开启自动合单" /><span>{{ enabled ? '开启' : '关闭' }}</span></label><label class="frequency-setting">{{ policy.mode === 'advanced' ? '补查周期' : '执行周期' }}<ElRadioGroup v-model="frequency" aria-label="自动合单执行频率"><ElRadioButton :value="30">每 30 分钟</ElRadioButton><ElRadioButton :value="60">每 1 小时</ElRadioButton><ElRadioButton value="custom">自定义</ElRadioButton></ElRadioGroup></label><div v-if="frequency === 'custom'" class="custom-frequency"><span>每</span><ElInputNumber v-model="minutes" :min="1" :max="1440" :step="1" controls-position="right" aria-label="自动合单频率（分钟）" /><span>分钟（1～1440）</span></div></div>
      <p v-if="policy.mode === 'advanced'" class="realtime-help">新订单到达合单节点后立即处理，补查周期不延迟入池或到期放单。</p><MergeAction :config="policy" compact />
      <p class="change-notice">设置变更仅对新入池订单生效；已有等待保留原设置与截止时间，不重新计时。</p>
      <p v-if="error" role="alert" class="settings-error">{{ error }}</p>
    </div>
    <MergePreview v-if="editing" v-model="previewOpen" :draft-policy="policy" :draft-interval-minutes="frequency === 'custom' ? minutes : frequency" :draft-task-enabled="enabled" />
  </section>
</template>

<style scoped>
.runtime-summary{padding:10px 16px;border-bottom:1px solid var(--yy-border-light)}
.merge-global-settings{margin:0 0 16px;border:1px solid var(--yy-border);border-radius:6px;background:#fff;overflow:hidden}.global-heading{display:flex;gap:12px;align-items:center;min-height:58px;padding:12px 16px;background:#f7f9fc;border-bottom:1px solid var(--yy-border-light)}.global-heading>div:first-child{display:flex;gap:14px;align-items:center;flex:1;min-width:0}.global-heading h3{margin:0;color:var(--yy-text-heading);font-size:14px;flex-shrink:0}.global-heading>div:first-child>span{font-size:12px;color:var(--yy-text-secondary)}.heading-actions{display:flex;flex-shrink:0}.settings-summary{display:grid;grid-template-columns:130px 150px minmax(240px,1.5fr) minmax(180px,1fr);gap:20px;padding:16px}.settings-summary>div{display:flex;flex-direction:column;gap:9px;min-width:0}.settings-summary>div>span{font-size:12px;color:var(--yy-text-secondary)}.settings-summary strong{font-size:13px;font-weight:500;color:var(--yy-text-heading);line-height:1.5;overflow-wrap:anywhere}.summary-detail{margin:0 16px 12px;font-size:12px;color:var(--yy-text-secondary);line-height:1.6}.settings-foot{display:flex;justify-content:space-between;gap:12px;padding:10px 16px;border-top:1px solid var(--yy-border-light);font-size:12px;color:var(--yy-text-secondary);line-height:1.6}.settings-editor{padding:16px}.task-settings{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--yy-border-light);margin-bottom:16px;font-size:13px}.task-switch,.frequency-setting,.custom-frequency{display:flex;align-items:center;gap:10px}.custom-frequency .el-input-number{width:110px}.change-notice{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--yy-border-light);font-size:12px;line-height:1.6;color:var(--yy-text-secondary)}.arrival-demo{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:0 16px 12px;padding:10px 12px;border:1px dashed #d9a34a;background:#fffaf0;font-size:12px;line-height:1.6}.arrival-demo strong{color:var(--yy-text-heading)}.arrival-demo [role="status"]{flex-basis:100%;overflow-wrap:anywhere}.realtime-help{margin:0 0 12px;font-size:12px;color:var(--yy-text-secondary);line-height:1.7}.settings-error{margin:10px 0 0;color:var(--yy-danger);font-size:13px}@media(max-width:1300px){.global-heading>div:first-child{align-items:flex-start;flex-direction:column;gap:4px}.settings-summary{grid-template-columns:100px 120px minmax(220px,1.5fr) minmax(160px,1fr);gap:14px}.settings-foot{flex-wrap:wrap}}
</style>
