// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { router } from './index'

describe('自动客服规则编辑页签', () => {
  it('三种编辑入口归属自动客服规则菜单，独立草稿不会与订单规则串用', () => {
    const paths = new Set<string>()
    for (const mode of ['new', 'edit', 'copy']) {
      const result = router.resolve({ name: `oms-auto-service-rule-${mode}`, params: { sessionId: 'demo-session' } })
      expect(result.meta.activeMenu).toBe('/oms/ebay-service/automation-rules')
      expect(result.meta.serviceRuleEditorMode).toBe(mode)
      expect(result.path).toBe(`/oms/ebay-service/automation-rules/${mode}/demo-session`)
      expect(result.meta.ruleEditorMode).toBeUndefined()
      paths.add(result.path)
    }
    expect(paths.size).toBe(3)
    expect(router.resolve('/oms/ebay-service/automation-rules').name).toBe('oms-auto-service-rules')
  })
})
