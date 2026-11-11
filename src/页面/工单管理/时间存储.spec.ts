import { afterEach, describe, expect, it, vi } from 'vitest'
import { isTicketViewTime, restoreTicketTimes, serializeTicketTimes, ticketViewTimeToUtc, utcToTicketViewTime } from './时间存储'
import type { Ticket } from './会话'

const key = 'youyou.ticket-prototype.v1'
async function reload() { vi.resetModules(); return import('./会话') }
afterEach(() => { sessionStorage.removeItem(key); vi.restoreAllMocks(); vi.useRealTimers() })

describe('工单北京时间视图与 UTC 持久化', () => {
  it('跨日输入按北京转 UTC，回读按北京；高精度和显式偏移往返保持同一时刻', () => {
    expect(ticketViewTimeToUtc('2026-11-06 00:15')).toBe('2026-11-05T16:15:00.000Z')
    expect(utcToTicketViewTime('2026-11-05T16:15:00.000Z')).toBe('2026-11-06 00:15')
    const value = '2026-11-05T17:20:39.123-05:00'
    const view = utcToTicketViewTime(value)
    expect(view).toBe('2026-11-06 06:20:39.123')
    expect(ticketViewTimeToUtc(view)).toBe('2026-11-05T22:20:39.123Z')
    expect(() => utcToTicketViewTime('2026-11-06 10:00')).toThrow('时区')
    expect(() => ticketViewTimeToUtc('2026-02-30 10:00')).toThrow('无效')
  })

  it('新单、跟进日志、预约期限、提醒及已读事件持久化为 UTC，界面仍为北京', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T16:05:00Z'))
    sessionStorage.removeItem(key)
    const session = await reload()
    session.tickets.value = []
    session.ticketNotifications.value = []
    const created = session.createTicket(undefined, { title: '跨日核对', description: '保留说明', owner: session.actors[1]!, nextAt: '2026-11-06 00:00', dueAt: '2026-11-07 09:00' })!
    expect(created.createdAt).toBe('2026-11-06 00:05')
    expect(session.checkFollowupReminders()).toBe('')
    session.currentActor.value = session.actors[1]!
    expect(session.markNotificationRead(session.ticketNotifications.value[0]!.id)).toBe('')
    expect(session.appendProgress(created.id, '已联系仓库', '2026-11-06 10:00')).toBe('')
    const saved = JSON.parse(sessionStorage.getItem(key)!)
    expect(saved.timeEncoding).toBe('utc-v1')
    expect(saved.items[0]).toMatchObject({ createdAt: '2026-11-05T16:05:00.000Z', nextAt: '2026-11-06T02:00:00.000Z', dueAt: '2026-11-07T01:00:00.000Z' })
    expect(saved.items[0].logs.every((log: { time: string }) => log.time.endsWith('Z'))).toBe(true)
    expect(saved.notifications[0]).toMatchObject({ time: '2026-11-05T16:05:00.000Z', readAt: '2026-11-05T16:05:00.000Z' })
    const restored = await reload()
    expect(restored.tickets.value[0]).toMatchObject({ title: '跨日核对', description: '保留说明', nextAt: '2026-11-06 10:00', dueAt: '2026-11-07 09:00' })
    expect(restored.tickets.value[0]!.logs[1]!.note).toContain('2026-11-06 10:00')
  })

  it('旧北京资料只转换存储表达，保留工单及提醒身份，回读不重复通知', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T04:00:00Z'))
    const item: Ticket = { id: 'GD-9001', title: '用户已有工单', description: '原文保留', creator: '客服小林', owner: '客服小林', status: '处理中', nextAt: '2026-11-06 10:00', dueAt: '', createdAt: '2026-11-05 11:00', updatedAt: '2026-11-06 09:00', logs: [{ actor: '客服小林', time: '2026-11-06 09:00', action: '记录跟进', note: '已有进展' }], result: '', followupRevision: 2 }
    const notice = { id: 'TN-9', ticketId: item.id, recipient: item.owner, kind: '跟进到时', title: '原提醒', time: '2026-11-06 10:00', appointmentKey: 'GD-9001:2:2026-11-06 10:00' }
    sessionStorage.setItem(key, JSON.stringify({ actor: item.owner, items: [item], notifications: [notice], demoRevision: 4 }))
    const migrated = await reload()
    expect(migrated.tickets.value).toEqual([item])
    expect(migrated.ticketNotifications.value).toEqual([notice])
    expect(migrated.checkFollowupReminders()).toBe('')
    expect(migrated.ticketNotifications.value).toHaveLength(1)
    const once = sessionStorage.getItem(key)
    expect(JSON.parse(once!).items[0].createdAt).toBe('2026-11-05T03:00:00.000Z')
    expect((await reload()).tickets.value).toEqual([item])
    expect(sessionStorage.getItem(key)).toBe(once)
  })

  it('时区转换不依赖机器本地时区，不改传入对象及历史文字', () => {
    const original = process.env.TZ
    try {
      for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
        process.env.TZ = zone
        expect(ticketViewTimeToUtc('2026-11-06 00:01')).toBe('2026-11-05T16:01:00.000Z')
        expect(utcToTicketViewTime('2026-11-05T16:01:00Z')).toBe('2026-11-06 00:01')
      }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
    const session = { items: [] as Ticket[], notifications: [] }
    expect(restoreTicketTimes(serializeTicketTimes(session))).toMatchObject(session)
    expect(session).not.toHaveProperty('timeEncoding')
    expect(restoreTicketTimes({ ...session, timeEncoding: 'unknown' }).timeRestoreIssue).toContain('待核实')
  })

  it('已声明 UTC 的损坏资料不被当北京猜测或被演示资料覆盖', async () => {
    const valid: Ticket = { id: 'GD-9000', title: '原工单', description: '', creator: '客服小林', owner: '客服小林', status: '处理中', nextAt: '2026-11-06T02:00:00Z', dueAt: '2026-11-06T03:00:00Z', createdAt: '2026-11-05T16:15:00Z', updatedAt: '2026-11-06T01:00:00Z', logs: [{ actor: '客服小林', time: '2026-11-06 09:00', action: '记录跟进', note: '保留原文' }], result: '' }
    const broken = { ...valid, id: 'GD-9001', nextAt: '2026-11-06 10:00', dueAt: 'invalid' }
    const stored = JSON.stringify({ actor: '客服小林', demoRevision: 4, timeEncoding: 'utc-v1', items: [valid, broken], notifications: [] })
    sessionStorage.setItem(key, stored)
    const loaded = await reload()
    expect(loaded.tickets.value[0]).toMatchObject({ id: 'GD-9000', nextAt: '2026-11-06 10:00', dueAt: '2026-11-06 11:00', createdAt: '2026-11-06 00:15', updatedAt: '2026-11-06 09:00' })
    expect(loaded.tickets.value[0]!.logs[0]).toMatchObject({ time: '时间待核实', note: '保留原文' })
    expect(loaded.tickets.value[1]).toMatchObject({ nextAt: '时间待核实', dueAt: '时间待核实' })
    expect(isTicketViewTime(loaded.tickets.value[1]!.nextAt)).toBe(false)
    expect(loaded.ticketTimeRestoreIssue).toContain('待核实')
    expect(loaded.checkFollowupReminders('2026-11-06 12:00')).toBe('')
    expect(loaded.ticketNotifications.value).toHaveLength(0)
    expect(sessionStorage.getItem(key)).toBe(stored)
    expect(() => loaded.createTicket(undefined, { title: '测试', description: '', owner: '客服小林', nextAt: '', dueAt: '' })).toThrow('待核实')
  })
})
