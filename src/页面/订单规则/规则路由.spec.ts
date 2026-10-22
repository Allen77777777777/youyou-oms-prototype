import { describe, expect, it } from 'vitest'
import { 创建规则样例, 校验规则配置, 试算规则 } from './规则逻辑'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则渠道样例, 读取分仓路由, 校验分仓路由, 初始化分仓策略, 读取分仓策略, 校验分仓策略, 检查分仓剩余库存, 格式化分仓策略 } from './规则路由'

describe('分仓规则的仓库与物流渠道身份', () => {
  it('两条原有分仓样例绑定既有联动渠道，保留四规则身份与顺序', () => {
    const 规则 = 创建规则样例(), 渠道 = 创建规则渠道样例()
    expect(规则.map(项 => 项.id)).toEqual(['RULE-REVIEW-01', 'RULE-ROUTE-01', 'RULE-ROUTE-02', 'RULE-CONFIRM-01'])
    expect(规则[1]!.routeAction?.channelId).toBe('DEMO-CF-CHANNEL-WYT')
    expect(规则[2]!.routeAction?.channelId).toBe('DEMO-CF-CHANNEL-GC')
    expect(读取分仓路由(规则[1]!, 渠道)?.warehouse).toBe('万邑通美西仓')
    expect(读取分仓路由(规则[2]!, 渠道)?.warehouse).toBe('谷仓美东仓')
    expect(规则.filter(项 => 项.note.trim())).toHaveLength(1)
    expect(规则.find(项 => 项.note.trim())?.type).toBe('分仓规则')
  })

  it('非分仓规则无需路由，分仓缺仓库或渠道不能保存', () => {
    const 规则 = 创建规则样例(), 渠道 = 创建规则渠道样例(), 分仓 = 规则[1]!
    expect(校验分仓路由(规则[0]!, [])).toBe('')
    expect(读取分仓路由(规则[0]!, 渠道)).toBeUndefined()
    delete 分仓.routeAction
    expect(校验分仓路由(分仓, 渠道)).toContain('发货仓库')
    分仓.routeAction = { providerId: 'DEMO-CF-PROVIDER-WYT', accountId: 'DEMO-CF-ACCOUNT-WYT', warehouseId: 'DEMO-CF-WAREHOUSE-WYT', channelId: '' }
    expect(校验分仓路由(分仓, 渠道)).toContain('请选择物流渠道')
    分仓.routeAction.channelId = 'MISSING'
    expect(校验分仓路由(分仓, 渠道)).toContain('不存在')
    expect(读取分仓路由(分仓, 渠道)).toBeUndefined()
  })

  it.each(['providerId', 'accountId', 'warehouseId'] as const)('跨%s的同名渠道不能借用', 字段 => {
    const 规则 = 创建规则样例()[1]!, 渠道 = 创建规则渠道样例()
    规则.routeAction![字段] = 'ANOTHER-SCOPE'
    expect(校验分仓路由(规则, 渠道)).toContain('不属于所选')
    expect(读取分仓路由(规则, 渠道)).toBeUndefined()
  })

  it('停用、非仓库回传或重复渠道身份不返回可用路由', () => {
    const 规则 = 创建规则样例()[1]!, 渠道 = 创建规则渠道样例(), 项 = 渠道.find(项 => 项.id === 规则.routeAction!.channelId)!
    项.enabled = false
    expect(校验分仓路由(规则, 渠道)).toContain('已停用')
    expect(读取分仓路由(规则, 渠道)).toBeUndefined()
    项.enabled = true; 项.labelMode = '仓配分离'
    expect(校验分仓路由(规则, 渠道)).toContain('仓库回传')
    项.labelMode = '仓库回传'; 渠道.push({ ...项 })
    expect(校验分仓路由(规则, 渠道)).toContain('身份不唯一')
    expect(读取分仓路由(规则, 渠道)).toBeUndefined()
  })

  it('读取只返回隔离副本，不改变源配置且不随后续编辑变化', () => {
    const 规则 = 创建规则样例()[1]!, 渠道 = 创建规则渠道样例(), 前快照 = JSON.stringify(渠道)
    const 路由 = 读取分仓路由(规则, 渠道)!, 源 = 渠道.find(项 => 项.id === 路由.id)!
    expect(JSON.stringify(渠道)).toBe(前快照)
    源.name = '修改后的渠道名称'; 源.shipmentMappings[0]!.carrierCode = 'ANOTHER'
    expect(路由.name).toBe('USPS Ground Advantage')
    expect(路由.shipmentMappings[0]!.carrierCode).toBe('USPS')
    路由.warehouse = '只改副本'
    expect(源.warehouse).toBe('万邑通美西仓')
  })
})

