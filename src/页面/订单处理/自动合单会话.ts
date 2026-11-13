import type { 全渠道订单, 人工发货方案, 金额, 订单路由 } from '../全渠道订单/类型'
import { 按规则优先级排序, 计算规则命中, 试算规则, type 订单规则 } from '../订单规则/规则逻辑'
import { 校验合单动作, 解析合单重量, type 合单动作配置 } from '../订单规则/合单规则模型'
import { 共享规则 } from '../订单规则/演示会话'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 共享自动合单设置, 共享下次合单时间, 记录合单执行成功, 记录合单执行失败 } from '../业务配置/自动合单设置'
import { 共享订单, 人工发货上下文, 当前版本, 记录操作, 创建作业样例 } from './演示会话'
import { 人工发货操作阻断原因, 人工发货完整收件身份, 创建合并发货草稿, 保存人工发货方案 } from './拆合发货模型'
import { 查询人工方案库存 } from './拆合发货库存'
import { 执行合单后首轮审单 } from './审单规则执行'
import { 自动合单样例资料, 创建自动合单样例 } from './自动合单演示'
import { 初始化订单处理人 } from './处理人模型'
import { 创建合单等待记录, 划分合单候选组, 计算合单放单, 读取合单分组身份, 解析合单来源时间, 是合单等待, type 合单候选, type 合单等待记录, type 合单执行结果, type 合单放单组 } from './自动合单模型'
import { 共享合单记录, 共享合单执行结果 } from './自动合单状态'
export { 共享合单记录, 共享合单执行结果, 读取订单合单进度, 订单正在等单, 获取最早合单到期时间 } from './自动合单状态'

const 克隆 = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const 等单上下文 = () => ({ ...人工发货上下文(), 规则合单: true })
let 执行中 = false
let 序号 = 0
type 结果行 = 合单执行结果['rows'][number]

/** 仅合单评审入口显式初始化；不改变其他页面初始订单样本与审单统计。 */
export function 初始化合单规则演示(now = Date.now()): void {
  for (const order of 创建自动合单样例(创建作业样例, now)) {
    if (共享订单.value.some(existing => existing.systemOrderNo === order.systemOrderNo)) continue
    初始化订单处理人(order, new Date(now).toISOString())
    共享订单.value.push(order)
  }
  // 样例已明确完成前置处理；高级模式在本地接入时立即处理，基础仍等批次。
  if (共享自动合单设置.value.enabled && 共享自动合单设置.value.policy.mode === 'advanced') 初始化合单待处理(now)
}

export interface 合单节点前置结果 {
  skuResolution: '已完成' | '未完成'
  giftProcessing: '已完成' | '不适用' | '未完成'
  splitProcessing: '未拆单' | '已拆单' | '未完成'
}

/** 前置编排的显式接入契约；仅接收已有订单，不把待审核或首轮待审当作前置完成。 */
export function 订单到达合单节点(orderNo: string, 前置: 合单节点前置结果, now = Date.now()): { 成功: boolean; 信息: string } {
  const matches = 共享订单.value.filter(order => order.systemOrderNo === orderNo)
  if (matches.length !== 1) return { 成功: false, 信息: '来源订单不存在或编号不唯一' }
  const order = matches[0]!
  if (!Number.isFinite(now) || 前置.skuResolution !== '已完成' || !['已完成', '不适用'].includes(前置.giftProcessing) || 前置.splitProcessing !== '未拆单') return { 成功: false, 信息: 'SKU、赠品与拆单前置结果尚未明确完成，不能进入合单节点' }
  if (order.manualShippingPlan?.kind === '拆分发货' || order.ruleSplitDraft) return { 成功: false, 信息: '已经拆单的订单跳过合单节点' }
  if (order.mergeNodeArrival) return { 成功: true, 信息: '已登记合单节点，重复事件不重新计时或入池' }
  order.mergeNodeArrival = { arrivedAt: now, skuResolution: '已完成', giftProcessing: 前置.giftProcessing as '已完成' | '不适用', splitProcessing: '未拆单' }
  if (!共享自动合单设置.value.enabled) return { 成功: true, 信息: '已登记合单节点，自动合单任务未开启' }
  const 入池结果 = 新单入池(now, [orderNo])
  const result = 共享自动合单设置.value.policy.mode === 'basic'
    ? 更新结果(now, '订单到达合单节点', 入池结果, new Set([orderNo]))
    : 执行处理(now, '订单到达合单节点', false, undefined, undefined, { orderNo, rows: 入池结果 })
  const row = result?.rows.find(item => item.orderNo === orderNo)
  // 成功表示节点事件已接收；业务是否入池/放单及受阻原因由实际结果明确返回。
  return { 成功: true, 信息: row ? `${row.status}：${row.reason}` : '已登记合单节点，等待本次处理结果' }
}

