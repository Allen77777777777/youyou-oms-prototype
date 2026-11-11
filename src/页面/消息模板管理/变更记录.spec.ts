import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { currentActor } from '../工单管理/会话'
import { copyTemplate, deleteTemplate, resetTemplateSession, saveTemplate, setTemplateEnabled } from './模型'
import { deleteFeedbackTemplate, resetFeedbackTemplateSession, saveFeedbackTemplate } from './评价模板模型'
import { changesForTemplate, templateChanges } from './变更记录'
import ChangeHistory from './模板变更记录.vue'

const originalActor = currentActor.value
beforeEach(() => { resetTemplateSession(); resetFeedbackTemplateSession(); currentActor.value = '客服小林' })
afterEach(() => { currentActor.value = originalActor; resetTemplateSession(); resetFeedbackTemplateSession() })

describe('模板变更可追溯且不重复复制内容', () => {
  it('保存具体人员、变化摘要，未改变不追加，删除后仍能从历史入口查回', () => {
    const row = saveTemplate({ kind: 'message', title: '物流跟进模板', body: 'Hello {{buyerId}}', enabled: true }).template!
    expect(changesForTemplate(row.kind, row.id)).toHaveLength(1)
    expect(changesForTemplate(row.kind, row.id)[0]).toMatchObject({ operator: '客服小林', action: '新增模板', result: '成功' })
    saveTemplate({ ...row }, row.id); setTemplateEnabled(row.id, true)
    expect(changesForTemplate(row.kind, row.id)).toHaveLength(1)
    currentActor.value = '跟单员小周'
    saveTemplate({ ...row, body: 'A private replacement {{orderNo}}', bodyHtml: undefined, title: '新名称' }, row.id)
    const edited = changesForTemplate(row.kind, row.id).slice(-1)[0]!
    expect(edited.operator).toBe('跟单员小周'); expect(edited.content).toContain('物流跟进模板 → 新名称')
    expect(edited.content).toContain('使用变量'); expect(edited.content).not.toContain('A private replacement')
    deleteTemplate(row.id)
    expect(changesForTemplate(row.kind, row.id).slice(-1)[0]).toMatchObject({ action: '删除模板', deleted: true })
    const wrapper = mount(ChangeHistory, { props: { kinds: ['message'] }, global: { stubs: { ElDrawer: { template: '<div><slot/></div>' } }, directives: { prototype: {} } } })
    expect(wrapper.text()).toContain('删除模板'); expect(wrapper.text()).toContain('新名称'); expect(wrapper.text()).toContain('跟单员小周')
    wrapper.unmount()
  })
  it('复制留在新身份，评价模板与站内信历史互相隔离，校验失败不追加', () => {
    const source = saveTemplate({ kind: 'phrase', title: '感谢语', body: 'Thanks', enabled: true }).template!
    const copied = copyTemplate(source.id).template!
    expect(changesForTemplate(copied.kind, copied.id)).toHaveLength(1)
    expect(changesForTemplate(copied.kind, copied.id)[0]).toMatchObject({ action: '复制模板' })
    expect(changesForTemplate(source.kind, source.id)).toHaveLength(1)
    const feedback = saveFeedbackTemplate({ type: 'review-reply', name: '感谢评价', text: 'Thank you for your feedback.', enabled: true }).template!
    const count = templateChanges.length
    expect(saveFeedbackTemplate({ ...feedback, text: '<b>Invalid</b>' }, feedback.id).error).toBeTruthy()
    expect(templateChanges).toHaveLength(count)
    saveFeedbackTemplate({ ...feedback }, feedback.id)
    expect(templateChanges).toHaveLength(count)
    deleteFeedbackTemplate(feedback.id)
    resetTemplateSession()
    expect(changesForTemplate(feedback.type, feedback.id).slice(-1)[0]?.deleted).toBe(true)
    expect(changesForTemplate(source.kind, source.id)).toHaveLength(0)
  })
})
