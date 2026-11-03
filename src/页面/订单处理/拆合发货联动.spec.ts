import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { 全渠道订单, 人工发货方案 } from '../全渠道订单/类型'
import {
  共享订单, 仓库执行记录, 演示库存, 订单版本, 操作核查证据, 演示路由,
  人工发货上下文, 当前版本, 执行演示审核, 执行演示推单, 推单阻断原因, 核查演示仓库结果,
} from './演示会话'
import { 保存人工发货方案, 撤销人工发货方案, 创建拆分发货草稿, 创建合并发货草稿 } from './拆合发货模型'
import { 执行演示修改仓库物流, 执行演示不发货 } from './批量操作模型'
import { 计算订单标志 } from './订单标志模型'

const 初始 = {
  订单: JSON.stringify(共享订单.value), 执行: JSON.stringify(仓库执行记录.value),
  库存: JSON.stringify(演示库存.value), 版本: JSON.stringify(订单版本.value), 证据: JSON.stringify(操作核查证据.value),
}
function 恢复会话() {
  共享订单.value = JSON.parse(初始.订单)
  仓库执行记录.value = JSON.parse(初始.执行)
  演示库存.value = JSON.parse(初始.库存)
  订单版本.value = JSON.parse(初始.版本)
  操作核查证据.value = JSON.parse(初始.证据)
}
beforeEach(恢复会话)
afterEach(恢复会话)

const 拆单号 = 'OMS-DEMO-SPLIT-01'
const 合单号 = ['OMS-DEMO-MERGE-01', 'OMS-DEMO-MERGE-02']
function 查单(号: string) { return 共享订单.value.find(单 => 单.systemOrderNo === 号)! }
function 版本表(号: string[]) { return Object.fromEntries(号.map(项 => [项, 当前版本(项)])) }
function 平台与来源事实(单: 全渠道订单) {
  return JSON.stringify({ systemOrderNo: 单.systemOrderNo, platformCode: 单.platformCode, platformOrderNo: 单.platformOrderNo, platformOrderId: 单.platformOrderId, storeId: 单.storeId, platformOrderStatus: 单.platformOrderStatus, buyerExternalId: 单.buyerExternalId, amount: 单.amount, address: 单.address, items: 单.items, defaultRoute: 单.defaultRoute })
}
function 保存方案(方案: 人工发货方案) {
  const 结果 = 保存人工发货方案(人工发货上下文(), 方案, 版本表(方案.orderNos))
  expect(结果.成功, 结果.信息).toBe(true)
  return 结果.方案!
}
function 保存拆单() {
  const 方案 = 创建拆分发货草稿(查单(拆单号))
  方案.packages[0]!.route = { ...演示路由[0]! }
  方案.packages[1]!.route = { ...演示路由[1]! }
  方案.reason = '前轮轴承与其余配件分仓发货'
  return 保存方案(方案)
}
function 保存合单() {
  const 方案 = 创建合并发货草稿(合单号.map(查单))
  方案.packages[0]!.route = { ...演示路由[1]! }
  方案.reason = '同一买家同一收件地址共同寄送'
  return 保存方案(方案)
}
function 审核拆单() {
  const 方案 = 保存拆单()
  const 结果 = 执行演示审核(拆单号, 当前版本(拆单号), '已核实完整平台行及各包仓库物流')
  expect(结果.成功, 结果.信息).toBe(true)
  return 方案
}
function 审核合单() {
  const 方案 = 保存合单()
  const 结果 = 执行演示审核(合单号[0]!, 当前版本(合单号[0]!), '已核实全部合并来源', 版本表(合单号))
  expect(结果.成功, 结果.信息).toBe(true)
  return 方案
}

