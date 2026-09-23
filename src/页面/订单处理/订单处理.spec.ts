import { beforeEach, describe, expect, it } from 'vitest'
import { 共享订单, 仓库执行记录, 当前版本, 审核阻断原因, 执行演示审核, 执行演示推单, 核查演示仓库结果, 演示库存, 订单版本 } from './演示会话'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 展示计划数量, 提取发货时区, 命中作业关注, 展示剩余数量, type 作业行 } from './展示工具'

const 初始订单 = JSON.stringify(共享订单.value)
const 初始仓库 = JSON.stringify(仓库执行记录.value)
const 初始库存 = JSON.stringify(演示库存.value)
beforeEach(() => {
  共享订单.value = JSON.parse(初始订单)
  仓库执行记录.value = JSON.parse(初始仓库)
  演示库存.value = JSON.parse(初始库存)
  订单版本.value = {}
})
function 首个待审(): 全渠道订单 { return 共享订单.value.find((订单) => 订单.systemOrderNo === 'OMS260912000001')! }

describe('订单处理受控演示命令', () => {
  it('取消、SKU缺失和库存未知均不可审核通过，付款时间缺失不新增门禁', () => {
    const 订单 = 首个待审()
    订单.cancelledAt = '2026-09-12T00:00:00Z'
    订单.paidAt = undefined
    订单.items[0]!.skuResolutionStatus = '缺失'
    const 原因 = 审核阻断原因(订单, '结果未知').join('；')
    expect(原因).toContain('最终取消')
    expect(原因).not.toContain('付款')
    expect(原因).toContain('SKU 映射')
    expect(原因).toContain('结果未知')
    expect(原因).not.toContain('结果结果未知')
  })
  it('标准订单付款时间只用于展示，不代替订单级付款状态门禁', () => {
    const 订单 = 首个待审()
    订单.paidAt = undefined
    expect(审核阻断原因(订单)).toEqual([])
  })
  it('审核通过同时建立审核轮次与独立路由快照；重放旧版本不重复建单', () => {
    const 订单 = 首个待审()
    const 版本 = 当前版本(订单.systemOrderNo)
    expect(执行演示审核(订单.systemOrderNo, 版本).成功).toBe(true)
    expect(订单.processingStatus).toBe('待推单')
    expect(订单.reviews).toHaveLength(1)
    expect(订单.reviews[0]!.decisionNote).toContain('演示审核通过')
    expect(订单.fulfillmentOrders).toHaveLength(1)
    expect(订单.fulfillmentOrders[0]!.route).not.toBe(订单.defaultRoute)
    expect(执行演示审核(订单.systemOrderNo, 版本).成功).toBe(false)
    expect(订单.fulfillmentOrders).toHaveLength(1)
  })
  it('审核拦截创建新轮次与可读摘要，保留待审核，不伪造异常或履约', () => {
    const 订单 = 首个待审()
    演示库存.value[订单.systemOrderNo] = '结果未知'
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(false)
    expect(订单.processingStatus).toBe('待审核')
    expect(订单.fulfillmentOrders).toHaveLength(0)
    expect(订单.reviews[0]!.status).toBe('已拦截')
    expect(订单.reviews[0]!.decisionNote).toContain('原型未实现人工解除')
  })
  it('推仓受理不会提前进入待发货；明确核查成功后才推进', () => {
    const 订单 = 首个待审()
    执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo))
    const 履约号 = 订单.fulfillmentOrders[0]!.fulfillmentOrderNo
    const 结果 = 执行演示推单(订单.systemOrderNo, 履约号, 当前版本(订单.systemOrderNo))
    expect(结果.成功).toBe(true)
    expect(结果.待核查).toBe(true)
    expect(订单.processingStatus).toBe('待推单')
    expect(执行演示推单(订单.systemOrderNo, 履约号, 当前版本(订单.systemOrderNo)).成功).toBe(false)
    expect(仓库执行记录.value.filter((项) => 项.履约单号 === 履约号)).toHaveLength(1)
    expect(核查演示仓库结果(履约号).成功).toBe(true)
    expect(订单.processingStatus).toBe('待发货')
    expect(订单.fulfillmentOrders[0]!.shippedQuantity).toBe(0)
  })
  it('固定待核查仓单保留下单中，查询不能假定成功', () => {
    const 仓单 = 仓库执行记录.value.find((项) => 项.履约单号 === 'FL-DEMO-260912-8')!
    const 结果 = 核查演示仓库结果(仓单.履约单号)
    expect(结果.待核查).toBe(true)
    expect(结果.成功).toBe(false)
    expect(仓单.状态).toBe('下单中')
    expect(仓单.外部仓库单号).toBeUndefined()
  })
  it('取消中样例进入异常并阻止审核，无最终取消事实；已出库样例不接受重审', () => {
    const 取消中 = 共享订单.value.find((订单) => 订单.systemOrderNo === 'OMS260912000009')!
    expect(取消中.processingStatus).toBe('异常')
    const 暂停结果 = 执行演示审核(取消中.systemOrderNo, 当前版本(取消中.systemOrderNo))
    expect(暂停结果.成功).toBe(false)
    expect(暂停结果.信息).toContain('平台取消处理中')
    expect(取消中.processingStatus).toBe('异常')
    expect(取消中.fulfillmentOrders).toHaveLength(0)
    expect(取消中.cancelledAt).toBeUndefined()
    expect(取消中.cancelledReason).toBeUndefined()
    const 已出库 = 共享订单.value.find((订单) => 订单.systemOrderNo === 'OMS-DEMO-CF-01')!
    expect(执行演示审核(已出库.systemOrderNo, 当前版本(已出库.systemOrderNo)).成功).toBe(false)
    expect(已出库.processingStatus).toBe('已发货')
    expect(已出库.fulfillmentOrders[0]!.shippedQuantity).toBe(1)
  })
  it('首次下载的部分履约样例进入待审核，由系统审核规则拦截，不生成整单履约', () => {
    const 部分履约 = 共享订单.value.find((订单) => 订单.systemOrderNo === 'OMS260912000011')!
    expect(部分履约.platformOrderStatus).toBe('IN_PROGRESS')
    expect(部分履约.processingStatus).toBe('待审核')
    expect(部分履约.reviews[0]).toMatchObject({ type: '自动审核', status: '已拦截' })
    expect(部分履约.reviews[0]!.decisionNote).toContain('IN_PROGRESS')
    expect(部分履约.items.length).toBeGreaterThan(1)
    expect(部分履约.items.every((商品) => 商品.fulfillableQuantity === undefined)).toBe(true)
    expect(展示计划数量(部分履约.items)).toBe('计划待核实')
    const 结果 = 执行演示审核(部分履约.systemOrderNo, 当前版本(部分履约.systemOrderNo))
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain('人工核实已履约范围和剩余数量')
    expect(部分履约.processingStatus).toBe('待审核')
    expect(部分履约.fulfillmentOrders).toHaveLength(0)
    expect(仓库执行记录.value.some((执行) => 执行.订单号.includes(部分履约.systemOrderNo))).toBe(false)
  })
})

