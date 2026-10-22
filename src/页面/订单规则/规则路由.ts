import { 创建渠道配置样例, 创建标发联动渠道样例, type 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 订单规则 } from './规则逻辑'
import { 解析条件定点值 } from './规则条件定义'
import { 是否支持比价币种 } from './比价币种'

export interface 分仓路由动作 {
  providerId: string
  accountId: string
  warehouseId: string
  channelId: string
}

export interface 分仓策略配置 {
  mode: 'basic' | 'price' | 'age'
  checkRemainingStock: boolean
  minimumRemainingStock?: string
  ageRoutes?: 分仓路由动作[]
  ageBatchPreference?: 'recent' | 'all'
  priceRoutes?: 分仓路由动作[]
  priceComparison?: 'lowest' | 'priceAge'
  priceAgeLogic?: 'priceGap' | 'ageGap'
  priceDifference?: string
  priceDifferenceCurrency?: string
  agePreference?: 'recent' | 'all'
  ageDifferenceDays?: string
}
type 分仓策略规则 = Pick<订单规则, 'type' | 'warehouseAction'>
const 非负整数 = /^\d{1,24}$/

// 仅初始化独立草稿，旧规则读取时按基础／不检测展示，不写回来源。
export function 初始化分仓策略(规则: 分仓策略规则) {
  if (规则.type === '分仓规则' && !规则.warehouseAction) 规则.warehouseAction = { mode: 'basic', checkRemainingStock: false, minimumRemainingStock: '', priceDifferenceCurrency: 'CNY' }
}
export function 读取分仓策略(规则: 分仓策略规则): 分仓策略配置 {
  return 规则.warehouseAction ?? { mode: 'basic', checkRemainingStock: false }
}
export function 校验分仓策略(规则: 分仓策略规则): string {
  if (规则.type !== '分仓规则') return 规则.warehouseAction ? '分仓策略仅适用于分仓规则' : ''
  const 配置 = 读取分仓策略(规则)
  if (!['basic', 'age', 'price'].includes(配置.mode)) return '请选择有效的分仓模式'
  if (配置.mode === 'age') {
    if (!Array.isArray(配置.ageRoutes) || !配置.ageRoutes.length) return '请至少选择一个库龄分仓的发货仓库及物流渠道'
    const 身份 = 配置.ageRoutes.map(项 => 项 ? 分仓仓库键(项) : '')
    if (new Set(身份).size !== 身份.length) return '库龄分仓的发货仓库不能重复选择'
    if (配置.ageBatchPreference !== undefined && !['recent', 'all'].includes(配置.ageBatchPreference)) return '请选择有效的库龄分仓批次口径'
  }
  if (配置.mode === 'price') {
    if (!Array.isArray(配置.priceRoutes) || !配置.priceRoutes.length) return '请至少选择一个比价分仓的仓库及物流渠道组合'
    const 身份 = 配置.priceRoutes.map(项 => JSON.stringify([项 && 分仓仓库键(项), 项?.channelId]))
    if (new Set(身份).size !== 身份.length) return '比价分仓的仓库及物流渠道组合不能重复'
    if (配置.priceComparison !== undefined && !['lowest', 'priceAge'].includes(配置.priceComparison)) return '请选择有效的比较逻辑'
    if (配置.priceComparison === 'priceAge') {
      if (配置.priceAgeLogic !== undefined && !['priceGap', 'ageGap'].includes(配置.priceAgeLogic)) return '请选择有效的综合判断逻辑'
      if (!['recent', 'all'].includes(配置.agePreference ?? '')) return '请选择有效的库龄优先口径'
      if ((配置.priceAgeLogic ?? 'priceGap') === 'priceGap' && 解析条件定点值(配置.priceDifference) === undefined) return '价格差额请输入非负金额，最多24位数字、6位小数'
      if ((配置.priceAgeLogic ?? 'priceGap') === 'priceGap' && !是否支持比价币种(配置.priceDifferenceCurrency)) return '请选择有效的价格差额币种'
      if (配置.priceAgeLogic === 'ageGap' && (typeof 配置.ageDifferenceDays !== 'string' || !非负整数.test(配置.ageDifferenceDays))) return '库龄差额请输入非负整数天数，最多24位'
    }
  }
  if (typeof 配置.checkRemainingStock !== 'boolean') return '请选择是否检测库存'
  if (配置.checkRemainingStock && (typeof 配置.minimumRemainingStock !== 'string' || !非负整数.test(配置.minimumRemainingStock))) return '剩余库存阈值请输入非负整数，最多24位'
  return ''
}
export function 格式化分仓策略(规则: 分仓策略规则): string {
  if (校验分仓策略(规则)) return '分仓策略配置待完善'
  const 配置 = 读取分仓策略(规则)
  const 库龄口径 = `库龄高（${配置.agePreference === 'all' ? '全批次' : '最近批次'}）`
  const 综合动作 = 配置.priceAgeLogic === 'ageGap' ? `库龄相差不到 ${配置.ageDifferenceDays} 天时优先价格低，否则优先${库龄口径}` : `价格相差不到 ${配置.priceDifference} ${配置.priceDifferenceCurrency} 时优先${库龄口径}，否则优先价格低`
  const 比价动作 = 配置.priceComparison === 'priceAge' ? `价格与库龄综合；${综合动作}` : '优先分配接口试算总费用最低的仓库及渠道'
  const 模式 = 配置.mode === 'age' ? `库龄分仓；优先库龄高（${配置.ageBatchPreference === 'recent' ? '最近批次' : '全批次'}）；多个SKU按库龄累加比较` : 配置.mode === 'price' ? `比价分仓；${比价动作}` : '基础'
  return 配置.checkRemainingStock ? `${模式}；分仓后剩余库存 < ${配置.minimumRemainingStock} 时跳过该仓库` : 模式
}
// 入参必须是中台按同一库存口径返回的“分配后”数量；此处不扣减可用量或预占量。
// 多商品按逐SKU结果判断，任一不足则跳过；真实查询／占用契约尚未接入。
export function 检查分仓剩余库存(规则: 分仓策略规则, 剩余库存?: readonly string[]): 'unchecked' | 'unknown' | 'skip' | 'pass' {
  if (校验分仓策略(规则)) return 'unknown'
  const 配置 = 读取分仓策略(规则)
  if (!配置.checkRemainingStock) return 'unchecked'
  if (!剩余库存?.length || 剩余库存.some(值 => typeof 值 !== 'string' || !/^-?\d{1,24}$/.test(值))) return 'unknown'
  return 剩余库存.some(值 => BigInt(值) < BigInt(配置.minimumRemainingStock!)) ? 'skip' : 'pass'
}

