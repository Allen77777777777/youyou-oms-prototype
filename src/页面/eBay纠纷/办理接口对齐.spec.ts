import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { createAlignedDisputeData, disputeRecords, availableActions, findRecord, recheckRefundEligibility, refreshRecord, submitAction, validateAction } from './模型'
import { disputeShippingLocation } from './办理接口边界'
import { clearHandlingView } from './办理会话'
import { initializeDisputeContext, resolveDisputeOrder } from './客服关联'
import { 共享订单 } from '../订单处理/演示会话'
import Detail from './纠纷详情.vue'
import type { DisputeRecord } from './类型'

const record = (id: string): DisputeRecord => disputeRecords.value.find(row => row.id === id)!
beforeEach(() => { disputeRecords.value = createAlignedDisputeData() })
afterEach(() => { disputeRecords.value.forEach(clearHandlingView); ElMessage.closeAll() })

describe('逾期应答与退款回查的接口边界', () => {
  it('逾期未答复依最新choices办件，空选项、已答复、关闭和提交中各自阻断', () => {
    const row = record('DEMO-PD-114')
    expect(row.payment!.responseCode).toBe('SELLER_RESPONSE_OVERDUE')
    expect(availableActions(row)).toContain('ACCEPT')
    row.payment!.availableChoices = ['SELLER_ACCEPT']
    expect(availableActions(row)).toEqual(['ACCEPT'])
    row.payment!.availableChoices = []
    expect(availableActions(row)).toEqual([])
    delete row.payment!.availableChoices
    expect(availableActions(row)).toEqual([])
    row.payment!.availableChoices = ['SELLER_ACCEPT']
    row.payment!.responseCode = 'SELLER_CONTEST'
    expect(availableActions(row)).toEqual([])
    row.payment!.responseCode = 'SELLER_RESPONSE_OVERDUE'
    row.status = 'CLOSED'
    expect(availableActions(row)).toEqual([])
    row.status = 'ACTION_NEEDED'
    row.pending = { action: 'ACCEPT', draft: {} }
    expect(availableActions(row)).toEqual([])
  })
  it('退款明确失败先重新核验，不能因重查生成退款；再次提交与实际退款分开且不重复', () => {
    const row = record('DEMO-INR-120')
    expect(availableActions(row)).not.toContain('REFUND')
    expect(row.inquiry!.refunds).toEqual([])
    const oldBreakdown = row.inquiry!.refundEstimateBreakdown
    expect(recheckRefundEligibility(row)).toContain('重新核验')
    expect(row.inquiry!.refundEstimateBreakdown).not.toBe(oldBreakdown)
    expect(row.inquiry!.refundEstimateBreakdown?.netAmount?.value).toBe('22.40')
    expect(row.inquiry!.refunds).toEqual([])
    expect(availableActions(row)).toContain('REFUND')
    const revision = row.revision
    expect(submitAction(row, 'REFUND', {}, revision)).toBe('')
    expect(row.inquiry!.refundOutcome).toBe('UNKNOWN')
    expect(row.inquiry!.refunds).toEqual([])
    expect(availableActions(row)).toEqual([])
    expect(submitAction(row, 'REFUND', {}, revision)).toContain('版本')
    expect(refreshRecord(row)).toContain('退款和关闭')
    expect(row.inquiry!.refunds).toHaveLength(1)
    refreshRecord(row)
    expect(row.inquiry!.refunds).toHaveLength(1)
    expect(row.inquiry!.refundOutcome).toBe('COMPLETED')
    expect(row.operationLogs!.filter(log => log.action === '重新核验退款条件')).toHaveLength(1)
  })
  it('结果未知维持原尝试；明确平台拦截保留失败原因且不开放重试', () => {
    const unknown = record('DEMO-INR-121')
    const pending = unknown.pending
    expect(refreshRecord(unknown)).toContain('勿重复')
    refreshRecord(unknown)
    expect(unknown.pending).toBe(pending)
    expect(unknown.operationLogs).toHaveLength(1)
    expect(availableActions(unknown)).toEqual([])
    expect(recheckRefundEligibility(unknown)).toContain('不能')
    const blocked = record('DEMO-INR-122')
    expect(refreshRecord(blocked)).toContain('未成功')
    expect(blocked.pending).toBeNull()
    expect(blocked.inquiry!.refundFailure?.code).toBe('REFUND_BLOCKED_BY_PAYMENT_DISPUTE')
    expect(blocked.inquiry!.refundFailure?.retryable).toBe(false)
    expect(availableActions(blocked)).not.toContain('REFUND')
    expect(blocked.inquiry!.refunds).toEqual([])
  })
  it('其他承运商名称不能冒充代码，显式代码及名称均按请求保留', () => {
    const row = record('DEMO-INR-101')
    expect(validateAction(row, 'TRACKING', { trackings: [{ carrier: 'DPD', carrierCode: '', tracking: 'DEMO-T-1' }] })).toContain('代码')
    expect(validateAction(row, 'TRACKING', { trackings: [{ carrier: 'Other', carrierCode: 'UNSUPPORTED', tracking: 'DEMO-T-1' }] })).toContain('名称')
    expect(submitAction(row, 'TRACKING', { trackings: [{ carrier: 'Other', carrierCode: 'UNSUPPORTED', unsupportedCarrierName: ' Demo Carrier ', tracking: ' DEMO-T-1 ' }] }, row.revision)).toBe('')
    expect(row.inquiry!.trackings![0]).toMatchObject({ carrier: 'Demo Carrier', carrierCode: 'UNSUPPORTED', unsupportedCarrierName: 'Demo Carrier', tracking: 'DEMO-T-1' })
  })
})

