import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createReturnData } from './数据'
import * as ReturnData from './数据'
import { addReturnNote, createReturnFilters, filterReturns, findReturnRecord, formatReturnTime, getReturnBlockedReason, inReturnQueue, isReturnTimePast, returnKey, returnTimeZone, submitReturnAction, syncReturn } from './模型'
import { initializeReturnDemoContext } from './关联资料'
import { resolveReturnOrder, resolveReturnOutbound } from './关联导航'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 仓库会话单据 } from '../仓配管理/仓配会话'
import { createConversations } from '../eBay站内信/数据'
import { getBuyerIncomingMail } from '../eBay取消订单申请/关联站内信'
import { beijingWallTimeToISO } from './展示工具'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const baseline = { orders: copy(共享订单.value), executions: copy(仓库执行记录.value), rows: copy(仓库会话单据.value) }
afterEach(async () => { vi.restoreAllMocks(); 共享订单.value = copy(baseline.orders); 仓库执行记录.value = copy(baseline.executions); 仓库会话单据.value = copy(baseline.rows); await nextTick() })

describe('退货申请身份、北京时间及只读关联', () => {
  it('列表与详情逾期只比较可信绝对时刻，到期相等不算已过期', () => {
    const deadline = '2026-11-06T00:00:00+08:00', instant = Date.parse('2026-11-05T16:00:00Z')
    expect(isReturnTimePast(deadline, instant)).toBe(false)
    expect(isReturnTimePast(deadline, instant + 1)).toBe(true)
    for (const value of [null, undefined, '', '2026-11-05', '2026-11-05T16:00:00', '2026-11-05T16:00:00-00:00', '2026-02-30T16:00:00Z']) {
      expect(isReturnTimePast(value, instant + 1)).toBe(false)
    }
    expect(isReturnTimePast(deadline, NaN)).toBe(false)
  })
  it('相同Return ID按店铺隔离，缺失或重复同店身份不取第一条', () => {
    const row = createReturnData()[0]!, other = { ...copy(row), shopId: 'other-shop', shopName: '另一虚构店铺' }
    expect(returnKey(row)).not.toBe(returnKey(other))
    expect(findReturnRecord([row, other], returnKey(row))).toBe(row)
    expect(findReturnRecord([row, other], returnKey(other))).toBe(other)
    expect(findReturnRecord([row, copy(row)], returnKey(row))).toBeUndefined()
    expect(findReturnRecord([other], returnKey(row))).toBeUndefined()
    syncReturn(other, '2026-10-30T03:00:00Z')
    expect(row.lastSyncedAt).not.toBe(other.lastSyncedAt)
  })
  it('各站点及未知站点统一按北京时间展示和筛选，来源时刻保持不变', () => {
    const rows = createReturnData(), us = rows[0]!, uk = rows[1]!
    const source = us.createdAt
    expect(returnTimeZone(us)).toBe('Asia/Shanghai')
    expect(formatReturnTime(us.createdAt, us)).toBe('2026-10-28 11:20:00')
    expect(formatReturnTime(uk.createdAt, uk)).toBe('2026-10-28 11:20:00')
    const filters = { ...createReturnFilters(), shops: ['shop-us'], dates: ['2026-10-28', '2026-10-28'] }
    expect(filterReturns(rows, filters).some(row => row.id === us.id)).toBe(true)
    expect(filterReturns(rows, { ...filters, dates: ['2026-10-27', '2026-10-27'] }).some(row => row.id === us.id)).toBe(false)
    const unknown = { ...us, marketplaceId: 'UNKNOWN_SITE' }
    expect(returnTimeZone(unknown)).toBe('Asia/Shanghai')
    expect(formatReturnTime(unknown.createdAt, unknown)).toBe('2026-10-28 11:20:00')
    expect(filterReturns([unknown], filters)).toEqual([unknown])
    expect(us.createdAt).toBe(source)
    expect(formatReturnTime(null, us)).toBe('—'); expect(formatReturnTime(undefined, us)).toBe('—')
  })
  it('日期筛选覆盖北京自然日两端，排除相邻毫秒且不接受无时区来源', () => {
    const template = createReturnData()[0]!
    const times = ['2026-10-27T15:59:59.999Z', '2026-10-27T16:00:00.000Z', '2026-10-28T15:59:59.999Z', '2026-10-28T16:00:00.000Z', '2026-10-28 11:20:00', 'not-a-time']
    const rows = times.map((createdAt, index) => ({ ...template, id: `boundary-${index}`, createdAt }))
    expect(filterReturns(rows, { ...createReturnFilters(), dates: ['2026-10-28', '2026-10-28'] }).map(row => row.id)).toEqual(['boundary-1', 'boundary-2'])
    expect(formatReturnTime(times[1], template)).toBe('2026-10-28 00:00:00')
    expect(formatReturnTime(times[2], template)).toBe('2026-10-28 23:59:59')
    expect(formatReturnTime(times[4], template)).toBe('时间待核实')
    expect(formatReturnTime(times[5], template)).toBe('时间待核实')
  })
  it('海外站点夏令时切换不改变北京显示或北京表单输入语义', () => {
    const us = createReturnData()[0]!, uk = createReturnData()[1]!
    expect(formatReturnTime('2026-03-08T09:30:00Z', us)).toBe('2026-03-08 17:30:00')
    expect(formatReturnTime('2026-03-08T10:30:00Z', us)).toBe('2026-03-08 18:30:00')
    expect(formatReturnTime('2026-11-01T08:30:00Z', us)).toBe('2026-11-01 16:30:00')
    expect(formatReturnTime('2026-11-01T09:30:00Z', uk)).toBe('2026-11-01 17:30:00')
    expect(beijingWallTimeToISO('2026-03-08T02:30')).toBe('2026-03-07T18:30:00.000Z')
    expect(beijingWallTimeToISO('2026-11-01T01:30')).toBe('2026-10-31T17:30:00.000Z')
  })
  it('面单北京时间输入无损往返UTC，非法日期及非约定输入不补齐', () => {
    const row = createReturnData()[0]!, input = '2026-11-03T00:05'
    const source = beijingWallTimeToISO(input)!
    expect(source).toBe('2026-11-02T16:05:00.000Z')
    expect(formatReturnTime(source, row).slice(0, 16).replace(' ', 'T')).toBe(input)
    for (const invalid of ['', '2026-02-30T10:15', '2026-11-31T10:15', '2026-11-03T24:00', '2026-11-03T10:60', '2026-11-03T10:15:00', '2026-11-03T10:15+08:00']) expect(beijingWallTimeToISO(invalid)).toBeNull()
  })
  it('平台阶段多选不受旧内部提交结果筛选影响，待核查不制造队列阶段', () => {
    const rows = createReturnData().slice(0, 9), filters = { ...createReturnFilters(), states: ['ITEM_KEPT'], outcomes: ['confirmed'] }
    expect(filterReturns(rows, filters).map(row => row.id)).toEqual(['DEMO-RT-004', 'DEMO-RT-008'])
    expect(inReturnQueue(rows[7]!, 'response')).toBe(false)
    expect(inReturnQueue(rows[7]!, 'processing')).toBe(true)
    expect(getReturnBlockedReason(rows[7]!, 'refund')).toContain('请刷新数据')
  })
  it('导入及创建来源资料不全局注入，显式初始化幂等且部分申请不冒充整单', async () => {
    expect(共享订单.value.some(row => row.systemOrderNo.startsWith('OMS-DEMO-RET-'))).toBe(false)
    createReturnData(); expect(共享订单.value).toHaveLength(baseline.orders.length)
    initializeReturnDemoContext(); await nextTick()
    expect(共享订单.value).toHaveLength(baseline.orders.length + 3)
    expect(仓库执行记录.value).toHaveLength(baseline.executions.length + 4)
    const rows = createReturnData(), normal = rows[0]!, multi = rows[1]!, unknown = rows[8]!
    const order = resolveReturnOrder(normal, 共享订单.value)!
    expect(order.items.reduce((sum, item) => sum + item.orderedQuantity, 0)).toBe(3)
    expect(normal.quantity).toBe(1); expect(normal.orderProducts).toHaveLength(2)
    expect(multi.outbounds).toHaveLength(2)
    for (const row of [normal, multi, rows[2]!]) {
      const order = resolveReturnOrder(row, 共享订单.value)!
      expect(order).toBeDefined()
      expect(order.fulfillmentOrders.reduce((sum, f) => sum + f.shippedQuantity, 0)).toBe(row.shipped)
      for (const outbound of row.outbounds!) {
        const target = resolveReturnOutbound(row, outbound, 仓库会话单据.value, 共享订单.value)!
        expect(target).toBeDefined(); expect(target.outboundDetail!.snapshotReliable).toBe(true)
        expect(target.tracking).not.toBe(row.tracking)
      }
    }
    expect(unknown.orderProducts).toBeNull(); expect(unknown.outbounds).toBeNull(); expect(resolveReturnOrder(unknown, 共享订单.value)).toBeUndefined()
    initializeReturnDemoContext(); await nextTick()
    expect(共享订单.value).toHaveLength(baseline.orders.length + 3)
    expect(仓库会话单据.value).toHaveLength(baseline.rows.length + 4)
  })
  it('固定样例只读身份冲突时不覆盖共享订单或串仓单', async () => {
    initializeReturnDemoContext(); await nextTick()
    const row = createReturnData()[0]!, order = resolveReturnOrder(row, 共享订单.value)!, outbound = row.outbounds![0]!
    expect(resolveReturnOrder({ ...row, buyerId: 'other' }, 共享订单.value)).toBeUndefined()
    expect(resolveReturnOrder(row, [order, copy(order)])).toBeUndefined()
    expect(resolveReturnOutbound(row, { ...outbound, account: 'other' }, 仓库会话单据.value, 共享订单.value)).toBeUndefined()
    const source = 共享订单.value.find(order => order.systemOrderNo === row.systemOrderNo)!
    source.buyerExternalId = 'conflict'
    initializeReturnDemoContext(); await nextTick()
    expect(source.buyerExternalId).toBe('conflict')
    expect(共享订单.value.filter(order => order.systemOrderNo === row.systemOrderNo)).toHaveLength(1)
  })
  it('整单价格使用独立虚构订单资料，预计退款变化不反算商品价或整单金额', async () => {
    const rows = createReturnData()
    rows[0]!.estimatedRefund = 9999; rows[1]!.estimatedRefund = 0; rows[2]!.estimatedRefund = null
    vi.spyOn(ReturnData, 'createReturnData').mockReturnValue(rows)
    initializeReturnDemoContext(); await nextTick()
    for (const [index, expected] of [['49.90', '109.80'], ['36.80', '83.60'], ['29.50', '69.00']].entries()) {
      const order = resolveReturnOrder(rows[index]!, 共享订单.value)!
      expect(order.items[0]!.unitPrice.value).toBe(expected[0])
      expect(order.amount.orderAmount.value).toBe(expected[1])
    }
  })
  it('同店同买家的来信可读，不把邮件中的其他订单冒作Return订单', async () => {
    const row = createReturnData()[0]!, messages = getBuyerIncomingMail(createConversations(), row.shopId, row.buyerId)
    expect(messages.length).toBeGreaterThan(0)
    initializeReturnDemoContext(); await nextTick()
    expect(resolveReturnOrder(row, 共享订单.value)!.platformOrderNo).toBe(row.orderNo)
    expect(row.orderNo).not.toBe('DEMO-1001')
  })
  it('动作回执说明与Return留言归平台活动，内部备注保持独立', () => {
    const now = '2026-10-29T06:00:00Z'
    const row = createReturnData()[0]!, historyCount = row.history.length
    expect(addReturnNote(row, '仅内部审核说明', now)).toBe('')
    expect(submitReturnAction(row, 'approve', 'Please return the item.', null, '', now)).toBe('')
    expect(row.history).toHaveLength(historyCount)
    expect(row.pendingRequest?.body).toMatchObject({ decision: 'APPROVE', comments: { content: 'Please return the item.' } })
    syncReturn(row, now)
    expect(row.history).toHaveLength(historyCount + 1)
    expect(row.history[row.history.length - 1]!.text).toContain('Please return the item.')
    expect(row.history.some(entry => entry.text.includes('仅内部审核说明'))).toBe(false)
    expect(row.notes[0]?.text).toBe('仅内部审核说明')
    expect(submitReturnAction(row, 'message', 'Message to buyer.', null, '', now)).toBe('')
    syncReturn(row, now)
    expect(row.history).toHaveLength(historyCount + 2)
    expect(row.history[row.history.length - 1]!.text).toBe('Message to buyer.')
  })
})
