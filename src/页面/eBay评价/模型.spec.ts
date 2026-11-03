import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buyerFeedbackTemplates, createBuyerFeedback, createReviews } from './数据'
import { resetReviewSession, reviewSession, syncReviews } from './会话'
import {
  addReviewNote, canReplyToReview, createReviewFilters, exportBuyerFeedbackCsv, exportReviewsCsv, filterBuyerFeedback, filterReviews,
  getBuyerFeedbackBlockedReason, getBuyerFeedbackMethod, getBuyerFeedbackResult, getLinkedBuyerFeedback, getLinkedBuyerFeedbackStatus, getReviewDisplay, groupReviewReasons, groupReviewsByShop, groupReviewTrend,
  leaveBuyerFeedback, replyToReview, summarizeReviews, toCsv, updateReviewHandling, validateReviewText,
} from './模型'
import type { ReviewRecord } from './类型'

const now = '2026-10-29T12:00:00+08:00'
const record = (patch: Partial<ReviewRecord> = {}): ReviewRecord => ({ ...createReviews()[0]!, ...patch })

describe('评价筛选与北京时间边界', () => {
  it('默认最近30天不混入更早历史，筛选不改变原始顺序', () => {
    const records = createReviews(), ids = records.map(item => item.id)
    expect(filterReviews(records, createReviewFilters())).toHaveLength(46)
    expect(records.map(item => item.id)).toEqual(ids)
  })
  it('首尾日完整纳入，UTC日期不能替代北京时间', () => {
    const records = [
      record({ id: 'before', createdAt: '2026-10-28T15:59:59Z' }),
      record({ id: 'start', createdAt: '2026-10-28T16:00:00Z' }),
      record({ id: 'end', createdAt: '2026-10-29T15:59:59Z' }),
      record({ id: 'after', createdAt: '2026-10-29T16:00:00Z' }),
    ]
    expect(filterReviews(records, createReviewFilters({ dateRange: ['2026-10-29', '2026-10-29'] })).map(item => item.id)).toEqual(['end', 'start'])
  })
  it('店铺、类型、来源、负责人、平台状态与待处理取交集', () => {
    const records = [record(), record({ id: 'other-shop', shopId: 'shop-uk' }), record({ id: 'auto', automated: true }), record({ id: 'done', handlingStatus: 'resolved' })]
    const result = filterReviews(records, createReviewFilters({ shopIds: ['shop-us'], commentTypes: ['NEUTRAL'], source: 'buyer', owners: ['客服01'], platformStates: ['ENTERED'], onlyAttention: true }))
    expect(result.map(item => item.id)).toEqual(['REV-DEMO-01'])
  })
  it('字段精确匹配和多值搜索不借其它字段命中，超限不变成全量', () => {
    const records = createReviews()
    expect(filterReviews(records, createReviewFilters({ field: 'buyerId', mode: 'exact', query: 'buyer_demo_01\nfeedback_demo_002' }))).toHaveLength(2)
    expect(filterReviews(records, createReviewFilters({ field: 'sku', query: 'buyer_demo_01' }))).toHaveLength(0)
    expect(filterReviews(records, createReviewFilters({ mode: 'exact', query: Array.from({ length: 1001 }, (_, i) => `x${i}`).join('\n') }))).toEqual([])
  })
  it('未知字段与无效日期不能放宽查询', () => {
    expect(filterReviews(createReviews(), createReviewFilters({ field: 'unknown' }))).toEqual([])
    expect(filterReviews(createReviews(), createReviewFilters({ dateRange: ['2026-10-29', '2026-10-01'] }))).toEqual([])
  })
  it('给买家留评使用独立记录和交易完成日期，不继承收到评价的筛选', () => {
    expect(filterBuyerFeedback(createBuyerFeedback(), createReviewFilters(), 'pending')).toHaveLength(11)
    expect(filterBuyerFeedback(createBuyerFeedback(), createReviewFilters({ dateRange: [] }), 'pending')).toHaveLength(12)
    expect(filterBuyerFeedback(createBuyerFeedback(), createReviewFilters(), 'sent')).toHaveLength(5)
  })
})

