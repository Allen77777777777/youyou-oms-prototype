// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ElSelect, ElOption, ElSwitch, ElRadioGroup, ElPopover } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import { 创建规则样例, type 订单规则 } from './规则逻辑'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 原型标注指令 } from '@/原型标注/原型标注指令'
import { 标注状态 } from '@/原型标注/标注状态'

let page: VueWrapper | undefined
async function 打开(source?: 订单规则, 使用真实标注 = false) {
  page?.unmount()
  const 原规则 = source ?? 创建规则样例()[1]!
  const draft = reactive(structuredClone(原规则))
  page = mount(RuleForm, { props: { draft, rules: [原规则], orders: structuredClone(全渠道订单模拟数据.slice(0, 1)) }, attachTo: document.body, global: { directives: { prototype: 使用真实标注 ? 原型标注指令 : {} } } })
  await flushPromises(); return { 原规则, draft, page }
}
async function 保存() { await page!.findAll('button').find(项 => 项.text() === '保存规则')!.trigger('click'); await flushPromises() }
function 保存项() { const events = page!.emitted('save'); return events?.[events.length - 1]?.[0] as 订单规则 | undefined }
afterEach(() => { page?.unmount(); page = undefined; 标注状态.退出(); document.body.innerHTML = '' })

describe('分仓执行动作表单', () => {
  it('库龄模式可检测库存，阈值校验、保存回填及切换模式共用设置', async () => {
    const { page, draft } = await 打开()
    const group = page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '分仓模式')!
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="库龄分仓批次口径"]').exists())!.props('modelValue')).toBe('all')
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
  it('三种分仓模式开放，基础默认且库存检测关闭，比价候选独立保留', async () => {
    const { page, draft } = await 打开()
    expect(page.get<HTMLInputElement>('input[type="radio"][value="price"]').element.closest('label')!.textContent?.trim()).toBe('比价分仓')
    expect(page.get('.分仓动作配置').text()).toContain('库龄分仓（优先分配库龄较大者）')
    expect(page.get<HTMLInputElement>('input[type="radio"][value="age"]').element.disabled).toBe(false)
    for (const mode of ['price']) {
      const option = page.get<HTMLInputElement>(`input[type="radio"][value="${mode}"]`)
      expect(option.element.disabled).toBe(false)
      option.element.closest('label')!.click()
    }
    await flushPromises()
    expect(draft.warehouseAction?.mode).toBe('price')
    expect(draft.warehouseAction?.priceRoutes?.[0]).toEqual(draft.routeAction)
    expect(page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '比较逻辑')!.props('modelValue')).toBe('lowest')
    expect(page.find('.综合阈值配置').exists()).toBe(false)
    expect(page.get('.比价费用说明').text()).toContain('按海外仓提供的试算总费用进行比价')
    expect(page.get('.比价费用说明').text()).not.toMatch(/出口易|待联调|文档未明确/)
    expect(page.get<HTMLInputElement>('input[aria-label="剩余库存阈值"]').element.disabled).toBe(true)
    await 保存(); expect(保存项()?.warehouseAction).toMatchObject({ mode: 'price', checkRemainingStock: false })
    expect(保存项()?.action).toBe('优先分配接口试算总费用最低的仓库及渠道')
  })
  it('综合判断默认价格差额且互斥选择，只校验所选阈值并保存回填', async () => {
    const { page, draft, 原规则 } = await 打开(), before = JSON.stringify(原规则)
    const group = (name: string) => page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === name)!
    group('分仓模式').vm.$emit('update:modelValue', 'price'); await flushPromises()
    group('比较逻辑').vm.$emit('update:modelValue', 'priceAge'); await flushPromises()
    expect(draft.warehouseAction?.agePreference).toBe('recent')
    const currency = () => page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="价格差额币种"]').exists())!
    expect(draft.warehouseAction?.priceDifferenceCurrency).toBe('CNY')
    expect(currency().props('modelValue')).toBe('CNY')
    expect(currency().props('disabled')).toBe(false)
    expect(currency().findAllComponents(ElOption).map(项 => 项.props('value')).sort()).toEqual(['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'CAD', 'AUD', 'BRL', 'MXN', 'PLN', 'RUB'].sort())
    expect(currency().findAllComponents(ElOption).find(项 => 项.props('value') === 'CNY')!.props('label')).toBe('人民币（CNY）')
    currency().vm.$emit('update:modelValue', 'USD'); await flushPromises()
    expect(group('综合判断逻辑').props('modelValue')).toBe('priceGap')
    expect(page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.disabled).toBe(false)
    expect(page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.disabled).toBe(true)
    await 保存(); expect(保存项()).toBeUndefined()
    expect(page.get('.分仓校验错误').text()).toContain('价格差额')
    await page.get('input[aria-label="价格差额"]').setValue('5.250001')
    page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="库龄优先口径"]').exists())!.vm.$emit('update:modelValue', 'all')
    await flushPromises(); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ priceDifference: '5.250001', priceDifferenceCurrency: 'USD', agePreference: 'all' })
    const savedCount = page.emitted('save')!.length
    group('综合判断逻辑').get<HTMLInputElement>('input[type="radio"][value="ageGap"]').element.closest('label')!.click()
    await flushPromises()
    expect(draft.warehouseAction?.priceAgeLogic).toBe('ageGap')
    expect(group('综合判断逻辑').findAll<HTMLInputElement>('input[type="radio"]').filter(项 => 项.element.checked)).toHaveLength(1)
    expect(page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.disabled).toBe(true)
    expect(currency().props('disabled')).toBe(true)
    expect(currency().props('modelValue')).toBe('USD')
    expect(page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.disabled).toBe(false)
    await 保存(); expect(page.emitted('save')!.length).toBe(savedCount)
    expect(page.get('.分仓校验错误').text()).toContain('库龄差额')
    await page.get('input[aria-label="库龄差额天数"]').setValue('0'); await 保存()
    const saved = 保存项()!
    expect(saved.warehouseAction).toMatchObject({ mode: 'price', priceComparison: 'priceAge', priceAgeLogic: 'ageGap', priceDifference: '5.250001', priceDifferenceCurrency: 'USD', agePreference: 'all', ageDifferenceDays: '0' })
    expect(saved.action).toBe('按价格与库龄综合匹配仓库及渠道')
    expect(draft.warehouseAction?.agePreference).toBe('all')
    expect(JSON.stringify(原规则)).toBe(before)
    const refill = await 打开(saved), savedBefore = JSON.stringify(saved)
    expect(refill.page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '比较逻辑')!.props('modelValue')).toBe('priceAge')
    expect(refill.page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '综合判断逻辑')!.props('modelValue')).toBe('ageGap')
    expect(refill.page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.value).toBe('5.250001')
    expect(refill.page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.disabled).toBe(true)
    const restoredCurrency = refill.page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="价格差额币种"]').exists())!
    expect(restoredCurrency.props('modelValue')).toBe('USD')
    expect(restoredCurrency.props('disabled')).toBe(true)
    expect(refill.page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.value).toBe('0')
    expect(refill.page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="库龄优先口径"]').exists())!.props('modelValue')).toBe('all')
    await refill.page.get('input[aria-label="库龄差额天数"]').setValue('6')
    expect(JSON.stringify(saved)).toBe(savedBefore)
  })
  it.each([undefined, '', 'XXX'])('旧综合策略的币种%s不默认补人民币，切逻辑保留忽略，选回价差须重选', async invalidCurrency => {
    const source = 创建规则样例()[1]!
    source.warehouseAction = { mode: 'price', checkRemainingStock: false, priceRoutes: [{ ...source.routeAction! }], priceComparison: 'priceAge', priceAgeLogic: 'priceGap', priceDifference: '5', agePreference: 'all', ageDifferenceDays: '30' }
    if (invalidCurrency !== undefined) source.warehouseAction.priceDifferenceCurrency = invalidCurrency
    const before = JSON.stringify(source), { page, draft } = await 打开(source)
    const group = (name: string) => page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === name)!
    const currency = () => page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="价格差额币种"]').exists())!
    expect(draft.warehouseAction?.priceDifferenceCurrency).toBe(invalidCurrency)
    expect(currency().props('disabled')).toBe(false)
    await 保存(); expect(保存项()).toBeUndefined()
    expect(page.get('.分仓校验错误').text()).toContain('币种')
    group('综合判断逻辑').vm.$emit('update:modelValue', 'ageGap'); await flushPromises()
    expect(currency().props('disabled')).toBe(true)
    await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ priceAgeLogic: 'ageGap', ageDifferenceDays: '30' })
    expect(保存项()?.warehouseAction?.priceDifferenceCurrency).toBe(invalidCurrency)
    group('比较逻辑').vm.$emit('update:modelValue', 'lowest'); await flushPromises()
    expect(page.findAllComponents(ElSelect).some(项 => 项.find('[aria-label="价格差额币种"]').exists())).toBe(false)
    await 保存()
    expect(保存项()?.warehouseAction?.priceComparison).toBe('lowest')
    expect(保存项()?.warehouseAction?.priceDifferenceCurrency).toBe(invalidCurrency)
    const savedCount = page.emitted('save')!.length
    group('比较逻辑').vm.$emit('update:modelValue', 'priceAge'); await flushPromises()
    group('综合判断逻辑').vm.$emit('update:modelValue', 'priceGap'); await flushPromises()
    expect(currency().props('disabled')).toBe(false)
    expect(draft.warehouseAction?.priceDifferenceCurrency).toBe(invalidCurrency)
    await 保存(); expect(page.emitted('save')!.length).toBe(savedCount)
    expect(page.get('.分仓校验错误').text()).toContain('币种')
    currency().vm.$emit('update:modelValue', 'EUR'); await flushPromises(); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ priceAgeLogic: 'priceGap', priceDifference: '5', priceDifferenceCurrency: 'EUR' })
    expect(JSON.stringify(source)).toBe(before)
  })
  it('切回最低隐藏并忽略综合非法值，切换分仓模式后仍保留综合草稿', async () => {
    const source = 创建规则样例()[1]!
    source.warehouseAction = { mode: 'price', checkRemainingStock: false, priceRoutes: [{ ...source.routeAction! }], priceComparison: 'priceAge', priceDifference: '-1', priceDifferenceCurrency: 'CNY', agePreference: 'all', ageDifferenceDays: '1.5' }
    const before = JSON.stringify(source), { page, draft } = await 打开(source)
    const group = (name: string) => page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === name)!
    await 保存(); expect(保存项()).toBeUndefined()
    expect(page.get('.分仓校验错误').text()).toContain('价格差额')
    group('比较逻辑').vm.$emit('update:modelValue', 'lowest'); await flushPromises()
    expect(page.find('input[aria-label="价格差额"]').exists()).toBe(false)
    expect(page.find('input[aria-label="库龄差额天数"]').exists()).toBe(false)
    expect(page.findAllComponents(ElSelect).some(项 => 项.find('[aria-label="库龄优先口径"]').exists())).toBe(false)
    await 保存()
    expect(保存项()?.action).toBe('优先分配接口试算总费用最低的仓库及渠道')
    expect(保存项()?.warehouseAction).toMatchObject({ priceComparison: 'lowest', priceDifference: '-1', agePreference: 'all', ageDifferenceDays: '1.5' })
    group('分仓模式').vm.$emit('update:modelValue', 'basic'); await flushPromises()
    group('分仓模式').vm.$emit('update:modelValue', 'price'); await flushPromises()
    group('比较逻辑').vm.$emit('update:modelValue', 'priceAge'); await flushPromises()
    expect(page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.value).toBe('-1')
    expect(page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.value).toBe('1.5')
    expect(draft.warehouseAction?.agePreference).toBe('all')
    const savedCount = page.emitted('save')!.length
    await 保存(); expect(page.emitted('save')!.length).toBe(savedCount)
    await page.get('input[aria-label="价格差额"]').setValue('0')
    await 保存(); expect(page.emitted('save')!.length).toBe(savedCount + 1)
    expect(保存项()?.warehouseAction?.ageDifferenceDays).toBe('1.5')
    await page.get('input[aria-label="价格差额"]').setValue('-1')
    group('综合判断逻辑').vm.$emit('update:modelValue', 'ageGap'); await flushPromises()
    await 保存(); expect(page.emitted('save')!.length).toBe(savedCount + 1)
    expect(page.get('.分仓校验错误').text()).toContain('库龄差额')
    await page.get('input[aria-label="库龄差额天数"]').setValue('2'); await 保存()
    expect(保存项()?.warehouseAction).toMatchObject({ priceAgeLogic: 'ageGap', priceDifference: '-1', ageDifferenceDays: '2', agePreference: 'all' })
    group('综合判断逻辑').vm.$emit('update:modelValue', 'priceGap'); await flushPromises()
    expect(page.get<HTMLInputElement>('input[aria-label="价格差额"]').element.value).toBe('-1')
    expect(page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.value).toBe('2')
    expect(page.get<HTMLInputElement>('input[aria-label="库龄差额天数"]').element.disabled).toBe(true)
    expect(JSON.stringify(source)).toBe(before)
  })
  it('综合说明在真实标注模式下可点击或聚焦打开，展示业务示例并由 Esc 关闭', async () => {
    const { page, draft } = await 打开(undefined, true)
    const mode = page.findAllComponents(ElRadioGroup).find(项 => 项.attributes('aria-label') === '分仓模式')!
    mode.vm.$emit('update:modelValue', 'price'); await flushPromises()
    const before = JSON.stringify(draft), button = page.get('button[aria-label="价格与库龄综合说明"]')
    标注状态.切换模式()
    expect(标注状态.标注模式.value).toBe(true)
    expect(标注状态.注册项.value.some(项 => 项.元素 === button.element && 项.标注.id.includes('price-age-help'))).toBe(true)
    const popover = page.findAllComponents(ElPopover).find(项 => 项.find('button[aria-label="价格与库龄综合说明"]').exists())!
    await button.trigger('click'); await flushPromises()
    expect(popover.props('visible')).toBe(true)
    const content = document.body.querySelector<HTMLElement>('[aria-label="价格与库龄综合帮助内容"]')!
    expect(content.textContent).toContain('一票一件')
    expect(content.textContent).toContain('各 SKU 的库龄累加')
    expect(content.textContent).toContain('同一 SKU 不按件数重复累加')
    const rows = Array.from(content.querySelectorAll('tbody tr')).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent!.trim()))
    expect(rows.map(row => row.slice(0, 2))).toEqual([['a1', '001'], ['a2', '002']])
    expect(rows.map(row => row.slice(2).map(cell => cell.match(/^\d+/)?.[0]))).toEqual([['30', '60'], ['33', '53']])
    expect(content.textContent).toContain('比较 30 天与 33 天，选择仓库 002')
    expect(content.textContent).toContain('比较 60 天与 53 天，选择仓库 001')
    await button.trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(popover.props('visible')).toBe(false)
    await button.trigger('focus'); await flushPromises()
    expect(popover.props('visible')).toBe(true)
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(popover.props('visible')).toBe(false)
    expect(JSON.stringify(draft)).toBe(before)
    expect(page.emitted('save')).toBeUndefined()
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
    expect(page.get('.库龄匹配说明').text()).toContain('多个 SKU 时累加比较')
    expect(draft.warehouseAction?.ageRoutes?.[0]).toEqual(draft.routeAction)
    const selector = (name: string) => page.findAllComponents(ElSelect).find(项 => 项.find(`[aria-label="${name}"]`).exists())!
    draft.warehouseAction!.agePreference = 'all'
    selector('库龄分仓批次口径').vm.$emit('update:modelValue', 'recent'); await flushPromises()
    expect(draft.warehouseAction?.ageBatchPreference).toBe('recent')
    expect(draft.warehouseAction?.agePreference).toBe('all')
    await page.findAll('button').find(项 => 项.text() === '添加发货仓库')!.trigger('click')
    await 保存(); expect(保存项()).toBeUndefined()
    const other = 渠道会话.value.find(项 => 项.enabled && 项.labelMode === '仓库回传' && 项.warehouseId !== draft.routeAction!.warehouseId)!
    selector('第2个候选发货仓库').vm.$emit('update:modelValue', JSON.stringify([other.providerId, other.accountId, other.warehouseId])); await flushPromises()
    selector('第2个候选物流渠道').vm.$emit('update:modelValue', other.id); await flushPromises()
    await 保存(); const saved = 保存项()!
    expect(saved.warehouseAction?.ageRoutes).toHaveLength(2)
    expect(saved.warehouseAction).toMatchObject({ ageBatchPreference: 'recent', agePreference: 'all' })
    expect(saved.action).toBe('按所选批次口径优先分配库龄合计较高的仓库')
    group.vm.$emit('update:modelValue', 'basic'); await flushPromises()
    expect(draft.routeAction).toEqual(原规则.routeAction)
    group.vm.$emit('update:modelValue', 'age'); await flushPromises()
    expect(draft.warehouseAction?.ageRoutes).toHaveLength(2)
    expect(selector('库龄分仓批次口径').props('modelValue')).toBe('recent')
    expect(draft.warehouseAction?.agePreference).toBe('all')
    expect(JSON.stringify(原规则)).toBe(before)
    const refill = await 打开(saved)
    expect(refill.page.findAll('.库龄候选行')).toHaveLength(2)
    expect(refill.page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="库龄分仓批次口径"]').exists())!.props('modelValue')).toBe('recent')
    await refill.page.get('button[aria-label="删除第2个候选仓库"]').trigger('click')
    await refill.page.get('button[aria-label="删除第1个候选仓库"]').trigger('click')
    const saveCount = refill.page.emitted('save')?.length ?? 0
    await 保存(); expect(refill.page.emitted('save')?.length ?? 0).toBe(saveCount)
    expect(refill.page.text()).toContain('请至少选择一个库龄分仓的发货仓库及物流渠道')
  }, 10000)
})
