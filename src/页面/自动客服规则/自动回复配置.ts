export interface AutoReplyWeeklyPeriod {
  day: number
  enabled: boolean
  allDay: boolean
  start: string
  end: string
}
export interface AutoReplySpecificPeriod { id: string; start: string; end: string }
export interface AutoReplyConfig {
  shopIds: string[]
  /** 旧单店铺配置只用于读取／迁移，新保存移除此字段。 */
  shopId?: string
  timeZone: string
  weeklyEnabled: boolean
  weekly: AutoReplyWeeklyPeriod[]
  specificEnabled: boolean
  specificPeriods: AutoReplySpecificPeriod[]
}

export const autoReplyWeekdays = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
  { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 7, label: '周日' },
]
/** 保存 IANA 时区身份；不使用固定偏移代替有夏令时的地区。 */
export const autoReplyTimeZones = [
  { value: 'Asia/Shanghai', label: '北京时间（Asia/Shanghai）' },
  { value: 'UTC', label: '协调世界时（UTC）' },
  { value: 'America/Los_Angeles', label: '美国洛杉矶（America/Los_Angeles）' },
  { value: 'America/New_York', label: '美国纽约（America/New_York）' },
  { value: 'Europe/London', label: '英国伦敦（Europe/London）' },
  { value: 'Europe/Berlin', label: '德国柏林（Europe/Berlin）' },
]
export function defaultAutoReplyConfig(): AutoReplyConfig {
  return {
    shopIds: [], timeZone: 'Asia/Shanghai', weeklyEnabled: true,
    weekly: autoReplyWeekdays.map(day => ({ day: day.value, enabled: day.value >= 6, allDay: day.value >= 6, start: '18:00', end: '09:00' })),
    specificEnabled: false, specificPeriods: [],
  }
}
/** 数组一旦存在就作为唯一来源；保留非法值供校验，不截断或去重。 */
export function autoReplyShopIds(config: AutoReplyConfig | undefined): string[] {
  if (!config) return []
  if (Object.prototype.hasOwnProperty.call(config, 'shopIds')) return Array.isArray(config.shopIds) ? [...config.shopIds] : []
  return typeof config.shopId === 'string' && config.shopId ? [config.shopId] : []
}
/** 对已打开草稿及旧配置做一次无损迁移，不替换时间、模板等其他配置。 */
export function normalizeAutoReplyShops(config: AutoReplyConfig | undefined): void {
  if (!config) return
  if (!Object.prototype.hasOwnProperty.call(config, 'shopIds')) config.shopIds = autoReplyShopIds(config)
  delete config.shopId
}
const validTime = (time: unknown): time is string => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
/** 特定时段为所选时区的墙上时间，此处只校验日历，不使用运行机器的本地时区。 */
function validDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
}
export function weeklyPeriodSummary(period: AutoReplyWeeklyPeriod): string {
  const day = autoReplyWeekdays.find(item => item.value === period.day)?.label ?? '未知星期'
  return `${day} ${period.allDay ? '全天休息' : `${period.start}～${period.end < period.start ? '次日 ' : ''}${period.end}`}`
}
export function autoReplyScheduleSummary(config: AutoReplyConfig | undefined): string[] {
  if (!config) return ['休息时段未配置']
  const result: string[] = []
  if (config.weeklyEnabled) result.push(`每周：${config.weekly.filter(item => item.enabled).map(weeklyPeriodSummary).join('；') || '未选择休息日'}`)
  if (config.specificEnabled) result.push(...(config.specificPeriods.length ? config.specificPeriods.map(item => `特定：${item.start} ～ ${item.end}`) : ['特定：未配置']))
  return result.length ? result : ['休息时段未配置']
}
export function validateAutoReplyConfig(config: AutoReplyConfig | undefined): string | undefined {
  if (!config || typeof config !== 'object') return '请配置自动回复的店铺与休息时段'
  if (Object.prototype.hasOwnProperty.call(config, 'shopIds') && !Array.isArray(config.shopIds)) return '店铺账号配置无效，请重新选择'
  const shops = autoReplyShopIds(config)
  if (!shops.length) return '请选择店铺账号'
  if (shops.some(shopId => typeof shopId !== 'string' || !shopId.trim() || shopId !== shopId.trim())) return '店铺账号配置无效，请重新选择'
  if (new Set(shops).size !== shops.length) return '店铺账号不能重复选择'
  if (!autoReplyTimeZones.some(item => item.value === config.timeZone)) return '请选择有效时区'
  if (typeof config.weeklyEnabled !== 'boolean' || typeof config.specificEnabled !== 'boolean') return '休息时段开关无效'
  if (!config.weeklyEnabled && !config.specificEnabled) return '请至少设置每周休息时段或特定时间段'
  if (config.weeklyEnabled) {
    if (!Array.isArray(config.weekly) || config.weekly.length !== 7 || new Set(config.weekly.map(item => item?.day)).size !== 7 || config.weekly.some(item => !item || !autoReplyWeekdays.some(day => day.value === item.day) || typeof item.enabled !== 'boolean' || typeof item.allDay !== 'boolean')) return '每周休息时段须完整配置周一至周日'
    const periods = config.weekly.filter(item => item.enabled)
    if (!periods.length) return '请选择每周休息日'
    for (const period of periods) {
      if (period.allDay) continue
      if (!validTime(period.start) || !validTime(period.end)) return '请填写有效的每周休息起止时间'
      if (period.start === period.end) return '休息起止时间不能相同，全天休息请勾选“全天”'
    }
  }
  if (config.specificEnabled) {
    if (!Array.isArray(config.specificPeriods) || !config.specificPeriods.length) return '请至少添加一个特定时间段'
    if (config.specificPeriods.some(item => !item || typeof item.id !== 'string' || !item.id) || new Set(config.specificPeriods.map(item => item.id)).size !== config.specificPeriods.length) return '特定时间段标识无效，请删除后重新添加'
    for (const period of config.specificPeriods) {
      if (!validDateTime(period.start) || !validDateTime(period.end)) return '请填写有效的特定时间段起止日期与时间'
      if (period.start >= period.end) return '特定时间段的结束时间必须晚于开始时间'
    }
  }
}
