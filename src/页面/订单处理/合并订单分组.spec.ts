import { describe, expect, it } from 'vitest'
import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 保存人工发货方案, 保存多组合并发货方案, 创建合并发货草稿, 创建拆分发货草稿, 撤销人工发货方案, 计算可合并订单, type 拆合发货上下文 } from './拆合发货模型'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
const 路由: 订单路由 = { warehouseProvider: '谷仓', warehouseAccount: 'DEMO-ACCOUNT', warehouse: 'DEMO-WAREHOUSE', shippingChannel: 'DEMO-CHANNEL', shippingChannelCode: 'DEMO-CODE', labelMode: '仓配一体' }

function 创建订单(号: string, 买家 = 'DEMO-BUYER-A'): 全渠道订单 {
  const 样例 = 克隆(全渠道订单模拟数据[0]!)
  return {
    ...样例, systemOrderNo: 号, platformCode: 'eBay', storeId: 'DEMO-STORE-A', buyerExternalId: 买家,
    fulfillmentMode: '自配送', processingStatus: '待审核', defaultRoute: 克隆(路由),
    blockReason: undefined, cancelledAt: undefined, manualShippingPlan: undefined,
    fulfillmentOrders: [], reviews: [], operationLogs: [],
    address: { fullName: '虚构收件人甲', countryCode: 'US', stateProvince: 'DEMO-STATE', city: 'DEMO-CITY', district: 'DEMO-DISTRICT', addressLine1: '100 DEMO STREET', addressLine2: 'DEMO-ROOM-1', postalCode: 'DEMO-POSTAL' },
    items: [{ ...样例.items[0]!, externalLineId: 'DEMO-LINE', orderedQuantity: 2, fulfillableQuantity: 2, systemSku: 'DEMO-SKU', skuResolutionStatus: '成功' }],
  }
}

function 创建上下文(订单: 全渠道订单[]): 拆合发货上下文 & { 版本: Record<string, number> } {
  const 版本: Record<string, number> = Object.fromEntries(订单.map(单 => [单.systemOrderNo, 1]))
  return {
    订单, 版本, 仓库执行: [], 可选路由: [路由], 当前版本: 号 => 版本[号] ?? 1,
    当前时间: () => '2026-10-21 12:00:00 UTC+8',
    记录操作(单, 类型, 内容) {
      单.operationLogs.push({ operationType: 类型, content: 内容, operatedAt: '2026-10-21 12:00:00 UTC+8', operationResult: '成功', operator: 'DEMO-OPERATOR' })
      版本[单.systemOrderNo] = (版本[单.systemOrderNo] ?? 1) + 1
    },
  }
}
const 来源号 = (上下文: 拆合发货上下文) => 上下文.订单.map(单 => 单.systemOrderNo)
const 版本表 = (上下文: 拆合发货上下文) => Object.fromEntries(来源号(上下文).map(号 => [号, 上下文.当前版本(号)]))
function 创建批次() {
  const 上下文 = 创建上下文([创建订单('A'), 创建订单('B'), 创建订单('C', 'DEMO-BUYER-B'), 创建订单('D', 'DEMO-BUYER-B')])
  const 方案列表 = 计算可合并订单(上下文, 来源号(上下文)).groups.map(组 => {
    const 方案 = 创建合并发货草稿(组.orderNos.map(号 => 上下文.订单.find(单 => 单.systemOrderNo === 号)!))
    方案.reason = '  同买家同地址人工合并寄送  '
    return 方案
  })
  return { 上下文, 方案列表 }
}