export function 创建规则渠道样例(): 渠道配置[] {
  return [...创建渠道配置样例(), ...创建标发联动渠道样例()]
}

export function 分仓仓库键(项: Pick<分仓路由动作, 'providerId' | 'accountId' | 'warehouseId'>): string { return JSON.stringify([项.providerId, 项.accountId, 项.warehouseId]) }
export function 校验单个分仓路由(路由: 分仓路由动作 | undefined, 渠道: readonly 渠道配置[]): string {
  if (!路由 || [路由.providerId, 路由.accountId, 路由.warehouseId].some(值 => typeof 值 !== 'string' || !值.trim())) return '请选择完整的仓储服务商、仓库账号和发货仓库'
  if (typeof 路由.channelId !== 'string' || !路由.channelId.trim()) return '请选择物流渠道'
  const 匹配 = 渠道.filter(项 => 项.id === 路由.channelId)
  if (!匹配.length) return '所选物流渠道不存在，请重新选择'
  if (匹配.length !== 1) return '所选物流渠道身份不唯一，请核查后重新选择'
  const 项 = 匹配[0]!
  if (项.providerId !== 路由.providerId || 项.accountId !== 路由.accountId || 项.warehouseId !== 路由.warehouseId) return '物流渠道不属于所选服务商、账号及仓库'
  if (!项.enabled) return '所选物流渠道已停用，请重新选择'
  if (项.labelMode !== '仓库回传') return '本期仅支持仓库回传面单的三方仓物流渠道'
  return ''
}

type 分仓规则 = Pick<订单规则, 'type' | 'routeAction' | 'warehouseAction'>
export function 校验分仓路由(规则: 分仓规则, 渠道: readonly 渠道配置[]): string {
  if (规则.type !== '分仓规则') return ''
  const 策略错误 = 校验分仓策略(规则)
  if (策略错误) return 策略错误
  const 配置 = 读取分仓策略(规则)
  if (配置.mode === 'basic') return 校验单个分仓路由(规则.routeAction, 渠道)
  for (const [index, 路由] of (配置.mode === 'age' ? 配置.ageRoutes! : 配置.priceRoutes!).entries()) {
    const 错误 = 校验单个分仓路由(路由, 渠道)
    if (错误) return `第${index + 1}个候选仓库：${错误}`
  }
  return ''
}
export function 读取分仓候选(规则: 分仓规则, 渠道: readonly 渠道配置[]): 渠道配置[] {
  if (规则.type !== '分仓规则' || 校验分仓路由(规则, 渠道)) return []
  const 配置 = 读取分仓策略(规则)
  const 路由 = 配置.mode === 'age' ? 配置.ageRoutes! : 配置.mode === 'price' ? 配置.priceRoutes! : [规则.routeAction!]
  return 路由.map(项 => JSON.parse(JSON.stringify(渠道.find(条 => 条.id === 项.channelId)!)) as 渠道配置)
}
export function 分仓配置摘要(规则: 分仓规则, 渠道: readonly 渠道配置[]): string[] {
  const 配置 = 读取分仓策略(规则), 候选 = 读取分仓候选(规则, 渠道)
  if (配置.mode === 'age') return [格式化分仓策略(规则), ...(候选.length ? 候选.map((项, index) => `候选仓库${index + 1}：${项.warehouse} · ${项.provider} · ${项.account}；物流渠道：${项.name}`) : ['候选仓库及物流渠道配置待核查'])]
  if (配置.mode === 'price') return [格式化分仓策略(规则), ...(候选.length ? 候选.map((项, index) => `候选组合${index + 1}：${项.warehouse} · ${项.provider} · ${项.account}；物流渠道：${项.name}`) : ['候选仓库及物流渠道配置待核查'])]
  return [格式化分仓策略(规则), `发货仓库：${候选[0]?.warehouse || '配置待核查'}`, `物流渠道：${候选[0]?.name || '配置待核查'}`]
}

export function 读取分仓路由(规则: 分仓规则, 渠道: readonly 渠道配置[]): 渠道配置 | undefined {
  // 库龄模式须按订单及来源库龄比较后确定，不能借用基础模式的暂存仓库。
  if (读取分仓策略(规则).mode !== 'basic') return undefined
  if (规则.type !== '分仓规则' || 校验分仓路由(规则, 渠道)) return undefined
  const 匹配 = 渠道.find(项 => 项.id === 规则.routeAction!.channelId)!
  return JSON.parse(JSON.stringify(匹配)) as 渠道配置
}
