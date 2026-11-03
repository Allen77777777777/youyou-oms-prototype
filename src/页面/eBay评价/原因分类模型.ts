import { reviewSession } from './会话'
import type { ReviewActionResult, ReviewReasonCategory } from './类型'

export interface ReviewReasonOption { value: string; label: string; disabled?: boolean }
const failure = (error: string): ReviewActionResult => ({ ok: false, message: error, error })
const success = (message: string): ReviewActionResult => ({ ok: true, message })
const normalizeName = (name: string) => name.trim().replace(/\s+/gu, ' ')
const nameKey = (name: string) => normalizeName(name).normalize('NFKC').toLocaleLowerCase()
let sequence = 0

function findCategory(id: string): ReviewReasonCategory | undefined {
  const matches = reviewSession.reasonCategories.filter(item => item.id === id)
  return matches.length === 1 ? matches[0] : undefined
}

/** 原因名称为评价上的历史快照；只有未使用的自定义分类可以改名。 */
export function getReviewReasonUsage(id: string): number {
  const category = findCategory(id)
  return category ? reviewSession.reviews.filter(item => item.reason === category.name).length : 0
}
export function getReviewReasonRenameBlockedReason(id: string): string | undefined {
  const category = findCategory(id)
  if (!category) return '原因分类不存在或标识重复'
  if (category.builtin) return '内置分类名称不能修改'
  if (category.used || getReviewReasonUsage(id) > 0) return '该分类已被使用，名称保留供历史查询，可停用后新增分类'
  return undefined
}
export function saveReviewReason(name: string, id?: string): ReviewActionResult {
  const normalized = normalizeName(name)
  if (!normalized) return failure('请输入原因分类名称')
  if (Array.from(normalized).length > 30) return failure('原因分类名称最多30个字符')
  if (nameKey(normalized) === nameKey('未分类')) return failure('“未分类”用于尚未选择原因的评价，请使用其他名称')
  const category = id === undefined ? undefined : findCategory(id)
  if (id !== undefined && !category) return failure('原因分类不存在或标识重复')
  if (reviewSession.reasonCategories.some(item => item.id !== id && nameKey(item.name) === nameKey(normalized))) return failure('原因分类名称已存在，停用分类也不能重名')
  if (category) {
    if (category.name === normalized) return success('原因分类没有变化')
    const blocked = getReviewReasonRenameBlockedReason(category.id)
    if (blocked) return failure(blocked)
    category.name = normalized
    return success('原因分类已更新')
  }
  let nextId: string
  do { nextId = `review-reason-custom-${++sequence}` } while (reviewSession.reasonCategories.some(item => item.id === nextId))
  reviewSession.reasonCategories.push({ id: nextId, name: normalized, builtin: false, enabled: true, used: false })
  return success('原因分类已新增')
}
export function setReviewReasonEnabled(id: string, enabled: boolean): ReviewActionResult {
  const category = findCategory(id)
  if (!category) return failure('原因分类不存在或标识重复')
  if (typeof enabled !== 'boolean') return failure('请选择有效的启用状态')
  category.enabled = enabled
  return success(enabled ? '原因分类已启用' : '原因分类已停用')
}

/** 选择新分类只能使用启用项；原值即使已停用或不在资料中，仍可保留并保存其他处理字段。 */
export function canUseReviewReason(value: string, currentValue = ''): boolean {
  if (!value || value === currentValue) return true
  return reviewSession.reasonCategories.some(item => item.name === value && item.enabled)
}
export function markReviewReasonUsed(name: string): void {
  for (const category of reviewSession.reasonCategories) if (category.name === name) category.used = true
}
export function getReviewReasonOptions(currentValue = ''): ReviewReasonOption[] {
  const options: ReviewReasonOption[] = reviewSession.reasonCategories.filter(item => item.enabled).map(item => ({ value: item.name, label: item.name }))
  if (currentValue && !options.some(item => item.value === currentValue)) {
    const category = reviewSession.reasonCategories.find(item => item.name === currentValue)
    options.push({ value: currentValue, label: `${currentValue}（${category ? '已停用' : '历史值'}）`, disabled: true })
  }
  return options
}