/** 标注模式专用：每次追加一张明确完成前置处理的订单；每两次同买家，真实走节点事件。 */
export function 接入下一张合单节点样例(now = Date.now()): { 成功: boolean; 信息: string; 订单号: string } {
  let index = 1
  while (共享订单.value.some(order => order.systemOrderNo === `OMS-DEMO-AM-ARRIVAL-${String(index).padStart(3, '0')}`)) index++
  const orderNo = `OMS-DEMO-AM-ARRIVAL-${String(index).padStart(3, '0')}`
  const pair = Math.ceil(index / 2)
  const order = 创建自动合单样例(创建作业样例, now)[0]!
  order.systemOrderNo = orderNo
  order.platformOrderNo = orderNo.replace('OMS-', '')
  order.platformOrderId = order.platformOrderNo
  order.buyerExternalId = `DEMO-AM-ARRIVAL-BUYER-${pair}`
  order.address.fullName = `Demo Arrival ${pair}`
  order.address.addressLine1 = `${100 + pair} Example Arrival Avenue`
  order.items[0]!.externalLineId = `${orderNo}-L1`
  order.orderedAt = new Date(now).toISOString(); order.paidAt = order.orderedAt; order.createdAt = order.orderedAt
  delete order.mergeNodeArrival
  自动合单样例资料[orderNo] = { siteId: 'DEMO-EBAY-US', weightKg: '1.250' }
  初始化订单处理人(order, new Date(now).toISOString())
  共享订单.value.push(order)
  const result = 订单到达合单节点(orderNo, { skuResolution: '已完成', giftProcessing: '不适用', splitProcessing: '未拆单' }, now)
  return { ...result, 订单号: orderNo }
}

function 单张合单阻断(order: 全渠道订单, orders: readonly 全渠道订单[] = 共享订单.value): string[] {
  const 原因 = 人工发货操作阻断原因({ ...等单上下文(), 订单: [...orders] }, [order.systemOrderNo], '合并发货').filter(reason => reason !== '合并发货至少选择两张来源订单')
  if (order.manualShippingPlan) 原因.push(order.manualShippingPlan.kind === '拆分发货' ? '已经拆单的订单不允许参与合单' : '已经存在合并发货安排，不重复入池')
  if (order.platformCode === 'eBay' && order.platformOrderStatus === 'IN_PROGRESS') 原因.push('平台已部分履约，须先核实实际剩余发货范围')
  if (order.initialReviewPending && (!order.mergeNodeArrival || order.mergeNodeArrival.skuResolution !== '已完成' || !['已完成', '不适用'].includes(order.mergeNodeArrival.giftProcessing) || order.mergeNodeArrival.splitProcessing !== '未拆单')) 原因.push('新订单尚未明确完成前置处理并到达合单节点')
  return [...new Set(原因)]
}

