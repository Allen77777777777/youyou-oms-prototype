import type { RouteRecordRaw } from 'vue-router'
import type { TicketSource } from '../工单管理/会话'
import { kindLabels, type DisputeKind, type DisputeRecord } from './类型'

export const disputeKinds: DisputeKind[] = ['INR_REQUEST', 'EBAY_CASE', 'PAYMENT_DISPUTE']
export const idLabels = { INR_REQUEST: 'Request ID', EBAY_CASE: 'Case ID', PAYMENT_DISPUTE: 'Dispute ID' }
export const caseSources = { ITEM_NOT_RECEIVED: '未收到货升级', RETURN: '退货申请升级' }

export function validKind(value: unknown): value is DisputeKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(kindLabels, value)
}

export function disputeLocation(shopId: string, kind: DisputeKind, id: string) {
  return { name: 'oms-ebay-dispute-detail', params: { shopId, kind, recordId: id } }
}

export const disputeDetailRoute: RouteRecordRaw = {
  name: 'oms-ebay-dispute-detail',
  path: '/oms/ebay-service/disputes/:shopId/:kind/:recordId',
  component: () => import('./纠纷详情页面.vue'),
  meta: { title: 'eBay纠纷详情', source: '用户规划', activeMenu: '/oms/ebay-service/disputes', tabTitlePrefix: '纠纷', tabTitleParam: 'recordId' },
}

export function disputeTicketSource(row: DisputeRecord): TicketSource {
  // 既有 Case 工单以空 contextId 保存。其余两类显式记录类型，按同店同类型回链。
  return { kind: 'dispute', shopId: row.shopId, id: row.id, shopName: row.shopName,
    summary: row.title, contextId: row.kind === 'EBAY_CASE' ? undefined : row.kind }
}
