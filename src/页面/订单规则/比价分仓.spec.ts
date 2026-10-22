import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则样例, 校验规则配置, 试算规则 } from './规则逻辑'
import { 创建规则渠道样例, 读取分仓路由, 分仓配置摘要 } from './规则路由'
import { 计算比价分仓, 运费试算输入快照, 创建模拟运费报价, type 运费试算报价 } from './比价分仓'
import { agingRecords } from '../三方仓库龄/库龄模型'
import type { 候选库龄资料 } from './库龄分仓'
import type { 比价汇率快照 } from './比价汇率'

function 汇率准备(rates: 比价汇率快照['rates'] = [{ currencyCode: 'USD', cnyRate: '7.2' }, { currencyCode: 'EUR', cnyRate: '7.8' }]): 比价汇率快照 {
  return { snapshotId: 'DEMO-FX-SNAPSHOT', effectiveAt: '2026-10-22T00:00:00Z', source: '演示中台货币汇率快照', rates }
}

function 准备() {
  const rule = 创建规则样例()[1]!, channels = 创建规则渠道样例()
  const routes = ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].map(id => {
    const row = channels.find(c => c.id === id)!
    return { providerId: row.providerId, accountId: row.accountId, warehouseId: row.warehouseId, channelId: row.id }
  })
  rule.warehouseAction = { mode: 'price', priceRoutes: routes, checkRemainingStock: false }
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.processingStatus = '待审核'; order.address.postalCode = '90001'
  order.items = [{ ...order.items[0]!, systemSku: 'DEMO-SKU', skuResolutionStatus: '成功' }]
  const quotes: 运费试算报价[] = routes.map((route, index) => ({ ...route, status: '成功', orderNo: order.systemOrderNo, inputSnapshot: 运费试算输入快照(order), batchId: 'DEMO-BATCH', quoteId: `DEMO-Q-${index}`, quotedAt: '2026-10-22T00:00:00Z', currencyCode: 'USD', totalAmount: index ? '12.60' : '15.80' }))
  return { rule, channels, order, quotes }
}
describe('按海外仓接口原始总费用比价', () => {
  it('精确比较原始总费，返回最低组合且不修改订单、报价、渠道或规则', () => {
    const { rule, channels, order, quotes } = 准备(), before = JSON.stringify({ rule, channels, order, quotes })
    const result = 试算规则([rule], order, '分仓规则', channels, [], quotes)
    expect(result.gates).toEqual([])
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
    expect(result.pricing?.ranked.map(row => row.quote.totalAmount)).toEqual(['12.60', '15.80'])
    expect(读取分仓路由(rule, channels)).toBeUndefined()
    expect(分仓配置摘要(rule, channels).join()).toContain('接口试算总费用最低')
    expect(JSON.stringify({ rule, channels, order, quotes })).toBe(before)
  })
  it('大整数与小数不经浮点，同费用按配置顺序，真实0元可参与', () => {
    const { rule, channels, order, quotes } = 准备()
    quotes[0]!.totalAmount = '9007199254740993.000001'; quotes[1]!.totalAmount = '9007199254740993.000002'
    expect(计算比价分仓(rule, order, channels, quotes).route?.id).toBe(quotes[0]!.channelId)
    quotes[0]!.totalAmount = '12.600'; quotes[1]!.totalAmount = '12.60'
    expect(计算比价分仓(rule, order, channels, quotes).route?.id).toBe(quotes[0]!.channelId)
    quotes[1]!.totalAmount = '0'
    expect(计算比价分仓(rule, order, channels, quotes).route?.id).toBe(quotes[1]!.channelId)
  })
  it.each([undefined, '', '-1', 'NaN', '1e2', '1.1234567'])('缺失或非法总费%s不补0，也不借用其他已知报价兜底', amount => {
    const { rule, channels, order, quotes } = 准备(); quotes[1]!.totalAmount = amount
    const result = 计算比价分仓(rule, order, channels, quotes)
    expect(result.route).toBeUndefined(); expect(result.gates.join()).toContain('总费用或币种无效')
  })
  it('缺汇率的跨币种、重复结果、跨账号、过期输入或混轮结果无最终推荐', () => {
    const scenarios = [
      (q: 运费试算报价[]) => { q[1]!.currencyCode = 'CNY' },
      (q: 运费试算报价[]) => { q.push({ ...q[1]! }) },
      (q: 运费试算报价[]) => { q[1]!.accountId = 'OTHER' },
      (q: 运费试算报价[]) => { q[1]!.inputSnapshot = 'OLD' },
      (q: 运费试算报价[]) => { q[1]!.batchId = 'OTHER' },
    ]
    for (const change of scenarios) { const { rule, channels, order, quotes } = 准备(); change(quotes); expect(计算比价分仓(rule, order, channels, quotes).route).toBeUndefined() }
  })
  it('同一未知币种也不排序推荐，不把任意三字母当有效币种', () => {
    const { rule, channels, order, quotes } = 准备()
    quotes.forEach(q => { q.currencyCode = 'ZZZ' })
    const result = 计算比价分仓(rule, order, channels, quotes)
    expect(result.route).toBeUndefined(); expect(result.ranked).toEqual([])
    expect(result.gates.join()).toContain('币种无效')
  })
  it('明确不支持可排除，失败或没有响应须核查，全部排除无路由', () => {
    const { rule, channels, order, quotes } = 准备()
    quotes[1]!.status = '不支持'
    expect(计算比价分仓(rule, order, channels, quotes).route?.id).toBe(quotes[0]!.channelId)
    quotes[0]!.status = '不支持'
    expect(计算比价分仓(rule, order, channels, quotes).gates.join()).toContain('所有候选组合均已排除')
    quotes[0]!.status = '失败'; quotes[0]!.reason = '模拟接口超时'
    expect(计算比价分仓(rule, order, channels, quotes).route).toBeUndefined()
    expect(计算比价分仓(rule, order, channels, []).gates.join()).toContain('未取得唯一')
  })
  it('库存先按各SKU分配后剩余量检查，不足跳过；未知不伪造可用量', () => {
    const { rule, channels, order, quotes } = 准备(); rule.warehouseAction!.checkRemainingStock = true; rule.warehouseAction!.minimumRemainingStock = '5'
    quotes[0]!.remainingStock = [{ systemSku: 'DEMO-SKU', quantity: '5' }]
    quotes[1]!.remainingStock = [{ systemSku: 'DEMO-SKU', quantity: '4' }]
    expect(计算比价分仓(rule, order, channels, quotes).route?.id).toBe(quotes[0]!.channelId)
    delete quotes[1]!.remainingStock
    expect(计算比价分仓(rule, order, channels, quotes).route).toBeUndefined()
  })
  it('重复仓渠组合拒绝；同仓不同渠道允许且摘要不会借用基础路由', () => {
    const { rule, channels } = 准备()
    rule.warehouseAction!.priceRoutes!.push({ ...rule.warehouseAction!.priceRoutes![0]! })
    expect(校验规则配置(rule, [rule], channels)).toContain('组合不能重复')
    const other = { ...channels.find(c => c.id === 'DEMO-CF-CHANNEL-WYT')!, id: 'DEMO-OTHER-CHANNEL' }
    channels.push(other); rule.warehouseAction!.priceRoutes![2]!.channelId = other.id
    expect(校验规则配置(rule, [rule], channels)).toBe('')
  })
  it('真实邮编和SKU映射不完整时不推荐；模拟报价按稳定渠道身份保留原始总费', () => {
    const { rule, channels, order, quotes } = 准备()
    const mock = 创建模拟运费报价(rule, order, channels)
    rule.warehouseAction!.priceRoutes!.reverse()
    const reorder = 创建模拟运费报价(rule, order, channels)
    expect(mock[0]!.totalAmount).toBe(reorder[1]!.totalAmount)
    order.address.postalCode = ''
    expect(计算比价分仓(rule, order, channels, quotes).gates.join()).toContain('真实邮编')
    order.address.postalCode = '90001'; order.items[0]!.skuResolutionStatus = '缺失'
    expect(计算比价分仓(rule, order, channels, quotes).route).toBeUndefined()
  })
})