describe('评价汇总只读同源事实', () => {
  it('排除撤回、隐藏和被替代旧评价，改评申请中仍计入', () => {
    const rows: ReviewRecord[] = [
      record({ id: 'positive', commentType: 'POSITIVE' }),
      record({ id: 'neutral' }),
      record({ id: 'negative', commentType: 'NEGATIVE', platformState: 'REVISION_OPEN', handlingStatus: 'processing' }),
      record({ id: 'withdrawn', platformState: 'WITHDRAWN' }),
      record({ id: 'hidden', platformState: 'HIDDEN' }),
      record({ id: 'revised', platformState: 'REVISED' }),
    ]
    expect(summarizeReviews(rows)).toMatchObject({ total: 3, positive: 1, neutral: 1, negative: 1, nonPositive: 2, pending: 2, processing: 1, resolved: 0 })
    expect(summarizeReviews(rows).nonPositiveRate).toBeCloseTo(2 / 3 * 100)
  })
  it('零有效样本的比率为null，不能显示0%或拿历史数填补', () => {
    expect(summarizeReviews([]).nonPositiveRate).toBeNull()
    expect(summarizeReviews([record({ platformState: 'HIDDEN' })]).total).toBe(0)
  })
  it('自动评价来源筛选改变分母，处理完成不改变平台类型', () => {
    const rows = [record({ commentType: 'NEGATIVE' }), record({ id: 'auto', commentType: 'POSITIVE', automated: true })]
    expect(summarizeReviews(rows).nonPositiveRate).toBe(50)
    expect(summarizeReviews(filterReviews(rows, createReviewFilters({ source: 'buyer' }))).nonPositiveRate).toBe(100)
    updateReviewHandling(rows[0]!, { handlingStatus: 'resolved' }, '客服02', now)
    expect(summarizeReviews(rows)).toMatchObject({ nonPositive: 1, pending: 0, resolved: 1 })
  })
  it('趋势补日期零值，按北京时间归组，合计与卡片一致', () => {
    const rows = [record({ createdAt: '2026-10-28T16:00:00Z' }), record({ id: 'hidden', createdAt: now, platformState: 'HIDDEN' })]
    expect(groupReviewTrend(rows, ['2026-10-28', '2026-10-29'])).toEqual([
      { date: '2026-10-28', total: 0, positive: 0, neutral: 0, negative: 0 },
      { date: '2026-10-29', total: 1, positive: 0, neutral: 1, negative: 0 },
    ])
  })
  it('店铺汇总隔离店铺；原因只统计有效中差评并保留未分类', () => {
    const rows = [record({ reason: '' }), record({ id: 'other', shopId: 'shop-uk', shopName: '演示店铺-UK', commentType: 'NEGATIVE', reason: '配送延迟' }), record({ id: 'good', commentType: 'POSITIVE', reason: '配送延迟' })]
    expect(groupReviewsByShop(rows).find(item => item.shopId === 'shop-us')).toMatchObject({ total: 2, nonPositive: 1, nonPositiveRate: 50 })
    expect(groupReviewReasons(rows)).toEqual(expect.arrayContaining([{ reason: '未分类', count: 1 }, { reason: '配送延迟', count: 1 }]))
  })
})

