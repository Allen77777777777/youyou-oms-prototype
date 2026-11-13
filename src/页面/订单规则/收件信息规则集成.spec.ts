import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElCheckbox, ElSelect } from 'element-plus'
import BaseMultiSelect from './基础条件多选.vue'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 创建发货仓库选项 } from './规则仓库条件'
import { 创建物流渠道选项 } from './规则渠道条件'
import RuleForm from './规则编辑表单.vue'
import RecipientSimulation from './收件信息规则试算.vue'
import { 创建默认收件信息动作, type 收件信息动作配置 } from './收件信息规则模型'
import { 试算规则, 校验规则配置, type 订单规则, type 规则条件 } from './规则逻辑'
import { 读取可选条件分组 } from './规则条件定义'
import { 创建规则草稿, 丢弃规则草稿, 读取规则草稿 } from './规则编辑会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import type { 全渠道订单 } from '../全渠道订单/类型'

let page: VueWrapper | undefined
const sessions: string[] = []
afterEach(() => { page?.unmount(); page = undefined; sessions.splice(0).forEach(丢弃规则草稿); document.body.innerHTML = '' })
const mountOptions = { attachTo: document.body, global: { directives: { prototype: {} } } }
const drawerStub = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
function order(): 全渠道订单 {
  const result = JSON.parse(JSON.stringify(全渠道订单模拟数据[0])) as 全渠道订单
  result.fulfillmentMode = '自配送'; result.processingStatus = undefined; result.defaultRoute = undefined; result.items = []
  result.address = { fullName: '样例收件人', countryCode: 'US', addressLine1: '128 Example Lane', city: 'Example City' }
  delete result.recipientProcessing
  return result
}
function rule(id: string, priority = 10, conditions: 规则条件[] = [{ field: 'countryCode', operator: '等于', value: 'US' }]): 订单规则 {
  return { id, name: `收件配置-${id}`, type: '收件信息规则', enabled: true, priority, mode: '全部满足', conditions, action: '门牌号解析', recipientAction: 创建默认收件信息动作(), version: 1, updatedAt: '2026-11-13 10:00:00 UTC+8', note: '' }
}

