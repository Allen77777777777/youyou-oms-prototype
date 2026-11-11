import { describe, expect, it } from 'vitest'
import { buildBuyerProfile, type BuyerIdentity, type BuyerRecord } from './模型'
import { getBuyerProfile, getBuyerRecords, resolveTicketBuyer } from './聚合'
import { mailSession } from '../eBay站内信/会话'
import { reviewSession } from '../eBay评价/会话'
import { returnSession } from '../eBay退换货申请/数据'
import { disputeRecords } from '../eBay纠纷/模型'
import { 共享订单 } from '../订单处理/演示会话'
import { ebayOrderSession } from '../eBay订单/会话'

const record = (key: string, shopId: string, buyerId: string): BuyerRecord => ({ key, category: 'orders', kind: 'order', typeLabel: '订单', shopId, shopName: shopId, buyerId,
  number: key, summary: '测试来源商品', status: '已发货', pending: false, location: null })
const identity = (shopId: string, buyerId: string, buyerKey = 'verified-account'): BuyerIdentity => ({ shopId, buyerId, buyerKey, shopIds: ['shop-a', 'shop-b'] })

describe('买家详情身份与可见范围', () => {
  it('可信别名可跨店聚合并产生相同页签身份，同名无映射记录不混入', () => {
    const rows = [record('a', 'shop-a', 'name-a'), record('b', 'shop-b', 'alias-b'), record('c', 'shop-c', 'name-a'), record('d', 'shop-b', 'name-a')]
    const ids = [identity('shop-a', 'name-a'), identity('shop-b', 'alias-b')]
    const a = buildBuyerProfile(rows, ids, 'shop-a', 'name-a'), b = buildBuyerProfile(rows, ids, 'shop-b', 'alias-b')
    expect(a.records.map(row => row.key)).toEqual(['a', 'b'])
    expect(a.canonicalShopId).toBe(b.canonicalShopId)
    expect(a.canonicalBuyerId).toBe(b.canonicalBuyerId)
    expect(a.canonicalKey).toBe(b.canonicalKey)
    expect(a.shops.map(shop => shop.id)).toEqual(['shop-a', 'shop-b'])
  })
  it('没有可信身份映射时仅取同店，不按买家显示文本扩展', () => {
    const result = buildBuyerProfile([record('a', 'shop-a', 'same'), record('b', 'shop-b', 'same')], [], 'shop-a', 'same')
    expect(result.records.map(row => row.key)).toEqual(['a'])
    expect(result.identityMode).toBe('shop-only')
  })
  it('存在冲突账户键时停留同店，不任选第一条身份', () => {
    const result = buildBuyerProfile([record('a', 'shop-a', 'same'), record('b', 'shop-b', 'alias')],
      [identity('shop-a', 'same'), identity('shop-a', 'same', 'other-account'), identity('shop-b', 'alias')], 'shop-a', 'same')
    expect(result.identityMode).toBe('shop-only')
    expect(result.records.map(row => row.key)).toEqual(['a'])
  })
  it('已知权限排除的店铺不可通过直接链接查询，计数和名称均为空', () => {
    const ids = [identity('shop-a', 'buyer'), { ...identity('shop-b', 'alias'), shopIds: ['shop-a'] }]
    const result = buildBuyerProfile([record('b', 'shop-b', 'alias')], ids, 'shop-b', 'alias')
    expect(result.found).toBe(false)
    expect(result.records).toEqual([])
    expect(result.shops).toEqual([])
  })
  it('同一账户的可见范围取交集，不能利用宽范围重复记录扩权', () => {
    const narrow = { ...identity('shop-a', 'buyer'), shopIds: ['shop-a'] }
    const result = buildBuyerProfile([record('a', 'shop-a', 'buyer'), record('b', 'shop-b', 'alias')],
      [identity('shop-a', 'buyer'), narrow, identity('shop-b', 'alias')], 'shop-a', 'buyer')
    expect(result.records.map(row => row.key)).toEqual(['a'])
  })
  it('不存在的入口不能使用其他店铺同名身份打开档案', () => {
    const result = buildBuyerProfile([record('a', 'shop-a', 'buyer')], [], 'missing-shop', 'buyer')
    expect(result.found).toBe(false)
    expect(result.records).toEqual([])
  })
  it('同源重复按对象身份去重，日期型与无时区记录不补造精确时刻', () => {
    const a = record('a', 'shop-a', 'buyer'), b = { ...record('b', 'shop-a', 'buyer'), occurredAt: '2026-11-06' }
    const result = buildBuyerProfile([a, a, b], [], 'shop-a', 'buyer')
    expect(result.records).toHaveLength(2)
    expect(result.records.find(row => row.key === 'b')?.occurredAt).toBe('2026-11-06')
    expect(result.lastUpdatedAt).toBeUndefined()
  })
})

