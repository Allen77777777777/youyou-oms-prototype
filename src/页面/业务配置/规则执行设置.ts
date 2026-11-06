import { readonly, ref } from 'vue'

export interface 审单执行设置 {
  enabled: boolean
  intervalHours: number
  dailyRetryLimit: number
  retryDays: number
}

const 已保存设置 = ref<审单执行设置>({ enabled: false, intervalHours: 2, dailyRetryLimit: 3, retryDays: 3 })
export const 共享审单执行设置 = readonly(已保存设置)

// 旧调用只调整启停与扫描间隔时，保留已有重跑限制；页面始终提交完整设置。
export function 保存审单执行设置(settings: Pick<审单执行设置, 'enabled' | 'intervalHours'> & Partial<Pick<审单执行设置, 'dailyRetryLimit' | 'retryDays'>>) {
  const { enabled, intervalHours } = settings
  const dailyRetryLimit = settings.dailyRetryLimit ?? 已保存设置.value.dailyRetryLimit
  const retryDays = settings.retryDays ?? 已保存设置.value.retryDays
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) {
    return '执行间隔须为 1 至 24 之间的整小时数'
  }
  if (!Number.isInteger(dailyRetryLimit) || dailyRetryLimit < 1 || dailyRetryLimit > 24) {
    return '每单每日最多重跑次数须为 1 至 24 之间的整数'
  }
  if (!Number.isInteger(retryDays) || retryDays < 1 || retryDays > 30) {
    return '最长重跑天数须为 1 至 30 之间的整数'
  }
  if (enabled !== 已保存设置.value.enabled || intervalHours !== 已保存设置.value.intervalHours
    || dailyRetryLimit !== 已保存设置.value.dailyRetryLimit || retryDays !== 已保存设置.value.retryDays) {
    已保存设置.value = { enabled, intervalHours, dailyRetryLimit, retryDays }
  }
  return ''
}
