import { describe, expect, it } from 'vitest'
import { 拆分阶段演示目录 } from './拆分发货阶段演示'
import { 共享订单, 仓库执行记录, 操作核查证据, 订单版本, 当前版本, 预置仓库评审执行身份, 推单阻断原因, 审核阻断原因, 执行演示推单, 核查演示仓库结果 } from './演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { 获取作业路由 } from './展示工具'
import { 不发货阻断原因 } from './批量操作模型'
import { 退回待审核阻断原因, 同步演示仓库状态 } from './操作功能模型'

const 前缀 = 'OMS-DEMO-SPLIT-STAGE-'
const 查单 = (code: string) => 共享订单.value.find(order => order.systemOrderNo === `${前缀}${code}`)!
const 查执行 = (code: string) => 仓库执行记录.value.filter(execution => execution.订单号.includes(`${前缀}${code}`))

describe('拆分发货各阶段完整虚构事实', () => {
  it('保留原始拆合样例，并提供覆盖六态的八张可搜索阶段订单', () => {
    for (const no of ['OMS-DEMO-SPLIT-01', 'OMS-DEMO-SPLIT-02', 'OMS-DEMO-MERGE-01', 'OMS-DEMO-MERGE-02', 'OMS-DEMO-MERGE-03']) expect(共享订单.value.filter(order => order.systemOrderNo === no)).toHaveLength(1)
    expect(共享订单.value.find(order => order.systemOrderNo === 'OMS-DEMO-SPLIT-02')!.items.map(item => item.fulfillableQuantity)).toEqual([10, 11, 12, 13])
    expect(拆分阶段演示目录.map(item => item.code)).toEqual(['REVIEW', 'READY', 'PARTIAL', 'WAITING', 'SHIPPED', 'EXCEPTION', 'STOPPED', 'LOWSTOCK'])
    expect(new Set(拆分阶段演示目录.map(item => item.status))).toEqual(new Set(['待审核', '待推单', '待发货', '已发货', '异常', '不发货']))
    for (const scenario of 拆分阶段演示目录) {
      const order = 查单(scenario.code)
      expect(order.processingStatus).toBe(scenario.status)
      expect(order.platformOrderNo).toBe(`DEMO-SPLIT-STAGE-${scenario.code}`)
      expect(order.operationLogs[0]!.content).toContain('虚构')
    }
  })

  it('待审核只保存方案，其他阶段保留完整来源分配、审核和两张独立履约快照', () => {
    for (const scenario of 拆分阶段演示目录) {
      const order = 查单(scenario.code), plan = order.manualShippingPlan!
      expect(plan.orderNos).toEqual([order.systemOrderNo])
      expect(plan.packages).toHaveLength(2)
      expect(plan.packages.map(parcel => parcel.route.warehouseProvider)).toEqual(['万邑通', '谷仓'])
      const quantities = scenario.code === 'LOWSTOCK' ? [2, 2] : [4, 6]
      for (const [index, parcel] of plan.packages.entries()) {
        expect(parcel.items).toEqual([{ orderNo: order.systemOrderNo, externalLineId: order.items[index]!.externalLineId, quantity: quantities[index] }])
        expect(parcel.items[0]!.quantity).toBe(order.items[index]!.fulfillableQuantity)
      }
      if (['REVIEW', 'LOWSTOCK'].includes(scenario.code)) {
        expect(order.reviews).toEqual([]); expect(order.fulfillmentOrders).toEqual([]); expect(查执行(scenario.code)).toEqual([])
      } else {
        expect(order.reviews[0]!.status).toBe('已通过')
        expect(order.fulfillmentOrders).toHaveLength(2)
        order.fulfillmentOrders.forEach((fulfillment, index) => {
          expect(fulfillment.fulfillmentOrderNo).toBe(`FL-DEMO-SPLIT-STAGE-${scenario.code}-P${index + 1}`)
          expect(fulfillment.items).toEqual(plan.packages[index]!.items)
          expect(fulfillment.route).toEqual(plan.packages[index]!.route)
          expect(fulfillment.manualPlanId).toBe(plan.id)
          expect(fulfillment.plannedQuantity).toBe(quantities[index])
        })
      }
    }
  })

  it('九张阶段仓单分别保存可信来源、实际路线、逐行范围及与履约一致的数量事实', () => {
    const executions = 仓库执行记录.value.filter(execution => execution.履约单号.startsWith('FL-DEMO-SPLIT-STAGE-'))
    expect(executions).toHaveLength(9)
    expect(new Set(executions.map(execution => execution.出库单号)).size).toBe(9)
    for (const execution of executions) {
      const order = 共享订单.value.find(candidate => candidate.systemOrderNo === execution.订单号[0])!
      const fulfillment = order.fulfillmentOrders.find(candidate => candidate.fulfillmentOrderNo === execution.履约单号)!
      const snapshot = execution.出库快照!
      expect(snapshot.snapshotReliable).toBe(true)
      expect(snapshot.sourceOrders.map(source => source.systemOrderNo)).toEqual([order.systemOrderNo])
      expect(snapshot.route).toEqual(fulfillment.route)
      expect(snapshot.items.map(item => ({ orderNo: item.sourceOrderNo, externalLineId: item.externalLineId, quantity: item.plannedQuantity }))).toEqual(fulfillment.items)
      expect(snapshot.items.every(item => Boolean(item.warehouseSku) && item.unit === '件')).toBe(true)
      expect(snapshot.quantitySummary.plannedQuantity).toBe(fulfillment.plannedQuantity)
      expect(snapshot.quantitySummary.shippedQuantity).toBe(fulfillment.shippedQuantity)
      expect(execution.出库事实).toMatchObject({ planned: fulfillment.plannedQuantity, shipped: fulfillment.shippedQuantity, tracking: fulfillment.trackingNumber || null, shippedAt: fulfillment.shippedAt || null })
    }
  })

  it('各阶段由真实包裹及仓单事实支撑，已发货两包足量，停止发货两包均安全结束且零出库', () => {
    expect(查执行('READY')).toEqual([])
    expect(查执行('PARTIAL').map(execution => execution.状态)).toEqual(['待出库'])
    expect(查单('PARTIAL').fulfillmentOrders.map(fulfillment => fulfillment.status)).toEqual(['执行中', '待执行'])
    expect(查执行('WAITING').map(execution => execution.状态)).toEqual(['待出库', '待出库'])
    const shipped = 查单('SHIPPED')
    expect(shipped.fulfillmentOrders.map(fulfillment => fulfillment.shippedQuantity)).toEqual([4, 6])
    expect(shipped.fulfillmentOrders.every(fulfillment => fulfillment.status === '已发货' && fulfillment.trackingNumber && fulfillment.shippedAt)).toBe(true)
    expect(查执行('SHIPPED').every(execution => execution.状态 === '已出库' && execution.出库事实!.shipped === execution.出库事实!.planned)).toBe(true)
    expect(查单('EXCEPTION').blockReason).toContain('第二包')
    expect(查执行('EXCEPTION').map(execution => execution.状态)).toEqual(['待出库', '出库异常'])
    expect(查单('STOPPED').fulfillmentOrders.every(fulfillment => !fulfillment.isActive && fulfillment.status === '已终止' && fulfillment.shippedQuantity === 0)).toBe(true)
    expect(查执行('STOPPED').every(execution => execution.状态 === '已取消' && !execution.待核查 && execution.出库事实!.shipped === 0)).toBe(true)
    expect(查单('STOPPED').noShipmentReason).toContain('零出库')
    expect(操作核查证据.value[shipped.systemOrderNo]!.零出库已核实).toBe(false)
  })

  it('新阶段九张仓单在三方仓出库页面可见，旧预置评审执行隐藏策略保持原样', () => {
    const stageRows = 仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-SPLIT-STAGE-'))
    expect(stageRows).toHaveLength(9)
    expect(预置仓库评审执行身份.every(identity => !identity.includes('FL-DEMO-SPLIT-STAGE-'))).toBe(true)
    expect(预置仓库评审执行身份.some(identity => identity.includes('FL-DEMO-ACTION-'))).toBe(true)
    for (const row of stageRows) {
      const execution = 仓库执行记录.value.find(candidate => candidate.出库单号 === row.no)!
      expect(row.fulfillment).toBe(execution.履约单号)
      expect(row.order).toBe(execution.订单号[0])
      expect(row.outboundDetail!.snapshotReliable).toBe(true)
      expect(row.planned).toBe(execution.出库事实!.planned)
      expect(row.shipped).toBe(execution.出库事实!.shipped)
    }
  })

  it('待审核两仓路线完整，可推单只放行未提交包裹；已有仓单或终态不允许重推', () => {
    const review = 查单('REVIEW')
    expect(获取作业路由({ key: review.systemOrderNo, order: review, stage: '待审核' }).map(route => route.warehouseProvider)).toEqual(['万邑通', '谷仓'])
    expect(审核阻断原因(review)).toEqual([])
    const partial = 查单('PARTIAL')
    expect(推单阻断原因(partial, partial.fulfillmentOrders[0]!.fulfillmentOrderNo).join('；')).toContain('不允许重复建单')
    expect(推单阻断原因(partial, partial.fulfillmentOrders[1]!.fulfillmentOrderNo)).toEqual([])
    for (const code of ['WAITING', 'SHIPPED', 'EXCEPTION', 'STOPPED']) {
      const order = 查单(code)
      for (const fulfillment of order.fulfillmentOrders) expect(推单阻断原因(order, fulfillment.fulfillmentOrderNo).length).toBeGreaterThan(0)
    }
    expect(不发货阻断原因(review).join('；')).toContain('先撤销')
    expect(退回待审核阻断原因(查单('READY')).join('；')).toContain('人工拆合方案')
  })

  it('不足例使用两条完整 eBay 平台行映射同一低库存 SKU，审核阶段明确拦截', () => {
    const order = 查单('LOWSTOCK')
    expect(order.items.map(item => item.systemSku)).toEqual(['DEMO-SKU-LOW-STOCK', 'DEMO-SKU-LOW-STOCK'])
    expect(new Set(order.items.map(item => item.externalLineId)).size).toBe(2)
    expect(order.manualShippingPlan!.packages.map(parcel => parcel.items[0]!.quantity)).toEqual([2, 2])
    const reasons = 审核阻断原因(order)
    expect(reasons.filter(reason => reason.includes('本仓可用库存 1 件') && reason.includes('总需求 2 件'))).toHaveLength(2)
  })

  it('逐包推进时只认本包出库事实，第一包出库不妨碍第二包推仓，全包完成后才聚合已发货', () => {
    const baseline = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, versions: 订单版本.value, rows: 仓库会话单据.value })
    try {
      const order = 查单('READY'), [first, second] = order.fulfillmentOrders
      const firstPush = 执行演示推单(order.systemOrderNo, first!.fulfillmentOrderNo, 当前版本(order.systemOrderNo))
      expect(firstPush.成功, firstPush.信息).toBe(true)
      expect(核查演示仓库结果(first!.fulfillmentOrderNo).成功).toBe(true)
      expect(order.processingStatus).toBe('待推单')
      操作核查证据.value[order.systemOrderNo]!.同步结果 = '已出库'
      expect(同步演示仓库状态(firstPush.对象号!).成功).toBe(true)
      expect(order.fulfillmentOrders.map(fulfillment => fulfillment.shippedQuantity)).toEqual([4, 0])
      expect(order.processingStatus).toBe('待推单')
      expect(推单阻断原因(order, second!.fulfillmentOrderNo)).toEqual([])
      const secondPush = 执行演示推单(order.systemOrderNo, second!.fulfillmentOrderNo, 当前版本(order.systemOrderNo))
      expect(secondPush.成功, secondPush.信息).toBe(true)
      expect(核查演示仓库结果(second!.fulfillmentOrderNo).成功).toBe(true)
      expect(order.processingStatus).toBe('待发货')
      expect(同步演示仓库状态(secondPush.对象号!).成功).toBe(true)
      expect(order.processingStatus).toBe('已发货')
      expect(order.fulfillmentOrders.map(fulfillment => fulfillment.shippedQuantity)).toEqual([4, 6])
      expect(查执行('READY').map(execution => execution.出库事实!.shipped)).toEqual([4, 6])
      expect(查执行('READY').map(execution => execution.出库快照!.items.length)).toEqual([1, 1])
    } finally {
      const data = JSON.parse(baseline)
      共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
      订单版本.value = data.versions; 仓库会话单据.value = data.rows
    }
  })
})
