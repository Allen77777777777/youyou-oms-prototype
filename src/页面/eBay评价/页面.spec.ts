import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElOption, ElSelect } from 'element-plus'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import ReviewPage from './eBay评价页面.vue'
import ContactBuyer from './联系买家.vue'
import { resetReviewSession, reviewSession } from './会话'
import { resetMailSession, mailSession } from '../eBay站内信/会话'
import type { BuyerFeedbackRecord, ReviewRecord } from './类型'
import { buyerFeedbackTemplates } from './数据'
import { deleteFeedbackTemplate, feedbackTemplateSession, resetFeedbackTemplateSession, saveFeedbackTemplate, setFeedbackTemplateEnabled } from '../消息模板管理/评价模板模型'
import { resetReviewContactSession } from './联系买家模型'
import { relatedTickets, tickets } from '../工单管理/会话'

const { route, push } = vi.hoisted(() => ({
  route: { path: '/oms/ebay-service/reviews', fullPath: '/oms/ebay-service/reviews', query: {} as Record<string, string> },
  push: vi.fn(),
}))
vi.mock('vue-router', async importOriginal => ({ ...await importOriginal<typeof import('vue-router')>(), useRoute: () => route, useRouter: () => ({ push }) }))
let wrapper: VueWrapper
// 仅替换弹窗定位与过渡外壳；表格、筛选组件、表单和所有页面动作实际执行。
const FloatingShell = {
  props: ['modelValue', 'title'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="测试浮层" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>',
}
const getRecord = (id: string) => reviewSession.reviews.find(item => item.id === id)!
const listRows = () => wrapper.findAll('.review-table .el-table__row')
function rowFor(buyer: string): DOMWrapper<Element> {
  const row = listRows().find(item => item.text().includes(buyer))
  if (!row) throw new Error(`未找到买家行 ${buyer}`)
  return row
}
async function click(label: string, scope?: string | Pick<DOMWrapper<Element>, 'findAll'>) {
  const root = typeof scope === 'string' ? wrapper.get(scope) : scope ?? wrapper
  const button = root.findAll('button').find(item => item.text().trim() === label)
  if (!button) throw new Error(`未找到按钮 ${label}`)
  await button.trigger('click'); await flushPromises()
}
async function choose(label: string, value: string | string[]) {
  const select = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === label || item.attributes('aria-label') === label || item.find(`[aria-label="${label}"]`).exists())
  if (!select) throw new Error(`未找到选择项 ${label}`)
  select.vm.$emit('update:modelValue', value); await flushPromises()
}
async function openDetail(buyer = 'buyer_demo_01') {
  const record = reviewSession.reviews.find(item => item.buyerId === buyer)!
  await click(record.commentType === 'POSITIVE' ? '查看' : '跟进', rowFor(buyer))
}
async function openReply(buyer = 'buyer_demo_01') { await click('回复评价', rowFor(buyer)) }
function attachBuyerFeedback(review: ReviewRecord, patch: Partial<BuyerFeedbackRecord> = {}) {
  const record: BuyerFeedbackRecord = {
    ...JSON.parse(JSON.stringify(reviewSession.buyerFeedback[0]!)), id: `LINKED-${review.id}`,
    shopId: review.shopId, shopName: review.shopName, buyerId: review.buyerId,
    orderLineItemId: review.orderLineItemId, orderNo: review.orderNo, title: review.title, sku: review.sku,
    status: 'pending', eligible: true, comment: undefined, ineligibleReason: undefined, attempts: [], ...patch,
  }
  reviewSession.buyerFeedback.push(record)
  return reviewSession.buyerFeedback.find(item => item.id === record.id)!
}
async function selectBuyerTemplate(id: string) {
  const select = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '选择好评模板' || item.find('[aria-label="选择好评模板"]').exists())!
  select.vm.$emit('change', id); await flushPromises()
}
async function fillContact(text: string) { await wrapper.get('textarea[aria-label="联系买家站内信正文"]').setValue(text); await flushPromises() }
function contactText() { return (wrapper.get('textarea[aria-label="联系买家站内信正文"]').element as HTMLTextAreaElement).value }
function renderPage() { return mount(ReviewPage, { attachTo: document.body, global: { directives: { prototype: {} }, stubs: { ElDialog: FloatingShell, ElDrawer: FloatingShell } } }) }

beforeEach(async () => {
  resetReviewSession(); resetMailSession(); resetReviewContactSession(); resetFeedbackTemplateSession(); push.mockReset()
  route.path = '/oms/ebay-service/reviews'; route.fullPath = route.path; route.query = {}
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  const base = reviewSession.reviews[0]!
  const record = (id: string, buyerId: string, patch: Partial<ReviewRecord> = {}): ReviewRecord => ({
    ...JSON.parse(JSON.stringify(base)), id, buyerId, createdAt: '2026-10-28T10:00:00+08:00',
    orderLineItemId: id === 'REV-DEMO-01' ? base.orderLineItemId : `LINE-${id}`,
    orderId: undefined, conversationId: undefined, content: `Review for ${buyerId}`, notes: [], logs: [], reply: undefined,
    commentType: 'NEGATIVE', platformState: 'ENTERED', handlingStatus: 'pending', automated: false, ...patch,
  })
  reviewSession.reviews = [
    record('REV-DEMO-01', 'buyer_demo_01', { commentType: 'NEUTRAL', orderId: 'order-01', conversationId: 'conv-01' }),
    record('REV-B', 'buyer_demo_beta', { shopId: 'shop-uk', shopName: '演示店铺-UK', handlingStatus: 'processing' }),
    record('REV-AUTO', 'buyer_demo_auto', { commentType: 'POSITIVE', automated: true }),
    record('REV-REPLIED', 'buyer_demo_replied', { reply: { text: 'Original public reply', by: '客服02', at: '2026-10-28T11:00:00+08:00' } }),
    record('REV-WITHDRAWN', 'buyer_demo_withdrawn', { platformState: 'WITHDRAWN' }),
    record('REV-GOOD', 'buyer_demo_good', { commentType: 'POSITIVE', handlingStatus: 'resolved' }),
  ]
  reviewSession.buyerFeedback = reviewSession.buyerFeedback.slice(0, 2)
  wrapper = renderPage(); await flushPromises()
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); resetReviewSession(); resetMailSession(); resetReviewContactSession() })

