import { describe, expect, it } from 'vitest'
import { router } from '@/路由'
import { 获取全部页面菜单 } from '@/配置/菜单'
import TemplatePage from './消息模板管理页面.vue'

describe('消息模板管理入口', () => {
  it('复用已有菜单ID和路径，加载管理页面而非占位页面', async () => {
    const menu = 获取全部页面菜单().find(item => item.id === 'oms-message-templates')!
    expect(menu.路径).toBe('/oms/ebay-service/message-templates')
    const resolved = router.resolve(menu.路径!)
    expect(resolved.name).toBe('oms-message-templates')
    expect(resolved.meta.title).toBe('消息模板管理')
    const route = router.getRoutes().find(item => item.name === 'oms-message-templates')!
    const load = route.components?.default as () => Promise<{ default: typeof TemplatePage }>
    expect((await load()).default).toBe(TemplatePage)
  })
})
