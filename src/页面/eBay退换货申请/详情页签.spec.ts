import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    await click('发送消息', '.return-operation')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('确认时的消息')
    await click('确认内容')
    expect(wrapper!.get('[data-title="确认发送消息"]').text()).toContain('确认时的消息')
    await wrapper!.get('textarea[aria-label="退货退款处理说明"]').setValue('确认后的不同内容')
    await click('确认提交')
    expect(row.pendingRequest?.body).toMatchObject({ message: { content: '确认时的消息' } })
    expect(row.pendingRequest?.body).not.toHaveProperty('fileId')
    expect(row.outcome).toBe('pending')
    await openRecord(7)
    expect(returnSession.records[7]!.outcome).toBe('unknown')
    expect(button('发起退款', '.return-operation').attributes('disabled')).toBeDefined()
    expect(wrapper!.find('.platform-links').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('平台办理入口')
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
