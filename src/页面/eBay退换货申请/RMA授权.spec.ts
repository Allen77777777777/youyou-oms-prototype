import { describe, expect, it } from 'vitest'
import { createReturnData } from './数据'
import { applyReturnSummary, buildReturnRequest, createReturnActionDraft, getReturnBlockedReason, getReturnDetail, prepareReturnAction, submitPreparedReturnAction, syncReturn, type ReturnRecord } from './模型'
import { applyRmaGraphqlQuery, canWaiveRma, demoRmaMutationResponse, resolveRmaGraphqlMutation, rmaWasWaived } from './RMA授权'

const now = '2026-11-11T08:00:00Z'
const row = () => createReturnData()[9]!
function start(record: ReturnRecord, number = '') {
  const draft = createReturnActionDraft(record, 'provideRma'); draft.rmaNumber = number
  const result = prepareReturnAction(record, 'provideRma', draft, now)
  expect(result.error).toBe('')
  expect(submitPreparedReturnAction(record, result.prepared!, now)).toBe('')
}

describe('新版 Return RMA 授权及编号留空', () => {
  it('留空明确豁免本次编号，参数走 variables，不向旧接口发送空号', () => {
    const record = row(), draft = createReturnActionDraft(record, 'provideRma')
    draft.rmaNumber = '   '; draft.text = '不应外发的旧隐藏草稿'
    const prepared = prepareReturnAction(record, 'provideRma', draft, now).prepared!
    expect(prepared.request.path).toBe('https://graphqlapi.ebay.com/graphql')
    expect(prepared.request.headers).toMatchObject({ 'X-EBAY-C-MARKETPLACE-ID': record.marketplaceId })
    expect(prepared.request.body.variables).toEqual({ input: { returnId: record.id, rmaRequirementWaived: true } })
    expect(prepared.request.body).not.toHaveProperty('decision')
    expect(prepared.request.body).not.toHaveProperty('comments')
    expect(prepared.draft.text).toBe('')
    expect(prepared.request.body.query).not.toContain(record.id)
    expect(record.status).toBe('WAITING_FOR_RMA')
    expect(rmaWasWaived(record)).toBe(false)
  })
  it('填号去除首尾空白且明确不豁免，最大100字符；号码不插入查询文本', () => {
    const record = row(), draft = createReturnActionDraft(record, 'provideRma')
    draft.rmaNumber = '  RMA-EXAMPLE-001  '
    const built = buildReturnRequest(record, 'provideRma', draft)
    expect(built.request?.body.variables).toEqual({ input: { returnId: record.id, rmaNumber: 'RMA-EXAMPLE-001', rmaRequirementWaived: false } })
    expect(built.request?.body.query).not.toContain('RMA-EXAMPLE-001')
    draft.rmaNumber = 'a'.repeat(101); expect(buildReturnRequest(record, 'provideRma', draft).error).toContain('100')
  })
  it('旧接口继续要求编号，已出现旧动作不授予新版资格', () => {
    const record = row(); delete record.detail!.rmaGraphql
    expect(canWaiveRma(record)).toBe(false)
    const draft = createReturnActionDraft(record, 'provideRma')
    expect(buildReturnRequest(record, 'provideRma', draft).error).toContain('请填写')
    draft.rmaNumber = 'RMA-OLD'
    expect(buildReturnRequest(record, 'provideRma', draft).request?.body).toEqual({ decision: 'PROVIDE_RMA', RMANumber: 'RMA-OLD', rMAProvided: true })
    const modern = row(); modern.detail!.rmaGraphql!.actions = []
    expect(modern.options).toContain('SELLER_PROVIDE_RMA')
    expect(getReturnBlockedReason(modern, 'provideRma')).not.toBe('')
    expect(buildReturnRequest(modern, 'provideRma', draft).request).toBeUndefined()
  })
  it.each(['shopId', 'returnId', 'marketplaceId'] as const)('绑定%s变化不允许跨身份办理', field => {
    const record = row(); record.detail!.rmaGraphql![field] = 'OTHER'
    expect(getReturnBlockedReason(record, 'provideRma')).toContain('不一致')
  })
  it.each(['disabled', 'failed', 'unknown', 'closed', 'future'] as const)('能力或读取%s时禁止办理及降级', kind => {
    const record = row(), source = record.detail!.rmaGraphql!
    if (kind === 'disabled') source.enabled = false
    else if (kind === 'failed' || kind === 'unknown') source.readStatus = kind
    else source.status = kind === 'closed' ? 'CLOSED' : 'FUTURE'
    expect(getReturnBlockedReason(record, 'provideRma')).not.toBe('')
    expect(buildReturnRequest(record, 'provideRma', createReturnActionDraft(record, 'provideRma')).request).toBeUndefined()
  })
  it('确认后当前新版资格变化必须重新确认', () => {
    const record = row(), prepared = prepareReturnAction(record, 'provideRma', createReturnActionDraft(record, 'provideRma')).prepared!
    record.detail!.rmaGraphql!.actions = []
    expect(submitPreparedReturnAction(record, prepared)).toContain('已变化')
    expect(record.pendingRequest).toBeUndefined()
  })
  it('受理不立即豁免，独立回查后只更新本申请，不改变店铺策略或地址', () => {
    const record = row(), address = structuredClone(record.detail!.sellerAddress), histories = record.history.length
    start(record)
    expect(record.outcome).toBe('pending'); expect(rmaWasWaived(record)).toBe(false)
    expect(record.status).toBe('WAITING_FOR_RMA')
    syncReturn(record, now)
    expect(record.outcome).toBe('confirmed'); expect(rmaWasWaived(record)).toBe(true)
    expect(record.detail!.rmaNumber).toBeNull(); expect(record.detail!.rmaRequired).toBe(true)
    expect(record.detail!.sellerAddress).toEqual(address)
    expect(record.history).toHaveLength(histories)
    expect(record.state).toBe('RETURN_LABEL_PENDING')
    expect(record.logs.some(log => log.text.includes('本次已免除编号要求'))).toBe(true)
    const count = record.logs.length; syncReturn(record, now); expect(record.logs).toHaveLength(count)
  })
  it('填号回查保留独立结果，不能当作豁免', () => {
    const record = row(); start(record, 'RMA-OK'); syncReturn(record, now)
    expect(record.outcome).toBe('confirmed'); expect(record.detail!.rmaNumber).toBe('RMA-OK'); expect(rmaWasWaived(record)).toBe(false)
  })
  it.each(['ProvideRmaNumberInputValidationError', 'ReturnActionNotPermittedError', 'ReturnNotFoundError'])('HTTP成功但%s仍是失败', typename => {
    const record = row(); record.mock = { rmaResponse: { data: { provideRmaNumber: { __typename: typename, errorCode: 'EXAMPLE' } } } }
    start(record); syncReturn(record, now)
    expect(record.outcome).toBe('failed'); expect(record.status).toBe('WAITING_FOR_RMA'); expect(rmaWasWaived(record)).toBe(false)
    expect(getReturnBlockedReason(record, 'provideRma')).not.toBe('')
  })
  it.each(['errors', 'empty', 'mismatch', 'multiple', 'wrongReturn'] as const)('%s结果保留待核查并禁止跨接口重试', kind => {
    const record = row(); start(record)
    const payload = demoRmaMutationResponse(record) as { data: { provideRmaNumber: Record<string, unknown> }; errors?: unknown[] }
    if (kind === 'errors') payload.errors = [{ message: 'EXAMPLE' }]
    if (kind === 'empty') payload.data.provideRmaNumber = {}
    if (kind === 'wrongReturn') payload.data.provideRmaNumber.returnId = 'OTHER'
    if (kind === 'mismatch') payload.data.provideRmaNumber.returnFulfillment = { rmaDetails: [{ rmaRequirementWaived: false, rmaNumber: 'OTHER' }] }
    if (kind === 'multiple') payload.data.provideRmaNumber.returnFulfillment = { rmaDetails: [{ rmaRequirementWaived: true }, { rmaRequirementWaived: true }] }
    record.mock = { rmaResponse: payload }
    syncReturn(record, now)
    expect(record.outcome).toBe('unknown'); expect(record.pendingRequest?.api).toBe('return-graphql')
    expect(record.status).toBe('WAITING_FOR_RMA'); expect(rmaWasWaived(record)).toBe(false)
    expect(getReturnBlockedReason(record, 'provideRma')).toContain('待核查')
  })
  it('读取错误清除当前资格；仅有买家动作、缺当前卖家动作均不放行', () => {
    const record = row(), context = { shopId: record.shopId, returnId: record.id, marketplaceId: record.marketplaceId!, enabled: true }
    expect(() => applyRmaGraphqlQuery(record, { errors: [{ message: 'EXAMPLE' }] }, context)).toThrow()
    expect(canWaiveRma(record)).toBe(false)
    applyRmaGraphqlQuery(record, { data: { orderReturn: { __typename: 'OrderReturn', returnId: record.id, status: { code: 'OPEN' }, sellerAvailableActions: null, buyerAvailableActions: { secondaryActions: [{ code: 'PROVIDE_RMA_NUMBER' }] } } } }, context)
    expect(canWaiveRma(record)).toBe(false)
  })
  it.each(['', 'RMA-CONFIRMED'])('已确认%s结果在查询失败后保留，成功时间不推进且旧资格不能重用', number => {
    const record = row(), context = { shopId: record.shopId, returnId: record.id, marketplaceId: record.marketplaceId!, enabled: true }
    start(record, number)
    expect(resolveRmaGraphqlMutation(record, demoRmaMutationResponse(record), now).outcome).toBe('confirmed')
    const confirmed = structuredClone(record.detail!.rmaGraphql!)
    const failedAt = '2026-11-11T08:05:00Z', failedAgainAt = '2026-11-11T08:06:00Z'
    expect(() => applyRmaGraphqlQuery(record, { errors: [{ message: 'EXAMPLE' }] }, context, failedAt)).toThrow()
    expect(record.detail!.rmaGraphql).toMatchObject({ readStatus: 'failed', status: confirmed.status, actions: [], details: confirmed.details, lastSuccessAt: now, lastAttemptAt: failedAt })
    expect(record.detail!.rmaNumber).toBe(number || null)
    expect(rmaWasWaived(record)).toBe(!number)
    expect(canWaiveRma(record)).toBe(false)
    expect(buildReturnRequest(record, 'provideRma', createReturnActionDraft(record, 'provideRma')).request).toBeUndefined()
    expect(() => applyRmaGraphqlQuery(record, { data: { orderReturn: {} } }, context, failedAgainAt)).toThrow()
    expect(record.detail!.rmaGraphql).toMatchObject({ details: confirmed.details, lastSuccessAt: now, lastAttemptAt: failedAgainAt })
  })
  it('查询恢复成功后才更新资格及成功时间，失败请求上下文不移植其他身份', () => {
    const record = row(), context = { shopId: record.shopId, returnId: record.id, marketplaceId: record.marketplaceId!, enabled: true }
    const payload = { data: { orderReturn: { __typename: 'OrderReturn', returnId: record.id, status: { code: 'OPEN' }, sellerAvailableActions: { secondaryActions: [{ code: 'PROVIDE_RMA_NUMBER' }] }, returnFulfillment: { rmaDetails: [{ rmaNumber: null, rmaRequirementWaived: true }] } } } }
    applyRmaGraphqlQuery(record, payload, context, now)
    expect(() => applyRmaGraphqlQuery(record, payload, { ...context, shopId: 'OTHER' }, '2026-11-11T08:05:00Z')).toThrow()
    expect(record.detail!.rmaGraphql!.shopId).toBe(record.shopId)
    expect(rmaWasWaived(record)).toBe(true)
    expect(canWaiveRma(record)).toBe(false)
    applyRmaGraphqlQuery(record, payload, context, '2026-11-11T08:06:00Z')
    expect(canWaiveRma(record)).toBe(true)
    expect(record.detail!.rmaGraphql).toMatchObject({ readStatus: 'success', lastSuccessAt: '2026-11-11T08:06:00Z', lastAttemptAt: '2026-11-11T08:06:00Z', error: '' })
  })
  it.each(['shopId', 'id', 'marketplaceId'] as const)('当前%s身份改变后读取失败，不继承旧编号或成功时间', field => {
    const record = row(); start(record, 'RMA-PREVIOUS')
    expect(resolveRmaGraphqlMutation(record, demoRmaMutationResponse(record), now).outcome).toBe('confirmed')
    record[field] = 'OTHER'
    const context = { shopId: record.shopId, returnId: record.id, marketplaceId: record.marketplaceId!, enabled: true }
    expect(() => applyRmaGraphqlQuery(record, { errors: [{ message: 'EXAMPLE' }] }, context, '2026-11-11T08:05:00Z')).toThrow()
    expect(record.detail!.rmaGraphql!.details).toEqual([])
    expect(record.detail!.rmaGraphql!.lastSuccessAt).toBeUndefined()
    expect(record.detail!.rmaNumber).toBeNull()
    expect(rmaWasWaived(record)).toBe(false)
    expect(canWaiveRma(record)).toBe(false)
  })
  it('旧 GraphQL 身份失效不清除当前独立来源的不同编号', () => {
    const record = row(); start(record, 'RMA-PREVIOUS')
    resolveRmaGraphqlMutation(record, demoRmaMutationResponse(record), now)
    record.shopId = 'OTHER'; record.detail!.rmaNumber = 'RMA-CURRENT-POST-ORDER'
    expect(() => applyRmaGraphqlQuery(record, {}, { shopId: record.shopId, returnId: record.id, marketplaceId: record.marketplaceId!, enabled: true })).toThrow()
    expect(record.detail!.rmaNumber).toBe('RMA-CURRENT-POST-ORDER')
  })
  it('Post-Order刷新后须独立复核新版资格，不沿用旧授权', () => {
    const record = row()
    expect(() => applyReturnSummary(record, {})).toThrow()
    expect(getReturnDetail(record).rmaGraphql?.readStatus).toBe('unknown')
    expect(canWaiveRma(record)).toBe(false)
  })
})
