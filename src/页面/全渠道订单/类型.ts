import type { 门牌解析结果, 收件信息动作配置 } from '../订单规则/收件信息规则模型'

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
  /** 来源独立返回或录入的门牌号。请求前规则解析值单独保存在 recipientRequestRecords。 */
  houseNumber?: string
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
  /** 发货安排首次由拆单规则生成的来源快照；后续人工编辑仍保留追溯。 */
  createdByRule?: {
    executionId: string
    rules: { id: string; name: string; version: number; configurationSnapshot?: string }[]
    appliedAt: string
    sourceVersion: number
    /** 当次来源、命中轨迹及包裹选择的完整只读快照。 */
    inputSnapshot?: string
    resultSnapshot?: string
  }
}

/** 拆单规则阶段的商品组成；未分仓前不得当作可审核的人工发货方案。 */
export interface 规则拆单候选 {
  id: string
  packages: { key: string; items: 人工发货分配[] }[]
  reason: string
  createdAt: string
  sourceVersion: number
  sourceSnapshot: string
  createdByRule: NonNullable<人工发货方案['createdByRule']>
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

/** 订单创建/明确分配时取得的 SKU 运营人员快照；查看及主数据变化均不重算存量责任。 */
export interface 订单处理人分配 {
  handlerIds: string[]
  assignedAt: string
  source: 'SKU'
  lines: {
    externalLineId: string
    systemSku?: string
    operatorIds: string[]
    issue?: '系统 SKU 未识别' | '系统 SKU 无运营人员'
  }[]
}

export type 收件信息请求触发点 = 'freight_quote' | 'logistics_order' | 'warehouse_push'
export interface 收件信息请求输入快照 {
  orderNo: string
  platformCode: string
  storeId: string
  fulfillmentMode: 全渠道订单['fulfillmentMode']
  originalAddress: 脱敏收件信息
  shippingChannelId: string
  shippingWarehouseKey: string
  shippingChannelKey: string
}
/** 本次请求的收件处理快照；旧创建事件仅保留历史，不作为请求输入。 */
export type 订单收件处理记录 = Omit<门牌解析结果, 'status'> & {
  trigger: 'order_created' | 收件信息请求触发点
  requestId?: string
  requestInput?: 收件信息请求输入快照
  routeSnapshot?: 订单路由
  processedAt: string
  ruleId?: string
  ruleName?: string
  ruleVersion?: number
  actionSnapshot?: 收件信息动作配置
  /** 本次匹配使用的来源上下文，独立于可变订单与请求资料。 */
  conditionInput: {
    platformCode: string
    storeId: string
    countryCode: string
    stateProvince: string
    city: string
    addressLine1: string
    addressLine2: string
    /** 仅优先级评估路径涉及路由条件时记录依据；旧记录缺省为不敏感。 */
    routeSensitive?: boolean
    shippingChannelId?: string
    shippingWarehouseKey?: string
    shippingChannelKey?: string
  }
  status: 门牌解析结果['status'] | 'not_matched' | 'not_applicable'
}
export type 收件信息请求处理记录 = 订单收件处理记录 & { trigger: 收件信息请求触发点; requestId: string; requestInput: 收件信息请求输入快照 }

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
  handlerAssignment?: 订单处理人分配
  initialReviewPending?: true
  /** 本地编排契约：前置处理明确完成后到达合单节点；不能由待审核状态推断。 */
  mergeNodeArrival?: {
    arrivedAt: number
    skuResolution: '已完成'
    giftProcessing: '已完成' | '不适用'
    splitProcessing: '未拆单'
  }
  reviewExceptionCode?: 'NO_REVIEW_RULE_MATCH'
  /** 审单自动重跑按订单累计；状态切换及人工执行均不重置。当前仅本地会话。 */
  reviewRetry?: {
    firstCompletedAt: string
    dailyDate: string
    dailyCount: number
    totalCount: number
  }
  admissionReason?: string
  blockReason?: string
  noShipmentReason?: string
  defaultRoute?: 订单路由
  manualShippingPlan?: 人工发货方案
  ruleSplitDraft?: 规则拆单候选
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
  recipientProcessing?: 订单收件处理记录
  /** 对外请求前处理记录；与旧订单创建记录分开保留。 */
  recipientRequestRecords?: 收件信息请求处理记录[]
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
