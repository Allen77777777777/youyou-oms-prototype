import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ElInputNumber, ElMessage, ElSwitch } from 'element-plus'
import { router } from '@/路由'
import Page from './业务配置页面.vue'
import { 保存审单执行设置, 共享审单执行设置 } from './规则执行设置'

let wrapper: VueWrapper | undefined
function open() {
  wrapper = mount(Page, { global: { directives: { prototype: {} } } })
  return wrapper
}
async function click(text: string) {
  const button = wrapper!.findAll('button').find(el => el.text() === text)
  expect(button).toBeDefined()
  await button!.trigger('click')
}
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  保存审单执行设置({ enabled: false, intervalHours: 2 })
  vi.restoreAllMocks()
})

describe('业务配置与规则执行设置', () => {
  it('现有自发货订单菜单加载业务配置页面', async () => {
    const route = router.resolve('/oms/self-fulfillment/business-settings')
    expect(route.name).toBe('oms-business-settings')
    expect(route.meta.title).toBe('业务配置')
    const load = route.matched[route.matched.length - 1]!.components!.default as () => Promise<{ default: typeof Page }>
    expect((await load()).default).toBe(Page)
  })

  it('默认关闭并使用两小时间隔，取消编辑保留生效值', async () => {
    const page = open()
    expect(page.text()).toContain('已关闭')
    expect(page.text()).toContain('每 2 小时执行一轮')
    const navigation = page.get('nav[aria-label="业务配置导航"]')
    expect(navigation.get('button').attributes('aria-current')).toBe('page')
    expect(navigation.get('button').attributes('aria-controls')).toBe('rule-execution-settings')
    await click('编辑')
    page.getComponent(ElSwitch).vm.$emit('update:modelValue', true)
    page.getComponent(ElInputNumber).vm.$emit('update:modelValue', 3)
    await navigation.get('button').trigger('click')
    expect(page.getComponent(ElSwitch).props('modelValue')).toBe(true)
    expect(page.getComponent(ElInputNumber).props('modelValue')).toBe(3)
    expect(共享审单执行设置.value).toEqual({ enabled: false, intervalHours: 2 })
    await click('取消')
    await click('编辑')
    expect(page.getComponent(ElSwitch).props('modelValue')).toBe(false)
    expect(page.getComponent(ElInputNumber).props('modelValue')).toBe(2)
  })

  it('保存后同步配置，重新进入仍可关闭并保留间隔', async () => {
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    open()
    await click('编辑')
    wrapper!.getComponent(ElSwitch).vm.$emit('update:modelValue', true)
    wrapper!.getComponent(ElInputNumber).vm.$emit('update:modelValue', 5)
    await click('保存')
    expect(共享审单执行设置.value).toEqual({ enabled: true, intervalHours: 5 })
    wrapper!.unmount()
    const page = open()
    expect(page.text()).toContain('已开启')
    await click('编辑')
    page.getComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await click('保存')
    expect(共享审单执行设置.value).toEqual({ enabled: false, intervalHours: 5 })
    expect(page.text()).toContain('已关闭')
  })

  it('无效或缺失间隔不能启动循环，再次保存相同设置不重置周期', async () => {
    const saved = 共享审单执行设置.value
    expect(保存审单执行设置({ enabled: false, intervalHours: 2 })).toBe('')
    expect(共享审单执行设置.value).toBe(saved)
    for (const value of [NaN, 0, 1.5, 25, Infinity]) {
      expect(保存审单执行设置({ enabled: true, intervalHours: value })).toContain('1 至 24')
    }
    const page = open()
    await click('编辑')
    page.getComponent(ElInputNumber).vm.$emit('update:modelValue', undefined)
    await click('保存')
    expect(page.get('[role="alert"]').text()).toContain('执行间隔')
    expect(共享审单执行设置.value).toBe(saved)
  })
})
