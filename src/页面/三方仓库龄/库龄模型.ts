export interface AgingRecord {
  id: string
  organization: string
  provider: string
  accountId: string
  account: string
  warehouseId: string
  warehouse: string
  country: string
  sourceCustomer: string
  systemSku: string
  warehouseSku: string
  name: string
  specification: string
  unit: string
  quality: string
  snapshotDate: string
  batchNo: string
  consignmentNo: string
  /** 来源导出序号仅供技术追溯，不能据此去重或证明业务唯一性。 */
  serialNo: string
  agingDays: number | null
  /** 十进制文本保留来源精度与非法值，避免在查询展示中经由浮点数累加。 */
  onHandQty: string | null
  putawayAt: string
  expiryDate: string
  updatedAt: string
  sourceAt: string
  mapping: '已映射' | '未映射' | '映射冲突'
  issues: string[]
  summaryBlocked: boolean
}

export const agingBands = [
  { key: 'age0to30', label: '0～30 天', min: 0, max: 30 },
  { key: 'age31to60', label: '31～60 天', min: 31, max: 60 },
  { key: 'age61to90', label: '61～90 天', min: 61, max: 90 },
  { key: 'age91to180', label: '91～180 天', min: 91, max: 180 },
  { key: 'age181to365', label: '181～365 天', min: 181, max: 365 },
  { key: 'age366plus', label: '366 天及以上', min: 366, max: Infinity },
] as const

export interface AgingFilters {
  providers: string[]
  accounts: string[]
  warehouses: string[]
  snapshotDate: string
  keywordType: 'systemSku' | 'warehouseSku' | 'name'
  keyword: string
  quality: string
  batchNo: string
  minAge: string
  maxAge: string
  issue: string
}

export type AgingSummary = Pick<AgingRecord,
  'organization' | 'provider' | 'accountId' | 'account' | 'warehouseId' | 'warehouse' | 'country' |
  'sourceCustomer' | 'systemSku' | 'warehouseSku' | 'name' | 'specification' | 'unit' |
  'quality' | 'snapshotDate' | 'updatedAt' | 'sourceAt' | 'mapping'
> & {
  id: string
  recordIds: string[]
  bands: Record<string, string | null>
  unknownQty: string | null
  onHandQty: string | null
  issues: string[]
  summaryBlocked: boolean
}

/** 批次明细的展示主行，仅组织匹配来源行，不产生 SKU 级数量或库龄。 */
export type AgingDetailGroup = Omit<AgingSummary, 'recordIds' | 'bands' | 'unknownQty' | 'onHandQty' | 'summaryBlocked'> & {
  children: AgingRecord[]
  detailCount: number
}

export function defaultFilters(): AgingFilters {
  return { providers: [], accounts: [], warehouses: [], snapshotDate: '', keywordType: 'systemSku', keyword: '', quality: '', batchNo: '', minAge: '', maxAge: '', issue: '' }
}

export function latestSnapshotDate(rows: AgingRecord[]): string {
  return rows.reduce((latest, row) => row.snapshotDate > latest ? row.snapshotDate : latest, '')
}

export function validateAgingFilters(filters: AgingFilters): string {
  if (filters.keywordType !== 'name' && new Set(filters.keyword.split(/\r?\n/).map(word => word.trim()).filter(Boolean)).size > 200) return '批量 SKU 最多 200 个，请减少查询内容。'
  if ([filters.minAge, filters.maxAge].some(value => value.trim() !== '' && (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))))) return '库龄范围请输入非负整数天。'
  if (filters.minAge.trim() !== '' && filters.maxAge.trim() !== '' && Number(filters.minAge) > Number(filters.maxAge)) return '库龄结束天数应大于或等于起始天数。'
  if (filters.snapshotDate && !/^\d{4}-\d{2}-\d{2}$/.test(filters.snapshotDate)) return '请选择有效的快照日期。'
  return ''
}

export function isValidAge(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0
}

export function isValidQuantity(value: string | null): value is string {
  return value !== null && /^\d+(?:\.\d+)?$/.test(value)
}

export function quantityText(value: string | null): string { return value === null ? '—' : value }

/** 仅投影原型已明确的质量分类；外部质量码的生产映射仍待真实适配核验。 */
export function qualityQuantities(row: AgingRecord): { goodQty: string | null; defectiveQty: string | null } {
  return {
    goodQty: row.quality === '良品' ? row.onHandQty : null,
    defectiveQty: row.quality === '不良品' ? row.onHandQty : null,
  }
}

/** 空库龄与非法库龄分开；不由日期或上架时间反推来源库龄。 */
export function agingBandKey(record: AgingRecord): string {
  if (record.agingDays === null) return 'unknown'
  if (!isValidAge(record.agingDays)) return 'invalid'
  const days = record.agingDays
  return agingBands.find(band => days >= band.min && days <= band.max)!.key
}

