import { 格式化北京时间, 解析来源时刻 } from '@/页面/订单处理/时间展示工具'

export function buyerTime(value?: string): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 解析来源时刻(`${value}T00:00:00Z`) === undefined ? '时间待核实' : value
  }
  return 格式化北京时间(value)
}

export function buyerTimeValue(value?: string): number | undefined {
  // 日期仅用于日期级排序，不产生或显示一个虚构事件时刻。
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? 解析来源时刻(`${value}T00:00:00+08:00`) : 解析来源时刻(value)
}
