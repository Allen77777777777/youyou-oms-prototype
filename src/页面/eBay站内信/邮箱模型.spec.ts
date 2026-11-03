import { describe, expect, it } from 'vitest'
import { createConversations } from './数据'
import { draftKey } from './会话'
import { folderPendingCount, getMessageBodyText, isEntryPending, isEntryUnread, isPendingConversation, mailboxEntries, mailboxFolders, matchesEntryTextSearch, matchesFolder, setConversationUnread, setEntriesUnread, setEntryUnread, validateAttachmentUrl } from './邮箱模型'
import type { Conversation, MailFilters, ReplyDraft } from './类型'

const conversation = (id = 'conv-01'): Conversation => createConversations().find(item => item.id === id)!

describe('邮箱文件夹的消息条目与会话视图', () => {
  it('同会话通知按消息保留完整原文，段落章节和页脚均可检索且不会串信', () => {
    const item = conversation('notice-01'), first = item.messages[0]!
    first.notice = { heading: '第一封通知', paragraphs: ['第一封完整段落'], sections: [{ title: '第一封章节', content: '第一封正文深处唯一词' }], footer: '第一封页脚' }
    item.messages.push({ id: 'notice-second-body', kind: 'incoming', sender: 'eBay', at: item.updatedAt, body: '短摘要', notice: { heading: '第二封通知', paragraphs: ['第二封完整段落'], sections: [{ title: '第二封章节', content: '第二封正文深处唯一词' }], footer: '第二封页脚' } })
    const entries = mailboxEntries([item], 'ebay')
    const filters: MailFilters = { shopIds: [], assignees: [], field: 'body', mode: 'contains', query: '', onlyUnread: false, onlyFlagged: false }
    for (const query of ['第二封完整段落', '第二封章节', '第二封正文深处唯一词', '第二封页脚']) {
      expect(entries.filter(entry => matchesEntryTextSearch(entry, { ...filters, query })).map(entry => entry.message?.id)).toEqual(['notice-second-body'])
    }
    expect(getMessageBodyText(first)).toBe('第一封通知\n\n第一封完整段落\n\n第一封章节\n第一封正文深处唯一词\n\n第一封页脚')
    expect(getMessageBodyText(first)).not.toContain('第二封')
  })
  it('收件箱只包含买家每条来信，已忽略不抹除买家收件事实', () => {
    const item = conversation()
    expect(matchesFolder(item, 'inbox')).toBe(true)
    item.status = 'ignored'
    item.messages.push({ id: 'unknown', kind: 'outgoing', sender: '客服01', body: 'Demo reply', at: item.updatedAt, delivery: 'unknown' })
    expect(matchesFolder(item, 'inbox')).toBe(true)
    expect(matchesFolder(item, 'pending')).toBe(false)
    expect(matchesFolder(item, 'ignored')).toBe(true)
    const notice = conversation('notice-01')
    expect(isPendingConversation(notice)).toBe(true)
    expect(matchesFolder(notice, 'pending')).toBe(false)
    const entries = mailboxEntries([item, notice], 'inbox')
    expect(entries.map(entry => entry.message?.id)).toEqual(['msg-01-1', 'msg-01-3'])
    expect(entries[0]?.message).toBe(item.messages[0])
    expect(entries.every(entry => entry.message?.kind === 'incoming' && entry.conversation.source === 'buyer')).toBe(true)
    expect(matchesFolder(notice, 'inbox')).toBe(false)
  })
  it('发件箱逐条显示全部外发结果，自动发送仅取明确自动来源且排除备注和平台通知', () => {
    const item = conversation('conv-07')
    item.messages.push({ id: 'old-success', kind: 'outgoing', sender: '客服01', body: 'Previous reply', at: item.updatedAt, delivery: 'success' })
    item.flagged = true; item.status = 'ignored'
    expect(['outbox', 'automated', 'failed', 'starred', 'ignored'].every(folder => matchesFolder(item, folder))).toBe(true)
    const empty = conversation('conv-04')
    empty.messages.push({ id: 'note-success', kind: 'note', sender: '客服01', body: 'Internal', at: empty.updatedAt, delivery: 'success', sendSource: 'automation' })
    empty.messages.push({ id: 'sending', kind: 'outgoing', sender: '客服01', body: 'Sending', at: empty.updatedAt, delivery: 'sending' })
    empty.messages.push({ id: 'no-result', kind: 'outgoing', sender: '客服01', body: 'No result', at: empty.updatedAt })
    const notice = conversation('notice-01')
    notice.messages.push({ id: 'invalid-outgoing', kind: 'outgoing', sender: '客服01', body: 'Not replyable', at: notice.updatedAt, delivery: 'failed', sendSource: 'automation' })
    expect(mailboxEntries([item, empty, notice], 'outbox').map(entry => entry.message?.id)).toEqual(['msg-07-2', 'old-success', 'sending', 'no-result'])
    expect(mailboxEntries([item, empty, notice], 'automated').map(entry => entry.message?.id)).toEqual(['msg-07-2'])
    expect(matchesFolder(empty, 'failed')).toBe(false)
    expect(matchesFolder(empty, 'automated')).toBe(false)
    expect(matchesFolder(empty, 'sent')).toBe(false)
    expect(matchesFolder(empty, 'not-a-folder')).toBe(false)
  })
  it('发送失败包含明确失败及待核查，成功后原失败更新即退出', () => {
    const failed = conversation('conv-07'), unknown = conversation('conv-08')
    expect(matchesFolder(failed, 'failed')).toBe(true)
    expect(matchesFolder(unknown, 'failed')).toBe(true)
    failed.messages.find(item => item.delivery === 'failed')!.delivery = 'success'
    expect(matchesFolder(failed, 'failed')).toBe(false)
    expect(matchesFolder(failed, 'outbox')).toBe(true)
    expect(matchesFolder(failed, 'automated')).toBe(true)
    expect(mailboxEntries([failed, unknown], 'failed').map(entry => entry.message?.id)).toEqual(['msg-08-2'])
  })
  it('草稿箱按当前会话与编辑模式隔离，正文或附件有效，不把空白或译文当草稿', () => {
    const item = conversation(), another = conversation('conv-02')
    const drafts: Record<string, ReplyDraft> = {
      [draftKey(item.id, 'reply')]: { body: ' \n ', attachments: [], translation: 'stale translation' },
      [draftKey(another.id, 'reply')]: { body: 'Other buyer', attachments: [] },
    }
    expect(matchesFolder(item, 'drafts', drafts)).toBe(false)
    drafts[draftKey(item.id, 'reply')]!.subject = '尚未填写正文的标题草稿'
    expect(matchesFolder(item, 'drafts', drafts)).toBe(false)
    drafts[draftKey(item.id, 'reply')]!.subject = ''
    expect(matchesFolder(another, 'drafts', drafts)).toBe(true)
    drafts[draftKey(item.id, 'note')] = { body: '内部备注草稿', attachments: [] }
    expect(matchesFolder(item, 'drafts', drafts)).toBe(true)
    drafts[draftKey(item.id, 'note')]!.body = ''
    drafts[draftKey(item.id, 'reply')]!.attachments.push({ id: 'photo', name: 'photo.png', size: 100, type: 'image/png' })
    expect(matchesFolder(item, 'drafts', drafts)).toBe(true)
    expect(folderPendingCount([item], 'drafts', drafts)).toBe(1)
    item.status = 'processed'
    expect(matchesFolder(item, 'drafts', drafts)).toBe(true)
    expect(folderPendingCount([item], 'drafts', drafts)).toBe(0)
    item.status = 'ignored'
    expect(matchesFolder(item, 'drafts', drafts)).toBe(true)
    expect(folderPendingCount([item], 'drafts', drafts)).toBe(0)
  })
  it('买家待处理按会话状态覆盖目录内各条记录，已处理失败与已忽略记录仍保留', () => {
    const pending = conversation(), processedFailure = conversation('conv-07'), ignored = conversation('conv-08'), notice = conversation('notice-01')
    processedFailure.status = 'processed'; ignored.status = 'ignored'
    processedFailure.messages.push({ ...processedFailure.messages[1]!, id: 'another-failure' })
    const items = [pending, processedFailure, ignored, notice]
    expect(folderPendingCount(items, 'inbox')).toBe(2)
    expect(folderPendingCount(items, 'failed')).toBe(0)
    expect(mailboxEntries(items, 'failed').map(entry => entry.message?.id)).toEqual(['msg-07-2', 'another-failure', 'msg-08-2'])
    expect(folderPendingCount(items, 'ignored')).toBe(0)
    expect(folderPendingCount(items, 'outbox')).toBe(1)
    expect(mailboxEntries(items, 'outbox').filter(isEntryPending).map(entry => entry.message?.delivery)).toEqual(['success'])
    expect(folderPendingCount(items, 'ebay')).toBe(1)
    setEntryUnread(mailboxEntries([notice], 'ebay')[0]!, false)
    expect(folderPendingCount(items, 'inbox')).toBe(2)
    expect(folderPendingCount(items, 'ebay')).toBe(0)
    expect(mailboxFolders.map(item => item.id)).toEqual(['inbox', 'starred', 'drafts', 'outbox', 'automated', 'failed', 'ebay', 'ignored'])
  })
  it('消息身份包含会话ID，跨目录一致；星标和草稿按会话只生成一个条目', () => {
    const first = conversation(), second = conversation('conv-02')
    second.messages[0]!.id = first.messages[0]!.id
    const entries = mailboxEntries([first, second], 'inbox')
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length)
    const outbox = mailboxEntries([second], 'outbox')
    expect(mailboxEntries([second], 'automated')[0]?.id).toBe(outbox[0]?.id)
    expect(mailboxEntries([first], 'starred')).toHaveLength(1)
    expect(mailboxEntries([first], 'starred')[0]?.message).toBeUndefined()
    const drafts = { [draftKey(first.id, 'reply')]: { body: 'Reply', attachments: [] }, [draftKey(first.id, 'note')]: { body: 'Note', attachments: [] } }
    expect(mailboxEntries([first], 'drafts', drafts)).toHaveLength(1)
  })
  it('eBay专属目录只取平台来信，与买家收件箱隔离并保留不可回复样例', () => {
    const buyer = conversation(), notice = conversation('notice-01')
    const entry = mailboxEntries([buyer, notice], 'ebay')[0]!
    expect(entry.conversation).toBe(notice)
    expect(entry.conversation.canReply).toBe(false)
    expect(mailboxEntries([buyer, notice], 'inbox').some(item => item.id === entry.id)).toBe(false)
  })
  it('星标与已忽略都覆盖eBay通知，忽略和恢复不改变回复资格或来源来信', () => {
    const buyer = conversation(), notice = conversation('notice-01')
    notice.flagged = true
    const originalMessages = JSON.stringify(notice.messages)
    expect(mailboxEntries([buyer, notice], 'starred').map(entry => entry.conversation.id)).toEqual([buyer.id, notice.id])
    notice.status = 'ignored'
    expect(mailboxEntries([buyer, notice], 'ignored').map(entry => entry.conversation.id)).toEqual([notice.id])
    expect(mailboxEntries([notice], 'ebay')).toHaveLength(1)
    expect(mailboxEntries([notice], 'inbox')).toHaveLength(0)
    expect(folderPendingCount([notice], 'starred')).toBe(0)
    expect(folderPendingCount([notice], 'ebay')).toBe(0)
    expect(notice.canReply).toBe(false)
    notice.status = 'processed'
    expect(matchesFolder(notice, 'ignored')).toBe(false)
    expect(folderPendingCount([notice], 'ebay')).toBe(1)
    expect(notice.canReply).toBe(false)
    expect(JSON.stringify(notice.messages)).toBe(originalMessages)
  })
  it('已读待处理和未读已处理相互独立，发送失败不覆盖人工处理结论', () => {
    const buyer = conversation()
    setEntryUnread(mailboxEntries([buyer], 'starred')[0]!, false)
    expect(buyer.unread).toBe(false)
    expect(buyer.status).toBe('pending')
    expect(folderPendingCount([buyer], 'inbox')).toBe(2)
    buyer.status = 'processed'
    setEntryUnread(mailboxEntries([buyer], 'inbox')[1]!, true)
    expect(buyer.unread).toBe(true)
    expect(buyer.status).toBe('processed')
    expect(isPendingConversation(buyer)).toBe(false)
    expect(folderPendingCount([buyer], 'inbox')).toBe(0)
    expect(folderPendingCount([buyer], 'starred')).toBe(0)
    buyer.messages.push({ id: 'pending-failure', kind: 'outgoing', sender: '客服01', body: 'Demo', at: buyer.updatedAt, delivery: 'failed' })
    expect(isPendingConversation(buyer)).toBe(false)
    expect(folderPendingCount([buyer], 'starred')).toBe(0)
    expect(folderPendingCount([buyer], 'failed')).toBe(0)
    expect(mailboxEntries([buyer], 'failed').map(entry => entry.message?.id)).toEqual(['pending-failure'])
    const messagesBeforeRestore = JSON.stringify(buyer.messages)
    buyer.status = 'pending'
    expect(isPendingConversation(buyer)).toBe(true)
    expect(folderPendingCount([buyer], 'inbox')).toBe(2)
    expect(folderPendingCount([buyer], 'starred')).toBe(1)
    expect(folderPendingCount([buyer], 'failed')).toBe(1)
    expect(buyer.unread).toBe(true)
    expect(JSON.stringify(buyer.messages)).toBe(messagesBeforeRestore)
  })
  it('已处理会话的发送中或待核查也不重开待处理状态', () => {
    const buyer = conversation('conv-08')
    buyer.status = 'processed'
    buyer.messages.push({ id: 'sending', kind: 'outgoing', sender: '客服01', body: 'Demo', at: buyer.updatedAt, delivery: 'sending' })
    expect(isPendingConversation(buyer)).toBe(false)
    expect(folderPendingCount([buyer], 'outbox')).toBe(0)
    expect(mailboxEntries([buyer], 'failed').map(entry => entry.message?.delivery)).toEqual(['unknown'])
  })
  it('eBay通知按整会话阅读，忽略后退出待处理且恢复不改阅读状态', () => {
    const notice = conversation('notice-01')
    notice.flagged = true
    notice.messages.push({ id: 'notice-second', kind: 'incoming', sender: 'eBay', body: 'Another notice', at: notice.updatedAt, unread: true })
    const entries = mailboxEntries([notice], 'ebay')
    setEntryUnread(entries[0]!, false)
    expect(entries.map(isEntryPending)).toEqual([false, false])
    expect(folderPendingCount([notice], 'starred')).toBe(0)
    setEntryUnread(entries[1]!, true)
    expect(entries.map(isEntryPending)).toEqual([true, true])
    expect(folderPendingCount([notice], 'starred')).toBe(1)
    notice.status = 'ignored'
    expect(entries.map(isEntryPending)).toEqual([false, false])
    expect(folderPendingCount([notice], 'starred')).toBe(0)
    notice.status = 'processed'
    expect(entries.map(isEntryPending)).toEqual([true, true])
    expect(folderPendingCount([notice], 'starred')).toBe(1)
    expect(notice.canReply).toBe(false)
    setEntryUnread(entries[1]!, false)
    expect(folderPendingCount([notice], 'ebay')).toBe(0)
    expect(folderPendingCount([notice], 'starred')).toBe(0)
  })
  it('打开一条来信更新整会话已读，手动未读也同步所有来信', () => {
    const item = conversation()
    item.messages.filter(message => message.kind === 'incoming').forEach(message => { message.unread = true })
    const [first, last] = mailboxEntries([item], 'inbox')
    setEntryUnread(first!, false)
    expect(isEntryUnread(first!)).toBe(false)
    expect(isEntryUnread(last!)).toBe(false)
    expect(item.unread).toBe(false)
    expect(item.messages.filter(message => message.kind === 'incoming').every(message => message.unread === false)).toBe(true)
    setEntryUnread(first!, true)
    expect(item.unread).toBe(true)
    expect(isEntryUnread(last!)).toBe(true)
    expect(item.messages.filter(message => message.kind === 'incoming').every(message => message.unread === true)).toBe(true)
  })
  it('旧逐封字段不覆盖会话状态，打开出站或聚合条目也更新整会话', () => {
    const item = conversation()
    item.messages.forEach(message => { delete message.unread })
    item.unread = true
    const [first, last] = mailboxEntries([item], 'inbox')
    first!.message!.unread = false
    expect(isEntryUnread(first!)).toBe(true)
    expect(isEntryUnread(last!)).toBe(true)
    const outboxEntry = mailboxEntries([item], 'outbox')[0]!
    expect(isEntryUnread(outboxEntry)).toBe(false)
    setEntryUnread(outboxEntry, false)
    expect(isEntryUnread(last!)).toBe(false)
    expect(item.status).toBe('pending')
    setEntryUnread(mailboxEntries([item], 'starred')[0]!, true)
    expect(isEntryUnread(first!)).toBe(true)
    setEntryUnread(mailboxEntries([item], 'starred')[0]!, false)
    expect(item.unread).toBe(false)
    expect(item.messages.filter(message => message.kind === 'incoming').every(message => message.unread === false)).toBe(true)
  })
  it('批量阅读按店铺与会话去重，跨目录一致且重复标记不增加变更数', () => {
    const first = conversation(), second = conversation('conv-02')
    const entries = [...mailboxEntries([first, second], 'inbox'), ...mailboxEntries([first], 'starred')]
    expect(setEntriesUnread(entries, false)).toBe(2)
    expect(entries.every(entry => !isEntryUnread(entry))).toBe(true)
    expect(setEntriesUnread(entries, false)).toBe(0)
    expect(setEntriesUnread([entries[0]!, entries[1]!], true)).toBe(1)
    expect(first.unread).toBe(true)
    expect(second.unread).toBe(false)
    expect(first.status).toBe('pending')
    expect(second.status).toBe('pending')
  })
  it('初始化与后台列出消息不标读，空来信会话也可显式更新阅读投影', () => {
    const item = conversation()
    expect(item.unread).toBe(true)
    expect(mailboxEntries([item], 'inbox').every(isEntryUnread)).toBe(true)
    expect(item.unread).toBe(true)
    item.messages = []
    expect(setConversationUnread(item, false)).toBe(true)
    expect(item.unread).toBe(false)
    expect(item.status).toBe('pending')
  })
  it('自动发送演示包含成功与失败，来源有明确字段，未实现规则计算', () => {
    const entries = mailboxEntries(createConversations(), 'automated')
    expect(entries.map(entry => entry.message?.delivery).sort()).toEqual(['failed', 'success'])
    expect(entries.map(entry => entry.message?.automationRuleName)).toEqual(['订单发货提醒', '订单商品资料补充'])
  })
  it('待处理在消息正文筛选后的同一条目范围计数，不因成功外发或已读改变处理状态', () => {
    const item = conversation('conv-02')
    const query = 'Your order has shipped in two packages'
    const filteredInbox = mailboxEntries([item], 'inbox').filter(entry => entry.message!.body.includes(query))
    const filteredOutbox = mailboxEntries([item], 'outbox').filter(entry => entry.message!.body.includes(query))
    expect(mailboxEntries([item], 'inbox').filter(isEntryUnread)).toHaveLength(2)
    expect(folderPendingCount([item], 'inbox')).toBe(2)
    expect(filteredInbox.filter(isEntryPending)).toHaveLength(0)
    expect(filteredOutbox).toHaveLength(1)
    expect(filteredOutbox.filter(isEntryPending)).toHaveLength(1)
    item.status = 'processed'
    expect(filteredOutbox.filter(isEntryPending)).toHaveLength(0)
    expect(filteredOutbox).toHaveLength(1)
  })
  it('按消息标题命中对应外发，不能带入同会话其他收发记录或内部备注', () => {
    const item = conversation()
    item.messages.push({ id: 'public-title', kind: 'outgoing', sender: '客服01', subject: '  Unique shipment update  ', body: 'Tracking update', at: item.updatedAt, delivery: 'success' })
    item.messages.push({ id: 'private-title', kind: 'note', sender: '客服01', subject: 'Private review title', body: 'Private review text', at: item.updatedAt })
    const filters: MailFilters = { shopIds: [], assignees: [], field: 'subject', mode: 'exact', query: 'Unique shipment update', onlyUnread: false, onlyFlagged: false }
    expect(mailboxEntries([item], 'outbox').filter(entry => matchesEntryTextSearch(entry, filters)).map(entry => entry.message?.id)).toEqual(['public-title'])
    expect(mailboxEntries([item], 'inbox').filter(entry => matchesEntryTextSearch(entry, filters))).toHaveLength(0)
    expect(mailboxEntries([item], 'starred').filter(entry => matchesEntryTextSearch(entry, filters))).toHaveLength(1)
    const originalSubject = { ...filters, query: item.subject }
    expect(mailboxEntries([item], 'outbox').filter(entry => matchesEntryTextSearch(entry, originalSubject)).map(entry => entry.message?.id)).toEqual(['msg-01-2'])
    expect(mailboxEntries([item], 'starred').filter(entry => matchesEntryTextSearch(entry, { ...filters, mode: 'contains', query: 'Private' }))).toHaveLength(0)
    expect(mailboxEntries([item], 'starred').filter(entry => matchesEntryTextSearch(entry, { ...filters, field: 'body', mode: 'contains', query: 'Private' }))).toHaveLength(0)
  })
})

