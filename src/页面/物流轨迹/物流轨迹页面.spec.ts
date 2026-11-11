import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDialog, ElDrawer, ElMessage, ElPagination, ElRadioGroup } from 'element-plus'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import TrackingPage from './物流轨迹页面.vue'
import { createTrackingRecords } from './演示数据'
import { formatTrackingTime, trackingStatuses } from './模型'
import type { TrackingRecord } from './模型'

// 仅替换更多筛选的定位/传送外壳；浮层内业务筛选仍使用原组件事件和页面查询。
const PopoverShell = { name: 'ElPopover', props: ['visible'], template: '<div><slot name="reference" /><slot /></div>' }
let wrapper: VueWrapper
let downloads: Blob[]
const mainTable = () => wrapper.findAllComponents({ name: 'ElTable' })[0]!
const mainRows = () => mainTable().props('data') as TrackingRecord[]
const allCount = () => wrapper.get('.tracking-status-tabs button').text().replace(/\s/g, '')
async function button(text: string, scope: VueWrapper = wrapper) {
  const found = scope.findAll('button').find(node => node.text().trim() === text)
  if (!found) throw new Error(`找不到操作按钮：${text}`)
  await found.trigger('click'); await flushPromises()
}
async function stateTab(text: string) {
  const found = wrapper.findAll('.tracking-status-tabs button').find(node => node.text().trim().startsWith(text))
  if (!found) throw new Error(`找不到物流状态：${text}`)
  await found.trigger('click'); await flushPromises()
}
const dialog = (title: string) => wrapper.findAllComponents(ElDialog).find(item => item.props('title') === title)!
const dateType = () => wrapper.findAllComponents({ name: 'ElSelect' }).find(item => item.attributes('aria-label') === '物流轨迹日期类型')!
async function draftDate(field: string, day: string) {
  dateType().vm.$emit('update:modelValue', field)
  wrapper.findComponent(DateRange).vm.$emit('update:modelValue', [day, day])
  await flushPromises()
}
async function closeDetail() {
  wrapper.findComponent(ElDrawer).vm.$emit('update:modelValue', false)
  await flushPromises()
}
async function search(keyword: string) {
  wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', keyword)
  await flushPromises()
  await button('查询')
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob)
  })
}

