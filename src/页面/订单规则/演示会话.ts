import { ref } from 'vue'
import { 创建规则样例, 按规则优先级排序, 有效规则优先级, type 订单规则, type 规则类型 } from './规则逻辑'

const 补充规则: 订单规则[] = [
  { id: 'RULE-REVIEW-GB-AUTO', name: '英国未履约订单自动审核', type: '审单规则', enabled: true, priority: 30, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'countryCode', operator: '等于', value: 'GB' }, { field: 'platformOrderStatus', operator: '等于', value: 'NOT_STARTED' }], action: '自动审核', version: 1, updatedAt: '2026-11-04 09:00:00 UTC+8', note: '' },
  { id: 'RULE-REVIEW-PARTIAL', name: 'eBay 部分履约订单人工核对', type: '审单规则', enabled: true, priority: 5, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }], action: '留在待审核', version: 1, updatedAt: '2026-10-16 09:00:00 UTC+8', note: '' },
  { id: 'RULE-REVIEW-EU', name: '欧洲自配送订单审核建议', type: '审单规则', enabled: false, priority: 20, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'countryCode', operator: '等于', value: 'DE' }], action: '留在待审核', version: 1, updatedAt: '2026-10-16 09:05:00 UTC+8', note: '' },
  { id: 'RULE-CONFIRM-MANUAL', name: '英国订单无需标发', type: '订单标发规则', enabled: false, priority: 20, mode: '全部满足', conditions: [{ field: 'countryCode', operator: '等于', value: 'GB' }], action: '无需标发', version: 1, updatedAt: '2026-10-16 09:10:00 UTC+8', note: '' },
]
export const 共享规则 = ref([...创建规则样例(), ...补充规则])
export type 规则操作 = '新增' | '编辑' | '复制' | '启用' | '停用' | '调整优先级' | '删除'
export interface 规则操作日志 { time: string; text: string; ruleId?: string; ruleName?: string; action?: 规则操作; operator?: string }
export const 共享规则日志 = ref<规则操作日志[]>([])
export function 记录规则操作(规则: Pick<订单规则, 'id' | 'name'>, action: 规则操作, text: string, time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8') {
  共享规则日志.value.unshift({ ruleId: 规则.id, ruleName: 规则.name, action, operator: '演示用户', time, text })
}

function 写入同类顺序(类型: 规则类型, 同类: 订单规则[]) {
  let index = 0
  const 全部 = 共享规则.value.map(项 => 项.type === 类型 ? 同类[index++]! : 项)
  共享规则.value = 全部.concat(同类.slice(index))
}

export function 写入规则配置(保存项: 订单规则) {
  const 同类 = 按规则优先级排序(共享规则.value.filter(项 => 项.type === 保存项.type))
  const 原位置 = 同类.findIndex(项 => 项.id === 保存项.id)
  if (原位置 < 0) 同类.push(保存项)
  else 同类[原位置] = 保存项
  写入同类顺序(保存项.type, 按规则优先级排序(同类))
}

export function 移动规则优先级(sourceId: string, targetId: string): boolean {
  const 来源 = 共享规则.value.find(项 => 项.id === sourceId)
  if (!来源 || sourceId === targetId) return false
  const 同类 = 按规则优先级排序(共享规则.value.filter(项 => 项.type === 来源.type))
  const from = 同类.indexOf(来源), to = 同类.findIndex(项 => 项.id === targetId)
  if (to < 0 || 同类.some(项 => !有效规则优先级(项.priority))) return false

  const 原序 = 同类.map((规则, index) => ({ 规则, 位置: index + 1, 数字: 规则.priority }))
  const 新序 = [...原序]
  新序.splice(from, 1)
  新序.splice(to, 0, 原序[from]!)
  const time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8'
  for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
    const { 规则, 位置, 数字 } = 新序[index]!
    规则.priority = 原序[index]!.数字
    规则.version++
    规则.updatedAt = time
    记录规则操作(规则, '调整优先级', `优先级 ${数字} → ${规则.priority}；匹配顺序：第 ${位置} 位 → 第 ${index + 1} 位`, time)
  }
  写入同类顺序(来源.type, 新序.map(项 => 项.规则))
  return true
}
