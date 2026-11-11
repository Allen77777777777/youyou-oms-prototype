import { afterEach, expect, it, vi } from 'vitest'
import type { Ticket } from './会话'

const key = 'youyou.ticket-prototype.v1'
const loadSession = async () => {
  vi.resetModules()
  return import('./会话')
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const writeSession = (items: Ticket[], demoRevision?: number, extra = {}) => sessionStorage.setItem(key, JSON.stringify({ actor: '跟单员小周', items, demoRevision, ...extra }))
async function freshItems() {
  sessionStorage.removeItem(key)
  return clone((await loadSession()).tickets.value)
}
afterEach(() => { sessionStorage.removeItem(key); vi.useRealTimers() })

it('新页签默认16条，内置验收单含四份真实演示附件和完整协作、完成重开及放弃历史', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-06T04:00:00Z'))
  const rows = await freshItems()
  expect(rows).toHaveLength(16)
  expect(new Set(rows.map(item => item.id)).size).toBe(16)
  const materials = rows.find(item => item.demoKey === 'ticket-acceptance-materials-v1')!
  expect(materials).toMatchObject({ id: 'GD-1015', creator: '客服小林', owner: '跟单员小周', status: '处理中', nextAt: '2026-11-07 10:00', dueAt: '2026-11-08 18:00' })
  const files = materials.logs[1]!.attachments!
  expect(files.map(file => file.type)).toEqual(['image/png', 'image/png', 'text/plain', 'text/csv'])
  expect(files.every(file => file.id.startsWith('demo-ticket-') && file.size > 0)).toBe(true)
  expect(materials.logs.map(log => log.action)).toEqual(['创建工单', '记录跟进', '转交工单', '内部补充', '调整办理安排', '记录跟进'])
  const abandoned = rows.find(item => item.demoKey === 'ticket-acceptance-abandoned-v1')!
  expect(abandoned).toMatchObject({ id: 'GD-1016', status: '已放弃', nextAt: '', closedAt: '2026-11-05 16:42' })
  expect(abandoned.checklist).toEqual([{ id: 'item-1', text: '核实重复任务', done: false }])
  expect(abandoned.logs.map(log => log.action)).toEqual(['创建工单', '完成工单', '重新打开工单', '放弃工单'])
  expect(abandoned.result).toContain('剩余 1 项未完成')
  expect(abandoned.abandonReason).toBe('重复建单，后续继续在原工单跟进')
})

it('旧6条加人工单先追加原8条再补2条，保留当前身份、人工结果及原编号', async () => {
  const existing = (await freshItems()).slice(0, 6)
  const manual: Ticket = { ...existing[0]!, id: 'GD-1007', title: '我自己建的跟进任务', result: '已回访', status: '已完成', nextAt: '' }
  const oldItems = [...existing, manual]
  writeSession(oldItems)
  const migrated = await loadSession()
  expect(migrated.currentActor.value).toBe('跟单员小周')
  expect(migrated.tickets.value.slice(0, 7)).toEqual(oldItems)
  const added = migrated.tickets.value.slice(7)
  expect(added).toHaveLength(10)
  expect(added[0]?.id).toBe('GD-1008')
  expect(added.slice(0, 8).filter(row => row.status === '已完成')).toHaveLength(3)
  expect(added.slice(8).map(row => row.id)).toEqual(['GD-1016', 'GD-1017'])
  const persisted = sessionStorage.getItem(key)
  const reloaded = await loadSession()
  expect(reloaded.tickets.value).toEqual(migrated.tickets.value)
  expect(sessionStorage.getItem(key)).toBe(persisted)
  expect(reloaded.createTicket(undefined, { title: '下一笔交接', description: '', owner: '跟单员小周', nextAt: '', dueAt: '' })?.id).toBe('GD-1018')
})

it('旧14条版本3页签补2条一次，提醒与已读事实不变', async () => {
  const existing = (await freshItems()).slice(0, 14)
  const notifications = [{ id: 'TN-1', ticketId: existing[0]!.id, recipient: '跟单员小周', kind: '转交', title: '原提醒', time: '2026-11-05 12:00', readAt: '2026-11-05 12:01' }]
  writeSession(existing, 3, { notifications })
  const migrated = await loadSession()
  expect(migrated.tickets.value).toHaveLength(16)
  expect(migrated.tickets.value.slice(0, 14)).toEqual(existing)
  expect(migrated.ticketNotifications.value).toEqual(notifications)
  const persisted = sessionStorage.getItem(key)
  expect((await loadSession()).tickets.value).toHaveLength(16)
  expect(sessionStorage.getItem(key)).toBe(persisted)
})

