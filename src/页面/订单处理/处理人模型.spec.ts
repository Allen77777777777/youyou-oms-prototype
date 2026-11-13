import { afterEach, describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单, 订单商品行 } from '../全渠道订单/类型'
import type { 作业行 } from './展示工具'
import { 当前订单处理人ID, 创建订单处理人分配, 初始化订单处理人, 获取订单处理人, 获取商品运营人员, 获取订单处理人缺失原因, 获取作业处理人, 获取作业处理人缺失原因, 处理人姓名 } from './处理人模型'
import { 默认订单处理筛选, 命中订单处理筛选, type 订单处理筛选条件 } from './筛选模型'

const 时间 = '2026-11-13T02:00:00Z'
function 订单(skus: string[], id = 'OPS-A'): 全渠道订单 {
  const 原单 = structuredClone(全渠道订单模拟数据[0]!)
  return {
    ...原单, systemOrderNo: id, fulfillmentMode: '自配送', processingStatus: '待审核', storeId: id,
    fulfillmentOrders: [], operationLogs: [], handlerAssignment: undefined,
    items: skus.map((systemSku, i): 订单商品行 => ({ ...原单.items[0]!, externalLineId: `${id}-L${i}`, systemSku: systemSku || undefined, skuResolutionStatus: systemSku ? '成功' : '缺失' })),
  }
}
function 分配(skus: string[], id = 'OPS-A') {
  const 单 = 订单(skus, id)
  初始化订单处理人(单, 时间)
  return 单
}
function 作业(单: 全渠道订单): 作业行 { return { key: 单.systemOrderNo, order: 单, stage: '待审核' } }
function 合并行(甲: 全渠道订单, 乙: 全渠道订单): 作业行 {
  const 履约 = { fulfillmentOrderNo: 'FL-OPS-MERGED', status: '待执行' as const, isActive: true, route: 甲.defaultRoute!, plannedQuantity: 2, shippedQuantity: 0 }
  甲.fulfillmentOrders = [structuredClone(履约)]
  乙.fulfillmentOrders = [structuredClone(履约)]
  return { key: 履约.fulfillmentOrderNo, order: 甲, stage: '待推单', fulfillment: 履约 }
}
function 查询(行: 作业行, 筛选: Partial<订单处理筛选条件>, orders = [行.order], currentUserId?: string) {
  return 命中订单处理筛选(行, { ...默认订单处理筛选(), ...筛选 }, { orders, inventory: {}, flags: () => [], currentUserId })
}
afterEach(() => { 当前订单处理人ID.value = 'staff-01' })

describe('订单处理人快照与商品运营人员', () => {
  it('按可信系统 SKU 读取共用人员，同一员工多行只保留一次，来源行仍完整', () => {
    const 单 = 分配(['DEMO-SKU-1', 'YY-CA-1048-US', 'DEMO-SKU-2'])
    expect(获取订单处理人(单)).toEqual(['staff-01', 'staff-02'])
    expect(处理人姓名(获取订单处理人(单))).toBe('客服01、客服02')
    expect(单.handlerAssignment?.lines).toHaveLength(3)
    expect(获取商品运营人员(单, 单.items[0]!)).toEqual(['staff-01'])
    expect(获取商品运营人员(单, 单.items[2]!)).toEqual(['staff-02'])
    expect(单.handlerAssignment).toMatchObject({ assignedAt: 时间, source: 'SKU' })
  })
  it('部分未绑定保留已取得人员；未识别系统 SKU 不借平台 SKU 或残留系统 SKU 分配', () => {
    const 单 = 订单(['DEMO-SKU-1', 'UNKNOWN', 'DEMO-SKU-2'])
    单.items[2]!.skuResolutionStatus = '冲突'
    初始化订单处理人(单, 时间)
    expect(获取订单处理人(单)).toEqual(['staff-01'])
    expect(获取商品运营人员(单, 单.items[2]!)).toEqual([])
    expect(获取订单处理人缺失原因(单)).toEqual(['UNKNOWN：系统 SKU 无运营人员', 'DEMO-SKU-2：系统 SKU 未识别'])
    const 空 = 分配(['', 'UNKNOWN'])
    expect(处理人姓名(获取订单处理人(空))).toBe('未分配')
    expect(获取订单处理人缺失原因(空)).toHaveLength(2)
  })
  it('商品目录换人不覆盖存量，读取名单及返回数组不能改写保存记录', () => {
    const 单 = 订单(['DEMO-SKU-1'])
    let 当前运营 = 'staff-02'
    单.handlerAssignment = 创建订单处理人分配(单, 时间, () => [当前运营])
    当前运营 = 'staff-03'
    初始化订单处理人(单, '2026-11-14T02:00:00Z')
    const 名单 = 获取订单处理人(单)
    名单.push('staff-01')
    expect(获取订单处理人(单)).toEqual(['staff-02'])
    expect(单.handlerAssignment.assignedAt).toBe(时间)
    expect(创建订单处理人分配(单, 'new', () => [当前运营]).handlerIds).toEqual(['staff-03'])
  })
  it('空名单不会在后续初始化被恢复，缺少历史快照的普通查询不写入数据', () => {
    const 单 = 订单(['DEMO-SKU-1'])
    单.handlerAssignment = 创建订单处理人分配(单, 时间, () => [])
    初始化订单处理人(单)
    expect(获取订单处理人(单)).toEqual([])
    const 旧单 = 订单(['DEMO-SKU-1'])
    expect(获取订单处理人(旧单)).toEqual([])
    expect(获取订单处理人缺失原因(旧单)).toEqual(['尚未取得订单处理人分配记录'])
    expect(旧单.handlerAssignment).toBeUndefined()
  })
  it('未分配不改变订单阶段、已有审核或实际操作记录', () => {
    const 单 = 订单(['UNKNOWN'])
    const 原值 = JSON.stringify({ stage: 单.processingStatus, review: 单.reviews, logs: 单.operationLogs })
    初始化订单处理人(单)
    expect(JSON.stringify({ stage: 单.processingStatus, review: 单.reviews, logs: 单.operationLogs })).toBe(原值)
  })
})

