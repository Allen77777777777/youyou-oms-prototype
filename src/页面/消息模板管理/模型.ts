import { reactive } from 'vue'
import { replyTemplates } from '../eBay站内信/数据'
import { MAX_REPLY_BODY_LENGTH, validateDraft } from '../eBay站内信/模型'
import type { MessageAttachment } from '../eBay站内信/类型'
import { plainTextToHtml, richHtmlToSendText, richHtmlToText, sanitizeRichHtml } from './富文本'
import { recordTemplateChange, resetTemplateChanges } from './变更记录'

export type TemplateKind = 'message' | 'phrase'
export interface MessageTemplate {
  id: string; kind: TemplateKind; title: string; body: string; enabled: boolean; updatedAt: string
  /** subject 仅用于模板管理页的内部参考，不参与对外回复。 */
  subject?: string; bodyHtml?: string; attachments?: MessageAttachment[]
}
export interface TemplateContext {
  buyerId?: string; orderNo?: string; productName?: string; trackingNumber?: string; platformProductName?: string; platformSku?: string
}
export interface TemplateVariable {
  readonly id: string; readonly key: keyof TemplateContext; readonly label: string; readonly source: keyof TemplateContext; readonly builtin: true
}
export type TemplateInput = Pick<MessageTemplate, 'kind' | 'title' | 'body' | 'enabled' | 'subject' | 'bodyHtml' | 'attachments'>

const builtinVariables: readonly TemplateVariable[] = Object.freeze([
  { id: 'var-buyer', key: 'buyerId', label: '买家 ID', source: 'buyerId', builtin: true },
  { id: 'var-order', key: 'orderNo', label: '关联订单号', source: 'orderNo', builtin: true },
  { id: 'var-product', key: 'productName', label: '商品名称', source: 'productName', builtin: true },
  { id: 'var-tracking', key: 'trackingNumber', label: '跟踪号', source: 'trackingNumber', builtin: true },
  { id: 'var-platform-product', key: 'platformProductName', label: '平台商品名称', source: 'platformProductName', builtin: true },
  { id: 'var-platform-sku', key: 'platformSku', label: '平台商品SKU', source: 'platformSku', builtin: true },
].map(variable => Object.freeze(variable as TemplateVariable)))
export const variableSources = Object.freeze(builtinVariables.map(variable => Object.freeze({ value: variable.source, label: variable.label })))
const initialAt = '2026-10-28T09:00:00+08:00'
function initialTemplates(): MessageTemplate[] {
  return [
    ...replyTemplates.slice(0, 3).map(t => ({ ...t, kind: 'message' as const, subject: t.title, enabled: true, updatedAt: initialAt })),
    { id: 'template-order-followup', kind: 'message', title: '按订单跟进', subject: 'Update for order {{orderNo}}', body: 'Hello {{buyerId}}, thank you for contacting us about order {{orderNo}}. We will review the details and follow up with you.', enabled: true, updatedAt: initialAt },
    { id: 'template-rest-auto-reply', kind: 'message', title: '休息时段自动回复', body: 'Thank you for your message. Our customer service team is currently away. We have received your message and will reply during our next working hours.', enabled: true, updatedAt: initialAt },
    { id: 'phrase-greeting', kind: 'phrase', title: '问候买家', body: 'Hello {{buyerId}}, thank you for your message.', enabled: true, updatedAt: initialAt },
    { id: 'phrase-thanks', kind: 'phrase', title: '感谢耐心等待', body: 'Thank you for your patience.', enabled: true, updatedAt: initialAt },
    { id: 'phrase-signature', kind: 'phrase', title: '客服落款', body: 'Best regards,\nCustomer Service', enabled: false, updatedAt: initialAt },
  ]
}

const state = reactive({ templates: initialTemplates() })
/** 变量由产研维护，页面无法替换字典或改变任何定义；模板仅保留本次浏览器会话。 */
export const templateSession = Object.defineProperty(state, 'variables', { enumerable: true, configurable: false, get: () => builtinVariables }) as typeof state & { readonly variables: readonly TemplateVariable[] }
export function resetTemplateSession() { templateSession.templates = initialTemplates(); resetTemplateChanges(['message', 'phrase']) }
const tokenPattern = /{{([^{}]*?)}}/g
const makeId = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

export function getTemplateVariables(body: string): TemplateVariable[] {
  const keys = new Set([...body.matchAll(tokenPattern)].map(match => match[1]!.trim()))
  return builtinVariables.filter(variable => keys.has(variable.key))
}
export function getVariableReferences(key: string): MessageTemplate[] {
  return templateSession.templates.filter(template => getTemplateVariables(`${template.subject ?? ''}\n${template.body}`).some(variable => variable.key === key))
}

