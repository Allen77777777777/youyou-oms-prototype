import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElCheckbox, ElSelect, ElOption, ElPagination, ElMessage, ElMessageBox, type MessageBoxData } from 'element-plus'
import RulePage from './自动客服规则页面.vue'
import Editor from './规则编辑页面.vue'
import RangeInput from '../订单规则/范围条件输入.vue'
import { createEditor, serviceRules, activeRuleType, resetServiceRules, saveEditor, clone, type EditorSession } from './规则模型'
import { templateSession, resetTemplateSession } from '../消息模板管理/模型'

let wrapper: VueWrapper | undefined
const empty = { template: '<div />' }
const drawer = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
async function settle() { await nextTick(); await flushPromises(); await nextTick() }
async function editor(session: EditorSession) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/oms/ebay-service/automation-rules', component: empty }, ...(['new', 'edit', 'copy'] as const).map(mode => ({ path: `/oms/ebay-service/automation-rules/${mode}/:sessionId`, component: Editor, meta: { serviceRuleEditorMode: mode } })), { path: '/other', component: empty }, { path: '/oms/ebay-service/message-templates', component: empty }] })
  await router.push(`/oms/ebay-service/automation-rules/${session.mode}/${session.id}`); await router.isReady()
  wrapper = mount(Editor, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } }); await settle(); return { wrapper, router }
}
async function clickButton(text: string) { const button = wrapper!.findAll('button').find(item => item.text() === text); expect(button).toBeTruthy(); await button!.trigger('click'); await settle() }
function conditionSelect(row: DOMWrapper<Element>, label: string): VueWrapper {
  const select = row.findAllComponents(ElSelect).find((item: VueWrapper) => item.find(`[aria-label="${label}"]`).exists())
  expect(select).toBeTruthy(); return select!
}
function selectProp(row: DOMWrapper<Element>, label: string, key: string) { return (conditionSelect(row, label).props() as Record<string, unknown>)[key] }
async function enableBound(row: DOMWrapper<Element>, label: string, enabled: boolean) {
  const checkbox = row.findAll<HTMLInputElement>('input[type="checkbox"]').find(item => item.attributes('aria-label') === label || item.element.closest(`[aria-label="${label}"]`))
  expect(checkbox).toBeTruthy(); await checkbox!.setValue(enabled); await settle()
}
function dedupDialog() { const element = document.body.querySelector('.service-dedup-dialog'); expect(element).toBeTruthy(); return new DOMWrapper(element!) }
async function dialogButton(text: string) { const button = dedupDialog().findAll('button').find(item => item.text() === text); expect(button).toBeTruthy(); await button!.trigger('click'); await settle() }
beforeEach(() => { resetTemplateSession(); resetServiceRules(); for (const method of ['success', 'warning', 'info'] as const) vi.spyOn(ElMessage, method).mockImplementation(() => ({ close: vi.fn() })) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; resetTemplateSession(); resetServiceRules(); vi.restoreAllMocks() })

