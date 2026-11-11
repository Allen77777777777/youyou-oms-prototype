import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElCheckbox, ElDatePicker, ElMessage, ElMessageBox, ElOption, ElSelect, ElSwitch, ElTimePicker, type MessageBoxData } from 'element-plus'
import RulePage from './自动客服规则页面.vue'
import Editor from './规则编辑页面.vue'
import { activeRuleType, clone, createEditor, resetServiceRules, serviceRuleLogs, serviceRules, type EditorSession } from './规则模型'
import { resetTemplateSession, templateSession } from '../消息模板管理/模型'

let wrapper: VueWrapper | undefined
const empty = { template: '<div />' }
const drawer = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
async function settle() { await nextTick(); await flushPromises(); await nextTick() }
function sourceRule() { return serviceRules.value.find(rule => rule.type === 'autoReply')! }
async function openEditor(session: EditorSession) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/oms/ebay-service/automation-rules', component: empty },
    ...(['new', 'edit', 'copy'] as const).map(mode => ({ path: `/oms/ebay-service/automation-rules/${mode}/:sessionId`, component: Editor, meta: { serviceRuleEditorMode: mode } })),
    { path: '/oms/ebay-service/message-templates', component: empty },
  ] })
  await router.push(`/oms/ebay-service/automation-rules/${session.mode}/${session.id}`); await router.isReady()
  wrapper = mount(Editor, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } })
  await settle(); return router
}
async function button(label: string) {
  const found = wrapper!.findAll('button').find(item => item.text() === label)
  expect(found, `应有“${label}”按钮`).toBeTruthy(); await found!.trigger('click'); await settle()
}
function select(label: string) {
  const found = wrapper!.findAllComponents(ElSelect).find(item => item.attributes('aria-label') === label || item.find(`[aria-label="${label}"]`).exists())
  expect(found, `应有“${label}”选择框`).toBeTruthy(); return found!
}
async function check(label: string, value: boolean) {
  const found = wrapper!.findAllComponents(ElCheckbox).find(item => item.attributes('aria-label') === label || item.find(`[aria-label="${label}"]`).exists())
  expect(found, `应有“${label}”勾选框`).toBeTruthy(); await found!.get('input').setValue(value); await settle()
}
async function chooseShopAndTemplate() {
  select('自动回复店铺账号').vm.$emit('update:modelValue', ['shop-uk'])
  select('选择执行模板').vm.$emit('update:modelValue', 'template-rest-auto-reply')
  await wrapper!.get('input[aria-label="规则名称"]').setValue('英国店铺休息回复'); await settle()
}
beforeEach(() => {
  resetTemplateSession(); resetServiceRules()
  for (const method of ['success', 'warning', 'info'] as const) vi.spyOn(ElMessage, method).mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; resetTemplateSession(); resetServiceRules(); vi.restoreAllMocks() })

