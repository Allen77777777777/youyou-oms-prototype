import type { 全渠道订单, 订单处理状态, 履约单摘要 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 当前版本, 演示时间, 记录操作, type 仓库执行, type 命令结果 } from './演示会话'

/** 只处理本地虚构核查证据；真实 API、权限与持久审计未接入。 */
export function 订单关联仓库执行(订单: 全渠道订单): 仓库执行[] {
  const 履约号 = new Set(订单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo))
  return 仓库执行记录.value.filter(项 => 项.订单号.includes(订单.systemOrderNo) || 履约号.has(项.履约单号))
}

export function 仓单来源订单(执行: 仓库执行): 全渠道订单[] {
  return 共享订单.value.filter(订单 => 执行.订单号.includes(订单.systemOrderNo) || 订单.fulfillmentOrders.some(项 => 项.fulfillmentOrderNo === 执行.履约单号))
}

export function 仓单期望版本(执行: 仓库执行): Record<string, number> {
  return Object.fromEntries(仓单来源订单(执行).map(订单 => [订单.systemOrderNo, 当前版本(订单.systemOrderNo)]))
}

export function 有共享发货路径(订单: 全渠道订单): boolean {
  const 执行 = 订单关联仓库执行(订单)
  const 履约号 = new Set([...订单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo), ...执行.map(项 => 项.履约单号)])
  return 执行.some(项 => 项.订单号.some(号 => 号 !== 订单.systemOrderNo)) || 共享订单.value.some(项 => 项.systemOrderNo !== 订单.systemOrderNo && 项.fulfillmentOrders.some(履约 => 履约号.has(履约.fulfillmentOrderNo)))
}

export function 平台发货条件已允许(订单: 全渠道订单, 必须明确 = false): boolean {
  const 证据 = 操作核查证据.value[订单.systemOrderNo]
  if (订单.cancelledAt || 证据?.平台允许 === false) return false
  // 旧样例已准入正常六态；异常和终态纠错必须有独立的明确核查证据，付款时间不作为证据。
  return 证据?.平台允许 === true || (!必须明确 && !订单.blockReason && !['异常', '不发货'].includes(订单.processingStatus ?? ''))
}

export function 零出库阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (操作核查证据.value[订单.systemOrderNo]?.零出库已核实 === false || 订单.fulfillmentOrders.some(项 => !Number.isInteger(项.shippedQuantity) || 项.shippedQuantity < 0)) 原因.push('履约出库数量缺失或不可信，请先核实实际发货事实')
  if (订单.fulfillmentOrders.some(项 => 项.shippedQuantity > 0 || 项.status === '已发货' || Boolean(项.shippedAt)) || 订单关联仓库执行(订单).some(项 => 项.状态 === '已出库')) 原因.push('已有有效出库事实，不能按普通整单流程退回或终止')
  if (订单关联仓库执行(订单).some(执行 => !订单.fulfillmentOrders.some(项 => 项.fulfillmentOrderNo === 执行.履约单号))) 原因.push('仓库执行缺少关联履约数量，请先核实零出库证据')
  return 原因
}

export function 仓库执行结束阻断原因(订单: 全渠道订单): string[] {
  const 执行 = 订单关联仓库执行(订单)
  const 原因: string[] = []
  if (执行.some(项 => 项.待核查)) 原因.push('仓库请求结果待核查，不能确认执行已安全结束')
  if (执行.some(项 => !['下单失败', '已取消'].includes(项.状态))) 原因.push('存在未安全结束的仓库执行；请先核查或完成仓库截单')
  if (执行.some(项 => 项.状态 === '下单失败' && 操作核查证据.value[订单.systemOrderNo]?.原请求未生效 === false)) 原因.push('原失败请求是否生效尚未明确，请先核查')
  if (订单.fulfillmentOrders.some(项 => 项.status === '执行中' && !执行.some(仓单 => 仓单.履约单号 === 项.fulfillmentOrderNo && !仓单.待核查 && ['下单失败', '已取消'].includes(仓单.状态)))) 原因.push('执行中的履约缺少仓库明确结束证据，请先核查原请求')
  if (操作核查证据.value[订单.systemOrderNo]?.计划可停止 === false) 原因.push('尚有发货计划无法停止，请先核实原执行')
  return 原因
}

