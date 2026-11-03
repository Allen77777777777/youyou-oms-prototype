import { describe, expect, it } from 'vitest'
import { createReturnData, syncReturnList } from './数据'
import { addReturnNote, createReturnActionDraft, createReturnFilters, filterReturns, getReturnBlockedReason, getReturnCurrentTasks, inReturnQueue, knownReturnStates, prepareReturnAction, submitPreparedReturnAction, submitReturnAction, syncReturn, uploadReturnAttachment, validateReturnAction } from './模型'

const now = '2026-10-29T06:00:00Z'
describe('退换货申请操作边界', () => {
  it('未回查不能重复提交，提交和回查不覆盖已退款事实', () => {
    const row = createReturnData()[2]!
    expect(submitReturnAction(row, 'refund', '', null, '', now)).toBe('')
    expect(row.state).toBe('ITEM_DELIVERED')
    expect(row.actualRefund).toBeNull()
    expect(submitReturnAction(row, 'refund', '', null, '', now)).toContain('尚未回查')
    syncReturn(row, now)
    expect(row.state).toBe('REFUND_INITIATED'); expect(row.actualRefund).toBeNull()
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('不支持')
  })
  it('部分退款只形成报价，不伪造买家接受与退款', () => {
    const row = createReturnData()[0]!
    expect(submitReturnAction(row, 'partial', 'We can offer a partial refund.', 10, '', now)).toBe('')
    syncReturn(row, now)
    expect(row.state).toBe('PARTIAL_REFUND_REQUESTED'); expect(row.actualRefund).toBeNull()
    expect(row.logs[row.logs.length - 1]?.text).toContain('尚未退款')
  })
  it.each([0, -2, 49.9, 50, 1.111, NaN, Infinity])('拒绝非法部分退款金额 %s', amount => {
    expect(validateReturnAction(createReturnData()[0]!, 'partial', '', amount, '', now)).not.toBe('')
  })
  it('报价资格独立于预计承担额，未核验额度禁止报价；费用单不完整禁止退款', () => {
    const row = createReturnData()[0]!; row.estimatedRefund = NaN
    expect(getReturnBlockedReason(row, 'partial', now)).toBe('')
    row.detail!.refund.partialOfferLimitVerified = false
    expect(getReturnBlockedReason(row, 'partial', now)).toContain('额度尚未核实')
    row.options = ['SELLER_ISSUE_REFUND']; row.detail!.refund.itemsComplete = false
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('金额尚未确认')
  })
  it('未知结果同步后仍不放行，日志保留', () => {
    const row = createReturnData()[7]!; syncReturn(row, now)
    expect(row.outcome).toBe('unknown'); expect(row.logs).toHaveLength(2)
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('待核查')
  })
  it('升级同时检查卖家资格、起止窗口、原因与说明', () => {
    const row = createReturnData()[4]!
    expect(getReturnBlockedReason(row, 'escalate', now)).toBe('')
    expect(getReturnBlockedReason(row, 'escalate', '2026-10-27T06:00:00Z')).not.toBe('')
    expect(getReturnBlockedReason(row, 'escalate', '2026-11-22T06:00:00Z')).not.toBe('')
    expect(validateReturnAction(row, 'escalate', 'Please help.', null, 'NO_REFUND_RECEIVED', now)).toContain('卖家')
    expect(validateReturnAction(row, 'escalate', 'Resolved.', null, 'RESOLVED_WITH_BUYER', now)).toContain('卖家')
    expect(validateReturnAction(row, 'escalate', '', null, 'OTHER', now)).not.toBe('')
    row.escalation.eligible = false
    expect(getReturnBlockedReason(row, 'escalate', now)).not.toBe('')
  })
  it('已升级保留Return state，独立写入status和Case关联；缺Case ID仍禁止重复升级', () => {
    const row = createReturnData()[4]!, previous = row.state
    expect(submitReturnAction(row, 'escalate', 'Return parcel has not arrived.', null, 'ITEM_NOT_RECEIVED', now)).toBe('')
    expect(row.caseId).toBeNull(); syncReturn(row, now)
    expect(row.state).toBe(previous); expect(row.status).toBe('ESCALATED'); expect(row.caseId).toBeTruthy()
    row.caseId = null
    expect(inReturnQueue(row, 'case')).toBe(true)
    expect(getReturnBlockedReason(row, 'escalate', now)).toContain('已升级')
  })
  it('未知state、缺卖家能力、非退款诉求均不推定操作资格', () => {
    const row = createReturnData()[0]!
    row.state = 'FUTURE_STATE'; expect(getReturnBlockedReason(row, 'approve', now)).not.toBe('')
    row.state = 'RETURN_REQUESTED'; row.options = []; expect(getReturnBlockedReason(row, 'approve', now)).not.toBe('')
    row.options = ['SELLER_APPROVE_REQUEST']; row.returnType = 'REPLACEMENT'; expect(getReturnBlockedReason(row, 'approve', now)).toContain('不支持')
  })
  it('未来未知state或status进入待处理队列', () => {
    const row = createReturnData()[1]!
    expect(inReturnQueue(row, 'response')).toBe(false)
    row.state = 'FUTURE_RETURN_STATE'
    expect(inReturnQueue(row, 'response')).toBe(true)
    row.state = 'ITEM_SHIPPED'; row.status = 'FUTURE_RETURN_STATUS'
    expect(inReturnQueue(row, 'response')).toBe(true)
  })
  it('退款以当前平台资格和完整金额为准，不把本地收到布尔值当API硬条件', () => {
    const row = createReturnData()[2]!; row.received = false
    expect(getReturnBlockedReason(row, 'refund', now)).toBe('')
    row.options = []; row.received = true
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('不支持')
  })
  it('字段多行精确搜索与店铺、日期取交集；内部备注不改平台状态', () => {
    const records = createReturnData(), filters = createReturnFilters()
    filters.mode = 'exact'; filters.query = 'DEMO-RT-001\nDEMO-RT-002'; filters.shops = ['shop-us']; filters.dates = ['2026-10-27', '2026-10-27']
    expect(filterReturns(records, filters).map(row => row.id)).toEqual(['DEMO-RT-001'])
    const row = records[0]!, previous = row.state
    expect(addReturnNote(row, '  已联系买家  ', now)).toBe(''); expect(row.notes[0]?.text).toBe('已联系买家'); expect(row.state).toBe(previous)
  })
  it('报价回查后责任方转买家，旧卖家期限不沿用', () => {
    const row = createReturnData()[0]!
    submitReturnAction(row, 'partial', '', 10, '', now); syncReturn(row, now)
    expect(row.deadline).toBeNull(); expect(row.detail!.sellerDue).toBeNull()
    expect(getReturnCurrentTasks(row).map(task => task.party)).toEqual(['买家'])
  })
  it('每个已识别状态都恰有一个业务队列，平台关闭与结束Case进入关闭', () => {
    const row = createReturnData()[0]!
    for (const state of knownReturnStates) {
      row.state = state; row.status = 'RETURN_REQUESTED'
      expect(['response', 'processing', 'case', 'closed'].filter(queue => inReturnQueue(row, queue as never))).toHaveLength(1)
    }
    row.state = 'ITEM_DELIVERED'; row.status = 'CLOSED'; expect(inReturnQueue(row, 'closed')).toBe(true)
    row.status = 'ESCALATED'; row.detail!.caseClosed = true; expect(inReturnQueue(row, 'closed')).toBe(true); expect(inReturnQueue(row, 'case')).toBe(false)
  })
  it('RMA必需的批准后待办可继续办理，不一律转待面单', () => {
    const row = createReturnData()[0]!; row.detail!.rmaRequired = true
    submitReturnAction(row, 'approve', '', null, '', now); syncReturn(row, now)
    expect(row.state).toBe('RMA_PENDING'); expect(getReturnBlockedReason(row, 'provideRma', now)).toBe('')
    const draft = createReturnActionDraft(row, 'provideRma'); draft.rmaNumber = 'RMA-DEMO-A'
    const prepared = prepareReturnAction(row, 'provideRma', draft, now).prepared!
    expect(submitPreparedReturnAction(row, prepared, now)).toBe(''); syncReturn(row, now)
    expect(row.detail!.rmaNumber).toBe('RMA-DEMO-A'); expect(row.state).toBe('RETURN_LABEL_PENDING')
  })
  it('确认内容冻结金额与源资格；任何变更均须重新确认', () => {
    const row = createReturnData()[2]!, draft = createReturnActionDraft(row, 'refund'), prepared = prepareReturnAction(row, 'refund', draft, now).prepared!
    draft.refundItems[0]!.value = '0.01'
    expect(prepared.draft.refundItems[0]!.value).toBe('29.50')
    row.detail!.eligibilityVersion++
    expect(submitPreparedReturnAction(row, prepared, now)).toContain('已变化')
    const second = prepareReturnAction(row, 'refund', createReturnActionDraft(row, 'refund'), now).prepared!
    second.request.body.refundDetail = {}
    expect(submitPreparedReturnAction(row, second, now)).toContain('确认内容已变化')
  })
  it('来源明确失败与未知回查失败均可区分；未知成功不重复发消息', () => {
    const records = createReturnData(), success = records[13]!, failed = records[14]!
    syncReturn(success, now); expect(success.outcome).toBe('confirmed'); expect(success.history.filter(entry => entry.text === success.pendingText)).toHaveLength(1)
    syncReturn(success, now); expect(success.history.filter(entry => entry.text === success.pendingText)).toHaveLength(1)
    syncReturn(failed, now); expect(failed.outcome).toBe('failed'); expect(failed.submissionError).toContain('明确失败'); expect(getReturnBlockedReason(failed, 'refund', now)).toBe('')
  })
  it('明确拒绝保留请求快照及原因，不伪造平台沟通', () => {
    const row = createReturnData()[15]!, count = row.history.length
    expect(submitReturnAction(row, 'message', 'Hello', null, '', now)).toBe('')
    expect(row.outcome).toBe('failed'); expect(row.pendingRequest?.body).toEqual({ message: { content: 'Hello' } }); expect(row.history).toHaveLength(count)
  })
  it('部分读取失败保留字段及上次完整成功时间，不伪造来源更新时间', () => {
    const row = createReturnData()[16]!, before = JSON.stringify(row.detail!.refund), last = row.lastSyncedAt, sourceTime = row.updatedAt
    expect(syncReturn(row, now).status).toBe('partial'); expect(row.lastSyncedAt).toBe(last); expect(row.updatedAt).toBe(sourceTime)
    expect(JSON.stringify(row.detail!.refund)).toBe(before); expect(row.detail!.readStatus.summary.status).toBe('success'); expect(row.detail!.readStatus.detail.status).toBe('failed')
    expect(getReturnBlockedReason(row, 'partial', now)).toContain('详情资料')
  })
  it('没有本地提交也可读取平台自动推进，重复刷新不会重复事件', () => {
    const row = createReturnData()[17]!
    syncReturn(row, now); expect(row.state).toBe('ITEM_READY_TO_SHIP'); expect(row.outcome).toBe('idle')
    const count = row.history.length; syncReturn(row, now); expect(row.history).toHaveLength(count)
  })
  it('退款重试不会直接映射成新的issue_refund', () => {
    const row = createReturnData()[12]!
    expect(getReturnBlockedReason(row, 'refund', now)).toContain('来源平台入口')
    expect(prepareReturnAction(row, 'refund', createReturnActionDraft(row, 'refund'), now).prepared).toBeUndefined()
    expect(row.detail!.availableActions.find(item => item.actionType === 'SELLER_RETRY_REFUND')?.actionURL).toBeUndefined()
  })
  it('上传面单与提供面单两步独立；第二步失败不发布文件', () => {
    const row = createReturnData()[10]!, uploaded = uploadReturnAttachment(row, { fileName: 'label.png', fileFormat: 'PNG', filePurpose: 'LABEL_RELATED', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN2kAAAAASUVORK5CYII=' }, now)
    expect(uploaded.error).toBe(''); expect(uploaded.file?.fileStatus).toBe('CREATED')
    const draft = createReturnActionDraft(row, 'label'); draft.label.fileId = uploaded.file!.fileId
    row.mock = { resolve: 'failed' }
    const prepared = prepareReturnAction(row, 'label', draft, now).prepared!
    submitPreparedReturnAction(row, prepared, now); syncReturn(row, now)
    expect(row.outcome).toBe('failed'); expect(uploaded.file!.fileStatus).toBe('CREATED')
  })
  it('确认收到仅改变Return事实，不改变订单、原出库与库存上下文', () => {
    const row = createReturnData()[11]!, original = JSON.stringify([row.orderProducts, row.outbounds, row.omsStatus, row.shipped])
    expect(submitReturnAction(row, 'receive', 'Returned parcel received.', null, '', now)).toBe(''); syncReturn(row, now)
    expect(row.received).toBe(true); expect(JSON.stringify([row.orderProducts, row.outbounds, row.omsStatus, row.shipped])).toBe(original)
  })
  it('零申请店铺可发现首单，多次刷新去重，失败店铺与业务筛选无关', () => {
    const records = createReturnData()
    expect(records.some(row => row.shopId === 'demo-new-us')).toBe(false)
    expect(syncReturnList(records, ['demo-new-us'], now).added).toBe(1)
    expect(records.find(row => row.shopId === 'demo-new-us')?.detail?.orderAddress).toBeNull()
    expect(syncReturnList(records, ['demo-new-us'], now).added).toBe(0)
    expect(syncReturnList(records, ['demo-read-failed'], now).status).toBe('failed')
  })
  it('退款受理与后续资金成功或失败分别读取，实际金额来自独立来源快照', () => {
    const records = createReturnData(), success = records[2]!, failed = records[3]!
    for (const row of [success, failed]) { submitReturnAction(row, 'refund', '', null, '', now); syncReturn(row, now); expect(row.detail!.refund.status).toBe('PENDING'); expect(row.actualRefund).toBeNull() }
    success.detail!.refund.sellerEstimated = { value: '999.00', currency: 'USD' }; syncReturn(success, now)
    expect(success.detail!.refund.status).toBe('SUCCESS'); expect(success.actualRefund).toBe(29.5); expect(success.detail!.refund.actualItems).toHaveLength(1)
    syncReturn(failed, now); expect(failed.detail!.refund.status).toBe('FAILED'); expect(failed.actualRefund).toBeNull(); expect(failed.options).toContain('SELLER_RETRY_REFUND')
  })
  it('自动退款不把预计金额复制成实际金额，卖家与买家金额分别保留', () => {
    const row = createReturnData()[19]!; row.detail!.refund.sellerEstimated = { value: '999.00', currency: 'USD' }
    syncReturn(row, now); expect(row.detail!.refund.sellerActual?.value).toBe('45.00'); expect(row.detail!.refund.buyerActual?.value).toBe('49.90'); expect(row.detail!.refund.initiator).toBe('AUTO_REFUND')
  })
  it('面单发布回查保存对应运单，但不创造寄出或送达日期', () => {
    const row = createReturnData()[10]!, draft = createReturnActionDraft(row, 'label')
    draft.label.labelAction = 'MARK_AS_SENT'; draft.label.labelSentDate = now; draft.label.carrierEnum = 'USPS'; draft.label.trackingNumber = 'DEMO-RET-LABEL-001'
    const prepared = prepareReturnAction(row, 'label', draft, now).prepared!; submitPreparedReturnAction(row, prepared, now); syncReturn(row, now)
    expect(row.detail!.shipments[0]).toMatchObject({ trackingNumber: 'DEMO-RET-LABEL-001', carrierEnum: 'USPS', actualShipDate: null, actualDeliveryDate: null }); expect(row.tracking).toBe('DEMO-RET-LABEL-001')
  })
})