describe('附件链接的本地校验', () => {
  it('允许HTTP(S)公网域名和IP的指定扩展名，不发起下载', () => {
    for (const value of [
      'https://assets.example.com/photo.PNG?download=1', 'http://assets.example.com/part.jpg',
      'https://assets.example.com/manual.pdf#page=2', 'https://assets.example.com/photo%2Ejpeg',
      'https://8.8.8.8/photo.png', 'https://[2606:4700:4700::1111]/photo.png',
    ]) expect(validateAttachmentUrl(value), value).toBeUndefined()
  })
  it('拒绝空值、非HTTP协议、凭据、非文件扩展和伪装查询参数', () => {
    for (const value of [
      '', 'data:image/png;base64,example', 'javascript:alert(1)', 'ftp://assets.example.com/photo.png',
      'https://name:secret@assets.example.com/photo.png', 'https://@assets.example.com/photo.png',
      'https://assets.example.com/script.html?file=photo.png', 'https://assets.example.com/photo.svg',
      'https://assets.example.com/photo.png/extra', 'https://assets.example.com/photo.png%00',
      'https://assets.example.com/pho\nto.png', 'https://assets.example.com\\photo.png',
    ]) expect(validateAttachmentUrl(value), value).toBeDefined()
  })
  it('拒绝本机、私网、变体IPv4和IPv6内网及映射地址', () => {
    for (const host of [
      'localhost', 'localhost.', 'api.localhost', 'server.local', 'service.internal', 'intranet',
      '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0',
      '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '224.0.0.1', '255.255.255.255', '[::1]', '[::]', '[fc00::1]', '[fd12::1]', '[fe80::1]',
      '[::ffff:127.0.0.1]', '[2002:7f00:1::]', '[2001::1]', '[2001:db8::1]',
    ]) expect(validateAttachmentUrl(`https://${host}/file.png`), host).toBeDefined()
  })
})
