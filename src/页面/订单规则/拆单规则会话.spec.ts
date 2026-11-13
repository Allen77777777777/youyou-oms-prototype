import { beforeEach, describe, expect, it } from 'vitest'
import * as session from './拆单规则会话'
import * as orders from '../订单处理/演示会话'
import * as rules from './演示会话'
import * as inventory from '../订单处理/库存关联模型'
import * as channels from '../仓配管理/仓配会话'
import { 人工发货操作阻断原因 } from '../订单处理/拆合发货模型'
import { 执行待审核规则轮次 } from '../订单处理/审单规则执行'
import { 校验规则配置 } from './规则逻辑'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const order = (id = 'OMS-SPLIT-01') => orders.共享订单.value.find(row => row.systemOrderNo === id)!

session.初始化拆单规则演示()
const baseline = clone({ orders: orders.共享订单.value, rules: rules.共享规则.value, channels: channels.渠道会话.value, inventory: inventory.关联演示数据.inventory, mappings: inventory.关联演示数据.mappings, versions: orders.订单版本.value, warehouses: orders.仓库执行记录.value })
beforeEach(() => {
  orders.共享订单.value = clone(baseline.orders)
  orders.订单版本.value = clone(baseline.versions)
  orders.仓库执行记录.value = clone(baseline.warehouses)
  rules.共享规则.value = clone(baseline.rules)
  channels.渠道会话.value = clone(baseline.channels)
  inventory.关联演示数据.inventory = clone(baseline.inventory)
  inventory.关联演示数据.mappings = clone(baseline.mappings)
})
function save(id = 'OMS-SPLIT-01') {
  const result = session.试算拆单规则(id)
  expect(result.errors).toEqual([])
  const saved = session.应用拆单规则结果(result)
  expect(saved.成功, saved.信息).toBe(true)
  return { result, draft: order(id).ruleSplitDraft! }
}

