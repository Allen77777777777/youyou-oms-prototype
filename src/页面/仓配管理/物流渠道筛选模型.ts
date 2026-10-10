import { 命中多选, 命中字段搜索, 校验字段搜索, 命中时间范围, 校验时间范围 } from '@/组件/筛选/筛选工具'
import type { 渠道配置 } from './物流渠道配置'

export interface 渠道筛选条件 {
  keyword: string
  keywordType: 'name' | 'code'
  searchMatch: 'contains' | 'exact'
  accountId: string[]
  state: string[]
  country: string[]
  dates: null | string[]
}
export interface 渠道导航范围 { provider?: string; warehouseId?: string }
export function 默认渠道筛选(): 渠道筛选条件 {
  return { keyword: '', keywordType: 'name', searchMatch: 'contains', accountId: [], state: [], country: [], dates: null }
}
export function 校验渠道筛选(f: 渠道筛选条件): string {
  return 校验字段搜索(f.keyword, f.searchMatch, f.keywordType === 'name' ? 'text' : 'identifier') ?? 校验时间范围(f.dates) ?? ''
}
/** 只按导航与已应用账号范围取同步来源，不使用查询结果或勾选反推账号。 */
export function 读取渠道同步范围(rows: 渠道配置[], navigation: 渠道导航范围, accountIds: string[]): 渠道配置[] {
  return rows.filter(row => (!navigation.provider || row.provider === navigation.provider) && (!navigation.warehouseId || row.warehouseId === navigation.warehouseId) && 命中多选(accountIds, row.accountId))
}
export function 查询物流渠道(rows: 渠道配置[], f: 渠道筛选条件, navigation: 渠道导航范围): 渠道配置[] {
  if (校验渠道筛选(f)) return []
  return 读取渠道同步范围(rows, navigation, f.accountId).filter(row =>
    命中字段搜索(row[f.keywordType], f.keyword, f.searchMatch, f.keywordType === 'name' ? 'text' : 'identifier')
    && 命中多选(f.state, row.enabled ? '启用' : '停用')
    && (!f.country.length || f.country.some(country => country === 'unknown' ? !row.countries.length : row.countries.includes(country)))
    // 既有虚构数据时间已标明 UTC+8；允许读取该墙钟格式，不猜测外部来源时区。
    && 命中时间范围(row.updatedAt, f.dates, true))
}
