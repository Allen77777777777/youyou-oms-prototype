import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 订单备注字数上限 } from '../订单处理/订单备注模型'
import { 标发基础动作, 校验标发动作, 读取标发时机, type 标发时机配置 } from './标发动作'
import { 创建规则渠道样例, 读取分仓路由, 校验分仓路由, 校验分仓策略, 检查分仓剩余库存, type 分仓路由动作, type 分仓策略配置 } from './规则路由'
import { 计算库龄分仓, type 候选库龄资料 } from './库龄分仓'
import { 计算比价分仓, type 运费试算报价 } from './比价分仓'
import type { 比价汇率快照 } from './比价汇率'
import { 是否多选条件字段, 是否多行文本字段, 读取条件多选值, 读取条件多行值, 读取范围边界, 条件字段名, 校验条件配置, 解析条件定点值, type 条件字段, type 规则条件 } from './规则条件定义'
import { 创建发货仓库选项, 读取发货仓库来源 } from './规则仓库条件'

export type { 分仓路由动作 } from './规则路由'
export type { 条件字段, 规则条件 } from './规则条件定义'
export { 条件字段名 } from './规则条件定义'

export type 规则类型 = '审单规则' | '分仓规则' | '订单标发规则'
export interface 订单规则 { id: string; name: string; type: 规则类型; enabled: boolean; priority: number; mode: '全部满足' | '任一满足'; conditions: 规则条件[]; action: string; routeAction?: 分仓路由动作; warehouseAction?: 分仓策略配置; shippingAction?: 标发时机配置; orderNote?: string; version: number; updatedAt: string; note: string }
export const eBay平台订单状态选项 = [
  { value: 'NOT_STARTED', label: '未履约（NOT_STARTED）' },
  { value: 'IN_PROGRESS', label: '部分履约（IN_PROGRESS）' },
  { value: 'FULFILLED', label: '全部履约（FULFILLED）' },
] as const
export const 规则动作: Record<规则类型, string[]> = { 审单规则: ['留在待审核'], 分仓规则: ['万邑通美西仓', '谷仓美东仓', '西邮波兰仓', '出口易德国仓', '4PX 巴西圣保罗仓'], 订单标发规则: 标发基础动作 }

function 有eBay平台限制(规则: 订单规则): boolean {
  return 规则.mode === '全部满足' && 规则.conditions.some(条件 => {
    const values = 读取条件多选值(条件)
    return 条件.field === 'platformCode' && 条件.operator === '等于' && !校验条件配置(条件) && values.length === 1 && values[0] === 'eBay'
  })
}
function 有效eBay状态(值: string): boolean { return eBay平台订单状态选项.some(选项 => 选项.value === 值) }
function 重复条件字段(conditions: 规则条件[]) {
  const 已有字段 = new Set<条件字段>()
  for (const 条件 of conditions) {
    if (已有字段.has(条件.field)) return 条件.field
    已有字段.add(条件.field)
  }
  return undefined
}
function 发货仓库选值有效(条件: 规则条件, 渠道: readonly 渠道配置[]): boolean {
  const selected = 读取条件多选值(条件)
  const available = new Set(创建发货仓库选项(渠道).map(项 => 项.value))
  return selected.length > 0 && selected.every(值 => available.has(值))
}
function 校验动作附加配置(规则: 订单规则): string {
  const 分仓错误 = 校验分仓策略(规则)
  if (分仓错误) return 分仓错误
  const 标发错误 = 校验标发动作(规则)
  if (标发错误) return 标发错误
  if (规则.type === '审单规则' && !规则动作.审单规则.includes(规则.action)) return '请选择有效执行动作'
  if (规则.orderNote === undefined) return ''
  if (typeof 规则.orderNote !== 'string') return '订单备注格式无效'
  const 内容 = 规则.orderNote.trim()
  if (规则.type !== '审单规则' && 内容) return '订单备注仅适用于审单规则'
  if (内容.length > 订单备注字数上限) return `订单备注最多 ${订单备注字数上限} 字`
  return ''
}

