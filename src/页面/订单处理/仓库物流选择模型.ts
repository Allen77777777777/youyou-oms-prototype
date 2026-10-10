import type { 订单路由 } from '../全渠道订单/类型'

// 既有订单路由样例未接入主数据ID；只在原型内使用完整来源元组，不按仓名拼接账号。
export function 路由仓库键(route: 订单路由): string {
  return JSON.stringify([route.warehouseProvider, route.warehouseAccount, route.warehouse])
}

export function 查找所选仓库物流(routes: readonly 订单路由[], warehouse: string, channel: string): 订单路由 | undefined {
  const matches = routes.filter(route => 路由仓库键(route) === warehouse && route.shippingChannelCode === channel)
  return matches.length === 1 ? matches[0] : undefined
}
