import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElInputNumber, ElMessage, ElMessageBox, ElRadioGroup, ElSwitch } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import Panel from './自动合单设置面板.vue'
import Page from './业务配置页面.vue'
import { 共享自动合单设置, 共享下次合单时间 } from './自动合单设置'
import { 共享合单记录, 共享合单执行结果 } from '../订单处理/自动合单状态'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'

const runtime = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../订单处理/自动合单会话', async () => ({
  ...await import('../订单处理/自动合单状态'),
  执行合单轮次: runtime.run,
  初始化合单规则演示: vi.fn(),
}))
let wrapper: VueWrapper | undefined
beforeEach(() => {
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
  共享下次合单时间.value = null
  共享合单记录.value = []
  共享合单执行结果.value = null
  runtime.run.mockReset()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})
function open() {
  wrapper = mount(Panel, { global: { directives: { prototype: {} } } })
  return wrapper
}
async function click(text: string) {
  const button = wrapper!.findAll('button').find(button => button.text() === text)
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}

describe('自动合单设置面板', () => {
  it('默认关闭，快捷频率和自定义可以保存；取消保留已保存值', async () => {
    const panel = open()
    expect(panel.text()).toContain('每 30 分钟执行一轮')
    expect(panel.text()).toContain('未开启定时执行')
    await click('编辑')
    panel.getComponent(ElSwitch).vm.$emit('update:modelValue', true)
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 60)
    await click('保存')
    expect(共享自动合单设置.value).toMatchObject({ enabled: true, intervalMinutes: 60 })
    await click('编辑')
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'custom')
    await flushPromises()
    panel.getComponent(ElInputNumber).vm.$emit('update:modelValue', 45)
    await click('取消')
    expect(共享自动合单设置.value.intervalMinutes).toBe(60)
    await click('编辑')
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'custom')
    await flushPromises()
    panel.getComponent(ElInputNumber).vm.$emit('update:modelValue', 45)
    await click('保存')
    expect(共享自动合单设置.value.intervalMinutes).toBe(45)
  })

  it('缺失自定义频率阻止保存，正在编辑不能立即执行', async () => {
    const panel = open()
    await click('编辑')
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'custom')
    await flushPromises()
    panel.getComponent(ElInputNumber).vm.$emit('update:modelValue', undefined)
    await click('保存')
    expect(panel.get('[role="alert"]').text()).toContain('1～1440')
    expect(panel.findAll('button').find(button => button.text() === '立即执行一轮')!.attributes('disabled')).toBeDefined()
    expect(共享自动合单设置.value.intervalMinutes).toBe(30)
  })

  it('关闭有等待订单时说明影响，取消确认不改变生效设置', async () => {
    共享自动合单设置.value.enabled = true
    共享合单记录.value = [{
      orderNo: 'ORD-MERGE-1', ruleId: 'rule-1', ruleName: '基础合单', ruleVersion: 1, settingsVersion: 1,
      action: 创建默认合单动作(), groupKey: 'buyer-1', quantity: 1,
      enteredAt: Date.now(), deadlineAt: Date.now() + 60_000, deadlineReason: '本轮合单处理时间已到',
      status: '待本轮处理', reason: '等待下一轮合单处理',
    }]
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm' as never)
    const panel = open()
    await click('编辑')
    panel.getComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await click('保存')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 个订单'), '关闭自动合单', expect.any(Object))
    expect(共享自动合单设置.value.enabled).toBe(true)
    await click('保存')
    expect(共享自动合单设置.value.enabled).toBe(false)
  })

  it('关闭状态可立即执行并查看结果，不改变已保存开关和周期', async () => {
    runtime.run.mockImplementation((now: number, source: string) => {
      共享合单执行结果.value = { executedAt: now, source, total: 1, merged: 0, released: 0, waiting: 1, skipped: 0, rows: [{ orderNo: 'ORD-WAIT-1', status: '等单中', reason: '等待同组订单' }] }
      return 共享合单执行结果.value
    })
    const panel = open()
    expect(panel.findAll('button').find(button => button.text() === '查看执行结果')!.attributes('disabled')).toBeDefined()
    await click('立即执行一轮')
    expect(runtime.run).toHaveBeenCalledWith(expect.any(Number), '立即执行')
    expect(共享自动合单设置.value).toMatchObject({ enabled: false, intervalMinutes: 30 })
    expect(panel.text()).toContain('继续等单 1 单')
    expect(document.body.textContent).toContain('合单执行结果')
    expect(document.body.textContent).toContain('ORD-WAIT-1')
  })

  it('业务配置移除合单入口，旧 section=merge 深链直接替换到合单规则', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/oms/self-fulfillment/business-settings', component: Page },
      { path: '/oms/self-fulfillment/order-rules', component: { template: '<div>订单规则</div>' } },
    ] })
    await router.push('/oms/self-fulfillment/business-settings?section=merge')
    await router.isReady()
    wrapper = mount(Page, { global: { plugins: [router], directives: { prototype: {} } } })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/oms/self-fulfillment/order-rules?type=merge')
    expect(wrapper.get('nav').text()).not.toContain('自动合单设置')
    expect(wrapper.findComponent(Panel).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('统一在合单规则页面配置')
    expect(wrapper.find('a[href="#/oms/self-fulfillment/order-rules?type=merge"]').exists()).toBe(false)
    await click('自动推单设置')
    await click('规则执行设置')
    expect(wrapper.findComponent(Panel).exists()).toBe(false)
    expect(共享自动合单设置.value.enabled).toBe(false)
  })
})
