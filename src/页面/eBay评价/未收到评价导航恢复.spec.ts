import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElPagination } from 'element-plus'
import ReviewPage from './eBay评价页面.vue'
import { resetReviewSession } from './会话'
import { resetAwaitingReviewSession } from './未收到评价会话'
import { resetMailSession } from '../eBay站内信/会话'
import { resetReviewContactSession } from './联系买家模型'
import { resetAwaitingReviewView, reviewViewSession, saveAwaitingReviewView } from './评价视图会话'
import { createAwaitingReviewFilters, type AwaitingReviewRow } from './未收到评价模型'

let wrapper: VueWrapper | undefined
beforeEach(() => { resetReviewSession(); resetAwaitingReviewSession(); resetMailSession(); resetReviewContactSession() })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('评价跟踪查看OMS订单及返回位置', () => {
  it('完整OMS详情往返恢复页签、查询草稿、已应用条件、分页及勾选', async () => {
    reviewViewSession.activeTab = 'awaiting'
    reviewViewSession.awaiting.pageSize = 10
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/oms/ebay-service/reviews', component: ReviewPage },
      // 完整详情内容已有专项和浏览器验收；此处保留真实路由切换，只隔离详情内部组件。
      { path: '/oms/orders/all/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<h1>订单详情 {{ $route.params.systemOrderNo }}</h1>' } },
    ] })
    await router.push('/oms/ebay-service/reviews'); await router.isReady()
    wrapper = mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } })
    await flushPromises()
    await wrapper.get('input[aria-label="发货最少天数"]').setValue('0')
    await wrapper.findAll('button').find(button => button.text() === '查询')!.trigger('click'); await flushPromises()
    await wrapper.get('input[aria-label="发货最多天数"]').setValue('40')
    const pagination = wrapper.findComponent(ElPagination)
    pagination.vm.$emit('update:page-size', 10); await flushPromises()
    pagination.vm.$emit('update:current-page', 2); pagination.vm.$emit('current-change', 2); await flushPromises()
    const table = wrapper.findComponent({ name: 'ElTable' })
    const selected = (table.props('data') as AwaitingReviewRow[]).find(row => Boolean(row.omsOrderId))!
    expect(selected).toBeTruthy()
    table.vm.$emit('selection-change', [selected]); await flushPromises()
    const row = wrapper.findAll('.awaiting-review-table .el-table__body-wrapper .el-table__row').find(row => row.text().includes(selected.orderNo))!
    await row.findAll('button').find(button => button.text() === '查看OMS订单')!.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.name).toBe('oms-all-order-detail')
    expect(router.currentRoute.value.params.systemOrderNo).toBe(selected.omsOrderNo)
    expect(wrapper.text()).toContain('订单详情')
    expect(wrapper.text()).toContain(selected.omsOrderNo)
    expect(reviewViewSession.awaiting).toMatchObject({ page: 2, pageSize: 10, selected: [selected.id], draft: { minDays: '0', maxDays: '40' }, applied: { minDays: '0', maxDays: '' } })
    await router.push('/oms/ebay-service/reviews'); await flushPromises()
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('未收到买家评价')
    expect((wrapper.get('input[aria-label="发货最多天数"]').element as HTMLInputElement).value).toBe('40')
    expect(wrapper.findComponent(ElPagination).props()).toMatchObject({ currentPage: 2, pageSize: 10 })
    expect(wrapper.text()).toContain('已选 1 笔')
    expect(wrapper.findAll('.awaiting-review-table .el-table__body-wrapper .el-checkbox.is-checked')).toHaveLength(1)
  }, 20000)

  it('显式切方向重置待评价查询，不被离开组件的旧回调覆盖', () => {
    const filters = createAwaitingReviewFilters()
    const generation = reviewViewSession.awaitingGeneration
    saveAwaitingReviewView({ draft: { ...filters, query: 'DEMO-AWAIT-001' }, applied: filters, page: 2, pageSize: 10, selected: ['AWAIT-DEMO-001'] }, generation)
    resetAwaitingReviewView()
    saveAwaitingReviewView({ draft: filters, applied: filters, page: 9, pageSize: 50, selected: ['OLD'] }, generation)
    expect(reviewViewSession.awaiting).toMatchObject({ draft: { query: '' }, page: 1, pageSize: 20, selected: [] })
  })
})
