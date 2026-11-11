import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BusinessFacts from './纠纷业务资料.vue'
import CaseFunds from './案件资金结果.vue'
import RefundBreakdown from './退款明细.vue'
import Decisions from './请求材料与裁决.vue'
import { createDisputeData } from './数据'
import { enrichInquiryCaseAuditFixtures } from './退款与案件对齐样例'

const global = { directives: { prototype: {} } }
function records() {
  const rows = createDisputeData()
  enrichInquiryCaseAuditFixtures(rows)
  return rows
}

describe('纠纷退款与案件字段来源边界', () => {
  it('预计退款呈现平台分项和净额，不用总额替代净退款', () => {
    const record = records().find(row => row.id === 'DEMO-INR-116')!
    const view = mount(BusinessFacts, { props: { record, section: 'refund' }, global })
    const text = view.text()
    for (const value of ['GBP 23.90', '商品退款小计', 'GBP 20.90', '运费退款小计', 'GBP 3.00', '预计卖家净退款', 'GBP 23.00', '费用返还', 'GBP 0.90']) expect(text).toContain(value)
    expect(text).not.toContain('买家到账')
    view.unmount()
  })
  it('缺少分项不补零；来源明确的零金额仍显示', () => {
    const view = mount(RefundBreakdown, { props: { amounts: { netAmount: { currency: 'GBP', value: '0.00' } } } })
    expect(view.text()).toContain('GBP 0.00')
    for (const title of ['费用返还', 'eBay 保护承担', '计划向买家收回', '扣减合计']) expect(view.text()).not.toContain(title)
    expect(view.findAll('dd')).toHaveLength(1)
    view.unmount()
  })
  it('出资执行完成时间与执行结果分别保留，失败执行不显示为到账', () => {
    const record = records().find(row => row.id === 'DEMO-INR-117')!
    const execution = record.inquiry!.refunds![0]!.fundings![0]!.executions![0]!
    execution.stateCode = 'FAILED'; execution.stateText = '执行失败'
    const view = mount(BusinessFacts, { props: { record, section: 'refund' }, global })
    expect(view.text()).toContain('执行结束')
    expect(view.text()).toContain('执行失败')
    expect(view.text()).toContain('执行结束时间不代表买家到账时间')
    expect(view.text()).not.toContain('已到账')
    expect(view.text()).toContain('eBay 保护承担')
    expect(view.text()).toContain('计划收回金额不向卖家收取，不表示已收回')
    view.unmount()
  })
  it('案件争议额、实际扣款和返还保留各自币种，不生成合计', () => {
    const record = records().find(row => row.id === 'DEMO-CASE-118')!
    const view = mount(BusinessFacts, { props: { record, section: 'issue' }, global })
    for (const value of ['案件金额', 'USD 34.67', '卖家退款扣款', 'CAD 45.01', '费用返还', 'CAD 1.20']) expect(view.text()).toContain(value)
    expect(view.text()).not.toContain('合计')
    expect(view.get('[data-dispute-section="legacy-appeal"]').text()).toContain('申诉未获批准')
    expect(view.text()).toContain('DENIED')
    const funds = view.get('[data-dispute-section="case-funds"]')
    expect(funds.text()).toContain('折算前 USD 34.67')
    expect(funds.text()).toContain('汇率 1.29826')
    expect(funds.text()).toContain('出资成功')
    expect(funds.get('details.raw').text()).toContain('FUNDED')
    view.unmount()
  })
  it('案件缺少资金和申诉来源时不造结果区，来源零退款仍保留', () => {
    const absent = mount(CaseFunds)
    expect(absent.text()).toBe('')
    absent.unmount()
    const zero = mount(CaseFunds, { props: { appeal: { refundAmount: { value: '0.00', currency: 'GBP' } } } })
    expect(zero.text()).toContain('申诉退款金额GBP 0.00')
    expect(zero.text()).not.toContain('汇率')
    expect(zero.text()).not.toContain('折算前')
    zero.unmount()
  })
  it('案件暂缓不代表商品被屏蔽，受限信息仅按独立来源标记展示', async () => {
    const record = records().find(row => row.id === 'DEMO-CASE-102')!
    const view = mount(BusinessFacts, { props: { record, section: 'issue' }, global })
    expect(view.find('.content-limited').exists()).toBe(false)
    const restricted = records().find(row => row.id === 'DEMO-CASE-119')!
    await view.setProps({ record: restricted })
    expect(view.get('.content-limited').text()).toContain('平台限制展示部分商品资料')
    expect(view.text()).toContain('平台未明确买家关闭原因')
    view.unmount()
  })
  it('保留每轮裁决及复核原因原始码，不根据支持方推断代码', () => {
    const record = records().find(row => row.id === 'DEMO-CASE-112')!
    const view = mount(Decisions, { props: { record }, global })
    for (const code of ['DEMO_CREDIT_SELLER', 'DEMO_REFUND_BUYER', 'CONFIRMED_DELIVERY']) expect(view.text()).toContain(code)
    expect(record.caseInfo!.decisions).toHaveLength(2)
    view.unmount()
  })
})
