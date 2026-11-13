import { describe, expect, it } from 'vitest'
import { 创建拆单演示订单, 创建拆单演示资料, 创建拆单演示规则, 拆单演示渠道 } from './拆单演示资料'
import { 创建默认拆单动作, 计算拆单, 校验拆单动作, 格式化拆单动作, 拆单包裹签名, 拆单方式选项, 拆单依据选项, type 拆单动作配置, type 拆单计算资料, type 拆单规则输入 } from './拆单规则模型'

function scene(index = 0) {
  const order = 创建拆单演示订单()[index]!, data = 创建拆单演示资料([order]), rule = 创建拆单演示规则()[index]!
  return { order, data, rule }
}
function action(overrides: Partial<拆单动作配置> = {}): 拆单动作配置 { return { ...创建默认拆单动作(), basis: 'system', ...overrides } }
function rules(config: 拆单动作配置): 拆单规则输入[] { return [{ id: 'R1', name: '规则1', priority: 10, enabled: true, version: 1, splitAction: config }] }
function quantities(result: ReturnType<typeof 计算拆单>) { return result.packages.map(x => x.items.map(y => y.quantity)) }
function cloneData(data: 拆单计算资料): 拆单计算资料 { return { ...data, products: structuredClone(data.products), stocks: structuredClone(data.stocks), routes: structuredClone(data.routes) } }

describe('拆单数量、来源行与规则连续匹配', () => {
  it('每件拆分完整覆盖原可发数量，原交易及来源资料完全不变', () => {
    const { order, data } = scene(), before = JSON.stringify({ order, data })
    const result = 计算拆单(order, rules(action({ strategy: 'unit' })), data)
    expect(result.errors).toEqual([])
    expect(result.packages).toHaveLength(5)
    expect(result.packages.every(x => x.quantity === 1)).toBe(true)
    expect(JSON.stringify({ order, data })).toBe(before)
    expect(result.splitOccurred).toBe(true)
  })
  it('同SKU多来源行合包但不丢原行及数量', () => {
    const { order, data } = scene(3)
    const bySku = 计算拆单(order, rules(action({ strategy: 'sku' })), data)
    expect(bySku.errors).toEqual([])
    expect(quantities(bySku)).toEqual([[1, 2], [2]])
    expect(bySku.packages[0]!.items.map(x => x.externalLineId)).toEqual(['SPLIT-LINE-1', 'SPLIT-LINE-2'])
  })
  it('指定多个SKU放一起，未选商品独立；不将每种指定SKU各自另包', () => {
    const { order, data } = scene(3)
    const result = 计算拆单(order, rules(action({ strategy: 'selected', selectedSkus: ['SPLIT-ROW-BASKET', 'SPLIT-ROW-HANGER'] })), data)
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.quantity).toBe(5)
    expect(result.splitOccurred).toBe(false)
  })
  it('指定SKU每包最多N件，余数独立一包；未选商品保持一包', () => {
    const { order, data } = scene(3)
    const result = 计算拆单(order, rules(action({ strategy: 'selectedQty', selectedSkus: ['SPLIT-ROW-BASKET'], quantityPerPackage: 2 })), data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 1, 2])
    expect(result.packages[0]!.items).toEqual([{ orderNo: order.systemOrderNo, externalLineId: 'SPLIT-LINE-1', quantity: 1 }, { orderNo: order.systemOrderNo, externalLineId: 'SPLIT-LINE-2', quantity: 1 }])
  })
  it('固定策略不受隐藏的限容草稿影响', () => {
    const { order, data } = scene()
    const result = 计算拆单(order, rules(action({ strategy: 'sku', limits: { maxWeightKg: '0.01', maxQuantity: 1 } })), data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 3])
  })
  it('继续匹配只处理当前父包，不把兄弟包同SKU重新合并', () => {
    const { order, data } = scene(3)
    const first = rules(action({ strategy: 'unit', continueMatching: true }))[0]!
    const second = { ...first, id: 'R2', name: '规则2', priority: 20, splitAction: action({ strategy: 'sku' }) }
    const result = 计算拆单(order, [first, second], data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([1, 1, 1, 1, 1])
    expect(result.matchedRuleIds).toEqual(['R1', 'R2'])
  })
  it('首条命中停止、停用和未命中均有轨迹；无命中不检查分仓或改订单', () => {
    const { order, data } = scene()
    const first = rules(action({ strategy: 'sku' }))[0]!
    const second = { ...first, id: 'R2', priority: 20, splitAction: action({ strategy: 'unit' }) }
    const stopped = 计算拆单(order, [first, second], data)
    expect(stopped.packages).toHaveLength(2)
    expect(stopped.trace.some(x => x.status === '未继续匹配')).toBe(true)
    const skipped = 计算拆单(order, [{ ...first, enabled: false }, second], { ...data, routes: [] }, () => false)
    expect(skipped.trace.map(x => x.status)).toEqual(['停用', '未命中'])
    expect(skipped.errors).toEqual([])
    expect(skipped.matchedRuleIds).toEqual([])
  })
  it('后续匹配回调收到当前包的准确数量，规则只按优先级向后', () => {
    const { order, data } = scene()
    const first = rules(action({ strategy: 'sku', continueMatching: true }))[0]!
    const second = { ...first, id: 'R2', priority: 20, splitAction: action({ strategy: 'unit' }) }
    const seen: number[] = []
    const result = 计算拆单(order, [second, first], data, (rule, _order, items) => { if (rule.id === 'R2') { const q = items.reduce((s, x) => s + x.quantity, 0); seen.push(q); return q > 2 } return true })
    expect(seen).toEqual([2, 3])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 1, 1, 1])
  })
  it('高优先级条件未知阻断后续，不能用低优先级匹配绕过', () => {
    const { order, data } = scene(), first = rules(action())[0]!
    const second = { ...first, id: 'R2', priority: 20 }
    const result = 计算拆单(order, [first, second], data, rule => rule.id === 'R1' ? { matched: false, pending: true, unknownFields: ['产品尺寸'] } : true)
    expect(result.errors[0]).toContain('不能排除')
    expect(result.matchedRuleIds).toEqual([])
    expect(result.packages).toEqual([])
  })
  it('已知组合和类型未知均阻断，不默认为普通商品', () => {
    const { order, data } = scene()
    const copy = cloneData(data); copy.products[0]!.isCombination = true
    expect(计算拆单(order, rules(action()), copy).errors[0]).toContain('组合 SKU')
    delete copy.products[0]!.isCombination
    expect(计算拆单(order, rules(action()), copy).errors[0]).toContain('类型')
  })
  it('未知可发量、超量、重复来源行以及规模上限阻断', () => {
    const { order, data } = scene()
    delete order.items[0]!.fulfillableQuantity
    expect(计算拆单(order, rules(action()), data).errors[0]).toContain('可发数量')
    order.items[0]!.fulfillableQuantity = 100
    expect(计算拆单(order, rules(action()), data).errors[0]).toContain('可发数量')
    order.items[0]!.fulfillableQuantity = 2; order.items[1]!.externalLineId = order.items[0]!.externalLineId
    expect(计算拆单(order, rules(action()), data).errors[0]).toContain('重复')
    const fresh = scene(); fresh.order.items[0]!.fulfillableQuantity = fresh.order.items[0]!.orderedQuantity = 2001
    expect(计算拆单(fresh.order, rules(action()), fresh.data).errors[0]).toContain('2000')
  })
})