function 创建候选(order: 全渠道订单, rule: 订单规则, policy: 合单动作配置, settingsVersion: number, orders: readonly 全渠道订单[] = 共享订单.value, now = Date.now()): { candidate?: 合单候选; reason: string } {
  const 配置错误 = 校验合单动作(policy)
  if (配置错误) return { reason: `全局合单设置：${配置错误}` }
  if (!Number.isInteger(settingsVersion) || settingsVersion < 1) return { reason: '全局合单设置版本未核实' }
  const 阻断 = 单张合单阻断(order, orders)
  if (阻断.length) return { reason: 阻断.join('；') }
  // 有明确节点时使用首次到达时间；旧存量样例没有节点记录时，仅从实际入池开始，不能反推历史。
  const startedAt = order.mergeNodeArrival ? order.mergeNodeArrival.arrivedAt : now
  if (!Number.isFinite(startedAt) || startedAt < 0 || startedAt > now) return { reason: '首次到达合单节点时间未核实，请核查后再处理' }
  const 资料 = 自动合单样例资料[order.systemOrderNo]
  const 分组 = 读取合单分组身份(order, policy.groupBySite, 资料?.siteId)
  if (!分组.key) return { reason: 分组.reason! }
  if (policy.maxWeightKg !== undefined && 解析合单重量(资料?.weightKg) === undefined) return { reason: '订单重量未核实，不能执行整组重量限制' }
  const shipByAt = 解析合单来源时间(order.shipByAt)
  if (order.shipByAt && shipByAt === undefined) return { reason: '发货截止时间格式或时区未核实，不能安全等单' }
  if (!order.shipByAt && order.urgency !== '无时限') return { reason: '发货截止时间未核实，不能安全等单' }
  return { candidate: { orderNo: order.systemOrderNo, ruleId: rule.id, ruleName: rule.name, ruleVersion: rule.version, settingsVersion, action: 克隆(policy), groupKey: 分组.key, quantity: order.items.reduce((sum, line) => sum + (line.fulfillableQuantity ?? 0), 0), weightKg: 资料?.weightKg, shipByAt, waitStartedAt: startedAt }, reason: '' }
}

function 首个合单规则(order: 全渠道订单, rules: readonly 订单规则[]): { rule?: 订单规则; reason?: string } {
  const 待核实: string[] = []
  for (const rule of 按规则优先级排序(rules.filter(rule => rule.type === '合单规则' && rule.enabled))) {
    // 各规则只负责准入。任一已知命中即可入公共池，优先级仅确定首次命中追踪。
    const match = 计算规则命中(rule, order, 渠道会话.value)
    if (match.matched) return { rule }
    if (match.pending) 待核实.push(`规则「${rule.name}」条件资料待核实：${match.unknownFields.join('、')}`)
  }
  return 待核实.length ? { reason: 待核实.join('；') } : {}
}

/** 只读批量试算，不入池、不计时、不修改订单、日志及规则。 */
export function 试算自动合单规则(rule: 订单规则 | readonly 订单规则[], orders: readonly 全渠道订单[], now = Date.now(), policy: 合单动作配置 = 共享自动合单设置.value.policy, settingsVersion = 共享自动合单设置.value.version) {
  const records: 合单等待记录[] = []
  const rows: 结果行[] = []
  const rules: readonly 订单规则[] = Array.isArray(rule) ? rule : [{ ...(rule as 订单规则), enabled: true }]
  const snapshot = 克隆(policy)
  for (const order of orders) {
    const match = 首个合单规则(order, rules)
    if (!match.rule) { rows.push({ orderNo: order.systemOrderNo, status: '不参与', reason: match.reason || '未命中本规则条件' }); continue }
    const 结果 = 创建候选(order, match.rule, snapshot, settingsVersion, orders, now)
    if (!结果.candidate) rows.push({ orderNo: order.systemOrderNo, status: '已排除', reason: 结果.reason })
    else records.push(创建合单等待记录(结果.candidate, now, 共享下次合单时间.value))
  }
  const groups = 计算合单放单(records, now, { batch: true })
  for (const record of records) {
    const group = groups.find(group => group.orderNos.includes(record.orderNo))
    rows.push({ orderNo: record.orderNo, status: group ? group.orderNos.length > 1 ? '可合并放单' : '独立放单' : '继续等单', reason: group?.reason || record.reason })
  }
  return { records, groups, rows }
}

