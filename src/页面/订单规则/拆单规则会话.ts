import { ref } from 'vue'
import type { 全渠道订单, 人工发货方案, 规则拆单候选, 订单路由 } from '../全渠道订单/类型'
import { 共享订单, 当前版本, 人工发货上下文, 操作核查证据, 记录操作 } from '../订单处理/演示会话'
import { 人工发货操作阻断原因, 保存人工发货方案, 校验人工发货方案, 发货执行安全阻断原因 } from '../订单处理/拆合发货模型'
import { 关联演示数据 } from '../订单处理/库存关联模型'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 共享规则 } from './演示会话'
import { 校验规则配置, 试算规则, type 订单规则 } from './规则逻辑'
import { 拆单条件匹配 } from './拆单条件评估'
import { 计算拆单, type 拆单计算资料, type 拆单计算结果 } from './拆单规则模型'
import { 创建拆单演示订单, 创建拆单演示规则, 创建拆单演示资料 } from './拆单演示资料'
import { 初始化订单处理人 } from '../订单处理/处理人模型'
import { 校验拆单平台SKU选择 } from './拆单平台SKU'

/** 本地评审适配器：规则、订单和库存与现有工作台共享，绝不写外部仓库。 */
export const 拆单资料版本 = ref(1)
export interface 拆单规则试算 extends 拆单计算结果 {
  mode: 'saved'
  id: string
  orderNo: string
  sourceVersion: number
  snapshot: string
}
/** 编辑中的单规则预览不登记为可应用结果，与正式规则集合试算保持类型隔离。 */
export interface 拆单草稿试算 extends 拆单计算结果 {
  mode: 'draft'
  orderNo: string
  snapshot: string
}
const 克隆 = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
let 已初始化 = false
const 试算登记 = new Map<string, 拆单规则试算>()
const 已应用 = new Map<string, string>()
const 候选登记 = new Map<string, string>()

export function 初始化拆单规则演示(): void {
  if (已初始化) return
  已初始化 = true
  const 新订单 = 创建拆单演示订单()
  for (const order of 新订单) if (!共享订单.value.some(row => row.systemOrderNo === order.systemOrderNo)) {
    初始化订单处理人(order, order.createdAt)
    共享订单.value.push(order)
  }
  for (const rule of 创建拆单演示规则()) if (!共享规则.value.some(row => row.id === rule.id)) 共享规则.value.push(rule as 订单规则)
  const 资料 = 创建拆单演示资料(共享订单.value)
  // 将固定虚构来源登记到已有只读库存集合，审核、人工编辑及本次试算使用同一来源。
  for (const stock of 资料.stocks) {
    const scope = 关联演示数据.scopes.find(row => row.id === stock.scopeId)
    if (!scope) continue
    const products = 资料.products.filter(row => row.warehouseMappings.some(mapping => mapping.scopeId === stock.scopeId && mapping.warehouseSku === stock.warehouseSku))
    const skus = [...new Set(products.flatMap(product => {
      const item = 共享订单.value.find(order => order.systemOrderNo === product.orderNo)?.items.find(row => row.externalLineId === product.externalLineId)
      return item?.systemSku ? [item.systemSku] : []
    }))]
    for (const systemSku of skus) {
      if (!关联演示数据.mappings.some(row => row.scopeId === scope.id && row.systemSku === systemSku && row.warehouseSku === stock.warehouseSku)) {
        关联演示数据.mappings.push({ scopeId: scope.id, systemSku, warehouseSku: stock.warehouseSku, status: '已映射' })
      }
    }
    if (关联演示数据.inventory.some(row => row.id === stock.sourceId)) continue
    const item = products[0] && 共享订单.value.find(order => order.systemOrderNo === products[0]!.orderNo)?.items.find(row => row.externalLineId === products[0]!.externalLineId)
    关联演示数据.inventory.push({
      ...scope, id: stock.sourceId, sourceCustomer: 'SPLIT-DEMO-CUSTOMER', warehouseSku: stock.warehouseSku,
      quality: '良品', unit: stock.unit, systemSku: skus[0] || '', name: item?.systemItemName || '商品', specification: '', batchNo: '',
      quantities: { available: stock.available, reserved: null, unavailable: null, transit: null, onHand: null, defective: null, frozen: null, putaway: null },
      mapping: '已映射', issues: stock.verified ? [] : ['来源尚待核实'], enabled: true, presence: '已确认存在',
      updatedAt: '2026-11-13T01:00:00Z', sourceAt: '2026-11-13T00:59:00Z', lastAttempt: '2026-11-13T01:00:00Z', attemptResult: '成功',
    })
  }
}