describe('收件规则与公共规则框架集成', () => {
  it('高优先级否定条件缺少资料时不把未知视作不包含，不降级后续规则', () => {
    const source = order()
    const high = rule('HIGH', 1, [{ field: 'stateProvince', operator: '不包含', value: 'Example State' }])
    const low = rule('LOW', 10)
    const before = JSON.stringify({ source, high, low })
    const result = 试算规则([low, high], source, '收件信息规则')
    expect(result.hit).toBeUndefined()
    expect(result.blockedRule?.rule.id).toBe('HIGH')
    expect(result.blockedRule?.pending).toBe(true)
    expect(result.gates).toEqual([])
    expect(JSON.stringify({ source, high, low })).toBe(before)
  })

  it('坏配置可被可靠AND条件明确排除范围时不阻断后续规则', () => {
    const high = rule('OUTSIDE', 1, [{ field: 'countryCode', operator: '等于', value: 'DE' }, { field: 'city', operator: '包含', value: 'Unknown City' }])
    high.recipientAction = undefined
    const low = rule('LOW', 10)
    const result = 试算规则([high, low], order(), '收件信息规则')
    expect(result.trace[0]?.configError).toBeTruthy()
    expect(result.trace[0]?.configBlocks).toBe(false)
    expect(result.hit?.id).toBe('LOW')
    expect(result.blockedRule).toBeUndefined()
  })

  it('范围不能排除的坏配置阻断，停用后才允许后续命中', () => {
    const high = rule('BAD', 1)
    high.recipientAction = undefined
    const low = rule('LOW', 10)
    expect(试算规则([high, low], order(), '收件信息规则').blockedRule?.rule.id).toBe('BAD')
    high.enabled = false
    expect(试算规则([high, low], order(), '收件信息规则').hit?.id).toBe('LOW')
  })

  it('只有旧position的配置不能保存，也不能静默成为有效命中', async () => {
    const legacy = rule('LEGACY')
    legacy.recipientAction = { sourceOrder: 'address1', position: 'first', tokenMode: 'alphanumeric', addressMode: 'keep' } as unknown as 收件信息动作配置
    const result = 试算规则([legacy], order(), '收件信息规则')
    expect(result.hit).toBeUndefined()
    expect(result.blockedRule?.configError).toContain('请选择有效的门牌号解析方式')
    page = mount(RuleForm, { props: { draft: legacy, rules: [legacy], orders: [order()] }, ...mountOptions })
    await page.findAll('button').find(button => button.text() === '保存规则')!.trigger('click')
    await flushPromises()
    expect(page.emitted('save')).toBeUndefined()
    expect(page.text()).toContain('请选择有效的门牌号解析方式')
    expect(legacy.recipientAction.method).toBeUndefined()
  })

  it('条件目录增加发货仓库及物流渠道，其他商品等条件仍不开放', () => {
    expect(读取可选条件分组('收件信息规则').flatMap(group => group.fields)).toEqual(['platformCode', 'storeId', 'countryCode', 'stateProvince', 'city', 'orderAddress', 'shippingWarehouse', 'shippingChannel'])
    const disallowed: 规则条件[] = [
      { field: 'warehouseSku', operator: '包含', value: 'SKU-1' },
      { field: 'platformShippingMethod', operator: '包含', value: '配送方式' },
      { field: 'siteCode', operator: '等于', value: 'EBAY_US' },
    ]
    for (const condition of disallowed) {
      const config = rule(`FORBIDDEN-${condition.field}`, 10, [condition])
      expect(校验规则配置(config, [config])).toContain('收件信息规则仅支持')
    }
  })

  it('同优先级按既有顺序选择首条，命中规则快照不引用当前配置', () => {
    const first = rule('FIRST'), second = rule('SECOND')
    const result = 试算规则([first, second], order(), '收件信息规则')
    expect(result.hit?.id).toBe('FIRST')
    first.recipientAction!.method = 'lastNumber'
    expect(result.hit?.recipientAction?.method).toBe('firstNumber')
    expect(试算规则([second, first], order(), '收件信息规则').hit?.id).toBe('SECOND')
  })

  it('表单勾选仓库与渠道后要求选值，保存多选并回填，移除不影响门牌设置', async () => {
    const draft = reactive(rule('ROUTE-FORM'))
    const actionBefore = JSON.stringify(draft.recipientAction)
    page = mount(RuleForm, { props: { draft, rules: [], orders: [order()] }, ...mountOptions })
    for (const label of ['发货仓库', '物流渠道']) {
      const checkbox = page.findAllComponents(ElCheckbox).find(item => item.text() === label)!
      checkbox.vm.$emit('change', true)
      await flushPromises()
    }
    await page.findAll('button').find(button => button.text() === '保存规则')!.trigger('click')
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('.校验错误').text()).toContain('发货仓库')
    const warehouseValues = 创建发货仓库选项(渠道会话.value).slice(0, 2).map(item => item.value)
    const channelValues = 创建物流渠道选项(渠道会话.value).slice(0, 2).map(item => item.value)
    for (const [label, values] of [['发货仓库', warehouseValues], ['物流渠道', channelValues]] as const) {
      const row = page.findAll('.编辑条件行').find(item => item.get('.条件标签 strong').text() === label)!
      expect(row.getComponent(BaseMultiSelect).props('options').length).toBeGreaterThan(0)
      row.getComponent(BaseMultiSelect).vm.$emit('update:modelValue', values)
    }
    await flushPromises()
    await page.findAll('button').find(button => button.text() === '保存规则')!.trigger('click')
    const saved = page.emitted('save')?.[0]?.[0] as 订单规则
    expect(saved.conditions.find(item => item.field === 'shippingWarehouse')?.values).toEqual(warehouseValues)
    expect(saved.conditions.find(item => item.field === 'shippingChannel')?.values).toEqual(channelValues)
    page.unmount()
    page = mount(RuleForm, { props: { draft: reactive(saved), rules: [], orders: [order()] }, ...mountOptions })
    const channelRow = page.findAll('.编辑条件行').find(item => item.get('.条件标签 strong').text() === '物流渠道')!
    expect(channelRow.getComponent(BaseMultiSelect).props('modelValue')).toEqual(channelValues)
    await channelRow.get('button[aria-label="删除第3项条件"]').trigger('click')
    expect(saved.conditions.some(item => item.field === 'shippingChannel')).toBe(false)
    expect(JSON.stringify(saved.recipientAction)).toBe(actionBefore)
  })

  it('新建与复制草稿相互隔离，保存发出独立配置且不更改来源或订单', async () => {
    const source = rule('SOURCE'), orders = [order()]
    const sourceBefore = JSON.stringify(source), ordersBefore = JSON.stringify(orders)
    const fresh = 创建规则草稿('收件信息规则', [source])!
    const copy = 创建规则草稿('收件信息规则', [source], 'copy', source)!
    sessions.push(fresh.key, copy.key)
    expect(fresh.draft.enabled).toBe(false)
    expect(copy.draft.enabled).toBe(false)
    expect(copy.id).not.toBe(fresh.id)
    copy.draft.recipientAction!.method = 'lastNumber'
    expect(fresh.draft.recipientAction!.method).toBe('firstNumber')
    expect(读取规则草稿('copy', copy.id)).toBe(copy)
    page = mount(RuleForm, { props: { draft: copy.draft, rules: [source], orders }, ...mountOptions })
    await page.findAll('button').find(button => button.text() === '保存规则')!.trigger('click')
    await flushPromises()
    const saved = page.emitted('save')?.[0]?.[0] as 订单规则
    expect(saved?.recipientAction?.method).toBe('lastNumber')
    expect(saved.recipientAction).not.toBe(copy.draft.recipientAction)
    saved.recipientAction!.method = 'firstNumber'
    expect(copy.draft.recipientAction!.method).toBe('lastNumber')
    expect(JSON.stringify(source)).toBe(sourceBefore)
    expect(JSON.stringify(orders)).toBe(ordersBefore)
    丢弃规则草稿(copy.key)
    expect(读取规则草稿('copy', copy.id)).toBeUndefined()
    expect(读取规则草稿('new', fresh.id)).toBe(fresh)
  })

  it('规则试算展示前后值及匹配轨迹，规则变化后隐藏旧结果，订单始终不写入', async () => {
    const rules = reactive([rule('PREVIEW')]), orders = reactive([order()])
    orders[0]!.address.addressLine1 = 'Example Lane 128'
    const before = JSON.stringify(orders)
    page = mount(RecipientSimulation, { props: { modelValue: false, rules, orders }, ...mountOptions, global: { directives: { prototype: {} }, stubs: { ElDrawer: drawerStub } } })
    await page.setProps({ modelValue: true }); await flushPromises()
    expect(page.findComponent(ElSelect).props('modelValue')).toBe(orders[0]!.systemOrderNo)
    await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
    expect(page.find('.结果对照').exists()).toBe(true)
    expect(page.text()).toContain('首条命中')
    expect(page.text()).toContain('已解析')
    expect(JSON.stringify(orders)).toBe(before)
    rules[0]!.recipientAction!.method = 'leadingNumber'; rules[0]!.version++
    await flushPromises()
    expect(page.text()).toContain('规则、订单或请求场景已变化，请重新试算')
    expect(page.find('.结果对照').exists()).toBe(false)
    await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
    expect(page.text()).toContain('未识别')
    expect(JSON.stringify(orders)).toBe(before)
    expect(orders[0]!.recipientProcessing).toBeUndefined()
  })

  it('规则试算显式指定请求渠道，不借用订单默认路由，场景和渠道变更使结果过期', async () => {
    const original = 渠道会话.value
    try {
      const custom = { ...original[0]!, id: 'RECIPIENT-PREVIEW-CHANNEL', warehouseId: 'RECIPIENT-PREVIEW-WAREHOUSE' }
      渠道会话.value = [custom]
      const candidate = rule('CURRENT-CHANNEL', 1, [{ field: 'shippingChannel', operator: '等于', value: '', values: [创建物流渠道选项([custom])[0]!.value] }])
      const source = reactive(order())
      page = mount(RecipientSimulation, { props: { modelValue: false, rules: [candidate], orders: [source] }, ...mountOptions, global: { directives: { prototype: {} }, stubs: { ElDrawer: drawerStub } } })
      await page.setProps({ modelValue: true }); await flushPromises()
      await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
      expect(page.text()).toContain('条件资料待核实：物流渠道')
      source.defaultRoute = { warehouse: custom.warehouse, warehouseProvider: custom.provider, warehouseAccount: custom.account, shippingChannel: custom.name, shippingChannelCode: custom.code, shippingChannelId: custom.id, labelMode: '仓配一体' }
      await flushPromises()
      await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
      expect(page.text()).toContain('条件资料待核实：物流渠道')
      const selects = page.findAllComponents(ElSelect)
      selects.find(item => item.props('ariaLabel') === '收件信息请求渠道')!.vm.$emit('update:modelValue', 创建物流渠道选项([custom])[0]!.value)
      await flushPromises()
      await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
      expect(page.text()).toContain('首条命中')
      expect(page.find('.结果对照').exists()).toBe(true)
      selects.find(item => item.props('ariaLabel') === '收件信息处理场景')!.vm.$emit('update:modelValue', 'freight_quote')
      await flushPromises()
      expect(page.text()).toContain('规则、订单或请求场景已变化，请重新试算')
      expect(page.text()).toContain('本次候选渠道')
      await page.findAll('button').find(button => button.text() === '开始试算')!.trigger('click')
      expect(page.text()).toContain('首条命中')
      渠道会话.value = []
      await flushPromises()
      expect(page.text()).toContain('规则、订单或请求场景已变化，请重新试算')
      expect(page.find('.结果对照').exists()).toBe(false)
      expect(source.recipientProcessing).toBeUndefined()
      expect(source.recipientRequestRecords).toBeUndefined()
    } finally { 渠道会话.value = original }
  })
})
