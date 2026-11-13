import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { 创建拆单演示订单, 创建拆单演示资料 } from './拆单演示资料'
import { 创建默认拆单动作, 计算拆单, type 拆单规则输入, type 拆单轨迹 } from './拆单规则模型'
import { 构建拆单包裹编号, 格式化拆单包裹流向, 分组拆单轨迹 } from './拆单轨迹展示'
import SplitTrace from './拆单执行轨迹.vue'

function entry(overrides: Partial<拆单轨迹> = {}): 拆单轨迹 {
  return { ruleId: 'R1', ruleName: '按 SKU 拆分', priority: 10, version: 1, packageKey: 'root-private-id', status: '命中', beforeCount: 1, afterCount: 2, detail: '分为两包', outputPackageKeys: ['a-private-id', 'b-private-id'], ...overrides }
}

describe('拆单轨迹与最终包裹的可读编号', () => {
  it('连续规则记录真实父子身份，按父包编号后能对应最终包卡且不改变来源数量', () => {
    const order = 创建拆单演示订单()[0]!, data = 创建拆单演示资料([order])
    const original = JSON.stringify({ order, data })
    const first: 拆单规则输入 = { id: 'R1', name: '按 SKU 拆分', priority: 10, version: 1, enabled: true, splitAction: { ...创建默认拆单动作(), basis: 'system', strategy: 'sku', continueMatching: true } }
    const second: 拆单规则输入 = { ...first, id: 'R2', name: '每件拆分', priority: 20, splitAction: { ...first.splitAction!, strategy: 'unit', continueMatching: false } }
    const result = 计算拆单(order, [first, second], data, (rule, _source, items) => rule.id === 'R1' || items.reduce((total, item) => total + item.quantity, 0) > 2)
    expect(result.errors).toEqual([])
    const numbers = 构建拆单包裹编号(result.trace, result.packages)
    expect(result.trace[0]!.outputPackageKeys).toEqual(['P2', 'P3'])
    expect(result.trace[2]!.packageKey).toBe('P3')
    expect(result.trace[2]!.outputPackageKeys).toEqual(['P4', 'P5', 'P6'])
    expect(result.packages.map(pack => numbers.get(pack.key))).toEqual(['1-1', '1-2-1', '1-2-2', '1-2-3'])
    expect(格式化拆单包裹流向(result.trace[2]!, numbers)).toBe('包裹 1-2 → 包裹 1-2-1、包裹 1-2-2、包裹 1-2-3')
    expect(result.packages.map(pack => pack.quantity)).toEqual([2, 1, 1, 1])
    expect(JSON.stringify({ order, data })).toBe(original)
  })

  it('命中但不继续拆时沿用包编号，旧记录不猜子包关系或显示内部身份', () => {
    const first = entry(), unchanged = entry({ ruleId: 'R2', packageKey: 'a-private-id', afterCount: 1, outputPackageKeys: ['a-private-id'] })
    const numbers = 构建拆单包裹编号([first, unchanged])
    expect(格式化拆单包裹流向(unchanged, numbers)).toBe('包裹 1-1 · 保持一包')
    const legacy = entry({ outputPackageKeys: undefined })
    const legacyNumbers = 构建拆单包裹编号([legacy], [{ key: 'a-private-id' }, { key: 'b-private-id' }])
    expect(格式化拆单包裹流向(legacy, legacyNumbers)).toBe('包裹 1 → 2 个包裹')
    expect([...legacyNumbers.values()].every(value => !value.includes('private-id'))).toBe(true)
    expect(new Set(legacyNumbers.values()).size).toBe(legacyNumbers.size)
  })

  it('关键轨迹保留原执行顺序，未命中与跳过记录集中折叠', () => {
    const trace = [entry({ status: '停用', packageKey: '—', outputPackageKeys: undefined }), entry(), entry({ status: '未命中', outputPackageKeys: undefined }), entry({ status: '资料待核实', outputPackageKeys: undefined }), entry({ status: '失败', outputPackageKeys: undefined })]
    expect(分组拆单轨迹(trace).important.map(row => row.index)).toEqual([1, 3, 4])
    expect(分组拆单轨迹(trace).other.map(row => row.index)).toEqual([0, 2])
    const numbers = 构建拆单包裹编号(trace)
    expect(格式化拆单包裹流向(trace[3]!, numbers)).toContain('本步未生成新包裹')
    expect(格式化拆单包裹流向(trace[0]!, numbers)).toBe('不参与匹配')
  })
})

describe('拆单执行轨迹的默认呈现', () => {
  it('一条命中加十条未继续不会淹没结论，重新试算恢复默认折叠', async () => {
    const trace = [entry(), ...Array.from({ length: 10 }, (_, index) => entry({ ruleId: `SKIP-${index}`, ruleName: `后续规则 ${index + 1}`, packageKey: index % 2 ? 'a-private-id' : 'b-private-id', status: '未继续匹配', afterCount: 1, outputPackageKeys: undefined, detail: '前序命中规则已设置停止匹配' }))]
    const wrapper = mount(SplitTrace, { props: { trace, packages: [{ key: 'a-private-id' }, { key: 'b-private-id' }] }, global: { directives: { prototype: {} } } })
    try {
      expect(wrapper.findAll('.关键轨迹 .轨迹记录')).toHaveLength(1)
      expect(wrapper.get('details summary').text()).toContain('查看其他 10 条记录')
      expect(wrapper.get('details summary').text()).toContain('未继续匹配 10 条')
      expect(wrapper.get('details').attributes('open')).toBeUndefined()
      expect(wrapper.get('.关键轨迹 .包裹流向').text()).toBe('包裹 1 → 包裹 1-1、包裹 1-2')
      expect(wrapper.text()).not.toContain('private-id')
      const details = wrapper.get('details').element as HTMLDetailsElement
      details.open = true
      await wrapper.setProps({ trace: trace.map(row => ({ ...row })) })
      expect(wrapper.get('details').attributes('open')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it('失败和待核实始终直接可见，无关键记录时说明可以展开查看', () => {
    const wrapper = mount(SplitTrace, { props: { trace: [entry({ status: '失败', detail: '单件超过重量上限', outputPackageKeys: undefined }), entry({ status: '资料待核实', detail: '缺少重量', outputPackageKeys: undefined })] }, global: { directives: { prototype: {} } } })
    try {
      expect(wrapper.findAll('.关键轨迹 .阻断轨迹')).toHaveLength(2)
      expect(wrapper.text()).toContain('单件超过重量上限')
      expect(wrapper.text()).toContain('缺少重量')
      expect(wrapper.find('details').exists()).toBe(false)
    } finally { wrapper.unmount() }
    const skipped = mount(SplitTrace, { props: { trace: [entry({ status: '未命中', outputPackageKeys: undefined })] }, global: { directives: { prototype: {} } } })
    try { expect(skipped.get('.轨迹空提示').text()).toContain('可展开查看未命中或跳过原因') } finally { skipped.unmount() }
  })
})
