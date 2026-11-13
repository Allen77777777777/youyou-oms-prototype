import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单商品行, 订单路由 } from '../全渠道订单/类型'
import type { 订单规则 } from './规则逻辑'
import { 创建默认拆单动作, type 拆单动作配置, type 拆单计算资料, type 拆单候选路线, type 拆单商品资料 } from './拆单规则模型'

/** 全部为独立虚构评审资料，不是中台实时商品、库存或海外仓报价。 */
export const 拆单演示资料版本 = 'split-demo-2026-11-13-v2'
export const 拆单演示渠道 = ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'] as const
export const 拆单演示路由: 订单路由[] = [
  { warehouse: '万邑通美西仓', warehouseProvider: '万邑通', warehouseAccount: '万邑通 · 北美主体', shippingChannel: 'USPS Ground Advantage', shippingChannelCode: 'WYT-USPS-GA', shippingChannelId: 拆单演示渠道[0], labelMode: '仓配一体' },
  { warehouse: '谷仓美东仓', warehouseProvider: '谷仓', warehouseAccount: '谷仓 · 北美主体', shippingChannel: 'FedEx Home Delivery', shippingChannelCode: 'GC-FEDEX-HD', shippingChannelId: 拆单演示渠道[1], labelMode: '仓配一体' },
]
interface 商品样例 { sku: string; name: string; price: string; weight?: string; volume: string; size: [string, string, string]; attributes: string[] }
const 商品: 商品样例[] = [
  { sku: 'SPLIT-BASIC-BOX', name: '桌面收纳盒', price: '18.50', weight: '0.6', volume: '1800', size: ['20', '15', '6'], attributes: [] },
  { sku: 'SPLIT-BASIC-MAT', name: '防滑桌垫', price: '12.00', weight: '0.4', volume: '900', size: ['30', '15', '2'], attributes: [] },
  { sku: 'SPLIT-SELECT-CHAIR', name: '户外折叠椅', price: '78.00', weight: '8.5', volume: '42000', size: ['70', '40', '15'], attributes: [] },
  { sku: 'SPLIT-SELECT-TABLE', name: '便携折叠桌', price: '108.00', weight: '12', volume: '64000', size: ['80', '50', '16'], attributes: [] },
  { sku: 'SPLIT-CAP-LAMP', name: '充电露营灯', price: '28.00', weight: '1.2', volume: '2400', size: ['20', '12', '10'], attributes: ['带电'] },
  { sku: 'SPLIT-CAP-BOTTLE', name: '运动水壶', price: '16.00', weight: '0.8', volume: '1800', size: ['25', '9', '8'], attributes: [] },
  { sku: 'SPLIT-ROW-BASKET', name: '抽屉整理篮', price: '14.00', weight: '0.5', volume: '1500', size: ['25', '12', '5'], attributes: [] },
  { sku: 'SPLIT-ROW-HANGER', name: '壁挂收纳架', price: '22.00', weight: '0.9', volume: '3000', size: ['30', '20', '5'], attributes: [] },
  { sku: 'SPLIT-OVER-DUMBBELL', name: '固定重量哑铃', price: '45.00', weight: '12', volume: '2400', size: ['30', '10', '8'], attributes: [] },
  { sku: 'SPLIT-MISSING-TRAY', name: '便携托盘', price: '20.00', volume: '2800', size: ['28', '20', '5'], attributes: [] },
]
function 行(sku: string, quantity: number, line: number): 订单商品行 {
  const product = 商品.find(x => x.sku === sku)!
  const price = BigInt(product.price.replace('.', ''))
  const amount = price * BigInt(quantity)
  const total = `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`
  return { externalLineId: `SPLIT-LINE-${line}`, platformItemId: `DEMO-SPLIT-ITEM-${sku}`, platformSku: `EB-${sku}`, platformItemTitle: product.name,
    orderedQuantity: quantity, fulfillableQuantity: quantity, systemSku: sku, systemItemName: product.name, skuResolutionStatus: '成功', currencyCode: 'USD',
    unitPrice: { value: product.price, currency: 'USD' }, itemTotal: { value: total, currency: 'USD' }, actualReceived: { value: total, currency: 'USD' }, actualReceivedSource: 'PLATFORM' }
}
export function 创建拆单演示订单(): 全渠道订单[] {
  const cases = [
    [['SPLIT-BASIC-BOX', 2], ['SPLIT-BASIC-MAT', 3]],
    [['SPLIT-SELECT-CHAIR', 1], ['SPLIT-SELECT-TABLE', 1]],
    [['SPLIT-CAP-LAMP', 3], ['SPLIT-CAP-BOTTLE', 2]],
    [['SPLIT-ROW-BASKET', 1], ['SPLIT-ROW-BASKET', 2], ['SPLIT-ROW-HANGER', 2]],
    [['SPLIT-OVER-DUMBBELL', 1]],
    [['SPLIT-MISSING-TRAY', 2]],
  ] as const
  return cases.map((rows, index) => {
    const base = structuredClone(全渠道订单模拟数据[0]!), items = rows.map(([sku, quantity], row) => 行(sku, quantity, row + 1))
    const cents = items.reduce((sum, item) => sum + BigInt(item.itemTotal.value.replace('.', '')), 0n)
    return { ...base, systemOrderNo: `OMS-SPLIT-${String(index + 1).padStart(2, '0')}`, platformOrderId: `DEMO-SPLIT-ORDER-${index + 1}`, platformOrderNo: `DEMO-SPLIT-ORDER-${index + 1}`,
      storeId: 'demo-ebay-us', storeName: '北美综合商品店', platformOrderStatus: 'NOT_STARTED', orderType: '线上订单', fulfillmentMode: '自配送', processingStatus: '待审核',
      defaultRoute: structuredClone(拆单演示路由[0]!), items, amount: { orderAmount: { value: `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`, currency: 'USD' } },
      manualOrder: undefined, manualShippingPlan: undefined, reviewExceptionCode: undefined, initialReviewPending: undefined, reviewRetry: undefined, admissionReason: undefined, blockReason: undefined,
      cancelledAt: undefined, cancelledReason: undefined, noShipmentReason: undefined, handlerAssignment: undefined, professionalOrder: undefined,
      fulfillmentOrders: [], reviews: [], tags: ['拆单评审'], buyerExternalId: `demo-split-buyer-${index + 1}`,
      orderedAt: '2026-11-13 08:00:00 UTC+8', paidAt: '2026-11-13 08:01:00 UTC+8', createdAt: '2026-11-13 08:02:00 UTC+8', lastSyncedAt: '2026-11-13 09:00:00 UTC+8',
      platformUpdatedAt: undefined, fulfillmentCompletedAt: undefined, shipByAt: '2026-11-16T10:00:00Z', shipByLabel: '11-16 18:00', urgency: '正常',
      address: { fullName: 'Demo Recipient', countryCode: 'US', stateProvince: 'CA', city: 'Demo City', addressLine1: '100 Sample Road', postalCode: '90001', mobilePhone: '+1 202 555 0100' },
      sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: '2026-11-13 09:00:00 UTC+8', message: '订单资料已识别' },
      operationLogs: [{ operatedAt: '2026-11-13 09:00:00 UTC+8', operationType: '订单接入', operationResult: '成功', operator: '系统', content: '订单资料已识别，等待审核。' }],
    }
  })
}
export function 创建拆单演示规则(): 订单规则[] {
  const base = 创建默认拆单动作()
  const configs: { name: string; keyword: string; action: 拆单动作配置; note: string }[] = [
    { name: '收纳商品按 SKU 分包', keyword: 'SPLIT-BASIC-', action: { ...base, basis: 'system', strategy: 'sku' }, note: '相同系统 SKU 放在同一包，不同商品分开发货。' },
    { name: '指定户外商品单独成包', keyword: 'SPLIT-SELECT-', action: { ...base, basis: 'system', strategy: 'selected', selectedSkus: ['SPLIT-SELECT-CHAIR'] }, note: '指定系统 SKU 与其余商品分开，只确定商品组成，后续由分仓规则确定仓库及渠道并核验仓库 SKU。' },
    { name: '露营商品限重与带电分包', keyword: 'SPLIT-CAP-', action: { ...base, basis: 'system', strategy: 'capacity', limits: { maxWeightKg: '3', maxQuantity: 3, maxAmount: '80', currency: 'USD' }, mixing: { mode: 'separateAttributes', skus: [], attributes: ['带电'] } }, note: '带电商品与普通商品分开，每包同时满足重量、件数和金额限制。' },
    { name: '多行同 SKU 商品合为一包', keyword: 'SPLIT-ROW-', action: { ...base, basis: 'platform', strategy: 'sku' }, note: '相同平台 SKU 归入同一包，各来源行及数量仍分别保留。' },
    { name: '健身商品每包最多 5 kg', keyword: 'SPLIT-OVER-', action: { ...base, basis: 'system', strategy: 'capacity', limits: { maxWeightKg: '5' } }, note: '单件超过限制时保留待审核，不能自动拆解实物商品。' },
    { name: '托盘商品重量核查', keyword: 'SPLIT-MISSING-', action: { ...base, basis: 'system', strategy: 'capacity', limits: { maxWeightKg: '5' } }, note: '商品重量资料完整后再生成分包结果。' },
  ]
  return configs.map((config, index) => ({ id: `RULE-SPLIT-${String(index + 1).padStart(2, '0')}`, name: config.name, type: '拆单规则', enabled: true, priority: (index + 1) * 10,
    mode: '全部满足', conditions: [{ field: 'platformSku', operator: '包含', value: config.keyword }], action: '按规则拆分包裹', splitAction: structuredClone(config.action),
    version: 1, updatedAt: '2026-11-13 09:00:00 UTC+8', note: config.note }))
}
export function 创建拆单演示资料(orders: readonly 全渠道订单[]): 拆单计算资料 {
  const routes: 拆单候选路线[] = 拆单演示路由.map((route, index) => ({ id: 拆单演示渠道[index]!, warehouseScopeId: index ? 'order-demo-good' : 'order-demo-winit', route: { ...route }, enabled: true, countries: ['US'], maxWeightKg: '30' }))
  const products: 拆单商品资料[] = []
  for (const order of orders) for (const line of order.items) {
    const product = 商品.find(x => x.sku === line.systemSku)
    if (!product) continue
    products.push({ orderNo: order.systemOrderNo, externalLineId: line.externalLineId, weightKg: product.weight, volumeCm3: product.volume, dimensionsCm: [...product.size], attributes: [...product.attributes], isCombination: false,
      warehouseMappings: routes.map((route, index) => ({ scopeId: route.warehouseScopeId, warehouseSku: `${index ? 'GC' : 'WYT'}-${product.sku}` })) })
  }
  const stocks = routes.flatMap(route => 商品.map(product => ({ scopeId: route.warehouseScopeId, warehouseSku: `${route.warehouseScopeId === 'order-demo-good' ? 'GC' : 'WYT'}-${product.sku}`,
    available: 20, sourceId: `${route.warehouseScopeId}-${product.sku}`, verified: true, unit: '件' })))
  return { sourceVersion: 拆单演示资料版本, products, routes, stocks }
}
