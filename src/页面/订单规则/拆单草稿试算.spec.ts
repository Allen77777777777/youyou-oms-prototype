import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { 初始化拆单规则演示, 试算当前拆单草稿, 拆单草稿试算已过期, 试算拆单规则, 应用拆单规则结果, 拆单资料版本 } from './拆单规则会话'
import { 共享规则, 共享规则日志 } from './演示会话'
import { 共享订单, 订单版本 } from '../订单处理/演示会话'
import { 关联演示数据 } from '../订单处理/库存关联模型'
import type { 订单规则 } from './规则逻辑'
import RuleForm from './规则编辑表单.vue'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
初始化拆单规则演示()
const baseline = clone({ orders: 共享订单.value, rules: 共享规则.value, logs: 共享规则日志.value, versions: 订单版本.value, mappings: 关联演示数据.mappings, sourceVersion: 拆单资料版本.value })
const order = () => 共享订单.value.find(item => item.systemOrderNo === 'OMS-SPLIT-01')!
const draftRule = (): 订单规则 => ({ ...clone(共享规则.value.find(item => item.id === 'RULE-SPLIT-01')!), id: 'DRAFT-ONLY', name: '新增草稿预览', enabled: false })
let wrapper: VueWrapper | undefined
function businessSnapshot() { return JSON.stringify({ orders: 共享订单.value, rules: 共享规则.value, logs: 共享规则日志.value, versions: 订单版本.value }) }
beforeEach(() => {
  共享订单.value = clone(baseline.orders); 共享规则.value = clone(baseline.rules); 共享规则日志.value = clone(baseline.logs)
  订单版本.value = clone(baseline.versions); 关联演示数据.mappings = clone(baseline.mappings); 拆单资料版本.value = baseline.sourceVersion
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })

