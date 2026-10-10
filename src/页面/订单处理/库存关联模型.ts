import type { 订单路由 } from '../全渠道订单/类型'
import { 数量文本, type 库存记录, type 数量键 } from '../三方仓库存/库存模型'
import { isValidAge, isValidQuantity, type AgingRecord } from '../三方仓库龄/库龄模型'
import type { 作业行 } from './展示工具'

/** 仅用于本地样例的明确身份对照；生产应由中台传入组织、账号和仓库 ID。 */
export interface 关联仓库范围 {
  id: string
  organization: string
  provider: string
  accountId: string
  account: string
  warehouseId: string
  warehouse: string
  country: string
}
export interface 关联来源身份 {
  organization: string
  provider: string
  accountId: string
  warehouseId: string
  sourceCustomer: string
  warehouseSku: string
  quality: string
  unit: string
}
export interface 关联库存来源 extends 库存记录, 关联来源身份 { batchNo: string }
/** sourceRecordKey 在本地样例中显式给定；不能用来源导出序号或批次号单独代替。 */
export interface 关联库龄来源 extends AgingRecord { sourceRecordKey: string }
export interface 关联快照 extends 关联来源身份 { date: string; complete: boolean }
export interface 关联映射 {
  scopeId: string
  systemSku: string
  warehouseSku: string
  status: '已映射' | '待核实'
}
export interface 关联查询数据 {
  scopes: 关联仓库范围[]
  mappings: 关联映射[]
  inventory: 关联库存来源[]
  aging: 关联库龄来源[]
  snapshots: 关联快照[]
}
export interface 最大库龄结果 {
  text: string
  status: '已取得' | '待核实' | '未取得'
  snapshotDate: string
  reason: string
  records: 关联库龄来源[]
}
export interface 关联展示行 {
  id: string
  lineId: string
  systemSku: string
  warehouseSku: string
  scope?: 关联仓库范围
  mappingText: string
  sourceCustomer: string
  quality: string
  unit: string
  batchNo: string
  availableText: string
  inventory?: 关联库存来源
  routeWarehouse: boolean
  inventoryReason: string
  sourceAt: string
  updatedAt: string
  aging: 最大库龄结果
}

export function 来源身份键(row: 关联来源身份): string {
  return JSON.stringify([row.organization, row.provider, row.accountId, row.warehouseId, row.sourceCustomer, row.warehouseSku, row.quality, row.unit])
}
function 范围匹配(row: Pick<关联来源身份, 'organization' | 'provider' | 'accountId' | 'warehouseId'>, scope: 关联仓库范围): boolean {
  return row.organization === scope.organization && row.provider === scope.provider && row.accountId === scope.accountId && row.warehouseId === scope.warehouseId
}
function 身份完整(row: 关联来源身份): boolean {
  return [row.organization, row.provider, row.accountId, row.warehouseId, row.sourceCustomer, row.warehouseSku, row.quality, row.unit].every(value => !!value.trim()) && ['良品', '不良品'].includes(row.quality)
}
function 有效日期(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
}
const 未取得库龄 = (reason = '尚未取得该来源身份的完整库龄快照'): 最大库龄结果 => ({ text: '未取得', status: '未取得', snapshotDate: '', reason, records: [] })

