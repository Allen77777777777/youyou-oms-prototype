import type { 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 操作核查证据, 当前版本, 演示路由, 记录操作, type 仓库执行, type 命令结果 } from './演示会话'
import { 追加订单备注 } from './订单备注模型'
import { 平台发货条件已允许, 零出库阻断原因, 仓库执行结束阻断原因 } from './操作功能模型'

// 与本轮表单输入限制一致；仅约束本地命令，不代表正式生产原因字段定义。
const 操作原因字数上限 = 2000

/** 本地评审方案；不调用平台、仓库或库存接口，生产权限与批量范围另行评审。 */
function 关联仓库执行(订单: 全渠道订单): 仓库执行[] {
  const 履约号 = new Set(订单.fulfillmentOrders.map(履约 => 履约.fulfillmentOrderNo))
  // 历史路径也须检查；只查当前有效履约会漏掉尚未结束的旧请求。
  return 仓库执行记录.value.filter(执行 => 执行.订单号.includes(订单.systemOrderNo) || 履约号.has(执行.履约单号))
}

function 有共享履约(订单: 全渠道订单, 执行记录: 仓库执行[]): boolean {
  if (执行记录.some(执行 => 执行.订单号.some(订单号 => 订单号 !== 订单.systemOrderNo))) return true
  const 履约号 = new Set([
    ...订单.fulfillmentOrders.map(履约 => 履约.fulfillmentOrderNo),
    ...执行记录.map(执行 => 执行.履约单号),
  ])
  return 共享订单.value.some(其他订单 => 其他订单.systemOrderNo !== 订单.systemOrderNo && 其他订单.fulfillmentOrders.some(履约 => 履约号.has(履约.fulfillmentOrderNo)))
}

export function 修改仓库物流阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (订单.fulfillmentMode !== '自配送' || 订单.processingStatus !== '待审核') 原因.push('仅待审核的自配送订单可以修改仓库物流')
  if (订单.blockReason || 订单.cancelledAt) 原因.push(订单.blockReason || '已确认最终取消，不能修改发货路由')
  if (订单.fulfillmentOrders.some(履约 => 履约.isActive)) 原因.push('已有有效履约单；本操作不能改写履约执行快照')
  if (!平台发货条件已允许(订单)) 原因.push('当前付款或取消状态不满足发货条件，请先核实平台订单')
  // 已截单成功且零出库的历史仍保留；只有尚未核清/结束的旧路径阻止新默认方案。
  原因.push(...零出库阻断原因(订单), ...仓库执行结束阻断原因(订单))
  if (有共享履约(订单, 关联仓库执行(订单))) 原因.push('原发货范围涉及共享履约，请先专项核查')
  return 原因
}

export function 不发货阻断原因(订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (订单.fulfillmentMode !== '自配送' || !['待审核', '待推单', '待发货', '异常'].includes(订单.processingStatus ?? '')) 原因.push('仅待审核、待推单、待发货或异常的自配送订单可以操作不发货')
  if (订单.fulfillmentOrders.some(履约 => !Number.isFinite(履约.shippedQuantity) || !Number.isInteger(履约.shippedQuantity) || 履约.shippedQuantity < 0)) 原因.push('履约出库数量缺失或不可信，请先核实实际发货事实')
  if (订单.fulfillmentOrders.some(履约 => 履约.shippedQuantity > 0 || 履约.status === '已发货' || Boolean(履约.shippedAt))) 原因.push('已有有效出库事实，不能将整单设为不发货')
  const 执行记录 = 关联仓库执行(订单)
  if (执行记录.some(执行 => !订单.fulfillmentOrders.some(履约 => 履约.fulfillmentOrderNo === 执行.履约单号))) 原因.push('仓库执行缺少关联履约数量，请先核实零出库证据')
  if (执行记录.some(执行 => 执行.待核查)) 原因.push('仓库请求结果待核查，不能确认执行已安全结束')
  if (执行记录.some(执行 => 执行.状态 === '已出库')) 原因.push('仓库已有出库事实，不能将整单设为不发货')
  if (执行记录.some(执行 => !['下单失败', '已取消'].includes(执行.状态))) 原因.push('存在未安全结束的仓库执行；请先核查或完成仓库撤单')
  if (订单.fulfillmentOrders.some(履约 => 履约.status === '执行中' && !执行记录.some(执行 => 执行.履约单号 === 履约.fulfillmentOrderNo && !执行.待核查 && ['下单失败', '已取消'].includes(执行.状态)))) 原因.push('执行中的履约缺少仓库明确结束证据，请先核查原请求')
  if (有共享履约(订单, 执行记录)) 原因.push('存在共享履约路径，请核对全部来源订单后另行处理，不能单独终止整单')
  原因.push(...零出库阻断原因(订单), ...仓库执行结束阻断原因(订单))
  const 证据 = 操作核查证据.value[订单.systemOrderNo]
  if (证据?.范围无重叠 === false || 证据?.范围已核清 === false) 原因.push('关联发货范围未明确，或存在重叠路径，请先专项核查')
  if ((证据?.平台允许 === false || Boolean(订单.cancelledAt)) && 订单.processingStatus !== '异常') 原因.push('平台状态已变化，请先完成异常复核')
  if (订单.processingStatus === '待发货' && 订单.fulfillmentOrders.filter(项 => 项.isActive).some(项 => !执行记录.some(执行 => 执行.履约单号 === 项.fulfillmentOrderNo && 执行.状态 === '已取消' && !执行.待核查))) 原因.push('待发货的原执行尚未明确截单成功，请先处理原执行')
  return [...new Set(原因)]
}