function 真实剩余有效(订单: 全渠道订单): boolean {
  return 操作核查证据.value[订单.systemOrderNo]?.剩余已核实 === true && 订单.items.length > 0 && 订单.items.every(行 => Number.isInteger(行.fulfillableQuantity) && 行.fulfillableQuantity! >= 0 && 行.fulfillableQuantity! <= 行.orderedQuantity) && 订单.items.some(行 => 行.fulfillableQuantity! > 0)
}

function 发货资料阻断原因(订单: 全渠道订单, 履约?: 履约单摘要): string[] {
  const 原因: string[] = []
  const 证据 = 操作核查证据.value[订单.systemOrderNo]
  if (证据?.发货资料有效 === false || 订单.items.some(行 => !行.systemSku || 行.skuResolutionStatus !== '成功')) 原因.push('商品映射或发货资料尚未修复')
  if (!订单.address.fullName?.trim() || !订单.address.countryCode?.trim() || !订单.address.addressLine1?.trim()) 原因.push('收件信息不满足发货要求')
  const 路由 = 履约?.route ?? 订单.defaultRoute
  if (!路由 || [路由.warehouse, 路由.warehouseProvider, 路由.warehouseAccount, 路由.shippingChannel, 路由.shippingChannelCode].some(项 => !项?.trim()) || 路由.labelMode !== '仓配一体' || 证据?.路由适用 === false) 原因.push('发货方案不完整、不可用或不适用于订单')
  if ((演示库存.value[订单.systemOrderNo] ?? '充足') !== '充足') 原因.push('库存不足，或库存结果尚未核实')
  if (!真实剩余有效(订单)) 原因.push('剩余发货范围未核实，或当前没有需要 OMS 发货的数量')
  return 原因
}

function 范围阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (有共享发货路径(订单)) 原因.push('存在共享履约路径，请核对全部来源订单后专项处理')
  const 证据 = 操作核查证据.value[订单.systemOrderNo]
  if (证据?.范围无重叠 === false || 证据?.范围已核清 === false) 原因.push('关联发货范围未明确，或存在其他重叠发货路径')
  return 原因
}

function 仓单关联阻断(执行: 仓库执行): string[] {
  const 来源 = 仓单来源订单(执行)
  const 原因: string[] = []
  if (!执行.出库单号?.trim() || !执行.履约单号?.trim() || !来源.length || 执行.订单号.some(号 => !来源.some(订单 => 订单.systemOrderNo === 号))) 原因.push('出库单关联或全部来源订单尚未取得，请先核实')
  const 路由 = 来源.map(订单 => 订单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 执行.履约单号)?.route)
  if (路由.some(项 => !项?.warehouseAccount?.trim() || !项.warehouseProvider?.trim() || !项.warehouse?.trim()) || new Set(路由.map(项 => JSON.stringify(项))).size > 1) 原因.push('仓库账号、仓库或执行快照关联未明确，请先核实')
  return 原因
}

export function 同步仓库状态阻断原因(执行: 仓库执行): string[] {
  const 原因 = 仓单关联阻断(执行)
  const 来源 = 仓单来源订单(执行)
  if (来源.some(订单 => 操作核查证据.value[订单.systemOrderNo]?.查询标识完整 === false)) 原因.push('暂无可查询的出库单，或查询所需单号不完整')
  if (来源.some(订单 => 操作核查证据.value[订单.systemOrderNo]?.不支持查询)) 原因.push('当前仓库尚不支持查询出库单，请联系仓库核实')
  return 原因
}

