import { reactive, ref } from 'vue'
import { 规则动作, type 订单规则, type 规则类型 } from './规则逻辑'
import { 初始化标发动作 } from './标发动作'
import { 初始化分仓策略 } from './规则路由'
import { 注册业务页签清理, 注销业务页签清理 } from '@/布局/页签操作'

export type 规则编辑模式 = 'new' | 'edit' | 'copy'
export interface 规则草稿会话 { key: string; id: string; mode: 规则编辑模式; draft: 订单规则; sourceId?: string; sourceVersion?: number }
const 草稿会话 = reactive(new Map<string, 规则草稿会话>())
export const 当前规则分类 = ref<规则类型>('审单规则')
export function 读取规则草稿(mode: 规则编辑模式, id: string) { return 草稿会话.get(`${mode}:${id}`) }
function 兼容人工复核措辞(draft: 订单规则) { if (draft.type === '审单规则' && draft.action === '进入人工复核') draft.action = '留在待审核'; 初始化标发动作(draft); 初始化分仓策略(draft) }
export function 创建规则草稿(type: 规则类型, rules: 订单规则[], mode: 规则编辑模式 = 'new', source?: 订单规则) {
  if (mode !== 'new' && !source) return undefined
  const id = mode === 'edit' ? source!.id : crypto.randomUUID()
  const key = `${mode}:${id}`
  const existing = 草稿会话.get(key)
  if (existing) { existing.draft.mode = '全部满足'; 兼容人工复核措辞(existing.draft); return existing }
  const priority = Math.max(0, ...rules.filter(项 => 项.type === type).map(项 => 项.priority)) + 10
  const draft: 订单规则 = source ? JSON.parse(JSON.stringify(source)) : { id: '', name: '', type, enabled: false, priority, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: type === '分仓规则' ? '' : 规则动作[type][0]!, version: 1, updatedAt: '', note: '' }
  draft.mode = '全部满足'
  兼容人工复核措辞(draft)
  if (mode === 'copy') {
    let name = `${source!.name.slice(0, 34)}（副本）`, count = 2
    while (rules.some(项 => 项.type === type && 项.name === name)) name = `${source!.name.slice(0, 30)}（副本${count++}）`
    Object.assign(draft, { id: '', name, enabled: false, priority, version: 1, updatedAt: '' })
  }
  草稿会话.set(key, { key, id, mode, draft, sourceId: source?.id, sourceVersion: mode === 'edit' ? source?.version : undefined })
  注册业务页签清理(`/oms/self-fulfillment/order-rules/${mode}/${id}`, () => 丢弃规则草稿(key))
  return 草稿会话.get(key)!
}
export function 丢弃规则草稿(key: string) {
  const session = 草稿会话.get(key)
  if (session) 注销业务页签清理(`/oms/self-fulfillment/order-rules/${session.mode}/${session.id}`)
  草稿会话.delete(key)
}
