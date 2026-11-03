import { describe, expect, it } from 'vitest'
import { router } from '@/路由'
import { 获取全部页面菜单 } from '@/配置/菜单'
import ReviewPage from './eBay评价页面.vue'
import StatisticsPage from '../eBay评价统计/eBay评价统计页面.vue'

describe('eBay评价与统计入口', () => {
  it('两个菜单加载实际业务页面，保留独立名称与路径', async () => {
    const entries = [
      { id: 'oms-ebay-reviews', title: 'eBay评价', path: '/oms/ebay-service/reviews', component: ReviewPage },
      { id: 'oms-ebay-review-statistics', title: 'eBay评价统计', path: '/oms/ebay-service/review-statistics', component: StatisticsPage },
    ]
    for (const entry of entries) {
      const menu = 获取全部页面菜单().find(item => item.id === entry.id)!
      expect(menu.标题).toBe(entry.title); expect(menu.路径).toBe(entry.path)
      const resolved = router.resolve(entry.path)
      expect(resolved.name).toBe(entry.id); expect(resolved.meta.title).toBe(entry.title)
      const registered = router.getRoutes().find(item => item.name === entry.id)!
      const load = registered.components?.default as () => Promise<{ default: typeof ReviewPage }>
      expect((await load()).default).toBe(entry.component)
    }
  })
  it('旧中差评占位地址兼容跳转统计并保留查询参数', async () => {
    expect(获取全部页面菜单().some(item => item.路径 === '/oms/ebay-service/negative-reviews')).toBe(false)
    await router.push('/oms/ebay-service/negative-reviews?source=buyer')
    expect(router.currentRoute.value.path).toBe('/oms/ebay-service/review-statistics')
    expect(router.currentRoute.value.query).toEqual({ source: 'buyer' })
  })
})
