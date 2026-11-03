import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, inject, provide, ref, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ShippingOperation from './拆合发货操作.vue'
import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import type { 人工发货库存结果, 人工发货库存行 } from './拆合发货库存'
import type { 命令结果 } from './演示会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建合并发货草稿, 创建拆分发货草稿 } from './拆合发货模型'
import { 路由仓库键 } from './仓库物流选择模型'

const route: 订单路由 = { warehouse: '测试海外仓', warehouseProvider: '谷仓', warehouseAccount: '账号 A', shippingChannel: 'Ground', shippingChannelCode: 'GROUND', labelMode: '仓配一体' }
function 订单(no: string): 全渠道订单 {
  const order = JSON.parse(JSON.stringify(全渠道订单模拟数据[0])) as 全渠道订单
  const item = order.items[0]!
  return { ...order, systemOrderNo: no, platformOrderNo: `PLATFORM-${no}`, platformCode: 'eBay', processingStatus: '待审核', fulfillmentMode: '自配送', platformOrderStatus: 'NOT_STARTED', blockReason: undefined, cancelledAt: undefined, storeId: 'STORE-A', buyerExternalId: 'BUYER-A', defaultRoute: { ...route }, reviews: [], fulfillmentOrders: [], operationLogs: [], manualShippingPlan: undefined, items: [{ ...item, externalLineId: 'LINE-A', orderedQuantity: 2, fulfillableQuantity: 2, systemSku: 'SKU-A', skuResolutionStatus: '成功' }, { ...item, externalLineId: 'LINE-B', orderedQuantity: 3, fulfillableQuantity: 3, systemSku: 'SKU-B', skuResolutionStatus: '成功' }] }
}
const instances: VueWrapper[] = []
const stubs = {
  ElDialog: { props: ['modelValue'], template: '<section v-if="modelValue" class="操作窗口"><slot /><slot name="footer" /></section>' },
  ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElInputNumber: { props: ['modelValue', 'size'], emits: ['update:modelValue'], template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />' },
  ElSelect: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="">请选择</option><slot /></select>' },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElAlert: { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  ElTag: { template: '<span><slot /></span>' },
  ElCheckbox: { props: ['modelValue'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  ElIcon: { template: '<span><slot /></span>' },
  ElTooltip: { template: '<span><slot /></span>' },
  ElSteps: { template: '<div><slot /></div>' },
  ElStep: { props: ['title'], template: '<span>{{ title }}</span>' },
  ElCollapse: { template: '<div><slot /></div>' },
  ElCollapseItem: { template: '<div><slot /></div>' },
  ElTable: defineComponent({ props: ['data'], setup(props, { slots }) { provide('manual-shipping-rows', computed(() => props.data as unknown[])); return () => h('div', slots.default?.() as never) } }),
  ElTableColumn: defineComponent({ setup(_props, { slots }) { const rows = inject<Ref<unknown[]>>('manual-shipping-rows')!; return () => h('div', rows.value.map(row => h('div', slots.default?.({ row }) as never))) } }),
}
function 按钮(wrapper: VueWrapper, name: string) {
  const button = wrapper.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`未找到按钮 ${name}`)
  return button
}
async function 打开(allOrders: 全渠道订单[], mode: Parameters<InstanceType<typeof ShippingOperation>['open']>[0] = '拆分发货', chosen = allOrders, save = vi.fn(() => ({ 成功: true, 信息: '已保存' })), 真实输入 = false, extra: { inventory?: (plan: 人工发货方案) => 人工发货库存结果; saveAndReview?: (plan: 人工发货方案, versions: Record<string, number>) => 命令结果 | Promise<命令结果>; saveBatch?: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果>; saveBatchAndReview?: (plans: 人工发货方案[], versions: Record<string, number>) => 命令结果 | Promise<命令结果> } = {}) {
  const withdraw = vi.fn(() => ({ 成功: true, 信息: '已撤销' }))
  const wrapper = mount(ShippingOperation, { props: { orders: chosen, allOrders, executions: [], routeOptions: [route], versionOf: no => no === 'ORDER-B' ? 7 : 3, save, withdraw, ...extra }, global: { stubs: { ...stubs, ...(真实输入 ? { ElInput: false } : {}) }, directives: { prototype: {} } } })
  instances.push(wrapper)
  ;(wrapper.vm as unknown as InstanceType<typeof ShippingOperation>).open(mode)
  await flushPromises()
  return { wrapper, save, withdraw }
}
afterEach(() => { instances.splice(0).forEach(item => item.unmount()); document.body.innerHTML = '' })

async function 分到第二包(wrapper: VueWrapper, line = 'LINE-A', quantity = 2) {
  await wrapper.get(`[aria-label="包裹 2 商品 ${line} 数量"]`).setValue(quantity)
}
async function 进入路由(wrapper: VueWrapper) {
  await 分到第二包(wrapper)
  await 按钮(wrapper, '下一步').trigger('click')
  expect(wrapper.find('.路由区').exists()).toBe(true)
  expect(wrapper.find('.拆分矩阵区').exists()).toBe(false)
}
async function 进入预览(wrapper: VueWrapper, reason = '按商品分别发货') {
  await 进入路由(wrapper)
  await wrapper.get('[aria-label="操作原因"]').setValue(reason)
  await 按钮(wrapper, '预览发货方案').trigger('click')
  expect(wrapper.find('.预览区').exists()).toBe(true)
  expect(wrapper.find('.路由区').exists()).toBe(false)
}
function 首包余量(wrapper: VueWrapper, line: string) { return wrapper.get(`[aria-label="包裹 1 商品 ${line} 剩余数量"]`).text() }

describe('人工拆合发货窗口', () => {
  it('拆分默认两包、首包全量且只读、第二包为空，分包与路由分为三步', async () => {
    const order = 订单('ORDER-A'), before = JSON.stringify(order)
    const { wrapper, save } = await 打开([order])
    expect(wrapper.get('.步骤区').text()).toContain('拆分包裹')
    expect(wrapper.get('.步骤区').text()).toContain('仓库和物流渠道')
    expect(wrapper.get('.步骤区').text()).toContain('预览')
    expect(wrapper.find('[aria-label="包裹 1 商品 LINE-A 数量"]').exists()).toBe(false)
    expect(首包余量(wrapper, 'LINE-A')).toBe('2')
    expect(首包余量(wrapper, 'LINE-B')).toBe('3')
    expect((wrapper.get('[aria-label="包裹 2 商品 LINE-A 数量"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[aria-label="包裹 2 商品 LINE-A 数量"]').attributes('placeholder')).toBe('0')
    expect(wrapper.findAll('.总数量统计 td').map(cell => cell.text())).toEqual(['5 件', '0 件'])
    expect(wrapper.findAll('.SKU统计 td').map(cell => cell.text())).toEqual(['2 种', '0 种'])
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.find('[aria-label="操作原因"]').exists()).toBe(false)
    await 按钮(wrapper, '添加包裹').trigger('click')
    expect(wrapper.find('[aria-label="包裹 3 商品 LINE-A 数量"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('请先给最后一个包裹分配商品')
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.text()).toContain('没有分配商品')
    expect(save).not.toHaveBeenCalled()
    await 分到第二包(wrapper)
    expect(首包余量(wrapper, 'LINE-A')).toBe('0')
    expect(首包余量(wrapper, 'LINE-B')).toBe('3')
    await 按钮(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(JSON.stringify(order)).toBe(before)
  })

  it('分包后配置路由并填写原因，预览只读且确认保存携带完整分配和打开时版本', async () => {
    const { wrapper, save } = await 打开([订单('ORDER-A')])
    await 进入路由(wrapper)
    await wrapper.get('[aria-label="操作原因"]').setValue('按商品分别发货')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    expect(wrapper.find('[aria-label="操作原因"]').exists()).toBe(false)
    expect(wrapper.find('.拆分矩阵区').exists()).toBe(false)
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.text()).toContain('按商品分别发货')
    await 按钮(wrapper, '确认保存').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]).toEqual([expect.objectContaining({ kind: '拆分发货', reason: '按商品分别发货', packages: [expect.objectContaining({ items: [expect.objectContaining({ externalLineId: 'LINE-B', quantity: 3 })] }), expect.objectContaining({ items: [expect.objectContaining({ externalLineId: 'LINE-A', quantity: 2 })] })] }), { 'ORDER-A': 3 }])
    expect(wrapper.emitted('saved')).toEqual([['拆分发货', ['ORDER-A']]])
  })

  it.each(['确认保存', '保存并审核订单'])('拆分操作原因留空可预览并%s，保留完整分包和版本', async action => {
    const saveAndReview = vi.fn(() => ({ 成功: true, 信息: '已进入待推单' }))
    const { wrapper, save } = await 打开([订单('ORDER-A')], '拆分发货', undefined, undefined, false, { saveAndReview })
    await 进入路由(wrapper)
    expect(wrapper.get('.原因区 label').text()).toBe('操作原因 （选填）')
    expect(wrapper.get('.原因区 label').text()).not.toContain('*')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.get('.原因预览').text()).toContain('—')
    await 按钮(wrapper, action).trigger('click'); await flushPromises()
    const selectedSave = action === '确认保存' ? save : saveAndReview
    expect(selectedSave).toHaveBeenCalledOnce()
    expect(selectedSave).toHaveBeenCalledWith(expect.objectContaining({ kind: '拆分发货', reason: '', packages: expect.any(Array) }), { 'ORDER-A': 3 })
    expect(action === '确认保存' ? saveAndReview : save).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')?.[0]?.[1]).toEqual(['ORDER-A'])
  })

  it('添加空包阻止下一步，删除第三包后回流首包，至少保留两个包裹', async () => {
    const order = 订单('ORDER-A'); order.platformCode = 'Temu'
    const { wrapper, save } = await 打开([order])
    await 分到第二包(wrapper, 'LINE-A', 1)
    await 按钮(wrapper, '添加包裹').trigger('click')
    expect(wrapper.find('[aria-label="包裹 3 商品 LINE-A 数量"]').exists()).toBe(true)
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.text()).toContain('没有分配商品')
    await wrapper.get('[aria-label="包裹 3 商品 LINE-A 数量"]').setValue(1)
    expect(首包余量(wrapper, 'LINE-A')).toBe('0')
    await wrapper.get('[aria-label="删除包裹 3"]').trigger('click')
    expect(首包余量(wrapper, 'LINE-A')).toBe('1')
    expect(wrapper.find('[aria-label="包裹 3 商品 LINE-A 数量"]').exists()).toBe(false)
    expect(wrapper.findAll('[aria-label^="删除包裹 "]').every(button => (button.element as HTMLButtonElement).disabled)).toBe(true)
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('后续包超分时首包不产生可保存的负数量，明确阻断而非自动截断输入', async () => {
    const order = 订单('ORDER-A'); order.platformCode = 'Temu'
    const { wrapper, save } = await 打开([order])
    await 分到第二包(wrapper, 'LINE-A', 2)
    await 按钮(wrapper, '添加包裹').trigger('click')
    await wrapper.get('[aria-label="包裹 3 商品 LINE-A 数量"]').setValue(1)
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.find('.校验问题').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/超过|超出|超分|超量|不能大于/)
    expect(save).not.toHaveBeenCalled()
  })

  it('数量与SKU种类分别统计，同一系统SKU的多个来源行不会重复计成多种SKU', async () => {
    const order = 订单('ORDER-A'); order.platformCode = 'Temu'; order.items[1]!.systemSku = 'SKU-A'
    const { wrapper } = await 打开([order])
    const quantities = () => wrapper.findAll('.总数量统计 td').map(item => item.text())
    const skuKinds = () => wrapper.findAll('.SKU统计 td').map(item => item.text())
    expect(quantities()).toEqual(['5 件', '0 件'])
    expect(skuKinds()).toEqual(['1 种', '0 种'])
    await 分到第二包(wrapper, 'LINE-A', 1)
    await 分到第二包(wrapper, 'LINE-B', 2)
    expect(首包余量(wrapper, 'LINE-A')).toBe('1')
    expect(首包余量(wrapper, 'LINE-B')).toBe('1')
    expect(quantities()).toEqual(['2 件', '3 件'])
    expect(skuKinds()).toEqual(['1 种', '1 种'])
  })

  it('非eBay商品可按数量分到多包，余量自动留首包且保存逐行来源', async () => {
    const order = 订单('ORDER-A'); order.platformCode = 'Temu'
    const { wrapper, save } = await 打开([order])
    await 分到第二包(wrapper, 'LINE-A', 1)
    expect(首包余量(wrapper, 'LINE-A')).toBe('1')
    await 按钮(wrapper, '下一步').trigger('click')
    await wrapper.get('[aria-label="操作原因"]').setValue('商品数量分包')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ packages: [expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ externalLineId: 'LINE-A', quantity: 1 }), expect.objectContaining({ externalLineId: 'LINE-B', quantity: 3 })]) }), expect.objectContaining({ items: [expect.objectContaining({ externalLineId: 'LINE-A', quantity: 1 })] })] }), { 'ORDER-A': 3 })
  })

  it.each([{ name: '同一商品数量', quantity: 1 }, { name: '完整SKU种类', quantity: 2 }])('eBay允许按$name拆分，分配完整后进入路由并保存', async ({ quantity }) => {
    const { wrapper, save } = await 打开([订单('ORDER-A')])
    expect(wrapper.find('.平台分包说明').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('同一平台商品行须完整放入一个包裹')
    await 分到第二包(wrapper, 'LINE-A', quantity)
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(true)
    expect(save).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="操作原因"]').setValue('按数量与SKU种类安排包裹')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: '拆分发货', packages: [expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ externalLineId: 'LINE-B', quantity: 3 })]) }), expect.objectContaining({ items: [expect.objectContaining({ externalLineId: 'LINE-A', quantity })] })] }), { 'ORDER-A': 3 })
    const firstPackage = (save.mock.calls[0] as unknown as [人工发货方案])[0].packages[0]!
    if (quantity === 1) expect(firstPackage.items).toContainEqual(expect.objectContaining({ externalLineId: 'LINE-A', quantity: 1 }))
    else expect(firstPackage.items.some(item => item.externalLineId === 'LINE-A')).toBe(false)
  })

  it('返回上一步保留矩阵分配、每包路由和原因，切仓仍清旧渠道', async () => {
    const { wrapper, save } = await 打开([订单('ORDER-A')])
    const otherRoute = { ...route, warehouse: '测试第二仓', shippingChannel: 'Express', shippingChannelCode: 'EXPRESS' }
    await wrapper.setProps({ routeOptions: [route, otherRoute] })
    await 进入路由(wrapper)
    await wrapper.findAll('[aria-label="发货仓库"]')[1]!.setValue(路由仓库键(otherRoute))
    expect((wrapper.findAll('[aria-label="物流渠道"]')[1]!.element as HTMLSelectElement).value).toBe('')
    await wrapper.get('[aria-label="操作原因"]').setValue('选择不同发货仓')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    expect(wrapper.text()).toContain('请选择完整的发货仓库及物流渠道')
    await wrapper.findAll('[aria-label="物流渠道"]')[1]!.setValue('EXPRESS')
    await 按钮(wrapper, '上一步').trigger('click')
    expect((wrapper.get('[aria-label="包裹 2 商品 LINE-A 数量"]').element as HTMLInputElement).value).toBe('2')
    await 按钮(wrapper, '下一步').trigger('click')
    expect((wrapper.findAll('[aria-label="发货仓库"]')[1]!.element as HTMLSelectElement).value).toBe(路由仓库键(otherRoute))
    expect((wrapper.findAll('[aria-label="物流渠道"]')[1]!.element as HTMLSelectElement).value).toBe('EXPRESS')
    expect((wrapper.get('[aria-label="操作原因"]').element as HTMLTextAreaElement).value).toBe('选择不同发货仓')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '上一步').trigger('click')
    expect((wrapper.findAll('[aria-label="物流渠道"]')[1]!.element as HTMLSelectElement).value).toBe('EXPRESS')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ packages: [expect.objectContaining({ route }), expect.objectContaining({ route: otherRoute })] }), { 'ORDER-A': 3 })
  })

  it('并发变化导致确认保存失败时保留预览和方案，不发出成功事件', async () => {
    const save = vi.fn(() => ({ 成功: false, 信息: '订单已变化，请重新打开' }))
    const { wrapper } = await 打开([订单('ORDER-A')], '拆分发货', undefined, save)
    await 进入预览(wrapper, '按商品拆分')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(wrapper.find('.操作窗口').exists()).toBe(true)
    expect(wrapper.text()).toContain('订单已变化，请重新打开')
    expect(wrapper.text()).toContain('按商品拆分')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('合并先计算五项一致的分组，再预览并保存全部来源，返回保留草稿', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    const { wrapper, save } = await 打开(orders, '合并发货')
    expect(wrapper.find('.拆分矩阵区').exists()).toBe(false)
    expect(wrapper.find('.共同路由').exists()).toBe(true)
    expect(wrapper.get('.步骤区').text()).toContain('判断可合并订单')
    expect(wrapper.findAll('.合并组')).toHaveLength(1)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('判断可合并订单')
    expect(wrapper.get('.计算摘要').text()).toContain('可合并订单2 张')
    expect(wrapper.findAll('[aria-label="发货仓库"]')).toHaveLength(1)
    expect(wrapper.findAll('button').some(button => button.text() === '下一步')).toBe(false)
    await wrapper.get('[aria-label="操作原因"]').setValue('同一买家共同寄送')
    await 按钮(wrapper, '预览').trigger('click')
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.get('[aria-current="step"]').text()).toContain('方案预览')
    await 按钮(wrapper, '返回编辑').trigger('click')
    expect((wrapper.get('[aria-label="操作原因"]').element as HTMLTextAreaElement).value).toBe('同一买家共同寄送')
    await 按钮(wrapper, '预览').trigger('click')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: '合并发货', orderNos: ['ORDER-A', 'ORDER-B'], packages: [expect.objectContaining({ route, items: expect.arrayContaining([expect.objectContaining({ orderNo: 'ORDER-A' }), expect.objectContaining({ orderNo: 'ORDER-B' })]) })] }), { 'ORDER-A': 3, 'ORDER-B': 7 })
  })

  it('合并原因可空，保存并审核与普通保存共用提交锁，失败保留预览', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    let finish!: (result: 命令结果) => void
    const saveBatchAndReview = vi.fn(() => new Promise<命令结果>(resolve => { finish = resolve }))
    const saveBatch = vi.fn(() => ({ 成功: true, 信息: '已保存' }))
    const { wrapper } = await 打开(orders, '合并发货', orders, undefined, false, { saveBatch, saveBatchAndReview })
    expect(wrapper.get('.原因区').text()).toContain('选填')
    await 按钮(wrapper, '预览').trigger('click')
    expect(wrapper.find('.预览区').exists()).toBe(true)
    await 按钮(wrapper, '保存并审核').trigger('click'); await flushPromises()
    expect(saveBatchAndReview).toHaveBeenCalledWith([expect.objectContaining({ reason: '', orderNos: ['ORDER-A', 'ORDER-B'] })], { 'ORDER-A': 3, 'ORDER-B': 7 })
    for (const name of ['确认保存', '保存并审核', '返回编辑', '取消']) expect((按钮(wrapper, name).element as HTMLButtonElement).disabled).toBe(true)
    await 按钮(wrapper, '确认保存').trigger('click')
    expect(saveBatch).not.toHaveBeenCalled()
    expect(saveBatchAndReview).toHaveBeenCalledOnce()
    finish({ 成功: false, 信息: '第二组库存待核实，本次未保存或审核' }); await flushPromises()
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.text()).toContain('本次未保存或审核')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('合并保存并审核成功发出审核动作，普通空原因保存仍使用原保存入口', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    const saveBatchAndReview = vi.fn(() => ({ 成功: true, 信息: '已保存并审核' }))
    const { wrapper, save } = await 打开(orders, '合并发货', orders, undefined, false, { saveBatchAndReview })
    await 按钮(wrapper, '预览').trigger('click')
    await 按钮(wrapper, '保存并审核').trigger('click'); await flushPromises()
    expect(saveBatchAndReview).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toEqual([['保存并审核订单', ['ORDER-A', 'ORDER-B']]])
    const normal = await 打开(orders, '合并发货')
    await 按钮(normal.wrapper, '预览').trigger('click')
    await 按钮(normal.wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(normal.save).toHaveBeenCalledWith(expect.objectContaining({ reason: '' }), { 'ORDER-A': 3, 'ORDER-B': 7 })
  })

  it('从合并任一来源撤销仍为两步，自动覆盖完整来源且原因必填', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    const plan = { ...创建合并发货草稿(orders), reason: '同买家合并' }
    for (const order of orders) order.manualShippingPlan = JSON.parse(JSON.stringify(plan))
    const { wrapper, withdraw } = await 打开(orders, '撤销方案', [orders[1]!])
    expect(wrapper.get('.来源表').text()).toContain('ORDER-A')
    expect(wrapper.get('.来源表').text()).toContain('ORDER-B')
    expect(wrapper.find('.拆分矩阵区').exists()).toBe(false)
    await 按钮(wrapper, '预览撤销').trigger('click')
    expect(wrapper.text()).toContain('请填写撤销原因')
    await wrapper.get('[aria-label="撤销原因"]').setValue('恢复分别发货')
    await 按钮(wrapper, '预览撤销').trigger('click')
    await 按钮(wrapper, '返回编辑').trigger('click')
    expect((wrapper.get('[aria-label="撤销原因"]').element as HTMLTextAreaElement).value).toBe('恢复分别发货')
    await 按钮(wrapper, '预览撤销').trigger('click')
    expect(withdraw).not.toHaveBeenCalled()
    await 按钮(wrapper, '确认撤销').trigger('click'); await flushPromises()
    expect(withdraw).toHaveBeenCalledWith(['ORDER-B', 'ORDER-A'], { 'ORDER-A': 3, 'ORDER-B': 7 }, '恢复分别发货')
    expect(wrapper.emitted('saved')).toEqual([['撤销合并发货', ['ORDER-B', 'ORDER-A']]])
  })

  it('混选已合并方案与新订单时明确阻断，不静默忽略新选择', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B'), 订单('ORDER-C')]
    const plan = { ...创建合并发货草稿(orders.slice(0, 2)), reason: '合并' }
    for (const order of orders.slice(0, 2)) order.manualShippingPlan = JSON.parse(JSON.stringify(plan))
    const { wrapper, save } = await 打开(orders, '合并发货', [orders[0]!, orders[2]!])
    expect(wrapper.get('.未合并区').text()).toMatch(/已有.*方案|已保存.*方案|已有.*安排/)
    expect(wrapper.get('.未合并区').text()).not.toContain('ORDER-B')
    expect((按钮(wrapper, '预览').element as HTMLButtonElement).disabled).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('混选多组与无匹配订单时分别预览，只保存选中的可合并组', async () => {
    const orders = ['ORDER-A', 'ORDER-B', 'ORDER-C', 'ORDER-D', 'ORDER-E'].map(订单)
    orders[2]!.buyerExternalId = 'BUYER-SECOND'; orders[3]!.buyerExternalId = 'BUYER-SECOND'
    orders[4]!.address.addressLine2 = 'Unit 99'
    const saveBatch = vi.fn(() => ({ 成功: true, 信息: '全部保存' }))
    const { wrapper, save } = await 打开(orders, '合并发货', orders, undefined, false, { saveBatch })
    expect(wrapper.findAll('.合并组')).toHaveLength(2)
    expect(wrapper.get('.未合并区').text()).toContain('ORDER-E')
    await wrapper.get('[aria-label="选择合并组 2"] input').setValue(false)
    await wrapper.get('[aria-label="操作原因"]').setValue('本次只合并第一组')
    await 按钮(wrapper, '预览').trigger('click')
    expect(wrapper.findAll('.预览组')).toHaveLength(1)
    expect(wrapper.get('.预览区').text()).toContain('其余 3 张订单保持原发货安排')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(saveBatch).toHaveBeenCalledWith([expect.objectContaining({ orderNos: ['ORDER-A', 'ORDER-B'], reason: '本次只合并第一组' })], expect.objectContaining({ 'ORDER-A': 3, 'ORDER-B': 7 }))
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toEqual([['合并发货', ['ORDER-A', 'ORDER-B']]])
  })

  it('预览后买家发生变化则阻止保存，重新计算后显示无匹配结果', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    const saveBatch = vi.fn(() => ({ 成功: true, 信息: '已保存' }))
    const { wrapper } = await 打开(orders, '合并发货', orders, undefined, false, { saveBatch })
    await wrapper.get('[aria-label="操作原因"]').setValue('同买家合并')
    await 按钮(wrapper, '预览').trigger('click')
    const changed = JSON.parse(JSON.stringify(orders)) as 全渠道订单[]
    changed[1]!.buyerExternalId = 'BUYER-CHANGED'
    await wrapper.setProps({ allOrders: changed })
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(saveBatch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('买家')
    await 按钮(wrapper, '返回编辑').trigger('click')
    await 按钮(wrapper, '重新计算').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.合并组')).toHaveLength(0)
    expect(wrapper.get('.未合并区').text()).toContain('ORDER-A')
    expect(wrapper.get('.未合并区').text()).toContain('ORDER-B')
  })

  it('重新计算重建共同路由控件，不残留上一轮选择的服务商和账号', async () => {
    const orders = [订单('ORDER-A'), 订单('ORDER-B')]
    orders[1]!.defaultRoute = { ...route, warehouse: '另一原发货仓' }
    const { wrapper, save } = await 打开(orders, '合并发货')
    await wrapper.get('[aria-label="发货仓库"]').setValue(路由仓库键(route))
    await flushPromises()
    expect((wrapper.get('[aria-label="仓储服务商"]').element as HTMLSelectElement).value).toBe(route.warehouseProvider)
    await 按钮(wrapper, '重新计算').trigger('click'); await flushPromises()
    for (const label of ['仓储服务商', '仓库账号', '发货仓库', '物流渠道']) expect((wrapper.get(`[aria-label="${label}"]`).element as HTMLSelectElement).value).toBe('')
    expect(save).not.toHaveBeenCalled()
  })

  it('SKU资料失效后仍可安全撤销待审核方案，不被重新发货资格锁死', async () => {
    const order = 订单('ORDER-A')
    order.manualShippingPlan = { ...创建拆分发货草稿(order), reason: '原拆分方案' }
    order.items[0]!.systemSku = undefined; order.items[0]!.skuResolutionStatus = '缺失'
    const { wrapper, withdraw } = await 打开([order], '撤销方案')
    expect((按钮(wrapper, '预览撤销').element as HTMLButtonElement).disabled).toBe(false)
    await wrapper.get('[aria-label="撤销原因"]').setValue('商品资料已变更，先撤销原发货安排')
    await 按钮(wrapper, '预览撤销').trigger('click')
    await 按钮(wrapper, '确认撤销').trigger('click'); await flushPromises()
    expect(withdraw).toHaveBeenCalledWith(['ORDER-A'], { 'ORDER-A': 3 }, '商品资料已变更，先撤销原发货安排')
    expect(wrapper.emitted('saved')).toEqual([['撤销拆分发货', ['ORDER-A']]])
  })
})

