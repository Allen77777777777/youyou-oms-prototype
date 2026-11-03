import { reactive } from 'vue'
import { validateReviewText } from '../eBay评价/模型'
import { buyerFeedbackTemplates, reviewReplyTemplates } from './评价模板数据'

export type FeedbackTemplateType = 'buyer-positive' | 'review-reply'
export interface FeedbackTemplate {
  id: string; type: FeedbackTemplateType; name: string; text: string; enabled: boolean; updatedAt: string
}
export type FeedbackTemplateInput = Pick<FeedbackTemplate, 'type' | 'name' | 'text' | 'enabled'>
export const feedbackTemplateTypes = [
  { value: 'buyer-positive' as const, label: '给买家好评' },
  { value: 'review-reply' as const, label: '回复买家评价' },
]
function initialTemplates(): FeedbackTemplate[] {
  return feedbackTemplateTypes.flatMap(({ value: type }) => (type === 'buyer-positive' ? buyerFeedbackTemplates : reviewReplyTemplates)
    .map(item => ({ ...item, type, enabled: true, updatedAt: '2026-10-29T09:00:00+08:00' })))
}
export const feedbackTemplateSession = reactive({ templates: initialTemplates() })
export function resetFeedbackTemplateSession() { feedbackTemplateSession.templates = initialTemplates() }
export function validateFeedbackTemplate(input: FeedbackTemplateInput, id?: string): string | undefined {
  if (!feedbackTemplateTypes.some(item => item.value === input.type)) return '请选择评价模板类型'
  const name = input.name.trim()
  if (!name) return '请输入模板名称'
  if (name.length > 80 || /[\r\n]/.test(name)) return '模板名称最多80个字符，不能换行'
  if (feedbackTemplateSession.templates.some(item => item.id !== id && item.type === input.type && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return '当前类型下已存在同名模板'
  if (/\{\{|\}\}/.test(input.text)) return '评价模板不支持变量，请填写完整的评价内容'
  return validateReviewText(input.text)
}
export function saveFeedbackTemplate(input: FeedbackTemplateInput, id?: string): { template?: FeedbackTemplate; error?: string } {
  const existing = id ? feedbackTemplateSession.templates.find(item => item.id === id) : undefined
  if (id && !existing) return { error: '该评价模板已不存在，请刷新列表' }
  if (existing && existing.type !== input.type) return { error: '已有模板不能更换类型，请新增另一类型模板' }
  const error = validateFeedbackTemplate(input, id)
  if (error) return { error }
  const value: FeedbackTemplate = { id: id ?? `feedback-template-${globalThis.crypto.randomUUID()}`, type: input.type, name: input.name.trim(), text: input.text.trim(), enabled: input.enabled, updatedAt: new Date().toISOString() }
  if (existing) Object.assign(existing, value)
  else feedbackTemplateSession.templates.unshift(value)
  return { template: existing ?? feedbackTemplateSession.templates[0] }
}
export function copyFeedbackTemplate(id: string) {
  const source = feedbackTemplateSession.templates.find(item => item.id === id)
  if (!source) return { error: '该评价模板已不存在' }
  let suffix = 1, name = `${source.name.slice(0, 65)}（副本）`
  while (feedbackTemplateSession.templates.some(item => item.type === source.type && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${source.name.slice(0, 65)}（副本 ${++suffix}）`
  return saveFeedbackTemplate({ ...source, name, enabled: false })
}
export function setFeedbackTemplateEnabled(id: string, enabled: boolean): string | undefined {
  const item = feedbackTemplateSession.templates.find(value => value.id === id)
  if (!item) return '该评价模板已不存在'
  if (enabled) { const error = validateFeedbackTemplate(item, id); if (error) return error }
  item.enabled = enabled; item.updatedAt = new Date().toISOString()
}
export function deleteFeedbackTemplate(id: string): string | undefined {
  const index = feedbackTemplateSession.templates.findIndex(item => item.id === id)
  if (index < 0) return '该评价模板已不存在'
  feedbackTemplateSession.templates.splice(index, 1)
}
export function getAvailableFeedbackTemplates(type: FeedbackTemplateType) {
  return feedbackTemplateSession.templates.filter(item => item.enabled && item.type === type)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id))
}
/** 采用时按当前稳定ID重验，复制为本次可修改的正文，不回写模板或历史评价。 */
export function useFeedbackTemplate(id: string, type: FeedbackTemplateType): { text?: string; error?: string } {
  const item = feedbackTemplateSession.templates.find(value => value.id === id && value.type === type && value.enabled)
  if (!item) return { error: '该评价模板已停用、删除或类型不符，请重新选择' }
  const error = validateFeedbackTemplate(item, id)
  return error ? { error } : { text: item.text }
}
