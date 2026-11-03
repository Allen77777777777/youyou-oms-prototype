import type { 全渠道订单, 履约单摘要, 订单商品行, 金额 } from '../全渠道订单/类型'

export interface 拆分包裹商品投影行 {
  item: 订单商品行
  quantity: number | null
  actualReceived?: 金额
  reason?: string
}
export interface 拆分包裹商品投影 {
  items: 拆分包裹商品投影行[]
  quantity: number | null
  reason?: string
}

const 十进制精度 = 100000000n
const 未核实 = (reason: string): 拆分包裹商品投影 => ({ items: [], quantity: null, reason })
const 正整数 = (值: number) => Number.isSafeInteger(值) && 值 > 0
const 商品克隆 = (商品: 订单商品行): 订单商品行 => JSON.parse(JSON.stringify(商品)) as 订单商品行

/** 最多八位小数，拒绝科学计数、非数字或更高精度，不经过 Number。 */
function 读取金额原子(值: string): bigint | undefined {
  if (typeof 值 !== 'string') return undefined
  const 匹配 = /^([+-]?)(\d+)(?:\.(\d{1,8}))?$/.exec(值.trim())
  if (!匹配) return undefined
  const 绝对值 = BigInt(匹配[2]!) * 十进制精度 + BigInt((匹配[3] ?? '').padEnd(8, '0'))
  return 匹配[1] === '-' ? -绝对值 : 绝对值
}

function 正数四舍五入(分子: bigint, 分母: bigint): bigint {
  return (分子 * 2n + 分母) / (分母 * 2n)
}

function 分值文本(分值: bigint): string {
  const 负号 = 分值 < 0n ? '-' : ''
  const 绝对值 = 分值 < 0n ? -分值 : 分值
  return `${负号}${绝对值 / 100n}.${String(绝对值 % 100n).padStart(2, '0')}`
}

export function 格式化包裹金额(money?: 金额): string {
  if (!money || typeof money.currency !== 'string' || !money.currency.trim()) return '—'
  const 原子 = 读取金额原子(money.value)
  if (原子 === undefined) return '—'
  const 绝对值 = 原子 < 0n ? -原子 : 原子
  const 分值 = 正数四舍五入(绝对值 * 100n, 十进制精度) * (原子 < 0n ? -1n : 1n)
  const 文本 = 分值文本(分值)
  const [整数, 小数] = 文本.split('.')
  return `${money.currency} ${整数!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${小数}`
}

function 分配身份(履约: 履约单摘要): string {
  return JSON.stringify((履约.items ?? []).map(行 => [行.orderNo, 行.externalLineId, 行.quantity]).sort((甲, 乙) => JSON.stringify(甲).localeCompare(JSON.stringify(乙))))
}

/** 按原下单量分摊对应数量份额；最大余数分配显示分值，尾差按稳定履约号逆序处理。 */
function 分摊实收(商品: 订单商品行, 同行分配: Array<{ no: string; quantity: number }>): Map<string, 金额> | undefined {
  const 原金额 = 商品.actualReceived
  if (!原金额 || typeof 原金额.currency !== 'string' || !原金额.currency.trim()) return undefined
  const 原子 = 读取金额原子(原金额.value)
  if (原子 === undefined) return undefined
  const 绝对值 = 原子 < 0n ? -原子 : 原子
  const 分母 = 十进制精度 * BigInt(商品.orderedQuantity)
  const 分配 = 同行分配.map(行 => {
    const 分子 = 绝对值 * BigInt(行.quantity) * 100n
    return { ...行, 分值: 分子 / 分母, 余数: 分子 % 分母 }
  })
  const 总量 = 同行分配.reduce((总, 行) => 总 + BigInt(行.quantity), 0n)
  const 目标分值 = 正数四舍五入(绝对值 * 总量 * 100n, 分母)
  const 尾差 = 目标分值 - 分配.reduce((总, 行) => 总 + 行.分值, 0n)
  const 优先次序 = [...分配].sort((甲, 乙) => 甲.余数 === 乙.余数 ? 甲.no === 乙.no ? 0 : 甲.no > 乙.no ? -1 : 1 : 甲.余数 > 乙.余数 ? -1 : 1)
  for (let 索引 = 0; 索引 < 优先次序.length && BigInt(索引) < 尾差; 索引++) 优先次序[索引]!.分值 += 1n
  return new Map(分配.map(行 => [行.no, { currency: 原金额.currency, value: 分值文本(行.分值 * (原子 < 0n ? -1n : 1n)) }]))
}

