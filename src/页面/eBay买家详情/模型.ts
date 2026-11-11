import type { RouteLocationRaw } from 'vue-router'
import { 解析来源时刻 } from '../订单处理/时间展示工具'

export type BuyerCategory = 'orders' | 'messages' | 'afterSales' | 'reviews' | 'tickets'
export interface BuyerRecord {
  key: string
  category: BuyerCategory
  kind: string
  typeLabel: string
  shopId: string
  shopName: string
  buyerId: string
  number: string
  summary: string
  status: string
  occurredAt?: string
  updatedAt?: string
  dueAt?: string
  dueLabel?: string
  pending: boolean
  people?: { label: '处理人' | '当前应办方' | '创建人' | '留评人' | '工单负责人'; value: string }[]
  amount?: { value: string; currency: string }
  location: RouteLocationRaw | null
  relationLabel?: string
}
/** 来源已经核实的账户映射与可见店铺，不以同名字符串推导跨店身份。 */
export interface BuyerIdentity {
  shopId: string
  buyerId: string
  buyerKey: string
  shopIds: string[]
}
export interface BuyerProfile {
  found: boolean
  buyerId: string
  canonicalKey: string
  canonicalShopId: string
  canonicalBuyerId: string
  identityMode: 'verified' | 'shop-only'
  shops: Array<{ id: string; name: string }>
  records: BuyerRecord[]
  lastUpdatedAt?: string
  scopeText: string
  coverageText: string
  coverageIssues: Array<{ shopId: string; category: BuyerCategory; state: 'not_synced' | 'failed' | 'forbidden'; message: string }>
}

const pairKey = (shopId: string, buyerId: string) => JSON.stringify([shopId, buyerId])
const exactIdentity = (rows: BuyerIdentity[], shopId: string, buyerId: string) => {
  const matches = rows.filter(row => row.shopId === shopId && row.buyerId === buyerId && row.buyerKey.trim() && row.shopIds.includes(shopId))
  const first = matches[0]
  return first && new Set(matches.map(row => row.buyerKey)).size === 1
    ? { ...first, shopIds: first.shopIds.filter(id => matches.every(row => row.shopIds.includes(id))) } : undefined
}

/** 纯只读投影；调用方先完成模块权限裁剪。多条同源记录不累加，原对象办理状态不被修改。 */
export function buildBuyerProfile(rows: readonly BuyerRecord[], identities: BuyerIdentity[], shopId: string, buyerId: string): BuyerProfile {
  const local = rows.filter(row => row.shopId === shopId && row.buyerId === buyerId)
  const knownScopes = identities.filter(row => row.shopId === shopId && row.buyerId === buyerId)
  const found = Boolean(shopId.trim() && buyerId.trim() && local.length && knownScopes.every(row => row.shopIds.includes(shopId)))
  const identity = found ? exactIdentity(identities, shopId, buyerId) : undefined
  const members = identity ? identities.filter(row => row.buyerKey === identity.buyerKey && identity.shopIds.includes(row.shopId)
    && exactIdentity(identities, row.shopId, row.buyerId)?.buyerKey === identity.buyerKey) : []
  const allowedPairs = new Set(members.map(row => pairKey(row.shopId, row.buyerId)))
  // 当前店铺始终按精确平台买家标识；跨店只开放具有独立映射证据的账户。
  if (found) allowedPairs.add(pairKey(shopId, buyerId))
  const selected = rows.filter(row => found && allowedPairs.has(pairKey(row.shopId, row.buyerId)))
  const unique = [...new Map(selected.map(row => [row.key, row])).values()]
  const records = unique.sort((a, b) => (解析来源时刻(b.occurredAt) ?? -Infinity) - (解析来源时刻(a.occurredAt) ?? -Infinity) || a.key.localeCompare(b.key))
  const shops = [...new Map(records.map(row => [row.shopId, { id: row.shopId, name: row.shopName || row.shopId }])).values()].sort((a, b) => a.id.localeCompare(b.id))
  const canonical = identity ? members.filter(member => selected.some(row => row.shopId === member.shopId && row.buyerId === member.buyerId))
    .sort((a, b) => pairKey(a.shopId, a.buyerId).localeCompare(pairKey(b.shopId, b.buyerId)))[0] : undefined
  const dates = records.map(row => row.updatedAt).filter((value): value is string => Boolean(value && 解析来源时刻(value) !== undefined))
    .sort((a, b) => 解析来源时刻(b)! - 解析来源时刻(a)!)
  return {
    found, buyerId, canonicalKey: identity ? identity.buyerKey : pairKey(shopId, buyerId),
    canonicalShopId: canonical?.shopId ?? shopId, canonicalBuyerId: canonical?.buyerId ?? buyerId,
    identityMode: identity ? 'verified' : 'shop-only', shops, records, lastUpdatedAt: dates[0],
    scopeText: identity ? '当前账户有权查看且已确认属于同一买家的店铺' : '当前店铺；跨店买家身份尚未核实',
    coverageText: '仅展示本系统已同步并可查看的订单和客服记录；没有记录不代表该买家在 eBay 平台没有其他历史。',
    coverageIssues: [],
  }
}