describe('eBay评价查询与统计下钻', () => {
  it('好中差快捷分类与类型多选同步，快捷操作不应用其他查询草稿', async () => {
    const filters = wrapper.findAllComponents(MultiFilter)
    const shopFilter = filters.find(item => item.props('placeholder') === '全部店铺')!
    const typeFilter = filters.find(item => item.props('placeholder') === '评价类型')!
    shopFilter.vm.$emit('update:modelValue', ['shop-uk'])
    wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', 'does-not-exist')
    await flushPromises()
    await click('好评 2', '.review-rating-shortcuts')
    expect(listRows()).toHaveLength(2)
    expect(listRows().map(item => item.text()).join(' ')).toContain('buyer_demo_good')
    expect(typeFilter.props('modelValue')).toEqual(['POSITIVE'])
    expect(shopFilter.props('modelValue')).toEqual(['shop-uk'])
    expect(wrapper.findComponent(FieldSearch).props('modelValue')).toBe('does-not-exist')
    expect(wrapper.get('.review-rating-shortcuts button[aria-pressed="true"]').text()).toBe('好评 2')
    await click('查询'); expect(listRows()).toHaveLength(0)
    await click('重置'); expect(listRows()).toHaveLength(6)
    typeFilter.vm.$emit('update:modelValue', ['NEUTRAL', 'NEGATIVE']); await flushPromises()
    expect(listRows()).toHaveLength(6)
    await click('查询'); expect(listRows()).toHaveLength(4)
    expect(wrapper.find('.review-rating-shortcuts button[aria-pressed="true"]').exists()).toBe(false)
    await click('中评 1', '.review-rating-shortcuts')
    expect(typeFilter.props('modelValue')).toEqual(['NEUTRAL'])
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]!.text()).toContain('buyer_demo_01')
  })
  it('筛选草稿查询前不生效，查询取交集，重置还原默认范围', async () => {
    expect(listRows()).toHaveLength(6)
    wrapper.findComponent(MultiFilter).vm.$emit('update:modelValue', ['shop-uk']); await flushPromises()
    expect(listRows()).toHaveLength(6)
    await click('查询'); expect(listRows()).toHaveLength(1); expect(listRows()[0]!.text()).toContain('buyer_demo_beta')
    wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', 'buyer_demo_01'); await flushPromises()
    expect(listRows()).toHaveLength(1)
    await click('查询'); expect(listRows()).toHaveLength(0)
    await click('重置'); expect(listRows()).toHaveLength(6)
    expect(wrapper.findComponent(DateRange).props('modelValue')).toEqual(['2026-09-30', '2026-10-29'])
  })
  it('无效日期不覆盖已应用查询，错误修正后才生效', async () => {
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-10-29', '2026-10-01']); await flushPromises()
    await click('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('开始时间不能晚于结束时间')
    expect(listRows()).toHaveLength(6)
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-10-01', '2026-10-02']); await flushPromises(); await click('查询')
    expect(listRows()).toHaveLength(0)
  })
  it('统计下钻精确应用店铺、时间、来源、类型、处理和有效状态', async () => {
    wrapper.unmount()
    route.query = { from: 'statistics', shopIds: 'shop-us', startDate: '2026-10-28', endDate: '2026-10-28', source: 'buyer', commentTypes: 'NEUTRAL,NEGATIVE', handlingStatuses: 'pending,processing', effective: '1' }
    route.fullPath = '/oms/ebay-service/reviews?from=statistics'
    wrapper = renderPage(); await flushPromises()
    expect(listRows()).toHaveLength(2)
    expect(listRows().map(item => item.text()).join(' ')).toContain('buyer_demo_01')
    expect(listRows().map(item => item.text()).join(' ')).toContain('buyer_demo_replied')
    expect(listRows().map(item => item.text()).join(' ')).not.toContain('buyer_demo_withdrawn')
    expect(wrapper.findComponent(DateRange).props('modelValue')).toEqual(['2026-10-28', '2026-10-28'])
  })
})

