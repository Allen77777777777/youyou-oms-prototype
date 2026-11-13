import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElRadioGroup } from 'element-plus'
import MergeAction from './合单动作输入.vue'
import RuleForm from './规则编辑表单.vue'
import { 创建默认合单动作 } from './合单规则模型'
import type { 订单规则 } from './规则逻辑'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

let page: VueWrapper | undefined
afterEach(() => { page?.unmount(); page = undefined; document.body.innerHTML = '' })

async function 选择(label: string, value: string) {
  const group = page!.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === label)!
  group.vm.$emit('update:modelValue', value)
  group.vm.$emit('change', value)
  await flushPromises()
}

describe('合单统一配置与入池规则表单', () => {
  it('基础与高级模式切换保留配置，集中放单显示多个北京时间时点', async () => {
    const config = reactive(创建默认合单动作())
    page = mount(MergeAction, { props: { config }, attachTo: document.body })
    expect(page.find('.advanced-settings').exists()).toBe(false)
    await 选择('合单处理模式', 'advanced')
    expect(page.find('.advanced-settings').exists()).toBe(true)
    await page.get('input[aria-label="最长等待时间"]').setValue('4')
    await 选择('高级放单方式', 'scheduled')
    expect(config.releaseTimes).toEqual(['14:00', '18:00'])
    expect(page.find('input[aria-label="提前放单订单数"]').exists()).toBe(false)
    await page.findAll('button').find(item => item.text().includes('添加放单时间'))!.trigger('click')
    expect(config.releaseTimes).toEqual(['14:00', '18:00', '08:00'])
    await 选择('合单处理模式', 'basic')
    expect(page.find('.advanced-settings').exists()).toBe(false)
    await 选择('合单处理模式', 'advanced')
    expect(config.maxWaitMinutes).toBe(240)
    expect(config.releaseTimes).toHaveLength(3)
  })

  it('规则只筛选公共订单池，清理遗留逐规则策略且不改变来源', async () => {
    const source: 订单规则 & { mergeAction?: unknown } = { id: 'merge-test', name: '待审核订单合单', type: '合单规则', enabled: false, priority: 10, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: '自动合并发货', mergeAction: { ...创建默认合单动作(), releaseTimes: ['bad'], maxWaitMinutes: 0 }, version: 1, updatedAt: '', note: '' }
    const before = JSON.stringify(source), draft = reactive(structuredClone(source))
    page = mount(RuleForm, { props: { draft, rules: [source], orders: structuredClone(全渠道订单模拟数据.slice(0, 1)) }, attachTo: document.body, global: { directives: { prototype: {} } } })
    await page.findAll('button').find(item => item.text() === '保存规则')!.trigger('click')
    await flushPromises()
    const saved = page.emitted('save')?.[0]?.[0] as 订单规则
    expect(saved).not.toHaveProperty('mergeAction')
    expect(saved.action).toBe('进入合单池')
    expect(saved.conditions).toEqual(source.conditions)
    expect(JSON.stringify(source)).toBe(before)
    expect(page.emitted('save')).toHaveLength(1)
    expect(page.find('.merge-action').exists()).toBe(false)
    expect(page.get('.合单固定动作').text()).toContain('公共合单池')
    expect(page.find('input[aria-label="最长等待时间"]').exists()).toBe(false)
    expect(page.find('input[aria-label="每组最多订单数"]').exists()).toBe(false)
    expect(page.find('.校验错误').exists()).toBe(false)
  })

  it('统一配置组件只读时禁用输入，固定分组要求不提供移除入口', () => {
    page = mount(MergeAction, { props: { config: { ...创建默认合单动作(), mode: 'advanced', releaseMode: 'scheduled', releaseTimes: ['14:00'] }, readonly: true } })
    expect(page.findAll<HTMLInputElement>('input').every(item => item.element.disabled)).toBe(true)
    expect(page.findAll('button').some(item => item.text().includes('删除') || item.text().includes('添加放单时间'))).toBe(false)
    expect(page.get('.merge-fixed').text()).toContain('完整收货地址一致')
  })

  it('按半小时调整最长等待并换算分钟，预留可为零，清空时不能误存为零', async () => {
    const config = reactive({ ...创建默认合单动作(), mode: 'advanced' as const })
    page = mount(MergeAction, { props: { config }, attachTo: document.body })
    const wait = page.get<HTMLInputElement>('input[aria-label="最长等待时间"]')
    expect(wait.element.value).toBe('2.0')
    await wait.setValue('0.5')
    await wait.trigger('change')
    expect(config.maxWaitMinutes).toBe(30)
    await page.get('input[aria-label="履约预留时间"]').setValue('0')
    expect(config.shipByBufferMinutes).toBe(0)
    await wait.setValue('')
    await wait.trigger('change')
    expect(Number.isNaN(config.maxWaitMinutes)).toBe(true)
    expect(page.get('[role="alert"]').text()).toContain('0.5～168 小时')
  })
})
