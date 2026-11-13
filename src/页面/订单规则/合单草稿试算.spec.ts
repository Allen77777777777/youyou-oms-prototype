import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import Preview from './合单试算抽屉.vue'
import RuleForm from './规则编辑表单.vue'
import { 共享规则, 共享规则日志 } from './演示会话'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 共享合单记录, 共享合单执行结果 } from '../订单处理/自动合单状态'
import { 初始化合单规则演示 } from '../订单处理/自动合单会话'
import { 自动合单样例资料 } from '../订单处理/自动合单演示'
import { 共享自动合单设置 } from '../业务配置/自动合单设置'
import { 创建默认合单动作 } from './合单规则模型'
import type { 订单规则 } from './规则逻辑'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const now = Date.parse('2026-11-13T02:00:00Z')
const selected = ['OMS-DEMO-AM-BASIC-01', 'OMS-DEMO-AM-BASIC-02']
const original = clone({ orders: 共享订单.value, rules: 共享规则.value, logs: 共享规则日志.value, executions: 仓库执行记录.value })
const drawer = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><footer><slot name="footer" /></footer></section>' }
let wrapper: VueWrapper | undefined
function snapshot() { return JSON.stringify({ orders: 共享订单.value, rules: 共享规则.value, logs: 共享规则日志.value, waiting: 共享合单记录.value, result: 共享合单执行结果.value, settings: 共享自动合单设置.value }) }
function draft(): 订单规则 { return { id: 'UNSAVED', name: '新建停用草稿', type: '合单规则', enabled: false, priority: 5, mode: '全部满足', conditions: [{ field: 'countryCode', operator: '等于', value: 'US' }], action: '进入合单池', version: 1, updatedAt: '', note: '' } }
async function click(label: string) { const button = wrapper!.findAll('button').find(item => item.text() === label); expect(button).toBeDefined(); await button!.trigger('click'); await flushPromises() }
async function selectOrders() { wrapper!.findAllComponents(ElSelect).find(item => item.props('multiple') && item.props('maxCollapseTags') === 3)!.vm.$emit('update:modelValue', selected); await flushPromises() }
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  共享订单.value = clone(original.orders); 共享规则.value = clone(original.rules); 共享规则日志.value = clone(original.logs)
  仓库执行记录.value = clone(original.executions)
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
  共享合单记录.value = []; 共享合单执行结果.value = null
  初始化合单规则演示(now)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); document.body.innerHTML = '' })
const global = { directives: { prototype: {} }, stubs: { ElDrawer: drawer } }

