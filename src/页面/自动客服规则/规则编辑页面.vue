<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Delete } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElInput, ElInputNumber, ElSelect, ElOption, ElCheckbox, ElSwitch, ElRadioGroup, ElRadio, ElTag, ElEmpty, ElDialog, ElMessage, ElMessageBox } from 'element-plus'
import { 关闭业务页签 } from '@/布局/页签操作'
import { serviceRuleAnnotation as annotation } from './标注'
import { editorSessions, createEditor, discardEditor, editorError, saveEditor, serviceRules, activeRuleType, ruleListPath, maximumRulePriority, ruleTypes, conditionFields, conditionOptions, createRuleCondition, splitOptions, typeTriggers, triggerLabels, delayUnits, ownerOptions, mailTagDefinitions, priorityOptions, availableTemplates, templatePreview, templateError, parseSkuValues, type EditorMode, type ConditionField } from './规则模型'
import RangeInput from '../订单规则/范围条件输入.vue'
import AutoReplySchedule from './自动回复时间配置.vue'
import { shopOptions, autoReplyShopIds, normalizeAutoReplyShops, ruleTriggerLabel } from './规则模型'
import './规则样式.css'

const route = useRoute(), router = useRouter()
const mode = computed(() => route.meta.serviceRuleEditorMode as EditorMode)
const title = computed(() => mode.value === 'edit' ? '编辑规则' : mode.value === 'copy' ? '复制规则' : '新增规则')
watch(() => route.fullPath, () => {
  if (mode.value !== 'edit') return
  const id = String(route.params.sessionId ?? '')
  if (!editorSessions.has(`edit:${id}`)) {
    const source = serviceRules.value.find(item => item.id === id)
    if (source) createEditor(source.type, 'edit', source)
  }
}, { immediate: true })
const session = computed(() => editorSessions.get(`${mode.value}:${String(route.params.sessionId ?? '')}`))
const draft = computed(() => session.value?.draft)
const isAutoReply = computed(() => draft.value?.type === 'autoReply')
watch(() => draft.value?.autoReply, config => { if (config) normalizeAutoReplyShops(config) }, { immediate: true })
function shopOccupied(shopId: string) { return serviceRules.value.some(item => item.type === 'autoReply' && item.id !== draft.value?.id && autoReplyShopIds(item.autoReply).includes(shopId)) }
const selectedType = computed(() => ruleTypes.find(item => item.value === draft.value?.type))
const templates = computed(() => draft.value ? availableTemplates(draft.value.type) : [])
const preview = computed(() => draft.value?.type !== 'assignment' && draft.value ? templatePreview(draft.value) : undefined)
const invalidTemplate = computed(() => draft.value?.templateId ? templateError(draft.value) : undefined)
const removedMessageTrigger = computed(() => draft.value?.type === 'message' && !typeTriggers.message.includes(draft.value.trigger))
const dedupOpen = ref(false), dedupDaysText = ref('1'), dedupError = ref('')
let dedupSessionKey = '', dedupOriginalDays = 1
watch(() => session.value?.key, () => { dedupOpen.value = false; dedupError.value = '' })
function openDedupSettings() {
  const config = draft.value?.messageDedup
  if (draft.value?.type !== 'message' || !config?.enabled || !session.value) return
  dedupSessionKey = session.value.key; dedupOriginalDays = config.days
  dedupDaysText.value = String(config.days); dedupError.value = ''; dedupOpen.value = true
}
function confirmDedupSettings() {
  const config = draft.value?.messageDedup
  if (draft.value?.type !== 'message' || !config?.enabled || session.value?.key !== dedupSessionKey || config.days !== dedupOriginalDays) { dedupError.value = '规则配置已变化，请关闭后重新设置'; return }
  const text = dedupDaysText.value.trim(), days = Number(text)
  if (!/^\d+$/.test(text) || !Number.isInteger(days) || days < 1 || days > 90) { dedupError.value = '请输入1～90的整数天数'; return }
  config.days = days; dedupOpen.value = false; dedupError.value = ''
}
function toggleCondition(field: ConditionField, selected: boolean) {
  if (!draft.value) return
  const index = draft.value.conditions.findIndex(item => item.field === field)
  if (selected && index < 0) { draft.value.conditions.push(createRuleCondition(field)); if (session.value && (field === 'systemSku' || field === 'platformSku')) session.value.skuInputs[field] = '' }
  else if (!selected && index >= 0) { draft.value.conditions.splice(index, 1); if (session.value) delete session.value.skuInputs[field] }
}
function updateSku(field: ConditionField, text: string) { if (!session.value) return; session.value.skuInputs[field] = text; const condition = session.value.draft.conditions.find(item => item.field === field); if (condition) condition.values = parseSkuValues(text) }
async function back() { if (draft.value) activeRuleType.value = draft.value.type; await router.push(ruleListPath) }
async function close() { const path = route.path; if (session.value) { activeRuleType.value = session.value.draft.type; discardEditor(session.value.key) }; await router.push(ruleListPath); 关闭业务页签(path, ruleListPath) }
async function save() {
  const current = session.value, path = route.path
  if (!current) return
  const error = editorError(current)
  if (error) return void ElMessage.warning(error)
  const fingerprint = JSON.stringify(current.draft)
  const original = serviceRules.value.find(item => item.id === current.sourceId)
  if (current.draft.enabled || (current.mode === 'edit' && original?.enabled !== current.draft.enabled)) {
    try { await ElMessageBox.confirm(`保存后“${current.draft.name.trim()}”将${current.draft.enabled ? '启用' : '停用'}。`, current.draft.enabled ? '保存并启用规则' : '保存并停用规则', { confirmButtonText: '确认保存', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return }
  }
  if (fingerprint !== JSON.stringify(current.draft)) return void ElMessage.warning('确认期间规则内容已变化，请重新保存')
  const result = saveEditor(current)
  if (result) return void ElMessage.warning(result)
  ElMessage.success('规则已保存')
  if (route.path === path) await router.push(ruleListPath)
  关闭业务页签(path, ruleListPath)
}
function manageTemplates() { void router.push('/oms/ebay-service/message-templates') }
</script>

<template>
  <main class="service-rule-editor">
    <header class="service-editor-heading"><div><ElButton link :icon="ArrowLeft" @click="back">返回规则列表</ElButton><i /><h1>{{ title }}</h1><ElTag v-if="selectedType" size="small" type="info">{{ selectedType.label }}</ElTag></div></header>
    <template v-if="draft">
      <div class="service-editor-scroll">
        <aside class="service-condition-sidebar" v-prototype="annotation('edit', '规则基本信息与编辑草稿')">
          <h2>基本信息</h2>
          <label class="service-field-label required" for="service-rule-name">规则名称</label>
          <ElInput id="service-rule-name" v-model="draft.name" placeholder="请输入规则名称" maxlength="40" show-word-limit aria-label="规则名称" />
          <template v-if="!isAutoReply">
            <label class="service-field-label required" for="service-rule-priority">优先级</label>
            <ElInputNumber id="service-rule-priority" v-model="draft.order" :min="1" :max="maximumRulePriority" :precision="0" controls-position="right" aria-label="规则优先级" class="service-rule-priority" />
            <p class="service-priority-help">数字越小，优先级越高</p>
          </template>
          <label class="service-field-label">规则状态</label>
          <div class="service-status-field"><ElSwitch v-model="draft.enabled" aria-label="规则启用状态" /><span>{{ draft.enabled ? '启用' : '停用' }}</span></div>
          <div v-if="isAutoReply && draft.autoReply" class="service-auto-reply-shop" v-prototype="annotation('auto-reply-shop', '每店铺一条自动回复规则')">
            <label class="service-field-label required">店铺账号</label>
            <ElSelect v-model="draft.autoReply.shopIds" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="2" placeholder="请选择店铺账号，可多选" aria-label="自动回复店铺账号"><ElOption v-for="shop in shopOptions" :key="shop.value" :value="shop.value" :label="`${shop.label}${shopOccupied(shop.value) ? '（已配置）' : ''}`" :disabled="shopOccupied(shop.value)" /></ElSelect>
            <p class="service-sidebar-help">可多选店铺；每个店铺账号最多关联一条规则，停用后仍保留关联。</p>
          </div>
          <template v-else>
          <div class="service-select-heading"><h2>可选条件</h2><span>{{ conditionFields.length }} 项</span></div>
          <div v-prototype="annotation('conditions', '可选判断条件')" class="service-condition-checks">
            <ElCheckbox v-for="field in conditionFields" :key="field.value" :model-value="draft.conditions.some(item => item.field === field.value)" @change="toggleCondition(field.value, $event === true)">{{ field.label }}</ElCheckbox>
          </div>
          <p class="service-sidebar-help">勾选条件后，在右侧配置匹配范围。</p>
          </template>
        </aside>
        <div class="service-editor-body">
          <div class="service-flow"><span class="active"><b>1</b>触发时机</span><i>→</i><span><b>2</b>{{ isAutoReply ? '休息时段' : '判断条件' }}</span><i>→</i><span><b>3</b>执行动作</span></div>
          <section class="service-editor-section" v-prototype="annotation('trigger', '触发事件与执行时间')">
            <div class="service-section-title"><h2>触发时机</h2><span>何时开始匹配这条规则</span></div>
            <div class="service-form-row"><label class="required">触发事件</label><ElSelect v-model="draft.trigger" aria-label="触发事件" :disabled="draft.type === 'assignment' || isAutoReply" class="service-event-select"><ElOption v-if="removedMessageTrigger" :value="draft.trigger" :label="`${triggerLabels[draft.trigger] ?? draft.trigger}（已移除）`" disabled /><ElOption v-for="event in typeTriggers[draft.type]" :key="event" :label="isAutoReply ? ruleTriggerLabel(draft) : triggerLabels[event]" :value="event" /></ElSelect></div>
            <p v-if="removedMessageTrigger" class="service-validation-error">原自动发信触发事件已移除，请重新选择；保存或启用前须重新确认触发场景。</p>
            <p v-if="isAutoReply" class="service-schedule-help">在设定的休息时段收到买家来信时，按模板回复当前会话，适用于所有买家。</p>
            <div v-else class="service-form-row"><label>执行时间</label><div class="service-timing"><ElRadioGroup v-model="draft.timing" aria-label="执行时间"><ElRadio value="immediate">立即执行</ElRadio><ElRadio v-if="draft.type !== 'assignment'" value="delayed">延迟执行</ElRadio></ElRadioGroup><div v-if="draft.type !== 'assignment' && draft.timing === 'delayed'" class="service-delay"><ElInputNumber v-model="draft.delay" :min="1" :max="999" :precision="0" controls-position="right" aria-label="延迟时长" /><ElSelect v-model="draft.delayUnit" aria-label="延迟单位"><ElOption v-for="unit in delayUnits" :key="unit.value" :label="unit.label" :value="unit.value" /></ElSelect><span>后执行</span></div></div></div>
          </section>
          <section v-if="isAutoReply && draft.autoReply" class="service-editor-section" v-prototype="annotation('auto-reply-schedule', '每周休息与特定时间段')"><div class="service-section-title"><h2>休息时段</h2><span>收到买家来信时</span></div><AutoReplySchedule :config="draft.autoReply" /></section>
          <section v-else class="service-editor-section" v-prototype="annotation('conditions', '判断条件与匹配范围')">
            <div class="service-section-title"><h2>判断条件</h2><span>以下条件全部满足时执行</span></div>
            <div v-if="!draft.conditions.length" class="service-empty-conditions">请在左侧选择至少一项条件</div>
            <div v-for="(condition, index) in draft.conditions" :key="condition.field" class="service-condition-row">
              <div class="service-condition-label"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ conditionFields.find(item => item.value === condition.field)?.label }}</strong></div>
              <div class="service-condition-controls" :class="{ 'service-range-controls': condition.field === 'orderAmount' }">
                <template v-if="condition.field === 'orderAmount'"><RangeInput v-if="condition.amountRange" :range="condition.amountRange" name="订单总金额" label="订单总金额" money /><span v-else class="service-validation-error">请移除此条件后重新配置金额范围</span></template>
                <template v-else>
                  <span v-if="condition.field === 'isSplit'" class="service-fixed-operator">等于</span>
                  <ElSelect v-else v-model="condition.operator" :aria-label="`${conditionFields.find(item => item.value === condition.field)?.label}运算符`"><ElOption value="eq" label="等于" /><ElOption value="neq" label="不等于" /></ElSelect>
                  <ElSelect v-if="condition.field === 'isSplit'" :model-value="condition.values[0]" clearable placeholder="请选择是或否" aria-label="是否有拆单发货条件值" @update:model-value="condition.values = $event ? [String($event)] : []"><ElOption v-for="option in splitOptions" :key="option.value" :value="option.value" :label="option.label" /></ElSelect>
                  <ElSelect v-else-if="conditionOptions(condition.field)" v-model="condition.values" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" :placeholder="`请选择${conditionFields.find(item => item.value === condition.field)?.label}`" :aria-label="`${conditionFields.find(item => item.value === condition.field)?.label}条件值`"><ElOption v-for="option in conditionOptions(condition.field)" :key="option.value" :value="option.value" :label="option.label" /></ElSelect>
                  <ElInput v-else :model-value="session?.skuInputs[condition.field] ?? condition.values.join('\n')" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="每行一个 SKU，也可用逗号或分号分隔" :aria-label="`${condition.field === 'systemSku' ? '系统' : '平台'}SKU条件值`" @update:model-value="updateSku(condition.field, $event)" />
                </template>
                <ElButton text :aria-label="`移除${conditionFields.find(item => item.value === condition.field)?.label}条件`" @click="toggleCondition(condition.field, false)"><ElIcon><Delete /></ElIcon></ElButton>
              </div>
              <p v-if="condition.field === 'systemSku' || condition.field === 'platformSku'" class="service-condition-hint">已填写 {{ condition.values.length }} 项，精确匹配，区分大小写。</p>
            </div>
          </section>
          <section class="service-editor-section" v-prototype="annotation(draft.type === 'assignment' ? 'assignment' : isAutoReply ? 'auto-reply-action' : 'template', draft.type === 'assignment' ? '客服分配组合动作' : isAutoReply ? '休息时段自动回复模板' : '自动规则模板引用')">
            <div class="service-section-title"><h2>执行动作</h2><span>{{ draft.type === 'assignment' ? '可组合选择，未勾选的内容保持不变' : draft.type === 'feedback' ? '给符合条件的交易提交好评' : isAutoReply ? '使用模板回复买家来信' : '向当前买家发送站内信' }}</span></div>
            <div v-if="draft.type === 'assignment'" class="service-assignment-actions">
              <div class="service-action-row"><ElCheckbox v-model="draft.assignment.assign">分配客服</ElCheckbox><ElSelect v-model="draft.assignment.assignee" :disabled="!draft.assignment.assign" placeholder="请选择客服人员" filterable aria-label="分配客服人员"><ElOption v-for="owner in ownerOptions" :key="owner.value" :value="owner.value" :label="owner.label" /></ElSelect></div>
              <div class="service-action-row"><ElCheckbox v-model="draft.assignment.status">标注处理状态</ElCheckbox><ElSelect v-model="draft.assignment.workStatus" :disabled="!draft.assignment.status" aria-label="标注处理状态"><ElOption value="pending" label="待处理" /><ElOption value="processed" label="已处理" /></ElSelect></div>
              <div class="service-action-row"><ElCheckbox v-model="draft.assignment.tag">添加标签</ElCheckbox><ElSelect v-model="draft.assignment.tagIds" :disabled="!draft.assignment.tag" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="2" placeholder="请选择标签，可多选" aria-label="添加业务标签"><ElOption v-for="tag in mailTagDefinitions" :key="tag.id" :value="tag.id" :label="tag.label" /></ElSelect></div>
              <div class="service-action-row"><ElCheckbox v-model="draft.assignment.prioritize">设置优先级</ElCheckbox><ElSelect v-model="draft.assignment.priority" :disabled="!draft.assignment.prioritize" aria-label="设置会话优先级"><ElOption v-for="priority in priorityOptions" :key="priority.value" :value="priority.value" :label="priority.label" /></ElSelect></div>
            </div>
            <template v-else>
              <div class="service-template-select"><label class="required">{{ draft.type === 'feedback' ? '好评模板' : '站内信模板' }}</label><ElSelect v-model="draft.templateId" filterable clearable :placeholder="`请选择${draft.type === 'feedback' ? '好评' : '站内信'}模板`" aria-label="选择执行模板"><ElOption v-for="item in templates" :key="item.value" :value="item.value" :label="item.label" /></ElSelect><ElButton link type="primary" @click="manageTemplates">管理模板</ElButton></div>
              <p v-if="invalidTemplate" class="service-validation-error">{{ invalidTemplate }}</p>
              <div v-if="preview" class="service-template-preview"><header><strong>模板内容</strong><ElTag size="small" type="info">{{ draft.type === 'feedback' ? '好评' : '站内信' }}</ElTag></header><p>{{ preview.body }}</p><div v-if="preview.attachments.length" class="service-template-attachments"><span>附件</span><ElTag v-for="name in preview.attachments" :key="name" size="small" type="info">{{ name }}</ElTag></div><small v-if="preview.variables.length">执行时填入：{{ preview.variables.join('、') }}</small></div>
              <div v-else class="service-empty-conditions">选择模板后查看内容</div>
              <div v-if="draft.type === 'message' && draft.messageDedup" class="service-message-dedup" v-prototype="annotation('dedup', '同一个买家不重复发信')"><ElCheckbox v-model="draft.messageDedup.enabled" aria-label="同一个买家不重复发信">同一个买家不重复发信</ElCheckbox><span :class="{ disabled: !draft.messageDedup.enabled }">{{ draft.messageDedup.days }}天</span><ElButton link type="primary" :disabled="!draft.messageDedup.enabled" aria-label="设置同买家不重复发信天数" @click="openDedupSettings">设置</ElButton></div>
            </template>
          </section>
          <section class="service-editor-section service-note-section"><div class="service-section-title"><h2>规则说明</h2><span>选填，仅供内部查看</span></div><ElInput v-model="draft.note" type="textarea" :rows="3" maxlength="300" show-word-limit placeholder="填写规则用途或使用说明" aria-label="规则说明" /></section>
        </div>
      </div>
      <footer class="service-editor-footer"><ElButton type="primary" @click="save">保存</ElButton><ElButton @click="close">取消</ElButton></footer>
    </template>
    <ElEmpty v-else description="未找到规则或草稿已失效"><ElButton type="primary" @click="close">返回规则列表</ElButton></ElEmpty>
    <ElDialog v-model="dedupOpen" title="同一个买家不重复发信" width="min(580px, calc(100vw - 48px))" append-to-body class="service-dedup-dialog" :close-on-click-modal="false">
      <section v-prototype="annotation('dedup', '同买家发信间隔设置')"><p>针对同一自动发信规则、同一店铺的同一买家，按订单创建时间统计；短时间多次下单只发一封。</p><div class="service-dedup-days"><ElInput v-model="dedupDaysText" inputmode="numeric" aria-label="同买家不重复发信天数" /><span>天内不重复发信</span></div><small>请输入1～90的整数天数</small><p v-if="dedupError" class="service-validation-error" role="alert">{{ dedupError }}</p></section>
      <template #footer><ElButton @click="dedupOpen = false">取消</ElButton><ElButton type="primary" @click="confirmDedupSettings">确定</ElButton></template>
    </ElDialog>
  </main>
</template>