describe('勾选订单计算可合并分组', () => {
  it('只在勾选范围内分出多组，不静默带入未选订单，单例明确解释并保持来源不变', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B'), 创建订单('C', 'DEMO-BUYER-B'), 创建订单('D', 'DEMO-BUYER-B'), 创建订单('E', 'DEMO-BUYER-B'), 创建订单('F', 'DEMO-BUYER-C'), 创建订单('NOT-SELECTED')])
    const 之前 = JSON.stringify(上下文.订单)
    const 结果 = 计算可合并订单(上下文, ['D', 'A', 'C', 'B', 'E', 'F'])
    expect(结果.groups.map(组 => 组.orderNos)).toEqual([['D', 'C', 'E'], ['A', 'B']])
    expect(结果.groups.every(组 => 组.orderNos.length >= 2)).toBe(true)
    expect(结果.unmergedOrders).toEqual([{ orderNo: 'F', reasons: [expect.stringContaining('没有同平台、同店铺、同买家、同收件人和完整收货地址一致')] }])
    expect(JSON.stringify(上下文.订单)).toBe(之前)
    expect(上下文.版本).toEqual({ A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, 'NOT-SELECTED': 1 })
    expect(计算可合并订单(上下文, ['A']).groups).toEqual([])
    expect(计算可合并订单(上下文, [])).toEqual({ groups: [], unmergedOrders: [] })
  })

  it.each([
    ['平台', (单: 全渠道订单) => { 单.platformCode = 'Temu' }],
    ['店铺', (单: 全渠道订单) => { 单.storeId = 'DEMO-STORE-B' }],
    ['买家', (单: 全渠道订单) => { 单.buyerExternalId = 'DEMO-BUYER-B' }],
    ['收件人', (单: 全渠道订单) => { 单.address.fullName = '虚构收件人乙' }],
    ['国家', (单: 全渠道订单) => { 单.address.countryCode = 'GB' }],
    ['省州', (单: 全渠道订单) => { 单.address.stateProvince = 'DEMO-STATE-B' }],
    ['城市', (单: 全渠道订单) => { 单.address.city = 'DEMO-CITY-B' }],
    ['区县', (单: 全渠道订单) => { 单.address.district = 'DEMO-DISTRICT-B' }],
    ['门牌与地址1', (单: 全渠道订单) => { 单.address.addressLine1 = '101 DEMO STREET' }],
    ['公寓与地址2', (单: 全渠道订单) => { 单.address.addressLine2 = 'DEMO-ROOM-2' }],
    ['邮编', (单: 全渠道订单) => { 单.address.postalCode = 'DEMO-POSTAL-B' }],
  ] as const)('%s 不同不合并，任意一项差异都不能绕过', (_, 修改) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    修改(上下文.订单[1]!)
    const 结果 = 计算可合并订单(上下文, ['A', 'B'])
    expect(结果.groups).toEqual([])
    expect(结果.unmergedOrders.map(单 => 单.orderNo)).toEqual(['A', 'B'])
    const 方案 = 创建合并发货草稿(上下文.订单); 方案.reason = '尝试绕过匹配'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(false)
    expect(上下文.订单.every(单 => !单.manualShippingPlan && !单.operationLogs.length)).toBe(true)
  })

  it.each([
    ['平台身份', (单: 全渠道订单) => { 单.platformCode = '' as 全渠道订单['platformCode'] }],
    ['店铺身份', (单: 全渠道订单) => { 单.storeId = '  ' }],
    ['买家身份', (单: 全渠道订单) => { 单.buyerExternalId = undefined }],
    ['收件人', (单: 全渠道订单) => { 单.address.fullName = '' }],
    ['收货地址', (单: 全渠道订单) => { 单.address.addressLine1 = '' }],
    ['收货地址', (单: 全渠道订单) => { 单.address.countryCode = '' }],
  ] as const)('两单%s 都缺失不能因空值相同被归为可合并', (字段, 修改) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    上下文.订单.forEach(修改)
    const 结果 = 计算可合并订单(上下文, ['A', 'B'])
    expect(结果.groups).toEqual([])
    expect(结果.unmergedOrders).toHaveLength(2)
    expect(结果.unmergedOrders.every(单 => 单.reasons.join('；').includes(字段))).toBe(true)
    const 方案 = 创建合并发货草稿(上下文.订单); 方案.reason = '尝试空值匹配'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(false)
  })

  it('仅去首尾空格；联系方式、公司、留言、商品和原路由不同不追加为五项匹配条件', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    const 乙 = 上下文.订单[1]!
    乙.storeId = ` ${乙.storeId} `; 乙.buyerExternalId = ` ${乙.buyerExternalId} `
    for (const 字段 of ['fullName', 'countryCode', 'stateProvince', 'city', 'district', 'addressLine1', 'addressLine2', 'postalCode'] as const) 乙.address[字段] = ` ${乙.address[字段]} `
    乙.address.mobilePhone = 'DEMO-PHONE-B'; 乙.address.telephone = 'DEMO-TELEPHONE-B'; 乙.address.email = 'demo-b@example.invalid'
    乙.address.companyName = '虚构公司乙'; 乙.address.buyerMessage = '虚构留言乙'
    乙.items[0]!.systemSku = 'DEMO-SKU-B'; 乙.defaultRoute = undefined
    expect(计算可合并订单(上下文, ['A', 'B']).groups.map(组 => 组.orderNos)).toEqual([['A', 'B']])
    const 方案 = 创建合并发货草稿(上下文.订单); 方案.reason = '统一选择共同路线'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    乙.address.addressLine1 = '100 demo street'
    expect(计算可合并订单(创建上下文([创建订单('C'), { ...乙, systemOrderNo: 'D', manualShippingPlan: undefined }]), ['C', 'D']).groups).toEqual([])
  })

  it.each([
    ['非待审核', (上下文: 拆合发货上下文) => { 上下文.订单[2]!.processingStatus = '待推单' }, '仅待审核'],
    ['平台履约', (上下文: 拆合发货上下文) => { 上下文.订单[2]!.fulfillmentMode = '平台履约' }, '自配送'],
    ['审核中', (上下文: 拆合发货上下文) => { 上下文.订单[2]!.reviews.push({ round: 1, type: '人工审核', triggerSource: 'DEMO', status: '审核中' }) }, '审核未结束'],
    ['发货拦截', (上下文: 拆合发货上下文) => { 上下文.订单[2]!.blockReason = 'DEMO-发货条件变化需复核' }, '需复核'],
    ['SKU未知', (上下文: 拆合发货上下文) => { 上下文.订单[2]!.items[0]!.skuResolutionStatus = '缺失' }, 'SKU 映射'],
    ['仓库执行待核查', (上下文: 拆合发货上下文) => { 上下文.仓库执行.push({ 履约单号: 'DEMO-F', 订单号: ['C'], 状态: '下单失败', 待核查: true }) }, '结果待核查'],
  ] as const)('%s 单被排除并解释原因，不妨碍其他可合并订单', (_, 修改, 提示) => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B'), 创建订单('C')])
    修改(上下文)
    const 结果 = 计算可合并订单(上下文, ['A', 'C', 'B'])
    expect(结果.groups.map(组 => 组.orderNos)).toEqual([['A', 'B']])
    expect(结果.unmergedOrders).toEqual([{ orderNo: 'C', reasons: expect.arrayContaining([expect.stringContaining(提示)]) }])
  })

  it('已有拆分或合并安排从新合并入口排除，原组编辑路径继续可用', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B'), 创建订单('C'), 创建订单('D')])
    const 方案 = 创建合并发货草稿(上下文.订单.slice(0, 2)); 方案.reason = '已有合并'
    expect(保存人工发货方案(上下文, 方案, 版本表(上下文)).成功).toBe(true)
    上下文.订单[2]!.manualShippingPlan = 创建拆分发货草稿(上下文.订单[2]!)
    const 结果 = 计算可合并订单(上下文, ['A', 'B', 'C', 'D'])
    expect(结果.groups).toEqual([])
    expect(结果.unmergedOrders.slice(0, 3).every(单 => 单.reasons.join('；').includes('原安排编辑或撤销'))).toBe(true)
    expect(保存人工发货方案(上下文, 创建合并发货草稿(上下文.订单.slice(0, 2)), 版本表(上下文)).成功).toBe(true)
  })

  it('重复勾选、未知来源、重复编号及缺失共享副本均明确阻断，不自动补入来源', () => {
    const 上下文 = 创建上下文([创建订单('A'), 创建订单('B')])
    expect(计算可合并订单(上下文, ['A', 'A', 'MISSING', 'B']).unmergedOrders.map(单 => 单.orderNo)).toEqual(['A', 'MISSING', 'B'])
    expect(计算可合并订单(上下文, ['A', 'A']).unmergedOrders[0]!.reasons.join('；')).toContain('重复勾选')
    上下文.订单.push(创建订单('B'))
    expect(计算可合并订单(上下文, ['B']).unmergedOrders[0]!.reasons.join('；')).toContain('编号不唯一')
    上下文.订单.pop()
    上下文.订单[0]!.manualShippingPlan = 创建合并发货草稿(上下文.订单)
    const 结果 = 计算可合并订单(上下文, ['B'])
    expect(结果.groups).toEqual([])
    expect(结果.unmergedOrders[0]!.reasons.join('；')).toContain('全部来源订单')
    expect(结果.unmergedOrders[0]!.reasons.join('；')).toContain('副本缺失或不一致')
  })
})

