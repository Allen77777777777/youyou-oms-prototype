import { describe, expect, it } from 'vitest'
import { 创建尺寸配置, 创建材积组, 校验尺寸公式, 计算尺寸公式, 校验尺寸配置, 校验材积配置, 匹配尺寸配置, 尺寸配置摘要, 材积配置摘要 } from './尺寸材积模型'

describe('尺寸公式的有限语法与匹配', () => {
  it('按截图支持比较、括号、乘加减及and／or，使用精确十进制', () => {
    const size = { L: '201', W: '151', H: '3' }
    expect(计算尺寸公式('L>200 and W>150 and H>2', size)).toBe(true)
    expect(计算尺寸公式('(L+W)*2>150', size)).toBe(true)
    expect(计算尺寸公式('L<200 or W=151 and H>=3', size)).toBe(true)
    expect(计算尺寸公式('L<200 or (W=151 and H>3)', size)).toBe(false)
    expect(计算尺寸公式('L-W=50 and -H+4=1', size)).toBe(true)
    expect(计算尺寸公式('L+W=0.3', { L: '0.1', W: '0.2', H: '1' })).toBe(true)
    expect(计算尺寸公式('L*W*1000000=0.000001', { L: '0.000001', W: '0.000001', H: '1' })).toBe(true)
  })

  it.each(['', 'L>', 'L>200 and', 'L>200 W>150', 'L>W>H', '(L>2', 'L+W', '1=1', 'L/2>1', 'l>1', 'L>1;alert(1)', 'globalThis.L>1', 'L>1 || W>1', 'L>NaN', 'L>1e3', 'L>2 and 1', 'L>(W>2)', '('.repeat(40)+'L>1'+')'.repeat(40)])('拒绝不完整或非法表达式%s', expression => {
    expect(校验尺寸公式(expression)).not.toBe('')
  })

  it('三种内部关系与全部外部字段相互独立，未知尺寸不能由全部不符合放行', () => {
    const config = 创建尺寸配置()
    config.rows[0]!.expression = 'L>200'
    config.rows.push({ type: 'single', expression: 'W>200', note: '演示备注' })
    const read = () => [{ L: '201', W: '151', H: '3' }]
    expect(匹配尺寸配置(config, read)).toBe(true)
    config.mode = '匹配全部规则'; expect(匹配尺寸配置(config, read)).toBe(false)
    config.mode = '全部不符合规则'; expect(匹配尺寸配置(config, read)).toBe(false)
    expect(匹配尺寸配置(config, () => [{ L: '100', W: '100', H: '3' }])).toBe(true)
    expect(匹配尺寸配置(config, () => undefined)).toBeUndefined()
    expect(匹配尺寸配置(config, () => [])).toBeUndefined()
    expect(匹配尺寸配置(config, () => [{ L: '', W: '100', H: '3' }])).toBeUndefined()
    expect(尺寸配置摘要(config)).toContain('演示备注')
    expect(尺寸配置摘要(config)).toContain('全部不符合规则')
  })

  it('逐商品校验、空行与未知类型保护，草稿默认值互不共享', () => {
    const config = 创建尺寸配置()
    expect(校验尺寸配置(config)).toContain('公式')
    config.rows[0]!.expression = 'L>2'
    expect(匹配尺寸配置(config, () => [{ L: '3', W: '1', H: '1' }, { L: '1', W: '1', H: '1' }])).toBe(false)
    expect(创建尺寸配置().rows[0]!.expression).toBe('')
    config.rows = []; expect(校验尺寸配置(config)).toContain('至少配置')
  })
})

describe('材积计算方式与尺寸范围配置', () => {
  it('只验证选中方式，切换保留另一份值，定点边界／尺寸范围不可倒置', () => {
    const group = 创建材积组()
    expect(校验材积配置([group])).toContain('至少填写')
    group.sumProducts.min = '0'; group.sumProducts.max = '0.000001'
    group.stackHeight.min = '无效残值'
    expect(校验材积配置([group])).toBe('')
    group.method = 'stackHeight'; expect(校验材积配置([group])).not.toBe('')
    group.stackHeight.min = '100'; group.stackHeight.max = '100'; group.stackHeight.maxInclusive = false
    expect(校验材积配置([group])).toContain('包含边界')
    group.stackHeight.max = '101'; expect(校验材积配置([group])).toBe('')
    group.length.min = '20'; group.length.max = '10'; expect(校验材积配置([group])).toContain('下限不能大于')
    group.length.max = '30'; group.length.stack = true; group.convert = true
    expect(校验材积配置([group])).toBe('')
    expect(材积配置摘要([group])).toContain('长 * 宽 * (高叠加)')
    expect(材积配置摘要([group])).toContain('< 101 cm³')
    expect(材积配置摘要([group])).toContain('长 20～30 cm（叠加）')
    expect(材积配置摘要([group])).toContain('叠加换算')
    expect(创建材积组().length.min).toBe('')
  })
})
