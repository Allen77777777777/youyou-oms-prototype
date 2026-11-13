import { returnSession } from '../eBay退换货申请/数据'
import type { ReturnRecord } from '../eBay退换货申请/模型'
import type { AfterSaleItem, AfterSaleRecord } from './会话'
import { canViewAfterSale } from './权限'
import { resolveAfterSaleSource } from './来源关联'

export interface AfterSaleDisplayItem extends AfterSaleItem { skuSourceNote: string }
type ItemIdentity = Pick<AfterSaleItem, 'lineId' | 'sku' | 'title'>

function displayItem<T extends ItemIdentity>(item: T, source?: ReturnRecord): T & { skuSourceNote: string } {
  const detail = source?.detail
  const hidden = detail?.itemOnHold === true || detail?.contentOnHold === true
  // 仅将明确属于本条来源交易商品的 SKU 用于只读展示；不能按标题或同申请首行猜配。
  const sourceLineId = detail?.itemId && detail.transactionId ? JSON.stringify([detail.itemId, detail.transactionId]) : ''
  const sourceSku = detail?.readStatus.detail.status === 'success' ? source?.sku.trim() : ''
  const fallback = !item.sku?.trim() && !!sourceSku && !!sourceLineId && item.lineId === sourceLineId
  return { ...item, title: hidden ? '平台已隐藏商品内容' : item.title,
    sku: fallback ? sourceSku : item.sku,
    skuSourceNote: fallback ? '退货申请来源 · OMS 商品未核实' : '',
  }
}

/** 展示投影不回写办理快照，也不参与重发商品、数量或审核资格校验。 */
export function afterSaleDisplayItems(
  record: AfterSaleRecord, sources: readonly ReturnRecord[] = returnSession.records,
): AfterSaleDisplayItem[] {
  const source = canViewAfterSale(record) ? resolveAfterSaleSource(record, sources).row : undefined
  return record.items.map(item => displayItem(item, source))
}

/** 建单联填与管理页共用只读展示；实际提交仍使用原始 returnSaleItem。 */
export function afterSaleSourceItemDisplay<T extends ItemIdentity>(
  row: ReturnRecord, item: T, sources: readonly ReturnRecord[] = returnSession.records,
): T & { skuSourceNote: string } {
  const identity = { shopId: row.shopId, returnId: row.id, orderNo: row.orderNo }
  const source = canViewAfterSale(identity) ? resolveAfterSaleSource(identity, sources).row : undefined
  return displayItem(item, source)
}