describe('平台隐藏评价的内容保护', () => {
  it('统一投影不输出正文、翻译、回复或追加内容，底层原始资料保持不变', () => {
    const hidden = record({
      platformState: 'HIDDEN', content: 'PRIVATE-ORIGINAL', translation: 'PRIVATE-TRANSLATION',
      reply: { text: 'PRIVATE-REPLY', by: '客服01', at: now }, followup: { text: 'PRIVATE-FOLLOWUP', by: 'buyer_demo_01', at: now },
    })
    const snapshot = JSON.stringify(hidden)
    expect(getReviewDisplay(hidden)).toEqual({ hidden: true, content: '该评价内容已被平台隐藏', translation: '', reply: undefined, followup: undefined })
    expect(JSON.stringify(hidden)).toBe(snapshot)
    hidden.platformState = 'ENTERED'
    expect(getReviewDisplay(hidden)).toMatchObject({ hidden: false, content: 'PRIVATE-ORIGINAL', translation: 'PRIVATE-TRANSLATION', reply: { text: 'PRIVATE-REPLY' }, followup: { text: 'PRIVATE-FOLLOWUP' } })
  })
  it('隐藏正文不能搜索命中或被CSV导出，仍允许按元数据定位记录', () => {
    const hidden = record({ platformState: 'HIDDEN', content: 'PRIVATE-ORIGINAL', translation: 'PRIVATE-TRANSLATION', reply: { text: 'PRIVATE-REPLY', by: '客服01', at: now }, followup: { text: 'PRIVATE-FOLLOWUP', by: 'buyer_demo_01', at: now } })
    expect(filterReviews([hidden], createReviewFilters({ field: 'content', query: 'PRIVATE', mode: 'contains' }))).toEqual([])
    expect(filterReviews([hidden], createReviewFilters({ field: 'content', query: 'PRIVATE-ORIGINAL', mode: 'exact' }))).toEqual([])
    expect(filterReviews([hidden], createReviewFilters({ field: 'id', query: hidden.id, mode: 'exact' }))).toEqual([hidden])
    const csv = exportReviewsCsv([hidden])
    expect(csv).not.toContain('PRIVATE')
    expect(csv).toContain('该评价内容已被平台隐藏')
    expect(csv).toContain(hidden.id)
    expect(hidden.content).toBe('PRIVATE-ORIGINAL')
  })
})

describe('回复评价与内部处理的独立性', () => {
  it('只提交一次，重复提交不改写首次回复评价和原评价', () => {
    const item = record(), original = item.content
    expect(replyToReview(item, ' We are checking this issue. ', '客服01', now).ok).toBe(true)
    expect(item.reply?.text).toBe('We are checking this issue.')
    expect(item.handlingStatus).toBe('pending')
    expect(item.content).toBe(original)
    expect(replyToReview(item, 'Another reply.', '客服02', now).ok).toBe(false)
    expect(item.reply?.by).toBe('客服01')
    expect(item.logs.filter(log => log.action === '回复评价')).toHaveLength(1)
  })
  it('自动好评与无效平台评价不可回复评价', () => {
    for (const item of [record({ automated: true }), record({ platformState: 'WITHDRAWN' }), record({ platformState: 'HIDDEN' }), record({ platformState: 'REVISED' })]) {
      expect(canReplyToReview(item)).toBe(false)
      expect(replyToReview(item, 'Thank you.', '客服01', now).ok).toBe(false)
      expect(item.reply).toBeUndefined()
    }
  })
  it('公开文本校验空白、500字符、HTML、邮箱和电话号码', () => {
    expect(validateReviewText('  ')).toBeTruthy()
    expect(validateReviewText('a'.repeat(500))).toBeUndefined()
    expect(validateReviewText('a'.repeat(501))).toContain('500')
    expect(validateReviewText('<b>Thank you</b>')).toContain('HTML')
    expect(validateReviewText('Contact demo@example.com')).toContain('个人信息')
    expect(validateReviewText('Call +1 202 555 0123')).toContain('个人信息')
  })
  it('内部信息追加日志且不更改评价、回复或OMS状态', () => {
    const item = record(), original = { type: item.commentType, state: item.platformState, order: item.orderId }
    expect(updateReviewHandling(item, { owner: '客服03', reason: '商品质量', handlingStatus: 'resolved' }, '客服01', now).ok).toBe(true)
    expect(addReviewNote(item, '第一条记录', '客服01', now).ok).toBe(true)
    expect(addReviewNote(item, '第二条记录', '客服02', now).ok).toBe(true)
    expect(item.notes.map(note => note.text)).toEqual(['第一条记录', '第二条记录'])
    expect({ type: item.commentType, state: item.platformState, order: item.orderId }).toEqual(original)
    expect(item.reply).toBeUndefined()
  })
  it('非法处理配置拒绝并且不部分写入', () => {
    const item = record(), owner = item.owner
    expect(updateReviewHandling(item, { owner: '不存在的客服', reason: '商品质量' }).ok).toBe(false)
    expect(item.owner).toBe(owner)
    expect(item.reason).toBe('车型适配')
  })
})

