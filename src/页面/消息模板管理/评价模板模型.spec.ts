import { beforeEach, describe, expect, it } from 'vitest'
import { copyFeedbackTemplate, deleteFeedbackTemplate, feedbackTemplateSession, getAvailableFeedbackTemplates, resetFeedbackTemplateSession, saveFeedbackTemplate, setFeedbackTemplateEnabled, useFeedbackTemplate, validateFeedbackTemplate, type FeedbackTemplateInput } from './评价模板模型'
const input = (patch: Partial<FeedbackTemplateInput> = {}): FeedbackTemplateInput => ({ type: 'buyer-positive', name: '测试好评', text: 'Thank you for your purchase!', enabled: true, ...patch })
beforeEach(resetFeedbackTemplateSession)
describe('评价模板维护及引用边界', () => {
  it('同一类型名称去空白不区分大小写，两个用途允许同名，编辑不能跨类型', () => {
    const first = saveFeedbackTemplate(input({ name: ' Demo ' })).template!
    expect(first.name).toBe('Demo')
    expect(saveFeedbackTemplate(input({ name: 'demo' })).error).toContain('同名')
    expect(saveFeedbackTemplate(input({ name: 'demo', type: 'review-reply' })).error).toBeUndefined()
    expect(saveFeedbackTemplate({ ...first, type: 'review-reply' }, first.id).error).toContain('不能更换类型')
  })
  it('沿用500个Unicode字符、纯文本和个人信息校验，禁止变量', () => {
    expect(validateFeedbackTemplate(input({ text: '😀'.repeat(500) }))).toBeUndefined()
    expect(validateFeedbackTemplate(input({ text: '😀'.repeat(501) }))).toContain('500')
    for (const text of [' ', '<b>Thanks</b>', '{{buyerId}}', 'demo@example.invalid', '12345678901']) expect(validateFeedbackTemplate(input({ text }))).toBeTruthy()
  })
  it('复制独立且停用，启用后可选；修改源模板不改变已采用文字', () => {
    const original = feedbackTemplateSession.templates[0]!, adopted = useFeedbackTemplate(original.id, original.type).text
    const copy = copyFeedbackTemplate(original.id).template!
    expect(copy.id).not.toBe(original.id); expect(copy.enabled).toBe(false)
    expect(useFeedbackTemplate(copy.id, copy.type).error).toBeTruthy()
    expect(setFeedbackTemplateEnabled(copy.id, true)).toBeUndefined()
    expect(useFeedbackTemplate(copy.id, copy.type).text).toBe(original.text)
    saveFeedbackTemplate({ ...original, text: 'Updated feedback.' }, original.id)
    expect(adopted).not.toBe(original.text); expect(copy.text).toBe(adopted)
  })
  it('选择按当前ID、类型和启用状态重验，停用删除或过期编辑均不写入', () => {
    const template = feedbackTemplateSession.templates[0]!
    expect(useFeedbackTemplate(template.id, 'review-reply').error).toBeTruthy()
    setFeedbackTemplateEnabled(template.id, false)
    expect(getAvailableFeedbackTemplates(template.type).some(item => item.id === template.id)).toBe(false)
    expect(useFeedbackTemplate(template.id, template.type).error).toBeTruthy()
    deleteFeedbackTemplate(template.id)
    expect(saveFeedbackTemplate(template, template.id).error).toContain('不存在')
    expect(useFeedbackTemplate(template.id, template.type).error).toBeTruthy()
  })
})
