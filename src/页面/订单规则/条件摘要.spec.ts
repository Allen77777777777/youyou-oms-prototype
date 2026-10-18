import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElPopover } from 'element-plus'
import Summary from './规则条件摘要.vue'

let 页面: VueWrapper | undefined
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 测量摘要(lines: string[], 内容高度: number) {
  // jsdom 不排版；模拟浏览器的实际内容高度，验证按溢出判断而非按条件条数判断。
  页面 = mount(Summary, { props: { lines }, attachTo: document.body })
  await 稳定()
  let height = 内容高度
  Object.defineProperties(页面.get('.条件摘要三行').element, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { configurable: true, get: () => 60 },
  })
  await 页面.setProps({ lines: [...lines] }); await 稳定()
  return { page: 页面, resize: async (value: number) => { height = value; await 页面!.setProps({ lines: [...lines] }); await 稳定() } }
}
afterEach(() => { 页面?.unmount(); 页面 = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })

describe('匹配条件摘要按实际高度展开', () => {
  it('未超过三行可见高度时不提供展开入口', async () => {
    const { page } = await 测量摘要(['第一项', '第二项', '第三项'], 60)
    expect(page.findComponent(ElPopover).props('disabled')).toBe(true)
    expect(page.get('.条件摘要三行').attributes('tabindex')).toBeUndefined()
    expect(page.get('.条件摘要三行').attributes('aria-label')).toBeUndefined()
    await page.get('.条件摘要三行').trigger('focus'); await 稳定()
    expect(page.findComponent(ElPopover).props('visible')).toBe(false)
  })

  it('两项长条件实际换行溢出时可通过焦点查看完整内容，Esc关闭，缩回后取消展开', async () => {
    const lines = ['平台等于 eBay；这个条件足够长，在窄列中会跨越多行', '目的国家不等于德国；保留该条件的完整说明及所有来源文字']
    const { page, resize } = await 测量摘要(lines, 100)
    const 入口 = page.get('.条件摘要三行')
    expect(page.findComponent(ElPopover).props('disabled')).toBe(false)
    expect(入口.attributes('tabindex')).toBe('0')
    expect(入口.attributes('aria-label')).toBe('查看完整匹配条件')
    await 入口.trigger('focus'); await 稳定()
    expect(page.findComponent(ElPopover).props('visible')).toBe(true)
    expect(Array.from(document.querySelectorAll('.订单规则条件浮窗 .完整条件 p')).map(项 => 项.textContent)).toEqual(lines)
    await 入口.trigger('keydown', { key: 'Escape' }); await 稳定()
    expect(page.findComponent(ElPopover).props('visible')).toBe(false)
    await 入口.trigger('focus'); await 稳定()
    await resize(40)
    expect(page.findComponent(ElPopover).props('disabled')).toBe(true)
    expect(page.findComponent(ElPopover).props('visible')).toBe(false)
    expect(入口.attributes('tabindex')).toBeUndefined()
  })

  it('溢出的摘要悬停后显示全文，触发器只读且不裁掉末尾条件', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const lines = ['满足全部条件', '平台 等于 eBay', '目的国家 不等于 US', '店铺 等于 演示店铺，末尾条件必须保留']
    const { page } = await 测量摘要(lines, 120)
    await page.get('.条件摘要三行').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(200); await 稳定()
    expect(page.findComponent(ElPopover).props('visible')).toBe(true)
    expect(Array.from(document.querySelectorAll('.订单规则条件浮窗 .完整条件 p')).map(项 => 项.textContent)).toEqual(lines)
    expect(page.emitted('update:lines')).toBeUndefined()
  })
})
