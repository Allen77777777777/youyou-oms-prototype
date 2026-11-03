import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 关联演示数据, type 关联查询数据 } from './库存关联模型'
import { 查询人工方案库存 } from './拆合发货库存'
import { 创建拆分发货草稿, 保存人工发货方案 } from './拆合发货模型'
import {
  共享订单, 仓库执行记录, 演示库存, 订单版本, 操作核查证据, 演示路由,
  人工发货上下文, 当前版本, 执行演示审核, 执行演示保存并审核, 执行演示推单, 核查演示仓库结果, 推单阻断原因,
} from './演示会话'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
function 库存数据(): 关联查询数据 {
  const 数据 = 克隆(关联演示数据)
  数据.scopes = 数据.scopes.filter(仓 => ['order-demo-winit', 'order-demo-good'].includes(仓.id))
  数据.mappings = 数据.scopes.flatMap(仓 => [
    { scopeId: 仓.id, systemSku: 'INV-A', warehouseSku: `WH-A-${仓.id}`, status: '已映射' as const },
    { scopeId: 仓.id, systemSku: 'INV-B', warehouseSku: `WH-B-${仓.id}`, status: '已映射' as const },
  ])
  const 模板 = 数据.inventory.find(项 => 项.quality === '良品')!
  数据.inventory = 数据.mappings.map((映射, 索引) => {
    const 仓 = 数据.scopes.find(项 => 项.id === 映射.scopeId)!
    return { ...克隆(模板), ...仓, id: `INV-SOURCE-${索引}`, systemSku: 映射.systemSku, warehouseSku: 映射.warehouseSku, quality: '良品', unit: '件', sourceCustomer: 'INV-CUSTOMER', mapping: '已映射', presence: '已确认存在', enabled: true, issues: [], quantities: { ...模板.quantities, available: 10 } }
  })
  数据.aging = []; 数据.snapshots = []
  return 数据
}
function 路由(数据: 关联查询数据, 索引: number): 订单路由 {
  const 仓 = 数据.scopes[索引]!
  return { warehouseProvider: 仓.provider, warehouseAccount: 仓.account, warehouse: 仓.warehouse, shippingChannel: '测试物流', shippingChannelCode: 'TEST-CHANNEL', labelMode: '仓配一体' }
}
function 来源订单(): 全渠道订单 {
  const 单 = 克隆(全渠道订单模拟数据[0]!)
  return { ...单, systemOrderNo: 'INV-ORDER', processingStatus: '待审核', fulfillmentMode: '自配送', blockReason: undefined, cancelledAt: undefined, manualShippingPlan: undefined, fulfillmentOrders: [], reviews: [], operationLogs: [], items: [
    { ...单.items[0]!, externalLineId: 'L1', systemSku: 'INV-A', orderedQuantity: 6, fulfillableQuantity: 6, skuResolutionStatus: '成功' },
    { ...单.items[0]!, externalLineId: 'L2', systemSku: 'INV-B', orderedQuantity: 4, fulfillableQuantity: 4, skuResolutionStatus: '成功' },
  ] }
}
function 方案(单: 全渠道订单, 数据: 关联查询数据): 人工发货方案 {
  const 草稿 = 创建拆分发货草稿(单)
  草稿.packages[0]!.route = 路由(数据, 0)
  草稿.packages[1]!.route = 路由(数据, 1)
  草稿.reason = '测试按每包精确仓库校验库存'
  return 草稿
}