/** 只读的商品区展示投影。无可信分包事实时返回待核实，不以整单商品或金额兜底。 */
export function 读取拆分包裹商品投影(order: 全渠道订单, fulfillment: 履约单摘要): 拆分包裹商品投影 {
  const 方案 = order.manualShippingPlan
  if (!方案 || 方案.kind !== '拆分发货' || !方案.id.trim() || 方案.orderNos.length !== 1 || 方案.orderNos[0] !== order.systemOrderNo) return 未核实('拆分发货安排的来源身份待核实')
  const 目标候选 = order.fulfillmentOrders.filter(行 => 行.fulfillmentOrderNo === fulfillment.fulfillmentOrderNo)
  if (目标候选.length !== 1) return 未核实('本包履约单的订单归属缺失或不唯一')
  const 目标 = 目标候选[0]!
  if (!目标.isActive || !fulfillment.isActive || 目标.manualPlanId !== 方案.id || fulfillment.manualPlanId !== 方案.id || 目标.plannedQuantity !== fulfillment.plannedQuantity || 分配身份(目标) !== 分配身份(fulfillment)) return 未核实('本包履约快照与拆分发货安排不一致')
  const 同组 = order.fulfillmentOrders.filter(行 => 行.isActive && 行.manualPlanId === 方案.id)
  if (同组.length < 2 || 同组.length !== 方案.packages.length || new Set(同组.map(行 => 行.fulfillmentOrderNo)).size !== 同组.length || 同组.some(行 => !行.fulfillmentOrderNo.trim() || order.fulfillmentOrders.filter(候选 => 候选.fulfillmentOrderNo === 行.fulfillmentOrderNo).length !== 1)) return 未核实('同组包裹履约身份重复、缺失或尚未核实')
  if (!order.items.length || new Set(order.items.map(行 => 行.externalLineId)).size !== order.items.length || order.items.some(行 => !行.externalLineId.trim() || !正整数(行.orderedQuantity) || !Number.isSafeInteger(行.fulfillableQuantity) || 行.fulfillableQuantity! < 0 || 行.fulfillableQuantity! > 行.orderedQuantity)) return 未核实('来源商品行或原下单、可发数量待核实')
  const 商品表 = new Map(order.items.map(行 => [行.externalLineId, 行]))
  const 分配表 = new Map<string, Array<{ no: string; quantity: number }>>()
  for (const 履约 of 同组) {
    if (!履约.items?.length || !正整数(履约.plannedQuantity)) return 未核实('同组包裹缺少可信的逐商品分配')
    const 包内 = new Set<string>()
    let 包数量 = 0
    for (const 行 of 履约.items) {
      if (行.orderNo !== order.systemOrderNo || !商品表.has(行.externalLineId) || 包内.has(行.externalLineId) || !正整数(行.quantity)) return 未核实('包裹商品来源重复、跨来源或分配数量不合法')
      包内.add(行.externalLineId)
      包数量 += 行.quantity
      if (!Number.isSafeInteger(包数量)) return 未核实('包裹商品数量超出可信范围')
      const 已有 = 分配表.get(行.externalLineId) ?? []
      已有.push({ no: 履约.fulfillmentOrderNo, quantity: 行.quantity })
      分配表.set(行.externalLineId, 已有)
    }
    if (包数量 !== 履约.plannedQuantity) return 未核实('包裹计划总量与逐商品分配不一致')
  }
  for (const 商品 of order.items) {
    const 总量 = (分配表.get(商品.externalLineId) ?? []).reduce((总, 行) => 总 + BigInt(行.quantity), 0n)
    if (总量 !== BigInt(商品.fulfillableQuantity!) || 总量 > BigInt(商品.orderedQuantity)) return 未核实('同组包裹商品分配缺失或超出来源可发数量')
  }
  const items: 拆分包裹商品投影行[] = 目标.items!.map(行 => {
    const 商品 = 商品表.get(行.externalLineId)!
    const 实收分配 = 分摊实收(商品, 分配表.get(行.externalLineId)!)
    return { item: 商品克隆(商品), quantity: 行.quantity, actualReceived: 实收分配?.get(目标.fulfillmentOrderNo), ...(!实收分配 ? { reason: 商品.actualReceived ? '来源商品实收金额或币种待核实' : '来源未提供商品实收金额' } : {}) }
  })
  return { items, quantity: 目标.plannedQuantity }
}