function 数量回显订单() {
  const order = 订单('ORDER-A')
  order.platformCode = 'Temu'
  order.items[0]!.orderedQuantity = 10; order.items[0]!.fulfillableQuantity = 10
  order.items[1]!.orderedQuantity = 6; order.items[1]!.fulfillableQuantity = 6
  return order
}
async function 输入并失焦(wrapper: VueWrapper, text: string) {
  const control = wrapper.get('input[aria-label="包裹 2 商品 LINE-A 数量"]')
  ;(control.element as HTMLInputElement).value = text
  // 精确模拟浏览器填入及失焦；不补发 change 或组件 update:modelValue 来掩盖回显问题。
  await control.trigger('input'); await flushPromises()
  await control.trigger('blur'); await flushPromises()
  return control
}

describe('真实 Element Plus 输入组件的拆分数量回显', () => {
  it('仅 input 后失焦仍显示 5，前后步骤返回保留输入及分配并保存同一数量', async () => {
    const order = 数量回显订单()
    const { wrapper, save } = await 打开([order], '拆分发货', undefined, undefined, true)
    const control = await 输入并失焦(wrapper, '5')
    expect((control.element as HTMLInputElement).value).toBe('5')
    expect(control.attributes('inputmode')).toBe('numeric')
    expect(首包余量(wrapper, 'LINE-A')).toBe('5')
    expect(wrapper.findAll('.总数量统计 td').map(cell => cell.text())).toEqual(['11 件', '5 件'])
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(true)
    await wrapper.get('textarea[aria-label="操作原因"]').setValue('真实输入组件数量回显核验')
    await 按钮(wrapper, '上一步').trigger('click')
    expect((wrapper.get('input[aria-label="包裹 2 商品 LINE-A 数量"]').element as HTMLInputElement).value).toBe('5')
    expect(首包余量(wrapper, 'LINE-A')).toBe('5')
    await 按钮(wrapper, '下一步').trigger('click')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '上一步').trigger('click')
    await 按钮(wrapper, '上一步').trigger('click')
    expect((wrapper.get('input[aria-label="包裹 2 商品 LINE-A 数量"]').element as HTMLInputElement).value).toBe('5')
    await 按钮(wrapper, '下一步').trigger('click')
    await 按钮(wrapper, '预览发货方案').trigger('click')
    await 按钮(wrapper, '确认保存').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ packages: [expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ externalLineId: 'LINE-A', quantity: 5 }), expect.objectContaining({ externalLineId: 'LINE-B', quantity: 6 })]) }), expect.objectContaining({ items: [expect.objectContaining({ externalLineId: 'LINE-A', quantity: 5 })] })] }), { 'ORDER-A': 3 })
  })

  it('清空后失焦保持空框、数量归零并回流首包，空包仍阻止下一步', async () => {
    const { wrapper, save } = await 打开([数量回显订单()], '拆分发货', undefined, undefined, true)
    await 输入并失焦(wrapper, '5')
    const cleared = await 输入并失焦(wrapper, '')
    expect((cleared.element as HTMLInputElement).value).toBe('')
    expect(首包余量(wrapper, 'LINE-A')).toBe('10')
    expect(wrapper.findAll('.总数量统计 td').map(cell => cell.text())).toEqual(['16 件', '0 件'])
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.text()).toContain('没有分配商品')
    expect(save).not.toHaveBeenCalled()
  })

  it('小数和超量失焦后保留输入以便修改，均阻止继续且不截断为合法数量', async () => {
    const { wrapper, save } = await 打开([数量回显订单()], '拆分发货', undefined, undefined, true)
    const fractional = await 输入并失焦(wrapper, '1.5')
    expect((fractional.element as HTMLInputElement).value).toBe('1.5')
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.get('.校验问题').text()).toContain('整数')
    const excessive = await 输入并失焦(wrapper, '11')
    expect((excessive.element as HTMLInputElement).value).toBe('11')
    expect(首包余量(wrapper, 'LINE-A')).toBe('-1')
    await 按钮(wrapper, '下一步').trigger('click')
    expect(wrapper.find('.路由区').exists()).toBe(false)
    expect(wrapper.get('.校验问题').text()).toContain('超量')
    expect(save).not.toHaveBeenCalled()
  })
})

