import { describe, expect, it } from 'vitest'
import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import {
  人工发货操作阻断原因, 人工发货撤销阻断原因, 人工发货收件身份, 人工发货组完整阻断原因,
  创建合并发货草稿, 创建拆分发货草稿, 关联人工发货订单号,
  保存人工发货方案, 撤销人工发货方案, 校验人工发货方案,
  type 拆合发货上下文,
} from './拆合发货模型'

const 路由甲: 订单路由 = { warehouseProvider: '谷仓', warehouseAccount: '测试甲账号', warehouse: '美东仓', shippingChannel: 'FedEx', shippingChannelCode: 'GC-FEDEX', labelMode: '仓配一体' }
const 路由乙: 订单路由 = { warehouseProvider: '万邑通', warehouseAccount: '测试乙账号', warehouse: '美西仓', shippingChannel: 'USPS', shippingChannelCode: 'WYT-USPS', labelMode: '仓配一体' }
const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T

function 创建订单(号 = 'A'): 全渠道订单 {
  const 单 = 克隆(全渠道订单模拟数据[0]!)
  return {
    ...单, systemOrderNo: 号, platformCode: 'eBay', storeId: 'STORE-A', buyerExternalId: 'BUYER-A',
    fulfillmentMode: '自配送', processingStatus: '待审核', defaultRoute: 克隆(路由甲),
    blockReason: undefined, cancelledAt: undefined, tags: [], fulfillmentOrders: [], reviews: [], operationLogs: [],
    items: ['L1', 'L2'].map((externalLineId, 序号) => ({ ...克隆(单.items[0]!), externalLineId, orderedQuantity: 序号 + 1, fulfillableQuantity: 序号 + 1, systemSku: `SKU-${externalLineId}`, skuResolutionStatus: '成功' })),
  }
}

function 创建上下文(订单 = [创建订单()]): 拆合发货上下文 & { 版本: Record<string, number> } {
  const 版本: Record<string, number> = Object.fromEntries(订单.map(单 => [单.systemOrderNo, 1]))
  return {
    订单, 版本, 仓库执行: [], 当前版本: 号 => 版本[号] ?? 1, 当前时间: () => '2026-10-21 10:00:00 UTC+8', 可选路由: [路由甲, 路由乙],
    记录操作(单, 类型, 内容) {
      单.operationLogs.push({ operationType: 类型, content: 内容, operatedAt: '2026-10-21 10:00:00 UTC+8', operationResult: '成功', operator: '测试操作员' })
      版本[单.systemOrderNo] = (版本[单.systemOrderNo] ?? 1) + 1
    },
  }
}
function 版本表(上下文: 拆合发货上下文) { return Object.fromEntries(上下文.订单.map(单 => [单.systemOrderNo, 上下文.当前版本(单.systemOrderNo)])) }
function 待存拆单(上下文: 拆合发货上下文) {
  const 方案 = 创建拆分发货草稿(上下文.订单[0]!)
  方案.reason = '  按商品行分仓发货  '
  方案.packages[1]!.route = 克隆(路由乙)
  return 方案
}
function 待存合单(上下文: 拆合发货上下文) { const 方案 = 创建合并发货草稿(上下文.订单); 方案.reason = '同一买家一并寄送'; return 方案 }
function 添加历史(上下文: 拆合发货上下文) {
  const 单 = 上下文.订单[0]!
  单.fulfillmentOrders.push({ fulfillmentOrderNo: 'F-HISTORY', status: '已终止', isActive: false, route: 克隆(路由甲), plannedQuantity: 3, shippedQuantity: 0 })
  上下文.仓库执行.push({ 履约单号: 'F-HISTORY', 订单号: [单.systemOrderNo], 状态: '已取消', 待核查: false, 出库事实: { shipped: 0, shippedAt: null } })
}