function 综合准备(prices = ['100', '106', '112'], ages = [10, 30, 50]) {
  const fixture = 准备(), { rule, channels, order, quotes } = fixture
  const third = { ...channels.find(项 => 项.id === 'DEMO-CF-CHANNEL-WYT')!, id: 'DEMO-THIRD-CHANNEL', warehouseId: 'DEMO-THIRD-WAREHOUSE', warehouse: '演示第三仓' }
  channels.push(third)
  const thirdRoute = { providerId: third.providerId, accountId: third.accountId, warehouseId: third.warehouseId, channelId: third.id }
  rule.warehouseAction = { ...rule.warehouseAction!, priceRoutes: [...rule.warehouseAction!.priceRoutes!, thirdRoute],
    priceComparison: 'priceAge', priceDifference: '10', priceDifferenceCurrency: 'USD', agePreference: 'all', ageDifferenceDays: '15' }
  quotes.push({ ...quotes[0]!, ...thirdRoute, quoteId: 'DEMO-Q-THIRD' })
  quotes.forEach((项, index) => { 项.totalAmount = prices[index] })
  const source: 候选库龄资料[] = rule.warehouseAction.priceRoutes!.map((scope, index) => ({
    scope, organization: '演示组织甲', sourceCustomer: 'DEMO-CUSTOMER-A', snapshotDate: '2026-09-23',
    records: [{ ...agingRecords[0]!, id: `DEMO-COMPOSITE-${index}`, provider: channels.find(项 => 项.id === scope.channelId)!.provider,
      accountId: scope.accountId, warehouseId: scope.warehouseId, systemSku: 'DEMO-SKU', warehouseSku: 'WH-DEMO-SKU', agingDays: ages[index]!, issues: [] }],
  }))
  return { ...fixture, source }
}