describe('买家详情读取现有业务事实', () => {
  it('主评审买家具有跨店订单、站内信、两类申请、双向评价及来源工单', () => {
    const result = getBuyerProfile('shop-us', 'buyer_demo_01')
    expect(result.found).toBe(true)
    expect(result.identityMode).toBe('verified')
    expect(result.shops.map(shop => shop.id)).toContain('shop-uk')
    const kinds = result.records.map(row => row.kind)
    for (const kind of ['order', 'message', 'cancel', 'return', 'review', 'buyerFeedback', 'ticket']) expect(kinds).toContain(kind)
  })
  it('读买家概览不标读、不更改回复草稿或来源记录', () => {
    const before = JSON.stringify({ mail: mailSession, reviews: reviewSession, returns: returnSession, orders: 共享订单.value })
    getBuyerProfile('shop-us', 'buyer_demo_01')
    expect(JSON.stringify({ mail: mailSession, reviews: reviewSession, returns: returnSession, orders: 共享订单.value })).toBe(before)
  })
  it('已知未同步、失败或不可查看资料显式保留覆盖问题，不把没有记录宣称完整零', () => {
    const profile = getBuyerProfile('shop-us', 'buyer_demo_06')
    expect(profile.coverageIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ shopId: 'shop-us', category: 'afterSales', state: 'not_synced' }),
      expect.objectContaining({ shopId: 'shop-us', category: 'afterSales', state: 'failed' }),
      expect.objectContaining({ shopId: 'shop-us', category: 'reviews', state: 'forbidden' }),
    ]))
  })
  it('跨店覆盖问题保留来源店铺，同类问题不跨店去重', () => {
    const us = mailSession.orders.find(row => row.shopId === 'shop-us' && row.buyerId === 'buyer_demo_01')!
    const uk = mailSession.orders.find(row => row.shopId === 'shop-uk' && row.buyerId === 'buyer_demo_01')!
    const beforeUs = us.disputes, beforeUk = uk.disputes
    try {
      us.disputes = { state: 'failed', records: [] }
      uk.disputes = { state: 'failed', records: [] }
      const issues = getBuyerProfile('shop-us', 'buyer_demo_01').coverageIssues.filter(issue => issue.category === 'afterSales' && issue.state === 'failed')
      expect(issues.map(issue => issue.shopId).sort()).toEqual(['shop-uk', 'shop-us'])
      expect(issues.filter(issue => issue.shopId === 'shop-us')).toHaveLength(1)
    } finally { us.disputes = beforeUs; uk.disputes = beforeUk }
  })
  it('来源会话办理后买家页立即读取新状态', () => {
    const conversation = mailSession.conversations.find(row => row.id === 'conv-01')!
    const before = conversation.status
    try {
      conversation.status = 'processed'
      const row = getBuyerProfile('shop-us', conversation.buyerId).records.find(row => row.kind === 'message' && row.number === conversation.id)!
      expect(row.status).toBe('已处理')
      expect(row.pending).toBe(false)
    } finally { conversation.status = before }
  })
  it('查看隐藏评价不泄漏原正文', () => {
    const source = reviewSession.reviews[0]!, state = source.platformState
    try {
      source.platformState = 'HIDDEN'
      const row = getBuyerProfile(source.shopId, source.buyerId).records.find(row => row.kind === 'review' && row.number === source.id)!
      expect(row.summary).toBe('评价内容已隐藏')
      expect(row.pending).toBe(false)
    } finally { source.platformState = state }
  })
  it('工单只按完整来源身份归买家，错误店铺、消息或类型不串记录', () => {
    const source = { kind: 'message' as const, shopId: 'shop-us', shopName: '演示店铺-US', contextId: 'conv-01', id: 'msg-01-3', summary: '' }
    expect(resolveTicketBuyer(source)).toEqual({ shopId: 'shop-us', buyerId: 'buyer_demo_01' })
    expect(resolveTicketBuyer({ ...source, shopId: 'shop-uk' })).toBeUndefined()
    expect(resolveTicketBuyer({ ...source, id: 'missing' })).toBeUndefined()
    expect(resolveTicketBuyer()).toBeUndefined()
  })
  it('旧订单仅有脱敏买家展示名时不将同店掩码当作账户聚合', () => {
    const source = ebayOrderSession.value[0]!
    expect(getBuyerProfile(source.sellerId, source.buyerUsername).found).toBe(false)
  })
  it('平台暂缓日期不能成为卖家截止时间', () => {
    const source = disputeRecords.value.find(row => row.owner === '卖家')!, date = source.date
    try {
      source.date = { label: '平台暂缓审阅至', value: '2026-11-09', source: '平台通知' }
      const row = getBuyerRecords().find(row => row.kind === source.kind && row.shopId === source.shopId && row.number === source.id)!
      expect(row.dueAt).toBeUndefined()
    } finally { source.date = date }
  })
  it('一笔专业订单及其OMS记录不重复计单，实际OMS状态保留', () => {
    const source = ebayOrderSession.value[0]!
    const duplicate = JSON.parse(JSON.stringify(共享订单.value[0]!)) as typeof 共享订单.value[number]
    Object.assign(duplicate, { systemOrderNo: 'OMS-BUYER-DEDUP-TEST', storeId: source.sellerId, platformCode: 'eBay', platformOrderId: source.orderId,
      platformOrderNo: source.orderId, buyerExternalId: source.buyerUsername, processingStatus: '异常' })
    共享订单.value.push(duplicate)
    try {
      const rows = getBuyerRecords().filter(row => row.category === 'orders' && row.shopId === source.sellerId && row.number === source.orderId)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.status).toContain('OMS：异常')
      expect(rows[0]!.amount).toEqual(source.pricing.total)
    } finally { 共享订单.value.splice(共享订单.value.findIndex(row => row.systemOrderNo === duplicate.systemOrderNo), 1) }
  })
})