export function agingIssues(record: AgingRecord): string[] {
  return [...new Set([
    ...record.issues,
    ...(record.agingDays === null ? ['库龄未提供'] : !isValidAge(record.agingDays) ? ['库龄异常'] : []),
    ...(record.onHandQty === null ? ['数量不完整'] : !isValidQuantity(record.onHandQty) ? ['数量异常'] : []),
    ...(!record.unit ? ['单位未提供'] : []),
    ...(record.mapping !== '已映射' ? [record.mapping] : []),
  ])]
}

function compareAgingRecords(a: AgingRecord, b: AgingRecord): number {
  const validA = isValidAge(a.agingDays), validB = isValidAge(b.agingDays)
  if (validA && validB) return b.agingDays! - a.agingDays!
  return Number(validB) - Number(validA)
}

export function filterAgingRecords(rows: AgingRecord[], filters: AgingFilters): AgingRecord[] {
  const words = filters.keyword.split(/\r?\n/).map(word => word.trim()).filter(Boolean)
  const scoped = rows.filter(row =>
    (!filters.providers.length || filters.providers.includes(row.provider)) &&
    (!filters.accounts.length || filters.accounts.includes(row.accountId)) &&
    (!filters.warehouses.length || filters.warehouses.includes(row.warehouseId)) &&
    (!words.length || (filters.keywordType === 'name' ? row.name.includes(filters.keyword.trim()) : words.includes(row[filters.keywordType]))) &&
    (!filters.quality || row.quality === filters.quality) &&
    (!filters.batchNo.trim() || row.batchNo === filters.batchNo.trim()) &&
    (!filters.issue || agingIssues(row).includes(filters.issue)) &&
    (!filters.minAge.trim() || (isValidAge(row.agingDays) && row.agingDays >= Number(filters.minAge))) &&
    (!filters.maxAge.trim() || (isValidAge(row.agingDays) && row.agingDays <= Number(filters.maxAge))),
  )
  const date = filters.snapshotDate || latestSnapshotDate(scoped)
  return scoped.filter(row => row.snapshotDate === date).sort(compareAgingRecords)
}

/** 查询展示的精确十进制求和，不回写库存账。 */
function sumQuantities(values: string[]): string {
  const scale = Math.max(0, ...values.map(value => value.split('.')[1]?.length ?? 0))
  const sum = values.reduce((total, value) => {
    const [integer = '0', fraction = ''] = value.split('.')
    return total + BigInt(integer + fraction.padEnd(scale, '0'))
  }, 0n)
  if (!scale) return String(sum)
  const text = String(sum).padStart(scale + 1, '0')
  return `${text.slice(0, -scale)}.${text.slice(-scale)}`.replace(/\.?0+$/, '')
}

function groupKey(row: AgingRecord): string {
  return JSON.stringify([row.snapshotDate, row.organization, row.provider, row.accountId, row.warehouseId, row.sourceCustomer, row.warehouseSku, row.quality, row.unit])
}

/** 先筛选来源明细，再按身份分组用于展开；分页作用于返回的主行。 */
export function groupAgingDetails(rows: AgingRecord[]): AgingDetailGroup[] {
  const groups = new Map<string, AgingRecord[]>()
  for (const row of rows) {
    const key = groupKey(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()].map(([key, records]) => {
    const first = records[0]!
    const { organization, provider, accountId, account, warehouseId, warehouse, country, sourceCustomer, systemSku, warehouseSku, name, specification, unit, quality, snapshotDate, sourceAt, mapping } = first
    const children = [...records].sort(compareAgingRecords)
    const firstAge = children[0]!.agingDays
    const group: AgingDetailGroup = {
      id: `aging-detail-group-${key}`, organization, provider, accountId, account, warehouseId, warehouse, country,
      sourceCustomer, systemSku, warehouseSku, name, specification, unit, quality, snapshotDate, sourceAt, mapping,
      updatedAt: records.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, ''),
      issues: [...new Set(records.flatMap(agingIssues))], children, detailCount: children.length,
    }
    return { group, maxValidAge: isValidAge(firstAge) ? firstAge : null }
  }).sort((a, b) => {
    if (a.maxValidAge !== null && b.maxValidAge !== null) return b.maxValidAge - a.maxValidAge
    return Number(b.maxValidAge !== null) - Number(a.maxValidAge !== null)
  }).map(({ group }) => group)
}