describe('给买家留评资格', () => {
  it('资格通过且未超时才可留评，重复发送阻断', () => {
    const item = createBuyerFeedback()[0]!
    expect(leaveBuyerFeedback(item, 'Thank you for your purchase.', '客服01', now).ok).toBe(true)
    expect(item.status).toBe('sent')
    expect(leaveBuyerFeedback(item, 'Changed text', '客服02', now).ok).toBe(false)
    expect(item.comment?.text).toBe('Thank you for your purchase.')
  })
  it('过期、未来日期、缺失日期、平台不允许均不能被本地按钮绕过', () => {
    const base = createBuyerFeedback()[0]!
    for (const item of [
      { ...base, completedAt: '2026-07-01T08:00:00+08:00' },
      { ...base, completedAt: '2026-12-01T08:00:00+08:00' },
      { ...base, completedAt: '' },
      { ...base, eligible: false },
    ]) {
      expect(getBuyerFeedbackBlockedReason(item, now)).toBeTruthy()
      expect(leaveBuyerFeedback(item, 'Thank you.', '客服01', now).ok).toBe(false)
      expect(item.status).toBe('pending')
    }
  })
})

describe('通途参考：给买家留评结果和精确关联', () => {
  it('明确失败保存尝试文案且不写成功，重新校验后重试成功保留历史失败', () => {
    const item = createBuyerFeedback().find(row => row.id === 'BUYER-FB-LINKED-1')!
    expect(getBuyerFeedbackResult(item)).toEqual({ status: 'not_submitted', label: '未提交' })
    expect(leaveBuyerFeedback(item, ' First attempt. ', '客服01', now).ok).toBe(false)
    expect(item.status).toBe('pending'); expect(item.comment).toBeUndefined()
    expect(item.simulateFailureOnce).toBe(false)
    expect(item.attempts).toHaveLength(1)
    expect(item.attempts![0]).toMatchObject({ text: 'First attempt.', by: '客服01', at: now, outcome: 'failed', code: 'DEMO_REQUEST_REJECTED' })
    expect(getBuyerFeedbackResult(item)).toMatchObject({ status: 'failed', label: '留评失败', at: now })
    expect(getBuyerFeedbackResult(item).reason).toContain('DEMO_REQUEST_REJECTED')
    const next = '2026-10-29T12:01:00+08:00'
    expect(leaveBuyerFeedback(item, 'Reviewed and submitted.', '客服02', next).ok).toBe(true)
    expect(item.attempts!.map(row => row.outcome)).toEqual(['failed', 'succeeded'])
    expect(new Set(item.attempts!.map(row => row.id)).size).toBe(2)
    expect(item.comment).toEqual({ text: 'Reviewed and submitted.', at: next, by: '客服02' })
    expect(getBuyerFeedbackResult(item)).toEqual({ status: 'succeeded', label: '留评成功', at: next })
    expect(leaveBuyerFeedback(item, 'Repeat.', '客服02', next).ok).toBe(false)
    expect(item.attempts).toHaveLength(2)
  })
  it('校验失败不冒充平台尝试，不消费首次失败样例开关', () => {
    const item = createBuyerFeedback().find(row => row.id === 'BUYER-FB-LINKED-1')!
    expect(leaveBuyerFeedback(item, ' ', '客服01', now).ok).toBe(false)
    expect(item.attempts).toEqual([]); expect(item.simulateFailureOnce).toBe(true)
    item.eligible = false
    expect(leaveBuyerFeedback(item, 'Thank you.', '客服01', now).ok).toBe(false)
    expect(item.attempts).toEqual([]); expect(item.simulateFailureOnce).toBe(true)
    expect(getBuyerFeedbackResult(item).status).toBe('not_submitted')
  })
  it('既往明确失败不能跳过90天或身份门禁，成功尝试缺投影时也阻止重复', () => {
    const item = createBuyerFeedback().find(row => row.id === 'BUYER-FB-LINKED-2')!
    expect(getBuyerFeedbackResult(item).status).toBe('failed')
    expect(leaveBuyerFeedback(item, 'Thank you.', '客服01', '2027-02-01T00:00:00+08:00').ok).toBe(false)
    expect(item.attempts).toHaveLength(1)
    item.orderLineItemId = ''
    expect(getBuyerFeedbackBlockedReason(item, now)).toContain('身份')
    item.orderLineItemId = 'restored'
    item.attempts!.push({ id: 'known-success', at: now, text: 'Thank you.', by: '客服02', outcome: 'succeeded', message: '本地模拟成功' })
    expect(getBuyerFeedbackBlockedReason(item, now)).toContain('成功留评记录')
    expect(getBuyerFeedbackResult(item).status).toBe('succeeded')
  })
  it('只接受非空且唯一店铺交易行并核对买家，不以同订单号或同买家兜底', () => {
    const review = createReviews()[0]!, buyers = createBuyerFeedback()
    const linked = buyers.find(row => row.id === 'BUYER-FB-LINKED-1')!
    expect(getLinkedBuyerFeedback(review, buyers)).toBe(linked)
    expect(getLinkedBuyerFeedback({ ...review, orderNo: 'different-display-no' }, buyers)).toBe(linked)
    for (const patch of [{ shopId: '' }, { orderLineItemId: ' ' }, { buyerId: '' }, { buyerId: 'another-buyer' }, { orderLineItemId: 'unknown' }, { shopId: 'unknown-shop' }]) {
      expect(getLinkedBuyerFeedback({ ...review, ...patch }, buyers)).toBeUndefined()
    }
    // 相同交易行出现不同买家的冲突记录也必须拒绝，不能忽略异常对象后声称唯一。
    expect(getLinkedBuyerFeedback(review, [...buyers, { ...linked, id: 'duplicate', buyerId: 'another-buyer' }])).toBeUndefined()
    expect(getLinkedBuyerFeedback(review, buyers.filter(row => row.id !== linked.id))).toBeUndefined()
  })
  it('给买家成功不写回复评价，不改变收到评价统计或客服跟进', () => {
    const received = createReviews(), snapshot = JSON.stringify(received), stats = summarizeReviews(received)
    const buyers = createBuyerFeedback(), item = getLinkedBuyerFeedback(received[0]!, buyers)!
    expect(leaveBuyerFeedback(item, buyerFeedbackTemplates[0]!.text, '客服01', now, 'success').ok).toBe(true)
    expect(item.status).toBe('sent')
    expect(JSON.stringify(received)).toBe(snapshot)
    expect(summarizeReviews(received)).toEqual(stats)
  })
  it('导出分别保留留评状态、执行结果和失败原因，重试成功后不再导出旧失败为当前结果', () => {
    const item = createBuyerFeedback().find(row => row.id === 'BUYER-FB-LINKED-2')!
    const failedCsv = exportBuyerFeedbackCsv([item])
    expect(failedCsv).toContain('留评执行结果'); expect(failedCsv).toContain('最近尝试时间（北京时间）')
    expect(failedCsv).toContain('待留评'); expect(failedCsv).toContain('留评失败'); expect(failedCsv).toContain('DEMO_REQUEST_REJECTED')
    expect(leaveBuyerFeedback(item, 'Thank you.', '客服01', now).ok).toBe(true)
    const successCsv = exportBuyerFeedbackCsv([item])
    expect(successCsv).toContain('已留评'); expect(successCsv).toContain('留评成功'); expect(successCsv).not.toContain('DEMO_REQUEST_REJECTED')
    expect(item.attempts![0]!.outcome).toBe('failed')
  })
  it('新增样例仅追加独立留评方向，参考模板均为有效纯文本', () => {
    const buyers = createBuyerFeedback()
    expect(buyers).toHaveLength(17)
    expect(buyers.slice(0, 14).every(row => row.buyerId.startsWith('leave_demo_'))).toBe(true)
    expect(buyers.filter(row => row.simulateFailureOnce)).toHaveLength(1)
    expect(createReviews()).toHaveLength(48)
    expect(new Set(buyerFeedbackTemplates.map(item => item.id)).size).toBe(buyerFeedbackTemplates.length)
    for (const item of buyerFeedbackTemplates) expect(validateReviewText(item.text)).toBeUndefined()
  })
})

