import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElIcon, ElMessage, ElPagination, ElTooltip } from 'element-plus'
import ReturnList from './eBay退换货申请页面.vue'
import ReturnDetail from './退货详情页面.vue'
import PageTabs from '@/布局/页面页签.vue'
import { 业务页签关闭请求 } from '@/布局/页签操作'
import { returnDetailRoute } from './详情路由'
import { createReturnData, returnSession } from './数据'
import { initializeReturnDemoContext } from './关联资料'
import { resolveReturnItem, resolveReturnOrder } from './关联导航'
import { getReturnDetail, inReturnQueue, returnKey } from './模型'
import { readReturnDetailView, resetReturnViews, returnListView } from './视图会话'
import { 共享订单 } from '../订单处理/演示会话'
import { mailSession, resetMailSession } from '../eBay站内信/会话'
import { mailboxEntries } from '../eBay站内信/邮箱模型'
import { recordsForReturn } from '../售后单管理/会话'
import { relatedTickets, sourceLocation, tickets } from '../工单管理/会话'

const listPath = '/oms/ebay-service/returns'
let wrapper: VueWrapper | undefined, router: Router
const dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-title="title"><slot /><slot name="footer" /></section>' }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const stable = async () => { await flushPromises(); await flushPromises() }
function button(label: string, selector?: string) {
  const scope = selector ? wrapper!.get(selector) : wrapper!
  const result = scope.findAll('button').find(item => item.text().trim() === label)
  if (!result) throw new Error(`未找到按钮：${label}`)
  return result
}
async function click(label: string, selector?: string) { await button(label, selector).trigger('click'); await stable() }
const openRecord = async (index: number) => { const row = returnSession.records[index]!; await router.push({ name: 'oms-ebay-return-detail', params: { shopId: row.shopId, returnId: row.id } }); await stable() }
async function open(path = listPath) {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: listPath, component: ReturnList, meta: { title: '退货退款申请' } },
    { path: returnDetailRoute.path, name: returnDetailRoute.name, meta: returnDetailRoute.meta, component: ReturnDetail },
    { path: '/index', component: { template: '<div>首页</div>' } },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount({ components: { PageTabs }, template: '<PageTabs /><RouterView />' }, { attachTo: document.body, global: { plugins: [router], components: { ElIcon, ElTooltip }, stubs: { ElDialog: dialog }, directives: { prototype: {} } } })
  await stable()
}

beforeEach(() => { returnSession.records = createReturnData(); resetReturnViews(); initializeReturnDemoContext(); 业务页签关闭请求.value = undefined })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; ElMessage.closeAll(); document.body.innerHTML = '' })

