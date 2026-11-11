import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import PaymentMaterials from './支付争议材料.vue'
import { createDisputeData } from './数据'
import { enrichPaymentAuditFixtures } from './支付争议对齐样例'
import { allPaymentFiles, attachPaymentFiles, nextPaymentEvidenceDeadline, paymentAvailableActions, paymentHasAnswered, requestCoverage, validatePaymentEvidence } from './支付争议证据'
import type { DisputeRecord } from './类型'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
const records = () => enrichPaymentAuditFixtures(createDisputeData())
const sample = (id: string) => records().find(row => row.id === id)!
function render(row: DisputeRecord, section: 'all' | 'evidence' | 'return' | 'funds' = 'all') {
  wrapper = mount(PaymentMaterials, { props: { record: row, section }, global: { directives: { prototype: {} } } })
  return wrapper
}

describe('支付争议接口字段与办理资格', () => {
  it('逾期原值不算已答复，仍只开放真实选项与已设计操作的交集', () => {
    const row = sample('DEMO-PD-114')
    expect(paymentHasAnswered(row)).toBe(false)
    expect(paymentAvailableActions(row)).toEqual(['ACCEPT', 'CONTEST', 'EVIDENCE'])
    row.payment!.availableChoices = ['SELLER_ACCEPT_WITH_RETURN', 'UNKNOWN_ACTION']
    expect(paymentAvailableActions(row)).toEqual([])
    row.payment!.availableChoices = []
    expect(paymentAvailableActions(row)).toEqual([])
    delete row.payment!.availableChoices
    expect(paymentAvailableActions(row)).toEqual([])
    row.payment!.responseCode = 'NEW_UNRECOGNIZED_RESPONSE'
    expect(paymentHasAnswered(row)).toBe(true)
    expect(paymentAvailableActions(row)).toEqual([])
  })
  it('已抗辩后补证保留当前要件与原证据身份，不重开正式答复', () => {
    const row = sample('DEMO-PD-115')
    expect(paymentHasAnswered(row)).toBe(true)
    expect(paymentAvailableActions(row)).toEqual([])
    expect(requestCoverage(row, row.payment!.details!.requests[0]!)).toBe('尚无对应材料')
    const page = render(row, 'evidence')
    const text = page.text()
    expect(text).toContain('签收凭证')
    expect(text).toContain('历史已提供的证据')
    expect(text).toContain('妥投凭证图片')
    expect(text).toContain('原材料截止')
    expect(text).toContain('2026-11-06 22:00')
    expect(text).toContain('证据提供时间')
    expect(text).toContain('上传时间')
    expect(text).toContain('2026-11-03 16:25')
    expect(text).toContain('2026-11-03 16:30')
    expect(text).toContain('image/jpeg')
    expect(page.findAll('.evidence-file')).toHaveLength(1)
    expect(text).toContain('DEMO-DE-TRK-115')
  })
  it('当前要件完全不返回时，历史组仍展示自己的类型、行、请求和提供时间', () => {
    const row = sample('DEMO-PD-115')
    row.payment!.details!.requests = []
    const text = render(row, 'evidence').text()
    expect(text).toContain('妥投凭证图片')
    expect(text).toContain('DEMO-LINE-115-1')
    expect(text).toContain('原请求时间')
    expect(text).toContain('证据提供时间')
    expect(text).not.toContain('尚无对应材料')
  })
  it('追偿与保护、费用各自展示，缺实际承担不补零或推算', () => {
    const text = render(sample('DEMO-PD-116'), 'funds').text()
    expect(text).toContain('平台追偿金额')
    expect(text).toContain('EUR 12.40')
    expect(text).toContain('EUR 30.20')
    expect(text).toContain('EUR 1.50')
    expect(text).toContain('EUR 0.50')
    expect(text).not.toContain('卖家实际承担')
  })
  it('地址第二行与县郡有值展示，空值整项不出现', () => {
    const row = sample('DEMO-PD-115')
    const page = render(row, 'return')
    expect(page.text()).toContain('Unit DEMO-B')
    expect(page.text()).toContain('DEMO District')
    delete row.payment!.details!.returnAddress!.county
    delete row.payment!.details!.returnAddress!.addressLine2
    page.unmount()
    expect(render(row, 'return').text()).not.toContain('县／郡')
    expect(wrapper!.text()).not.toContain('补充地址')
  })
  it('证据归集后保留组快照；新请求不能靠同类型旧材料自动满足', () => {
    const row = sample('DEMO-PD-104')
    const request = row.payment!.details!.requests[0]!
    const draft = { evidenceRequest: request.key, evidenceFiles: [new File(['image'], 'description.jpg', { type: 'image/jpeg' })] }
    expect(validatePaymentEvidence(row, 'EVIDENCE', draft)).toBe('')
    attachPaymentFiles(row, draft, '2026-11-05T10:00:00Z')
    expect(allPaymentFiles(row)).toHaveLength(1)
    expect(requestCoverage(row, request)).toBe('已提供材料')
    const group = row.payment!.details!.evidenceSets![0]!
    expect(group.type).toBe(request.type)
    expect(group.requestedAt).toBe(request.requestedAt)
    expect(group.files[0]?.uploadedAt).toBe('2026-11-05T10:00:00Z')
    request.key = 'new-request'
    request.dueAt = '2026-11-12T10:00:00Z'
    expect(group.dueAt).not.toBe(request.dueAt)
    expect(requestCoverage(row, request)).toBe('尚无对应材料')
    request.evidenceId = group.id
    request.requestedAt = '2026-11-06T10:00:00Z'
    expect(requestCoverage(row, request)).toBe('尚无对应材料')
    expect(validatePaymentEvidence(row, 'CONTEST', {})).toContain('请先')
  })
  it('文件上限按独立历史和兼容镜像去重统计，不因镜像重复阻止合法新增', () => {
    const row = sample('DEMO-PD-104')
    const request = row.payment!.details!.requests[0]!
    for (let index = 0; index < 4; index++) attachPaymentFiles(row, { evidenceRequest: request.key,
      evidenceFiles: [new File(['image'], 'file-' + index + '.jpg', { type: 'image/jpeg' })] }, '2026-11-05T10:00:00Z')
    expect(allPaymentFiles(row)).toHaveLength(4)
    const draft = { evidenceRequest: request.key, evidenceFiles: [new File(['image'], 'fifth.jpg', { type: 'image/jpeg' })] }
    expect(validatePaymentEvidence(row, 'EVIDENCE', draft)).toBe('')
    row.payment!.evidence = []
    expect(allPaymentFiles(row)).toHaveLength(4)
    attachPaymentFiles(row, draft, '2026-11-05T10:00:00Z')
    expect(allPaymentFiles(row)).toHaveLength(5)
    expect(validatePaymentEvidence(row, 'EVIDENCE', { ...draft, evidenceFiles: [new File(['image'], 'sixth.jpg', { type: 'image/jpeg' })] })).toContain('最多 5')
  })
  it('最近举证期限仅从未完成必需请求的可信绝对时刻选择，保留来源值', () => {
    const row = sample('DEMO-PD-104'), details = row.payment!.details!, request = details.requests[0]!
    row.pending = null; row.status = 'ACTION_NEEDED'; row.owner = '卖家'
    row.payment!.evidence = []; details.evidenceSets = []
    details.requests = ['2026-11-05T10:00:00', '2026-11-05', '2026-11-05T10:00:00-00:00', '2026-02-30T10:00:00Z'].map((dueAt, index) => ({ ...request, key: `unknown-${index}`, dueAt }))
    expect(nextPaymentEvidenceDeadline(row)).toBe('')
    details.requests.push({ ...request, key: 'later', dueAt: '2026-11-06T02:00:00Z' }, { ...request, key: 'earlier', dueAt: '2026-11-06T09:00:00+08:00' },
      { ...request, key: 'optional', type: 'OPTIONAL_SUPPORTING_DOCUMENTS', dueAt: '2026-11-01T00:00:00Z' })
    expect(nextPaymentEvidenceDeadline(row)).toBe('2026-11-06T09:00:00+08:00')
    attachPaymentFiles(row, { evidenceRequest: 'earlier', evidenceFiles: [new File(['image'], 'deadline.jpg', { type: 'image/jpeg' })] }, '2026-11-06T00:00:00Z')
    expect(nextPaymentEvidenceDeadline(row)).toBe('2026-11-06T02:00:00Z')
    row.owner = 'eBay'
    expect(nextPaymentEvidenceDeadline(row)).toBe('')
  })
  it('证据请求身份继续决定归属，仅可信时刻能够排除较早批次，不猜无偏移来源', () => {
    const row = sample('DEMO-PD-104'), request = row.payment!.details!.requests[0]!
    request.requestedAt = '2026-11-06T08:00:00+08:00'
    attachPaymentFiles(row, { evidenceRequest: request.key, evidenceFiles: [new File(['image'], 'time.jpg', { type: 'image/jpeg' })] }, '2026-11-06T00:00:00Z')
    const set = row.payment!.details!.evidenceSets![0]!
    expect(requestCoverage(row, request)).toBe('已提供材料')
    set.providedAt = '2026-11-05T23:59:59.999Z'
    expect(requestCoverage(row, request)).toBe('尚无对应材料')
    for (const value of ['2026-11-05T10:00:00', '2026-11-05', '2026-11-05T10:00:00-00:00', '2026-02-30T10:00:00Z']) {
      set.providedAt = value
      expect(requestCoverage(row, request)).toBe('已提供材料')
      request.requestedAt = value; set.providedAt = '2026-11-05T23:59:59.999Z'
      expect(requestCoverage(row, request)).toBe('已提供材料')
      request.requestedAt = '2026-11-06T08:00:00+08:00'
    }
    request.key = 'unrelated-request'; request.evidenceId = undefined
    expect(requestCoverage(row, request)).toBe('尚无对应材料')
  })
})
