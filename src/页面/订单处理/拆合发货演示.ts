import type { 全渠道订单 } from '../全渠道订单/类型'

/** 本轮人工拆合流程的虚构样例；刷新浏览器恢复初始值。 */
export function 创建拆合发货演示(创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单): 全渠道订单[] {
  const 拆分 = 创建订单(301, { systemOrderNo: 'OMS-DEMO-SPLIT-01', platformOrderId: 'DEMO-MANUAL-SPLIT-01', platformOrderNo: 'DEMO-MANUAL-SPLIT-01' })
  const 模板 = 拆分.items[0]!
  拆分.items = [2, 1, 1].map((数量, 索引) => ({ ...structuredClone(模板), externalLineId: `DEMO-SPLIT-L${索引 + 1}`, orderedQuantity: 数量, fulfillableQuantity: 数量, platformSku: `DEMO-PART-${索引 + 1}`, systemSku: `DEMO-SKU-${索引 + 1}`, systemItemName: ['前轮轴承总成', '后轮制动片', '空气滤芯'][索引], skuResolutionStatus: '成功' }))
  const 数量拆分 = 创建订单(305, { systemOrderNo: 'OMS-DEMO-SPLIT-02', platformCode: 'Temu', platformOrderId: 'DEMO-MANUAL-SPLIT-02', platformOrderNo: 'DEMO-MANUAL-SPLIT-02', platformOrderStatus: '待发货', storeId: 'demo-temu-manual', storeName: '汽配分包演示店', professionalOrder: undefined })
  数量拆分.items = [10, 11, 12, 13].map((数量, 索引) => ({ ...structuredClone(模板), externalLineId: `DEMO-MATRIX-L${索引 + 1}`, platformItemId: `DEMO-MATRIX-ITEM-${索引 + 1}`, platformItemTitle: ['Front Wheel Bearing Assembly', 'Rear Brake Pads', 'Engine Air Filter', 'Ignition Coil'][索引], orderedQuantity: 数量, fulfillableQuantity: 数量, platformSku: `DEMO-MATRIX-${String.fromCharCode(65 + 索引)}`, systemSku: `DEMO-SKU-${String.fromCharCode(65 + 索引)}`, systemItemName: ['前轮轴承总成', '后轮制动片', '空气滤芯', '点火线圈'][索引], skuResolutionStatus: '成功' }))
  const 合并 = [1, 2, 3].map(序号 => {
    const 单 = 创建订单(301 + 序号, { systemOrderNo: `OMS-DEMO-MERGE-0${序号}`, platformOrderId: `DEMO-MANUAL-MERGE-0${序号}`, platformOrderNo: `DEMO-MANUAL-MERGE-0${序号}`, buyerExternalId: 序号 === 3 ? 'DEMO-OTHER-BUYER' : 'DEMO-MERGE-BUYER' })
    单.address = structuredClone(拆分.address)
    单.address.buyerMessage = undefined
    单.items = [{ ...structuredClone(模板), externalLineId: `DEMO-MERGE-${序号}-L1`, orderedQuantity: 序号 === 2 ? 2 : 1, fulfillableQuantity: 序号 === 2 ? 2 : 1, skuResolutionStatus: '成功' }]
    if (序号 === 3) 单.address.addressLine1 = '303 Example Review Avenue'
    return 单
  })
  const 追加合并 = [4, 5, 6, 7, 8].map(序号 => {
    const 单 = 创建订单(310 + 序号, {
      systemOrderNo: `OMS-DEMO-MERGE-0${序号}`, platformOrderId: `DEMO-MANUAL-MERGE-0${序号}`, platformOrderNo: `DEMO-MANUAL-MERGE-0${序号}`,
      buyerExternalId: 序号 <= 5 ? 'DEMO-MERGE-BUYER-SECOND' : 序号 === 7 ? undefined : 'DEMO-MERGE-BUYER',
      processingStatus: '待审核',
    })
    单.address = structuredClone(拆分.address)
    单.address.buyerMessage = undefined
    if (序号 <= 5) {
      单.address.fullName = 'Morgan Demo'
      单.address.addressLine1 = '405 Example Review Avenue'
    }
    if (序号 === 6) 单.address.addressLine1 = '606 Example Review Avenue'
    单.items = [{ ...structuredClone(模板), externalLineId: `DEMO-MERGE-${序号}-L1`, orderedQuantity: 1, fulfillableQuantity: 1, skuResolutionStatus: '成功' }]
    if (序号 === 8) {
      单.items[0]!.systemSku = undefined
      单.items[0]!.skuResolutionStatus = '缺失'
    }
    return 单
  })
  return [数量拆分, 拆分, ...合并, ...追加合并].map((单, 索引) => {
    const 下单分钟 = 9 * 60 + 5 - 索引
    const 时分 = `${String(Math.floor(下单分钟 / 60)).padStart(2, '0')}:${String(下单分钟 % 60).padStart(2, '0')}`
    return { ...单, orderedAt: `2026-10-21 ${时分}:00 UTC+8`, paidAt: `2026-10-21 ${时分}:30 UTC+8`, createdAt: '2026-10-21 09:06:00 UTC+8', lastSyncedAt: '2026-10-21 09:06:00 UTC+8', shipByAt: '2026-10-23 18:00:00 UTC+8', tags: [], operationLogs: [{ operatedAt: '2026-10-21 09:06:00 UTC+8', operationType: '样例初始化', operationResult: '成功' as const, operator: '原型演示', content: '虚构人工拆合发货评审样例；仅浏览器会话内操作，不调用平台和仓库。' }] }
  })
}