export function renderTemplate(body: string, context: TemplateContext, _manualValues: Record<string, string> = {}): { body: string; missing: TemplateVariable[]; unknown: string[] } {
  const missing: TemplateVariable[] = [], unknown: string[] = []
  const result = body.replace(tokenPattern, (placeholder, rawKey: string) => {
    const key = rawKey.trim(), variable = builtinVariables.find(item => item.key === key)
    if (!variable) { if (!unknown.includes(key || '空变量')) unknown.push(key || '空变量'); return placeholder }
    const supplied = context[variable.source]
    if (typeof supplied !== 'string' || !supplied.trim()) {
      if (!missing.some(item => item.id === variable.id)) missing.push(variable)
      return placeholder
    }
    return supplied.trim()
  })
  const remainder = body.replace(tokenPattern, '')
  if (remainder.includes('{{') || remainder.includes('}}')) unknown.push('变量语法不完整')
  return { body: result, missing, unknown }
}

export interface RenderedMessageTemplate {
  subject: string; body: string; bodyHtml: string; missing: TemplateVariable[]; unknown: string[]; attachments: MessageAttachment[]
}
export function renderMessageTemplate(template: Pick<MessageTemplate, 'kind' | 'body' | 'subject' | 'bodyHtml' | 'attachments'>, context: TemplateContext): RenderedMessageTemplate {
  const subject = renderTemplate(template.kind === 'message' ? template.subject ?? '' : '', context)
  const missing = [...subject.missing], unknown = [...subject.unknown]
  const source = document.createElement('template')
  source.innerHTML = sanitizeRichHtml(template.bodyHtml ?? plainTextToHtml(template.body))
  interface TextSegment { node: Node; start: number; end: number }
  const groups: Array<{ text: string; segments: TextSegment[] }> = []
  let group = { text: '', segments: [] as TextSegment[] }
  function boundary() { if (group.text) groups.push(group); group = { text: '', segments: [] } }
  function collect(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '', start = group.text.length
      group.text += text; group.segments.push({ node, start, end: group.text.length })
      return
    }
    const separates = node instanceof Element && ['P', 'H1', 'H2', 'H3', 'LI', 'UL', 'OL', 'BR'].includes(node.tagName)
    if (separates) boundary()
    ;[...node.childNodes].forEach(collect)
    if (separates) boundary()
  }
  ;[...source.content.childNodes].forEach(collect)
  boundary()
  // 允许变量被加粗等行内节点分开；按原文本偏移倒序替换，替换值不会再被扫描。
  for (const part of groups) {
    const rendered = renderTemplate(part.text, context)
    rendered.missing.forEach(variable => { if (!missing.some(item => item.id === variable.id)) missing.push(variable) })
    rendered.unknown.forEach(value => { if (!unknown.includes(value)) unknown.push(value) })
    const tokens = [...part.text.matchAll(tokenPattern)].reverse()
    for (const token of tokens) {
      const start = token.index!, end = start + token[0].length
      const replacement = renderTemplate(token[0], context).body
      if (replacement === token[0]) continue
      const segments = part.segments.filter(segment => segment.end > start && segment.start < end)
      segments.forEach((segment, index) => {
        const text = segment.node.nodeValue ?? '', from = Math.max(0, start - segment.start), to = Math.min(segment.end - segment.start, end - segment.start)
        segment.node.nodeValue = text.slice(0, from) + (index === 0 ? replacement : '') + text.slice(to)
      })
    }
  }
  const bodyHtml = source.innerHTML
  return { subject: subject.body, body: richHtmlToText(bodyHtml), bodyHtml, missing, unknown, attachments: template.kind === 'message' ? (template.attachments ?? []).map(attachment => ({ ...attachment })) : [] }
}

/** 对外回复只渲染正文与附件；内部参考标题及其中的变量不进入发送链路。 */
export function renderReplyTemplate(template: Pick<MessageTemplate, 'kind' | 'body' | 'subject' | 'bodyHtml' | 'attachments'>, context: TemplateContext): RenderedMessageTemplate {
  const rendered = renderMessageTemplate({ ...template, subject: '' }, context)
  return { ...rendered, body: richHtmlToSendText(rendered.bodyHtml), bodyHtml: '' }
}