describe('价格与库龄综合两条逻辑互斥，各自使用全局锚点', () => {
  it('三候选可能形成两两循环时仍确定选择，候选顺序变化不改变非同分结果', () => {
    // 两两阈值比较会有 B胜A、C胜B、A胜C；全局最低价锚点先排除C。
    for (const orderIndex of [[0, 1, 2], [2, 1, 0], [1, 2, 0], [1, 0, 2], [2, 0, 1], [0, 2, 1]]) {
      const { rule, channels, order, quotes, source } = 综合准备()
      const routes = rule.warehouseAction!.priceRoutes!
      rule.warehouseAction!.priceRoutes = orderIndex.map(index => routes[index]!)
      const result = 计算比价分仓(rule, order, channels, quotes, source)
      expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
      expect(result.comparisonMode).toBe('priceAge')
      expect(result.comparisonLogic).toBe('priceGap')
      expect(result.ranked.find(项 => 项.route.id === 'DEMO-THIRD-CHANNEL')!.ageDays).toBeUndefined()
      expect(result.selectionReason).toContain('严格小于')
    }
  })
  it('价格差严格小于阈值；精确等于阈值的高龄仓不能进入库龄池', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '110', '109.999999'], [1, 10000, 20])
    const result = 计算比价分仓(rule, order, channels, quotes, source)
    expect(result.route?.id).toBe('DEMO-THIRD-CHANNEL')
    expect(result.ranked.find(项 => 项.route.id === 'DEMO-CF-CHANNEL-GC')!.ageDays).toBeUndefined()
  })
  it('龄差分支严格小于阈值才价格优先，等于阈值优先高龄；24位天数不经浮点', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '200'], [10, 25, 0])
    rule.warehouseAction!.priceAgeLogic = 'ageGap'
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
    rule.warehouseAction!.ageDifferenceDays = '16'
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    rule.warehouseAction!.ageDifferenceDays = '999999999999999999999999'
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-WYT')
  })
  it('价差阈值为0不触发库龄优先，同最低价按配置顺序且不要求库龄', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '100', '200'], [10, 30, 999])
    rule.warehouseAction!.priceDifference = '0'; rule.warehouseAction!.ageDifferenceDays = '100'
    const result = 计算比价分仓(rule, order, channels, quotes)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result.ranked.every(项 => 项.ageDays === undefined)).toBe(true)
    expect(result.selectionReason).toContain('不触发库龄优先')
    rule.warehouseAction!.priceRoutes!.reverse()
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it.each([undefined, '', '-1', 'INVALID', '15', '9999999999999999999999999'])('价差分支完全忽略龄差草稿%s，池内高龄优先不串联天数阈值', ageDifferenceDays => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '112'], [10, 11, 999])
    rule.warehouseAction!.ageDifferenceDays = ageDifferenceDays
    const result = 计算比价分仓(rule, order, channels, quotes, source.slice(0, 2))
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
    expect(result.gates).toEqual([])
    expect(result.selectionReason).not.toContain('天时优先价格')
  })
  it.each([undefined, '', '-1', 'INVALID', '0', '1.1234567'])('龄差分支完全忽略价差草稿%s，所有有效候选先比较库龄', priceDifference => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '1000'], [10, 11, 100])
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.priceDifference = priceDifference
    const result = 计算比价分仓(rule, order, channels, quotes, source)
    expect(result.route?.id).toBe('DEMO-THIRD-CHANNEL')
    expect(result.comparisonLogic).toBe('ageGap')
    expect(result.gates).toEqual([])
    expect(result.ranked.every(项 => 项.ageDays !== undefined)).toBe(true)
  })
  it('龄差分支所有候选都需要库龄，不能用价差排除远价候选的缺失资料', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '1000'])
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.priceDifference = '0'
    const result = 计算比价分仓(rule, order, channels, quotes, source.slice(0, 2))
    expect(result.route).toBeUndefined()
    expect(result.gates.join()).toContain('综合库龄来源资料')
  })
  it('龄差阈值0优先最高龄，同龄优先低价再配置顺序', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '1000'], [10, 30, 30])
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.ageDifferenceDays = '0'
    const result = 计算比价分仓(rule, order, channels, quotes, source)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
    expect(result.selectionReason).toContain('不触发价格优先')
    quotes[2]!.totalAmount = '106'
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
    rule.warehouseAction!.priceRoutes!.reverse()
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-THIRD-CHANNEL')
  })
  it('价差池同龄优先低价；龄差池同价优先高龄，仍同分才按配置顺序', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '112'], [30, 30, 99])
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.ageDifferenceDays = '100'
    quotes[1]!.totalAmount = '100'; source[1]!.records = source[1]!.records.map(项 => ({ ...项, agingDays: 40 }))
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('龄差分支唯一有效候选无需库龄，不支持与库存排除仍有效', () => {
    const { rule, channels, order, quotes } = 综合准备()
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.priceDifference = 'INVALID'
    quotes[1]!.status = '不支持'; quotes[2]!.status = '不支持'
    const result = 计算比价分仓(rule, order, channels, quotes)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result.selectionReason).toContain('只有一个有效候选')
    expect(result.gates).toEqual([])
  })
  it('龄差分支三候选锚点不依赖配置排列，选择后也不反过来触发价差逻辑', () => {
    for (const orderIndex of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
      const { rule, channels, order, quotes, source } = 综合准备(['100', '106', '112'], [10, 30, 50])
      rule.warehouseAction!.priceAgeLogic = 'ageGap'
      const routes = rule.warehouseAction!.priceRoutes!; rule.warehouseAction!.priceRoutes = orderIndex.map(index => routes[index]!)
      expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-THIRD-CHANNEL')
    }
  })
  it('价差池只有一个候选时不要求无关库龄；最低价模式完全不消费库龄', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['100', '110', '112'])
    const single = 计算比价分仓(rule, order, channels, quotes)
    expect(single.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(single.gates).toEqual([])
    expect(single.selectionReason).toContain('无需额外比较库龄')
    rule.warehouseAction!.priceComparison = 'lowest'; quotes[1]!.totalAmount = '99'
    source[0]!.snapshotDate = 'INVALID'
    expect(计算比价分仓(rule, order, channels, quotes, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('两个以上价差候选缺龄时无推荐、不降级；价差池外缺龄不阻断', () => {
    const { rule, channels, order, quotes, source } = 综合准备()
    expect(计算比价分仓(rule, order, channels, quotes, source.slice(0, 2)).route?.id).toBe('DEMO-CF-CHANNEL-GC')
    const missing = 计算比价分仓(rule, order, channels, quotes, source.slice(0, 1))
    expect(missing.route).toBeUndefined()
    expect(missing.gates.join()).toContain('综合库龄来源资料')
  })
  it('同仓不同渠道共享库龄，按实际渠道总费选择；不把仓库误判为重复来源', () => {
    const { rule, channels, order, quotes, source } = 综合准备()
    const first = channels.find(项 => 项.id === quotes[0]!.channelId)!, third = channels.find(项 => 项.id === quotes[2]!.channelId)!
    third.warehouseId = first.warehouseId; third.providerId = first.providerId; third.accountId = first.accountId; third.provider = first.provider
    Object.assign(rule.warehouseAction!.priceRoutes![2]!, { warehouseId: first.warehouseId, providerId: first.providerId, accountId: first.accountId })
    Object.assign(quotes[2]!, rule.warehouseAction!.priceRoutes![2]!, { totalAmount: '99' })
    source.splice(2, 1)
    const result = 计算比价分仓(rule, order, channels, quotes, source)
    expect(result.gates).toEqual([])
    expect(result.ranked.find(项 => 项.route.id === third.id)!.ageDays).toBe('10')
  })
  it('库存不足先排除，剩余价差池唯一时不因被排除仓缺龄而失败', () => {
    const { rule, channels, order, quotes } = 综合准备()
    rule.warehouseAction!.checkRemainingStock = true; rule.warehouseAction!.minimumRemainingStock = '5'
    quotes.forEach(项 => { 项.remainingStock = [{ systemSku: 'DEMO-SKU', quantity: '5' }] })
    quotes[1]!.remainingStock = [{ systemSku: 'DEMO-SKU', quantity: '4' }]
    const result = 计算比价分仓(rule, order, channels, quotes)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result.skipped.map(项 => 项.route.id)).toEqual(['DEMO-CF-CHANNEL-GC'])
  })
  it('保留失败、缺汇率跨币种、混轮、跨日和未知库存门禁，不借最高龄兜底', () => {
    const scenarios = [
      (q: 运费试算报价[], _: 候选库龄资料[]) => { q[1]!.status = '失败' },
      (q: 运费试算报价[], _: 候选库龄资料[]) => { q[1]!.currencyCode = 'CNY' },
      (q: 运费试算报价[], _: 候选库龄资料[]) => { q[1]!.batchId = 'OTHER' },
      (_: 运费试算报价[], s: 候选库龄资料[]) => { s[1]!.snapshotDate = '2026-09-22' },
    ]
    for (const change of scenarios) {
      const { rule, channels, order, quotes, source } = 综合准备(); change(quotes, source)
      expect(计算比价分仓(rule, order, channels, quotes, source).route).toBeUndefined()
    }
    const { rule, channels, order, quotes, source } = 综合准备(); rule.warehouseAction!.checkRemainingStock = true; rule.warehouseAction!.minimumRemainingStock = '0'
    expect(计算比价分仓(rule, order, channels, quotes, source).route).toBeUndefined()
  })
  it('两分支规则试算都透传已有库龄资料，输出逐SKU追溯且不改输入', () => {
    for (const priceAgeLogic of ['priceGap', 'ageGap'] as const) {
      const { rule, channels, order, quotes, source } = 综合准备()
      rule.warehouseAction!.priceAgeLogic = priceAgeLogic
      const before = JSON.stringify({ rule, channels, order, quotes, source })
      const result = 试算规则([rule], order, '分仓规则', channels, source, quotes)
      expect(result.route?.id).toBe(priceAgeLogic === 'priceGap' ? 'DEMO-CF-CHANNEL-GC' : 'DEMO-THIRD-CHANNEL')
      expect(result.pricing?.ranked.find(项 => 项.route.id === 'DEMO-CF-CHANNEL-GC')!.ageDetails![0]!.selectedRecordIds).toEqual(['DEMO-COMPOSITE-1'])
      expect(JSON.stringify({ rule, channels, order, quotes, source })).toBe(before)
    }
  })
})

