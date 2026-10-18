import { describe, expect, it } from 'vitest'
import { agingRecords, type AgingRecord } from '../三方仓库龄/库龄模型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则样例, 校验规则配置, 试算规则 } from './规则逻辑'
import { 创建规则渠道样例, 读取分仓路由, 读取分仓候选, 检查分仓剩余库存, 分仓配置摘要 } from './规则路由'
import { 计算库龄分仓, type 候选库龄资料 } from './库龄分仓'

function 准备() {
  const rule = 创建规则样例()[1]!, channels = 创建规则渠道样例()
  const routes = ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].map(id => {
    const 项 = channels.find(项 => 项.id === id)!
    return { providerId: 项.providerId, accountId: 项.accountId, warehouseId: 项.warehouseId, channelId: 项.id }
  })
  rule.warehouseAction = { mode: 'age', checkRemainingStock: false, minimumRemainingStock: '', ageRoutes: routes }
  const order = structuredClone(全渠道订单模拟数据[0]!); order.processingStatus = '待审核'
  order.items = ['SKU-A', 'SKU-B'].map((systemSku, index) => ({ ...order.items[0]!, externalLineId: `line-${index}`, systemSku, skuResolutionStatus: '成功' }))
  const source: 候选库龄资料[] = routes.map((scope, index) => ({
    scope: { ...scope }, organization: '演示组织甲', sourceCustomer: 'DEMO-CUSTOMER-A', snapshotDate: '2026-09-23',
    records: [index === 0 ? 120 : 80, index === 0 ? 45 : 180].map((agingDays, i) => ({ ...agingRecords[0]!, id: `${index}-${i}`, provider: channels.find(项 => 项.id === scope.channelId)!.provider, accountId: scope.accountId, warehouseId: scope.warehouseId, systemSku: ['SKU-A', 'SKU-B'][i]!, warehouseSku: `WH-${i}`, agingDays })),
  }))
  return { rule, order, channels, source }
}
describe('库龄分仓按所选仓库中订单SKU的最大库龄匹配', () => {
  it('开启库存检测时校验阈值，关闭保留输入但不参与判断', () => {
    const { rule, channels } = 准备()
    rule.warehouseAction!.checkRemainingStock = true
    for (const value of ['', '-1', '1.5', '1'.repeat(25)]) {
      rule.warehouseAction!.minimumRemainingStock = value
      expect(校验规则配置(rule, [rule], channels)).toContain('剩余库存阈值请输入非负整数')
    }
    rule.warehouseAction!.minimumRemainingStock = '0'
    expect(校验规则配置(rule, [rule], channels)).toBe('')
    rule.warehouseAction!.checkRemainingStock = false
    rule.warehouseAction!.minimumRemainingStock = '-1'
    expect(校验规则配置(rule, [rule], channels)).toBe('')
    expect(检查分仓剩余库存(rule)).toBe('unchecked')
  })
  it('先跳过任一SKU剩余库存低于阈值的仓库，再按库龄匹配；等于阈值通过', () => {
    const { rule, order, channels, source } = 准备()
    rule.warehouseAction!.checkRemainingStock = true
    rule.warehouseAction!.minimumRemainingStock = '5'
    source.forEach(项 => { 项.remainingStock = [{ systemSku: 'SKU-A', quantity: '5' }, { systemSku: 'SKU-B', quantity: '5' }] })
    source[1]!.remainingStock = [{ systemSku: 'SKU-A', quantity: '9' }, { systemSku: 'SKU-B', quantity: '1' }]
    const before = JSON.stringify({ rule, order, source })
    const result = 试算规则([rule], order, '分仓规则', channels, source)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result.gates).toEqual([])
    expect(result.aging?.skipped.map(项 => 项.id)).toEqual(['DEMO-CF-CHANNEL-GC'])
    expect(result.aging?.ranked.map(项 => 项.ageDays)).toEqual([120])
    expect(分仓配置摘要(rule, channels)[0]).toContain('剩余库存 < 5')
    expect(JSON.stringify({ rule, order, source })).toBe(before)
    source[1]!.remainingStock = [{ systemSku: 'SKU-A', quantity: '5' }, { systemSku: 'SKU-B', quantity: '5' }]
    expect(计算库龄分仓(rule, order, channels, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('库存未取得、SKU不全、重复或无效时保持未知，不用库龄快照数量代替', () => {
    const { rule, order, channels, source } = 准备()
    rule.warehouseAction!.checkRemainingStock = true
    rule.warehouseAction!.minimumRemainingStock = '5'
    source[0]!.remainingStock = [{ systemSku: 'SKU-A', quantity: '10' }, { systemSku: 'SKU-B', quantity: '10' }]
    for (const remainingStock of [undefined, [], [{ systemSku: 'SKU-A', quantity: '10' }], [{ systemSku: 'SKU-A', quantity: '10' }, { systemSku: 'SKU-A', quantity: '10' }, { systemSku: 'SKU-B', quantity: '10' }], [{ systemSku: 'SKU-A', quantity: 'bad' }, { systemSku: 'SKU-B', quantity: '10' }]]) {
      source[1]!.remainingStock = remainingStock
      const result = 试算规则([rule], order, '分仓规则', channels, source)
      expect(result.route).toBeUndefined()
      expect(result.gates.join('；')).toContain('未取得完整的分仓后剩余可用库存')
    }
    rule.warehouseAction!.checkRemainingStock = false
    expect(计算库龄分仓(rule, order, channels, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('所有仓均低于阈值时无推荐仓，不使用基础暂存路由', () => {
    const { rule, order, channels, source } = 准备()
    rule.warehouseAction!.checkRemainingStock = true
    rule.warehouseAction!.minimumRemainingStock = '0'
    source.forEach(项 => { 项.remainingStock = [{ systemSku: 'SKU-A', quantity: '-1' }, { systemSku: 'SKU-B', quantity: '0' }] })
    const result = 计算库龄分仓(rule, order, channels, source)
    expect(result.route).toBeUndefined()
    expect(result.skipped).toHaveLength(2)
    expect(result.gates.join('；')).toContain('所有候选仓库')
  })
  it('关闭库存检测时，多SKU按最大值选仓并返回该仓渠道', () => {
    const { rule, order, channels, source } = 准备(), before = JSON.stringify({ rule, order, source })
    expect(校验规则配置(rule, [rule], channels)).toBe('')
    expect(检查分仓剩余库存(rule)).toBe('unchecked')
    const result = 试算规则([rule], order, '分仓规则', channels, source)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
    expect(result.aging?.ranked.map(项 => [项.ageDays, 项.systemSku])).toEqual([[180, 'SKU-B'], [120, 'SKU-A']])
    expect(result.gates).toEqual([])
    expect(JSON.stringify({ rule, order, source })).toBe(before)
    expect(读取分仓路由(rule, channels)).toBeUndefined()
    expect(读取分仓候选(rule, channels)).toHaveLength(2)
    expect(分仓配置摘要(rule, channels).join('；')).toContain('FedEx Home Delivery')
  })
  it('单SKU取各仓该SKU最大有效批次库龄，排除无货与不良品，忽略未选择仓', () => {
    const { rule, order, channels, source } = 准备(); order.items.splice(1)
    source[0]!.records = [...source[0]!.records, { ...source[0]!.records[0]!, id: 'batch2', agingDays: 200 }, { ...source[0]!.records[0]!, id: 'empty', agingDays: 999, onHandQty: '0' }, { ...source[0]!.records[0]!, id: 'bad', agingDays: 1000, quality: '不良品' }]
    const result = 计算库龄分仓(rule, order, channels, source)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result.ranked[0]?.ageDays).toBe(200)
    rule.warehouseAction!.ageRoutes!.splice(0, 1)
    expect(计算库龄分仓(rule, order, channels, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('同龄按候选配置顺序，保留来源零天不当缺失，不使用基础暂存路由', () => {
    const { rule, order, channels, source } = 准备()
    source.forEach(项 => { 项.records = 项.records.map(行 => ({ ...行, agingDays: 0 })) })
    rule.warehouseAction!.ageRoutes!.reverse()
    const result = 计算库龄分仓(rule, order, channels, source)
    expect(result.ranked[0]?.ageDays).toBe(0)
    expect(result.route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it.each([{ agingDays: null }, { agingDays: -1 }, { onHandQty: null }, { unit: '' }, { quality: '未知' }, { mapping: '映射冲突' }, { summaryBlocked: true } ] as Partial<AgingRecord>[])('存在待核验库龄%s时不从剩余已知仓兜底', changes => {
    const { rule, order, channels, source } = 准备()
    source[0]!.records = source[0]!.records.map((项, index) => index ? 项 : { ...项, ...changes })
    const result = 计算库龄分仓(rule, order, channels, source)
    expect(result.route).toBeUndefined()
    expect(result.gates.join('；')).toContain('库龄资料缺失或待核验')
  })
  it('缺来源、跨日、重复来源和SKU未解析均不产生最终仓库', () => {
    const { rule, order, channels, source } = 准备()
    expect(计算库龄分仓(rule, order, channels).route).toBeUndefined()
    expect(计算库龄分仓(rule, order, channels, [source[0]!, source[0]!]).gates.join('；')).toContain('唯一')
    source[1]!.snapshotDate = '2026-09-22'
    expect(计算库龄分仓(rule, order, channels, source).route).toBeUndefined()
    source[1]!.snapshotDate = source[0]!.snapshotDate
    order.items[0]!.skuResolutionStatus = '冲突'
    expect(计算库龄分仓(rule, order, channels, source).gates.join('；')).toContain('订单SKU映射')
  })
  it('账号、仓库、来源客户、组织隔离，外部高库龄不会覆盖所选范围', () => {
    const { rule, order, channels, source } = 准备()
    for (const changes of [{ accountId: 'other' }, { warehouseId: 'other' }, { sourceCustomer: 'other' }, { organization: 'other' }]) {
      source[0]!.records = [...source[0]!.records, { ...source[0]!.records[0]!, id: JSON.stringify(changes), agingDays: 9999, ...changes }]
    }
    expect(计算库龄分仓(rule, order, channels, source).ranked[0]?.ageDays).toBe(180)
    expect(计算库龄分仓(rule, order, channels, source).route?.id).toBe('DEMO-CF-CHANNEL-GC')
  })
  it('仓库不可重复，渠道身份错配或停用不能保存', () => {
    const { rule, channels } = 准备()
    rule.warehouseAction!.ageRoutes!.push({ ...rule.warehouseAction!.ageRoutes![0]! })
    expect(校验规则配置(rule, [rule], channels)).toContain('不能重复')
    rule.warehouseAction!.ageRoutes!.pop()
    rule.warehouseAction!.ageRoutes![1]!.channelId = rule.warehouseAction!.ageRoutes![0]!.channelId
    expect(校验规则配置(rule, [rule], channels)).toContain('不属于所选')
  })
})