describe('待审核人工拆分发货', () => {
  it.each(['', '   '])('拆分操作原因选填，空白普通保存为空且日志省略原因，撤销仍必填', 原因 => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    方案.reason = 原因
    const 结果 = 保存人工发货方案(上下文, 方案, 版本表(上下文))
    expect(结果.成功, 结果.信息).toBe(true)
    const 单 = 上下文.订单[0]!
    expect(单.manualShippingPlan?.reason).toBe('')
    expect(单.processingStatus).toBe('待审核')
    expect(单.fulfillmentOrders).toEqual([])
    expect(单.operationLogs).toHaveLength(1)
    expect(单.operationLogs[0]!.content).not.toContain('原因：')
    const 保存后 = JSON.stringify(单)
    expect(撤销人工发货方案(上下文, ['A'], 版本表(上下文), '').成功).toBe(false)
    expect(JSON.stringify(单)).toBe(保存后)
  })

  it('完整平台行分到不同仓库，保存只建立方案，独立克隆且保留原订单事实', () => {
    const 上下文 = 创建上下文()
    const 单 = 上下文.订单[0]!
    const 来源事实 = JSON.stringify({ items: 单.items, amount: 单.amount, address: 单.address, platform: 单.platformOrderNo, route: 单.defaultRoute })
    const 方案 = 待存拆单(上下文)
    expect(校验人工发货方案(上下文, 方案)).toEqual([])
    const 结果 = 保存人工发货方案(上下文, 方案, 版本表(上下文))
    expect(结果.成功).toBe(true)
    expect(单.processingStatus).toBe('待审核')
    expect(单.fulfillmentOrders).toEqual([])
    expect(上下文.仓库执行).toEqual([])
    expect(单.manualShippingPlan?.packages.map(包 => 包.route.warehouse)).toEqual(['美东仓', '美西仓'])
    expect(单.manualShippingPlan?.reason).toBe('按商品行分仓发货')
    expect(单.manualShippingPlan?.updatedAt).toBe('2026-10-21 10:00:00 UTC+8')
    expect(JSON.stringify({ items: 单.items, amount: 单.amount, address: 单.address, platform: 单.platformOrderNo, route: 单.defaultRoute })).toBe(来源事实)
    方案.packages[0]!.items[0]!.quantity = 99
    结果.方案!.packages[0]!.route.warehouse = '覆盖'
    expect(单.manualShippingPlan?.packages[0]!.items[0]!.quantity).toBe(1)
    expect(单.manualShippingPlan?.packages[0]!.route.warehouse).toBe('美东仓')
    expect(上下文.当前版本('A')).toBe(2)
    expect(单.operationLogs[0]!.content).toContain('L2×2')
  })

  it('eBay 与其他平台都可将同一来源行拆数量到多包，仍必须完整覆盖且不超量', () => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    方案.packages[1]!.items[0]!.quantity = 1
    方案.packages[0]!.items.push({ orderNo: 'A', externalLineId: 'L2', quantity: 1 })
    expect(校验人工发货方案(上下文, 方案)).toEqual([])
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    expect(上下文.订单[0]!.manualShippingPlan?.packages.map(包 => 包.items.filter(行 => 行.externalLineId === 'L2').reduce((总, 行) => 总 + 行.quantity, 0))).toEqual([1, 1])
    上下文.订单[0]!.platformCode = 'Temu'
    expect(校验人工发货方案(上下文, 方案)).toEqual([])
    方案.packages[0]!.items[1]!.quantity = 2
    expect(校验人工发货方案(上下文, 方案).join('；')).toContain('分配总数必须等于')
  })

  it('拒绝漏分、空包、重复行、未知来源、非整数、负数与重复包身份', () => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    方案.packages[0]!.items.push({ orderNo: 'OTHER', externalLineId: 'L1', quantity: -1 })
    方案.packages[0]!.items.push({ orderNo: 'A', externalLineId: 'L1', quantity: 0.5 })
    方案.packages[1]!.items = []
    方案.packages[1]!.key = 方案.packages[0]!.key
    const 校验 = 校验人工发货方案(上下文, 方案).join('；')
    expect(校验).toContain('标识缺失或重复')
    expect(校验).toContain('来源商品行重复')
    expect(校验).toContain('不属于本方案')
    expect(校验).toContain('正整数')
    expect(校验).toContain('没有分配商品')
    expect(校验).toContain('分配总数必须等于')
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(false)
    expect(上下文.订单[0]!.manualShippingPlan).toBeUndefined()
    expect(上下文.订单[0]!.operationLogs).toEqual([])
  })

  it('单行且只有一件的草稿保留空包，不擅自新增数量以凑出两个非空包', () => {
    const 上下文 = 创建上下文()
    上下文.订单[0]!.items.splice(1)
    const 方案 = 待存拆单(上下文)
    expect(方案.packages[0]!.items).toHaveLength(1)
    expect(方案.packages[1]!.items).toEqual([])
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(false)
  })

  it('没有默认路由也可人工指定包裹路线，候选失效与仓配分离不能提交', () => {
    const 上下文 = 创建上下文()
    上下文.订单[0]!.defaultRoute = undefined
    const 方案 = 待存拆单(上下文)
    expect(校验人工发货方案(上下文, 方案).join('；')).toContain('完整的发货仓库')
    方案.packages[0]!.route = 克隆(路由甲)
    expect(校验人工发货方案(上下文, 方案)).toEqual([])
    方案.packages[0]!.route.warehouseAccount = '其他账号'
    expect(校验人工发货方案(上下文, 方案).join('；')).toContain('组合已失效')
    方案.packages[0]!.route.labelMode = '仓配分离'
    expect(校验人工发货方案(上下文, 方案).join('；')).toContain('仅支持仓配一体')
  })
})