/** 只对同一来源身份、同一最近完整快照的有效在库正数量批次求 MAX，不计算日期差。 */
export function 取得最大库龄(identity: 关联来源身份, allRows: 关联库龄来源[], allSnapshots: 关联快照[]): 最大库龄结果 {
  if (!身份完整(identity)) return { ...未取得库龄(), text: '待核实', status: '待核实', reason: '来源身份、质量或单位尚未核实' }
  const key = 来源身份键(identity)
  const sourceRows = allRows.filter(row => 来源身份键(row) === key)
  const snapshots = allSnapshots.filter(row => 来源身份键(row) === key)
  if (snapshots.some(row => !有效日期(row.date))) return { ...未取得库龄(), text: '待核实', status: '待核实', reason: '来源快照日期非法' }
  const completeDates = snapshots.filter(row => row.complete).map(row => row.date).sort().reverse()
  const date = completeDates[0]
  if (!date) return sourceRows.length || snapshots.length
    ? { ...未取得库龄(), text: '待核实', status: '待核实', reason: '未取得经确认完整的库龄快照' }
    : 未取得库龄()
  const records = sourceRows.filter(row => row.snapshotDate === date)
  const newerFailed = snapshots.some(row => !row.complete && row.date > date)
  const oldNote = newerFailed ? '；较新采集未完成，保留原完整快照日期' : ''
  const result = { snapshotDate: date, records }
  if (snapshots.some(row => row.date === date && !row.complete)) return { ...result, text: '待核实', status: '待核实', reason: '同日快照完整性结果冲突' }
  if (!records.length) return { ...result, text: '未取得', status: '未取得', reason: `该完整快照没有在库批次记录${oldNote}` }
  const keys = records.map(row => row.sourceRecordKey)
  const invalid = records.some(row => row.summaryBlocked || row.mapping !== '已映射' || row.issues.length || !row.sourceRecordKey.trim() || !isValidQuantity(row.onHandQty) || !isValidAge(row.agingDays))
  if (invalid || new Set(keys).size !== keys.length) return { ...result, text: '待核实', status: '待核实', reason: `批次存在未知或非法数量／库龄、重复来源、映射或完整性问题，不发布部分 MAX${oldNote}` }
  // 十进制文本只判断是否为正数，不累加、不改变来源精度。
  const positive = records.filter(row => /[1-9]/.test(row.onHandQty!))
  if (!positive.length) return { ...result, text: '未取得', status: '未取得', reason: `该快照无有效在库正数量批次，不将最大库龄补为 0${oldNote}` }
  return { ...result, text: `${Math.max(...positive.map(row => row.agingDays!))} 天`, status: '已取得', reason: `同来源在库正数量批次的来源库龄最大值${oldNote}` }
}

export function 取得库存查询范围(row: 作业行, scopes: 关联仓库范围[] = 关联演示数据.scopes) {
  const routes: 订单路由[] = row.fulfillment ? [row.fulfillment.route]
    : row.stage === '待审核' ? row.order.defaultRoute ? [row.order.defaultRoute] : []
      : row.order.fulfillmentOrders.filter(item => item.isActive).map(item => item.route)
  const usesDefault = row.stage === '待审核' || (!row.fulfillment && !routes.length && !!row.order.defaultRoute)
  if (!routes.length && row.stage !== '待审核' && row.order.defaultRoute) routes.push(row.order.defaultRoute)
  const candidates = !routes.length
  const ambiguousRoute = routes.some(route => new Set(scopes.filter(scope => route.warehouseProvider === scope.provider && route.warehouseAccount === scope.account && route.warehouse === scope.warehouse).map(scope => JSON.stringify([scope.organization, scope.provider, scope.accountId]))).size > 1)
  // 路由只确定服务商／账号上下文；浏览库存不能被默认或实际发货仓截断。
  // 先取得完整路由身份，再展开同组织、服务商、账号内的仓库，不按同名账号跨组织匹配。
  const routeScopes = scopes.filter(scope => routes.some(route => route.warehouseProvider === scope.provider && route.warehouseAccount === scope.account && route.warehouse === scope.warehouse))
  const matched = ambiguousRoute ? [] : candidates ? scopes : scopes.filter(scope => routeScopes.some(anchor => anchor.organization === scope.organization && anchor.provider === scope.provider && anchor.accountId === scope.accountId))
  return {
    scopes: matched,
    routeScopeIds: ambiguousRoute ? [] : routeScopes.map(scope => scope.id),
    mode: candidates ? '候选仓库范围（尚未分仓）' : row.fulfillment ? '履约单实际仓库快照' : usesDefault ? '订单首次／默认仓库' : '订单当前有效执行仓库',
    candidates,
    reason: ambiguousRoute ? '仓库账号归属待核实' : !candidates && !matched.length ? '当前路由暂无可核实的仓库资料' : '',
    itemScopeNote: row.fulfillment ? '当前履约摘要没有逐商品分配明细；下方为来源订单商品候选，不能作为本次履约商品及数量证据。' : '',
  }
}