export function 重新推单阻断原因(执行: 仓库执行): string[] {
  const 原因 = 仓单关联阻断(执行)
  const 来源 = 仓单来源订单(执行)
  const 来源待发总量 = 来源.reduce((总, 单) => 总 + 单.items.reduce((小计, 行) => 小计 + (行.fulfillableQuantity ?? 0), 0), 0)
  if (执行.状态 !== '下单失败') 原因.push('仅待推单中明确下单失败的对象可以重新推单')
  if (执行.待核查) 原因.push('原推单是否生效尚未明确，请先同步仓库状态，不能重新推单')
  for (const 订单 of 来源) {
    const 证据 = 操作核查证据.value[订单.systemOrderNo]
    const 履约 = 订单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 执行.履约单号)
    if (订单.processingStatus !== '待推单' || !平台发货条件已允许(订单) || !订单.reviews.length || 订单.reviews[订单.reviews.length - 1]?.status !== '已通过') 原因.push(`来源订单 ${订单.systemOrderNo} 当前审核或平台状态不满足发货条件`)
    if (证据?.原请求未生效 !== true) 原因.push('原推单是否生效尚未明确，请先同步仓库状态，不能重新推单')
    if (证据?.失败已修复 !== true) 原因.push(`原失败原因尚未解决：${执行.原因 || '请核实实际修复结果'}`)
    if (!履约?.isActive || 证据?.原方案有效 !== true || !Number.isInteger(履约.plannedQuantity) || 履约.plannedQuantity <= 0 || 履约.plannedQuantity !== 来源待发总量) 原因.push('发货方案已变化或未核实，请先退回待审核')
    原因.push(...零出库阻断原因(订单), ...发货资料阻断原因(订单, 履约))
    if (证据?.范围无重叠 === false || 证据?.范围已核清 === false || 订单关联仓库执行(订单).some(项 => 项 !== 执行 && (项.待核查 || !['下单失败', '已取消'].includes(项.状态)))) 原因.push('存在其他发货执行或未明结果，请先同步并核查')
  }
  return [...new Set(原因)]
}

export function 截单阻断原因(执行: 仓库执行, 批量 = false): string[] {
  const 原因 = 仓单关联阻断(执行)
  const 来源 = 仓单来源订单(执行)
  if (执行.状态 === '已取消') 原因.push('仓库已取消，无需重复截单')
  else if (执行.状态 === '取消中' || 执行.待核查) 原因.push('截单或原推单结果尚未明确，请同步仓库状态')
  else if (!['待出库', '出库异常'].includes(执行.状态)) 原因.push('尚未确认可撤销的仓库建单，请先同步仓库状态')
  for (const 订单 of 来源) {
    const 证据 = 操作核查证据.value[订单.systemOrderNo]
    if (!['待推单', '待发货', '异常'].includes(订单.processingStatus ?? '')) 原因.push(`来源订单 ${订单.systemOrderNo} 当前状态不支持截单`)
    原因.push(...零出库阻断原因(订单))
    if (证据?.不支持截单 || 证据?.截单阶段可撤 === false) 原因.push('当前仓库或作业阶段不支持截单，请联系仓库核实')
    if (证据?.范围无重叠 === false || 证据?.范围已核清 === false) 原因.push('截单影响范围尚未核实，请先核对全部来源订单')
    if (批量 && 有共享发货路径(订单)) 原因.push('该执行涉及共享或重叠发货范围，批量已跳过，请逐单核实')
    if (订单关联仓库执行(订单).some(项 => 项 !== 执行 && (项.待核查 || !['下单失败', '已取消'].includes(项.状态)))) 原因.push('存在其他未结束或重叠执行，请先核对全部影响范围')
  }
  return [...new Set(原因)]
}

