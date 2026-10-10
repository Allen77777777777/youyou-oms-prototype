import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import OrderFlags from './订单标志组件.vue'
import { 订单标志定义, type 订单标志, type 订单标志代码 } from './订单标志模型'

const wrappers: VueWrapper[] = []
const tooltipStub = { props: ['content', 'visible'], template: '<div class="tooltip-reference"><slot /><div v-if="visible" role="tooltip">{{ content }}</div></div>' }
function flag(code: 订单标志代码): 订单标志 { return { code, ...订单标志定义[code], reason: '明确的来源命中依据', sourceOrderNos: ['ORDER-FLAG-DEMO'] } }
function render(flags: 订单标志[]) {
  const wrapper = mount(OrderFlags, { attachTo: document.body, props: { flags }, global: { directives: { prototype: {} }, stubs: { ElTooltip: tooltipStub } } })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); document.body.innerHTML = '' })

describe('订单标志可访问展示', () => {
  it('无标志不显示占位，重复命中只显示一次且按统一顺序展示', () => {
    expect(render([]).find('[aria-label="订单标志"]').exists()).toBe(false)
    const wrapper = render([flag('BUYER_NOTE'), flag('CANCEL'), flag('REFUND'), flag('BUYER_NOTE')])
    expect(wrapper.findAll('[data-flag-code]').map(node => node.text())).toEqual(['退', '消', '言'])
    expect(wrapper.findAll('[data-flag-code]').every(node => node.attributes('tabindex') === '0')).toBe(true)
    expect(wrapper.findAll('[data-flag-code]').every(node => node.element.tagName === 'BUTTON' && node.attributes('type') === 'button')).toBe(true)
  })
  it('键盘聚焦与悬停只显示对应短释义，来源和依据不出现在提示或可访问标签中；Esc可关闭', async () => {
    const wrapper = render([flag('BUYER_NOTE')])
    const marker = wrapper.get('[data-flag-code="BUYER_NOTE"]')
    await marker.trigger('focus')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('收件信息中有买家下单留言')
    expect(marker.attributes('aria-label')).toBe('收件信息中有买家下单留言')
    await marker.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    await marker.trigger('blur')
    await marker.trigger('mouseenter')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true)
    await marker.trigger('mouseleave')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
  })
  it('鼠标悬停但未聚焦时，document Escape 收起提示且不阻断父级原生行为', async () => {
    const wrapper = render([flag('BUYER_NOTE')])
    await wrapper.get('[data-flag-code="BUYER_NOTE"]').trigger('mouseenter')
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    await nextTick()
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })
})
