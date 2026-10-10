import { 命中多选, 命中字段搜索, 校验字段搜索, 排序列表, 读取排序时刻 } from '@/组件/筛选/筛选工具'
import type { 订单规则 } from './规则逻辑'

export const 规则搜索字段 = [{ value: 'name', label: '规则名称', kind: 'text' as const }, { value: 'note', label: '规则说明', kind: 'text' as const }]
export interface 规则筛选条件 { keyword: string; searchType: string; searchMatch: 'contains' | 'exact'; enabled: string[] }
export function 默认规则筛选(): 规则筛选条件 { return { keyword: '', searchType: 'name', searchMatch: 'contains', enabled: [] } }
export function 校验规则筛选(筛选: 规则筛选条件) { return 校验字段搜索(筛选.keyword, 筛选.searchMatch, 'text') }
export function 命中规则筛选(规则: 订单规则, 筛选: 规则筛选条件) { return 命中字段搜索(筛选.searchType === 'note' ? 规则.note : 规则.name, 筛选.keyword, 筛选.searchMatch, 'text') && 命中多选(筛选.enabled, String(规则.enabled)) }
export function 排序规则展示(规则: 订单规则[], 排序: { field: string; direction: 'asc' | 'desc' }) {
  return 排序列表(规则, 项 => 排序.field === 'updatedAt' ? 读取排序时刻(项.updatedAt) : 项.priority, 排序.field ? 排序.direction : 'asc', 项 => 项.id)
}
