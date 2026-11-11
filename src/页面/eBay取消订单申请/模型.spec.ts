import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addNote, blockedReason, cancelKey, createCancellations, createFilters, filterCancellations, formatCancelTime, inQueue, submitCancellation, syncCancellation } from './模型'
const rows = createCancellations
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T02:00:00Z')) })
afterEach(() => vi.useRealTimers())
describe('eBay取消申请处理边界', () => {
  it('批准与刷新分离，不改写订单仓库事实或提前写入平台历史', () => {
    const r = rows()[0]!, facts = JSON.stringify([r.omsStatus, r.shipped, r.activeWarehouse, r.systemOrderNo, r.platformOrderStatus, r.outbounds]), history = JSON.stringify(r.activityHistories)
    expect(submitCancellation(r, 'approve', '已核对无仓库执行').ok).toBe(true)
    expect(r.submission).toBe('submitted'); expect(r.cancelStatus).toBe('CANCEL_REQUESTED'); expect(r.refundStatus).toBeUndefined()
    expect(JSON.stringify(r.activityHistories)).toBe(history)
    expect(submitCancellation(r, 'approve', '重复').ok).toBe(false)
    syncCancellation(r); expect(r.cancelStatus).toBe('CANCEL_PENDING'); expect(r.cancelState).toBe('REFUND_PENDING'); expect(r.refundStatus).toBe('PENDING')
    expect(r.activityHistories.map(e => e.activityType)).toEqual(['BUYER_CREATE_CANCEL', 'SELLER_APPROVE', 'SYSTEM_REFUND'])
    expect(r.actualRefundAmount).toBeUndefined(); expect(r.refundIssuedAt).toBeUndefined()
    expect(JSON.stringify([r.omsStatus, r.shipped, r.activeWarehouse, r.systemOrderNo, r.platformOrderStatus, r.outbounds])).toEqual(facts)
    expect(submitCancellation(r, 'reject', '反向重复').ok).toBe(false)
    const refreshed = JSON.stringify(r.activityHistories); syncCancellation(r)
    expect(JSON.stringify(r.activityHistories)).toBe(refreshed)
  })
  it('仓库未结束、已有出库、资格未知均禁止同意', () => {
    for (const i of [1, 2, 7, 13]) expect(blockedReason(rows()[i]!, 'approve')).not.toBe('')
  })
  it('平台期限缺失、无偏移墙钟或无效来源均不放行响应', () => {
    const r = rows()[0]!
    expect(blockedReason(r, 'approve', '2026-11-01T00:00:00Z')).toContain('期限已过')
    for (const due of [undefined, '2026-10-30 09:30:00', 'not-a-time']) {
      r.dueAt = due
      expect(blockedReason(r, 'reject')).toContain('期限尚未确认')
      expect(blockedReason(r, 'approve')).toContain('期限尚未确认')
    }
  })
  it('绝对响应期限不因显示站点变化，带偏移期限不重复转换', () => {
    const r = rows()[0]!; r.dueAt = '2026-10-29T20:00:00+02:00'
    for (const site of ['EBAY_US', 'EBAY_DE', 'EBAY_GB']) {
      r.marketplaceId = site
      expect(blockedReason(r, 'reject', '2026-10-29T17:59:59Z')).toBe('')
      expect(blockedReason(r, 'reject', '2026-10-29T18:00:01Z')).toContain('期限已过')
    }
  })
  it('已发货待响应申请允许拒绝且不伪造未发货或退款', () => {
    const r = rows()[2]!, shipped = r.shipped
    expect(submitCancellation(r, 'reject', '已核实实际发运与跟踪信息').ok).toBe(true)
    syncCancellation(r); expect(r.cancelStatus).toBe('CANCEL_REJECTED'); expect(r.shipped).toBe(shipped); expect(r.omsStatus).toBe('已发货')
    expect(r.refundStatus).toBeUndefined(); expect(r.actualRefundAmount).toBeUndefined()
    expect(r.activityHistories[r.activityHistories.length - 1]?.activityType).toBe('SELLER_REJECT')
  })
  it('超时未知禁止双向重试，刷新无新证据不会解除', () => {
    const r = rows()[6]!, history = JSON.stringify(r.activityHistories)
    expect(submitCancellation(r, 'approve', '重试').ok).toBe(false); expect(submitCancellation(r, 'reject', '改拒绝').ok).toBe(false)
    syncCancellation(r); expect(r.submission).toBe('unknown'); expect(blockedReason(r, 'approve')).toContain('尚未确认')
    expect(JSON.stringify(r.activityHistories)).toBe(history)
  })
  it('卖家取消与关闭记录不开放买家响应', () => {
    for (const i of [4, 5, 8, 11, 12]) for (const action of ['approve', 'reject'] as const) expect(blockedReason(rows()[i]!, action)).not.toBe('')
  })
  it('整单多商品申请一次提交；空说明及过长说明不产生尝试', () => {
    const r = rows()[15]!, count = r.logs.length
    expect(r.products).toHaveLength(2)
    expect(submitCancellation(r, 'approve', ' ').ok).toBe(false); expect(submitCancellation(r, 'approve', '字'.repeat(501)).ok).toBe(false)
    expect(r.logs).toHaveLength(count); expect(submitCancellation(r, 'approve', '整单核实').ok).toBe(true)
  })
  it('备注和刷新日志不冒充平台历史，退款成功样例保留四个来源活动', () => {
    const r = rows()[4]!, history = JSON.stringify(r.activityHistories)
    expect(r.activityHistories.map(e => e.activityType)).toEqual(['BUYER_CREATE_CANCEL', 'SELLER_APPROVE', 'SYSTEM_REFUND', 'SYSTEM_NOTIFY_REFUND_STATUS'])
    expect(addNote(r, '核查中')).toBe(true); expect(addNote(r, '已核对')).toBe(true); expect(r.notes.map(note => typeof note === 'string' ? note : note.text)).toEqual(['已核对', '核查中'])
    syncCancellation(r); expect(JSON.stringify(r.activityHistories)).toBe(history)
    expect(r.activityHistories[2]?.activityParty).toBe('UNKNOWN')
    expect(addNote(r, '')).toBe(false)
  })
})
describe('取消申请身份、平台阶段与北京时间', () => {
  it('相同CancelID按店铺隔离，不用平台订单或OMS编号替代', () => {
    const first = rows()[0]!, second = { ...first, shopId: 'another-shop', orderId: 'another-order' }
    expect(cancelKey(first)).not.toBe(cancelKey(second))
    const changedOrder = { ...first, orderId: 'changed-order' }
    expect(cancelKey(changedOrder)).toBe(cancelKey(first))
  })
  it('店铺、发起人、状态及CancelID精确查询取交集', () => {
    const source = rows(), f = createFilters(); f.shops = [source[0]!.shopId]; f.requestor = 'BUYER'; f.states = ['APPROVAL_PENDING']; f.mode = 'exact'; f.query = `${source[0]!.cancelId}, ${source[1]!.cancelId}`
    expect(filterCancellations(source, f).map(r => r.cancelId)).toEqual([source[0]!.cancelId]); expect(source).toHaveLength(16)
    f.states = ['CLOSED']; expect(filterCancellations(source, f)).toHaveLength(0)
  })
  it('多商品SKU定位整单，队列不随本地提交状态伪装平台进度', () => {
    const f = createFilters(); f.field = 'sku'; f.query = 'HOME-DEMO-EXTRA'; expect(filterCancellations(rows(), f)).toHaveLength(1)
    const r = rows()[0]!; submitCancellation(r, 'approve', '整单核实')
    expect(inQueue(r, 'pending')).toBe(true); expect(inQueue(r, 'processing')).toBe(false)
    syncCancellation(r); expect(inQueue(r, 'pending')).toBe(false); expect(inQueue(r, 'processing')).toBe(true)
    for (const state of ['REFUND_PENDING', 'REFUND_INITIATED', 'REFUND_FAILED_RETRY', 'CONFIRM_REFUND_PENDING']) expect(inQueue({ ...r, cancelState: state }, 'processing')).toBe(true)
    expect(inQueue({ ...r, cancelState: 'INITIAL' }, 'all')).toBe(true); expect(inQueue({ ...r, cancelState: 'OTHER' }, 'processing')).toBe(false)
  })
  it('同一UTC时刻在所有站点按同一北京日期筛选，不改变来源', () => {
    const us = rows()[0]!, de = { ...us, marketplaceId: 'EBAY_DE', shopId: 'germany' }, f = createFilters()
    const original = JSON.stringify([us, de])
    f.dates = ['2026-10-28', '2026-10-28']; expect(filterCancellations([us, de], f)).toEqual([])
    f.dates = ['2026-10-29', '2026-10-29']; expect(filterCancellations([us, de], f)).toEqual([us, de])
    expect(formatCancelTime(us.createdAt, us)).toBe('2026-10-29 09:30:00')
    expect(formatCancelTime(de.createdAt, de)).toBe('2026-10-29 09:30:00')
    expect(JSON.stringify([us, de])).toBe(original)
  })
  it('按北京自然日包含首尾毫秒，不包含相邻日', () => {
    const r = rows()[0]!, f = createFilters(); f.dates = ['2026-10-28', '2026-10-28']
    const source = ['2026-10-27T16:00:00Z', '2026-10-28T15:59:59.999Z', '2026-10-28T16:00:00Z', '2026-10-27T15:59:59.999Z'].map(createdAt => ({ ...r, createdAt }))
    expect(filterCancellations(source, f).map(x => x.createdAt)).toEqual(source.slice(0, 2).map(x => x.createdAt))
  })
  it('英国夏令时重复小时在北京仍显示不同的真实时刻', () => {
    const r = { ...rows()[0]!, marketplaceId: 'EBAY_GB' }
    expect(formatCancelTime('2026-10-25T00:30:00Z', r)).toBe('2026-10-25 08:30:00')
    expect(formatCancelTime('2026-10-25T01:30:00Z', r)).toBe('2026-10-25 09:30:00')
  })
  it('未知站点仍显示北京，无偏移来源不猜时区且有日期筛选时排除', () => {
    const r = rows()[0]!, unknown = { ...r, marketplaceId: 'UNKNOWN' }, wall = { ...r, createdAt: '2026-10-29 09:30:00' }, f = createFilters()
    expect(formatCancelTime(unknown.createdAt, unknown)).toBe('2026-10-29 09:30:00'); expect(formatCancelTime(wall.createdAt, wall)).toBe('时间待核实')
    expect(filterCancellations([unknown, wall], f)).toHaveLength(2)
    f.dates = ['2026-10-20', '2026-10-30']; expect(filterCancellations([unknown, wall], f)).toEqual([unknown])
    expect(wall.createdAt).toBe('2026-10-29 09:30:00')
  })
  it('显式偏移与UTC同一瞬间显示一致，非法日期和未知偏移不解析', () => {
    expect(formatCancelTime('2026-11-01T01:30:00-07:00')).toBe(formatCancelTime('2026-11-01T08:30:00Z'))
    for (const value of ['2026-02-30T00:00:00Z', '2026-11-06T10:00:00-00:00', '2026-11-06T10:00:00']) expect(formatCancelTime(value)).toBe('时间待核实')
  })
})
