import type { 全渠道订单, 人工发货分配, 订单路由 } from '../全渠道订单/类型'

/** warehouse 仅用于识别旧配置，当前不再允许保存或执行。 */
export type 拆单依据 = 'platform' | 'system' | 'warehouse'
export type 拆单方式 = 'unit' | 'sku' | 'selected' | 'selectedQty' | 'capacity'
export interface 拆单动作配置 {
  basis: 拆单依据
  /** 遗留配置字段；当前拆单不读取仓库映射范围。 */
  warehouseScopeId?: string
  strategy: 拆单方式
  selectedSkus: string[]
  quantityPerPackage: number
  continueMatching: boolean
  limits: { maxWeightKg?: string; maxVolumeCm3?: string; maxQuantity?: number; maxAmount?: string; currency?: string; maxLongestDifferenceCm?: string }
  mixing: { mode: 'free' | 'separateSelected' | 'togetherSelected' | 'separateAttributes'; skus: string[]; attributes: string[] }
}
export interface 拆单规则输入 {
  id: string; name: string; priority: number; enabled: boolean; version: number; splitAction?: 拆单动作配置
  conditions?: readonly { field: string }[]
}
export interface 拆单商品资料 {
  orderNo: string; externalLineId: string
  /** 每个订单购买单位的实物资料；不从整单总量平均反推。 */
  weightKg?: string; volumeCm3?: string; dimensionsCm?: [string, string, string]
  attributes?: string[]
  isCombination?: boolean
  warehouseMappings: { scopeId: string; warehouseSku: string }[]
}
export interface 拆单候选路线 {
  id: string; warehouseScopeId: string; route: 订单路由; enabled: boolean
  countries?: string[]; minWeightKg?: string; maxWeightKg?: string; maxLongestCm?: string
}
export interface 拆单库存资料 {
  scopeId: string; warehouseSku: string; available: number | null; sourceId: string; verified: boolean; unit: string
}
export interface 拆单包裹报价 {
  channelId: string; packageSignature: string; inputFingerprint: string
  status: '成功' | '失败' | '不支持'; amount?: string; currency?: string; sourceId: string; reason?: string
}
export interface 拆单计算资料 {
  /** 真实适配层应含来源版本；原型固定样例使用固定版本。 */
  sourceVersion: string
  products: readonly 拆单商品资料[]
  routes: readonly 拆单候选路线[]
  stocks: readonly 拆单库存资料[]
  quotes?: readonly 拆单包裹报价[]
  /** 旧适配契约兼容字段；拆单阶段不调用报价、不分配仓库或渠道。 */
  quote?: (order: 全渠道订单, items: readonly 人工发货分配[], route: 拆单候选路线) => 拆单包裹报价 | undefined
}
export interface 拆单包裹 {
  key: string; items: 人工发货分配[]; route?: 订单路由; channelId?: string
  ruleIds: string[]; reasons: string[]; quantity: number; weightKg?: string; volumeCm3?: string
  amount?: string; currency?: string; freightAmount?: string; freightCurrency?: string
  candidates: { channelId: string; warehouse: string; channel: string; accepted: boolean; reason: string; amount?: string; currency?: string }[]
}
export interface 拆单轨迹 {
  ruleId: string; ruleName: string; priority: number; version: number; packageKey: string
  status: '停用' | '未命中' | '资料待核实' | '命中' | '失败' | '未继续匹配'
  beforeCount: number; afterCount: number; detail: string
  /** 仅记录本步输出包身份供展示追溯；旧快照可缺失，不参与拆分计算。 */
  outputPackageKeys?: string[]
}
export interface 拆单计算结果 {
  packages: 拆单包裹[]; trace: 拆单轨迹[]; errors: string[]; warnings: string[]
  matchedRuleIds: string[]; ruleSnapshots: 拆单规则输入[]; sourceFingerprint: string
  splitOccurred: boolean; totalQuantity: number; routable: boolean
}
export type 拆单匹配结果 = boolean | { matched: boolean; pending?: boolean; unknownFields?: string[] }
export const 拆单依据选项: { value: 拆单依据; label: string }[] = [
  { value: 'system', label: '按系统 SKU' }, { value: 'platform', label: '按平台 SKU' },
]
export const 拆单方式选项: { value: 拆单方式; label: string }[] = [
  { value: 'unit', label: '每件产品拆为一包' }, { value: 'sku', label: '一种 SKU 拆为一包' },
  { value: 'selected', label: '指定 SKU 合为一包' }, { value: 'selectedQty', label: '指定 SKU 按件数分包' },
  { value: 'capacity', label: '按包裹限制分包' },
]

