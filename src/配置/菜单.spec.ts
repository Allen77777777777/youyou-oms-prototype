import { describe, expect, it } from 'vitest'

import { 获取全部页面菜单, 菜单配置 } from './菜单'
import { 现有菜单数据 } from './现有菜单'

describe('菜单配置', () => {
  it('将 OMS 插入仪表盘与销售之间', () => {
    expect(菜单配置.map((菜单) => 菜单.标题).slice(0, 5)).toEqual(['工作台', '产品', '仪表盘', 'OMS', '销售'])
  })

  it('保证所有页面 id 和路径唯一', () => {
    const 页面 = 获取全部页面菜单()
    expect(new Set(页面.map((菜单) => 菜单.id)).size).toBe(页面.length)
    expect(new Set(页面.map((菜单) => 菜单.路径)).size).toBe(页面.length)
  })

  it('包含用户确认的 OMS 页面', () => {
    const 标题 = 获取全部页面菜单().map((菜单) => 菜单.标题)
    expect(标题).toEqual(expect.arrayContaining([
      '全渠道订单',
      'eBay订单',
      'Temu订单',
      '订单处理',
      '订单标发',
      '手工订单',
      '订单规则',
      '物流轨迹',
      '业务配置',
      '三方仓出库单',
      '物流下单',
      '物流渠道管理',
    ]))
  })

  it('同步测试环境观察到的完整现有菜单', () => {
    const 分组数 = 现有菜单数据.reduce((总数, 模块) => 总数 + 模块.分组.length, 0)
    const 页面数 = 现有菜单数据.reduce(
      (总数, 模块) => 总数 + 模块.分组.reduce((分组总数, 分组) => 分组总数 + 分组.菜单.length, 0),
      0,
    )

    expect(现有菜单数据).toHaveLength(12)
    expect(分组数).toBe(46)
    expect(页面数).toBe(296)
  })
})
