import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElInputNumber, ElMessage, ElMessageBox, ElRadioGroup, ElSwitch } from 'element-plus'
import Panel from './合单统一设置.vue'
import MergePreview from './合单试算抽屉.vue'
import { 创建默认合单动作 } from './合单规则模型'
import { 共享自动合单设置, 共享下次合单时间 } from '../业务配置/自动合单设置'
import { 共享合单记录 } from '../订单处理/自动合单状态'

let page: VueWrapper | undefined
beforeEach(() => {
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
  共享合单记录.value = []
  共享下次合单时间.value = null
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { page?.unmount(); page = undefined; vi.restoreAllMocks() })
function open() {
  page = mount(Panel, { global: { directives: { prototype: {} } } })
  return page
}
async function click(label: string) {
  const button = page!.findAll('button').find(item => item.text() === label)
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
async function radio(label: string, value: unknown) {
  const group = page!.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === label)!
  group.vm.$emit('update:modelValue', value)
  group.vm.$emit('change', value)
  await flushPromises()
}
async function number(label: string, value: number | undefined) {
  const input = page!.findAllComponents(ElInputNumber).find(item => item.find(`input[aria-label="${label}"]`).exists())!
  input.vm.$emit('update:modelValue', value)
  await flushPromises()
}
function waiting() {
  共享合单记录.value = [{ orderNo: 'WAIT-01', ruleId: 'entry-1', ruleName: '美国订单', ruleVersion: 1, settingsVersion: 1,
    action: 创建默认合单动作(), groupKey: 'same-buyer', quantity: 1,
    enteredAt: 1000, deadlineAt: 31_000, deadlineReason: '等待本轮处理', status: '待本轮处理', reason: '等待合单' }]
}

describe('列表上方合单统一设置', () => {
  it('设置草稿可直接试算，返回编辑保留参数且不保存或开启任务', async () => {
    const before = JSON.stringify(共享自动合单设置.value), view = open()
    await click('编辑设置')
    await radio('合单处理模式', 'advanced')
    await number('最长等待时间', 3.5)
    await click('试算当前草稿')
    const preview = view.getComponent(MergePreview)
    expect(preview.props('modelValue')).toBe(true)
    expect(preview.props('draftPolicy')).toMatchObject({ mode: 'advanced', maxWaitMinutes: 210 })
    expect(preview.props('draftIntervalMinutes')).toBe(30)
    expect(JSON.stringify(共享自动合单设置.value)).toBe(before)
    preview.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(view.find('.settings-editor').exists()).toBe(true)
    expect(preview.props('draftPolicy')!.maxWaitMinutes).toBe(210)
  })

  it('默认紧凑展示核心设置，编辑时展开完整字段', async () => {
    const view = open()
    expect(view.text()).toContain('下方规则筛选入池订单')
    expect(view.text()).toContain('基础模式')
    expect(view.text()).toContain('每 30 分钟')
    expect(view.text()).toContain('每组最多 5 单')
    expect(view.find('.settings-editor').exists()).toBe(false)
    await click('编辑设置')
    expect(view.find('.merge-action.is-compact').exists()).toBe(true)
    expect(view.find('input[aria-label="每组最多订单数"]').exists()).toBe(true)
    expect(view.find('input[aria-label="履约预留时间"]').exists()).toBe(true)
  })

  it('统一保存高级模式、周期、等单与容量，已有等待快照和时限不变', async () => {
    waiting()
    const originalRecord = JSON.stringify(共享合单记录.value)
    const view = open()
    await click('编辑设置')
    view.getComponent(ElSwitch).vm.$emit('update:modelValue', true)
    await radio('自动合单执行频率', 'custom')
    await number('自动合单频率（分钟）', 45)
    await radio('合单处理模式', 'advanced')
    await number('最长等待时间', 4)
    await number('每组最多订单数', 8)
    await radio('高级放单方式', 'scheduled')
    await click('保存设置')
    expect(共享自动合单设置.value).toMatchObject({ enabled: true, intervalMinutes: 45, version: 2, policy: { mode: 'advanced', maxWaitMinutes: 240, maxOrders: 8, releaseMode: 'scheduled', releaseTimes: ['14:00', '18:00'] } })
    expect(JSON.stringify(共享合单记录.value)).toBe(originalRecord)
    expect(view.text()).toContain('已有等待按原设置继续')
    expect(view.text()).toContain('最多等待 4 小时')
    expect(view.find('.settings-editor').exists()).toBe(false)
  })

  it('取消丢弃整份草稿，重新编辑恢复当前生效设置', async () => {
    const view = open()
    await click('编辑设置')
    await radio('合单处理模式', 'advanced')
    await number('最长等待时间', 8.5)
    await number('每组最多订单数', 9)
    await click('取消')
    expect(共享自动合单设置.value.policy).toEqual(创建默认合单动作())
    await click('编辑设置')
    expect(view.find('.advanced-settings').exists()).toBe(false)
    expect(view.findAllComponents(ElInputNumber).find(item => item.find('input[aria-label="每组最多订单数"]').exists())!.props('modelValue')).toBe(5)
  })

  it('非法自定义周期或容量不能覆盖配置，相同保存不递增版本', async () => {
    const view = open()
    const original = 共享自动合单设置.value
    await click('编辑设置')
    await radio('自动合单执行频率', 'custom')
    await number('自动合单频率（分钟）', undefined)
    await click('保存设置')
    expect(view.get('.settings-error').text()).toContain('1～1440')
    expect(共享自动合单设置.value).toBe(original)
    await number('自动合单频率（分钟）', 30)
    // 低于 min 的数字会被 Element Plus 钳制为 2；清空验证业务层必填拦截。
    await number('每组最多订单数', undefined)
    await click('保存设置')
    expect(view.get('.settings-error').text()).toContain('2～100')
    expect(共享自动合单设置.value).toBe(original)
    await number('每组最多订单数', 5)
    await click('保存设置')
    expect(共享自动合单设置.value).toBe(original)
  })

  it('关闭有等待订单须明确结束等待，取消确认保留生效开关', async () => {
    共享自动合单设置.value.enabled = true
    waiting()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel').mockResolvedValueOnce('confirm' as never)
    const view = open()
    await click('编辑设置')
    view.getComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await click('保存设置')
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 个订单'), '关闭自动合单', expect.any(Object))
    expect(共享自动合单设置.value.enabled).toBe(true)
    await click('保存设置')
    expect(共享自动合单设置.value.enabled).toBe(false)
  })
})
