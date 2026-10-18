// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ElSelect, ElSwitch, ElRadioGroup } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import { 创建规则样例, type 订单规则 } from './规则逻辑'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

let page: VueWrapper | undefined
async function 打开(source?: 订单规则) {
  page?.unmount()
  const 原规则 = source ?? 创建规则样例()[1]!
  const draft = reactive(structuredClone(原规则))
  page = mount(RuleForm, { props: { draft, rules: [原规则], orders: structuredClone(全渠道订单模拟数据.slice(0, 1)) }, attachTo: document.body, global: { directives: { prototype: {} } } })
  await flushPromises(); return { 原规则, draft, page }
}
async function 保存() { await page!.findAll('button').find(项 => 项.text() === '保存规则')!.trigger('click'); await flushPromises() }
function 保存项() { const events = page!.emitted('save'); return events?.[events.length - 1]?.[0] as 订单规则 | undefined }
afterEach(() => { page?.unmount(); page = undefined; document.body.innerHTML = '' })

describe('分仓执行动作表单', () => {
  it('库龄模式可检测库存，阈值校验、保存回填及切换模式共用设置', async () => {
    const { page, draft } = await 打开()
    const group = page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '分仓模式')!
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.disabled).toBe(true)
    page.getComponent(ElSwitch).vm.$emit('update:modelValue', true); await flushPromises()
    await 保存(); expect(保存项()).toBeUndefined()
    expect(page.text()).toContain('剩余库存阈值请输入非负整数')
    await page.get('input[aria-label="剩余库存阈值"]').setValue('5'); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ mode: 'age', checkRemainingStock: true, minimumRemainingStock: '5' })
    group.vm.$emit('update:modelValue', 'basic'); await flushPromises()
    expect(draft.warehouseAction?.minimumRemainingStock).toBe('5')
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.value).toBe('5')
    const refill = await 打开(保存项())
    expect(refill.page.getComponent(ElSwitch).props('modelValue')).toBe(true)
    expect(refill.page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.value).toBe('5')
    refill.page.getComponent(ElSwitch).vm.$emit('update:modelValue', false); await flushPromises(); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ mode: 'age', checkRemainingStock: false, minimumRemainingStock: '5' })
  }, 10000)
  it('基础默认可用，二期占位禁用，库存检测默认关闭', async () => {
    const { page, draft } = await 打开()
    expect(page.get('.分仓动作配置').text()).toContain('比价分仓（计算运费时效）（二期上线）')
    expect(page.get('.分仓动作配置').text()).toContain('库龄分仓（优先分配库龄较大者）')
    expect(page.get<HTMLInputElement>('input[type="radio"][value="age"]').element.disabled).toBe(false)
    for (const mode of ['price']) {
      const option = page.get<HTMLInputElement>(`input[type="radio"][value="${mode}"]`)
      expect(option.element.disabled).toBe(true)
      option.element.closest('label')!.click()
    }
    expect(draft.warehouseAction?.mode).toBe('basic')
    expect(page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.disabled).toBe(true)
    await 保存(); expect(保存项()?.warehouseAction?.checkRemainingStock).toBe(false)
  })
  it('开启后必填、实时纠错、保存回填；关闭保留数值，源规则与取消隔离', async () => {
    const { page, 原规则 } = await 打开(), before = JSON.stringify(原规则)
    page.getComponent(ElSwitch).vm.$emit('update:modelValue', true); await flushPromises()
    await 保存(); expect(保存项()).toBeUndefined()
    expect(page.text()).toContain('剩余库存阈值请输入非负整数')
    expect(page.find('.校验错误').exists()).toBe(false)
    await page.get('input[aria-label="剩余库存阈值"]').setValue('5'); await 保存()
    expect(page.find('.分仓校验错误').exists()).toBe(false)
    expect(保存项()?.warehouseAction).toMatchObject({ mode: 'basic', checkRemainingStock: true, minimumRemainingStock: '5' })
    const refill = await 打开(保存项())
    expect(refill.page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.value).toBe('5')
    refill.page.getComponent(ElSwitch).vm.$emit('update:modelValue', false); await flushPromises(); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ checkRemainingStock: false, minimumRemainingStock: '5' })
    await refill.page.findAll('button').find(项 => 项.text() === '取消')!.trigger('click')
    expect(refill.page.emitted('cancel')).toHaveLength(1)
    expect(JSON.stringify(原规则)).toBe(before)
  })
  it('换仓只清渠道，不清库存阈值；渠道仍限制同服务商账号仓库', async () => {
    const { page, draft } = await 打开()
    draft.warehouseAction = { mode: 'basic', checkRemainingStock: true, minimumRemainingStock: '5' }
    const other = 渠道会话.value.find(项 => 项.enabled && 项.labelMode === '仓库回传' && 项.warehouseId !== draft.routeAction!.warehouseId)!
    const warehouse = page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="发货仓库"]').exists())!
    warehouse.vm.$emit('update:modelValue', JSON.stringify([other.providerId, other.accountId, other.warehouseId])); await flushPromises()
    expect(draft.routeAction).toMatchObject({ warehouseId: other.warehouseId, channelId: '' })
    expect(draft.warehouseAction.minimumRemainingStock).toBe('5')
    await 保存(); expect(保存项()).toBeUndefined(); expect(page.text()).toContain('请选择物流渠道')
    const channel = page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="物流渠道"]').exists())!
    channel.vm.$emit('update:modelValue', other.id); await flushPromises(); await 保存()
    expect(保存项()?.routeAction?.channelId).toBe(other.id)
  })
  it('库龄模式可配多仓渠道、保存回填并保留基础草稿，删除全部候选被拦截', async () => {
    const { page, draft, 原规则 } = await 打开(), before = JSON.stringify(原规则)
    const group = page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '分仓模式')!
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(page.find('.基础分仓面板').exists()).toBe(false)
    expect(page.get('.库龄匹配说明').text()).toContain('多个 SKU 时，取其中最大的库龄')
    expect(draft.warehouseAction?.ageRoutes?.[0]).toEqual(draft.routeAction)
    await page.findAll('button').find(项 => 项.text() === '添加发货仓库')!.trigger('click')
    await 保存(); expect(保存项()).toBeUndefined()
    const other = 渠道会话.value.find(项 => 项.enabled && 项.labelMode === '仓库回传' && 项.warehouseId !== draft.routeAction!.warehouseId)!
    const selector = (name: string) => page.findAllComponents(ElSelect).find(项 => 项.find(`[aria-label="${name}"]`).exists())!
    selector('第2个候选发货仓库').vm.$emit('update:modelValue', JSON.stringify([other.providerId, other.accountId, other.warehouseId])); await flushPromises()
    selector('第2个候选物流渠道').vm.$emit('update:modelValue', other.id); await flushPromises()
    await 保存(); const saved = 保存项()!
    expect(saved.warehouseAction?.ageRoutes).toHaveLength(2)
    expect(saved.action).toBe('优先分配订单SKU库龄最长的仓库')
    group.vm.$emit('update:modelValue', 'basic'); await flushPromises()
    expect(draft.routeAction).toEqual(原规则.routeAction)
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(draft.warehouseAction?.ageRoutes).toHaveLength(2)
    expect(JSON.stringify(原规则)).toBe(before)
    const refill = await 打开(saved)
    expect(refill.page.findAll('.库龄候选行')).toHaveLength(2)
    await refill.page.get('button[aria-label="删除第2个候选仓库"]').trigger('click')
    await refill.page.get('button[aria-label="删除第1个候选仓库"]').trigger('click')
    const saveCount = refill.page.emitted('save')?.length ?? 0
    await 保存(); expect(refill.page.emitted('save')?.length ?? 0).toBe(saveCount)
    expect(refill.page.text()).toContain('请至少选择一个库龄分仓的发货仓库及物流渠道')
  }, 10000)
})
