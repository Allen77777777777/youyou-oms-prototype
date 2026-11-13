import type { 全渠道订单, 订单路由, 脱敏收件信息 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 规则类型 } from './规则逻辑'

function 完整渠道身份(channel: 渠道配置): boolean {
  return [channel.providerId, channel.accountId, channel.warehouseId, channel.id].every(value => typeof value === 'string' && !!value && value === value.trim())
}

/** 规则选择同时固化渠道ID及其服务商、账号、仓库归属；不使用渠道名称或代码。 */
export function 物流渠道条件键(channel: Pick<渠道配置, 'providerId' | 'accountId' | 'warehouseId' | 'id'>): string {
  return JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId, channel.id])
}

/** 停用和仓配分离不抹去既有身份，条件选项不赋予渠道发货资格。 */
export function 创建物流渠道选项(channels: readonly 渠道配置[]): { value: string; label: string }[] {
  const counts = new Map<string, number>()
  for (const channel of channels) counts.set(channel.id, (counts.get(channel.id) ?? 0) + 1)
  return channels.filter(channel => 完整渠道身份(channel) && counts.get(channel.id) === 1).map(channel => ({
    value: 物流渠道条件键(channel),
    label: `${channel.name?.trim() || channel.id} · ${channel.warehouse?.trim() || channel.warehouseId} · ${channel.provider?.trim() || channel.providerId} · ${channel.account?.trim() || channel.accountId}`,
  }))
}

export interface 收件路由身份 { warehouseKey: string; channelKey: string }
export interface 收件信息匹配上下文 { originalAddress: 脱敏收件信息; route?: 订单路由 }

/**
 * 收件规则只读取显式传入的本次候选/目标路由，不借订单默认仓或其他履约路线兜底。
 * 路由仅有shippingChannelId稳定ID，归属从唯一渠道字典反查，不从展示名猜身份。
 */
export function 读取收件路由身份(route: Pick<订单路由, 'shippingChannelId'> | undefined, channels: readonly 渠道配置[]): 收件路由身份 | undefined {
  const id = route?.shippingChannelId
  if (typeof id !== 'string' || !id || id !== id.trim()) return undefined
  const matched = channels.filter(channel => channel.id === id)
  if (matched.length !== 1 || !完整渠道身份(matched[0]!)) return undefined
  const channel = matched[0]!
  return { warehouseKey: JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId]), channelKey: 物流渠道条件键(channel) }
}

export function 读取物流渠道来源(_order: 全渠道订单, type: 规则类型, channels: readonly 渠道配置[], context?: 收件信息匹配上下文): string[] | undefined {
  if (type !== '收件信息规则') return undefined
  const identity = 读取收件路由身份(context?.route, channels)
  return identity ? [identity.channelKey] : undefined
}