describe('人工拆分方案与审核推仓联动', () => {
  it('保存仍待审核且不建履约，审核一次原子生成多张独立路线履约并保留来源事实', () => {
    const 单 = 查单(拆单号)
    const 原事实 = 平台与来源事实(单)
    const 原仓单数 = 仓库执行记录.value.length
    const 方案 = 保存拆单()
    expect(单.processingStatus).toBe('待审核')
    expect(单.fulfillmentOrders).toEqual([])
    expect(单.reviews).toEqual([])
    expect(仓库执行记录.value).toHaveLength(原仓单数)
    expect(计算订单标志(单).map(项 => 项.code)).toContain('SPLIT')
    const 结果 = 执行演示审核(拆单号, 当前版本(拆单号), '人工已核实')
    expect(结果.成功, 结果.信息).toBe(true)
    expect(单.processingStatus).toBe('待推单')
    expect(单.fulfillmentOrders).toHaveLength(2)
    expect(new Set(单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo)).size).toBe(2)
    expect(单.fulfillmentOrders.map(项 => 项.route)).toEqual(方案.packages.map(包 => 包.route))
    expect(单.fulfillmentOrders.map(项 => 项.items)).toEqual(方案.packages.map(包 => 包.items))
    expect(单.fulfillmentOrders.map(项 => 项.plannedQuantity)).toEqual([2, 2])
    expect(单.fulfillmentOrders.every(项 => 项.isActive && 项.manualPlanId === 方案.id && 项.shippedQuantity === 0)).toBe(true)
    expect(单.reviews[0]!.status).toBe('已通过')
    expect(仓库执行记录.value).toHaveLength(原仓单数)
    expect(平台与来源事实(单)).toBe(原事实)
    expect(执行演示审核(拆单号, 当前版本(拆单号)).成功).toBe(false)
    expect(单.fulfillmentOrders).toHaveLength(2)
  })

  it('分包分别推仓，第一包在途不拦第二包，快照只含对应包商品及数量', () => {
    const 方案 = 审核拆单()
    const 单 = 查单(拆单号)
    const [第一包, 第二包] = 单.fulfillmentOrders
    const 第一结果 = 执行演示推单(拆单号, 第一包!.fulfillmentOrderNo, 当前版本(拆单号))
    expect(第一结果.成功, 第一结果.信息).toBe(true)
    expect(推单阻断原因(单, 第二包!.fulfillmentOrderNo)).toEqual([])
    const 第二结果 = 执行演示推单(拆单号, 第二包!.fulfillmentOrderNo, 当前版本(拆单号))
    expect(第二结果.成功, 第二结果.信息).toBe(true)
    const 本单仓单 = 仓库执行记录.value.filter(项 => 项.订单号.includes(拆单号))
    expect(本单仓单).toHaveLength(2)
    for (const [索引, 仓单] of 本单仓单.entries()) {
      const 包 = 方案.packages[索引]!
      expect(仓单.状态).toBe('下单中')
      expect(仓单.待核查).toBe(true)
      expect(仓单.出库快照?.snapshotReliable).toBe(true)
      expect(仓单.出库快照?.items.map(行 => ({ orderNo: 行.sourceOrderNo, externalLineId: 行.externalLineId, quantity: 行.plannedQuantity }))).toEqual(包.items)
      expect(仓单.出库快照?.quantitySummary.plannedQuantity).toBe(包.items.reduce((总, 行) => 总 + 行.quantity, 0))
      expect(仓单.出库快照?.route).toEqual(包.route)
    }
    expect(执行演示推单(拆单号, 第一包!.fulfillmentOrderNo, 当前版本(拆单号)).成功).toBe(false)
    expect(仓库执行记录.value.filter(项 => 项.订单号.includes(拆单号))).toHaveLength(2)
    expect(核查演示仓库结果(第一包!.fulfillmentOrderNo).成功).toBe(true)
    expect(单.processingStatus).toBe('待推单')
    expect(核查演示仓库结果(第二包!.fulfillmentOrderNo).成功).toBe(true)
    expect(单.processingStatus).toBe('待发货')
  })

  it('同一eBay平台行拆为一件加一件，保存、审核和两次推仓均按各包分配量执行', () => {
    const 单 = 查单(拆单号)
    单.items = [JSON.parse(JSON.stringify(单.items[0]!))]
    const 商品 = 单.items[0]!
    expect(单.platformCode).toBe('eBay')
    expect(商品.fulfillableQuantity).toBe(2)
    const 原事实 = 平台与来源事实(单)
    const 方案 = 创建拆分发货草稿(单)
    方案.reason = '同一商品的两件分别拆入两个包裹'
    for (const [索引, 包] of 方案.packages.entries()) {
      包.route = { ...演示路由[索引]! }
      包.items = [{ orderNo: 单.systemOrderNo, externalLineId: 商品.externalLineId, quantity: 1 }]
    }
    保存方案(方案)
    expect(单.processingStatus).toBe('待审核')
    expect(单.fulfillmentOrders).toEqual([])
    const 审核 = 执行演示审核(单.systemOrderNo, 当前版本(单.systemOrderNo), '确认同一来源行两件拆成两个一件包裹')
    expect(审核.成功, 审核.信息).toBe(true)
    expect(单.processingStatus).toBe('待推单')
    expect(单.fulfillmentOrders.map(项 => 项.plannedQuantity)).toEqual([1, 1])
    expect(单.fulfillmentOrders.map(项 => 项.items)).toEqual(方案.packages.map(包 => 包.items))
    for (const 履约 of 单.fulfillmentOrders) {
      expect(推单阻断原因(单, 履约.fulfillmentOrderNo)).toEqual([])
      const 推单 = 执行演示推单(单.systemOrderNo, 履约.fulfillmentOrderNo, 当前版本(单.systemOrderNo))
      expect(推单.成功, 推单.信息).toBe(true)
      const 仓单 = 仓库执行记录.value.find(项 => 项.出库单号 === 推单.对象号)!
      expect(仓单.状态).toBe('下单中')
      expect(仓单.出库快照?.snapshotReliable).toBe(true)
      expect(仓单.出库快照?.items).toEqual([expect.objectContaining({ sourceOrderNo: 单.systemOrderNo, externalLineId: 商品.externalLineId, plannedQuantity: 1, shippedQuantity: 0 })])
      expect(仓单.出库快照?.quantitySummary).toMatchObject({ plannedQuantity: 1, shippedQuantity: 0 })
    }
    const 仓单 = 仓库执行记录.value.filter(项 => 项.订单号.includes(单.systemOrderNo))
    expect(仓单).toHaveLength(2)
    expect(仓单.reduce((总, 项) => 总 + 项.出库快照!.quantitySummary.plannedQuantity!, 0)).toBe(2)
    expect(平台与来源事实(单)).toBe(原事实)
  })
})

