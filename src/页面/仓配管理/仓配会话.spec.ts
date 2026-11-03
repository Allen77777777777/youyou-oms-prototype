import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { 共享订单, 仓库执行记录, 当前版本, 执行演示推单, 评价跟踪OMS样例, 取消申请OMS样例 } from '../订单处理/演示会话'
import { 仓库会话单据, 执行仓配会话动作, 创建仓库执行投影 } from './仓配会话'
import { 创建出库工作台样例 } from './三方仓出库模型'

const 拆分阶段仓单 = [
  ['PARTIAL', 1, '待出库', 4],
  ['WAITING', 1, '待出库', 4], ['WAITING', 2, '待出库', 6],
  ['SHIPPED', 1, '已出库', 4], ['SHIPPED', 2, '已出库', 6],
  ['EXCEPTION', 1, '待出库', 4], ['EXCEPTION', 2, '出库异常', 6],
  ['STOPPED', 1, '已取消', 4], ['STOPPED', 2, '已取消', 6],
] as const
const 已发货详情仓单号 = ['SPLIT-P1', 'SPLIT-P2', 'NORMAL', 'MERGE'].map(suffix => `CK-DEMO-DETAIL-${suffix}`)
const 评价跟踪仓单号 = 评价跟踪OMS样例.执行.map(execution => execution.出库单号)
const 取消申请仓单号 = 取消申请OMS样例.执行.map(execution => execution.出库单号)
const 默认仓单数 = 14 + 9 + 4 + 评价跟踪仓单号.length + 取消申请仓单号.length

describe('订单处理与仓库工作台的同源事实', () => {
  it('默认保留原CK、拆分及已发货详情仓单并追加评价跟踪CK，旧预置执行仍不自动投影', async () => {
    const 操作前数量 = 仓库会话单据.value.length
    expect(操作前数量).toBe(默认仓单数)
    expect(仓库执行记录.value.some(item => item.出库单号.startsWith('OUT-'))).toBe(true)
    const 原十四张 = 仓库会话单据.value.filter(row => /^CK261010\d{4}$/.test(row.no))
    expect(原十四张).toHaveLength(14)
    expect(原十四张).toEqual(创建出库工作台样例())
    const 阶段 = 仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-SPLIT-STAGE-'))
    expect(阶段.map(row => row.no).sort()).toEqual(拆分阶段仓单.map(([场景, 包]) => `CK-DEMO-SPLIT-STAGE-${场景}-P${包}`).sort())
    for (const [场景, 包, 状态, 数量] of 拆分阶段仓单) {
      const row = 阶段.find(item => item.no === `CK-DEMO-SPLIT-STAGE-${场景}-P${包}`)!
      expect(row).toMatchObject({ order: `OMS-DEMO-SPLIT-STAGE-${场景}`, fulfillment: `FL-DEMO-SPLIT-STAGE-${场景}-P${包}`, status: 状态, planned: 数量 })
      expect(row.outboundDetail!.snapshotReliable).toBe(true)
      expect(row.outboundDetail!.items).toEqual([expect.objectContaining({ sourceOrderNo: row.order, externalLineId: `DEMO-SPLIT-STAGE-${场景}-L${包}`, plannedQuantity: 数量 })])
    }
    expect(仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-DETAIL-')).map(row => row.no).sort()).toEqual([...已发货详情仓单号].sort())
    expect(仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-AWAIT-')).map(row => row.no).sort()).toEqual([...评价跟踪仓单号].sort())
    expect(仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-CXL-')).map(row => row.no).sort()).toEqual([...取消申请仓单号].sort())
    expect(仓库会话单据.value.every(row => row.no.startsWith('CK') && row.outboundDetail!.items.length > 0)).toBe(true)
    共享订单.value[0]!.storeName += '核对'
    await nextTick()
    expect(仓库会话单据.value).toHaveLength(操作前数量)
    expect(仓库会话单据.value.some(row => row.no.startsWith('OUT-'))).toBe(false)
  })
  it('推单后可用同一履约单定位，核查受理回写订单阶段且不伪造出库', async () => {
    const 操作前数量 = 仓库会话单据.value.length
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
    expect(仓库会话单据.value).toHaveLength(操作前数量 + 1)
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
    expect(session.仓库会话单据.value.filter(row => /^CK261010\d{4}$/.test(row.no))).toEqual(创建出库工作台样例())
    expect(session.仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-SPLIT-STAGE-')).map(row => row.no).sort()).toEqual(拆分阶段仓单.map(([场景, 包]) => `CK-DEMO-SPLIT-STAGE-${场景}-P${包}`).sort())
    expect(session.仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-DETAIL-')).map(row => row.no).sort()).toEqual([...已发货详情仓单号].sort())
    expect(session.仓库会话单据.value.filter(row => row.no.startsWith('CK-DEMO-AWAIT-')).map(row => row.no).sort()).toEqual([...评价跟踪仓单号].sort())
    expect(session.仓库会话单据.value).toHaveLength(默认仓单数 + 1)
    expect(session.仓库会话单据.value.some(row => row.no.startsWith('OUT-'))).toBe(false)
  })
})