describe('合单草稿只读试算', () => {
  it.each(['weightKg', 'siteId'] as const)('试算依赖的 %s 资料变化后旧结果失效，重新试算采用新来源', async field => {
    const policy = { ...创建默认合单动作(), mode: 'advanced' as const, readyOrderCount: 3, groupBySite: true, maxWeightKg: '10' }
    wrapper = mount(Preview, { props: { modelValue: true, draftPolicy: policy, draftIntervalMinutes: 30 }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.findAll('.候选组')).toHaveLength(1)
    自动合单样例资料[selected[0]!]![field] = field === 'weightKg' ? '12' : 'ANOTHER-VERIFIED-SITE'
    await flushPromises()
    expect(wrapper.find('.试算过期').exists()).toBe(true)
    expect(wrapper.find('.候选组').exists()).toBe(false)
    await click('开始试算')
    expect(wrapper.findAll('.候选组')).toHaveLength(2)
    expect(wrapper.text()).toContain(field === 'weightKg' ? '总重量超过 10 kg' : '订单站点不同')
  })

  it('新增关联仓库执行事实使旧试算失效，复算不把未结束执行视为可合单', async () => {
    wrapper = mount(Preview, { props: { modelValue: true, draftRule: draft() }, global })
    await selectOrders(); await click('开始试算')
    仓库执行记录.value.push({ 订单号: [selected[0]!], 履约单号: 'NEW-EXECUTION', 出库单号: 'NEW-OUT', 状态: '下单中', 待核查: true, 原因: '等待仓库确认', 更新时间: '' })
    await flushPromises()
    expect(wrapper.find('.试算过期').exists()).toBe(true)
    await click('开始试算')
    expect(wrapper.text()).toContain('仓库请求尚未安全结束')
    expect(wrapper.find('.候选组 .组成员').text()).toBe(selected[1])
  })

  it('缺少可信重量时明确排除该单，不补零组成合单候选组', async () => {
    自动合单样例资料[selected[0]!]!.weightKg = ''
    const policy = { ...创建默认合单动作(), maxWeightKg: '10' }, before = snapshot()
    wrapper = mount(Preview, { props: { modelValue: true, draftPolicy: policy, draftIntervalMinutes: 30 }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.text()).toContain('订单重量未核实')
    expect(wrapper.find('.候选组 .组成员').text()).toBe(selected[1])
    expect(snapshot()).toBe(before)
  })

  it('未保存且停用的单条草稿独立试算，不运行其他规则、不写入业务状态', async () => {
    const current = reactive(draft()), before = snapshot()
    wrapper = mount(Preview, { props: { modelValue: true, draftRule: current }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.text()).toContain('仅试算当前入池规则草稿')
    expect(wrapper.text()).toContain('不接着运行其他规则')
    expect(wrapper.findAll('.候选组')).toHaveLength(1)
    expect(wrapper.findAll('.条件轨迹 strong').map(item => item.text())).toEqual([current.name, current.name])
    expect(current.enabled).toBe(false)
    expect(snapshot()).toBe(before)
    expect(wrapper.findAll('button').map(item => item.text())).not.toContain('保存设置')
  })

  it('统一设置草稿使用启用规则和草稿容量，不能覆盖已保存配置', async () => {
    const policy = reactive({ ...创建默认合单动作(), mode: 'advanced' as const, readyOrderCount: 3 })
    const before = snapshot()
    wrapper = mount(Preview, { props: { modelValue: true, draftPolicy: policy, draftIntervalMinutes: 30, draftTaskEnabled: true }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.text()).toContain('仅试算当前统一设置草稿')
    expect(wrapper.text()).toContain('已凑 2 / 3 单')
    expect(wrapper.text()).toContain('本轮计划放单 0 组')
    expect(snapshot()).toBe(before)
    policy.readyOrderCount = 2
    await flushPromises()
    expect(wrapper.text()).toContain('已变化，请重新试算')
    expect(wrapper.find('.候选组').exists()).toBe(false)
    await click('开始试算')
    expect(wrapper.text()).toContain('本轮计划放单 1 组')
    expect(snapshot()).toBe(before)
  })

  it('规则草稿条件与所选来源变化后旧结果均失效，重新试算解释未命中', async () => {
    const current = reactive(draft())
    wrapper = mount(Preview, { props: { modelValue: true, draftRule: current }, global })
    await selectOrders(); await click('开始试算')
    current.conditions[0]!.value = 'CA'; await flushPromises()
    expect(wrapper.find('.试算过期').exists()).toBe(true)
    await click('开始试算')
    expect(wrapper.text()).toContain('不满足条件')
    expect(wrapper.findAll('.候选组')).toHaveLength(0)
    共享订单.value.find(order => order.systemOrderNo === selected[0])!.address.countryCode = 'CA'
    await flushPromises()
    expect(wrapper.find('.试算过期').exists()).toBe(true)
  })

  it('草稿条件缺失和非法设置显示校验原因，不生成成功候选', async () => {
    const current = reactive(draft()); current.conditions = []
    wrapper = mount(Preview, { props: { modelValue: true, draftRule: current }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.find('[role="alert"]').text()).toContain('至少填写一条完整条件')
    expect(wrapper.find('.候选组').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mount(Preview, { props: { modelValue: true, draftPolicy: { ...创建默认合单动作(), maxOrders: 1 }, draftIntervalMinutes: 30 }, global })
    await selectOrders(); await click('开始试算')
    expect(wrapper.find('[role="alert"]').text()).toContain('2～100')
  })

  it('规则编辑页返回后保留草稿，试算不触发保存或启用', async () => {
    const current = reactive(draft()), before = snapshot()
    wrapper = mount(RuleForm, { props: { draft: current, rules: 共享规则.value, orders: 共享订单.value }, global })
    await click('试算当前草稿'); await selectOrders(); await click('开始试算')
    expect(wrapper.find('.合单只读试算').text()).toContain('候选分组')
    await click('返回编辑')
    expect(wrapper.find('.合单只读试算').exists()).toBe(false)
    expect(current.name).toBe('新建停用草稿')
    expect(current.enabled).toBe(false)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(snapshot()).toBe(before)
  })
})
