import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { resetReturnSession } from '../eBay退换货申请/数据'
import { createDisputeData } from './数据'
import { addDisputeNote, notesForDispute } from './客服关联'
import { disputeRecords, findRecord, refreshRecord, submitAction } from './模型'

const originalActor = currentHandlerId.value
const request = () => findRecord('demo-outdoor-uk', 'INR_REQUEST', 'DEMO-INR-101')!
beforeEach(() => { resetReturnSession(); disputeRecords.value = createDisputeData(); currentHandlerId.value = 'staff-01' })
afterEach(() => { resetReturnSession(); currentHandlerId.value = originalActor })

describe('纠纷操作日志与来源记录隔离', () => {
  it('原提交人冻结，系统回查关联原操作，反复刷新不重复成功', () => {
    const row = request()
    expect(row.operationLogs || []).toHaveLength(0)
    expect(submitAction(row, 'REFUND', {}, row.revision)).toBe('')
    const submitted = row.operationLogs![0]!
    expect(submitted).toMatchObject({ operator: '客服01', action: '全额退款', result: '已提交' })
    currentHandlerId.value = 'staff-02'
    refreshRecord(row)
    expect(row.operationLogs![1]).toMatchObject({ operator: '系统', relatedId: submitted.id, submittedBy: '客服01', result: '退款已确认' })
    expect(row.operationLogs![0]!.operator).toBe('客服01')
    refreshRecord(row)
    expect(row.operationLogs).toHaveLength(2)
  })
  it('留言与备注只记录摘要，不把全文复制进操作日志', () => {
    const row = request(), message = '请核对门卫代收情况', note = '待与仓库再次核实'
    expect(submitAction(row, 'MESSAGE', { message }, row.revision)).toBe('')
    expect(addDisputeNote(row, note)).toBe('')
    expect(row.history.slice(-1)[0]!.detail).toBe(message)
    expect(notesForDispute(row)[0]).toMatchObject({ author: '客服01', text: note })
    expect(row.operationLogs!.map(log => log.action)).toEqual(['给买家留言', '添加内部备注'])
    expect(JSON.stringify(row.operationLogs)).not.toContain(message)
    expect(JSON.stringify(row.operationLogs)).not.toContain(note)
  })
  it('未知回执不重复，取得目标裁决后才成功，不将原请求日志复制到升级案件', () => {
    const appealed = findRecord('demo-outdoor-uk', 'EBAY_CASE', 'DEMO-CASE-111')!
    expect(submitAction(appealed, 'APPEAL', { message: '新的投递说明' }, appealed.revision)).toBe('')
    const original = appealed.caseInfo!.latestDecisionId
    appealed.caseInfo!.latestDecisionId = 'UNKNOWN'
    refreshRecord(appealed); refreshRecord(appealed)
    expect(appealed.operationLogs).toHaveLength(2)
    expect(appealed.operationLogs![1]!.result).toBe('待核查')
    appealed.caseInfo!.latestDecisionId = original
    refreshRecord(appealed)
    expect(appealed.operationLogs!.slice(-1)[0]!.result).toBe('已受理')
    const row = findRecord('demo-outdoor-uk', 'INR_REQUEST', 'DEMO-INR-106')!
    expect(submitAction(row, 'ESCALATE', { reason: row.referralReasons[0] }, row.revision)).toBe('')
    refreshRecord(row)
    const linked = row.links[0]!
    expect(findRecord(linked.shopId, 'EBAY_CASE', linked.id)!.operationLogs).toEqual([])
    expect(row.operationLogs).toHaveLength(2)
  })
})