describe('拆单阶段与后续分仓、审单职责', () => {
  it('试算只读，保存仅形成待分仓候选；独立分仓后仍须审核才生成履约', () => {
    const source = order()
    const before = JSON.stringify(source)
    const stock = JSON.stringify(inventory.关联演示数据.inventory)
    const result = session.试算拆单规则(source.systemOrderNo)
    expect(result.errors).toEqual([])
    expect(result.packages.map(p => p.quantity)).toEqual([2, 3])
    expect(result.packages.every(p => !p.route)).toBe(true)
    expect(JSON.stringify(source)).toBe(before)
    const sales = clone({ amount: source.amount, items: source.items, platformOrderNo: source.platformOrderNo, address: source.address, defaultRoute: source.defaultRoute })
    expect(session.应用拆单规则结果(result).成功).toBe(true)
    expect(source.processingStatus).toBe('待审核')
    expect(source.manualShippingPlan).toBeUndefined()
    expect(source.ruleSplitDraft?.createdByRule.rules[0]?.configurationSnapshot).toContain('splitAction')
    expect(source.ruleSplitDraft?.createdByRule.resultSnapshot).toContain('trace')
    expect(source.fulfillmentOrders).toEqual([])
    expect(source.reviews).toEqual([])
    expect({ amount: source.amount, items: source.items, platformOrderNo: source.platformOrderNo, address: source.address, defaultRoute: source.defaultRoute }).toEqual(sales)
    const logs = source.operationLogs.length
    expect(session.应用拆单规则结果(result).成功).toBe(true)
    expect(source.operationLogs).toHaveLength(logs)
    expect(orders.执行演示审核(source.systemOrderNo, orders.当前版本(source.systemOrderNo)).成功).toBe(false)
    const routed = session.执行拆单后分仓(source.systemOrderNo, source.ruleSplitDraft!.id)
    expect(routed.成功, routed.信息).toBe(true)
    expect(source.ruleSplitDraft).toBeUndefined()
    expect(source.manualShippingPlan?.packages).toHaveLength(2)
    expect(source.fulfillmentOrders).toEqual([])
    const review = orders.执行演示审核(source.systemOrderNo, orders.当前版本(source.systemOrderNo))
    expect(review.成功, review.信息).toBe(true)
    expect(source.processingStatus).toBe('待推单')
    expect(source.fulfillmentOrders.map(p => p.plannedQuantity)).toEqual([2, 3])
    expect(orders.仓库执行记录.value.filter(row => row.订单号.includes(source.systemOrderNo))).toEqual([])
    expect(JSON.stringify(inventory.关联演示数据.inventory)).toBe(stock)
  })

  it('无默认仓也能保存；不把来源交易金额改成本包商品金额', () => {
    delete order().defaultRoute
    const amount = clone(order().amount)
    const { draft } = save()
    expect(order().defaultRoute).toBeUndefined()
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).成功).toBe(true)
    expect(order().amount).toEqual(amount)
  })

  it.each(['订单', '规则', '平台至系统SKU配对'] as const)('%s变化使旧拆单试算失效', target => {
    const result = session.试算拆单规则(order().systemOrderNo)
    if (target === '订单') order().items[0]!.fulfillableQuantity = 1
    if (target === '规则') rules.共享规则.value.find(row => row.id === 'RULE-SPLIT-01')!.version++
    if (target === '平台至系统SKU配对') order().items[0]!.systemSku = 'CHANGED-SYSTEM-SKU'
    const before = JSON.stringify(order())
    expect(session.拆单试算已过期(result)).toBe(true)
    expect(session.应用拆单规则结果(result).成功).toBe(false)
    expect(JSON.stringify(order())).toBe(before)
  })

  it('库存与渠道变动不改变拆分组成；在后续分仓检查并保留失败候选', () => {
    const result = session.试算拆单规则(order().systemOrderNo)
    inventory.关联演示数据.inventory.find(row => row.id === 'order-demo-winit-SPLIT-BASIC-BOX')!.quantities.available = 0
    channels.渠道会话.value.find(row => row.id === 'DEMO-CF-CHANNEL-WYT')!.enabled = false
    expect(session.拆单试算已过期(result)).toBe(false)
    expect(session.应用拆单规则结果(result).成功).toBe(true)
    const before = JSON.stringify(order())
    expect(session.执行拆单后分仓(order().systemOrderNo, order().ruleSplitDraft!.id).成功).toBe(false)
    expect(JSON.stringify(order())).toBe(before)
  })

  it('待分仓时自动审单跳过，不追加审核或解除首轮；也不能人工重编或合单', () => {
    order().initialReviewPending = true
    const { draft } = save()
    const result = 执行待审核规则轮次('立即执行')
    expect(result.明细.find(row => row.订单号 === order().systemOrderNo)?.结果).toBe('跳过')
    expect(order().initialReviewPending).toBe(true)
    expect(order().reviews).toEqual([])
    expect(人工发货操作阻断原因(orders.人工发货上下文(), [order().systemOrderNo], '拆分发货').join()).toContain('待分仓')
    expect(人工发货操作阻断原因(orders.人工发货上下文(), [order().systemOrderNo, 'OMS-SPLIT-02'], '合并发货').join()).toContain('不参与合单')
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).成功).toBe(true)
    expect(order().initialReviewPending).toBe(true)
    expect(order().reviews).toEqual([])
  })

  it('防篡改且已有待分仓结果不能被新试算覆盖', () => {
    const result = session.试算拆单规则(order().systemOrderNo)
    const tampered = clone(result)
    tampered.packages[0]!.items[0]!.quantity = 99
    expect(session.应用拆单规则结果(tampered).成功).toBe(false)
    expect(session.应用拆单规则结果(result).成功).toBe(true)
    const before = JSON.stringify(order())
    const another = session.试算拆单规则(order().systemOrderNo)
    expect(another.errors.join()).toContain('待分仓')
    expect(session.应用拆单规则结果(another).成功).toBe(false)
    expect(JSON.stringify(order())).toBe(before)
    order().ruleSplitDraft!.packages[0]!.items[0]!.quantity = 99
    expect(session.执行拆单后分仓(order().systemOrderNo, order().ruleSplitDraft!.id).成功).toBe(false)
    expect(order().manualShippingPlan).toBeUndefined()
  })

  it.each(['异常', '部分履约', '仓库执行'] as const)('拒绝%s订单自动拆分', condition => {
    if (condition === '异常') order().processingStatus = '异常'
    if (condition === '部分履约') order().platformOrderStatus = 'IN_PROGRESS'
    if (condition === '仓库执行') order().fulfillmentOrders.push({ fulfillmentOrderNo: 'TEST-ACTIVE', isActive: true, status: '执行中', route: clone(order().defaultRoute!), plannedQuantity: 5, shippedQuantity: 0 })
    const result = session.试算拆单规则(order().systemOrderNo)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(session.应用拆单规则结果(result).成功).toBe(false)
    expect(order().ruleSplitDraft).toBeUndefined()
  })

  it('库存不足及未知仓库映射留在分仓阶段，不回退或拆单阶段分仓', () => {
    const result = session.试算拆单规则(order().systemOrderNo)
    inventory.关联演示数据.mappings.push({ scopeId: 'order-demo-winit', systemSku: 'SPLIT-BASIC-BOX', warehouseSku: 'UNKNOWN-BOX', status: '待核实' })
    expect(session.拆单试算已过期(result)).toBe(false)
    expect(session.应用拆单规则结果(result).成功).toBe(true)
    const draft = order().ruleSplitDraft!
    const routed = session.执行拆单后分仓(order().systemOrderNo, draft.id)
    expect(routed.成功).toBe(false)
    expect(order().ruleSplitDraft?.id).toBe(draft.id)
    expect(order().manualShippingPlan).toBeUndefined()
  })

  it.each(['依据', '条件'] as const)('当前会话中的旧仓库SKU%s不被样例初始化迁移或低优先级规则绕过', kind => {
    const legacy = rules.共享规则.value.find(row => row.id === 'RULE-SPLIT-01')!
    if (kind === '依据') { legacy.splitAction!.basis = 'warehouse'; legacy.splitAction!.warehouseScopeId = 'DEMO-CF-CHANNEL-WYT' }
    else legacy.conditions = [{ field: 'warehouseSku', operator: '包含', value: 'WYT-SPLIT-BASIC-BOX' }]
    const originalRule = JSON.stringify(legacy), originalOrder = JSON.stringify(order())
    session.初始化拆单规则演示()
    const result = session.试算拆单规则(order().systemOrderNo)
    expect(result.errors.join()).toContain('已移除')
    expect(session.应用拆单规则结果(result).成功).toBe(false)
    expect(JSON.stringify(legacy)).toBe(originalRule)
    expect(JSON.stringify(order())).toBe(originalOrder)
  })

  it('来源变化须重算，允许撤销未执行候选后重新生成', () => {
    const { draft } = save()
    order().items[0]!.fulfillableQuantity = 1
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).信息).toContain('已变化')
    expect(session.撤销规则拆分结果(order().systemOrderNo, draft.id).成功).toBe(true)
    expect(order().ruleSplitDraft).toBeUndefined()
    expect(order().items[0]!.fulfillableQuantity).toBe(1)
    expect(session.应用拆单规则结果(session.试算拆单规则(order().systemOrderNo)).成功).toBe(true)
  })

  it('取消或映射失效后可撤销候选，但已有执行不能撤销', () => {
    const { draft } = save()
    order().processingStatus = '异常'
    order().blockReason = '平台取消'
    order().items[0]!.skuResolutionStatus = '失效'
    expect(session.撤销规则拆分结果(order().systemOrderNo, draft.id).成功).toBe(true)
    expect(order().processingStatus).toBe('异常')
    expect(order().blockReason).toBe('平台取消')
  })

  it('高优先级分仓条件未知不滑到低优先级已知规则', () => {
    const { draft } = save()
    const rule = clone(rules.共享规则.value.find(row => row.id === 'RULE-ROUTE-01')!)
    rule.id = 'ROUTE-PENDING'; rule.name = '重量待核实优先分仓'; rule.priority = 1
    rule.conditions = [{ field: 'orderWeight', operator: '介于', value: '1', upperValue: '5' }]
    rules.共享规则.value.push(rule)
    expect(校验规则配置(rule, rules.共享规则.value, channels.渠道会话.value)).toBe('')
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).成功).toBe(false)
    expect(order().manualShippingPlan).toBeUndefined()
  })

  it('缺失重量与单件超限保持错误，不保存候选', () => {
    for (const id of ['OMS-SPLIT-05', 'OMS-SPLIT-06']) {
      const result = session.试算拆单规则(id)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(session.应用拆单规则结果(result).成功).toBe(false)
      expect(order(id).ruleSplitDraft).toBeUndefined()
    }
  })

  it('分仓后渠道停用不能通过审核，候选撤销不能越过新出库事实', () => {
    const { draft } = save()
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).成功).toBe(true)
    channels.渠道会话.value.find(row => row.id === order().manualShippingPlan!.packages[0]!.route.shippingChannelId)!.enabled = false
    const reviewed = orders.执行演示审核(order().systemOrderNo, orders.当前版本(order().systemOrderNo))
    expect(reviewed.成功).toBe(false)
    expect(order().fulfillmentOrders).toEqual([])
    const other = save('OMS-SPLIT-02')
    order('OMS-SPLIT-02').fulfillmentOrders.push({ fulfillmentOrderNo: 'NEW-SHIPPED', isActive: true, status: '已发货', route: clone(order('OMS-SPLIT-02').defaultRoute!), plannedQuantity: 1, shippedQuantity: 1 })
    expect(session.撤销规则拆分结果('OMS-SPLIT-02', other.draft.id).成功).toBe(false)
    expect(order('OMS-SPLIT-02').ruleSplitDraft).toBeDefined()
  })

  it('拆单完成分仓后，高优先级审单资料未知时不滑向低级自动规则', () => {
    const { draft } = save()
    expect(session.执行拆单后分仓(order().systemOrderNo, draft.id).成功).toBe(true)
    const first = clone(rules.共享规则.value.find(row => row.id === 'RULE-REVIEW-01')!)
    first.id = 'SPLIT-REVIEW-UNKNOWN'; first.name = '拆单重量待核实优先审单'; first.priority = 1
    first.conditions = [{ field: 'orderWeight', operator: '介于', value: '1', upperValue: '5' }]
    const fallback = clone(first)
    fallback.id = 'SPLIT-REVIEW-AUTO'; fallback.name = '低优先级自动审单'; fallback.priority = 20; fallback.action = '自动审核'
    fallback.conditions = [{ field: 'platformSku', operator: '包含', value: 'SPLIT-BASIC-' }]
    rules.共享规则.value = [first, fallback]
    expect(校验规则配置(first, rules.共享规则.value, channels.渠道会话.value)).toBe('')
    const result = 执行待审核规则轮次('立即执行')
    expect(result.明细.find(row => row.订单号 === order().systemOrderNo)?.结果).toBe('跳过')
    expect(order().reviews).toEqual([])
    expect(order().fulfillmentOrders).toEqual([])
  })
})