describe('人工发货方案的精确来源库存', () => {
  it('按每包已选仓库及系统SKU→仓库SKU映射，只读良品可用库存并保留来源时间', () => {
    const 数据 = 库存数据(), 单 = 来源订单(), 草稿 = 方案(单, 数据)
    const 原数据 = JSON.stringify(数据), 原单 = JSON.stringify(单), 原方案 = JSON.stringify(草稿)
    const 结果 = 查询人工方案库存(草稿, [单], 数据)
    expect(结果.reasons).toEqual([])
    expect(结果.rows.map(行 => [行.packageIndex, 行.required, 行.scopeRequired, 行.available, 行.remaining, 行.status])).toEqual([[0, 6, 6, 10, 4, '充足'], [1, 4, 4, 10, 6, '充足']])
    expect(结果.rows.map(行 => 行.warehouseSku)).toEqual(['WH-A-order-demo-winit', 'WH-B-order-demo-good'])
    expect(结果.rows.every(行 => 行.sourceAt === 数据.inventory[0]!.sourceAt && Boolean(行.sourceKey))).toBe(true)
    expect(JSON.stringify(数据)).toBe(原数据)
    expect(JSON.stringify(单)).toBe(原单)
    expect(JSON.stringify(草稿)).toBe(原方案)
  })

  it('同仓同warehouseSKU跨包、跨系统SKU合并本次需求，不能各包分别透支可用库存', () => {
    const 数据 = 库存数据(), 单 = 来源订单(), 草稿 = 方案(单, 数据)
    草稿.packages[1]!.route = 路由(数据, 0)
    数据.mappings.find(项 => 项.scopeId === 'order-demo-winit' && 项.systemSku === 'INV-B')!.warehouseSku = 'WH-A-order-demo-winit'
    数据.inventory[0]!.quantities.available = 8
    const 结果 = 查询人工方案库存(草稿, [单], 数据)
    expect(结果.rows.map(行 => [行.required, 行.scopeRequired, 行.available, 行.remaining, 行.status])).toEqual([[6, 10, 8, -2, '不足'], [4, 10, 8, -2, '不足']])
    expect(结果.rows[0]!.sourceKey).toBe(结果.rows[1]!.sourceKey)
    expect(结果.reasons).toHaveLength(2)
    expect(数据.inventory[0]!.quantities.available).toBe(8)
    数据.inventory[0]!.quantities.available = 10
    expect(查询人工方案库存(草稿, [单], 数据).reasons).toEqual([])
  })

  it('同系统SKU多平台行合并需求，跨仓独立来源不能互补', () => {
    const 数据 = 库存数据(), 单 = 来源订单(), 草稿 = 方案(单, 数据)
    单.items[1]!.systemSku = 'INV-A'
    草稿.packages[1]!.route = 路由(数据, 0)
    数据.inventory[0]!.quantities.available = 9
    expect(查询人工方案库存(草稿, [单], 数据).rows.map(行 => 行.scopeRequired)).toEqual([10, 10])
    草稿.packages[1]!.route = 路由(数据, 1)
    数据.inventory[0]!.quantities.available = 5
    数据.inventory[2]!.quantities.available = 100
    const 结果 = 查询人工方案库存(草稿, [单], 数据)
    expect(结果.rows.map(行 => [行.scopeRequired, 行.status])).toEqual([[6, '不足'], [4, '充足']])
  })

  it.each([
    ['缺映射', (数据: 关联查询数据) => { 数据.mappings = [] }],
    ['冲突映射', (数据: 关联查询数据) => { 数据.mappings.push({ ...数据.mappings[0]!, warehouseSku: 'OTHER-WH-SKU' }) }],
    ['映射待核实', (数据: 关联查询数据) => { 数据.mappings[0]!.status = '待核实' }],
    ['未知可用量', (数据: 关联查询数据) => { 数据.inventory[0]!.quantities.available = null }],
    ['负可用量', (数据: 关联查询数据) => { 数据.inventory[0]!.quantities.available = -1 }],
    ['来源停用', (数据: 关联查询数据) => { 数据.inventory[0]!.enabled = false }],
    ['来源缺失', (数据: 关联查询数据) => { 数据.inventory[0]!.presence = '本轮未返回' }],
    ['未知质量', (数据: 关联查询数据) => { 数据.inventory[0]!.quality = '未知质量' }],
    ['单位待核实', (数据: 关联查询数据) => { 数据.inventory[0]!.unit = '箱' }],
    ['来源问题', (数据: 关联查询数据) => { 数据.inventory[0]!.issues = ['来源待核验'] }],
    ['重复仓库范围', (数据: 关联查询数据) => { 数据.scopes.push({ ...数据.scopes[0]!, id: 'AMBIGUOUS', organization: 'OTHER-ORG' }) }],
  ] as const)('%s 不能默认充足', (_, 修改) => {
    const 数据 = 库存数据(), 单 = 来源订单(), 草稿 = 方案(单, 数据)
    修改(数据)
    const 结果 = 查询人工方案库存(草稿, [单], 数据)
    expect(结果.rows[0]!.status).toBe('待核实')
    expect(结果.rows[0]!.available).toBeNull()
    expect(结果.rows[0]!.remaining).toBeNull()
    expect(结果.reasons.length).toBeGreaterThan(0)
  })

  it('多良品来源及重复来源都不取首或求和，不良品不计入可发库存', () => {
    const 数据 = 库存数据(), 单 = 来源订单(), 草稿 = 方案(单, 数据)
    数据.inventory[0]!.quantities.available = 0
    数据.inventory.push({ ...克隆(数据.inventory[0]!), id: 'DEFECTIVE', quality: '不良品', quantities: { ...数据.inventory[0]!.quantities, available: 100 } })
    expect(查询人工方案库存(草稿, [单], 数据).rows[0]!.status).toBe('不足')
    数据.inventory.push({ ...克隆(数据.inventory[0]!), id: 'SECOND-GOOD', sourceCustomer: 'SECOND-CUSTOMER', quantities: { ...数据.inventory[0]!.quantities, available: 100 } })
    expect(查询人工方案库存(草稿, [单], 数据).rows[0]!.reason).toContain('不能取首条或合计')
    数据.inventory.pop()
    数据.inventory.push(克隆(数据.inventory[0]!))
    expect(查询人工方案库存(草稿, [单], 数据).rows[0]!.status).toBe('待核实')
  })
})

