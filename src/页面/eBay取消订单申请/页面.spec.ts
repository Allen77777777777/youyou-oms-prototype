import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import Page from './eBay取消订单申请页面.vue'
import { cancellationSession as session } from './会话'
import { activityNames, cancelKey, createCancellations, formatCancelTime, stateNames, type CancelRecord } from './模型'
import { cancelReasonNames } from './原因映射'
import { mailSession, resetMailSession } from '../eBay站内信/会话'
import { mailboxEntries } from '../eBay站内信/邮箱模型'
import { relatedTickets, tickets } from '../工单管理/会话'
let wrapper: VueWrapper
const shell = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" :data-title="title"><header><slot name="header" title-id="test-detail-title" title-class="el-drawer__title" /></header><slot /><footer><slot name="footer" /></footer></section>' }
async function click(label: string, scope?: string | DOMWrapper<Element>) { const root = typeof scope === 'string' ? wrapper.get(scope) : scope || wrapper; const b = root.findAll('button').find(b => b.text().trim() === label); if (!b) throw new Error(`未找到 ${label}`); await b.trigger('click'); await flushPromises() }
function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  wrapper = mount(Page, { global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: shell, ElDialog: shell } } })
}
function listRows() { return wrapper.findAll('.cancel-table .el-table__row') }
it('只看我的切换到共同处理人仍显示同一张申请，第三位员工及未分配排除', async () => {
  const previous = currentHandlerId.value
  try {
    currentHandlerId.value = 'staff-01'
    await wrapper.get('.cancel-filters .el-checkbox input').setValue(true)
    const count = (id: string) => listRows().filter(row => row.text().includes(id)).length
    expect(count('CXL-DEMO-0011')).toBe(1)
    expect(count('CXL-DEMO-0008')).toBe(0)
    currentHandlerId.value = 'staff-02'
    await flushPromises()
    expect(count('CXL-DEMO-0011')).toBe(1)
    currentHandlerId.value = 'staff-03'
    await flushPromises()
    expect(count('CXL-DEMO-0011')).toBe(0)
  } finally { currentHandlerId.value = previous }
})
function rowFor(r: CancelRecord) { const row = listRows().find(row => row.text().includes(r.cancelId) && row.text().includes(r.shop)); if (!row) throw new Error('未找到申请行'); return row }
beforeEach(() => { session.records = createCancellations(); session.records.forEach(r => { if (r.dueAt) r.dueAt = '2099-10-30T09:30:00Z' }); mountPage() })
afterEach(() => { wrapper.unmount(); ElMessage.closeAll() })
describe('取消申请页面', () => {
  it('跨站点列表与详情固定北京时间，未知站点不影响可信时间且没有站点时区帮助', async () => {
    const first = session.records[0]!, second = session.records[1]!
    first.createdAt = '2026-11-05T16:00:00Z'
    second.createdAt = first.createdAt
    second.marketplaceId = 'UNKNOWN'
    second.site = '待核实站点'
    await flushPromises()
    expect(rowFor(first).text()).toContain('2026-11-06 00:00:00')
    expect(rowFor(second).text()).toContain('2026-11-06 00:00:00')
    expect(wrapper.find('.time-header').exists()).toBe(false)
    await click(second.cancelId, rowFor(second))
    expect(wrapper.get('.application-panel').text()).toContain('2026-11-06 00:00:00')
    expect(wrapper.get('.detail-meta').text()).toContain('待核实站点')
    expect(wrapper.text()).not.toContain('站点时区待')
    expect(first.createdAt).toBe('2026-11-05T16:00:00Z')
  })
  it('在取消申请行创建工单，详情可查看关联，保留平台申请和仓库状态', async () => {
    const row = session.records[1]!, before = tickets.value.slice()
    const original = JSON.stringify(row)
    const source = { kind: 'cancel' as const, id: row.cancelId, shopId: row.shopId, shopName: row.shop, summary: row.products[0]!.title }
    const count = relatedTickets(source).length
    try {
      await click('创建工单', rowFor(row))
      await wrapper.get('input[aria-label="工单事项"]').setValue('核对仓库是否已经出库')
      await click('创建', '[data-title="创建工单"]')
      expect(relatedTickets(source)[0]?.source).toEqual(source)
      await click(row.cancelId, rowFor(row))
      const toolbar = wrapper.get('.cancel-detail-actions')
      expect(toolbar.text()).toContain('创建工单')
      expect(toolbar.text()).toContain('关联工单（' + (count + 1) + '）')
      expect(JSON.stringify(row)).toBe(original)
    } finally { tickets.value = before }
  })
  it('从取消详情首发站内信，只在该店买家的发件箱产生外发记录', async () => {
    resetMailSession()
    const row = session.records[0]!
    const otherShopThread = mailSession.conversations.find(c => c.source === 'buyer' && c.buyerId === row.buyer)!
    const mailBuyer = 'verified-message-recipient'
    row.mailRecipient = { shopId: row.shopId, sourceBuyerId: row.buyer, username: mailBuyer }
    otherShopThread.buyerId = mailBuyer
    otherShopThread.shopId = 'other-shop'
    mailSession.conversations = [otherShopThread]
    const otherMail = JSON.stringify(otherShopThread)
    try {
      await click(row.cancelId)
      const state = row.cancelState, submission = row.submission
      const before = mailboxEntries(mailSession.conversations, 'outbox').length
      await click('发送站内信', '.cancel-buyer-mail')
      const dialog = wrapper.get('[data-title="联系买家"]')
      expect(dialog.text()).toContain(row.shop)
      expect(dialog.text()).toContain(mailBuyer)
      expect(mailSession.conversations).toHaveLength(1)
      const message = 'We are checking the shipment with the warehouse.'
      await dialog.get('textarea[aria-label="联系买家站内信正文"]').setValue(message)
      await click('发送站内信', '[data-title="联系买家"]')
      await vi.waitFor(() => {
        const entry = mailboxEntries(mailSession.conversations, 'outbox').find(item => item.message?.body === message)
        expect(entry?.conversation).toMatchObject({ shopId: row.shopId, buyerId: mailBuyer })
        expect(entry?.message).toMatchObject({
          kind: 'outgoing', delivery: 'success',
          originApplication: { kind: 'cancel', applicationId: row.cancelId, shopId: row.shopId, orderNo: row.orderId },
        })
      }, { timeout: 5000 })
      expect(mailboxEntries(mailSession.conversations, 'outbox')).toHaveLength(before + 1)
      expect(JSON.stringify(otherShopThread)).toBe(otherMail)
      expect(row).toMatchObject({ cancelState: state, submission })
      expect(wrapper.findAll('.buyer-mail-card')).toHaveLength(0)
    } finally {
      resetMailSession()
    }
  }, 20000)

  it('14种取消原因在列表和详情统一按原码翻译，旧显示文案不能覆盖来源', async () => {
    const reasons = Object.entries(cancelReasonNames)
    const records = session.records.slice(0, reasons.length)
    records.forEach((record, index) => { record.reasonCode = reasons[index]![0]; record.reason = '旧原因文案不得显示' })
    session.records = records
    await flushPromises()
    expect(listRows()).toHaveLength(14)
    for (const [index, [code, label]] of reasons.entries()) {
      const record = session.records[index]!
      expect(rowFor(record).text()).toContain(label)
      expect(rowFor(record).text()).not.toContain('旧原因文案不得显示')
      await click(record.cancelId, rowFor(record))
      const reason = wrapper.get('.application-panel').findAll('dt').find(dt => dt.text() === '取消原因')!.element.nextElementSibling!
      expect(reason.textContent).toBe(label)
      expect(wrapper.get('.application-panel').text()).not.toContain('旧原因文案不得显示')
      expect(wrapper.findAllComponents({ name: 'ElTooltip' }).filter(tooltip => tooltip.props('content') === code && tooltip.text() === label)).toHaveLength(2)
      expect(record.reasonCode).toBe(code)
      await click('关闭', '.drawer-footer')
    }
  }, 20000)
  it('原因缺失和未知新码在列表及详情同步更新，不回退旧中文', async () => {
    const record = session.records[0]!
    record.reason = '旧原因文案不得显示'
    await click(record.cancelId)
    for (const [code, label] of [['', '—'], ['UNKNOWN', '原因未知'], ['FUTURE_REASON', '原因待核实（FUTURE_REASON）']] as const) {
      record.reasonCode = code
      await flushPromises()
      const reason = wrapper.get('.application-panel').findAll('dt').find(dt => dt.text() === '取消原因')!.element.nextElementSibling!
      expect(reason.textContent).toBe(label)
      expect(rowFor(record).text()).toContain(label)
      expect(wrapper.get('.application-panel').text()).not.toContain('旧原因文案不得显示')
    }
  })
  it('CancelID查询只有提交后生效，重置恢复列表', async () => {
    expect(wrapper.text()).toContain('CancelID')
    await wrapper.get('input[aria-label="取消申请搜索内容"]').setValue('CXL-DEMO-0001')
    expect(listRows()).toHaveLength(16)
    await click('查询'); expect(listRows()).toHaveLength(1)
    await click('重置'); expect(listRows()).toHaveLength(16)
  })
  it('平台阶段为主状态，不显示内部提交结果列或待核查队列', () => {
    const headers = wrapper.findAll('.cancel-table th').map(h => h.text())
    expect(headers).toContain('平台处理状态'); expect(headers).not.toContain('提交结果')
    const tabs = wrapper.get('.cancel-queues').text()
    expect(tabs).toContain('待响应'); expect(tabs).not.toContain('待核查')
    const row = rowFor(session.records[0]!)
    expect(row.findAll('td')[4]!.get('.el-tag').text()).toBe(stateNames[session.records[0]!.cancelState])
    expect(row.text()).toContain('平台：'); expect(row.text()).toContain('OMS：')
    expect(wrapper.text()).not.toContain('北京时间'); expect(wrapper.text()).not.toContain('最近同步')
  })
  it('新增平台处理状态多选在查询后才按cancelState生效', async () => {
    const filter = wrapper.findAllComponents(MultiFilter).find(c => c.props('placeholder') === '平台处理状态')!
    filter.vm.$emit('update:modelValue', ['CLOSED']); await flushPromises()
    expect(listRows()).toHaveLength(16)
    await click('查询'); expect(listRows()).toHaveLength(session.records.filter(r => r.cancelState === 'CLOSED').length)
    expect(listRows().every(row => row.text().includes(stateNames.CLOSED!))).toBe(true)
  })
  it('批准须确认说明，处理后平台阶段等待刷新，不通过本地结果切换', async () => {
    await click('CXL-DEMO-0001'); await click('同意取消')
    await click('确认同意'); expect(wrapper.text()).toContain('请填写 1～500 字的内部处理说明')
    await wrapper.get('textarea[aria-label="取消申请处理说明"]').setValue('已核对无仓库执行与实际出库')
    await click('确认同意'); expect(session.records[0]!.submission).toBe('submitted'); expect(session.records[0]!.cancelState).toBe('APPROVAL_PENDING')
    expect(wrapper.get('.detail-drawer-header').text()).toContain('刷新数据'); expect(wrapper.get('.drawer-footer').text()).not.toContain('刷新数据'); expect(wrapper.get('.drawer-footer').text()).not.toContain('核查结果')
    await click('刷新数据', '.detail-refresh'); expect(session.records[0]!.cancelState).toBe('REFUND_PENDING'); expect(session.records[0]!.shipped).toBe(0)
  })
  it('详情无分区页签，订单商品和多仓出库连续展示且不补缺', async () => {
    await click('CXL-DEMO-0002')
    expect(wrapper.find('.detail-tabs').exists()).toBe(false)
    const context = wrapper.get('.order-context')
    expect(context.text()).toContain('OMS-DEMO-CXL-0002'); expect(context.text()).toContain('未开始履约')
    expect(wrapper.get('.detail-main').text()).toContain('整单商品')
    const outboundRows = wrapper.findAll('.outbound-context-table .el-table__row')
    expect(outboundRows).toHaveLength(2)
    expect(outboundRows[0]!.text()).toContain('WINIT-DEMO-CXL-0002-A'); expect(outboundRows[0]!.text()).toContain('英国标准配送')
    expect(outboundRows[1]!.text()).toContain('4PX · 英国仓'); expect(outboundRows[1]!.text()).toContain('英国经济配送'); expect(outboundRows[1]!.text()).toContain('下单中')
    expect(outboundRows[1]!.findAll('td')[0]!.text()).toMatch(/^—/)
    expect(wrapper.get('.drawer-footer').findAll('button').find(b => b.text() === '同意取消')!.attributes('disabled')).toBeDefined()
  })
  it('切换申请不沿用前单关联，未知和已确认无出库单分别展示', async () => {
    await click('CXL-DEMO-0001'); expect(wrapper.get('.outbound-panel').text()).toContain('GC-DEMO-CXL-0001')
    await click('关闭', '.drawer-footer'); await click('CXL-DEMO-0008')
    expect(wrapper.get('.outbound-empty').text()).toBe('三方仓出库单关联信息待核实')
    expect(wrapper.get('.outbound-panel').text()).not.toContain('GC-DEMO-CXL-0001')
    await click('关闭', '.drawer-footer'); await click('CXL-DEMO-0004')
    expect(wrapper.get('.outbound-empty').text()).toBe('暂无关联三方仓出库单')
  })
  it('平台过程只显示来源活动，内部操作独立折叠且时间按记录格式化', async () => {
    const r = session.records[0]!
    r.logs.unshift({ at: '2026-10-29T10:00:00Z', text: '仅内部操作证据' })
    await click(r.cancelId)
    expect(wrapper.get('.platform-history').findAll('li')).toHaveLength(r.activityHistories.length)
    const first = r.activityHistories[0]!
    expect(wrapper.get('.platform-history').text()).toContain(activityNames[first.activityType] || '平台事件待核实')
    expect(wrapper.get('.platform-history').text()).toContain(formatCancelTime(first.actionDate, r))
    expect(wrapper.get('.platform-history').text()).not.toContain('仅内部操作证据')
    expect(wrapper.get('.internal-records').attributes('open')).toBeUndefined()
    expect(wrapper.get('.internal-records').text()).toContain('仅内部操作证据')
    expect(wrapper.get('.operation-logs-panel').text()).toContain('操作日志')
    expect(wrapper.get('.operation-logs-panel').text()).toContain('操作人：未记录')
    expect(wrapper.find('.cancel-buyer-mail').exists()).toBe(true)
  })
  it('历史备注在独立卡片保留正文和已知人员时间，缺失资料不补造且日志不复制正文', async () => {
    const r = session.records[0]!
    r.notes = [
      { text: '最近的内部核查结论', author: '客服小林', at: '2026-10-29T10:00:00Z' },
      '旧纯文本备注原文',
      { text: '旧空资料备注', author: ' ', at: '' },
    ]
    const original = JSON.stringify(r.notes)
    await click(r.cancelId)
    const notes = wrapper.get('.internal-notes-panel'), entries = notes.findAll('.note-row')
    expect(entries.map(entry => entry.get('p').text())).toEqual(['最近的内部核查结论', '旧纯文本备注原文', '旧空资料备注'])
    expect(entries[0]!.get('small').text()).toContain('操作人：客服小林')
    expect(entries[0]!.get('small').text()).toContain(formatCancelTime('2026-10-29T10:00:00Z', r))
    for (const entry of entries.slice(1)) expect(entry.get('small').text()).toBe('操作人：未记录 · 时间：未记录')
    expect(wrapper.get('.operation-logs-panel').text()).not.toContain('旧纯文本备注原文')
    expect(notes.find('.service-operation-logs').exists()).toBe(false)
    expect(JSON.stringify(r.notes)).toBe(original)
  })
  it('实际退款使用独立币种，缺失币种不取订单币种补齐', async () => {
    const r = session.records[4]!
    r.currency = 'USD'; r.actualRefundAmount = 7.25; r.actualRefundCurrency = 'EUR'
    await click(r.cancelId)
    const amount = () => wrapper.get('.application-panel').findAll('dt').find(dt => dt.text() === '实际退款金额')!.element.nextElementSibling!.textContent
    expect(amount()).toBe('EUR 7.25')
    r.actualRefundCurrency = undefined; await flushPromises(); expect(amount()).toBe('—')
    expect(wrapper.get('.application-panel').text()).toContain('退款时间')
    expect(wrapper.get('.application-panel').text()).not.toContain('退款发起时间')
  })
  it('相同CancelID跨店铺选择刷新和确认处理隔离', async () => {
    const original = session.records[0]!, second: CancelRecord = { ...JSON.parse(JSON.stringify(original)), shopId: 'shop-collision-demo', shop: '另一个虚构店铺', buyer: 'buyer_collision_demo', orderId: 'ORDER-COLLISION-DEMO' }
    session.records.push(second); await flushPromises()
    expect(cancelKey(second)).not.toBe(cancelKey(original))
    const firstLogs = original.logs.length, secondLogs = session.records[session.records.length - 1]!.logs.length, firstSynced = original.lastSyncedAt
    session.records[session.records.length - 1]!.lastSyncedAt = '2000-01-01T00:00:00Z'
    wrapper.findComponent({ name: 'ElTable' }).vm.$emit('selection-change', [session.records[session.records.length - 1]!]); await flushPromises(); await click('刷新所选')
    expect(original.logs).toHaveLength(firstLogs); expect(session.records[session.records.length - 1]!.logs).toHaveLength(secondLogs)
    expect(original.lastSyncedAt).toBe(firstSynced); expect(session.records[session.records.length - 1]!.lastSyncedAt).not.toBe('2000-01-01T00:00:00Z')
    await click(second.cancelId, rowFor(second))
    expect(wrapper.get('.detail-heading').text()).toContain(second.shop)
    await click('同意取消'); expect(wrapper.get('[data-title="确认同意取消订单"]').text()).toContain(second.shop)
    await wrapper.get('textarea[aria-label="取消申请处理说明"]').setValue('核对本店此单无在途执行')
    await click('确认同意'); expect(session.records[session.records.length - 1]!.submission).toBe('submitted'); expect(original.submission).toBe('none')
  })
})
