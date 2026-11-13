import { afterEach, describe, expect, it } from 'vitest'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords } from '../售后单管理/会话'
import { createReturnData } from './数据'
import { actionOptions, createReturnActionDraft, getReturnBlockedReason, noLabelReasons, prepareReturnAction, submitPreparedReturnAction, uploadReturnAttachment, type ReturnAction } from './模型'
import { getReturnHandlerIds } from './处理人'
import { getReturnWritePermissionError } from './权限'

const now = '2026-10-29T06:00:00Z'
const initialActor = activeAfterSaleActor.value
afterEach(() => { activeAfterSaleActor.value = initialActor })
const cases: Array<[ReturnAction, number]> = [
  ['approve', 0], ['offerReturn', 0], ['decline', 0], ['partial', 0], ['refund', 2],
  ['message', 0], ['escalate', 4], ['provideRma', 9], ['receive', 11], ['label', 10],
]
const upload = { fileName: 'evidence.png', fileFormat: 'PNG', filePurpose: 'ITEM_RELATED' as const,
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII=' }

describe('Return 写动作复用既有演示店铺权限', () => {
  it.each(cases)('%s 在确认前无权限时不能准备请求，覆盖非售后动作', (action, index) => {
    const row = createReturnData()[index]!, before = JSON.stringify(row)
    activeAfterSaleActor.value = { ...afterSaleActors[0]!, shopIds: [] }
    expect(getReturnWritePermissionError(row)).toContain('权限')
    expect(getReturnBlockedReason(row, action, now)).toContain('权限')
    expect(prepareReturnAction(row, action, createReturnActionDraft(row, action), now)).toEqual({ error: '当前人员没有该店铺的办理权限' })
    expect(JSON.stringify(row)).toBe(before)
  })

  it.each(cases)('%s 先确认再撤权，在提交边界拒绝且不写申请或执行记录', (action, index) => {
    activeAfterSaleActor.value = afterSaleActors[0]!
    const row = createReturnData()[index]!, draft = createReturnActionDraft(row, action)
    draft.text = 'Please check this return.'; draft.reason = 'OTHER'; draft.partialAmount = '10.00'; draft.rmaNumber = 'DEMO-RMA'
    draft.label.labelAction = 'NO_LABEL'; draft.label.noLabelReason = noLabelReasons[0]!.value
    const prepared = prepareReturnAction(row, action, draft, now)
    expect(prepared.error).toBe('')
    expect(prepared.prepared).toBeDefined()
    const before = JSON.stringify(row), salesBefore = JSON.stringify(afterSaleRecords.value)
    activeAfterSaleActor.value = { ...afterSaleActors[0]!, shopIds: [] }
    expect(submitPreparedReturnAction(row, prepared.prepared!, now)).toContain('权限')
    expect(JSON.stringify(row)).toBe(before)
    expect(JSON.stringify(afterSaleRecords.value)).toBe(salesBefore)
  })

  it('附件上传也在写入前检查当前权限，不增加文件、日志或请求', () => {
    activeAfterSaleActor.value = afterSaleActors[0]!
    const row = createReturnData()[0]!, before = JSON.stringify(row)
    activeAfterSaleActor.value = { ...afterSaleActors[0]!, shopIds: [] }
    const result = uploadReturnAttachment(row, upload, now)
    expect(result).toEqual({ error: '当前人员没有该店铺的办理权限' })
    expect(JSON.stringify(row)).toBe(before)
  })

  it('按当前店铺范围校验，不让人员快照授权，也不把重发审核权限套到 Return 动作', () => {
    const row = createReturnData()[0]!, handlers = getReturnHandlerIds(row)
    activeAfterSaleActor.value = { ...afterSaleActors[1]!, shopIds: [] }
    expect(getReturnBlockedReason(row, 'message', now)).toContain('权限')
    expect(getReturnHandlerIds(row)).toEqual(handlers)
    activeAfterSaleActor.value = afterSaleActors[1]!
    expect(activeAfterSaleActor.value.canApprove).toBe(false)
    expect(getReturnBlockedReason(row, 'message', now)).toBe('')
    activeAfterSaleActor.value = afterSaleActors[2]!
    expect(getReturnWritePermissionError(row)).toBe('')
    expect(getReturnWritePermissionError(createReturnData()[1]!)).toContain('权限')
  })
})
