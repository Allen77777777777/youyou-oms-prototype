import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 订单规则 } from './规则逻辑'
import { 分仓仓库键, 读取分仓候选, 校验分仓路由, 读取分仓策略, 检查分仓剩余库存, type 分仓路由动作 } from './规则路由'
import { 解析条件定点值 } from './规则条件定义'
import type { 候选库龄资料 } from './库龄分仓'
import { 计算综合库龄, type 综合库龄明细 } from './综合库龄比较'
import { 比价币种代码 } from './比价币种'
import { 解析精确十进制, 精确金额相乘, 比较精确金额, 精确价差小于, 格式化精确金额, 校验比价汇率快照, type 比价汇率快照, type 比价汇率来源, type 精确十进制 } from './比价汇率'

export const 比价费用说明 = '按海外仓提供的试算总费用进行比价，出库操作费等费用的包含范围以各仓收费规则为准；实际费用以最终结算为准。'

/** 适配层候选契约；本地原型只消费虚构响应，不建立账单、库存账或发货任务。 */
export interface 运费试算报价 extends 分仓路由动作 {
  orderNo: string
  inputSnapshot: string
  batchId: string
  status: '成功' | '失败' | '不支持'
  totalAmount?: string
  currencyCode?: string
  quotedAt: string
  quoteId: string
  reason?: string
  remainingStock?: readonly { systemSku: string; quantity: string }[]
}
export interface 运费比较项 {
  route: 渠道配置
  quote: 运费试算报价
  comparisonAmount?: string
  comparisonCurrency?: string
  exchangeRate?: string
  ageDays?: string
  ageDetails?: 综合库龄明细[]
}
export interface 比价排除项 { route: 渠道配置; reason: string }
interface 综合比较配置 {
  priceComparison?: 'lowest' | 'priceAge'
  priceAgeLogic?: 'priceGap' | 'ageGap'
  priceDifference?: string
  priceDifferenceCurrency?: string
  agePreference?: 'recent' | 'all'
  ageDifferenceDays?: string
}
export function 运费试算输入快照(订单: 全渠道订单): string { return JSON.stringify(订单) }
// 沿用原型金额范围的币种集合；正式执行改用中台已核验字典，不接受任意三字母代码。
const 已识别币种 = new Set<string>(比价币种代码)

