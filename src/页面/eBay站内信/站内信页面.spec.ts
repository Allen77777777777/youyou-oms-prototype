import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { plainTextToHtml, richHtmlToText } from '../消息模板管理/富文本'
import { ElCheckbox, ElDropdown, ElDropdownItem, ElMessage, ElMessageBox, ElSelect } from 'element-plus'
import MailPage from './eBay站内信页面.vue'
import { draftKey, mailSession as session, resetMailSession } from './会话'
import { replyTemplates } from './数据'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { resetMailTagDefinitions, saveMailTag, mailTagDefinitions } from './设置模型'
import { resetTemplateSession, saveTemplate, templateSession } from '../消息模板管理/模型'

let wrapper: VueWrapper
// 仅替换弹窗定位/过渡外壳；字段搜索、真实 ElSelect、表单输入与页面事件仍实际执行。
// 不 stub Teleport：Select/Popper 的内部节点留在真实传送容器，避免 jsdom 嵌套挂载循环。
const DialogShell = {
  props: ['modelValue', 'title'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="测试浮层" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>',
}
function button(text: string) {
  const target = wrapper.findAll('button').find(b => b.text().trim() === text)
  if (!target) throw new Error(`未找到按钮 ${text}`)
  return target
}
async function openBuyer(buyer: string) { await wrapper.get(`.mail-row-content[role="button"][aria-label$=" ${buyer}"]`).trigger('click'); await nextTick() }
function draftText() { return (wrapper.get('textarea[aria-label="回复正文"]').element as HTMLTextAreaElement).value }
async function setRich(label: string, text: string) {
  const plain = wrapper.find(`textarea[aria-label="${label}"]`)
  if (plain.exists()) { await plain.setValue(text); return }
  const editor = wrapper.get(`[contenteditable="true"][aria-label="${label}"]`); editor.element.innerHTML = plainTextToHtml(text); await editor.trigger('input'); await nextTick()
}
function confirmPrompts() { return vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>) }
function conversation(id: string) { return session.conversations.find(c => c.id === id)! }
function last<T>(values: T[]) { return values[values.length - 1] }
function receivedCount(source?: 'buyer' | 'ebay') { return session.conversations.filter(c => !source || c.source === source).reduce((sum, c) => sum + c.messages.filter(m => m.kind === 'incoming').length, 0) }
async function checkBuyer(buyer: string, checked = true) {
  const row = wrapper.findAll('.mail-list-row').find(r => r.find(`.mail-row-content[role="button"][aria-label$=" ${buyer}"]`).exists())
  if (!row) throw new Error(`未找到买家行 ${buyer}`)
  await row.get('input[type="checkbox"]').setValue(checked)
}
async function checkLabel(label: string, checked = true, scope?: string) {
  const matches = wrapper.findAllComponents(ElCheckbox).filter(c => c.text().trim() === label && (!scope || c.element.closest(scope)))
  if (matches.length !== 1) throw new Error(`勾选项 ${label} 在${scope ?? '页面'}匹配到 ${matches.length} 项，请指定唯一范围`)
  await matches[0]!.get('input[type="checkbox"]').setValue(checked)
}
async function checkBusinessTag(label: string, checked = true) { await checkLabel(label, checked, '[data-title="业务标签"]') }
async function selectValue(label: string, value: string) {
  const select = wrapper.findAllComponents(ElSelect).find(c => c.props('ariaLabel') === label || c.attributes('aria-label') === label || c.find(`[aria-label="${label}"]`).exists())
  if (!select) throw new Error(`未找到选择项 ${label}`)
  // 选择器使用真实组件，发出与用户选中选项相同的值事件；不依赖浮层位置。
  select.vm.$emit('update:modelValue', value); select.vm.$emit('change', value)
  await nextTick()
}
async function batchCommand(command: string) {
  const dropdown = wrapper.findAllComponents(ElDropdown).find(d => d.find('[aria-label="批量更多操作"]').exists())!
  dropdown.vm.$emit('command', command)
  await flushPromises(); await nextTick()
}
function currentMenuItems() {
  return wrapper.findAllComponents(ElDropdown).find(d => d.find('[aria-label="当前信件更多操作"]').exists())!.findAllComponents(ElDropdownItem)
}
async function currentAction(label: string) {
  const item = currentMenuItems().find(item => item.text().trim() === label)
  if (!item) throw new Error(`未找到当前信件操作 ${label}`)
  await item.get('li.el-dropdown-menu__item').trigger('click'); await flushPromises(); await nextTick()
}
async function processAction(label: string) {
  const target = wrapper.get('.mail-reader-actions .mail-process-action')
  expect(target.text()).toBe(label)
  await target.trigger('click'); await nextTick()
}
async function listFilter(group: '阅读' | '处理', label: string) {
  const target = wrapper.get(`[aria-label="${group}状态筛选"]`).findAll('button').find(button => button.text().trim() === label)
  if (!target) throw new Error(`未找到${group}筛选 ${label}`)
  await target.trigger('click'); await nextTick()
}
async function openFolder(label: string) { await wrapper.get(`button[aria-label="文件夹：${label}"]`).trigger('click'); await nextTick() }
async function send(body: string) {
  await setRich('回复正文', body)
  await button('发送').trigger('click'); await nextTick()
}

beforeEach(async () => {
  resetMailSession()
  resetMailTagDefinitions()
  resetTemplateSession()
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ close: vi.fn() }))
  wrapper = mount(MailPage, { attachTo: document.body, global: { directives: { prototype: {} }, stubs: { ElDialog: DialogShell } } })
  await nextTick()
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks() })

