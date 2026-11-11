import { getSkuHandlerIds } from '@/组件/客服处理人/处理人'
import { 共享订单 } from '../订单处理/演示会话'
import { readHandlerReturnItem } from './关联资料'
import { isReturnClosed, type ReturnRecord } from './模型'

export function getReturnSystemSkus(row: ReturnRecord): string[] {
  const detail = row.detail
  if (detail?.itemOnHold || detail?.contentOnHold || detail?.identityConflicts?.summary || detail?.identityConflicts?.detail) return []
  const item = readHandlerReturnItem(row, 共享订单.value)
  return item?.skuResolutionStatus === '成功' && item.systemSku ? [item.systemSku] : []
}

export function getReturnHandlerIds(row: ReturnRecord): string[] {
  if (isReturnClosed(row)) return row.closedHandlerIds ?? []
  return getSkuHandlerIds(getReturnSystemSkus(row))
}

export function captureReturnHandlers(row: ReturnRecord) {
  row.closedHandlerIds = getSkuHandlerIds(getReturnSystemSkus(row))
}