const 初始 = { 订单: JSON.stringify(共享订单.value), 执行: JSON.stringify(仓库执行记录.value), 库存: JSON.stringify(演示库存.value), 版本: JSON.stringify(订单版本.value), 证据: JSON.stringify(操作核查证据.value), 来源: JSON.stringify(关联演示数据) }
function 恢复会话() {
  共享订单.value = JSON.parse(初始.订单); 仓库执行记录.value = JSON.parse(初始.执行)
  演示库存.value = JSON.parse(初始.库存); 订单版本.value = JSON.parse(初始.版本); 操作核查证据.value = JSON.parse(初始.证据)
  Object.assign(关联演示数据, JSON.parse(初始.来源))
}
beforeEach(恢复会话)
afterEach(恢复会话)
function 会话拆分() {
  const 单 = 来源订单()
  单.systemOrderNo = 'OMS-INV-COMMIT'
  单.platformOrderStatus = 'NOT_STARTED'
  单.defaultRoute = { ...演示路由[0]! }
  单.items.forEach(行 => { 行.systemSku = 'YY-CA-1048-US' })
  共享订单.value.push(单)
  const 草稿 = 创建拆分发货草稿(单)
  草稿.packages.forEach(包 => { 包.route = { ...演示路由[0]! } })
  草稿.reason = '同仓两个完整平台行分包'
  const 库存 = 关联演示数据.inventory.find(项 => 项.warehouseId === 'order-demo-winit-west' && 项.warehouseSku === 'LINK-DEMO-CA-W1' && 项.quality === '良品')!
  库存.quantities.available = 10
  return { 草稿, 库存, 单: 共享订单.value.find(项 => 项.systemOrderNo === 单.systemOrderNo)! }
}
function 本单版本(单: 全渠道订单) { return { [单.systemOrderNo]: 当前版本(单.systemOrderNo) } }