describe('智能包裹约束与混装', () => {
  it('重量、件数和金额同时满足，特殊属性与普通商品不混包', () => {
    const { order, data, rule } = scene(2)
    const result = 计算拆单(order, [rule], data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 1, 2])
    expect(result.packages.every(x => Number(x.weightKg) <= 3 && x.quantity <= 3 && Number(x.amount) <= 80)).toBe(true)
    expect(result.packages.every(x => new Set(x.items.map(y => y.externalLineId)).size === 1)).toBe(true)
  })
  it('金额上限使用精确十进制，0.1×3等于0.3可装同包', () => {
    const { order, data } = scene(); order.items = [order.items[0]!]; order.items[0]!.orderedQuantity = order.items[0]!.fulfillableQuantity = 3; order.items[0]!.unitPrice.value = '0.1'
    const result = 计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxAmount: '0.3', currency: 'USD' } })), data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([3])
    expect(result.packages[0]!.amount).toBe('0.3')
  })
  it('单件超重失败、缺单重失败，不通过增加包裹或平均整单重量解决', () => {
    const over = scene(4), missing = scene(5)
    expect(计算拆单(over.order, [over.rule], over.data).errors[0]).toContain('单件')
    expect(计算拆单(missing.order, [missing.rule], missing.data).errors[0]).toContain('未完整取得')
  })
  it('最长边差额强制分开；零差额也是真正生效的限制', () => {
    const { order, data } = scene()
    const result = 计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxLongestDifferenceCm: '0' } })), data)
    expect(result.errors).toEqual([])
    expect(result.packages).toHaveLength(2)
  })
  it('必须同包的选中商品超限整体失败，不偷偷拆开', () => {
    const { order, data } = scene()
    const result = 计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxQuantity: 1 }, mixing: { mode: 'togetherSelected', skus: ['SPLIT-BASIC-BOX'], attributes: [] } })), data)
    expect(result.errors[0]).toContain('必须同包')
    expect(result.packages).toHaveLength(0)
  })
  it('连续规则不能拆散前序已确定的强制同包组', () => {
    const { order, data } = scene()
    const first = rules(action({ strategy: 'capacity', continueMatching: true, mixing: { mode: 'togetherSelected', skus: ['SPLIT-BASIC-BOX', 'SPLIT-BASIC-MAT'], attributes: [] } }))[0]!
    const second = { ...first, id: 'R2', priority: 20, splitAction: action({ strategy: 'unit' }) }
    const result = 计算拆单(order, [first, second], data)
    expect(result.errors[0]).toContain('前序规则要求必须同包')
    expect(result.routable).toBe(false)
  })
  it('必须分开限制单独可用，同包限制允许整个所选组与普通商品合包', () => {
    const { order, data } = scene()
    const separated = 计算拆单(order, rules(action({ strategy: 'capacity', mixing: { mode: 'separateSelected', skus: ['SPLIT-BASIC-BOX'], attributes: [] } })), data)
    expect(separated.errors).toEqual([])
    expect(separated.packages.map(x => x.quantity)).toEqual([2, 3])
    const together = 计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxQuantity: 5 }, mixing: { mode: 'togetherSelected', skus: ['SPLIT-BASIC-BOX'], attributes: [] } })), data)
    expect(together.errors).toEqual([])
    expect(together.packages.map(x => x.quantity)).toEqual([5])
  })
  it('不同金额币种不混比，已开启却空白的限制不能保存', () => {
    const { order, data } = scene(); order.items[0]!.unitPrice.currency = 'EUR'
    expect(计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxAmount: '100', currency: 'USD' } })), data).errors[0]).toContain('币种')
    expect(校验拆单动作(action({ strategy: 'capacity', limits: { maxWeightKg: '', maxQuantity: 2 } }))).toContain('重量')
  })
})

