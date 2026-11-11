import { afterEach, describe, expect, it } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { addNote, cancellationOperationEntries, createCancellations, submitCancellation, syncCancellation } from './模型'

const now = '2026-10-29T02:00:00Z'
const originalActor = currentHandlerId.value
afterEach(() => { currentHandlerId.value = originalActor })

describe('取消申请操作日志', () => {
  it('提交冻结具体人员，换人回查记系统并关联原提交，不把受理写成退款成功', () => {
    const row = createCancellations()[0]!
    currentHandlerId.value = 'staff-01'
    expect(submitCancellation(row, 'approve', '已核实仓库未执行，内部详细依据', now).ok).toBe(true)
    const submitted = row.logs[0]!
    expect(submitted).toMatchObject({ operator: '客服01', action: '同意取消', result: '已提交，待回查', submittedBy: '客服01' })
    expect(submitted.submissionId).toBeTruthy()
    expect(submitted.content).not.toContain('内部详细依据')
    expect(row.notes[0]).toMatchObject({ author: '客服01', at: now, text: expect.stringContaining('内部详细依据') })
    currentHandlerId.value = 'staff-02'
    syncCancellation(row, now)
    expect(row.logs[0]).toMatchObject({ operator: '系统', action: '回查处理结果', result: '平台已确认受理', submittedBy: '客服01', submissionId: submitted.submissionId })
    expect(row.refundStatus).toBe('PENDING')
    expect(row.logs[0]!.result).not.toContain('退款成功')
  })

  it('旧备注及旧日志保留，新备注带人员时间，日志只记摘要且同号跨店不串写', () => {
    const first = createCancellations()[0]!, other = { ...createCancellations()[0]!, shopId: 'another-shop' }
    first.notes = ['既有无人员备注']; first.logs = [{ at: now, text: '既有无人员日志' }]
    currentHandlerId.value = 'staff-02'
    expect(addNote(first, '只在备注区查看的内部原文', now)).toBe(true)
    expect(first.notes[0]).toMatchObject({ author: '客服02', at: now })
    expect(first.logs[0]).toMatchObject({ operator: '客服02', action: '添加内部备注', result: '已保存' })
    expect(first.logs[0]!.text).not.toContain('只在备注区查看的内部原文')
    expect(cancellationOperationEntries(first)[1]?.content).toBe('既有无人员日志')
    expect(cancellationOperationEntries(first)[1]?.operator).toBeUndefined()
    expect(first.notes[1]).toBe('既有无人员备注')
    expect(other.notes).toEqual([]); expect(other.logs).toEqual([])
  })

  it('未知历史提交回查保留待核查，不能补造原提交人或释放防重', () => {
    const row = createCancellations()[6]!
    syncCancellation(row, now)
    expect(row.logs[0]).toMatchObject({ operator: '系统', result: '结果待核查' })
    expect(row.logs[0]!.content).toContain('原提交人：未记录')
    expect(row.logs[0]!.submittedBy).toBeUndefined()
    expect(submitCancellation(row, 'reject', '不能重试', now).ok).toBe(false)
  })
  it('无变化刷新只更新时间，同一次待核查或受理回执不重复记日志', () => {
    const ordinary = createCancellations()[0]!
    syncCancellation(ordinary, now); syncCancellation(ordinary, '2026-10-29T03:00:00Z')
    expect(ordinary.logs).toHaveLength(0); expect(ordinary.lastSyncedAt).toBe('2026-10-29T03:00:00Z')
    const unknown = createCancellations()[6]!
    syncCancellation(unknown, now); syncCancellation(unknown, '2026-10-29T03:00:00Z')
    expect(unknown.logs).toHaveLength(1); expect(unknown.submission).toBe('unknown')
    expect(submitCancellation(ordinary, 'approve', '核实后提交', now).ok).toBe(true)
    syncCancellation(ordinary, now)
    const acceptedCount = ordinary.logs.length
    syncCancellation(ordinary, '2026-10-29T04:00:00Z')
    expect(ordinary.logs).toHaveLength(acceptedCount)
  })
})