export function 读取拆单试算订单(): 全渠道订单[] {
  初始化拆单规则演示()
  return [...共享订单.value].sort((a, b) => Number(b.systemOrderNo.startsWith('OMS-SPLIT-')) - Number(a.systemOrderNo.startsWith('OMS-SPLIT-')))
}

export function 读取当前拆单资料(): 拆单计算资料 {
  const data = 创建拆单演示资料(共享订单.value)
  // 拆单仅使用平台／系统 SKU 和商品资料；仓库映射、渠道及库存仍由独立分仓读取。
  // 样例创建器保留既有字段契约，供初始化分仓演示资料及历史数据使用。
  return { ...data, sourceVersion: `${data.sourceVersion}:${拆单资料版本.value}` }
}

function 拆单规则集合() { return 共享规则.value.filter(rule => rule.type === '拆单规则') }
function 当前指纹(orderNo: string, data = 读取当前拆单资料()): string {
  return JSON.stringify({ order: 共享订单.value.find(order => order.systemOrderNo === orderNo), version: 当前版本(orderNo),
    rules: 拆单规则集合(), data: { sourceVersion: data.sourceVersion, products: data.products.map(({ warehouseMappings: _warehouseMappings, ...product }) => product) },
    evidence: 操作核查证据.value[orderNo] })
}
function 执行阻断(order: 全渠道订单, 忽略候选 = false): string[] {
  const source = 克隆(order)
  if (忽略候选) delete source.ruleSplitDraft
  const reasons = 人工发货操作阻断原因({ ...人工发货上下文(), 规则拆单: true, 订单: 共享订单.value.map(row => row.systemOrderNo === order.systemOrderNo ? source : row) }, [order.systemOrderNo], '拆分发货')
  if (order.manualShippingPlan) reasons.push('已有发货安排，请在订单处理中编辑或撤销；规则不会覆盖现有安排')
  if (order.platformCode === 'eBay' && ['IN_PROGRESS', 'FULFILLED'].includes(order.platformOrderStatus || '')) reasons.push('平台已有履约记录，请先人工核实实际发货范围')
  const evidence = 操作核查证据.value[order.systemOrderNo]
  if (evidence?.平台允许 === false || evidence?.剩余已核实 === false || evidence?.范围已核清 === false || evidence?.范围无重叠 === false || evidence?.发货资料有效 === false || evidence?.路由适用 === false) reasons.push('订单存在未完成的发货条件核查，请先在订单处理中处理')
  return [...new Set(reasons)]
}

