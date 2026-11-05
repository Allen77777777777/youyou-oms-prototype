import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则样例, 试算规则 } from './规则逻辑'
import { 共享规则, 共享规则日志, 写入规则配置, 移动规则优先级 } from './演示会话'
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

  it('新增同值排在组末，手柄重分配区间槽位并保存同值顺序与版本', () => {
    const 原规则 = 共享规则.value, 原日志 = 共享规则日志.value
    const 模板 = 创建规则样例()[0]!, 其他类型 = 创建规则样例()[1]!
    const 配置 = (id: string, priority: number) => ({ ...模板, id, name: id, priority })
    共享规则.value = [配置('Z', 10), 其他类型, 配置('Y', 10), 配置('X', 65), 配置('W', 91)]
    共享规则日志.value = []
    const 列表 = () => 排序规则展示(共享规则.value.filter(项 => 项.type === 模板.type), { field: 'priority', direction: 'asc' })
    try {
      写入规则配置(配置('A', 10))
      expect(列表().map(项 => 项.id)).toEqual(['Z', 'Y', 'A', 'X', 'W'])
      expect(移动规则优先级('X', 'Y')).toBe(true)
      expect(列表().map(项 => [项.id, 项.priority, 项.version])).toEqual([['Z', 10, 1], ['X', 10, 2], ['Y', 10, 2], ['A', 65, 2], ['W', 91, 1]])
      expect(共享规则日志.value.map(项 => 项.ruleId).sort()).toEqual(['A', 'X', 'Y'])
      expect(共享规则日志.value.find(项 => 项.ruleId === 'Y')?.text).toContain('优先级 10 → 10；匹配顺序：第 2 位 → 第 3 位')
      expect(移动规则优先级('X', 'X')).toBe(false)
      expect(移动规则优先级('X', 其他类型.id)).toBe(false)
      expect(共享规则日志.value).toHaveLength(3)
      expect(共享规则.value[1]).toEqual(其他类型)
    } finally {
      共享规则.value = 原规则
      共享规则日志.value = 原日志
    }
  })
})