export function 退回待审核阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (!['待推单', '待发货'].includes(订单.processingStatus ?? '') || 订单.fulfillmentMode !== '自配送') 原因.push('当前状态不支持退回待审核；异常订单请先复核恢复')
  if (!平台发货条件已允许(订单)) 原因.push('平台状态已变化，需要先进行异常复核')
  原因.push(...零出库阻断原因(订单), ...仓库执行结束阻断原因(订单), ...范围阻断原因(订单))
  if (订单.processingStatus === '待发货' && 订单.fulfillmentOrders.filter(项 => 项.isActive).some(项 => !订单关联仓库执行(订单).some(执行 => 执行.履约单号 === 项.fulfillmentOrderNo && 执行.状态 === '已取消' && !执行.待核查))) 原因.push('待发货的原仓库执行尚未明确截单成功')
  return [...new Set(原因)]
}

export function 恢复发货目标(订单: 全渠道订单): Extract<订单处理状态, '待审核' | '待推单' | '待发货'> | undefined {
  if (订单.processingStatus !== '异常') return undefined
  const 执行 = 订单关联仓库执行(订单)
  const 未结束 = 执行.filter(项 => !['下单失败', '已取消'].includes(项.状态))
  const 证据 = 操作核查证据.value[订单.systemOrderNo]
  const 有效履约 = 订单.fulfillmentOrders.filter(项 => 项.isActive)
  if (未结束.length) return 未结束.length === 1 && ['待出库', '出库异常'].includes(未结束[0]!.状态) && !未结束[0]!.待核查 && 证据?.原执行可继续 === true && 有效履约.length === 1 && 有效履约[0]!.fulfillmentOrderNo === 未结束[0]!.履约单号 ? '待发货' : undefined
  const 原方案 = 订单.fulfillmentOrders[订单.fulfillmentOrders.length - 1]
  if (证据?.原方案有效 === true && 订单.reviews[订单.reviews.length - 1]?.status === '已通过' && 原方案 && 发货资料阻断原因(订单, 原方案).length === 0) return '待推单'
  return '待审核'
}

export function 恢复发货阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (订单.fulfillmentMode !== '自配送' || 订单.processingStatus !== '异常') 原因.push('仅异常订单可以使用恢复发货')
  if (!平台发货条件已允许(订单, true)) 原因.push('当前平台状态仍不允许恢复，请先完成异常复核')
  if (!真实剩余有效(订单)) 原因.push('剩余发货范围未核实，或当前没有需要 OMS 发货的数量')
  原因.push(...零出库阻断原因(订单), ...范围阻断原因(订单))
  if (订单关联仓库执行(订单).some(项 => 项.待核查 || ['下单中', '取消中'].includes(项.状态))) 原因.push('原仓库执行结果尚未确定，请先同步仓库状态')
  const 目标 = 恢复发货目标(订单)
  if (!目标) 原因.push('恢复阶段尚未明确，请先核实发货方案')
  if (目标 === '待发货') {
    const 有效 = 订单.fulfillmentOrders.filter(项 => 项.isActive)
    if (有效.some(项 => !Number.isInteger(项.plannedQuantity) || 项.plannedQuantity <= 0) || 有效.reduce((总, 项) => 总 + 项.plannedQuantity, 0) !== 订单.items.reduce((总, 行) => 总 + (行.fulfillableQuantity ?? 0), 0) || 操作核查证据.value[订单.systemOrderNo]?.原方案有效 === false) 原因.push('原商品、数量、路由或范围不一致，不能继续原仓单')
  } else 原因.push(...仓库执行结束阻断原因(订单))
  return [...new Set(原因)]
}