export function 试算拆单规则(orderNo: string): 拆单规则试算 {
  初始化拆单规则演示()
  const data = 读取当前拆单资料()
  const orders = 共享订单.value.filter(order => order.systemOrderNo === orderNo)
  const order = orders[0]
  const rules = 拆单规则集合()
  const empty: 拆单计算结果 = { packages: [], trace: [], errors: ['订单不存在或身份不唯一，请重新选择'], warnings: [], matchedRuleIds: [], ruleSnapshots: [], sourceFingerprint: '', splitOccurred: false, totalQuantity: 0, routable: false }
  const calculated = order && orders.length === 1 ? 计算拆单(order, rules, data, (rule, scopedOrder, items) => {
    const original = rules.find(item => item.id === rule.id)
    if (!original) return false
    const issue = 校验规则配置(original, 共享规则.value, 渠道会话.value)
    if (issue) return { matched: false, pending: true, unknownFields: [issue] }
    return 拆单条件匹配(original, scopedOrder, items, data, 渠道会话.value)
  }) : empty
  if (order && orders.length === 1) calculated.errors = [...new Set([...执行阻断(order), ...calculated.errors])]
  const result: 拆单规则试算 = { ...calculated, mode: 'saved', id: `SPLIT-RUN-${crypto.randomUUID()}`, orderNo, sourceVersion: 当前版本(orderNo), snapshot: 当前指纹(orderNo, data) }
  试算登记.set(result.id, 克隆(result))
  // 只保留近期只读试算，不创建业务单据或无限累积会话内存。
  if (试算登记.size > 100) 试算登记.delete(试算登记.keys().next().value!)
  return result
}

export function 拆单试算已过期(result: 拆单规则试算): boolean {
  return !result || result.mode !== 'saved' || result.snapshot !== 当前指纹(result.orderNo)
}

function 草稿试算指纹(orderNo: string, draft: 订单规则, data = 读取当前拆单资料()): string {
  return JSON.stringify({ draft, source: 当前指纹(orderNo, data) })
}

export function 试算当前拆单草稿(orderNo: string, draft: 订单规则): 拆单草稿试算 {
  const data = 读取当前拆单资料()
  const orders = 共享订单.value.filter(order => order.systemOrderNo === orderNo)
  const order = orders[0]
  const rule = 克隆(draft)
  // 仅计算副本参与匹配，绝不改变草稿或共享配置的启停状态。
  rule.enabled = true
  if (rule.splitAction) {
    rule.splitAction.selectedSkus = [...new Set(rule.splitAction.selectedSkus.map(value => value.trim()).filter(Boolean))]
    rule.splitAction.mixing.skus = [...new Set(rule.splitAction.mixing.skus.map(value => value.trim()).filter(Boolean))]
  }
  const issue = rule.type !== '拆单规则' ? '请选择拆单规则草稿'
    : 校验规则配置(rule, 共享规则.value, 渠道会话.value) || 校验拆单平台SKU选择(rule.splitAction, 共享订单.value)
  const empty: 拆单计算结果 = { packages: [], trace: [], errors: [], warnings: [], matchedRuleIds: [], ruleSnapshots: [], sourceFingerprint: '', splitOccurred: false, totalQuantity: 0, routable: false }
  const calculated = order && orders.length === 1 && !issue
    ? 计算拆单(order, [rule], data, (candidate, scopedOrder, items) => 拆单条件匹配(candidate, scopedOrder, items, data, 渠道会话.value))
    : { ...empty, errors: [issue || '订单不存在或身份不唯一，请重新选择'] }
  if (order && orders.length === 1) calculated.errors = [...new Set([...执行阻断(order), ...calculated.errors])]
  return { ...calculated, mode: 'draft', orderNo, snapshot: 草稿试算指纹(orderNo, draft, data) }
}

export function 拆单草稿试算已过期(result: 拆单草稿试算, draft: 订单规则): boolean {
  return !result || result.mode !== 'draft' || result.snapshot !== 草稿试算指纹(result.orderNo, draft)
}

function 来源快照(order: 全渠道订单): string {
  const source = 克隆(order)
  delete source.ruleSplitDraft
  source.operationLogs = []
  return JSON.stringify(source)
}

