import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { abandonTicket, actors, appendComment, appendProgress, changeTicketPriority, changeTicketSchedule, checkFollowupReminders, createTicket, currentActor, disputeSample, finishTicket, isTicketClosed, latestBusinessLog, latestBusinessProgress, markNotificationRead, relatedTickets, reopenTicket, ticketNotifications, tickets, toggleTicketItem, transferTicket } from './会话'

describe('内部工单协作', () => {
  it('清单按行保留顺序和状态，同名事项分别勾选，变更优先级和勾选记录均受负责人及结单限制', () => {
    currentActor.value = actors[0]!
    const item = createTicket(undefined, {
      title: '核对两件退货', description: '', owner: currentActor.value, nextAt: '', dueAt: '',
      checklist: [{ text: ' 核对运单 ', done: true }, { text: ' ', done: false }],
    })!
    const row = tickets.value.find(entry => entry.id === item.id)!
    expect(row.checklist).toEqual([{ id: 'item-1', text: '核对运单', done: true }])
    expect(appendProgress(row.id, '', '', [], [{ text: '核对运单', done: false }])).toBe('')
    const second = row.checklist![1]!
    expect(second.id).not.toBe(row.checklist![0]!.id)
    expect(row.logs[1]!.note).toContain('☐ 核对运单')
    currentActor.value = actors[1]!
    expect(toggleTicketItem(row.id, second.id, true)).toBeTruthy()
    expect(changeTicketPriority(row.id, '紧急')).toBeTruthy()
    currentActor.value = actors[0]!
    expect(toggleTicketItem(row.id, second.id, true)).toBe('')
    expect(toggleTicketItem(row.id, second.id, true)).toBe('')
    expect(row.logs).toHaveLength(3)
    expect(row.status).toBe('处理中')
    expect(changeTicketPriority(row.id, '紧急')).toBe('')
    expect(row.logs[3]!.note).toContain('普通 → 紧急')
    expect(toggleTicketItem(row.id, second.id, false)).toBe('')
    expect(row.checklist!.map(entry => entry.done)).toEqual([true, false])
    expect(finishTicket(row.id, '核查已结束')).toBe('')
    expect(toggleTicketItem(row.id, second.id, true)).toBeTruthy()
    expect(changeTicketPriority(row.id, '优先')).toBeTruthy()
  })
  it('直接创建无来源待办，同类编号的取消和退货申请分别关联', () => {
    const draft = { title: '交接晚班待办', description: '', owner: currentActor.value, nextAt: '', dueAt: '' }
    const cancel = { ...disputeSample, kind: 'cancel' as const }
    const returned = { ...disputeSample, kind: 'return' as const }
    const standalone = createTicket(undefined, draft)!
    const cancellation = createTicket(cancel, draft)!
    const afterSaleReturn = createTicket(returned, draft)!
    expect(standalone.source).toBeUndefined()
    expect(relatedTickets(cancel).map(row => row.id)).toEqual([cancellation.id])
    expect(relatedTickets(returned).map(row => row.id)).toEqual([afterSaleReturn.id])
  })
  it('附件可单独构成跟进，存储失败保持原工单与日志，再次提交只生成一条记录', () => {
    const draft = { title: '交回签收凭证', description: '', owner: currentActor.value, nextAt: '', dueAt: '' }
    const created = createTicket(undefined, draft)!
    const file = { id: 'file-1', name: '签收单.pdf', type: 'application/pdf', size: 28 }
    const row = tickets.value.find(item => item.id === created.id)!
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    try {
      expect(appendProgress(row.id, '', '', [file])).toContain('保存失败')
      expect(row.status).toBe('待处理')
      expect(row.logs).toHaveLength(1)
      expect(appendProgress(row.id, '', '', [file])).toBe('')
      expect(row.logs).toHaveLength(2)
      expect(row.logs[1]?.attachments).toEqual([file])
    } finally { vi.restoreAllMocks() }
  })
  it('换人后保留发起人、期限和历史，仅当前负责人可提交进展与完成结果', () => {
    const [customer, coordinator] = actors as [string, string]
    currentActor.value = customer
    const dueAt = '2026-11-09 17:00'
    const created = createTicket(disputeSample, { title: '核对签收凭证', description: '', owner: customer, dueAt, nextAt: '2026-11-06 14:00' })!
    const row = tickets.value.find(item => item.id === created.id)!
    expect(transferTicket(row.id, coordinator, '请联系承运商')).toBe('')
    expect(finishTicket(row.id, '签收单已查到')).toBeTruthy()
    currentActor.value = coordinator
    expect(appendProgress(row.id, '承运商已受理', '2026-11-07 10:00')).toBe('')
    expect(row).toMatchObject({ creator: customer, owner: coordinator, status: '处理中', dueAt, nextAt: '2026-11-07 10:00' })
    expect(finishTicket(row.id, '签收凭证编号 POD-001')).toBe('')
    expect(row.status).toBe('已完成')
    expect(finishTicket(row.id, '重复提交')).toBeTruthy()
    expect(row.logs.map(log => log.actor)).toEqual([customer, customer, coordinator, coordinator])
    currentActor.value = customer
  })
  it('相同业务 ID 按来源类型、店铺和消息会话隔离，只显示该记录的关联工单', () => {
    const source = { ...disputeSample, kind: 'message' as const, contextId: 'thread-A', id: 'm-001' }
    const draft = { title: '后天回访', description: '', owner: currentActor.value, nextAt: '', dueAt: '' }
    const first = createTicket(source, draft)!
    const second = createTicket(source, { ...draft, title: '核实包装' })!
    createTicket({ ...source, shopId: 'shop-uk' }, draft)
    createTicket({ ...source, contextId: 'thread-B' }, draft)
    expect(relatedTickets(source).map(item => item.id)).toEqual([second.id, first.id])
    expect(relatedTickets({ ...source, kind: 'return' })).toEqual([])
  })
})

