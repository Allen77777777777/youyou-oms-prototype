import type { 全渠道订单, 人工发货分配 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import { 计算规则命中, type 订单规则 } from './规则逻辑'
import { 条件字段名, 校验条件配置, 解析条件定点值, 读取条件多行值, 读取范围边界, type 规则条件, type 规则范围 } from './规则条件定义'
import { 计算尺寸公式, type 材积组 } from './尺寸材积模型'
import { 校验拆单遗留配置, type 拆单计算资料 } from './拆单规则模型'

const 精度 = 1_000_000n
const 头字段 = new Set(['platformCode', 'storeId', 'storeName', 'fulfillmentMode', 'platformOrderStatus', 'countryCode', 'stateProvince', 'city', 'buyerMessage', 'orderAddress', 'orderAmount', 'buyerPaidShipping'])
type 三态 = boolean | undefined
function 范围内(value: bigint, range: 规则范围, multiplier = 1n): boolean {
  const bounds = 读取范围边界(range)
  const min = bounds.lowerEnabled ? 解析条件定点值(range.value) : undefined
  const max = bounds.upperEnabled ? 解析条件定点值(range.upperValue) : undefined
  return (min === undefined || (bounds.lowerInclusive ? value >= min * multiplier : value > min * multiplier)) &&
    (max === undefined || (bounds.upperInclusive ? value <= max * multiplier : value < max * multiplier))
}
function SKU匹配(values: (string | undefined)[], condition: 规则条件): 三态 {
  if (!values.length || values.some(x => !x?.trim())) return undefined
  const keywords = 读取条件多行值(condition)
  const exact = keywords.some(x => values.some(value => value === x))
  const contains = keywords.some(x => values.some(value => value!.includes(x)))
  return condition.operator === '等于' ? exact : condition.operator === '不等于' ? !exact : condition.operator === '包含' ? contains : !contains
}
function 全部(values: 三态[]): 三态 { return values.includes(false) ? false : values.includes(undefined) ? undefined : true }
function 任一(values: 三态[]): 三态 { return values.includes(true) ? true : values.includes(undefined) ? undefined : false }

/** 原单头字段不改写；商品条件仅读取本次进入规则的包裹分配。缺资料保留未知，不能按否定条件放行。 */
export function 拆单条件匹配(rule: 订单规则, order: 全渠道订单, items: readonly 人工发货分配[], data: 拆单计算资料, channels: readonly 渠道配置[]): { matched: boolean; pending: boolean; unknownFields: string[] } {
  const no = { matched: false, pending: false, unknownFields: [] }
  if (!rule.enabled) return no
  const legacyError = 校验拆单遗留配置(rule)
  if (legacyError) return { ...no, pending: true, unknownFields: [legacyError] }
  if (rule.mode !== '全部满足' || !Array.isArray(rule.conditions) || !rule.conditions.length || new Set(rule.conditions.map(x => x.field)).size !== rule.conditions.length) return { ...no, pending: true, unknownFields: ['规则条件配置'] }
  const unknown = new Set<string>()
  const values: 三态[] = []
  const head: 规则条件[] = []
  const sources = items.map(item => order.items.filter(x => x.externalLineId === item.externalLineId))
  const products = items.map(item => data.products.filter(x => x.orderNo === item.orderNo && x.externalLineId === item.externalLineId))
  const validItems = items.length > 0 && items.every((x, i) => x.orderNo === order.systemOrderNo && Number.isSafeInteger(x.quantity) && x.quantity > 0 && sources[i]!.length === 1)
  const quantity = items.reduce((sum, x) => sum + (Number.isSafeInteger(x.quantity) ? x.quantity : 0), 0)
  const dims = products.map(matches => matches.length === 1 && matches[0]!.dimensionsCm?.length === 3 ? matches[0]!.dimensionsCm!.map(value => 解析条件定点值(value)) : undefined)
  const knownDimensions = validItems && dims.every(x => x?.length === 3 && x.every(v => v !== undefined && v > 0n))
  const dimensionRows = () => dims as [bigint, bigint, bigint][]
  const volumeGroup = (group: 材积组): 三态 => {
    // 叠放换算和多商品选底面尚无已确认计算契约，不能用包裹外箱尺寸猜测。
    if (!knownDimensions || group.method !== 'sumProducts' || group.convert) return undefined
    const rows = dimensionRows()
    const sum = rows.reduce((total, row, i) => total + row[0] * row[1] * row[2] * BigInt(items[i]!.quantity), 0n)
    const bound = group.sumProducts
    if (!范围内(sum, { value: bound.min, upperValue: bound.max, lowerInclusive: bound.minInclusive, upperInclusive: bound.maxInclusive }, 精度 * 精度)) return false
    return (['length', 'width', 'height'] as const).every((key, axis) => {
      const filter = group[key], range = { value: filter.min, upperValue: filter.max }
      return filter.stack ? 范围内(rows.reduce((n, row, i) => n + row[axis]! * BigInt(items[i]!.quantity), 0n), range) : rows.every(row => 范围内(row[axis]!, range))
    })
  }
  for (const condition of rule.conditions) {
    const label = 条件字段名[condition.field] || String(condition.field)
    if (校验条件配置(condition)) { values.push(undefined); unknown.add(`${label}配置`); continue }
    if (头字段.has(condition.field)) { head.push(condition); continue }
    let result: 三态
    if (validItems) {
      switch (condition.field) {
        case 'platformSku': result = SKU匹配(sources.map(x => x[0]!.platformSku), condition); break
        case 'warehouseSkuQuantity': result = condition.quantityMode === 'sku' ? undefined : 范围内(BigInt(quantity) * 精度, condition); break
        case 'orderWeight': {
          const weights = products.map(x => x.length === 1 ? 解析条件定点值(x[0]!.weightKg) : undefined)
          result = weights.some(x => x === undefined || x <= 0n) ? undefined : 范围内(weights.reduce<bigint>((sum, weight, i) => sum + weight! * BigInt(items[i]!.quantity), 0n), condition)
          break
        }
        case 'unitPrice': result = 全部(sources.map(x => {
          const price = x[0]!.unitPrice, amount = 解析条件定点值(price?.value)
          if (amount === undefined || !price?.currency) return undefined
          return price.currency === condition.currency && 范围内(amount, condition)
        })); break
        case 'lengthWidthHeight': result = knownDimensions ? dimensionRows().every(row => (['length', 'width', 'height'] as const).every((key, i) => 范围内(row[i]!, condition.dimensionRanges![key]))) : undefined; break
        case 'dimensionSum': case 'longestSide': case 'secondSide': case 'lengthGirth':
          result = knownDimensions ? dimensionRows().every(row => {
            const sorted = [...row].sort((a, b) => a > b ? -1 : a < b ? 1 : 0)
            const value = condition.field === 'dimensionSum' ? row[0] + row[1] + row[2] : condition.field === 'longestSide' ? sorted[0]! : condition.field === 'secondSide' ? sorted[1]! : row[0] + 2n * (row[1] + row[2])
            return 范围内(value, condition)
          }) : undefined
          break
        case 'productDimensions': {
          const config = condition.dimensionRules!
          const matches = config.rows.map(row => {
            if (row.type === 'singlePiece' && quantity !== 1) return false
            if (!knownDimensions || !['single', 'singlePiece'].includes(row.type)) return undefined
            try { return products.every(x => { const [L, W, H] = x[0]!.dimensionsCm!; return 计算尺寸公式(row.expression, { L, W, H }) }) } catch { return undefined }
          })
          result = config.mode === '匹配全部规则' ? 全部(matches) : config.mode === '匹配任意规则' ? 任一(matches) : 任一(matches) === undefined ? undefined : !任一(matches)
          break
        }
        case 'volume': result = 任一(condition.volumeGroups!.map(volumeGroup)); break
      }
    }
    values.push(result)
    if (result === undefined) unknown.add(label)
  }
  if (head.length) {
    // 仅复用头字段判定，拆单动作是否合法仍由拆单引擎单独拦截。
    const proxy: 订单规则 = { id: rule.id, name: rule.name, type: '审单规则', action: '人工审核', enabled: true, priority: rule.priority, version: rule.version, mode: '全部满足', conditions: head, updatedAt: rule.updatedAt, note: rule.note }
    const result = 计算规则命中(proxy, order, channels)
    values.push(result.pending ? undefined : result.matched)
    result.unknownFields.forEach(x => unknown.add(x))
  }
  const overall = 全部(values)
  return { matched: overall === true, pending: overall === undefined, unknownFields: [...unknown] }
}
