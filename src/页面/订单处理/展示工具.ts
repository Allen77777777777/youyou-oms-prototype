/** 展示来源时间自带的 UTC 偏移；缺失时不推测服务器或用户时区。 */
export function 提取发货时区(来源时间?: string): string {
  if (!来源时间?.trim() || 来源时间.trim() === '—') return '平台未提供'
  return 来源时间.trim().match(/\bUTC(?:[+-]\d{1,2}(?::\d{2})?)?$/i)?.[0].toUpperCase() ?? '时区未提供'
}

/** 已有履约计划优先；订单行数量未核实时不能合计为零。 */
export function 展示计划数量(商品: { fulfillableQuantity?: number }[], 履约计划?: number): string {
  if (履约计划 !== undefined) return `计划 ${履约计划}`
  if (!商品.length || 商品.some((行) => 行.fulfillableQuantity === undefined)) return '计划待核实'
  return `计划 ${商品.reduce((合计, 行) => 合计 + 行.fulfillableQuantity!, 0)}`
}