describe('方向独立的买家好评与执行来源', () => {
  it('自动给买家好评可以先于收到买家评价，且不属于eBay自动收到评价', () => {
    const buyers = createBuyerFeedback(), reviews = createReviews()
    const automatic = buyers.find(item => item.sendSource === 'automation')!
    expect(automatic).toMatchObject({ id: 'BUYER-FB-DEMO-012', status: 'sent', automationRuleName: '付款后自动好评' })
    expect(automatic.comment?.text).toBeTruthy()
    expect(reviews.some(item => item.shopId === automatic.shopId && item.orderLineItemId === automatic.orderLineItemId && item.buyerId === automatic.buyerId)).toBe(false)
    expect(getBuyerFeedbackMethod(automatic)).toEqual({ source: 'automation', label: '自动好评', ruleName: '付款后自动好评' })
    expect(reviews.some(item => item.automated)).toBe(true)
    const facts = JSON.stringify(reviews), stats = summarizeReviews(reviews)
    automatic.automationRuleName = '另一条规则名称快照'
    expect(JSON.stringify(reviews)).toBe(facts)
    expect(summarizeReviews(reviews)).toEqual(stats)
  })
  it('手动、自动、外部及未知来源分别展示，未提交不冒充已执行方式', () => {
    const records = createBuyerFeedback()
    expect(getBuyerFeedbackMethod(records[0]!)).toEqual({ source: 'unknown', label: '—' })
    expect(getBuyerFeedbackMethod(records[10]!)).toMatchObject({ source: 'manual', label: '手动好评' })
    expect(getBuyerFeedbackMethod(records[11]!)).toMatchObject({ source: 'automation', label: '自动好评' })
    expect(getBuyerFeedbackMethod(records[12]!)).toMatchObject({ source: 'external', label: '外部好评' })
    expect(getBuyerFeedbackMethod(records[13]!)).toMatchObject({ source: 'unknown', label: '来源未知' })
    const legacy = { ...records[10]!, sendSource: undefined }
    expect(getBuyerFeedbackMethod(legacy)).toMatchObject({ source: 'unknown', label: '来源未知' })
  })
  it('人工重试记录本次手动来源，不覆盖既往自动执行尝试的规则快照', () => {
    const item = createBuyerFeedback()[0]!
    item.sendSource = 'automation'; item.automationRuleName = '既往自动规则'
    item.attempts = [{ id: 'auto-failed', at: now, by: '自动规则', text: 'Automatic attempt.', outcome: 'failed', message: '明确失败', sendSource: 'automation', automationRuleName: '既往自动规则' }]
    expect(leaveBuyerFeedback(item, 'Manually resubmitted.', '客服02', now, 'success').ok).toBe(true)
    expect(getBuyerFeedbackMethod(item)).toMatchObject({ source: 'manual', label: '手动好评' })
    expect(item.automationRuleName).toBeUndefined()
    expect(item.attempts[0]).toMatchObject({ sendSource: 'automation', automationRuleName: '既往自动规则', outcome: 'failed' })
    expect(item.attempts[1]).toMatchObject({ sendSource: 'manual', outcome: 'succeeded' })
  })
  it('没有准确关联好评对象显示暂无记录，不能盲发或伪造平台资格结果', () => {
    const review = createReviews()[0]!, records = createBuyerFeedback(), snapshot = JSON.stringify(records)
    const status = getLinkedBuyerFeedbackStatus({ ...review, orderLineItemId: 'no-feedback-record' }, records, now)
    expect(status).toMatchObject({ label: '暂无好评记录', canLeave: false })
    expect(status.record).toBeUndefined()
    expect(status.reason).not.toContain('资格')
    expect(JSON.stringify(records)).toBe(snapshot)
    const linked = getLinkedBuyerFeedback(review, records)!
    const conflict = getLinkedBuyerFeedbackStatus(review, [...records, { ...linked, id: 'duplicate' }], now)
    expect(conflict).toMatchObject({ label: '暂无好评记录', canLeave: false })
    expect(conflict.reason).toContain('不唯一')
  })
  it('准确关联后仍显示真实超期和平台不支持原因', () => {
    const review = createReviews()[0]!, records = createBuyerFeedback(), linked = getLinkedBuyerFeedback(review, records)!
    linked.completedAt = '2026-07-01T08:00:00+08:00'
    expect(getLinkedBuyerFeedbackStatus(review, records, now)).toMatchObject({ record: linked, label: '不可评价', canLeave: false, reason: '交易完成已超过90天，当前不可留评' })
    linked.completedAt = '2026-10-24T08:00:00+08:00'; linked.eligible = false; linked.ineligibleReason = '平台不支持当前交易留评'
    expect(getLinkedBuyerFeedbackStatus(review, records, now)).toMatchObject({ label: '不可评价', canLeave: false, reason: '平台不支持当前交易留评' })
  })
  it('导出好评方式及自动规则名称，并保留公式转义', () => {
    const records = createBuyerFeedback(), csv = exportBuyerFeedbackCsv(records)
    expect(csv).toContain('好评方式'); expect(csv).toContain('自动规则名称')
    for (const label of ['手动好评', '自动好评', '外部好评', '来源未知', '付款后自动好评']) expect(csv).toContain(label)
    const automatic = records.find(item => item.sendSource === 'automation')!
    automatic.automationRuleName = '=HYPERLINK("example")'
    expect(exportBuyerFeedbackCsv([automatic])).toContain('"\'=HYPERLINK(""example"")"')
  })
})