describe('评价详情处理和关联', () => {
  it('常规评价行可就地创建，绑定所点店铺及评价，返回详情可查看关联', async () => {
    const record = getRecord('REV-DEMO-01')
    const source = { kind: 'review' as const, id: record.id, shopId: record.shopId, shopName: record.shopName, summary: '' }
    const original = tickets.value.slice()
    const originalStatus = record.handlingStatus
    const count = relatedTickets(source).length
    try {
      await click('创建工单', rowFor(record.buyerId))
      expect(wrapper.find('[data-title="评价详情"]').exists()).toBe(false)
      const form = wrapper.get('[data-title="创建工单"]')
      expect(form.text()).toContain(record.id)
      await form.get('input[aria-label="工单事项"]').setValue('核实本条评价的物流经过')
      await click('创建', form)
      expect(relatedTickets(source)).toHaveLength(count + 1)
      expect(record.handlingStatus).toBe(originalStatus)
      await openDetail(record.buyerId)
      expect(wrapper.get('.review-followup-actions').text()).toContain('关联工单（' + (count + 1) + '）')
    } finally { tickets.value = original }
  }, 20000)
  it('从工单精确打开同店评价，在评价详情创建关联工单', async () => {
    wrapper.unmount()
    const original = getRecord('REV-DEMO-01')
    const other = { ...original, shopId: 'shop-uk', shopName: '演示店铺-UK', buyerId: 'buyer_other_shop' }
    reviewSession.reviews.push(other)
    route.query = { shopId: other.shopId, reviewId: other.id }
    route.fullPath = route.path + '?shopId=shop-uk&reviewId=REV-DEMO-01'
    wrapper = renderPage(); await flushPromises()
    const scope = '[data-title="评价详情"]'
    expect(wrapper.get(scope).text()).toContain(other.buyerId)
    const source = { kind: 'review' as const, id: other.id, shopId: other.shopId, shopName: other.shopName, summary: '' }
    const count = relatedTickets(source).length
    const before = tickets.value.slice()
    try {
      await click('创建工单', scope)
      await wrapper.get('input[aria-label="工单事项"]').setValue('核查英店评价中的适配情况')
      await click('创建', '[data-title="创建工单"]')
      expect(relatedTickets(source)).toHaveLength(count + 1)
      expect(relatedTickets(source)[0]!.title).toBe('核查英店评价中的适配情况')
      expect(wrapper.get(scope).text()).toContain('关联工单（' + (count + 1) + '）')
    } finally { tickets.value = before }
  })
  it('工单来源店铺与评价ID不匹配时提示核对，不能打开同号评价', async () => {
    wrapper.unmount()
    route.query = { shopId: 'shop-missing', reviewId: 'REV-DEMO-01' }
    route.fullPath = route.path + '?shopId=shop-missing&reviewId=REV-DEMO-01'
    wrapper = renderPage(); await flushPromises()
    expect(wrapper.find('[data-title="评价详情"]').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('未找到唯一对应的评价')
  })
  it('没有手动同步入口，自定义原因可从列表维护并用于详情，停用不丢历史', async () => {
    expect(wrapper.findAll('button').some(item => item.text().trim() === '同步评价')).toBe(false)
    await click('原因分类')
    await wrapper.get('input[aria-label="新增原因分类名称"]').setValue('包装缺件')
    await click('新增分类', '[data-title="原因分类管理"]')
    expect(reviewSession.reasonCategories.some(r => r.name === '包装缺件')).toBe(true)
    await click('关闭', '[data-title="原因分类管理"]')
    await openDetail(); await choose('详情原因分类', '包装缺件'); await click('保存处理信息')
    expect(getRecord('REV-DEMO-01').reason).toBe('包装缺件')
    // 模拟另一个客服停用资料，当前已选历史值仍可保留并更新处理状态。
    reviewSession.reasonCategories.find(r => r.name === '包装缺件')!.enabled = false
    await choose('详情处理状态', 'resolved'); await click('保存处理信息')
    expect(getRecord('REV-DEMO-01')).toMatchObject({ reason: '包装缺件', handlingStatus: 'resolved' })
    expect(rowFor('buyer_demo_01').text()).toContain('包装缺件')
  })
  it('平台隐藏正文、翻译、回复评价及追加评论在列表和详情均不展示，也不可按正文反查', async () => {
    const target = getRecord('REV-DEMO-01')
    Object.assign(target, { platformState: 'HIDDEN', content: 'PRIVATE-ORIGINAL', translation: 'PRIVATE-TRANSLATION', reply: { text: 'PRIVATE-REPLY', by: '客服01', at: target.createdAt }, followup: { text: 'PRIVATE-FOLLOWUP', by: target.buyerId, at: target.createdAt } })
    await flushPromises()
    expect(rowFor(target.buyerId).html()).not.toContain('PRIVATE')
    expect(rowFor(target.buyerId).get('.review-comment').attributes('title')).toBe('该评价内容已被平台隐藏')
    await openDetail()
    expect(wrapper.get('[data-title="评价详情"]').html()).not.toContain('PRIVATE')
    expect(wrapper.get('[data-title="评价详情"]').find('details').exists()).toBe(false)
    wrapper.findComponent(FieldSearch).vm.$emit('update:field', 'content')
    wrapper.findComponent(FieldSearch).vm.$emit('update:modelValue', 'PRIVATE')
    await flushPromises(); await click('查询')
    expect(listRows()).toHaveLength(0)
    expect(target.content).toBe('PRIVATE-ORIGINAL')
    expect(target.reply?.text).toBe('PRIVATE-REPLY')
  })
  it('详情实际交接后可恢复本行 SKU 处理人', async () => {
    const target = getRecord('REV-DEMO-01')
    await openDetail()
    await choose('详情处理人', ['staff-03'])
    await click('保存处理信息', '[data-title="评价详情"]')
    await click('恢复自动分配', '[data-title="评价详情"]')
    expect(target.handlerIds).toBeUndefined()
    expect(rowFor(target.buyerId).text()).toContain('客服01')
    expect(target.logs[target.logs.length - 1]?.detail).toContain('恢复自动分配：客服03 → 客服01')
  })
  it('处理草稿不立即保存，保存仅更新内部信息，备注按次追加', async () => {
    const target = getRecord('REV-DEMO-01'), platformFact = { type: target.commentType, content: target.content, state: target.platformState }
    await openDetail()
    await choose('详情处理状态', 'resolved'); await choose('详情处理人', ['staff-02', 'staff-03']); await choose('详情原因分类', '商品质量')
    expect(target.handlingStatus).toBe('pending')
    await click('保存处理信息', '[data-title="评价详情"]')
    expect(target).toMatchObject({ handlingStatus: 'resolved', handlerIds: ['staff-02', 'staff-03'], reason: '商品质量' })
    expect({ type: target.commentType, content: target.content, state: target.platformState }).toEqual(platformFact)
    expect(target.reply).toBeUndefined()
    await wrapper.get('textarea[aria-label="新增内部备注"]').setValue('已联系买家核查车型。'); await click('添加备注')
    await wrapper.get('textarea[aria-label="新增内部备注"]').setValue('买家已补充车辆年份。'); await click('添加备注')
    expect(target.notes.map(item => item.text)).toEqual(['已联系买家核查车型。', '买家已补充车辆年份。'])
    expect(rowFor(target.buyerId).get('.review-note-preview').text()).toBe('买家已补充车辆年份。')
    expect(rowFor(target.buyerId).text()).toContain('全部 2 条')
    expect(wrapper.get('.review-detail-heading strong').text()).toBe(target.buyerId)
    expect(wrapper.get('.review-detail-order').text()).toContain(target.orderNo)
    expect(target.logs.map(item => item.action)).toEqual(['更新处理信息', '添加内部备注', '添加内部备注'])
  })
  it('仅精确确认关联可打开站内信，同名买家和跨店铺资料不能兜底', async () => {
    await openDetail(); await click('订单与售后'); await click('打开关联站内信', '[data-title="评价详情"]')
    expect(push).toHaveBeenLastCalledWith('/oms/ebay-service/messages')
    expect(mailSession.activeId).toBe('conv-01')
    const linked = mailSession.conversations.find(c => c.id === 'conv-01')!
    linked.shopId = 'shop-uk'; await flushPromises()
    const button = wrapper.findAll('button').find(item => item.text().trim() === '打开关联站内信')!
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('暂无准确关联的站内信会话')
    getRecord('REV-DEMO-01').shopId = 'shop-uk'; await flushPromises()
    expect(wrapper.find('[data-title="评价详情"]').exists()).toBe(false)
  })
  it('批量处理按实际更新与未变更分别计数，未变更不新增记录', async () => {
    const pending = getRecord('REV-DEMO-01'), resolved = getRecord('REV-GOOD')
    await rowFor(pending.buyerId).get('input[type="checkbox"]').setValue(true)
    await rowFor(resolved.buyerId).get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const batchButton = wrapper.findAll('button').find(item => item.text().startsWith('批量处理'))!
    await batchButton.trigger('click'); await flushPromises()
    await click('确认更新 2 条', '[data-title="批量更新内部处理"]')
    expect(ElMessage.success).toHaveBeenLastCalledWith('已更新 1 条，未变更 1 条')
    expect(pending.handlingStatus).toBe('resolved')
    expect(pending.logs).toHaveLength(1)
    expect(resolved.logs).toHaveLength(0)
    expect(wrapper.text()).not.toContain('已选 2 条')
  })
})

describe('评价列表联系买家', () => {
  it('2001字符正文完整保留并显示超限计数，发送时阻止外发而不截断', async () => {
    const target = getRecord('REV-DEMO-01'), conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    const messageCount = conversation.messages.length, text = 'A'.repeat(2001)
    await click('联系买家', rowFor(target.buyerId))
    const dialog = wrapper.get('[data-title="联系买家"]'), textarea = dialog.get('textarea[aria-label="联系买家站内信正文"]')
    expect(textarea.attributes('maxlength')).toBeUndefined()
    await fillContact(text)
    expect(contactText()).toBe(text)
    expect(dialog.get('.reply-word-count').text()).toBe('2001 / 2000')
    await click('发送站内信', dialog)
    expect(dialog.text()).toContain('2000')
    expect(contactText()).toBe(text)
    expect(conversation.messages).toHaveLength(messageCount)
    expect(wrapper.findComponent(ContactBuyer).emitted('sent')).toBeUndefined()
  })
  it('列表直接写信并发送到准确关联会话，不改变评价、留评或内部处理事实', async () => {
    const target = getRecord('REV-DEMO-01'), conversation = mailSession.conversations.find(item => item.id === 'conv-01')!
    const messageCount = conversation.messages.length, originalStatus = conversation.status
    const reviewFact = { type: target.commentType, content: target.content, state: target.platformState, handlingStatus: target.handlingStatus, reply: target.reply }
    const feedbackFact = JSON.stringify(reviewSession.buyerFeedback)
    await click('联系买家', rowFor(target.buyerId))
    expect(push).not.toHaveBeenCalled()
    const dialog = wrapper.get('[data-title="联系买家"]')
    expect(dialog.text()).toContain(target.shopName)
    expect(dialog.text()).toContain(target.buyerId)
    expect(dialog.findAll('button').map(item => item.text().trim())).not.toContain('预览回复')
    await fillContact('Please share the model and year of your vehicle.')
    await click('发送站内信', dialog)
    await vi.waitFor(() => expect(conversation.messages.slice(-1)[0]?.delivery).toBe('success'), { timeout: 1500 })
    expect(conversation.messages).toHaveLength(messageCount + 1)
    expect(conversation.messages.slice(-1)[0]).toMatchObject({ kind: 'outgoing', body: 'Please share the model and year of your vehicle.', sendSource: 'manual' })
    expect(conversation.messages.slice(-1)[0]).not.toHaveProperty('subject')
    expect(dialog.find('input[aria-label="联系买家内部参考标题"]').exists()).toBe(false)
    expect(conversation.status).toBe(originalStatus)
    expect({ type: target.commentType, content: target.content, state: target.platformState, handlingStatus: target.handlingStatus, reply: target.reply }).toEqual(reviewFact)
    expect(JSON.stringify(reviewSession.buyerFeedback)).toBe(feedbackFact)
    expect(wrapper.get('[data-title="联系买家"]').text()).toContain('查看站内信')
    expect(push).not.toHaveBeenCalled()
  })
  it('没有既有会话仍可写信，关闭丢弃内容且不覆盖邮箱已有草稿', async () => {
    const target = getRecord('REV-B'), originalCount = mailSession.conversations.length
    mailSession.drafts['existing-mail-draft'] = { body: 'Existing inbox draft', attachments: [] }
    const originalMailDrafts = JSON.stringify(mailSession.drafts)
    await click('联系买家', rowFor(target.buyerId))
    await fillContact('Please tell us more about the issue.')
    await click('关闭', '[data-title="联系买家"]')
    expect(mailSession.conversations).toHaveLength(originalCount)
    await click('联系买家', rowFor('buyer_demo_01'))
    expect(contactText()).toBe('')
    await click('关闭', '[data-title="联系买家"]')
    await click('联系买家', rowFor(target.buyerId))
    expect(contactText()).toBe('')
    await fillContact('Please tell us more about the issue.')
    await click('发送站内信', '[data-title="联系买家"]')
    await vi.waitFor(() => expect(mailSession.conversations.some(item => item.shopId === target.shopId && item.buyerId === target.buyerId && item.messages.some(message => message.delivery === 'success'))).toBe(true), { timeout: 1500 })
    const created = mailSession.conversations.find(item => item.shopId === target.shopId && item.buyerId === target.buyerId)!
    expect(mailSession.conversations).toHaveLength(originalCount + 1)
    expect(created.messages).toHaveLength(1)
    expect(created.messages[0]).toMatchObject({ kind: 'outgoing', body: 'Please tell us more about the issue.', delivery: 'success' })
    expect(created.messages[0]).not.toHaveProperty('subject')
    expect(created.subject).toBe(`关于订单 ${target.orderNo || target.orderLineItemId}`)
    expect(created.relatedOrderIds).toEqual([])
    expect(created.association).not.toBe('confirmed')
    expect(JSON.stringify(mailSession.drafts)).toBe(originalMailDrafts)
    expect(target.reply).toBeUndefined()
    expect(target.handlingStatus).toBe('processing')
  })
  it.each(['buyerId', 'orderLineItemId'] as const)('发送期间同一评价的%s变化时，旧结果不在新收件人窗口显示成功', async field => {
    const target = getRecord('REV-B'), originalBuyer = target.buyerId
    await click('联系买家', rowFor(originalBuyer))
    const contact = wrapper.findComponent(ContactBuyer), dialog = wrapper.get('[data-title="联系买家"]')
    await fillContact('Message for the original transaction.')
    const sendButton = dialog.findAll('button').find(item => item.text().trim() === '发送站内信')!
    const sendClick = sendButton.trigger('click')
    const originalConversation = mailSession.conversations.find(item => item.shopId === target.shopId && item.buyerId === originalBuyer)!
    const outgoing = originalConversation.messages.slice(-1)[0]!
    expect(outgoing.delivery).toBe('sending')
    target[field] = `changed-${target[field]}`
    await sendClick; await flushPromises()
    await vi.waitFor(() => expect(outgoing.delivery).toBe('success'), { timeout: 1500 })
    await flushPromises()
    expect(originalConversation.buyerId).toBe(originalBuyer)
    expect(outgoing.body).toBe('Message for the original transaction.')
    expect(wrapper.get('[data-title="联系买家"]').text()).toContain(target.buyerId)
    expect(wrapper.get('[data-title="联系买家"]').text()).toContain('收件人或交易资料已变化')
    expect(wrapper.get('[data-title="联系买家"]').find('.review-contact-success').exists()).toBe(false)
    expect(wrapper.get('[data-title="联系买家"]').text()).not.toContain('Message for the original transaction.')
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(contact.emitted('sent')).toBeUndefined()
  })
})

describe('回复买家评价', () => {
  it('编辑关闭不提交，点击提交直接写入一条回复并保留处理状态', async () => {
    const target = getRecord('REV-DEMO-01')
    await openReply()
    await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('We are checking the vehicle fitment.')
    expect(target.reply).toBeUndefined()
    const dialog = wrapper.get('[data-title="回复评价"]')
    expect(dialog.text()).toContain('无法编辑或撤回')
    expect(dialog.findAll('button').map(item => item.text().trim())).not.toContain('预览回复')
    await click('关闭', dialog)
    expect(target.reply).toBeUndefined()
    await openReply(); expect((wrapper.get('textarea[aria-label="回复评价内容"]').element as HTMLTextAreaElement).value).toBe(''); await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('We are checking the vehicle fitment.'); await click('提交回复', '[data-title="回复评价"]')
    expect(target.reply?.text).toBe('We are checking the vehicle fitment.')
    expect(target.handlingStatus).toBe('pending')
    expect(reviewSession.replyDrafts[target.id]).toBeUndefined()
    expect(rowFor('buyer_demo_01').findAll('button').find(item => item.text().trim() === '回复评价')!.attributes('disabled')).toBeDefined()
  })
  it('回复编辑关闭后丢弃，切对象或重开均为空', async () => {
    await openReply(); await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('Draft A'); await click('关闭')
    await openReply('buyer_demo_beta')
    expect((wrapper.get('textarea[aria-label="回复评价内容"]').element as HTMLTextAreaElement).value).toBe('')
    await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('Draft B'); await click('关闭')
    await openReply()
    expect((wrapper.get('textarea[aria-label="回复评价内容"]').element as HTMLTextAreaElement).value).toBe('')
    expect(reviewSession.replyDrafts['REV-B']).toBeUndefined()
  })
  it('已回复、自动评价和已失效评价均不能进入回复评价', () => {
    for (const buyer of ['buyer_demo_replied', 'buyer_demo_auto', 'buyer_demo_withdrawn']) {
      const button = rowFor(buyer).findAll('button').find(item => item.text().trim() === '回复评价')!
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(getRecord('REV-REPLIED').reply?.text).toBe('Original public reply')
  })
  it('编辑期间平台资格改变时不能提交且不写入共享草稿', async () => {
    await openReply(); await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('Pending response')
    getRecord('REV-DEMO-01').platformState = 'HIDDEN'; await flushPromises()
    const submit = wrapper.get('[data-title="回复评价"]').findAll('button').find(item => item.text().trim() === '提交回复')!
    expect(submit.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-title="回复评价"]').text()).toContain('评价已被平台隐藏')
    expect(wrapper.get('[data-title="回复评价"]').text()).not.toContain('Pending response')
    expect(wrapper.get('[data-title="回复评价"]').text()).not.toContain('Review for buyer_demo_01')
    expect(getRecord('REV-DEMO-01').reply).toBeUndefined()
    expect(reviewSession.replyDrafts['REV-DEMO-01']).toBeUndefined()
  })
  it('直接提交仍校验空内容和HTML，修正后提交且无第二步确认', async () => {
    const target = getRecord('REV-DEMO-01')
    await openReply(); await click('提交回复')
    expect(wrapper.get('[data-title="回复评价"]').get('[role="alert"]').text()).toContain('请输入评价内容')
    expect(target.reply).toBeUndefined()
    await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('<b>Invalid HTML</b>'); await click('提交回复')
    expect(wrapper.get('[data-title="回复评价"]').get('[role="alert"]').text()).toContain('不能包含HTML')
    expect(target.reply).toBeUndefined()
    await wrapper.get('textarea[aria-label="回复评价内容"]').setValue('A corrected response.'); await click('提交回复')
    expect(target.reply?.text).toBe('A corrected response.')
    expect(wrapper.find('[data-title="确认回复评价"]').exists()).toBe(false)
  })
  it('列表单独显示卖家回复正文与时间人员，不混入买家评价内容', () => {
    const headers = wrapper.findAll('.el-table__header-wrapper th').map(item => item.text().trim())
    const replyIndex = headers.indexOf('卖家回复')
    expect(replyIndex).toBeGreaterThan(-1)
    const repliedRow = rowFor('buyer_demo_replied'), cells = repliedRow.findAll('td')
    expect(cells[replyIndex]!.text()).toContain('Original public reply')
    expect(cells[replyIndex]!.text()).toContain('客服02')
    expect(cells[replyIndex]!.text()).toContain('2026-10-28')
    expect(repliedRow.get('.review-comment').text()).toBe('Review for buyer_demo_replied')
    expect(repliedRow.find('.review-reply-excerpt').exists()).toBe(false)
    expect(rowFor('buyer_demo_01').findAll('td')[replyIndex]!.text()).toContain('未回复')
  })
})

describe('给买家好评', () => {
  it('来源未知只包含已执行记录，准确关联超期交易在列表与详情解释且禁止提交', async () => {
    const received = getRecord('REV-DEMO-01')
    attachBuyerFeedback(received, { completedAt: '2026-07-01T08:00:00+08:00' })
    await flushPromises()
    const row = rowFor(received.buyerId)
    expect(row.text()).toContain('交易完成已超过90天')
    expect(row.findAll('button').find(b => b.text().trim() === '给买家好评')!.attributes('disabled')).toBeDefined()
    await openDetail()
    expect(wrapper.get('.review-buyer-detail').text()).toContain('交易完成已超过90天')
    await click('给买家好评', '.review-tabs')
    await choose('好评方式', 'unknown'); await click('查询')
    expect(listRows()).toHaveLength(0)
    const target = reviewSession.buyerFeedback[0]!
    Object.assign(target, { status: 'sent', comment: { text: 'Imported feedback.', by: '平台', at: received.createdAt } })
    await flushPromises(); expect(listRows()).toHaveLength(1)
    expect(rowFor(target.buyerId).text()).toContain('来源未知')
  })
  it('未收到评价的自动好评独立显示，方式筛选查询后应用并可重置', async () => {
    const target = reviewSession.buyerFeedback[1]!
    Object.assign(target, { status: 'sent', sendSource: 'automation', automationRuleName: '付款后自动好评', comment: { text: 'Automatic positive feedback.', by: '自动客服规则', at: '2026-10-28T12:00:00+08:00' } })
    expect(reviewSession.reviews.some(r => r.buyerId === target.buyerId)).toBe(false)
    await click('给买家好评')
    expect(rowFor(target.buyerId).text()).toContain('自动好评')
    expect(rowFor(target.buyerId).text()).toContain('付款后自动好评')
    await choose('好评方式', 'automation')
    expect(listRows()).toHaveLength(2)
    await click('查询'); expect(listRows()).toHaveLength(1)
    await click('查看好评', rowFor(target.buyerId))
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain('Automatic positive feedback.')
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain('信用评价档案')
    await click('关闭', '[data-title="给买家好评"]'); await click('重置')
    expect(listRows()).toHaveLength(2)
  })
  it('详情将给买家的好评与买家原评价及回复分开，保留来源和历史', async () => {
    const target = getRecord('REV-DEMO-01')
    attachBuyerFeedback(target, { status: 'sent', sendSource: 'automation', automationRuleName: '完成交易自动好评', comment: { text: 'Thank you, buyer.', by: '自动客服规则', at: target.createdAt } })
    await openDetail()
    expect(wrapper.get('.review-original').text()).toContain('Review for buyer_demo_01')
    expect(wrapper.get('.review-public-reply').text()).not.toContain('Thank you, buyer.')
    expect(wrapper.get('.review-buyer-detail').text()).toContain('Thank you, buyer.')
    expect(wrapper.get('.review-buyer-detail').text()).toContain('完成交易自动好评')
  })
  it('收到评价可精确关联留评，明确失败及重试均不改收到评价事实或内部状态', async () => {
    const review = getRecord('REV-DEMO-01'), originalReview = JSON.stringify(review)
    const target = attachBuyerFeedback(review, { simulateFailureOnce: true })
    await flushPromises()
    await click('给买家好评', rowFor(review.buyerId))
    await selectBuyerTemplate('buyer-smooth')
    const text = buyerFeedbackTemplates.find(item => item.id === 'buyer-smooth')!.text
    expect((wrapper.get('textarea[aria-label="给买家的好评内容"]').element as HTMLTextAreaElement).value).toBe(text)
    expect(target.attempts).toHaveLength(0)
    await click('提交好评')
    expect(target.status).toBe('pending')
    expect(target.comment).toBeUndefined()
    expect(target.attempts).toHaveLength(1)
    expect(target.attempts![0]).toMatchObject({ outcome: 'failed', code: 'DEMO_REQUEST_REJECTED', text })
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain('平台明确拒绝本次请求')
    expect(rowFor(review.buyerId).text()).toContain('留评失败')
    expect(rowFor(review.buyerId).find('[aria-label="留评失败原因"]').exists()).toBe(true)
    expect(JSON.stringify(review)).toBe(originalReview)
    expect((wrapper.get('textarea[aria-label="给买家的好评内容"]').element as HTMLTextAreaElement).value).toBe(text)
    await click('提交好评')
    expect(target.status).toBe('sent')
    expect(target.comment?.text).toBe(text)
    expect(target.attempts?.map(item => item.outcome)).toEqual(['failed', 'succeeded'])
    expect(JSON.stringify(review)).toBe(originalReview)
    expect(rowFor(review.buyerId).text()).toContain('留评成功')
    await click('查看好评', rowFor(review.buyerId))
    const history = wrapper.get('[data-title="给买家好评"]')
    expect(history.text()).toContain('好评提交记录（2）')
    expect(history.text()).toContain('提交失败')
    expect(history.text()).toContain('留评成功')
    expect(history.find('textarea').exists()).toBe(false)
  })
  it('店铺、交易行、买家失配或重复关联不提供给买家好评入口', async () => {
    const review = getRecord('REV-DEMO-01'), target = attachBuyerFeedback(review)
    await flushPromises()
    const hasLink = () => rowFor(review.buyerId).findAll('button').some(item => item.text().trim() === '给买家好评')
    expect(hasLink()).toBe(true)
    for (const field of ['shopId', 'orderLineItemId', 'buyerId'] as const) {
      const original = target[field]
      target[field] = `mismatch-${original}`; await flushPromises()
      expect(hasLink()).toBe(false)
      expect(rowFor(review.buyerId).text()).toContain('暂无好评记录')
      target[field] = original; await flushPromises()
      expect(hasLink()).toBe(true)
    }
    reviewSession.buyerFeedback.push({ ...target, id: 'DUPLICATE', buyerId: 'different-buyer' }); await flushPromises()
    expect(hasLink()).toBe(false)
    await openDetail()
    expect(wrapper.get('[data-title="评价详情"]').findAll('button').some(item => item.text().trim() === '给买家好评')).toBe(false)
  })
  it('失败队列显示明确失败结果，重新提交保留尝试历史并支持模板填充', async () => {
    const target = reviewSession.buyerFeedback[0]!
    target.attempts = [{ id: 'TEST-FAILED', at: '2026-10-28T12:00:00+08:00', by: '客服02', text: 'Previous attempt.', outcome: 'failed', code: 'DEMO_REQUEST_REJECTED', message: '本次请求已被明确拒绝。' }]
    await click('给买家好评'); await click('提交失败 1', '.review-queues')
    expect(listRows()).toHaveLength(1)
    expect(listRows()[0]!.text()).toContain(target.buyerId)
    expect(rowFor(target.buyerId).text()).toContain('留评失败')
    await click('重新提交', rowFor(target.buyerId))
    expect(wrapper.get('[data-title="给买家好评"]').get('details').attributes('open')).toBeDefined()
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain('Previous attempt.')
    await selectBuyerTemplate('buyer-return')
    const text = buyerFeedbackTemplates.find(item => item.id === 'buyer-return')!.text
    expect((wrapper.get('textarea[aria-label="给买家的好评内容"]').element as HTMLTextAreaElement).value).toBe(text)
    expect(target.attempts).toHaveLength(1)
    await click('提交好评')
    expect(target.comment?.text).toBe(text)
    expect(target.attempts?.map(item => item.outcome)).toEqual(['failed', 'succeeded'])
    expect(listRows()).toHaveLength(0)
    await click('已好评 1', '.review-queues')
    expect(listRows()).toHaveLength(1)
    expect(rowFor(target.buyerId).text()).toContain('留评成功')
  })
  it('列表按实际90天资格显示，不因eligible仍为true将过期交易展示成可评价', async () => {
    const target = reviewSession.buyerFeedback[0]!
    target.completedAt = '2026-07-01T08:00:00+08:00'; target.eligible = true; target.ineligibleReason = undefined
    await click('给买家好评')
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', null); await flushPromises(); await click('查询')
    const row = rowFor(target.buyerId)
    expect(row.text()).toContain('不可提交')
    expect(row.text()).toContain('交易完成已超过90天')
    expect(row.text()).not.toContain('可以给买家留下好评')
    expect(row.findAll('button').find(item => item.text().trim() === '给买家好评')!.attributes('disabled')).toBeDefined()
    expect(target.eligible).toBe(true)
  })
  it('已打开的留评编辑同步读取动态资格，资格变化后解释原因并禁用提交', async () => {
    const target = reviewSession.buyerFeedback[0]!
    await click('给买家好评'); await click('给买家好评', rowFor(target.buyerId))
    target.completedAt = '2026-07-01T08:00:00+08:00'; target.eligible = true
    await flushPromises()
    const dialog = wrapper.get('[data-title="给买家好评"]')
    expect(dialog.get('[role="alert"]').text()).toContain('交易完成已超过90天')
    expect(dialog.findAll('button').find(item => item.text().trim() === '提交好评')!.attributes('disabled')).toBeDefined()
    expect(target.status).toBe('pending')
    expect(target.comment).toBeUndefined()
  })
  it('编辑与关闭不留评，直接提交后转为只读且不能重复提交', async () => {
    await click('给买家好评')
    const target = reviewSession.buyerFeedback[0]!
    await click('给买家好评', rowFor(target.buyerId))
    await wrapper.get('textarea[aria-label="给买家的好评内容"]').setValue('Thank you for your purchase!')
    expect(wrapper.get('[data-title="给买家好评"]').findAll('button').map(item => item.text().trim())).not.toContain('预览评价')
    expect(target.status).toBe('pending')
    await click('关闭', '[data-title="给买家好评"]')
    expect(target.comment).toBeUndefined()
    await click('给买家好评', rowFor(target.buyerId)); await click('提交好评')
    expect(target.status).toBe('sent')
    const firstComment = target.comment
    await click('查看好评', rowFor(target.buyerId))
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain(firstComment!.text)
    expect(wrapper.get('[data-title="给买家好评"]').find('textarea').exists()).toBe(false)
    expect(wrapper.get('[data-title="给买家好评"]').findAll('button').map(item => item.text())).not.toContain('提交好评')
    expect(target.comment).toBe(firstComment)
  })
  it('回复评价引用管理页的同类启用模板，后续变更不回改当前内容与历史回复', async () => {
    const created = saveFeedbackTemplate({ type: 'review-reply', name: '共享回复模板', text: 'Thank you for sharing your feedback.', enabled: true }).template!
    await openReply()
    const select = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '评价回复模板' || item.find('[aria-label="评价回复模板"]').exists())!
    expect(select.findAllComponents(ElOption).map(item => item.props('label'))).toContain(created.name)
    expect(select.findAllComponents(ElOption).map(item => item.props('label'))).not.toContain('感谢购买')
    select.vm.$emit('change', created.id); await flushPromises()
    const textarea = wrapper.get('textarea[aria-label="回复评价内容"]')
    expect((textarea.element as HTMLTextAreaElement).value).toBe(created.text)
    const adopted = created.text
    saveFeedbackTemplate({ ...created, text: 'Updated shared reply.' }, created.id)
    expect((textarea.element as HTMLTextAreaElement).value).toBe(adopted)
    setFeedbackTemplateEnabled(created.id, false); await flushPromises()
    select.vm.$emit('change', created.id); await flushPromises()
    expect(wrapper.get('[data-title="回复评价"] [role="alert"]').text()).toContain('已停用')
    expect((textarea.element as HTMLTextAreaElement).value).toBe(adopted)
    await textarea.setValue('Manually adjusted reply.'); await click('提交回复')
    expect(getRecord('REV-DEMO-01').reply?.text).toBe('Manually adjusted reply.')
    deleteFeedbackTemplate(created.id)
    expect(getRecord('REV-DEMO-01').reply?.text).toBe('Manually adjusted reply.')
  })
  it('给买家好评读取同一份管理资料，停用删除即时移出且不混入回复模板', async () => {
    const source = feedbackTemplateSession.templates.find(item => item.id === 'buyer-smooth')!
    saveFeedbackTemplate({ ...source, text: 'Updated positive feedback from management.' }, source.id)
    const target = reviewSession.buyerFeedback[0]!
    await click('给买家好评')
    await click('给买家好评', rowFor(target.buyerId))
    const select = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '选择好评模板' || item.find('[aria-label="选择好评模板"]').exists())!
    expect(select.findAllComponents(ElOption).map(item => item.props('label'))).not.toContain('说明并协助解决')
    await selectBuyerTemplate(source.id)
    expect((wrapper.get('textarea[aria-label="给买家的好评内容"]').element as HTMLTextAreaElement).value).toBe(source.text)
    deleteFeedbackTemplate(source.id); await flushPromises()
    expect(select.findAllComponents(ElOption).map(item => item.props('label'))).not.toContain(source.name)
    expect((wrapper.get('textarea[aria-label="给买家的好评内容"]').element as HTMLTextAreaElement).value).toBe(source.text)
    await click('提交好评')
    expect(target.comment?.text).toBe(source.text)
  })
  it('平台资格不可用时不显示可提交的留评动作', async () => {
    reviewSession.buyerFeedback[0]!.eligible = false
    reviewSession.buyerFeedback[0]!.ineligibleReason = '平台资格尚未确认'
    await click('给买家好评')
    const row = rowFor(reviewSession.buyerFeedback[0]!.buyerId)
    expect(row.text()).toContain('平台资格尚未确认')
    expect(row.findAll('button').find(item => item.text().trim() === '给买家好评')!.attributes('disabled')).toBeDefined()
  })
})


describe('买家详情回到好评记录', () => {
  it('按店铺和 feedbackId 打开给买家好评原详情，不创建评价或提交动作', async () => {
    const record = reviewSession.buyerFeedback[0]!
    const before = JSON.stringify(record)
    wrapper.unmount()
    route.query = { shopId: record.shopId, feedbackId: record.id }; route.fullPath = route.path + '?feedbackId=' + record.id
    wrapper = renderPage(); await flushPromises()
    expect(wrapper.find('[data-title="给买家好评"]').exists()).toBe(true)
    expect(wrapper.get('[data-title="给买家好评"]').text()).toContain(record.buyerId)
    expect(JSON.stringify(record)).toBe(before)
  })
})
