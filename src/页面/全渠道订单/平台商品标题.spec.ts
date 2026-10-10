import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import PlatformProductTitle from './平台商品标题.vue'
import WorkProductSummary from '../订单处理/作业商品摘要.vue'
import { 全渠道订单模拟数据 } from './模拟数据'
import { eBay订单模拟数据 } from '../eBay订单/模拟数据'
import type { 全渠道订单, 订单商品行 } from './类型'
import type { eBay订单, eBay订单商品 } from '../eBay订单/类型'

const 初始专业数据 = JSON.stringify(eBay订单模拟数据)
const 实例: VueWrapper[] = []
const 商品ID = '000123456789012345678901234'
const 变体ID = '000998877665544332211009988'

function 标准样例(): { order: 全渠道订单; item: 订单商品行 } {
  const order = structuredClone(全渠道订单模拟数据[0]!)
  order.systemOrderNo = 'OMS-DEMO-TITLE-TEST'
  order.professionalOrder = { routeName: 'oms-ebay-order-detail', sellerId: 'DEMO-TITLE-SELLER', orderId: 'DEMO-TITLE-ORDER' }
  const item: 订单商品行 = { ...structuredClone(order.items[0]!), externalLineId: `v1|${商品ID}|111222333`, platformItemId: 商品ID, platformItemTitle: '虚构平台商品标题', platformSku: 'DEMO-SKU-TITLE' }
  order.items = [item]
  return { order, item }
}

function 专业样例(item: 订单商品行): eBay订单 {
  const professional = structuredClone(JSON.parse(初始专业数据)[0]) as eBay订单
  professional.sellerId = 'DEMO-TITLE-SELLER'
  professional.orderId = 'DEMO-TITLE-ORDER'
  professional.items = [{ ...professional.items[0]!, lineItemId: item.externalLineId, itemId: item.platformItemId!, variationId: 变体ID, purchaseMarketplaceId: 'EBAY_US', listingMarketplaceId: 'EBAY_DE' }]
  return professional
}
function 打开(order: 全渠道订单, item: 订单商品行, attachTo?: HTMLElement) {
  const wrapper = mount(PlatformProductTitle, { attachTo, props: { order, item }, global: { directives: { prototype: {} } } })
  实例.push(wrapper)
  return wrapper
}
function 专业商品(商品: 订单商品行, 覆盖: Partial<eBay订单商品> = {}) {
  const 专业订单 = 专业样例(商品)
  Object.assign(专业订单.items[0]!, 覆盖)
  eBay订单模拟数据.splice(0, eBay订单模拟数据.length, 专业订单)
  return 专业订单
}