export function summarizeAgingRecords(rows: AgingRecord[]): AgingSummary[] {
  const groups = new Map<string, AgingRecord[]>()
  for (const row of rows) {
    const key = groupKey(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()].map(([key, records]) => {
    const first = records[0]!
    const { organization, provider, accountId, account, warehouseId, warehouse, country, sourceCustomer, systemSku, warehouseSku, name, specification, unit, quality, snapshotDate, sourceAt, mapping } = first
    const summaryBlocked = records.some(row => row.summaryBlocked || !row.unit || row.mapping === '映射冲突')
    const issues = [...new Set(records.flatMap(agingIssues))]
    if (summaryBlocked && !issues.includes('汇总待核验')) issues.push('汇总待核验')
    const bucketTotal = (bucket: string): string | null => {
      if (summaryBlocked) return null
      const members = records.filter(row => agingBandKey(row) === bucket)
      return members.some(row => !isValidQuantity(row.onHandQty)) ? null : sumQuantities(members.map(row => row.onHandQty!))
    }
    return {
      id: `aging-summary-${key}`, organization, provider, accountId, account, warehouseId, warehouse, country,
      sourceCustomer, systemSku, warehouseSku, name, specification, unit, quality, snapshotDate, sourceAt, mapping,
      recordIds: records.map(row => row.id),
      updatedAt: records.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, ''),
      bands: Object.fromEntries(agingBands.map(band => [band.key, bucketTotal(band.key)])),
      unknownQty: bucketTotal('unknown'),
      onHandQty: summaryBlocked || records.some(row => !isValidQuantity(row.onHandQty) || agingBandKey(row) === 'invalid') ? null : sumQuantities(records.map(row => row.onHandQty!)),
      issues, summaryBlocked,
    }
  })
}

const common: Omit<AgingRecord, 'id'> = {
  organization: '演示组织甲', provider: '4PX', accountId: 'demo-4px-a', account: '演示账号甲',
  warehouseId: 'demo-4px-bh', warehouse: '演示伯明翰仓', country: '英国', sourceCustomer: 'DEMO-CUSTOMER-A',
  systemSku: 'DEMO-BRK-001', warehouseSku: 'WH-DEMO-0001', name: '陶瓷刹车片', specification: '前轮 · 4 片装',
  unit: '件', quality: '良品', snapshotDate: '2026-09-23', batchNo: '000045', consignmentNo: 'DEMO-CN-001', serialNo: '1',
  agingDays: 45, onHandQty: '3', putawayAt: '', expiryDate: '',
  updatedAt: '2026-09-23T02:30:00Z', sourceAt: '', mapping: '已映射', issues: [], summaryBlocked: false,
}
const demo = (id: string, changes: Partial<Omit<AgingRecord, 'id'>> = {}): AgingRecord => ({ ...common, id, ...changes, issues: [...(changes.issues ?? [])] })