export function 撤销不发货阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (订单.fulfillmentMode !== '自配送' || 订单.processingStatus !== '不发货') 原因.push('仅不发货订单可以撤销不发货')
  if (操作核查证据.value[订单.systemOrderNo]?.终止依据已纠正 !== true || 订单.cancelledAt || 订单.platformOrderStatus === 'FULFILLED') 原因.push('原不发货依据仍然成立，不能撤销不发货')
  if (!平台发货条件已允许(订单, true)) 原因.push('当前平台状态不支持继续发货，不能撤销不发货')
  if (!真实剩余有效(订单)) 原因.push('当前没有明确需要 OMS 发货的剩余范围，请先核对')
  原因.push(...零出库阻断原因(订单), ...仓库执行结束阻断原因(订单), ...范围阻断原因(订单))
  return [...new Set(原因)]
}

function 字段错误(字段: Array<[string, string]>): string | undefined {
  for (const [名称, 内容] of 字段) {
    if (!内容.trim()) return `请输入${名称}`
    if (内容.trim().length > 2000) return `${名称}最多 2000 字符`
  }
}

function 查订单(订单号: string, 期望版本: number): 全渠道订单 | 命令结果 {
  const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 订单号)
  if (!订单) return { 成功: false, 信息: '订单不存在，请刷新列表' }
  if (当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '订单已变化，请重新打开预检后提交' }
  return 订单
}

function 查仓单(出库单号: string, 版本表?: Record<string, number>): 仓库执行 | 命令结果 {
  const 匹配 = 仓库执行记录.value.filter(项 => 项.出库单号 === 出库单号)
  if (匹配.length !== 1) return { 成功: false, 信息: '出库单不存在或关联不唯一，请刷新后核实' }
  const 执行 = 匹配[0]!
  if (版本表 && 仓单来源订单(执行).some(订单 => 版本表[订单.systemOrderNo] !== 当前版本(订单.systemOrderNo))) return { 成功: false, 信息: '来源订单已变化，请重新打开预检后提交' }
  return 执行
}

function 停止旧方案(订单: 全渠道订单) {
  for (const 履约 of 订单.fulfillmentOrders.filter(项 => 项.isActive)) { 履约.isActive = false; 履约.status = '已终止' }
}

export function 执行演示重新推单(出库单号: string, 版本表: Record<string, number>, 修复说明: string): 命令结果 {
  const 查找 = 查仓单(出库单号, 版本表)
  if ('成功' in 查找) return 查找
  const 错误 = 字段错误([['修复说明', 修复说明]])
  if (错误) return { 成功: false, 信息: 错误 }
  const 阻断 = 重新推单阻断原因(查找)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 原失败 = 查找.原因
  查找.状态 = '下单中'; 查找.待核查 = true; 查找.原因 = '重新推单已受理，等待仓库明确建单结果'; 查找.更新时间 = 演示时间()
  for (const 订单 of 仓单来源订单(查找)) 记录操作(订单, '重新推单', `${出库单号} 原明确失败：${原失败}；原请求未生效且已核实修复；修复说明：${修复说明.trim()}；原范围未变，订单保持待推单。仅本地演示。`)
  return { 成功: true, 信息: '重新推单已受理，请同步仓库状态查看结果', 对象号: 出库单号, 待核查: true }
}

export function 执行演示截单(出库单号: string, 版本表: Record<string, number>, 原因: string, 批量 = false): 命令结果 {
  const 查找 = 查仓单(出库单号, 版本表)
  if ('成功' in 查找) return 查找
  const 错误 = 字段错误([['截单原因', 原因]])
  if (错误) return { 成功: false, 信息: 错误 }
  const 阻断 = 截单阻断原因(查找, 批量)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  查找.状态 = '取消中'; 查找.待核查 = true; 查找.原因 = `截单申请已受理：${原因.trim()}`; 查找.更新时间 = 演示时间()
  for (const 订单 of 仓单来源订单(查找)) 记录操作(订单, '截单', `${出库单号}；全部受影响来源：${仓单来源订单(查找).map(项 => 项.systemOrderNo).join('、')}；原因：${原因.trim()}；仅申请仓库截单，订单保持${订单.processingStatus}，等待明确结果。仅本地演示。`)
  return { 成功: true, 信息: '截单申请已受理，请等待仓库确认', 对象号: 出库单号, 待核查: true }
}