describe('自动回复规则配置交互', () => {
  it('旧外地休息时段显示原配置核对入口，固定北京且需要重新配置后确认', async () => {
    const source = sourceRule(); source.enabled = true; source.autoReply!.timeZone = 'Europe/London'
    const session = createEditor('autoReply', 'edit', source); await openEditor(session)
    expect(source.enabled).toBe(false)
    expect(wrapper!.find('[aria-label="自动回复时区"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain('原规则已停用')
    expect(wrapper!.text()).toContain('Europe/London')
    await button('保存'); expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('核对'))
    await check('启用每周休息时段', true); await check('周六休息', true)
    await check('已核对北京时间休息时段', true); await button('保存')
    const saved = serviceRules.value.find(rule => rule.id === source.id)!
    expect(saved.autoReply!.legacySchedule!.reviewedAt).toMatch(/Z$/)
    expect(saved.autoReply!.timeZone).toBe('Asia/Shanghai')
    expect(saved.enabled).toBe(false)
  })
  it('多选店铺并禁用已被停用规则占用的全部账号，固定来信触发且不显示多规则排序和订单条件', async () => {
    sourceRule().autoReply!.shopIds = ['shop-us', 'shop-de']
    const session = createEditor('autoReply', 'new'); await openEditor(session)
    const shop = select('自动回复店铺账号')
    expect(shop.props('multiple')).toBe(true)
    const options = shop.findAllComponents(ElOption).map(item => item.props() as { value: string; disabled: boolean })
    expect(options.find(item => item.value === 'shop-us')?.disabled).toBe(true)
    expect(options.find(item => item.value === 'shop-de')?.disabled).toBe(true)
    expect(options.find(item => item.value === 'shop-uk')?.disabled).toBe(false)
    expect(wrapper!.find('[aria-label="规则优先级"]').exists()).toBe(false)
    expect(wrapper!.find('.service-condition-checks').exists()).toBe(false)
    expect(wrapper!.text()).not.toContain('延迟执行')
    expect(session.draft).toMatchObject({ type: 'autoReply', trigger: 'incoming', timing: 'immediate', enabled: false })
    expect(wrapper!.text()).toContain('每周休息时段'); expect(wrapper!.text()).toContain('特定时间段')
  })

  it('多店铺共用默认周末全天与模板只保存一条，编辑本条全部店铺仍可选', async () => {
    const count = serviceRules.value.length, session = createEditor('autoReply', 'new'); await openEditor(session)
    await chooseShopAndTemplate()
    select('自动回复店铺账号').vm.$emit('update:modelValue', ['shop-uk', 'shop-de']); await settle(); await button('保存')
    expect(serviceRules.value).toHaveLength(count + 1)
    const saved = serviceRules.value.find(rule => rule.name === '英国店铺休息回复')!
    expect(saved).toMatchObject({ enabled: false, templateId: 'template-rest-auto-reply', autoReply: { shopIds: ['shop-uk', 'shop-de'], timeZone: 'Asia/Shanghai', weeklyEnabled: true } })
    expect(saved.autoReply!.weekly.filter(day => day.enabled).map(day => [day.day, day.allDay])).toEqual([[6, true], [7, true]])
    expect(activeRuleType.value).toBe('autoReply')
    wrapper!.unmount(); wrapper = undefined
    await openEditor(createEditor('autoReply', 'edit', saved))
    const ownOptions = select('自动回复店铺账号').findAllComponents(ElOption)
    for (const value of ['shop-uk', 'shop-de']) expect(ownOptions.find(item => item.props('value') === value)!.props('disabled')).toBe(false)
    expect(ownOptions.find(item => item.props('value') === 'shop-us')!.props('disabled')).toBe(true)
    await wrapper!.get('textarea[aria-label="规则说明"]').setValue('更新内部说明'); await button('保存')
    expect(serviceRules.value).toHaveLength(count + 1)
    expect(serviceRules.value.find(rule => rule.id === saved.id)?.note).toBe('更新内部说明')
  })

  it('复制清空全部店铺，时间草稿独立，取消不会影响原规则', async () => {
    const source = sourceRule(); source.autoReply!.shopIds = ['shop-us', 'shop-au']
    const before = JSON.stringify(source), count = serviceRules.value.length
    const session = createEditor('autoReply', 'copy', source); await openEditor(session)
    expect(session.draft.autoReply!.shopIds).toEqual([])
    expect(session.draft.enabled).toBe(false)
    select('自动回复店铺账号').vm.$emit('update:modelValue', ['shop-de', 'shop-uk'])
    await check('周六休息', false); await check('启用特定时间段', true)
    expect(session.draft.autoReply!.specificPeriods).toHaveLength(1)
    await button('取消')
    expect(serviceRules.value).toHaveLength(count); expect(JSON.stringify(source)).toBe(before)
  })

  it('每周时段支持跨天，关闭整类时段保留输入，取消不写回', async () => {
    const source = sourceRule(), before = JSON.stringify(source), session = createEditor('autoReply', 'edit', source)
    await openEditor(session)
    await check('周一休息', true)
    const timePickers = wrapper!.findAllComponents(ElTimePicker)
    const start = timePickers.find(item => item.attributes('aria-label') === '周一开始时间' || item.find('[aria-label="周一开始时间"]').exists())!
    const end = timePickers.find(item => item.attributes('aria-label') === '周一结束时间' || item.find('[aria-label="周一结束时间"]').exists())!
    expect(start).toBeTruthy(); expect(end).toBeTruthy()
    start.vm.$emit('update:modelValue', '18:00'); end.vm.$emit('update:modelValue', '09:00'); await settle()
    expect(wrapper!.text()).toContain('次日')
    await check('启用每周休息时段', false)
    expect(session.draft.autoReply!.weekly.find(day => day.day === 1)).toMatchObject({ enabled: true, start: '18:00', end: '09:00' })
    await check('启用每周休息时段', true)
    expect(session.draft.autoReply!.weekly.find(day => day.day === 1)).toMatchObject({ start: '18:00', end: '09:00' })
    await button('取消'); expect(JSON.stringify(source)).toBe(before)
  })

  it('全天休息显示完整一天，取消全天后恢复此前的起止输入', async () => {
    const session = createEditor('autoReply', 'new'); await openEditor(session)
    let saturday = wrapper!.findAll('.service-weekly-row')[5]!
    expect(saturday.text()).toContain('00:00 ～ 24:00')
    expect(saturday.findAllComponents(ElTimePicker)).toHaveLength(0)
    await check('周六全天休息', false)
    saturday = wrapper!.findAll('.service-weekly-row')[5]!
    const times = saturday.findAllComponents(ElTimePicker)
    expect(times).toHaveLength(2)
    times[0]!.vm.$emit('update:modelValue', '17:30'); times[1]!.vm.$emit('update:modelValue', '08:15'); await settle()
    await check('周六全天休息', true)
    saturday = wrapper!.findAll('.service-weekly-row')[5]!
    expect(saturday.text()).toContain('00:00 ～ 24:00')
    expect(saturday.findAllComponents(ElTimePicker)).toHaveLength(0)
    expect(session.draft.autoReply!.weekly.find(day => day.day === 6)).toMatchObject({ allDay: true, start: '17:30', end: '08:15' })
    await check('周六全天休息', false)
    const restored = wrapper!.findAll('.service-weekly-row')[5]!.findAllComponents(ElTimePicker)
    expect(restored.map((item: VueWrapper) => (item.props() as { modelValue: string }).modelValue)).toEqual(['17:30', '08:15'])
  })

  it('特定时间支持增删，关闭后保留草稿，并按明确时区保存完整起止时间', async () => {
    const session = createEditor('autoReply', 'new'); await openEditor(session); await chooseShopAndTemplate()
    await check('启用特定时间段', true)
    const dates = wrapper!.findAllComponents(ElDatePicker)
    expect(dates).toHaveLength(2)
    dates[0]!.vm.$emit('update:modelValue', '2026-12-24 18:00'); dates[1]!.vm.$emit('update:modelValue', '2026-12-28 09:00'); await settle()
    await wrapper!.get('button[aria-label="添加特定时间段"]').trigger('click'); await settle()
    expect(session.draft.autoReply!.specificPeriods).toHaveLength(2)
    await wrapper!.get('button[aria-label="删除特定时段2"]').trigger('click'); await settle()
    expect(session.draft.autoReply!.specificPeriods).toHaveLength(1)
    await check('启用特定时间段', false)
    expect(session.draft.autoReply!.specificPeriods[0]).toMatchObject({ start: '2026-12-24 18:00', end: '2026-12-28 09:00' })
    await check('启用特定时间段', true); await check('启用每周休息时段', false)
    expect(wrapper!.find('[aria-label="自动回复时区"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain('以下休息时段均使用北京时间'); await button('保存')
    expect(serviceRules.value.find(rule => rule.name === '英国店铺休息回复')?.autoReply).toMatchObject({ weeklyEnabled: false, specificEnabled: true, timeZone: 'Asia/Shanghai', specificPeriods: [{ start: '2026-12-24 18:00', end: '2026-12-28 09:00' }] })
  })

  it('多选集合包含并发占用店铺时整条拒绝，移除冲突后才保存全部剩余店铺', async () => {
    const session = createEditor('autoReply', 'new'); await openEditor(session); await chooseShopAndTemplate()
    select('自动回复店铺账号').vm.$emit('update:modelValue', ['shop-uk', 'shop-de']); await settle()
    const competing = clone(sourceRule()); competing.id = 'AUTO-CONCURRENT'; competing.name = '并发创建的英国店铺配置'; competing.autoReply!.shopIds = ['shop-uk']
    serviceRules.value.push(competing); await settle(); const count = serviceRules.value.length
    await button('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringMatching(/店铺.*(已|最多|一条)/))
    expect(serviceRules.value).toHaveLength(count)
    expect(session.draft.name).toBe('英国店铺休息回复')
    expect(session.draft.autoReply!.shopIds).toEqual(['shop-uk', 'shop-de'])
    expect(serviceRules.value.some(rule => rule.autoReply?.shopIds.includes('shop-de'))).toBe(false)
    expect(wrapper!.find('input[aria-label="规则名称"]').exists()).toBe(true)
    select('自动回复店铺账号').vm.$emit('update:modelValue', ['shop-de']); await settle(); await button('保存')
    expect(serviceRules.value).toHaveLength(count + 1)
    expect(serviceRules.value.find(rule => rule.name === '英国店铺休息回复')?.autoReply!.shopIds).toEqual(['shop-de'])
  })

  it('清空多选店铺后拒绝保存，保留规则名称、时段和模板草稿', async () => {
    const count = serviceRules.value.length, session = createEditor('autoReply', 'new'); await openEditor(session); await chooseShopAndTemplate()
    select('自动回复店铺账号').vm.$emit('update:modelValue', []); await settle(); await button('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringMatching(/请选择.*店铺/))
    expect(serviceRules.value).toHaveLength(count)
    expect(session.draft).toMatchObject({ name: '英国店铺休息回复', templateId: 'template-rest-auto-reply', autoReply: { shopIds: [], weeklyEnabled: true } })
  })

  it('模板停用后拒绝保存，前往模板管理再返回仍保留店铺和时间草稿', async () => {
    const source = sourceRule(), before = JSON.stringify(source), session = createEditor('autoReply', 'edit', source), router = await openEditor(session)
    const path = router.currentRoute.value.path
    await check('周一休息', true); await button('管理模板')
    templateSession.templates.find(item => item.id === source.templateId)!.enabled = false
    await router.push(path); await settle()
    expect(session.draft.autoReply!.timeZone).toBe('Asia/Shanghai'); expect(session.draft.autoReply!.weekly[0]!.enabled).toBe(true)
    expect(wrapper!.text()).toContain('模板已停用')
    await button('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('模板已停用'))
    expect(JSON.stringify(source)).toBe(before)
  })

  it('两类时段均关闭或特定时间倒置时阻止保存，修正后可继续保存原草稿', async () => {
    const session = createEditor('autoReply', 'new'); await openEditor(session); await chooseShopAndTemplate()
    const count = serviceRules.value.length
    await check('启用每周休息时段', false); await button('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith('请至少设置每周休息时段或特定时间段')
    expect(serviceRules.value).toHaveLength(count)
    await check('启用特定时间段', true)
    const dates = wrapper!.findAllComponents(ElDatePicker)
    dates[0]!.vm.$emit('update:modelValue', '2026-12-28 09:00'); dates[1]!.vm.$emit('update:modelValue', '2026-12-24 18:00'); await settle(); await button('保存')
    expect(ElMessage.warning).toHaveBeenCalledWith('特定时间段的结束时间必须晚于开始时间')
    expect(serviceRules.value).toHaveLength(count)
    dates[1]!.vm.$emit('update:modelValue', '2026-12-29 09:00'); await settle(); await button('保存')
    expect(serviceRules.value).toHaveLength(count + 1)
  })

  it('启停需要确认并记录配置日志，模板失效时不能重新启用', async () => {
    const source = sourceRule(); activeRuleType.value = 'autoReply'
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as MessageBoxData)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} } } }); await settle()
    wrapper.findComponent(ElSwitch).vm.$emit('change', true); await settle()
    expect(ElMessageBox.confirm).toHaveBeenCalled(); expect(source.enabled).toBe(true)
    expect(serviceRuleLogs.value.some(log => log.ruleId === source.id && log.action === '启用')).toBe(true)
    wrapper.findComponent(ElSwitch).vm.$emit('change', false); await settle(); expect(source.enabled).toBe(false)
    templateSession.templates.find(item => item.id === source.templateId)!.enabled = false
    wrapper.findComponent(ElSwitch).vm.$emit('change', true); await settle()
    expect(source.enabled).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('模板已停用'))
  })

  it('编辑、列表和详情统一显示收到买家来信，休息时段副标题不区分新老买家', async () => {
    const source = sourceRule(); await openEditor(createEditor('autoReply', 'edit', source))
    const trigger = select('触发事件')
    expect(trigger.props('disabled')).toBe(true)
    expect(trigger.findAllComponents(ElOption).map(item => item.props('label'))).toEqual(['收到买家来信'])
    const scheduleTitle = wrapper!.findAll('.service-section-title').find(item => item.get('h2').text() === '休息时段')!
    expect(scheduleTitle.get('span').text()).toBe('收到买家来信时')
    expect(wrapper!.text()).toContain('适用于所有买家')
    expect(wrapper!.text()).not.toContain('新买家来信')
    expect(source.trigger).toBe('incoming')
    wrapper!.unmount(); wrapper = undefined; activeRuleType.value = 'autoReply'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: drawer } } }); await settle()
    expect(wrapper.text()).toContain('收到买家来信'); expect(wrapper.text()).not.toContain('新买家来信')
    await wrapper.get('.service-rule-name').trigger('click'); await settle()
    expect(wrapper.get('.service-detail').text()).toContain('收到买家来信')
    expect(wrapper.get('.service-detail').text()).not.toContain('新买家来信')
  })

  it('自动回复列表及详情展示全部店铺、时区、每周和特定时段，并隐藏优先级', async () => {
    const source = sourceRule(); source.autoReply!.specificEnabled = true
    source.autoReply!.shopIds = ['shop-us', 'shop-uk', 'shop-de', 'shop-au']
    source.autoReply!.specificPeriods = [{ id: 'period-display', start: '2026-12-24 18:00', end: '2026-12-28 09:00' }]
    activeRuleType.value = 'autoReply'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] }); await router.push('/'); await router.isReady()
    wrapper = mount(RulePage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: drawer } } }); await settle()
    expect(wrapper.text()).toContain('店铺账号'); expect(wrapper.text()).toContain('休息时段')
    expect(wrapper.findAll('.service-order-handle')).toHaveLength(0)
    for (const shop of ['US', 'UK', 'DE', 'AU']) expect(wrapper.text()).toContain(`演示店铺-${shop}`)
    await wrapper.get('.service-rule-name').trigger('click'); await settle()
    const detail = wrapper.get('.service-detail')
    for (const shop of ['US', 'UK', 'DE', 'AU']) expect(detail.text()).toContain(`演示店铺-${shop}`)
    expect(detail.text()).toContain('2026-12-24 18:00'); expect(detail.text()).toContain('2026-12-28 09:00')
    expect(detail.text()).toContain('周六'); expect(detail.text()).toContain('周日')
    expect(detail.find('.service-detail-order').exists()).toBe(false)
  })
})