/** 所有身份、批次和数量都是固定虚构样例；“件”仅表示原型样例单位已核实的场景。 */
export const agingRecords: AgingRecord[] = [
  demo('aging-45-a'),
  demo('aging-45-b', { onHandQty: '5', consignmentNo: 'DEMO-CN-002', serialNo: '2' }),
  ...[0, 30, 31, 60, 61, 90, 91, 180, 181, 365, 366].map((days, i) => demo(`aging-boundary-${days}`, {
    warehouseSku: 'WH-DEMO-BOUNDARY', systemSku: 'DEMO-FLT-002', name: '发动机空气滤芯', specification: '标准型 · 单件',
    batchNo: `000${String(i + 1).padStart(3, '0')}`, consignmentNo: `DEMO-BOUND-${i + 1}`, agingDays: days, onHandQty: days === 0 ? '0' : '10', serialNo: String(i + 3),
  })),
  demo('aging-missing-age', { warehouseSku: 'WH-DEMO-MISSING', systemSku: 'DEMO-LMP-003', name: 'LED 前照灯', batchNo: '', agingDays: null, onHandQty: '12' }),
  demo('aging-missing-qty', { warehouseSku: 'WH-DEMO-MISSING-QTY', onHandQty: null, agingDays: 20 }),
  demo('aging-invalid-qty', { warehouseSku: 'WH-DEMO-INVALID-QTY', onHandQty: '-2', agingDays: 31 }),
  demo('aging-invalid-qty-text', { warehouseSku: 'WH-DEMO-INVALID-TEXT', onHandQty: '待核验', agingDays: 31 }),
  demo('aging-negative-age', { warehouseSku: 'WH-DEMO-INVALID-AGE', agingDays: -1, onHandQty: '3' }),
  demo('aging-decimal-age', { warehouseSku: 'WH-DEMO-DECIMAL-AGE', agingDays: 30.5, onHandQty: '6' }),
  demo('aging-unknown-unit', { warehouseSku: 'WH-DEMO-NO-UNIT', unit: '', onHandQty: '18' }),
  demo('aging-unmapped', { warehouseSku: '00000901', systemSku: '', name: '', specification: '', mapping: '未映射', onHandQty: '7' }),
  demo('aging-duplicate-a', { warehouseSku: 'WH-DEMO-DUPLICATE', onHandQty: '9', issues: ['重复来源待核验'], summaryBlocked: true }),
  demo('aging-duplicate-b', { warehouseSku: 'WH-DEMO-DUPLICATE', onHandQty: '9', serialNo: '99', issues: ['重复来源待核验'], summaryBlocked: true }),
  demo('aging-other-account', { accountId: 'demo-4px-b', account: '演示账号乙', sourceCustomer: 'DEMO-CUSTOMER-B', onHandQty: '6' }),
  demo('aging-other-customer', { sourceCustomer: 'DEMO-CUSTOMER-A2', onHandQty: '4' }),
  demo('aging-other-quality', { quality: '不良品', onHandQty: '2' }),
  demo('aging-other-warehouse', { warehouseId: 'demo-4px-la', warehouse: '演示洛杉矶仓', country: '美国', onHandQty: '8' }),
  demo('aging-other-unit', { unit: '箱', onHandQty: '2' }),
  demo('aging-decimal-qty-a', { warehouseSku: 'WH-DEMO-DECIMAL-QTY', onHandQty: '0.1' }),
  demo('aging-decimal-qty-b', { warehouseSku: 'WH-DEMO-DECIMAL-QTY', onHandQty: '0.2', consignmentNo: 'DEMO-DECIMAL-002' }),
  ...Array.from({ length: 44 }, (_, i) => demo(`aging-list-${i + 1}`, {
    warehouseSku: `WH-DEMO-${String(i + 100).padStart(4, '0')}`,
    systemSku: ['DEMO-MIR-004', 'DEMO-SPK-005', 'DEMO-WPR-006'][i % 3]!,
    name: ['外后视镜总成', '点火线圈', '无骨雨刷'][i % 3]!,
    specification: ['右侧 · 黑色', '12V · 单件', '24 英寸 · 2 支装'][i % 3]!,
    batchNo: `DEMO-B${String(i + 100).padStart(4, '0')}`, consignmentNo: `DEMO-LIST-${i + 1}`,
    agingDays: [15, 28, 45, 75, 126, 240, 410][i % 7]!, onHandQty: ['20', '36', '80', '12', '28'][i % 5]!,
    serialNo: String(i + 100),
  })),
  demo('aging-history-22-a', { snapshotDate: '2026-09-22', updatedAt: '2026-09-22T02:30:00Z', agingDays: 44, onHandQty: '4' }),
  demo('aging-history-22-b', { snapshotDate: '2026-09-22', updatedAt: '2026-09-22T02:30:00Z', agingDays: 44, onHandQty: '5', consignmentNo: 'DEMO-CN-002' }),
  demo('aging-history-21', { snapshotDate: '2026-09-21', updatedAt: '2026-09-21T02:30:00Z', agingDays: 43, onHandQty: '10' }),
  // 账号丙 9 月 22 日漏采，23 日重试取得的新数据只保留在 23 日。
  demo('aging-retry-21', { accountId: 'demo-4px-c', account: '演示账号丙', sourceCustomer: 'DEMO-CUSTOMER-C', snapshotDate: '2026-09-21', updatedAt: '2026-09-21T02:30:00Z', agingDays: 120, onHandQty: '18' }),
  demo('aging-retry-23', { accountId: 'demo-4px-c', account: '演示账号丙', sourceCustomer: 'DEMO-CUSTOMER-C', agingDays: 122, onHandQty: '16' }),
  // 账号丁当天查询失败；旧完整结果保留原日期与原始库龄。
  demo('aging-failed-23', { accountId: 'demo-4px-d', account: '演示账号丁', sourceCustomer: 'DEMO-CUSTOMER-D', snapshotDate: '2026-09-22', updatedAt: '2026-09-22T02:30:00Z', agingDays: 88, onHandQty: '24', issues: ['最近采集失败'] }),
]

export const snapshotFailures = [
  { provider: '4PX', accountId: 'demo-4px-c', account: '演示账号丙', warehouseId: 'demo-4px-bh', warehouse: '演示伯明翰仓', snapshotDate: '2026-09-22', attemptAt: '2026-09-22T02:30:00Z', message: '当日未取得完整结果，无可用快照；次日重试已保存为 2026-09-23。' },
  { provider: '4PX', accountId: 'demo-4px-d', account: '演示账号丁', warehouseId: 'demo-4px-bh', warehouse: '演示伯明翰仓', snapshotDate: '2026-09-23', attemptAt: '2026-09-23T02:30:00Z', message: '当日采集失败，无可用快照；最后成功日期为 2026-09-22。' },
]