export function 创建默认拆单动作(): 拆单动作配置 {
  return { basis: 'system', strategy: 'sku', selectedSkus: [], quantityPerPackage: 2, continueMatching: false,
    limits: {}, mixing: { mode: 'free', skus: [], attributes: [] } }
}

export function 校验拆单遗留配置(rule: { splitAction?: 拆单动作配置; conditions?: readonly { field: string }[] }): string {
  if (rule.splitAction?.basis === 'warehouse') return '旧“按仓库 SKU”拆分依据已移除，请重新选择按系统 SKU 或按平台 SKU'
  if (Array.isArray(rule.conditions) && rule.conditions.some(condition => condition?.field === 'warehouseSku')) return '旧“仓库 SKU”拆单条件已移除，请删除后重新配置'
  return ''
}

const 精度 = 1_000_000n
const 最大件数 = 2000
const 最大包数 = 500
function 定点(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^\d{1,18}(\.\d{1,6})?$/.test(value.trim())) return undefined
  const [integer = '0', fraction = ''] = value.trim().split('.')
  return BigInt(integer) * 精度 + BigInt(fraction.padEnd(6, '0'))
}
function 小数(value: bigint): string {
  const integer = value / 精度, decimal = (value % 精度).toString().padStart(6, '0').replace(/0+$/, '')
  return decimal ? `${integer}.${decimal}` : integer.toString()
}
function 文本列表(values: unknown): values is string[] { return Array.isArray(values) && values.every(x => typeof x === 'string' && Boolean(x.trim())) }
function 正整数(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max }
export function 校验拆单动作(config?: 拆单动作配置): string {
  if (!config) return '请配置拆单动作'
  const legacyError = 校验拆单遗留配置({ splitAction: config })
  if (legacyError) return legacyError
  if (!拆单依据选项.some(x => x.value === config.basis)) return '请选择有效的拆分依据'
  if (['line', 'large'].includes(config.strategy)) return '每行拆分和大件拆分方式已移除，请重新选择拆分方式'
  if (!拆单方式选项.some(x => x.value === config.strategy)) return '请选择有效的拆分方式'
  if (['selected', 'selectedQty'].includes(config.strategy) && (!文本列表(config.selectedSkus) || !config.selectedSkus.length)) return '请填写需要单独拆分的 SKU'
  if (config.strategy === 'selectedQty' && !正整数(config.quantityPerPackage, 最大件数)) return `每包件数请输入 1～${最大件数} 的整数`
  if (typeof config.continueMatching !== 'boolean') return '请选择是否继续匹配后续规则'
  if (config.strategy !== 'capacity') return ''
  const limits = config.limits
  if (!limits || !config.mixing || !['free', 'separateSelected', 'togetherSelected', 'separateAttributes'].includes(config.mixing.mode)) return '请配置有效的包裹限制及混装方式'
  const nonblank = (value: unknown) => value !== undefined
  for (const [key, label] of [['maxWeightKg', '包裹重量'], ['maxVolumeCm3', '商品体积合计'], ['maxAmount', '包裹金额'], ['maxLongestDifferenceCm', '最长边差额']] as const) {
    const value = limits[key]
    if (nonblank(value) && (定点(value) === undefined || (key !== 'maxLongestDifferenceCm' && 定点(value) === 0n))) return `${label}请输入有效${key === 'maxLongestDifferenceCm' ? '非负' : '正'}数，最多 6 位小数`
  }
  if (nonblank(limits.maxQuantity) && !正整数(limits.maxQuantity, 最大件数)) return `包裹件数上限请输入 1～${最大件数} 的整数`
  if (nonblank(limits.maxAmount) && !/^[A-Z]{3}$/.test(limits.currency || '')) return '请设置包裹金额限制的币种'
  if (!['maxWeightKg', 'maxVolumeCm3', 'maxAmount', 'maxQuantity', 'maxLongestDifferenceCm'].some(key => nonblank(limits[key as keyof typeof limits])) && config.mixing.mode === 'free') return '请至少设置一项包裹限制或混装规则'
  if (!Array.isArray(config.mixing.skus) || !Array.isArray(config.mixing.attributes)) return '混装商品或属性配置格式无效'
  if (['separateSelected', 'togetherSelected'].includes(config.mixing.mode) && (!文本列表(config.mixing.skus) || !config.mixing.skus.length)) return '请填写混装规则涉及的 SKU'
  if (config.mixing.mode === 'separateAttributes' && (!文本列表(config.mixing.attributes) || !config.mixing.attributes.length)) return '请选择需要与普通商品分开的特殊属性'
  return ''
}
export function 格式化拆单动作(config?: 拆单动作配置): string {
  if (!config) return '拆单动作待配置'
  const basis = 拆单依据选项.find(x => x.value === config.basis)?.label || '识别依据待核实'
  const strategy = 拆单方式选项.find(x => x.value === config.strategy)?.label || '拆分方式待核实'
  const quantity = config.strategy === 'selectedQty' ? `（每包最多 ${config.quantityPerPackage} 件）` : ''
  return `${basis} · ${strategy}${quantity}${config.continueMatching ? ' · 继续后续规则' : ''}`
}

