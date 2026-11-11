import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDrawer, ElMessage, ElPagination } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import KpiPage from './客服KPI统计页面.vue'
import type { KpiData } from './统计模型'

vi.mock('./演示数据', () => {
  const data: KpiData = {
    asOf: '2026-11-06T10:00:00Z', coverageStart: '2026-09-30T16:00:00Z',
    staff: [{ id: 'a', name: '客服甲' }, { id: 'b', name: '客服乙' }],
    shops: [{ id: 'x', name: '家居美国店' }, { id: 'y', name: '户外英国店' }],
    conversations: [], workItems: [], tickets: [{ id: 'task', shopId: null, number: 'TASK-001', title: '核对内部资料' }], events: [],
  }
  for (let i = 0; i < 14; i++) {
    const id = `c-${i}`, minute = String(i).padStart(2, '0')
    data.conversations.push({ id, shopId: 'x', number: `MSG-${i}`, title: '核对包裹进度', owners: [{ at: '2026-11-01T00:00:00Z', staffId: 'a' }] })
    data.events.push({ id: `in-${i}`, kind: 'incoming', conversationId: id, messageId: `in-${i}`, at: `2026-11-01T01:${minute}:00Z` }, { id: `out-${i}`, kind: 'message', conversationId: id, messageId: `out-${i}`, at: `2026-11-01T02:${minute}:00Z`, source: 'human', purpose: 'reply', actorId: 'a', outcome: 'success' })
  }
  data.conversations.push(
    { id: 'shared', shopId: 'x', number: 'MSG-SHARED', title: '跨夜协作', owners: [{ at: '2026-11-02T12:00:00Z', staffId: 'a' }] },
    { id: 'y', shopId: 'y', number: 'MSG-Y', title: '退件确认', owners: [{ at: '2026-11-04T02:00:00Z', staffId: 'b' }] },
    { id: 'unknown', shopId: 'x', number: 'MSG-UNKNOWN', title: '旧记录缺少人员', owners: [] },
    { id: 'pending', shopId: 'x', number: 'MSG-PENDING', title: '跨月待回复', owners: [{ at: '2026-10-31T10:00:00Z', staffId: 'b' }] },
  )
  data.events.push(
    { id: 'shared-in', kind: 'incoming', conversationId: 'shared', messageId: 'shared-in', at: '2026-11-02T12:00:00Z' },
    { id: 'shared-auto', kind: 'message', conversationId: 'shared', messageId: 'shared-auto', at: '2026-11-02T12:01:00Z', source: 'automatic', purpose: 'reply', actorId: null, outcome: 'success' },
    { id: 'shared-out-a', kind: 'message', conversationId: 'shared', messageId: 'shared-out-a', at: '2026-11-03T01:00:00Z', source: 'human', purpose: 'reply', actorId: 'a', outcome: 'success' },
    { id: 'shared-out-b', kind: 'message', conversationId: 'shared', messageId: 'shared-out-b', at: '2026-11-03T01:05:00Z', source: 'human', purpose: 'reply', actorId: 'b', outcome: 'success' },
    { id: 'y-in', kind: 'incoming', conversationId: 'y', messageId: 'y-in', at: '2026-11-04T02:00:00Z' },
    { id: 'y-out', kind: 'message', conversationId: 'y', messageId: 'y-out', at: '2026-11-04T04:00:00Z', source: 'human', purpose: 'reply', actorId: 'b', outcome: 'success' },
    { id: 'unknown-in', kind: 'incoming', conversationId: 'unknown', messageId: 'unknown-in', at: '2026-11-05T00:00:00Z' },
    { id: 'unknown-out', kind: 'message', conversationId: 'unknown', messageId: 'unknown-out', at: '2026-11-05T01:00:00Z', source: 'human', purpose: 'reply', actorId: null, outcome: 'success' },
    { id: 'pending-in', kind: 'incoming', conversationId: 'pending', messageId: 'pending-in', at: '2026-10-31T10:00:00Z' },
    { id: 'pending-auto', kind: 'message', conversationId: 'pending', messageId: 'pending-auto', at: '2026-11-01T00:00:00Z', source: 'automatic', purpose: 'reply', actorId: null, outcome: 'success' },
    { id: 'task-done', kind: 'ticket', ticketId: 'task', at: '2026-11-05T07:00:00Z', actorId: 'a', state: 'completed' },
  )
  data.conversations.push({ id: 'previous', shopId: 'x', number: 'MSG-PREVIOUS', title: '上期已回复', owners: [] })
  data.events.push(
    { id: 'previous-in', kind: 'incoming', conversationId: 'previous', messageId: 'previous-in', at: '2026-10-27T01:00:00Z' },
    { id: 'previous-out', kind: 'message', conversationId: 'previous', messageId: 'previous-out', at: '2026-10-27T03:00:00Z', source: 'human', purpose: 'reply', actorId: 'a', outcome: 'success' },
  )
  data.workItems.push(
    { id: 'due-soon', shopId: 'x', type: 'cancellation', number: 'CAN-SOON', title: '临期取消', history: [{ id: 'due-soon-state', at: '2026-11-04T01:00:00Z', state: 'seller_action', dueAt: '2026-11-06T12:00:00Z', summary: '待卖家办理' }] },
    { id: 'due-later', shopId: 'y', type: 'dispute', number: 'DSP-LATER', title: '后续争议', history: [{ id: 'due-later-state', at: '2026-11-04T01:00:00Z', state: 'seller_action', dueAt: '2026-11-08T12:00:00Z', summary: '待卖家办理' }] },
    { id: 'overdue', shopId: 'x', type: 'return', number: 'RET-OVERDUE', title: '逾期待办', history: [{ id: 'overdue-state', at: '2026-11-04T01:00:00Z', state: 'seller_action', dueAt: '2026-11-06T09:00:00Z', summary: '待卖家办理' }] },
    { id: 'waiting', shopId: 'x', type: 'return', number: 'RET-WAITING', title: '等待买家', history: [{ id: 'waiting-state', at: '2026-11-04T01:00:00Z', state: 'waiting', dueAt: '2026-11-06T12:00:00Z', summary: '等待买家' }] },
  )
  return { demoKpiData: data, REVIEW_AS_OF: data.asOf }
})

