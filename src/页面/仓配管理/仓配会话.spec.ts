import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { 共享订单, 仓库执行记录, 当前版本, 执行演示推单 } from '../订单处理/演示会话'
import { 仓库会话单据, 执行仓配会话动作, 创建仓库执行投影 } from './仓配会话'

describe('订单处理与仓库工作台的同源事实', () => {
  it('默认显示十四张完整CK评审单据及四张详情演示仓单，旧预置执行保留领域门禁且不自动投影', async () => {
    expect(仓库执行记录.value.some(item => item.出库单号.startsWith('OUT-'))).toBe(true)
    expect(仓库会话单据.value).toHaveLength(18)
    expect(仓库会话单据.value.every(row => row.no.startsWith('CK') && row.outboundDetail!.items.length > 0)).toBe(true)
    共享订单.value[0]!.storeName += '核对'
    await nextTick()
    expect(仓库会话单据.value).toHaveLength(18)
    expect(仓库会话单据.value.some(row => row.no.startsWith('OUT-'))).toBe(false)
  })
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
    expect(仓库会话单据.value.filter(item => item.no === result.对象号)).toHaveLength(1)
    expect(仓库会话单据.value.some(item => item.no.startsWith('OUT-'))).toBe(false)
  })
  it('显式投影旧超时样例继续同步，重复查询保留原业务身份且不补造明细', async () => {
    // 专项回归显式投影原始历史对象，不把它重新编号或补成完整商品样例。
    const execution = 仓库执行记录.value.find(item => item.履约单号 === 'FL-DEMO-260912-8')!
    const row = 创建仓库执行投影(execution)
    仓库会话单据.value.push(row)
    const originalNo = row.no
    expect(执行仓配会话动作(row, '查询结果').success).toBe(false)
    expect(执行仓配会话动作(row, '重新提交').success).toBe(false)
    expect(row.status).toBe('下单中')
    expect(row.awaitingCheck).toBe(true)
    expect(row.no).toBe(originalNo)
    expect(row.outboundDetail!.items).toEqual([])
    await nextTick()
    expect(仓库会话单据.value.filter(item => item.no === originalNo)).toHaveLength(1)
    expect(执行仓配会话动作(row, '查询结果').success).toBe(false)
    await nextTick()
    expect(仓库会话单据.value.filter(item => item.no === originalNo)).toHaveLength(1)
    expect(row.status).toBe('下单中'); expect(row.outboundDetail!.items).toEqual([])
  })
  it('先在订单处理推单再首次加载工作台，已有提交快照的新执行仍能投影', async () => {
    vi.resetModules()
    const domain = await import('../订单处理/演示会话')
    const order = domain.共享订单.value.find(item => item.systemOrderNo === 'OMS-DEMO-ACTION-07')!
    const result = domain.执行演示推单(order.systemOrderNo, order.fulfillmentOrders[0]!.fulfillmentOrderNo, domain.当前版本(order.systemOrderNo))
    expect(result.成功).toBe(true)
    const session = await import('./仓配会话')
    await nextTick()
    const rows = session.仓库会话单据.value.filter(row => row.no === result.对象号)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outboundDetail!.items.map(item => item.plannedQuantity)).toEqual([2])
    expect(session.仓库会话单据.value).toHaveLength(19)
    expect(session.仓库会话单据.value.some(row => row.no.startsWith('OUT-'))).toBe(false)
  })
})