function 新单入池(now: number, orderNos?: readonly string[]): 结果行[] {
  const rows: 结果行[] = []
  const { policy, version: settingsVersion } = 克隆(共享自动合单设置.value)
  const 已处理 = new Set(共享合单记录.value.map(record => record.orderNo))
  for (const order of 共享订单.value) {
    if (orderNos && !orderNos.includes(order.systemOrderNo)) continue
    if (已处理.has(order.systemOrderNo)) continue
    const 匹配 = 首个合单规则(order, 共享规则.value)
    if (!匹配.rule) {
      if (匹配.reason && order.processingStatus === '待审核') rows.push({ orderNo: order.systemOrderNo, status: '未入池', reason: 匹配.reason })
      else if (order.initialReviewPending && order.processingStatus === '待审核' && order.fulfillmentMode === '自配送' && !order.manualShippingPlan) {
        const 原因 = 单张合单阻断(order)
        if (原因.length) { rows.push({ orderNo: order.systemOrderNo, status: '已排除', reason: 原因.join('；') }); continue }
        const candidate: 合单候选 = { orderNo: order.systemOrderNo, ruleId: '', ruleName: '不参与合单', ruleVersion: 0, settingsVersion, action: 克隆(policy), groupKey: `independent:${order.systemOrderNo}`, quantity: order.items.reduce((sum, line) => sum + (line.fulfillableQuantity ?? 0), 0) }
        const record = 创建合单等待记录(candidate, now)
        record.reason = '未匹配到合单规则，独立继续分仓'
        共享合单记录.value.push(record)
        已处理.add(order.systemOrderNo)
        释放组({ orderNos: [order.systemOrderNo], groupKey: record.groupKey, reason: '未匹配到合单规则，独立放单' }, now)
      }
      continue
    }
    const 结果 = 创建候选(order, 匹配.rule, policy, settingsVersion, 共享订单.value, now)
    if (!结果.candidate) { rows.push({ orderNo: order.systemOrderNo, status: '已排除', reason: 结果.reason }); continue }
    const record = 创建合单等待记录(结果.candidate, now, 共享下次合单时间.value)
    共享合单记录.value.push(record)
    已处理.add(order.systemOrderNo)
    记录操作(order, '进入合单等待', `命中「${record.ruleName}」V${record.ruleVersion}进入公共合单池；全局设置 V${record.settingsVersion}；${record.action.mode === 'basic' ? '基础模式' : '高级模式'}；实际入池时间 ${new Date(record.enteredAt).toISOString()}；最长等待计时起点 ${new Date(record.waitStartedAt ?? record.enteredAt).toISOString()}；保持待审核。`, true, '系统规则')
  }
  return rows
}

/** 入池适用于启用后的新单；单纯打开页面不会将现有订单扣留。 */
export function 初始化合单待处理(now = Date.now()) {
  新单入池(now)
  // 已够单的高级规则和已到期订单当即处理；基础仍只等下一轮批次。
  return 执行处理(now, '新单进入合单规则', false)
}

function 复核已有等待(now: number): 结果行[] {
  const rows: 结果行[] = []
  for (const record of 共享合单记录.value.filter(是合单等待)) {
    const order = 共享订单.value.find(order => order.systemOrderNo === record.orderNo)
    const 原因 = order ? 单张合单阻断(order) : ['来源订单已不存在']
    if (order && ((order.shipByAt && 解析合单来源时间(order.shipByAt) === undefined) || (!order.shipByAt && order.urgency !== '无时限'))) 原因.push('发货截止时间未核实，已停止自动合单')
    if (record.action.maxWeightKg !== undefined && 解析合单重量(自动合单样例资料[record.orderNo]?.weightKg) === undefined) 原因.push('订单重量未核实，已停止自动合单')
    const 身份 = order && 读取合单分组身份(order, record.action.groupBySite, 自动合单样例资料[record.orderNo]?.siteId)
    if (身份 && 身份.key !== record.groupKey) 原因.push('入池后收件身份或站点发生变化，已退出原合单组，请核查后处理')
    if (原因.length) {
      record.status = '已排除'; record.reason = [...new Set(原因)].join('；'); record.releasedAt = now
      rows.push({ orderNo: record.orderNo, status: record.status, reason: record.reason })
      if (order) 记录操作(order, '退出合单等待', record.reason, false, '系统规则')
      continue
    }
    if (!order) continue
    record.quantity = order.items.reduce((sum, line) => sum + (line.fulfillableQuantity ?? 0), 0)
    record.weightKg = 自动合单样例资料[record.orderNo]?.weightKg
    // 新收到更早的发货截止只允许缩短；订单变化或配置变化不能延长已承诺的等待期限。
    const 新时限 = 解析合单来源时间(order.shipByAt)
    if (新时限 !== undefined) {
      const 保护时间 = 新时限 - record.action.shipByBufferMinutes * 60_000
      if (record.deadlineAt === null || 保护时间 < record.deadlineAt) { record.deadlineAt = 保护时间; record.deadlineReason = '已进入发货截止预留时间' }
    }
  }
  return rows
}

