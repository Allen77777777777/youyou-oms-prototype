import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick, reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import BaseMultiSelect from './基础条件多选.vue'
import { 创建规则样例, type 订单规则 } from './规则逻辑'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 创建渠道配置样例 } from '../仓配管理/物流渠道配置'

// 只替换定位浮层，真实搜索、勾选草稿、确认事件及规则表单仍参与交互。
const 多选浮层桩 = defineComponent({
  props: { visible: Boolean }, emits: ['update:visible'],
  template: '<div><span @click="$emit(\'update:visible\', !visible)"><slot name="reference" /></span><div v-if="visible"><slot /></div></div>',
})
const 原渠道资料 = 渠道会话.value
const 仓库甲 = ['TEST-PROVIDER-A', 'TEST-ACCOUNT-A', 'TEST-WAREHOUSE-A']
const 仓库乙 = ['TEST-PROVIDER-B', 'TEST-ACCOUNT-B', 'TEST-WAREHOUSE-B']
const 仓库丙 = ['TEST-PROVIDER-A', 'TEST-ACCOUNT-A', 'TEST-WAREHOUSE-C']
const 仓库甲值 = JSON.stringify(仓库甲), 仓库乙值 = JSON.stringify(仓库乙), 仓库丙值 = JSON.stringify(仓库丙)
let 页面: VueWrapper | undefined

