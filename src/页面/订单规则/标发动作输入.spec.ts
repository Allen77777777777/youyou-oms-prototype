import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElRadioGroup } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import { 创建规则样例, type 订单规则 } from './规则逻辑'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

let page: VueWrapper | undefined
async function 打开(source?: 订单规则) {
  page?.unmount()
  const 原规则 = source ?? 创建规则样例().find(项 => 项.type === '订单标发规则')!
  const draft = reactive(structuredClone(原规则)); draft.enabled = false
  page = mount(RuleForm, { props: { draft, rules: [原规则], orders: structuredClone(全渠道订单模拟数据.slice(0, 1)) }, attachTo: document.body, global: { directives: { prototype: {} } } })
  await flushPromises(); return { 原规则, draft, page }
}
async function 选择(label: string, value: string) {
  const group = page!.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === label)!
  group.vm.$emit('update:modelValue', value); await flushPromises()
}
async function 保存() { await page!.findAll('button').find(项 => 项.text() === '保存规则')!.trigger('click'); await flushPromises() }
function 保存项() { const events = page!.emitted('save'); return events?.[events.length - 1]?.[0] as 订单规则 | undefined }
afterEach(() => { page?.unmount(); page = undefined; document.body.innerHTML = '' })

describe('标发动作表单', () => {
  it('开放三种标发动作，原动作默认立即，新物流动作可选且未选时长禁用', async () => {
    const { page } = await 打开()
    const panel = page.get('.标发动作配置')
    const actions = page.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === '标发动作')!
    expect(actions.findAll<HTMLInputElement>('input[type="radio"]').map(item => item.element.value)).toEqual(['仓库发货完成后标发', '物流下单后标发', '无需标发'])
    expect(actions.findAll<HTMLInputElement>('input[type="radio"]').every(item => !item.element.disabled)).toBe(true)
    expect(panel.text()).not.toContain('二期上线')
    expect(page.get<HTMLInputElement>('input[aria-label="延迟小时数"]').element.disabled).toBe(true)
    expect(page.get<HTMLInputElement>('input[aria-label="提前小时数"]').element.disabled).toBe(true)
    await 保存(); expect(保存项()?.shippingAction?.timing).toBe('immediate'); expect(保存项()?.action).toBe('仓库发货完成后标发')
    const logistics = page.get<HTMLInputElement>('input[type="radio"][value="物流下单后标发"]')
    logistics.element.closest('label')!.click(); await flushPromises()
    expect(page.find('.标发时机面板').exists()).toBe(true)
    expect(page.get('.标发时间预览').text()).toContain('获取跟踪号后立即标发')
    await 保存(); expect(保存项()).toMatchObject({ action: '物流下单后标发', shippingAction: { timing: 'immediate' } })
  })
  it.each(['immediate', 'delay', 'beforeDeadline'] as const)('物流下单后标发的%s时机使用原时长校验，保存回填且不改来源', async timing => {
    const { page, 原规则 } = await 打开(), before = JSON.stringify(原规则)
    await 选择('标发动作', '物流下单后标发'); await 选择('标发时机', timing)
    if (timing !== 'immediate') {
      const input = timing === 'delay' ? '延迟小时数' : '提前小时数'
      await 保存(); expect(保存项()).toBeUndefined()
      expect(page.get('.标发校验错误').text()).toContain('1～72')
      await page.get(`input[aria-label="${input}"]`).setValue('73'); await 保存(); expect(保存项()).toBeUndefined()
      await page.get(`input[aria-label="${input}"]`).setValue(timing === 'delay' ? '2' : '3')
    }
    await 保存(); const saved = 保存项()!, savedBefore = JSON.stringify(saved)
    expect(saved).toMatchObject({ action: '物流下单后标发', shippingAction: { timing } })
    if (timing === 'delay') expect(saved.shippingAction?.delayHours).toBe('2')
    if (timing === 'beforeDeadline') expect(saved.shippingAction?.beforeDeadlineHours).toBe('3')
    expect(JSON.stringify(原规则)).toBe(before)
    const refill = await 打开(saved)
    expect(refill.draft.action).toBe('物流下单后标发')
    expect(refill.page.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === '标发时机')!.props('modelValue')).toBe(timing)
    if (timing === 'delay') {
      expect(refill.page.get<HTMLInputElement>('input[aria-label="延迟小时数"]').element.value).toBe('2')
      expect(refill.page.get('.标发时间预览').text()).toContain('跟踪号获取时间 + 2 小时')
    } else if (timing === 'beforeDeadline') {
      expect(refill.page.get<HTMLInputElement>('input[aria-label="提前小时数"]').element.value).toBe('3')
      expect(refill.page.get('.标发时间预览').text()).toContain('最晚标发时间 − 3 小时')
    } else expect(refill.page.get('.标发时间预览').text()).toContain('获取跟踪号后立即标发')
    await 选择('标发动作', '仓库发货完成后标发')
    expect(refill.draft.shippingAction?.timing).toBe(timing)
    expect(JSON.stringify(saved)).toBe(savedBefore)
  })
  it('延迟空值及小数拒绝，修正后保存、重开回填且不修改源规则', async () => {
    const { 原规则, page } = await 打开(), before = JSON.stringify(原规则)
    await 选择('标发时机', 'delay'); await 保存(); expect(保存项()).toBeUndefined()
    expect(page.text()).toContain('延迟小时数请输入 1～72 的整数')
    expect(page.find('.校验错误').exists()).toBe(false)
    await page.get('input[aria-label="延迟小时数"]').setValue('1.5'); await 保存(); expect(保存项()).toBeUndefined()
    await page.get('input[aria-label="延迟小时数"]').setValue('73'); await 保存(); expect(保存项()).toBeUndefined()
    await page.get('input[aria-label="延迟小时数"]').setValue('2'); await 保存()
    expect(page.text()).not.toContain('延迟小时数请输入')
    const saved = 保存项()!
    expect(saved.shippingAction).toMatchObject({ timing: 'delay', delayHours: '2' })
    expect(JSON.stringify(原规则)).toBe(before)
    const refill = await 打开(saved)
    expect(refill.page.get<HTMLInputElement>('input[aria-label="延迟小时数"]').element.value).toBe('2')
    expect(refill.page.get('.标发时间预览').text()).toContain('仓库发货完成时间 + 2 小时')
  })
  it('提前标发保存回填并提示独立截止时间，切换保留未选输入且不校验', async () => {
    const { page } = await 打开()
    await 选择('标发时机', 'delay'); await page.get('input[aria-label="延迟小时数"]').setValue('0')
    await 选择('标发时机', 'beforeDeadline'); await page.get('input[aria-label="提前小时数"]').setValue('3')
    expect(page.get('.时机帮助').text()).toContain('不使用最晚发货时间代替')
    await 保存(); const saved = 保存项()!
    expect(saved.shippingAction).toMatchObject({ timing: 'beforeDeadline', delayHours: '0', beforeDeadlineHours: '3' })
    const refill = await 打开(saved)
    expect(refill.page.get('.标发时间预览').text()).toContain('最晚标发时间 − 3 小时')
    await 选择('标发时机', 'delay'); expect(refill.page.get<HTMLInputElement>('input[aria-label="延迟小时数"]').element.value).toBe('0')
  })
  it('两种触发动作共用暂存时长，无需标发隐藏并清理保存时机，切回仍保留草稿', async () => {
    const { page, draft, 原规则 } = await 打开(), before = JSON.stringify(原规则)
    await 选择('标发时机', 'delay'); await page.get('input[aria-label="延迟小时数"]').setValue('4')
    await 选择('标发动作', '物流下单后标发')
    expect(draft.shippingAction).toMatchObject({ timing: 'delay', delayHours: '4' })
    await 选择('标发时机', 'beforeDeadline'); await page.get('input[aria-label="提前小时数"]').setValue('3')
    await 选择('标发动作', '仓库发货完成后标发')
    expect(draft.shippingAction).toMatchObject({ timing: 'beforeDeadline', delayHours: '4', beforeDeadlineHours: '3' })
    await 选择('标发动作', '无需标发')
    expect(page.find('.标发时机面板').exists()).toBe(false)
    expect(page.text()).toContain('不代表平台标发成功')
    await 保存(); expect(保存项()?.action).toBe('无需标发'); expect(保存项()?.shippingAction).toBeUndefined()
    await 选择('标发动作', '物流下单后标发')
    expect(page.get<HTMLInputElement>('input[aria-label="延迟小时数"]').element.value).toBe('4')
    expect(page.get<HTMLInputElement>('input[aria-label="提前小时数"]').element.value).toBe('3')
    await 保存()
    expect(保存项()).toMatchObject({ action: '物流下单后标发', shippingAction: { timing: 'beforeDeadline', delayHours: '4', beforeDeadlineHours: '3' } })
    expect(JSON.stringify(原规则)).toBe(before)
  })
  it('旧人工核查不静默改成无需标发，重选才可保存', async () => {
    const source = 创建规则样例().find(项 => 项.type === '订单标发规则')!; source.action = '进入人工核查'
    const { page } = await 打开(source)
    expect(page.text()).toContain('原标发动作需重新选择')
    await 保存(); expect(保存项()).toBeUndefined()
    await 选择('标发动作', '无需标发'); await 保存(); expect(保存项()?.action).toBe('无需标发')
  })
})