describe('站内信工作台', () => {
  it('点击列表买家 ID 不打开消息、不标读、不改变当前回复会话', async () => {
    const c = session.conversations.find(item => item.source === 'buyer' && item.unread)!
    const before = session.activeId
    const row = wrapper.findAll('.mail-list-row').find(item => item.find('.mail-row-content').attributes('aria-label')?.endsWith(' ' + c.buyerId))!
    await row.get('.buyer-detail-link').trigger('click'); await nextTick()
    expect(c.unread).toBe(true)
    expect(session.activeId).toBe(before)
  })

  it('缺少时区的消息不按电脑时区参与最近排序，排在可信时刻之后', async () => {
    const unknown = conversation('conv-01'), known = conversation('conv-02')
    unknown.messages = unknown.messages.filter(m => m.kind === 'incoming').slice(0, 1)
    known.messages = known.messages.filter(m => m.kind === 'incoming').slice(0, 1)
    unknown.messages[0]!.at = '2099-11-06T09:30:00'
    known.messages[0]!.at = '2026-11-06T01:30:00Z'
    session.conversations = [unknown, known]
    await nextTick()
    const rows = wrapper.findAll('.mail-row-content[role="button"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('aria-label')).toContain(known.buyerId)
    expect(rows[1]!.attributes('aria-label')).toContain(unknown.buyerId)
  })

  it('会话操作日志可查真实指派及优先级变更，同值保存及普通阅读查询不写日志', async () => {
    const c = conversation('conv-01')
    await openBuyer(c.buyerId)
    await button('查询').trigger('click')
    expect(c.operationLogs ?? []).toHaveLength(0)
    await currentAction('指派客服')
    await button('确定指派').trigger('click')
    expect(c.operationLogs ?? []).toHaveLength(0)
    await currentAction('指派客服')
    await selectValue('指派客服选择', '客服02')
    await button('确定指派').trigger('click')
    const value = c.priority === 'urgent' ? 'low' : 'urgent'
    await wrapper.get('select[aria-label="当前会话优先级"]').setValue(value)
    await wrapper.get('select[aria-label="当前会话优先级"]').setValue(value)
    expect(c.operationLogs).toHaveLength(2)
    expect(c.operationLogs?.map(log => log.operator)).toEqual(['客服01', '客服01'])
    await currentAction('操作日志')
    const logs = wrapper.get('[data-title="操作日志"]')
    expect(logs.text()).toContain('指派客服')
    expect(logs.text()).toContain('客服02')
    expect(logs.text()).toContain('设置优先级')
    expect(logs.text()).toContain('已完成')
    expect(conversation('conv-02').operationLogs ?? []).toHaveLength(0)
  })
  it('发送日志仅引用消息且提交及结果冻结执行身份，自动标注单独记录系统来源', async () => {
    vi.useFakeTimers()
    const c = conversation('conv-01')
    await send('PRIVATE-MESSAGE-BODY')
    const outgoing = last(c.messages)!
    expect(c.operationLogs?.find(log => log.action === '发送站内信')).toMatchObject({ operator: '客服01', result: '发送中' })
    outgoing.sender = '后来改变的显示名'
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    const attempts = c.operationLogs?.filter(log => ['发送站内信', '站内信发送结果'].includes(log.action)) ?? []
    expect(attempts.map(log => [log.operator, log.result])).toEqual([['客服01', '发送中'], ['客服01', '发送成功']])
    expect(attempts.every(log => log.content.includes(outgoing.id))).toBe(true)
    expect(JSON.stringify(c.operationLogs)).not.toContain('PRIVATE-MESSAGE-BODY')
    expect(c.operationLogs?.find(log => log.action === '发送成功后标注已处理')?.operator).toBe('系统')
    expect(c.lastHandledBy).toBe('客服01')
  })
  it('重试保留历史发送人，新增本次执行及结果日志，不覆盖原失败', async () => {
    vi.useFakeTimers()
    await openBuyer('buyer_demo_07')
    const c = conversation('conv-07'), message = c.messages.find(item => item.id === 'msg-07-2')!
    message.sender = '原发送人'
    await button('重试').trigger('click'); await nextTick()
    expect(c.operationLogs?.find(log => log.action === '重试站内信')).toMatchObject({ operator: '客服01', result: '发送中' })
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(message.sender).toBe('原发送人')
    expect(c.operationLogs?.filter(log => log.action === '站内信发送结果')).toEqual([expect.objectContaining({ operator: '客服01', result: '发送成功' })])
  })
  it('默认选中、筛选和文件夹切换不自动标读，主动打开才更新整会话', async () => {
    const c = conversation('conv-01')
    expect(c.unread).toBe(true)
    expect(c.messages.filter(m => m.kind === 'incoming').every(m => m.unread)).toBe(true)
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue(c.buyerId)
    await button('查询').trigger('click')
    expect(c.unread).toBe(true)
    await openFolder('星标关注')
    expect(c.unread).toBe(true)
    await openBuyer(c.buyerId)
    expect(c.unread).toBe(false)
    expect(c.messages.filter(m => m.kind === 'incoming').every(m => !m.unread)).toBe(true)
    await currentAction('标记未读'); await nextTick()
    expect(c.unread).toBe(true)
  })
  it('批量工具条更多位于最后，单条发送无需确认且在途重复点击不新增消息', async () => {
    vi.useFakeTimers()
    const confirm = confirmPrompts(), c = conversation('conv-01'), count = c.messages.length
    const actions = wrapper.get('.mail-batch').findAll('button').map(b => b.text().trim())
    expect(actions.slice(-3)).toEqual(['标签', '优先级', '更多'])
    await setRich('回复正文', '  What you see is what is sent.\nSecond line.  ')
    const submit = button('发送')
    await submit.trigger('click')
    expect(last(c.messages)).toMatchObject({ body: '  What you see is what is sent.\nSecond line.  ', delivery: 'sending' })
    expect(wrapper.find('[data-title="确认回复"]').exists()).toBe(false)
    expect(submit.attributes('disabled')).toBeDefined()
    await submit.trigger('click')
    expect(c.messages).toHaveLength(count + 1)
    expect(confirm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(c.messages)?.delivery).toBe('success')
    expect(wrapper.get('.mail-reader').text()).not.toContain('模拟')
  })
  it('同会话两封平台通知各自显示原文，正文全文查询与转发保持同源', async () => {
    const c = conversation('notice-01'), first = c.messages[0]!
    first.notice = { heading: '第一通知标题', paragraphs: ['第一通知完整段落'], sections: [{ title: '第一通知章节', content: '第一通知正文深处唯一词' }], footer: '第一通知页脚' }
    c.messages.push({ id: 'notice-body-second', kind: 'incoming', sender: 'eBay', body: '短摘要不包含完整内容', at: '2026-10-28T12:00:00+08:00', notice: { heading: '第二通知标题', paragraphs: ['第二通知完整段落'], sections: [{ title: '第二通知章节', content: '第二通知正文深处唯一词' }], footer: '第二通知页脚' } })
    await openFolder('eBay消息')
    await wrapper.get(`.mail-list-row[data-message-id="${first.id}"] .mail-row-content`).trigger('click')
    expect(wrapper.get('.mail-notice-document').text()).toContain('第一通知正文深处唯一词')
    expect(wrapper.get('.mail-notice-document').text()).not.toContain('第二通知')
    await wrapper.get('.mail-list-row[data-message-id="notice-body-second"] .mail-row-content').trigger('click')
    expect(wrapper.get('.mail-notice-document').text()).toContain('第二通知正文深处唯一词')
    expect(wrapper.get('.mail-notice-document').text()).not.toContain('第一通知')
    await selectValue('站内信搜索字段', 'body')
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue('第二通知正文深处唯一词')
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(1)
    expect(wrapper.get('.mail-list-row').attributes('data-message-id')).toBe('notice-body-second')
    expect(wrapper.get('.mail-notice-document').attributes('data-message-id')).toBe('notice-body-second')
    await currentAction('转发站内信')
    const preview = wrapper.get('[data-title="转发站内信"] .mail-send-preview').text()
    expect(preview).toContain('第一通知正文深处唯一词'); expect(preview).toContain('第一通知页脚')
    expect(preview).toContain('第二通知正文深处唯一词'); expect(preview).toContain('第二通知页脚')
  })
  it.each(['source', 'canReply', 'unknown', 'ignored'] as const)('单条提交时复验发信资格：%s 变化不创建外发记录', async change => {
    const c = conversation('conv-01'), count = c.messages.length
    await setRich('回复正文', 'Check authorization at confirmation')
    if (change === 'source') c.source = 'ebay'
    if (change === 'canReply') c.canReply = false
    if (change === 'unknown') c.messages.push({ id: 'new-unknown', kind: 'outgoing', sender: '客服01', body: 'Awaiting reconciliation', at: c.updatedAt, delivery: 'unknown' })
    if (change === 'ignored') c.status = 'ignored'
    await button('发送').trigger('click')
    expect(c.messages).toHaveLength(count + Number(change === 'unknown'))
    expect(c.messages.some(m => m.delivery === 'sending')).toBe(false)
    expect(session.drafts[draftKey(c.id, 'reply')]!.body).toBe('Check authorization at confirmation')
  })
  it('店铺或买家身份为空时直接提交被拦截，保留正文且不创建外发记录', async () => {
    const c = conversation('conv-01'), count = c.messages.length
    await setRich('回复正文', 'Keep this draft until recipient identity is complete.')
    for (const field of ['shopId', 'buyerId'] as const) {
      const original = c[field]
      c[field] = '   '
      await button('发送').trigger('click'); await nextTick()
      expect(c.messages).toHaveLength(count)
      expect(c.messages.some(m => m.delivery === 'sending')).toBe(false)
      expect(ElMessage.warning).toHaveBeenCalledWith('店铺或买家资料缺失，无法发送')
      expect(session.drafts[draftKey(c.id, 'reply')]!.body).toBe('Keep this draft until recipient identity is complete.')
      c[field] = original
      await nextTick()
    }
  })
  it.each(['source', 'canReply', 'ignored'] as const)('重试提交时 %s 不合格保持失败结果，不弹出确认', async change => {
    const confirm = confirmPrompts()
    await openBuyer('buyer_demo_07')
    const c = conversation('conv-07'), failed = c.messages.find(m => m.delivery === 'failed')!
    if (change === 'source') c.source = 'ebay'
    if (change === 'canReply') c.canReply = false
    if (change === 'ignored') c.status = 'ignored'
    await nextTick()
    expect(failed.delivery).toBe('failed')
    expect(button('重试').attributes('disabled')).toBeDefined()
    await button('重试').trigger('click')
    expect(confirm).not.toHaveBeenCalled()
  })
  it('批量单窗提交时复验最新资格，跳过不可回复会话并发送合格目标', async () => {
    vi.useFakeTimers()
    const first = conversation('conv-01'), second = conversation('conv-02'), count = first.messages.length
    await checkBuyer(first.buyerId); await checkBuyer(second.buyerId); await button('批量回复').trigger('click')
    await setRich('批量回复正文', 'Revalidate each recipient')
    first.canReply = false
    await button('批量发送').trigger('click')
    expect(first.messages).toHaveLength(count)
    expect(last(second.messages)).toMatchObject({ body: 'Revalidate each recipient', delivery: 'sending' })
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(first.messages).toHaveLength(count)
    expect(last(second.messages)).toMatchObject({ body: 'Revalidate each recipient', delivery: 'success' })
    expect(wrapper.get('.mail-batch-review').text()).toContain('未发送：不支持回复')
  })
  it('忽略会话阻止对外发送但保留超过外发长度的内部备注', async () => {
    const c = conversation('conv-01'), count = c.messages.length
    c.status = 'ignored'
    await setRich('回复正文', 'Do not send while ignored'); await button('发送').trigger('click')
    expect(wrapper.find('[data-title="确认回复"]').exists()).toBe(false)
    expect(c.messages).toHaveLength(count)
    await button('内部备注').trigger('click'); await setRich('内部备注正文', '内'.repeat(2001)); await button('添加备注').trigger('click')
    expect(last(c.messages)).toMatchObject({ kind: 'note', body: '内'.repeat(2001) })
    expect(c.status).toBe('ignored')
  })
  it('目录改为eBay站内信并保留草稿，收展可恢复，移除待回复与已发送', async () => {
    expect(wrapper.get('.mail-folder-heading').text()).toContain('eBay站内信')
    expect(wrapper.find('[aria-label="文件夹：待回复"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="文件夹：已发送"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="文件夹：草稿箱"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="文件夹：自动发送"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="文件夹：eBay消息"]').exists()).toBe(true)
    await wrapper.get('[aria-label="收起文件夹"]').trigger('click')
    expect(session.foldersCollapsed).toBe(true)
    await wrapper.get('[aria-label="展开文件夹"]').trigger('click')
    expect(session.foldersCollapsed).toBe(false)
  })
  it('收件箱只显示买家来信，eBay消息由专属目录阅读，所有来源切换按钮移除', async () => {
    await wrapper.get('select[aria-label="每页条数"]').setValue('100')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(receivedCount('buyer'))
    expect(wrapper.findAll('.mail-row-name').some(row => row.text() === 'eBay')).toBe(false)
    expect(wrapper.findAll('.mail-row-name').some(row => row.text() === 'buyer_demo_01')).toBe(true)
    expect(wrapper.find('.mail-source-tabs').exists()).toBe(false)
    await openFolder('eBay消息')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(receivedCount('ebay'))
    expect(wrapper.findAll('.mail-row-name').every(row => row.text() === 'eBay')).toBe(true)
    expect(wrapper.find('.mail-source-tabs').exists()).toBe(false)
    expect(wrapper.find('.mail-composer').exists()).toBe(false)
    expect(wrapper.find('[contenteditable="true"][aria-label="回复正文"]').exists()).toBe(false)
    expect(wrapper.find('.mail-notice-document').exists()).toBe(true)
  })
  it('从eBay消息切换发件、自动发送与失败目录，只有买家外发且不显示来源或阅读切换', async () => {
    await openFolder('eBay消息')
    for (const folder of ['发件箱', '自动发送', '发信失败']) {
      await openFolder(folder)
      expect(wrapper.find('.mail-source-tabs').exists()).toBe(false)
      expect(wrapper.find('.mail-reading-filters').exists()).toBe(false)
      expect(wrapper.find('.mail-processing-filters').exists()).toBe(true)
      expect(wrapper.findAll('.mail-list-row').length).toBeGreaterThan(0)
      expect(wrapper.findAll('.mail-row-name').every(row => row.text().startsWith('buyer_demo_'))).toBe(true)
    }
  })
  it('eBay通知无待处理或已处理标签，只有忽略时展示已忽略且始终没有回复框', async () => {
    await openFolder('eBay消息')
    const notice = conversation(session.activeId)
    for (const status of ['pending', 'processed', 'ignored'] as const) {
      notice.status = status; await nextTick()
      expect(wrapper.get('.mail-reader-party').text()).toBe('eBay')
      expect(wrapper.get('.mail-reader-heading').text()).not.toContain('待处理')
      expect(wrapper.get('.mail-reader-heading').text()).not.toContain('已处理')
      expect(wrapper.find('.mail-composer').exists()).toBe(false)
      expect(wrapper.find('.mail-process-action').exists()).toBe(false)
      expect(wrapper.find('.mail-row-status').exists()).toBe(false)
      expect(wrapper.findAll('.mail-reader-identity .el-tag').map(tag => tag.text())).toEqual(status === 'ignored' ? ['已忽略'] : [])
    }
  })
  it('处理状态与阅读状态筛选取交集，目录计数和待处理资格不随列表筛选变化', async () => {
    const first = conversation('conv-01'), second = conversation('conv-02'), done = conversation('conv-03')
    session.conversations = [first, second, done]
    first.status = 'pending'; second.status = 'pending'; done.status = 'processed'
    first.messages.forEach(m => { if (m.kind === 'incoming') m.unread = false }); first.unread = false
    done.messages.forEach(m => { if (m.kind === 'incoming') m.unread = false }); done.unread = false
    await nextTick(); await openBuyer(second.buyerId)
    second.messages.forEach(m => { if (m.kind === 'incoming') m.unread = true }); second.unread = true
    await nextTick()
    const directoryCounts = wrapper.findAll('.mail-folder').map(folder => folder.text())
    await listFilter('处理', '待处理'); await listFilter('阅读', '未读')
    expect(wrapper.findAll('.mail-row-name').every(row => row.text() === second.buyerId)).toBe(true)
    expect(wrapper.findAll('.mail-list-row').length).toBeGreaterThan(0)
    await listFilter('阅读', '已读')
    expect(wrapper.findAll('.mail-row-name').every(row => row.text() === first.buyerId)).toBe(true)
    await listFilter('处理', '已处理')
    expect(wrapper.findAll('.mail-row-name').every(row => row.text() === done.buyerId)).toBe(true)
    expect(wrapper.findAll('.mail-list-row').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.mail-folder').map(folder => folder.text())).toEqual(directoryCounts)
  })
  it('切处理筛选重置分页和勾选，星标全部保留通知，切目录重置且忽略和通知目录无处理筛选', async () => {
    await wrapper.get('[aria-label="下一页"]').trigger('click')
    await wrapper.get('.mail-list-row input[type="checkbox"]').setValue(true)
    await listFilter('处理', '已处理')
    expect(wrapper.get('[aria-label="跳转页码"]').element).toHaveProperty('value', '1')
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    const notice = conversation('notice-01'); notice.flagged = true
    await openFolder('星标关注')
    expect(wrapper.get('.mail-processing-filters button[aria-pressed="true"]').text()).toBe('全部')
    expect(wrapper.findAll('.mail-row-name').some(row => row.text() === 'eBay')).toBe(true)
    await listFilter('处理', '待处理')
    expect(wrapper.findAll('.mail-row-name').some(row => row.text() === 'eBay')).toBe(false)
    await openFolder('eBay消息')
    expect(wrapper.find('.mail-processing-filters').exists()).toBe(false)
    expect(wrapper.find('.mail-process-action').exists()).toBe(false)
    notice.status = 'ignored'
    await openFolder('已忽略')
    expect(wrapper.find('.mail-processing-filters').exists()).toBe(false)
    expect(wrapper.findAll('.mail-row-name').some(row => row.text() === 'eBay')).toBe(true)
    await openFolder('发件箱')
    expect(wrapper.get('.mail-processing-filters button[aria-pressed="true"]').text()).toBe('全部')
  })
  it('同会话的不同收件记录分别显示正文摘要并定位对应气泡，不总是跳到最后一条', async () => {
    const c = conversation('conv-01'), incoming = c.messages.filter(m => m.kind === 'incoming')
    expect(incoming.length).toBeGreaterThan(1)
    for (const message of incoming) {
      const row = wrapper.findAll('.mail-list-row').find(row => row.get('.mail-row-preview').text() === message.body)!
      expect(row).toBeDefined()
      await row.get('.mail-row-content[role="button"]').trigger('click'); await nextTick()
      expect(session.activeId).toBe(c.id)
      expect(wrapper.findAll('.mail-message.is-target-message')).toHaveLength(1)
      expect(wrapper.get('.mail-message.is-target-message').attributes('data-message-id')).toBe(message.id)
      expect(wrapper.get('.mail-message.is-target-message .mail-message-body').text()).toContain(message.body)
      expect(wrapper.findAll('.mail-list-row.selected')).toHaveLength(1)
    }
  })
  it('发件与自动发送逐条定位消息，自动视图只纳入明确的自动规则来源', async () => {
    const c = conversation('conv-01')
    const ruleName = '订单完成发货后发送物流进度通知并包含平台商品信息的自动客服规则'
    c.messages.push(
      { id: 'test-manual', kind: 'outgoing', sender: '自动客服', body: 'Unique manual reply', at: '2026-10-28T10:00:00+08:00', delivery: 'success' },
      { id: 'test-automation', kind: 'outgoing', sender: '自动客服', subject: 'Shipment update for the selected message', body: 'Unique automated reply', at: '2026-10-28T10:01:00+08:00', delivery: 'success', sendSource: 'automation', automationRuleName: ruleName },
    )
    await openFolder('发件箱')
    for (const [body, messageId] of [['Unique manual reply', 'test-manual'], ['Unique automated reply', 'test-automation']] as const) {
      const row = wrapper.findAll('.mail-list-row').find(row => row.get('.mail-row-preview').text() === body)!
      await row.get('.mail-row-content[role="button"]').trigger('click'); await nextTick()
      expect(wrapper.get('.mail-message.is-target-message').attributes('data-message-id')).toBe(messageId)
      expect(wrapper.get('.mail-reader-party').text()).toBe(c.buyerId)
      expect(wrapper.get('.mail-reading-subject').text()).toBe(messageId === 'test-automation' ? 'Shipment update for the selected message' : c.subject)
      if (messageId === 'test-automation') {
        expect(row.get('.mail-automation-rule').text()).toBe(`自动客服规则：${ruleName}`)
        expect(row.get('.mail-automation-rule').attributes('title')).toBe(`自动客服规则：${ruleName}`)
        expect(wrapper.get('.mail-message.is-target-message .mail-automation-origin').text()).toBe(`自动客服规则：${ruleName}`)
      } else {
        expect(row.find('.mail-automation-rule').exists()).toBe(false)
        expect(wrapper.find('.mail-message.is-target-message .mail-automation-origin').exists()).toBe(false)
      }
    }
    await openFolder('自动发送')
    expect(wrapper.findAll('.mail-row-preview').some(row => row.text() === 'Unique manual reply')).toBe(false)
    const automatic = wrapper.findAll('.mail-list-row').find(row => row.get('.mail-row-preview').text() === 'Unique automated reply')!
    expect(automatic.text()).toContain(`自动客服规则：${ruleName}`)
    await automatic.get('.mail-row-content[role="button"]').trigger('click'); await nextTick()
    expect(wrapper.get('.mail-message.is-target-message').attributes('data-message-id')).toBe('test-automation')
  })
  it('阅读区独立标题随来信切换，缺少消息标题时采用会话标题，保留买家与处理信息', async () => {
    const c = conversation('conv-01'), incoming = c.messages.filter(m => m.kind === 'incoming')
    incoming[0]!.subject = 'Specific incoming question'
    await nextTick()
    const row = wrapper.get(`.mail-list-row[data-message-id="${incoming[0]!.id}"]`)
    expect(row.get('.mail-row-subject').text()).toBe('Specific incoming question')
    expect(row.get('.mail-row-content').attributes('aria-label')).toBe(`打开Specific incoming question ${c.buyerId}`)
    expect(row.getComponent(ElCheckbox).attributes('aria-label')).toBe(`勾选Specific incoming question ${c.buyerId}`)
    await wrapper.get(`.mail-list-row[data-message-id="${incoming[0]!.id}"] .mail-row-content`).trigger('click')
    expect(wrapper.get('h2.mail-reading-subject').text()).toBe('Specific incoming question')
    expect(wrapper.get('.mail-reader-party').text()).toBe(c.buyerId)
    expect(wrapper.get('.mail-header-secondary .mail-ownership').text()).toContain('处理人')
    expect(wrapper.get('.mail-header-secondary .mail-last-handler').text()).toContain('最近处理')
    await wrapper.get(`.mail-list-row[data-message-id="${incoming[1]!.id}"] .mail-row-content`).trigger('click')
    expect(wrapper.get('h2.mail-reading-subject').text()).toBe(c.subject)
  })
  it('主动读取及批量标读按整会话更新，手工未读不会被当前阅读区自动清除', async () => {
    confirmPrompts()
    const c = conversation('conv-01'), incoming = c.messages.filter(m => m.kind === 'incoming')
    incoming.forEach(m => { m.unread = true }); c.unread = true
    await nextTick()
    const rowFor = (body: string) => wrapper.findAll('.mail-list-row').find(row => row.get('.mail-row-preview').text() === body)!
    await rowFor(incoming[0]!.body).get('.mail-row-content[role="button"]').trigger('click'); await nextTick()
    expect(incoming[0]!.unread).toBe(false)
    expect(incoming[1]!.unread).toBe(false)
    expect(c.unread).toBe(false)
    await rowFor(incoming[1]!.body).get('input[type="checkbox"]').setValue(true)
    await batchCommand('read')
    expect(incoming.every(m => !m.unread)).toBe(true)
    expect(c.unread).toBe(false)
    await rowFor(incoming[0]!.body).get('input[type="checkbox"]').setValue(true)
    await batchCommand('unread')
    expect(incoming[0]!.unread).toBe(true)
    expect(incoming[1]!.unread).toBe(true)
    expect(c.unread).toBe(true)
    await nextTick()
    expect(c.unread).toBe(true)
  })
  it('按消息主题查询具体发件标题，只返回该消息并定位标题和正文', async () => {
    const c = conversation('conv-01')
    c.messages.push(
      { id: 'search-subject-a', kind: 'outgoing', sender: '客服01', subject: 'Unique shipment update', body: 'Shipment body A', at: '2026-10-28T10:01:00+08:00', delivery: 'success' },
      { id: 'search-subject-b', kind: 'outgoing', sender: '客服01', subject: 'A different reply title', body: 'Shipment body B', at: '2026-10-28T10:02:00+08:00', delivery: 'success' },
    )
    await openFolder('发件箱')
    await selectValue('站内信搜索字段', 'subject')
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue('Unique shipment update')
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(1)
    expect(wrapper.get('.mail-list-row').attributes('data-message-id')).toBe('search-subject-a')
    expect(wrapper.get('.mail-reading-subject').text()).toBe('Unique shipment update')
    expect(wrapper.get('.mail-message.is-target-message').attributes('data-message-id')).toBe('search-subject-a')
    await openFolder('星标关注')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(1)
    expect(wrapper.get('.mail-row-name').text()).toBe(c.buyerId)
  })
  it('批量勾选同一会话的两条来信只给该买家发送一次', async () => {
    vi.useFakeTimers()
    const c = conversation('conv-01'), count = c.messages.filter(m => m.kind === 'outgoing').length
    const rows = wrapper.findAll('.mail-list-row').filter(row => row.find('.mail-row-content[role="button"][aria-label$=" buyer_demo_01"]').exists())
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) await row.get('input[type="checkbox"]').setValue(true)
    await button('批量回复').trigger('click')
    await setRich('批量回复正文', 'One reply per buyer conversation')
    await nextTick()
    expect(wrapper.findAll('.mail-batch-review > div')).toHaveLength(1)
    await button('批量发送').trigger('click')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(c.messages.filter(m => m.kind === 'outgoing')).toHaveLength(count + 1)
    expect(last(c.messages)).toMatchObject({ body: 'One reply per buyer conversation', delivery: 'success' })
  })
  it('同一页切换通知阅读、买家对话和停靠资料栏，通知没有回复框', async () => {
    expect(wrapper.find('.mail-context').exists()).toBe(false)
    await wrapper.get('[aria-label="显示资料栏"]').trigger('click')
    expect(wrapper.find('.mail-context').exists()).toBe(true)
    expect(wrapper.get('.mail-context').text()).toContain('退货申请')
    await button('查看申请').trigger('click')
    expect(wrapper.get('.mail-context').text()).toContain('RET-DEMO-01')
    await wrapper.get('[aria-label="收起相关资料"]').trigger('click')
    expect(wrapper.find('.mail-context').exists()).toBe(false)
    await openFolder('eBay消息')
    expect(wrapper.find('.mail-notice-document').exists()).toBe(true)
    expect(wrapper.find('.mail-composer').exists()).toBe(false)
    expect(wrapper.find('.mail-context-summary').exists()).toBe(false)
  })
  it('切换会话及备注模式草稿互不串写，点击发送直接提交当前买家', async () => {
    vi.useFakeTimers()
    await setRich('回复正文', 'For buyer one')
    await openBuyer('buyer_demo_02')
    expect(draftText()).toBe('')
    await setRich('回复正文', 'For buyer two')
    await openBuyer('buyer_demo_01')
    expect(draftText()).toBe('For buyer one')
    await button('内部备注').trigger('click')
    await setRich('内部备注正文', '内部核对车型')
    await button('回复买家').trigger('click')
    expect(draftText()).toBe('For buyer one')
    await button('发送').trigger('click'); await nextTick()
    expect(wrapper.find('.mail-send-dialog').exists()).toBe(false)
    expect(last(conversation('conv-01').messages)).toMatchObject({ body: 'For buyer one', delivery: 'sending' })
    expect(draftText()).toBe('For buyer one')
  })
  it('内部备注只写本地记录，不改变外发消息或客服处理状态', async () => {
    const c = session.conversations[0]!, count = c.messages.filter(m => m.kind === 'outgoing').length
    await button('内部备注').trigger('click')
    await setRich('内部备注正文', '需要核对车辆年份')
    await button('添加备注').trigger('click')
    expect(c.messages[c.messages.length - 1]).toMatchObject({ kind: 'note', body: '需要核对车辆年份' })
    expect(c.messages.filter(m => m.kind === 'outgoing')).toHaveLength(count)
    expect(c.status).toBe('pending')
  })
  it('发送按快照归属，切到另一买家后完成不清除其他草稿', async () => {
    vi.useFakeTimers()
    const c1 = session.conversations[0]!, c2 = session.conversations[1]!
    await setRich('回复正文', 'Original response')
    await button('发送').trigger('click'); await nextTick()
    await nextTick()
    expect(c1.messages[c1.messages.length - 1]?.delivery).toBe('sending')
    await openBuyer('buyer_demo_02')
    await setRich('回复正文', 'Other buyer draft')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(c1.messages[c1.messages.length - 1]).toMatchObject({ delivery: 'success', body: 'Original response' })
    expect(c2.messages.some(m => m.body === 'Original response')).toBe(false)
    expect(session.drafts[draftKey(c2.id, 'reply')]?.body).toBe('Other buyer draft')
    expect(session.activeId).toBe(c2.id)
  })
  it('待核查消息阻止再次发送，仍允许保存草稿与内部备注', async () => {
    await openBuyer('buyer_demo_08')
    await setRich('回复正文', 'Do not send twice')
    expect(button('发送').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.reply-send-block').text()).toContain('待核查')
    expect(wrapper.findAll('button').some(b => b.text() === '重试')).toBe(false)
    await button('内部备注').trigger('click')
    await setRich('内部备注正文', '正在核查平台结果')
    expect(button('添加备注').attributes('disabled')).toBeUndefined()
  })
  it('草稿条件只有查询才应用，空结果不展示上一会话', async () => {
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue('buyer_demo_02')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(conversation('conv-02').messages.filter(m => m.kind === 'incoming').length)
    expect(wrapper.get('.mail-reader-header').text()).toContain('buyer_demo_02')
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue('no_matching_buyer')
    await button('查询').trigger('click')
    expect(wrapper.find('.mail-reader').exists()).toBe(false)
    expect(wrapper.text()).toContain('没有匹配的信件')
  })
  it('多笔已确认关联不默认取第一笔；缺失关联显示待核实', async () => {
    const c = session.conversations[0]!
    c.relatedOrderIds.push('order-04')
    await nextTick()
    expect(wrapper.get('.mail-context-summary').text()).toContain('多笔关联订单')
    expect(wrapper.get('.mail-context-summary').text()).not.toContain('售后 1')
    c.relatedOrderIds = ['missing-order']
    await nextTick()
    expect(wrapper.get('.mail-context-summary').text()).toContain('关联资料待核实')
  })
  it('重试明确失败消息成功后仅清空对应旧草稿，新草稿保持', async () => {
    confirmPrompts()
    vi.useFakeTimers()
    await openBuyer('buyer_demo_07')
    await checkLabel('回复买家并标注为已处理', false)
    await setRich('回复正文', 'New content must stay')
    await button('重试').trigger('click'); await flushPromises()
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    const c = session.conversations.find(c => c.id === 'conv-07')!
    expect(c.messages.find(m => m.id === 'msg-07-2')?.delivery).toBe('success')
    expect(c.messages.find(m => m.id === 'msg-07-2')?.markProcessedOnSuccess).toBeUndefined()
    expect(c.status).toBe('processed')
    expect(session.drafts[draftKey(c.id, 'reply')]?.body).toBe('New content must stay')
  })
  it('回复后标注已处理默认勾选，提交固定选项，之后修改偏好不改变本次发送', async () => {
    vi.useFakeTimers()
    expect(session.markProcessedOnSend).toBe(true)
    expect(wrapper.get('[aria-label="回复买家并标注为已处理"] input').element).toHaveProperty('checked', true)
    await setRich('回复正文', 'Confirm the original processing choice')
    await button('发送').trigger('click')
    expect(last(conversation('conv-01').messages)?.markProcessedOnSuccess).toBe(true)
    session.markProcessedOnSend = false; await nextTick()
    expect(wrapper.find('[data-title="确认回复"]').exists()).toBe(false)
    await nextTick()
    expect(last(conversation('conv-01').messages)?.markProcessedOnSuccess).toBe(true)
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(conversation('conv-01').status).toBe('processed')
    expect(session.markProcessedOnSend).toBe(false)
  })
  it.each([false, true])('跨会话发送成功沿用固定处理选项 %s，不读完成时的新偏好或清其他草稿', async choice => {
    vi.useFakeTimers()
    await checkLabel('回复买家并标注为已处理', choice)
    await setRich('回复正文', 'Reply from the original buyer')
    await button('发送').trigger('click')
    expect(last(conversation('conv-01').messages)?.markProcessedOnSuccess).toBe(choice)
    await nextTick()
    await openBuyer('buyer_demo_02')
    await checkLabel('回复买家并标注为已处理', !choice)
    await setRich('回复正文', 'The other buyer draft stays')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(conversation('conv-01').status).toBe(choice ? 'processed' : 'pending')
    expect(last(conversation('conv-01').messages)).toMatchObject({ delivery: 'success', markProcessedOnSuccess: choice })
    expect(session.activeId).toBe('conv-02')
    expect(session.drafts[draftKey('conv-02', 'reply')]?.body).toBe('The other buyer draft stays')
    expect(conversation('conv-02').status).toBe('pending')
  })
  it.each([false, true])('失败消息重试沿用原未勾选选项，匹配旧草稿 %s 不受现在勾选影响', async keepOldDraft => {
    confirmPrompts(); vi.useFakeTimers()
    const current = conversation('conv-01'); current.sendScenario = 'failed'
    await checkLabel('回复买家并标注为已处理', false)
    await send('Retry retains its original processing choice')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(current.messages)).toMatchObject({ delivery: 'failed', markProcessedOnSuccess: false })
    expect(current.status).toBe('pending')
    await checkLabel('回复买家并标注为已处理', true)
    if (!keepOldDraft) await setRich('回复正文', 'A fresh draft after failure')
    await button('重试').trigger('click'); await flushPromises()
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(current.messages)).toMatchObject({ delivery: 'success', markProcessedOnSuccess: false })
    expect(current.status).toBe('pending')
    expect(session.drafts[draftKey(current.id, 'reply')]?.body).toBe(keepOldDraft ? '' : 'A fresh draft after failure')
  })
  it('旧成功回执不覆盖发送中后续手工标注或取消忽略的状态及最近处理记录', async () => {
    confirmPrompts(); vi.useFakeTimers()
    const current = conversation('conv-01')
    await send('Submitted before manual processing')
    await processAction('标注已处理'); await processAction('标注待处理')
    const manualAt = current.lastHandledAt
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(current.messages)?.delivery).toBe('success')
    expect(current).toMatchObject({ status: 'pending', lastHandledAction: '标注待处理', lastHandledAt: manualAt })
    await send('Submitted before ignore and restore')
    await currentAction('忽略会话'); await currentAction('取消忽略')
    const restoredAt = current.lastHandledAt
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(current.messages)?.delivery).toBe('success')
    expect(current).toMatchObject({ status: 'pending', lastHandledAction: '取消忽略', lastHandledAt: restoredAt })
  })
  it('发送中改变处理筛选不会被自动下一封回执重置筛选或抢走当前会话', async () => {
    vi.useFakeTimers()
    await checkLabel('自动下一封')
    await send('Keep the chosen processing view')
    await listFilter('处理', '待处理')
    expect(session.activeId).toBe('conv-01')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeId).toBe('conv-01')
    expect(wrapper.get('.mail-processing-filters button[aria-pressed="true"]').text()).toBe('待处理')
    expect(wrapper.get('.mail-outside-note').text()).toContain('当前信件已不在筛选结果中')
  })
  it('自动下一封关闭时成功后保留当前会话；开启时只在成功后前进', async () => {
    vi.useFakeTimers()
    await send('First successful reply')
    await vi.advanceTimersByTimeAsync(950)
    expect(session.activeId).toBe('conv-01')
    expect(conversation('conv-01').status).toBe('processed')
    expect(session.drafts[draftKey('conv-01', 'reply')]?.body).toBe('')
    conversation('conv-01').status = 'pending'
    await checkLabel('自动下一封')
    await send('Second successful reply')
    expect(session.activeId).toBe('conv-01')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeId).toBe('conv-02')
    expect(conversation('conv-01')).toMatchObject({ lastHandledBy: '客服01', lastHandledAction: '回复成功', status: 'processed' })
  })
  it.each(['failed', 'unknown'] as const)('自动下一封在 %s 结果时保持原会话与草稿', async outcome => {
    vi.useFakeTimers()
    conversation('conv-01').sendScenario = outcome
    await checkLabel('自动下一封')
    await send('Keep the failed or unknown draft')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeId).toBe('conv-01')
    expect(conversation('conv-01').status).toBe('pending')
    expect(last(conversation('conv-01').messages)?.delivery).toBe(outcome)
    expect(last(conversation('conv-01').messages)?.markProcessedOnSuccess).toBe(true)
    expect(session.drafts[draftKey('conv-01', 'reply')]?.body).toBe('Keep the failed or unknown draft')
  })
  it('自动下一封跳过已处理、已忽略、发送中、待核查与不可回复会话', async () => {
    vi.useFakeTimers()
    conversation('conv-02').messages.push({ id: 'busy-next', kind: 'outgoing', sender: '客服01', body: 'Busy', at: conversation('conv-02').updatedAt, delivery: 'sending' })
    conversation('conv-04').status = 'ignored'
    conversation('conv-05').messages.push({ id: 'unknown-next', kind: 'outgoing', sender: '客服01', body: 'Unknown', at: conversation('conv-05').updatedAt, delivery: 'unknown' })
    conversation('conv-06').canReply = false
    await checkLabel('自动下一封')
    await send('Move only to an actionable conversation')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeId).toBe('conv-07')
  })
  it('发送中切到其他买家或消息来源，完成后不抢回焦点', async () => {
    vi.useFakeTimers()
    await checkLabel('自动下一封')
    await send('Snapshot one')
    await openBuyer('buyer_demo_05')
    await setRich('回复正文', 'Buyer five draft')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeId).toBe('conv-05')
    expect(draftText()).toBe('Buyer five draft')
    await send('Snapshot five')
    await openFolder('eBay消息')
    const noticeId = session.activeId
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(session.activeSource).toBe('ebay')
    expect(session.activeId).toBe(noticeId)
    expect(last(conversation('conv-05').messages)?.delivery).toBe('success')
  })
  it('发件箱保留各发送结果，完成后仍显示同一条外发消息，失败视图可再次定位', async () => {
    vi.useFakeTimers()
    await send('An outbox success')
    await openFolder('发件箱')
    const count = session.conversations.reduce((sum, c) => sum + c.messages.filter(m => m.kind === 'outgoing').length, 0)
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(count)
    expect(wrapper.findAll('.mail-list-row').some(row => row.text().includes('An outbox success'))).toBe(true)
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(count)
    expect(wrapper.findAll('.mail-list-row').find(row => row.text().includes('An outbox success'))!.text()).toContain('已发送')
    await openFolder('收件箱'); await openBuyer('buyer_demo_02')
    conversation('conv-02').sendScenario = 'failed'
    await send('An outbox failure'); await openFolder('发件箱')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(count + 1)
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(count + 1)
    await openFolder('发信失败')
    expect(wrapper.findAll('.mail-list-row').some(row => row.text().includes('buyer_demo_02'))).toBe(true)
  })
  it('分页支持20/50/100条，切页和修改条数清空勾选，草稿保留', async () => {
    const total = receivedCount('buyer')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
    await setRich('回复正文', 'Preserved across pagination')
    await checkBuyer('buyer_demo_01')
    expect(wrapper.get('.mail-selected-count').text()).toBe('1')
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(Math.min(20, total - 20))
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    expect(session.drafts[draftKey('conv-01', 'reply')]?.body).toBe('Preserved across pagination')
    await wrapper.get('select[aria-label="每页条数"]').setValue('50')
    expect(session.pageSize).toBe(50)
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(total)
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('1')
    await checkBuyer('buyer_demo_02')
    await wrapper.get('select[aria-label="每页条数"]').setValue('100')
    expect(session.pageSize).toBe(100)
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(total)
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    await wrapper.get('select[aria-label="每页条数"]').setValue('20')
    await wrapper.get('input[aria-label="跳转页码"]').setValue('1.9')
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('1')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
    await wrapper.get('input[aria-label="跳转页码"]').setValue('99')
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('2')
    await wrapper.get('button[aria-label="首页"]').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
  })
  it('指派客服与指派给我只改负责人，实际处理人及动作保持不变', async () => {
    const current = conversation('conv-01')
    current.lastHandledBy = '客服02'; current.lastHandledAction = '添加内部备注'
    const at = current.lastHandledAt
    await nextTick()
    await wrapper.get('.mail-ownership').findAll('button')[0]!.trigger('click')
    await selectValue('指派客服选择', '客服03')
    await button('确定指派').trigger('click')
    expect(current.assignee).toBe('客服03')
    expect(current).toMatchObject({ lastHandledBy: '客服02', lastHandledAction: '添加内部备注', lastHandledAt: at })
    expect(wrapper.get('.mail-last-handler').text()).toContain('客服02')
    await wrapper.get('button.mail-claim').trigger('click')
    expect(current.assignee).toBe('客服01')
    expect(current.lastHandledBy).toBe('客服02')
  })
  it('业务标签、优先级与星标分别修改，不改发送和处理状态', async () => {
    const current = conversation('conv-01'), messageCount = current.messages.length
    await wrapper.get('select[aria-label="当前会话优先级"]').setValue('urgent')
    await wrapper.get('button.mail-tag-editor').trigger('click')
    await checkBusinessTag('商品适配', false); await checkBusinessTag('退货退款', false); await checkBusinessTag('评价沟通', false)
    await checkBusinessTag('物流查询'); await checkBusinessTag('纠纷风险')
    await button('保存标签').trigger('click')
    expect(current.priority).toBe('urgent')
    expect(current.tags).toEqual(['logistics', 'dispute'])
    expect(wrapper.get('button.mail-tag-editor').text()).toContain('物流查询')
    expect(wrapper.get('button.mail-tag-editor').text()).toContain('纠纷风险')
    expect(wrapper.get('button.mail-tag-editor').attributes('title')).toBe('物流查询 / 纠纷风险')
    await wrapper.get('[aria-label="取消当前星标"]').trigger('click')
    expect(current.flagged).toBe(false)
    expect(current.priority).toBe('urgent')
    expect(current.status).toBe('pending')
    expect(current.messages).toHaveLength(messageCount)
  })
  it('批量回复逐条给出成功、失败、待核查与跳过结果，并保留各会话原草稿', async () => {
    vi.useFakeTimers()
    const first = conversation('conv-01'), second = conversation('conv-02'), failed = conversation('conv-07'), blocked = conversation('conv-08')
    second.sendScenario = 'unknown'
    session.drafts[draftKey(first.id, 'reply')] = { body: 'Personal draft must remain', attachments: [] }
    const blockedCount = blocked.messages.length
    for (const buyer of [first.buyerId, second.buyerId, failed.buyerId, blocked.buyerId]) await checkBuyer(buyer)
    await button('批量回复').trigger('click')
    await setRich('批量回复正文', 'Shared reply under review')
    await nextTick()
    expect(wrapper.get('[aria-label="批量回复资格统计"]').text()).toBe('可发送 3 · 排除 1')
    expect(wrapper.get('.mail-batch-review').text()).toContain('结果待核查，禁止重复发送')
    await button('批量发送').trigger('click')
    expect(button('完成').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="批量回复结果统计"]').text()).toBe('成功 0 · 失败 0 · 待核查 0 · 未发送 1 · 发送中 3')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(wrapper.get('[aria-label="批量回复结果统计"]').text()).toBe('成功 1 · 失败 1 · 待核查 1 · 未发送 1 · 发送中 0')
    expect(last(first.messages)).toMatchObject({ body: 'Shared reply under review', delivery: 'success' })
    expect(last(second.messages)?.delivery).toBe('unknown')
    expect(last(failed.messages)?.delivery).toBe('failed')
    expect(blocked.messages).toHaveLength(blockedCount)
    expect(wrapper.get('.mail-batch-review').text()).toContain('已发送')
    expect(wrapper.get('.mail-batch-review').text()).toContain('发信失败，可单条重试')
    expect(wrapper.get('.mail-batch-review').text()).toContain('发信失败 · 待核查')
    expect(wrapper.get('.mail-batch-review').text()).toContain('未发送：结果待核查')
    expect(session.drafts[draftKey(first.id, 'reply')]?.body).toBe('Personal draft must remain')
    expect(button('完成').attributes('disabled')).toBeUndefined()
  })
  it('批量忽略和恢复只改所选会话，不删除草稿或外发历史', async () => {
    const confirm = confirmPrompts(), first = conversation('conv-01'), second = conversation('conv-02')
    session.drafts[draftKey(first.id, 'reply')] = { body: 'Ignored but retained draft', attachments: [] }
    const firstMessageIds = first.messages.map(m => m.id)
    await checkBuyer(first.buyerId); await checkBuyer(second.buyerId)
    await batchCommand('ignored')
    expect(confirm).toHaveBeenCalled()
    expect(first.status).toBe('ignored'); expect(second.status).toBe('ignored')
    expect(first.lastHandledAction).toBe('忽略会话')
    expect(conversation('conv-05').status).toBe('pending')
    expect(first.messages.map(m => m.id)).toEqual(firstMessageIds)
    expect(session.drafts[draftKey(first.id, 'reply')]?.body).toBe('Ignored but retained draft')
    await openFolder('已忽略')
    await checkBuyer(first.buyerId); await checkBuyer(second.buyerId)
    await batchCommand('restore')
    expect(first.status).toBe('pending'); expect(second.status).toBe('pending')
    expect(first.lastHandledAction).toBe('取消忽略')
    expect(conversation('conv-14').status).toBe('ignored')
    expect(first.messages.map(m => m.id)).toEqual(firstMessageIds)
  })
  it('单条处理状态只展示反向标注操作，动作与最近处理对称，忽略必须独立取消', async () => {
    confirmPrompts()
    const current = conversation('conv-01')
    expect(wrapper.get('.mail-reader-identity .el-tag').text()).toBe('待处理')
    expect(wrapper.get('.mail-list-row.selected .mail-row-status').text()).toBe('待处理')
    expect(wrapper.get('.mail-reader-actions .mail-process-action').text()).toBe('标注已处理')
    expect(currentMenuItems().map(item => item.text()).filter(label => label.startsWith('标注'))).toEqual([])
    expect(wrapper.get('.mail-reader-actions').text()).not.toContain('转发')
    expect(currentMenuItems().map(item => item.text())).toContain('转发站内信')
    await processAction('标注已处理')
    expect(current).toMatchObject({ status: 'processed', lastHandledBy: '客服01', lastHandledAction: '标注已处理' })
    expect(wrapper.get('.mail-list-row.selected .mail-row-status').text()).toBe('已处理')
    expect(wrapper.get('.mail-last-handler').text()).toContain('标注已处理')
    expect(ElMessage.success).toHaveBeenLastCalledWith('已完成“标注已处理”')
    expect(wrapper.get('.mail-reader-actions .mail-process-action').text()).toBe('标注待处理')
    await processAction('标注待处理')
    expect(current).toMatchObject({ status: 'pending', lastHandledAction: '标注待处理' })
    expect(wrapper.get('.mail-list-row.selected .mail-row-status').text()).toBe('待处理')
    expect(wrapper.get('.mail-last-handler').text()).toContain('标注待处理')
    await currentAction('忽略会话')
    expect(current.status).toBe('ignored')
    expect(wrapper.get('.mail-list-row.selected .mail-row-status').text()).toBe('已忽略')
    expect(wrapper.find('.mail-reader-actions .mail-process-action').exists()).toBe(false)
    expect(currentMenuItems().map(item => item.text()).filter(label => label.startsWith('标注'))).toEqual([])
    expect(currentMenuItems().map(item => item.text())).toContain('取消忽略')
    await currentAction('取消忽略')
    expect(current).toMatchObject({ status: 'pending', lastHandledAction: '取消忽略' })
    expect(wrapper.get('.mail-last-handler').text()).toContain('取消忽略')
  })
  it('批量标注排除同状态及已忽略会话，重复操作不伪记最近处理，反向操作仍可执行', async () => {
    const confirm = confirmPrompts(), first = conversation('conv-01'), second = conversation('conv-02'), ignored = conversation('conv-04')
    second.status = 'processed'; second.lastHandledBy = '客服02'; second.lastHandledAction = '原处理记录'; second.lastHandledAt = '2026-10-27T08:00:00+08:00'
    ignored.status = 'ignored'; ignored.lastHandledAction = '原忽略记录'
    const unchanged = { by: second.lastHandledBy, at: second.lastHandledAt, action: second.lastHandledAction }
    await checkBuyer(first.buyerId); await checkBuyer(second.buyerId); await checkBuyer(ignored.buyerId)
    await batchCommand('processed')
    expect(last(confirm.mock.calls)?.[0]).toContain('标注已处理')
    expect(last(confirm.mock.calls)?.[0]).toContain('1 个已忽略会话')
    expect(last(confirm.mock.calls)?.[0]).toContain('1 个已处于“已处理”状态的会话')
    expect(first).toMatchObject({ status: 'processed', lastHandledAction: '标注已处理' })
    expect({ by: second.lastHandledBy, at: second.lastHandledAt, action: second.lastHandledAction }).toEqual(unchanged)
    expect(ignored).toMatchObject({ status: 'ignored', lastHandledAction: '原忽略记录' })
    const firstRecordedAt = first.lastHandledAt, count = confirm.mock.calls.length
    await checkBuyer(first.buyerId); await checkBuyer(second.buyerId); await checkBuyer(ignored.buyerId)
    await batchCommand('processed')
    expect(confirm).toHaveBeenCalledTimes(count)
    expect(first.lastHandledAt).toBe(firstRecordedAt)
    expect(ElMessage.info).toHaveBeenLastCalledWith(expect.stringContaining('无需执行“标注已处理”'))
    await batchCommand('pending')
    expect(first).toMatchObject({ status: 'pending', lastHandledAction: '标注待处理' })
    expect(second).toMatchObject({ status: 'pending', lastHandledAction: '标注待处理' })
    expect(ignored).toMatchObject({ status: 'ignored', lastHandledAction: '原忽略记录' })
  })
  it('只显示待处理文件夹按买家处理状态联动，当前目录保留且不改阅读及发信失败事实', async () => {
    session.conversations.forEach(c => { c.status = 'processed'; c.unread = false; c.messages.forEach(m => { if (m.kind === 'incoming') m.unread = false }) })
    const current = conversation('conv-01'), failed = conversation('conv-07')
    current.status = 'pending'; current.flagged = true
    const failedDelivery = failed.messages.find(m => m.delivery === 'failed')!
    failed.unread = true; failed.messages.forEach(m => { if (m.kind === 'incoming') m.unread = true })
    await nextTick()
    const visibleRows = wrapper.findAll('.mail-list-row').length
    await wrapper.get('[aria-label="只显示有待处理的文件夹"] input').setValue(true)
    expect(wrapper.get('[aria-label="只显示有待处理的文件夹"]').attributes('title')).toContain('只控制文件夹显示')
    expect(wrapper.find('[aria-label="文件夹：星标关注"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="文件夹：发信失败"]').exists()).toBe(false)
    await processAction('标注已处理')
    expect(wrapper.find('[aria-label="文件夹：收件箱"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="文件夹：星标关注"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="文件夹：发件箱"]').exists()).toBe(false)
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(visibleRows)
    expect(current.messages.filter(m => m.kind === 'incoming').every(m => !m.unread)).toBe(true)
    expect(failed.unread).toBe(true); expect(failedDelivery.delivery).toBe('failed')
    await processAction('标注待处理')
    expect(wrapper.find('[aria-label="文件夹：星标关注"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="文件夹：发件箱"]').exists()).toBe(true)
    expect(current.messages.filter(m => m.kind === 'incoming').every(m => !m.unread)).toBe(true)
  })
  it('星标跨来源批量忽略包含通知，已忽略恢复通知保留原文和不可回复状态', async () => {
    const confirm = confirmPrompts(), buyer = conversation('conv-01'), notice = conversation('notice-01')
    buyer.flagged = true; notice.flagged = true
    await openFolder('星标关注')
    const noticeMessages = notice.messages.map(m => ({ ...m }))
    await checkBuyer(buyer.buyerId)
    const noticeRow = wrapper.findAll('.mail-list-row').find(row => row.find(`.mail-row-content[aria-label="打开${notice.subject} eBay"]`).exists())!
    await noticeRow.get('input[type="checkbox"]').setValue(true)
    await batchCommand('ignored')
    const prompt = last(confirm.mock.calls)?.[0]
    expect(prompt).toContain('2 条记录（2 个会话）')
    expect(prompt).not.toContain('跳过')
    expect(buyer.status).toBe('ignored')
    expect(buyer.lastHandledAction).toBe('忽略会话')
    expect(notice.status).toBe('ignored')
    expect(notice.messages).toEqual(noticeMessages)
    expect(notice.canReply).toBe(false)
    expect(ElMessage.success).toHaveBeenLastCalledWith('已更新 2 个会话')
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    await openFolder('已忽略')
    await wrapper.get(`.mail-row-content[aria-label="打开${notice.subject} eBay"]`).trigger('click')
    expect(wrapper.find('.mail-composer').exists()).toBe(false)
    await button('取消忽略').trigger('click'); await nextTick()
    expect(notice.status).toBe('processed')
    expect(notice.lastHandledAction).toBe('取消忽略')
    expect(notice.canReply).toBe(false)
    await openFolder('eBay消息')
    expect(wrapper.findAll('.mail-row-subject').some(row => row.text() === notice.subject)).toBe(true)
  })
  it('混合来源批量处理状态仍只作用于买家，批量取消忽略按来源恢复', async () => {
    const confirm = confirmPrompts(), buyer = conversation('conv-01'), notice = conversation('notice-01')
    buyer.flagged = true; notice.flagged = true; buyer.status = 'processed'
    await openFolder('星标关注')
    await checkBuyer(buyer.buyerId)
    await wrapper.findAll('.mail-list-row').find(row => row.find(`.mail-row-content[aria-label="打开${notice.subject} eBay"]`).exists())!.get('input[type="checkbox"]').setValue(true)
    await batchCommand('pending')
    expect(last(confirm.mock.calls)?.[0]).toContain('仅更新 1 个买家会话，跳过 1 个 eBay 通知会话')
    expect(notice.status).toBe('processed')
    expect(buyer.status).toBe('pending')
    buyer.status = 'ignored'; notice.status = 'ignored'
    await openFolder('已忽略')
    await checkBuyer(buyer.buyerId)
    await wrapper.findAll('.mail-list-row').find(row => row.find(`.mail-row-content[aria-label="打开${notice.subject} eBay"]`).exists())!.get('input[type="checkbox"]').setValue(true)
    await batchCommand('restore')
    expect(buyer.status).toBe('pending')
    expect(notice.status).toBe('processed')
    expect(notice.lastHandledAction).toBe('取消忽略')
  })
  it('转发只预览来信和成功外发，排除内部备注、未发送内容和订单资料', async () => {
    const current = conversation('conv-01'), count = current.messages.length
    current.messages.push({ id: 'private-note', kind: 'note', sender: '客服02', body: 'PRIVATE internal content', at: current.updatedAt })
    current.messages.push({ id: 'unsent-failed', kind: 'outgoing', sender: '客服02', body: 'PRIVATE failed text', at: current.updatedAt, delivery: 'failed' })
    current.messages.push({ id: 'unsent-unknown', kind: 'outgoing', sender: '客服02', body: 'PRIVATE unknown text', at: current.updatedAt, delivery: 'unknown' })
    await nextTick(); await currentAction('转发站内信')
    expect(wrapper.find('[data-title="转发站内信"] .mail-demo-disclosure').exists()).toBe(false)
    const preview = wrapper.get('[data-title="转发站内信"] .mail-send-preview').text()
    expect(preview).toContain(current.messages[0]!.body)
    expect(preview).toContain('Could you share your vehicle model and year?')
    expect(preview).not.toContain('PRIVATE')
    expect(preview).not.toContain('DEMO-1001')
    await wrapper.get('input[aria-label="转发收件邮箱"]').setValue('invalid-address')
    await button('预览转发').trigger('click')
    expect(wrapper.get('[data-title="转发站内信"] .mail-error').text()).toContain('有效的收件邮箱')
    await wrapper.get('input[aria-label="转发收件邮箱"]').setValue('colleague@example.com')
    await wrapper.get('textarea[aria-label="转发附言"]').setValue('Please review the public conversation.')
    await button('预览转发').trigger('click')
    await button('确认转发').trigger('click')
    expect(current.messages).toHaveLength(count + 4)
    expect(last(current.messages)).toMatchObject({ kind: 'note', forwardedTo: 'colleague@example.com' })
    expect(current.lastHandledAction).toBe('转发')
    expect(current.status).toBe('pending')
  })
  it('通知所有标记已读覆盖查询结果其他分页，保留范围外通知和买家来信未读', async () => {
    const confirm = confirmPrompts()
    const template = conversation('notice-02')
    for (let i = 0; i < 23; i += 1) {
      session.conversations.push({ ...template, id: `notice-read-scope-${i}`, subject: `标读范围 ${i}`, unread: true, flagged: i === 0, messages: template.messages.map(m => ({ ...m, id: `scope-message-${i}`, unread: true })) })
    }
    await openFolder('eBay消息')
    await selectValue('站内信搜索字段', 'subject')
    await wrapper.get('input[aria-label="站内信搜索内容"]').setValue('标读范围')
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
    const scope = session.conversations.filter(c => c.subject.startsWith('标读范围'))
    const outside = conversation('notice-07'); outside.unread = true; outside.messages.forEach(m => { if (m.kind === 'incoming') m.unread = true })
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(3)
    scope.forEach(c => { c.unread = true; c.messages.forEach(m => { if (m.kind === 'incoming') m.unread = true }) }); await nextTick()
    await button('所有标记已读').trigger('click'); await flushPromises()
    expect(last(confirm.mock.calls)?.[0]).toContain('23 个 eBay 通知会话')
    expect(scope.every(c => !c.unread)).toBe(true)
    expect(outside.unread).toBe(true)
    expect(session.conversations.filter(c => c.source === 'buyer').some(c => c.unread)).toBe(true)
  })
  it('发送后切到内部备注继续编辑，成功回调不切换会话或清除备注草稿', async () => {
    vi.useFakeTimers()
    await checkLabel('自动下一封')
    await send('Reply before internal work')
    await button('内部备注').trigger('click')
    await setRich('内部备注正文', '正在补充给同事的核对信息')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-01').messages)?.delivery).toBe('success')
    expect(session.activeId).toBe('conv-01')
    expect(session.composeMode).toBe('note')
    expect(session.drafts[draftKey('conv-01', 'note')]?.body).toBe('正在补充给同事的核对信息')
  })
  it('发送后翻到其他分页，成功回调不重置页码或抢走当前会话', async () => {
    vi.useFakeTimers()
    await checkLabel('自动下一封')
    await send('Reply before browsing another page')
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('2')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-01').messages)?.delivery).toBe('success')
    expect(session.activeId).toBe('conv-01')
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('2')
  })
  it.each(['input', 'keydown'] as const)('发送后发生 %s 交互，即使仍在原会话也不自动下一封', async event => {
    vi.useFakeTimers()
    await checkLabel('自动下一封')
    await send('Reply before continued interaction')
    const editor = wrapper.get('textarea[aria-label="回复正文"]')
    if (event === 'input') await setRich('回复正文', 'New draft entered while sending')
    else await editor.trigger('keydown', { key: 'ArrowLeft' })
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-01').messages)?.delivery).toBe('success')
    expect(session.activeId).toBe('conv-01')
    if (event === 'input') expect(draftText()).toBe('New draft entered while sending')
  })
  it('发送中忽略会话，后续成功回执保留忽略状态', async () => {
    vi.useFakeTimers(); confirmPrompts()
    await checkLabel('自动下一封')
    await send('Reply already submitted before ignore')
    await button('忽略').trigger('click'); await flushPromises()
    expect(conversation('conv-01').status).toBe('ignored')
    expect(conversation('conv-01').lastHandledAction).toBe('忽略会话')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-01').messages)?.delivery).toBe('success')
    expect(conversation('conv-01').status).toBe('ignored')
    expect(session.activeId).toBe('conv-01')
  })
  it('排序回到首页并清除旧页勾选，之后的指派、标签和优先级不修改隐藏会话', async () => {
    const hidden = conversation('conv-28')
    hidden.priority = 'low'
    const original = { assignee: hidden.assignee, priority: hidden.priority, tags: [...(hidden.tags ?? [])] }
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    await checkBuyer(hidden.buyerId)
    expect(wrapper.get('.mail-selected-count').text()).toBe('1')
    await wrapper.get('select[aria-label="会话排序"]').setValue('priority')
    expect((wrapper.get('input[aria-label="跳转页码"]').element as HTMLInputElement).value).toBe('1')
    expect(wrapper.find(`.mail-row-content[role="button"][aria-label$=" ${hidden.buyerId}"]`).exists()).toBe(false)
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    expect(button('指派').attributes('disabled')).toBeDefined()
    expect(button('标签').attributes('disabled')).toBeDefined()
    await checkBuyer('buyer_demo_01'); await button('指派').trigger('click')
    expect(wrapper.get('[data-title="指派客服"]').text()).toContain('将 1 条记录指派给')
    await selectValue('指派客服选择', '客服03'); await button('确定指派').trigger('click')
    expect(conversation('conv-01').assignee).toBe('客服03')
    await checkBuyer('buyer_demo_01'); await button('标签').trigger('click')
    await checkBusinessTag('商品适配', false); await checkBusinessTag('退货退款', false); await checkBusinessTag('评价沟通', false)
    await checkBusinessTag('物流查询'); await button('保存标签').trigger('click')
    expect(conversation('conv-01').tags).toEqual(['logistics'])
    const priorities = wrapper.findAllComponents(ElDropdown).find(d => d.findAll('button').some(b => b.text().trim() === '优先级'))!
    priorities.vm.$emit('command', 'urgent'); await nextTick()
    expect(conversation('conv-01').priority).toBe('urgent')
    expect({ assignee: hidden.assignee, priority: hidden.priority, tags: hidden.tags }).toEqual(original)
  })
  it('列表内容变化剔除离开本页的勾选，批优先级更新使用操作前本页快照', async () => {
    await checkBuyer('buyer_demo_01')
    conversation('conv-01').updatedAt = '2020-01-01T00:00:00+08:00'
    conversation('conv-01').messages.filter(m => m.kind === 'incoming').forEach(m => { m.at = '2020-01-01T00:00:00+08:00' })
    await nextTick()
    expect(wrapper.find('.mail-row-content[role="button"][aria-label$=" buyer_demo_01"]').exists()).toBe(false)
    expect(wrapper.find('.mail-selected-count').exists()).toBe(false)
    await wrapper.get('select[aria-label="会话排序"]').setValue('priority')
    await checkBuyer('buyer_demo_02'); await checkBuyer('buyer_demo_08')
    const priorities = wrapper.findAllComponents(ElDropdown).find(d => d.findAll('button').some(b => b.text().trim() === '优先级'))!
    priorities.vm.$emit('command', 'low'); await nextTick()
    expect(conversation('conv-02').priority).toBe('low')
    expect(conversation('conv-08').priority).toBe('low')
    expect(conversation('conv-01').priority).toBe('normal')
  })
  it('批量回复选择模板需确认替换；取消保留原文，确认后才替换且不发送', async () => {
    const confirm = confirmPrompts().mockRejectedValueOnce('cancel')
    const messageCount = conversation('conv-01').messages.length
    await checkBuyer('buyer_demo_01'); await button('批量回复').trigger('click')
    const editor = wrapper.get('textarea[aria-label="批量回复正文"]')
    await setRich('批量回复正文', 'Original batch reply must stay')
    const template = replyTemplates[0]!
    await selectValue('批量回复模板', template.id); await flushPromises()
    expect(last(confirm.mock.calls)?.[0]).toContain('替换批量回复中已填写的正文')
    expect((editor.element as HTMLTextAreaElement).value).toBe('Original batch reply must stay')
    await selectValue('批量回复模板', template.id); await flushPromises()
    expect((editor.element as HTMLTextAreaElement).value).toBe(template.body)
    expect(conversation('conv-01').messages).toHaveLength(messageCount)
    expect(wrapper.find('.mail-batch-review').exists()).toBe(true)
  })

  it('三窗口支持七种非空组合，最后一窗不能隐藏，恢复对话保留草稿', async () => {
    const body = 'Draft survives all window combinations'
    await setRich('回复正文', body)
    const visited = new Set<string>()
    function layout(list: boolean, reader: boolean, context: boolean) {
      expect([session.listOpen, session.readerOpen, session.contextOpen]).toEqual([list, reader, context])
      expect(wrapper.find('.mail-inbox').exists()).toBe(list)
      expect(wrapper.find('.mail-folders').exists()).toBe(list)
      expect(wrapper.find('.mail-reader').exists()).toBe(reader)
      expect(wrapper.find('.mail-context').exists()).toBe(context)
      expect(session.drafts[draftKey('conv-01', 'reply')]?.body).toBe(body)
      visited.add(`${Number(list)}${Number(reader)}${Number(context)}`)
    }
    layout(true, true, false)
    await wrapper.get('[aria-label="显示资料栏"]').trigger('click'); layout(true, true, true)
    await wrapper.get('[aria-label="隐藏信件列表"]').trigger('click'); layout(false, true, true)
    await wrapper.get('[aria-label="隐藏对话区"]').trigger('click'); layout(false, false, true)
    expect(wrapper.get('[aria-label="隐藏资料栏"]').attributes('aria-disabled')).toBe('true')
    await wrapper.get('[aria-label="隐藏资料栏"]').trigger('click'); layout(false, false, true)
    await wrapper.get('[aria-label="显示信件列表"]').trigger('click'); layout(true, false, true)
    await wrapper.get('[aria-label="隐藏资料栏"]').trigger('click'); layout(true, false, false)
    expect(wrapper.get('[aria-label="隐藏信件列表"]').attributes('aria-disabled')).toBe('true')
    await wrapper.get('[aria-label="显示对话区"]').trigger('click'); layout(true, true, false)
    expect(draftText()).toBe(body)
    await wrapper.get('[aria-label="隐藏信件列表"]').trigger('click'); layout(false, true, false)
    expect(wrapper.get('[aria-label="隐藏对话区"]').attributes('aria-disabled')).toBe('true')
    await wrapper.get('[aria-label="隐藏对话区"]').trigger('click'); layout(false, true, false)
    expect(visited.size).toBe(7)
    expect(draftText()).toBe(body)
    await wrapper.get('[aria-label="显示资料栏"]').trigger('click')
    await wrapper.get('[aria-label="隐藏对话区"]').trigger('click'); layout(false, false, true)
    await wrapper.get('[aria-label="收起相关资料"]').trigger('click'); layout(false, true, false)
    expect(draftText()).toBe(body)
  })

  it('设置删除标签同时清理已应用筛选和未应用筛选值，不留下隐藏的失效ID', async () => {
    confirmPrompts()
    const saved = saveMailTag({ label: '临时筛选标签', color: '#409EFF' })
    if (!saved.ok) throw new Error(saved.error)
    const tagId = saved.tag.id, original = [...conversation('conv-01').tags!]
    conversation('conv-01').tags!.push(tagId)
    await nextTick()
    const filter = wrapper.findAllComponents(MultiFilter).find(item => item.props('placeholder') === '全部标签')!
    filter.vm.$emit('update:modelValue', [tagId]); await nextTick()
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(conversation('conv-01').messages.filter(m => m.kind === 'incoming').length)
    expect(wrapper.findAll('.mail-list-row').every(row => row.text().includes('buyer_demo_01'))).toBe(true)
    await button('站内信设置').trigger('click')
    await wrapper.get('[aria-label="删除标签 临时筛选标签"]').trigger('click'); await flushPromises()
    expect(mailTagDefinitions.some(tag => tag.id === tagId)).toBe(false)
    expect(conversation('conv-01').tags).toEqual(original)
    expect(filter.props('modelValue')).toEqual([])
    await wrapper.get('[data-title="站内信设置"] footer button').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
    await button('查询').trigger('click')
    expect(wrapper.findAll('.mail-list-row')).toHaveLength(20)
  })

  it('批量共享模板逐人解析买家与可靠订单，售前和候选订单跳过且不发送', async () => {
    vi.useFakeTimers()
    const buyers = ['conv-01', 'conv-02', 'conv-04', 'conv-05'].map(conversation)
    const counts = Object.fromEntries(buyers.map(c => [c.id, c.messages.length]))
    for (const buyer of buyers) await checkBuyer(buyer.buyerId)
    await button('批量回复').trigger('click')
    await selectValue('批量回复模板', 'template-order-followup')
    await nextTick()
    const rows = wrapper.findAll('.mail-batch-review > div')
    const preview = (buyerId: string) => rows.find(row => row.get('b').text() === buyerId)!
    expect(preview('buyer_demo_01').get('.mail-batch-body-preview').text()).toContain('Hello buyer_demo_01, thank you for contacting us about order DEMO-1001.')
    expect(preview('buyer_demo_02').get('.mail-batch-body-preview').text()).toContain('Hello buyer_demo_02, thank you for contacting us about order DEMO-1002.')
    expect(preview('buyer_demo_04').text()).toContain('待补齐关联资料：关联订单号')
    expect(preview('buyer_demo_05').text()).toContain('待补齐关联资料：关联订单号')
    await button('批量发送').trigger('click')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-01').messages)).toMatchObject({ delivery: 'success' })
    expect(last(conversation('conv-01').messages)!.body).toContain('order DEMO-1001')
    expect(last(conversation('conv-02').messages)!.body).toContain('buyer_demo_02')
    expect(last(conversation('conv-02').messages)!.body).toContain('order DEMO-1002')
    expect(conversation('conv-04').messages).toHaveLength(counts['conv-04']!)
    expect(conversation('conv-05').messages).toHaveLength(counts['conv-05']!)
    expect(wrapper.get('.mail-batch-review').text()).toContain('未发送：待补齐关联资料：关联订单号')
    expect(buyers.flatMap(c => c.messages).some(message => message.kind === 'outgoing' && /{{|}}/.test(message.body))).toBe(false)
  })

  it('批量编辑中管理页修改模板立即阻止发送，原窗重新采用后使用新版', async () => {
    vi.useFakeTimers(); confirmPrompts()
    const c = conversation('conv-01'), originalCount = c.messages.length
    await checkBuyer(c.buyerId); await button('批量回复').trigger('click')
    await selectValue('批量回复模板', 'template-order-followup')
    await nextTick()
    const template = templateSession.templates.find(item => item.id === 'template-order-followup')!
    saveTemplate({ ...template, body: 'Updated for {{buyerId}} / {{orderNo}}' }, template.id)
    await nextTick()
    expect(button('批量发送').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-title="批量回复站内信"]').text()).toContain('模板已变更或停用')
    await button('批量发送').trigger('click')
    expect(c.messages).toHaveLength(originalCount)
    const selector = wrapper.findAllComponents(ElSelect).find(item => item.props('ariaLabel') === '批量回复模板' || item.find('[aria-label="批量回复模板"]').exists())!
    expect(selector.props('modelValue')).toBe(template.id)
    await button('重新采用模板').trigger('click'); await flushPromises(); await nextTick()
    expect(selector.props('modelValue')).toBe(template.id)
    await nextTick()
    expect(wrapper.get('.mail-batch-body-preview').text()).toBe('Updated for buyer_demo_01 / DEMO-1001')
    await button('批量发送').trigger('click')
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(c.messages).toHaveLength(originalCount + 1)
    expect(last(c.messages)).toMatchObject({ body: 'Updated for buyer_demo_01 / DEMO-1001', delivery: 'success' })
  })

  it('旧标题不作为回复草稿，草稿箱只恢复有内容的内部备注', async () => {
    session.drafts[draftKey('conv-01', 'reply')]!.subject = 'Legacy subject-only draft'
    expect(wrapper.find('[aria-label="站内信标题"]').exists()).toBe(false)
    await button('内部备注').trigger('click'); await setRich('内部备注正文', 'Separate private note')
    await openFolder('草稿箱'); await openBuyer('buyer_demo_01')
    expect(session.composeMode).toBe('note')
    expect(session.drafts[draftKey('conv-01', 'note')]!.body).toBe('Separate private note')
    expect(wrapper.get('[aria-label="内部备注正文"]').text()).toBe('Separate private note')
  })

  it('完整模板转纯文本并保留附件，直接发送冻结内容且不清除在途新草稿', async () => {
    vi.useFakeTimers()
    const template = saveTemplate({ kind: 'message', title: '完整内容联动', subject: 'Order {{orderNo}}', body: 'Hello {{buyerId}}', bodyHtml: '<h2>Hello <strong>{{buyerId}}</strong></h2>', attachments: [{ id: 'complete-file', name: 'guide.pdf', type: 'application/pdf', size: 50 }], enabled: true }).template!
    const c = conversation('conv-01'), count = c.messages.length
    await button('常用回复').trigger('click'); await wrapper.get(`[data-template-id="${template.id}"]`).trigger('click'); await button('填入回复').trigger('click')
    const draft = session.drafts[draftKey(c.id, 'reply')]!
    expect(draft.subject).toBeUndefined(); expect(draft.bodyHtml).toBeUndefined(); expect(draft.body).toBe('Hello buyer_demo_01'); expect(draft.attachments).toHaveLength(1)
    draft.attachments[0]!.name = 'confirmed-guide.pdf'
    await button('发送').trigger('click')
    expect(wrapper.find('[data-title="确认回复"]').exists()).toBe(false)
    expect(c.messages).toHaveLength(count + 1)
    expect(last(c.messages)).toMatchObject({ body: 'Hello buyer_demo_01', attachments: [{ id: 'complete-file', name: 'confirmed-guide.pdf' }] })
    expect(last(c.messages)!.bodyHtml).toBeUndefined()
    expect(last(c.messages)!.subject).toBeUndefined()
    draft.attachments[0]!.name = 'edited-while-sending.pdf'
    await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(c.messages)!.attachments![0]!.name).toBe('confirmed-guide.pdf')
    expect(session.drafts[draftKey(c.id, 'reply')]!.attachments[0]!.name).toBe('edited-while-sending.pdf')
    expect(wrapper.find('.mail-message-subject').exists()).toBe(false)
    expect(wrapper.get(`[data-message-id="${last(c.messages)!.id}"] .mail-message-body`).text()).toContain('Hello buyer_demo_01')
  })

  it('批量完整模板逐订单解析平台商品与多包裹跟踪号，发送纯文本及附件', async () => {
    vi.useFakeTimers()
    const template = saveTemplate({ kind: 'message', title: '物流完整模板', subject: 'Order {{orderNo}}', body: '{{trackingNumber}}', bodyHtml: '<p><strong>{{trackingNumber}}</strong></p><p>{{platformProductName}} / {{platformSku}}</p>', attachments: [{ id: 'batch-file', name: 'tracking.pdf', size: 10, type: 'application/pdf' }], enabled: true }).template!
    await checkBuyer('buyer_demo_01'); await checkBuyer('buyer_demo_02'); await button('批量回复').trigger('click'); await selectValue('批量回复模板', template.id); await nextTick()
    const rows = wrapper.findAll('.mail-batch-review > div'), second = rows.find(row => row.get('b').text() === 'buyer_demo_02')!
    expect(second.get('.mail-batch-body-preview').text()).toContain('DEMO-TRACK-02A / DEMO-TRACK-02B')
    expect(second.find('.mail-batch-body-preview strong').exists()).toBe(false)
    expect(second.text()).toContain('Demo Exterior Door Handle / EBAY-DEMO-DH-02')
    expect(second.text()).not.toContain('Order DEMO-1002'); expect(second.text()).toContain('tracking.pdf')
    expect(wrapper.find('[aria-label="批量站内信标题"]').exists()).toBe(false)
    expect(wrapper.find('.mail-batch-variables input').exists()).toBe(false)
    await button('批量发送').trigger('click'); await vi.advanceTimersByTimeAsync(950); await nextTick()
    expect(last(conversation('conv-02').messages)).toMatchObject({ body: 'DEMO-TRACK-02A / DEMO-TRACK-02B\nDemo Exterior Door Handle / EBAY-DEMO-DH-02', attachments: [{ id: 'batch-file', name: 'tracking.pdf' }], delivery: 'success' })
    expect(last(conversation('conv-02').messages)!.bodyHtml).toBeUndefined()
    expect(last(conversation('conv-02').messages)!.subject).toBeUndefined()
    expect(last(conversation('conv-01').messages)!.attachments).not.toBe(last(conversation('conv-02').messages)!.attachments)
  })

  it('批量模板合并附件超限可移除已有附件后重新采用，不静默丢失原附件', async () => {
    confirmPrompts()
    const first = saveTemplate({ kind: 'message', title: '五附件模板', subject: 'First', body: 'First body', attachments: [1, 2, 3, 4, 5].map(i => ({ id: `first-${i}`, name: `first-${i}.pdf`, size: 10, type: 'application/pdf' })), enabled: true }).template!
    const second = saveTemplate({ kind: 'message', title: '新附件模板', subject: 'Second', body: 'Second body', attachments: [{ id: 'second', name: 'second.pdf', size: 10, type: 'application/pdf' }], enabled: true }).template!
    await checkBuyer('buyer_demo_01'); await button('批量回复').trigger('click'); await selectValue('批量回复模板', first.id)
    await selectValue('批量回复模板', second.id); await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith('无法采用模板：每次最多添加 5 个附件')
    expect(wrapper.find('[aria-label="移除批量附件 first-1.pdf"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="移除批量附件 second.pdf"]').exists()).toBe(false)
    await wrapper.get('[aria-label="移除批量附件 first-1.pdf"]').trigger('click')
    await selectValue('批量回复模板', second.id); await flushPromises(); await nextTick()
    const review = wrapper.get('.mail-batch-review').text()
    expect(review).toContain('second.pdf'); expect(review).toContain('first-2.pdf'); expect(review).toContain('first-3.pdf'); expect(review).not.toContain('first-1.pdf')
  })

  it.each(['failed', 'partial'] as const)('平台商品或可信物流缺失（%s）不从系统SKU或描述兜底，逐人预览阻断', async logisticsCase => {
    const order = session.orders.find(o => o.id === 'order-02')!
    order.platformProduct = undefined
    if (logisticsCase === 'failed') order.logistics.state = 'failed'
    else order.logistics.records[1]!.trackingNumber = undefined
    const template = saveTemplate({ kind: 'message', title: '严格来源', subject: 'Order {{orderNo}}', body: '{{trackingNumber}} / {{platformProductName}} / {{platformSku}}', enabled: true }).template!
    const count = conversation('conv-02').messages.length
    await checkBuyer('buyer_demo_02'); await button('批量回复').trigger('click'); await selectValue('批量回复模板', template.id); await nextTick()
    expect(wrapper.get('.mail-batch-review').text()).toContain('待补齐关联资料：跟踪号、平台商品名称、平台商品SKU')
    expect(wrapper.get('.mail-batch-body-preview').text()).not.toContain('DEMO-DH-02')
    expect(button('批量发送').attributes('disabled')).toBeDefined()
    expect(conversation('conv-02').messages).toHaveLength(count)
  })
})
