import type { 全渠道订单, 人工发货方案, 履约单摘要, 订单处理状态, 订单路由 } from '../全渠道订单/类型'
import type { 仓库执行 } from './演示会话'
import type { 操作证据 } from './操作演示数据'
import { 创建推单出库快照 } from '../仓配管理/三方仓出库模型'

type 阶段代码 = 'REVIEW' | 'READY' | 'PARTIAL' | 'WAITING' | 'SHIPPED' | 'EXCEPTION' | 'STOPPED' | 'LOWSTOCK'
interface 阶段配置 { code: 阶段代码; name: string; status: 订单处理状态; outbound: Array<仓库执行['状态'] | undefined> }
const 配置: 阶段配置[] = [
  { code: 'REVIEW', name: '已保存分包方案，等待审核', status: '待审核', outbound: [] },
  { code: 'READY', name: '拆分审核通过，两包均未推仓', status: '待推单', outbound: [] },
  { code: 'PARTIAL', name: '第一包建仓成功，第二包尚未推仓', status: '待推单', outbound: ['待出库'] },
  { code: 'WAITING', name: '两包均已建仓，等待实际出库', status: '待发货', outbound: ['待出库', '待出库'] },
  { code: 'SHIPPED', name: '两包均已取得逐行有效出库事实', status: '已发货', outbound: ['已出库', '已出库'] },
  { code: 'EXCEPTION', name: '第二包出库异常，整单暂停人工复核', status: '异常', outbound: ['待出库', '出库异常'] },
  { code: 'STOPPED', name: '两包零出库且仓库取消结束，人工确认不发货', status: '不发货', outbound: ['已取消', '已取消'] },
  { code: 'LOWSTOCK', name: '待审核分包方案，两个所选仓库均库存不足', status: '待审核', outbound: [] },
]
export const 拆分阶段演示目录 = 配置.map(item => ({ code: item.code, orderNo: `OMS-DEMO-SPLIT-STAGE-${item.code}`, name: item.name, status: item.status }))
const 时间 = (time: string) => `2026-10-21 ${time} UTC+8`