describe('基础分仓与剩余库存检测', () => {
  it('旧配置只读兼容为基础且不检测，草稿初始化不修改来源', () => {
    const source = 创建规则样例()[1]!, before = JSON.stringify(source)
    expect(读取分仓策略(source)).toEqual({ mode: 'basic', checkRemainingStock: false })
    expect(格式化分仓策略(source)).toBe('基础')
    const draft = structuredClone(source); 初始化分仓策略(draft)
    draft.warehouseAction!.checkRemainingStock = true
    expect(JSON.stringify(source)).toBe(before)
    expect(校验分仓策略(source)).toBe('')
  })
  it('旧库龄策略缺省全批次并累加，独立批次口径不借用比价暂存口径', () => {
    const source = 创建规则样例()[1]!
    source.warehouseAction = { mode: 'age', checkRemainingStock: false, ageRoutes: [{ ...source.routeAction! }], agePreference: 'recent' }
    const before = JSON.stringify(source)
    expect(校验分仓策略(source)).toBe('')
    expect(格式化分仓策略(source)).toBe('库龄分仓；优先库龄高（全批次）；多个SKU按库龄累加比较')
    expect(source.warehouseAction.ageBatchPreference).toBeUndefined()
    const draft = structuredClone(source)
    draft.warehouseAction!.ageBatchPreference = 'recent'
    draft.warehouseAction!.agePreference = 'all'
    expect(校验分仓策略(draft)).toBe('')
    expect(格式化分仓策略(draft)).toBe('库龄分仓；优先库龄高（最近批次）；多个SKU按库龄累加比较')
    expect(draft.warehouseAction!.agePreference).toBe('all')
    expect(JSON.stringify(source)).toBe(before)
  })
  it.each(['', 'oldest', null, 0])('库龄分仓拒绝非法独立批次口径 %s，比价模式不校验隐藏库龄配置', value => {
    const rule = 创建规则样例()[1]!
    rule.warehouseAction = { mode: 'age', checkRemainingStock: false, ageRoutes: [{ ...rule.routeAction! }], priceRoutes: [{ ...rule.routeAction! }] }
    Object.assign(rule.warehouseAction, { ageBatchPreference: value })
    expect(校验分仓策略(rule)).toContain('库龄分仓批次口径')
    rule.warehouseAction.mode = 'price'
    expect(校验分仓策略(rule)).toBe('')
  })
  it('比价模式必须完整配置候选，不能借用基础暂存路由', () => {
    const rule = 创建规则样例()[1]!
    rule.warehouseAction = { mode: 'price', checkRemainingStock: false }
    expect(校验规则配置(rule, [rule])).toContain('请至少选择一个比价分仓')
    expect(试算规则([rule], 全渠道订单模拟数据[0]!, '分仓规则').hit).toBeUndefined()
    expect(读取分仓路由(rule, 创建规则渠道样例())).toBeUndefined()
  })
  it.each(['', '-1', '1.5', '1e3', ' 5 ', '1234567890123456789012345'])('启用时拒绝非法阈值%s，关闭后保留并忽略', value => {
    const rule = 创建规则样例()[1]!
    rule.warehouseAction = { mode: 'basic', checkRemainingStock: true, minimumRemainingStock: value }
    expect(校验分仓策略(rule)).toContain('非负整数')
    rule.warehouseAction.checkRemainingStock = false
    expect(校验分仓策略(rule)).toBe('')
    expect(检查分仓剩余库存(rule)).toBe('unchecked')
    expect(rule.warehouseAction.minimumRemainingStock).toBe(value)
  })
  it('按严格小于比较，等于通过，零阈值仍拦截负数，支持大整数且不重复扣库存', () => {
    const rule = 创建规则样例()[1]!
    rule.warehouseAction = { mode: 'basic', checkRemainingStock: true, minimumRemainingStock: '5' }
    expect(检查分仓剩余库存(rule, ['1'])).toBe('skip')
    expect(检查分仓剩余库存(rule, ['5', '6'])).toBe('pass')
    expect(检查分仓剩余库存(rule, ['8', '4'])).toBe('skip')
    rule.warehouseAction.minimumRemainingStock = '0'
    expect(检查分仓剩余库存(rule, ['0'])).toBe('pass')
    expect(检查分仓剩余库存(rule, ['-1'])).toBe('skip')
    rule.warehouseAction.minimumRemainingStock = '9007199254740993'
    expect(检查分仓剩余库存(rule, ['9007199254740992'])).toBe('skip')
  })
  it('开启检测但资料未取得时阻断只读试算，不写订单、路由或库存', () => {
    const rule = 创建规则样例()[1]!, order = structuredClone(全渠道订单模拟数据[0]!)
    order.processingStatus = '待审核'
    rule.warehouseAction = { mode: 'basic', checkRemainingStock: true, minimumRemainingStock: '5' }
    const before = JSON.stringify({ rule, order })
    expect(检查分仓剩余库存(rule)).toBe('unknown')
    expect(检查分仓剩余库存(rule, [])).toBe('unknown')
    expect(检查分仓剩余库存(rule, [''])).toBe('unknown')
    const result = 试算规则([rule], order, '分仓规则')
    expect(result.hit?.id).toBe(rule.id)
    expect(result.gates).toContain('未取得分仓后剩余可用库存，无法判断是否跳过该仓库')
    expect(JSON.stringify({ rule, order })).toBe(before)
    rule.warehouseAction.checkRemainingStock = false
    expect(试算规则([rule], order, '分仓规则').gates.join('')).not.toContain('剩余可用库存')
  })
})

