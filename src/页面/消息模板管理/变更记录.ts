import { reactive } from 'vue'
import { createCustomerServiceLog, type CustomerServiceLog } from '@/组件/客服日志/日志工具'
import { currentActor } from '../工单管理/会话'

export type TemplateChangeKind = 'message' | 'phrase' | 'buyer-positive' | 'review-reply'
export interface TemplateChange extends CustomerServiceLog { templateId: string; kind: TemplateChangeKind; templateName: string; deleted?: boolean }
/** 当前会话内的变更事实独立于有效模板保存，删除模板不会删除历史。 */
export const templateChanges = reactive<TemplateChange[]>([])
export function recordTemplateChange(kind: TemplateChangeKind, templateId: string, templateName: string, action: string, content: string, deleted = false) {
  templateChanges.push({ ...createCustomerServiceLog(currentActor.value, action, content, '成功'), kind, templateId, templateName, deleted })
}
export function resetTemplateChanges(kinds: TemplateChangeKind[]) {
  for (let index = templateChanges.length - 1; index >= 0; index--) if (kinds.includes(templateChanges[index]!.kind)) templateChanges.splice(index, 1)
}
export function changesForTemplate(kind: TemplateChangeKind, id: string) {
  return templateChanges.filter(entry => entry.kind === kind && entry.templateId === id)
}
