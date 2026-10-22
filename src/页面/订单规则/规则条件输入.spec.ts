import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ElOption, ElRadio, ElRadioGroup, ElSelect } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import ConditionValue from './规则条件输入.vue'
import BaseMultiSelect from './基础条件多选.vue'
import { 创建规则样例, type 订单规则, type 规则类型, type 规则条件 } from './规则逻辑'
import { 中台平台站点资料, 中台系统用户资料, 站点选择值, type 平台站点资料 } from './规则基础选项'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 共享订单备注 } from '../订单处理/订单备注模型'
import { 条件分组 } from './规则条件定义'

let 页面: VueWrapper | undefined
const 浮层桩 = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
const 原站点资料 = 中台平台站点资料.value
const 原用户资料 = 中台系统用户资料.value
const 原订单备注 = JSON.stringify(共享订单备注.value)
const 测试站点资料: 平台站点资料[] = [
  { id: 'TEST-SITE-US', platformCode: 'eBay', siteName: '测试美国站' },
  { id: 'TEST-SITE-US', platformCode: 'Temu', siteName: '测试美国站' },
]

async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
function 准备规则(type: 规则类型 = '审单规则', isNew = false) {
  const 来源 = 创建规则样例().find(项 => 项.type === type)!
  来源.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
  const 草稿 = reactive(structuredClone(来源))
  草稿.id = isNew ? '' : 来源.id
  草稿.name = `${isNew ? '新增' : '编辑'}${type}条件测试`
  草稿.enabled = false
  return { 来源, 草稿 }
}
async function 打开(草稿: 订单规则, 来源: 订单规则) {
  页面?.unmount()
  页面 = mount(RuleForm, { props: { draft: 草稿, rules: [来源], orders: structuredClone(全渠道订单模拟数据.slice(0, 2)) }, attachTo: document.body, global: { stubs: { ElDrawer: 浮层桩, ElDialog: 浮层桩 }, directives: { prototype: {} } } })
  await 稳定()
  return 页面
}
function 按钮(page: VueWrapper, name: string) {
  const item = page.findAll('button').find(项 => 项.text() === name)
  if (!item) throw new Error(`未找到按钮：${name}`)
  return item
}
async function 勾选条件(page: VueWrapper, name: string, selected = true) {
  const item = page.findAll('.可选分组 .el-checkbox').find(项 => 项.text() === name)
  if (!item) throw new Error(`未找到可选条件：${name}`)
  await item.get('input[type="checkbox"]').setValue(selected)
  await 稳定()
}
function 条件行(page: VueWrapper, name: string) {
  const item = page.findAll('.编辑条件行').find(项 => 项.get('.条件标签 strong').text() === name)
  if (!item) throw new Error(`未找到已选条件：${name}`)
  return item
}
function 选择器(container: VueWrapper | DOMWrapper<Element>, label: string) {
  const item = container.findAllComponents(ElSelect).find((项: VueWrapper) => 项.find(`[aria-label="${label}"]`).exists())
  if (!item) throw new Error(`未找到选择器：${label}`)
  return item
}
async function 选择值(container: VueWrapper | DOMWrapper<Element>, label: string, value: string | boolean) {
  // 仅替换浮层外壳，真实 ElSelect 的 modelValue 绑定及对外事件仍参与表单联动。
  选择器(container, label).vm.$emit('update:modelValue', value)
  await 稳定()
}
function 边界复选框(row: DOMWrapper<Element>, label: string) {
  const item = row.findAll<HTMLInputElement>('input[type="checkbox"]').find(项 => 项.attributes('aria-label') === label || 项.element.closest(`[aria-label="${label}"]`))
  if (!item) throw new Error(`未找到范围边界：${label}`)
  return item
}
async function 勾选边界(row: DOMWrapper<Element>, label: string, enabled: boolean) { await 边界复选框(row, label).setValue(enabled); await 稳定() }
async function 基础选择值(row: DOMWrapper<Element>, values: string[]) {
  // 多选组件交互另有专项，此处通过公开事件验证真实组件与规则草稿的双向绑定。
  row.getComponent(BaseMultiSelect).vm.$emit('update:modelValue', values)
  await 稳定()
}
function 已保存(page: VueWrapper) { const events = page.emitted('save'); return events?.[events.length - 1]?.[0] as 订单规则 | undefined }

beforeEach(() => { 中台平台站点资料.value = structuredClone(测试站点资料) })
afterEach(() => { 页面?.unmount(); 页面 = undefined; document.body.innerHTML = ''; 中台平台站点资料.value = 原站点资料; 中台系统用户资料.value = 原用户资料; 共享订单备注.value = JSON.parse(原订单备注) })