function 汇总金额(values: Array<金额 | undefined>): 金额 | undefined {
  if (!values.length || values.some(value => !value || !/^\d+(?:\.\d{1,6})?$/.test(value.value) || value.currency !== values[0]!.currency)) return undefined
  const sum = values.reduce((total, value) => {
    const [whole, fraction = ''] = value!.value.split('.')
    return total + BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  }, 0n)
  return { value: `${sum / 1_000_000n}.${String(sum % 1_000_000n).padStart(6, '0')}`, currency: values[0]!.currency }
}

/** 按合并后的商品和金额试算共同路由；不修改任何平台订单头或明细。 */
function 试算放单路由(orders: 全渠道订单[]) {
  const aggregate = 克隆(orders[0]!)
  if (orders.length > 1) {
    aggregate.items = orders.flatMap(order => order.items.map(item => ({ ...克隆(item), externalLineId: `${order.systemOrderNo}/${item.externalLineId}` })))
    const amount = 汇总金额(orders.map(order => order.amount.orderAmount))
    if (!amount) return { reason: '来源订单币种或金额未核实，不能计算合并后的分仓条件' }
    aggregate.amount.orderAmount = amount
    aggregate.amount.buyerPaidShipping = 汇总金额(orders.map(order => order.amount.buyerPaidShipping))
    if (new Set(orders.map(order => order.address.buyerMessage ?? '')).size > 1) return { reason: '来源订单买家留言不同，请核查共同发货要求后重新分仓' }
  }
  const result = 试算规则(共享规则.value, aggregate, '分仓规则', 渠道会话.value)
  if (!result.hit || !result.route || result.gates.length) return { reason: result.gates.join('；') || (result.unknownFields.length ? `分仓条件待核实：${result.unknownFields.join('、')}` : '未匹配到可用的分仓规则，请完善规则后重试分仓') }
  const channel = result.route
  const route: 订单路由 = { warehouse: channel.warehouse, warehouseProvider: channel.provider, warehouseAccount: channel.account, shippingChannel: channel.name, shippingChannelCode: channel.code, shippingChannelId: channel.id, labelMode: '仓配一体' }
  return { route, reason: '' }
}

function 释放组(group: 合单放单组, now: number): void {
  const records = 共享合单记录.value.filter(record => group.orderNos.includes(record.orderNo))
  const orders = group.orderNos.map(no => 共享订单.value.find(order => order.systemOrderNo === no)).filter((order): order is 全渠道订单 => !!order)
  const groupId = records[0]?.groupId ?? `AM-${now}-${++序号}`
  const 失败 = (reason: string) => {
    for (const record of records) { record.status = '分仓待处理'; record.groupId = groupId; record.releasedAt = now; record.reason = `${group.reason}；${reason}` }
    for (const order of orders) 记录操作(order, '合单放单后分仓待处理', `合单组 ${groupId}；${group.reason}；${reason}；整组保留，待核查后重试分仓。`, false, '系统规则')
  }
  if (orders.length !== group.orderNos.length) { 失败('来源订单缺失，不能继续分仓'); return }
  const 阻断 = orders.flatMap(order => 单张合单阻断(order))
  if (阻断.length) { 失败([...new Set(阻断)].join('；')); return }
  const 当前记录 = records.map(record => {
    const order = orders.find(order => order.systemOrderNo === record.orderNo)!
    const identity = record.ruleId && !record.independentRelease ? 读取合单分组身份(order, record.action.groupBySite, 自动合单样例资料[record.orderNo]?.siteId) : { key: `independent:${order.systemOrderNo}` }
    return { ...record, status: '等单中' as const, groupKey: identity.key ?? '', quantity: order.items.reduce((sum, line) => sum + (line.fulfillableQuantity ?? 0), 0), weightKg: 自动合单样例资料[record.orderNo]?.weightKg }
  })
  if (当前记录.some(record => !record.groupKey || record.groupKey !== group.groupKey)) { 失败('收件身份或站点已变化，请核查原合单组合'); return }
  if (orders.length > 1 && 划分合单候选组(当前记录).length !== 1) { 失败('当前整组商品数量或重量已超出原规则限制，请核查合单组合'); return }
  if (new Set(orders.map(人工发货完整收件身份)).size !== 1) { 失败('完整配送资料存在冲突，不能选择任一来源覆盖其他订单'); return }
  const 路由结果 = 试算放单路由(orders)
  if (!路由结果.route) { 失败(路由结果.reason); return }
  const plan = 创建合并发货草稿(orders)
  plan.packages[0]!.route = 克隆(路由结果.route)
  const 命中规则 = [...new Map(records.filter(record => record.ruleId).map(record => [`${record.ruleId}/${record.ruleVersion}`, { id: record.ruleId, name: record.ruleName, version: record.ruleVersion }])).values()]
  plan.reason = `公共合单池；全局设置 V${records[0]!.settingsVersion}；入池规则：${命中规则.map(rule => `「${rule.name}」V${rule.version}`).join('、') || '未匹配，独立放单'}；${group.reason}`
  // 共同库存按整组商品需求核查，不能逐单各自通过后超量合并。
  const 库存原因 = 查询人工方案库存(plan, 共享订单.value).reasons
  if (库存原因.length) { 失败([...new Set(库存原因)].join('；')); return }
  if (orders.length > 1) {
    plan.createdByRule = { executionId: groupId, rules: 命中规则, appliedAt: new Date(now).toISOString(), sourceVersion: 当前版本(orders[0]!.systemOrderNo) }
    const 保存 = 保存人工发货方案({ ...等单上下文(), 库存检查: (候选: 人工发货方案) => 查询人工方案库存(候选, 共享订单.value).reasons }, plan, Object.fromEntries(orders.map(order => [order.systemOrderNo, 当前版本(order.systemOrderNo)])))
    if (!保存.成功) { 失败(保存.信息); return }
  }
  for (const order of orders) {
    order.defaultRoute = 克隆(路由结果.route)
    记录操作(order, orders.length > 1 ? '合单后分仓' : '合单独立放单', `合单组 ${groupId}；${group.reason}；分配 ${路由结果.route.warehouse} / ${路由结果.route.shippingChannel}，继续审单规则及系统默认发货条件校验。`, true, '系统规则')
  }
  const 首轮 = orders.some(order => order.initialReviewPending)
  for (const record of records) { record.status = '已放单'; record.groupId = groupId; record.releasedAt = now; record.reason = `${group.reason}；${orders.length > 1 ? `已合并 ${orders.length} 单` : '独立发货'}，已完成分仓，${首轮 ? '已接续首轮审单' : '等待后续审单'}` }
  执行合单后首轮审单(group.orderNos)
}