describe('人工合并方案与全组原子审核推仓联动', () => {
  it('审核入口只选一张也须全部来源版本，审核成功同时推进全部订单并共享同一履约', () => {
    const 事实 = 合单号.map(号 => 平台与来源事实(查单(号)))
    const 方案 = 保存合单()
    const 审核前 = 合单号.map(号 => JSON.stringify(查单(号)))
    const 无全组版本 = 执行演示审核(合单号[0]!, 当前版本(合单号[0]!))
    expect(无全组版本.成功).toBe(false)
    expect(无全组版本.信息).toContain('全部来源订单版本')
    expect(合单号.map(号 => JSON.stringify(查单(号)))).toEqual(审核前)
    const 旧版本 = 版本表(合单号)
    订单版本.value[合单号[1]!] = 当前版本(合单号[1]!) + 1
    expect(执行演示审核(合单号[0]!, 当前版本(合单号[0]!), '', 旧版本).成功).toBe(false)
    expect(合单号.map(号 => 查单(号).fulfillmentOrders)).toEqual([[], []])
    const 通过 = 执行演示审核(合单号[0]!, 当前版本(合单号[0]!), '全组核实完成', 版本表(合单号))
    expect(通过.成功, 通过.信息).toBe(true)
    const 来源 = 合单号.map(查单)
    expect(来源.map(单 => 单.processingStatus)).toEqual(['待推单', '待推单'])
    expect(来源.map(单 => 单.reviews[单.reviews.length - 1]?.status)).toEqual(['已通过', '已通过'])
    expect(来源.every(单 => 单.fulfillmentOrders.length === 1)).toBe(true)
    expect(来源[0]!.fulfillmentOrders).toEqual(来源[1]!.fulfillmentOrders)
    expect(来源[0]!.fulfillmentOrders[0]!.items).toEqual(方案.packages[0]!.items)
    expect(来源[0]!.fulfillmentOrders[0]!.plannedQuantity).toBe(3)
    expect(合单号.map(号 => 平台与来源事实(查单(号)))).toEqual(事实)
  })

  it('合并全组只生成一张仓单，快照保留各来源商品数量，任何来源重复推仓均受阻', () => {
    const 方案 = 审核合单()
    const 履约号 = 查单(合单号[0]!).fulfillmentOrders[0]!.fulfillmentOrderNo
    const 无版本 = 执行演示推单(合单号[0]!, 履约号, 当前版本(合单号[0]!))
    expect(无版本.成功).toBe(false)
    const 结果 = 执行演示推单(合单号[0]!, 履约号, 当前版本(合单号[0]!), 版本表(合单号))
    expect(结果.成功, 结果.信息).toBe(true)
    const 仓单 = 仓库执行记录.value.filter(项 => 项.履约单号 === 履约号)
    expect(仓单).toHaveLength(1)
    expect(仓单[0]!.订单号).toEqual(合单号)
    const 快照 = 仓单[0]!.出库快照!
    expect(快照.snapshotReliable).toBe(true)
    expect(快照.sourceOrders.map(项 => 项.systemOrderNo)).toEqual(合单号)
    expect(快照.items.map(行 => ({ orderNo: 行.sourceOrderNo, externalLineId: 行.externalLineId, quantity: 行.plannedQuantity }))).toEqual(方案.packages[0]!.items)
    expect(快照.quantitySummary.plannedQuantity).toBe(3)
    expect(快照.items.map(行 => 行.plannedQuantity)).toEqual([1, 2])
    expect(执行演示推单(合单号[1]!, 履约号, 当前版本(合单号[1]!), 版本表(合单号)).成功).toBe(false)
    expect(仓库执行记录.value.filter(项 => 项.履约单号 === 履约号)).toHaveLength(1)
    expect(核查演示仓库结果(履约号).成功).toBe(true)
    expect(合单号.map(号 => 查单(号).processingStatus)).toEqual(['待发货', '待发货'])
  })

  it('一个来源库存未知会拦截全组审核，不生成部分履约，保留各来源拦截记录', () => {
    保存合单()
    演示库存.value[合单号[1]!] = '结果未知'
    const 结果 = 执行演示审核(合单号[0]!, 当前版本(合单号[0]!), '检查全组', 版本表(合单号))
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain(合单号[1]!)
    expect(结果.信息).toContain('结果未知')
    expect(合单号.map(号 => 查单(号).processingStatus)).toEqual(['待审核', '待审核'])
    expect(合单号.map(号 => 查单(号).fulfillmentOrders)).toEqual([[], []])
    expect(合单号.map(号 => { const 记录 = 查单(号).reviews; return 记录[记录.length - 1]?.status })).toEqual(['已拦截', '已拦截'])
    expect(仓库执行记录.value.filter(项 => 项.订单号.some(号 => 合单号.includes(号)))).toEqual([])
  })
})

