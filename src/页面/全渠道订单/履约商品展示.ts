import type { 人工发货分配, 全渠道订单, 订单商品行 } from './类型'

export interface 履约商品展示行 {
  key: string
  orderNo: string
  externalLineId: string
  quantity: number | undefined
  item: 订单商品行 | undefined
}

export interface 履约商品展示 {
  rows: 履约商品展示行[]
  message?: string
}

/** 只按本次明确分配解析商品；不借整单商品、当前方案或其他履约补造历史组成。 */
export function 读取分配商品(
  分配: readonly 人工发货分配[] | undefined,
  当前订单: 全渠道订单,
  订单集合: readonly 全渠道订单[],
): 履约商品展示 {
  if (!分配?.length) return { rows: [], message: '本次商品明细待核实' }

  const rows = 分配.map((行, 索引): 履约商品展示行 => {
    // 当前详情对象是本单来源；共享会话中的同号旧引用不能覆盖它。
    const 来源候选 = 行.orderNo === 当前订单.systemOrderNo
      ? [当前订单]
      : 订单集合.filter(订单 => 订单.systemOrderNo === 行.orderNo)
    const 来源 = 行.orderNo.trim() && 来源候选.length === 1 ? 来源候选[0] : undefined
    const 商品候选 = 行.externalLineId.trim()
      ? 来源?.items.filter(商品 => 商品.externalLineId === 行.externalLineId) ?? []
      : []
    const 商品 = 商品候选.length === 1 ? 商品候选[0] : undefined
    return {
      key: JSON.stringify([行.orderNo, 行.externalLineId, 索引]),
      orderNo: 行.orderNo,
      externalLineId: 行.externalLineId,
      quantity: Number.isSafeInteger(行.quantity) && 行.quantity > 0 ? 行.quantity : undefined,
      // 返回展示副本，调用方更新展示数据也不能改写来源商品。
      item: 商品 ? JSON.parse(JSON.stringify(商品)) as 订单商品行 : undefined,
    }
  })
  return {
    rows,
    ...(rows.some(行 => !行.item || 行.quantity === undefined) ? { message: '部分商品资料或数量待核实' } : {}),
  }
}