let wrapper: VueWrapper
let downloads: Blob[]
const metric = (key: string) => wrapper.get(`[data-testid="metric-${key}"]`).text()
async function clickButton(label: string) {
  const button = wrapper.findAll('button').find(node => node.text().trim() === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  await button.trigger('click'); await flushPromises()
}
const mainRows = () => wrapper.findComponent({ name: 'ElTable' }).props('data') as Array<{ id: string; name: string; metrics: Record<string, number> }>
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob) })
}

beforeEach(() => {
  downloads = []
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:kpi-test' }), revokeObjectURL: vi.fn() }))
  wrapper = mount(KpiPage, { attachTo: document.body, global: { directives: { prototype: {} }, stubs: { DateRange: true, MultiFilter: true, teleport: true } } })
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('客服KPI统计页面交互', () => {
  it('中位、P90和个人样本共用真实响应集合，响应视图和完整汇总CSV一致', async () => {
    expect(wrapper.get('[data-testid="response-medianResponseMinutes"]').text()).toBe('1 小时')
    expect(wrapper.get('[data-testid="response-p90ResponseMinutes"]').text()).toBe('2 小时')
    expect(wrapper.get('[data-testid="response-responseSamples"]').text()).toBe('17')
    await wrapper.get('[data-testid="response-p90ResponseMinutes"]').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ElDrawer).text()).toContain('17 个响应样本')
    expect(wrapper.findComponent(ElDrawer).findComponent(ElPagination).props('total')).toBe(17)
    const responseRadio = wrapper.find('[role="radiogroup"][aria-label="统计内容"] input[value="response"]')
    await responseRadio.setValue(true); await flushPromises()
    expect(mainRows().find(row => row.id === 'a')!.metrics.responseSamples).toBe(15)
    expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(node => node.props('label'))).toContain('P90响应时长')
    await clickButton('导出统计')
    const csv = await blobText(downloads[0]!)
    expect(csv).toContain('"P90响应时长"'); expect(csv).toContain('"响应样本"')
  }, 15000)

  it('长等待分组只下钻匹配会话并导出，人员查询同步收窄分组和明细', async () => {
    await wrapper.get('[data-testid="waiting-bucket-24h-plus"]').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ElDrawer).text()).toContain('1 条记录')
    expect(wrapper.findComponent(ElDrawer).text()).toContain('MSG-PENDING')
    await clickButton('导出明细')
    const csv = await blobText(downloads[0]!)
    expect(csv).toContain('MSG-PENDING'); expect(csv).not.toContain('MSG-SHARED')
    wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '客服')!.vm.$emit('update:modelValue', ['a'])
    await flushPromises(); await clickButton('查询')
    expect(wrapper.get('[data-testid="waiting-bucket-24h-plus"]').text()).toContain('0')
    await wrapper.get('[data-testid="waiting-bucket-24h-plus"]').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(ElDrawer).findComponent(ElPagination).props('total')).toBe(0)
  }, 15000)

  it('平台临期仅店铺显示，24小时和全部范围不混入逾期或等待买家的事项', async () => {
    expect(wrapper.find('.kpi-due-panel').exists()).toBe(false)
    await clickButton('店铺统计')
    expect(wrapper.get('.kpi-due-panel').text()).toContain('CAN-SOON')
    expect(wrapper.get('.kpi-due-panel').text()).not.toContain('DSP-LATER')
    await clickButton('查看全部临期事项')
    expect(wrapper.findComponent(ElDrawer).text()).toContain('1 条记录')
    expect(wrapper.findComponent(ElDrawer).text()).not.toContain('RET-OVERDUE')
    await wrapper.get('input[value="all"]').setValue(true); await flushPromises()
    expect(wrapper.get('.kpi-due-list').text()).toContain('DSP-LATER')
    const items = wrapper.findAll('.kpi-due-list>button').map(node => node.text())
    expect(items[0]).toContain('CAN-SOON'); expect(items[1]).toContain('DSP-LATER')
    await clickButton('查看全部临期事项'); await clickButton('导出明细')
    const csv = await blobText(downloads[0]!)
    expect(csv).toContain('CAN-SOON'); expect(csv).toContain('DSP-LATER')
    expect(csv).not.toContain('RET-OVERDUE'); expect(csv).not.toContain('RET-WAITING')
  }, 15000)

  it('响应与逐日积压趋势按同范围导出，同期截至对齐且切客服清理自动回复选择', async () => {
    expect(wrapper.get('[data-testid="comparison-table"]').text()).toContain('前期值')
    expect(wrapper.get('.kpi-comparison-periods').text()).toContain('2026-10-31 18:00:00')
    await wrapper.get('select[aria-label="趋势指标"]').setValue('pendingReplies'); await flushPromises()
    expect(wrapper.get('svg[role="img"]').attributes('aria-label')).toBe('待人工回复每日趋势')
    await clickButton('导出趋势')
    const csv = await blobText(downloads[0]!)
    expect(csv).toContain('当日统计截至（北京）'); expect(csv).toContain('2026-11-06 18:00:00')
    expect(csv).toContain('P90响应时长（分钟）'); expect(csv).toContain('待人工回复')
    await clickButton('导出对比')
    const compareCsv = await blobText(downloads[1]!)
    expect(compareCsv).toContain('2026-10-26 至 2026-10-31'); expect(compareCsv).toContain('2026-10-31 18:00:00')
    await clickButton('店铺统计')
    await wrapper.get('select[aria-label="趋势指标"]').setValue('automaticMessages'); await flushPromises()
    await clickButton('客服统计')
    expect((wrapper.get('select[aria-label="趋势指标"]').element as HTMLSelectElement).value).toBe('humanMessages')
  }, 15000)
  it('客服草稿不提前生效，查询统一更新；店铺页签不应用隐藏的人员条件', async () => {
    expect(metric('humanMessages')).toBe('18')
    expect(metric('repliedConversations')).toBe('17')
    const staffFilter = wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '客服')!
    expect(staffFilter.props('options')).toContainEqual(expect.objectContaining({ value: '__unrecorded__' }))
    staffFilter.vm.$emit('update:modelValue', ['a']); await flushPromises()
    expect(metric('humanMessages')).toBe('18')
    await clickButton('查询')
    expect(metric('humanMessages')).toBe('15')
    expect(mainRows().map(row => row.id)).toEqual(['a'])
    await clickButton('店铺统计')
    expect(metric('humanMessages')).toBe('18')
    expect(metric('automaticMessages')).toBe('2')
    expect(wrapper.findAllComponents(MultiFilter).map(node => node.props('placeholder'))).toEqual(['店铺'])
    await clickButton('客服统计')
    expect(metric('humanMessages')).toBe('15')
    await clickButton('重置')
    expect(metric('humanMessages')).toBe('18')
  }, 15000)

  it('错误或缺边日期保留已查询结果，无业务日期耗时显示—', async () => {
    const dates = wrapper.findComponent(DateRange)
    dates.vm.$emit('update:modelValue', ['2026-11-06', '2026-11-01']); await flushPromises(); await clickButton('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('开始时间不能晚于结束时间')
    expect(metric('humanMessages')).toBe('18')
    dates.vm.$emit('update:modelValue', []); await flushPromises(); await clickButton('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('完整的统计日期')
    expect(metric('humanMessages')).toBe('18')
    dates.vm.$emit('update:modelValue', ['2026-12-01', '2026-12-02']); await flushPromises(); await clickButton('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('尚无可用数据')
    expect(metric('humanMessages')).toBe('18')
    dates.vm.$emit('update:modelValue', ['2026-10-01', '2026-10-02']); await flushPromises(); await clickButton('查询')
    expect(metric('humanMessages')).toBe('0'); expect(metric('averageResponseMinutes')).toBe('—')
    expect(wrapper.text()).toContain('当前范围暂无回复记录')
  }, 15000)

  it('下钻按聚合口径显示，平均耗时打开响应样本而非消息条数', async () => {
    await wrapper.get('[data-testid="metric-averageResponseMinutes"]').trigger('click'); await flushPromises()
    const drawer = wrapper.findComponent(ElDrawer)
    expect(drawer.props('modelValue')).toBe(true)
    expect(drawer.text()).toContain('17 个响应样本')
    const details = drawer.findComponent({ name: 'ElTable' }).props('data') as Array<{ durationMinutes: number }>
    expect(details.length).toBe(10)
    expect(details.some(row => row.durationMinutes === 780)).toBe(true)
    expect(drawer.findComponent(ElPagination).props('total')).toBe(17)
    await wrapper.get('[data-testid="metric-repliedConversations"]').trigger('click'); await flushPromises()
    expect(drawer.text()).toContain('17 条记录')
    expect(mainRows().reduce((sum, row) => sum + row.metrics.repliedConversations!, 0)).toBe(18)
  }, 15000)

  it('分页不截断导出，未应用店铺草稿不混入下钻与CSV', async () => {
    await wrapper.get('[data-testid="metric-humanMessages"]').trigger('click'); await flushPromises()
    const drawer = wrapper.findComponent(ElDrawer)
    expect(drawer.findComponent(ElPagination).props('total')).toBe(18)
    drawer.findComponent(ElPagination).vm.$emit('update:current-page', 2); await flushPromises()
    expect(drawer.findComponent({ name: 'ElTable' }).props('data')).toHaveLength(8)
    wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '店铺')!.vm.$emit('update:modelValue', ['y']); await flushPromises()
    const exportButton = drawer.findAll('button').find(node => node.text().trim() === '导出明细')!
    await exportButton.trigger('click'); await flushPromises()
    expect(downloads).toHaveLength(1)
    const text = await blobText(downloads[0]!)
    expect(text).toContain('"店铺范围","全部店铺"')
    expect(text).toContain('MSG-0'); expect(text).toContain('MSG-13'); expect(text).toContain('MSG-Y'); expect(text).toContain('MSG-UNKNOWN')
    expect(text.split('\r\n').filter(line => line.startsWith('"MSG-'))).toHaveLength(18)
    await clickButton('导出统计')
    const summary = await blobText(downloads[1]!)
    expect(summary).toContain('"客服甲"'); expect(summary).toContain('"客服乙"'); expect(summary).toContain('未记录')
    expect(summary).toContain('"统计截止","2026-11-06 18:00:00"')
  }, 15000)

  it('夜间回复记录呈现北京起止和13小时，自动回复未结束人工计时', async () => {
    await wrapper.get('[data-testid="metric-averageResponseMinutes"]').trigger('click'); await flushPromises()
    const drawer = wrapper.findComponent(ElDrawer)
    const recordButton = drawer.findAll('button').find(node => node.text() === 'MSG-SHARED')!
    await recordButton.trigger('click'); await flushPromises()
    expect(document.body.textContent).toContain('2026-11-02 20:00:00')
    expect(document.body.textContent).toContain('2026-11-03 09:00:00')
    expect(document.body.textContent).toContain('13 小时')
    expect(document.body.textContent).toContain('自动回复')
    expect(document.body.textContent).not.toContain('绩效等级')
  }, 15000)
})
