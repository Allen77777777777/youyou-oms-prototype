import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { ElMessage, ElSelect, ElMessageBox } from 'element-plus'
import Page from './手工订单页面.vue'
import { 手工建单界面 as session } from './界面会话'
import { 创建手工订单草稿, 手工商品资料, 手工店铺选项 } from './模型'
import { 共享订单, 演示路由 } from '../订单处理/演示会话'
import { 路由仓库键 } from '../订单处理/仓库物流选择模型'
import { 共享订单备注, 获取订单备注 } from '../订单处理/订单备注模型'

const originalOrders = [...共享订单.value]
const originalNotes = [...共享订单备注.value]
const manualOrders = () => 共享订单.value.filter(order => order.manualOrder)
let wrapper: VueWrapper | undefined, router: Router
async function settle() { await nextTick(); await flushPromises(); await nextTick() }
async function open() {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }, { path: '/process', name: 'oms-order-processing', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(Page, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } }); await settle()
}
async function click(text: string) { const button = wrapper!.findAll('button').find(item => item.text() === text); expect(button).toBeTruthy(); await button!.trigger('click'); await settle() }
async function select(label: string, value: string | string[]) { const input = wrapper!.findAllComponents(ElSelect).find(item => item.attributes('aria-label') === label || item.find(`[aria-label="${label}"]`).exists()); expect(input).toBeTruthy(); input!.vm.$emit('update:modelValue', value); await settle() }
async function validForm() {
  await wrapper!.get('input[aria-label="建单原因"]').setValue('页面交互验收寄样')
  await select('发货店铺', 手工店铺选项.value[0]!.storeId)
  await select('发货仓库', 路由仓库键(演示路由[0]!))
  await select('物流渠道', 演示路由[0]!.shippingChannelCode)
  await select('第1行系统SKU', 手工商品资料[0]!.systemSku)
  await select('国家地区', 'US')
  for (const [label, value] of [['收件人', '虚构收件人'], ['联系电话', '000-000-0000'], ['城市', 'Demo City'], ['邮编', '90000'], ['地址1', '100 Example Street']]) await wrapper!.get(`input[aria-label="${label}"]`).setValue(value)
}
beforeEach(() => { session.draft = 创建手工订单草稿(); 共享订单.value = [...originalOrders]; for (const type of ['success', 'warning'] as const) vi.spyOn(ElMessage, type).mockImplementation(() => ({ close: vi.fn() })) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; session.draft = 创建手工订单草稿(); 共享订单.value = [...originalOrders]; 共享订单备注.value = [...originalNotes]; document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('手工订单直接建单页面', () => {
  it('入口直接显示表单，不含列表、队列或新建弹窗，未提交不生成订单', async () => {
    const count = manualOrders().length
    await open()
    expect(wrapper!.find('input[aria-label="建单原因"]').exists()).toBe(true)
    expect(wrapper!.find('.el-table').exists()).toBe(false)
    expect(wrapper!.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper!.find('.el-dialog').exists()).toBe(false)
    expect(wrapper!.find('.el-pagination').exists()).toBe(false)
    expect(session.draft.items).toEqual([{ systemSku: '', quantity: 1 }])
    expect(manualOrders()).toHaveLength(count)
  })
  it('缺失信息阻断创建、保留当前输入并展示具体错误', async () => {
    await open(); const count = manualOrders().length
    await wrapper!.get('input[aria-label="建单原因"]').setValue('尚未完善的寄样说明')
    await click('创建并进入订单处理')
    expect(wrapper!.get('.manual-errors').text()).toContain('收件人')
    expect(wrapper!.get('.manual-errors').text()).toContain('系统商品')
    expect(wrapper!.get('.manual-errors').text()).toContain('发货店铺')
    expect(wrapper!.get('.manual-errors').text()).toContain('发货仓库')
    expect(wrapper!.get('.manual-errors').text()).toContain('物流渠道')
    expect(session.draft.reason).toBe('尚未完善的寄样说明')
    expect(manualOrders()).toHaveLength(count)
    expect(router.currentRoute.value.path).toBe('/')
  })
  it('离开后重新进入页面保留未提交草稿，清空须确认', async () => {
    await open(); const count = manualOrders().length
    await wrapper!.get('input[aria-label="建单原因"]').setValue('未提交的寄样说明')
    wrapper!.unmount(); wrapper = undefined; await open()
    expect((wrapper!.get('input[aria-label="建单原因"]').element as HTMLInputElement).value).toBe('未提交的寄样说明')
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    await click('清空表单'); expect(session.draft.reason).toBe('未提交的寄样说明')
    confirm.mockResolvedValueOnce('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>); await click('清空表单')
    expect(session.draft.reason).toBe(''); expect(session.draft.items).toEqual([{ systemSku: '', quantity: 1 }])
    expect(manualOrders()).toHaveLength(count)
  })
  it('成功仅创建一张待审核共享订单并自动精确跳转，清理草稿', async () => {
    await open(); await validForm(); const count = manualOrders().length
    await select('订单标签', ['补寄关注', '加固包装'])
    await wrapper!.get('textarea[aria-label="订单备注"]').setValue('请核对赠品清单')
    await wrapper!.get('input[aria-label="收件公司"]').setValue('Demo Company')
    await wrapper!.get('input[aria-label="收件邮箱"]').setValue('demo@example.invalid')
    const button = wrapper!.findAll('button').find(item => item.text() === '创建并进入订单处理')!
    await Promise.all([button.trigger('click'), button.trigger('click')]); await settle()
    expect(manualOrders()).toHaveLength(count + 1)
    const order = manualOrders()[0]!
    expect(order.processingStatus).toBe('待审核'); expect(order.items[0]!.systemSku).toBe(手工商品资料[0]!.systemSku)
    expect(order.fulfillmentOrders).toEqual([]); expect(order.platformOrderNo).toBe('')
    expect(order.storeId).toBe(手工店铺选项.value[0]!.storeId)
    expect(order.defaultRoute).toEqual(演示路由[0])
    expect(order.tags).toEqual(['补寄关注', '加固包装'])
    expect(获取订单备注(order.systemOrderNo).map(note => note.note_content)).toEqual(['请核对赠品清单'])
    expect(order.address).toMatchObject({ companyName: 'Demo Company', email: 'demo@example.invalid' })
    expect(session.draft.reason).toBe(''); expect(session.draft.items).toEqual([])
    expect(router.currentRoute.value.name).toBe('oms-order-processing'); expect(router.currentRoute.value.query.systemOrderNo).toBe(order.systemOrderNo)
  })
  it('切换服务商清空仓库渠道，重新选择及清空表单不会残留上轮路由', async () => {
    await open(); await validForm()
    await select('仓储服务商', 演示路由[1]!.warehouseProvider)
    expect(session.draft.warehouse).toBe(''); expect(session.draft.channel).toBe('')
    await select('发货仓库', 路由仓库键(演示路由[1]!))
    expect(session.draft.channel).toBe('')
    await select('物流渠道', 演示路由[1]!.shippingChannelCode)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
    await click('清空表单')
    expect(session.draft.storeId).toBe(''); expect(session.draft.warehouse).toBe(''); expect(session.draft.channel).toBe('')
    const provider = wrapper!.findAllComponents(ElSelect).find(item => item.attributes('aria-label') === '仓储服务商' || item.find('[aria-label="仓储服务商"]').exists())!
    expect(provider.props('modelValue')).toBe('')
  })
})