function 窗口库存(plan: 人工发货方案, shortage = false): 人工发货库存结果 {
  const rows: 人工发货库存行[] = plan.packages.flatMap((parcel, packageIndex) => parcel.items.map(item => ({
    packageKey: parcel.key, packageIndex, orderNo: item.orderNo, lineId: item.externalLineId,
    systemSku: item.externalLineId === 'LINE-A' ? 'SKU-A' : 'SKU-B', warehouseSku: `WH-${item.externalLineId}`,
    warehouse: parcel.route.warehouse, warehouseAccount: parcel.route.warehouseAccount,
    required: item.quantity, scopeRequired: item.quantity, available: shortage ? 0 : 50,
    remaining: (shortage ? 0 : 50) - item.quantity, status: shortage ? '不足' : '充足',
    reason: shortage ? '所选仓库库存不足，请调整数量或更换仓库' : '', sourceAt: '2026-10-21T01:00:00Z', sourceKey: `${parcel.route.warehouse}-${item.externalLineId}`,
  })))
  return { rows, reasons: shortage ? ['所选仓库库存不足，请调整数量或更换仓库'] : [] }
}

describe('拆分窗口的仓库库存和保存审核', () => {
  it('先分包再查仓库库存，不足阻断预览，换仓并补渠道后重新检查', async () => {
    const inventory = vi.fn((plan: 人工发货方案) => 窗口库存(plan, plan.packages.some(parcel => parcel.route.warehouse !== '足量仓')))
    const { wrapper, save } = await 打开([订单('ORDER-A')], '拆分发货', undefined, undefined, false, { inventory })
    await 进入路由(wrapper)
    await wrapper.get('[aria-label="操作原因"]').setValue('检查仓库库存后保存')
    await 按钮(wrapper, '预览发货方案').trigger('click'); await flushPromises()
    expect(wrapper.find('.路由区').exists()).toBe(true)
    expect(wrapper.text()).toContain('库存不足')
    expect(save).not.toHaveBeenCalled()
    const enoughRoute = { ...route, warehouse: '足量仓' }
    await wrapper.setProps({ routeOptions: [route, enoughRoute] })
    for (let index = 0; index < 2; index++) {
      await wrapper.findAll('[aria-label="发货仓库"]')[index]!.setValue(路由仓库键(enoughRoute))
      await wrapper.findAll('[aria-label="物流渠道"]')[index]!.setValue('GROUND')
    }
    await 按钮(wrapper, '预览发货方案').trigger('click'); await flushPromises()
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.get('.预览库存').text()).toContain('WH-LINE-A')
    expect(wrapper.get('.预览库存').text()).toContain('WH-LINE-B')
    expect(wrapper.get('.预览库存').text()).not.toContain('请选择发货仓库后查看库存')
    expect(inventory.mock.calls.some(([plan]) => plan.packages.every(parcel => parcel.route.warehouse === '足量仓'))).toBe(true)
  })

  it('预览后库存变化会拦截两种保存，保留草稿且不调用保存', async () => {
    const shortage = ref(false)
    const inventory = (plan: 人工发货方案) => 窗口库存(plan, shortage.value)
    const saveAndReview = vi.fn(() => ({ 成功: true, 信息: '已进入待推单' }))
    const { wrapper, save } = await 打开([订单('ORDER-A')], '拆分发货', undefined, undefined, false, { inventory, saveAndReview })
    await 进入预览(wrapper)
    shortage.value = true; await flushPromises()
    await 按钮(wrapper, '确认保存').trigger('click')
    await 按钮(wrapper, '保存并审核订单').trigger('click'); await flushPromises()
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.text()).toContain('库存不足')
    expect(save).not.toHaveBeenCalled()
    expect(saveAndReview).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('保存并审核独立调用，提交中双按钮互斥，成功携带打开时版本及完整方案', async () => {
    let finish!: (result: 命令结果) => void
    const saveAndReview = vi.fn(() => new Promise<命令结果>(resolve => { finish = resolve }))
    const { wrapper, save } = await 打开([订单('ORDER-A')], '拆分发货', undefined, undefined, false, { inventory: plan => 窗口库存(plan), saveAndReview })
    await 进入预览(wrapper)
    await 按钮(wrapper, '保存并审核订单').trigger('click'); await flushPromises()
    expect(saveAndReview).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    await 按钮(wrapper, '确认保存').trigger('click')
    await 按钮(wrapper, '保存并审核订单').trigger('click')
    expect(saveAndReview).toHaveBeenCalledOnce()
    expect(saveAndReview.mock.calls[0]).toEqual([expect.objectContaining({ kind: '拆分发货', orderNos: ['ORDER-A'], packages: expect.any(Array), reason: '按商品分别发货' }), { 'ORDER-A': 3 }])
    finish({ 成功: true, 信息: '保存并审核成功，订单进入待推单' }); await flushPromises()
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatch(/审核/)
    expect(wrapper.emitted('saved')?.[0]?.[1]).toEqual(['ORDER-A'])
  })

  it('审核未通过时保留预览及原因，不发送保存或审核成功事件', async () => {
    const saveAndReview = vi.fn(() => ({ 成功: false, 信息: '当前发货条件不满足，方案未保存，订单保留待审核' }))
    const { wrapper, save } = await 打开([订单('ORDER-A')], '拆分发货', undefined, undefined, false, { inventory: plan => 窗口库存(plan), saveAndReview })
    await 进入预览(wrapper, '审核失败后保留输入')
    await 按钮(wrapper, '保存并审核订单').trigger('click'); await flushPromises()
    expect(wrapper.find('.预览区').exists()).toBe(true)
    expect(wrapper.text()).toContain('审核失败后保留输入')
    expect(wrapper.text()).toContain('当前发货条件不满足')
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