export function validateTemplateAttachments(attachments: MessageAttachment[] = []): string | undefined {
  return validateDraft({ body: 'attachment validation', attachments })
}
export function validateTemplate(input: TemplateInput, id?: string): string | undefined {
  if (!['message', 'phrase'].includes(input.kind)) return '请选择模板类型'
  const title = input.title.trim()
  if (!title) return '请输入名称'
  if (title.length > 80 || /[\r\n]/.test(title)) return '名称最多 80 个字符，不能换行'
  if (templateSession.templates.some(item => item.id !== id && item.kind === input.kind && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) return '当前类型下已存在同名内容'
  if (input.kind === 'message') {
    const subject = input.subject?.trim() ?? ''
    if (subject.length > 200 || /[\r\n]/.test(input.subject ?? '')) return '内部参考标题最多 200 个字符，不能换行'
    const attachmentError = validateTemplateAttachments(input.attachments)
    if (attachmentError) return attachmentError
  }
  const body = input.bodyHtml === undefined ? input.body : richHtmlToSendText(input.bodyHtml)
  if (!body.trim()) return '请输入正文'
  if (body.length > MAX_REPLY_BODY_LENGTH) return `正文不能超过 ${MAX_REPLY_BODY_LENGTH} 个字符`
  const unknown = renderMessageTemplate(input, {}).unknown
  if (unknown.length) return `存在未定义或无效变量：${unknown.join('、')}`
  return undefined
}

export function saveTemplate(input: TemplateInput, id?: string, copiedFrom?: string): { template?: MessageTemplate; error?: string } {
  const error = validateTemplate(input, id)
  if (error) return { error }
  const existing = id ? templateSession.templates.find(item => item.id === id) : undefined
  if (id && !existing) return { error: '该模板已不存在，请刷新列表' }
  const bodyHtml = sanitizeRichHtml(input.bodyHtml ?? plainTextToHtml(input.body.trim()))
  const value: MessageTemplate = { id: id ?? makeId('template'), kind: input.kind, title: input.title.trim(), body: richHtmlToText(bodyHtml), bodyHtml, enabled: input.enabled, updatedAt: new Date().toISOString() }
  if (input.kind === 'message') { value.subject = input.subject?.trim() ?? ''; value.attachments = (input.attachments ?? []).map(attachment => ({ ...attachment })) }
  const changes: string[] = []
  if (existing) {
    if (existing.title !== value.title) changes.push(`名称：${existing.title} → ${value.title}`)
    if (existing.body !== value.body || sanitizeRichHtml(existing.bodyHtml ?? plainTextToHtml(existing.body)) !== value.bodyHtml) changes.push(`正文已修改（${existing.body.length} → ${value.body.length} 字符）`)
    if ((existing.subject || '') !== (value.subject || '')) changes.push('内部参考标题已修改')
    const beforeVariables = getTemplateVariables(`${existing.subject || ''}\n${existing.body}`).map(variable => variable.label).join('、') || '无'
    const afterVariables = getTemplateVariables(`${value.subject || ''}\n${value.body}`).map(variable => variable.label).join('、') || '无'
    if (beforeVariables !== afterVariables) changes.push(`使用变量：${beforeVariables} → ${afterVariables}`)
    if (JSON.stringify(existing.attachments || []) !== JSON.stringify(value.attachments || [])) changes.push(`附件已修改（${existing.attachments?.length || 0} → ${value.attachments?.length || 0} 个）`)
    if (existing.enabled !== value.enabled) changes.push(`状态：${existing.enabled ? '启用' : '停用'} → ${value.enabled ? '启用' : '停用'}`)
    if (!changes.length) return { template: existing }
  }
  if (existing) {
    Object.assign(existing, value)
    if (input.kind === 'phrase') { delete existing.subject; delete existing.attachments }
  } else templateSession.templates.unshift(value)
  recordTemplateChange(value.kind, value.id, value.title, existing ? '编辑模板' : copiedFrom ? '复制模板' : '新增模板', existing ? changes.join('；') : `${copiedFrom ? `来源模板：${copiedFrom}；` : ''}创建${value.kind === 'message' ? '站内信模板' : '常用语'}，状态：${value.enabled ? '启用' : '停用'}`)
  return { template: existing ?? templateSession.templates[0] }
}
export function copyTemplate(id: string): { template?: MessageTemplate; error?: string } {
  const source = templateSession.templates.find(item => item.id === id)
  if (!source) return { error: '该模板已不存在' }
  let suffix = 1, title = `${source.title.slice(0, 65)}（副本）`
  while (templateSession.templates.some(item => item.kind === source.kind && item.title === title)) title = `${source.title.slice(0, 65)}（副本 ${++suffix}）`
  return saveTemplate({ ...source, title, enabled: false }, undefined, source.id)
}
export function setTemplateEnabled(id: string, enabled: boolean): string | undefined {
  const item = templateSession.templates.find(template => template.id === id)
  if (!item) return '该模板已不存在'
  if (enabled) { const error = validateTemplate(item, id); if (error) return error }
  if (item.enabled === enabled) return undefined
  recordTemplateChange(item.kind, item.id, item.title, enabled ? '启用模板' : '停用模板', `状态：${item.enabled ? '启用' : '停用'} → ${enabled ? '启用' : '停用'}`)
  item.enabled = enabled; item.updatedAt = new Date().toISOString()
  return undefined
}
export function deleteTemplate(id: string): string | undefined {
  const index = templateSession.templates.findIndex(item => item.id === id)
  if (index < 0) return '该模板已不存在'
  const item = templateSession.templates[index]!
  recordTemplateChange(item.kind, item.id, item.title, '删除模板', '已删除；历史变更记录保留', true)
  templateSession.templates.splice(index, 1)
  return undefined
}
