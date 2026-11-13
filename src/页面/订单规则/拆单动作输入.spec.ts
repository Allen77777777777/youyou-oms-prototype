import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElOption, ElRadioGroup, ElSelect } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import { 创建默认拆单动作 } from './拆单规则模型'
import { 拆单配置摘要 } from './拆单配置展示'
import { 校验规则配置, type 订单规则 } from './规则逻辑'
import { 读取可选条件分组 } from './规则条件定义'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

let wrapper: VueWrapper | undefined
function source(): 订单规则 {
  return { id: 'SPLIT-FORM-TEST', name: '家具商品拆分', type: '拆单规则', enabled: false, priority: 10, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: '按规则拆分包裹', splitAction: 创建默认拆单动作(), version: 1, updatedAt: '', note: '' }
}
async function open(prepare?: (rule: 订单规则) => void) {
  const original = source()
  prepare?.(original)
  const draft = reactive(structuredClone(original))
  wrapper = mount(RuleForm, { props: { draft, rules: [original], orders: structuredClone(全渠道订单模拟数据.slice(0, 1)) }, attachTo: document.body, global: { directives: { prototype: {} } } })
  await flushPromises()
  return { original, draft, wrapper }
}
async function choose(groupName: string, value: string) {
  const group = wrapper!.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === groupName)!
  await group.get(`input[type="radio"][value="${value}"]`).setValue(true)
  await flushPromises()
}
async function save() { await wrapper!.findAll('button').find(item => item.text() === '保存规则')!.trigger('click'); await flushPromises() }
function select(label: string) { return wrapper!.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === label || item.find(`[aria-label="${label}"]`).exists())! }
function saved() {
  const events = wrapper?.emitted('save')
  return events?.[events.length - 1]?.[0] as 订单规则 | undefined
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })

