import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, onUnmounted, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, useRoute } from 'vue-router'
import { buyerRetainedPageNames, buyerScopedPage, releaseBuyerSourcePage, retainBuyerSourcePage } from './买家浏览保留'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); for (const path of ['/source', '/buyer', '/other']) releaseBuyerSourcePage(path) })

describe('买家浏览来源页签保留', () => {
  it('往返保留草稿，停用弹层并固定来源路由，关闭后销毁；普通跳转沿用销毁', async () => {
    let destroyed = 0
    const Source = defineComponent({ setup() { const draft = ref(''), route = useRoute(), active = useBuyerPageActive(); onUnmounted(() => { destroyed++ }); return { draft, route, active } },
      template: '<section><input v-model="draft" /><span data-route>{{route.path}}</span><Teleport to="body"><aside v-show="active" data-overlay>{{draft}}</aside></Teleport></section>' })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/source', component: Source }, { path: '/buyer', component: { template: '<p>买家资料</p>' } }, { path: '/other', component: { template: '<p>其他页面</p>' } },
    ] })
    const Shell = defineComponent({ setup: () => ({ buyerRetainedPageNames, buyerScopedPage }), template: '<RouterView v-slot="{Component, route}"><KeepAlive :include="buyerRetainedPageNames"><component v-if="Component" :is="buyerScopedPage(route.path)" :key="route.path" :page="Component" :view-route="route" /></KeepAlive></RouterView>' })
    await router.push('/source'); await router.isReady()
    wrapper = mount(Shell, { attachTo: document.body, global: { plugins: [router] } })
    await wrapper.get('input').setValue('未提交的客服备注')
    const original = wrapper.get('[data-route]').element
    retainBuyerSourcePage('/source'); retainBuyerSourcePage('/buyer')
    await router.push('/buyer'); await flushPromises()
    expect(destroyed).toBe(0)
    expect(original.textContent).toBe('/source')
    expect((document.querySelector('[data-overlay]') as HTMLElement).style.display).toBe('none')
    await router.push('/source'); await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('未提交的客服备注')
    expect((document.querySelector('[data-overlay]') as HTMLElement).style.display).not.toBe('none')
    await router.push('/buyer'); await flushPromises()
    releaseBuyerSourcePage('/source'); await flushPromises()
    expect(destroyed).toBe(1)
    await router.push('/source'); await flushPromises()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    await router.push('/other'); await flushPromises()
    expect(destroyed).toBe(2)
  })
})
