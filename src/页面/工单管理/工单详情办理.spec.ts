import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Detail from './工单详情.vue'
import { actors, createTicket, currentActor, tickets, transferTicket, type Ticket } from './会话'
import { clearFollowupDraft, ticketDraftKey } from './跟进草稿'
import { readFile, storeFiles } from './附件存储'
vi.mock('./附件存储', async original => ({ ...await original<typeof import('./附件存储')>(), storeFiles: vi.fn(), readFile: vi.fn() }))
let wrapper: VueWrapper
let ticket: Ticket
const original = JSON.stringify(tickets.value)
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  wrapper = mount(Detail, { props: { ticket }, global: { plugins: [router], directives: { prototype: {} } } })
  await flushPromises()
}
async function action(label: string) { await wrapper.findAll('button').find(item => item.text() === label)!.trigger('click') }
beforeEach(async () => {
  tickets.value = []; currentActor.value = actors[0]!
  for (const actor of actors) clearFollowupDraft('GD-1001', actor)
  vi.mocked(storeFiles).mockResolvedValue(undefined)
  vi.mocked(readFile).mockResolvedValue(new Blob(['file'], { type: 'text/plain' }))
  createTicket(undefined, { title: '核查退件', description: '', owner: actors[0]!, nextAt: '', dueAt: '' })!
  ticket = tickets.value[0]!
  await render()
})
afterEach(() => { wrapper.unmount(); ElMessage.closeAll(); tickets.value = JSON.parse(original); currentActor.value = actors[0]! })
describe('工单详情办理闭环', () => {
  it('放弃原因必填，保留原因并可有原因重新打开', async () => {
    await action('放弃工单'); await wrapper.get('form').trigger('submit')
    expect(ticket.status).toBe('待处理')
    await wrapper.get('[aria-label="放弃原因"]').setValue('买家已自行找到包裹，无需继续核查')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(ticket.status).toBe('已放弃')
    expect(wrapper.get('.result').text()).toContain('无需继续核查')
    await wrapper.get('[aria-label="重新打开原因"]').setValue('买家补充说明找错了包裹')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(ticket.status).toBe('处理中')
    expect(wrapper.get('.history').text()).toContain('无需继续核查')
    expect(wrapper.get('.history').text()).toContain('买家补充说明')
  })
  it('清单未完时说明原因才允许完成，保留实际未勾状态', async () => {
    ticket.checklist = [{ id: 'remaining', text: '索取签收照片', done: false }]
    await action('完成工单')
    await wrapper.get('[aria-label="处理结果"]').setValue('已通过电话核实签收')
    await wrapper.get('form').trigger('submit')
    expect(ticket.status).toBe('待处理')
    expect(wrapper.get('[role="alert"]').text()).toContain('原因')
    await wrapper.get('[aria-label="未完成事项说明"]').setValue('电话核实足够，无需照片')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(ticket.status).toBe('已完成')
    expect(ticket.result).toContain('电话核实足够')
    expect(ticket.checklist[0]!.done).toBe(false)
  })
  it('转交后发起人能内部补充，不开放对方的清单和结束操作', async () => {
    transferTicket(ticket.id, actors[1]!, '请核实')
    await flushPromises()
    expect(wrapper.find('[aria-label="工单处理动作"]').exists()).toBe(false)
    await wrapper.get('[aria-label="内部补充内容"]').setValue('买家补充：纸箱外包装完好')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(ticket.owner).toBe(actors[1])
    expect(ticket.logs[ticket.logs.length - 1]?.action).toBe('内部补充')
    expect(wrapper.get('.history').text()).toContain('纸箱外包装完好')
  })
  it('关闭详情后恢复文字、清单及附件草稿，另一身份不会读到草稿', async () => {
    await wrapper.get('[aria-label="跟进内容"]').setValue('正在核对数量，请保留此草稿')
    await wrapper.get('.checklist-add').trigger('click')
    await wrapper.get('.checklist-text').setValue('核对实收照片')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['demo'], '材料.txt', { type: 'text/plain' })] })
    await input.trigger('change')
    wrapper.unmount(); await flushPromises(); await render()
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="跟进内容"]').element.value).toContain('保留此草稿')
    expect(wrapper.get<HTMLInputElement>('.checklist-text').element.value).toBe('核对实收照片')
    expect(wrapper.get('.pending-files').text()).toContain('材料.txt')
    wrapper.unmount(); currentActor.value = actors[1]!; ticket.owner = actors[1]!; await render()
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="跟进内容"]').element.value).toBe('')
    expect(wrapper.find('.pending-files').exists()).toBe(false)
  })
  it('完成再重新打开后，另一动作未提交的跟进及附件仍保留', async () => {
    await wrapper.get('[aria-label="跟进内容"]').setValue('尚未提交的仓库说明')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['demo'], '未提交材料.txt', { type: 'text/plain' })] })
    await input.trigger('change')
    await action('完成工单')
    await wrapper.get('[aria-label="处理结果"]').setValue('先按现有资料完成核对')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    await wrapper.get('[aria-label="重新打开原因"]').setValue('补充原先未提交的核查材料')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="跟进内容"]').element.value).toBe('尚未提交的仓库说明')
    expect(wrapper.get('.pending-files').text()).toContain('未提交材料.txt')
  })
  it('附件尚在恢复时关闭详情，恢复结束仍将期间编辑保存到草稿', async () => {
    wrapper.unmount(); await flushPromises()
    clearFollowupDraft(ticket.id, actors[0]!)
    sessionStorage.setItem(ticketDraftKey(ticket.id, actors[0]!), JSON.stringify({ note: '旧草稿', attachments: [{ id: 'slow', name: '慢恢复.txt', type: 'text/plain', size: 4 }] }))
    let release: ((blob: Blob) => void) | undefined
    vi.mocked(readFile).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    await render()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="跟进内容"]').setValue('恢复期间新写的草稿')
    wrapper.unmount()
    release!(new Blob(['demo'], { type: 'text/plain' }))
    await flushPromises(); await flushPromises()
    const saved = JSON.parse(sessionStorage.getItem(ticketDraftKey(ticket.id, actors[0]!))!)
    expect(saved.note).toBe('恢复期间新写的草稿')
    expect(saved.attachments[0].id).toBe('slow')
  })
})
