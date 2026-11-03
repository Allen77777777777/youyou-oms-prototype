import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElSelect } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import StatisticsPage from './页面.vue'
import { reviewSession, resetReviewSession } from '../eBay评价/会话'
import type { ReviewRecord } from '../eBay评价/类型'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
let wrapper: VueWrapper
const clickButton = async (label: string) => {
  const button = wrapper.findAll('button').find(node => node.text().trim() === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  await button.trigger('click'); await flushPromises()
}
const metric = (id: string) => wrapper.get(`[data-testid="metric-${id}"]`).text()

beforeEach(() => {
  resetReviewSession(); push.mockReset()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  const base = reviewSession.reviews[0]!
  const record = (id: string, patch: Partial<ReviewRecord>): ReviewRecord => ({ ...base, id, shopId: 'shop-us', shopName: '演示店铺-US', automated: false, platformState: 'ENTERED', createdAt: '2026-10-28T23:30:00Z', reason: '车型适配', handlingStatus: 'pending', reply: undefined, ...patch })
  reviewSession.reviews = [
    record('positive-auto', { commentType: 'POSITIVE', automated: true }),
    record('negative', { commentType: 'NEGATIVE' }),
    record('neutral', { commentType: 'NEUTRAL', shopId: 'shop-uk', shopName: '演示店铺-UK', handlingStatus: 'processing' }),
    record('withdrawn', { commentType: 'NEGATIVE', platformState: 'WITHDRAWN' }),
    record('hidden', { commentType: 'NEGATIVE', platformState: 'HIDDEN' }),
    record('replaced', { commentType: 'NEGATIVE', platformState: 'REVISED' }),
    record('outside', { commentType: 'NEGATIVE', createdAt: '2026-09-29T12:00:00+08:00' }),
  ]
  wrapper = mount(StatisticsPage, { attachTo: document.body, global: { directives: { prototype: {} } } })
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); resetReviewSession() })

describe('eBay评价统计页面', () => {
  it('有效口径排除已失效记录，拆分来源，按北京时间包含首尾整日', () => {
    expect(metric('total')).toBe('3'); expect(metric('buyer')).toBe('2'); expect(metric('automated')).toBe('1')
    expect(metric('nonpositive')).toBe('2'); expect(metric('rate')).toBe('66.7%'); expect(metric('pending')).toBe('2')
    expect(wrapper.findAll('.trend-bar')).toHaveLength(30)
    expect(wrapper.get('.trend-bar:last-child').attributes('aria-label')).toContain('2026-10-29，好评1，中评1，差评1')
    expect(wrapper.findAll('.statistics-shop-table .el-table__row')).toHaveLength(2)
  })
  it('来源草稿查询前不生效，重置恢复30天全部来源', async () => {
    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', 'automated'); await flushPromises()
    expect(metric('total')).toBe('3')
    await clickButton('查询')
    expect(metric('total')).toBe('1'); expect(metric('buyer')).toBe('0'); expect(metric('automated')).toBe('1'); expect(metric('rate')).toBe('0.0%')
    expect(wrapper.get('[data-testid="metric-buyer"]').attributes('disabled')).toBeDefined()
    await clickButton('重置'); expect(metric('total')).toBe('3'); expect(metric('rate')).toBe('66.7%')
  })
  it('无效日期不覆盖已应用范围，无数据分母显示—且图表清空', async () => {
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-11-01', '2026-10-01']); await flushPromises(); await clickButton('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('开始时间不能晚于结束时间')
    expect(metric('total')).toBe('3')
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-08-01', '2026-08-02']); await flushPromises(); await clickButton('查询')
    expect(metric('total')).toBe('0'); expect(metric('rate')).toBe('—'); expect(metric('pending')).toBe('0')
    expect(wrapper.find('.trend-chart').exists()).toBe(false); expect(wrapper.text()).toContain('当前范围暂无评价')
    expect(wrapper.findAll('.statistics-shop-table .el-table__row')).toHaveLength(0)
  })
  it('下钻仅携带已应用条件，中差评与待处理入口维持精确范围', async () => {
    wrapper.findComponent(MultiFilter).vm.$emit('update:modelValue', ['shop-us']); await flushPromises(); await clickButton('查询')
    wrapper.findComponent(MultiFilter).vm.$emit('update:modelValue', ['shop-uk']); await flushPromises()
    await wrapper.get('[data-testid="metric-nonpositive"]').trigger('click')
    expect(push).toHaveBeenLastCalledWith({ path: '/oms/ebay-service/reviews', query: { from: 'statistics', effective: '1', shopIds: 'shop-us', startDate: '2026-09-30', endDate: '2026-10-29', source: 'all', commentTypes: 'NEUTRAL,NEGATIVE' } })
    await wrapper.get('[data-testid="metric-pending"]').trigger('click')
    expect(push.mock.calls[push.mock.calls.length - 1]![0].query).toMatchObject({ shopIds: 'shop-us', commentTypes: 'NEUTRAL,NEGATIVE', handlingStatuses: 'pending,processing' })
    await clickButton('查看评价')
    expect(push.mock.calls[push.mock.calls.length - 1]![0].query).toMatchObject({ shopIds: 'shop-us', effective: '1' })
    expect(push.mock.calls[push.mock.calls.length - 1]![0].query).not.toHaveProperty('commentTypes')
  })
  it('共享会话处理与平台状态变化即时反映，完成处理不改中差评数量', async () => {
    reviewSession.reviews.find(row => row.id === 'negative')!.handlingStatus = 'resolved'; await flushPromises()
    expect(metric('pending')).toBe('1'); expect(metric('nonpositive')).toBe('2')
    reviewSession.reviews.find(row => row.id === 'neutral')!.platformState = 'HIDDEN'; await flushPromises()
    expect(metric('total')).toBe('2'); expect(metric('nonpositive')).toBe('1'); expect(metric('pending')).toBe('0'); expect(metric('rate')).toBe('50.0%')
  })
})