describe('工单双向协作与结束恢复', () => {
  const [creator, owner] = actors as [string, string]
  const last = <T>(items: T[]) => items[items.length - 1]
  const file = { id: 'comment-image', name: '仓库实收.png', type: 'image/png', size: 128 }
  function assigned() {
    currentActor.value = creator
    const created = createTicket(undefined, { title: '核实两件退货', description: '', owner, nextAt: '2026-11-06 10:00', dueAt: '2026-11-07 17:00', checklist: [{ text: '核对实收', done: false }] })!
    return tickets.value.find(item => item.id === created.id)!
  }
  beforeEach(() => {
    currentActor.value = creator
    tickets.value = []
    ticketNotifications.value = []
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('发起人与负责人能双向补充材料，状态与清单不受补充影响，其他办理仍由负责人执行', () => {
    const row = assigned()
    expect(appendComment(row.id, '买家补充了收货照片', [file])).toBe('')
    expect(row.status).toBe('待处理')
    expect(last(row.logs)).toMatchObject({ actor: creator, action: '内部补充', attachments: [file] })
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: owner, kind: '内部补充', ticketId: row.id })
    expect(appendProgress(row.id, '发起人不能代办', '')).toContain('负责人')
    expect(toggleTicketItem(row.id, row.checklist![0]!.id, true)).toContain('负责人')
    expect(changeTicketSchedule(row.id, { nextAt: '', dueAt: row.dueAt })).toContain('负责人')
    currentActor.value = owner
    expect(appendComment(row.id, '', [file])).toBe('')
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: creator, kind: '内部补充' })
    expect(row.status).toBe('待处理')
    currentActor.value = '其他员工'
    expect(appendComment(row.id, '无权限补充')).toContain('仅发起人或当前负责人')
    expect(row.logs).toHaveLength(3)
  })

  it('放弃原因必填，放弃独立于完成，结束后只读且仅负责人可带原因重开', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T04:00:00Z'))
    const row = assigned()
    expect(abandonTicket(row.id, '')).toContain('放弃原因')
    expect(abandonTicket(row.id, '不再需要')).toContain('负责人')
    currentActor.value = owner
    expect(abandonTicket(row.id, '仓库已通过其他渠道回传')).toBe('')
    expect(row).toMatchObject({ status: '已放弃', abandonReason: '仓库已通过其他渠道回传', result: '', closedAt: '2026-11-05 12:00', nextAt: '' })
    expect(isTicketClosed(row)).toBe(true)
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: creator, kind: '放弃' })
    expect(appendComment(row.id, '结束后补充')).toContain('已结束')
    expect(changeTicketPriority(row.id, '紧急')).toContain('已结束')
    expect(finishTicket(row.id, '不得把放弃改为完成')).toContain('已结束')
    expect(reopenTicket(row.id, '')).toContain('原因')
    currentActor.value = creator
    expect(reopenTicket(row.id, '发起人不能代重开')).toContain('负责人')
    currentActor.value = owner
    expect(reopenTicket(row.id, '回传资料缺页，继续补齐')).toBe('')
    expect(row).toMatchObject({ status: '处理中', owner, abandonReason: '仓库已通过其他渠道回传', nextAt: '' })
    expect(row.closedAt).toBeUndefined()
    expect(row.checklist![0]!.done).toBe(false)
    expect(isTicketClosed(row)).toBe(false)
    expect(latestBusinessProgress(row)).toBe('回传资料缺页，继续补齐')
    expect(row.logs.map(log => log.action)).toEqual(['创建工单', '放弃工单', '重新打开工单'])
    expect(reopenTicket(row.id, '不能重复重开')).toContain('只有已结束')
  })

  it('清单未完成仍能有结果结单，重开保留旧结果但最新进展不会误显示旧结论', () => {
    const row = assigned()
    currentActor.value = owner
    expect(finishTicket(row.id, '确认无需再核对另一张凭证')).toBe('')
    expect(row.status).toBe('已完成')
    expect(row.checklist![0]!.done).toBe(false)
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: creator, kind: '完成' })
    expect(reopenTicket(row.id, '仓库撤回了原结论')).toBe('')
    expect(row.result).toBe('确认无需再核对另一张凭证')
    expect(latestBusinessLog(row)).toMatchObject({ actor: owner, action: '重新打开工单', note: '仓库撤回了原结论' })
    expect(latestBusinessProgress(row)).toBe('仓库撤回了原结论')
    expect(appendProgress(row.id, '等待仓库重新回传', '')).toBe('')
    expect(changeTicketPriority(row.id, '紧急')).toBe('')
    expect(toggleTicketItem(row.id, row.checklist![0]!.id, true)).toBe('')
    expect(latestBusinessProgress(row)).toBe('等待仓库重新回传')
    expect(appendComment(row.id, '', [file])).toBe('')
    expect(latestBusinessProgress(row)).toBe('附件（1）')
  })

  it('下次跟进可单独调整，完成期限变更必须填写原因，安排不制造业务进展', () => {
    const row = assigned()
    currentActor.value = owner
    expect(changeTicketSchedule(row.id, { nextAt: '2026-11-06 11:00', dueAt: row.dueAt })).toBe('')
    expect(row).toMatchObject({ status: '待处理', nextAt: '2026-11-06 11:00', followupRevision: 1 })
    expect(latestBusinessProgress(row)).toBe('—')
    expect(changeTicketSchedule(row.id, { nextAt: row.nextAt, dueAt: '' })).toContain('填写原因')
    expect(row.dueAt).toBe('2026-11-07 17:00')
    expect(changeTicketSchedule(row.id, { nextAt: '', dueAt: '2026-11-08 12:00' }, '海外仓周末补传')).toBe('')
    expect(last(row.logs)?.note).toContain('完成期限：2026-11-07 17:00 → 2026-11-08 12:00')
    expect(last(row.logs)?.note).toContain('调整原因：海外仓周末补传')
    const count = row.logs.length
    expect(changeTicketSchedule(row.id, { nextAt: row.nextAt, dueAt: row.dueAt })).toBe('')
    expect(row.logs).toHaveLength(count)
  })

  it('新指派及转交提醒正确对象，提醒仅本人可读，后续保存保留已读状态', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T02:15:00Z'))
    const row = assigned()
    expect(ticketNotifications.value).toHaveLength(1)
    const assignedNotice = ticketNotifications.value[0]!
    expect(assignedNotice).toMatchObject({ ticketId: row.id, recipient: owner, kind: '指派' })
    expect(markNotificationRead(assignedNotice.id)).toContain('自己的提醒')
    currentActor.value = owner
    expect(markNotificationRead(assignedNotice.id)).toBe('')
    expect(ticketNotifications.value[0]!.readAt).toBeTruthy()
    const readAt = ticketNotifications.value[0]!.readAt
    expect(markNotificationRead(assignedNotice.id)).toBe('')
    expect(ticketNotifications.value[0]!.readAt).toBe(readAt)
    expect(transferTicket(row.id, creator, '请联系买家核对')).toBe('')
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: creator, kind: '转交' })
    expect(readAt).toBe('2026-11-06 10:15')
    expect(JSON.parse(sessionStorage.getItem('youyou.ticket-prototype.v1')!).notifications[0].readAt).toBe('2026-11-06T02:15:00.000Z')
  })

  it('负责人保存业务进展提醒发起人，自办任务不制造给自己的消息', () => {
    const row = assigned()
    currentActor.value = owner
    const count = ticketNotifications.value.length
    expect(appendProgress(row.id, '已取得仓库实收照片', row.nextAt, [file])).toBe('')
    expect(ticketNotifications.value).toHaveLength(count + 1)
    expect(last(ticketNotifications.value)).toMatchObject({ ticketId: row.id, recipient: creator, kind: '跟进' })
    expect(last(ticketNotifications.value)?.title).toContain('工单有新进展')
    const personal = createTicket(undefined, { title: '个人回访', description: '', owner, nextAt: '', dueAt: '' })!
    const beforePersonalProgress = ticketNotifications.value.length
    expect(appendProgress(personal.id, '已完成电话回访', '')).toBe('')
    expect(ticketNotifications.value).toHaveLength(beforePersonalProgress)
  })

  it('到下次跟进时间仅提醒一次，反复刷新或保留同一时间的进展不重复，重新预约可再提醒', () => {
    const row = assigned()
    expect(checkFollowupReminders('2026-11-06 09:59')).toBe('')
    expect(ticketNotifications.value.filter(item => item.kind === '跟进到时')).toHaveLength(0)
    expect(checkFollowupReminders('2026-11-06 10:00')).toBe('')
    expect(checkFollowupReminders('2026-11-06 10:30')).toBe('')
    expect(ticketNotifications.value.filter(item => item.kind === '跟进到时')).toHaveLength(1)
    expect(last(ticketNotifications.value)).toMatchObject({ recipient: owner, ticketId: row.id })
    currentActor.value = owner
    expect(appendProgress(row.id, '已开始核对', row.nextAt)).toBe('')
    expect(checkFollowupReminders('2026-11-06 10:30')).toBe('')
    expect(ticketNotifications.value.filter(item => item.kind === '跟进到时')).toHaveLength(1)
    expect(changeTicketSchedule(row.id, { nextAt: '', dueAt: row.dueAt })).toBe('')
    expect(changeTicketSchedule(row.id, { nextAt: '2026-11-06 10:00', dueAt: row.dueAt })).toBe('')
    expect(checkFollowupReminders('2026-11-06 10:30')).toBe('')
    expect(ticketNotifications.value.filter(item => item.kind === '跟进到时')).toHaveLength(2)
    expect(finishTicket(row.id, '核对结束')).toBe('')
    expect(checkFollowupReminders('2026-11-08 10:30')).toBe('')
    expect(ticketNotifications.value.filter(item => item.kind === '跟进到时')).toHaveLength(2)
  })

  it('数据与提醒同批保存，写入失败不改变状态、不重复事件且可重试', () => {
    const row = assigned()
    currentActor.value = owner
    const before = JSON.stringify(row)
    const noticeCount = ticketNotifications.value.length
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota') })
    expect(abandonTicket(row.id, '任务已取消')).toContain('保存失败')
    expect(JSON.stringify(row)).toBe(before)
    expect(ticketNotifications.value).toHaveLength(noticeCount)
    expect(abandonTicket(row.id, '任务已取消')).toBe('')
    expect(ticketNotifications.value).toHaveLength(noticeCount + 1)
    expect(row.logs.filter(log => log.action === '放弃工单')).toHaveLength(1)
  })

  it('旧页签没有提醒字段也可继续办理，新提醒及预约去重可在重新加载后恢复', async () => {
    const row = assigned()
    await nextTick()
    sessionStorage.setItem('youyou.ticket-prototype.v1', JSON.stringify({ actor: owner, items: [JSON.parse(JSON.stringify(row))], demoRevision: 3 }))
    vi.resetModules()
    const reloaded = await import('./会话')
    expect(reloaded.ticketNotifications.value).toEqual([])
    expect(reloaded.tickets.value[0]).toMatchObject({ id: row.id, owner, nextAt: row.nextAt })
    expect(reloaded.checkFollowupReminders('2026-11-06 10:00')).toBe('')
    vi.resetModules()
    const again = await import('./会话')
    expect(again.ticketNotifications.value).toHaveLength(1)
    expect(again.checkFollowupReminders('2026-11-06 11:00')).toBe('')
    expect(again.ticketNotifications.value).toHaveLength(1)
  })
})
