import { afterSaleRecords, updateAfterSaleResult } from '../售后单管理/会话'
import type { ReturnRecord } from './模型'
import { returnRefundEvidenceBusinessIds } from './售后回执证据'

/** 成功证据归原尝试和原业务，不能借用申请当前状态或最近一笔指针。 */
export function reconcileReturnRefundEvidence(row: ReturnRecord): void {
  for (const businessId of returnRefundEvidenceBusinessIds(row)) {
    const records = afterSaleRecords.value.filter(record => record.shopId === row.shopId && record.returnId === row.id && record.requestId === businessId && (record.kind === '全额退款' || record.kind === '部分退款'))
    if (records.length !== 1) continue
    const record = records[0]!
    updateAfterSaleResult(record.no, record.actualAmount ? '平台退款成功' : '平台已确认退款，实退金额待核实')
  }
}

export function reconcileReturnBuyerReplies(row: ReturnRecord): void {
  for (const reply of row.afterSaleBuyerReplies || []) {
    const records = afterSaleRecords.value.filter(record => record.shopId === row.shopId && record.returnId === row.id && record.requestId === reply.requestId && record.kind === '部分退款' && ['部分退款报价', '提出部分退款报价'].includes(record.actionLabel || ''))
    if (records.length !== 1) continue
    const record = records[0]!
    // 已取得资金结果后，重复的早期买家接受事件不能降回处理中。
    if (record.actualAmount || /平台退款成功|平台已确认退款|平台退款失败/.test(record.executionResult)) continue
    updateAfterSaleResult(record.no, reply.decision === 'accepted' ? '买家已接受报价，退款处理中' : '买家已拒绝报价')
    if (reply.decision === 'accepted' && row.afterSaleOfferNo === record.no) row.afterSaleRefundNo = record.no
  }
}
