import { reactive } from 'vue'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 关联演示数据 } from './库存关联模型'

/** 合单评审的虚构来源资料；站点和重量有明确样例证据，不从国家或金额推断。 */
export const 自动合单样例资料 = reactive<Record<string, { siteId: string; weightKg: string }>>({})

/** 为本轮明确建立的虚构中台映射和三方仓来源；仍走已有库存查询，不覆盖或扣减其他来源。 */
function 注册合单库存样例(now: number) {
  for (const scopeId of ['order-demo-winit', 'order-demo-good']) {
    const scope = 关联演示数据.scopes.find(scope => scope.id === scopeId)!
    const systemSku = 'DEMO-AM-HOME-RACK-01'
    const warehouseSku = `AM-${scopeId === 'order-demo-winit' ? 'WYT' : 'GC'}-HOME-RACK-01`
    const id = `auto-merge-inventory-${scopeId}`
    if (!关联演示数据.mappings.some(mapping => mapping.scopeId === scopeId && mapping.systemSku === systemSku)) 关联演示数据.mappings.push({ scopeId, systemSku, warehouseSku, status: '已映射' })
    if (关联演示数据.inventory.some(row => row.id === id)) continue
    关联演示数据.inventory.push({ ...scope, id, systemSku, warehouseSku, sourceCustomer: 'AUTO-MERGE-DEMO-CUSTOMER', quality: '良品', unit: '件', name: '家用置物架', specification: '三层 / 白色', batchNo: 'AM-DEMO-BATCH-01', quantities: { available: scopeId === 'order-demo-winit' ? 80 : 60, reserved: null, unavailable: null, transit: null, onHand: null, defective: null, frozen: null, putaway: null }, mapping: '已映射', issues: [], updatedAt: new Date(now).toISOString(), sourceAt: new Date(now - 60_000).toISOString(), lastAttempt: new Date(now).toISOString(), attemptResult: '成功', enabled: true, presence: '已确认存在' })
  }
}

export function 创建自动合单样例(创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单, now = Date.now()): 全渠道订单[] {
  注册合单库存样例(now)
  const 定义 = [
    ['BASIC-01', 'basic', 'BASIC-A', '同买家多单'], ['BASIC-02', 'basic', 'BASIC-A', '同买家多单'],
    ['BASIC-03', 'basic', 'BASIC-B', '独立来源'],
    ['READY-01', 'ready', 'READY-A', '独立来源'],
    ['READY-02', 'ready', 'READY-B', '同买家多单'], ['READY-03', 'ready', 'READY-B', '同买家多单'],
    ['SCHEDULED-01', 'scheduled', 'TIME-A', '同买家多单'], ['SCHEDULED-02', 'scheduled', 'TIME-A', '同买家多单'],
    ['DUE-01', 'scheduled', 'DUE-A', '发货时限保护'],
    ['SPLIT-01', 'basic', 'SPLIT-A', '已拆单排除'], ['CANCEL-01', 'basic', 'CANCEL-A', '取消排除'],
  ] as const
  return 定义.map(([后缀, 模式, 买家, 场景], index) => {
    const systemOrderNo = `OMS-DEMO-AM-${后缀}`
    const 单 = 创建订单(1400 + index, {
      systemOrderNo, platformCode: 'eBay', platformOrderId: `DEMO-AM-${后缀}`, platformOrderNo: `DEMO-AM-${后缀}`,
      // 稳定店铺 ID 沿用既有样例，仅用于准入范围；所有店铺共同使用全局合单设置。
      storeId: `demo-merge-${模式}`, storeName: ({ basic: '优优综合店', ready: '优优家居店', scheduled: '优优户外店' })[模式],
      buyerExternalId: `DEMO-AM-BUYER-${买家}`, defaultRoute: undefined, initialReviewPending: true,
      mergeNodeArrival: { arrivedAt: now, skuResolution: '已完成', giftProcessing: '不适用', splitProcessing: '未拆单' },
      orderedAt: new Date(now - (20 + index) * 60_000).toISOString(), paidAt: new Date(now - (19 + index) * 60_000).toISOString(),
      createdAt: new Date(now - 10 * 60_000).toISOString(), lastSyncedAt: new Date(now).toISOString(),
      shipByAt: new Date(now + (后缀 === 'DUE-01' ? 121 : 48 * 60) * 60_000).toISOString(),
      shipByLabel: 后缀 === 'DUE-01' ? '临近履约预留时间' : '48 小时内', urgency: 后缀 === 'DUE-01' ? '临期' : '正常',
      tags: [场景], reviews: [], fulfillmentOrders: [], manualShippingPlan: undefined,
      operationLogs: [{ operatedAt: new Date(now).toISOString(), operationType: '订单准入', operationResult: '成功', operator: '系统规则', content: '订单已通过准入，已识别 SKU 配对关系，等待合单规则处理。' }],
    })
    单.address = { fullName: `Demo ${买家}`, countryCode: 'US', stateProvince: 'California', city: 'Los Angeles', addressLine1: `100 Example ${买家} Avenue`, addressLine2: 'Unit 2', postalCode: '90001', mobilePhone: '***-***-0188', email: 'demo@example.invalid' }
    单.items = [{ ...单.items[0]!, externalLineId: `DEMO-AM-${后缀}-L1`, platformSku: 'DEMO-HOME-RACK', systemSku: 'DEMO-AM-HOME-RACK-01', systemItemName: '家用置物架', orderedQuantity: 1, fulfillableQuantity: 1, skuResolutionStatus: '成功' }]
    自动合单样例资料[systemOrderNo] = { siteId: 'DEMO-EBAY-US', weightKg: '1.250' }
    if (后缀 === 'SPLIT-01') {
      delete 单.mergeNodeArrival
      单.items[0]!.orderedQuantity = 2; 单.items[0]!.fulfillableQuantity = 2
      单.manualShippingPlan = { id: 'MSP-DEMO-AM-SPLIT', kind: '拆分发货', orderNos: [systemOrderNo], reason: '按独立包装要求已拆分', updatedAt: new Date(now).toISOString(), packages: [1, 2].map(number => ({ key: `package-${number}`, route: { warehouse: '万邑通美西仓', warehouseProvider: '万邑通', warehouseAccount: '万邑通 · 北美主体', shippingChannel: 'USPS Ground Advantage', shippingChannelCode: 'WYT-USPS-GA', shippingChannelId: 'DEMO-CF-CHANNEL-WYT', labelMode: '仓配一体' }, items: [{ orderNo: systemOrderNo, externalLineId: 单.items[0]!.externalLineId, quantity: 1 }] })) }
    }
    if (后缀 === 'CANCEL-01') { 单.processingStatus = '异常'; 单.initialReviewPending = undefined; delete 单.mergeNodeArrival; 单.blockReason = '平台取消处理中，停止后续发货并等待人工复核' }
    return 单
  })
}
