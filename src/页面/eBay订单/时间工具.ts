export type eBay时区模式 = 'beijing' | 'site'
import { 读取排序时刻 } from '@/组件/筛选/筛选工具'

// 原型站点配置；生产环境由站点主数据提供，同一国家不能推导唯一时区。
export const 站点时区: Record<string, string> = {
  EBAY_US: 'America/Los_Angeles', EBAY_MOTORS_US: 'America/Los_Angeles',
  EBAY_DE: 'Europe/Berlin', EBAY_GB: 'Europe/London',
  EBAY_AU: 'Australia/Sydney', EBAY_FR: 'Europe/Paris',
}

export function 获取显示时区(模式: eBay时区模式, 站点: string[]): string | undefined {
  if (模式 === 'beijing') return 'Asia/Shanghai'
  const 时区列表 = [...new Set(站点.map(项 => 站点时区[项]))]
  return 时区列表.length === 1 ? 时区列表[0] : undefined
}

function 解析时间(时间: string): Date | undefined {
  const 时刻 = 读取排序时刻(时间)
  return 时刻 === undefined ? undefined : new Date(时刻)
}

export function 转换eBay时间(时间: string | undefined, 时区: string | undefined): string {
  if (!时间) return '—'
  const 日期 = 解析时间(时间)
  if (!日期) return `${时间}（时间格式待核查）`
  if (!时区) return `${时间}（站点时区待配置）`
  const 部分 = new Intl.DateTimeFormat('en-CA', {
    timeZone: 时区, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
  }).formatToParts(日期)
  const 取 = (类型: Intl.DateTimeFormatPartTypes) => 部分.find(项 => 项.type === 类型)?.value ?? ''
  return `${取('year')}-${取('month')}-${取('day')} ${取('hour')}:${取('minute')}:${取('second')} ${取('timeZoneName').replace('GMT', 'UTC')}`
}

export function eBay查询日期(时间: string | undefined, 模式: eBay时区模式, 站点: string[]): string | undefined {
  if (!时间 || !解析时间(时间)) return undefined
  const 时区 = 获取显示时区(模式, 站点)
  if (!时区) return undefined
  return 转换eBay时间(时间, 时区).slice(0, 10)
}

export function eBay查询墙钟(时间: string | undefined, 模式: eBay时区模式, 站点: string[]): string | undefined {
  if (!时间 || !解析时间(时间)) return undefined
  const 时区 = 获取显示时区(模式, 站点)
  return 时区 ? 转换eBay时间(时间, 时区).slice(0, 19) : undefined
}
