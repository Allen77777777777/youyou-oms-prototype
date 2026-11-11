import type { ContextDataset, ContextRecord, Conversation, MailMessage, RelatedOrder } from './类型'
import { snapshotConversationSkus } from './会话处理人'

// 本文件全部为虚构评审样例，不包含真实买家、店铺或平台记录。
const time = (value: string) => `2026-10-${value}+08:00`
const ready = (records: ContextRecord[] = []): ContextDataset => ({ state: 'ready', records, updatedAt: time('27T11:58:00') })
const record = (id: string, title: string, status: string, description: string, at = time('27T09:30:00')): ContextRecord => ({ id, title, status, description, at })
// 仅为明确的虚构账户映射。生产 buyerKey 应由已核验平台身份生成，不按页面 buyerId 拼接。
const demoBuyerKey = (buyerId: string) => `prototype:verified-ebay-account:${buyerId}`
const demoShopName = (shopId: string) => shopId === 'shop-uk' ? '演示店铺-UK' : '演示店铺-US'

export function createRelatedOrders(): RelatedOrder[] {
  const make = (id: string, buyerId: string, shopId = 'shop-us'): RelatedOrder => ({
    id, shopId, shopName: demoShopName(shopId), buyerId, buyerKey: demoBuyerKey(buyerId), orderNo: `DEMO-10${id.slice(-2)}`, omsStatus: '已发货', amount: '39.99', currency: shopId === 'shop-uk' ? 'GBP' : 'USD',
    product: { title: '刹车片套装', sku: 'DEMO-BP-01', quantity: 1 },
    platformProduct: { title: 'Demo Brake Pad Kit', sku: 'EBAY-DEMO-BP-01' },
    logistics: ready([{ ...record(`PKG-${id}`, '包裹 1 · UPS', '已签收', `运单号 DEMO-TRACK-${id.slice(-2)}`, time('25T15:40:00')), trackingNumber: `DEMO-TRACK-${id.slice(-2)}` }]),
    afterSales: ready(), disputes: ready(), reviews: ready(),
    activity: [record(`ACT-${id}-1`, '仓库已发货', '已同步', '物流信息已更新；对应当前订单商品。', time('23T11:20:00'))],
  })
  const first = make('order-01', 'buyer_demo_01')
  first.afterSales = ready([{
    ...record('RET-DEMO-01', '退货申请', '待卖家处理', '买家反馈商品适配不符合预期，申请退货。'),
    details: [{ label: '申请编号', value: 'RET-DEMO-01' }, { label: '关联商品', value: 'DEMO-BP-01 × 1' }, { label: '申请原因', value: '商品适配问题' }],
  }])
  first.reviews = ready([record('REV-DEMO-01', '订单商品评价', '中评', '商品适配不符合预期。', time('26T18:10:00'))])
  first.activity.push(record('ACT-order-01-2', '收到商品评价', '中评', '评价关联当前订单商品。', time('26T18:10:00')), record('ACT-order-01-3', '退货申请已同步', '待卖家处理', '申请与当前订单及商品已确认关联。'))
  const second = make('order-02', 'buyer_demo_02')
  second.product = { title: '车门把手', sku: 'DEMO-DH-02', quantity: 2 }
  second.platformProduct = { title: 'Demo Exterior Door Handle', sku: 'EBAY-DEMO-DH-02' }
  second.items = [{ id: 'DEMO-ORDER-02-L1', title: '车门把手', systemSku: 'DEMO-DH-02', platformSku: 'EBAY-DEMO-DH-02', specification: '黑色 · 标准款', quantity: 2 }]
  second.logistics = ready([
    { ...record('PKG-order-02-1', '包裹 1 · UPS', '运输中', 'DEMO-TRACK-02A · 车门把手 × 1'), trackingNumber: 'DEMO-TRACK-02A', carrier: 'UPS', latestEvent: '已到达目的地分拨中心', latestEventAt: time('27T09:30:00'), packageItems: [{ orderItemId: 'DEMO-ORDER-02-L1', quantity: 1 }], details: [{ label: '覆盖商品', value: 'DEMO-DH-02 × 1' }] },
    { ...record('PKG-order-02-2', '包裹 2 · UPS', '已签收', 'DEMO-TRACK-02B · 车门把手 × 1'), trackingNumber: 'DEMO-TRACK-02B', carrier: 'UPS', latestEvent: '已送达买家地址', latestEventAt: time('26T15:40:00'), packageItems: [{ orderItemId: 'DEMO-ORDER-02-L1', quantity: 1 }], details: [{ label: '覆盖商品', value: 'DEMO-DH-02 × 1' }] },
  ])
  const history = make('order-04', 'buyer_demo_01')
  history.product = { title: '空气滤芯', sku: 'DEMO-AF-04', quantity: 1 }
  history.platformProduct = { title: 'Demo Air Filter', sku: 'EBAY-DEMO-AF-04' }
  history.reviews = ready([record('REV-DEMO-04', '订单商品评价', '好评', '配件已收到，谢谢。', time('10T10:00:00'))])
  const candidate1 = make('order-05', 'buyer_demo_05')
  const candidate2 = make('order-06', 'buyer_demo_05')
  const unsynced = make('order-07', 'buyer_demo_06')
  unsynced.afterSales = { state: 'not_synced', records: [] }
  unsynced.disputes = { state: 'failed', records: [] }
  unsynced.reviews = { state: 'forbidden', records: [] }
  const failed = make('order-08', 'buyer_demo_07', 'shop-uk')
  failed.product = { title: '后视镜盖', sku: 'DEMO-MC-07', quantity: 1 }
  failed.platformProduct = { title: 'Demo Mirror Cover', sku: 'EBAY-DEMO-MC-07' }
  const unknown = make('order-09', 'buyer_demo_08')
  unknown.disputes = ready([record('CASE-DEMO-09', '未收到货纠纷', '待平台处理', '平台案件与本订单已确认关联。')])
  unknown.logistics = { state: 'failed', records: [] }
  const otherShop = make('order-10', 'buyer_demo_01', 'shop-uk')
  otherShop.product = { title: '折叠露营椅', sku: 'DEMO-CHAIR-10', quantity: 1 }
  otherShop.platformProduct = { title: 'Demo Folding Camping Chair', sku: 'EBAY-DEMO-CHAIR-10' }
  otherShop.afterSales = ready([record('RET-DEMO-10', '退货申请', '已关闭', '买家已撤回本笔露营椅订单的退货申请。')])
  otherShop.disputes = ready([record('CASE-DEMO-10', '未收到货纠纷', '已关闭', '本笔订单已确认签收，平台案件已关闭。')])
  otherShop.reviews = ready([record('REV-DEMO-10', '订单商品评价', '好评', '椅子轻便，适合露营使用。')])
  // 本轮独立资料样例：与已有 Return 007 的店铺、订单和买家身份逐项一致。
  // 完整订单及包裹为明确虚构资料；退货仅覆盖理线盒，不把另一个包裹视为已退货或已退款。
  const contextDemo = make('order-context-07', 'buyer_demo_r07')
  Object.assign(contextDemo, { orderNo: 'DEMO-ORDER-1007', amount: '69.80', product: { title: '桌面理线盒 · 灰色', sku: 'HOME-CABLE-07', quantity: 1 }, platformProduct: { title: 'Demo Cable Organizer', sku: 'EBAY-HOME-CABLE-07' } })
  contextDemo.items = [
    { id: 'DEMO-CONTEXT-1007-L1', title: '桌面理线盒 · 灰色', systemSku: 'HOME-CABLE-07', platformSku: 'EBAY-HOME-CABLE-07', specification: '灰色 · 标准款', quantity: 1 },
    { id: 'DEMO-CONTEXT-1007-L2', title: '旅行收纳袋 · 六件套', systemSku: 'TRAVEL-BAG-CONTEXT-07', platformSku: 'EBAY-TRAVEL-BAG-CONTEXT-07', specification: '海军蓝 · 六件套', quantity: 1 },
  ]
  contextDemo.logistics = {
    state: 'ready', updatedAt: '2026-11-09T01:15:00Z', records: [
      { id: 'PKG-CONTEXT-1007-A', title: '包裹 1 · UPS', status: '已签收', description: '理线盒已送达；该商品后续退货退款见平台申请。', at: '2026-10-11T07:40:00Z', trackingNumber: 'DEMO-CONTEXT-TRACK-07A', carrier: 'UPS', latestEvent: '已送达买家地址', latestEventAt: '2026-10-11T07:40:00Z', packageItems: [{ orderItemId: 'DEMO-CONTEXT-1007-L1', quantity: 1 }] },
      { id: 'PKG-CONTEXT-1007-B', title: '包裹 2 · USPS', status: '运输中', description: '旅行收纳袋单独发运，尚未签收。', at: '2026-11-09T00:45:00Z', trackingNumber: 'DEMO-CONTEXT-TRACK-07B', carrier: 'USPS', latestEvent: '已到达目的地分拨中心', latestEventAt: '2026-11-09T00:45:00Z', packageItems: [{ orderItemId: 'DEMO-CONTEXT-1007-L2', quantity: 1 }] },
    ],
  }
  contextDemo.afterSales = { state: 'ready', updatedAt: '2026-10-29T01:30:00Z', records: [{ id: 'DEMO-RT-007', returnId: 'DEMO-RT-007', title: '退货退款申请', status: '已关闭', description: '理线盒退货及退款已完成，旅行收纳袋不在本次申请范围内。', at: '2026-10-25T04:25:00Z', details: [{ label: '申请编号', value: 'DEMO-RT-007' }, { label: '申请商品', value: 'HOME-CABLE-07 × 1' }] }] }
  contextDemo.activity = [
    record('ACT-CONTEXT-1007-1', '理线盒退款已确认', '退款成功', '仅对应 DEMO-RT-007 及其申请商品，详见原申请和内部售后单。', '2026-10-25T04:20:00Z'),
    record('ACT-CONTEXT-1007-2', '收纳袋包裹轨迹更新', '运输中', '包裹 2 已到达目的地分拨中心。', '2026-11-09T00:45:00Z'),
  ]
  return [first, second, history, candidate1, candidate2, unsynced, failed, unknown, otherShop, contextDemo]
}