describe('复用一轮中台货币汇率精确比较', () => {
  it('混币报价统一人民币后选择，保留原金额与币种及同一快照来源，输入只读', () => {
    const { rule, channels, order, quotes } = 准备(), fx = 汇率准备()
    quotes[0]!.totalAmount = '2'; quotes[1]!.totalAmount = '13.5'; quotes[1]!.currencyCode = 'CNY'
    const before = JSON.stringify({ rule, channels, order, quotes, fx })
    const result = 计算比价分仓(rule, order, channels, quotes, [], fx)
    expect(result.route?.id).toBe(quotes[1]!.channelId)
    expect(result.comparisonCurrency).toBe('CNY')
    expect(result.exchangeRateSnapshot).toEqual({ snapshotId: fx.snapshotId, effectiveAt: fx.effectiveAt, source: fx.source })
    expect(result.ranked.map(row => [row.quote.totalAmount, row.quote.currencyCode, row.comparisonAmount, row.comparisonCurrency, row.exchangeRate])).toEqual([
      ['13.5', 'CNY', '13.5', 'CNY', '1'], ['2', 'USD', '14.4', 'CNY', '7.2'],
    ])
    expect(JSON.stringify({ rule, channels, order, quotes, fx })).toBe(before)
  })
  it('同币且不跨阈值时不需要汇率，也不消费无效快照，提供同币精确展示金额', () => {
    const { rule, channels, order, quotes } = 准备()
    const result = 计算比价分仓(rule, order, channels, quotes, [], { ...汇率准备(), effectiveAt: 'INVALID' })
    expect(result.route?.id).toBe(quotes[1]!.channelId)
    expect(result.comparisonCurrency).toBe('USD'); expect(result.exchangeRateSnapshot).toBeUndefined()
    expect(result.ranked[0]).toMatchObject({ comparisonAmount: '12.6', comparisonCurrency: 'USD' })
    expect(result.ranked.every(row => row.exchangeRate === undefined)).toBe(true)
    const composite = 综合准备()
    expect(计算比价分仓(composite.rule, composite.order, composite.channels, composite.quotes, composite.source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('小于展示精度的换算差额仍决定排序，大金额乘高精度汇率不丢位', () => {
    const { rule, channels, order, quotes } = 准备()
    quotes[0]!.totalAmount = '1'; quotes[0]!.currencyCode = 'USD'
    quotes[1]!.totalAmount = '1'; quotes[1]!.currencyCode = 'EUR'
    const fx = 汇率准备([{ currencyCode: 'USD', cnyRate: '1.000000000000000002' }, { currencyCode: 'EUR', cnyRate: '1.000000000000000001' }])
    const result = 计算比价分仓(rule, order, channels, quotes, [], fx)
    expect(result.route?.id).toBe(quotes[1]!.channelId)
    expect(result.ranked[0]!.comparisonAmount).toBe('1.000000000000000001')
    quotes[0]!.totalAmount = '9007199254740993.000001'; quotes[1]!.totalAmount = '9007199254740993.000002'
    const large = 计算比价分仓(rule, order, channels, quotes, [], fx)
    expect(large.route?.id).toBe(quotes[1]!.channelId)
    expect(large.ranked[0]!.comparisonAmount).toBe('9007199254740993.009009199254740993000002')
    expect(large.ranked[1]!.comparisonAmount).toBe('9007199254740993.018015398509481986000002')
  })
  it('人民币换算完全同价保持配置顺序，不取原币数字更小者', () => {
    const { rule, channels, order, quotes } = 准备()
    quotes[0]!.totalAmount = '1'; quotes[1]!.totalAmount = '7.2'; quotes[1]!.currencyCode = 'CNY'
    expect(计算比价分仓(rule, order, channels, quotes, [], 汇率准备()).route?.id).toBe(quotes[0]!.channelId)
    rule.warehouseAction!.priceRoutes!.reverse()
    expect(计算比价分仓(rule, order, channels, quotes, [], 汇率准备()).route?.id).toBe(quotes[1]!.channelId)
  })
  it('单一报价币与正阈值币不同也换算人民币，严格边界在换算后判断', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['10', '11', '12'], [1, 30, 50])
    rule.warehouseAction!.priceDifference = '7.2'; rule.warehouseAction!.priceDifferenceCurrency = 'CNY'
    const fx = 汇率准备()
    const boundary = 计算比价分仓(rule, order, channels, quotes, source, fx)
    expect(boundary.route?.id).toBe(quotes[0]!.channelId)
    expect(boundary.comparisonCurrency).toBe('CNY')
    expect(boundary.ranked[1]!.ageDays).toBeUndefined()
    rule.warehouseAction!.priceDifference = '7.200001'
    expect(计算比价分仓(rule, order, channels, quotes, source, fx).route?.id).toBe(quotes[1]!.channelId)
    expect(计算比价分仓(rule, order, channels, quotes, source).gates.join()).toContain('汇率快照')
  })
  it('价差阈值外币也使用同一快照，换算不足一微元的严格边界不四舍五入', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['1', '1.000001', '100'], [1, 20, 30])
    quotes.forEach(q => { q.currencyCode = 'CNY' })
    rule.warehouseAction!.priceDifference = '0.000001'; rule.warehouseAction!.priceDifferenceCurrency = 'USD'
    const exact = 汇率准备([{ currencyCode: 'USD', cnyRate: '1' }])
    expect(计算比价分仓(rule, order, channels, quotes, source, exact).route?.id).toBe(quotes[0]!.channelId)
    const slightlyMore = 汇率准备([{ currencyCode: 'USD', cnyRate: '1.000000000000000001' }])
    const result = 计算比价分仓(rule, order, channels, quotes, source, slightlyMore)
    expect(result.route?.id).toBe(quotes[1]!.channelId)
    expect(result.selectionReason).toContain('USD（按同一汇率快照换算人民币）')
    const missing = 计算比价分仓(rule, order, channels, quotes, source, 汇率准备([]))
    expect(missing.route).toBeUndefined(); expect(missing.gates.join()).toContain('缺少 USD')
  })
  it('混币三候选价差池及同龄低价都按换算金额，候选排列不改变结果', () => {
    for (const permutation of [[0, 1, 2], [2, 1, 0], [1, 0, 2]]) {
      const { rule, channels, order, quotes, source } = 综合准备(['10', '75', '11'], [10, 30, 999])
      quotes[1]!.currencyCode = 'CNY'
      rule.warehouseAction!.priceDifference = '5'; rule.warehouseAction!.priceDifferenceCurrency = 'CNY'
      const routes = rule.warehouseAction!.priceRoutes!; rule.warehouseAction!.priceRoutes = permutation.map(index => routes[index]!)
      const result = 计算比价分仓(rule, order, channels, quotes, source, 汇率准备())
      expect(result.route?.id).toBe(quotes[1]!.channelId)
      expect(result.ranked.find(row => row.route.id === quotes[2]!.channelId)!.ageDays).toBeUndefined()
      source[0]!.records = source[0]!.records.map(row => ({ ...row, agingDays: 30 }))
      expect(计算比价分仓(rule, order, channels, quotes, source, 汇率准备()).route?.id).toBe(quotes[0]!.channelId)
    }
  })
  it('零价差阈值跨币恒0无需阈值汇率，但混合报价仍必须取得全部报价币汇率', () => {
    const { rule, channels, order, quotes } = 综合准备(['10', '11', '12'])
    rule.warehouseAction!.priceDifference = '0'; rule.warehouseAction!.priceDifferenceCurrency = 'EUR'
    const same = 计算比价分仓(rule, order, channels, quotes)
    expect(same.route?.id).toBe(quotes[0]!.channelId); expect(same.comparisonCurrency).toBe('USD')
    quotes[1]!.currencyCode = 'CNY'; quotes[1]!.totalAmount = '11'
    expect(计算比价分仓(rule, order, channels, quotes).route).toBeUndefined()
    const mixed = 计算比价分仓(rule, order, channels, quotes, [], 汇率准备([{ currencyCode: 'USD', cnyRate: '7.2' }]))
    expect(mixed.route?.id).toBe(quotes[1]!.channelId); expect(mixed.gates).toEqual([])
  })
  it('龄差逻辑所有价格比较共用人民币金额，并忽略未选价差币种及阈值', () => {
    const { rule, channels, order, quotes, source } = 综合准备(['10', '50', '100'], [10, 20, 30])
    rule.warehouseAction!.priceAgeLogic = 'ageGap'; rule.warehouseAction!.ageDifferenceDays = '100'
    rule.warehouseAction!.priceDifference = 'INVALID'; rule.warehouseAction!.priceDifferenceCurrency = 'ZZZ'
    quotes[1]!.currencyCode = 'CNY'; quotes[2]!.currencyCode = 'CNY'
    const result = 计算比价分仓(rule, order, channels, quotes, source, 汇率准备())
    expect(result.gates).toEqual([]); expect(result.route?.id).toBe(quotes[1]!.channelId)
    // 零龄差最高龄相同时也按换算金额低者选择。
    rule.warehouseAction!.ageDifferenceDays = '0'
    source[0]!.records = source[0]!.records.map(row => ({ ...row, agingDays: 30 }))
    source[1]!.records = source[1]!.records.map(row => ({ ...row, agingDays: 30 }))
    expect(计算比价分仓(rule, order, channels, quotes, source, 汇率准备()).route?.id).toBe(quotes[1]!.channelId)
  })
  it.each([undefined, '', 'ZZZ'])('旧选中价差配置缺失或无效币种%s不补默认，不推荐且失败结果shape完整', currency => {
    const { rule, channels, order, quotes, source } = 综合准备()
    rule.warehouseAction!.priceDifferenceCurrency = currency
    const result = 计算比价分仓(rule, order, channels, quotes, source, 汇率准备())
    expect(result.route).toBeUndefined(); expect(result.gates.join()).toContain('价格差额币种')
    expect(result).toHaveProperty('comparisonCurrency', undefined)
    expect(result).toHaveProperty('exchangeRateSnapshot', undefined)
    expect(rule.warehouseAction!.priceDifferenceCurrency).toBe(currency)
  })
  it('换算不能绕过报价失败、混轮、输入变化及库存未知门禁', () => {
    const scenarios = [
      (q: 运费试算报价[]) => { q[0]!.status = '失败' },
      (q: 运费试算报价[]) => { q[0]!.batchId = 'OTHER' },
      (q: 运费试算报价[]) => { q[0]!.inputSnapshot = 'OLD' },
    ]
    for (const mutate of scenarios) {
      const { rule, channels, order, quotes } = 准备(); quotes[1]!.currencyCode = 'CNY'; mutate(quotes)
      expect(计算比价分仓(rule, order, channels, quotes, [], 汇率准备()).route).toBeUndefined()
    }
    const { rule, channels, order, quotes } = 准备()
    rule.warehouseAction!.checkRemainingStock = true; rule.warehouseAction!.minimumRemainingStock = '0'; quotes[1]!.currencyCode = 'CNY'
    expect(计算比价分仓(rule, order, channels, quotes, [], 汇率准备()).route).toBeUndefined()
  })
  it('混币缺失或非法汇率快照不排序推荐，也不按外币原数字或默认1兜底', () => {
    const { rule, channels, order, quotes } = 准备(); quotes[1]!.currencyCode = 'CNY'
    const snapshots = [undefined, 汇率准备([]), { ...汇率准备(), source: '' }, { ...汇率准备(), effectiveAt: '2026-02-30T00:00:00Z' },
      汇率准备([{ currencyCode: 'USD', cnyRate: '0' }]), 汇率准备([{ currencyCode: 'USD', cnyRate: '7' }, { currencyCode: 'USD', cnyRate: '7' }]),
      汇率准备([{ currencyCode: 'USD', cnyRate: '7' }, { currencyCode: 'CNY', cnyRate: '2' }])]
    for (const snapshot of snapshots) {
      const result = 计算比价分仓(rule, order, channels, quotes, [], snapshot)
      expect(result.route).toBeUndefined(); expect(result.gates.join()).toContain('汇率')
      expect(result.ranked.map(row => row.route.id)).toEqual(quotes.map(q => q.channelId))
      expect(result.ranked.every(row => row.comparisonAmount === undefined)).toBe(true)
      expect(result.exchangeRateSnapshot).toBeUndefined()
    }
  })
})