beforeEach(() => {
  downloads = []
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:tracking-test' }),
    revokeObjectURL: vi.fn(),
  }))
  wrapper = mount(TrackingPage, { attachTo: document.body, global: {
    directives: { prototype: {} }, stubs: { FieldSearch: true, MultiFilter: true, DateRange: true, ElPagination: true, ElSelect: true, ElOption: true, ElPopover: PopoverShell, teleport: true },
  } })
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('物流轨迹工作台交互', () => {
  it('默认按订单下单日期不限范围，更多筛选内保留注册和同步条件', async () => {
    expect(wrapper.find('.tracking-heading').exists()).toBe(false)
    expect(dateType().props('modelValue')).toBe('orderPlacedAt')
    expect(wrapper.findComponent(DateRange).props('precision')).toBe('date')
    expect(wrapper.findComponent(DateRange).props('modelValue')).toBeNull()
    expect(allCount()).toBe('全部24')
    await wrapper.get('button[aria-label="更多筛选"]').trigger('click')
    const more = wrapper.get('.tracking-more-filters')
    for (const label of ['注册状态', '同步结果']) {
      const filter = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === label)!
      expect(more.element.contains(filter.element)).toBe(true)
    }
  })

  it('更多筛选保留传送子浮层的点击，外部关闭不应用草稿，查询才提交并关闭', async () => {
    const more = wrapper.get('button[aria-label="更多筛选"]')
    const popover = wrapper.findComponent({ name: 'ElPopover' })
    await more.trigger('click'); await flushPromises()
    expect(popover.props('visible')).toBe(true)
    expect(more.attributes('aria-expanded')).toBe('true')
    const sync = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '同步结果')!
    sync.vm.$emit('update:modelValue', ['pending'])
    await flushPromises()
    const childPopup = document.createElement('div'), popupButton = document.createElement('button'), outside = document.createElement('div')
    childPopup.className = 'el-popper'; childPopup.append(popupButton); document.body.append(childPopup, outside)
    try {
      popupButton.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await flushPromises()
      expect(popover.props('visible')).toBe(true)
      expect(allCount()).toBe('全部24')
      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await flushPromises()
      expect(popover.props('visible')).toBe(false)
      expect(more.attributes('aria-expanded')).toBe('false')
      expect(allCount()).toBe('全部24')
      await more.trigger('click'); await flushPromises(); await button('查询')
      expect(popover.props('visible')).toBe(false)
      expect(mainRows().map(row => row.id)).toEqual(['track-demo-12'])
    } finally { childPopup.remove(); outside.remove() }
  })

  it('筛选草稿不提前改变列表，查询应用筛选并重置到第一页，重置恢复全部', async () => {
    expect(allCount()).toBe('全部24')
    expect(mainRows()).toHaveLength(10)
    wrapper.findComponent(ElPagination).vm.$emit('update:current-page', 2)
    await flushPromises()
    expect(mainRows()[0]!.id).toBe('track-demo-11')
    wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', 'DEMO-17T-202611-003')
    await flushPromises()
    expect(allCount()).toBe('全部24')
    expect(mainRows()[0]!.id).toBe('track-demo-11')
    await button('查询')
    expect(mainRows().map(row => row.id)).toEqual(['track-demo-3'])
    expect(wrapper.findComponent(ElPagination).props('currentPage')).toBe(1)
    expect(allCount()).toBe('全部1')
    await button('重置')
    expect(allCount()).toBe('全部24')
    expect(mainRows()).toHaveLength(10)
  })

  it('平台与注册多选条件按查询应用，日期无效时保留上次范围和结果', async () => {
    const platform = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '平台')!
    platform.vm.$emit('update:modelValue', ['eBay'])
    await flushPromises()
    expect(allCount()).toBe('全部24')
    await button('查询')
    expect(mainRows().length).toBeGreaterThan(0)
    expect(mainRows().every(row => row.platform === 'eBay')).toBe(true)
    const appliedCount = allCount()
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-11-09 00:00:00'])
    await flushPromises(); await button('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('完整')
    expect(allCount()).toBe(appliedCount)
  })

  it('四种日期独立应用，缺所选时间不兜底，状态明细和CSV始终使用同一查询范围', async () => {
    await draftDate('orderPlacedAt', '2026-11-05')
    expect(allCount()).toBe('全部24')
    await button('查询')
    expect(allCount()).toBe('全部23')
    await button('导出查询结果')
    const ordered = await readBlob(downloads[0]!)
    expect(ordered.split('\r\n')).toHaveLength(24)
    expect(ordered).not.toContain('DEMO-17T-202611-011')
    expect(ordered).toContain('DEMO-17T-202611-022')

    await draftDate('shippedAt', '2026-11-06')
    expect(allCount()).toBe('全部23')
    await button('导出查询结果')
    expect(await readBlob(downloads[1]!)).toBe(ordered)
    await button('查询')
    expect(allCount()).toBe('全部23')
    await button('导出查询结果')
    const shipped = await readBlob(downloads[2]!)
    expect(shipped).toContain('DEMO-17T-202611-011')
    expect(shipped).not.toContain('DEMO-17T-202611-022')

    await draftDate('latestEventAt', '2026-11-09')
    await button('查询')
    expect(allCount()).toBe('全部15')
    await button('导出查询结果')
    const latest = await readBlob(downloads[3]!)
    expect(latest.split('\r\n')).toHaveLength(16)
    for (const missing of ['011', '016', '024']) expect(latest).not.toContain(`DEMO-17T-202611-${missing}`)

    await draftDate('lastSyncAt', '2026-11-08')
    expect(allCount()).toBe('全部15')
    await button('查询')
    expect(allCount()).toBe('全部2')
    expect(mainRows().map(row => row.id)).toEqual(['track-demo-13', 'track-demo-14'])
    await stateTab('成功签收')
    expect(mainRows().map(row => row.id)).toEqual(['track-demo-14'])
    await button('导出查询结果')
    const delivered = await readBlob(downloads[4]!)
    expect(delivered.split('\r\n')).toHaveLength(2)
    expect(delivered).toContain('DEMO-17T-202611-014')
    expect(delivered).not.toContain('DEMO-17T-202611-013')
    await wrapper.get('.tracking-latest[role="button"]').trigger('click'); await flushPromises()
    expect(wrapper.get('.tracking-detail-summary').text()).toContain('DEMO-PKG-014')
    await closeDetail(); await button('重置')
    expect(dateType().props('modelValue')).toBe('orderPlacedAt')
    expect(wrapper.findComponent(DateRange).props('modelValue')).toBeNull()
    expect(allCount()).toBe('全部24')
  })

  it('自然日筛选按北京日界限包含末秒，跨到次日零点的订单进入次日', async () => {
    // 只修改本次挂载的响应式记录；不变更演示数据源，也不使用其他字段作为时间兜底。
    const [beforeMidnight, atMidnight] = mainRows()
    beforeMidnight!.orderPlacedAt = '2026-11-04T15:59:59Z'
    atMidnight!.orderPlacedAt = '2026-11-04T16:00:00Z'
    await flushPromises(); await draftDate('orderPlacedAt', '2026-11-04')
    expect(allCount()).toBe('全部24')
    await button('查询')
    expect(mainRows().map(row => row.id)).toEqual(['track-demo-1'])
    expect(wrapper.get('.tracking-order-dates').text()).toContain('2026-11-04 23:59:59')
    await draftDate('orderPlacedAt', '2026-11-05')
    expect(mainRows().map(row => row.id)).toEqual(['track-demo-1'])
    await button('查询')
    expect(allCount()).toBe('全部22')
    expect(mainRows()[0]!.id).toBe('track-demo-2')
    expect(wrapper.findAll('.tracking-order-dates')[0]!.text()).toContain('2026-11-05 00:00:00')
  })

  it('平台订单号和履约单号按各包裹来源展示，同跟踪号不同运输商不串关联', async () => {
    await search('DEMO-17T-202611-018')
    const rows = mainRows()
    expect(rows.map(row => row.id)).toEqual(['track-demo-18', 'track-demo-19'])
    const references = wrapper.findAll('.tracking-reference-numbers')
    expect(references).toHaveLength(2)
    for (let index = 0; index < rows.length; index++) {
      const reference = references[index]!, row = rows[index]!, other = rows[1 - index]!
      expect(reference.text()).toContain(row.platformOrderNo)
      expect(reference.text()).toContain(row.fulfillmentNo)
      expect(reference.text()).not.toContain(other.platformOrderNo)
      expect(reference.text()).not.toContain(other.fulfillmentNo)
      expect(reference.findAll('button[aria-label="复制平台订单号"]')).toHaveLength(1)
      expect(reference.findAll('button[aria-label="复制履约单号"]')).toHaveLength(1)
    }
    expect(wrapper.get('.tracking-table-wrap').text()).toContain(rows[0]!.orderNo)
    expect(wrapper.get('.tracking-table-wrap').text()).toContain(rows[1]!.packageNo)
  })

  it('页签严格为全部加官方九态，无状态包裹留在全部，切状态不应用搜索草稿', async () => {
    const records = createTrackingRecords()
    const tabs = wrapper.findAll('.tracking-status-tabs button')
    expect(tabs).toHaveLength(10)
    expect(tabs.map(tab => tab.text().replace(/\s/g, '').replace(/\d+$/, ''))).toEqual(['全部', ...trackingStatuses.map(item => item.label)])
    expect(tabs.some(tab => tab.text().includes('待获取'))).toBe(false)
    expect(mainRows().some(row => row.status === null)).toBe(true)
    expect(allCount()).toBe('全部24')
    wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', 'nonexistent')
    await flushPromises(); await stateTab('查询不到')
    expect(mainRows().map(row => row.id)).toEqual(records.filter(row => row.status === 'NotFound').map(row => row.id))
    expect(mainRows().every(row => row.status === 'NotFound')).toBe(true)
    expect(allCount()).toBe('全部24')
  })

  it('同步结果独立筛选并保持草稿隔离，等待不归入查询不到', async () => {
    const sync = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '同步结果')!
    expect(sync.exists()).toBe(true)
    sync.vm.$emit('update:modelValue', ['pending'])
    await flushPromises()
    expect(allCount()).toBe('全部24')
    await button('查询')
    expect(mainRows().length).toBeGreaterThan(0)
    expect(mainRows().every(row => row.syncState === 'pending' && row.status === null)).toBe(true)
    await stateTab('查询不到')
    expect(mainRows()).toHaveLength(0)
    await button('重置')
    expect(allCount()).toBe('全部24')
    expect(sync.props('modelValue')).toEqual([])
  })

  it('取消注册确认不修改包裹，注册受理不产生物流状态、事件或成功同步时间', async () => {
    await search('DEMO-17T-202611-010')
    const row = mainRows()[0]!
    expect(row.subscription).toBe('unregistered')
    await button('注册跟踪')
    expect(dialog('注册物流跟踪').props('modelValue')).toBe(true)
    await button('取消', dialog('注册物流跟踪'))
    expect(row.subscription).toBe('unregistered')
    expect(row.logs).toHaveLength(0)
    await button('注册跟踪'); await button('确认注册', dialog('注册物流跟踪'))
    expect(row.subscription).toBe('registered')
    expect(row.status).toBeNull()
    expect(row.lastSyncAt).toBeNull()
    expect(row.providers).toHaveLength(0)
    expect(row.syncState).toBe('pending')
    expect(dialog('注册结果').text()).toContain('已受理')
    expect(dialog('注册结果').text()).toContain('等待轨迹')
  })

  it('批量注册逐项反馈受理与失败，缺失查询运输商不能冒充已注册', async () => {
    const subscription = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '注册状态')!
    subscription.vm.$emit('update:modelValue', ['unregistered', 'failed'])
    await flushPromises(); await button('查询')
    const chosen = mainRows().filter(row => row.subscription !== 'registered')
    mainTable().vm.$emit('selection-change', chosen)
    await flushPromises(); await button('批量注册')
    expect(dialog('注册物流跟踪').text()).toContain('2')
    await button('确认注册', dialog('注册物流跟踪'))
    expect(chosen.find(row => row.id === 'track-demo-10')!.subscription).toBe('registered')
    expect(chosen.find(row => row.id === 'track-demo-11')!.subscription).toBe('failed')
    const result = dialog('注册结果').text()
    expect(result).toContain('受理 1'); expect(result).toContain('失败 1')
    expect(result).toContain('运输商尚未明确')
    expect(wrapper.get('.tracking-selection').text()).toContain('0')
  })

  it('批量更新失败保留有效轨迹与成功同步时间，同时反馈成功和失败', async () => {
    wrapper.findComponent(ElPagination).vm.$emit('update:current-page', 2)
    await flushPromises()
    const chosen = mainRows().filter(row => ['track-demo-13', 'track-demo-14', 'track-demo-17'].includes(row.id))
    const failed = chosen.find(row => row.id === 'track-demo-14')!
    const previous = { status: failed.status, lastSyncAt: failed.lastSyncAt, events: JSON.stringify(failed.providers), timeMetrics: JSON.stringify(failed.timeMetrics), milestones: JSON.stringify(failed.milestones) }
    mainTable().vm.$emit('selection-change', chosen)
    await flushPromises(); await button('批量更新轨迹'); await button('确认更新', dialog('更新物流轨迹'))
    expect(failed.status).toBe(previous.status)
    expect(failed.lastSyncAt).toBe(previous.lastSyncAt)
    expect(JSON.stringify(failed.providers)).toBe(previous.events)
    expect(JSON.stringify(failed.timeMetrics)).toBe(previous.timeMetrics)
    expect(JSON.stringify(failed.milestones)).toBe(previous.milestones)
    expect(failed.syncState).toBe('failed')
    expect(dialog('更新结果').text()).toContain('失败 2')
    expect(dialog('更新结果').text()).toContain('取得缓存 1')
  })

  it('查询已受理但尚无轨迹的包裹只显示等待，不计入取得缓存', async () => {
    await search('DEMO-17T-202611-012')
    const row = mainRows()[0]!
    expect(row.syncState).toBe('pending')
    await button('更新轨迹'); await button('确认更新', dialog('更新物流轨迹'))
    expect(row.status).toBeNull()
    expect(row.lastSyncAt).toBeNull()
    const result = dialog('更新结果').text()
    expect(result).toContain('取得缓存 0')
    expect(result).toContain('等待轨迹 1')
    expect(result).toContain('失败 0')
  })

  it('最新轨迹区域支持单击和Enter，始终打开当前包裹的确切详情', async () => {
    await search('DEMO-17T-202611-003')
    await wrapper.get('.tracking-latest[role="button"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(ElDrawer).props('modelValue')).toBe(true)
    expect(wrapper.get('.tracking-detail-summary').text()).toContain('DEMO-17T-202611-003')
    expect(wrapper.get('.tracking-detail-summary').text()).toContain('DEMO-PKG-003')
    await closeDetail(); await button('重置'); await search('DEMO-17T-202611-008')
    await wrapper.get('.tracking-latest[role="button"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.findComponent(ElDrawer).props('modelValue')).toBe(true)
    expect(wrapper.get('.tracking-detail-summary').text()).toContain('DEMO-17T-202611-008')
    expect(wrapper.get('.tracking-detail-summary').text()).toContain('DEMO-PKG-008')
    expect(wrapper.get('.tracking-detail-summary').text()).not.toContain('DEMO-PKG-003')
    expect(wrapper.findAll('.tracking-metrics-panel strong').map(node => node.text())).toEqual(['3天', '2026-11-06 09:20:00', '2026-11-06 13:00:00', '2026-11-09 10:20:00'])
  })

  it('列表展示订单和本包发货时间，关联同订单的两个包裹仍保留独立发货时间', async () => {
    const source = createTrackingRecords()
    const pair = source.filter(row => ['track-demo-21', 'track-demo-22'].includes(row.id))
    expect(pair[0]!.orderPlacedAt).toBe(pair[1]!.orderPlacedAt)
    expect(pair[0]!.shippedAt).not.toBe(pair[1]!.shippedAt)
    wrapper.findComponent(FieldSearch).vm.$emit('update:field', 'orderNo')
    await flushPromises(); await search(pair[0]!.orderNo)
    expect(mainRows().map(row => row.id)).toEqual(pair.map(row => row.id))
    const dates = wrapper.findAll('.tracking-order-dates')
    expect(dates).toHaveLength(2)
    for (let index = 0; index < pair.length; index++) {
      expect(dates[index]!.text()).toContain(formatTrackingTime(pair[index]!.orderPlacedAt))
      expect(dates[index]!.text()).toContain(formatTrackingTime(pair[index]!.shippedAt))
    }
    expect(wrapper.findAll('.tracking-transit-days')).toHaveLength(2)
    expect(wrapper.findAll('.tracking-key-dates')).toHaveLength(2)
  })

  it('有效来源0天与缺失分别呈现，缺失运输天数和首次轨迹不补0或注册时间', async () => {
    await search('DEMO-17T-202611-002')
    expect(wrapper.get('.tracking-transit-days').text()).toBe('0天')
    await button('重置')
    await search('DEMO-17T-202611-010')
    expect(wrapper.get('.tracking-transit-days').text()).toContain('—')
    expect(wrapper.get('.tracking-transit-days').text()).not.toMatch(/0\s*天/)
    await button('查看轨迹')
    const metrics = wrapper.get('.tracking-metrics-panel')
    expect(metrics.text()).toContain('运输天数')
    expect(metrics.text()).toContain('首次轨迹')
    expect(metrics.text()).toContain('揽收')
    expect(metrics.text()).toContain('签收')
    expect(metrics.text()).not.toMatch(/0\s*天/)
    const relatedTab = wrapper.findAll('[role="tab"]').find(node => node.text() === '关联资料')!
    await relatedTab.trigger('click'); await flushPromises()
    const details = wrapper.get('.tracking-time-details')
    for (const label of ['运单时效', '妥投时效', '无更新天数', '预计投递']) expect(details.text()).toContain(label)
    expect(details.text()).not.toMatch(/0\s*天/)
  })

  it('轨迹详情按运输商保留分区，中文缺失回退原文，不猜未知来源时区', async () => {
    await search('DEMO-17T-202611-017'); await button('查看轨迹')
    expect(wrapper.findComponent(ElDrawer).props('modelValue')).toBe(true)
    expect(wrapper.findAll('.tracking-provider h3').map(node => node.text())).toEqual(['DHL Express', 'USPS'])
    expect(wrapper.findAll('.tracking-timeline li')).toHaveLength(5)
    wrapper.findComponent(ElDrawer).vm.$emit('update:modelValue', false)
    await flushPromises(); await button('重置'); await search('DEMO-17T-202611-016'); await button('查看轨迹')
    expect(wrapper.get('.tracking-event-time').text()).toContain('时区待核实')
    expect(wrapper.get('.tracking-event-time').text()).toContain('2026-11-09 08:20:00')
    const radios = wrapper.findAllComponents(ElRadioGroup)
    radios.find(item => item.attributes('aria-label') === '轨迹语言')!.vm.$emit('update:modelValue', 'zh')
    await flushPromises()
    expect(wrapper.get('.tracking-translation-fallback').text()).toBe('暂无中文，显示原文')
    radios.find(item => item.attributes('aria-label') === '轨迹时间')!.vm.$emit('update:modelValue', 'source')
    await flushPromises()
    expect(wrapper.get('.tracking-event-time time').text()).toContain('来源未提供时区')
  })

  it('导出查询结果包含全部匹配页，勾选后只导出所选包裹', async () => {
    await button('导出查询结果')
    const full = await readBlob(downloads[0]!)
    expect(full.split('\r\n')).toHaveLength(25)
    expect(full).toContain('DEMO-17T-202611-024')
    expect(full).toContain('本地虚构评审数据')
    for (const header of ['订单下单时间（北京时间）', '本包裹发货时间（北京时间）', '运输天数', '首次轨迹时间（北京时间）', '揽收时间', '签收时间', '运单时效', '妥投时效', '无更新天数', '预计到达区间']) expect(full.split('\r\n')[0]).toContain(`"${header}"`)
    mainTable().vm.$emit('selection-change', [mainRows()[0]!])
    await flushPromises(); await button('导出已选')
    const chosen = await readBlob(downloads[1]!)
    expect(chosen.split('\r\n')).toHaveLength(2)
    expect(chosen).toContain(mainRows()[0]!.number)
    expect(chosen).not.toContain('DEMO-17T-202611-024')
  })
})
