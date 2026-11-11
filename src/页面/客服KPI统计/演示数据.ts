import { KPI_REVIEW_AS_OF, type KpiConversation, type KpiData, type KpiEvent, type KpiWorkItem } from './统计模型'

/** 固定、完全虚构的统计事实；不冒充其他业务页的实时操作或平台原件。 */
export const REVIEW_AS_OF = KPI_REVIEW_AS_OF
const staff: KpiData['staff'] = [
  { id: 'kpi-staff-lin', name: '林晓', team: '客服一组' },
  { id: 'kpi-staff-chen', name: '陈悦', team: '客服一组' },
  { id: 'kpi-staff-zhou', name: '周宁', team: '客服二组' },
  { id: 'kpi-staff-zhao', name: '赵敏', team: '客服二组' },
]
const shops: KpiData['shops'] = [
  { id: 'kpi-shop-us', name: '优优家居 · 美国店', site: '美国' },
  { id: 'kpi-shop-uk', name: '优优户外 · 英国店', site: '英国' },
  { id: 'kpi-shop-de', name: '优优生活 · 德国店', site: '德国' },
  { id: 'kpi-shop-au', name: '优优精选 · 澳洲店', site: '澳大利亚' },
]
const at = (day: number, hour: number, minute = 0, month = 11) => new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`).toISOString()
const conversations: KpiConversation[] = []
const workItems: KpiWorkItem[] = []
const tickets: KpiData['tickets'] = []
const events: KpiEvent[] = []
const topics = ['确认收货地址', '查询包裹派送进度', '咨询商品使用方法', '核对少件情况', '确认退件安排', '补充商品规格']

// 为上一同长度期间对比提供完整的虚构覆盖：北京10月26日00点起。
// 对比样例独立于11月既有对象，不修改当前期间办理量或回复轮次。
for (let day = 26; day <= 31; day += 1) {
  for (let shopIndex = 0; shopIndex < shops.length; shopIndex += 1) {
    const id = `kpi-previous-conv-${day}-${shopIndex}`
    const owner = staff[(day + shopIndex) % staff.length]!
    const hour = 8 + shopIndex * 2
    const startedAt = at(day, hour, 0, 10)
    const delayMinutes = 35 + ((day * 19 + shopIndex * 37) % 170)
    conversations.push({ id, shopId: shops[shopIndex]!.id, number: `MSG-2610-P${day}${shopIndex + 1}`, title: topics[(day + shopIndex) % topics.length]!, owners: [{ at: startedAt, staffId: owner.id }] })
    events.push(
      { id: `${id}-in`, kind: 'incoming', conversationId: id, messageId: `${id}-in`, at: startedAt },
      { id: `${id}-reply`, kind: 'message', conversationId: id, messageId: `${id}-reply`, at: new Date(Date.parse(startedAt) + delayMinutes * 60000).toISOString(), source: 'human', purpose: 'reply', actorId: owner.id, outcome: 'success' },
    )
    if ((day + shopIndex) % 4 === 0) events.push({ id: `${id}-auto`, kind: 'message', conversationId: id, messageId: `${id}-auto`, at: at(day, hour, 1, 10), source: 'automatic', purpose: 'reply', actorId: null, outcome: 'success' })
  }
}

// 六个北京自然日，每店每天一轮，保持每轮的起点和成功回复可下钻核对。
for (let day = 1; day <= 6; day += 1) {
  for (let shopIndex = 0; shopIndex < shops.length; shopIndex += 1) {
    const index = (day - 1) * shops.length + shopIndex + 1
    const id = `kpi-conv-${String(index).padStart(3, '0')}`
    const owner = staff[(day + shopIndex) % staff.length]!
    const hour = 8 + shopIndex * 2
    conversations.push({ id, shopId: shops[shopIndex]!.id, number: `MSG-2611-${String(index).padStart(4, '0')}`, title: topics[(day + shopIndex) % topics.length]!, owners: [{ at: at(day, hour), staffId: owner.id }] })
    events.push({ id: `${id}-in`, kind: 'incoming', conversationId: id, messageId: `${id}-in`, at: at(day, hour), summary: topics[(day + shopIndex) % topics.length] })
    if ((day + shopIndex) % 3 === 0) events.push({ id: `${id}-auto`, kind: 'message', conversationId: id, messageId: `${id}-auto`, at: at(day, hour, 1), source: 'automatic', purpose: 'reply', actorId: null, outcome: 'success', summary: '已接待，等待人工跟进' })
    // 末日留出真实待回复样例，其余回复时长分布为 17～154 分钟。
    if (!(day === 6 && shopIndex > 0)) {
      const delayMinutes = 17 + ((day * 23 + shopIndex * 31) % 138)
      const sentAt = new Date(Date.parse(at(day, hour)) + delayMinutes * 60000).toISOString()
      events.push({ id: `${id}-reply`, kind: 'message', conversationId: id, messageId: `${id}-reply`, at: sentAt, source: 'human', purpose: 'reply', actorId: owner.id, outcome: 'success' })
      if (day % 2 === 0) events.push({ id: `${id}-followup`, kind: 'message', conversationId: id, messageId: `${id}-followup`, at: new Date(Date.parse(sentAt) + 20 * 60000).toISOString(), source: 'human', purpose: 'reply', actorId: owner.id, outcome: 'success', summary: '补充说明，不生成新的首响样本' })
    }
  }
}

conversations.push(
  { id: 'kpi-night', shopId: shops[0]!.id, number: 'MSG-2611-0025', title: '晚间来信：核对收货位置', owners: [{ at: at(4, 20), staffId: staff[0]!.id }] },
  { id: 'kpi-cross-month', shopId: shops[1]!.id, number: 'MSG-2610-0026', title: '月末来信，次月人工回复', owners: [{ at: at(31, 23, 40, 10), staffId: staff[1]!.id }] },
  { id: 'kpi-old-pending', shopId: shops[2]!.id, number: 'MSG-2610-0027', title: '跨月待办：核对包裹缺件', owners: [{ at: at(30, 17, 0, 10), staffId: staff[0]!.id }, { at: at(4, 10), staffId: staff[2]!.id }] },
  { id: 'kpi-shared', shopId: shops[3]!.id, number: 'MSG-2611-0028', title: '跨客服协作：商品使用与配件', owners: [{ at: at(2, 10), staffId: staff[0]!.id }, { at: at(3, 9), staffId: staff[1]!.id }] },
  { id: 'kpi-unknown-owner', shopId: shops[0]!.id, number: 'MSG-2611-0029', title: '历史回复未保存具体员工', owners: [] },
  { id: 'kpi-failed', shopId: shops[1]!.id, number: 'MSG-2611-0030', title: '回复结果待核查', owners: [{ at: at(5, 16), staffIds: [staff[1]!.id, staff[3]!.id] }] },
)
events.push(
  { id: 'night-in', kind: 'incoming', conversationId: 'kpi-night', messageId: 'night-in', at: at(4, 20) },
  { id: 'night-auto', kind: 'message', conversationId: 'kpi-night', messageId: 'night-auto', at: at(4, 20, 1), actorId: null, source: 'automatic', purpose: 'reply', outcome: 'success' },
  { id: 'night-followup-in', kind: 'incoming', conversationId: 'kpi-night', messageId: 'night-followup-in', at: at(5, 8) },
  { id: 'night-reply', kind: 'message', conversationId: 'kpi-night', messageId: 'night-reply', at: at(5, 9), actorId: staff[0]!.id, source: 'human', purpose: 'reply', outcome: 'success', summary: '全自然时间：晚20点至次日9点为13小时' },
  { id: 'cross-in', kind: 'incoming', conversationId: 'kpi-cross-month', messageId: 'cross-in', at: at(31, 23, 40, 10) },
  { id: 'cross-reply', kind: 'message', conversationId: 'kpi-cross-month', messageId: 'cross-reply', at: at(1, 0, 20), actorId: staff[1]!.id, source: 'human', purpose: 'reply', outcome: 'success' },
  { id: 'old-pending-in', kind: 'incoming', conversationId: 'kpi-old-pending', messageId: 'old-pending-in', at: at(30, 17, 0, 10) },
  { id: 'shared-in', kind: 'incoming', conversationId: 'kpi-shared', messageId: 'shared-in', at: at(2, 10) },
  { id: 'shared-reply-a', kind: 'message', conversationId: 'kpi-shared', messageId: 'shared-reply-a', at: at(2, 10, 20), actorId: staff[0]!.id, source: 'human', purpose: 'reply', outcome: 'success' },
  { id: 'shared-in-2', kind: 'incoming', conversationId: 'kpi-shared', messageId: 'shared-in-2', at: at(3, 9) },
  { id: 'shared-reply-b', kind: 'message', conversationId: 'kpi-shared', messageId: 'shared-reply-b', at: at(3, 10), actorId: staff[1]!.id, source: 'human', purpose: 'reply', outcome: 'success' },
  { id: 'missing-person-in', kind: 'incoming', conversationId: 'kpi-unknown-owner', messageId: 'missing-person-in', at: at(2, 15) },
  { id: 'missing-person-reply', kind: 'message', conversationId: 'kpi-unknown-owner', messageId: 'missing-person-reply', at: at(2, 16), actorId: null, source: 'human', purpose: 'reply', outcome: 'success' },
  { id: 'failed-in', kind: 'incoming', conversationId: 'kpi-failed', messageId: 'failed-in', at: at(5, 16) },
  { id: 'failed-send', kind: 'message', conversationId: 'kpi-failed', messageId: 'failed-send', at: at(5, 16, 20), actorId: staff[3]!.id, source: 'human', purpose: 'reply', outcome: 'failed' },
  { id: 'unknown-send', kind: 'message', conversationId: 'kpi-failed', messageId: 'unknown-send', at: at(5, 16, 30), actorId: staff[3]!.id, source: 'human', purpose: 'reply', outcome: 'unknown' },
  { id: 'missing-time-send', kind: 'message', conversationId: 'kpi-failed', messageId: 'missing-time-send', at: '', actorId: staff[3]!.id, source: 'human', purpose: 'reply', outcome: 'success' },
  // 同一已成功消息的重复回执不新增成功消息或响应样本。
  { id: 'night-reply-duplicate', kind: 'message', conversationId: 'kpi-night', messageId: 'night-reply', at: at(5, 9, 2), actorId: staff[0]!.id, source: 'human', purpose: 'reply', outcome: 'success' },
)

const workTitles = { cancellation: '买家申请取消重复购买', return: '商品退回与退款协商', dispute: '未收到货及支付争议跟进' }
// 上期已办理对象只提供上期证据，结束后不形成当前待办。
for (const [shopIndex, shop] of shops.entries()) {
  for (const [typeIndex, type] of (['cancellation', 'return', 'dispute'] as const).entries()) {
    const id = `kpi-previous-${type}-${shopIndex}`
    const day = 27 + typeIndex
    workItems.push({ id, shopId: shop.id, type, number: `${{ cancellation: 'CAN', return: 'RET', dispute: 'DSP' }[type]}-2610-P${shopIndex + 1}`, title: workTitles[type], history: [
      { id: `${id}-created`, at: at(day, 9, 0, 10), state: 'seller_action', dueAt: at(day + 1, 16, 0, 10), summary: '收到平台申请及应办事项' },
      { id: `${id}-closed`, at: at(day, 14, 0, 10), state: 'closed', summary: '本事项已结束' },
    ] })
    events.push({ id: `${id}-action`, kind: 'handling', workItemId: id, actionId: `${id}-action`, at: at(day, 13, 0, 10), actorId: staff[(shopIndex + typeIndex) % staff.length]!.id, outcome: 'success', summary: '本次人工办理已确认' })
  }
  const id = `kpi-previous-ticket-${shopIndex}`
  tickets.push({ id, shopId: shop.id, number: `GD-2610-P${shopIndex + 1}`, title: '核对上期退件办理资料' })
  events.push(
    { id: `${id}-open`, kind: 'ticket', ticketId: id, actorId: staff[shopIndex]!.id, state: 'open', at: at(29, 9, 0, 10) },
    { id: `${id}-completed`, kind: 'ticket', ticketId: id, actorId: staff[shopIndex]!.id, state: 'completed', at: at(30, 15, 0, 10) },
  )
}

for (let shopIndex = 0; shopIndex < shops.length; shopIndex += 1) {
  const shop = shops[shopIndex]!
  for (const [typeIndex, type] of (['cancellation', 'return', 'dispute'] as const).entries()) {
    for (let instance = 0; instance < 3; instance += 1) {
      const id = `kpi-${type}-${shopIndex}-${instance}`
      const day = typeIndex + 1
      const number = `${{ cancellation: 'CAN', return: 'RET', dispute: 'DSP' }[type]}-2611-${shopIndex + 1}0${instance + 1}`
      const item: KpiWorkItem = { id, shopId: shop.id, type, number, title: workTitles[type], history: [{ id: `${id}-created`, at: at(day, 9), state: 'seller_action', dueAt: instance === 2 && type === 'return' ? null : at(instance === 2 ? 7 : day + 1, 16), summary: '收到平台申请及当前应办事项' }] }
      if (instance === 0) {
        item.history.push({ id: `${id}-waiting`, at: at(day + 1, 10), state: 'waiting', summary: type === 'return' ? '卖家已答复，等待买家寄回' : '卖家已办理，等待平台后续结果' })
        events.push({ id: `${id}-action`, kind: 'handling', workItemId: id, actionId: `${id}-action`, at: at(day + 1, 10), actorId: staff[(shopIndex + typeIndex) % staff.length]!.id, outcome: 'success', summary: ({ cancellation: '拒绝取消申请已确认', return: '接受退货已确认', dispute: '提交物流证明已确认' } as const)[type] })
        if (type === 'return') events.push({ id: `${id}-message-action`, kind: 'handling', workItemId: id, actionId: `${id}-message-action`, at: at(day + 2, 11), actorId: staff[(shopIndex + typeIndex + 1) % staff.length]!.id, outcome: 'success', summary: '补充退件说明已确认' })
      }
      workItems.push(item)
    }
  }
}

for (let index = 1; index <= 13; index += 1) {
  const id = `kpi-ticket-${index}`
  const actorId = staff[(index - 1) % staff.length]!.id
  const day = 1 + ((index - 1) % 4)
  tickets.push({ id, shopId: index === 13 ? null : shops[(index - 1) % shops.length]!.id, number: `GD-2611-${String(index).padStart(4, '0')}`, title: index === 13 ? '整理客服交班资料' : ['核对退件实收资料', '追踪包裹最新进度', '整理争议举证材料', '回访商品使用情况'][(index - 1) % 4]! })
  events.push({ id: `${id}-open`, kind: 'ticket', ticketId: id, actorId, state: 'open', at: at(day, 9) })
  events.push({ id: `${id}-followup`, kind: 'ticket', ticketId: id, actorId, state: 'in_progress', at: at(day, 13), summary: '补充所需资料与本次进展' })
  events.push({ id: `${id}-end`, kind: 'ticket', ticketId: id, actorId, state: index % 5 === 0 ? 'abandoned' : 'completed', at: at(day + 1, 15), summary: index % 5 === 0 ? '核对为重复任务，保留原任务继续跟进' : '已提交本项办理结果' })
}
events.push(
  { id: 'ticket-1-reopen', kind: 'ticket', ticketId: 'kpi-ticket-1', actorId: staff[0]!.id, state: 'reopened', at: at(4, 10), summary: '补充买家新反馈' },
  { id: 'ticket-1-complete-again', kind: 'ticket', ticketId: 'kpi-ticket-1', actorId: staff[0]!.id, state: 'completed', at: at(5, 11), summary: '补充资料完成；同期间同工单只计一次' },
  { id: 'ticket-5-reopen', kind: 'ticket', ticketId: 'kpi-ticket-5', actorId: staff[0]!.id, state: 'reopened', at: at(5, 9), summary: '发现仍需独立核对，重新办理' },
)

export const demoKpiData: KpiData = { asOf: REVIEW_AS_OF, coverageStart: '2026-10-25T16:00:00Z', staff, shops, conversations, workItems, tickets, events }