/** 固定虚构事实用于跨队列评审；各平台商品行完整分入一包，不拆同一 eBay 行数量。 */
export function 创建拆分发货阶段演示(创建订单: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单, 路由: readonly 订单路由[]): { 订单: 全渠道订单[]; 执行: 仓库执行[]; 证据: Record<string, 操作证据> } {
  const 订单: 全渠道订单[] = [], 执行: 仓库执行[] = [], 证据: Record<string, 操作证据> = {}
  if (路由.length < 2) throw new Error('拆分阶段演示需要万邑通、谷仓两条完整虚构路由')
  for (const [index, 场景] of 配置.entries()) {
    const 号 = `OMS-DEMO-SPLIT-STAGE-${场景.code}`
    const 单 = 创建订单(401 + index, {
      systemOrderNo: 号, platformOrderId: `DEMO-SPLIT-STAGE-${场景.code}`, platformOrderNo: `DEMO-SPLIT-STAGE-${场景.code}`,
      platformCode: 'eBay', platformOrderStatus: 场景.status === '已发货' ? 'FULFILLED' : 'NOT_STARTED',
      storeId: 'demo-ebay-split-stage', storeName: '拆分发货阶段演示店', buyerExternalId: `DEMO-STAGE-BUYER-${场景.code}`,
      processingStatus: 场景.status, professionalOrder: undefined, defaultRoute: { ...路由[0]! },
      orderedAt: 时间(`09:18:${String(20 - index).padStart(2, '0')}`), paidAt: 时间('09:20:10'), createdAt: 时间('09:20:20'),
      lastSyncedAt: 时间('10:10:00'), shipByAt: '2026-10-23 18:00:00 UTC+8', shipByLabel: '10-23 18:00',
      blockReason: undefined, noShipmentReason: undefined, cancelledAt: undefined, cancelledReason: undefined, fulfillmentCompletedAt: undefined,
      reviews: [], fulfillmentOrders: [], tags: [], operationLogs: [],
    })
    const 模板 = 单.items[0]!
    const 数量 = 场景.code === 'LOWSTOCK' ? [2, 2] : [4, 6]
    单.items = 数量.map((qty, line) => ({ ...structuredClone(模板), externalLineId: `DEMO-SPLIT-STAGE-${场景.code}-L${line + 1}`,
      platformItemId: `DEMO-STAGE-ITEM-${line + 1}`, platformSku: `DEMO-STAGE-PART-${line + 1}`,
      platformItemTitle: line === 0 ? 'Front Wheel Bearing Assembly' : 'Rear Brake Pad Kit',
      systemSku: 场景.code === 'LOWSTOCK' ? 'DEMO-SKU-LOW-STOCK' : `DEMO-SKU-${line + 1}`,
      systemItemName: line === 0 ? '前轮轴承总成' : '后轮制动片', orderedQuantity: qty, fulfillableQuantity: qty, skuResolutionStatus: '成功',
    }))
    const 方案: 人工发货方案 = {
      id: `MSP-DEMO-SPLIT-STAGE-${场景.code}`, kind: '拆分发货', orderNos: [号], reason: `阶段评审：${场景.name}`, updatedAt: 时间('09:21:00'),
      packages: 单.items.map((item, part) => ({ key: `stage-package-${part + 1}`, route: { ...路由[part]! }, items: [{ orderNo: 号, externalLineId: item.externalLineId, quantity: item.fulfillableQuantity! }] })),
    }
    单.manualShippingPlan = 方案
    单.operationLogs.push({ operatedAt: 时间('09:21:00'), operationType: '拆分发货', operationResult: '成功', operator: '原型演示', content: `${场景.name}。虚构方案 ${方案.id}，各平台商品行完整分包；只在当前浏览器会话演示，不调用真实平台或仓库。` })
    证据[号] = { 平台允许: true, 剩余已核实: true, 零出库已核实: 场景.status !== '已发货', 原方案有效: true, 原请求未生效: 场景.outbound.length === 0, 发货资料有效: true, 路由适用: true, 范围无重叠: true, 范围已核清: true, 查询标识完整: true, 截单阶段可撤: 场景.status !== '已发货', 计划可停止: 场景.status !== '已发货', 同步结果: '正常' }
    if (!['REVIEW', 'LOWSTOCK'].includes(场景.code)) {
      单.reviews.push({ round: 1, type: '人工审核', triggerSource: '拆分阶段虚构回放', status: '已通过', completedAt: 时间('09:22:00'), decisionNote: `人工核对两条完整平台行及两包路线；方案 ${方案.id} 全范围通过，固化两张履约单。本记录为明确给定的虚构阶段事实。` })
      单.fulfillmentOrders = 方案.packages.map((包, part): 履约单摘要 => ({ fulfillmentOrderNo: `FL-DEMO-SPLIT-STAGE-${场景.code}-P${part + 1}`, status: '待执行', isActive: true, route: { ...包.route }, plannedQuantity: 包.items.reduce((sum, item) => sum + item.quantity, 0), shippedQuantity: 0, items: 包.items.map(item => ({ ...item })), manualPlanId: 方案.id }))
      for (const [part, 状态] of 场景.outbound.entries()) {
        if (!状态) continue
        const 履约 = 单.fulfillmentOrders[part]!
        const 快照 = 创建推单出库快照([单], 履约.fulfillmentOrderNo, 时间('09:25:00'))
        快照.acceptedAt = 时间('09:26:00'); 快照.lastSyncedAt = 时间('09:30:00')
        快照.warehouseStatusRaw = `DEMO-${状态}`
        履约.status = 状态 === '已出库' ? '已发货' : '执行中'
        const 已出库 = 状态 === '已出库'
        if (已出库) {
          履约.shippedQuantity = 履约.plannedQuantity; 履约.shippedAt = 时间('10:05:00'); 履约.trackingNumber = `DEMO-TRACK-SPLIT-STAGE-${场景.code}-P${part + 1}`
          快照.shippedAt = 履约.shippedAt; 快照.lastSyncedAt = 时间('10:06:00'); 快照.quantitySummary.shippedQuantity = 履约.plannedQuantity
          快照.items.forEach(item => { item.shippedQuantity = item.plannedQuantity; item.lineStatus = '已出库' })
        }
        if (状态 === '已取消') {
          履约.status = '已终止'; 履约.isActive = false
          快照.lastSyncedAt = 时间('09:40:00'); 快照.items.forEach(item => { item.lineStatus = '已终止' })
        }
        执行.push({ 履约单号: 履约.fulfillmentOrderNo, 订单号: [号], 出库单号: `CK-DEMO-SPLIT-STAGE-${场景.code}-P${part + 1}`,
          三方仓出库单号: `WH-DEMO-SPLIT-STAGE-${场景.code}-P${part + 1}`, 状态, 待核查: false,
          原因: 状态 === '出库异常' ? '第二包拣货异常，尚无出库事实，请人工核对仓库处理结果' : '', 更新时间: 已出库 ? 时间('10:06:00') : 状态 === '已取消' ? 时间('09:40:00') : 时间('09:30:00'),
          出库快照: 快照, 出库事实: { planned: 履约.plannedQuantity, shipped: 履约.shippedQuantity, tracking: 履约.trackingNumber || null, shippedAt: 履约.shippedAt || null },
        })
      }
    }
    if (场景.code === 'SHIPPED') 单.fulfillmentCompletedAt = 时间('10:05:00')
    if (场景.code === 'EXCEPTION') {
      单.blockReason = '第二包仓库出库异常，人工暂停后续发货；两个包裹实际出库量均明确为零，原仓库执行尚未结束。'
      单.operationLogs.push({ operatedAt: 时间('09:31:00'), operationType: '人工复核暂停（演示）', operationResult: '成功', operator: '原型演示', content: '包裹2拣货异常；本固定评审样例由人工将订单转异常，保留两张原仓单，未模拟自动恢复或仓库撤单。' })
    }
    if (场景.code === 'STOPPED') {
      单.noShipmentReason = '人工确认不再由 OMS 发货：两个包裹均零出库，仓库已明确取消全部执行。'
      证据[号]!.终止依据已纠正 = false
      单.operationLogs.push({ operatedAt: 时间('09:41:00'), operationType: '不发货', operationResult: '成功', operator: '原型演示', content: '两个仓库执行均已明确取消且实际出库数量为零，人工确认无需继续发货；两张历史履约已终止，平台订单和原分配事实保留。' })
    }
    订单.push(单)
  }
  return { 订单, 执行, 证据 }
}
