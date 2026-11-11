import { 格式化北京时间 } from '@/页面/订单处理/时间展示工具'

/** 客服业务日志的展示投影。平台活动、内部备注及工单跟进仍保留各自来源。 */
export interface CustomerServiceLog {
  id?: string
  at: string
  operator?: string
  action: string
  content: string
  result?: string
}

let sequence = 0
export function createCustomerServiceLog(
  operator: string, action: string, content: string, result = '已记录', at = new Date().toISOString(),
): CustomerServiceLog {
  return { id: `service-log-${Date.now()}-${++sequence}`, at, operator: operator.trim() || undefined, action, content, result }
}

export function formatCustomerServiceLogTime(value: string): string {
  return value.trim() ? 格式化北京时间(value) : '未记录'
}

/** 仅表达日志结果原文的视觉层级，不推导资金或平台业务终态。 */
export function customerServiceLogResultTone(value?: string): 'neutral' | 'success' | 'danger' | 'warning' | 'info' {
  const result = value?.trim() || ''
  if (/待核查|待核验|未知|不确定|无法确认/.test(result)) return 'warning'
  if (/失败|错误|未成功|未通过/.test(result)) return 'danger'
  if (/已提交|待回查|待确认|待查询|已受理|确认受理|处理中|发送中|办理中|排队|已回查/.test(result)) return 'info'
  if (/^(成功|已成功|已完成|发送成功|读取成功|退款成功|保存成功|更新成功|已保存|已更新)$/.test(result)) return 'success'
  return 'neutral'
}
