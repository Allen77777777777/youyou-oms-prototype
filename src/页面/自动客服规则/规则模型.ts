import { computed, reactive, ref } from 'vue'
import { reviewShops, reviewOwners } from '../eBay评价/数据'
import { 中台平台站点资料, 站点选择值 } from '../订单规则/规则基础选项'
import { mailTagDefinitions } from '../eBay站内信/设置模型'
import { priorityOptions } from '../eBay站内信/邮箱模型'
import { templateSession, renderReplyTemplate, validateTemplate } from '../消息模板管理/模型'
import { feedbackTemplateSession, validateFeedbackTemplate } from '../消息模板管理/评价模板模型'
import { 注册业务页签清理, 注销业务页签清理 } from '@/布局/页签操作'
import type { 履约模式 } from '../全渠道订单/类型'
import { 校验条件配置, 格式化条件值, type 规则范围 } from '../订单规则/规则条件定义'
import { 是否支持比价币种 } from '../订单规则/比价币种'
import { defaultAutoReplyConfig, autoReplyScheduleSummary, autoReplyShopIds, normalizeAutoReplyShops, validateAutoReplyConfig, type AutoReplyConfig } from './自动回复配置'
export * from './自动回复配置'

export type ServiceRuleType = 'assignment' | 'feedback' | 'message' | 'autoReply'
export type ConditionField = 'shop' | 'site' | 'systemSku' | 'platformSku' | 'fulfillmentMode' | 'isSplit' | 'orderAmount'
export type TriggerEvent = 'incoming' | 'paid' | 'shipped' | 'positive' | 'delivered' | 'dispute' | 'unpaidOrder' | 'paidBeforeShipment' | 'orderOutbound'
export type EditorMode = 'new' | 'edit' | 'copy'
export interface RuleCondition { field: ConditionField; operator: 'eq' | 'neq' | 'range'; values: string[]; amountRange?: 规则范围 }
export interface AssignmentAction { assign: boolean; assignee: string; status: boolean; workStatus: 'pending' | 'processed'; tag: boolean; tagIds: string[]; prioritize: boolean; priority: 'urgent' | 'high' | 'normal' | 'low' }
export interface MessageDedup { enabled: boolean; days: number }
export interface ServiceRule {
  id: string; type: ServiceRuleType; name: string; enabled: boolean; order: number; version: number; updatedAt: string; note: string
  trigger: TriggerEvent; timing: 'immediate' | 'delayed'; delay: number; delayUnit: 'minute' | 'hour' | 'day'
  conditions: RuleCondition[]; assignment: AssignmentAction; templateId: string; messageDedup?: MessageDedup; autoReply?: AutoReplyConfig
}
export interface RuleLog { id: string; ruleId: string; at: string; operator: string; action: string; content: string }
export interface EditorSession { key: string; id: string; mode: EditorMode; draft: ServiceRule; skuInputs: Partial<Record<ConditionField, string>>; sourceId?: string; sourceVersion?: number }
export const ruleListPath = '/oms/ebay-service/automation-rules'
export const maximumRulePriority = 999999
export const ruleTypes: Array<{ value: ServiceRuleType; label: string; description: string }> = [
  { value: 'assignment', label: '站内信规则', description: '按条件分配客服，并设置处理状态、标签和优先级' },
  { value: 'feedback', label: '自动好评规则', description: '在指定时机为符合条件的交易提交买家好评' },
  { value: 'message', label: '自动发信规则', description: '在订单或沟通的关键节点，按模板向买家发送站内信' },
  { value: 'autoReply', label: '自动回复规则', description: '休息时段收到买家来信时，按模板回复当前会话' },
]
export const conditionFields: Array<{ value: ConditionField; label: string }> = [
  { value: 'shop', label: '店铺' }, { value: 'site', label: '站点' }, { value: 'systemSku', label: '系统 SKU' }, { value: 'platformSku', label: '平台 SKU' },
  { value: 'fulfillmentMode', label: '履约模式' },
  { value: 'isSplit', label: '是否有拆单发货' }, { value: 'orderAmount', label: '订单总金额' },
]
export const triggerLabels: Record<TriggerEvent, string> = { incoming: '新买家来信同步完成', paid: '订单付款成功', shipped: '仓库发货完成', positive: '收到买家好评', delivered: '订单签收', dispute: '产生纠纷', unpaidOrder: '买家下单之后未付款', paidBeforeShipment: '订单收到买家付款', orderOutbound: '订单出库' }
export function ruleTriggerLabel(rule: Pick<ServiceRule, 'type' | 'trigger'>): string { return rule.type === 'autoReply' ? '收到买家来信' : triggerLabels[rule.trigger] }
export const typeTriggers: Record<ServiceRuleType, TriggerEvent[]> = { assignment: ['incoming'], feedback: ['paid', 'shipped', 'positive'], message: ['unpaidOrder', 'paidBeforeShipment', 'orderOutbound'], autoReply: ['incoming'] }
export const delayUnits = [{ value: 'minute', label: '分钟' }, { value: 'hour', label: '小时' }, { value: 'day', label: '天' }]
export const shopOptions = reviewShops
export const ownerOptions = reviewOwners.map(value => ({ value, label: value }))
export const siteOptions = computed(() => 中台平台站点资料.value.filter(item => item.platformCode === 'eBay').map(item => ({ value: 站点选择值(item), label: item.siteName })))
export const fulfillmentModeOptions: Array<{ value: 履约模式; label: string }> = [{ value: '自配送', label: '自配送' }, { value: '平台履约', label: '平台履约' }]
export const splitOptions = [{ value: 'true', label: '是' }, { value: 'false', label: '否' }]
export function conditionOptions(field: ConditionField) { return field === 'shop' ? shopOptions : field === 'site' ? siteOptions.value : field === 'fulfillmentMode' ? fulfillmentModeOptions : field === 'isSplit' ? splitOptions : undefined }
export function createRuleCondition(field: ConditionField): RuleCondition {
  return field === 'orderAmount' ? { field, operator: 'range', values: [], amountRange: { value: '', upperValue: '', lowerEnabled: false, upperEnabled: false, lowerInclusive: true, upperInclusive: true, currency: '' } } : { field, operator: 'eq', values: [] }
}
export { mailTagDefinitions, priorityOptions }
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
export function timestamp() { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) }
export function typeLabel(type: ServiceRuleType) { return ruleTypes.find(item => item.value === type)?.label ?? type }
export function parseSkuValues(input: string) { return [...new Set(input.split(/[,，;；\r\n]+/u).map(item => item.trim()).filter(Boolean))] }
export function availableTemplates(type: ServiceRuleType) {
  if (type === 'feedback') return feedbackTemplateSession.templates.filter(item => item.type === 'buyer-positive' && item.enabled).map(item => ({ value: item.id, label: item.name }))
  if (type === 'message' || type === 'autoReply') return templateSession.templates.filter(item => item.kind === 'message' && item.enabled).map(item => ({ value: item.id, label: item.title }))
  return []
}
export function templatePreview(rule: Pick<ServiceRule, 'type' | 'templateId'>) {
  if (rule.type === 'feedback') {
    const source = feedbackTemplateSession.templates.find(item => item.id === rule.templateId && item.type === 'buyer-positive')
    return source ? { title: source.name, body: source.text, attachments: [] as string[], variables: [] as string[], enabled: source.enabled } : undefined
  }
  const source = templateSession.templates.find(item => item.id === rule.templateId && item.kind === 'message')
  if (!source) return undefined
  const preview = renderReplyTemplate(source, {})
  return { title: source.title, body: preview.body, attachments: preview.attachments.map(item => item.name), variables: preview.missing.map(item => item.label), enabled: source.enabled }
}
export function templateError(rule: Pick<ServiceRule, 'type' | 'templateId'>): string | undefined {
  if (rule.type === 'assignment') return undefined
  if (!rule.templateId) return `请选择${rule.type === 'feedback' ? '好评' : '站内信'}模板`
  if (rule.type === 'feedback') {
    const source = feedbackTemplateSession.templates.find(item => item.id === rule.templateId && item.type === 'buyer-positive' && item.enabled)
    if (!source) return '好评模板已停用、删除或类型不符，请重新选择'
    return validateFeedbackTemplate(source, source.id)
  }
  const source = templateSession.templates.find(item => item.id === rule.templateId && item.kind === 'message' && item.enabled)
  if (!source) return '站内信模板已停用、删除或类型不符，请重新选择'
  return validateTemplate(source, source.id)
}
export function defaultRule(type: ServiceRuleType): ServiceRule {
  return { id: '', type, name: '', enabled: false, order: type === 'autoReply' ? 0 : 10, version: 1, updatedAt: '', note: '', trigger: typeTriggers[type][0]!, timing: 'immediate', delay: 1, delayUnit: 'hour', conditions: type === 'autoReply' ? [] : [{ field: 'shop', operator: 'eq', values: [] }], assignment: { assign: false, assignee: '', status: false, workStatus: 'pending', tag: false, tagIds: [], prioritize: false, priority: 'normal' }, templateId: '', ...(type === 'message' ? { messageDedup: { enabled: false, days: 1 } } : {}), ...(type === 'autoReply' ? { autoReply: defaultAutoReplyConfig() } : {}) }
}
function initialRules(): ServiceRule[] {
  const make = (type: ServiceRuleType, name: string, index: number, patch: Partial<ServiceRule>): ServiceRule => ({ ...defaultRule(type), id: `AUTO-DEMO-${index}`, name, order: index * 10, updatedAt: '2026-10-29 09:30:00', conditions: [{ field: 'shop', operator: 'eq', values: ['shop-us'] }], ...patch })
  return [
    make('assignment', '美国店铺来信分配', 1, { assignment: { assign: true, assignee: '客服01', status: true, workStatus: 'pending', tag: false, tagIds: [], prioritize: false, priority: 'normal' } }),
    make('assignment', '家居商品咨询优先跟进', 2, { conditions: [{ field: 'systemSku', operator: 'eq', values: ['DEMO-HOME-001', 'DEMO-HOME-002'] }], assignment: { assign: true, assignee: '客服02', status: true, workStatus: 'pending', tag: true, tagIds: ['fitment'], prioritize: true, priority: 'high' } }),
    make('assignment', '英国店铺来信分配', 3, { conditions: [{ field: 'shop', operator: 'eq', values: ['shop-uk'] }], assignment: { assign: true, assignee: '客服03', status: false, workStatus: 'pending', tag: false, tagIds: [], prioritize: false, priority: 'normal' } }),
    make('feedback', '付款后感谢买家', 4, { trigger: 'paid', templateId: 'buyer-thanks' }),
    make('feedback', '发货后自动好评', 5, { trigger: 'shipped', timing: 'delayed', delay: 1, delayUnit: 'day', templateId: 'buyer-smooth' }),
    make('feedback', '收到好评后回赠好评', 6, { trigger: 'positive', templateId: 'buyer-return', conditions: [{ field: 'shop', operator: 'eq', values: ['shop-us', 'shop-uk'] }] }),
    make('message', '下单未付款提醒', 7, { trigger: 'unpaidOrder', templateId: 'template-order-followup' }),
    make('message', '付款后发货准备通知', 8, { trigger: 'paidBeforeShipment', templateId: 'template-order-followup' }),
    make('message', '出库跟踪号通知', 9, { trigger: 'orderOutbound', templateId: 'template-order-followup' }),
    make('autoReply', '美国店铺休息时段回复', 10, { order: 0, conditions: [], templateId: 'template-rest-auto-reply', autoReply: { ...defaultAutoReplyConfig(), shopIds: ['shop-us'] } }),
  ]
}
export const serviceRules = ref<ServiceRule[]>(initialRules())
export const serviceRuleLogs = ref<RuleLog[]>([])
export const activeRuleType = ref<ServiceRuleType>('assignment')
export const editorSessions = reactive(new Map<string, EditorSession>())
export function autoReplyShopSummary(config: AutoReplyConfig | undefined): string { return autoReplyShopIds(config).map(shopId => shopOptions.find(item => item.value === shopId)?.label ?? shopId).join('、') || '未选择店铺账号' }
export function sortedServiceRules(type: ServiceRuleType) { return serviceRules.value.filter(item => item.type === type).sort((a, b) => type === 'autoReply' ? autoReplyShopSummary(a.autoReply).localeCompare(autoReplyShopSummary(b.autoReply), 'zh-CN') : a.order - b.order) }
function writeTypeOrder(type: ServiceRuleType, ordered: ServiceRule[]) {
  let index = 0
  serviceRules.value = serviceRules.value.map(rule => rule.type === type ? ordered[index++]! : rule)
}
function nextRulePriority(type: ServiceRuleType) { return Math.min(maximumRulePriority, Math.max(0, ...serviceRules.value.filter(item => item.type === type).map(item => item.order)) + 10) }
export function addLog(rule: ServiceRule, action: string, content: string) { serviceRuleLogs.value.unshift({ id: crypto.randomUUID(), ruleId: rule.id, at: timestamp(), operator: '当前用户', action, content }) }
export function conditionSummary(condition: RuleCondition) {
  if (condition.field === 'orderAmount') return `订单总金额 ${condition.amountRange ? 格式化条件值({ ...condition.amountRange, field: 'orderAmount', operator: '介于' }) || '未配置' : '未配置'}`
  const options = conditionOptions(condition.field)
  return `${conditionFields.find(item => item.value === condition.field)?.label ?? condition.field} ${condition.operator === 'eq' ? '等于' : '不等于'} ${condition.values.map(value => options?.find(item => item.value === value)?.label ?? value).join('、') || '未配置'}`
}
export function timingSummary(rule: ServiceRule) { return rule.type === 'autoReply' ? '休息时段收到买家来信后回复' : rule.type === 'assignment' || rule.timing === 'immediate' ? '立即执行' : `延迟 ${rule.delay} ${delayUnits.find(item => item.value === rule.delayUnit)?.label ?? ''}执行` }
export function actionSummary(rule: ServiceRule): string[] {
  if (rule.type !== 'assignment') {
    const actions = [`${rule.type === 'feedback' ? '给买家好评' : rule.type === 'autoReply' ? '回复买家' : '发送站内信'}：${templatePreview(rule)?.title ?? '模板已失效'}`]
    if (rule.type === 'message') actions.push(`同一个买家不重复发信：${rule.messageDedup?.days ?? 1}天${rule.messageDedup?.enabled ? '' : '（未启用）'}`)
    return actions
  }
  const action = rule.assignment
  return [action.assign ? `分配客服：${ownerOptions.find(item => item.value === action.assignee)?.label ?? action.assignee}` : '', action.status ? `标注：${action.workStatus === 'pending' ? '待处理' : '已处理'}` : '', action.tag ? `添加标签：${action.tagIds.map(id => mailTagDefinitions.find(item => item.id === id)?.label ?? '已失效标签').join('、')}` : '', action.prioritize ? `优先级：${priorityOptions.find(item => item.value === action.priority)?.label ?? action.priority}` : ''].filter(Boolean)
}
export function validateRule(rule: ServiceRule, rules: ServiceRule[] = serviceRules.value): string | undefined {
  if (!ruleTypes.some(item => item.value === rule.type)) return '请选择规则类型'
  if (!rule.name.trim()) return '请输入规则名称'
  if (rule.name.trim().length > 40 || /[\r\n]/.test(rule.name)) return '规则名称最多40个字符，不能换行'
  if (rules.some(item => item.id !== rule.id && item.type === rule.type && item.name.trim().toLocaleLowerCase() === rule.name.trim().toLocaleLowerCase())) return '当前类型下已存在同名规则'
  if (rule.type !== 'autoReply' && (!Number.isInteger(rule.order) || rule.order < 1 || rule.order > maximumRulePriority)) return '优先级须为1～999999的正整数'
  if (rule.note.length > 300) return '规则说明最多300个字符'
  if (!typeTriggers[rule.type].includes(rule.trigger)) return rule.type === 'message' ? '原自动发信触发事件已移除，请重新选择' : '请选择当前规则适用的触发时机'
  if (rule.type === 'message' && rule.messageDedup !== undefined && (!rule.messageDedup || typeof rule.messageDedup.enabled !== 'boolean' || !Number.isInteger(rule.messageDedup.days) || rule.messageDedup.days < 1 || rule.messageDedup.days > 90)) return '同一个买家不重复发信须设置1～90的整数天数'
  if (!['immediate', 'delayed'].includes(rule.timing) || ((rule.type === 'assignment' || rule.type === 'autoReply') && rule.timing !== 'immediate')) return '当前执行时机无效'
  if (rule.timing === 'delayed' && (!Number.isInteger(rule.delay) || rule.delay < 1 || rule.delay > 999 || !delayUnits.some(item => item.value === rule.delayUnit))) return '延迟时间须为1～999的整数，并选择时间单位'
  if (rule.type === 'autoReply') {
    const error = validateAutoReplyConfig(rule.autoReply)
    if (error) return error
    const shops = autoReplyShopIds(rule.autoReply)
    if (shops.some(shopId => !shopOptions.some(item => item.value === shopId))) return '店铺账号已失效，请重新选择'
    if (rules.some(item => item.id !== rule.id && item.type === 'autoReply' && autoReplyShopIds(item.autoReply).some(shopId => shops.includes(shopId)))) return '所选店铺账号已配置自动回复规则，请编辑已有规则或移除冲突账号'
    if (rule.conditions.length) return '自动回复规则按店铺和休息时段生效，不支持订单判断条件'
    return templateError(rule)
  }
  if (!rule.conditions.length) return '请至少选择一项判断条件'
  if (new Set(rule.conditions.map(item => item.field)).size !== rule.conditions.length) return '同一判断条件不能重复添加'
  for (const condition of rule.conditions) {
    const definition = conditionFields.find(item => item.value === condition.field)
    if (!definition) return '存在不支持的判断条件或运算符'
    if (condition.field === 'orderAmount') {
      if (condition.operator !== 'range' || !condition.amountRange || typeof condition.amountRange !== 'object' || condition.values.length) return '订单总金额须配置有效范围'
      const error = 校验条件配置({ ...condition.amountRange, field: 'orderAmount', operator: '介于' }).split('订单总金额范围').join('订单总金额')
      if (error) return error
      if (!是否支持比价币种(condition.amountRange.currency)) return '订单总金额请选择有效币种'
      continue
    }
    if (!['eq', 'neq'].includes(condition.operator)) return '存在不支持的判断条件或运算符'
    if (condition.field === 'isSplit' && (condition.operator !== 'eq' || condition.values.length !== 1)) return '是否有拆单发货须单选是或否'
    if (!condition.values.length || condition.values.some(value => typeof value !== 'string' || !value.trim())) return `请填写${definition.label}条件`
    if (condition.values.length > 1000) return `${definition.label}最多支持1000项`
    if (new Set(condition.values).size !== condition.values.length) return `${definition.label}存在重复值，请重新填写`
    const options = conditionOptions(condition.field)
    if (options && condition.values.some(value => !options.some(item => item.value === value))) return `${definition.label}选项已失效，请重新选择`
  }
  if (rule.type === 'assignment') {
    const action = rule.assignment
    if (![action.assign, action.status, action.tag, action.prioritize].some(Boolean)) return '请至少选择一项执行动作'
    if (action.assign && !ownerOptions.some(item => item.value === action.assignee)) return '请选择有效客服人员'
    if (action.status && !['pending', 'processed'].includes(action.workStatus)) return '请选择有效处理状态'
    if (action.tag && (!action.tagIds.length || action.tagIds.some(id => !mailTagDefinitions.some(item => item.id === id)))) return '请选择有效标签，已删除的标签需要重新选择'
    if (action.prioritize && !priorityOptions.some(item => item.value === action.priority)) return '请选择有效优先级'
    return undefined
  }
  return templateError(rule)
}
export function createEditor(type: ServiceRuleType, mode: EditorMode, source?: ServiceRule) {
  const id = mode === 'edit' && source ? source.id : crypto.randomUUID(), key = `${mode}:${id}`
  if (editorSessions.has(key)) {
    const session = editorSessions.get(key)!
    if (session.draft.type === 'autoReply') normalizeAutoReplyShops(session.draft.autoReply)
    return session
  }
  const draft = source ? clone(source) : defaultRule(type)
  if (draft.type === 'autoReply' && !draft.autoReply) draft.autoReply = defaultAutoReplyConfig()
  if (draft.type === 'autoReply') normalizeAutoReplyShops(draft.autoReply)
  if (draft.type === 'message' && draft.messageDedup === undefined) draft.messageDedup = { enabled: false, days: 1 }
  if (mode !== 'edit') {
    Object.assign(draft, { id: '', enabled: false, version: 1, updatedAt: '', order: type === 'autoReply' ? 0 : nextRulePriority(type) })
    if (draft.type === 'autoReply') draft.autoReply!.shopIds = []
  }
  if (mode === 'copy') {
    let count = 1, name = `${source!.name.slice(0, 32)}（副本）`
    while (serviceRules.value.some(item => item.type === type && item.name === name)) name = `${source!.name.slice(0, 30)}（副本${++count}）`
    draft.name = name
  }
  const skuInputs: Partial<Record<ConditionField, string>> = {}
  draft.conditions.filter(item => item.field === 'systemSku' || item.field === 'platformSku').forEach(item => { skuInputs[item.field] = item.values.join('\n') })
  const session = { key, id, mode, draft, skuInputs, sourceId: source?.id, sourceVersion: mode === 'edit' ? source?.version : undefined }
  editorSessions.set(key, session)
  注册业务页签清理(`${ruleListPath}/${mode}/${id}`, () => discardEditor(key))
  return editorSessions.get(key)!
}
export function discardEditor(key: string) {
  const session = editorSessions.get(key)
  if (session) 注销业务页签清理(`${ruleListPath}/${session.mode}/${session.id}`)
  editorSessions.delete(key)
}
export function editorError(session: EditorSession): string | undefined {
  if (editorSessions.get(session.key) !== session) return '编辑草稿已结束，请重新打开'
  if (session.mode === 'edit' && !serviceRules.value.some(item => item.id === session.sourceId && item.version === session.sourceVersion)) return '规则已变化或被删除，请取消后重新打开编辑'
  if (session.draft.type === 'autoReply') normalizeAutoReplyShops(session.draft.autoReply)
  return validateRule(session.draft)
}
export function saveEditor(session: EditorSession): string | undefined {
  const error = editorError(session)
  if (error) return error
  const rule = clone(session.draft), original = session.mode === 'edit' ? serviceRules.value.find(item => item.id === session.sourceId) : undefined
  if (rule.type === 'autoReply') normalizeAutoReplyShops(rule.autoReply)
  rule.id = original?.id ?? `AUTO-${crypto.randomUUID()}`; rule.name = rule.name.trim(); rule.note = rule.note.trim(); rule.version = original ? original.version + 1 : 1; rule.updatedAt = timestamp()
  rule.conditions.forEach(condition => { condition.values = condition.values.map(value => value.trim()) })
  const baseline = sortedServiceRules(rule.type)
  const ordered = original ? baseline.map(item => item.id === original.id ? rule : item) : [...baseline, rule]
  if (!original) serviceRules.value.push(rule)
  writeTypeOrder(rule.type, rule.type === 'autoReply' ? ordered : ordered.sort((a, b) => a.order - b.order))
  const configuration = rule.type === 'autoReply' ? `店铺账号：${autoReplyShopSummary(rule.autoReply)}（${autoReplyShopIds(rule.autoReply).join('、')}）；时区：${rule.autoReply!.timeZone}；${autoReplyScheduleSummary(rule.autoReply).join('；')}；模板ID：${rule.templateId}` : `优先级 ${rule.order}；${rule.conditions.length}项条件全部满足`
  const previous = original?.type === 'autoReply' ? `；变更前：店铺账号 ${autoReplyShopSummary(original.autoReply)}（${autoReplyShopIds(original.autoReply).join('、')}）；时区 ${original.autoReply?.timeZone ?? '未配置'}；${autoReplyScheduleSummary(original.autoReply).join('；')}；模板ID ${original.templateId}` : ''
  addLog(rule, session.mode === 'new' ? '新增' : session.mode === 'copy' ? '复制' : '编辑', `${rule.name}；${configuration}；${ruleTriggerLabel(rule)}；${timingSummary(rule)}；${actionSummary(rule).join('；')}；${rule.enabled ? '启用' : '停用'}${previous}`)
  activeRuleType.value = rule.type
  discardEditor(session.key)
  return undefined
}
export function setRulesEnabled(targets: Array<{ id: string; version: number }>, enabled: boolean): { error?: string; changed: number; skipped: number } {
  const rules = targets.map(target => serviceRules.value.find(item => item.id === target.id && item.version === target.version))
  if (rules.some(item => !item)) return { error: '所选规则已变化，请重新选择', changed: 0, skipped: 0 }
  for (const rule of rules) if (enabled && rule!.enabled !== enabled) { const error = validateRule(rule!); if (error) return { error: `${rule!.name}：${error}`, changed: 0, skipped: 0 } }
  let changed = 0
  rules.forEach(rule => { if (rule!.enabled === enabled) return; if (rule!.type === 'autoReply') normalizeAutoReplyShops(rule!.autoReply); rule!.enabled = enabled; rule!.version++; rule!.updatedAt = timestamp(); addLog(rule!, enabled ? '启用' : '停用', `${enabled ? '启用' : '停用'}规则「${rule!.name}」`); changed++ })
  return { changed, skipped: rules.length - changed }
}
export function deleteRule(id: string, version: number): string | undefined {
  const index = serviceRules.value.findIndex(item => item.id === id && item.version === version)
  if (index < 0) return '规则已变化或被删除，请刷新列表'
  const rule = serviceRules.value[index]!
  addLog(rule, '删除', `删除规则「${rule.name}」，保留历史操作记录`)
  serviceRules.value.splice(index, 1)
  for (const [key, session] of editorSessions) if (session.mode === 'edit' && session.sourceId === id) discardEditor(key)
}
export function moveRule(sourceId: string, targetId: string, expected: string): string | undefined {
  const source = serviceRules.value.find(item => item.id === sourceId), target = serviceRules.value.find(item => item.id === targetId)
  if (!source || !target || source.type !== target.type) return '调序对象已失效'
  if (source.type === 'autoReply') return '自动回复规则每店铺仅一条，无需调整优先级'
  const rules = sortedServiceRules(source.type)
  if (JSON.stringify(rules) !== expected) return '规则已变化，请重新调整顺序'
  const from = rules.indexOf(source), to = rules.indexOf(target)
  if (from === to) return undefined
  const priorities = rules.map(rule => rule.order), previous = new Map(rules.map(rule => [rule.id, rule.order]))
  rules.splice(from, 1); rules.splice(to, 0, source)
  const at = timestamp()
  for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
    const rule = rules[index]!
    rule.order = priorities[index]!; rule.version++; rule.updatedAt = at
    addLog(rule, '调整优先级', `优先级 ${previous.get(rule.id)} → ${rule.order}；匹配顺序调整为第${index + 1}位`)
  }
  writeTypeOrder(source.type, rules)
}
export function resetServiceRules() { serviceRules.value = initialRules(); serviceRuleLogs.value = []; activeRuleType.value = 'assignment'; [...editorSessions.keys()].forEach(discardEditor) }
