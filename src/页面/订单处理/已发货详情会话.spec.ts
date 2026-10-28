import { describe, expect, it } from 'vitest'
import { 共享订单, 仓库执行记录 } from './演示会话'
import { 订单关联仓库执行 } from './操作功能模型'
import { 计算订单标志 } from './订单标志模型'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { 共享标发单 } from '../订单标发/演示会话'

const 来源订单号 = ['OMS-DEMO-DETAIL-SPLIT', 'OMS-DEMO-DETAIL-NORMAL', 'OMS-DEMO-DETAIL-MERGE', 'OMS-DEMO-DETAIL-MERGE-B']
const 有序 = (values: string[]) => [...values].sort()
const 详情订单 = () => 共享订单.value.filter(order => 来源订单号.includes(order.systemOrderNo))
const 详情执行 = () => 仓库执行记录.value.filter(execution => execution.履约单号.startsWith('FL-DEMO-DETAIL-'))
const 详情标发 = () => 共享标发单.value.filter(mark => 来源订单号.includes(mark.orderNo))

describe('已发货详情演示会话联通', () => {
  it('三个详情场景进入共享已发货订单，拆合标志和履约关联保持一致', () => {
    const orders = 详情订单()
    expect(有序(orders.map(order => order.systemOrderNo))).toEqual(有序(来源订单号))
    const expectedFlags: Record<string, string[]> = {
      'OMS-DEMO-DETAIL-SPLIT': ['SPLIT'],
      'OMS-DEMO-DETAIL-NORMAL': [],
      'OMS-DEMO-DETAIL-MERGE': ['MERGED'],
      'OMS-DEMO-DETAIL-MERGE-B': ['MERGED'],
    }
    for (const order of orders) {
      expect(order.processingStatus).toBe('已发货')
      expect(order.platformOrderStatus).toBe('FULFILLED')
      expect(计算订单标志(order).filter(flag => ['SPLIT', 'MERGED'].includes(flag.code)).map(flag => flag.code)).toEqual(expectedFlags[order.systemOrderNo])
      const fulfillments = order.fulfillmentOrders.filter(fulfillment => fulfillment.isActive)
      expect(fulfillments).toHaveLength(order.systemOrderNo.endsWith('SPLIT') ? 2 : 1)
      const executions = 订单关联仓库执行(order)
      expect(有序(executions.map(execution => execution.履约单号))).toEqual(有序(fulfillments.map(fulfillment => fulfillment.fulfillmentOrderNo)))
      expect(executions.every(execution => execution.订单号.includes(order.systemOrderNo))).toBe(true)
    }
  })

  it('四条独立出库执行均可从仓配会话打开，合并来源共用一张仓单且逐行数量明确', () => {
    const executions = 详情执行()
    expect(executions).toHaveLength(4)
    expect(new Set(executions.map(execution => execution.履约单号)).size).toBe(4)
    expect(new Set(executions.map(execution => execution.出库单号)).size).toBe(4)
    const merged = executions.filter(execution => execution.订单号.length > 1)
    expect(merged).toHaveLength(1)
    expect(有序(merged[0]!.订单号)).toEqual(['OMS-DEMO-DETAIL-MERGE', 'OMS-DEMO-DETAIL-MERGE-B'])

    for (const execution of executions) {
      expect(execution.状态).toBe('已出库')
      const rows = 仓库会话单据.value.filter(row => row.no === execution.出库单号)
      expect(rows).toHaveLength(1)
      const row = rows[0]!, snapshot = row.outboundDetail!
      expect(row.fulfillment).toBe(execution.履约单号)
      expect(row.status).toBe('已出库')
      expect(有序(row.order.split('、'))).toEqual(有序(execution.订单号))
      expect(snapshot.snapshotReliable).toBe(true)
      expect(有序(snapshot.sourceOrders.map(source => source.systemOrderNo))).toEqual(有序(execution.订单号))
      expect(snapshot.items.length).toBeGreaterThan(0)
      for (const item of snapshot.items) {
        const source = 详情订单().find(order => order.systemOrderNo === item.sourceOrderNo)!
        expect(source).toBeDefined()
        const line = source.items.find(line => line.externalLineId === item.externalLineId)!
        expect(line).toBeDefined()
        const fulfillment = source.fulfillmentOrders.find(fulfillment => fulfillment.fulfillmentOrderNo === execution.履约单号)!
        const allocation = fulfillment.items!.find(allocation => allocation.orderNo === item.sourceOrderNo && allocation.externalLineId === item.externalLineId)!
        expect(allocation).toBeDefined()
        expect(item.plannedQuantity).toBe(allocation.quantity)
        expect(item.shippedQuantity).toBe(allocation.quantity)
        expect(item.systemSku).toBe(line.systemSku)
      }
      const shipped = snapshot.items.reduce((sum, item) => sum + item.shippedQuantity!, 0)
      expect(row.shipped).toBe(shipped)
      expect(row.planned).toBe(shipped)
      expect(row.shipped).toBe(execution.出库事实!.shipped)
      expect(row.tracking).toBe(execution.出库事实!.tracking)
    }
  })

  it('标发会话按来源商品行隔离，合并包裹不将整包数量重复标发到两个来源', () => {
    const marks = 详情标发()
    expect(marks).toHaveLength(5)
    expect(new Set(marks.map(mark => mark.no)).size).toBe(5)
    expect(new Set(marks.map(mark => mark.idempotencyKey)).size).toBe(5)
    for (const order of 详情订单()) {
      for (const line of order.items) {
        const lineMarks = marks.filter(mark => mark.orderNo === order.systemOrderNo && mark.lineId === line.externalLineId)
        expect(lineMarks).toHaveLength(1)
        expect(lineMarks[0]!.quantity).toBe(line.orderedQuantity)
      }
    }
    for (const mark of marks) {
      const execution = 详情执行().find(execution => execution.出库单号 === mark.outboundNo)!
      expect(execution).toBeDefined()
      expect(execution.订单号).toContain(mark.orderNo)
      expect(mark.fulfillmentNo).toBe(execution.履约单号)
      expect(mark.status).toBe('标发成功')
      expect(mark.pendingVerification).toBe(false)
      expect(mark.tracking).toBe(execution.出库事实!.tracking)
      const sourceLine = execution.出库快照!.items.find(item => item.sourceOrderNo === mark.orderNo && item.externalLineId === mark.lineId)!
      expect(sourceLine).toBeDefined()
      expect(mark.quantity).toBe(sourceLine.shippedQuantity)
    }
    const mergedExecution = 详情执行().find(execution => execution.订单号.length === 2)!
    const mergedMarks = marks.filter(mark => mark.fulfillmentNo === mergedExecution.履约单号)
    expect(有序(mergedMarks.map(mark => mark.orderNo))).toEqual(有序(mergedExecution.订单号))
    expect(mergedMarks.reduce((sum, mark) => sum + mark.quantity, 0)).toBe(mergedExecution.出库事实!.shipped)
  })
})