const 缺项 = (id: string, lineId: string, systemSku: string, reason: string, scope?: 关联仓库范围, warehouseSku = ''): 关联展示行 => ({
  id, lineId, systemSku, warehouseSku, scope, mappingText: reason, sourceCustomer: '', quality: '', unit: '', batchNo: '',
  availableText: '未取得', routeWarehouse: false, inventoryReason: reason, sourceAt: '', updatedAt: '', aging: 未取得库龄(),
})

/** 与三方仓库存共用原数展示：缺失为 —，负数保留，疑点不被当作可发库存。 */
export function 关联数量文本(row: 关联展示行, key: 数量键): string {
  return row.inventory ? 数量文本(row.inventory, key) : '—'
}

/** 模拟只读服务返回；可用库存逐来源行展示，没有求和、默认零或审核副作用。 */
export function 查询订单关联库存(row: 作业行, data: 关联查询数据 = 关联演示数据): 关联展示行[] {
  const range = 取得库存查询范围(row, data.scopes)
  return row.order.items.flatMap(item => {
    const sku = item.systemSku?.trim() ?? ''
    if (!sku) return [缺项(item.externalLineId, item.externalLineId, '', '未匹配系统 SKU')]
    if (item.skuResolutionStatus !== '成功') return [缺项(item.externalLineId, item.externalLineId, sku, `系统 SKU 解析${item.skuResolutionStatus}，仓库关联待核实`)]
    if (!range.scopes.length) return [缺项(item.externalLineId, item.externalLineId, sku, range.reason)]
    return range.scopes.flatMap(scope => {
      const accountMappings = data.mappings.filter(mapping => {
        const anchor = data.scopes.find(candidate => candidate.id === mapping.scopeId)
        return mapping.systemSku === sku && anchor?.organization === scope.organization && anchor.provider === scope.provider && anchor.accountId === scope.accountId
      })
      // 中台映射按账号使用，不能要求同一仓库 SKU 每个仓库重复配置。
      const mappings = [...new Map(accountMappings.map(mapping => [JSON.stringify([mapping.warehouseSku, mapping.status]), mapping])).values()]
      if (!mappings.length) return [缺项(`${item.externalLineId}-${scope.id}`, item.externalLineId, sku, '未配置仓库 SKU 映射', scope)]
      return mappings.flatMap(mapping => {
        const prefix = `${item.externalLineId}-${scope.id}-${mapping.warehouseSku}`
        if (mapping.status !== '已映射' || !mapping.warehouseSku.trim()) return [缺项(prefix, item.externalLineId, sku, '仓库 SKU 映射待核实', scope, mapping.warehouseSku)]
        const inventory = data.inventory.filter(source => 范围匹配(source, scope) && source.warehouseSku === mapping.warehouseSku)
        const ageRows = data.aging.filter(source => 范围匹配(source, scope) && source.warehouseSku === mapping.warehouseSku)
        const identities = new Map<string, 关联来源身份>()
        for (const source of [...inventory, ...ageRows]) identities.set(来源身份键(source), source)
        if (!identities.size) return [缺项(prefix, item.externalLineId, sku, '已匹配仓库 SKU；尚未取得库存及库龄来源记录', scope, mapping.warehouseSku)]
        return [...identities.values()].flatMap(identity => {
          const sources = inventory.filter(source => 来源身份键(source) === 来源身份键(identity))
          const age = 取得最大库龄(identity, data.aging, data.snapshots)
          const base = { ...缺项(prefix, item.externalLineId, sku, '已匹配', scope, mapping.warehouseSku), routeWarehouse: range.routeScopeIds.includes(scope.id), sourceCustomer: identity.sourceCustomer, quality: identity.quality, unit: identity.unit, aging: age }
          if (!sources.length) return [{ ...base, id: `${prefix}-${来源身份键(identity)}-no-inventory`, inventoryReason: '该来源身份尚未取得库存记录；库龄数量不代替可用库存' }]
          return sources.map(source => {
            const value = source.quantities.available
            const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0
            const uncertain = !身份完整(source) || source.mapping !== '已映射' || source.presence !== '已确认存在' || source.issues.some(issue => /异常|重复|不完整|未核验|待核验/.test(issue))
            const reason = uncertain ? '来源身份、映射或数量待核实' : value === null ? '来源未提供可用数量' : !valid ? '来源可用数量非法' : source.issues.join('；')
            return { ...base, id: `${prefix}-${source.id}`, inventory: source, batchNo: source.batchNo, availableText: uncertain || (value !== null && !valid) ? '待核实' : value === null ? '未取得' : String(value), inventoryReason: reason, sourceAt: source.sourceAt, updatedAt: source.updatedAt }
          })
        })
      })
    })
  })
}