export function 执行演示退回待审核(订单号: string, 期望版本: number, 原因: string): 命令结果 {
  const 查找 = 查订单(订单号, 期望版本)
  if ('成功' in 查找) return 查找
  const 错误 = 字段错误([['退回原因', 原因]])
  if (错误) return { 成功: false, 信息: 错误 }
  const 阻断 = 退回待审核阻断原因(查找)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 原状态 = 查找.processingStatus
  停止旧方案(查找); 查找.processingStatus = '待审核'
  记录操作(查找, '退回待审核', `${原状态} → 待审核；原计划已停止，原审核、履约和仓库快照保留；原因：${原因.trim()}；后续须重新审核，本次不推单。仅本地演示。`)
  return { 成功: true, 信息: '已退回待审核，原审核和执行记录保留', 对象号: 订单号 }
}

export function 执行演示恢复发货(订单号: string, 期望版本: number, 原因: string): 命令结果 {
  const 查找 = 查订单(订单号, 期望版本)
  if ('成功' in 查找) return 查找
  const 错误 = 字段错误([['恢复原因', 原因]])
  if (错误) return { 成功: false, 信息: 错误 }
  const 阻断 = 恢复发货阻断原因(查找)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 目标 = 恢复发货目标(查找)!
  const 原异常 = 查找.blockReason
  if (目标 !== '待发货') {
    const 原方案 = 查找.fulfillmentOrders[查找.fulfillmentOrders.length - 1]!
    停止旧方案(查找)
    if (目标 === '待推单') 查找.fulfillmentOrders.push({ ...原方案, fulfillmentOrderNo: `FL-${订单号}-RECOVER-V${当前版本(订单号) + 1}`, route: { ...原方案.route }, isActive: true, status: '待执行', plannedQuantity: 查找.items.reduce((总, 行) => 总 + 行.fulfillableQuantity!, 0), shippedQuantity: 0, trackingNumber: undefined, shippedAt: undefined })
  }
  查找.processingStatus = 目标; 查找.blockReason = undefined
  记录操作(查找, '恢复发货', `异常 → ${目标}；原异常：${原异常 || '未填写'}；原因：${原因.trim()}；${目标 === '待发货' ? '继续唯一原仓单，不重新推单' : 目标 === '待推单' ? '旧仓单保持结束，原有效方案另建待执行路径，本次不推单' : '旧方案停止，待资料修复后重新审核'}。仅本地演示。`)
  return { 成功: true, 信息: `已恢复到${目标}，本次不会重新推单`, 对象号: 订单号 }
}

export function 执行演示撤销不发货(订单号: string, 期望版本: number, 原因: string): 命令结果 {
  const 查找 = 查订单(订单号, 期望版本)
  if ('成功' in 查找) return 查找
  const 错误 = 字段错误([['撤销原因', 原因]])
  if (错误) return { 成功: false, 信息: 错误 }
  const 阻断 = 撤销不发货阻断原因(查找)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 原不发货原因 = 查找.noShipmentReason
  停止旧方案(查找); 查找.processingStatus = '待审核'; 查找.noShipmentReason = undefined; 查找.blockReason = undefined
  记录操作(查找, '撤销不发货', `不发货 → 待审核；原不发货原因：${原不发货原因 || '未填写'}；撤销原因：${原因.trim()}；原记录保留，旧仓库单不会恢复，必须重新审核，本次不推单。仅本地演示。`)
  return { 成功: true, 信息: '已撤销不发货并返回待审核，旧仓库单不会恢复', 对象号: 订单号 }
}

