import { readonly, ref } from 'vue'

export interface 审单执行设置 {
  enabled: boolean
  intervalHours: number
}

const 已保存设置 = ref<审单执行设置>({ enabled: false, intervalHours: 2 })
export const 共享审单执行设置 = readonly(已保存设置)

export function 保存审单执行设置(settings: 审单执行设置) {
  const { enabled, intervalHours } = settings
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 24) {
    return '执行间隔须为 1 至 24 之间的整小时数'
  }
  if (enabled !== 已保存设置.value.enabled || intervalHours !== 已保存设置.value.intervalHours) {
    已保存设置.value = { enabled, intervalHours }
  }
  return ''
}
