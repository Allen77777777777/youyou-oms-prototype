import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import ReturnData from './退货资料.vue'
import { createReturnData } from './数据'
import { getReturnDetail } from './模型'
import { ebayActionUrl, siteWallTimeToISO } from './展示工具'

const wrappers: VueWrapper[] = []
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount() })

describe('平台资料展示语义', () => {
  it('买家、卖家与平台附件按提交方分组，删除资料不再提供原文件入口', async () => {
    const row = createReturnData()[0]!, detail = getReturnDetail(row)
    const file = (id: string, submitter: string, status: string) => ({ fileId: id, fileName: id + '.pdf', fileFormat: 'PDF', filePurpose: 'LABEL_RELATED', fileStatus: status, submitter, creationDate: row.createdAt, secureUrl: 'https://i.ebayimg.com/' + id + '.pdf' })
    detail.files = [file('buyer-visible', 'BUYER', 'PUBLISHED'), file('buyer-deleted', 'BUYER', 'DELETED'), file('seller-created', 'SELLER', 'CREATED'), file('ebay-visible', 'EBAY', 'PUBLISHED')]
    const wrapper = mount(ReturnData, { props: { row, area: 'aside' }, global: { directives: { prototype: {} } } }); wrappers.push(wrapper)
    const groups = wrapper.findAll('.attachment-group')
    expect(groups[0]!.text()).toContain('buyer-visible.pdf')
    expect(groups[0]!.text()).not.toContain('seller-created.pdf')
    expect(groups[1]!.text()).toContain('seller-created.pdf')
    expect(groups[1]!.text()).toContain('ebay-visible.pdf')
    expect(wrapper.get('[data-file-id="seller-created"]').text()).toContain('待关联')
    expect(wrapper.get('[data-file-id="buyer-deleted"]').text()).toContain('已移除')
    expect(wrapper.get('[data-file-id="buyer-deleted"]').find('a').exists()).toBe(false)
    await wrapper.get('[data-file-id="buyer-visible"] .file-name').trigger('click')
    await flushPromises()
    expect(document.querySelector<HTMLIFrameElement>('.preview-pdf')?.getAttribute('src')).toBe('https://i.ebayimg.com/buyer-visible.pdf')
  })

  it('资料读取失败不显示成没有附件，平台隐藏内容后关闭缓存文件入口', async () => {
    const row = reactive(createReturnData()[0]!), detail = getReturnDetail(row)
    detail.files = []
    detail.readStatus.files = { status: 'failed', error: '附件读取失败', attemptedAt: row.lastSyncedAt, succeededAt: null }
    const wrapper = mount(ReturnData, { props: { row, area: 'aside' }, global: { directives: { prototype: {} } } }); wrappers.push(wrapper)
    expect(wrapper.get('.attachments-panel').text()).toContain('附件情况待核实')
    expect(wrapper.get('.attachments-panel').text()).not.toContain('暂无附件')
    detail.files.push({ fileId: 'held-file', fileName: '隐藏文件.pdf', fileFormat: 'PDF', filePurpose: 'LABEL_RELATED', fileStatus: 'PUBLISHED', submitter: 'BUYER', creationDate: row.createdAt, secureUrl: 'https://i.ebayimg.com/held.pdf' })
    detail.contentOnHold = true
    await flushPromises()
    expect(wrapper.get('[data-file-id="held-file"]').find('a').exists()).toBe(false)
  })

  it('三类地址独立标示，缺退货地址不能用原订单地址兜底', () => {
    const row = createReturnData()[0]!, detail = getReturnDetail(row)
    detail.buyerAddress!.addressLine1 = 'Buyer Default Road'
    detail.orderAddress!.addressLine1 = 'Original Order Street'
    detail.sellerAddress = null
    const wrapper = mount(ReturnData, { props: { row, area: 'aside', orderAddress: detail.orderAddress }, global: { directives: { prototype: {} } } }); wrappers.push(wrapper)
    const cards = wrapper.findAll('.address-card')
    expect(cards[0]!.text()).toContain('买家默认收货地址')
    expect(cards[0]!.text()).toContain('Buyer Default Road')
    expect(cards[0]!.text()).not.toContain('Original Order Street')
    expect(cards[1]!.text()).toContain('原订单收货地址')
    expect(cards[1]!.text()).toContain('Original Order Street')
    expect(cards[2]!.text()).toContain('尚未取得')
    expect(cards[2]!.text()).not.toContain('Original Order Street')
  })
})

describe('站点时间输入与平台链接', () => {
  it.each([
    ['2026-03-08T01:30', 'America/Los_Angeles', '2026-03-08T09:30:00.000Z'],
    ['2026-03-08T03:30', 'America/Los_Angeles', '2026-03-08T10:30:00.000Z'],
    ['2026-10-30T10:15', 'Asia/Kathmandu', '2026-10-30T04:30:00.000Z'],
    ['2026-10-30T10:15', 'Europe/London', '2026-10-30T10:15:00.000Z'],
  ])('把%s作为%s当地时间，独立换算UTC', (wall, zone, expected) => {
    expect(siteWallTimeToISO(wall, zone)).toBe(expected)
  })
  it.each([
    ['2026-03-08T02:30', 'America/Los_Angeles'],
    ['2026-11-01T01:30', 'America/Los_Angeles'],
    ['2026-03-29T01:30', 'Europe/London'],
    ['2026-10-25T01:30', 'Europe/London'],
    ['2026-04-05T01:45', 'Australia/Lord_Howe'],
    ['2026-02-30T10:15', 'Asia/Shanghai'],
    ['2026-10-30T10:15', 'UNKNOWN_ZONE'],
  ])('拒绝缺失、重复或无效的站点墙钟%s %s', (wall, zone) => {
    expect(siteWallTimeToISO(wall, zone)).toBeNull()
  })
  it('缺站点、带偏移或含秒的输入不借用浏览器时区补齐', () => {
    expect(siteWallTimeToISO('2026-10-30T10:15')).toBeNull()
    expect(siteWallTimeToISO('2026-10-30T10:15:00', 'Asia/Shanghai')).toBeNull()
    expect(siteWallTimeToISO('2026-10-30T10:15+08:00', 'Asia/Shanghai')).toBeNull()
  })
  it.each(['https://www.ebay.com/return/123', 'https://www.ebay.co.uk/return/123', 'https://www.ebay.com.au/return/123', 'https://www.ebay.de/return/123'])('保留官方来源入口 %s', url => {
    expect(ebayActionUrl(url)).toBe(url)
  })
  it.each(['http://www.ebay.com/', 'https://www.ebay.com.evil.example/', 'https://fake-ebay.com/', 'https://ebay.co.uk.example.org/', 'https://name:pass@www.ebay.com/', 'javascript:alert(1)', '//www.ebay.com/', '/case/123', 'not a url', null])('拒绝非官方或不可安全导航入口 %s', url => {
    expect(ebayActionUrl(url)).toBe('')
  })
})
