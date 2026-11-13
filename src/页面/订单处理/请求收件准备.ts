import type { 全渠道订单, 订单路由, 脱敏收件信息 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 订单规则 } from '../订单规则/规则逻辑'
import { 准备收件信息请求 } from '../订单规则/收件信息执行'

type 单来源请求准备 = ReturnType<typeof 准备收件信息请求>
type 收件请求场景 = Parameters<typeof 准备收件信息请求>[0]['trigger']
export interface 包裹收件请求准备 {
  requestId: string
  trigger: 收件请求场景
  blocked: boolean
  reason: string
  address?: 脱敏收件信息
  sources: Array<{ orderNo: string; prepared: 单来源请求准备 }>
}
export interface 包裹收件请求输入 {
  requestId: string
  trigger: 收件请求场景
  orders: readonly 全渠道订单[]
  route?: 订单路由
  rules: 订单规则[]
  channels: readonly 渠道配置[]
  processedAt?: string
}
function 稳定地址(address: 脱敏收件信息): string {
  return JSON.stringify(Object.entries(address).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
}

/** 请求适配前的纯准备；全部来源各自匹配，不能以代表订单覆盖其他来源的条件。 */
export function 准备包裹收件请求(input: 包裹收件请求输入): 包裹收件请求准备 {
  const base = { requestId: input.requestId, trigger: input.trigger, blocked: true, reason: '', sources: [] as 包裹收件请求准备['sources'] }
  if (!input.orders.length || new Set(input.orders.map(order => order.systemOrderNo)).size !== input.orders.length) {
    return { ...base, reason: '本次请求的全部来源订单缺失或重复，请先核实' }
  }
  const sources = input.orders.map(order => ({ orderNo: order.systemOrderNo, prepared: 准备收件信息请求({
    requestId: input.requestId, trigger: input.trigger, order, originalAddress: order.address,
    route: input.route, rules: input.rules, channels: input.channels, processedAt: input.processedAt,
  }) }))
  const blocked = sources.filter(source => source.prepared.blocked)
  if (blocked.length) return { ...base, sources, reason: blocked.map(source => `${source.orderNo}：${source.prepared.record.reason}`).join('；') }
  const addresses = new Set(sources.map(source => 稳定地址(source.prepared.address)))
  if (addresses.size !== 1) return { ...base, sources, reason: '全部来源订单经各自规则处理后的完整收件资料不一致，请先核实本包裹收件信息' }
  return { ...base, sources, blocked: false, address: JSON.parse(JSON.stringify(sources[0]!.prepared.address)) as 脱敏收件信息 }
}

/** 仅已通过本次请求门禁的提交命令调用；纯预览、失败预检及查询均不写入。 */
export function 保存包裹收件请求(orders: readonly 全渠道订单[], prepared: 包裹收件请求准备): void {
  if (prepared.blocked || !prepared.address) return
  for (const source of prepared.sources) {
    const order = orders.find(item => item.systemOrderNo === source.orderNo)
    if (!order) continue
    order.recipientRequestRecords ??= []
    if (!order.recipientRequestRecords.some(record => record.requestId === prepared.requestId)) {
      order.recipientRequestRecords.push(JSON.parse(JSON.stringify(source.prepared.record)))
    }
  }
}

/** 同一业务单明确未生效后重提生成新请求；旧请求记录不覆盖。 */
export function 创建包裹收件请求标识(businessNo: string, orders: readonly 全渠道订单[]): string {
  const prefix = `${JSON.stringify(businessNo)}:`
  const count = Math.max(0, ...orders.map(order => (order.recipientRequestRecords ?? []).filter(record => record.requestId.startsWith(prefix)).length))
  return `${prefix}${count + 1}`
}

/** 候选运费请求的适配准备契约；不调用 API、不产生报价、不写正式请求或订单记录。 */
export function 准备运费候选收件请求(input: Omit<包裹收件请求输入, 'trigger' | 'route'> & { candidates: readonly 订单路由[] }): 包裹收件请求准备[] {
  return input.candidates.map((route, index) => 准备包裹收件请求({ ...input, trigger: 'freight_quote',
    requestId: JSON.stringify([input.requestId, index, route.shippingChannelId]), route,
  }))
}

/** 多来源共有履约必须明确同一实际路由；不得回退订单头的默认路由。 */
export function 读取共同履约请求路由(orders: readonly 全渠道订单[], fulfillmentNo: string): 订单路由 | undefined {
  const routes = orders.map(order => order.fulfillmentOrders.find(item => item.fulfillmentOrderNo === fulfillmentNo)?.route)
  if (!routes.length || routes.some(route => !route?.shippingChannelId)) return undefined
  const keys = routes.map(route => JSON.stringify([route!.shippingChannelId, route!.warehouseProvider, route!.warehouseAccount, route!.warehouse, route!.shippingChannelCode, route!.labelMode]))
  return new Set(keys).size === 1 ? { ...routes[0]! } : undefined
}

/** 沿用当前推仓必填约束，校验处理后的实际载荷；门牌本身不设全局必填。 */
export function 校验推仓请求收件资料(address?: 脱敏收件信息): string {
  return !address?.fullName?.trim() || !address.countryCode?.trim() || !address.addressLine1?.trim()
    ? '处理后的收件人、国家或详细地址不满足推仓要求，请核实本次请求资料' : ''
}
