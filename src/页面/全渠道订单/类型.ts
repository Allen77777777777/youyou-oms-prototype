export type 平台代码 =
  | 'eBay'
  | 'Temu'
  | 'Mercado Libre'
  | 'Coupang'
  | 'OZON'
  | 'TikTok Shop'
  | 'Rakuten'
  /** 仅为本地原型的人工来源值，不属于平台接入字典。 */
  | '手工'

export type 履约模式 = '自配送' | '平台履约'
export type 订单处理状态 = '待审核' | '待推单' | '待发货' | '已发货' | '异常' | '不发货'
export type 同步状态 = '已同步' | '同步中' | '同步失败' | '待同步'
export type SKU解析状态 = '待解析' | '成功' | '缺失' | '冲突' | '失效' | '查询失败'
export type 订单日期类型 = 'orderedAt' | 'shipByAt' | 'lastSyncedAt'
export type 快速视图 = '全部' | 履约模式

export interface 金额 {
  value: string
  currency: string
}

export interface 订单金额 {
  orderAmount: 金额
  buyerPaidShipping?: 金额
  buyerPaidTax?: 金额
  transactionFee?: 金额
  platformSubsidy?: 金额
  otherFee?: 金额
}

export interface 订单商品行 {
  /** 对应已定义的 item_image_url，未取得可信来源时不填写。 */
  itemImageUrl?: string
  externalLineId: string
  platformItemId?: string
  platformSku?: string
  platformVariant?: string
  platformItemTitle?: string
  orderedQuantity: number
  systemSku?: string
  systemItemName?: string
  skuResolutionStatus: SKU解析状态
  fulfillableQuantity?: number
  currencyCode: string
  unitPrice: 金额
  itemTotal: 金额
  actualReceived?: 金额
  actualReceivedSource?: 'PLATFORM' | 'OMS_ALLOCATED'
}

export interface 脱敏收件信息 {
  fullName: string
  companyName?: string
  mobilePhone?: string
  telephone?: string
  email?: string
  countryCode: string
  stateProvince?: string
  city?: string
  district?: string
  addressLine1: string
  addressLine2?: string
  postalCode?: string
  buyerMessage?: string
}

export interface 订单路由 {
  warehouse: string
  warehouseProvider: string
  warehouseAccount: string
  shippingChannel: string
  shippingChannelCode: string
  shippingChannelId?: string
  labelMode: '仓配一体' | '仓配分离'
}

/** 本地人工拆合发货方案；不修改来源订单商品、数量、金额或平台事实。 */
export interface 人工发货分配 {
  orderNo: string
  externalLineId: string
  quantity: number
}

export interface 人工发货包裹 {
  key: string
  route: 订单路由
  items: 人工发货分配[]
}

export interface 人工发货方案 {
  id: string
  kind: '拆分发货' | '合并发货'
  orderNos: string[]
  packages: 人工发货包裹[]
  reason: string
  updatedAt: string
}

export interface 履约单摘要 {
  /** 本地自动化隔离：异常恢复的路径交人工推单，重新审核新建履约后不继承。 */
  autoPushHold?: boolean
  fulfillmentOrderNo: string
  status: '待执行' | '执行中' | '已发货' | '已终止'
  isActive: boolean
  route: 订单路由
  plannedQuantity: number
  shippedQuantity: number
  trackingNumber?: string
  shippedAt?: string
  /** 整个包裹的来源行快照；共享履约的各来源摘要保存同一份组成。 */
  items?: 人工发货分配[]
  manualPlanId?: string
}

export interface 审核记录 {
  round: number
  type: '自动审核' | '人工审核' | '平台变更复核'
  triggerSource: string
  status: '待审核' | '审核中' | '已通过' | '已拦截' | '已拒绝'
  /** 本地轮次结果分类，检查与命中说明仍只记录在 decisionNote。 */
  ruleOutcome?: '人工截留' | '审核通过' | '未匹配转异常' | '发货条件拦截'
  decisionNote?: string
  completedAt?: string
}

export interface 操作记录 {
  operatedAt: string
  operationType: string
  operationResult: '受理' | '成功' | '失败' | '处理中'
  operator: string
  content: string
}

export interface 同步信息 {
  status?: 同步状态
  lastSuccess?: string
  latestAttempt: string
  externalVersion?: string
  normalizationStatus?: '已接收' | '标准化中' | '已标准化' | '已拦截'
  message: string
}

export interface 专业订单引用 {
  routeName: 'oms-ebay-order-detail'
  sellerId: string
  orderId: string
}

export interface 全渠道订单 {
  systemOrderNo: string
  platformCode: 平台代码
  storeId: string
  storeName: string
  platformOrderId?: string
  platformOrderNo: string
  platformOrderType?: string
  platformOrderStatus?: string
  orderType: string
  manualOrder?: {
    scenario: '线下销售' | '寄样赠送' | '售后补寄' | '其他'
    originalOrderNo?: string
    reason: string
    paidConfirmed: boolean
    requestId: string
    /** 由已审核的商家重发决定创建；普通手工订单不设置。 */
    afterSaleNo?: string
  }
  fulfillmentMode: 履约模式
  processingStatus?: 订单处理状态
  initialReviewPending?: true
  reviewExceptionCode?: 'NO_REVIEW_RULE_MATCH'
  admissionReason?: string
  blockReason?: string
  noShipmentReason?: string
  defaultRoute?: 订单路由
  manualShippingPlan?: 人工发货方案
  cancelledAt?: string
  cancelledReason?: string
  orderedAt: string
  paidAt?: string
  shipByAt?: string
  shipByLabel: string
  urgency: '临期' | '今日' | '正常' | '无时限'
  platformUpdatedAt?: string
  createdAt: string
  lastSyncedAt: string
  fulfillmentCompletedAt?: string
  tags: string[]
  buyerExternalId?: string
  address: 脱敏收件信息
  amount: 订单金额
  items: 订单商品行[]
  fulfillmentOrders: 履约单摘要[]
  reviews: 审核记录[]
  sync: 同步信息
  operationLogs: 操作记录[]
  professionalOrder?: 专业订单引用
}

export interface 全渠道订单筛选条件 {
  keyword: string
  searchType?: string
  searchMatch?: 'contains' | 'exact'
  platform: string | string[]
  store: string | string[]
  processingStatus: string | string[]
  dateType: 订单日期类型
  dateRange: string[] | null
  platformStatus: string | string[]
  syncStatus: string | string[]
  skuStatus: string | string[]
  countryCode: string | string[]
}

/** 当前未匹配异常的稳定分类。其他发货阻断仍单独校验。 */
export function 是未匹配审单异常(订单: 全渠道订单): boolean {
  return 订单.fulfillmentMode === '自配送' && 订单.processingStatus === '异常' && 订单.reviewExceptionCode === 'NO_REVIEW_RULE_MATCH'
}
