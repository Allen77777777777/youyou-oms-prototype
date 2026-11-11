import { reactive } from 'vue'
import { recordKey, type ActionCode, type ActionDraft, type DisputeRecord, type InquiryTracking } from './模型'
import { fileRequests, isPaymentDecision } from './支付争议证据'

interface HandlingDraft {
  revision: number
  basis: ReturnType<typeof handlingBasis>
  draft: ActionDraft
  address: { recipient: string; phone: string; street: string; street2: string; county: string; city: string; region: string; postal: string; country: string; phoneCountry: string }
  parcels: InquiryTracking[]
  attachments: File[]
  prepared: ActionDraft | null
}
interface HandlingView {
  active: ActionCode | null
  drafts: Partial<Record<ActionCode, HandlingDraft>>
  feedback: string
  followContest: boolean
}
const views = new Map<string, HandlingView>()
export function handlingBasis(row: DisputeRecord, action: ActionCode) {
  const amount = action === 'REFUND' ? row.inquiry?.refundEstimate : row.payment ? row.amount : undefined
  return {
    amount: amount?.value && amount.currency ? amount.currency + ' ' + amount.value : '待核实',
    refundBreakdown: action === 'REFUND' ? JSON.stringify(row.inquiry?.refundEstimateBreakdown ?? null) : '',
    decisionId: action === 'APPEAL' ? row.caseInfo?.latestDecisionId || '' : '',
    decision: action === 'APPEAL' ? row.caseInfo?.decision || '' : '',
  }
}
export function handlingView(row: DisputeRecord): HandlingView {
  const key = recordKey(row)
  if (!views.has(key)) views.set(key, reactive({ active: null, drafts: {}, feedback: '', followContest: false }))
  return views.get(key)!
}
export function clearHandlingView(row: DisputeRecord) { views.delete(recordKey(row)) }
export function actionView(row: DisputeRecord, action: ActionCode): HandlingDraft {
  const view = handlingView(row)
  if (!view.drafts[action]) {
    const trackings = row.inquiry?.trackings
    view.drafts[action] = {
      revision: row.revision, basis: handlingBasis(row, action),
      draft: { evidenceRequest: fileRequests(row)[0]?.key, platformRevision: isPaymentDecision(action) ? row.payment?.platformRevision : undefined },
      address: { recipient:'', phone:'', street:'', street2:'', county:'', city:'', region:'', postal:'', country:'', phoneCountry:'' },
      parcels: trackings?.length ? trackings.map(parcel => ({ ...parcel })) : [{ carrier: row.inquiry?.carrier || '', tracking: row.inquiry?.tracking || '' }],
      attachments: [], prepared: null,
    }
  }
  return view.drafts[action]!
}
