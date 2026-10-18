import { 中台系统用户资料 } from './规则基础选项'
import { 创建尺寸配置, 创建材积组, 校验尺寸配置, 校验材积配置, 尺寸配置摘要, 材积配置摘要, type 尺寸配置, type 材积组 } from './尺寸材积模型'

export type 条件字段 =
  | 'platformCode' | 'siteCode' | 'storeId'
  | 'countryCode' | 'platformShippingMethod' | 'orderAddress' | 'stateProvince' | 'city'
  | 'orderWeight' | 'orderAmount' | 'transactionAmount' | 'orderShippingAmount' | 'buyerPaidShipping' | 'buyerMessage' | 'unitPrice'
  | 'productDimensions' | 'warehouseSku' | 'platformSku' | 'warehouseSkuQuantity' | 'specifiedWarehouseSku' | 'salesOwner' | 'volume'
  | 'lengthWidthHeight' | 'dimensionSum' | 'longestSide' | 'secondSide' | 'lengthGirth'
  | 'storeName' | 'fulfillmentMode' | 'platformOrderStatus'
export type 条件比较方式 = '等于' | '不等于' | '包含' | '不包含' | '介于' | '存在' | '不存在'
export interface 规则范围 {
  value: string
  upperValue?: string
  lowerEnabled?: boolean
  upperEnabled?: boolean
  lowerInclusive?: boolean
  upperInclusive?: boolean
  currency?: string
}
export interface 规则条件 extends 规则范围 {
  field: 条件字段
  operator: 条件比较方式
  values?: string[]
  widthValue?: string
  heightValue?: string
  dimensionRules?: 尺寸配置
  volumeGroups?: 材积组[]
  quantityMode?: 'total' | 'sku'
  dimensionRanges?: Record<'length' | 'width' | 'height', 规则范围>
}
interface 条件元数据 {
  label: string
  kind: 'multi' | 'select' | 'text' | 'range' | 'dimensions' | 'volume' | 'dimensionRange'
  money?: boolean
  unit?: string
  integer?: boolean
}