describe('自动客服规则页面与编辑交互', () => {
  it.each([
    { type: 'assignment', labels: ['新买家来信同步完成'] },
    { type: 'feedback', labels: ['订单付款成功', '仓库发货完成', '收到买家好评'] },
    { type: 'message', labels: ['买家下单之后未付款', '订单收到买家付款', '订单出库'] },
  ] as const)('$type保留原有触发文案，不沿用自动回复专属标签', async ({ type, labels }) => {
    await editor(createEditor(type, 'new'))
    const trigger = wrapper!.findAllComponents(ElSelect).find(item => item.attributes('aria-label') === '触发事件' || item.find('[aria-label="触发事件"]').exists())!
    expect(trigger.findAllComponents(ElOption).map(item => item.props('label'))).toEqual(labels)
  })
  it('自动发信只提供三种新触发，旧触发禁用回显且须重选后才能保存', async () => {
    const source = serviceRules.value.find(item => item.type === 'message')!; source.trigger = 'delivered'; delete source.messageDedup
    const session = createEditor('message', 'edit', source); await editor(session)
    const trigger = wrapper!.findComponent(ElSelect)
    const options = trigger.findAllComponents(ElOption).map((item: VueWrapper) => item.props() as { value: string; label: string; disabled: boolean })
    expect(options.map(item => item.value)).toEqual(['delivered', 'unpaidOrder', 'paidBeforeShipment', 'orderOutbound'])
    expect(options[0]).toMatchObject({ label: '订单签收（已移除）', disabled: true })
    expect(wrapper!.text()).toContain('原自动发信触发事件已移除，请重新选择')
    await clickButton('保存'); expect(ElMessage.warning).toHaveBeenCalledWith('原自动发信触发事件已移除，请重新选择')
    expect(source.trigger).toBe('delivered'); expect(source.messageDedup).toBeUndefined()
    trigger.vm.$emit('update:modelValue', 'paidBeforeShipment'); await settle()
    expect(wrapper!.text()).not.toContain('原自动发信触发事件已移除，请重新选择')
    await clickButton('保存')
    expect(serviceRules.value.find(item => item.id === source.id)).toMatchObject({ trigger: 'paidBeforeShipment', messageDedup: { enabled: false, days: 1 } })
  })
  it.each(['assignment', 'feedback'] as const)('%s不展示或使用同买家发信去重动作', async type => {
    const session = createEditor(type, 'new'); await editor(session)
    expect(wrapper!.find('.service-message-dedup').exists()).toBe(false)
    expect(wrapper!.find('button[aria-label="设置同买家不重复发信天数"]').exists()).toBe(false)
    expect(session.draft.messageDedup).toBeUndefined()
  })
  it('发信去重设置使用独立弹窗草稿，取消不写入，非法天数拒绝，确认及取消勾选保留合法值', async () => {
    const source = serviceRules.value.find(item => item.type === 'message')!, session = createEditor('message', 'edit', source); await editor(session)
    const checkbox = wrapper!.findAllComponents(ElCheckbox).find(item => item.text() === '同一个买家不重复发信')!
    const settings = wrapper!.get('button[aria-label="设置同买家不重复发信天数"]')
    expect((settings.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper!.get('.service-message-dedup').text()).toContain('1天')
    checkbox.vm.$emit('update:modelValue', true); await settle(); await settings.trigger('click'); await settle()
    expect(dedupDialog().get('.el-dialog__title').text()).toBe('同一个买家不重复发信')
    expect(dedupDialog().text()).toContain('按订单创建时间统计')
    await dedupDialog().get('input[aria-label="同买家不重复发信天数"]').setValue('7')
    expect(session.draft.messageDedup?.days).toBe(1)
    await dialogButton('取消'); expect(session.draft.messageDedup?.days).toBe(1)
    await settings.trigger('click'); await settle()
    expect((dedupDialog().get('input[aria-label="同买家不重复发信天数"]').element as HTMLInputElement).value).toBe('1')
    for (const value of ['', '0', '-1', '1.5', '91', 'abc']) {
      await dedupDialog().get('input[aria-label="同买家不重复发信天数"]').setValue(value); await dialogButton('确定')
      expect(dedupDialog().get('[role="alert"]').text()).toBe('请输入1～90的整数天数')
      expect(session.draft.messageDedup?.days).toBe(1)
    }
    await dedupDialog().get('input[aria-label="同买家不重复发信天数"]').setValue('90'); await dialogButton('确定')
    expect(session.draft.messageDedup?.days).toBe(90)
    checkbox.vm.$emit('update:modelValue', false); await settle()
    expect((settings.element as HTMLButtonElement).disabled).toBe(true)
    expect(session.draft.messageDedup).toEqual({ enabled: false, days: 90 })
    expect(source.messageDedup).toEqual({ enabled: false, days: 1 })
    await clickButton('保存')
    expect(serviceRules.value.find(item => item.id === source.id)?.messageDedup).toEqual({ enabled: false, days: 90 })
  })
  it('设置已确认仍属整条规则草稿，取消规则不修改原去重配置', async () => {
    const source = serviceRules.value.find(item => item.type === 'message')!, session = createEditor('message', 'edit', source); await editor(session)
    wrapper!.findAllComponents(ElCheckbox).find(item => item.text() === '同一个买家不重复发信')!.vm.$emit('update:modelValue', true); await settle()
    await wrapper!.get('button[aria-label="设置同买家不重复发信天数"]').trigger('click'); await settle()
    await dedupDialog().get('input[aria-label="同买家不重复发信天数"]').setValue('7'); await dialogButton('确定')
    expect(session.draft.messageDedup).toEqual({ enabled: true, days: 7 })
    await clickButton('取消'); expect(source.messageDedup).toEqual({ enabled: false, days: 1 })
  })
  it('旧发信触发在列表和详情按原值可读，动作摘要同步展示去重天数', async () => {
    const source = serviceRules.value.find(item => item.type === 'message')!; source.trigger = 'delivered'; source.messageDedup = { enabled: true, days: 7 }; activeRuleType.value = 'message'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: drawer } } }); await settle()
    expect(wrapper.text()).toContain('订单签收'); expect(wrapper.text()).toContain('同一个买家不重复发信：7天')
    await wrapper.findAll('.service-rule-name')[0]!.trigger('click'); await settle()
    expect(wrapper.get('.service-detail').text()).toContain('订单签收'); expect(wrapper.get('.service-detail').text()).toContain('同一个买家不重复发信：7天')
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s基本信息可输入数字优先级800，保存不改会话优先级动作', async type => {
    const source = serviceRules.value.find(item => item.type === type)!, actionPriority = source.assignment.priority, session = createEditor(type, 'edit', source)
    await editor(session)
    expect(wrapper!.get('.service-condition-sidebar').text()).toContain('数字越小，优先级越高')
    const priority = wrapper!.get('input[aria-label="规则优先级"]')
    await priority.setValue('800'); await priority.trigger('change'); await settle()
    expect(session.draft.order).toBe(800)
    await clickButton('保存')
    expect(serviceRules.value.find(item => item.id === source.id)?.order).toBe(800)
    expect(serviceRules.value.find(item => item.id === source.id)?.assignment.priority).toBe(actionPriority)
  })
  it('数字优先级清空时阻止保存并保留草稿', async () => {
    const source = serviceRules.value[0]!, session = createEditor(source.type, 'edit', source); await editor(session)
    const priority = wrapper!.get('input[aria-label="规则优先级"]')
    await priority.setValue(''); await priority.trigger('change'); await settle(); await clickButton('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith('优先级须为1～999999的正整数')
    expect(source.order).toBe(10)
    expect(wrapper!.get('.service-editor-heading').text()).toContain('编辑规则')
  })
  it('跨20条分页后调整数字优先级，回第一页显示全局首位数字及规则', async () => {
    const source = serviceRules.value[0]!, other = serviceRules.value.filter(item => item.type !== 'assignment')
    serviceRules.value = [...Array.from({ length: 26 }, (_, index) => ({ ...clone(source), id: `PAGE-${index}`, name: `跨页规则-${index}`, order: (index + 1) * 10 })), ...other]
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } }); await settle()
    expect(wrapper.findAll('.service-rule-name')).toHaveLength(20)
    const pagination = wrapper.findComponent(ElPagination)
    pagination.vm.$emit('update:current-page', 2); await settle()
    expect(wrapper.findAll('.service-rule-name')).toHaveLength(6)
    expect(wrapper.findAll('.service-rule-name').map(item => item.text())).toContain('跨页规则-25')
    const target = serviceRules.value.find(item => item.id === 'PAGE-25')!, session = createEditor(target.type, 'edit', target)
    session.draft.order = 1; expect(saveEditor(session)).toBeUndefined(); await settle()
    pagination.vm.$emit('update:current-page', 1); await settle()
    expect(wrapper.findAll('.service-rule-name')[0]!.text()).toBe('跨页规则-25')
    expect(wrapper.findAll('.service-rule-order')[0]!.text()).toBe('1')
    expect(wrapper.findAll('.service-order-handle')).toHaveLength(20)
  }, 15000)
  it('四个业务页签共享列表，分类切换呈现对应触发和动作', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: drawer } } }); await settle()
    expect(wrapper.findAll('[role="tab"]').map(item => item.text())).toEqual(['站内信规则', '自动好评规则', '自动发信规则', '自动回复规则'])
    expect(wrapper.findAll('.service-rule-name')).toHaveLength(3)
    await wrapper.findAll('[role="tab"]')[2]!.trigger('click'); await settle()
    expect(activeRuleType.value).toBe('message'); expect(wrapper.text()).toContain('买家下单之后未付款'); expect(wrapper.text()).toContain('订单收到买家付款'); expect(wrapper.text()).toContain('订单出库')
  })
  it('分配编辑提供七条件，四动作可组合且没有自动发信表单', async () => {
    const session = createEditor('assignment', 'new'); await editor(session)
    expect(wrapper!.findAll('.service-condition-checks .el-checkbox__label').map(item => item.text())).toEqual(['店铺', '站点', '系统 SKU', '平台 SKU', '履约模式', '是否有拆单发货', '订单总金额'])
    expect(wrapper!.findAll('.service-assignment-actions .el-checkbox__label').map(item => item.text())).toEqual(['分配客服', '标注处理状态', '添加标签', '设置优先级'])
    expect(wrapper!.find('.service-template-select').exists()).toBe(false)
    const status = wrapper!.findAllComponents(ElCheckbox).find(item => item.text() === '标注处理状态')!
    status.vm.$emit('update:modelValue', true); await settle(); expect(session.draft.assignment.status).toBe(true); expect(session.draft.assignment.assign).toBe(false)
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s编辑可选履约模式下拉、移除及重新添加，取消不改原规则', async type => {
    const source = serviceRules.value.find(item => item.type === type)!, before = JSON.stringify(source), session = createEditor(type, 'edit', source)
    await editor(session)
    expect(wrapper!.get('.service-select-heading').text()).toContain('7 项')
    const checkbox = wrapper!.findAll('.service-condition-checks input')[4]!
    await checkbox.setValue(true); await settle()
    let row = wrapper!.findAll('.service-condition-row').find(item => item.text().includes('履约模式'))!
    expect(row.find('textarea').exists()).toBe(false)
    const select = row.findAllComponents(ElSelect)[1]!
    expect(select.props('multiple')).toBe(true)
    expect(select.findAllComponents(ElOption).map((item: VueWrapper) => (item.props() as { value: string }).value)).toEqual(['自配送', '平台履约'])
    select.vm.$emit('update:modelValue', ['自配送', '平台履约'])
    row.findAllComponents(ElSelect)[0]!.vm.$emit('update:modelValue', 'neq'); await settle()
    expect(session.draft.conditions.find(item => item.field === 'fulfillmentMode')).toEqual({ field: 'fulfillmentMode', operator: 'neq', values: ['自配送', '平台履约'] })
    await row.get('button[aria-label="移除履约模式条件"]').trigger('click'); await settle()
    expect(session.draft.conditions.some(item => item.field === 'fulfillmentMode')).toBe(false)
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    await checkbox.setValue(true); await settle()
    row = wrapper!.findAll('.service-condition-row').find(item => item.text().includes('履约模式'))!
    expect(session.draft.conditions.find(item => item.field === 'fulfillmentMode')?.values).toEqual([])
    expect(row.findAllComponents(ElSelect)[0]!.props('modelValue')).toBe('eq')
    await clickButton('取消'); expect(JSON.stringify(source)).toBe(before)
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s可选拆单单选及金额范围，移除重加清空且取消不改原规则', async type => {
    const source = serviceRules.value.find(item => item.type === type)!, before = JSON.stringify(source), session = createEditor(type, 'edit', source)
    await editor(session)
    await wrapper!.findAll('.service-condition-checks input')[5]!.setValue(true)
    await wrapper!.findAll('.service-condition-checks input')[6]!.setValue(true); await settle()
    const splitRow = wrapper!.findAll('.service-condition-row').find(item => item.text().includes('是否有拆单发货'))!
    const splitSelect = conditionSelect(splitRow, '是否有拆单发货条件值')
    expect((splitSelect.props() as { multiple?: boolean }).multiple).toBe(false)
    splitSelect.vm.$emit('update:modelValue', 'false'); await settle()
    expect(session.draft.conditions.find(item => item.field === 'isSplit')?.values).toEqual(['false'])
    splitSelect.vm.$emit('update:modelValue', undefined); await settle()
    expect(session.draft.conditions.find(item => item.field === 'isSplit')?.values).toEqual([])
    const amountRow = wrapper!.findAll('.service-condition-row').find(item => item.text().includes('订单总金额'))!
    expect(amountRow.findComponent(RangeInput).exists()).toBe(true)
    expect(amountRow.find('[aria-label="订单总金额运算符"]').exists()).toBe(false)
    expect((amountRow.get('input[aria-label="订单总金额下限"]').element as HTMLInputElement).disabled).toBe(true)
    await enableBound(amountRow, '订单总金额启用下限', true)
    await amountRow.get('input[aria-label="订单总金额下限"]').setValue('20.25')
    conditionSelect(amountRow, '订单总金额下限币种').vm.$emit('update:modelValue', 'USD'); await settle()
    await splitRow.get('button[aria-label="移除是否有拆单发货条件"]').trigger('click')
    await amountRow.get('button[aria-label="移除订单总金额条件"]').trigger('click'); await settle()
    expect(session.draft.conditions.some(item => item.field === 'isSplit' || item.field === 'orderAmount')).toBe(false)
    await wrapper!.findAll('.service-condition-checks input')[6]!.setValue(true); await settle()
    expect(session.draft.conditions.find(item => item.field === 'orderAmount')?.amountRange).toMatchObject({ value: '', upperValue: '', lowerEnabled: false, upperEnabled: false, currency: '' })
    await clickButton('取消'); expect(JSON.stringify(source)).toBe(before)
  })
  it('金额上下限独立启用，币种联动、边界保留，倒置阻止保存后可修正', async () => {
    const source = serviceRules.value[0]!, session = createEditor(source.type, 'edit', source); await editor(session)
    await wrapper!.findAll('.service-condition-checks input')[6]!.setValue(true); await settle()
    const row = wrapper!.findAll('.service-condition-row').find(item => item.text().includes('订单总金额'))!
    await enableBound(row, '订单总金额启用下限', true); await enableBound(row, '订单总金额启用上限', true)
    await row.get('input[aria-label="订单总金额下限"]').setValue('20.25')
    await row.get('input[aria-label="订单总金额上限"]').setValue('10.00')
    conditionSelect(row, '订单总金额下限币种').vm.$emit('update:modelValue', 'USD'); await settle()
    expect(selectProp(row, '订单总金额上限币种', 'modelValue')).toBe('USD')
    conditionSelect(row, '订单总金额上限币种').vm.$emit('update:modelValue', 'EUR'); await settle()
    expect(selectProp(row, '订单总金额下限币种', 'modelValue')).toBe('EUR')
    await clickButton('保存'); expect(ElMessage.warning).toHaveBeenCalledWith('订单总金额下界不能大于上界')
    expect(source.conditions.some(item => item.field === 'orderAmount')).toBe(false)
    conditionSelect(row, '订单总金额下限比较方式').vm.$emit('update:modelValue', false); await settle()
    await enableBound(row, '订单总金额启用下限', false)
    expect((row.get('input[aria-label="订单总金额下限"]').element as HTMLInputElement).value).toBe('20.25')
    expect(selectProp(row, '订单总金额下限比较方式', 'disabled')).toBe(true)
    expect(selectProp(row, '订单总金额下限比较方式', 'modelValue')).toBe(false)
    await clickButton('保存')
    const saved = serviceRules.value.find(item => item.id === source.id)!
    expect(saved.conditions.find(item => item.field === 'orderAmount')).toMatchObject({ operator: 'range', values: [], amountRange: { value: '20.25', lowerEnabled: false, lowerInclusive: false, upperEnabled: true, upperValue: '10.00', currency: 'EUR' } })
  })
  it('列表摘要与只读详情展示完整履约模式，不写成SKU条件', async () => {
    const source = serviceRules.value[0]!
    source.conditions.push({ field: 'fulfillmentMode', operator: 'neq', values: ['自配送', '平台履约'] })
    source.conditions.push({ field: 'isSplit', operator: 'eq', values: ['true'] }, { field: 'orderAmount', operator: 'range', values: [], amountRange: { value: '20.00', upperValue: '99.99', lowerEnabled: true, upperEnabled: true, lowerInclusive: false, upperInclusive: true, currency: 'USD' } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: drawer } } }); await settle()
    expect(wrapper!.findAll('.service-summary-lines')[0]!.text()).toContain('履约模式 不等于 自配送、平台履约')
    await wrapper!.findAll('.service-rule-name')[0]!.trigger('click'); await settle()
    expect(wrapper!.get('.service-detail-order').text()).toBe(String(source.order))
    expect(wrapper!.get('.service-detail').text()).toContain('履约模式 不等于 自配送、平台履约')
    expect(wrapper!.get('.service-detail').text()).toContain('是否有拆单发货 等于 是')
    expect(wrapper!.get('.service-detail').text()).toContain('订单总金额 大于 20.00 USD，且 小于等于 99.99 USD')
  })
  it('SKU逐次输入保留尾换行和内部空格，切页签仍保留原始草稿', async () => {
    const session = createEditor('assignment', 'new'), { router } = await editor(session)
    const input = wrapper!.findAll('.service-condition-checks input')[2]!; await input.setValue(true); await settle()
    let sku = wrapper!.get('textarea[aria-label="系统SKU条件值"]')
    await sku.setValue('DEMO A'); await settle(); await sku.setValue('DEMO A\n'); await settle()
    expect((sku.element as HTMLTextAreaElement).value).toBe('DEMO A\n')
    await sku.setValue('DEMO A\nDEMO B'); await settle(); expect(session.draft.conditions.find(item => item.field === 'systemSku')?.values).toEqual(['DEMO A', 'DEMO B'])
    const path = router.currentRoute.value.path; await router.push('/other'); await settle(); await router.push(path); await settle()
    sku = wrapper!.get('textarea[aria-label="系统SKU条件值"]'); expect((sku.element as HTMLTextAreaElement).value).toBe('DEMO A\nDEMO B')
  })
  it('模板管理跳转不丢失规则草稿，模板被停用后保存拒绝', async () => {
    const source = serviceRules.value.find(item => item.type === 'message')!, session = createEditor('message', 'edit', source), { router } = await editor(session)
    session.draft.note = '待保存说明'; await settle(); const path = router.currentRoute.value.path
    await clickButton('管理模板'); expect(router.currentRoute.value.path).toBe('/oms/ebay-service/message-templates')
    templateSession.templates.find(item => item.id === session.draft.templateId)!.enabled = false
    await router.push(path); await settle(); expect(session.draft.note).toBe('待保存说明'); expect(wrapper!.text()).toContain('模板已停用')
    await clickButton('保存'); expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('模板已停用')); expect(source.note).toBe('')
  })
  it('未选择条件或动作时保留表单并提示，取消不创建记录', async () => {
    const count = serviceRules.value.length, session = createEditor('assignment', 'new'); await editor(session)
    await wrapper!.get('input[aria-label="规则名称"]').setValue('待验证规则'); await clickButton('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith('请填写店铺条件'); expect(serviceRules.value).toHaveLength(count)
    await clickButton('取消'); expect(serviceRules.value).toHaveLength(count)
  })
  it('保存确认期间草稿改变，拒绝提交未经确认的新配置', async () => {
    const source = serviceRules.value[0]!, session = createEditor('assignment', 'edit', source); session.draft.enabled = true; await editor(session)
    let resolve!: (value: MessageBoxData) => void
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(() => new Promise<MessageBoxData>(done => { resolve = done }))
    await clickButton('保存'); session.draft.name = '确认后变化'; resolve('confirm' as MessageBoxData); await settle()
    expect(ElMessage.warning).toHaveBeenCalledWith('确认期间规则内容已变化，请重新保存'); expect(source.enabled).toBe(false)
  })
})