describe('原订单标发定位', () => {
  it('只导航唯一匹配的同店原订单，重复或跨店不猜关联，不生成标发或出库', () => {
    const row = record('DEMO-PD-113')
    initializeDisputeContext(row, 'order')
    const order = resolveDisputeOrder(row, 共享订单.value)!
    const before = JSON.stringify(order)
    expect(disputeShippingLocation(row, [order])).toEqual({ path: '/oms/self-fulfillment/shipping-confirmation', query: { systemOrderNo: order.systemOrderNo } })
    expect(disputeShippingLocation(row, [order, { ...order, systemOrderNo: 'duplicate' }])).toBeUndefined()
    expect(disputeShippingLocation(row, [{ ...order, storeId: 'another-shop' }])).toBeUndefined()
    expect(JSON.stringify(order)).toBe(before)
  })
  it('详情可重新核验退款，逾期案显示可办操作，地址第二行和县郡进入本次提交', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    const dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{title}}</h2><slot/><slot name="footer"/></section>' }
    const wrapper = mount(Detail, { props: { record: record('DEMO-INR-120') }, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: dialog, ElTooltip: { inheritAttrs: false, template: '<slot/>' } } } })
    const click = async (text: string) => { const button = wrapper.findAll('button').find(item => item.text().trim() === text); expect(button, text).toBeTruthy(); await button!.trigger('click'); await flushPromises() }
    try {
      await click('重新核验退款条件')
      expect(wrapper.text()).toContain('全额退款')
      const row = record('DEMO-PD-114')
      delete row.payment!.availableChoices
      await wrapper.setProps({ record: row })
      expect(wrapper.get('[aria-label="纠纷办理操作栏"]').text()).toContain('尚未取得当前可选答复')
      expect(wrapper.findAll('button').some(button => button.text().trim() === '接受争议')).toBe(false)
      row.payment!.availableChoices = ['SELLER_ACCEPT_WITH_RETURN']
      if (!row.actions.includes('ACCEPT_RETURN')) row.actions.push('ACCEPT_RETURN')
      await wrapper.setProps({ record: row })
      await click('接受并要求退回')
      for (const [label, value] of Object.entries({ 收件人: 'Demo Desk', 联系电话: '0000000000', 街道地址: 'Demo Road', 地址第二行: 'Demo Unit', 县或郡: 'Demo County', 城市: 'Demo City', 国家: 'GB' })) {
        await wrapper.get(`input[aria-label="${label}"]`).setValue(value)
      }
      await click('确认内容')
      expect(wrapper.get('[role="dialog"]').text()).toContain('Demo Unit')
      expect(wrapper.get('[role="dialog"]').text()).toContain('Demo County')
      await wrapper.get('[role="dialog"] input[type="checkbox"]').setValue(true)
      await click('确认接受并要求退回')
      expect(findRecord(row.shopId, row.kind, row.id)!.pending!.draft.paymentReturnAddress).toMatchObject({ addressLine2: 'Demo Unit', county: 'Demo County' })
    } finally { wrapper.unmount() }
  })
})
