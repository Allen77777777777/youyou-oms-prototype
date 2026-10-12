import { 命中多选, 命中字段搜索, 校验字段搜索, 命中时间范围, 校验时间范围, 排序列表, 读取排序时刻 } from '@/组件/筛选/筛选工具'
import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 标发单 } from './标发逻辑'

export const 标发搜索字段 = [
  { value: 'no', label: '标发单号' }, { value: 'orderNo', label: '系统订单号' },
  { value: 'platformOrderNo', label: '平台订单号' }, { value: 'fulfillmentNo', label: '履约单号' },
  { value: 'tracking', label: '跟踪号' },
]
export interface 标发筛选条件 { keyword: string; searchType: string; searchMatch: 'contains' | 'exact'; platform: string[]; store: string[]; dates: null | string[] }
export function 默认标发筛选(): 标发筛选条件 { return { keyword: '', searchType: 'no', searchMatch: 'contains', platform: [], store: [], dates: null } }
export function 校验标发筛选(筛选: 标发筛选条件) { return 校验字段搜索(筛选.keyword, 筛选.searchMatch, 'identifier') || 校验时间范围(筛选.dates) }
export function 命中标发筛选(单: 标发单, 筛选: 标发筛选条件, 来源?: 全渠道订单): boolean {
  const 字段 = 筛选.searchType === 'platformOrderNo' ? 来源?.platformOrderNo : 单[(['no', 'orderNo', 'fulfillmentNo', 'tracking'].includes(筛选.searchType) ? 筛选.searchType : 'no') as 'no' | 'orderNo' | 'fulfillmentNo' | 'tracking']
  return 命中字段搜索(字段, 筛选.keyword, 筛选.searchMatch) && 命中多选(筛选.platform, 来源?.platformCode) && 命中多选(筛选.store, 来源 ? JSON.stringify([来源.platformCode, 来源.storeId]) : undefined) && 命中时间范围(单.shippedAt, 筛选.dates, true)
}
export function 排序标发单(单据: 标发单[], 排序: { field: string; direction: 'asc' | 'desc' }) {
  if (!排序.field) return 单据
  return 排序列表(单据, 单 => 排序.field === 'no' ? 单.no : 读取排序时刻(单.shippedAt, true), 排序.direction, 单 => 单.no)
}