async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
function 创建测试渠道() {
  const base = 创建渠道配置样例()[0]!
  return [
    { ...base, id: 'TEST-CHANNEL-A1', code: 'TEST-A1', providerId: 仓库甲[0]!, accountId: 仓库甲[1]!, warehouseId: 仓库甲[2]!, provider: '演示服务商甲', account: '演示账号甲', warehouse: '同名演示仓', enabled: true, labelMode: '仓库回传' as const },
    { ...base, id: 'TEST-CHANNEL-A2', code: 'TEST-A2', providerId: 仓库甲[0]!, accountId: 仓库甲[1]!, warehouseId: 仓库甲[2]!, provider: '演示服务商甲', account: '演示账号甲', warehouse: '同名演示仓', enabled: true, labelMode: '仓库回传' as const },
    { ...base, id: 'TEST-CHANNEL-B', code: 'TEST-B', providerId: 仓库乙[0]!, accountId: 仓库乙[1]!, warehouseId: 仓库乙[2]!, provider: '演示服务商乙', account: '演示账号乙', warehouse: '同名演示仓', enabled: true, labelMode: '仓库回传' as const },
    { ...base, id: 'TEST-CHANNEL-C', code: 'TEST-C', providerId: 仓库丙[0]!, accountId: 仓库丙[1]!, warehouseId: 仓库丙[2]!, provider: '演示服务商甲', account: '演示账号甲', warehouse: '其他演示仓', enabled: true, labelMode: '仓库回传' as const },
  ]
}
function 准备规则(type: '审单规则' | '订单标发规则') {
  const source = 创建规则样例().find(rule => rule.type === type)!
  source.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
  const draft = reactive(structuredClone(source)); draft.enabled = false
  return { source, draft }
}
async function 打开(draft: 订单规则, source: 订单规则) {
  页面?.unmount()
  页面 = mount(RuleForm, { props: { draft, rules: [source], orders: structuredClone(全渠道订单模拟数据.slice(0, 2)) }, attachTo: document.body, global: { stubs: { ElPopover: 多选浮层桩 }, directives: { prototype: {} } } })
  await 稳定(); return 页面
}
function 按钮(container: Pick<VueWrapper, 'findAll'>, label: string) {
  const button = container.findAll('button').find(item => item.text() === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  return button
}
async function 添加仓库(page: VueWrapper) {
  const checkbox = page.findAll('.可选分组 .el-checkbox').find(item => item.text() === '发货仓库')!
  await checkbox.get('input[type="checkbox"]').setValue(true); await 稳定()
  return page.findAll('.编辑条件行').find(item => item.get('.条件标签 strong').text() === '发货仓库')!
}
async function 保存(page: VueWrapper) { await 按钮(page, '保存规则').trigger('click'); await 稳定() }
function 已保存(page: VueWrapper) { const events = page.emitted('save'); return events?.[events.length - 1]?.[0] as 订单规则 | undefined }

beforeEach(() => { 渠道会话.value = 创建测试渠道() })
afterEach(() => { 页面?.unmount(); 页面 = undefined; 渠道会话.value = 原渠道资料; document.body.innerHTML = '' })

describe('发货仓库条件与真实规则表单', () => {
  it.each(['审单规则', '订单标发规则'] as const)('%s空选拦截，保存多仓否定条件、回填及删除均不修改源规则', async type => {
    const { source, draft } = 准备规则(type), before = JSON.stringify(source), channelsBefore = JSON.stringify(渠道会话.value)
    const page = await 打开(draft, source), row = await 添加仓库(page), multi = row.getComponent(BaseMultiSelect)
    const options = multi.props('options')
    expect(options.map(item => item.value).sort()).toEqual([仓库甲值, 仓库乙值, 仓库丙值].sort())
    expect(options.filter(item => item.label.includes('同名演示仓'))).toHaveLength(2)
    expect(row.getComponent(ElSelect).findAllComponents(ElOption).map(item => item.props('value'))).toEqual(['等于', '不等于'])
    await 保存(page)
    expect(page.emitted('save')).toBeUndefined()
    expect(page.get('.校验错误').text()).toContain('发货仓库')
    multi.vm.$emit('update:modelValue', [仓库甲值, 仓库乙值]); await 稳定()
    row.getComponent(ElSelect).vm.$emit('update:modelValue', '不等于'); await 稳定(); await 保存(page)
    const saved = 已保存(page)!, condition = saved.conditions.find(item => item.field === 'shippingWarehouse')!
    expect(condition).toMatchObject({ field: 'shippingWarehouse', operator: '不等于', values: [仓库甲值, 仓库乙值] })
    expect(condition.values!.map(value => JSON.parse(value))).toEqual([仓库甲, 仓库乙])
    expect(condition.values!.join('')).not.toContain('同名演示仓')
    const refill = await 打开(reactive(structuredClone(saved)), source)
    const restored = refill.findAll('.编辑条件行').find(item => item.get('.条件标签 strong').text() === '发货仓库')!
    expect(restored.getComponent(ElSelect).props('modelValue')).toBe('不等于')
    expect(restored.getComponent(BaseMultiSelect).props('modelValue')).toEqual([仓库甲值, 仓库乙值])
    await restored.get('button[aria-label="删除第2项条件"]').trigger('click'); await 稳定(); await 保存(refill)
    expect(已保存(refill)?.conditions.some(item => item.field === 'shippingWarehouse')).toBe(false)
    expect(refill.findAll('.编辑条件行').map(item => item.get('.条件标签 strong').text())).not.toContain('发货仓库')
    expect(JSON.stringify(source)).toBe(before)
    expect(JSON.stringify(渠道会话.value)).toBe(channelsBefore)
  })

  it('仓库搜索全选只作用于当前结果，取消不提交，确定按稳定三元组保存多仓', async () => {
    const { source, draft } = 准备规则('审单规则'), before = JSON.stringify(source)
    const page = await 打开(draft, source), row = await 添加仓库(page), multi = row.getComponent(BaseMultiSelect)
    const trigger = multi.get('.基础多选触发')
    await trigger.trigger('click'); await 稳定()
    await multi.get('input[aria-label="搜索第2项发货仓库"]').setValue('同名演示仓'); await 稳定()
    expect(multi.findAll('.基础选项行')).toHaveLength(2)
    await multi.get('.基础全选栏 input[type="checkbox"]').setValue(true); await 稳定()
    expect(draft.conditions[1]!.values).toEqual([])
    await 按钮(multi, '取消').trigger('click'); await 稳定()
    expect(draft.conditions[1]!.values).toEqual([])
    await trigger.trigger('click'); await 稳定()
    await multi.get('input[aria-label="搜索第2项发货仓库"]').setValue('同名演示仓'); await 稳定()
    expect(multi.findAll<HTMLInputElement>('.基础选项行 input[type="checkbox"]').every(item => !item.element.checked)).toBe(true)
    await multi.get('.基础全选栏 input[type="checkbox"]').setValue(true); await 稳定()
    await 按钮(multi, '确定').trigger('click'); await 稳定(); await 保存(page)
    expect(已保存(page)?.conditions.find(item => item.field === 'shippingWarehouse')).toMatchObject({ operator: '等于', values: [仓库甲值, 仓库乙值] })
    expect(draft.conditions[1]!.values).not.toContain(仓库丙值)
    expect(JSON.stringify(source)).toBe(before)
  })
})