/** 精确绑定一组来源行与数量；同 SKU 的不同行仍保留各自身份。 */
export function 拆单包裹签名(items: readonly 人工发货分配[]): string {
  return JSON.stringify(items.map(x => [x.orderNo, x.externalLineId, x.quantity]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}
export function 拆单报价输入指纹(order: 全渠道订单, items: readonly 人工发货分配[], route: 拆单候选路线): string {
  return JSON.stringify({ orderNo: order.systemOrderNo, address: order.address, items: 拆单包裹签名(items), source: order.items.filter(x => items.some(y => y.externalLineId === x.externalLineId)), route })
}
export function 拆单来源指纹(order: 全渠道订单, rules: readonly 拆单规则输入[], data: 拆单计算资料): string {
  return JSON.stringify({ order, rules, sourceVersion: data.sourceVersion, products: data.products.map(({ warehouseMappings: _warehouseMappings, ...product }) => product) })
}
function 合并同行(items: readonly 人工发货分配[]): 人工发货分配[] {
  const result: 人工发货分配[] = []
  for (const item of items) {
    const found = result.find(x => x.orderNo === item.orderNo && x.externalLineId === item.externalLineId)
    if (found) found.quantity += item.quantity
    else result.push({ ...item })
  }
  return result
}
function 单件列表(items: readonly 人工发货分配[]): 人工发货分配[] {
  return items.flatMap(item => Array.from({ length: item.quantity }, () => ({ ...item, quantity: 1 })))
}
function 商品资料(data: 拆单计算资料, item: 人工发货分配): 拆单商品资料 | undefined {
  const rows = data.products.filter(x => x.orderNo === item.orderNo && x.externalLineId === item.externalLineId)
  return rows.length === 1 ? rows[0] : undefined
}
function 商品识别(config: 拆单动作配置, item: 人工发货分配, order: 全渠道订单): string | undefined {
  const line = order.items.find(x => x.externalLineId === item.externalLineId)
  if (config.basis === 'platform') return line?.platformSku?.trim() || undefined
  if (config.basis === 'system') return line?.systemSku?.trim() || undefined
  return undefined
}
interface 包裹指标 { quantity: number; weight?: bigint; volume?: bigint; amount?: bigint; currency?: string; minLongest?: bigint; maxLongest?: bigint }
function 包裹指标(items: readonly 人工发货分配[], order: 全渠道订单, data: 拆单计算资料): 包裹指标 {
  let weight: bigint | undefined = 0n, volume: bigint | undefined = 0n, amount: bigint | undefined = 0n
  let currency: string | undefined, minLongest: bigint | undefined, maxLongest: bigint | undefined
  let sizesKnown = true
  for (const item of items) {
    const product = 商品资料(data, item), line = order.items.find(x => x.externalLineId === item.externalLineId)
    const w = 定点(product?.weightKg), v = 定点(product?.volumeCm3), a = 定点(line?.unitPrice?.value)
    weight = weight === undefined || w === undefined || w <= 0n ? undefined : weight + w * BigInt(item.quantity)
    volume = volume === undefined || v === undefined || v <= 0n ? undefined : volume + v * BigInt(item.quantity)
    const lineCurrency = line?.unitPrice?.currency
    if (a === undefined || !lineCurrency || !/^[A-Z]{3}$/.test(lineCurrency) || (currency && currency !== lineCurrency)) amount = undefined
    else if (amount !== undefined) amount += a * BigInt(item.quantity)
    if (!currency) currency = lineCurrency
    const dimensions = product?.dimensionsCm?.map(定点)
    if (!dimensions || dimensions.length !== 3 || dimensions.some(x => x === undefined || x <= 0n)) sizesKnown = false
    else {
      const longest = (dimensions as bigint[]).reduce((max, x) => x > max ? x : max, 0n)
      if (minLongest === undefined || longest < minLongest) minLongest = longest
      if (maxLongest === undefined || longest > maxLongest) maxLongest = longest
    }
  }
  return { quantity: items.reduce((sum, x) => sum + x.quantity, 0), weight, volume, amount, currency: amount === undefined ? undefined : currency, minLongest: sizesKnown ? minLongest : undefined, maxLongest: sizesKnown ? maxLongest : undefined }
}
function 限制检查(items: readonly 人工发货分配[], config: 拆单动作配置, order: 全渠道订单, data: 拆单计算资料): string {
  const m = 包裹指标(items, order, data), limits = config.limits
  if (limits.maxQuantity !== undefined && m.quantity > limits.maxQuantity) return '件数超过包裹上限'
  for (const [limit, value, label] of [
    [limits.maxWeightKg, m.weight, '重量'], [limits.maxVolumeCm3, m.volume, '商品体积合计'], [limits.maxAmount, m.amount, '商品金额'],
  ] as const) {
    if (!limit) continue
    if (value === undefined) return `${label}资料未完整取得`
    if (label === '商品金额' && m.currency !== limits.currency) return '商品金额币种与限制币种不一致，不能直接比较'
    if (value > 定点(limit)!) return `${label}超过包裹上限`
  }
  if (limits.maxLongestDifferenceCm !== undefined && limits.maxLongestDifferenceCm !== '') {
    if (m.minLongest === undefined || m.maxLongest === undefined) return '产品尺寸资料未完整取得'
    if (m.maxLongest - m.minLongest > 定点(limits.maxLongestDifferenceCm)!) return '商品最长边差额超过限制'
  }
  return ''
}
function 拆分当前包(items: 人工发货分配[], config: 拆单动作配置, order: 全渠道订单, data: 拆单计算资料): { groups: 人工发货分配[][]; error?: string } {
  const identities = new Map<string, string>()
  for (const item of items) {
    const identity = 商品识别(config, item, order)
    if (!identity) return { groups: [], error: `${item.externalLineId}：${拆单依据选项.find(x => x.value === config.basis)?.label || 'SKU'}识别结果缺失或不唯一` }
    identities.set(item.externalLineId, identity)
  }
  const id = (item: 人工发货分配) => identities.get(item.externalLineId)!
  if (config.strategy === 'unit') return { groups: 单件列表(items).map(x => [x]) }
  if (config.strategy === 'sku') {
    const groups = new Map<string, 人工发货分配[]>()
    for (const item of items) { const list = groups.get(id(item)) || []; list.push({ ...item }); groups.set(id(item), list) }
    return { groups: [...groups.values()] }
  }
  if (config.strategy === 'selected' || config.strategy === 'selectedQty') {
    const selected = new Set(config.selectedSkus.map(x => x.trim()))
    const yes = items.filter(x => selected.has(id(x))), rest = items.filter(x => !selected.has(id(x)))
    const groups: 人工发货分配[][] = []
    if (config.strategy === 'selected' && yes.length) groups.push(yes.map(x => ({ ...x })))
    if (config.strategy === 'selectedQty') {
      const bySku = new Map<string, 人工发货分配[]>()
      for (const item of yes) { const list = bySku.get(id(item)) || []; list.push(item); bySku.set(id(item), list) }
      for (const members of bySku.values()) {
        const units = 单件列表(members)
        for (let index = 0; index < units.length; index += config.quantityPerPackage) groups.push(合并同行(units.slice(index, index + config.quantityPerPackage)))
      }
    }
    if (rest.length) groups.push(rest.map(x => ({ ...x })))
    return { groups }
  }
  // 先形成不能混装的分区，再以确定的来源行/件顺序首个可容纳包装。固定拆分不读取这组限制。
  const special = new Set(config.mixing.skus.map(x => x.trim())), attrs = new Set(config.mixing.attributes)
  const units = 单件列表(items), partitions = new Map<string, 人工发货分配[][]>()
  let together: 人工发货分配[] = []
  for (const unit of units) {
    let key = 'all'
    if (config.mixing.mode === 'separateSelected') key = special.has(id(unit)) ? 'selected' : 'ordinary'
    if (config.mixing.mode === 'separateAttributes') {
      const attributes = 商品资料(data, unit)?.attributes
      if (!Array.isArray(attributes)) return { groups: [], error: `${unit.externalLineId}：商品特殊属性未取得，不能判断混装` }
      key = attributes.some(x => attrs.has(x)) ? 'special' : 'ordinary'
    }
    if (config.mixing.mode === 'togetherSelected' && special.has(id(unit))) { together.push(unit); continue }
    const atoms = partitions.get(key) || []; atoms.push([unit]); partitions.set(key, atoms)
  }
  if (together.length) {
    together = 合并同行(together)
    const error = 限制检查(together, config, order, data)
    if (error) return { groups: [], error: `指定商品必须同包，但${error}` }
    const atoms = partitions.get('all') || []
    // 必须同包的整组作为一个原子，后续允许与普通商品合包，但不会拆散该组。
    atoms.unshift(together); partitions.set('all', atoms)
  }
  const output: 人工发货分配[][] = []
  for (const atoms of partitions.values()) {
    const packages: 人工发货分配[][] = []
    for (const atom of atoms) {
      const error = 限制检查(atom, config, order, data)
      if (error) return { groups: [], error: `${atom[0]!.externalLineId}：单件或不可拆分商品组${error}` }
      const target = packages.findIndex(existing => !限制检查([...existing, ...atom], config, order, data))
      if (target < 0) packages.push(合并同行(atom))
      else packages[target] = 合并同行([...packages[target]!, ...atom])
    }
    output.push(...packages)
  }
  return { groups: output }
}

interface 工作包 { key: string; items: 人工发货分配[]; ruleIds: string[]; reasons: string[]; stopped: boolean; config?: 拆单动作配置; togetherGroups: 人工发货分配[][] }
export function 计算拆单<T extends 拆单规则输入>(
  order: 全渠道订单, rules: readonly T[], data: 拆单计算资料,
  match: (rule: T, order: 全渠道订单, items: readonly 人工发货分配[]) => 拆单匹配结果 = () => true,
): 拆单计算结果 {
  const result: 拆单计算结果 = { packages: [], trace: [], errors: [], warnings: [], matchedRuleIds: [], ruleSnapshots: [], sourceFingerprint: 拆单来源指纹(order, rules, data), splitOccurred: false, totalQuantity: 0, routable: false }
  const fail = (message: string) => { result.errors.push(message); return result }
  if (!order.systemOrderNo || !order.items.length) return fail('来源订单或商品明细缺失')
  if (new Set(order.items.map(x => x.externalLineId)).size !== order.items.length || order.items.some(x => !x.externalLineId)) return fail('来源订单行身份缺失或重复')
  if (order.items.some(x => !Number.isSafeInteger(x.orderedQuantity) || x.orderedQuantity <= 0 || !Number.isSafeInteger(x.fulfillableQuantity) || x.fulfillableQuantity! < 0 || x.fulfillableQuantity! > x.orderedQuantity)) return fail('可发数量未核实或超出原购买数量')
  if (order.items.some(x => x.skuResolutionStatus !== '成功' || !x.systemSku?.trim())) return fail('订单 SKU 配对关系尚未完整识别')
  const initial = order.items.filter(x => x.fulfillableQuantity! > 0).map(x => ({ orderNo: order.systemOrderNo, externalLineId: x.externalLineId, quantity: x.fulfillableQuantity! }))
  result.totalQuantity = initial.reduce((sum, x) => sum + x.quantity, 0)
  if (!result.totalQuantity) return fail('当前订单没有已核实的可发数量')
  if (result.totalQuantity > 最大件数) return fail(`当前订单超过 ${最大件数} 件处理上限，请交人工核查`)
  if (initial.some(x => 商品资料(data, x)?.isCombination === true)) return fail('订单包含组合 SKU，本期不执行组合商品拆分')
  if (initial.some(x => 商品资料(data, x)?.isCombination !== false)) return fail('商品类型或来源资料未核实，不能确认本次普通商品拆分范围')
  if (!data.sourceVersion) return fail('商品及映射资料版本缺失，请重新取得资料')
  if (rules.length > 200) return fail('当前拆单规则超过 200 条试算上限，请缩小范围')
  if (rules.some(x => x.enabled && (!Number.isInteger(x.priority) || x.priority < 1))) return fail('启用规则的优先级无效，请先修正规则')
  const sorted = rules.map((rule, index) => ({ rule, index })).sort((a, b) => a.rule.priority - b.rule.priority || a.index - b.index)
  let packages: 工作包[] = [{ key: 'P1', items: initial, ruleIds: [], reasons: [], stopped: false, togetherGroups: [] }]
  let serial = 1
  for (const { rule } of sorted) {
    if (!rule.enabled) { result.trace.push({ ruleId: rule.id, ruleName: rule.name, priority: rule.priority, version: rule.version, packageKey: '—', status: '停用', beforeCount: 0, afterCount: 0, detail: '规则已停用，跳过匹配' }); continue }
    const next: 工作包[] = []
    for (const current of packages) {
      const trace: 拆单轨迹 = { ruleId: rule.id, ruleName: rule.name, priority: rule.priority, version: rule.version, packageKey: current.key, status: '未命中', beforeCount: 1, afterCount: 1, detail: '当前包裹未满足规则条件' }
      if (current.stopped) { trace.status = '未继续匹配'; trace.detail = '前序命中规则已设置停止匹配'; result.trace.push(trace); next.push(current); continue }
      const legacyError = 校验拆单遗留配置(rule)
      if (legacyError) { trace.status = '失败'; trace.detail = legacyError; result.trace.push(trace); return fail(`${rule.name}：${legacyError}`) }
      const matched = match(rule, order, current.items)
      const isMatch = typeof matched === 'boolean' ? matched : matched.matched
      if (!isMatch) {
        if (typeof matched !== 'boolean' && matched.pending) {
          trace.status = '资料待核实'; trace.detail = `条件资料未完整取得：${matched.unknownFields?.join('、') || '待核实'}`
          result.trace.push(trace)
          return fail(`${rule.name}：${trace.detail}，不能排除该规则前不执行后续拆单`)
        }
        result.trace.push(trace); next.push(current); continue
      }
      const configError = 校验拆单动作(rule.splitAction)
      if (configError) { trace.status = '失败'; trace.detail = configError; result.trace.push(trace); return fail(`${rule.name}：${configError}`) }
      const config = rule.splitAction!
      const split = 拆分当前包(current.items, config, order, data)
      if (split.error) { trace.status = '失败'; trace.detail = split.error; result.trace.push(trace); return fail(`${rule.name}：${split.error}`) }
      const containsGroup = (items: 人工发货分配[], group: 人工发货分配[]) => group.every(required => (items.find(x => x.orderNo === required.orderNo && x.externalLineId === required.externalLineId)?.quantity || 0) >= required.quantity)
      const togetherGroups = [...current.togetherGroups]
      if (config.strategy === 'capacity' && config.mixing.mode === 'togetherSelected') {
        const selected = new Set(config.mixing.skus.map(x => x.trim()))
        const group = current.items.filter(item => selected.has(商品识别(config, item, order)!)).map(item => ({ ...item }))
        if (group.length) togetherGroups.push(group)
      }
      if (togetherGroups.some(group => !split.groups.some(items => containsGroup(items, group)))) {
        trace.status = '失败'; trace.detail = '本次拆分会拆散前序规则要求必须同包的商品组'
        result.trace.push(trace); return fail(`${rule.name}：${trace.detail}`)
      }
      if (!result.matchedRuleIds.includes(rule.id)) { result.matchedRuleIds.push(rule.id); result.ruleSnapshots.push(JSON.parse(JSON.stringify(rule)) as T) }
      trace.status = '命中'; trace.afterCount = split.groups.length
      trace.detail = split.groups.length > 1 ? `采用「${拆单方式选项.find(x => x.value === config.strategy)!.label}」，当前包裹分为 ${split.groups.length} 包` : '条件命中；当前范围保持一包'
      result.trace.push(trace)
      const descendants = split.groups.map((items, index) => ({ key: split.groups.length === 1 ? current.key : `P${++serial}`, items, ruleIds: [...current.ruleIds, rule.id], reasons: [...current.reasons, `${rule.name}：${trace.detail}${split.groups.length > 1 ? `（第 ${index + 1} 包）` : ''}`], stopped: !config.continueMatching, config, togetherGroups: togetherGroups.filter(group => containsGroup(items, group)) }))
      trace.outputPackageKeys = descendants.map(pack => pack.key)
      next.push(...descendants)
      if (next.length + packages.length - packages.indexOf(current) - 1 > 最大包数) return fail(`拆分结果超过 ${最大包数} 包处理上限，请调整规则`)
    }
    packages = next
  }
  result.packages = packages.map(pack => {
    const metrics = 包裹指标(pack.items, order, data)
    return { key: pack.key, items: pack.items.map(x => ({ ...x })), ruleIds: pack.ruleIds, reasons: pack.reasons, quantity: metrics.quantity,
      weightKg: metrics.weight === undefined ? undefined : 小数(metrics.weight), volumeCm3: metrics.volume === undefined ? undefined : 小数(metrics.volume),
      amount: metrics.amount === undefined ? undefined : 小数(metrics.amount), currency: metrics.currency, candidates: [] }
  })
  const total = 合并同行(result.packages.flatMap(x => x.items))
  if (total.length !== initial.length || initial.some(x => total.find(y => y.externalLineId === x.externalLineId)?.quantity !== x.quantity)) return fail('拆分结果未完整覆盖来源商品数量，请核查规则')
  result.splitOccurred = result.packages.length > 1
  if (!result.matchedRuleIds.length) { result.warnings.push('未命中启用的拆单规则，保留原发货安排'); return result }
  return result
}