describe('退货详情应用内独立页签', () => {
  it('从工单定位同店退货申请，可在详情新增独立工单且维持申请状态', async () => {
    const row = returnSession.records.find(item => item.id === 'DEMO-RT-012')!
    const source = { kind: 'return' as const, id: row.id, shopId: row.shopId, shopName: row.shopName, summary: row.title }
    const count = relatedTickets(source).length
    const before = tickets.value.slice(), originalStatus = row.status
    await open()
    const firstRow = wrapper!.get('.returns-table .el-table__row')
    const firstId = firstRow.get('.link-button').text()
    await firstRow.get('.return-row-actions .ticket-source-actions button').trigger('click'); await stable()
    expect(wrapper!.get('[data-title="创建工单"]').text()).toContain(firstId)
    await click('取消', '[data-title="创建工单"]')
    await router.push(sourceLocation(source)); await stable()
    expect(wrapper!.get('.detail-id').text()).toContain(row.id)
    try {
      await click('创建工单', '.return-detail-toolbar')
      await wrapper!.get('input[aria-label="工单事项"]').setValue('请仓库回传实收凭证')
      await click('创建', '[data-title="创建工单"]')
      expect(relatedTickets(source)).toHaveLength(count + 1)
      expect(relatedTickets(source)[0]!.source).toEqual(source)
      expect(wrapper!.get('.return-detail-toolbar').text()).toContain('关联工单（' + (count + 1) + '）')
      expect(row.status).toBe(originalStatus)
    } finally { tickets.value = before }
  })
  it('列表打开新标签，返回保留未应用查询、队列、页码和两层滚动位置', async () => {
    returnListView.pageSize = 10; returnListView.page = 2
    returnListView.applied.query = 'DEMO-RT'; returnListView.draft.query = '尚未查询的草稿'
    await open()
    const record = returnSession.records[10]!
    const pane = wrapper!.get('.returns-table-wrap').element as HTMLElement
    const tablePane = wrapper!.get('.returns-table .el-table__body-wrapper .el-scrollbar__wrap').element as HTMLElement
    pane.scrollTop = 96; tablePane.scrollTop = 185
    const row = wrapper!.findAll('.returns-table .el-table__row').find(item => item.text().includes(record.id))!
    await row.get('.link-button').trigger('click'); await stable()
    expect(router.currentRoute.value.name).toBe('oms-ebay-return-detail')
    expect(router.currentRoute.value.meta.activeMenu).toBe(listPath)
    expect(wrapper!.find('.el-drawer').exists()).toBe(false)
    expect(wrapper!.findAll('.页签项>span').map(item => item.text())).toEqual(['退货退款申请', `退货 · ${record.id}`])
    await click('退货退款申请', '.页面页签')
    expect((wrapper!.get('input[aria-label="退货退款申请搜索内容"]').element as HTMLInputElement).value).toBe('尚未查询的草稿')
    expect(wrapper!.findComponent(ElPagination).props()).toMatchObject({ currentPage: 2, pageSize: 10 })
    expect(returnListView).toMatchObject({ applied: { query: 'DEMO-RT' }, queue: 'all', scrollTop: 96, tableScrollTop: 185 })
    expect((wrapper!.get('.returns-table-wrap').element as HTMLElement).scrollTop).toBe(96)
    expect((wrapper!.get('.returns-table .el-table__body-wrapper .el-scrollbar__wrap').element as HTMLElement).scrollTop).toBe(185)
  }, 20000)

  it('同ReturnID跨店独立标签，草稿与阅读位置隔离，关闭只清理当前申请', async () => {
    const first = returnSession.records[0]!, second = { ...copy(first), shopId: 'different-return-shop', shopName: '另一演示店铺', buyerId: 'DEMO-OTHER-BUYER', orderNo: 'DEMO-OTHER-ORDER', systemOrderNo: undefined, outbounds: null }
    returnSession.records.push(second)
    await open(); await openRecord(0)
    const pathA = router.currentRoute.value.path
    await click('发送消息', '.return-operation')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('申请A的未提交草稿')
    await wrapper!.get('.return-operation textarea[aria-label="退货退款内部备注"]').setValue('申请A的内部备注草稿')
    ;(wrapper!.get('.return-reading').element as HTMLElement).scrollTop = 230
    ;(wrapper!.get('.return-operation').element as HTMLElement).scrollTop = 65
    await openRecord(returnSession.records.length - 1)
    const pathB = router.currentRoute.value.path
    await click('发送消息', '.return-operation')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('申请B的未提交草稿')
    await wrapper!.get('.return-operation textarea[aria-label="退货退款内部备注"]').setValue('申请B的内部备注草稿')
    expect(pathB).not.toBe(pathA)
    expect(wrapper!.findAll('.页签项')).toHaveLength(3)
    await wrapper!.findAll('.页签项')[1]!.trigger('click'); await stable()
    expect((wrapper!.get('textarea[aria-label="退货退款处理说明"]').element as HTMLTextAreaElement).value).toBe('申请A的未提交草稿')
    expect((wrapper!.get('.return-operation textarea[aria-label="退货退款内部备注"]').element as HTMLTextAreaElement).value).toBe('申请A的内部备注草稿')
    expect((wrapper!.get('.return-reading').element as HTMLElement).scrollTop).toBe(230)
    expect((wrapper!.get('.return-operation').element as HTMLElement).scrollTop).toBe(65)
    await wrapper!.get('.页签项.激活 [aria-label="关闭页签"]').trigger('click'); await stable()
    expect(router.currentRoute.value.path).toBe(listPath)
    expect(readReturnDetailView(returnKey(first)).actionDraft).toBeNull()
    expect(readReturnDetailView(returnKey(first)).note).toBe('')
    expect(readReturnDetailView(returnKey(second)).actionDraft?.text).toBe('申请B的未提交草稿')
    expect(readReturnDetailView(returnKey(second)).note).toBe('申请B的内部备注草稿')
    expect(wrapper!.findAll('.页签项')).toHaveLength(2)
    // 关闭非活动详情页签也须清理它的草稿。
    const detailTab = wrapper!.findAll('.页签项').find(item => item.text().includes(second.id))!
    await detailTab.get('[aria-label="关闭页签"]').trigger('click'); await stable()
    expect(readReturnDetailView(returnKey(second)).actionDraft).toBeNull()
    expect(readReturnDetailView(returnKey(second)).note).toBe('')
    expect(first.outcome).toBe('idle'); expect(second.outcome).toBe('idle')
  }, 20000)

  it('详情处理后队列最后一页消失，返回仍保留队列并校准到最后有效页', async () => {
    returnListView.queue = 'processing'; returnListView.pageSize = 10; returnListView.page = 2
    await open()
    expect(wrapper!.findComponent(ElPagination).props('currentPage')).toBe(2)
    // 处理中当前共12项，最后页2项在详情期间取得独立的最终关闭回执。
    const processing = returnSession.records.filter(row => inReturnQueue(row, 'processing'))
    const lastPage = processing.slice(10)
    expect(lastPage).toHaveLength(2)
    const target = lastPage[0]!
    await router.push({ name: 'oms-ebay-return-detail', params: { shopId: target.shopId, returnId: target.id } }); await stable()
    for (const row of lastPage) { row.state = 'CLOSED'; row.status = 'CLOSED' }
    await click('退货退款申请', '.页面页签')
    expect(returnListView.queue).toBe('processing')
    expect(wrapper!.findComponent(ElPagination).props()).toMatchObject({ currentPage: 1, pageSize: 10, total: 10 })
    expect(wrapper!.findAll('.returns-table .el-table__row')).toHaveLength(10)
  }, 20000)

  it('支持详情直达，错店或同店身份重复时空态，不选择第一条申请', async () => {
    const row = returnSession.records[0]!
    await open(`${listPath}/${row.shopId}/${row.id}`)
    expect(wrapper!.get('.detail-id').text()).toContain(row.id)
    expect(wrapper!.find('.return-operation').exists()).toBe(true)
    await router.push(`${listPath}/wrong-shop/${row.id}`); await stable()
    expect(wrapper!.get('.return-detail-empty').text()).toContain('未找到唯一对应')
    expect(wrapper!.find('.return-operation').exists()).toBe(false)
    returnSession.records.push(copy(row))
    await router.push(`${listPath}/${row.shopId}/${row.id}`); await stable()
    expect(wrapper!.get('.return-detail-empty').text()).toContain('未找到唯一对应')
  }, 20000)

  it('新详情仍冻结确认来源，未知结果不能重复提交且不出现后台办理入口', async () => {
    await open(); await openRecord(0)
    const row = returnSession.records[0]!
    const mailBefore = JSON.stringify(mailSession.conversations)
    await click('发送消息', '.return-operation')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('确认时的消息')
    await click('确认内容')
    expect(wrapper!.get('[data-title="确认发送消息"]').text()).toContain('确认时的消息')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('确认后的不同内容')
    await click('确认提交')
    expect(row.pendingRequest?.body).toMatchObject({ message: { content: '确认时的消息' } })
    expect(row.pendingRequest?.body).not.toHaveProperty('fileId')
    expect(row.outcome).toBe('pending')
    expect(JSON.stringify(mailSession.conversations)).toBe(mailBefore)
    await openRecord(7)
    expect(returnSession.records[7]!.outcome).toBe('unknown')
    expect(button('发起退款', '.return-operation').attributes('disabled')).toBeDefined()
    expect(wrapper!.find('.platform-links').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('平台办理入口')
  }, 20000)

  it('已关闭退货申请仍可写站内信，保留申请历史、售后结果和原办理资格', async () => {
    resetMailSession()
    try {
      const row = returnSession.records.find(r => r.state === 'CLOSED' && !r.options.includes('SELLER_SEND_MESSAGE'))!
      await open(`${listPath}/${row.shopId}/${row.id}`)
      const before = {
        history: JSON.stringify(row.history), outcome: row.outcome, pending: row.pendingRequest,
        saleCount: recordsForReturn(row.shopId, row.id).length,
      }
      expect(button('发送消息', '.return-operation').attributes('disabled')).toBeDefined()
      const wireText = 'Here is a follow-up about the shipment.'
      await click('发送站内信', '.cancel-buyer-mail')
      const dialog = '[data-title="联系买家"]'
      expect(wrapper!.get(dialog).text()).toContain(row.buyerId)
      await wrapper!.get(`${dialog} textarea[aria-label="联系买家站内信正文"]`).setValue(wireText)
      await click('发送站内信', dialog)
      await vi.waitFor(() => {
        const message = mailboxEntries(mailSession.conversations, 'outbox').find(entry => entry.message?.body === wireText)?.message
        expect(message).toMatchObject({
          kind: 'outgoing', delivery: 'success',
          originApplication: { kind: 'return', applicationId: row.id, shopId: row.shopId, orderNo: row.orderNo },
        })
      }, { timeout: 5000 })
      expect(row.state).toBe('CLOSED')
      expect(row.outcome).toBe(before.outcome)
      expect(row.pendingRequest).toEqual(before.pending)
      expect(JSON.stringify(row.history)).toBe(before.history)
      expect(recordsForReturn(row.shopId, row.id)).toHaveLength(before.saleCount)
      expect(button('发送消息', '.return-operation').attributes('disabled')).toBeDefined()
    } finally {
      resetMailSession()
    }
  }, 20000)

  it('商品SKU与订单行ID只读可靠双交易身份，冲突或多行不冒用申请技术ID', async () => {
    const row = returnSession.records[0]!, order = resolveReturnOrder(row, 共享订单.value)!, detail = getReturnDetail(row)
    const original = copy(order.items)
    try {
      expect(resolveReturnItem(row, 共享订单.value)?.externalLineId).toBe(order.items[0]!.externalLineId)
      await open(`${listPath}/${row.shopId}/${row.id}`)
      const product = () => wrapper!.get('.return-item-panel')
      expect(product().text()).toContain('平台 SKU'); expect(product().text()).toContain(order.items[0]!.platformSku!)
      expect(product().text()).toContain('平台订单行 ID'); expect(product().text()).toContain(order.items[0]!.externalLineId)
      expect(product().text()).not.toContain(detail.itemId!); expect(product().text()).not.toContain(detail.transactionId!)
      detail.transactionId = 'CONFLICTING-TRANSACTION'; await stable()
      expect(resolveReturnItem(row, 共享订单.value)).toBeUndefined()
      expect(product().text()).not.toContain(order.items[0]!.platformSku!)
      detail.transactionId = 'DEMO-TXN-1'
      order.items.push(copy(order.items[0]!)); await stable()
      expect(resolveReturnItem(row, 共享订单.value)).toBeUndefined()
      expect(product().text()).not.toContain(order.items[0]!.externalLineId)
    } finally { order.items = original }
  }, 20000)
})
