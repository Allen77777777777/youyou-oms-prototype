import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, onUnmounted, ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { useRoute } from 'vue-router'
import { router } from '@/路由'
import PageTabs from './页面页签.vue'
import { buyerRetainedPageNames, buyerScopedPage, releaseBuyerSourcePage } from './买家浏览保留'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'

// 只隔离身份解析；实际导航守卫、页签关闭和 KeepAlive 使用正式实现。
vi.mock('@/页面/eBay买家详情/聚合', () => ({ getBuyerProfile: () => ({ found: false }) }))

const sourcePath = '/buyer-close-regression/source'
const buyerPath = '/buyer-close-regression/buyer/shop-a/buyer-a'
let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  releaseBuyerSourcePage(sourcePath)
  releaseBuyerSourcePage(buyerPath)
  document.body.innerHTML = ''
})

describe('关闭买家往返来源页签', () => {
  it('实际点击关闭后不被邻买家守卫复活，重新打开获得新草稿且仍可再次往返', async () => {
    let destroyed = 0
    const Source = defineComponent({
      setup() {
        const draft = ref(''), active = useBuyerPageActive(), route = useRoute()
        onUnmounted(() => { destroyed++ })
        return { draft, active, route }
      },
      template: '<section><input data-source-draft v-model="draft" /><span data-source-route>{{ route.path }}</span><Teleport to="body"><aside v-show="active" data-source-overlay>{{ draft }}</aside></Teleport></section>',
    })
    router.addRoute({ path: sourcePath, component: Source, meta: { title: '回归来源' } })
    router.addRoute({ path: '/buyer-close-regression/buyer/:shopId/:buyerId', name: 'oms-ebay-buyer-detail', component: { template: '<p>回归买家</p>' }, meta: { title: '回归买家' } })
    const Shell = defineComponent({
      components: { PageTabs },
      setup: () => ({ buyerRetainedPageNames, buyerScopedPage }),
      template: '<PageTabs /><RouterView v-slot="{ Component, route }"><KeepAlive :include="buyerRetainedPageNames"><component v-if="Component" :is="buyerScopedPage(route.path)" :key="route.path" :page="Component" :view-route="route" /></KeepAlive></RouterView>',
    })
    await router.push(sourcePath)
    await router.isReady()
    wrapper = mount(Shell, { attachTo: document.body, global: { plugins: [router], stubs: { ElIcon: { template: '<i><slot /></i>' }, ElTooltip: { template: '<span><slot /></span>' } } } })
    await wrapper.get('[data-source-draft]').setValue('关闭前的未提交草稿')
    await router.push(buyerPath)
    await flushPromises()
    expect(destroyed).toBe(0)
    expect((document.querySelector('[data-source-overlay]') as HTMLElement).style.display).toBe('none')
    await router.push(sourcePath)
    await flushPromises()
    expect((wrapper.get('[data-source-draft]').element as HTMLInputElement).value).toBe('关闭前的未提交草稿')

    const sourceTab = wrapper.findAll('.页签项').find(tab => tab.text().includes('回归来源'))!
    await sourceTab.get('[aria-label="关闭页签"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(buyerPath)
    expect(destroyed).toBe(1)
    expect(document.querySelector('[data-source-overlay]')).toBeNull()
    expect(wrapper.findAll('.页签项').some(tab => tab.text().includes('回归来源'))).toBe(false)

    await router.push(sourcePath)
    await flushPromises()
    expect((wrapper.get('[data-source-draft]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('[data-source-draft]').setValue('重新打开后的新草稿')
    await router.push(buyerPath)
    await flushPromises()
    expect(destroyed).toBe(1)
    await router.push(sourcePath)
    await flushPromises()
    expect((wrapper.get('[data-source-draft]').element as HTMLInputElement).value).toBe('重新打开后的新草稿')
    expect(wrapper.get('[data-source-route]').text()).toBe(sourcePath)
  })
})