describe('待审核人工合并发货', () => {
  it('同平台同店买家同完整地址按一个新共同路线保存，全组版本日志及独立副本一致', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    上下文.订单[1]!.defaultRoute = 克隆(路由乙)
    上下文.订单[1]!.address.buyerMessage = '请包装牢固'
    const 方案 = 待存合单(上下文)
    方案.packages[0]!.route = 克隆(路由乙)
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    expect(上下文.订单.map(单 => 单.processingStatus)).toEqual(['待审核', '待审核'])
    expect(上下文.订单.map(单 => 单.fulfillmentOrders)).toEqual([[], []])
    expect(上下文.订单[0]!.manualShippingPlan).toEqual(上下文.订单[1]!.manualShippingPlan)
    expect(上下文.订单[0]!.manualShippingPlan).not.toBe(上下文.订单[1]!.manualShippingPlan)
    expect(上下文.订单.map(单 => 单.operationLogs[0]!.content)).toEqual([expect.stringContaining('A、B'), expect.stringContaining('A、B')])
    expect(上下文.版本).toEqual({ A: 2, B: 2 })
    expect(上下文.订单.map(单 => 单.defaultRoute?.warehouse)).toEqual(['美东仓', '美西仓'])
  })

  it.each([
    ['跨平台', (单: 全渠道订单) => { 单.platformCode = 'Temu' }, '相同平台'],
    ['跨店铺', (单: 全渠道订单) => { 单.storeId = 'STORE-B' }, '相同店铺'],
    ['不同买家', (单: 全渠道订单) => { 单.buyerExternalId = 'BUYER-B' }, '买家身份'],
    ['缺失买家', (单: 全渠道订单) => { 单.buyerExternalId = undefined }, '买家身份'],
    ['地址2不同', (单: 全渠道订单) => { 单.address.addressLine2 = '房间2' }, '完整收货地址'],
    ['收件人不同', (单: 全渠道订单) => { 单.address.fullName = '虚构收件人乙' }, '收件人必须相同'],
    ['邮编不同', (单: 全渠道订单) => { 单.address.postalCode = '90210-NEW' }, '完整收货地址'],
  ] as const)('%s 时全组保持原状', (_, 修改, 提示) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    修改(上下文.订单[1]!)
    const 之前 = JSON.stringify(上下文.订单)
    const 结果 = 保存人工发货方案(上下文, 待存合单(上下文), 版本表(上下文))
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain(提示)
    expect(JSON.stringify(上下文.订单)).toBe(之前)
    expect(上下文.版本).toEqual({ A: 1, B: 1 })
  })

  it('五项匹配忽略字段首尾空格，电话邮箱和买家留言不作为额外硬条件', () => {
    const 甲 = 创建订单('A'), 乙 = 创建订单('B')
    乙.address.buyerMessage = '另一条留言'
    乙.address.fullName = ` ${乙.address.fullName} `
    乙.address.mobilePhone = 'DEMO-PHONE-B'
    乙.address.email = 'demo-b@example.invalid'
    乙.address.companyName = '虚构公司乙'
    expect(人工发货收件身份(甲)).toBe(人工发货收件身份(乙))
    乙.address.addressLine2 = 'DEMO-ROOM-B'
    expect(人工发货收件身份(甲)).not.toBe(人工发货收件身份(乙))
  })

  it('已有组合单独修改、单独撤销、增加来源或直接改为拆分均阻断', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B'), 创建订单('C')])
    const 方案 = 创建合并发货草稿(上下文.订单.slice(0, 2)); 方案.reason = '先合并A和B'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    expect(关联人工发货订单号(上下文, ['A'])).toEqual(['A', 'B'])
    expect(人工发货组完整阻断原因(上下文, ['A']).join('；')).toContain('全部来源订单')
    const 之前 = JSON.stringify(上下文.订单)
    expect(撤销人工发货方案(上下文, ['A'], 版本表(上下文), '单独撤销').成功).toBe(false)
    const 扩展 = 待存合单(上下文)
    expect(保存人工发货方案(上下文, 扩展, 版本表(上下文)).成功).toBe(false)
    const 改拆 = 待存拆单(上下文)
    expect(保存人工发货方案(上下文, 改拆, 版本表(上下文)).成功).toBe(false)
    expect(JSON.stringify(上下文.订单)).toBe(之前)
  })

  it('保存与撤销须复验全部来源版本，失败无部分修改，成功撤销恢复独立待审核', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    const 方案 = 待存合单(上下文)
    const 初始版本 = 版本表(上下文)
    上下文.版本.B = 2
    expect(保存人工发货方案(上下文, 方案, 初始版本).成功).toBe(false)
    expect(上下文.订单.every(单 => !单.manualShippingPlan && !单.operationLogs.length)).toBe(true)
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    const 保存后 = JSON.stringify(上下文.订单)
    expect(撤销人工发货方案(上下文, ['A', 'B'], { A: 2 }, '撤销重做').成功).toBe(false)
    expect(JSON.stringify(上下文.订单)).toBe(保存后)
    expect(撤销人工发货方案(上下文, ['A', 'B'], 版本表(上下文), '撤销重做').成功).toBe(true)
    expect(上下文.订单.every(单 => !单.manualShippingPlan && 单.processingStatus === '待审核')).toBe(true)
    expect(上下文.订单.every(单 => 单.operationLogs.length === 2)).toBe(true)
    expect(上下文.订单[0]!.operationLogs[1]!.content).toContain('原方案')
    expect(上下文.订单[1]!.operationLogs[1]!.content).toContain('撤销重做')
  })

  it('完整组可修改原方案并保留修改前内容，损坏或缺失副本阻断', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    expect(保存人工发货方案(上下文, 待存合单(上下文), 版本表(上下文)).成功).toBe(true)
    const 修改 = 待存合单(上下文)
    修改.packages[0]!.route = 克隆(路由乙)
    expect(保存人工发货方案(上下文, 修改, 版本表(上下文)).成功).toBe(true)
    expect(上下文.订单[0]!.operationLogs[1]!.content).toContain('修改前方案')
    上下文.订单[1]!.manualShippingPlan!.reason = '副本被改动'
    expect(保存人工发货方案(上下文, 修改, 版本表(上下文)).信息).toContain('副本缺失或不一致')
    delete 上下文.订单[1]!.manualShippingPlan
    expect(撤销人工发货方案(上下文, ['A', 'B'], 版本表(上下文), '撤销').信息).toContain('副本缺失或不一致')
  })
})