export function 同步演示仓库状态(出库单号: string): 命令结果 {
  const 查找 = 查仓单(出库单号)
  if ('成功' in 查找) return 查找
  const 阻断 = 同步仓库状态阻断原因(查找)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 来源 = 仓单来源订单(查找)
  const 结果 = 来源.map(订单 => 操作核查证据.value[订单.systemOrderNo]?.同步结果).find(项 => 项 && 项 !== '正常')
  if (结果 === '查询失败') return { 成功: false, 信息: '同步失败，请稍后重试。保留原状态', 对象号: 出库单号 }
  if (结果 === '未查到' || 查找.履约单号 === 'FL-DEMO-260912-8') return { 成功: false, 信息: '暂未查询到仓库出库单，请核实原推单结果。不能据此直接重新推单', 对象号: 出库单号, 待核查: true }
  if (结果 === '未知') return { 成功: false, 信息: '仓库结果尚未核实，请联系仓库核查', 对象号: 出库单号, 待核查: true }
  const 原状态 = 查找.状态
  if (结果 === '已出库') {
    if (来源.some(订单 => { const 履约 = 订单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 查找.履约单号); return !履约 || !Number.isInteger(履约.plannedQuantity) || 履约.plannedQuantity <= 0 || 履约.shippedQuantity > 履约.plannedQuantity })) return { 成功: false, 信息: '仓库结果与已有数量矛盾，请联系仓库核查', 待核查: true }
    查找.状态 = '已出库'
  } else if (原状态 === '取消中') 查找.状态 = 结果 === '拒绝截单' ? '待出库' : '已取消'
  else if (原状态 === '下单中') 查找.状态 = '待出库'
  查找.待核查 = false; 查找.更新时间 = 演示时间(); 查找.原因 = 结果 === '拒绝截单' ? '仓库拒绝截单：当前作业阶段无法撤销' : 查找.状态 === '下单失败' ? 查找.原因 : ''
  if (['待出库', '出库异常', '已出库'].includes(查找.状态)) 查找.外部仓库单号 ??= `WH-DEMO-${查找.履约单号}`
  for (const 订单 of 来源) {
    const 履约 = 订单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 查找.履约单号)!
    if (查找.状态 === '已出库' && 结果 === '已出库') { 履约.shippedQuantity = 履约.plannedQuantity; 履约.shippedAt = 演示时间(); 履约.trackingNumber ??= `DEMO-TRACK-${查找.履约单号}`; 履约.status = '已发货' }
    else if (履约.isActive && 查找.状态 === '待出库') 履约.status = '执行中'
    const 有效 = 订单.fulfillmentOrders.filter(项 => 项.isActive)
    const 正常主链 = ['待推单', '待发货'].includes(订单.processingStatus ?? '') && 平台发货条件已允许(订单)
    if (正常主链 && 有效.length && 有效.every(项 => 项.shippedQuantity === 项.plannedQuantity && 项.plannedQuantity > 0 && 项.status === '已发货') && 有效.reduce((总, 项) => 总 + 项.plannedQuantity, 0) === 订单.items.reduce((总, 行) => 总 + (行.fulfillableQuantity ?? 0), 0)) 订单.processingStatus = '已发货'
    else if (正常主链 && 订单.processingStatus === '待推单' && 有效.length && 有效.every(项 => 仓库执行记录.value.some(仓单 => 仓单.履约单号 === 项.fulfillmentOrderNo && !仓单.待核查 && ['待出库', '出库异常', '已出库'].includes(仓单.状态)))) 订单.processingStatus = '待发货'
    记录操作(订单, '同步仓库状态', `${出库单号}：${原状态} → ${查找.状态}；订单当前${订单.processingStatus}；取得明确仓库事实，不自动解除异常或回退终态。仅本地演示查询。`)
  }
  return { 成功: true, 信息: 结果 === '拒绝截单' && 原状态 === '取消中' ? 查找.原因 : 查找.状态 === '已取消' && 原状态 === '取消中' ? '仓库已确认截单成功，请继续处理来源订单' : `仓库状态已同步：${查找.状态}`, 对象号: 出库单号 }
}
