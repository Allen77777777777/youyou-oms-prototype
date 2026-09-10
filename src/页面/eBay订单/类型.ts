export type eBay履约状态 = 'NOT_STARTED' | 'IN_PROGRESS' | 'FULFILLED' | string
export type eBay付款状态 = 'FAILED' | 'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'FULLY_REFUNDED' | string
export type eBay取消状态 = 'NONE_REQUESTED' | 'IN_PROGRESS' | 'CANCELED' | string
export type 同步状态 = '已同步' | '同步中' | '同步失败' | '待同步'
export type eBay订单日期类型 = 'creationDate' | 'shipBy'

export interface 金额 {
  value: string
  currency: string
}

export interface eBay订单商品 {
  lineItemId: string
  title: string
  platformSku: string
  systemSku?: string
  itemId: string
  variationId?: string
  quantity: number
  fulfillmentStatus: eBay履约状态
  purchaseMarketplaceId: string
  listingMarketplaceId: string
  soldFormat: string
  soldViaAdCampaign: boolean
  variations: string[]
  compatibility: string[]
  lineCost: 金额
  discountedLineCost: 金额
  deliveryCost: 金额
  tax: 金额
  total: 金额
}

export interface 脱敏收件信息 {
  fullName: string
  companyName?: string
  phone: string
  email: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  countryCode: string
}

export interface eBay履约指令 {
  id: string
  type: 'SHIP_TO' | 'DIGITAL' | 'PREPARE_FOR_PICKUP' | 'SELLER_DEFINED' | 'FULFILLED_BY_EBAY'
  ebaySupportedFulfillment: boolean
  program?: string
  shipBy?: string
  minEstimatedDelivery?: string
  maxEstimatedDelivery?: string
  destinationTimeZone?: string
  shippingServiceCode?: string
  shippingCarrierCode?: string
  shipToReferenceId?: string
  pickupLocationKey?: string
  shipTo?: 脱敏收件信息
}

export interface eBay付款明细 {
  id: string
  status: string
  amount: 金额
  date?: string
  method: string
  referenceId: string
}

export interface eBay退款明细 {
  id: string
  status?: string
  amount: 金额
  date: string
  referenceId: string
  lineItemId?: string
}

export interface eBay平台履约记录 {
  fulfillmentId: string
  carrierCode: string
  trackingNumber: string
  shippedDate: string
  lines: Array<{ lineItemId: string; quantity: number }>
}

export interface OMS关联上下文 {
  systemOrderNo?: string
  processingStatus?: '待审核' | '待推单' | '待发货' | '已发货' | '异常' | '不发货'
  fulfillmentMode: '自配送' | '平台履约'
  warehouse?: string
  warehouseProvider?: string
  warehouseAccount?: string
  shippingChannel?: string
  labelMode?: '仓配一体' | '仓配分离'
  fulfillmentNo?: string
  confirmationNo?: string
  noShipmentReason?: string
}

export interface eBay同步信息 {
  status: 同步状态
  lastSuccess?: string
  latestAttempt: string
  version: string
  message: string
}

export interface eBay订单 {
  orderId: string
  salesRecordReference?: string
  store: string
  sellerId: string
  buyerUsername: string
  buyerCheckoutNotes?: string
  creationDate: string
  lastModifiedDate: string
  shipBy?: string
  shipByLabel: string
  urgency: '临期' | '今日' | '正常' | '无时限'
  purchaseMarketplaces: string[]
  listingMarketplaces: string[]
  fulfillmentStatus: eBay履约状态
  paymentStatus: eBay付款状态
  cancelStatus: eBay取消状态
  cancelledDate?: string
  pricing: {
    subtotal: 金额
    discount: 金额
    delivery: 金额
    deliveryDiscount: 金额
    tax: 金额
    fee: 金额
    adjustment: 金额
    total: 金额
  }
  items: eBay订单商品[]
  instructions: eBay履约指令[]
  payments: eBay付款明细[]
  refunds: eBay退款明细[]
  fulfillments: eBay平台履约记录[]
  oms: OMS关联上下文
  sync: eBay同步信息
  cancelRequestState?: string
  cancelReason?: string
}

export interface eBay订单筛选条件 {
  keyword: string
  store: string
  marketplace: string
  fulfillmentStatus: string
  dateType: eBay订单日期类型
  dateRange: [] | [string, string] | null
  paymentStatus: string
  cancelStatus: string
  omsStatus: string
  syncStatus: string
}