describe('商品拆分与后续分仓职责分离', () => {
  it('保留五种方式，默认值与摘要不包含路由配置', () => {
    expect(拆单方式选项.map(x => x.value)).toEqual(['unit', 'sku', 'selected', 'selectedQty', 'capacity'])
    expect(创建默认拆单动作()).not.toHaveProperty('routing')
    expect(格式化拆单动作(action())).not.toMatch(/比价|渠道|路由|分仓/)
  })
  it('旧每行及大件策略明确拒绝，不静默改成其他策略', () => {
    const { order, data } = scene()
    for (const strategy of ['line', 'large']) {
      const legacy = { ...action(), strategy } as unknown as 拆单动作配置
      expect(校验拆单动作(legacy)).toContain('已移除')
      const result = 计算拆单(order, rules(legacy), data)
      expect(result.errors[0]).toContain('已移除')
      expect(result.packages).toEqual([])
    }
  })
  it('指定SKU样例仅形成商品包裹，全部路由与运费留待独立分仓', () => {
    const { order, data, rule } = scene(1), original = JSON.stringify(order.defaultRoute)
    const result = 计算拆单(order, [rule], data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([1, 1])
    expect(result.routable).toBe(false)
    expect(result.packages.every(x => !x.route && !x.channelId && !x.freightAmount && !x.freightCurrency && x.candidates.length === 0)).toBe(true)
    expect(JSON.stringify(order.defaultRoute)).toBe(original)
  })
  it('没有默认仓或渠道库存资料也可按系统SKU形成拆分候选', () => {
    const { order, data, rule } = scene()
    delete order.defaultRoute
    data.routes = []; data.stocks = []
    const result = 计算拆单(order, [rule], data)
    expect(result.errors).toEqual([])
    expect(result.packages.map(x => x.quantity)).toEqual([2, 3])
    expect(result.routable).toBe(false)
  })
  it('停用渠道、不适用国家及库存不足不影响商品拆分结果', () => {
    const { order, data, rule } = scene(1)
    const before = 计算拆单(order, [rule], data)
    data.routes[0]!.enabled = false
    data.routes[0]!.countries = ['DE']
    data.routes[0]!.maxWeightKg = '0.01'
    for (const stock of data.stocks) { stock.available = 0; stock.verified = false; stock.unit = '箱' }
    const after = 计算拆单(order, [rule], data)
    expect(after.errors).toEqual([])
    expect(after.packages).toEqual(before.packages)
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint)
  })
  it('拆单阶段不请求报价，也不沿用旧配置中的逐包比价动作', () => {
    const { order, data } = scene()
    data.quote = () => { throw new Error('不应调用报价') }
    const legacy = { ...action(), routing: { mode: 'price', candidateChannelIds: [...拆单演示渠道] } }
    const result = 计算拆单(order, rules(legacy), data)
    expect(result.errors).toEqual([])
    expect(result.packages.every(x => !x.route && x.candidates.length === 0)).toBe(true)
  })
  it('默认系统SKU，仅开放平台和系统依据，旧仓库SKU依据即使范围有效也拒绝执行', () => {
    const { order, data } = scene()
    expect(创建默认拆单动作().basis).toBe('system')
    expect(拆单依据选项.map(option => option.value)).toEqual(['system', 'platform'])
    expect(校验拆单动作(创建默认拆单动作())).toBe('')
    for (const warehouseScopeId of [undefined, 拆单演示渠道[0]]) {
      const legacy = action({ basis: 'warehouse', warehouseScopeId }), before = JSON.stringify(legacy)
      expect(校验拆单动作(legacy)).toContain('已移除')
      const result = 计算拆单(order, rules(legacy), data)
      expect(result.errors[0]).toContain('已移除')
      expect(result.packages).toEqual([])
      expect(JSON.stringify(legacy)).toBe(before)
    }
  })
  it.each(['依据', '条件'] as const)('旧仓库SKU%s不能被条件不匹配或低优先级规则绕过', kind => {
    const { order, data } = scene()
    const legacy = rules(action(kind === '依据' ? { basis: 'warehouse' } : {}))[0]!
    if (kind === '条件') legacy.conditions = [{ field: 'warehouseSku' }]
    const lower = { ...rules(action())[0]!, id: 'LOWER', priority: 20 }
    const seen: string[] = []
    const result = 计算拆单(order, [legacy, lower], data, rule => { seen.push(rule.id); return rule.id === 'LOWER' })
    expect(result.errors[0]).toContain('已移除')
    expect(result.packages).toEqual([])
    expect(seen).toEqual([])
    expect(result.trace[0]!.status).toBe('失败')
    legacy.enabled = false
    expect(计算拆单(order, [legacy, lower], data).errors).toEqual([])
  })
  it('同系统SKU在不同仓库编码不同或映射未知不改变拆分；遗留范围不参与商品识别', () => {
    const { order, data, rule } = scene()
    const before = 计算拆单(order, [rule], data)
    data.products.forEach(product => { product.warehouseMappings = [{ scopeId: 'unknown-a', warehouseSku: 'ACCOUNT-A-CODE' }, { scopeId: 'unknown-b', warehouseSku: 'ACCOUNT-B-CODE' }] })
    data.routes = []
    const after = 计算拆单(order, [rule], data)
    expect(after.errors).toEqual([])
    expect(after.packages).toEqual(before.packages)
    expect(after.sourceFingerprint).toBe(before.sourceFingerprint)
    const residual = { ...rule, splitAction: { ...rule.splitAction!, warehouseScopeId: 'OLD-UNUSED-SCOPE' } }
    expect(计算拆单(order, [residual], data).packages).toEqual(before.packages)
  })
  it('固定拆分不因缺失未使用重量而失败；智能重量限制仍保护缺资料', () => {
    const { order, data } = scene()
    delete data.products[0]!.weightKg
    const basic = 计算拆单(order, rules(action()), data)
    expect(basic.errors).toEqual([])
    expect(basic.packages[0]!.weightKg).toBeUndefined()
    const limited = 计算拆单(order, rules(action({ strategy: 'capacity', limits: { maxWeightKg: '5' } })), data)
    expect(limited.errors[0]).toContain('未完整取得')
  })
  it('包裹签名按来源行与数量稳定，不因数组顺序变化串单', () => {
    const items = [{ orderNo: 'O', externalLineId: 'L1', quantity: 2 }, { orderNo: 'O', externalLineId: 'L2', quantity: 1 }]
    expect(拆单包裹签名(items)).toBe(拆单包裹签名([...items].reverse()))
    expect(拆单包裹签名(items)).not.toBe(拆单包裹签名([{ ...items[0]!, quantity: 1 }, items[1]!]))
  })
})
