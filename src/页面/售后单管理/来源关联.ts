import { returnSession } from '../eBay退换货申请/数据'
import type { ReturnRecord } from '../eBay退换货申请/模型'

export interface AfterSaleSourceIdentity { shopId: string; returnId: string; orderNo: string }

/** 展示与只读核查共用来源身份；缺省订单号不是身份冲突，写入/审核资格仍单独复验。 */
export function resolveAfterSaleSource(
  record: AfterSaleSourceIdentity, records: readonly ReturnRecord[] = returnSession.records,
): { row?: ReturnRecord; issue: string } {
  if (!record.shopId || !record.returnId) return { issue: '来源店铺或申请号缺失，请核实来源关联' }
  const matches = records.filter(row => row.shopId === record.shopId && row.id === record.returnId)
  if (!matches.length) return { issue: '未找到关联退货申请，请核实来源关联' }
  if (matches.length !== 1) return { issue: '来源申请存在重复记录，请核实后查看' }
  const row = matches[0]!
  if (row.detail?.identityConflicts?.summary || row.detail?.identityConflicts?.detail) return { issue: '来源申请摘要或详情存在身份冲突，请核实来源关联' }
  if (row.orderNo && record.orderNo && row.orderNo !== record.orderNo) return { issue: '来源申请与售后单的订单号冲突，请核实来源关联' }
  // 内容隐藏不抹去申请状态或核查入口；物流、附件等阅读区继续按来源 contentOnHold 遮蔽。
  return { row, issue: '' }
}
