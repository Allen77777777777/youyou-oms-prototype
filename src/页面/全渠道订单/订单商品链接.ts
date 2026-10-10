import { eBay订单模拟数据 } from '../eBay订单/模拟数据'
import { 生成eBay商品链接, type eBay商品链接结果 } from '../eBay订单/商品链接规则'
import type { 全渠道订单, 订单商品行 } from './类型'

/** 专业字段留在 eBay 对象中；此处只读取当前标准商品行的外链上下文。 */
export function 获取订单商品链接(订单: 全渠道订单, 商品: 订单商品行): eBay商品链接结果 {
  if (订单.platformCode !== 'eBay') return {}

  const 引用 = 订单.professionalOrder
  const 专业订单 = 引用?.sellerId && 引用.orderId
    ? eBay订单模拟数据.filter(单 => 单.sellerId === 引用.sellerId && 单.orderId === 引用.orderId)
    : []
  const 专业商品 = 专业订单.length === 1 && 商品.externalLineId?.trim() && 商品.platformItemId?.trim()
    ? 专业订单[0]!.items.filter(行 => 行.lineItemId === 商品.externalLineId && 行.itemId.trim() === 商品.platformItemId!.trim())
    : []
  const 当前行 = 专业商品.length === 1 ? 专业商品[0] : undefined

  return 生成eBay商品链接({
    title: 商品.platformItemTitle,
    itemId: 商品.platformItemId,
    listingMarketplaceId: 当前行?.listingMarketplaceId,
    variationId: 当前行?.variationId,
  })
}