describe('人工方案与其他操作及标志联动', () => {
  it.each(['拆分发货', '合并发货'] as const)('%s 保存后不能单独修改默认路由或不发货，撤销后清除当前标志', 类型 => {
    const 方案 = 类型 === '拆分发货' ? 保存拆单() : 保存合单()
    const 号 = 方案.orderNos[0]!
    const 单 = 查单(号)
    const 保存后 = 方案.orderNos.map(编号 => JSON.stringify(查单(编号)))
    expect(执行演示修改仓库物流(号, 当前版本(号), 演示路由[0]!.shippingChannelCode, '绕过方案修改').成功).toBe(false)
    expect(执行演示不发货(号, 当前版本(号), '绕过方案终止').成功).toBe(false)
    expect(方案.orderNos.map(编号 => JSON.stringify(查单(编号)))).toEqual(保存后)
    const 标志 = 类型 === '拆分发货' ? 'SPLIT' : 'MERGED'
    expect(计算订单标志(单).map(项 => 项.code)).toContain(标志)
    const 撤销 = 撤销人工发货方案(人工发货上下文(), 方案.orderNos, 版本表(方案.orderNos), '人工重新编排')
    expect(撤销.成功, 撤销.信息).toBe(true)
    for (const 来源号 of 方案.orderNos) {
      const 来源 = 查单(来源号)
      expect(来源.manualShippingPlan).toBeUndefined()
      expect(来源.processingStatus).toBe('待审核')
      expect(来源.fulfillmentOrders).toEqual([])
      expect(计算订单标志(来源).map(项 => 项.code)).not.toContain(标志)
      expect(来源.operationLogs[来源.operationLogs.length - 1]?.operationType).toBe(`撤销${类型}`)
    }
  })
})
