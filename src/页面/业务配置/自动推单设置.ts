import { readonly, ref } from 'vue'

export interface 自动推单设置 { enabled: boolean; intervalHours: number; weekdays: number[] }
export const 星期选项 = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'].map((label, i) => ({ label, value: i + 1 }))
const 已保存 = ref<自动推单设置>({ enabled: false, intervalHours: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] })
export const 共享自动推单设置 = readonly(已保存)

export function 保存自动推单设置(settings: 自动推单设置) {
  if (typeof settings.enabled !== 'boolean') return '请选择是否开启自动推单'
  if (!Number.isInteger(settings.intervalHours) || settings.intervalHours < 1 || settings.intervalHours > 24) return '执行频率须为 1 至 24 之间的整小时数'
  if (!settings.weekdays.length || settings.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) return '请至少选择一个有效执行日期'
  const value = { ...settings, weekdays: [...new Set(settings.weekdays)].sort((a, b) => a - b) }
  if (JSON.stringify(value) !== JSON.stringify(已保存.value)) 已保存.value = value
  return ''
}

export function 是推单执行日(weekdays: readonly number[], now: number) {
  const day = new Date(now + 8 * 3_600_000).getUTCDay() || 7
  return weekdays.includes(day)
}