export function 校验规则配置(规则: 订单规则, 全部规则: 订单规则[], 渠道: readonly 渠道配置[] = 创建规则渠道样例()): string {
  if (typeof 规则.name !== 'string' || !规则.name.trim()) return '请输入规则名称'
  if (!Object.prototype.hasOwnProperty.call(规则动作, 规则.type)) return '请选择有效规则类型'
  if (全部规则.some(项 => 项.id !== 规则.id && 项.type === 规则.type && 项.name.trim() === 规则.name.trim())) return '同一类型中已存在同名规则'
  if (规则.mode !== '全部满足') return '当前规则仅支持全部条件同时满足，请重新编辑并确认条件'
  if (!Array.isArray(规则.conditions) || !规则.conditions.length) return '至少填写一条完整条件'
  const 重复字段 = 重复条件字段(规则.conditions)
  if (重复字段) return `${条件字段名[重复字段] || '同一条件字段'}仅能配置一行，请在该条件中维护多个值`
  for (const 条件 of 规则.conditions) {
    if (条件.field === 'shippingWarehouse' && 规则.type === '分仓规则') return '发货仓库条件仅适用于审单规则和订单标发规则'
    const 条件错误 = 校验条件配置(条件)
    if (条件错误) return 条件错误
    if (条件.field === 'shippingWarehouse' && !发货仓库选值有效(条件, 渠道)) return '发货仓库条件包含未识别或已失效的仓库身份，请重新选择'
    if (条件.field === 'platformOrderStatus' && !有效eBay状态(条件.value)) return '平台订单状态仅支持已确认的 eBay 履约状态'
  }
  if (规则.conditions.some(条件 => 条件.field === 'platformOrderStatus') && !有eBay平台限制(规则)) return '平台订单状态条件须限定平台等于 eBay'
  const 动作配置错误 = 校验动作附加配置(规则)
  if (动作配置错误) return 动作配置错误
  if (规则.type === '分仓规则') return 校验分仓路由(规则, 渠道)
  if (!规则动作[规则.type].includes(规则.action)) return '请选择有效执行动作'
  return ''
}

type 已核验来源 = { kind: 'text'; value: string } | { kind: 'textLines'; values: string[] } | { kind: 'money'; value: bigint; currency: string } | { kind: 'warehouses'; values: string[] }
function 读取条件来源(字段: 条件字段, 订单: 全渠道订单, 类型: 规则类型, 渠道: readonly 渠道配置[], 动作?: string): 已核验来源 | undefined {
  if (字段 === 'shippingWarehouse') {
    const values = 读取发货仓库来源(订单, 类型, 渠道, 动作)
    return values ? { kind: 'warehouses', values } : undefined
  }
  if (字段 === 'orderAmount' || 字段 === 'buyerPaidShipping') {
    const 金额 = 订单.amount?.[字段]
    const value = 解析条件定点值(金额?.value)
    if (value === undefined || typeof 金额?.currency !== 'string' || !/^[A-Z]{3}$/.test(金额.currency.trim())) return undefined
    return { kind: 'money', value, currency: 金额.currency.trim() }
  }
  let value: unknown
  switch (字段) {
    case 'platformCode': value = 订单.platformCode; break
    case 'storeId': value = 订单.storeId; break
    case 'storeName': value = 订单.storeName; break
    case 'fulfillmentMode': value = 订单.fulfillmentMode; break
    case 'platformOrderStatus': value = 订单.platformOrderStatus; break
    case 'countryCode': value = 订单.address?.countryCode; break
    case 'stateProvince': value = 订单.address?.stateProvince; break
    case 'city': value = 订单.address?.city; break
    case 'buyerMessage': value = 订单.address?.buyerMessage; break
    case 'orderAddress': return { kind: 'textLines', values: [订单.address?.addressLine1, 订单.address?.addressLine2].filter((行): 行 is string => typeof 行 === 'string' && !!行.trim()).map(行 => 行.trim()) }
    default: return undefined
  }
  if (typeof value !== 'string' || (字段 === 'platformOrderStatus' && !有效eBay状态(value))) return undefined
  return { kind: 'text', value: value.trim() }
}

