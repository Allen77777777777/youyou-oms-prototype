import { currentHandlerId, getSkuHandlerIds, handlerFilterOptions, handlerNames, handlerOptions } from '../../组件/客服处理人/处理人'
import type { 全渠道订单, 订单商品行, 订单处理人分配 } from '../全渠道订单/类型'
import type { 作业行 } from './展示工具'

// 与客服共用中台人员身份和 SKU 绑定；本地资料为虚构样例，生产需接入真实人员及商品服务。
export const 订单处理人选项 = handlerOptions
export const 订单处理人筛选选项 = handlerFilterOptions
export const 当前订单处理人ID = currentHandlerId
export const 处理人姓名 = handlerNames

type 读取SKU运营人员 = (skus: readonly string[]) => string[]
const 去重人员 = (ids: readonly string[]) => [...new Set(ids.filter(Boolean))]

/** 只在创建/明确分配边界调用；资料读取失败不能伪装成已分配。 */
export function 创建订单处理人分配(订单: 全渠道订单, 时间: string, 读取人员: 读取SKU运营人员 = getSkuHandlerIds): 订单处理人分配 {
  const lines: 订单处理人分配['lines'] = 订单.items.map(商品 => {
    const systemSku = 商品.systemSku?.trim() || undefined
    const 已识别 = 商品.skuResolutionStatus === '成功' && !!systemSku
    const operatorIds = 已识别 ? 去重人员(读取人员([systemSku!])) : []
    return {
      externalLineId: 商品.externalLineId, systemSku, operatorIds,
      ...(!已识别 ? { issue: '系统 SKU 未识别' as const } : !operatorIds.length ? { issue: '系统 SKU 无运营人员' as const } : {}),
    }
  })
  return { handlerIds: 去重人员(lines.flatMap(行 => 行.operatorIds)), assignedAt: 时间, source: 'SKU', lines }
}

/** 幂等初始化。空名单也是有效分配结果，不因再次调用或 SKU 换人而被覆盖。 */
export function 初始化订单处理人(订单: 全渠道订单, 时间 = new Date().toISOString()): void {
  if (订单.fulfillmentMode !== '自配送' || 订单.handlerAssignment !== undefined) return
  订单.handlerAssignment = 创建订单处理人分配(订单, 时间)
}

/** 查询只读取快照；历史缺少记录时不从今天的商品目录反推责任。 */
export function 获取订单处理人(订单: 全渠道订单): string[] {
  return 去重人员(订单.handlerAssignment?.handlerIds ?? [])
}

/** 商品行展示分配依据中的运营人员，与订单当前责任分开命名。 */
export function 获取商品运营人员(订单: 全渠道订单, 商品: 订单商品行): string[] {
  return 去重人员(订单.handlerAssignment?.lines.filter(行 => 行.externalLineId === 商品.externalLineId && 行.systemSku === 商品.systemSku?.trim()).flatMap(行 => 行.operatorIds) ?? [])
}

export function 获取订单处理人缺失原因(订单: 全渠道订单): string[] {
  if (!订单.handlerAssignment) return ['尚未取得订单处理人分配记录']
  if (!订单.handlerAssignment.lines.length) return ['尚无可识别的订单商品']
  return 订单.handlerAssignment.lines.filter(行 => 行.issue).map(行 => `${行.systemSku || 行.externalLineId}：${行.issue}`)
}

/** 与筛选共用有效履约来源；拆包仍读取来源订单整单名单，不按包裹商品重新分配。 */
export function 获取作业处理人来源(行: 作业行, 订单全集: readonly 全渠道订单[]): 全渠道订单[] {
  if (!行.fulfillment) return [行.order]
  const 履约号 = 行.fulfillment.fulfillmentOrderNo
  const 来源 = 订单全集.filter(订单 => 订单.fulfillmentOrders.some(履约 => 履约.isActive && 履约.fulfillmentOrderNo === 履约号))
  return [...new Map(来源.map(订单 => [订单.systemOrderNo, 订单])).values()]
}

export function 获取作业处理人(行: 作业行, 订单全集: readonly 全渠道订单[]): string[] {
  return 去重人员(获取作业处理人来源(行, 订单全集).flatMap(获取订单处理人))
}

export function 获取作业处理人缺失原因(行: 作业行, 订单全集: readonly 全渠道订单[]): string[] {
  const 来源 = 获取作业处理人来源(行, 订单全集)
  return 来源.flatMap(订单 => 获取订单处理人缺失原因(订单).map(原因 => 来源.length > 1 ? `${订单.systemOrderNo} · ${原因}` : 原因))
}
