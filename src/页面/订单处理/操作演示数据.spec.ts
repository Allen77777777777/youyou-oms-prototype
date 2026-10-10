import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 创建操作演示, 操作演示场景目录 } from './操作演示数据'

function 创建样例() {
  return 创建操作演示((_序号, 覆盖 = {}) => ({ ...structuredClone(全渠道订单模拟数据[0]!), ...覆盖 }))
}
function 取订单(样例: ReturnType<typeof 创建样例>, 编号: string): 全渠道订单 {
  return 样例.订单.find(单 => 单.systemOrderNo === `OMS-DEMO-ACTION-${编号}`)!
}

describe('操作演示事实与历史的一致性', () => {
  it('全部场景有稳定独立身份，执行引用完整且同一仓单只初始化一次', () => {
    const 样例 = 创建样例()
    expect(样例.订单).toHaveLength(34)
    expect(new Set(样例.订单.map(单 => 单.systemOrderNo)).size).toBe(34)
    expect(new Set(样例.执行.map(项 => 项.出库单号)).size).toBe(样例.执行.length)
    expect(样例.订单.map(单 => 单.platformOrderNo.replace('DEMO-', ''))).toEqual(操作演示场景目录.map(项 => 项.编号))
    for (const 执行 of 样例.执行) {
      expect(执行.订单号.length).toBeGreaterThan(0)
      for (const 订单号 of 执行.订单号) {
        const 单 = 样例.订单.find(项 => 项.systemOrderNo === 订单号)!
        expect(单.fulfillmentOrders.some(项 => 项.fulfillmentOrderNo === 执行.履约单号)).toBe(true)
        expect(单.defaultRoute?.labelMode).toBe('仓配一体')
      }
    }
  })

  it('已取消执行全部保留已终止历史，出库事实不被初始化为零出库', () => {
    const 样例 = 创建样例()
    for (const 执行 of 样例.执行.filter(项 => 项.状态 === '已取消')) {
      const 单 = 样例.订单.find(项 => 项.systemOrderNo === 执行.订单号[0])!
      expect(单.fulfillmentOrders[0]).toMatchObject({ status: '已终止', isActive: false, shippedQuantity: 0 })
      expect(单.reviews[0]?.status).toBe('已通过')
    }
    const 已发 = 取订单(样例, '25')
    expect(已发.fulfillmentOrders[0]).toMatchObject({ status: '已发货', plannedQuantity: 2, shippedQuantity: 2 })
    expect(样例.证据[已发.systemOrderNo]!.零出库已核实).toBe(false)
    const 部分 = 取订单(样例, '15')
    expect(部分.fulfillmentOrders[0]).toMatchObject({ plannedQuantity: 2, shippedQuantity: 1 })
    expect(样例.证据[部分.systemOrderNo]!.零出库已核实).toBe(false)
    const 未核实 = 取订单(样例, '27')
    expect(样例.证据[未核实.systemOrderNo]).toMatchObject({ 零出库已核实: false, 剩余已核实: false })
    expect(样例.执行.find(项 => 项.订单号.includes(未核实.systemOrderNo))!.待核查).toBe(true)
  })

  it('平台取消中没有最终取消事实，系统外已履约没有虚构 OMS 出库', () => {
    const 样例 = 创建样例()
    const 取消中 = 取订单(样例, '20')
    expect(取消中.cancelledAt).toBeUndefined()
    expect(取消中.cancelledReason).toBeUndefined()
    expect(样例.证据[取消中.systemOrderNo]!.平台允许).toBe(false)
    const 最终取消 = 取订单(样例, '22')
    expect(最终取消.cancelledAt).toBeDefined()
    expect(样例.证据[最终取消.systemOrderNo]!.终止依据已纠正).toBe(false)
    const 系统外 = 取订单(样例, '23')
    expect(系统外.platformOrderStatus).toBe('FULFILLED')
    expect(系统外.items[0]!.fulfillableQuantity).toBe(0)
    expect(系统外.fulfillmentOrders).toEqual([])
    expect(样例.执行.some(项 => 项.订单号.includes(系统外.systemOrderNo))).toBe(false)
    expect(取订单(样例, '06').items[0]!.fulfillableQuantity).toBeUndefined()
  })

  it('恢复对照区分已受理原仓单与已结束方案，并保留独立路由快照', () => {
    const 样例 = 创建样例()
    const 原仓单 = 取订单(样例, '17')
    expect(样例.库存[原仓单.systemOrderNo]).toBe('不足')
    expect(样例.证据[原仓单.systemOrderNo]!.原执行可继续).toBe(true)
    expect(原仓单.fulfillmentOrders[0]).toMatchObject({ isActive: true, status: '执行中', shippedQuantity: 0 })
    const 原方案 = 取订单(样例, '18')
    expect(原方案.fulfillmentOrders[0]!.isActive).toBe(false)
    expect(样例.证据[原方案.systemOrderNo]!.原方案有效).toBe(true)
    const 重审 = 取订单(样例, '19')
    expect(重审.items[0]!.systemSku).toBeUndefined()
    expect(样例.证据[重审.systemOrderNo]!.原方案有效).toBe(false)
    expect(原仓单.fulfillmentOrders[0]!.route).not.toBe(原仓单.defaultRoute)
    const 原仓名 = 原仓单.fulfillmentOrders[0]!.route.warehouse
    原仓单.defaultRoute!.warehouse = '另一个虚构新方案仓库'
    expect(原仓单.fulfillmentOrders[0]!.route.warehouse).toBe(原仓名)
  })

  it('共享合单每个来源一件、总计划两件，地址路由一致且没有第二份仓单', () => {
    const 样例 = 创建样例()
    const 仓单 = 样例.执行.find(项 => 项.履约单号 === 'FL-DEMO-ACTION-SHARED')!
    const 来源 = 样例.订单.filter(单 => 仓单.订单号.includes(单.systemOrderNo))
    expect(来源).toHaveLength(2)
    const 总需求 = 来源.reduce((和, 单) => 和 + 单.items.reduce((数量, 行) => 数量 + 行.fulfillableQuantity!, 0), 0)
    expect(总需求).toBe(来源[0]!.fulfillmentOrders[0]!.plannedQuantity)
    expect(来源[1]!.address).toEqual(来源[0]!.address)
    expect(来源[1]!.defaultRoute).toEqual(来源[0]!.defaultRoute)
    expect(来源[1]!.defaultRoute).not.toBe(来源[0]!.defaultRoute)
    expect(样例.执行.filter(项 => 项.履约单号 === 仓单.履约单号)).toHaveLength(1)
    expect(来源.every(单 => 单.items[0]!.orderedQuantity === 1)).toBe(true)
  })
})