// 现有库存／库龄页面样例与订单的 SKU、账号、仓库身份不同，不能按名称或首条强行拼接。
// 以下复用其字段结构另建固定关联样例，不改已有样例、不代表真实映射、API 或权限已接入。
const scopes: 关联仓库范围[] = [
  { id: 'order-demo-winit', organization: '订单关联演示组织', provider: '万邑通', accountId: 'order-demo-winit-us', account: '万邑通 · 北美主体', warehouseId: 'order-demo-winit-west', warehouse: '万邑通美西仓', country: '美国' },
  { id: 'order-demo-good', organization: '订单关联演示组织', provider: '谷仓', accountId: 'order-demo-good-us', account: '谷仓 · 北美主体', warehouseId: 'order-demo-good-east', warehouse: '谷仓美东仓', country: '美国' },
  { id: 'order-demo-4px', organization: '订单关联演示组织', provider: '4PX', accountId: 'order-demo-4px-br', account: '4PX · 拉美主体', warehouseId: 'order-demo-4px-sp', warehouse: '4PX 巴西圣保罗仓', country: '巴西' },
  { id: 'order-demo-west', organization: '订单关联演示组织', provider: '西邮', accountId: 'order-demo-west-eu', account: '西邮 · 欧洲主体', warehouseId: 'order-demo-west-pl', warehouse: '西邮波兰仓', country: '波兰' },
  { id: 'order-demo-winit-east', organization: '订单关联演示组织', provider: '万邑通', accountId: 'order-demo-winit-us', account: '万邑通 · 北美主体', warehouseId: 'order-demo-winit-east', warehouse: '万邑通美东仓', country: '美国' },
  { id: 'order-demo-winit-ca', organization: '订单关联演示组织', provider: '万邑通', accountId: 'order-demo-winit-us', account: '万邑通 · 北美主体', warehouseId: 'order-demo-winit-ca', warehouse: '万邑通加拿大仓', country: '加拿大' },
]
const mappings: 关联映射[] = [
  { scopeId: 'order-demo-winit', systemSku: 'YY-CA-1048-US', warehouseSku: 'LINK-DEMO-CA-W1', status: '已映射' },
  { scopeId: 'order-demo-winit', systemSku: 'YY-CA-1048-US', warehouseSku: 'LINK-DEMO-CA-W1', status: '已映射' },
  { scopeId: 'order-demo-good', systemSku: 'YY-CA-1048-US', warehouseSku: 'LINK-DEMO-CA-G1', status: '已映射' },
  { scopeId: 'order-demo-winit', systemSku: 'YY-EM-2207-US', warehouseSku: 'LINK-DEMO-EM-W1', status: '已映射' },
  { scopeId: 'order-demo-good', systemSku: 'YY-WH-7781-US', warehouseSku: 'LINK-DEMO-WH-G1', status: '已映射' },
  { scopeId: 'order-demo-4px', systemSku: 'YY-CV-3308-BR', warehouseSku: 'LINK-DEMO-CV-4P1', status: '已映射' },
  { scopeId: 'order-demo-west', systemSku: 'YY-SA-9055-EU', warehouseSku: 'LINK-DEMO-SA-X1', status: '已映射' },
]
const inventory: 关联库存来源[] = []
const aging: 关联库龄来源[] = []
const snapshots: 关联快照[] = []
const configs = [
  { index: 0, available: 128, ages: [45, 240], quality: '良品' },
  { index: 1, available: 10, ages: [31, 60], quality: '不良品' },
  { index: 2, available: 56, ages: [30, 120], quality: '良品' },
  { index: 4, available: 0, ages: [31, 90], quality: '良品' },
  { index: 5, available: 18, ages: [90, null], quality: '良品' },
  { index: 6, available: null, ages: [], quality: '良品' },
  { index: 0, scopeId: 'order-demo-winit-east', available: 64, ages: [20, 85], quality: '良品' },
  { index: 0, scopeId: 'order-demo-winit-ca', available: 0, ages: [], quality: '良品' },
]
for (const config of configs) {
  const mapping = mappings[config.index]!
  const scope = scopes.find(item => item.id === (config.scopeId ?? mapping.scopeId))!
  const fixtureKey = `${config.index}-${scope.id}`
  const identity: 关联来源身份 = { ...scope, sourceCustomer: 'LINK-DEMO-CUSTOMER', warehouseSku: mapping.warehouseSku, quality: config.quality, unit: '件' }
  // 固定虚构来源值逐项赋值，不能由可用量倒推在库或其他数量。
  const quantities: 库存记录['quantities'] = config.scopeId === 'order-demo-winit-east'
    ? { available: 64, reserved: 8, unavailable: 1, transit: 20, onHand: 80, defective: 1, frozen: 2, putaway: 5 }
    : config.scopeId === 'order-demo-winit-ca'
      ? { available: 0, reserved: 0, unavailable: 0, transit: 12, onHand: 0, defective: 0, frozen: 0, putaway: null }
      : config.index === 0
        ? { available: 128, reserved: 12, unavailable: 2, transit: 60, onHand: 150, defective: 2, frozen: 4, putaway: 6 }
        : { available: config.available, reserved: null, unavailable: null, transit: null, onHand: null, defective: null, frozen: null, putaway: null }
  inventory.push({ ...scope, ...identity, id: `link-inventory-${fixtureKey}`, systemSku: mapping.systemSku, name: '订单关联虚构商品', specification: '', batchNo: 'LINK-DEMO-STOCK-A', quantities, mapping: '已映射', issues: [], updatedAt: '2026-09-23T02:30:00Z', sourceAt: '2026-09-23T02:28:00Z', lastAttempt: '2026-09-23T02:30:00Z', attemptResult: '成功', enabled: true, presence: '已确认存在' })
  if (config.ages.length) {
    snapshots.push({ ...identity, date: '2026-09-23', complete: true })
    config.ages.forEach((days, index) => aging.push({ ...scope, ...identity, id: `link-age-${fixtureKey}-${index}`, sourceRecordKey: `LINK-DEMO-AGE-KEY-${fixtureKey}-${index}`, systemSku: mapping.systemSku, name: '订单关联虚构商品', specification: '', snapshotDate: '2026-09-23', batchNo: `LINK-DEMO-AGE-${index + 1}`, consignmentNo: `LINK-DEMO-CN-${config.index}-${index}`, serialNo: String(index + 1), agingDays: days, onHandQty: index ? '5' : '3', putawayAt: '', expiryDate: '', updatedAt: '2026-09-23T02:30:00Z', sourceAt: '', mapping: '已映射', issues: [], summaryBlocked: false }))
  }
}
export const 关联演示数据: 关联查询数据 = { scopes, mappings, inventory, aging, snapshots }
