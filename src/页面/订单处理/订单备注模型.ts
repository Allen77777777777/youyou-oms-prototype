import { ref } from 'vue'

/** oms_order_note 的本地投影；原型以系统订单号代替尚未接入的订单数据库 ID。 */
export interface 订单备注 {
  order_id: string
  note_content: string
  author_id: string
  noted_at: string
}

/** 输入长度为本轮合理假设，生产接口与权限、加密及持久审计尚未实现。 */
export const 订单备注字数上限 = 2000
export const 原型备注作者 = 'prototype-user'

// 全部为安全虚构样例。仅当前浏览器会话保存，刷新恢复初始记录；不写平台或仓库。
export const 共享订单备注 = ref<订单备注[]>([
  { order_id: 'OMS260912000001', note_content: '交接备注：商品型号已核对。\n继续处理时请核对订单详情。', author_id: 原型备注作者, noted_at: '2026-10-09T00:30:00Z' },
  { order_id: 'OMS260912000001', note_content: '补充记录：本单的后续沟通结果请追加备注。', author_id: 原型备注作者, noted_at: '2026-10-09T00:45:00Z' },
  { order_id: 'OMS260912000006', note_content: '本单由下一班次继续跟进，处理结果请补充记录。', author_id: 原型备注作者, noted_at: '2026-10-09T01:00:00Z' },
])

/** 所有队列、履约行及详情按订单关联，不能按履约单号创建另一份备注。 */
export function 获取订单备注(订单号: string): 订单备注[] {
  return 共享订单备注.value.filter(备注 => 备注.order_id === 订单号)
}

export function 获取备注作者名称(作者: string): string {
  return 作者 === 原型备注作者 ? '原型用户' : 作者
}

export function 追加订单备注(订单号: string, 内容: string): { 成功: boolean; 信息: string; 备注?: 订单备注 } {
  if (!订单号.trim()) return { 成功: false, 信息: '缺少关联订单，无法增加备注' }
  const 备注内容 = 内容.trim()
  if (!备注内容) return { 成功: false, 信息: '请输入备注内容' }
  if (备注内容.length > 订单备注字数上限) return { 成功: false, 信息: `备注最多 ${订单备注字数上限} 字` }

  const 备注: 订单备注 = { order_id: 订单号, note_content: 备注内容, author_id: 原型备注作者, noted_at: new Date().toISOString() }
  // 追加历史；不调用普通操作日志，也不改订单版本、状态、路由或执行资格。
  共享订单备注.value.push(备注)
  return { 成功: true, 信息: '已增加本地备注', 备注 }
}
