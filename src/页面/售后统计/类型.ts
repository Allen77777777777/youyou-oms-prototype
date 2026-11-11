/** 售后统计独立评审契约；不订阅旧售后工作台，不代表生产接入完成。 */
export const origins = ['平台售后', '内部售后'] as const
export const scenarios = ['取消申请', '退货退款申请', '未收到货', 'eBay介入案件', '支付争议', '中差评跟进', '内部重发', '主动退货退款'] as const
export const methods = ['全额退款', '部分退款', '退货退款', '仅退货', '重发', '沟通处理', '取消订单'] as const
export const costKinds = ['卖家退款承担', '重发商品成本', '重发运费', '退回运费', '仓库处理费', '平台争议费', '其他费用', '费用回收'] as const
export type Origin = typeof origins[number]
export type Scenario = typeof scenarios[number]
export type Method = typeof methods[number]
export type CostKind = typeof costKinds[number]
export interface Money { value: string; currency: string }
export interface CostEvidence extends Money {
  /** 来源系统＋账号＋凭证行的稳定身份；同凭证多次取得不重复计量。 */
  evidenceId: string; kind: CostKind; status: 'confirmed' | 'pending'; at: string
  source: string; note?: string
  /** 有独立核实的逐行金额才填写。缺少分摊依据时仅在单据／币种层计算。 */
  allocations?: { orderLineId: string; value: string; currency?: string }[]
}
export interface AfterSaleItem { orderLineId?: string; sku?: string; title: string; quantity: number; problem: string; linkage: 'verified' | 'unknown' }
export interface HandlingAction { id: string; at: string; actorId?: string; label: string; outcome: 'success' | 'pending' | 'failed' | 'unknown'; source: 'human' | 'system' }
/** 独立业务执行依据；登记方式、人工办理动作和内部完成状态都不生成本证据。 */
export interface ExecutionEvidence {
  id: string; kind: 'refund' | 'return' | 'reship'; outcome: 'success' | 'pending' | 'failed' | 'unknown'
  at: string; source: string; reference: string
}
export interface AfterSaleRecord {
  internalId: string; no: string; shopId: string; origin: Origin; scenario: Scenario; method: Method
  sourceId?: string; sourceType?: string; rootSourceId?: string
  orderId?: string; orderNo?: string; customerId?: string; customerName?: string
  createdAt: string; updatedAt: string; status: '待处理' | '处理中' | '已完成' | '待核实'
  ownerId?: string; dueAt?: string; items: AfterSaleItem[]; costs: CostEvidence[]; actions: HandlingAction[]
  /** 无费用信息并不等于零；complete 仍须有明确凭证（允许金额为0的凭证）。 */
  costCoverage: 'complete' | 'partial' | 'unknown'
  response?: { evidenceId: string; startedAt: string; respondedAt: string; actorId: string; human: boolean }
  handling?: { evidenceId: string; startedAt: string; endedAt: string; closedBy?: string }
  results?: ExecutionEvidence[]
  note?: string
}
export interface OrderLine {
  id: string; shopId: string; orderId: string; orderNo: string; customerId?: string; sku?: string
  title: string; quantity: number; createdAt: string; valid: boolean
}
export interface Coverage { shopId: string; ordersComplete: boolean; afterSalesComplete: boolean; from: string; through: string; note?: string }
export interface DataSet {
  asOf: string; records: AfterSaleRecord[]; orderLines: OrderLine[]
  shops: { id: string; name: string; site: string }[]; staff: { id: string; name: string }[]; coverage: Coverage[]
}
export interface StatisticsFilter {
  startDate: string; endDate: string; shopIds: string[]; origins: Origin[]; scenarios: Scenario[]; methods: Method[]; sku: string
  /** SKU分母使用独立订单创建批次，不受售后建单日期截流。 */
  cohortStartDate: string; cohortEndDate: string
}
export interface MoneyTotal {
  currency: string; value: string; evidenceCount: number
  /** 各笔唯一凭证或核实分摊项的原币份额，供展示换算逐笔舍入后汇总；不改原币金额。 */
  components?: Money[]
}
export interface Summary {
  recordCount: number; orderCount: number; customerCount: number; completedCount: number; pendingCount: number; overdueCount: number
  unlinkedSkuCount: number; unknownCostCount: number
  unknownCostRecordIds: string[]
  confirmedCosts: MoneyTotal[]; pendingCosts: MoneyTotal[]; recoveries: MoneyTotal[]; netCosts: MoneyTotal[]
  averageHandlingHours: number | null; handlingSamples: number; firstResponseHours: number | null; responseSamples: number
}
export interface GroupRow {
  key: string; name: string; count: number; orderCount: number; customerCount: number; completedCount: number; pendingCount: number
  recordIds: string[]
}
export interface TrendPoint { date: string; count: number; platformCount: number; internalCount: number }
export interface SkuRow {
  key: string; sku: string; title: string; recordCount: number; orderCount: number
  soldLineCount: number; affectedLineCount: number; observingLineCount: number; rate: number | null; rateNote: string
  linkageCoverage: number | null; confirmedCosts: MoneyTotal[]; unallocatedCount: number; recordIds: string[]
  /** 由orderLineKey生成的店铺＋商品行稳定复合键，仅通过detailOrderLines回读。 */
  denominatorLineIds: string[]; affectedLineIds: string[]; observingLineIds: string[]
}
export interface CostRow {
  key: string; kind: CostKind; currency: string; confirmed: string | null; pending: string | null
  confirmedCount: number; pendingCount: number; unallocatedCount: number; recordIds: string[]
}
export interface HandlingRow {
  key: string; name: string; shopId?: string; recordCount: number; orderCount: number; completedCount: number
  actionCount: number; currentPending: number; overdueCount: number
  averageHandlingHours: number | null; handlingSamples: number; firstResponseHours: number | null; responseSamples: number
  recordIds: string[]; pendingRecordIds: string[]
}
export interface ProblemRow extends GroupRow { share: number; skuCount: number; confirmedCosts: MoneyTotal[] }
export interface StatisticsResult {
  records: AfterSaleRecord[]; summary: Summary; trend: TrendPoint[]
  originRows: GroupRow[]; scenarioRows: GroupRow[]; methodRows: GroupRow[]; shopRows: GroupRow[]
  skuRows: SkuRow[]; costRows: CostRow[]; customerRows: HandlingRow[]; staffRows: HandlingRow[]; problemRows: ProblemRow[]
  issues: string[]; asOf: string; error: string | null
}