function 更新结果(now: number, source: string, extra: 结果行[], 涉及订单: Set<string>): 合单执行结果 {
  const 本轮记录 = 共享合单记录.value.filter(record => 涉及订单.has(record.orderNo))
  const rows: 结果行[] = 本轮记录.map(record => ({ orderNo: record.orderNo, status: record.status, reason: record.reason, groupId: record.groupId }))
  rows.push(...extra.filter(row => !rows.some(existing => existing.orderNo === row.orderNo)))
  const result: 合单执行结果 = { executedAt: now, source, total: rows.length, merged: 本轮记录.filter(record => record.status === '已放单' && 共享订单.value.find(order => order.systemOrderNo === record.orderNo)?.manualShippingPlan?.kind === '合并发货').length, released: rows.filter(row => row.status === '已放单').length, waiting: 本轮记录.filter(是合单等待).length, skipped: rows.filter(row => ['已排除', '未入池', '分仓待处理'].includes(row.status)).length, rows }
  共享合单执行结果.value = result
  记录合单执行成功(source, now)
  return result
}

function 执行处理(now: number, source: string, batch: boolean, forceOrderNos?: readonly string[], forceReason?: string, 节点结果?: { orderNo: string; rows: 结果行[] }) {
  if (执行中) return 共享合单执行结果.value
  执行中 = true
  try {
    const 原有订单 = new Set(共享合单记录.value.map(record => record.orderNo))
    const 涉及订单 = new Set(共享合单记录.value.filter(是合单等待).map(record => record.orderNo))
    if (节点结果) 涉及订单.add(节点结果.orderNo)
    const 已停用规则 = (record: 合单等待记录) => !!record.ruleId && !共享规则.value.some(rule => rule.id === record.ruleId && rule.type === '合单规则' && rule.enabled)
    // 先冻结受停用影响的完整公共池候选组；某来源随后因取消退出，也不留下半组静默等待。
    const 停用影响组 = 划分合单候选组(共享合单记录.value).filter(group => group.some(已停用规则)).flatMap(group => group.map(record => record.orderNo))
    const rows = [...(节点结果?.rows ?? []), ...复核已有等待(now)]
    if (batch) rows.push(...新单入池(now))
    for (const record of 共享合单记录.value) if (!原有订单.has(record.orderNo)) 涉及订单.add(record.orderNo)
    const 已停用 = [...new Set([...停用影响组, ...共享合单记录.value.filter(record => 是合单等待(record) && 已停用规则(record)).map(record => record.orderNo)])]
    // 停用/删除按完整候选组结束等待，组内其他入池规则来源也继续分仓；不静默拆组或改写命中追踪。
    for (const group of 计算合单放单(共享合单记录.value, now, { forceOrderNos: 已停用, forceReason: '组内入池规则已停用或删除，整组结束等待' }).filter(group => group.orderNos.some(no => 已停用.includes(no)))) 释放组(group, now)
    for (const group of 计算合单放单(共享合单记录.value, now, { batch, forceOrderNos, forceReason })) 释放组(group, now)
    if (!batch && !涉及订单.size && !rows.length) return 共享合单执行结果.value
    return 更新结果(now, source, rows, 涉及订单)
  } catch (error) {
    记录合单执行失败(error, source, now)
    throw error
  } finally { 执行中 = false }
}