describe('拆单动作配置', () => {
  it('新增默认按系统 SKU，仅开放系统与平台依据和五种拆分方式', async () => {
    const { draft, wrapper } = await open()
    expect(draft.splitAction?.basis).toBe('system')
    expect(wrapper.find('[aria-label="仓库SKU映射范围"]').exists()).toBe(false)
    const basis = wrapper.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === '拆分依据')!
    expect(basis.findAll<HTMLInputElement>('input[type="radio"]').map(item => item.element.value)).toEqual(['system', 'platform'])
    await save()
    expect(saved()?.splitAction?.basis).toBe('system')
    await choose('拆分依据', 'platform')
    expect(draft.splitAction?.strategy).toBe('sku')
    const group = wrapper.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === '拆分方式')!
    expect(group.findAll<HTMLInputElement>('input[type="radio"]').map(item => item.element.value)).toEqual(['unit', 'sku', 'selected', 'selectedQty', 'capacity'])
    await save()
    expect(saved()?.splitAction).toMatchObject({ basis: 'platform', strategy: 'sku' })
    expect(wrapper.text()).not.toContain('组合商品')
  })
  it('旧仓库依据打开即提示且不预选，明确重选后保存仅清除旧范围', async () => {
    const { original, draft, wrapper } = await open(rule => {
      Object.assign(rule.splitAction!, { basis: 'warehouse', warehouseScopeId: 'OLD-WAREHOUSE-SCOPE', strategy: 'capacity', continueMatching: true })
      rule.splitAction!.limits = { maxWeightKg: '3', maxLongestDifferenceCm: '0' }
      rule.splitAction!.mixing = { mode: 'separateAttributes', attributes: ['带电'], skus: [] }
    })
    const before = JSON.stringify(original)
    expect(wrapper.get('.拆单旧依据提示').text()).toContain('请明确选择按系统 SKU 或按平台 SKU')
    expect(wrapper.find('[aria-label="仓库SKU映射范围"]').exists()).toBe(false)
    const basis = wrapper.findAllComponents(ElRadioGroup).find(item => item.attributes('aria-label') === '拆分依据')!
    expect(basis.findAll('input:checked')).toHaveLength(0)
    expect(draft.splitAction?.basis).toBe('warehouse')
    await save()
    expect(saved()).toBeUndefined()
    await choose('拆分依据', 'system')
    await save()
    expect(saved()?.splitAction).toEqual({ ...original.splitAction, basis: 'system', warehouseScopeId: undefined })
    expect(saved()?.splitAction).not.toHaveProperty('warehouseScopeId')
    expect(JSON.stringify(original)).toBe(before)
    expect(draft.splitAction?.warehouseScopeId).toBe('OLD-WAREHOUSE-SCOPE')
  })
  it('拆单旧仓库 SKU 条件保留原值供删除，移除前不能保存且不可重新勾选', async () => {
    const { original, wrapper } = await open(rule => rule.conditions.push({ field: 'warehouseSku', operator: '等于', value: 'OLD-WAREHOUSE-SKU' }))
    const oldRow = wrapper.findAll('.编辑条件行').find(item => item.text().includes('OLD-WAREHOUSE-SKU'))!
    expect(oldRow.text()).toContain('仓库 SKU 条件已从拆单规则移除，请删除后重新配置')
    expect(oldRow.find('textarea').exists()).toBe(false)
    expect(读取可选条件分组('拆单规则').flatMap(group => group.fields)).not.toContain('warehouseSku')
    await save()
    expect(saved()).toBeUndefined()
    await oldRow.get('[aria-label="删除第2项条件"]').trigger('click')
    await save()
    expect(saved()?.conditions).toEqual([original.conditions[0]])
    expect(original.conditions).toHaveLength(2)
  })
  it('仓库 SKU 仅从拆单移除；其他原有规则条件及产品数量保留', () => {
    expect(读取可选条件分组('拆单规则').flatMap(group => group.fields)).toContain('warehouseSkuQuantity')
    for (const type of ['审单规则', '合单规则', '分仓规则', '订单标发规则']) {
      expect(读取可选条件分组(type).flatMap(group => group.fields)).toContain('warehouseSku')
    }
    const rule = source()
    rule.conditions.push({ field: 'warehouseSku', operator: '等于', value: 'WH-A' })
    expect(校验规则配置(rule, [])).toContain('仓库 SKU')
    rule.type = '审单规则'; rule.action = '人工审核'; delete rule.splitAction
    expect(校验规则配置(rule, [])).toBe('')
  })
  it('指定件数配置保存去空去重的编码，保留来源规则与独立参数', async () => {
    const { original, draft, wrapper } = await open(), before = JSON.stringify(original)
    await choose('拆分依据', 'system')
    await choose('拆分方式', 'selectedQty')
    await wrapper.get('textarea[aria-label="指定系统 SKU"]').setValue('  SHELF-A  \n\nSHELF-A\nRACK-B\n')
    await wrapper.get('input[aria-label="每包最多件数"]').setValue('3')
    await save()
    expect(saved()?.splitAction).toMatchObject({ basis: 'system', strategy: 'selectedQty', quantityPerPackage: 3, selectedSkus: ['SHELF-A', 'RACK-B'] })
    expect(JSON.stringify(original)).toBe(before)
    expect(draft.splitAction?.continueMatching).toBe(false)
  })
  it('智能分包要求实际约束；开启重量后清空不能保存，关闭移除该约束', async () => {
    const { draft, wrapper } = await open()
    await choose('拆分依据', 'system')
    await choose('拆分方式', 'capacity')
    await save()
    expect(saved()).toBeUndefined()
    expect(wrapper.text()).toContain('请至少设置一项包裹限制或混装规则')
    const row = wrapper.findAll('.拆单容量输入行').find(item => item.text().includes('每包最大重量'))!
    await row.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(draft.splitAction?.limits.maxWeightKg).toBe('20')
    await wrapper.get('input[aria-label="每包最大重量"]').setValue('')
    await save()
    expect(saved()).toBeUndefined()
    await wrapper.get('input[aria-label="每包最大重量"]').setValue('3.5')
    await save()
    expect(saved()?.splitAction?.limits.maxWeightKg).toBe('3.5')
    await row.get('input[type="checkbox"]').setValue(false)
    expect(draft.splitAction?.limits.maxWeightKg).toBeUndefined()
  })
  it('删除拆单分仓配置并清除旧路由；连续匹配仍独立保存且不跳过后续审核', async () => {
    const { original, draft, wrapper } = await open(rule => { Object.assign(rule.splitAction!, { routing: { mode: 'price', candidateChannelIds: ['OLD-CHANNEL'] } }) })
    expect(original.splitAction).toHaveProperty('routing')
    expect(draft.splitAction).not.toHaveProperty('routing')
    await choose('拆分依据', 'system')
    expect(wrapper.text()).not.toContain('拆分后的分仓安排')
    expect(wrapper.find('[aria-label="拆单候选仓库渠道"]').exists()).toBe(false)
    await wrapper.get('[aria-label="继续匹配后续拆单规则"] input[type="checkbox"]').setValue(true)
    await save()
    expect(saved()?.splitAction).toMatchObject({ continueMatching: true })
    expect(saved()?.splitAction).not.toHaveProperty('routing')
    expect(wrapper.get('.拆单流程').text()).toContain('跳过合单 → 逐包分仓 → 审单 → 系统默认审单')
  })
  it('指定平台 SKU 使用已有映射的可搜索多选，旧不可用值可移除并阻止保存', async () => {
    const { draft, wrapper } = await open()
    await choose('拆分依据', 'platform')
    await choose('拆分方式', 'selected')
    const picker = select('指定平台 SKU'), knownSku = 全渠道订单模拟数据[0]!.items[0]!.platformSku!
    expect(picker.props()).toMatchObject({ multiple: true, filterable: true, allowCreate: false })
    expect(picker.findAllComponents(ElOption).some(item => item.props('value') === knownSku)).toBe(true)
    expect(wrapper.find('textarea[aria-label="指定平台 SKU"]').exists()).toBe(false)
    draft.splitAction!.selectedSkus = ['SKU-NOT-AVAILABLE']
    await flushPromises()
    expect(picker.findAllComponents(ElOption).find(item => item.props('value') === 'SKU-NOT-AVAILABLE')?.props()).toMatchObject({ disabled: true, label: 'SKU-NOT-AVAILABLE（已不可用）' })
    await save()
    expect(saved()).toBeUndefined()
    expect(wrapper.text()).toContain('已选平台 SKU 中包含不可用资料')
    await wrapper.findAll('button').find(item => item.text() === '移除不可用 SKU')!.trigger('click')
    expect(draft.splitAction!.selectedSkus).toEqual([])
    picker.vm.$emit('update:modelValue', [knownSku])
    await flushPromises()
    await save()
    expect(saved()?.splitAction?.selectedSkus).toEqual([knownSku])
    await choose('拆分方式', 'selectedQty')
    expect(select('指定平台 SKU').props('allowCreate')).toBe(false)
    await save()
    expect(saved()?.splitAction).toMatchObject({ strategy: 'selectedQty', selectedSkus: [knownSku] })
  })
  it('平台 SKU 智能混装共用受控选项，已失效的混装选择不能保存', async () => {
    const { draft, wrapper } = await open()
    await choose('拆分依据', 'platform')
    await choose('拆分方式', 'capacity')
    draft.splitAction!.mixing.mode = 'togetherSelected'
    await flushPromises()
    const picker = select('混装指定平台 SKU'), knownSku = 全渠道订单模拟数据[0]!.items[0]!.platformSku!
    expect(picker.props()).toMatchObject({ multiple: true, filterable: true, allowCreate: false })
    picker.vm.$emit('update:modelValue', [knownSku])
    await flushPromises()
    await save()
    expect(saved()?.splitAction?.mixing.skus).toEqual([knownSku])
    const savedCount = wrapper.emitted('save')!.length
    draft.splitAction!.mixing.skus = ['MISSING-SKU']
    await save()
    expect(wrapper.emitted('save')!.length).toBe(savedCount)
    expect(wrapper.text()).toContain('已选平台 SKU 中包含不可用资料')
  })
  it('旧每行或大件拆法必须重新选择，不能静默迁移', async () => {
    const { draft, wrapper } = await open(rule => { Object.assign(rule.splitAction!, { basis: 'system', strategy: 'line' }) })
    expect(wrapper.text()).toContain('已移除，请重新选择拆分方式')
    await save()
    expect(saved()).toBeUndefined()
    expect(draft.splitAction!.strategy).toBe('line')
    await choose('拆分方式', 'unit')
    await save()
    expect(saved()?.splitAction?.strategy).toBe('unit')
  })
  it('详情及日志摘要包含智能限制与混装参数，隐藏参数不参与摘要', () => {
    const action = 创建默认拆单动作()
    action.basis = 'system'; action.strategy = 'capacity'
    action.limits = { maxQuantity: 3, maxAmount: '100', currency: 'USD', maxLongestDifferenceCm: '0' }
    action.mixing = { mode: 'togetherSelected', skus: ['A', 'B'], attributes: [] }
    const text = 拆单配置摘要(action, []).join('；')
    expect(text).toContain('每包件数 ≤ 3')
    expect(text).toContain('100 USD')
    expect(text).toContain('最长边差 ≤ 0 cm')
    expect(text).toContain('A、B 必须同包')
    action.strategy = 'unit'
    expect(拆单配置摘要(action, []).join('；')).not.toContain('100 USD')
  })
})