function 计算规则命中(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[]): { matched: boolean; unknownFields: string[] } {
  if (!规则.enabled || 规则.mode !== '全部满足' || !规则.conditions.length || 重复条件字段(规则.conditions)) return { matched: false, unknownFields: [] }
  if (规则.type === '分仓规则' && 规则.conditions.some(条件 => 条件.field === 'shippingWarehouse')) return { matched: false, unknownFields: [] }
  if (校验动作附加配置(规则)) return { matched: false, unknownFields: [] }
  const 未知字段 = new Set<string>()
  const 结果 = 规则.conditions.map((条件) => {
    if (校验条件配置(条件)) return false
    if (条件.field === 'shippingWarehouse' && !发货仓库选值有效(条件, 渠道)) { 未知字段.add(条件字段名[条件.field]); return false }
    const 原值 = 读取条件来源(条件.field, 订单, 规则.type, 渠道, 规则.action)
    const 留言存在判断 = 条件.field === 'buyerMessage' && (条件.operator === '存在' || 条件.operator === '不存在')
    if (!原值 || (原值.kind === 'text' && !原值.value && !留言存在判断) || ((原值.kind === 'textLines' || 原值.kind === 'warehouses') && !原值.values.length)) {
      未知字段.add(条件字段名[条件.field])
      return false
    }
    if (留言存在判断) return 原值.kind === 'text' && (条件.operator === '存在' ? !!原值.value : !原值.value)
    if (原值.kind === 'money') {
      if (条件.operator !== '介于' || 原值.currency !== 条件.currency?.trim()) return false
      const 边界 = 读取范围边界(条件)
      const minimum = 边界.lowerEnabled ? 解析条件定点值(条件.value) : undefined
      const maximum = 边界.upperEnabled ? 解析条件定点值(条件.upperValue) : undefined
      return (minimum === undefined || (边界.lowerInclusive ? 原值.value >= minimum : 原值.value > minimum)) && (maximum === undefined || (边界.upperInclusive ? 原值.value <= maximum : 原值.value < maximum))
    }
    if (原值.kind === 'warehouses') {
      const selected = 读取条件多选值(条件)
      const overlap = 原值.values.some(值 => selected.includes(值))
      return 条件.operator === '等于' ? overlap : 条件.operator === '不等于' ? !overlap : false
    }
    if (是否多行文本字段(条件.field)) {
      const 保留大小写 = 条件.field === 'buyerMessage' || 条件.field === 'warehouseSku' || 条件.field === 'platformSku'
      const 比较文本 = (值: string) => 保留大小写 ? 值 : 值.toLowerCase()
      const 关键词 = 读取条件多行值(条件).map(比较文本)
      const 来源文本 = (原值.kind === 'textLines' ? 原值.values : [原值.value]).map(比较文本)
      const 有相等 = 关键词.some(词 => 来源文本.some(行 => 行 === 词))
      const 有包含 = 关键词.some(词 => 来源文本.some(行 => 行.includes(词)))
      switch (条件.operator) {
        case '等于': return 有相等
        case '不等于': return !有相等
        case '包含': return 有包含
        case '不包含': return !有包含
        default: return false
      }
    }
    if (原值.kind !== 'text') return false
    if (是否多选条件字段(条件.field)) {
      const selected = 读取条件多选值(条件)
      return 条件.operator === '等于' ? selected.includes(原值.value) : !selected.includes(原值.value)
    }
    const value = 条件.value.trim()
    switch (条件.operator) {
      case '等于': return 原值.value === value
      case '不等于': return 原值.value !== value
      case '包含': return 原值.value.includes(value)
      case '不包含': return !原值.value.includes(value)
      case '存在': return !!原值.value
      case '不存在': return !原值.value
      default: return false
    }
  })
  const 平台状态范围有效 = !规则.conditions.some(条件 => 条件.field === 'platformOrderStatus') || (有eBay平台限制(规则) && 订单.platformCode === 'eBay')
  return { matched: 平台状态范围有效 && 结果.every(Boolean), unknownFields: [...未知字段] }
}
export function 命中规则(规则: 订单规则, 订单: 全渠道订单, 渠道: readonly 渠道配置[] = 创建规则渠道样例()): boolean {
  return 计算规则命中(规则, 订单, 渠道).matched
}
export function 试算规则(规则: 订单规则[], 订单: 全渠道订单, 类型: 规则类型, 渠道: readonly 渠道配置[] = 创建规则渠道样例(), 库龄资料: readonly 候选库龄资料[] = [], 运费报价: readonly 运费试算报价[] = [], 汇率快照?: 比价汇率快照) {
  const 候选 = (JSON.parse(JSON.stringify(规则)) as 订单规则[]).filter((项) => 项.type === 类型).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  const 轨迹 = 候选.map((项) => ({ rule: 项, ...计算规则命中(项, 订单, 渠道) }))
  const 首个命中 = 轨迹.find((项) => 项.matched)?.rule
  const 门禁: string[] = []
  if (订单.fulfillmentMode !== '自配送') 门禁.push('平台履约订单不进入自配送作业')
  if (!订单.processingStatus) 门禁.push('订单尚未进入 OMS 处理')
  // 标准订单的 paidAt 只用于展示，不能代替 eBay 当前订单级 orderPaymentStatus。
  // 未通过 PAID 准入的订单没有处理状态；准入后的非 PAID 更新应先由平台适配链路转为异常。
  if (订单.processingStatus === '不发货' || 订单.processingStatus === '异常' || 订单.cancelledAt || 订单.blockReason) 门禁.push('订单存在终止或异常门禁')
  if (订单.platformCode !== 'eBay') 门禁.push('该平台接入与动作门禁尚未验证')
  if (类型 === '审单规则' || 类型 === '分仓规则') {
    if (订单.processingStatus !== '待审核') 门禁.push('审单与首次路由分配只在待审核阶段执行')
  }
  if (类型 === '订单标发规则') {
    if (首个命中?.action === '物流下单后标发') {
      const 已取跟踪号 = 订单.fulfillmentOrders.some(项 => 项.isActive === true && 项.status !== '已终止' && typeof 项.trackingNumber === 'string' && !!项.trackingNumber.trim())
      if (!已取跟踪号) 门禁.push('未取得本次有效履约的跟踪号，不得标发')
      // 现有订单摘要没有首次可信获取跟踪号的时间，不借创建、出库或试算时刻计算延迟。
      if (读取标发时机(首个命中).timing === 'delay') 门禁.push('未取得跟踪号获取时间，无法确定延迟标发计划')
    } else {
      if (订单.processingStatus !== '已发货') 门禁.push('来源 OMS 订单尚未已发货，不得生成或调度标发')
      if (!订单.fulfillmentOrders.some((项) => 项.isActive && 项.shippedQuantity > 0 && 项.shippedAt)) 门禁.push('未取得有效出库事实，不得标发')
    }
    if (首个命中 && 首个命中.action !== '无需标发' && 读取标发时机(首个命中).timing === 'beforeDeadline') 门禁.push('未取得平台最晚标发时间，无法确定提前标发计划')
  }
  const 库龄比较 = 首个命中?.type === '分仓规则' && 首个命中.warehouseAction?.mode === 'age' ? 计算库龄分仓(首个命中, 订单, 渠道, 库龄资料) : undefined
  const 比价比较 = 首个命中?.type === '分仓规则' && 首个命中.warehouseAction?.mode === 'price' ? 计算比价分仓(首个命中, 订单, 渠道, 运费报价, 库龄资料, 汇率快照) : undefined
  const 路由 = 库龄比较 ? 库龄比较.route : 比价比较 ? 比价比较.route : 首个命中?.type === '分仓规则' ? 读取分仓路由(首个命中, 渠道) : undefined
  if (库龄比较) 门禁.push(...库龄比较.gates)
  if (比价比较) 门禁.push(...比价比较.gates)
  if (首个命中?.type === '分仓规则') {
    const 路由错误 = 校验分仓路由(首个命中, 渠道)
    if (路由错误) 门禁.push(`分仓路由：${路由错误}`)
    if (!库龄比较 && !比价比较 && 检查分仓剩余库存(首个命中) === 'unknown') 门禁.push('未取得分仓后剩余可用库存，无法判断是否跳过该仓库')
  }
  return { trace: 轨迹, hit: 首个命中, route: 路由, aging: 库龄比较, pricing: 比价比较, gates: 门禁, unknownFields: [...new Set(轨迹.flatMap(项 => 项.unknownFields))] }
}

