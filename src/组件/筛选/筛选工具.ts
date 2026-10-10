import { 解析来源时刻 } from '@/页面/订单处理/时间展示工具'

export type 搜索模式 = 'contains' | 'exact'
export type 搜索值类型 = 'identifier' | 'text'
export type 排序方向 = 'asc' | 'desc'
export interface 搜索字段 { value: string; label: string; kind?: 搜索值类型 }
export interface 排序字段 { value: string; label: string; kind?: 'time' | 'number' | 'text' }
export interface 列表排序条件 { field: string; direction: 排序方向 }
export const 多行搜索上限 = 1000

/** 空集合不限制；标量兼容既有查询契约。 */
export function 命中多选(选项: string | string[], 原值: string | undefined): boolean {
  const 值 = Array.isArray(选项) ? 选项 : 选项 ? [选项] : []
  return !值.length || (原值 !== undefined && 值.includes(原值))
}
export function 解析搜索值(关键词: string, 类型: 搜索值类型 = 'identifier'): string[] {
  const 值 = 关键词.split(类型 === 'text' ? /[,，;；\r\n]+/u : /[,，;；\s]+/u).map(项 => 项.trim()).filter(Boolean)
  const 结果 = new Map<string, string>()
  for (const 项 of 值) {
    const 键 = 类型 === 'text' ? 项.toLocaleLowerCase() : 项
    if (!结果.has(键)) 结果.set(键, 项)
  }
  return [...结果.values()]
}
export function 校验字段搜索(关键词: string, 模式: 搜索模式, 类型: 搜索值类型 = 'identifier'): string | undefined {
  if (!['contains', 'exact'].includes(模式)) return '请选择模糊或精确匹配'
  if (模式 === 'contains') return undefined
  const 值 = 解析搜索值(关键词, 类型)
  if (值.length > 多行搜索上限) return `已输入 ${值.length} 个不同搜索值，最多支持 ${多行搜索上限} 项，请减少后再搜索`
  if (关键词.trim() && !值.length) return '请输入有效的精确搜索值'
  return undefined
}
export function 命中字段搜索(候选: string | undefined | string[], 关键词: string, 模式: 搜索模式, 类型: 搜索值类型 = 'identifier'): boolean {
  if (校验字段搜索(关键词, 模式, 类型)) return false
  if (!关键词.trim()) return true
  const 候选值 = Array.isArray(候选) ? 候选 : 候选 === undefined ? [] : [候选]
  if (模式 === 'contains') return 候选值.some(值 => 值.toLocaleLowerCase().includes(关键词.trim().toLocaleLowerCase()))
  const 搜索值 = new Set(解析搜索值(关键词, 类型).map(值 => 类型 === 'text' ? 值.toLocaleLowerCase() : 值))
  return 候选值.some(值 => 搜索值.has(类型 === 'text' ? 值.toLocaleLowerCase() : 值))
}
/** 允许墙钟仅用于来源时区已明确的既有本地样例，不据此猜测外部时间。 */
export function 读取排序时刻(来源: string | undefined, 允许墙钟 = false): number | undefined {
  if (!来源) return undefined
  const 原值 = 解析来源时刻(来源)
  if (原值 !== undefined || !允许墙钟) return 原值
  const 墙钟 = 来源.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?$/)
  return 墙钟 ? 解析来源时刻(`${墙钟[1]}T${墙钟[2] ?? '00:00'}:${墙钟[3] ?? '00'}+08:00`) : undefined
}
function 查询时间边界(来源: string, 结束 = false): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(来源)) return undefined
  const 值 = 读取排序时刻(来源, true)
  return 值 === undefined ? undefined : 值 + (结束 ? 来源.length === 10 ? 86_400_000 : 1000 : 0)
}
export function 校验时间范围(范围: null | string[]): string | undefined {
  if (范围 === null || 范围.length === 0) return undefined
  if (范围.length !== 2 || !范围[0] || !范围[1]) return '请选择完整的起止时间'
  const 开始 = 查询时间边界(范围[0]), 结束 = 查询时间边界(范围[1], true)
  if (开始 === undefined || 结束 === undefined) return '时间无效，请选择有效的起止时间'
  if (开始 >= 结束) return '开始时间不能晚于结束时间'
  return undefined
}
export function 命中时间范围(来源: string | undefined, 范围: null | string[], 允许墙钟 = false): boolean {
  if (校验时间范围(范围)) return false
  if (!范围?.length) return true
  const 时刻 = 读取排序时刻(来源, 允许墙钟)
  return 时刻 !== undefined && 时刻 >= 查询时间边界(范围[0]!)! && 时刻 < 查询时间边界(范围[1]!, true)!
}
export function 排序列表<T>(行: T[], 取值: (行: T) => string | number | null | undefined, 方向: 排序方向, 取键: (行: T) => string): T[] {
  const 空值 = (值: string | number | null | undefined) => 值 === undefined || 值 === null || 值 === '' || (typeof 值 === 'number' && !Number.isFinite(值))
  return 行.map(row => ({ row, value: 取值(row) })).sort((甲, 乙) => {
    if (空值(甲.value) && !空值(乙.value)) return 1
    if (!空值(甲.value) && 空值(乙.value)) return -1
    let 比较 = 0
    if (!空值(甲.value) && !空值(乙.value)) 比较 = typeof 甲.value === 'number' && typeof 乙.value === 'number' ? 甲.value - 乙.value : String(甲.value).localeCompare(String(乙.value), 'zh-CN', { numeric: true })
    return 比较 ? 比较 * (方向 === 'asc' ? 1 : -1) : 取键(甲.row).localeCompare(取键(乙.row))
  }).map(项 => 项.row)
}

export const 中文快捷日期名称 = ['今天', '昨天', '最近7天', '最近30天', '最近90天', '本月', '上月', '最近2月', '本年', '去年']
export function 中文快捷日期范围(类型: string, 时区 = 'Asia/Shanghai', 当前时刻 = new Date()): [Date, Date] {
  const 部分 = new Intl.DateTimeFormat('en-CA', { timeZone: 时区, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(当前时刻)
  const 取 = (类型: Intl.DateTimeFormatPartTypes) => Number(部分.find(项 => 项.type === 类型)?.value)
  const 年 = 取('year'), 月 = 取('month'), 日 = 取('day')
  const 今天 = new Date(Date.UTC(年, 月 - 1, 日))
  let 开始 = new Date(今天), 结束 = new Date(今天)
  if (类型 === '昨天') { 开始.setUTCDate(日 - 1); 结束 = new Date(开始) }
  else if (/^最近\d+天$/.test(类型)) 开始.setUTCDate(日 - Number(类型.match(/\d+/)![0]) + 1)
  else if (类型 === '本月') 开始.setUTCDate(1)
  else if (类型 === '上月') { 开始 = new Date(Date.UTC(年, 月 - 2, 1)); 结束 = new Date(Date.UTC(年, 月 - 1, 0)) }
  else if (类型 === '最近2月') 开始 = new Date(Date.UTC(年, 月 - 2, 1))
  else if (类型 === '本年') 开始 = new Date(Date.UTC(年, 0, 1))
  else if (类型 === '去年') { 开始 = new Date(Date.UTC(年 - 1, 0, 1)); 结束 = new Date(Date.UTC(年 - 1, 11, 31)) }
  const 控件日期 = (值: Date, 末尾: boolean) => new Date(值.getUTCFullYear(), 值.getUTCMonth(), 值.getUTCDate(), 末尾 ? 23 : 0, 末尾 ? 59 : 0, 末尾 ? 59 : 0)
  return [控件日期(开始, false), 控件日期(结束, true)]
}