export function 计算比价分仓(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[], 报价: readonly 运费试算报价[] = [], 库龄资料: readonly 候选库龄资料[] = [], 汇率快照?: 比价汇率快照) {
  const gates: string[] = [], ranked: 运费比较项[] = [], skipped: 比价排除项[] = []
  let comparisonCurrency: string | undefined, exchangeRateSnapshot: 比价汇率来源 | undefined
  const 综合配置 = 读取分仓策略(规则) as 综合比较配置
  const comparisonMode = 综合配置.priceComparison ?? 'lowest'
  const comparisonLogic = comparisonMode === 'priceAge' ? 综合配置.priceAgeLogic ?? 'priceGap' : undefined
  const fail = (reason: string) => ({ ranked, skipped, gates: [reason], route: undefined as 渠道配置 | undefined, comparisonMode, comparisonLogic, comparisonCurrency, exchangeRateSnapshot, selectionReason: '' })
  const 配置错误 = 校验分仓路由(规则, 渠道)
  if (配置错误) return fail(配置错误)
  if (读取分仓策略(规则).mode !== 'price') return fail('当前规则不是比价分仓')
  if (comparisonMode !== 'lowest' && comparisonMode !== 'priceAge') return fail('请选择有效的比价比较方式')
  if (comparisonMode === 'priceAge' && (!['priceGap', 'ageGap'].includes(comparisonLogic || '') || !['recent', 'all'].includes(综合配置.agePreference || ''))) return fail('请选择有效的价格与库龄综合逻辑及库龄取法')
  // 两条逻辑互斥：只校验、读取当前分支的阈值，另一条草稿值不参与执行。
  const 使用价差 = comparisonMode === 'priceAge' && comparisonLogic === 'priceGap'
  const 价格阈值 = 使用价差 ? 解析条件定点值(综合配置.priceDifference) : undefined
  const 天数阈值 = comparisonMode === 'priceAge' && comparisonLogic === 'ageGap' && typeof 综合配置.ageDifferenceDays === 'string' && /^\d{1,24}$/.test(综合配置.ageDifferenceDays) ? BigInt(综合配置.ageDifferenceDays) : undefined
  if (使用价差 && 价格阈值 === undefined) return fail('价差逻辑的价格阈值配置不完整')
  if (使用价差 && !已识别币种.has(综合配置.priceDifferenceCurrency || '')) return fail('请选择有效的价格差额币种')
  if (comparisonMode === 'priceAge' && comparisonLogic === 'ageGap' && 天数阈值 === undefined) return fail('龄差逻辑的天数阈值配置不完整')
  if (!订单.address?.countryCode || !订单.address.postalCode?.trim()) return fail('未取得收货国家及真实邮编，无法进行运费比价')
  if (!订单.items.length || 订单.items.some(项 => 项.skuResolutionStatus !== '成功' || !项.systemSku?.trim())) return fail('订单SKU映射未完整识别，无法进行整单运费比价')
  const 订单SKU = [...new Set(订单.items.map(项 => 项.systemSku!))]
  const 输入快照 = 运费试算输入快照(订单), 批次 = new Set<string>(), 币种 = new Set<string>()
  for (const route of 读取分仓候选(规则, 渠道)) {
    const 来源 = 报价.filter(项 => 项.providerId === route.providerId && 项.accountId === route.accountId && 项.warehouseId === route.warehouseId && 项.channelId === route.id && 项.orderNo === 订单.systemOrderNo)
    if (来源.length !== 1) { gates.push(`${route.warehouse} · ${route.name}：未取得唯一的接口试算结果`); continue }
    const quote = 来源[0]!
    if (quote.inputSnapshot !== 输入快照 || !quote.batchId || !quote.quoteId || !Number.isFinite(Date.parse(quote.quotedAt))) { gates.push(`${route.warehouse} · ${route.name}：报价输入已变化或来源未核实，请重新试算`); continue }
    批次.add(quote.batchId)
    if (quote.status === '不支持') { skipped.push({ route, reason: quote.reason || '接口明确不支持当前发货条件' }); continue }
    if (quote.status !== '成功') { gates.push(`${route.warehouse} · ${route.name}：${quote.reason || '接口试算失败，待核查'}`); continue }
    if (读取分仓策略(规则).checkRemainingStock) {
      const 库存项 = 订单SKU.map(sku => quote.remainingStock?.filter(项 => 项.systemSku === sku) ?? [])
      const 检测 = 检查分仓剩余库存(规则, 库存项.every(项 => 项.length === 1) ? 库存项.map(项 => 项[0]!.quantity) : undefined)
      if (检测 === 'unknown') { gates.push(`${route.warehouse}：未取得完整的分仓后剩余可用库存，无法判断是否跳过该仓库`); continue }
      if (检测 === 'skip') { skipped.push({ route, reason: '分仓后剩余库存不满足要求' }); continue }
    }
    if (解析条件定点值(quote.totalAmount) === undefined || !已识别币种.has(quote.currencyCode || '')) { gates.push(`${route.warehouse} · ${route.name}：接口总费用或币种无效，不按0元处理`); continue }
    币种.add(quote.currencyCode!)
    ranked.push({ route, quote: JSON.parse(JSON.stringify(quote)) as 运费试算报价 })
  }
  if (批次.size > 1) gates.push('候选报价不属于同一轮试算，请重新查询')
  if (!ranked.length && !gates.length) gates.push('所有候选组合均已排除，未分配仓库及渠道')
  // 直接比较接口原始总费用；不得从明细重算或加减操作费、仓租等项目。
  // 混币种或正价差阈值跨币时统一CNY；同币比较和零阈值不凭空要求无关汇率。
  const 需要换算 = 币种.size > 1 || (使用价差 && 价格阈值! > 0n && ranked.length > 0 && !币种.has(综合配置.priceDifferenceCurrency!))
  const 统一金额 = new Map<运费比较项, 精确十进制>()
  let 统一价格阈值 = 使用价差 ? 解析精确十进制(综合配置.priceDifference)! : undefined
  if (ranked.length) {
    comparisonCurrency = 需要换算 ? 'CNY' : ranked[0]!.quote.currencyCode
    const 汇率 = 需要换算 ? 校验比价汇率快照(汇率快照, [...币种, ...(使用价差 && 价格阈值! > 0n ? [综合配置.priceDifferenceCurrency!] : [])]) : undefined
    if (汇率?.reason) gates.push(汇率.reason)
    else {
      exchangeRateSnapshot = 汇率?.snapshot
      for (const 项 of ranked) {
        const 原金额 = 解析精确十进制(项.quote.totalAmount)!
        const rate = 汇率?.rates.get(项.quote.currencyCode!)
        const amount = rate === undefined ? 原金额 : 精确金额相乘(原金额, 解析精确十进制(rate)!)
        统一金额.set(项, amount)
        项.comparisonAmount = 格式化精确金额(amount)
        项.comparisonCurrency = comparisonCurrency
        if (rate !== undefined) 项.exchangeRate = rate
      }
      if (汇率 && 使用价差 && 价格阈值! > 0n) 统一价格阈值 = 精确金额相乘(统一价格阈值!, 解析精确十进制(汇率.rates.get(综合配置.priceDifferenceCurrency!)!)!)
      // 同价保持候选配置顺序，所有价格比较都使用同一未舍入金额。
      ranked.sort((a, b) => 比较精确金额(统一金额.get(a)!, 统一金额.get(b)!))
    }
  }
  const 结果 = { ranked, skipped, gates, route: gates.length ? undefined : ranked[0]?.route, comparisonMode, comparisonLogic, comparisonCurrency, exchangeRateSnapshot, selectionReason: '' }
  if (comparisonMode === 'lowest') {
    if (结果.route) 结果.selectionReason = 需要换算 ? '按接口原始总费用使用同一中台汇率快照换算人民币后最低选择；同价按候选配置顺序。' : '按接口原始总费用最低选择；总费用相同时按候选配置顺序。'
    return 结果
  }
  // 已有报价失败、币种、库存及输入范围保护优先；不能借已知库龄绕过未知报价。
  if (gates.length || !ranked.length) return 结果
  const 最低金额 = 统一金额.get(ranked[0]!)!
  if (comparisonLogic === 'priceGap' && 价格阈值 === 0n) {
    结果.selectionReason = '价差阈值为0，不触发库龄优先；按接口最低总费用选择，同费用按候选配置顺序。'
    return 结果
  }
  // 本轮多候选实现方案：所选逻辑分别使用最低价或最高龄作为全局锚点。
  // 不串联两个阈值，也不使用可能形成非传递关系的两两比较器。
  const 库龄候选 = comparisonLogic === 'priceGap' ? ranked.filter(项 => 精确价差小于(统一金额.get(项)!, 最低金额, 统一价格阈值!)) : ranked
  if (库龄候选.length === 1) {
    结果.route = 库龄候选[0]!.route
    结果.selectionReason = comparisonLogic === 'priceGap' ? '最低总费用价差范围内仅有一个候选，无需额外比较库龄。' : '只有一个有效候选，无需额外比较库龄。'
    return 结果
  }
  const 库龄结果 = 计算综合库龄(订单, 库龄候选.map(项 => 项.route), 库龄资料, 综合配置.agePreference!)
  const 按仓库 = new Map(库龄结果.summaries.map(项 => [项.warehouseKey, 项]))
  for (const 项 of 库龄候选) {
    const 汇总 = 按仓库.get(分仓仓库键(项.route))
    if (汇总) { 项.ageDays = 汇总.ageDays; 项.ageDetails = 汇总.ageDetails }
  }
  gates.push(...库龄结果.gates)
  if (gates.length || 库龄候选.some(项 => 项.ageDays === undefined)) {
    if (!gates.length) gates.push('综合库龄候选资料不完整，不能退回仅按价格推荐')
    结果.route = undefined
    return 结果
  }
  const 最高库龄 = 库龄候选.reduce((max, 项) => BigInt(项.ageDays!) > max ? BigInt(项.ageDays!) : max, 0n)
  if (comparisonLogic === 'priceGap') {
    // 价差池内只按最高库龄优先；不再读取或应用龄差阈值。
    const 选中 = 库龄候选.reduce((best, 项) => {
      const age = BigInt(项.ageDays!), bestAge = BigInt(best.ageDays!)
      return age > bestAge || (age === bestAge && 比较精确金额(统一金额.get(项)!, 统一金额.get(best)!) < 0) ? 项 : best
    })
    结果.route = 选中.route
    结果.selectionReason = `以最低总费用为基准，在价差严格小于 ${综合配置.priceDifference} ${综合配置.priceDifferenceCurrency}${需要换算 ? '（按同一汇率快照换算人民币）' : ''} 的候选中优先综合库龄最高者；同龄优先低价，再按配置顺序。`
    return 结果
  }
  const 严格龄差池 = 库龄候选.filter(项 => 最高库龄 - BigInt(项.ageDays!) < 天数阈值!)
  // 非负龄差不可能小于0；零阈值回到最高龄优先，同龄时仍优先低价。
  const 价格优先池 = 严格龄差池.length ? 严格龄差池 : 库龄候选.filter(项 => BigInt(项.ageDays!) === 最高库龄)
  // ranked 已按价格及配置顺序稳定排列；同价格时再取综合库龄最高，仍同龄保留配置顺序。
  const 选中 = 价格优先池.reduce((best, 项) => {
    const priceOrder = 比较精确金额(统一金额.get(项)!, 统一金额.get(best)!)
    return priceOrder < 0 || (priceOrder === 0 && BigInt(项.ageDays!) > BigInt(best.ageDays!)) ? 项 : best
  })
  结果.route = 选中.route
  结果.selectionReason = 天数阈值 === 0n ? '龄差阈值为0，不触发价格优先；按最高综合库龄选择，同龄优先低价，再按配置顺序。' : `以最高综合库龄 ${最高库龄} 天为基准，在龄差严格小于 ${综合配置.ageDifferenceDays} 天的候选中优先最低总费用；同价优先高龄，再按配置顺序。`
  return 结果
}

/** 固定虚构报文，只演示总费用排序；不根据尺寸、件数或费用明细拼出价格。 */
export function 创建模拟运费报价(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[]): 运费试算报价[] {
  if (读取分仓策略(规则).mode !== 'price') return []
  const batchId = `DEMO-QUOTE-${Date.now()}`, quotedAt = new Date().toISOString()
  const 固定总费 = ['12.80', '10.60', '15.30', '11.90', '13.40', '10.60']
  return 读取分仓候选(规则, 渠道).map(route => {
    const index = [...route.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 固定总费.length
    const 支持 = 订单.address?.countryCode === 'US' && (!route.countries.length || route.countries.includes('US'))
    return { providerId: route.providerId, accountId: route.accountId, warehouseId: route.warehouseId, channelId: route.id,
      orderNo: 订单.systemOrderNo, inputSnapshot: 运费试算输入快照(订单), batchId, quoteId: `${batchId}-${route.id}`, quotedAt,
      status: 支持 ? '成功' : '不支持', totalAmount: 支持 ? 固定总费[index] : undefined, currencyCode: 支持 ? 'USD' : undefined,
      reason: 支持 ? undefined : '当前模拟报文仅覆盖美国目的地的适用渠道' }
  })
}
