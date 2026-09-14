import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { 共享订单, 当前版本, 执行演示推单 } from '../订单处理/演示会话'
import { 仓库会话单据, 执行仓配会话动作 } from './仓配会话'

describe('订单处理与仓库工作台的同源事实', () => {
  it('推单后可用同一履约单定位，核查受理回写订单阶段且不伪造出库', async () => {
    const order = 共享订单.value.find(o => o.fulfillmentOrders.some(f => f.fulfillmentOrderNo === 'FL-DEMO-260912-6'))!
    const result = 执行演示推单(order.systemOrderNo, 'FL-DEMO-260912-6', 当前版本(order.systemOrderNo))
    expect(result.成功).toBe(true)
    await nextTick()
    const row = 仓库会话单据.value.find(r => r.fulfillment === 'FL-DEMO-260912-6')!
    expect(row.no).toBe(result.对象号)
    expect(row.status).toBe('下单中')
    expect(order.processingStatus).toBe('待推单')
    const query = 执行仓配会话动作(row, '查询结果')
    expect(query.success).toBe(true)
    expect(row.status).toBe('待出库')
    expect(order.processingStatus).toBe('待发货')
    expect(row.shipped).toBe(0)
    expect(row.tracking).toBe('')
    expect(row.attempts.length).toBe(1)
  })
  it('共享超时样例始终阻断重推，重复查询保留原业务身份', () => {
    const row = 仓库会话单据.value.find(r => r.fulfillment === 'FL-DEMO-260912-8')!
    const originalNo = row.no
    expect(执行仓配会话动作(row, '查询结果').success).toBe(false)
    expect(执行仓配会话动作(row, '重新提交').success).toBe(false)
    expect(row.status).toBe('下单中')
    expect(row.awaitingCheck).toBe(true)
    expect(row.no).toBe(originalNo)
  })
})
