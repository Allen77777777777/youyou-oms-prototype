import { reactive } from 'vue'
import { mailSession } from './会话'
import type { Conversation } from './类型'
import { createCustomerServiceLog, type CustomerServiceLog } from '@/组件/客服日志/日志工具'
import { recordMailOperation } from './操作日志'
import { currentHandlerName } from '@/组件/客服处理人/处理人'
import { canAdminMailTags, canViewMail } from './权限与协作'

export interface MailTagDefinition {
  id: string
  label: string
  color: string
  /** 兼容多选筛选的 value 字段；标签身份始终使用 id。 */
  readonly value: string
}
export interface MailTagDraft { label: string; color: string }
export const MAX_MAIL_TAGS = 100
export const MAX_MAIL_TAG_NAME_LENGTH = 30
export const mailTagPresetColors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#B25FDB', '#45A6A2', '#64748B', '#E879A8']

const initialTags = [
  { id: 'logistics', label: '物流查询', color: '#409EFF' },
  { id: 'fitment', label: '商品适配', color: '#67C23A' },
  { id: 'cancellation', label: '取消订单', color: '#E6A23C' },
  { id: 'return', label: '退货退款', color: '#F56C6C' },
  { id: 'dispute', label: '纠纷风险', color: '#B25FDB' },
  { id: 'review', label: '评价沟通', color: '#45A6A2' },
]
function definition(tag: { id: string; label: string; color: string }): MailTagDefinition {
  return { ...tag, get value() { return this.id } }
}

/** 浏览器会话内的统一字典；重命名与换色不改变引用 ID，刷新恢复样例。 */
export const mailTagDefinitions = reactive<MailTagDefinition[]>(initialTags.map(definition))
export const mailTagOperationLogs = reactive<CustomerServiceLog[]>([])

export function validateMailTag(draft: MailTagDraft, editingId?: string): string | undefined {
  const label = draft.label.trim()
  if (editingId && !mailTagDefinitions.some(tag => tag.id === editingId)) return '标签已不存在，请刷新列表后重试'
  if (!label) return '请输入标签名称'
  if (label.length > MAX_MAIL_TAG_NAME_LENGTH) return `标签名称最多 ${MAX_MAIL_TAG_NAME_LENGTH} 个字符`
  if (/[\u0000-\u001f\u007f]/.test(label)) return '标签名称不能包含换行或控制字符'
  if (mailTagDefinitions.some(tag => tag.id !== editingId && tag.label.toLocaleLowerCase() === label.toLocaleLowerCase())) return '标签名称已存在'
  if (!/^#[\da-f]{6}$/i.test(draft.color.trim())) return '请选择有效的六位十六进制颜色'
  if (!editingId && mailTagDefinitions.length >= MAX_MAIL_TAGS) return `最多可创建 ${MAX_MAIL_TAGS} 个标签`
  return undefined
}

export function saveMailTag(draft: MailTagDraft, editingId?: string): { ok: true; tag: MailTagDefinition } | { ok: false; error: string } {
  if (!canAdminMailTags()) return { ok: false, error: '没有业务标签字典维护权限' }
  const error = validateMailTag(draft, editingId)
  if (error) return { ok: false, error }
  const values = { label: draft.label.trim(), color: draft.color.trim().toUpperCase() }
  if (editingId) {
    const tag = mailTagDefinitions.find(item => item.id === editingId)!
    if (tag.label === values.label && tag.color === values.color) return { ok: true, tag }
    const before = `${tag.label}（${tag.color}）`
    Object.assign(tag, values)
    mailTagOperationLogs.push(createCustomerServiceLog(currentHandlerName.value, '编辑业务标签', `${editingId}：${before} → ${tag.label}（${tag.color}）`, '已完成'))
    return { ok: true, tag }
  }
  const id = `tag-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
  mailTagDefinitions.push(definition({ id, ...values }))
  mailTagOperationLogs.push(createCustomerServiceLog(currentHandlerName.value, '新增业务标签', `${id}：${values.label}（${values.color}）`, '已完成'))
  return { ok: true, tag: mailTagDefinitions[mailTagDefinitions.length - 1]! }
}

export function countMailTagReferences(id: string, conversations: Conversation[] = mailSession.conversations): number {
  return conversations.filter(conversation => canViewMail(conversation) && conversation.tags?.includes(id)).length
}

/** 删除前复核确认数量，避免确认期间引用范围变化而默默扩大影响。 */
export function deleteMailTag(id: string, expectedAffected: number, conversations: Conversation[] = mailSession.conversations): { ok: true; affected: number } | { ok: false; error: string } {
  if (!canAdminMailTags()) return { ok: false, error: '没有业务标签字典维护权限' }
  const index = mailTagDefinitions.findIndex(tag => tag.id === id)
  if (index < 0) return { ok: false, error: '标签已不存在' }
  const affected = countMailTagReferences(id, conversations)
  if (affected !== expectedAffected) return { ok: false, error: '关联会话数量已变化，请重新确认删除' }
  const tag = mailTagDefinitions[index]!
  for (const conversation of conversations) {
    if (conversation.tags?.includes(id)) { conversation.tags = conversation.tags.filter(tagId => tagId !== id); recordMailOperation(conversation, currentHandlerName.value, '移除已删除业务标签', `移除标签：${tag.label}（${id}）`) }
  }
  mailTagDefinitions.splice(index, 1)
  mailTagOperationLogs.push(createCustomerServiceLog(currentHandlerName.value, '删除业务标签', `${tag.label}（${id}）；移除 ${affected} 个会话引用`, '已完成'))
  return { ok: true, affected }
}

function rgb(hex: string): number[] { return [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16)) }
function hex(values: number[]): string { return `#${values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}` }
function luminance(values: number[]): number {
  return values.map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4 }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0)
}
/** 浅色底和边框沿用所选颜色；过浅字体逐步加深，避免自定义白色标签不可读。 */
export function tagStyle(id: string): { color: string; backgroundColor: string; borderColor: string } {
  const configured = mailTagDefinitions.find(tag => tag.id === id)?.color
  const base = rgb(configured && /^#[\da-f]{6}$/i.test(configured) ? configured : '#64748B')
  const background = base.map(channel => channel * 0.1 + 255 * 0.9)
  let foreground = [...base]
  while ((luminance(background) + 0.05) / (luminance(foreground) + 0.05) < 4.5 && foreground.some(channel => channel > 0.5)) foreground = foreground.map(channel => channel * 0.9)
  return { color: hex(foreground), backgroundColor: hex(background), borderColor: hex(base.map(channel => channel * 0.4 + 255 * 0.6)) }
}

/** 测试及本地演示重置入口，不改变外部系统。 */
export function resetMailTagDefinitions(): void { mailTagDefinitions.splice(0, mailTagDefinitions.length, ...initialTags.map(definition)); mailTagOperationLogs.splice(0) }