describe('拆合单处理人及筛选', () => {
  it('拆包只包含一人商品时仍保留来源订单的整单处理人', () => {
    const 单 = 分配(['DEMO-SKU-1', 'DEMO-SKU-2'])
    单.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-SPLIT', status: '待执行', isActive: true, route: 单.defaultRoute!, plannedQuantity: 1, shippedQuantity: 0, items: [{ orderNo: 单.systemOrderNo, externalLineId: 单.items[0]!.externalLineId, quantity: 1 }] }]
    const 行: 作业行 = { ...作业(单), fulfillment: 单.fulfillmentOrders[0], stage: '待推单' }
    expect(获取作业处理人(行, [单])).toEqual(['staff-01', 'staff-02'])
    expect(查询(行, { handler: ['staff-02'] })).toBe(true)
  })
  it('共享履约展示所有有效来源去重并集，未分配来源可追溯且失效来源不混入', () => {
    const 甲 = 分配(['DEMO-SKU-1']), 乙 = 分配(['DEMO-SKU-2', 'UNKNOWN'], 'OPS-B'), 失效 = 分配(['DEMO-SKU-3'], 'OPS-X')
    const 行 = 合并行(甲, 乙)
    失效.fulfillmentOrders = [{ ...structuredClone(行.fulfillment!), isActive: false }]
    expect(获取作业处理人(行, [甲, 乙, 乙, 失效])).toEqual(['staff-01', 'staff-02'])
    expect(获取作业处理人缺失原因(行, [甲, 乙])).toEqual(['OPS-B · UNKNOWN：系统 SKU 无运营人员'])
    expect(获取订单处理人(甲)).toEqual(['staff-01'])
    expect(获取订单处理人(乙)).toEqual(['staff-02'])
  })
  it('处理人多选 OR、其他字段 AND，未分配只匹配无处理人的整单', () => {
    const 单 = 分配(['DEMO-SKU-1', 'UNKNOWN'])
    expect(查询(作业(单), { handler: ['staff-02', 'staff-01'] })).toBe(true)
    expect(查询(作业(单), { handler: ['staff-02'] })).toBe(false)
    expect(查询(作业(单), { handler: [''] })).toBe(false)
    const 空 = 分配(['UNKNOWN'])
    expect(查询(作业(空), { handler: ['staff-01', ''] })).toBe(true)
    expect(查询(作业(单), { handler: ['staff-01'], store: ['other'] })).toBe(false)
  })
  it('只看我的按当前稳定身份匹配并与处理人条件组合，缺当前身份时不会误中', () => {
    const 单 = 分配(['DEMO-SKU-1', 'DEMO-SKU-2'])
    expect(查询(作业(单), { onlyMine: true })).toBe(true)
    当前订单处理人ID.value = 'staff-03'
    expect(查询(作业(单), { onlyMine: true })).toBe(false)
    expect(查询(作业(单), { onlyMine: true }, [单], 'staff-02')).toBe(true)
    expect(查询(作业(单), { onlyMine: true }, [单], '')).toBe(false)
    expect(查询(作业(单), { onlyMine: true, handler: ['staff-03'] }, [单], 'staff-01')).toBe(false)
  })
  it('共享履约必须同一来源满足处理人、只看我的与店铺条件，不能跨单拼条件', () => {
    const 甲 = 分配(['DEMO-SKU-1']), 乙 = 分配(['DEMO-SKU-2'], 'OPS-B')
    const 行 = 合并行(甲, 乙), 全集 = [甲, 乙]
    expect(查询(行, { handler: ['staff-02'], store: ['OPS-A'] }, 全集)).toBe(false)
    expect(查询(行, { onlyMine: true, store: ['OPS-B'] }, 全集, 'staff-01')).toBe(false)
    expect(查询(行, { handler: ['staff-02'], onlyMine: true }, 全集, 'staff-01')).toBe(false)
    expect(查询(行, { handler: ['staff-02'], onlyMine: true, store: ['OPS-B'] }, 全集, 'staff-02')).toBe(true)
  })
})
