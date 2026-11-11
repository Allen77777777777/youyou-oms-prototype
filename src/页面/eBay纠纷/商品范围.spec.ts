import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import BusinessFacts from './纠纷业务资料.vue'
import { createDisputeData } from './数据'
import type { DisputeRecord } from './类型'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
const sample = (id: string) => createDisputeData().find(row => row.id === id)!
function render(record: DisputeRecord) {
  wrapper = mount(BusinessFacts, { props: { record, section: 'goods' }, global: { directives: { prototype: {} } } })
  return wrapper
}

describe('纠纷商品卡按当前对象范围展示', () => {
  it('未收到货请求逐行展示来源标题、行号和涉及数量，不用订单头代替多行', () => {
    const row = sample('DEMO-INR-101')
    row.title = '订单头的第一件摘要'
    row.quantity = 99
    row.sku = 'HEAD-SKU'
    row.inquiry!.lineItems = [
      { id: 'INQUIRY-A', orderLineId: 'ORDER-A', title: '本次请求商品甲', quantity: 2 },
      { id: 'INQUIRY-B', orderLineId: 'ORDER-B', title: '本次请求商品乙', quantity: null },
    ]
    const page = render(row)
    expect(page.get('h2').text()).toBe('本次请求涉及商品')
    const lines = page.findAll('.scoped-goods-row')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.text()).toContain('本次请求商品甲')
    expect(lines[0]!.text()).toContain('ORDER-A')
    expect(lines[0]!.text()).toContain('涉及数量2')
    expect(lines[1]!.text()).toContain('本次请求商品乙')
    expect(lines[1]!.text()).toContain('ORDER-B')
    expect(lines[1]!.text()).not.toContain('涉及数量')
    expect(page.text()).not.toContain('订单头的第一件摘要')
    expect(page.text()).not.toContain('99')
    expect(page.text()).not.toContain('HEAD-SKU')
  })
  it('单行也取来源涉及数量，跟踪保持在同卡独立分项', () => {
    const row = sample('DEMO-INR-101')
    row.quantity = 80
    row.inquiry!.lineItems![0]!.quantity = 3
    const page = render(row)
    expect(page.get('.scoped-goods-row').text()).toContain('涉及数量3')
    expect(page.text()).not.toContain('80')
    expect(page.text()).toContain(row.sku)
    expect(page.get('.request-tracking h3').text()).toBe('本次请求跟踪')
    expect(page.get('.request-tracking').text()).toContain('DEMO-GB-TRK-101')
  })
  it('支付争议逐行显示API商品编号和订单行，不从记录摘要补造数量', () => {
    const row = sample('DEMO-PD-113')
    const page = render(row)
    expect(page.get('h2').text()).toBe('本次争议涉及商品')
    expect(page.get('.goods-summary').text()).toContain('商品摘要')
    expect(page.text()).toContain('DEMO-ITEM-113')
    expect(page.text()).toContain('DEMO-LINE-113-1')
    expect(page.text()).toContain('DEMO-ITEM-113-B')
    expect(page.text()).toContain('DEMO-LINE-113-2')
    expect(page.findAll('.scoped-goods-row')).toHaveLength(2)
    expect(page.text()).not.toContain('涉及数量')
    expect(page.text()).not.toContain('× 2')
  })
  it('Case只保留当前来源申请摘要，不把关联订单当成本案商品范围', () => {
    const row = sample('DEMO-CASE-102')
    const page = render(row)
    expect(page.get('h2').text()).toBe('本案涉及商品')
    expect(page.get('.goods-summary').text()).toContain('来源申请商品摘要')
    expect(page.text()).toContain(row.title)
    expect(page.text()).toContain(row.sku)
    expect(page.text()).not.toContain(row.orderId)
  })
  it('支付明细没有摘要标题时仍展示已返回的涉及行，不补商品名和数量', () => {
    const row = sample('DEMO-PD-113')
    row.title = ''
    row.sku = ''
    row.quantity = null
    const page = render(row)
    expect(page.get('h2').text()).toBe('本次争议涉及商品')
    expect(page.findAll('.scoped-goods-row')).toHaveLength(2)
    expect(page.find('.goods-summary').exists()).toBe(false)
    expect(page.text()).not.toContain('涉及数量')
  })
})
