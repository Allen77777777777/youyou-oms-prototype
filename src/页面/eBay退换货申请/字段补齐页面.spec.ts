import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { reactive } from 'vue'
import { ElIcon, ElMessage, ElTooltip } from 'element-plus'
import ReturnData from './退货资料.vue'
import Workbench from './退货详情工作台.vue'
import { createReturnData } from './数据'
import { applyReturnFull, getReturnDetail, parseReturnHistoryAttributes, submitReturnAction, syncReturn, type ReturnRecord } from './模型'
import { resetReturnViews } from './视图会话'

const wrappers: VueWrapper[] = []
const options = { components: { ElIcon, ElTooltip }, directives: { prototype: {} }, stubs: { BuyerMail: true } }
function data(row: ReturnRecord, area: 'status' | 'application' | 'refund' | 'shipping') {
  const wrapper = mount(ReturnData, { props: { row, area }, global: options })
  wrappers.push(wrapper)
  return wrapper
}
async function workbench(row: ReturnRecord) {
  resetReturnViews()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/ebay-service/returns/:shopId/:returnId', component: { template: '<div />' } }] })
  await router.push(`/oms/ebay-service/returns/${row.shopId}/${row.id}`)
  const wrapper = mount(Workbench, { props: { row }, global: { ...options, plugins: [router] } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount(); ElMessage.closeAll() })

describe('退货字段补齐的业务展示', () => {
  it('共享会话的报价与资金回查能保存独立来源对象，并与后续草稿隔离', () => {
    const now = '2026-11-03T03:00:00Z', offer = reactive(createReturnData()[0]!)
    expect(submitReturnAction(offer, 'partial', 'Offer ten dollars.', 10, '', now)).toBe('')
    expect(() => syncReturn(offer, now)).not.toThrow()
    expect(offer.outcome).toBe('confirmed')
    expect(offer.history[offer.history.length - 1]?.parsedAttributes?.partialRefundAmount).toEqual({ value: '10.00', currency: 'USD' })
    const refund = reactive(createReturnData()[2]!)
    expect(submitReturnAction(refund, 'refund', '', null, '', now)).toBe('')
    syncReturn(refund, now)
    expect(() => syncReturn(refund, now)).not.toThrow()
    expect(refund.detail!.refund.actualTotal).toEqual({ value: '29.50', currency: 'USD' })
    expect(refund.detail!.refund.fundings?.[0]?.amount?.value).toBe('29.50')
    refund.mock!.refundResult!.fundings![0]!.amount!.value = '1.00'
    expect(refund.detail!.refund.fundings?.[0]?.amount?.value).toBe('29.50')
  })
  it('实际退款、卖家扣款和多来源资金分别保留自己的币种，换汇资料可查看', async () => {
    const row = createReturnData()[6]!, wrapper = data(row, 'refund')
    await flushPromises()
    expect(wrapper.text()).toContain('USD 49.90')
    expect(wrapper.text()).toContain('CNY 354.29')
    expect(wrapper.text()).toContain('CNY 284.00')
    expect(wrapper.text()).toContain('CNY 70.29')
    expect(wrapper.text()).toContain('7.1')
    expect(wrapper.text()).toContain('2026-10-25 12:20:00')
    expect(getReturnDetail(row).refund.actualTotal).toEqual({ value: '49.90', currency: 'USD' })
  })

  it('资金来源备注和历史邮箱留作来源追溯，不出现在业务页面', async () => {
    const row = createReturnData()[6]!
    getReturnDetail(row).refund.fundings![0]!.fundingSource!.memo = 'PRIVATE-SOURCE-MEMO'
    const wrapper = data(row, 'refund')
    expect(wrapper.text()).not.toContain('PRIVATE-SOURCE-MEMO')
    row.history.push({ at: '2026-11-01T03:00:00Z', author: 'SELLER', attributes: { toEmailAddress: 'private@example.invalid' }, parsedAttributes: parseReturnHistoryAttributes({ toEmailAddress: 'private@example.invalid' }), text: '' })
    const page = await workbench(row)
    expect(page.text()).not.toContain('private@example.invalid')
  })

  it('商品级隐藏只遮盖申请商品，申请说明与原订单上下文仍独立', async () => {
    const row = createReturnData()[0]!
    const originalComment = getReturnDetail(row).buyerComment
    applyReturnFull(row, { detail: { itemDetail: { itemId: row.detail!.itemId, transactionId: row.detail!.transactionId, itemOnHold: true, itemTitle: 'HIDDEN-SOURCE-TITLE', itemPicUrl: 'https://example.invalid/hidden.png', returnQuantity: 1 }, returnContentOnHold: false } })
    const page = await workbench(row)
    expect(page.get('.return-item-panel').text()).toContain('平台已隐藏商品内容')
    expect(page.get('.return-item-panel').text()).not.toContain('HIDDEN-SOURCE-TITLE')
    expect(page.get('.return-item-panel').find('img').exists()).toBe(false)
    expect(page.get('.application-panel').text()).toContain(originalComment)
    expect(page.find('.application-order-context').exists()).toBe(true)
  })

  it('平台关闭期限与卖家介入时间窗并列展示，保持源时间的北京时间投影', () => {
    const row = createReturnData()[4]!, wrapper = data(row, 'status')
    expect(wrapper.text()).toContain('2026-11-20 16:00:00')
    expect(wrapper.text()).toContain('2026-10-28 08:00:00')
    expect(wrapper.text()).toContain('2026-11-21 07:59:59')
    expect(row.escalation.start).toBe('2026-10-28T00:00:00Z')
  })

  it('退回运费、两端地址、预计到达与来源错误各自呈现，不改送达事实', async () => {
    const row = createReturnData()[2]!, shipment = row.detail!.shipments[0]!
    shipment.errorCode = 'DEMO-CARRIER-ERROR'
    shipment.labelPrintExpired = true
    const wrapper = data(row, 'shipping')
    await flushPromises()
    expect(wrapper.text()).toContain('USD 4.20')
    expect(wrapper.text()).toContain('USD 3.50')
    expect(wrapper.text()).toContain('100 Example Road')
    expect(wrapper.text()).toContain('200 Sample Avenue')
    expect(wrapper.text()).toContain('2026-10-27 16:00:00')
    expect(wrapper.text()).toContain('2026-10-30 16:00:00')
    expect(wrapper.text()).toContain('DEMO-CARRIER-ERROR')
    expect(shipment.deliveryStatus).toBe('DELIVERED')
  })

  it('处理过程显示报价、扣减、历史RMA和运单内容，历史不授予办理资格', async () => {
    const row = createReturnData()[18]!, page = await workbench(row)
    const history = page.get('.return-history-panel')
    expect(history.text()).toContain('USD 10.00')
    expect(history.text()).toContain('USD 2.00')
    expect(page.findAll('.action-buttons button').find(button => button.text() === '发起退款')?.attributes('disabled')).toBeDefined()
    const other = createReturnData()[2]!, otherPage = await workbench(other)
    expect(otherPage.get('.return-history-panel').text()).toContain('DEMO-RMA-003')
    expect(otherPage.get('.return-history-panel').text()).toContain('DEMO-RETURN-003')
    expect(otherPage.get('.return-history-panel').text()).toContain('200 Sample Avenue')
  })
})
