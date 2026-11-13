import { beforeEach, describe, expect, it } from 'vitest'
import { currentHandlerId } from '@/组件/客服处理人/处理人'
import { mailAccessProfiles, canAdminMailTags, canOperateMail, canViewMail, getMailReviewers, resetMailAccessProfiles } from './权限与协作'
import { clearSubmittedDraft, draftKey, draftVersion, getMailDraft, getPersonalMailStar, mailSession, resetMailSession, restoreMailPrivateState, saveMailDraft, setPersonalMailStar } from './会话'

beforeEach(() => {
  currentHandlerId.value = 'staff-01'
  resetMailAccessProfiles()
  resetMailSession()
})

describe('站内信多人授权与个人资料', () => {
  it('同店可查看，办理要求处理人或代办，批量发信和核查分别授权，撤权立即生效', () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    c.assignment = { systemSkus: [], skuHandlerIds: [], manualIds: ['staff-01'] }
    expect(canViewMail(c, 'staff-02')).toBe(true)
    expect(canOperateMail(c, 'send', 'staff-02')).toBe(false)
    c.assignment.manualIds = ['staff-01', 'staff-02']
    expect(canOperateMail(c, 'send', 'staff-02')).toBe(true)
    expect(canOperateMail(c, 'batchSend', 'staff-02')).toBe(false)
    expect(canOperateMail(c, 'recall', 'staff-02')).toBe(true)
    expect(canOperateMail(c, 'verify', 'staff-02')).toBe(false)
    expect(canOperateMail(c, 'verify', 'staff-03')).toBe(true)
    expect(canOperateMail(c, 'send', 'staff-03')).toBe(false)
    expect(getMailReviewers('shop-us').map(item => item.value)).toEqual(['staff-01', 'staff-03'])
    mailAccessProfiles['staff-02']!.shopIds = []
    expect(canViewMail(c, 'staff-02')).toBe(false)
    expect(canOperateMail(c, 'send', 'staff-02')).toBe(false)
  })

  it('未分配可按认领权认领，既有归属需要指派权，授权范围独立于角色显示名', () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    c.assignment = { systemSkus: [], skuHandlerIds: [], manualIds: [] }
    expect(canOperateMail(c, 'claim', 'staff-02')).toBe(true)
    expect(canOperateMail(c, 'assign', 'staff-02')).toBe(false)
    c.assignment.manualIds = ['staff-01']
    expect(canOperateMail(c, 'claim', 'staff-02')).toBe(false)
    c.shopId = 'shop-uk'
    expect(canViewMail(c, 'staff-03')).toBe(false)
    expect(canOperateMail(c, 'verify', 'staff-03')).toBe(false)
    expect(mailAccessProfiles['staff-03']!.actions).toContain('tagsAdmin')
    expect(canAdminMailTags('staff-03')).toBe(false)
    expect(canAdminMailTags('staff-01')).toBe(true)
  })

  it('两人相同正文也分别保存，旧成功仅清提交人对应版本，撤权后草稿不可读', () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    c.assignment = { systemSkus: [], skuHandlerIds: [], manualIds: ['staff-01', 'staff-02'] }
    const first = getMailDraft(c, 'reply')!
    first.body = 'Same text'
    const firstKey = draftKey(c.id, 'reply'), submitted = draftVersion(firstKey)
    currentHandlerId.value = 'staff-02'
    const second = getMailDraft(c, 'reply')!
    second.body = 'Same text'
    const secondKey = draftKey(c.id, 'reply')
    expect(secondKey).not.toBe(firstKey)
    expect(clearSubmittedDraft(firstKey, submitted)).toBe(true)
    expect(mailSession.drafts[firstKey]?.body).toBe('')
    expect(mailSession.drafts[secondKey]?.body).toBe('Same text')
    const old = draftVersion(secondKey)
    second.body = 'Updated after submitting'
    expect(clearSubmittedDraft(secondKey, old)).toBe(false)
    expect(second.body).toBe('Updated after submitting')
    mailAccessProfiles['staff-02']!.shopIds = []
    expect(getMailDraft(c, 'reply')).toBeUndefined()
  })

  it('个人草稿支持本浏览器恢复，旧版本保存保留新版，个人星标与团队阅读分别维护', () => {
    const c = mailSession.conversations.find(item => item.id === 'conv-01')!
    const key = draftKey(c.id, 'note')
    expect(saveMailDraft(c, 'note', { body: 'First', attachments: [] }, 0)).toMatchObject({ ok: true })
    const version = draftVersion(key)
    getMailDraft(c, 'note')!.body = 'Newer'
    expect(saveMailDraft(c, 'note', { body: 'Stale', attachments: [] }, version)).toMatchObject({ ok: false })
    expect(getMailDraft(c, 'note')!.body).toBe('Newer')
    const stored = localStorage.getItem('youyou-oms:mail-private-state:v1')!
    mailSession.drafts = {}
    localStorage.setItem('youyou-oms:mail-private-state:v1', stored)
    restoreMailPrivateState()
    expect(getMailDraft(c, 'note')!.body).toBe('Newer')
    expect(getPersonalMailStar(c, 'staff-01')).toBe(true)
    expect(getPersonalMailStar(c, 'staff-02')).toBe(false)
    const unread = c.unread
    expect(setPersonalMailStar(c, true, 'staff-02')).toBe(true)
    expect(setPersonalMailStar(c, false, 'staff-01')).toBe(true)
    expect(getPersonalMailStar(c, 'staff-02')).toBe(true)
    expect(c.unread).toBe(unread)
  })
})
