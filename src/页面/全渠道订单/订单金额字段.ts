// 释义来源：PRD/订单单据字段标准.md，第 6.4 节 oms_order_amount。
export const 订单金额字段 = [
  { key: 'orderAmount', label: '订单总金额', description: '该订单在店铺后台显示的订单总额。运费、税费等是否计入总额，以订单所属平台的规则为准；不能将本页各项金额直接相加作为订单总额。' },
  { key: 'buyerPaidShipping', label: '客付运费', description: '买家为本订单支付的运费，与店铺后台显示的客付运费一致。' },
  { key: 'buyerPaidTax', label: '客付税费', description: '买家结账时为本订单支付的税费，如销售税、增值税（VAT）或商品及服务税（GST）。是否已包含在订单总额中，以订单所属平台的规则为准。' },
  { key: 'transactionFee', label: '交易费', description: '本订单因平台交易产生的费用，如佣金或支付处理费。具体包含哪些费用，以订单所属平台提供的交易费用信息为准。' },
  { key: 'platformSubsidy', label: '平台补贴', description: '由平台为本订单承担的补贴金额。' },
  { key: 'otherFee', label: '其他费用', description: '平台为本订单列明的其他费用合计，不包含已单独列示的客付运费、客付税费、交易费和平台补贴。' },
] as const
