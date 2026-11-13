import { afterEach, describe, expect, it } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { createReturnData } from './数据'
import { addReturnNote, submitReturnAction, syncReturn } from './模型'
import { returnOperationEntries } from './操作日志'

const now = '2026-10-29T06:00:00Z'
const originalActor = currentHandlerId.value
afterEach(() => { currentHandlerId.value = originalActor })

describe('退货退款申请操作日志', () => {
  it('请求内留言提交人与系统回查关联，日志不复制消息正文或冒充来源过程', () => {
    const row = createReturnData()[0]!, historyLength = row.history.length
    currentHandlerId.value = 'staff-01'
    expect(submitReturnAction(row, 'message', 'Only the request should contain this message.', null, '', now)).toBe('')
    const submitted = row.logs.slice(-1)[0]!
    expect(submitted).toMatchObject({ operator: '客服01', result: '已提交，待回查', submittedBy: '客服01' })
    expect(submitted.content).not.toContain('Only the request')
    expect(row.pendingRequest?.body).toMatchObject({ message: { content: 'Only the request should contain this message.' } })
    expect(row.history).toHaveLength(historyLength)
    currentHandlerId.value = 'staff-02'
    syncReturn(row, now)
    expect(row.logs.slice(-1)[0]).toMatchObject({ operator: '系统', result: '平台已确认受理', submittedBy: '客服01', submissionId: submitted.submissionId })
    expect(row.history.slice(-1)[0]?.text).toBe('Only the request should contain this message.')
  })

  it.each(['failed', 'unknown'] as const)('外部%s结果保留原提交身份且不显示成功', outcome => {
    const row = createReturnData()[0]!
    row.mock = { submit: outcome, resolve: outcome }
    currentHandlerId.value = 'staff-01'
    expect(submitReturnAction(row, 'message', 'Private reply', null, '', now)).toBe('')
    expect(row.logs.slice(-1)[0]).toMatchObject({ operator: '客服01', result: outcome === 'failed' ? '明确失败' : '结果待核查，禁止重提' })
    if (outcome === 'unknown') {
      currentHandlerId.value = 'staff-02'; syncReturn(row, now)
      expect(row.logs.slice(-1)[0]).toMatchObject({ operator: '系统', result: '结果待核查', submittedBy: '客服01' })
      expect(row.outcome).toBe('unknown')
    }
    expect(row.logs.every(log => !log.result?.includes('成功'))).toBe(true)
  })

  it('备注正文与日志摘要分开，旧日志不补人，同ReturnID跨店不串写', () => {
    const row = createReturnData()[0]!, other = { ...createReturnData()[0]!, shopId: 'another-shop' }
    const otherLogs = JSON.parse(JSON.stringify(other.logs))
    row.logs = [{ at: now, text: '原历史记录' }]
    currentHandlerId.value = 'staff-02'
    expect(addReturnNote(row, '内部核查的详细原文', now)).toBe('')
    expect(row.notes.slice(-1)[0]).toMatchObject({ author: '客服02', at: now, text: '内部核查的详细原文' })
    expect(row.logs.slice(-1)[0]).toMatchObject({ operator: '客服02', action: '添加内部备注', result: '已保存' })
    expect(row.logs.slice(-1)[0]?.content).not.toContain('内部核查的详细原文')
    expect(returnOperationEntries(row)[0]?.content).toBe('原历史记录')
    expect(returnOperationEntries(row)[0]?.operator).toBeUndefined()
    expect(other.logs).toEqual(otherLogs)
  })

  it('读取失败单独记录，保留可信资料及上次成功时间', () => {
    const row = createReturnData()[0]!, lastSuccess = row.lastSyncedAt, state = row.state
    row.mock = { readFailure: 'all' }
    currentHandlerId.value = 'staff-01'
    expect(syncReturn(row, now).status).toBe('failed')
    expect(row.logs.slice(-1)[0]).toMatchObject({ operator: '客服01', action: '刷新申请', result: '读取失败' })
    expect(row.lastSyncedAt).toBe(lastSuccess); expect(row.state).toBe(state)
  })
  it('无变化刷新只更新技术时间，平台业务推进只记一次', () => {
    const ordinary = createReturnData()[0]!
    const originalLogs = JSON.parse(JSON.stringify(ordinary.logs))
    syncReturn(ordinary, now); syncReturn(ordinary, '2026-10-29T07:00:00Z')
    expect(ordinary.logs).toEqual(originalLogs); expect(ordinary.lastSyncedAt).toBe('2026-10-29T07:00:00Z')
    const advanced = createReturnData()[17]!
    const initialCount = advanced.logs.length
    syncReturn(advanced, now)
    expect(advanced.logs).toHaveLength(initialCount + 1); expect(advanced.logs[initialCount]?.result).toBe('资料已更新')
    syncReturn(advanced, '2026-10-29T07:00:00Z')
    expect(advanced.logs).toHaveLength(initialCount + 1)
  })
  it('同一提交重复待核查只记一次，新提交仍独立留痕', () => {
    const row = createReturnData()[0]!
    row.mock = { submit: 'unknown', resolve: 'unknown' }
    expect(submitReturnAction(row, 'message', 'First attempt', null, '', now)).toBe('')
    syncReturn(row, now); const firstId = row.lastSubmission!.id, count = row.logs.length
    syncReturn(row, '2026-10-29T07:00:00Z')
    expect(row.logs).toHaveLength(count); expect(row.outcome).toBe('unknown')
    row.mock.resolve = 'failed'; syncReturn(row, now)
    row.mock.resolve = 'unknown'
    expect(submitReturnAction(row, 'message', 'Second attempt', null, '', now)).toBe('')
    syncReturn(row, now)
    expect(row.lastSubmission!.id).not.toBe(firstId)
    expect(row.logs.filter(log => log.action === '回查处理结果' && log.result === '结果待核查')).toHaveLength(2)
  })
  it('相同读取失败不重复记，恢复后再次失败保留新的失败事件', () => {
    const row = createReturnData()[0]!
    const initialCount = row.logs.length
    row.mock = { readFailure: 'all' }
    syncReturn(row, now); syncReturn(row, '2026-10-29T07:00:00Z')
    expect(row.logs).toHaveLength(initialCount + 1)
    delete row.mock.readFailure; syncReturn(row, now)
    const recovered = row.logs.length
    syncReturn(row, '2026-10-29T07:00:00Z'); expect(row.logs).toHaveLength(recovered)
    row.mock.readFailure = 'all'; syncReturn(row, now)
    expect(row.logs).toHaveLength(recovered + 1)
    expect(row.logs.slice(-1)[0]?.result).toBe('读取失败')
  })
})