export function 执行合单轮次(now = Date.now(), 来源 = '立即执行') { return 执行处理(now, 来源, true) }
export function 处理合单到期(now = Date.now()) { return 执行处理(now, '到期放单', false) }
export function 结束合单等待(orderNos: string[], now = Date.now()) { return 执行处理(now, '人工结束等单', false, orderNos, '人工结束等单') }
export function 释放全部等待(reason = '自动合单任务已关闭', now = Date.now()) { return 执行处理(now, '结束全部等待', false, 共享合单记录.value.filter(是合单等待).map(record => record.orderNo), reason) }

/** 分仓失败后仍按原组重试，避免某个来源被单独审核发货。 */
export function 重试合单分仓(orderNos: string[], now = Date.now()) {
  const groupIds = new Set(共享合单记录.value.filter(record => record.status === '分仓待处理' && orderNos.includes(record.orderNo)).map(record => record.groupId))
  const 涉及订单 = new Set<string>()
  for (const groupId of groupIds) {
    const records = 共享合单记录.value.filter(record => record.groupId === groupId && record.status === '分仓待处理')
    for (const record of records) 涉及订单.add(record.orderNo)
    if (records.length) 释放组({ orderNos: records.map(record => record.orderNo), groupKey: records[0]!.groupKey, reason: '重新分仓' }, now)
  }
  return 更新结果(now, '重试合单分仓', [], 涉及订单)
}

/** 人工确认后的整组解除。每个来源重新做独立分仓与原安全检查，不重新等单。 */
export function 解除合单组合(orderNos: string[], now = Date.now()) {
  const groupIds = new Set(共享合单记录.value.filter(record => record.status === '分仓待处理' && orderNos.includes(record.orderNo)).map(record => record.groupId))
  const records = 共享合单记录.value.filter(record => record.status === '分仓待处理' && groupIds.has(record.groupId))
  const 涉及订单 = new Set(records.map(record => record.orderNo))
  const 原组合来源 = new Map([...groupIds].map(groupId => [groupId, records.filter(record => record.groupId === groupId).map(record => record.orderNo)]))
  for (const record of records) {
    const order = 共享订单.value.find(order => order.systemOrderNo === record.orderNo)
    const oldGroup = record.groupId
    const 来源 = 原组合来源.get(oldGroup) ?? []
    if (order) 记录操作(order, '解除合单组合', `人工解除原合单组 ${oldGroup}；全部来源 ${来源.join('、')}；各来源独立继续分仓及发货条件校验，不重新入池。`, true, '人工操作')
    const 原因 = order ? 单张合单阻断(order) : ['来源订单已不存在']
    if (原因.length) { record.status = '已排除'; record.reason = `原合单组已解除；${原因.join('；')}，停止自动发货`; record.releasedAt = now; continue }
    record.independentRelease = true
    record.groupKey = `independent:${record.orderNo}`
    record.groupId = undefined
    释放组({ orderNos: [record.orderNo], groupKey: record.groupKey, reason: `原合单组 ${oldGroup} 已由人工解除，独立放单` }, now)
  }
  return 更新结果(now, '解除合单组合', [], 涉及订单)
}
