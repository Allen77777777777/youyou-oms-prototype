import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'
import type { 仓库执行 } from '../订单处理/演示会话'
import { 计算剩余发货时间, 解析来源时刻 } from '../订单处理/时间展示工具'
import type { 标发单 } from './标发逻辑'

export function 取得标发渠道(单: 标发单, 来源: 全渠道订单 | undefined, 渠道列表: 渠道配置[]) {
  if (!来源 || 来源.systemOrderNo !== 单.orderNo) return { error: '来源订单不存在或关联不一致，请核查', channel: undefined, mapping: undefined }
  const 路由 = 来源?.fulfillmentOrders.find(row => row.fulfillmentOrderNo === 单.fulfillmentNo)?.route
  const 候选 = 路由?.shippingChannelId ? 渠道列表.filter(row => row.id === 路由.shippingChannelId) : []
  const 渠道 = 候选.length === 1 ? 候选[0] : undefined
  if (!渠道 || !路由) return { error: '实际履约渠道尚未准确关联，请核查物流渠道资料', channel: undefined, mapping: undefined }
  if (渠道.provider !== 路由.warehouseProvider || 渠道.account !== 路由.warehouseAccount || 渠道.warehouse !== 路由.warehouse || 渠道.code !== 路由.shippingChannelCode) return { error: '渠道资料与实际执行路由不一致，请核查', channel: undefined, mapping: undefined }
  const 平台 = 来源?.platformCode === 'Mercado Libre' ? '美客多' : 来源?.platformCode === 'Rakuten' ? '乐天' : 来源?.platformCode
  const 映射 = 渠道.shipmentMappings.filter(row => row.platform === 平台)
  const mapping = 映射.length === 1 ? 映射[0] : undefined
  const error = !mapping ? '本平台标发设置缺失或重复，请核查渠道配置' : !mapping.carrierCode.trim() ? '本平台承运商未配置，请完善渠道标发设置' : mapping.trackingNumberSource !== 'tracking_number' ? '标发单号来源无效，请核查渠道配置' : ''
  return { channel: 渠道, mapping, error }
}

/** 精确关联出库业务身份与来源，不用第一张同履约仓单代表本次出库。 */
export function 取得标发出库(单: 标发单, 执行列表: 仓库执行[]) {
  const 候选 = 单.outboundNo ? 执行列表.filter(row => row.出库单号 === 单.outboundNo && row.履约单号 === 单.fulfillmentNo && row.订单号.includes(单.orderNo)) : []
  return 候选.length === 1 ? 候选[0] : undefined
}

export function 使用标发准备值(单: 标发单) { return 单.status === '待标发' && !单.attempts.length && !单.externalId }

/** 未首次提交时取当前映射；已经提交的单据始终展示、查询原请求快照。 */
export function 取得标发准备单(单: 标发单, 来源: 全渠道订单 | undefined, 渠道列表: 渠道配置[]) {
  if (!使用标发准备值(单)) return 单
  const 关联 = 取得标发渠道(单, 来源, 渠道列表)
  const 履约 = 来源?.fulfillmentOrders.find(row => row.fulfillmentOrderNo === 单.fulfillmentNo)
  return { ...单, carrier: 关联.mapping?.carrierCode.trim() || '', tracking: 履约?.trackingNumber || '', shippedAt: 履约?.shippedAt || '' }
}

export function 标发字段阻断(单: 标发单, 来源: 全渠道订单 | undefined, 渠道列表: 渠道配置[], 执行列表: 仓库执行[]): string[] {
  const 关联 = 取得标发渠道(单, 来源, 渠道列表)
  const 原因 = 关联.error ? [关联.error] : []
  if (!使用标发准备值(单) && 关联.mapping && 单.carrier !== 关联.mapping.carrierCode.trim()) 原因.push('当前渠道承运商与原提交快照不同，请先核查实际发运及历史请求')
  if (!单.outboundNo) 原因.push('缺少本次出库单关联，请先核查有效出库依据')
  if (单.outboundNo) {
    const 出库 = 取得标发出库(单, 执行列表)
    if (!出库 || 出库.状态 !== '已出库' || 出库.待核查 || !出库.出库事实 || !Number.isInteger(出库.出库事实.shipped) || (出库.出库事实.shipped ?? 0) < 单.quantity) 原因.push('关联出库事实缺失或待核查，请先核对仓库执行')
    const 准备 = 取得标发准备单(单, 来源, 渠道列表)
    if (出库?.出库事实 && (准备.tracking !== 出库.出库事实.tracking || 解析来源时刻(准备.shippedAt) === undefined || 解析来源时刻(准备.shippedAt) !== 解析来源时刻(出库.出库事实.shippedAt || undefined))) 原因.push('标发跟踪号或发货时间与关联出库事实不同，请先核查')
  }
  return 原因
}

export function 标发时效(单: 标发单, 截止: string | undefined, 当前时刻: number) {
  if (单.status === '标发成功') return { kind: 'complete' as const, text: '标发已完成' }
  if (单.status === '无需标发') return { kind: 'complete' as const, text: '无需标发' }
  // 这是来源订单最晚发货时间的观察投影，不构造 confirmation_deadline_at。
  return 计算剩余发货时间(截止, '待发货', 当前时刻)
}
