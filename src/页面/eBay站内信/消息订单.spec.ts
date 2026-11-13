import { describe, expect, it } from 'vitest'
import { createConversations, createRelatedOrders } from './数据'
import { getMessageOrderContext, getMessageOrders } from './消息订单'

describe('消息级订单上下文', () => {
  it('同会话每封消息分别关联，未知不会继承会话里的两笔订单', () => {
    const c = createConversations().find(c => c.id === 'conv-message-orders')!
    const orders = createRelatedOrders()
    const ids = (id: string) => getMessageOrders(c, c.messages.find(m => m.id === id), orders).map(order => order.id)
    expect(ids('msg-order-a')).toEqual(['order-01'])
    expect(ids('msg-order-b')).toEqual(['order-04'])
    expect(ids('msg-order-pending')).toEqual([])
    expect(ids('msg-order-multi')).toEqual(['order-01', 'order-04'])
    delete c.messages[0]!.orderAssociation
    expect(getMessageOrderContext(c, c.messages[0], orders).state).toBe('pending')
  })

  it('跨店、错买家、缺失或重复来源整体待确认', () => {
    const c = createConversations()[0]!, orders = createRelatedOrders(), m = c.messages[0]!
    for (const ids of [['order-10'], ['order-02'], ['missing'], ['order-01', 'order-01']]) {
      m.orderAssociation = { state: 'confirmed', orderIds: ids }
      expect(getMessageOrderContext(c, m, orders)).toEqual({ state: 'pending', orders: [] })
    }
    m.orderAssociation = { state: 'confirmed', orderIds: ['order-01'] }
    expect(getMessageOrderContext(c, m, [...orders, { ...orders[0]! }]).state).toBe('pending')
  })
})