describe('计划数量展示', () => {
  it('部分数量未核实不显示部分合计，已明确的履约计划优先且保留零值', () => {
    const 商品 = [{ fulfillableQuantity: 2 }, {}]
    expect(展示计划数量(商品)).toBe('计划待核实')
    expect(展示计划数量(商品, 3)).toBe('计划 3')
    expect(展示计划数量(商品, 0)).toBe('计划 0')
    expect(展示计划数量([{ fulfillableQuantity: 1 }, { fulfillableQuantity: 2 }])).toBe('计划 3')
  })
})

describe('发货作业关注与数量', () => {
  function 推仓行(): 作业行 {
    const order = 共享订单.value.find(订单 => 订单.systemOrderNo === 'OMS260912000008')!
    const fulfillment = order.fulfillmentOrders[0]!
    return { key: fulfillment.fulfillmentOrderNo, order, fulfillment, execution: 仓库执行记录.value.find(执行 => 执行.履约单号 === fulfillment.fulfillmentOrderNo), stage: '待推单' }
  }
  it('待核查与明确失败分别筛选，不将已有请求算作可推仓', () => {
    const 行 = 推仓行()
    expect(命中作业关注(行, '结果待核查', ['先核查原请求'])).toBe(true)
    expect(命中作业关注(行, '可推仓', ['先核查原请求'])).toBe(false)
    expect(命中作业关注(行, '下单失败', [])).toBe(false)
    行.execution!.状态 = '下单失败'
    行.execution!.待核查 = false
    expect(命中作业关注(行, '结果待核查', ['修复原因'])).toBe(false)
    expect(命中作业关注(行, '下单失败', ['修复原因'])).toBe(true)
  })
  it('部分出库与仓库待出库可以重叠，剩余数量不能伪造为零', () => {
    const 行 = 推仓行()
    行.stage = '待发货'
    行.execution!.状态 = '待出库'
    行.fulfillment!.plannedQuantity = 3
    行.fulfillment!.shippedQuantity = 1
    expect(命中作业关注(行, '部分出库', [])).toBe(true)
    expect(命中作业关注(行, '待出库', [])).toBe(true)
    expect(展示剩余数量(行.fulfillment)).toBe('2')
    行.fulfillment!.shippedQuantity = 4
    expect(展示剩余数量(行.fulfillment)).toBe('数量待核查')
    expect(展示剩余数量()).toBe('待审核确认')
  })
  it('没有标发记录不视为无需标发，失败筛选不改写已发货状态', () => {
    const 行 = 推仓行()
    行.stage = '已发货'
    const 快照 = JSON.stringify(行)
    expect(命中作业关注(行, '无标发记录', [])).toBe(true)
    expect(命中作业关注(行, '无需标发', [])).toBe(false)
    expect(命中作业关注(行, '标发失败', [], '标发失败')).toBe(true)
    expect(命中作业关注(行, '无标发记录', [], '标发失败')).toBe(false)
    expect(JSON.stringify(行)).toBe(快照)
  })
  it('可审核关注只取待审核中通过全部演示校验的订单', () => {
    const order = 首个待审()
    const 行: 作业行 = { key: order.systemOrderNo, order, stage: '待审核' }
    expect(命中作业关注(行, '可审核', [])).toBe(true)
    expect(命中作业关注(行, '可审核', ['库存未知'])).toBe(false)
    expect(命中作业关注(行, '审核待处理', ['库存未知'])).toBe(true)
    行.stage = '异常'
    expect(命中作业关注(行, '可审核', [])).toBe(false)
  })
})

describe('来源时间的时区展示', () => {
  it.each([
    ['2026-09-12 18:00 UTC-7', 'UTC-7'],
    ['2026-09-12 18:00 UTC-5', 'UTC-5'],
    ['2026-09-12 18:00 UTC-3', 'UTC-3'],
    ['2026-09-12 18:00 UTC+8', 'UTC+8'],
    ['2026-09-12 18:00 UTC+05:30', 'UTC+05:30'],
    ['2026-09-12 18:00 UTC', 'UTC'],
    ['2026-09-12 18:00', '时区未提供'],
    [undefined, '平台未提供'],
  ])('保留 %s 的来源时区为 %s', (来源, 预期) => {
    expect(提取发货时区(来源)).toBe(预期)
  })
})