it('版本2只补原双包裹清单及2条验收样例，不改同来源的用户任务', async () => {
  const items = (await freshItems()).slice(0, 14)
  const sample = items.find(item => item.source?.id === 'msg-02-1')!
  delete sample.checklist
  const custom = { ...sample, id: 'GD-8800', logs: [...sample.logs, { action: '记录跟进', actor: '客服小林', note: '已自行联系仓库', time: sample.updatedAt }] }
  writeSession([...items, custom], 2)
  const upgraded = await loadSession()
  expect(upgraded.tickets.value).toHaveLength(17)
  expect(upgraded.tickets.value.find(item => item.id === sample.id)?.checklist?.map(item => item.done)).toEqual([true, false, false])
  expect(upgraded.tickets.value.find(item => item.id === custom.id)).toEqual(custom)
  expect(upgraded.tickets.value.slice(-2).map(item => item.id)).toEqual(['GD-8801', 'GD-8802'])
})

it('认领原验收16条页签的严格历史签名，只加标识，不覆盖已变更状态、负责人、附件或后续历史', async () => {
  const rows = await freshItems()
  const materials = rows[14]!
  const abandoned = rows[15]!
  delete materials.demoKey
  delete abandoned.demoKey
  materials.owner = '客服小林'
  materials.status = '已完成'
  materials.result = '用户后续补充办理结果'
  materials.logs.push({ action: '完成工单', actor: '客服小林', time: '2026-11-06 15:00', note: materials.result })
  materials.logs[1]!.attachments!.forEach((file, index) => { file.id = 'original-upload-' + index })
  abandoned.status = '处理中'
  abandoned.owner = '跟单员小周'
  abandoned.logs[0]!.note = '负责人：客服小林'
  abandoned.logs.push({ action: '重新打开工单', actor: '客服小林', time: '2026-11-06 15:30', note: '仍需补齐信息' })
  writeSession(rows, 3)
  const upgraded = await loadSession()
  expect(upgraded.tickets.value).toHaveLength(16)
  expect(upgraded.tickets.value[14]).toEqual({ ...materials, demoKey: 'ticket-acceptance-materials-v1' })
  expect(upgraded.tickets.value[15]).toEqual({ ...abandoned, demoKey: 'ticket-acceptance-abandoned-v1' })
  expect((await loadSession()).tickets.value).toHaveLength(16)
})

it('GD1015/16被不同任务占用时顺延最大编号，不凭编号或相似标题认领用户工单', async () => {
  const rows = await freshItems()
  const materials = rows[14]!
  const abandoned = rows[15]!
  delete materials.demoKey
  delete abandoned.demoKey
  materials.description = '同标题但这是用户自行安排的另一件任务'
  abandoned.creator = '跟单员小周'
  const existing = clone(rows)
  writeSession(rows, 3)
  const upgraded = await loadSession()
  expect(upgraded.tickets.value).toHaveLength(18)
  expect(upgraded.tickets.value.slice(0, 16)).toEqual(existing)
  expect(upgraded.tickets.value.slice(-2).map(item => item.id)).toEqual(['GD-1017', 'GD-1018'])
})

it('已有demoKey可保留修改后的样例，缺少的另一个按最大编号追加，失败重试也不累加', async () => {
  const rows = await freshItems()
  const existing = rows.slice(0, 15)
  existing[14]!.id = 'GD-9000'
  existing[14]!.title = '用户已调整的内置任务标题'
  const snapshot = clone(existing)
  writeSession(existing, 3)
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw Error('quota') })
  const first = await loadSession()
  expect(first.tickets.value).toHaveLength(16)
  expect(first.tickets.value.slice(0, 15)).toEqual(snapshot)
  expect(first.tickets.value[15]!.id).toBe('GD-9001')
  setItem.mockRestore()
  const retry = await loadSession()
  expect(retry.tickets.value).toHaveLength(16)
  expect(retry.tickets.value[15]!.id).toBe('GD-9001')
  expect((await loadSession()).tickets.value).toHaveLength(16)
})
