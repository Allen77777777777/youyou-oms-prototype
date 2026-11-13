import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentHandlerId, currentHandlerName, handlerOptions, serviceActorOptions } from '@/组件/客服处理人/处理人'
import { createReturnData, resetReturnSession, returnSession } from '../eBay退换货申请/数据'
import { createReturnActionDraft, prepareReturnAction } from '../eBay退换货申请/模型'
import { createReturnSaleDraft, prepareDirectSale, prepareReship, submitReturnAndSale } from '../eBay退换货申请/售后联动'
import { initializeAfterSaleDemo } from './演示数据'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords, approveReship, canViewAfterSale, createAfterSale, getReshipReviewDraft } from './会话'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'

const orderSnapshot = JSON.stringify(共享订单.value), executionSnapshot = JSON.stringify(仓库执行记录.value)
function reset() {
  afterSaleRecords.value = []
  共享订单.value = JSON.parse(orderSnapshot); 仓库执行记录.value = JSON.parse(executionSnapshot)
  activeAfterSaleActor.value = afterSaleActors[0]!
  currentHandlerId.value = 'staff-01'
  resetReturnSession()
}
beforeEach(reset)
afterEach(reset)

describe('退货申请与售后单共用实际操作身份', () => {
  it('全局客服切换与售后运营切换双向一致，身份资料不作为店铺授权', () => {
    for (const suffix of ['01', '02', '03']) {
      currentHandlerId.value = 'staff-' + suffix
      expect(activeAfterSaleActor.value).toMatchObject({ id: 'support-' + suffix, name: '客服' + suffix, canApprove: false })
      expect(currentHandlerName.value).toBe(activeAfterSaleActor.value.name)
    }
    activeAfterSaleActor.value = afterSaleActors[2]!
    expect(currentHandlerId.value).toBe('ops-02')
    expect(currentHandlerName.value).toBe('运营02')
    expect(canViewAfterSale({ shopId: 'shop-us' })).toBe(true)
    expect(canViewAfterSale({ shopId: 'demo-outdoor-uk' })).toBe(false)
    currentHandlerId.value = 'staff-unknown'
    expect(activeAfterSaleActor.value.canApprove).toBe(false)
    expect(canViewAfterSale({ shopId: 'shop-us' })).toBe(false)
    expect(handlerOptions.map(person => person.value)).toEqual(['staff-01', 'staff-02', 'staff-03'])
    expect(serviceActorOptions.some(person => person.value === 'ops-01')).toBe(true)
  })
  it('客服03同次平台提交与创建售后单使用同一姓名，后续切换不覆盖历史', () => {
    currentHandlerId.value = 'staff-03'
    const row = createReturnData()[0]!, now = '2026-11-04T03:00:00Z'
    const draft = createReturnActionDraft(row, 'partial')
    draft.text = 'Message to buyer'; draft.partialAmount = '10.00'
    const prepared = prepareReturnAction(row, 'partial', draft, now).prepared!
    const fields = { ...createReturnSaleDraft(row), reason: '破损', refundScope: '部分退款' as const }
    const result = submitReturnAndSale(row, prepared, prepareDirectSale(row, prepared, fields), now)
    expect(result.error).toBe('')
    const record = afterSaleRecords.value.find(sale => sale.no === result.no)!
    expect(row.lastSubmission?.operator).toBe('客服03')
    expect(record.createdBy).toBe('客服03')
    expect(record.logs?.[0]?.operator).toBe('客服03')
    activeAfterSaleActor.value = afterSaleActors[0]!
    expect(record.createdBy).toBe('客服03')
    expect(row.lastSubmission?.operator).toBe('客服03')
  })
  it('客服创建重发没有审核权，切换运营后按同一实际身份审核并保留创建人', () => {
    initializeAfterSaleDemo()
    const source = returnSession.records.find(row => row.id === 'DEMO-RT-001')!
    currentHandlerId.value = 'staff-03'
    const input = prepareReship(source, { ...createReturnSaleDraft(source), reason: '破损' })
    const record = createAfterSale(input).record!
    expect(record.createdBy).toBe('客服03')
    expect(approveReship(record.no).ok).toBe(false)
    activeAfterSaleActor.value = afterSaleActors[0]!
    expect(currentHandlerName.value).toBe('运营01')
    expect(approveReship(record.no, activeAfterSaleActor.value, getReshipReviewDraft(record)).ok).toBe(true)
    expect(record.reviewedBy).toBe('运营01')
    expect(record.createdBy).toBe('客服03')
    expect(record.logs?.find(log => log.action === '审核重发')?.operator).toBe(currentHandlerName.value)
  })
  it('同一身份权限收缩保留真实姓名并立即阻断办理', () => {
    activeAfterSaleActor.value = { ...afterSaleActors[1]!, shopIds: [] }
    expect(currentHandlerId.value).toBe('staff-01')
    expect(currentHandlerName.value).toBe('客服01')
    expect(canViewAfterSale({ shopId: 'shop-us' })).toBe(false)
  })
})
