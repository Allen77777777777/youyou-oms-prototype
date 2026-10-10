import { 命中多选, 命中字段搜索, 校验字段搜索, 命中时间范围, 校验时间范围, 排序列表, 读取排序时刻 } from '@/组件/筛选/筛选工具'
import type { 仓配单据 } from './仓配模型'

export const 仓配搜索字段 = [
  { value: 'no', label: '业务单号' }, { value: 'fulfillment', label: '履约单号' },
  { value: 'order', label: '系统订单号' }, { value: 'externalNo', label: '外部单号' },
  { value: 'tracking', label: '跟踪号' }, { value: 'sku', label: '系统 SKU' },
]
export interface 仓配筛选条件 {
  keyword: string; searchType: string; searchMatch: 'contains' | 'exact'
  provider: string[]; review: string[]; dates: null | string[]
}
export function 默认仓配筛选(): 仓配筛选条件 { return { keyword: '', searchType: 'no', searchMatch: 'contains', provider: [], review: [], dates: null } }
export function 校验仓配筛选(筛选: 仓配筛选条件) { return 校验字段搜索(筛选.keyword, 筛选.searchMatch, 'identifier') || 校验时间范围(筛选.dates) }
export function 命中仓配筛选(单: 仓配单据, 筛选: 仓配筛选条件): boolean {
  const 字段 = 仓配搜索字段.some(项 => 项.value === 筛选.searchType) ? 筛选.searchType as 'no' | 'fulfillment' | 'order' | 'externalNo' | 'tracking' | 'sku' : 'no'
  return 命中字段搜索(单[字段], 筛选.keyword, 筛选.searchMatch)
    && 命中多选(筛选.provider, 单.provider)
    && (!筛选.review.length || 筛选.review.some(项 => 项 === '待核查' ? 单.awaitingCheck : 项 === '执行中' ? ['下单中', '取消中', '待出库'].includes(单.status) : 项 === '明确失败' && !单.awaitingCheck && 单.reason !== ''))
    && 命中时间范围(单.createdAt, 筛选.dates, true)
}
export function 排序仓配单据(单据: 仓配单据[], 排序: { field: string; direction: 'asc' | 'desc' }) {
  if (!排序.field) return 单据
  return 排序列表(单据, 单 => 读取排序时刻(排序.field === 'updatedAt' ? 单.updatedAt : 单.createdAt, true), 排序.direction, 单 => 单.id)
}
