import { describe, expect, it } from 'vitest'
import type { 人工发货分配 } from '../全渠道订单/类型'
import { 创建拆单演示订单, 创建拆单演示规则, 创建拆单演示资料, 拆单演示渠道 } from './拆单演示资料'
import { 拆单条件匹配 } from './拆单条件评估'
import { 计算拆单 } from './拆单规则模型'
import { 创建材积组 } from './尺寸材积模型'
import type { 规则条件 } from './规则条件定义'

function scene(index = 0) {
  const orders = 创建拆单演示订单(), order = orders[index]!, data = 创建拆单演示资料(orders), rule = 创建拆单演示规则()[index]!
  const items: 人工发货分配[] = order.items.map(x => ({ orderNo: order.systemOrderNo, externalLineId: x.externalLineId, quantity: x.fulfillableQuantity! }))
  return { order, data, rule, items }
}
function range(field: 规则条件['field'], lower: string, upper = lower): 规则条件 { return { field, operator: '介于', value: lower, upperValue: upper, lowerInclusive: true, upperInclusive: true } }

describe('拆单商品条件与连续匹配', () => {
  it('六组平台 SKU 示例各自只命中对应规则', () => {
    const rules = 创建拆单演示规则()
    for (let i = 0; i < 6; i++) {
      const { order, data, items } = scene(i)
      expect(rules.map(rule => 拆单条件匹配(rule, order, items, data, []).matched)).toEqual(rules.map((_, j) => i === j))
    }
  })
  it('连续匹配数量与 SKU 取当前包裹，订单总金额仍取原单', () => {
    const { order, data, rule } = scene()
    rule.splitAction!.continueMatching = true
    const second = structuredClone(rule)
    second.id = 'NEXT'; second.priority = 20; second.splitAction!.strategy = 'unit'; second.splitAction!.continueMatching = false
    second.conditions = [{ ...range('warehouseSkuQuantity', '3'), quantityMode: 'total' }, { ...range('orderAmount', '73'), currency: 'USD' }]
    const result = 计算拆单(order, [rule, second], data, (r, o, items) => 拆单条件匹配(r, o, items, data, []))
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 1, 1, 1])
    expect(result.packages[0]!.ruleIds).toEqual([rule.id])
  })
  it('SKU 否定需要完整来源，缺一行不能静默视为不包含', () => {
    const { order, data, rule, items } = scene()
    rule.conditions = [{ field: 'platformSku', operator: '不包含', value: '不存在的SKU' }]
    delete order.items[0]!.platformSku
    expect(拆单条件匹配(rule, order, items, data, [])).toMatchObject({ matched: false, pending: true })
  })
  it('旧仓库 SKU 条件即使已有明确范围和可信映射仍要求删除重配', () => {
    const { order, data, rule, items } = scene()
    rule.splitAction!.warehouseScopeId = 拆单演示渠道[1]
    rule.conditions = [{ field: 'warehouseSku', operator: '包含', value: 'GC-SPLIT-BASIC-BOX' }]
    const result = 拆单条件匹配(rule, order, items, data, [])
    expect(result).toMatchObject({ matched: false, pending: true })
    expect(result.unknownFields.join()).toContain('已移除')
  })
  it('旧仓库 SKU 条件不能借其他否定条件、默认仓或有效范围绕过保护', () => {
    const { order, data, rule, items } = scene()
    rule.conditions = [{ field: 'warehouseSku', operator: '包含', value: 'WYT-SPLIT-BASIC-BOX' }, { field: 'platformCode', operator: '等于', value: 'Temu', values: ['Temu'] }]
    expect(order.defaultRoute).toBeDefined()
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
    rule.splitAction!.warehouseScopeId = 拆单演示渠道[0]
    data.routes[0]!.enabled = false
    data.routes[0]!.countries = ['DE']
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
    rule.enabled = false
    expect(拆单条件匹配(rule, order, items, data, [])).toMatchObject({ matched: false, pending: false })
  })
  it('旧仓库 SKU 动作不影响平台条件取值，也不静默改为系统SKU继续执行', () => {
    const { order, data, rule, items } = scene()
    rule.splitAction!.basis = 'warehouse'
    const before = JSON.stringify(rule)
    const result = 拆单条件匹配(rule, order, items, data, [])
    expect(result).toMatchObject({ matched: false, pending: true })
    expect(result.unknownFields.join()).toContain('拆分依据已移除')
    expect(JSON.stringify(rule)).toBe(before)
  })
  it('缺失单件重量不能拿原订单重量均分；十进制边界精确', () => {
    const { order, data, rule, items } = scene()
    data.products[0]!.weightKg = '0.1'; data.products[1]!.weightKg = '0.1'
    rule.conditions = [range('orderWeight', '0.5')]
    expect(拆单条件匹配(rule, order, items, data, []).matched).toBe(true)
    delete data.products[0]!.weightKg
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
  })
  it('高优先级来源未知阻断后续规则；已知非目标平台可排除该规则', () => {
    const { order, data, rule, items } = scene()
    const first = structuredClone(rule); first.id = 'UNKNOWN'; first.priority = 1
    first.conditions = [{ ...range('warehouseSkuQuantity', '2'), quantityMode: 'sku' }]
    const match = (r: typeof rule, o: typeof order, rows: readonly 人工发货分配[]) => 拆单条件匹配(r, o, rows, data, [])
    expect(计算拆单(order, [first, rule], data, match).errors[0]).toContain('不能排除')
    first.conditions.push({ field: 'platformCode', operator: '等于', value: 'Temu', values: ['Temu'] })
    expect(拆单条件匹配(first, order, items, data, [])).toMatchObject({ matched: false, pending: false })
    expect(计算拆单(order, [first, rule], data, match).errors).toEqual([])
  })
  it('已勾选但未填范围保持待核实，不能落到后续低优先级规则', () => {
    const { order, data, rule, items } = scene()
    rule.conditions = [{ ...range('orderWeight', ''), lowerEnabled: true }]
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
  })
  it('单价与多商品尺寸逐行满足，金额不进行汇率猜测', () => {
    const { order, data, rule, items } = scene()
    rule.conditions = [{ ...range('unitPrice', '12', '20'), currency: 'USD' }, range('longestSide', '20', '30'), range('secondSide', '15')]
    expect(拆单条件匹配(rule, order, items, data, []).matched).toBe(true)
    rule.conditions[0]!.currency = 'CNY'
    expect(拆单条件匹配(rule, order, items, data, []).matched).toBe(false)
  })
  it('单件尺寸公式检查购买数量，复杂叠放不能伪造通过', () => {
    const { order, data, rule, items } = scene()
    rule.conditions = [{ field: 'productDimensions', operator: '等于', value: '', dimensionRules: { mode: '匹配全部规则', rows: [{ type: 'singlePiece', expression: 'L<=30', note: '' }] } }]
    expect(拆单条件匹配(rule, order, items, data, [])).toMatchObject({ matched: false, pending: false })
    expect(拆单条件匹配(rule, order, [{ ...items[0]!, quantity: 1 }], data, []).matched).toBe(true)
    rule.conditions[0]!.dimensionRules!.rows[0]!.type = 'singleStack'
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
  })
  it('商品材积求和使用来源尺寸和数量，叠加换算保留待核实', () => {
    const { order, data, rule, items } = scene(), group = 创建材积组()
    group.sumProducts = { min: '6300', max: '6300', minInclusive: true, maxInclusive: true }
    rule.conditions = [{ field: 'volume', operator: '介于', value: '', volumeGroups: [group] }]
    expect(拆单条件匹配(rule, order, items, data, []).matched).toBe(true)
    group.convert = true
    expect(拆单条件匹配(rule, order, items, data, []).pending).toBe(true)
  })
})