describe('多组合并方案统一复验保存', () => {
  it.each(['', '   '])('合并操作原因为选填，空白按空值保存且日志不补造原因，撤销仍要求原因', 原因 => {
    const { 上下文, 方案列表 } = 创建批次()
    方案列表.forEach(方案 => { 方案.reason = 原因 })
    const 结果 = 保存多组合并发货方案(上下文, 方案列表, 版本表(上下文))
    expect(结果.成功, 结果.信息).toBe(true)
    expect(上下文.订单.every(单 => 单.manualShippingPlan?.reason === '')).toBe(true)
    expect(上下文.订单.every(单 => !单.operationLogs[0]!.content.includes('原因：'))).toBe(true)
    const 之前 = JSON.stringify(上下文.订单)
    expect(撤销人工发货方案(上下文, ['A', 'B'], 版本表(上下文), '').成功).toBe(false)
    expect(JSON.stringify(上下文.订单)).toBe(之前)
  })

  it('选填原因仍按去首尾空格后的 2000 字符限制，超长不能保存', () => {
    const { 上下文, 方案列表 } = 创建批次()
    方案列表[0]!.reason = `  ${'字'.repeat(2000)}  `
    方案列表[1]!.reason = '字'.repeat(2001)
    expect(保存多组合并发货方案(上下文, 方案列表, 版本表(上下文)).信息).toContain('2000')
    expect(上下文.订单.every(单 => !单.manualShippingPlan)).toBe(true)
    方案列表[1]!.reason = ''
    expect(保存多组合并发货方案(上下文, 方案列表, 版本表(上下文)).成功).toBe(true)
    expect(上下文.订单[0]!.manualShippingPlan?.reason).toHaveLength(2000)
  })

  it('每组各自共同路由与来源完整保存，保持待审核且没有履约或仓库请求', () => {
    const { 上下文, 方案列表 } = 创建批次()
    const 来源事实 = JSON.stringify(上下文.订单.map(单 => ({ items: 单.items, address: 单.address, amount: 单.amount, route: 单.defaultRoute })))
    const 结果 = 保存多组合并发货方案(上下文, 方案列表, 版本表(上下文))
    expect(结果.成功, 结果.信息).toBe(true)
    expect(结果.信息).toContain('2 组')
    expect(结果.信息).toContain('4 张订单')
    expect(上下文.订单.map(单 => 单.manualShippingPlan?.orderNos)).toEqual([['A', 'B'], ['A', 'B'], ['C', 'D'], ['C', 'D']])
    expect(上下文.订单.every(单 => 单.processingStatus === '待审核' && !单.fulfillmentOrders.length && 单.operationLogs.length === 1)).toBe(true)
    expect(上下文.订单.every(单 => 单.manualShippingPlan!.reason === '同买家同地址人工合并寄送')).toBe(true)
    expect(上下文.版本).toEqual({ A: 2, B: 2, C: 2, D: 2 })
    expect(上下文.仓库执行).toEqual([])
    expect(JSON.stringify(上下文.订单.map(单 => ({ items: 单.items, address: 单.address, amount: 单.amount, route: 单.defaultRoute })))).toBe(来源事实)
    方案列表[0]!.packages[0]!.items[0]!.quantity = 99
    expect(上下文.订单[0]!.manualShippingPlan?.packages[0]!.items[0]!.quantity).toBe(2)
    expect(上下文.订单[0]!.manualShippingPlan).not.toBe(上下文.订单[1]!.manualShippingPlan)
  })

  it.each([
    ['来源版本变化', (上下文: ReturnType<typeof 创建上下文>, _: 人工发货方案[]) => { 上下文.版本.D = 2 }, '版本'],
    ['预览后地址变化', (上下文: ReturnType<typeof 创建上下文>, _: 人工发货方案[]) => { 上下文.订单[3]!.address.addressLine2 = 'DEMO-OTHER-ROOM' }, '完整收货地址'],
    ['预览后买家变化', (上下文: ReturnType<typeof 创建上下文>, _: 人工发货方案[]) => { 上下文.订单[3]!.buyerExternalId = 'DEMO-OTHER-BUYER' }, '买家身份'],
    ['数量漏分', (_: ReturnType<typeof 创建上下文>, 方案列表: 人工发货方案[]) => { 方案列表[1]!.packages[0]!.items[0]!.quantity = 1 }, '分配总数'],
    ['路由失效', (_: ReturnType<typeof 创建上下文>, 方案列表: 人工发货方案[]) => { 方案列表[1]!.packages[0]!.route.shippingChannelCode = 'DEMO-EXPIRED' }, '组合已失效'],
    ['原因超长', (_: ReturnType<typeof 创建上下文>, 方案列表: 人工发货方案[]) => { 方案列表[1]!.reason = '字'.repeat(2001) }, '2000'],
  ] as const)('第二组%s 时全批失败，第一组不保存、不写日志或升版本', (_, 修改, 提示) => {
    const { 上下文, 方案列表 } = 创建批次()
    const 期望版本 = 版本表(上下文)
    修改(上下文, 方案列表)
    const 之前 = JSON.stringify(上下文.订单), 原版本 = JSON.stringify(上下文.版本)
    const 结果 = 保存多组合并发货方案(上下文, 方案列表, 期望版本)
    expect(结果.成功).toBe(false)
    expect(结果.信息).toContain(提示)
    expect(JSON.stringify(上下文.订单)).toBe(之前)
    expect(JSON.stringify(上下文.版本)).toBe(原版本)
  })

  it('拒绝空批次、非合并类型、组间重复来源或重复方案身份，均无副作用', () => {
    const { 上下文, 方案列表 } = 创建批次()
    const 之前 = JSON.stringify(上下文.订单)
    expect(保存多组合并发货方案(上下文, [], 版本表(上下文)).成功).toBe(false)
    const 拆分 = 创建拆分发货草稿(上下文.订单[0]!); 拆分.reason = '非合并'
    expect(保存多组合并发货方案(上下文, [拆分], 版本表(上下文)).信息).toContain('只支持合并')
    expect(保存多组合并发货方案(上下文, [方案列表[0]!, 克隆(方案列表[0]!)], 版本表(上下文)).信息).toContain('重复来源订单')
    方案列表[1]!.id = 方案列表[0]!.id
    expect(保存多组合并发货方案(上下文, 方案列表, 版本表(上下文)).信息).toContain('方案标识重复')
    expect(JSON.stringify(上下文.订单)).toBe(之前)
    expect(上下文.版本).toEqual({ A: 1, B: 1, C: 1, D: 1 })
  })
})