export function 应用拆单规则结果(result: 拆单规则试算): { 成功: boolean; 信息: string; 方案?: 规则拆单候选 } {
  if (!result || result.mode !== 'saved') return { 成功: false, 信息: '草稿试算仅供预览，请保存规则后从列表重新试算' }
  const previous = 已应用.get(result.id)
  const order = 共享订单.value.find(row => row.systemOrderNo === result.orderNo)
  if (previous) return order?.ruleSplitDraft?.id === previous
    ? { 成功: true, 信息: '拆分结果已保存，等待逐包分仓', 方案: 克隆(order.ruleSplitDraft) }
    : { 成功: false, 信息: '该试算已使用且原安排已变化，请重新试算' }
  const original = 试算登记.get(result.id)
  if (!original || JSON.stringify(original) !== JSON.stringify(result)) return { 成功: false, 信息: '试算结果已变化或失效，请重新试算' }
  if (!order || 拆单试算已过期(original)) return { 成功: false, 信息: '订单、规则或商品资料已变化，请重新试算' }
  const blockers = [...执行阻断(order), ...original.errors]
  if (!original.splitOccurred || original.packages.length < 2) blockers.push('当前没有形成两个及以上包裹，无需保存拆单方案')
  if (blockers.length) return { 成功: false, 信息: [...new Set(blockers)].join('；') }
  const plan: 规则拆单候选 = {
    id: `RSP-${result.id.slice('SPLIT-RUN-'.length)}`,
    packages: original.packages.map(parcel => ({ key: parcel.key, items: 克隆(parcel.items) })),
    reason: `命中拆单规则：${original.ruleSnapshots.map(rule => `${rule.name}（v${rule.version}）`).join('、')}`,
    createdAt: new Date().toISOString(), sourceVersion: 0, sourceSnapshot: 来源快照(order), createdByRule: {
      executionId: result.id,
      rules: original.ruleSnapshots.map(rule => ({ id: rule.id, name: rule.name, version: rule.version, configurationSnapshot: JSON.stringify(rule) })),
      appliedAt: new Date().toISOString(), sourceVersion: result.sourceVersion,
      inputSnapshot: original.snapshot,
      resultSnapshot: JSON.stringify({ packages: original.packages, trace: original.trace, sourceFingerprint: original.sourceFingerprint, warnings: original.warnings }),
    },
  }
  order.ruleSplitDraft = plan
  记录操作(order, '保存拆分结果', `${plan.reason}；形成 ${plan.packages.length} 个待分仓包裹，仅跳过合单，继续分仓、审单及系统默认审单。`, true, '当前操作员')
  plan.sourceVersion = 当前版本(order.systemOrderNo)
  已应用.set(result.id, plan.id)
  候选登记.set(plan.id, JSON.stringify(plan))
  return { 成功: true, 信息: '拆分结果已保存，请在订单详情继续执行分仓规则', 方案: 克隆(plan) }
}

