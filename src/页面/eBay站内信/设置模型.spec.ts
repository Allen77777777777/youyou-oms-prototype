import { beforeEach, describe, expect, it } from 'vitest'
import { createConversations } from './数据'
import { mailSession, resetMailSession } from './会话'
import { defaultMailPriority, mailTags, tagOptions } from './邮箱模型'
import { countMailTagReferences, deleteMailTag, mailTagDefinitions, MAX_MAIL_TAGS, resetMailTagDefinitions, saveMailTag, tagStyle, validateMailTag } from './设置模型'

beforeEach(() => { resetMailSession(); resetMailTagDefinitions() })

describe('站内信标签设置', () => {
  it('所有初始会话默认普通，字典和筛选共用同一响应式数组', () => {
    expect(createConversations().every(conversation => conversation.priority === 'normal')).toBe(true)
    expect(defaultMailPriority).toBe('normal')
    expect(mailTagDefinitions).toHaveLength(6)
    expect(mailTags).toBe(mailTagDefinitions)
    expect(tagOptions).toBe(mailTagDefinitions)
    expect(tagOptions.map(tag => tag.value)).toEqual(mailTagDefinitions.map(tag => tag.id))
  })
  it('新增去除名称两端空格，重命名改色不更换ID或改会话状态', () => {
    const first = mailSession.conversations[0]!
    const before = { status: first.status, assignee: first.assignee, messages: first.messages.length, tags: [...first.tags!] }
    const saved = saveMailTag({ label: '  售后跟进  ', color: '#aabbcc' })
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const id = saved.tag.id
    first.tags!.push(id)
    const renamed = saveMailTag({ label: '客户跟进', color: '#B25FDB' }, id)
    expect(renamed.ok).toBe(true)
    expect(mailTags.find(tag => tag.id === id)).toMatchObject({ id, value: id, label: '客户跟进', color: '#B25FDB' })
    expect(first.tags).toEqual([...before.tags, id])
    expect({ status: first.status, assignee: first.assignee, messages: first.messages.length }).toEqual({ status: before.status, assignee: before.assignee, messages: before.messages })
  })
  it('空白、重名、超长、控制字符和非法颜色不写入', () => {
    const before = JSON.stringify(mailTagDefinitions)
    for (const draft of [{ label: '  ', color: '#409EFF' }, { label: ' 物流查询 ', color: '#409EFF' }, { label: 'a'.repeat(31), color: '#409EFF' }, { label: '多\n行', color: '#409EFF' }, { label: '合法名称', color: 'red' }]) expect(saveMailTag(draft).ok).toBe(false)
    expect(JSON.stringify(mailTagDefinitions)).toBe(before)
    expect(saveMailTag({ label: 'Missing', color: '#409EFF' }, 'not-present').ok).toBe(false)
    expect(saveMailTag({ label: 'Follow Up', color: '#409EFF' }).ok).toBe(true)
    expect(validateMailTag({ label: ' follow up ', color: '#409EFF' })).toBe('标签名称已存在')
  })
  it('达到上限禁止新增但仍可编辑已有标签', () => {
    for (let i = mailTagDefinitions.length; i < MAX_MAIL_TAGS; i += 1) expect(saveMailTag({ label: `标签 ${i}`, color: '#409EFF' }).ok).toBe(true)
    expect(saveMailTag({ label: '第101个', color: '#409EFF' }).ok).toBe(false)
    expect(saveMailTag({ label: '物流核对', color: '#67C23A' }, 'logistics').ok).toBe(true)
    expect(mailTagDefinitions).toHaveLength(100)
  })
  it('删除按会话计数，清除所有引用但保留其他标签及消息，不把重复标签计多次', () => {
    const first = mailSession.conversations[0]!, second = mailSession.conversations[1]!
    first.tags = ['logistics', 'logistics', 'review']; second.tags = ['logistics', 'fitment']
    const count = countMailTagReferences('logistics')
    const beforeMessages = mailSession.conversations.map(conversation => conversation.messages.length)
    expect(deleteMailTag('logistics', count)).toEqual({ ok: true, affected: count })
    expect(first.tags).toEqual(['review']); expect(second.tags).toEqual(['fitment'])
    expect(mailSession.conversations.every(conversation => !conversation.tags?.includes('logistics'))).toBe(true)
    expect(mailTagDefinitions.some(tag => tag.id === 'logistics')).toBe(false)
    expect(mailSession.conversations.map(conversation => conversation.messages.length)).toEqual(beforeMessages)
    expect(deleteMailTag('logistics', 0).ok).toBe(false)
  })
  it('删除确认数量已变化时不部分清理字典或引用', () => {
    const count = countMailTagReferences('review')
    mailSession.conversations[1]!.tags!.push('review')
    const before = JSON.stringify(mailSession.conversations)
    expect(deleteMailTag('review', count)).toEqual({ ok: false, error: '关联会话数量已变化，请重新确认删除' })
    expect(mailTagDefinitions.some(tag => tag.id === 'review')).toBe(true)
    expect(JSON.stringify(mailSession.conversations)).toBe(before)
  })
  it('名称和颜色改变后样式即时更新，未知ID和极浅颜色仍返回可读安全色值', () => {
    const before = tagStyle('logistics')
    saveMailTag({ label: '物流查询', color: '#FFFFFF' }, 'logistics')
    const after = tagStyle('logistics')
    expect(after).not.toEqual(before)
    expect(after.backgroundColor).toBe('#FFFFFF')
    expect(after.color).not.toBe('#FFFFFF')
    expect(Object.values(tagStyle('missing')).every(value => /^#[\dA-F]{6}$/.test(value))).toBe(true)
  })
})
