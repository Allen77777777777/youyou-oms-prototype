import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import type { 标发单, 标发状态 } from '../订单标发/标发逻辑'
import type { 作业行 } from './展示工具'
import { 获取作业标发记录 } from './标发状态展示'

function 来源订单(编号: string, 履约编号: string[]): 全渠道订单 {
  const order = structuredClone(全渠道订单模拟数据[0]!)
  const 原履约 = order.fulfillmentOrders[0]!
  order.systemOrderNo = 编号
  order.processingStatus = '已发货'
  order.fulfillmentOrders = 履约编号.map(fulfillmentOrderNo => ({ ...structuredClone(原履约), fulfillmentOrderNo, isActive: true, status: '已发货', shippedQuantity: 1 }))
  return order
}

function 记录(no: string, orderNo: string, fulfillmentNo: string, status: 标发状态 = '待标发'): 标发单 {
  return { no, orderNo, fulfillmentNo, status, tracking: `TRACK-${no}`, carrier: 'USPS', shippedAt: '2026-10-10 10:00:00 UTC+8', quantity: 1, lineId: `LINE-${orderNo}`, idempotencyKey: `KEY-${no}`, pendingVerification: status === '标发失败', reason: '', attempts: [] }
}

function 作业(order: 全渠道订单, fulfillment?: 履约单摘要): 作业行 {
  return { key: fulfillment?.fulfillmentOrderNo ?? order.systemOrderNo, order, fulfillment, stage: order.processingStatus! }
}

const 编号 = (records: 标发单[]) => records.map(record => record.no).sort()

describe('作业标发记录按准确来源与履约关联', () => {
  it('订单主行保留该订单所有标发历史，包括已失效或不再显示在当前履约中的记录及全部五态', () => {
    const order = 来源订单('OMS-TEST-A', ['FL-A', 'FL-OLD'])
    order.fulfillmentOrders[1]!.isActive = false
    order.fulfillmentOrders[1]!.status = '已终止'
    const records = [
      记录('CF-WAIT', order.systemOrderNo, 'FL-A'),
      记录('CF-PENDING', order.systemOrderNo, 'FL-A', '标发中'),
      记录('CF-SUCCESS-OLD', order.systemOrderNo, 'FL-OLD', '标发成功'),
      记录('CF-FAILED-OLD', order.systemOrderNo, 'FL-OLD', '标发失败'),
      记录('CF-EXEMPT-HISTORY', order.systemOrderNo, 'FL-HISTORY', '无需标发'),
      记录('CF-OTHER-ORDER', 'OMS-TEST-A-1', 'FL-A', '标发成功'),
    ]
    expect(编号(获取作业标发记录(作业(order), [order], records))).toEqual(编号(records.slice(0, 5)))
  })

  it('同一订单多履约时，履约主行只读取本次准确履约编号，不能混入其他仓的标发', () => {
    const order = 来源订单('OMS-TEST-A', ['FL-A', 'FL-A-1'])
    const records = [
      记录('CF-A', order.systemOrderNo, 'FL-A', '标发失败'),
      记录('CF-OTHER-FULFILLMENT', order.systemOrderNo, 'FL-A-1', '标发成功'),
      记录('CF-OTHER-SOURCE', 'OMS-TEST-A-1', 'FL-A', '标发成功'),
    ]
    expect(获取作业标发记录(作业(order, order.fulfillmentOrders[0]), [order], records)).toEqual([records[0]])
  })

  it('共享履约读取每个准确来源订单的记录，不取首来源，也不误收同编号但不属于该履约的订单', () => {
    const first = 来源订单('OMS-TEST-A', ['FL-SHARED', 'FL-A'])
    const second = 来源订单('OMS-TEST-B', ['FL-SHARED', 'FL-B'])
    const unrelated = 来源订单('OMS-TEST-C', ['FL-C'])
    const records = [
      记录('CF-FIRST', first.systemOrderNo, 'FL-SHARED', '标发成功'),
      记录('CF-SECOND', second.systemOrderNo, 'FL-SHARED', '标发失败'),
      记录('CF-FIRST-OTHER', first.systemOrderNo, 'FL-A'),
      记录('CF-SECOND-OTHER', second.systemOrderNo, 'FL-B'),
      记录('CF-UNRELATED-SAME-NO', unrelated.systemOrderNo, 'FL-SHARED'),
    ]
    const orders = [second, unrelated, first, structuredClone(first)]
    expect(编号(获取作业标发记录(作业(first, first.fulfillmentOrders[0]), orders, records))).toEqual(['CF-FIRST', 'CF-SECOND'])
  })

  it('订单主行不会因曾共享履约而混入另一来源订单的标发历史', () => {
    const first = 来源订单('OMS-TEST-A', ['FL-SHARED'])
    const second = 来源订单('OMS-TEST-B', ['FL-SHARED'])
    const records = [记录('CF-FIRST', first.systemOrderNo, 'FL-SHARED'), 记录('CF-SECOND', second.systemOrderNo, 'FL-SHARED')]
    expect(获取作业标发记录(作业(second), [first, second], records)).toEqual([records[1]])
  })

  it('没有关联记录时返回空数组，不以已发货、跟踪号或相同仓库推导标发结果', () => {
    const order = 来源订单('OMS-TEST-A', ['FL-A'])
    const other = 来源订单('OMS-TEST-B', ['FL-B'])
    order.fulfillmentOrders[0]!.trackingNumber = 'TRACK-SAME'
    other.fulfillmentOrders[0]!.trackingNumber = 'TRACK-SAME'
    const records = [记录('CF-OTHER', other.systemOrderNo, 'FL-B', '标发成功')]
    records[0]!.tracking = 'TRACK-SAME'
    expect(order.fulfillmentOrders[0]!.route).toEqual(other.fulfillmentOrders[0]!.route)
    expect(获取作业标发记录(作业(order), [order, other], records)).toEqual([])
    expect(获取作业标发记录(作业(order, order.fulfillmentOrders[0]), [order, other], records)).toEqual([])
  })

  it('读取成功、失败和待核查记录不改写订单、仓库执行、标发尝试或日志，也不生成记录', () => {
    const order = 来源订单('OMS-TEST-A', ['FL-A'])
    const row = 作业(order, order.fulfillmentOrders[0])
    row.execution = { 履约单号: 'FL-A', 订单号: [order.systemOrderNo], 出库单号: 'OUT-TEST-A', 状态: '已出库', 待核查: false, 原因: '', 更新时间: '2026-10-10 08:00:00 UTC+8' }
    order.operationLogs = [{ operatedAt: '2026-10-10 08:00:00 UTC+8', operationType: '同步仓库状态', operationResult: '成功', operator: '演示操作员', content: '保留已出库事实' }]
    const records = [记录('CF-SUCCESS', order.systemOrderNo, 'FL-A', '标发成功'), 记录('CF-UNKNOWN', order.systemOrderNo, 'FL-A', '标发失败')]
    records[1]!.attempts.push({ time: '2026-10-10 09:00:00 UTC+8', action: '标发提交', result: '标发失败', evidence: '平台结果待核查' })
    const before = JSON.stringify({ row, orders: [order], records })
    expect(获取作业标发记录(row, [order], records)).toEqual(records)
    expect(JSON.stringify({ row, orders: [order], records })).toBe(before)
  })
})