export const 条件分组: { title: string; fields: 条件字段[] }[] = [
  { title: '基础信息', fields: ['platformCode', 'siteCode', 'storeId'] },
  { title: '物流信息', fields: ['countryCode', 'stateProvince', 'city', 'orderAddress', 'platformShippingMethod'] },
  { title: '订单信息', fields: ['orderWeight', 'orderAmount', 'buyerPaidShipping', 'buyerMessage', 'unitPrice'] },
  { title: '货品信息', fields: ['productDimensions', 'warehouseSku', 'platformSku', 'warehouseSkuQuantity', 'lengthWidthHeight', 'dimensionSum', 'longestSide', 'secondSide', 'lengthGirth', 'salesOwner', 'volume'] },
]
export const 条件定义: Record<条件字段, 条件元数据> = {
  platformCode: { label: '订单平台', kind: 'multi' },
  siteCode: { label: '订单站点', kind: 'multi' },
  storeId: { label: '订单店铺', kind: 'multi' },
  countryCode: { label: '收货国家', kind: 'multi' },
  platformShippingMethod: { label: '平台配送方式', kind: 'text' },
  orderAddress: { label: '订单地址', kind: 'text' },
  stateProvince: { label: '收货省/州', kind: 'text' },
  city: { label: '收货城市', kind: 'text' },
  orderWeight: { label: '订单重量（kg）', kind: 'range', unit: 'kg' },
  orderAmount: { label: '订单总金额范围', kind: 'range', money: true },
  // 已移除的条件仅保留元数据以展示存量配置，不映射为其他金额。
  transactionAmount: { label: '订单交易额范围', kind: 'range', money: true },
  orderShippingAmount: { label: '订单运费金额范围', kind: 'range', money: true },
  buyerPaidShipping: { label: '客付运费范围', kind: 'range', money: true },
  buyerMessage: { label: '买家留言', kind: 'text' },
  unitPrice: { label: '商品单价金额范围', kind: 'range', money: true },
  productDimensions: { label: '产品尺寸', kind: 'dimensions', unit: 'cm' },
  warehouseSku: { label: '仓库SKU', kind: 'text' },
  platformSku: { label: '平台SKU', kind: 'text' },
  warehouseSkuQuantity: { label: '产品数量', kind: 'range', integer: true },
  lengthWidthHeight: { label: '长宽高', kind: 'dimensionRange', unit: 'cm' },
  dimensionSum: { label: '三边之和', kind: 'range', unit: 'cm' },
  longestSide: { label: '最长边', kind: 'range', unit: 'cm' },
  secondSide: { label: '次长边', kind: 'range', unit: 'cm' },
  lengthGirth: { label: '长+(宽+高)×2', kind: 'range', unit: 'cm' },
  specifiedWarehouseSku: { label: '指定仓库SKU', kind: 'text' },
  salesOwner: { label: '产品销售负责人', kind: 'select' },
  volume: { label: '材积范围', kind: 'volume', unit: 'cm³' },
  // 只用于读取、编辑和试算存量规则，不进入新建条件目录。
  storeName: { label: '店铺名称', kind: 'text' },
  fulfillmentMode: { label: '履约模式', kind: 'select' },
  platformOrderStatus: { label: '平台订单状态', kind: 'select' },
}
export const 条件字段名 = Object.fromEntries(Object.entries(条件定义).map(([field, definition]) => [field, definition.label])) as Record<条件字段, string>
export const 基础多选字段 = ['platformCode', 'siteCode', 'storeId'] as const
export function 是否基础多选字段(field: unknown): field is typeof 基础多选字段[number] { return 基础多选字段.some(项 => 项 === field) }
export const 多选条件字段 = [...基础多选字段, 'countryCode'] as const
export function 是否多选条件字段(field: unknown): field is typeof 多选条件字段[number] { return 多选条件字段.some(项 => 项 === field) }
export const 多行文本字段 = ['orderAddress', 'stateProvince', 'city', 'platformShippingMethod', 'buyerMessage', 'warehouseSku', 'platformSku'] as const
export function 是否多行文本字段(field: unknown): field is typeof 多行文本字段[number] { return 多行文本字段.some(项 => 项 === field) }
export function 是否已移除条件(field: unknown): boolean { return field === 'transactionAmount' || field === 'orderShippingAmount' || field === 'specifiedWarehouseSku' }
export function 读取条件多行值(condition: 规则条件): string[] {
  return typeof condition.value === 'string' ? condition.value.split(/\r\n?|\n/).map(值 => 值.trim()).filter(Boolean) : []
}
export function 读取条件多选值(condition: 规则条件): string[] {
  if (!是否多选条件字段(condition.field)) return []
  // values 一旦提供就权威生效；不得从残留单值中恢复被用户清空的选择。
  if (condition.values !== undefined) return Array.isArray(condition.values) ? condition.values.filter((值): 值 is string => typeof 值 === 'string').map(值 => 值.trim()) : []
  if (condition.field === 'siteCode') return []
  return typeof condition.value === 'string' && condition.value.trim() ? [condition.value.trim()] : []
}