describe('执行保护和提交复验', () => {
  it.each(['待推单', '待发货', '已发货', '异常', '不发货'] as const)('%s 不可保存人工方案', 状态 => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    上下文.订单[0]!.processingStatus = 状态
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).信息).toContain('仅待审核')
  })

  it.each(['下单中', '取消中', '待出库', '出库异常', '已出库'])('%s 阻断，明确取消且零出库历史可重新编排', 状态 => {
    const 上下文 = 创建上下文()
    添加历史(上下文)
    expect(校验人工发货方案(上下文, 待存拆单(上下文))).toEqual([])
    上下文.仓库执行[0]!.状态 = 状态
    expect(保存人工发货方案(上下文, 待存拆单(上下文), 版本表(上下文)).信息).toContain('尚未安全结束')
  })

  it('有效履约、待核查失败请求、未知出库和部分出库阻断而不覆盖历史', () => {
    const 上下文 = 创建上下文()
    添加历史(上下文)
    const 单 = 上下文.订单[0]!
    单.fulfillmentOrders[0]!.isActive = true
    expect(人工发货操作阻断原因(上下文, ['A'], '拆分发货').join('；')).toContain('有效履约')
    单.fulfillmentOrders[0]!.isActive = false
    上下文.仓库执行[0]!.状态 = '下单失败'
    上下文.仓库执行[0]!.待核查 = true
    expect(校验人工发货方案(上下文, 待存拆单(上下文)).join('；')).toContain('结果待核查')
    上下文.仓库执行[0]!.待核查 = false
    上下文.仓库执行[0]!.出库事实!.shipped = null
    expect(校验人工发货方案(上下文, 待存拆单(上下文)).join('；')).toContain('出库事实未明确为零')
    上下文.仓库执行[0]!.出库事实!.shipped = 0
    单.fulfillmentOrders[0]!.shippedQuantity = 1
    expect(校验人工发货方案(上下文, 待存拆单(上下文)).join('；')).toContain('已有出库事实')
  })

  it('预览后的新仓库请求、缺失数量和SKU失败会在提交时重新阻断', () => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    expect(校验人工发货方案(上下文, 方案)).toEqual([])
    上下文.仓库执行.push({ 履约单号: 'UNLINKED', 订单号: ['A'], 状态: '下单中', 待核查: true })
    const 之前 = JSON.stringify(上下文.订单)
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(false)
    expect(JSON.stringify(上下文.订单)).toBe(之前)
    上下文.仓库执行 = []
    上下文.订单[0]!.items[0]!.fulfillableQuantity = undefined
    上下文.订单[0]!.items[0]!.skuResolutionStatus = '缺失'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).信息).toContain('可发商品及数量未核实')
    expect(校验人工发货方案(上下文, 方案).join('；')).toContain('SKU 映射尚未完成')
  })

  it('选填原因仍限制长度，未知来源和重复来源不改变任何对象', () => {
    const 上下文 = 创建上下文()
    const 方案 = 待存拆单(上下文)
    方案.reason = '字'.repeat(2001)
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).信息).toContain('2000')
    方案.reason = '原因'
    方案.orderNos = ['A', 'A', 'MISSING']
    const 结果 = 保存人工发货方案(上下文, 方案, 版本表(上下文))
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain('不存在或编号不唯一')
    expect(上下文.订单[0]!.operationLogs).toEqual([])
  })
})

