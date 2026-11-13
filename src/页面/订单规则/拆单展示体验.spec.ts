import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import SplitExample from './拆单方式示例.vue'
import SplitAction from './拆单动作输入.vue'
import SplitSummary from './拆单动作摘要.vue'
import { 创建默认拆单动作 } from './拆单规则模型'
import { 拆单列表摘要, 拆单配置摘要 } from './拆单配置展示'
import type { 订单规则 } from './规则逻辑'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })

describe('拆单动作可读摘要', () => {
  it('旧仓库依据在列表和详情明确要求重选，不展示已移除的映射范围', () => {
    const action = 创建默认拆单动作()
    Object.assign(action, { basis: 'warehouse', warehouseScopeId: 'OLD-WAREHOUSE-SCOPE' })
    expect(拆单列表摘要(action)).toEqual(['原仓库 SKU 拆分依据已移除', '请重新选择系统 SKU 或平台 SKU'])
    expect(拆单配置摘要(action, []).join('；')).toContain('请重新选择按系统 SKU 或按平台 SKU')
    expect(拆单配置摘要(action, []).join('；')).not.toContain('OLD-WAREHOUSE-SCOPE')
    expect(action.warehouseScopeId).toBe('OLD-WAREHOUSE-SCOPE')
  })
  it('智能摘要展示全部启用上限、零差额、混装与连续匹配，隐藏固定拆法的遗留参数', () => {
    const action = 创建默认拆单动作()
    Object.assign(action, { basis: 'system', strategy: 'capacity', continueMatching: true })
    action.limits = { maxQuantity: 3, maxWeightKg: '3', maxAmount: '80', currency: 'USD', maxVolumeCm3: '1000', maxLongestDifferenceCm: '0' }
    action.mixing = { mode: 'separateAttributes', skus: [], attributes: ['带电'] }
    const lines = 拆单列表摘要(action)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('每包 ≤3 件 / ≤3 kg / 体积≤1000 cm³ / ≤80 USD / 最长边差≤0 cm')
    expect(lines[2]).toBe('带电商品与普通商品分开；逐包继续拆单匹配')
    action.strategy = 'unit'
    expect(拆单列表摘要(action).join('')).not.toContain('80 USD')
  })
  it('指定按件数摘要明确每个 SKU 各自上限和其余商品去向', () => {
    const action = 创建默认拆单动作()
    Object.assign(action, { basis: 'platform', strategy: 'selectedQty', selectedSkus: ['A', 'B'], quantityPerPackage: 2 })
    expect(拆单列表摘要(action)).toEqual(['平台 SKU · 指定 SKU 按件数', '指定 A、B；各 SKU 每包最多 2 件；其余商品另包', '结束拆单匹配'])
  })
  it('列表完整动作浮窗使用动作标题，并保留全部参数', async () => {
    const action = 创建默认拆单动作()
    Object.assign(action, { basis: 'system', strategy: 'capacity' })
    action.limits = { maxAmount: '80', currency: 'USD' }
    wrapper = mount(SplitSummary, { props: { action, channels: [] }, attachTo: document.body })
    await wrapper.get('[aria-label="查看完整拆单动作"]').trigger('focus')
    await flushPromises()
    expect(wrapper.get('[aria-label="查看完整拆单动作"]').attributes('aria-expanded')).toBe('true')
    expect(document.body.textContent).toContain('完整拆单动作')
    expect(document.body.textContent).toContain('每包商品金额 ≤ 80 USD')
    expect(document.body.textContent).not.toContain('完整匹配条件')
  })
})

describe('五种拆法包裹图例', () => {
  it.each([
    { title: '每件产品拆为一包', contents: ['A × 1', 'A × 1', 'B × 1'] },
    { title: '一种 SKU 拆为一包', contents: ['A × 2', 'B × 1'] },
    { title: '指定 SKU 合为一包', contents: ['A × 2B × 1', 'C × 2'] },
    { title: '指定 SKU 按件数分包', contents: ['A × 2', 'A × 2', 'A × 1', 'B × 2', 'B × 1', 'C × 1'] },
    { title: '智能分包', contents: ['A × 2', 'A × 1', 'B × 2'] },
  ])('$title示例可聚焦和点击打开，查看不改变规则配置', async ({ title, contents }) => {
    const rule = reactive({ id: 'EXAMPLE', type: '拆单规则', splitAction: 创建默认拆单动作() } as 订单规则)
    wrapper = mount(SplitAction, { props: { rule, orders: [] }, attachTo: document.body, global: { directives: { prototype: {} } } })
    const before = JSON.stringify(rule)
    expect(wrapper.findAll('.拆法示例入口')).toHaveLength(5)
    const trigger = wrapper.get(`[aria-label="${title}示例"]`)
    await trigger.trigger('focus'); await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await trigger.trigger('click'); await flushPromises()
    const panel = document.querySelector(`[aria-label="${title}示例说明"]`)!
    expect([...panel.querySelectorAll('.拆法示例包货')].map(item => item.textContent)).toEqual(contents)
    if (title === '智能分包') {
      expect(panel.textContent).toContain('每包最多 3 kg；带电商品与普通商品分开发')
      expect([...panel.querySelectorAll('.拆法示例包裹>small')].map(item => item.textContent)).toEqual(['2.4 kg · 带电', '1.2 kg · 带电', '1.6 kg · 普通'])
    }
    expect(JSON.stringify(rule)).toBe(before)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })
  it('按件数图例逐 SKU 分包，尾包不混合；点击外部关闭', async () => {
    wrapper = mount(SplitExample, { props: { type: 'selectedQty' }, attachTo: document.body, global: { directives: { prototype: {} } } })
    const trigger = wrapper.get('[aria-label="指定 SKU 按件数分包示例"]')
    await trigger.trigger('mouseenter'); await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await trigger.trigger('click'); await flushPromises()
    const panel = document.querySelector('[aria-label="指定 SKU 按件数分包示例说明"]')!
    const content = [...panel.querySelectorAll('.拆法示例包货')].map(item => item.textContent)
    expect(content).toEqual(['A × 2', 'A × 2', 'A × 1', 'B × 2', 'B × 1', 'C × 1'])
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })
})