describe('规则条件输入与表单联动', () => {
  it('产品数量可切换总数量与SKU数量，范围值保留并保存回填且不修改旧配置', async () => {
    const { 草稿, 来源 } = 准备规则(), before = JSON.stringify(来源)
    草稿.conditions.push({ field: 'warehouseSkuQuantity', operator: '介于', value: '1', upperValue: '10' })
    const page = await 打开(草稿, 来源), row = 条件行(page, '产品数量')
    expect(row.text()).toContain('当产品总数量')
    row.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'sku'); await 稳定()
    expect(row.text()).toContain('当SKU数量')
    expect(row.get<HTMLInputElement>('input[aria-label="第2项产品数量下限"]').element.value).toBe('1')
    await row.get('input[aria-label="第2项产品数量下限"]').setValue('1.5')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    await row.get('input[aria-label="第2项产品数量下限"]').setValue('2')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved.conditions[1]).toMatchObject({ quantityMode: 'sku', value: '2', upperValue: '10' })
    const refill = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(refill, '产品数量').text()).toContain('当SKU数量')
    expect(JSON.stringify(来源)).toBe(before)
  })

  it('长宽高三轴各端可勾选，倒置拦截，关闭端保留原文并按独立配置保存回填', async () => {
    const { 草稿, 来源 } = 准备规则(), page = await 打开(草稿, 来源)
    await 勾选条件(page, '长宽高')
    const row = 条件行(page, '长宽高')
    expect(row.findAll('input[type="checkbox"]')).toHaveLength(6)
    expect(row.find('[aria-label="第2项比较方式"]').exists()).toBe(false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    await 勾选边界(row, '第2项长宽高长度启用下限', true)
    await row.get('input[aria-label="第2项长宽高长度下限"]').setValue('20')
    await 勾选边界(row, '第2项长宽高长度启用上限', true)
    await row.get('input[aria-label="第2项长宽高长度上限"]').setValue('10')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('.校验错误').text()).toContain('长度下界不能大于')
    await row.get('input[aria-label="第2项长宽高长度上限"]').setValue('30')
    await 勾选边界(row, '第2项长宽高高度启用下限', true)
    await row.get('input[aria-label="第2项长宽高高度下限"]').setValue('5')
    await 勾选边界(row, '第2项长宽高高度启用下限', false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved.conditions[1]!.dimensionRanges).toMatchObject({ length: { value: '20', upperValue: '30', lowerEnabled: true, upperEnabled: true }, height: { value: '5', lowerEnabled: false } })
    const refill = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(refill, '长宽高').get<HTMLInputElement>('input[aria-label="第2项长宽高长度下限"]').element.value).toBe('20')
    expect(条件行(refill, '长宽高').get<HTMLInputElement>('input[aria-label="第2项长宽高高度下限"]').element.disabled).toBe(true)
  })

  it.each<规则类型>(['审单规则', '订单标发规则', '分仓规则'])('%s目录按类型追加发货仓库，原四组24项不变且不提供关系选择', async type => {
    const { 草稿, 来源 } = 准备规则(type, true), page = await 打开(草稿, 来源)
    const groups = page.findAll('.可选分组')
    expect(groups.map(组 => ({ title: 组.get('h4').text(), labels: 组.findAll('.el-checkbox').map(项 => 项.text()) }))).toEqual([
      { title: '基础信息', labels: ['订单平台', '订单站点', '订单店铺'] },
      { title: '物流信息', labels: ['收货国家', '收货省/州', '收货城市', '订单地址', '平台配送方式', ...(type === '分仓规则' ? [] : ['发货仓库'])] },
      { title: '订单信息', labels: ['订单重量（kg）', '订单总金额范围', '客付运费范围', '买家留言', '商品单价金额范围'] },
      { title: '货品信息', labels: ['产品尺寸', '仓库SKU', '平台SKU', '产品数量', '长宽高', '三边之和', '最长边', '次长边', '长+(宽+高)×2', '产品销售负责人', '材积范围'] },
    ])
    const labels = groups.flatMap(组 => 组.findAll('.el-checkbox').map(项 => 项.text()))
    expect(labels).toHaveLength(type === '分仓规则' ? 24 : 25)
    expect(labels.filter(label => label === '发货仓库')).toHaveLength(type === '分仓规则' ? 0 : 1)
    expect(条件分组.flatMap(组 => 组.fields)).toHaveLength(24)
    expect(条件分组.flatMap(组 => 组.fields)).not.toContain('shippingWarehouse')
    expect(labels).not.toContain('指定仓库SKU')
    expect(labels).not.toContain('订单运费金额范围')
    expect(labels).not.toContain('买家运费')
    expect(labels).not.toContain('订单交易额范围')
    expect(labels).not.toContain('订单金额范围')
    expect(labels).not.toContain('店铺名称')
    expect(labels).not.toContain('履约模式')
    expect(labels).not.toContain('平台订单状态')
    expect(page.find('.匹配方式').exists()).toBe(false)
    expect(page.find('[aria-label="匹配方式"]').exists()).toBe(false)
  })

  it('金额范围开两端后校验倒置，两端币种联动并保存原值，修正后不改来源', async () => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
    await 勾选条件(page, '订单总金额范围')
    const row = 条件行(page, '订单总金额范围')
    expect(row.findComponent(ConditionValue).exists()).toBe(true)
    expect(row.find('[aria-label="第2项比较方式"]').exists()).toBe(false)
    await 勾选边界(row, '第2项订单总金额范围启用下限', true)
    await 勾选边界(row, '第2项订单总金额范围启用上限', true)
    await row.get('input[aria-label="第2项订单总金额范围下限"]').setValue('20.25')
    await row.get('input[aria-label="第2项订单总金额范围上限"]').setValue('10.00')
    await 选择值(row, '第2项订单总金额范围下限币种', 'USD')
    expect(选择器(row, '第2项订单总金额范围上限币种').props('modelValue')).toBe('USD')
    await 选择值(row, '第2项订单总金额范围上限币种', 'EUR')
    expect(选择器(row, '第2项订单总金额范围下限币种').props('modelValue')).toBe('EUR')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('[role="alert"]').text()).toContain('下界不能大于上界')
    expect(JSON.stringify(来源)).toBe(来源快照)
    await row.get('input[aria-label="第2项订单总金额范围上限"]').setValue('30.50')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toHaveLength(1)
    expect(已保存(page)?.conditions.find(项 => 项.field === 'orderAmount')).toMatchObject({ operator: '介于', lowerEnabled: true, upperEnabled: true, value: '20.25', upperValue: '30.50', currency: 'EUR' })
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('范围未勾选时禁用控件，零值及严格比较可保存，取消边界保留原文与比较配置', async () => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源)
    草稿.conditions.push({ field: 'orderWeight', operator: '介于', value: '', upperValue: '', lowerEnabled: false, upperEnabled: false })
    const page = await 打开(草稿, 来源), row = 条件行(page, '订单重量（kg）')
    const 下限 = row.get<HTMLInputElement>('input[aria-label="第2项订单重量（kg）下限"]'), 上限 = row.get<HTMLInputElement>('input[aria-label="第2项订单重量（kg）上限"]')
    expect(下限.element.disabled).toBe(true)
    expect(上限.element.disabled).toBe(true)
    expect(选择器(row, '第2项订单重量（kg）下限比较方式').props('disabled')).toBe(true)
    await 勾选边界(row, '第2项订单重量（kg）启用下限', true)
    expect(下限.element.disabled).toBe(false)
    await 下限.setValue('0')
    await 选择值(row, '第2项订单重量（kg）下限比较方式', false)
    await 勾选边界(row, '第2项订单重量（kg）启用上限', true)
    await 上限.setValue('10')
    await 选择值(row, '第2项订单重量（kg）上限比较方式', false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions.find(项 => 项.field === 'orderWeight')).toMatchObject({ value: '0', upperValue: '10', lowerEnabled: true, upperEnabled: true, lowerInclusive: false, upperInclusive: false })
    await 勾选边界(row, '第2项订单重量（kg）启用下限', false)
    expect(下限.element.disabled).toBe(true)
    expect(下限.element.value).toBe('0')
    expect(选择器(row, '第2项订单重量（kg）下限比较方式').props('modelValue')).toBe(false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions.find(项 => 项.field === 'orderWeight')).toMatchObject({ value: '0', lowerEnabled: false, lowerInclusive: false, upperEnabled: true })
    await 勾选边界(row, '第2项订单重量（kg）启用下限', true)
    expect(下限.element.value).toBe('0')
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('范围至少启一端，已勾空边界给出中文提示并在填零或上限后可修正保存', async () => {
    const { 草稿, 来源 } = 准备规则()
    草稿.conditions.push({ field: 'orderAmount', operator: '介于', value: '', upperValue: '', currency: 'USD', lowerEnabled: false, upperEnabled: false })
    const page = await 打开(草稿, 来源), row = 条件行(page, '订单总金额范围')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.findAll('[role="alert"]').map(项 => 项.text()).join(' ')).toContain('至少')
    await 勾选边界(row, '第2项订单总金额范围启用下限', true)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(row.text()).toContain('请输入订单总金额范围下限')
    expect(row.get('input[aria-label="第2项订单总金额范围下限"]').attributes('aria-invalid')).toBe('true')
    await row.get('input[aria-label="第2项订单总金额范围下限"]').setValue('0')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toHaveLength(1)
    expect(已保存(page)?.conditions.find(项 => 项.field === 'orderAmount')).toMatchObject({ value: '0', lowerEnabled: true, upperEnabled: false })
    expect(row.get('input[aria-label="第2项订单总金额范围下限"]').attributes('aria-invalid')).toBe('false')
    await 勾选边界(row, '第2项订单总金额范围启用上限', true)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toHaveLength(1)
    expect(row.text()).toContain('请输入订单总金额范围上限')
    expect(row.get('input[aria-label="第2项订单总金额范围上限"]').attributes('aria-invalid')).toBe('true')
    await row.get('input[aria-label="第2项订单总金额范围上限"]').setValue('10')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toHaveLength(2)
    expect(row.text()).not.toContain('请输入订单总金额范围上限')
    expect(row.get('input[aria-label="第2项订单总金额范围上限"]').attributes('aria-invalid')).toBe('false')
  })

  it('旧范围从非空边界推断启用且默认含等号，保存回填与显式关闭不会改写来源', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.conditions.push({ field: 'orderAmount', operator: '介于', value: '0', upperValue: '50', currency: 'USD' })
    草稿.conditions = structuredClone(来源.conditions)
    const 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    let row = 条件行(page, '订单总金额范围')
    expect(边界复选框(row, '第2项订单总金额范围启用下限').element.checked).toBe(true)
    expect(边界复选框(row, '第2项订单总金额范围启用上限').element.checked).toBe(true)
    expect(选择器(row, '第2项订单总金额范围下限比较方式').props('modelValue')).toBe(true)
    expect(选择器(row, '第2项订单总金额范围上限比较方式').props('modelValue')).toBe(true)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const 初次保存 = 已保存(page)!
    page = await 打开(reactive(structuredClone(初次保存)), 来源); row = 条件行(page, '订单总金额范围')
    expect(row.get<HTMLInputElement>('input[aria-label="第2项订单总金额范围下限"]').element.value).toBe('0')
    expect(选择器(row, '第2项订单总金额范围上限币种').props('modelValue')).toBe('USD')
    await 勾选边界(row, '第2项订单总金额范围启用下限', false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const 关闭后保存 = 已保存(page)!
    expect(关闭后保存.conditions.find(项 => 项.field === 'orderAmount')).toMatchObject({ value: '0', lowerEnabled: false })
    page = await 打开(reactive(structuredClone(关闭后保存)), 来源); row = 条件行(page, '订单总金额范围')
    expect(边界复选框(row, '第2项订单总金额范围启用下限').element.checked).toBe(false)
    expect(row.get<HTMLInputElement>('input[aria-label="第2项订单总金额范围下限"]').element.disabled).toBe(true)
    expect(row.get<HTMLInputElement>('input[aria-label="第2项订单总金额范围下限"]').element.value).toBe('0')
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('九种通用范围字段统一提供两组开关比较输入，三项金额有两端币种且不重复外层比较框', async () => {
    const fields = [
      { field: 'orderWeight', name: '订单重量（kg）', money: false },
      { field: 'orderAmount', name: '订单总金额范围', money: true },
      { field: 'buyerPaidShipping', name: '客付运费范围', money: true },
      { field: 'unitPrice', name: '商品单价金额范围', money: true },
      { field: 'warehouseSkuQuantity', name: '产品数量', money: false },
      { field: 'dimensionSum', name: '三边之和', money: false },
      { field: 'longestSide', name: '最长边', money: false },
      { field: 'secondSide', name: '次长边', money: false },
      { field: 'lengthGirth', name: '长+(宽+高)×2', money: false },
    ] as const
    for (const { field, name, money } of fields) {
      页面?.unmount()
      const condition: 规则条件 = reactive({ field, operator: '介于', value: '', upperValue: '', currency: money ? 'USD' : undefined, lowerEnabled: false, upperEnabled: false })
      const page = mount(ConditionValue, { props: { condition, index: 0, options: [], validate: false }, attachTo: document.body })
      页面 = page; await 稳定()
      expect(page.findAll('input[type="checkbox"]')).toHaveLength(2)
      expect(page.get<HTMLInputElement>(`input[aria-label="第1项${name}下限"]`).element.disabled).toBe(true)
      expect(page.get<HTMLInputElement>(`input[aria-label="第1项${name}上限"]`).element.disabled).toBe(true)
      expect(page.find('[aria-label="第1项比较方式"]').exists()).toBe(false)
      expect(page.findAllComponents(ElSelect)).toHaveLength(money ? 4 : 2)
      expect(选择器(page, `第1项${name}下限比较方式`).findAllComponents(ElOption).map((项: VueWrapper) => (项.props() as { label?: string }).label)).toEqual(['大于', '大于等于'])
      expect(选择器(page, `第1项${name}上限比较方式`).findAllComponents(ElOption).map((项: VueWrapper) => (项.props() as { label?: string }).label)).toEqual(['小于', '小于等于'])
      if (money) {
        expect(选择器(page, `第1项${name}下限币种`).props('modelValue')).toBe('USD')
        expect(选择器(page, `第1项${name}上限币种`).props('modelValue')).toBe('USD')
      }
    }
  })

  it.each(['存在', '不存在'] as const)('买家留言选择%s时无需填写内容即可保存，仍保留操作符和空值', async operator => {
    const { 草稿, 来源 } = 准备规则(), page = await 打开(草稿, 来源)
    await 勾选条件(page, '买家留言')
    const row = 条件行(page, '买家留言')
    await 选择值(row, '第2项比较方式', operator)
    expect(row.get('.条件无需取值').text()).toBe('无需填写内容')
    expect(row.find('textarea[aria-label="第2项买家留言"]').exists()).toBe(false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(已保存(page)?.conditions.find(项 => 项.field === 'buyerMessage')).toMatchObject({ operator, value: '' })
  })

  it.each([
    { name: '买家留言', field: 'buyerMessage', placeholder: '每行输入一个留言关键词或完整内容', defaultOperator: '包含', operators: ['等于', '不等于', '包含', '不包含', '存在', '不存在'], content: '  Demo Message\nDEMO message  ' },
    { name: '仓库SKU', field: 'warehouseSku', placeholder: '每行输入一个仓库SKU', defaultOperator: '等于', operators: ['等于', '不等于', '包含', '不包含'], content: '  TEST-WH-A\nTEST-wh-b  ' },
    { name: '平台SKU', field: 'platformSku', placeholder: '每行输入一个平台SKU', defaultOperator: '等于', operators: ['等于', '不等于', '包含', '不包含'], content: '  TEST-PLAT-A\nTEST-plat-b  ' },
  ] as const)('$name三行输入保留大小写及换行，空白不能保存，修正后按独立配置回填', async ({ name, field, placeholder, defaultOperator, operators, content }) => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    await 勾选条件(page, name)
    const row = 条件行(page, name), 订单快照 = JSON.stringify((page.props() as { orders?: unknown }).orders)
    expect(row.find(`input[aria-label="第2项${name}"]`).exists()).toBe(false)
    const input = row.get<HTMLTextAreaElement>(`textarea[aria-label="第2项${name}"]`)
    expect(input.attributes('rows')).toBe('3')
    expect(input.attributes('placeholder')).toBe(placeholder)
    expect(row.text()).toContain('多个值换行输入；等于匹配任一完整值，包含匹配任一关键词。')
    expect(row.text()).not.toContain('不区分英文大小写')
    const selector = 选择器(row, '第2项比较方式')
    expect(selector.props('modelValue')).toBe(defaultOperator)
    const 显示操作符 = selector.findAllComponents(ElOption).map((项: VueWrapper) => (项.props() as { label?: string }).label)
    expect(显示操作符).toHaveLength(operators.length)
    expect(new Set(显示操作符)).toEqual(new Set(operators))
    await input.setValue(' \n\t\n ')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.find('[role="alert"]').exists()).toBe(true)
    await input.setValue(content)
    await 选择值(row, '第2项比较方式', '不包含')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(saved.conditions.find(项 => 项.field === field)).toMatchObject({ operator: '不包含', value: content })
    expect(JSON.stringify((page.props() as { orders?: unknown }).orders)).toBe(订单快照)
    expect(JSON.stringify(来源)).toBe(来源快照)
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(page, name).get<HTMLTextAreaElement>(`textarea[aria-label="第2项${name}"]`).element.value).toBe(content)
    expect(选择器(条件行(page, name), '第2项比较方式').props('modelValue')).toBe('不包含')
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it.each([
    { field: 'transactionAmount', name: '订单交易额范围' },
    { field: 'orderShippingAmount', name: '订单运费金额范围' },
  ] as const)('旧$name保留显示但须删除后才能保存，删除只修复草稿且不改来源', async ({ field, name }) => {
    const { 草稿, 来源 } = 准备规则()
    来源.conditions.push({ field, operator: '介于', value: '0', upperValue: '50', currency: 'USD' })
    草稿.conditions = structuredClone(来源.conditions)
    const 来源快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
    expect(page.findAll('.可选分组 .el-checkbox').map(项 => 项.text())).not.toContain(name)
    const 旧范围行 = 条件行(page, name)
    expect(旧范围行.text()).toContain('此条件已移除，请删除后保存规则。')
    expect(旧范围行.text()).toContain('0 USD')
    expect(旧范围行.text()).toContain('50 USD')
    expect(旧范围行.findComponent(ConditionValue).exists()).toBe(false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.findAll('[role="alert"]').map(项 => 项.text()).join(' ')).toContain('删除')
    expect(JSON.stringify(来源)).toBe(来源快照)
    await page.get('button[aria-label="删除第2项条件"]').trigger('click'); await 稳定()
    expect(page.findAll('.编辑条件行').map(项 => 项.get('.条件标签 strong').text())).toEqual(['订单平台'])
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(已保存(page)?.conditions).toEqual([{ field: 'platformCode', operator: '等于', value: 'eBay' }])
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('指定仓库SKU旧行只读保留，明确删除后保存且不改来源', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.conditions.push({ field: 'specifiedWarehouseSku', operator: '等于', value: 'DEMO-WH-001' })
    草稿.conditions = structuredClone(来源.conditions)
    const 快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
    const row = 条件行(page, '指定仓库SKU')
    expect(row.text()).toContain('DEMO-WH-001')
    expect(row.text()).toContain('此条件已移除')
    expect(row.findComponent(ConditionValue).exists()).toBe(false)
    expect(row.findComponent(ElSelect).exists()).toBe(false)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    await row.get('button[aria-label="删除第2项条件"]').trigger('click'); await 稳定()
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions).toHaveLength(1)
    expect(JSON.stringify(来源)).toBe(快照)
  })

  it('负责人使用可搜索的用户单选，空值拦截，保存ID并回填姓名，枚举变动即失效', async () => {
    const { 草稿, 来源 } = 准备规则(), 快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    await 勾选条件(page, '产品销售负责人')
    const row = 条件行(page, '产品销售负责人'), label = '第2项产品销售负责人'
    const selector = 选择器(row, label)
    expect(selector.props('filterable')).toBe(true)
    expect(selector.props('multiple')).toBe(false)
    expect(selector.props('allowCreate')).toBe(false)
    const 选项值 = selector.findAllComponents(ElOption).map((项: VueWrapper) => {
      const props = 项.props() as { value: string; label: string }
      return [props.value, props.label]
    })
    expect(选项值).toEqual(中台系统用户资料.value.map(项 => [项.value, 项.label]))
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    const 用户 = 中台系统用户资料.value[0]!
    await 选择值(row, label, 用户.value)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved.conditions[1]).toEqual({ field: 'salesOwner', operator: '等于', value: 用户.value })
    expect(JSON.stringify(来源)).toBe(快照)
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(选择器(条件行(page, '产品销售负责人'), label).props('modelValue')).toBe(用户.value)
    expect(条件行(page, '产品销售负责人').text()).toContain(用户.label)
    中台系统用户资料.value = 原用户资料.filter(项 => 项.value !== 用户.value); await 稳定()
    expect(选择器(条件行(page, '产品销售负责人'), label).props('modelValue')).toBeUndefined()
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('[role="alert"]').text()).toContain('重新选择')
  })

  it('旧负责人自由文本保留提示，重选用户后保存且不猜测姓名对应ID', async () => {
    const { 草稿, 来源 } = 准备规则()
    const 用户 = 中台系统用户资料.value[1]!
    草稿.conditions.push({ field: 'salesOwner', operator: '等于', value: 用户.label })
    const page = await 打开(草稿, 来源), row = 条件行(page, '产品销售负责人')
    expect(row.text()).toContain(`原值：${用户.label}`)
    expect(选择器(row, '第2项产品销售负责人').props('modelValue')).toBeUndefined()
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(草稿.conditions[1]!.value).toBe(用户.label)
    await 选择值(row, '第2项产品销售负责人', 用户.value)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions[1]!.value).toBe(用户.value)
  })

  it('产品尺寸公式和备注保存回填，新增公式行不增加外层字段', async () => {
    const { 草稿, 来源 } = 准备规则(), page = await 打开(草稿, 来源)
    await 勾选条件(page, '产品尺寸')
    const row = 条件行(page, '产品尺寸')
    expect(row.find('[aria-label="第2项比较方式"]').exists()).toBe(false)
    await row.get('input[aria-label="第2项尺寸第1条公式"]').setValue('L>')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.findAll('[role="alert"]').map(项 => 项.text()).join(' ')).toContain('公式')
    await row.get('input[aria-label="第2项尺寸第1条公式"]').setValue('L>200 and W>150')
    await row.get('input[aria-label="第2项尺寸第1条备注"]').setValue('尺寸演示备注')
    await row.get('button[aria-label="增加第1条后的尺寸公式"]').trigger('click'); await 稳定()
    await row.get('input[aria-label="第2项尺寸第2条公式"]').setValue('(L+W)*2>150')
    await 选择值(row, '第2项产品尺寸匹配方式', '匹配全部规则')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved.conditions.filter(项 => 项.field === 'productDimensions')).toHaveLength(1)
    expect(saved.conditions[1]!.dimensionRules).toMatchObject({ mode: '匹配全部规则', rows: [{ expression: 'L>200 and W>150', note: '尺寸演示备注' }, { expression: '(L+W)*2>150' }] })
    const refill = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(refill, '产品尺寸').get<HTMLInputElement>('input[aria-label="第2项尺寸第1条备注"]').element.value).toBe('尺寸演示备注')
  })

  it('材积两种计算方式独立保留输入，范围／叠加换算和多组保存回填', async () => {
    const { 草稿, 来源 } = 准备规则(), 快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
    await 勾选条件(page, '材积范围')
    const row = 条件行(page, '材积范围'), prefix = '第2项材积第1组'
    expect(row.find('[aria-label="第2项比较方式"]').exists()).toBe(false)
    await row.get(`input[aria-label="${prefix}sumProducts下限"]`).setValue('100')
    const 切方式 = row.findAllComponents(ElRadio).find((项: VueWrapper) => (项.props() as { value?: string }).value === 'stackHeight')!
    切方式.vm.$emit('update:modelValue', 'stackHeight'); await 稳定()
    expect(row.get<HTMLInputElement>(`input[aria-label="${prefix}sumProducts下限"]`).element.disabled).toBe(true)
    expect(row.get<HTMLInputElement>(`input[aria-label="${prefix}sumProducts下限"]`).element.value).toBe('100')
    await row.get(`input[aria-label="${prefix}stackHeight下限"]`).setValue('500')
    await row.get(`input[aria-label="${prefix}stackHeight上限"]`).setValue('1000')
    await 选择值(row, `${prefix}stackHeight上限比较`, false)
    await row.get(`input[aria-label="${prefix}长最小值"]`).setValue('10')
    await row.get(`input[aria-label="${prefix}长最大值"]`).setValue('30')
    const 高叠加 = row.get(`.el-checkbox[aria-label="${prefix}高叠加"]`)
    await 高叠加.get('input').setValue(true)
    const 换算 = row.get(`.el-checkbox[aria-label="${prefix}叠加换算"]`)
    await 换算.get('input').setValue(true)
    await row.get('button[aria-label="增加第1组后的材积范围"]').trigger('click'); await 稳定()
    await row.get('input[aria-label="第2项材积第2组sumProducts上限"]').setValue('2000')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved.conditions).toHaveLength(2)
    expect(saved.conditions[1]!.volumeGroups).toHaveLength(2)
    expect(saved.conditions[1]!.volumeGroups![0]).toMatchObject({ method: 'stackHeight', sumProducts: { min: '100' }, stackHeight: { min: '500', max: '1000', maxInclusive: false }, height: { stack: true }, convert: true })
    expect(JSON.stringify(来源)).toBe(快照)
    const refill = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(refill, '材积范围').get<HTMLInputElement>(`input[aria-label="${prefix}stackHeight下限"]`).element.value).toBe('500')
  })

  it.each(['productDimensions', 'volume'] as const)('旧%s保留原值且不会自动转换，重新配置后才按新控件输入', async field => {
    const { 草稿, 来源 } = 准备规则()
    草稿.conditions.push({ field, operator: field === 'volume' ? '介于' : '不等于', value: '10', widthValue: '20', heightValue: '30' })
    const page = await 打开(草稿, 来源), row = 条件行(page, field === 'volume' ? '材积范围' : '产品尺寸')
    expect(row.text()).toContain('原配置')
    expect(row.text()).toContain('10')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(草稿.conditions[1]!.value).toBe('10')
    await row.findAll('button').find(项 => 项.text() === '重新配置')!.trigger('click'); await 稳定()
    expect(row.find(field === 'volume' ? '.材积组' : '.尺寸公式行').exists()).toBe(true)
    expect(草稿.conditions[1]!.value).toBe('10')
  })

  it('旧eBay部分履约条件继续保存，遗留重复国家须复核且取消勾选删除全部实例', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }]
    草稿.conditions = structuredClone(来源.conditions)
    const 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    expect(条件行(page, '订单平台').get('.基础多选触发').text()).toBe('eBay')
    expect(条件行(page, '订单平台').getComponent(BaseMultiSelect).props('modelValue')).toEqual(['eBay'])
    expect(page.findAll('.可选分组 .el-checkbox').map(项 => 项.text())).not.toContain('平台订单状态')
    expect(选择器(条件行(page, '平台订单状态'), '第2项平台订单状态').props('modelValue')).toBe('IN_PROGRESS')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions).toEqual(来源.conditions)
    // 遗留重复配置仍需用户复核；页面不再提供创建重复字段的入口。
    草稿.conditions.push({ field: 'countryCode', operator: '等于', value: 'US' }, { field: 'countryCode', operator: '不等于', value: 'GB' })
    page = await 打开(草稿, 来源)
    expect(page.findAll('button').some(项 => 项.text() === '添加条件')).toBe(false)
    expect(page.findAll('.编辑条件行').filter(项 => 项.get('.条件标签 strong').text() === '收货国家')).toHaveLength(2)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('[role="alert"]').text()).toContain('收货国家')
    await 勾选条件(page, '收货国家', false)
    expect(page.findAll('.编辑条件行').map(项 => 项.get('.条件标签 strong').text())).toEqual(['订单平台', '平台订单状态'])
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions).toEqual(来源.conditions)
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it.each<规则类型>(['审单规则', '分仓规则', '订单标发规则'])('%s的新增和编辑均复用条件输入，保存事件不改来源且保留规则类型', async type => {
    for (const isNew of [true, false]) {
      const { 草稿, 来源 } = 准备规则(type, isNew), 来源快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
      await 勾选条件(page, '订单站点')
      const row = 条件行(page, '订单站点')
      expect(row.findComponent(ConditionValue).exists()).toBe(true)
      await 基础选择值(row, [站点选择值(测试站点资料[0]!)])
      await 按钮(page, '保存规则').trigger('click'); await 稳定()
      expect(page.find('[role="alert"]').exists()).toBe(false)
      expect(已保存(page)).toMatchObject({ type, mode: '全部满足', enabled: false })
      expect(已保存(page)?.conditions.find(项 => 项.field === 'siteCode')).toMatchObject({ operator: '等于', values: [站点选择值(测试站点资料[0]!)] })
      expect(JSON.stringify(来源)).toBe(来源快照)
    }
  })

  it('三个基础字段各只保留一条，多平台及多店铺按数组保存和回填，站点与店铺显示所属平台', async () => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    await 勾选条件(page, '订单站点')
    await 勾选条件(page, '订单店铺')
    for (const name of ['订单平台', '订单站点', '订单店铺']) {
      expect(page.findAll('.编辑条件行').filter(项 => 项.get('.条件标签 strong').text() === name)).toHaveLength(1)
      await 勾选条件(page, name, false)
      await 勾选条件(page, name)
      expect(page.findAll('.编辑条件行').filter(项 => 项.get('.条件标签 strong').text() === name)).toHaveLength(1)
    }
    expect(page.findAll('button').some(项 => 项.text() === '添加条件')).toBe(false)
    const 平台值 = ['eBay', 'Temu'], 站点值 = 测试站点资料.map(站点选择值), 店铺值 = 全渠道订单模拟数据.slice(0, 2).map(项 => 项.storeId)
    expect(条件行(page, '订单站点').getComponent(BaseMultiSelect).props('options')).toEqual([
      { value: 站点值[0], label: '[eBay].测试美国站' },
      { value: 站点值[1], label: '[Temu].测试美国站' },
    ])
    expect(条件行(page, '订单店铺').getComponent(BaseMultiSelect).props('options')).toEqual(全渠道订单模拟数据.slice(0, 2).map(项 => ({ value: 项.storeId, label: `[${项.platformCode}].${项.storeName}` })))
    await 基础选择值(条件行(page, '订单平台'), 平台值)
    await 基础选择值(条件行(page, '订单站点'), 站点值)
    await 基础选择值(条件行(page, '订单店铺'), 店铺值)
    expect(条件行(page, '订单站点').get('.基础多选触发').text()).toBe('[eBay].测试美国站、[Temu].测试美国站')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(saved.conditions).toHaveLength(3)
    expect(saved.conditions.find(项 => 项.field === 'platformCode')?.values).toEqual(平台值)
    expect(saved.conditions.find(项 => 项.field === 'siteCode')?.values).toEqual(站点值)
    expect(saved.conditions.find(项 => 项.field === 'storeId')?.values).toEqual(店铺值)
    expect(JSON.stringify(来源)).toBe(来源快照)
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(page, '订单平台').getComponent(BaseMultiSelect).props('modelValue')).toEqual(平台值)
    expect(条件行(page, '订单站点').getComponent(BaseMultiSelect).props('modelValue')).toEqual(站点值)
    expect(条件行(page, '订单店铺').getComponent(BaseMultiSelect).props('modelValue')).toEqual(店铺值)
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('已选站点在基础资料中失效时保留草稿但拒绝保存，重新选择有效站点后可保存', async () => {
    const { 草稿, 来源 } = 准备规则(), page = await 打开(草稿, 来源)
    await 勾选条件(page, '订单站点')
    const selected = 站点选择值(测试站点资料[0]!)
    await 基础选择值(条件行(page, '订单站点'), [selected])
    中台平台站点资料.value = [structuredClone(测试站点资料[1]!)]
    await 稳定()
    expect(条件行(page, '订单站点').get('.基础多选触发').text()).toContain('已失效选项')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('[role="alert"]').text()).toContain('订单站点包含已失效的选项')
    expect(草稿.conditions.find(项 => 项.field === 'siteCode')?.values).toEqual([selected])
    await 基础选择值(条件行(page, '订单站点'), [站点选择值(测试站点资料[1]!)])
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions.find(项 => 项.field === 'siteCode')?.values).toEqual([站点选择值(测试站点资料[1]!)])
  })

  it('收货国家兼容旧单值回显，多选及排除比较按values保存回填且不改来源', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.conditions.push({ field: 'countryCode', operator: '等于', value: 'US' })
    草稿.conditions = structuredClone(来源.conditions)
    const 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    const row = 条件行(page, '收货国家')
    expect(row.getComponent(BaseMultiSelect).props('modelValue')).toEqual(['US'])
    expect(row.get('.基础多选触发').text()).toContain('美国')
    await 基础选择值(row, ['US', 'GB'])
    await 选择值(row, '第2项比较方式', '不等于')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(saved.conditions.find(项 => 项.field === 'countryCode')).toMatchObject({ operator: '不等于', values: ['US', 'GB'] })
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(page, '收货国家').getComponent(BaseMultiSelect).props('modelValue')).toEqual(['US', 'GB'])
    expect(条件行(page, '收货国家').get('.基础多选触发').text()).toContain('英国')
    expect(选择器(条件行(page, '收货国家'), '第2项比较方式').props('modelValue')).toBe('不等于')
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it.each([
    { name: '订单地址', field: 'orderAddress' },
    { name: '收货省/州', field: 'stateProvince' },
    { name: '收货城市', field: 'city' },
    { name: '平台配送方式', field: 'platformShippingMethod' },
  ] as const)('$name使用多行输入，只有包含/不包含且保存原换行与回填，不重复比较控件', async ({ name, field }) => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源)
    let page = await 打开(草稿, 来源)
    await 勾选条件(page, name)
    const row = 条件行(page, name), 内容 = field === 'platformShippingMethod' ? '  Standard Shipping\n\nExpedited  ' : '  Berlin\n\nMunich  '
    const 订单快照 = JSON.stringify((page.props() as { orders?: unknown }).orders)
    expect(row.find(`input[aria-label="第2项${name}"]`).exists()).toBe(false)
    const input = row.get<HTMLTextAreaElement>(`textarea[aria-label="第2项${name}"]`)
    if (field === 'platformShippingMethod') expect(input.attributes('placeholder')).toBe('平台配送方式中的字符，多个规则换行输入')
    await input.setValue(内容)
    const 比较控件 = row.findAllComponents(ElSelect).filter((项: VueWrapper) => 项.find('[aria-label="第2项比较方式"]').exists())
    expect(比较控件).toHaveLength(1)
    expect(比较控件[0]!.findAllComponents(ElOption).map((项: VueWrapper) => (项.props() as { label?: string }).label)).toEqual(['包含', '不包含'])
    expect(比较控件[0]!.props('modelValue')).toBe('包含')
    await 选择值(row, '第2项比较方式', '不包含')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(saved.conditions.find(项 => 项.field === field)).toMatchObject({ operator: '不包含', value: 内容 })
    expect(JSON.stringify((page.props() as { orders?: unknown }).orders)).toBe(订单快照)
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(条件行(page, name).get<HTMLTextAreaElement>(`textarea[aria-label="第2项${name}"]`).element.value).toBe(内容)
    expect(选择器(条件行(page, name), '第2项比较方式').props('modelValue')).toBe('不包含')
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it.each([
    { name: '收货城市', field: 'city' },
    { name: '平台配送方式', field: 'platformShippingMethod' },
  ] as const)('$name多行只有空白时不保存，补充有效内容后可修正且不改来源', async ({ name, field }) => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源), page = await 打开(草稿, 来源)
    await 勾选条件(page, name)
    const input = 条件行(page, name).get(`textarea[aria-label="第2项${name}"]`)
    await input.setValue(' \n\t\n ')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('[role="alert"]').text()).toContain('完整条件')
    const 内容 = field === 'platformShippingMethod' ? 'Standard Shipping\nExpedited' : 'Berlin\nParis'
    await input.setValue(内容)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.conditions.find(项 => 项.field === field)).toMatchObject({ operator: '包含', value: 内容 })
    expect(JSON.stringify(来源)).toBe(来源快照)
  })

  it('非基础的文本、范围和多行字段重勾选仍各一行，均无添加条件入口', async () => {
    const { 草稿, 来源 } = 准备规则(), page = await 打开(草稿, 来源)
    for (const name of ['平台配送方式', '订单重量（kg）', '收货城市']) {
      await 勾选条件(page, name)
      expect(page.findAll('button').some(项 => 项.text() === '添加条件')).toBe(false)
      await 勾选条件(page, name, false)
      await 勾选条件(page, name)
      expect(page.findAll('.编辑条件行').filter(项 => 项.get('.条件标签 strong').text() === name)).toHaveLength(1)
      expect(page.findAll('button').some(项 => 项.text() === '添加条件')).toBe(false)
    }
    expect(page.findAll('.编辑条件行')).toHaveLength(4)
  })

  it('审单仅提供留在待审核动作，订单备注位于执行动作内且留空可保存，不扩为匹配条件', async () => {
    const { 草稿, 来源 } = 准备规则(), 来源快照 = JSON.stringify(来源), 备注快照 = JSON.stringify(共享订单备注.value), page = await 打开(草稿, 来源)
    expect(page.findAll('.动作选项 .el-radio').map(项 => 项.text())).toEqual(['留在待审核'])
    const 执行动作区 = page.findAll('.编辑分区').find(项 => 项.find('h3').text() === '执行动作')!
    expect(执行动作区.find('textarea[aria-label="订单备注"]').exists()).toBe(true)
    expect(page.findAll('.可选分组 .el-checkbox').map(项 => 项.text())).not.toContain('订单备注')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(已保存(page)?.action).toBe('留在待审核')
    expect(已保存(page)?.orderNote ?? '').toBe('')
    expect(JSON.stringify(来源)).toBe(来源快照)
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
  })

  it('订单备注独立于规则说明和买家留言，去首尾空白保存回填并只保存配置', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.note = '原规则维护说明'
    来源.conditions.push({ field: 'buyerMessage', operator: '包含', value: '请核对车型' })
    草稿.note = 来源.note; 草稿.conditions = structuredClone(来源.conditions)
    const 来源快照 = JSON.stringify(来源), 备注快照 = JSON.stringify(共享订单备注.value)
    let page = await 打开(草稿, 来源)
    await page.get('textarea[aria-label="订单备注"]').setValue('  需要人工核对\n核对后补充结果  ')
    await page.get('textarea[aria-label="规则说明"]').setValue('供团队维护的规则说明')
    expect(条件行(page, '买家留言').get<HTMLTextAreaElement>('textarea[aria-label="第2项买家留言"]').element.value).toBe('请核对车型')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const saved = 已保存(page)!
    expect(saved).toMatchObject({ action: '留在待审核', orderNote: '需要人工核对\n核对后补充结果', note: '供团队维护的规则说明' })
    expect(saved.conditions.find(项 => 项.field === 'buyerMessage')).toEqual({ field: 'buyerMessage', operator: '包含', value: '请核对车型' })
    expect(JSON.stringify(来源)).toBe(来源快照)
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
    page = await 打开(reactive(structuredClone(saved)), 来源)
    expect(page.get<HTMLTextAreaElement>('textarea[aria-label="订单备注"]').element.value).toBe('需要人工核对\n核对后补充结果')
    expect(page.get<HTMLTextAreaElement>('textarea[aria-label="规则说明"]').element.value).toBe('供团队维护的规则说明')
    expect(JSON.stringify(来源)).toBe(来源快照)
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
  })

  it('订单备注超过2000字拒绝保存，修正为2000字可保存，纯空白按空配置处理', async () => {
    const { 草稿, 来源 } = 准备规则(), 备注快照 = JSON.stringify(共享订单备注.value), page = await 打开(草稿, 来源)
    const input = page.get<HTMLTextAreaElement>('textarea[aria-label="订单备注"]')
    expect(input.attributes('maxlength')).toBe('2000')
    // 绕过浏览器输入限制，验证保存校验仍保护程序赋值或历史超长草稿。
    await input.setValue('文'.repeat(2001))
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.findAll('[role="alert"]').map(项 => 项.text()).join(' ')).toContain('2000')
    await input.setValue('文'.repeat(2000))
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.orderNote).toHaveLength(2000)
    await input.setValue(' \n\t ')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(已保存(page)?.orderNote ?? '').toBe('')
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
  })

  it('取消订单备注和规则说明修改只发取消事件，来源及实际订单备注均不变', async () => {
    const { 草稿, 来源 } = 准备规则()
    来源.orderNote = '已有订单备注配置'; 来源.note = '已有规则说明'
    草稿.orderNote = 来源.orderNote; 草稿.note = 来源.note
    const 来源快照 = JSON.stringify(来源), 备注快照 = JSON.stringify(共享订单备注.value)
    let page = await 打开(草稿, 来源)
    await page.get('textarea[aria-label="订单备注"]').setValue('未保存的新订单备注')
    await page.get('textarea[aria-label="规则说明"]').setValue('未保存的新规则说明')
    await 按钮(page, '取消').trigger('click'); await 稳定()
    expect(page.emitted('cancel')).toHaveLength(1)
    expect(page.emitted('save')).toBeUndefined()
    expect(JSON.stringify(来源)).toBe(来源快照)
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
    page = await 打开(reactive(structuredClone(来源)), 来源)
    expect(page.get<HTMLTextAreaElement>('textarea[aria-label="订单备注"]').element.value).toBe('已有订单备注配置')
    expect(page.get<HTMLTextAreaElement>('textarea[aria-label="规则说明"]').element.value).toBe('已有规则说明')
  })

  it.each<规则类型>(['分仓规则', '订单标发规则'])('%s不展示审单订单备注，保存现有动作和规则说明不产生订单备注', async type => {
    const { 草稿, 来源 } = 准备规则(type), 来源快照 = JSON.stringify(来源), 备注快照 = JSON.stringify(共享订单备注.value), page = await 打开(草稿, 来源)
    expect(page.find('textarea[aria-label="订单备注"]').exists()).toBe(false)
    await page.get('textarea[aria-label="规则说明"]').setValue('其他类型规则的维护说明')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.find('[role="alert"]').exists()).toBe(false)
    expect(已保存(page)).toMatchObject({ type, action: 来源.action, note: '其他类型规则的维护说明' })
    expect(已保存(page)?.orderNote ?? '').toBe('')
    expect(JSON.stringify(来源)).toBe(来源快照)
    expect(JSON.stringify(共享订单备注.value)).toBe(备注快照)
  })
})