export function 创建规则样例(): 订单规则[] {
  const 基础 = { enabled: true, mode: '全部满足' as const, version: 1, updatedAt: '2026-09-12 09:00 UTC+8', note: '' }
  const 渠道 = 创建规则渠道样例()
  const 分仓动作 = (channelId: string): 分仓路由动作 => {
    const 项 = 渠道.find(项 => 项.id === channelId)!
    return { providerId: 项.providerId, accountId: 项.accountId, warehouseId: 项.warehouseId, channelId: 项.id }
  }
  return [
    { ...基础, id: 'RULE-REVIEW-01', name: 'eBay 北美订单人工复核', type: '审单规则', priority: 10, conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'countryCode', operator: '等于', value: 'US' }], action: '留在待审核' },
    { ...基础, id: 'RULE-ROUTE-01', name: '美国自配送默认路由', type: '分仓规则', priority: 10, conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }, { field: 'fulfillmentMode', operator: '等于', value: '自配送' }], action: '万邑通美西仓', routeAction: 分仓动作('DEMO-CF-CHANNEL-WYT'), note: '美国自配送订单分配至万邑通美西仓，使用 USPS Ground Advantage。' },
    { ...基础, id: 'RULE-ROUTE-02', name: '北美备用仓候选', type: '分仓规则', priority: 20, enabled: false, conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '谷仓美东仓', routeAction: 分仓动作('DEMO-CF-CHANNEL-GC') },
    { ...基础, id: 'RULE-CONFIRM-01', name: 'eBay 实际出库后回传', type: '订单标发规则', priority: 10, conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: '仓库发货完成后标发', shippingAction: { timing: 'immediate' } },
  ]
}