/** 独立分仓阶段。仅裁剪本包商品；订单总金额、买家运费仍保持原交易字段语义。 */
export function 执行拆单后分仓(orderNo: string, expectedId: string): { 成功: boolean; 信息: string } {
  const order = 共享订单.value.find(row => row.systemOrderNo === orderNo)
  const draft = order?.ruleSplitDraft
  if (!order || !draft || draft.id !== expectedId || 候选登记.get(draft.id) !== JSON.stringify(draft)) return { 成功: false, 信息: '拆分结果不存在或已变化，请重新打开' }
  if (draft.sourceVersion !== 当前版本(orderNo) || draft.sourceSnapshot !== 来源快照(order)) return { 成功: false, 信息: '来源订单已变化，请撤销拆分结果后重新试算' }
  const blockers = 执行阻断(order, true)
  if (blockers.length) return { 成功: false, 信息: blockers.join('；') }
  const packages: 人工发货方案['packages'] = []
  const routeEvidence: string[] = []
  for (const [index, parcel] of draft.packages.entries()) {
    const scoped = 克隆(order)
    delete scoped.ruleSplitDraft
    delete scoped.defaultRoute
    scoped.items = parcel.items.map(allocation => {
      const line = order.items.find(item => item.externalLineId === allocation.externalLineId)!
      return { ...克隆(line), orderedQuantity: allocation.quantity, fulfillableQuantity: allocation.quantity }
    })
    const result = 试算规则(共享规则.value, scoped, '分仓规则', 渠道会话.value)
    const firstIndex = result.hit ? result.trace.findIndex(row => row.rule.id === result.hit!.id) : result.trace.length
    const uncertain = result.trace.slice(0, firstIndex + 1).find(row => row.rule.enabled && (row.pending || 校验规则配置(row.rule, 共享规则.value, 渠道会话.value)))
    if (uncertain) return { 成功: false, 信息: `包裹 ${index + 1}：分仓规则「${uncertain.rule.name}」条件或配置待核实，未继续匹配低优先级规则` }
    if (!result.hit || !result.route || result.gates.length) return { 成功: false, 信息: `包裹 ${index + 1}：${result.gates.join('；') || '未匹配到可用的分仓规则，请完善分仓规则后重试'}` }
    const channel = result.route
    const route: 订单路由 = { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account, shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
    packages.push({ key: parcel.key, items: 克隆(parcel.items), route })
    routeEvidence.push(`包裹${index + 1}：${result.hit.name} V${result.hit.version} → ${route.warehouse}／${route.shippingChannel}`)
  }
  const plan: 人工发货方案 = { id: draft.id, kind: '拆分发货', orderNos: [orderNo], packages, reason: draft.reason, updatedAt: '', createdByRule: 克隆(draft.createdByRule) }
  // 在独立副本完成整单库存、来源守恒及方案校验，全部成功才替换真实候选。
  const source = 克隆(order)
  delete source.ruleSplitDraft
  const context = { ...人工发货上下文(), 规则拆单: true, 订单: 共享订单.value.map(row => row.systemOrderNo === orderNo ? source : row), 记录操作: () => {} }
  const issues = 校验人工发货方案(context, plan)
  if (issues.length) return { 成功: false, 信息: issues.join('；') }
  const saved = 保存人工发货方案(context, plan, { [orderNo]: 当前版本(orderNo) })
  if (!saved.成功 || !saved.方案) return { 成功: false, 信息: saved.信息 }
  order.manualShippingPlan = 克隆(saved.方案)
  delete order.ruleSplitDraft
  候选登记.delete(draft.id)
  记录操作(order, '拆单后分仓', `${routeEvidence.join('；')}；全部包裹已分仓，继续审单规则及系统默认审单，尚未创建履约单。`, true, '当前操作员')
  return { 成功: true, 信息: '全部包裹已完成分仓，等待后续审单及系统默认审单' }
}

export function 撤销规则拆分结果(orderNo: string, expectedId: string, expectedVersion = 当前版本(orderNo)): { 成功: boolean; 信息: string } {
  const order = 共享订单.value.find(row => row.systemOrderNo === orderNo)
  const draft = order?.ruleSplitDraft
  if (!order || !draft || draft.id !== expectedId) return { 成功: false, 信息: '拆分结果已变化，请刷新后重试' }
  if (expectedVersion !== 当前版本(orderNo)) return { 成功: false, 信息: '订单已变化，请重新查看后撤销' }
  const source = 克隆(order)
  delete source.ruleSplitDraft
  // 取消或资料变更后仍允许撤销未执行候选；不解除真实执行事实及审核中的门禁。
  const blockers = 发货执行安全阻断原因(人工发货上下文(), source)
  if (!['待审核', '异常', '不发货'].includes(order.processingStatus || '') || order.reviews.some(row => row.status === '审核中')) blockers.push('当前订单阶段或审核进度不允许撤销拆分结果')
  if (blockers.length || order.manualShippingPlan) return { 成功: false, 信息: blockers.join('；') || '已有发货安排，请先核实当前执行状态' }
  delete order.ruleSplitDraft
  候选登记.delete(draft.id)
  记录操作(order, '撤销拆分结果', `撤销未执行的待分仓结果 ${draft.id}；原结果：${JSON.stringify(draft)}；保留订单当前处理状态。`, true, '当前操作员')
  return { 成功: true, 信息: '已撤销拆分结果，可重新试算' }
}