function incoming(id: string, buyer: string, body: string, at: string, translation: string): MailMessage {
  return { id, kind: 'incoming', sender: buyer, body, at, translation }
}

export function createConversations(): Conversation[] {
  const makeBuyer = (index: number, subject: string, body: string, translation: string, orderId?: string): Conversation => {
    const suffix = String(index).padStart(2, '0'), buyerId = `buyer_demo_${suffix}`
    const at = index === 1 ? time('27T10:10:00') : index <= 8 ? time(`26T${String(18 - index).padStart(2, '0')}:30:00`) : time(`25T${String(28 - index).padStart(2, '0')}:30:00`)
    return {
      id: `conv-${suffix}`, source: 'buyer', shopId: 'shop-us', shopName: '演示店铺-US', buyerId, subject,
      buyerDataScope: { buyerKey: demoBuyerKey(buyerId), shopIds: ['shop-us', 'shop-uk'] },
      unread: index !== 3, flagged: index === 1 || index === 8, assignee: index === 4 ? '' : index % 2 ? '客服01' : '客服02',
      status: index === 3 ? 'processed' : 'pending', updatedAt: at, canReply: true,
      association: orderId ? 'confirmed' : 'none', relatedOrderIds: orderId ? [orderId] : [],
      messages: [incoming(`msg-${suffix}-1`, buyerId, body, at, translation)], sendScenario: 'success',
      product: { title: '刹车片套装', sku: 'DEMO-BP-01' },
      priority: 'normal', tags: ['fitment'],
    }
  }
  const first = makeBuyer(1, '商品适配与退货', '2018 model. Please help me check the return status.', '2018 年款。请帮我查看退货申请的处理进度。', 'order-01')
  first.messages = [
    incoming('msg-01-1', first.buyerId, 'The part does not fit my car. I have opened a return request.', time('27T10:05:00'), '这个配件不适配我的车辆。我已发起退货申请。'),
    { id: 'msg-01-2', kind: 'outgoing', sender: '客服01', body: 'Could you share your vehicle model and year?', at: time('27T10:08:00'), delivery: 'success' },
    incoming('msg-01-3', first.buyerId, '2018 model. Please help me check the return status.', time('27T10:10:00'), '2018 年款。请帮我查看退货申请的处理进度。'),
  ]
  first.tags = ['fitment', 'return', 'review']
  first.lastHandledBy = '客服01'; first.lastHandledAt = time('27T10:08:00'); first.lastHandledAction = '回复成功'
  const second = makeBuyer(2, '物流进度咨询', 'Hi, could you tell me the shipping status of both packages?', '您好，请告诉我两个包裹各自的物流进度。', 'order-02')
  second.product = { title: '车门把手', sku: 'DEMO-DH-02' }
  second.updatedAt = time('27T09:48:00')
  second.messages[0]!.at = second.updatedAt
  second.tags = ['logistics']
  second.messages.unshift(
    incoming('msg-02-history', second.buyerId, 'Please let me know when my order is shipped.', time('26T09:30:00'), '我的订单发货后请通知我。'),
    { id: 'msg-02-auto', kind: 'outgoing', sender: '自动客服', body: 'Your order has shipped in two packages. Please check the tracking details for each package.', at: time('26T10:00:00'), delivery: 'success', sendSource: 'automation', automationRuleName: '订单发货提醒' },
  )
  const installation = makeBuyer(3, '安装方式咨询', 'Thank you. The installation instructions are clear.', '谢谢，安装说明已经清楚了。')
  installation.messages.push({ id: 'msg-03-2', kind: 'note', sender: '客服01', body: '买家已确认安装说明，本次沟通完成。', at: time('26T15:35:00') })
  installation.updatedAt = time('26T15:35:00')
  installation.lastHandledBy = '客服01'; installation.lastHandledAt = installation.updatedAt; installation.lastHandledAction = '添加备注'
  const presale = makeBuyer(4, '售前适配咨询', 'Will this item fit my vehicle? I have not placed an order yet.', '这个商品适配我的车辆吗？我还没有下单。')
  presale.shopId = 'shop-uk'; presale.shopName = '演示店铺-UK'
  const pending = makeBuyer(5, '两次购买的商品确认', 'I ordered this item twice. Please check the most recent one.', '我购买过这个商品两次，请核对最近的那笔订单。')
  pending.association = 'pending'; pending.relatedOrderIds = ['order-05', 'order-06']
  pending.tags = ['fitment', 'cancellation']
  const unsynced = makeBuyer(6, '售后记录查询', 'Could you check whether my return request is available?', '请帮我确认能否查到我的退货申请。', 'order-07')
  unsynced.tags = ['return']
  const failed = makeBuyer(7, '后视镜盖配件咨询', 'Could you check the mirror cover size?', '可以帮我确认后视镜盖的尺寸吗？', 'order-08')
  failed.shopId = 'shop-uk'; failed.shopName = '演示店铺-UK'; failed.sendScenario = 'failed'
  failed.product = { title: '后视镜盖', sku: 'DEMO-MC-07' }
  failed.messages.push({ id: 'msg-07-2', kind: 'outgoing', sender: '自动客服', body: 'Please share the dimensions of the original mirror cover.', at: time('26T11:35:00'), delivery: 'failed', sendSource: 'automation', automationRuleName: '订单商品资料补充', failureReason: '平台拒绝发送，请核对内容后重试。' })
  failed.updatedAt = time('26T11:35:00')
  const unknown = makeBuyer(8, '物流与纠纷跟进', 'I have not received the parcel. Please check the case.', '我还没有收到包裹，请查看纠纷记录。', 'order-09')
  unknown.sendScenario = 'unknown'
  unknown.messages.push({ id: 'msg-08-2', kind: 'outgoing', sender: '客服02', body: 'We are checking the latest delivery details.', at: time('26T10:35:00'), delivery: 'unknown', failureReason: '请求超时，发送结果待核查，暂不可重复发送。' })
  unknown.updatedAt = time('26T10:35:00')
  unknown.tags = ['logistics', 'dispute']

  // 扩展分页样例均为独立虚构买家的售前咨询，不继承已有订单或售后关联。
  const presaleSamples = [
    ['商品尺寸确认', 'Could you share the measurements before I order?', '下单前可以提供商品尺寸吗？', 'fitment'],
    ['安装位置咨询', 'Is this part suitable for the front position?', '这个配件适用于前部安装位置吗？', 'fitment'],
    ['配送选项咨询', 'Which delivery options are available before purchase?', '购买前想了解有哪些配送方式。', 'logistics'],
    ['套装内容确认', 'Does the kit include the mounting hardware?', '套装包含安装零件吗？', 'fitment'],
    ['商品颜色咨询', 'Is another colour available for this item?', '这个商品有其他颜色吗？', 'fitment'],
    ['车型年份核对', 'Could you check the supported model years?', '可以核对适用车型的年份范围吗？', 'fitment'],
    ['包装规格咨询', 'How many pieces are included in one pack?', '每包包含多少件商品？', 'fitment'],
    ['配送范围咨询', 'Can you confirm the delivery region before I buy?', '购买前可以确认配送范围吗？', 'logistics'],
    ['材质信息咨询', 'What material is used for this part?', '这个配件使用什么材质？', 'fitment'],
    ['安装说明咨询', 'Are installation instructions included in the package?', '包装内是否包含安装说明？', 'fitment'],
  ]
  const additionalBuyers = Array.from({ length: 20 }, (_, offset) => {
    const index = offset + 9, suffix = String(index).padStart(2, '0')
    const [subject, body, translation, tag] = presaleSamples[offset % presaleSamples.length]!
    const conversation = makeBuyer(index, `${subject} · 售前 ${suffix}`, `${body} I have not placed an order yet.`, `${translation}我尚未下单。`)
    if (index % 3 === 0) { conversation.shopId = 'shop-uk'; conversation.shopName = '演示店铺-UK' }
    conversation.priority = 'normal'
    conversation.tags = [tag!]; conversation.flagged = index % 6 === 0
    conversation.assignee = index % 5 === 0 ? '' : index % 2 ? '客服01' : '客服02'
    conversation.unread = index % 3 !== 0
    if (index === 14 || index === 27) {
      conversation.status = 'ignored'; conversation.unread = false
      conversation.lastHandledBy = '客服02'; conversation.lastHandledAt = conversation.updatedAt; conversation.lastHandledAction = '忽略会话'
      conversation.messages.push({ id: `msg-${suffix}-note`, kind: 'note', sender: '客服02', body: '已确认重复咨询，本次会话忽略，保留往来记录。', at: conversation.updatedAt })
    } else if (index % 4 === 0) {
      conversation.status = 'processed'; conversation.unread = false
      conversation.lastHandledBy = '客服01'; conversation.lastHandledAt = conversation.updatedAt; conversation.lastHandledAction = '回复成功'
      conversation.messages.push({ id: `msg-${suffix}-reply`, kind: 'outgoing', sender: '客服01', body: 'Thank you for checking. We have shared the product information for your review before ordering.', at: conversation.updatedAt, delivery: 'success' })
    }
    return conversation
  })

  const notices: Conversation[] = [
    ['卖家服务更新', '卖家服务信息', '请前往卖家中心查看与店铺有关的服务信息。'],
    ['账户通知', '店铺账户消息', '您可以在平台账户页面查看本通知的完整内容。'],
    ['订单取消通知', '订单取消相关通知', '本信件仅用于消息阅读；订单取消结果请以独立业务记录核验。'],
    ['刊登提示', '商品刊登信息', '请在平台刊登页面查看相关商品的信息。'],
    ['活动信息', '店铺活动消息', '您可以前往平台查看活动详情。'],
    ['服务提醒', '卖家服务提醒', '请查看平台服务中心提供的相关资料。'],
    ['账户安全提醒', '账户安全信息', '请在平台账户页面查看近期安全信息。'],
    ['刊登资料提示', '刊登资料核对', '请在卖家中心查看商品资料维护提示。'],
    ['平台公告', '平台公告信息', '请在平台公告页面查看适用店铺的信息。'],
    ['服务中心消息', '服务中心资料', '您可以在平台服务中心查看相关资料。'],
    ['交易提醒', '交易信息提醒', '本通知仅提供阅读信息，交易事实请核对对应业务记录。'],
    ['卖家月度资讯', '卖家资讯', '您可以在卖家中心阅读本期资讯。'],
  ].map(([subject, heading, paragraph], index) => {
    const at = index === 0 ? time('27T10:20:00') : time(`26T${String(17 - index).padStart(2, '0')}:20:00`)
    return {
      id: `notice-${String(index + 1).padStart(2, '0')}`, source: 'ebay', shopId: index === 4 ? 'shop-uk' : 'shop-us', shopName: index === 4 ? '演示店铺-UK' : '演示店铺-US',
      buyerId: '', subject: subject!, unread: index === 0 || index === 1 || index === 4 || index === 6 || index === 8 || index === 10, flagged: index === 6, assignee: '', status: 'processed', updatedAt: at, canReply: false,
      association: 'none', relatedOrderIds: [], sendScenario: 'success',
      priority: 'normal', tags: [],
      messages: [{ id: `notice-msg-${index + 1}`, kind: 'incoming', sender: 'eBay', body: paragraph!, at,
        notice: { heading: heading!, paragraphs: ['您好，', paragraph!], sections: [{ title: '通知详情', content: '请查看与当前店铺有关的信息。如有疑问，可参考平台帮助中心的相关说明。' }], footer: '此通知无需回复' },
      }],
    }
  })
  const contextDemo: Conversation = {
    id: 'conv-context-07', source: 'buyer', shopId: 'shop-us', shopName: '演示店铺-US', buyerId: 'buyer_demo_r07', subject: '退款记录与分包裹配送进度',
    buyerDataScope: { buyerKey: demoBuyerKey('buyer_demo_r07'), shopIds: ['shop-us', 'shop-uk'] },
    unread: true, flagged: false, assignee: '客服01', status: 'pending', updatedAt: '2026-10-20T09:20:00+08:00', canReply: true,
    association: 'confirmed', relatedOrderIds: ['order-context-07'], sendScenario: 'success', priority: 'normal', tags: ['return', 'logistics'],
    product: { title: '桌面理线盒 · 灰色', sku: 'HOME-CABLE-07' },
    messages: [incoming('msg-context-07-1', 'buyer_demo_r07', 'Please check the return and refund progress for the cable organizer and the delivery status of the travel bags in the other package.', '2026-10-20T09:20:00+08:00', '请帮我查看理线盒的退货退款进度，并核对另一个包裹中旅行收纳袋的配送情况。')],
  }
  const conversations = [first, second, installation, presale, pending, unsynced, failed, unknown, ...additionalBuyers, contextDemo, ...notices]
  // 只在样例已明确本次涉及的具体商品行时附上 SKU，供恢复自动分配。保留历史指派，不补造当时日志。
  snapshotConversationSkus(first, ['DEMO-BP-01'], false)
  snapshotConversationSkus(second, ['DEMO-DH-02'], false)
  snapshotConversationSkus(failed, ['DEMO-MC-07'], false)
  snapshotConversationSkus(contextDemo, ['HOME-CABLE-07', 'TRAVEL-BAG-CONTEXT-07'], false)
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.kind === 'incoming') message.unread = conversation.unread
      if (message.kind === 'outgoing') message.sendSource ??= 'manual'
    }
  }
  return conversations
}

export const replyTemplates = [
  { id: 'template-fitment', title: '确认车型与年份', body: 'Could you please share your vehicle model, year and engine type so we can check the fitment?' },
  { id: 'template-delivery', title: '核对物流进度', body: 'Thank you for contacting us. We are checking the latest tracking information for your package.' },
  { id: 'template-return', title: '跟进退货申请', body: 'Thank you for your message. We will check the return request and follow up with you.' },
  { id: 'template-photo', title: '补充商品照片', body: 'Could you please provide a clear photo of the item and the part number?' },
]