function 查找可写订单(订单号: string, 期望版本: number): 全渠道订单 | 命令结果 {
  const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 订单号)
  if (!订单) return { 成功: false, 信息: '订单不存在，请刷新列表' }
  if (当前版本(订单号) !== 期望版本) return { 成功: false, 信息: '订单已变化，请重新打开预检后提交' }
  return 订单
}

function 是命令结果(结果: 全渠道订单 | 命令结果): 结果 is 命令结果 { return '成功' in 结果 }

const 路由字段: Array<keyof 订单路由> = ['warehouse', 'warehouseProvider', 'warehouseAccount', 'shippingChannel', 'shippingChannelCode', 'labelMode']

export function 执行演示修改仓库物流(订单号: string, 期望版本: number, 渠道代码: string, 原因: string): 命令结果 {
  const 查找结果 = 查找可写订单(订单号, 期望版本)
  if (是命令结果(查找结果)) return 查找结果
  const 订单 = 查找结果
  const 修改原因 = 原因.trim()
  if (!修改原因) return { 成功: false, 信息: '请输入修改仓库物流的原因' }
  if (修改原因.length > 操作原因字数上限) return { 成功: false, 信息: `修改原因最多 ${操作原因字数上限} 字` }
  const 阻断 = 修改仓库物流阻断原因(订单)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；') }
  const 路由 = 演示路由.find(项 => 项.shippingChannelCode === 渠道代码)
  if (!路由 || 路由.labelMode !== '仓配一体' || 路由字段.some(字段 => !路由[字段]?.trim())) return { 成功: false, 信息: '请选择已有的有效仓配一体仓库物流组合' }
  if (操作核查证据.value[订单号]?.路由适用 === false) return { 成功: false, 信息: '所选仓库物流不适用于该订单，请核对目的地及商品' }
  if (路由字段.every(字段 => 订单.defaultRoute?.[字段] === 路由[字段])) return { 成功: false, 信息: '仓库物流未变化，无需重复修改' }
  const 原路由 = 订单.defaultRoute
  // 只更新订单头默认路由，已有履约单及仓库执行不改写。
  订单.defaultRoute = { ...路由 }
  记录操作(订单, '修改仓库物流', `订单默认路由：${原路由 ? `${原路由.warehouse} / ${原路由.warehouseAccount} / ${原路由.shippingChannel}` : '未设置'} → ${路由.warehouse} / ${路由.warehouseAccount} / ${路由.shippingChannel}；原因：${修改原因}。仅本地演示。`)
  return { 成功: true, 信息: '已修改订单仓库物流，订单保持待审核', 对象号: 订单号 }
}

/** 调用方须先展示受影响订单并取得“确认无需继续发货”的人工确认。 */
export function 执行演示不发货(订单号: string, 期望版本: number, 原因: string): 命令结果 {
  const 查找结果 = 查找可写订单(订单号, 期望版本)
  if (是命令结果(查找结果)) return 查找结果
  const 订单 = 查找结果
  const 终止原因 = 原因.trim()
  if (!终止原因) return { 成功: false, 信息: '请输入不发货原因' }
  if (终止原因.length > 操作原因字数上限) return { 成功: false, 信息: `不发货原因最多 ${操作原因字数上限} 字` }
  const 阻断 = 不发货阻断原因(订单)
  if (阻断.length) return { 成功: false, 信息: 阻断.join('；'), 待核查: 关联仓库执行(订单).some(执行 => 执行.待核查) }
  const 原状态 = 订单.processingStatus
  const 原阻断 = 订单.blockReason
  const 终止履约 = 订单.fulfillmentOrders.filter(履约 => 履约.isActive)
  for (const 履约 of 终止履约) { 履约.isActive = false; 履约.status = '已终止' }
  订单.processingStatus = '不发货'
  订单.noShipmentReason = 终止原因
  订单.blockReason = undefined
  // 平台状态、最终取消事实、路由、数量与外部执行原样保留，不模拟仓库撤单。
  记录操作(订单, '不发货', `${原状态} → 不发货；人工确认无需继续发货；全部履约实际出库数量已核实为零，无未结束或待核查的仓库请求；原因：${终止原因}；原阻断摘要：${原阻断 || '无'}；失效履约单：${终止履约.map(履约 => 履约.fulfillmentOrderNo).join('、') || '无'}。仅本地终止 OMS 后续执行，不代表平台取消或仓库撤单。`)
  return { 成功: true, 信息: '已设为不发货，保留历史履约与仓库执行事实', 对象号: 订单号 }
}

export function 执行批量备注(订单号数组: string[], 内容: string): Array<{ key: string; result: 命令结果 }> {
  return [...new Set(订单号数组)].map(key => {
    if (!共享订单.value.some(订单 => 订单.systemOrderNo === key)) return { key, result: { 成功: false, 信息: '订单不存在，请刷新列表' } }
    const 结果 = 追加订单备注(key, 内容)
    return { key, result: { 成功: 结果.成功, 信息: 结果.信息, 对象号: key } }
  })
}