describe('导出与会话刷新', () => {
  beforeEach(resetReviewSession)
  afterEach(() => vi.useRealTimers())
  it('导出保留数据性质，公式单元格与引号/换行安全转义', () => {
    expect(exportReviewsCsv([record({ content: '=1+1' })])).toContain('虚构评审数据')
    expect(exportReviewsCsv([record({ content: '=1+1' })])).toContain('"\'=1+1"')
    expect(toCsv([['=1', '+1', '@SUM(1)', '-1', 'say "hello"', 'line1\nline2']])).toBe('\uFEFF"\'=1","\'+1","\'@SUM(1)","\'-1","say ""hello""","line1\nline2"')
  })
  it('两页共享的同步保留处理与草稿，不伪造评价变更', async () => {
    vi.useFakeTimers()
    const ids = reviewSession.reviews.map(item => item.id)
    reviewSession.reviews[0]!.handlingStatus = 'resolved'
    reviewSession.replyDrafts['REV-DEMO-01'] = 'A draft'
    const task = syncReviews()
    expect(await syncReviews()).toBe(false)
    await vi.advanceTimersByTimeAsync(350)
    expect(await task).toBe(true)
    expect(reviewSession.reviews.map(item => item.id)).toEqual(ids)
    expect(reviewSession.reviews[0]!.handlingStatus).toBe('resolved')
    expect(reviewSession.replyDrafts['REV-DEMO-01']).toBe('A draft')
  })
  it('会话重置使旧同步失效，清除处理和草稿', async () => {
    vi.useFakeTimers()
    const task = syncReviews()
    reviewSession.replyDrafts['REV-DEMO-01'] = 'A draft'
    resetReviewSession()
    await vi.advanceTimersByTimeAsync(350)
    expect(await task).toBe(false)
    expect(reviewSession.replyDrafts).toEqual({})
    expect(reviewSession.syncing).toBe(false)
    expect(reviewSession.lastSyncedAt).toBe('2026-10-29T09:00:00+08:00')
  })
})
