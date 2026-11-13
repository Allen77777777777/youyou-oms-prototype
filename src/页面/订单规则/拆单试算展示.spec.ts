import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { 初始化拆单规则演示 } from './拆单规则会话'
import { 共享规则 } from './演示会话'
import { 共享订单 } from '../订单处理/演示会话'
import type { 订单规则 } from './规则逻辑'
import SplitSimulation from './拆单试算结果.vue'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
初始化拆单规则演示()
const baseline = clone({ orders: 共享订单.value, rules: 共享规则.value })
let wrapper: VueWrapper | undefined
const source = () => 共享订单.value.find(order => order.systemOrderNo === 'OMS-SPLIT-01')!
function rule(): 订单规则 {
  return { ...clone(baseline.rules.find(item => item.id === 'RULE-SPLIT-01')!), id: 'SPLIT-DISPLAY-ONLY', name: '展示验证规则', enabled: true,
    conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }] }
}
function useRules(rules: 订单规则[]) { 共享规则.value = [...clone(baseline.rules.filter(item => item.type !== '拆单规则')), ...rules] }
async function openAndRun() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(SplitSimulation, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
  await flushPromises()
  return wrapper
}
beforeEach(() => { 共享订单.value = clone(baseline.orders); 共享规则.value = clone(baseline.rules) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })

describe('正式拆单试算的结果展示', () => {
  it.each(['未命中', '命中但仍为一包'] as const)('%s时显示无需拆分，禁用保存且不暗示已有待分仓任务', async scenario => {
    const current = rule()
    if (scenario === '未命中') current.conditions = [{ field: 'countryCode', operator: '等于', value: 'GB' }]
    else Object.assign(current.splitAction!, { basis: 'system', strategy: 'selected', selectedSkus: source().items.map(item => item.systemSku!) })
    useRules([current])
    const before = JSON.stringify(source())
    const view = await openAndRun()
    expect(view.find('.拆单阻断').exists()).toBe(false)
    expect(view.findAll('.拆单包裹卡')).toHaveLength(1)
    expect(view.get('.拆单结果总览').text()).toContain('无需拆分')
    expect(view.get('.拆单结果区 h3').text()).toContain('本次无需拆分，未生成待分仓候选')
    expect(view.get('.拆单结果区').text()).not.toContain('保存后由分仓规则')
    expect(view.findAll('.拆单包裹标签 .el-tag').map(tag => tag.text())).toContain('无需拆分')
    expect(view.findAll('.拆单包裹标签 .el-tag').map(tag => tag.text())).not.toContain('待分仓')
    const save = view.findAll('button').find(button => button.text() === '保存拆分结果')!
    expect((save.element as HTMLButtonElement).disabled).toBe(true)
    expect(JSON.stringify(source())).toBe(before)
    expect(source().ruleSplitDraft).toBeUndefined()
    if (scenario === '未命中') {
      expect(view.find('.关键轨迹').exists()).toBe(false)
      expect(view.get('.其他轨迹').attributes('open')).toBeUndefined()
      expect(view.get('.其他轨迹 summary').text()).toContain('未命中 1 条')
    } else expect(view.get('.关键轨迹 .包裹流向').text()).toBe('包裹 1 · 保持一包')
  })

  it('连续拆分后，最终包卡和执行过程显示同一分支编号', async () => {
    const first = rule()
    Object.assign(first.splitAction!, { basis: 'system', strategy: 'sku', continueMatching: true })
    const second = { ...clone(first), id: 'SPLIT-DISPLAY-NEXT', name: '第二轮每件拆分', priority: first.priority + 10 }
    Object.assign(second.splitAction!, { strategy: 'unit', continueMatching: false })
    useRules([first, second])
    const view = await openAndRun()
    expect(view.find('.拆单阻断').exists()).toBe(false)
    expect(view.findAll('.拆单包裹卡 h4').map(title => title.text())).toEqual(['包裹 1-1-1', '包裹 1-1-2', '包裹 1-2-1', '包裹 1-2-2', '包裹 1-2-3'])
    expect(view.findAll('.关键轨迹 .包裹流向').map(flow => flow.text())).toContain('包裹 1-1 → 包裹 1-1-1、包裹 1-1-2')
    expect(view.findAll('.关键轨迹 .包裹流向').map(flow => flow.text())).toContain('包裹 1-2 → 包裹 1-2-1、包裹 1-2-2、包裹 1-2-3')
    expect((view.findAll('button').find(button => button.text() === '保存拆分结果')!.element as HTMLButtonElement).disabled).toBe(false)
    expect(source().ruleSplitDraft).toBeUndefined()
  })
})