describe('比价分仓比较逻辑配置', () => {
  function 综合规则() {
    const rule = 创建规则样例()[1]!
    rule.warehouseAction = { mode: 'price', checkRemainingStock: false, priceRoutes: [{ ...rule.routeAction! }], priceComparison: 'priceAge', priceAgeLogic: 'priceGap', priceDifference: '1.000001', priceDifferenceCurrency: 'USD', agePreference: 'recent', ageDifferenceDays: '30' }
    return rule
  }

  it('未配置比较逻辑的旧比价规则继续按最低价，读取与初始化不写回源对象', () => {
    const source = 综合规则()
    delete source.warehouseAction!.priceComparison
    delete source.warehouseAction!.priceDifference
    delete source.warehouseAction!.agePreference
    delete source.warehouseAction!.ageDifferenceDays
    const before = JSON.stringify(source)
    expect(校验规则配置(source, [source], 创建规则渠道样例())).toBe('')
    expect(格式化分仓策略(source)).toBe('比价分仓；优先分配接口试算总费用最低的仓库及渠道')
    expect(读取分仓策略(source).priceComparison).toBeUndefined()
    const draft = structuredClone(source)
    初始化分仓策略(draft)
    Object.assign(draft.warehouseAction!, { priceComparison: 'priceAge', priceDifference: '2', agePreference: 'all', ageDifferenceDays: '10' })
    expect(校验分仓策略(draft)).toBe('')
    expect(JSON.stringify(source)).toBe(before)
    expect(Object.prototype.hasOwnProperty.call(source.warehouseAction!, 'priceComparison')).toBe(false)
  })

  it('旧综合规则缺省价格差额优先，不校验未选库龄天数且不写回来源', () => {
    const source = 综合规则()
    delete source.warehouseAction!.priceAgeLogic
    source.warehouseAction!.ageDifferenceDays = '旧未选值'
    const before = JSON.stringify(source)
    expect(校验规则配置(source, [source], 创建规则渠道样例())).toBe('')
    expect(格式化分仓策略(source)).toContain('价格相差不到 1.000001 USD')
    expect(格式化分仓策略(source)).not.toContain('库龄相差不到')
    expect(JSON.stringify(source)).toBe(before)
    expect(Object.prototype.hasOwnProperty.call(source.warehouseAction!, 'priceAgeLogic')).toBe(false)
  })

  it.each([
    { price: '0', days: '0', preference: 'recent' },
    { price: '0.000001', days: '1', preference: 'all' },
    { price: '999999999999999999999999', days: '999999999999999999999999', preference: 'recent' },
    { price: '999999999999999999.999999', days: '9007199254740993', preference: 'all' },
  ].flatMap(item => (['priceGap', 'ageGap'] as const).map(logic => ({ ...item, logic }))))('$logic 接受所选精度边界 $price、$days 天及 $preference，摘要不混入另一逻辑', ({ price, days, preference, logic }) => {
    const rule = 综合规则()
    Object.assign(rule.warehouseAction!, { priceAgeLogic: logic, priceDifference: logic === 'priceGap' ? price : '未选非法金额', agePreference: preference, ageDifferenceDays: logic === 'ageGap' ? days : '未选非法天数' })
    const before = JSON.stringify(rule)
    expect(校验规则配置(rule, [rule], 创建规则渠道样例())).toBe('')
    expect(格式化分仓策略(rule)).toContain(preference === 'all' ? '全批次' : '最近批次')
    if (logic === 'priceGap') {
      expect(格式化分仓策略(rule)).toContain(`价格相差不到 ${price} USD`)
      expect(格式化分仓策略(rule)).not.toContain('库龄相差不到')
    } else {
      expect(格式化分仓策略(rule)).toContain(`库龄相差不到 ${days} 天`)
      expect(格式化分仓策略(rule)).not.toContain('价格相差不到')
    }
    expect(JSON.stringify(rule)).toBe(before)
  })

  it.each([
    ...[undefined, '', 'usd', 'BTC', 1].map(value => ({ field: 'priceDifferenceCurrency', value, error: '价格差额币种', logic: 'priceGap' })),
    ...['', '-1', '+1', '1e3', '.5', '1.', '1.0000001', '1234567890123456789012345', '1234567890123456789.123456', undefined, 1].map(value => ({ field: 'priceDifference', value, error: '价格差额', logic: 'priceGap' })),
    ...['', '-1', '1.5', '1e3', ' 5 ', '1234567890123456789012345', undefined, 1].map(value => ({ field: 'ageDifferenceDays', value, error: '库龄差额', logic: 'ageGap' })),
    ...['', 'oldest', undefined, null].flatMap(value => (['priceGap', 'ageGap'] as const).map(logic => ({ field: 'agePreference', value, error: '库龄优先口径', logic }))),
  ])('$logic 拦截所选 $field=$value，另一逻辑忽略未选阈值、最低价忽略综合草稿', ({ field, value, error, logic }) => {
    const rule = 综合规则()
    Object.assign(rule.warehouseAction!, { priceAgeLogic: logic, [field]: value })
    const before = JSON.stringify(rule)
    expect(校验分仓策略(rule)).toContain(error)
    expect(校验规则配置(rule, [rule], 创建规则渠道样例())).toContain(error)
    expect(格式化分仓策略(rule)).toBe('分仓策略配置待完善')
    expect(JSON.stringify(rule)).toBe(before)
    rule.warehouseAction!.priceAgeLogic = logic === 'priceGap' ? 'ageGap' : 'priceGap'
    expect(校验分仓策略(rule)).toBe(field === 'agePreference' ? '请选择有效的库龄优先口径' : '')
    rule.warehouseAction!.priceComparison = 'lowest'
    const lowestBefore = JSON.stringify(rule)
    expect(校验分仓策略(rule)).toBe('')
    expect(格式化分仓策略(rule)).toBe('比价分仓；优先分配接口试算总费用最低的仓库及渠道')
    expect(JSON.stringify(rule)).toBe(lowestBefore)
  })

  it.each([{ value: '' }, { value: 'legacy' }, { value: null }, { value: 0 }, { value: ['priceGap', 'ageGap'] }])('拒绝非法或多选综合判断逻辑 $value，最低价模式保留并忽略', ({ value }) => {
    const rule = 综合规则()
    Object.assign(rule.warehouseAction!, { priceAgeLogic: value })
    const before = JSON.stringify(rule)
    expect(校验分仓策略(rule)).toContain('综合判断逻辑')
    expect(格式化分仓策略(rule)).toBe('分仓策略配置待完善')
    expect(JSON.stringify(rule)).toBe(before)
    rule.warehouseAction!.priceComparison = 'lowest'
    expect(校验分仓策略(rule)).toBe('')
  })

  it.each(['', 'legacy', null, 0, true])('拒绝未知比较逻辑 %s，不悄悄降级为最低价', value => {
    const rule = 综合规则()
    Object.assign(rule.warehouseAction!, { priceComparison: value })
    const before = JSON.stringify(rule)
    expect(校验分仓策略(rule)).toContain('比较逻辑')
    expect(格式化分仓策略(rule)).toBe('分仓策略配置待完善')
    expect(JSON.stringify(rule)).toBe(before)
  })
})
