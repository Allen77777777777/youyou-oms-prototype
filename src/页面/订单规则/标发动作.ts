export const 标发基础动作 = ['仓库发货完成后标发', '无需标发']
export const 标发常用小时数 = ['1', '2', '4', '6', '12', '24', '48', '72']
export const 标发小时数上限 = 72
export type 标发时机 = 'immediate' | 'delay' | 'beforeDeadline'
export interface 标发时机配置 { timing: 标发时机; delayHours?: string; beforeDeadlineHours?: string }
interface 标发规则 { type: string; action: string; shippingAction?: 标发时机配置 }

// 只用于独立编辑草稿，不改写已保存规则或运行中的任务快照。
export function 初始化标发动作(规则: 标发规则) {
  if (规则.type !== '订单标发规则') return
  if (规则.action === '具备出库事实后建议标发') 规则.action = '仓库发货完成后标发'
  if (!规则.shippingAction) 规则.shippingAction = { timing: 'immediate', delayHours: '', beforeDeadlineHours: '' }
}
export function 读取标发时机(规则: 标发规则): 标发时机配置 { return 规则.shippingAction ?? { timing: 'immediate' } }
export function 校验标发动作(规则: 标发规则): string {
  if (规则.type !== '订单标发规则') return 规则.shippingAction ? '标发时机仅适用于订单标发规则' : ''
  if (!标发基础动作.includes(规则.action)) return '请选择有效标发动作，旧动作需重新配置'
  if (规则.action === '无需标发') return ''
  const 配置 = 读取标发时机(规则)
  if (!配置 || !['immediate', 'delay', 'beforeDeadline'].includes(配置.timing)) return '请选择有效标发时机'
  if (配置.timing === 'immediate') return ''
  const 值 = 配置.timing === 'delay' ? 配置.delayHours : 配置.beforeDeadlineHours
  if (typeof 值 !== 'string' || !/^[1-9]\d{0,2}$/.test(值) || Number(值) > 标发小时数上限) return `${配置.timing === 'delay' ? '延迟小时数' : '提前小时数'}请输入 1～${标发小时数上限} 的整数`
  return ''
}
export function 格式化标发动作(规则: 标发规则): string {
  if (校验标发动作(规则)) return `${规则.action || '标发动作未选择'}（配置待完善）`
  if (规则.action === '无需标发') return '无需标发'
  const 配置 = 读取标发时机(规则)
  if (配置.timing === 'delay') return `仓库发货完成后延迟 ${配置.delayHours} 小时标发`
  if (配置.timing === 'beforeDeadline') return `最晚标发时间前 ${配置.beforeDeadlineHours} 小时标发`
  return '仓库发货完成后立即标发'
}
export function 标发动作说明(规则: 标发规则): string {
  if (校验标发动作(规则)) return '请完善标发动作与时间设置。'
  if (规则.action === '无需标发') return '命中规则的订单无需由 OMS 回传发货信息，不代表平台标发成功，也不改变订单发货状态。'
  const 配置 = 读取标发时机(规则)
  if (配置.timing === 'delay') return `计划标发时间 = 仓库发货完成时间 + ${配置.delayHours} 小时`
  if (配置.timing === 'beforeDeadline') return `计划标发时间 = 最晚标发时间 − ${配置.beforeDeadlineHours} 小时；若届时仓库尚未完成发货，待发货完成后标发。`
  return '仓库发货完成且订单已发货后，立即安排标发。'
}