export function 条件操作符(field: 条件字段): 规则条件['operator'][] {
  const definition = 条件定义[field]
  if (!definition) return []
  if (field === 'buyerMessage') return ['包含', '等于', '不等于', '不包含', '存在', '不存在']
  if (field === 'warehouseSku' || field === 'platformSku') return ['等于', '不等于', '包含', '不包含']
  if (是否多行文本字段(field)) return ['包含', '不包含']
  if (definition.kind === 'range' || definition.kind === 'volume' || definition.kind === 'dimensionRange') return ['介于']
  if (definition.kind === 'multi' || definition.kind === 'select' || definition.kind === 'dimensions' || field === 'storeName') return ['等于', '不等于']
  return ['等于', '不等于', '包含', '不包含']
}
export function 创建空条件(field: 条件字段): 规则条件 {
  const definition = 条件定义[field]
  return {
    field, operator: 条件操作符(field)[0]!, value: '',
    ...(definition.kind === 'multi' ? { values: [] } : {}),
    ...(definition.kind === 'range' ? { upperValue: '' } : {}),
    ...(definition.money ? { currency: '' } : {}),
    ...(definition.kind === 'dimensions' ? { dimensionRules: 创建尺寸配置() } : {}),
    ...(definition.kind === 'volume' ? { volumeGroups: [创建材积组()] } : {}),
    ...(field === 'warehouseSkuQuantity' ? { quantityMode: 'total' as const, lowerInclusive: false, upperInclusive: false } : {}),
    ...(['dimensionSum', 'longestSide', 'secondSide', 'lengthGirth'].includes(field) ? { lowerInclusive: false, upperInclusive: false } : {}),
    ...(field === 'lengthWidthHeight' ? { dimensionRanges: { length: 创建尺寸边界(), width: 创建尺寸边界(), height: 创建尺寸边界() } } : {}),
  }
}
function 文本(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
export function 创建尺寸边界(): 规则范围 { return { value: '', upperValue: '', lowerEnabled: false, upperEnabled: false, lowerInclusive: false, upperInclusive: false } }
export function 读取范围边界(condition: 规则范围) {
  return {
    lowerEnabled: condition.lowerEnabled === undefined ? !!文本(condition.value) : condition.lowerEnabled === true,
    upperEnabled: condition.upperEnabled === undefined ? !!文本(condition.upperValue) : condition.upperEnabled === true,
    lowerInclusive: condition.lowerInclusive === undefined || condition.lowerInclusive === true,
    upperInclusive: condition.upperInclusive === undefined || condition.upperInclusive === true,
  }
}

/** 统一按六位小数缩放；不经过 Number，不接受科学计数法或浮点舍入。 */
export function 解析条件定点值(value: unknown, integer = false): bigint | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^\d+(?:\.\d{1,6})?$/.test(text) || text.replace('.', '').length > 24 || (integer && text.includes('.'))) return undefined
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole! + fraction.padEnd(6, '0'))
}
export function 校验条件配置(condition: 规则条件): string {
  if (!Object.prototype.hasOwnProperty.call(条件定义, condition.field)) return '请选择有效条件字段'
  if (是否已移除条件(condition.field)) return `${条件字段名[condition.field]}已移除，请删除该条件`
  const definition = 条件定义[condition.field]
  if (condition.field === 'productDimensions') {
    if (!condition.dimensionRules) return '旧产品尺寸条件须按公式重新配置，请核对原值'
    if (condition.operator !== '等于') return '产品尺寸公式须重新确认匹配方式'
    return 校验尺寸配置(condition.dimensionRules)
  }
  if (condition.field === 'volume') {
    if (condition.operator !== '介于') return '请选择有效材积比较方式'
    return condition.volumeGroups ? 校验材积配置(condition.volumeGroups) : '旧材积范围须选择计算方式并重新配置，请核对原值'
  }
  if (!条件操作符(condition.field).includes(condition.operator)) return '请选择有效比较方式'
  if (condition.field === 'warehouseSkuQuantity' && condition.quantityMode !== undefined && !['total', 'sku'].includes(condition.quantityMode)) return '请选择有效的产品数量类型'
  if (condition.field === 'lengthWidthHeight') {
    if (!condition.dimensionRanges) return '请配置长宽高范围'
    let enabled = false
    for (const [key, label] of [['length', '长度'], ['width', '宽度'], ['height', '高度']] as const) {
      const range = condition.dimensionRanges[key]
      if (!range || typeof range.value !== 'string') return `${label}范围格式无效`
      const bounds = 读取范围边界(range)
      if (!bounds.lowerEnabled && !bounds.upperEnabled) {
        if ((['lowerEnabled', 'upperEnabled', 'lowerInclusive', 'upperInclusive'] as const).some(k => range[k] !== undefined && typeof range[k] !== 'boolean')) return `${label}边界选项格式无效`
        continue
      }
      enabled = true
      const error = 校验条件配置({ ...range, field: 'longestSide', operator: '介于' })
      if (error) return error.split('最长边').join(label)
    }
    return enabled ? '' : '长宽高至少勾选一个边界'
  }
  if (是否多选条件字段(condition.field)) {
    if (condition.values !== undefined && (!Array.isArray(condition.values) || condition.values.some(值 => typeof 值 !== 'string' || !值.trim()))) return `${definition.label}须选择有效选项`
    if (condition.field === 'siteCode' && condition.values === undefined) return '订单站点旧值未核验，请重新选择站点'
    const values = 读取条件多选值(condition)
    if (!values.length) return `至少填写一条完整条件（${definition.label}请至少选择一项）`
    if (new Set(values).size !== values.length) return `${definition.label}不能包含重复选项`
    return ''
  }
  if (typeof condition.value !== 'string') return '至少填写一条完整条件'
  if (condition.field === 'salesOwner') return 中台系统用户资料.value.some(项 => 项.value === condition.value) ? '' : '请选择有效的产品销售负责人，旧值或失效用户请重新选择'
  if (condition.field === 'buyerMessage' && (condition.operator === '存在' || condition.operator === '不存在')) return ''
  if (是否多行文本字段(condition.field)) return 读取条件多行值(condition).length ? '' : '至少填写一条完整条件'
  if (definition.kind === 'range') {
    if ((['lowerEnabled', 'upperEnabled', 'lowerInclusive', 'upperInclusive'] as const).some(key => condition[key] !== undefined && typeof condition[key] !== 'boolean')) return `${definition.label}边界选项格式无效`
    const 边界 = 读取范围边界(condition)
    if (!边界.lowerEnabled && !边界.upperEnabled) return `${definition.label}至少勾选一个边界`
    const lower = 边界.lowerEnabled ? 文本(condition.value) : '', upper = 边界.upperEnabled ? 文本(condition.upperValue) : ''
    if (condition.upperValue !== undefined && typeof condition.upperValue !== 'string') return `${definition.label}上界格式无效`
    if ((边界.lowerEnabled && !lower) || (边界.upperEnabled && !upper)) return `${definition.label}已勾选的边界须填写数值`
    const minimum = lower ? 解析条件定点值(lower, definition.integer) : undefined
    const maximum = upper ? 解析条件定点值(upper, definition.integer) : undefined
    if ((lower && minimum === undefined) || (upper && maximum === undefined)) return `${definition.label}须为非负${definition.integer ? '整数' : '十进制定点数'}，最多24位数字及6位小数`
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) return `${definition.label}下界不能大于上界`
    if (minimum !== undefined && maximum !== undefined && minimum === maximum && (!边界.lowerInclusive || !边界.upperInclusive)) return `${definition.label}上下界相等时须同时包含边界`
    if (definition.money && !/^[A-Z]{3}$/.test(文本(condition.currency))) return `${definition.label}须填写ISO大写三位币种代码`
    return ''
  }
  return condition.value.trim() ? '' : '至少填写一条完整条件'
}
export function 格式化条件值(condition: 规则条件): string {
  const definition = 条件定义[condition.field]
  if (!definition || condition.operator === '存在' || condition.operator === '不存在') return ''
  if (condition.field === 'productDimensions' && condition.dimensionRules) return 尺寸配置摘要(condition.dimensionRules)
  if (condition.field === 'volume' && condition.volumeGroups) return 材积配置摘要(condition.volumeGroups)
  if (condition.field === 'lengthWidthHeight') return condition.dimensionRanges ? ([['length', '长度'], ['width', '宽度'], ['height', '高度']] as const).map(([key, label]) => {
    const range = condition.dimensionRanges![key]
    const bounds = 读取范围边界(range)
    return bounds.lowerEnabled || bounds.upperEnabled ? `${label} ${格式化条件值({ ...range, field: 'longestSide', operator: '介于' })}` : ''
  }).filter(Boolean).join('；') : ''
  if (condition.field === 'salesOwner') return 中台系统用户资料.value.find(项 => 项.value === condition.value)?.label ?? (文本(condition.value) ? `${文本(condition.value)}（待重新选择）` : '')
  if (definition.kind === 'multi') return 读取条件多选值(condition).join('、')
  if (是否多行文本字段(condition.field)) return 读取条件多行值(condition).join('、')
  if (definition.kind === 'range' || definition.kind === 'volume') {
    const 边界 = 读取范围边界(condition), parts: string[] = []
    const unit = definition.money && 文本(condition.currency) ? ` ${文本(condition.currency)}` : definition.unit && condition.field !== 'volume' ? ` ${definition.unit}` : ''
    if (边界.lowerEnabled) parts.push(`${边界.lowerInclusive ? '大于等于' : '大于'} ${文本(condition.value)}${unit}`)
    if (边界.upperEnabled) parts.push(`${边界.upperInclusive ? '小于等于' : '小于'} ${文本(condition.upperValue)}${unit}`)
    return `${condition.field === 'warehouseSkuQuantity' ? `${condition.quantityMode === 'sku' ? 'SKU数量' : '总数量'}：` : ''}${parts.join('，且 ')}`
  }
  if (definition.kind === 'dimensions') return `${文本(condition.value)} × ${文本(condition.widthValue)} × ${文本(condition.heightValue)} ${definition.unit}`
  return 文本(condition.value)
}
