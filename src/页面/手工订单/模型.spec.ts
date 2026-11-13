import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { 创建手工订单, 创建手工订单草稿, 手工商品资料, 校验手工订单, 原订单关联阻断原因, 手工店铺选项, 手工订单路由, 校验手工订单路由 } from './模型'
import { 共享订单, 仓库执行记录, 订单版本, 操作核查证据, 演示库存, 演示路由, 当前版本, 执行演示审核, 执行演示推单, 核查演示仓库结果, 审核阻断原因 } from '../订单处理/演示会话'
import { 同步演示仓库状态 } from '../订单处理/操作功能模型'
import { 创建标发演示单, 标发阻断原因 } from '../订单标发/标发逻辑'
import { 共享标发单 } from '../订单标发/演示会话'
import { 格式化金额, 获取平台状态说明, 筛选全渠道订单, 规范化筛选条件 } from '../全渠道订单/订单工具'
import { 命中作业关注, type 作业行 } from '../订单处理/展示工具'
import { 路由仓库键 } from '../订单处理/仓库物流选择模型'
import { 共享订单备注, 获取订单备注 } from '../订单处理/订单备注模型'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 是手工订单, 手工发货条件阻断 } from './来源规则'
import { 计算订单标志 } from '../订单处理/订单标志模型'

const 初始订单 = JSON.stringify(共享订单.value)
const 初始执行 = JSON.stringify(仓库执行记录.value)
const 初始证据 = JSON.stringify(操作核查证据.value)
const 初始库存 = JSON.stringify(演示库存.value)
const 初始渠道 = JSON.stringify(渠道会话.value)
const 初始备注 = JSON.stringify(共享订单备注.value)
beforeEach(() => {
  共享订单.value = JSON.parse(初始订单)
  仓库执行记录.value = JSON.parse(初始执行)
  操作核查证据.value = JSON.parse(初始证据)
  演示库存.value = JSON.parse(初始库存)
  订单版本.value = {}
  渠道会话.value = JSON.parse(初始渠道)
  共享订单备注.value = JSON.parse(初始备注)
})
afterEach(() => { 渠道会话.value = JSON.parse(初始渠道); 共享订单备注.value = JSON.parse(初始备注) })

function 合法草稿() {
  const 草稿 = 创建手工订单草稿()
  草稿.reason = '虚构样品寄送评审'
  草稿.storeId = 手工店铺选项.value.find(店铺 => 店铺.storeId === 'store-ebay-us-01')!.storeId
  草稿.warehouse = 路由仓库键(演示路由[0]!)
  草稿.channel = 演示路由[0]!.shippingChannelCode
  草稿.items = [{ systemSku: 手工商品资料.find(资料 => 资料.systemSku === 'DEMO-STORAGE-01')!.systemSku, quantity: 2 }]
  草稿.address = { fullName: '虚构收件人', countryCode: 'US', city: 'Demo City', addressLine1: '100 Example Street', postalCode: '90000', telephone: '000-000-0000' }
  return 草稿
}