beforeEach(() => { eBay订单模拟数据.splice(0, eBay订单模拟数据.length) })
afterEach(() => {
  实例.splice(0).forEach(wrapper => wrapper.unmount())
  eBay订单模拟数据.splice(0, eBay订单模拟数据.length, ...JSON.parse(初始专业数据))
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('标准订单的 eBay 商品标题外链', () => {
  it('实际作业商品摘要展开后每行指向自己的商品，点击标题保留展开和来源事实', async () => {
    const { order, item } = 标准样例()
    const second: 订单商品行 = { ...structuredClone(item), externalLineId: 'DEMO-TITLE-SECOND-LINE', platformItemId: '000654321098765432109876543', platformItemTitle: '虚构第二行商品标题' }
    order.items = [item, second]
    const professional = 专业商品(item)
    professional.items.push({ ...professional.items[0]!, lineItemId: second.externalLineId, itemId: second.platformItemId!, variationId: undefined, listingMarketplaceId: 'EBAY_GB' })
    const 原事实 = JSON.stringify(order)
    const wrapper = mount(WorkProductSummary, { props: { order, sourceOrder: false }, global: { directives: { prototype: {} }, stubs: { ElTooltip: { template: '<span><slot /></span>' }, OrderProductImage: true } } })
    实例.push(wrapper)
    expect(wrapper.findAll('a.平台商品标题')).toHaveLength(1)
    expect(wrapper.get('a.平台商品标题').attributes('href')).toBe(`https://www.ebay.de/itm/${商品ID}?var=${变体ID}`)
    await wrapper.get('.展开商品').trigger('click')
    const rows = wrapper.findAll('.商品明细')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.get('a.平台商品标题').attributes('href')).toBe(`https://www.ebay.de/itm/${商品ID}?var=${变体ID}`)
    expect(rows[1]!.get('a.平台商品标题').attributes('href')).toBe(`https://www.ebay.co.uk/itm/${second.platformItemId}`)
    await rows[1]!.get('a.平台商品标题').trigger('click')
    expect(wrapper.get('.展开商品').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.商品明细')).toHaveLength(2)
    expect(JSON.stringify(order)).toBe(原事实)
    await wrapper.get('.展开商品').trigger('click')
    expect(wrapper.findAll('a.平台商品标题')).toHaveLength(1)
  })

  it('精确关联专业行后使用刊登站点和可信变体，保留长数字且原生新标签点击不冒泡', async () => {
    const { order, item } = 标准样例()
    item.platformItemTitle = '<b>虚构平台商品标题</b>'
    专业商品(item)
    const parent = document.createElement('div')
    document.body.append(parent)
    const 上级点击 = vi.fn()
    parent.addEventListener('click', 上级点击)
    const wrapper = 打开(order, item, parent)
    const link = wrapper.get('a.平台商品标题')
    expect(link.attributes('href')).toBe(`https://www.ebay.de/itm/${商品ID}?var=${变体ID}`)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')?.split(/\s+/).sort()).toEqual(['noopener', 'noreferrer'])
    expect(link.text()).toBe('<b>虚构平台商品标题</b>')
    expect(link.find('b').exists()).toBe(false)
    await link.trigger('click')
    expect(上级点击).not.toHaveBeenCalled()
    expect(order.items[0]!.platformItemId).toBe(商品ID)
  })

  it.each(['sellerId', 'orderId', 'lineItemId', 'itemId'] as const)('专业 %s 不匹配时只使用标准 Item ID，不串用站点或反拆订单行变体', (字段) => {
    const { order, item } = 标准样例()
    const professional = 专业商品(item)
    if (字段 === 'sellerId' || 字段 === 'orderId') professional[字段] = 'DEMO-MISMATCH'
    else professional.items[0]![字段] = 字段 === 'itemId' ? '999888777666' : 'DEMO-MISMATCH-LINE'
    const wrapper = 打开(order, item)
    expect(wrapper.get('a').attributes('href')).toBe(`https://www.ebay.com/itm/${商品ID}`)
    expect(wrapper.get('a').attributes('href')).not.toContain('var=')
  })

  it('没有专业引用时不通过同 SKU、订单行字符串或其他订单寻找变体', () => {
    const { order, item } = 标准样例()
    专业商品(item)
    order.professionalOrder = undefined
    const wrapper = 打开(order, item)
    expect(wrapper.get('a').attributes('href')).toBe(`https://www.ebay.com/itm/${商品ID}`)
    expect(wrapper.get('a').attributes('href')).not.toContain('111222333')
    expect(wrapper.get('a').attributes('href')).not.toContain(变体ID)
  })

  it('专业订单或专业商品行存在重复匹配时仅回退标准美国刊登页，不能取首条', () => {
    const { order, item } = 标准样例()
    const professional = 专业商品(item)
    eBay订单模拟数据.push(structuredClone(professional))
    const 重复订单 = 打开(order, item)
    expect(重复订单.get('a').attributes('href')).toBe(`https://www.ebay.com/itm/${商品ID}`)
    expect(重复订单.get('a').attributes('href')).not.toContain('var=')
    eBay订单模拟数据.splice(1, 1)
    professional.items.push(structuredClone(professional.items[0]!))
    const 重复商品 = 打开(order, item)
    expect(重复商品.get('a').attributes('href')).toBe(`https://www.ebay.com/itm/${商品ID}`)
    expect(重复商品.get('a').attributes('href')).not.toContain('var=')
  })

  it('专业来源非空站点未知则无链接，缺站点回退美国且非法变体降级为刊登页', () => {
    const { order, item } = 标准样例()
    专业商品(item, { listingMarketplaceId: 'EBAY_UK' })
    expect(打开(order, item).find('a').exists()).toBe(false)
    专业商品(item, { listingMarketplaceId: '  ', variationId: 'not-an-id' })
    const fallback = 打开(order, item)
    expect(fallback.get('a').attributes('href')).toBe(`https://www.ebay.com/itm/${商品ID}`)
    expect(fallback.get('a').attributes('href')).not.toContain('var=')
    专业商品(item, { listingMarketplaceId: 'EBAY_GB', variationId: 'not-an-id' })
    expect(打开(order, item).get('a').attributes('href')).toBe(`https://www.ebay.co.uk/itm/${商品ID}`)
  })

  it('标题或有效 Item ID 缺失时保留普通文本，不用 SKU、订单号或订单行补造商品地址', () => {
    const { order, item } = 标准样例()
    order.professionalOrder = undefined
    for (const id of [undefined, '', '0000', '123/456', '123?token=demo', '１２３４']) {
      const row = { ...item, platformItemId: id }
      const wrapper = 打开(order, row)
      expect(wrapper.find('a').exists()).toBe(false)
      expect(wrapper.text()).toContain('虚构平台商品标题')
    }
    const 无标题 = 打开(order, { ...item, platformItemTitle: '  ' })
    expect(无标题.find('a').exists()).toBe(false)
    expect(无标题.text()).toBe('商品标题未返回')
  })

  it('其他一期平台始终展示普通标题，保留内容且不套用 eBay 商品地址', () => {
    const { order, item } = 标准样例()
    专业商品(item)
    for (const platformCode of ['Temu', 'Mercado Libre', 'Coupang', 'OZON', 'TikTok Shop', 'Rakuten'] as const) {
      const wrapper = 打开({ ...order, platformCode }, item)
      expect(wrapper.find('a').exists()).toBe(false)
      expect(wrapper.text()).toBe(item.platformItemTitle)
    }
  })
})