describe('编辑中的拆单草稿只读试算', () => {
  it('新增或复制的停用草稿可试算，仅执行当前草稿且不改变启停、订单和日志', () => {
    const draft = draftRule(), originalDraft = JSON.stringify(draft), before = businessSnapshot()
    draft.splitAction!.strategy = 'unit'
    const result = 试算当前拆单草稿(order().systemOrderNo, draft)
    expect(result.mode).toBe('draft')
    expect(result.errors).toEqual([])
    expect(result.packages).toHaveLength(5)
    expect(result.matchedRuleIds).toEqual([draft.id])
    expect(new Set(result.trace.map(item => item.ruleId))).toEqual(new Set([draft.id]))
    expect(draft.enabled).toBe(false)
    expect(JSON.stringify({ ...draft, splitAction: { ...draft.splitAction, strategy: 'sku' } })).toBe(originalDraft)
    expect(businessSnapshot()).toBe(before)
  })

  it('草稿结果即使被误传给正式保存API也不能写入订单', () => {
    const result = 试算当前拆单草稿(order().systemOrderNo, draftRule()), before = businessSnapshot()
    // @ts-expect-error 草稿结果不能赋给正式试算，运行时同样必须拒绝。
    const response = 应用拆单规则结果(result)
    expect(response.成功).toBe(false)
    expect(response.信息).toContain('草稿试算仅供预览')
    expect(businessSnapshot()).toBe(before)
  })

  it('无效条件与失效平台SKU均显示阻断，不制造成功预览', () => {
    const draft = draftRule()
    draft.conditions = []
    expect(试算当前拆单草稿(order().systemOrderNo, draft).errors.join()).toContain('完整条件')
    draft.conditions = clone(共享规则.value.find(item => item.id === 'RULE-SPLIT-01')!.conditions)
    Object.assign(draft.splitAction!, { basis: 'platform', strategy: 'selected', selectedSkus: ['MISSING-SKU'] })
    const result = 试算当前拆单草稿(order().systemOrderNo, draft)
    expect(result.errors.join()).toContain('不可用资料')
    expect(result.packages).toHaveLength(0)
  })

  it('草稿改变后旧结果失效，重新试算读取新参数', () => {
    const draft = draftRule(), result = 试算当前拆单草稿(order().systemOrderNo, draft)
    expect(拆单草稿试算已过期(result, draft)).toBe(false)
    draft.splitAction!.strategy = 'unit'
    expect(拆单草稿试算已过期(result, draft)).toBe(true)
    const rerun = 试算当前拆单草稿(order().systemOrderNo, draft)
    expect(rerun.packages).toHaveLength(5)
    expect(拆单草稿试算已过期(rerun, draft)).toBe(false)
  })

  it.each(['订单', '资料', '平台至系统SKU配对'] as const)('%s改变后旧草稿试算失效', kind => {
    const draft = draftRule(), result = 试算当前拆单草稿(order().systemOrderNo, draft)
    if (kind === '订单') order().items[0]!.fulfillableQuantity = 1
    if (kind === '资料') 拆单资料版本.value++
    if (kind === '平台至系统SKU配对') order().items[0]!.systemSku = 'CHANGED-SYSTEM-SKU'
    expect(拆单草稿试算已过期(result, draft)).toBe(true)
  })

  it('仓库SKU映射变化不使系统SKU草稿过期，旧仓库SKU草稿则明确拒绝且不改配置', () => {
    const draft = draftRule(), result = 试算当前拆单草稿(order().systemOrderNo, draft)
    关联演示数据.mappings.find(item => item.systemSku === 'SPLIT-BASIC-BOX')!.status = '待核实'
    expect(拆单草稿试算已过期(result, draft)).toBe(false)
    draft.splitAction!.basis = 'warehouse'
    draft.splitAction!.warehouseScopeId = 'DEMO-CF-CHANNEL-WYT'
    const before = JSON.stringify(draft), business = businessSnapshot()
    expect(试算当前拆单草稿(order().systemOrderNo, draft).errors.join()).toContain('已移除')
    expect(JSON.stringify(draft)).toBe(before)
    expect(businessSnapshot()).toBe(business)
  })

  it('草稿连续开关不拉入其他已启用规则；正式试算仍可正常保存候选', () => {
    const draft = draftRule()
    draft.splitAction!.continueMatching = true
    const preview = 试算当前拆单草稿(order().systemOrderNo, draft)
    expect(preview.trace.every(item => item.ruleId === draft.id)).toBe(true)
    const saved = 试算拆单规则(order().systemOrderNo)
    expect(saved.mode).toBe('saved')
    expect(应用拆单规则结果(saved).成功).toBe(true)
    expect(order().ruleSplitDraft?.packages).toHaveLength(2)
    expect(order().manualShippingPlan).toBeUndefined()
  })

  it('编辑页直接打开草稿试算，返回保留编辑，预览中没有保存拆分结果入口', async () => {
    const draft = reactive(draftRule()), before = businessSnapshot()
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/'); await router.isReady()
    wrapper = mount(RuleForm, { props: { draft, rules: 共享规则.value, orders: 共享订单.value }, attachTo: document.body,
      global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: { props: ['modelValue'], template: '<section v-if="modelValue"><slot /></section>' } } } })
    await flushPromises()
    await wrapper.findAll('button').find(item => item.text() === '试算当前草稿')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('仅试算当前草稿')
    expect(wrapper.text()).toContain('不代表整套规则的最终结果')
    await wrapper.findAll('button').find(item => item.text() === '开始试算')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.拆单试算').text()).toContain('预览结果')
    expect(wrapper.find('.拆单试算').findAll('button').map(item => item.text())).not.toContain('保存拆分结果')
    draft.splitAction!.strategy = 'unit'
    await flushPromises()
    expect(wrapper.find('.拆单试算').text()).toContain('草稿、订单或来源资料已变化')
    await wrapper.findAll('button').find(item => item.text() === '返回编辑')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.拆单试算').exists()).toBe(false)
    expect(draft.splitAction!.strategy).toBe('unit')
    expect(draft.enabled).toBe(false)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(businessSnapshot()).toBe(before)
  })
})