describe('库存复验与保存并审核订单', () => {
  it.each(['', '   '])('拆分空白原因可保存并审核进入待推单并创建多履约，保留来源事实且不推仓', 原因 => {
    const { 单, 草稿 } = 会话拆分()
    草稿.reason = 原因
    演示库存.value[单.systemOrderNo] = '结果未知'
    const 原事实 = JSON.stringify({ items: 单.items, amount: 单.amount, address: 单.address, route: 单.defaultRoute, platform: 单.platformOrderStatus })
    const 结果 = 执行演示保存并审核(草稿, 本单版本(单))
    expect(结果.成功, 结果.信息).toBe(true)
    expect(结果.信息).toContain('待推单')
    expect(单.processingStatus).toBe('待推单')
    expect(单.fulfillmentOrders).toHaveLength(2)
    expect(单.fulfillmentOrders.map(项 => 项.plannedQuantity)).toEqual([6, 4])
    expect(单.reviews[0]!.status).toBe('已通过')
    expect(单.manualShippingPlan?.reason).toBe('')
    expect(单.operationLogs).toHaveLength(2)
    expect(单.operationLogs[0]!.content).not.toContain('原因：')
    expect(仓库执行记录.value.filter(项 => 项.订单号.includes(单.systemOrderNo))).toEqual([])
    expect(JSON.stringify({ items: 单.items, amount: 单.amount, address: 单.address, route: 单.defaultRoute, platform: 单.platformOrderStatus })).toBe(原事实)
  })

  it('不足或未知时直接保存、保存并审核均失败不改旧案，现有方案审核也复验来源', () => {
    const { 单, 草稿, 库存 } = 会话拆分()
    expect(保存人工发货方案(人工发货上下文(), 草稿, 本单版本(单)).成功).toBe(true)
    const 旧案 = JSON.stringify(单)
    const 新草稿 = 克隆(单.manualShippingPlan!); 新草稿.reason = '不能覆盖旧案'
    库存.quantities.available = 9
    expect(保存人工发货方案(人工发货上下文(), 新草稿, 本单版本(单)).成功).toBe(false)
    const 失败 = 执行演示保存并审核(新草稿, 本单版本(单))
    expect(失败.成功).toBe(false)
    expect(失败.信息).toContain('方案未保存')
    expect(JSON.stringify(单)).toBe(旧案)
    库存.quantities.available = null
    const 审核 = 执行演示审核(单.systemOrderNo, 当前版本(单.systemOrderNo))
    expect(审核.成功).toBe(false)
    expect(单.processingStatus).toBe('待审核')
    expect(单.fulfillmentOrders).toEqual([])
    expect(单.manualShippingPlan?.reason).toBe(草稿.reason)
  })

  it('过期版本或审核前置失败不产生半次保存和审核', () => {
    const { 单, 草稿 } = 会话拆分()
    const 原单 = JSON.stringify(单)
    expect(执行演示保存并审核(草稿, { [单.systemOrderNo]: 0 }).成功).toBe(false)
    expect(JSON.stringify(单)).toBe(原单)
    操作核查证据.value[单.systemOrderNo] = { 平台允许: false, 剩余已核实: true, 零出库已核实: true }
    const 结果 = 执行演示保存并审核(草稿, 本单版本(单))
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain('未提交审核')
    expect(JSON.stringify(单)).toBe(原单)
  })

  it('推单聚合所有未受理同仓包，明确建仓的兄弟包不重复占用当前可用量', () => {
    const { 单, 草稿, 库存 } = 会话拆分()
    expect(执行演示保存并审核(草稿, 本单版本(单)).成功).toBe(true)
    const [首包, 次包] = 单.fulfillmentOrders
    expect(执行演示推单(单.systemOrderNo, 首包!.fulfillmentOrderNo, 当前版本(单.systemOrderNo)).成功).toBe(true)
    库存.quantities.available = 4
    expect(推单阻断原因(单, 次包!.fulfillmentOrderNo).join('；')).toContain('总需求 10')
    expect(执行演示推单(单.systemOrderNo, 次包!.fulfillmentOrderNo, 当前版本(单.systemOrderNo)).成功).toBe(false)
    expect(核查演示仓库结果(首包!.fulfillmentOrderNo).成功).toBe(true)
    expect(单.processingStatus).toBe('待推单')
    expect(推单阻断原因(单, 次包!.fulfillmentOrderNo)).toEqual([])
    expect(执行演示推单(单.systemOrderNo, 次包!.fulfillmentOrderNo, 当前版本(单.systemOrderNo)).成功).toBe(true)
    expect(库存.quantities.available).toBe(4)
    expect(仓库执行记录.value.filter(项 => 项.订单号.includes(单.systemOrderNo))).toHaveLength(2)
  })
})
