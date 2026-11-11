import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReviews } from './数据'
import { resetReviewSession, reviewSession } from './会话'
import { groupReviewReasons, updateReviewHandling } from './模型'
import { canUseReviewReason, getReviewReasonOptions, getReviewReasonRenameBlockedReason, getReviewReasonUsage, saveReviewReason, setReviewReasonEnabled } from './原因分类模型'

beforeEach(resetReviewSession)
afterEach(resetReviewSession)
const added = (name = '包装不当') => {
  expect(saveReviewReason(name).ok).toBe(true)
  return reviewSession.reasonCategories.find(item => item.name === name)!
}

describe('原因分类资料管理', () => {
  it('初始内置分类保持既有名称，新增自定义分类可立即用于处理和统计', () => {
    expect(reviewSession.reasonCategories).toHaveLength(8)
    expect(reviewSession.reasonCategories.every(item => item.builtin && item.enabled)).toBe(true)
    const category = added(), review = reviewSession.reviews[0]!
    expect(category).toMatchObject({ builtin: false, enabled: true, used: false })
    expect(getReviewReasonOptions()).toContainEqual({ value: '包装不当', label: '包装不当' })
    expect(updateReviewHandling(review, { reason: category.name }).ok).toBe(true)
    expect(getReviewReasonUsage(category.id)).toBe(1)
    expect(groupReviewReasons(reviewSession.reviews)).toContainEqual({ reason: category.name, count: 1 })
    expect(category.used).toBe(true)
  })
  it('空白、超长、重复及停用分类重名均被阻断且不部分写入', () => {
    const category = added('Delivery Issue'), count = reviewSession.reasonCategories.length
    expect(setReviewReasonEnabled(category.id, false).ok).toBe(true)
    for (const name of ['', '   ', 'a'.repeat(31), '车型适配', ' Delivery   Issue ', 'delivery issue', 'Ｄｅｌｉｖｅｒｙ Ｉｓｓｕｅ', '未分类']) {
      expect(saveReviewReason(name).ok).toBe(false)
      expect(reviewSession.reasonCategories).toHaveLength(count)
    }
    expect(category.name).toBe('Delivery Issue')
    expect(category.enabled).toBe(false)
  })
  it('仅未使用自定义分类可改名，空名和重名不改写原资料', () => {
    const category = added()
    expect(saveReviewReason(' 商品包装 ', category.id).ok).toBe(true)
    expect(category.name).toBe('商品包装')
    expect(saveReviewReason(' ', category.id).ok).toBe(false)
    expect(saveReviewReason('商品质量', category.id).ok).toBe(false)
    expect(category.name).toBe('商品包装')
    const builtin = reviewSession.reasonCategories[0]!, oldName = builtin.name
    expect(saveReviewReason('不允许改名', builtin.id).ok).toBe(false)
    expect(builtin.name).toBe(oldName)
    expect(getReviewReasonRenameBlockedReason(builtin.id)).toContain('内置')
  })
  it('使用后即使评价已换分类仍保留名称，历史日志不会失效', () => {
    const category = added(), review = reviewSession.reviews[0]!
    expect(updateReviewHandling(review, { reason: category.name }).ok).toBe(true)
    expect(updateReviewHandling(review, { reason: '' }).ok).toBe(true)
    const logs = JSON.stringify(review.logs)
    expect(getReviewReasonUsage(category.id)).toBe(0)
    expect(getReviewReasonRenameBlockedReason(category.id)).toContain('已被使用')
    expect(saveReviewReason('新名称', category.id).ok).toBe(false)
    expect(setReviewReasonEnabled(category.id, false).ok).toBe(true)
    expect(category.name).toBe('包装不当')
    expect(JSON.stringify(review.logs)).toBe(logs)
    expect(logs).toContain('包装不当')
  })
  it('直接存在名称引用时也不允许改名，不依赖used标记完整', () => {
    const category = added()
    reviewSession.reviews[0]!.reason = category.name
    expect(category.used).toBe(false)
    expect(saveReviewReason('新名称', category.id).ok).toBe(false)
  })
  it('停用移出新选项，当前停用值仍可读并与其他处理字段一起保存', () => {
    const category = added(), review = reviewSession.reviews[0]!
    expect(updateReviewHandling(review, { reason: category.name }).ok).toBe(true)
    expect(setReviewReasonEnabled(category.id, false).ok).toBe(true)
    const stats = groupReviewReasons(reviewSession.reviews)
    expect(getReviewReasonOptions().some(item => item.value === category.name)).toBe(false)
    expect(getReviewReasonOptions(category.name)).toContainEqual({ value: category.name, label: '包装不当（已停用）', disabled: true })
    expect(updateReviewHandling(review, { reason: category.name, handlerIds: ['staff-03'], handlingStatus: 'resolved' }).ok).toBe(true)
    expect(review).toMatchObject({ reason: category.name, handlerIds: ['staff-03'], handlingStatus: 'resolved' })
    expect(groupReviewReasons(reviewSession.reviews)).toEqual(stats)
    const other = createReviews()[1]!, snapshot = JSON.stringify(other)
    expect(updateReviewHandling(other, { reason: category.name, handlerIds: ['staff-02'] }).ok).toBe(false)
    expect(JSON.stringify(other)).toBe(snapshot)
  })
  it('停用内置分类同样保留历史数据，重新启用后可继续选择', () => {
    const category = reviewSession.reasonCategories.find(item => item.name === '车型适配')!, snapshot = JSON.stringify(reviewSession.reviews)
    expect(setReviewReasonEnabled(category.id, false).ok).toBe(true)
    expect(canUseReviewReason(category.name)).toBe(false)
    expect(canUseReviewReason(category.name, category.name)).toBe(true)
    expect(setReviewReasonEnabled(category.id, true).ok).toBe(true)
    expect(canUseReviewReason(category.name)).toBe(true)
    expect(JSON.stringify(reviewSession.reviews)).toBe(snapshot)
  })
  it('不在分类资料中的旧名称仍可读和保留，但不能新分配给另一条评价', () => {
    const review = reviewSession.reviews[0]!
    review.reason = '旧系统历史原因'
    expect(getReviewReasonOptions(review.reason)).toContainEqual({ value: review.reason, label: '旧系统历史原因（历史值）', disabled: true })
    expect(updateReviewHandling(review, { reason: review.reason, handlerIds: ['staff-02'] }).ok).toBe(true)
    expect(canUseReviewReason(review.reason)).toBe(false)
    expect(groupReviewReasons([review])).toEqual([{ reason: '旧系统历史原因', count: 1 }])
  })
  it('未知或重复分类ID不能误更新其他资料，会话重置同时重置分类', () => {
    const category = added(), snapshot = JSON.stringify(reviewSession.reasonCategories)
    expect(saveReviewReason('改名', 'missing')).toMatchObject({ ok: false })
    expect(setReviewReasonEnabled('missing', false)).toMatchObject({ ok: false })
    expect(JSON.stringify(reviewSession.reasonCategories)).toBe(snapshot)
    reviewSession.reasonCategories.push({ ...category, name: '重复身份' })
    expect(setReviewReasonEnabled(category.id, false).ok).toBe(false)
    expect(saveReviewReason('改名', category.id).ok).toBe(false)
    resetReviewSession()
    expect(reviewSession.reasonCategories).toHaveLength(8)
    expect(getReviewReasonOptions().some(item => item.value === '包装不当')).toBe(false)
  })
})