describe('撤销方案独立于发货前置资格', () => {
  it.each([
    ['SKU映射失效', (单: 全渠道订单) => { 单.items[0]!.skuResolutionStatus = '失效'; 单.items[0]!.systemSku = undefined }],
    ['收件地址变更', (单: 全渠道订单) => { 单.address.addressLine1 = '另一个收件地址' }],
    ['收件信息缺失', (单: 全渠道订单) => { 单.address.fullName = '' }],
    ['买家身份变更', (单: 全渠道订单) => { 单.buyerExternalId = 'NEW-BUYER' }],
    ['默认路线缺失', (单: 全渠道订单) => { 单.defaultRoute = undefined }],
    ['平台发货条件拦截', (单: 全渠道订单) => { 单.blockReason = '付款变化需复核' }],
    ['最终取消事实', (单: 全渠道订单) => { 单.cancelledAt = '2026-10-21T00:00:00Z'; 单.cancelledReason = '平台明确取消' }],
    ['当前剩余范围待核实', (单: 全渠道订单) => { 单.items[0]!.fulfillableQuantity = undefined }],
  ] as const)('%s 不锁死撤销，全组移除方案但保留已变化事实', (_, 修改) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    expect(保存人工发货方案(上下文, 待存合单(上下文), 版本表(上下文)).成功).toBe(true)
    修改(上下文.订单[1]!)
    const 变化后事实 = JSON.stringify(上下文.订单.map(单 => ({ items: 单.items, address: 单.address, buyer: 单.buyerExternalId, route: 单.defaultRoute, block: 单.blockReason, cancelledAt: 单.cancelledAt, cancelledReason: 单.cancelledReason })))
    expect(人工发货撤销阻断原因(上下文, ['A', 'B'])).toEqual([])
    const 结果 = 撤销人工发货方案(上下文, ['A', 'B'], 版本表(上下文), '原方案已不适用，先撤销后核查')
    expect(结果.成功, 结果.信息).toBe(true)
    expect(上下文.订单.every(单 => !单.manualShippingPlan && 单.processingStatus === '待审核')).toBe(true)
    expect(JSON.stringify(上下文.订单.map(单 => ({ items: 单.items, address: 单.address, buyer: 单.buyerExternalId, route: 单.defaultRoute, block: 单.blockReason, cancelledAt: 单.cancelledAt, cancelledReason: 单.cancelledReason })))).toBe(变化后事实)
    expect(上下文.订单.every(单 => 单.operationLogs[1]!.content.includes('后续须重新校验发货条件'))).toBe(true)
  })

  it.each([
    ['有效履约', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.订单[0]!.fulfillmentOrders[0]!.isActive = true }, '有效履约'],
    ['非零历史出库', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.订单[0]!.fulfillmentOrders[0]!.shippedQuantity = 1 }, '出库事实'],
    ['未知历史出库', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.订单[0]!.fulfillmentOrders[0]!.shippedQuantity = Number.NaN }, '历史出库数量未核实'],
    ['仓库待核查', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.仓库执行[0]!.待核查 = true }, '结果待核查'],
    ['仓库未结束', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.仓库执行[0]!.状态 = '待出库' }, '尚未安全结束'],
    ['未知仓库出库量', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.仓库执行[0]!.出库事实!.shipped = null }, '未明确为零'],
    ['仓库履约关联缺失', (上下文: 拆合发货上下文) => { 添加历史(上下文); 上下文.仓库执行[0]!.履约单号 = 'UNKNOWN' }, '缺少关联履约'],
    ['待审核外状态', (上下文: 拆合发货上下文) => { 上下文.订单[0]!.processingStatus = '异常' }, '仅待审核'],
    ['平台履约订单', (上下文: 拆合发货上下文) => { 上下文.订单[0]!.fulfillmentMode = '平台履约' }, '仅待审核自配送'],
    ['审核中', (上下文: 拆合发货上下文) => { 上下文.订单[0]!.reviews.push({ round: 1, type: '人工审核', triggerSource: '测试', status: '审核中' }) }, '审核未结束'],
  ] as const)('%s 仍拦截撤销，失败不产生部分变更或日志', (_, 修改, 提示) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    expect(保存人工发货方案(上下文, 待存合单(上下文), 版本表(上下文)).成功).toBe(true)
    上下文.订单[1]!.items[0]!.skuResolutionStatus = '失效'
    修改(上下文)
    const 原订单 = JSON.stringify(上下文.订单)
    const 原执行 = JSON.stringify(上下文.仓库执行)
    const 原版本 = JSON.stringify(上下文.版本)
    const 结果 = 撤销人工发货方案(上下文, ['A', 'B'], 版本表(上下文), '撤销旧方案')
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain(提示)
    expect(JSON.stringify(上下文.订单)).toBe(原订单)
    expect(JSON.stringify(上下文.仓库执行)).toBe(原执行)
    expect(JSON.stringify(上下文.版本)).toBe(原版本)
  })

  it('撤销安全门禁仍要求现有完整方案与唯一存在的全部来源', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    expect(人工发货撤销阻断原因(上下文, ['A']).join('；')).toContain('没有已保存')
    expect(保存人工发货方案(上下文, 待存合单(上下文), 版本表(上下文)).成功).toBe(true)
    expect(人工发货撤销阻断原因(上下文, ['A']).join('；')).toContain('全部来源订单')
    expect(人工发货撤销阻断原因(上下文, ['A', 'A', 'B']).join('；')).toContain('不重复')
    expect(人工发货撤销阻断原因(上下文, ['A', 'B', 'MISSING']).join('；')).toContain('不存在')
    delete 上下文.订单[1]!.manualShippingPlan
    expect(人工发货撤销阻断原因(上下文, ['A', 'B']).join('；')).toContain('副本缺失或不一致')
  })
})
