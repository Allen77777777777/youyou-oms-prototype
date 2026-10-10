import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则样例, 试算规则 } from './规则逻辑'
import { 默认规则筛选, 命中规则筛选, 校验规则筛选, 排序规则展示 } from './规则筛选'

describe('规则列表筛选与展示排序', () => {
  it('名称与说明按指定文本字段查，多行精确保留名称内空格', () => {
    const 规则 = { ...创建规则样例()[0]!, name: 'eBay 北美人工复核', note: '说明专属词' }
    const 筛选 = 默认规则筛选(); 筛选.keyword = '说明专属词'
    expect(命中规则筛选(规则, 筛选)).toBe(false)
    筛选.searchType = 'note'; expect(命中规则筛选(规则, 筛选)).toBe(true)
    筛选.searchType = 'name'; 筛选.searchMatch = 'exact'; 筛选.keyword = '其他规则\neBay 北美人工复核'
    expect(命中规则筛选(规则, 筛选)).toBe(true)
    筛选.keyword = 'eBay 北美'; expect(命中规则筛选(规则, 筛选)).toBe(false)
  })

  it('启用情况多选 OR，超 1000 条拒绝而不截断', () => {
    const 规则 = 创建规则样例()[0]!
    const 筛选 = 默认规则筛选(); 筛选.enabled = ['true', 'false']
    expect(命中规则筛选(规则, 筛选)).toBe(true)
    expect(命中规则筛选({ ...规则, enabled: false }, 筛选)).toBe(true)
    筛选.enabled = ['false']; expect(命中规则筛选(规则, 筛选)).toBe(false)
    筛选.searchMatch = 'exact'; 筛选.keyword = Array.from({ length: 1001 }, (_, i) => `规则 ${i}`).join('\n')
    expect(校验规则筛选(筛选)).toContain('1000')
  })

  it('显示降序不改实际优先级、规则版本、执行顺序与首命中', () => {
    const 列表 = 创建规则样例().filter(项 => 项.type === '分仓规则'); 列表[1]!.enabled = true
    const 订单 = 全渠道订单模拟数据[0]!
    const 原值 = JSON.stringify(列表), 原首命中 = 试算规则(列表, 订单, '分仓规则').hit?.id
    const 显示 = 排序规则展示(列表, { field: 'priority', direction: 'desc' })
    expect(显示.map(项 => 项.priority)).toEqual([20, 10])
    expect(试算规则(显示, 订单, '分仓规则').hit?.id).toBe(原首命中)
    expect(JSON.stringify(列表)).toBe(原值)
    expect(排序规则展示(显示, { field: '', direction: 'desc' }).map(项 => 项.priority)).toEqual([10, 20])
  })
})