describe('手工订单创建与共享履约', () => {
  it('载入建单模块和创建空白草稿均不生成订单或仓库执行', () => {
    const 订单快照 = JSON.stringify(共享订单.value)
    const 仓单快照 = JSON.stringify(仓库执行记录.value)
    expect(共享订单.value.filter(订单 => 订单.manualOrder).map(订单 => 订单.manualOrder!.scenario)).toEqual(['售后补寄', '线下销售', '寄样赠送', '其他'])
    for (const 订单 of 共享订单.value.filter(订单 => 订单.manualOrder)) {
      expect(审核阻断原因(订单)).toEqual([])
      expect(计算订单标志(订单).map(项 => 项.text)).toEqual(['手'])
      expect(订单.platformOrderStatus).toBeUndefined()
    }
    expect(创建手工订单草稿().items).toEqual([])
    expect(JSON.stringify(共享订单.value)).toBe(订单快照)
    expect(JSON.stringify(仓库执行记录.value)).toBe(仓单快照)
  })

  it('新建进入统一待审核主事实，无平台、交易或单价伪值，金额缺失与零分开', () => {
    const 结果 = 创建手工订单(合法草稿())
    expect(结果.成功).toBe(true)
    const 订单 = 结果.订单!
    expect(共享订单.value.find(单 => 单.systemOrderNo === 订单.systemOrderNo)).toBe(订单)
    expect(订单).toMatchObject({ platformCode: '手工', processingStatus: '待审核', orderType: '手工订单', platformOrderNo: '', storeId: 'store-ebay-us-01', storeName: '北美底盘配件店', defaultRoute: 演示路由[0] })
    expect(订单.defaultRoute).not.toBe(演示路由[0])
    expect(订单.fulfillmentOrders).toEqual([])
    expect(订单.platformOrderId).toBeUndefined()
    expect(订单.platformOrderStatus).toBeUndefined()
    expect(订单.professionalOrder).toBeUndefined()
    expect(订单.paidAt).toBeUndefined()
    expect(订单.items[0]).toMatchObject({ systemSku: 'DEMO-STORAGE-01', orderedQuantity: 2, fulfillableQuantity: 2, skuResolutionStatus: '成功' })
    expect(订单.handlerAssignment).toMatchObject({ handlerIds: ['staff-01'], assignedAt: 订单.createdAt, source: 'SKU', lines: [{ systemSku: 'DEMO-STORAGE-01', operatorIds: ['staff-01'] }] })
    expect(订单.items[0]!.platformSku).toBeUndefined()
    expect(订单.items[0]!.platformItemTitle).toBeUndefined()
    expect(格式化金额(订单.amount.orderAmount)).toBe('—')
    expect(格式化金额(订单.items[0]!.unitPrice)).toBe('—')
    expect(订单.sync.status).toBeUndefined()
    expect(订单.operationLogs[0]!.content).toContain('未推仓')
    expect(获取平台状态说明(订单).text).toBe('不适用')
    expect(筛选全渠道订单([订单], { ...规范化筛选条件({}), platformStatus: ['__NOT_INTEGRATED__'] }, '全部')).toEqual([])
  })

  it('同一请求重放不重复建单，修改原请求内容不新增订单', () => {
    const 草稿 = 合法草稿()
    草稿.note = '  交接时核对包装  '
    草稿.tags = [' 寄样 ', '', '寄样', '重点跟进']
    const 数量 = 共享订单.value.length
    const 首次 = 创建手工订单(草稿)
    const 重放 = 创建手工订单(草稿)
    expect(重放.订单).toBe(首次.订单)
    expect(共享订单.value).toHaveLength(数量 + 1)
    expect(获取订单备注(首次.订单!.systemOrderNo)).toHaveLength(1)
    expect(获取订单备注(首次.订单!.systemOrderNo)[0]!.note_content).toBe('交接时核对包装')
    expect(首次.订单!.tags).toEqual(['寄样', '重点跟进'])
    草稿.items[0]!.quantity = 3
    expect(创建手工订单(草稿)).toMatchObject({ 成功: false })
    expect(共享订单.value).toHaveLength(数量 + 1)
  })

  it('前置失败不创建订单；拒绝无商品、重复SKU、小数/负数数量、缺失地址和未知SKU', () => {
    const 数量 = 共享订单.value.length
    const 草稿 = 合法草稿()
    草稿.items = []
    expect(创建手工订单(草稿).信息).toContain('至少选择')
    草稿.items = [{ systemSku: 'UNKNOWN-SKU', quantity: 1.5 }, { systemSku: 'UNKNOWN-SKU', quantity: -1 }]
    草稿.address.fullName = ''
    expect(校验手工订单(草稿).join('；')).toContain('不要重复')
    expect(校验手工订单(草稿).join('；')).toContain('整数')
    expect(校验手工订单(草稿).join('；')).toContain('商品不存在')
    expect(校验手工订单(草稿).join('；')).toContain('收件人')
    expect(共享订单.value).toHaveLength(数量)
  })

  it('线下销售独立确认收款；非销售不伪造平台付款时间或PAID', () => {
    const 草稿 = 合法草稿()
    草稿.scenario = '线下销售'
    expect(创建手工订单(草稿).信息).toContain('确认已收款')
    草稿.paidConfirmed = true
    const 订单 = 创建手工订单(草稿).订单!
    expect(订单.manualOrder!.paidConfirmed).toBe(true)
    expect(订单.paidAt).toBeUndefined()
    订单.defaultRoute = { ...演示路由[0]! }
    订单.manualOrder!.paidConfirmed = false
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).信息).toContain('尚未确认已收款')
  })

  it('金额保持十进制字符串、不分摊商品；金额与币种成对校验', () => {
    const 草稿 = 合法草稿()
    草稿.amount = '00010.1'
    expect(创建手工订单(草稿).信息).toContain('同时填写')
    草稿.currency = 'usd'
    const 订单 = 创建手工订单(草稿).订单!
    expect(订单.amount.orderAmount).toEqual({ value: '10.10', currency: 'USD' })
    expect(订单.items[0]!.itemTotal.value).toBe('')
    expect(格式化金额({ value: '0.00', currency: 'USD' })).toBe('USD 0.00')
    const 非法 = 合法草稿()
    非法.amount = '1.234'
    非法.currency = 'USD'
    expect(校验手工订单(非法).join('；')).toContain('两位小数')
    非法.currency = 'JPY'; 非法.amount = '1.10'
    expect(校验手工订单(非法).join('；')).toContain('非负整数')
    非法.amount = '1e3'
    expect(创建手工订单(非法).成功).toBe(false)
  })

  it('补寄须关联已结束原单，不复制原单身份或改原商品、数量及执行', () => {
    const 草稿 = 合法草稿()
    草稿.scenario = '售后补寄'
    expect(创建手工订单(草稿).信息).toContain('必须关联')
    草稿.originalOrderNo = 'OMS260912000001'
    expect(创建手工订单(草稿).信息).toContain('尚未结束')
    草稿.originalOrderNo = 'OMS-DEMO-CF-01'
    const 原单 = 共享订单.value.find(单 => 单.systemOrderNo === 草稿.originalOrderNo)!
    const 原快照 = JSON.stringify(原单)
    const 结果 = 创建手工订单(草稿)
    expect(结果.成功).toBe(true)
    expect(结果.订单!.manualOrder!.originalOrderNo).toBe(原单.systemOrderNo)
    expect(结果.订单!.platformOrderNo).toBe('')
    expect(结果.订单!.platformOrderId).toBeUndefined()
    expect(结果.订单!.storeId).toBe(草稿.storeId)
    expect(结果.订单!.storeId).not.toBe(原单.storeId)
    expect(结果.订单!.address).toEqual(草稿.address)
    expect(JSON.stringify(原单)).toBe(原快照)
  })

  it('创建后原单出现待核查执行，审核和推仓均重新拦截补寄', () => {
    const 草稿 = 合法草稿()
    草稿.scenario = '售后补寄'; 草稿.originalOrderNo = 'OMS-DEMO-CF-01'
    const 订单 = 创建手工订单(草稿).订单!
    订单.defaultRoute = { ...演示路由[0]! }
    const 原仓 = 仓库执行记录.value.find(执行 => 执行.订单号.includes(草稿.originalOrderNo))!
    原仓.待核查 = true
    expect(原订单关联阻断原因(草稿.originalOrderNo).join('；')).toContain('待核查')
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(false)
    原仓.待核查 = false
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    原仓.待核查 = true
    expect(执行演示推单(订单.systemOrderNo, 订单.fulfillmentOrders[0]!.fulfillmentOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(false)
    expect(仓库执行记录.value.some(执行 => 执行.订单号.includes(订单.systemOrderNo))).toBe(false)
  })

  it('关联原单的平台状态变化不驱动手工单；自身只按审核与仓库执行推进', () => {
    const 草稿 = 合法草稿()
    草稿.scenario = '售后补寄'; 草稿.originalOrderNo = 'OMS-DEMO-CF-01'
    const 原单 = 共享订单.value.find(单 => 单.systemOrderNo === 草稿.originalOrderNo)!
    const 订单 = 创建手工订单(草稿).订单!
    const 原履约 = JSON.stringify(原单.fulfillmentOrders)
    for (const 平台状态 of ['NOT_STARTED', 'IN_PROGRESS', 'FULFILLED']) {
      原单.platformOrderStatus = 平台状态
      expect(订单.processingStatus).toBe('待审核')
      expect(订单.platformOrderStatus).toBeUndefined()
      expect(审核阻断原因(订单)).toEqual([])
      expect(计算订单标志(订单).map(项 => 项.text)).toEqual(['手'])
    }
    // 手工单没有平台条件；即使出现残留的只读平台门禁证据，也不能将其作为平台订单处理。
    操作核查证据.value[订单.systemOrderNo] = { 平台允许: false, 剩余已核实: true, 零出库已核实: true }
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    const 履约 = 订单.fulfillmentOrders[0]!
    原单.platformOrderStatus = 'NOT_STARTED'
    expect(执行演示推单(订单.systemOrderNo, 履约.fulfillmentOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    expect(订单.processingStatus).toBe('待推单')
    expect(核查演示仓库结果(履约.fulfillmentOrderNo).成功).toBe(true)
    expect(订单.processingStatus).toBe('待发货')
    expect(订单.platformOrderStatus).toBeUndefined()
    expect(JSON.stringify(原单.fulfillmentOrders)).toBe(原履约)
  })

  it('类型为手工订单时不能按平台单处理，缺元资料或污染的平台状态均阻断发货', () => {
    const 平台样例 = 共享订单.value.find(单 => 单.platformCode === 'eBay')!
    const 只有类型 = { ...平台样例, orderType: '手工订单', manualOrder: undefined }
    expect(是手工订单(只有类型)).toBe(true)
    expect(手工发货条件阻断(只有类型, 共享订单.value, 仓库执行记录.value)).toContain('手工订单来源资料缺失，请先核查')
    expect(获取平台状态说明(只有类型).text).toBe('不适用')
    const 订单 = 创建手工订单(合法草稿()).订单!
    订单.platformOrderStatus = 'FULFILLED'
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(false)
    expect(订单.processingStatus).toBe('待审核')
  })

  it('创建后复用审核、推单、接单和有效出库链路；无平台标发对象', () => {
    const 订单 = 创建手工订单(合法草稿()).订单!
    const 标发数 = 共享标发单.value.length
    expect(审核阻断原因(订单)).toEqual([])
    expect(执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    const 履约 = 订单.fulfillmentOrders[0]!
    expect(订单.processingStatus).toBe('待推单')
    expect(执行演示推单(订单.systemOrderNo, 履约.fulfillmentOrderNo, 当前版本(订单.systemOrderNo)).成功).toBe(true)
    expect(订单.processingStatus).toBe('待推单')
    expect(核查演示仓库结果(履约.fulfillmentOrderNo).成功).toBe(true)
    expect(订单.processingStatus).toBe('待发货')
    const 仓单 = 仓库执行记录.value.find(执行 => 执行.履约单号 === 履约.fulfillmentOrderNo)!
    // 与既有模型测试相同：显式注入固定虚构出库回执，而非用有跟踪号推算出库。
    操作核查证据.value[订单.systemOrderNo] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true, 同步结果: '已出库' }
    expect(同步演示仓库状态(仓单.出库单号).成功).toBe(true)
    expect(订单.processingStatus).toBe('已发货')
    expect(履约.shippedQuantity).toBe(2)
    expect(仓单.出库事实!.shipped).toBe(2)
    expect(共享标发单.value).toHaveLength(标发数)
    expect(创建标发演示单([订单])).toEqual([])
    expect(订单.platformOrderStatus).toBeUndefined()
    const 行: 作业行 = { key: 履约.fulfillmentOrderNo, order: 订单, fulfillment: 履约, execution: 仓单, stage: '已发货' }
    expect(命中作业关注(行, '无需标发', [])).toBe(true)
    expect(命中作业关注(行, '无标发记录', [])).toBe(false)
    const 假标发 = { no: 'FAKE', orderNo: 订单.systemOrderNo, fulfillmentNo: 履约.fulfillmentOrderNo, status: '待标发' as const, tracking: 履约.trackingNumber!, carrier: 'USPS', shippedAt: 履约.shippedAt!, quantity: 2, lineId: 订单.items[0]!.externalLineId, idempotencyKey: 'FAKE', pendingVerification: false, reason: '', attempts: [] }
    expect(标发阻断原因(假标发, 订单).join('；')).toContain('手工订单没有平台标发责任')
  })

  it('所有场景均要求有效发货店铺、仓库和渠道，失败时不创建订单或备注', () => {
    const 数量 = 共享订单.value.length, 备注数 = 共享订单备注.value.length
    for (const 场景 of ['线下销售', '寄样赠送', '售后补寄', '其他'] as const) {
      const 草稿 = 合法草稿()
      草稿.scenario = 场景; 草稿.storeId = ''; 草稿.warehouse = ''; 草稿.channel = ''; 草稿.note = '不应保存'
      const 结果 = 创建手工订单(草稿)
      expect(结果.成功).toBe(false)
      for (const 提示 of ['发货店铺', '发货仓库', '物流渠道']) expect(结果.信息).toContain(提示)
    }
    const 不存在 = 合法草稿(); 不存在.storeId = 'UNKNOWN-STORE'
    expect(创建手工订单(不存在).信息).toContain('店铺不存在')
    expect(共享订单.value).toHaveLength(数量)
    expect(共享订单备注.value).toHaveLength(备注数)
  })

  it('跨平台店铺按ID可靠去重；空资料、手工单和同ID冲突不会成为新单店铺选项', () => {
    const 来源 = 共享订单.value.find(订单 => 订单.storeId === 'store-ebay-us-01')!
    const 初始数 = 手工店铺选项.value.length
    共享订单.value.push({ ...来源, systemOrderNo: 'STORE-DUPLICATE' })
    expect(手工店铺选项.value).toHaveLength(初始数)
    共享订单.value.push({ ...来源, systemOrderNo: 'STORE-EMPTY', storeId: 'STORE-EMPTY', storeName: '' })
    expect(手工店铺选项.value.some(店铺 => 店铺.storeId === 'STORE-EMPTY')).toBe(false)
    const 新单 = 创建手工订单(合法草稿()).订单!
    新单.storeId = 'MANUAL-ONLY-STORE'
    expect(手工店铺选项.value.some(店铺 => 店铺.storeId === 'MANUAL-ONLY-STORE')).toBe(false)
    共享订单.value.push({ ...来源, systemOrderNo: 'STORE-CONFLICT', storeName: '冲突店铺名称' })
    expect(手工店铺选项.value.some(店铺 => 店铺.storeId === 来源.storeId)).toBe(false)
    const 草稿 = 创建手工订单草稿(); 草稿.storeId = 来源.storeId
    expect(校验手工订单(草稿).join('；')).toContain('资料不唯一')
  })

  it('仓库与渠道不能跨账号串用；停用、重复来源、资料不一致及仓配分离在提交时复验', () => {
    const 草稿 = 合法草稿(), 路由 = 演示路由[0]!
    草稿.channel = 演示路由[1]!.shippingChannelCode
    expect(校验手工订单路由(草稿).join('；')).toContain('组合无效')
    草稿.channel = 路由.shippingChannelCode
    expect(校验手工订单路由(草稿)).toEqual([])
    const 渠道 = 渠道会话.value.find(项 => 项.id === 路由.shippingChannelId)!
    渠道.enabled = false
    expect(手工订单路由.value.some(项 => 项.shippingChannelId === 渠道.id)).toBe(false)
    expect(创建手工订单(草稿).信息).toContain('已停用')
    渠道.enabled = true
    渠道会话.value.push({ ...渠道 })
    expect(创建手工订单(草稿).信息).toContain('身份不唯一')
    渠道会话.value.pop()
    渠道.account = '其他账号'
    expect(创建手工订单(草稿).信息).toContain('资料不一致')
    渠道.account = 路由.warehouseAccount
    渠道.labelMode = '卖家自传'
    expect(创建手工订单(草稿).信息).toContain('仓配一体')
    渠道.labelMode = '仓库回传'
    expect(创建手工订单(草稿).成功).toBe(true)
  })

  it('新字段参与请求防重；备注不重复，标签、地址和默认路由均保存独立快照', () => {
    const 草稿 = 合法草稿()
    草稿.note = '首条内部备注'; 草稿.tags = ['寄样', '重点跟进']
    const 订单 = 创建手工订单(草稿).订单!
    草稿.tags.push('后改草稿')
    草稿.address.addressLine1 = 'New Address'
    expect(订单.tags).toEqual(['寄样', '重点跟进'])
    expect(订单.address.addressLine1).toBe('100 Example Street')
    expect(创建手工订单(草稿).成功).toBe(false)
    expect(获取订单备注(订单.systemOrderNo)).toHaveLength(1)
    for (const 字段 of ['storeId', 'warehouse', 'channel', 'note'] as const) {
      const 新草稿 = 合法草稿(); 新草稿.note = '创建备注'
      const 新单 = 创建手工订单(新草稿).订单!
      新草稿[字段] = '变更内容'
      expect(创建手工订单(新草稿).信息).toContain('内容已变化')
      expect(获取订单备注(新单.systemOrderNo)).toHaveLength(1)
    }
  })

  it('备注及标签按长度限制，新增收件字段校验，空可选字段可正常提交', () => {
    const 草稿 = 合法草稿()
    草稿.note = '注'.repeat(2001)
    草稿.tags = Array.from({ length: 11 }, (_, 索引) => `标签${索引}`)
    草稿.tags[0] = '签'.repeat(21)
    草稿.address.stateProvince = '省'.repeat(101)
    草稿.address.addressLine2 = '址'.repeat(301)
    草稿.address.companyName = '司'.repeat(101)
    草稿.address.email = 'invalid email'
    const 信息 = 校验手工订单(草稿).join('；')
    for (const 提示 of ['备注最多2000', '标签最多10个', '标签最多20字', '州/省最多100', '地址2最多300', '公司名称最多100', '有效邮箱']) expect(信息).toContain(提示)
    草稿.note = '注'.repeat(2000); 草稿.tags = ['签'.repeat(20)]
    草稿.address.stateProvince = '省'.repeat(100); 草稿.address.addressLine2 = '址'.repeat(300)
    草稿.address.companyName = '司'.repeat(100); 草稿.address.email = 'demo@example.invalid'
    expect(创建手工订单(草稿).成功).toBe(true)
    expect(创建手工订单(合法草稿()).成功).toBe(true)
  })

  it('已创建手工单丢失发货店铺后不能继续审核，非手工单不套用此保护', () => {
    const 订单 = 创建手工订单(合法草稿()).订单!
    订单.storeId = ''
    expect(审核阻断原因(订单).join('；')).toContain('缺少发货店铺')
    const 普通单 = 共享订单.value.find(项 => !项.manualOrder && 项.processingStatus === '待审核')!
    普通单.storeId = ''; 普通单.storeName = ''
    expect(审核阻断原因(普通单).join('；')).not.toContain('手工订单缺少发货店铺')
  })
})
