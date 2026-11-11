import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessage, ElSelect } from 'element-plus'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Page from './工单管理页面.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import { abandonTicket, actors, appendProgress, changeTicketPriority, createTicket, currentActor, disputeSample, finishTicket, ticketNotifications, tickets, type Ticket } from './会话'
import { restoreTicketTimes, serializeTicketTimes } from './时间存储'

const start = '/oms/ebay-service/tickets'
const shell = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /></section>' }
const demo = JSON.stringify(tickets.value)
const demoNotifications = JSON.stringify(ticketNotifications.value)
let router: Router
let wrapper: VueWrapper
let ticket: Ticket

const settle = async () => { await flushPromises(); await nextTick() }
function button(label: string) {
  const node = wrapper.findAll('button').find(item => item.text() === label)
  if (!node) throw Error('页面缺少按钮 ' + label)
  return node
}
async function chooseScope(scope: string) {
  const tabs = wrapper.get('[aria-label="工单范围"]').findAll('button')
  await tabs.find(tab => tab.text().startsWith(scope))!.trigger('click')
}
async function chooseActor(actor: string) {
  const input = wrapper.get('.actor-control').getComponent(ElSelect)
  input.vm.$emit('update:modelValue', actor)
  await settle()
}
beforeEach(async () => {
  tickets.value = []
  ticketNotifications.value = []
  currentActor.value = actors[0]!
  createTicket(disputeSample, { title: '向承运商索取签收凭证', description: '', owner: actors[0]!, nextAt: '', dueAt: '' })
  ticket = tickets.value[0]!
  router = createRouter({ history: createMemoryHistory(), routes: [
    { name: 'oms-tickets', path: start, component: Page },
    { name: 'oms-ebay-disputes', path: '/oms/ebay-service/disputes', component: { template: '<div>案件详情</div>' } },
  ] })
  await router.push(start)
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: shell } } })
  await settle()
  await chooseScope('我的待办')
  await button('重置').trigger('click')
})
afterEach(() => {
  wrapper.unmount()
  ElMessage.closeAll()
  tickets.value = JSON.parse(demo)
  ticketNotifications.value = JSON.parse(demoNotifications)
  currentActor.value = actors[0]!
})

describe('工单管理协作', () => {
  it('损坏时间显示待核实，合法 UTC 仍转北京，无效预约不命中日期快捷范围', async () => {
    const stored = serializeTicketTimes({ items: [ticket] })
    stored.items[0]!.createdAt = '2026-11-05T16:15:00Z'
    stored.items[0]!.nextAt = '2026-11-06 09:00'
    stored.items[0]!.dueAt = 'invalid'
    tickets.value = restoreTicketTimes(stored).items
    await settle()
    const groups = wrapper.get('[aria-label="待办时间分组"]')
    const choose = async (label: string) => { await groups.findAll('button').find(node => node.text().startsWith(label))!.trigger('click') }
    await choose('全部时间')
    expect(wrapper.get('[aria-label="工单列表"]').text()).toContain('时间待核实')
    expect(wrapper.get('[aria-label="工单列表"]').text()).not.toContain('已到跟进时间')
    expect(wrapper.get('[aria-label="工单列表"]').text()).not.toContain('完成已逾期')
    for (const label of ['待跟进', '完成逾期', '今天跟进', '后续待办', '待安排']) {
      await choose(label)
      expect(wrapper.findAll('.el-table__row')).toHaveLength(0)
    }
    await choose('全部时间')
    await wrapper.get('.number-link').trigger('click')
    await settle()
    expect(wrapper.get('[aria-label="工单内容"]').text()).toContain('2026-11-06 00:15')
    expect(wrapper.get('[aria-label="工单内容"]').text()).not.toContain('2026-11-05T16:15:00Z')
  })

  it('已放弃与已完成均置于完整筛选结果末尾，并按关闭时间排序且退出我的待办', async () => {
    const draft = { title: '待跟进事项', description: '', owner: currentActor.value, nextAt: '2099-01-01 09:00', dueAt: '' }
    for (let i = 0; i < 20; i++) createTicket(undefined, draft)
    const abandoned = createTicket(undefined, { ...draft, title: '重复核查不再办理', priority: '紧急' })!
    const completed = createTicket(undefined, { ...draft, title: '已交回核查结果' })!
    expect(abandonTicket(abandoned.id, '同一任务已由另一工单承接')).toBe('')
    expect(finishTicket(completed.id, '核查完成')).toBe('')
    abandoned.closedAt = '2026-11-05 09:00'
    completed.closedAt = '2026-11-05 10:00'
    await chooseScope('全部工单')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(20)
    expect(wrapper.findAll('.el-table__row').some(row => row.text().includes(abandoned.id))).toBe(false)
    await wrapper.get('.pagination .btn-next').trigger('click')
    await settle()
    const ids = wrapper.findAll('.el-table__row td:first-child .number-link').map(link => link.text())
    expect(ids).toEqual([ticket.id, completed.id, abandoned.id])
    expect(wrapper.text()).toContain('已放弃')
    await chooseScope('我的待办')
    expect(wrapper.text()).not.toContain('重复核查不再办理')
    expect(wrapper.text()).not.toContain('已交回核查结果')
  })

  it('优先级多选在查询后应用，重置后恢复包括缺值为普通的旧工单', async () => {
    delete ticket.priority
    createTicket(undefined, { title: '优先查仓', description: '', owner: currentActor.value, priority: '优先', nextAt: '', dueAt: '' })
    createTicket(undefined, { title: '紧急查仓', description: '', owner: currentActor.value, priority: '紧急', nextAt: '', dueAt: '' })
    await settle()
    const priorityFilter = wrapper.findAllComponents(MultiFilter).find(filter => filter.props('placeholder') === '优先级')!
    priorityFilter.vm.$emit('update:modelValue', ['优先', '紧急'])
    await settle()
    expect(wrapper.findAll('.el-table__row')).toHaveLength(3)
    await button('查询').trigger('click')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(2)
    expect(wrapper.get('[aria-label="工单列表"]').text()).not.toContain(ticket.title)
    await button('重置').trigger('click')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(3)
  })

  it('跟进到点与完成逾期独立筛选，同一工单可同时命中', async () => {
    const draft = { description: '', owner: currentActor.value, nextAt: '', dueAt: '' }
    createTicket(undefined, { ...draft, title: '仅跟进已到', nextAt: '2000-01-01 09:00' })
    createTicket(undefined, { ...draft, title: '仅完成已逾期', dueAt: '2000-01-01 10:00' })
    createTicket(undefined, { ...draft, title: '两项都已到', nextAt: '2000-01-01 09:00', dueAt: '2000-01-01 10:00' })
    await settle()
    const groups = wrapper.get('[aria-label="待办时间分组"]')
    const choose = async (label: string) => { await groups.findAll('button').find(node => node.text().startsWith(label))!.trigger('click') }
    await choose('待跟进')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(2)
    expect(wrapper.get('[aria-label="工单列表"]').text()).toContain('仅跟进已到')
    expect(wrapper.get('[aria-label="工单列表"]').text()).not.toContain('仅完成已逾期')
    await choose('完成逾期')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(2)
    expect(wrapper.get('[aria-label="工单列表"]').text()).toContain('仅完成已逾期')
    expect(wrapper.get('[aria-label="工单列表"]').text()).not.toContain('仅跟进已到')
  })

  it('优先级和清单操作不会覆盖最新业务进展，列表同时显示作者时间和清单进度', async () => {
    ticket.checklist = [{ id: 'one', text: '核对实收', done: true }, { id: 'two', text: '交回结果', done: false }]
    expect(appendProgress(ticket.id, '仓库反馈尚缺两件', '')).toBe('')
    const business = ticket.logs[ticket.logs.length - 1]!
    expect(changeTicketPriority(ticket.id, '紧急')).toBe('')
    await settle()
    expect(wrapper.get('.progress-content').text()).toBe('仓库反馈尚缺两件')
    expect(wrapper.get('.progress-meta').text()).toBe(business.actor + ' · ' + business.time)
    expect(wrapper.get('.checklist-progress').text()).toBe('待办 1 / 2')
  })

  it('工单提醒只展示当前身份，点击提醒标为已读并精确打开工单', async () => {
    const assigned = createTicket(undefined, { title: '请跟单员核查到货', description: '', owner: actors[1]!, nextAt: '', dueAt: '' })!
    await chooseActor(actors[1]!)
    await wrapper.get('[aria-label="工单提醒"]').trigger('click')
    await settle()
    const panel = document.body.querySelector('[aria-label="工单提醒列表"]')!
    expect(panel.textContent).toContain('收到新工单：请跟单员核查到货')
    const notice = ticketNotifications.value.find(item => item.ticketId === assigned.id && item.recipient === actors[1])!
    const link = [...panel.querySelectorAll('li button')].find(node => node.textContent?.includes(assigned.id)) as HTMLElement
    link.click()
    await settle()
    expect(ticketNotifications.value.find(item => item.id === notice.id)?.readAt).toBeTruthy()
    expect(router.currentRoute.value.query.ticketId).toBe(assigned.id)
  })

  it('整份结果先排未完成再分页，刚完成的紧急逾期单排在未定时间的待办之后', async () => {
    const draft = { title: '待跟进事项', description: '', owner: currentActor.value, nextAt: '2099-01-01 09:00', dueAt: '' }
    for (let i = 0; i < 20; i++) createTicket(undefined, draft)
    const urgent = createTicket(undefined, { ...draft, title: '刚结案的紧急工单', priority: '紧急', dueAt: '2000-01-01 10:00' })!
    await chooseScope('全部工单')
    const pageIds = () => wrapper.findAll('.el-table__row td:first-child .number-link').map(link => link.text())
    expect(pageIds()[0]).toBe(urgent.id)
    expect(finishTicket(urgent.id, '核查完成')).toBe('')
    await settle()
    expect(pageIds()).toHaveLength(20)
    expect(pageIds()).not.toContain(urgent.id)
    await wrapper.get('.pagination .btn-next').trigger('click')
    await settle()
    expect(pageIds()).toEqual([ticket.id, urgent.id])
  })

  it('优先与紧急工单在独立列展示，缺少优先级的旧工单显示普通', async () => {
    delete ticket.priority
    for (const priority of ['优先', '紧急'] as const) {
      createTicket(undefined, { title: '收件核查', description: '', owner: currentActor.value, priority, nextAt: '', dueAt: '' })
    }
    await settle()
    const table = wrapper.get('[aria-label="工单列表"]')
    const headers = table.findAll('th')
    const priorityColumn = headers.findIndex(header => header.text() === '优先级')
    expect(priorityColumn).toBeGreaterThan(0)
    const rows = table.findAll('.el-table__row')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const cells = row.findAll('td')
      const no = cells[0]!.get('.number-link').text()
      const record = tickets.value.find(item => item.id === no)!
      expect(cells[priorityColumn]!.text()).toBe(record.priority || '普通')
      expect(cells[0]!.find('.el-tag').exists()).toBe(false)
    }
  })

  it('本人记录后转交，由跟单员的我的待办继续办理并完成', async () => {
    await button(ticket.id).trigger('click')
    await settle()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('请填写')
    await wrapper.get('textarea[aria-label="跟进内容"]').setValue('已联系承运商，明天回访')
    await wrapper.get('form').trigger('submit')
    expect(ticket.status).toBe('处理中')
    await button('转交').trigger('click')
    const owner = wrapper.get('.operation').getComponent(ElSelect)
    owner.vm.$emit('update:modelValue', actors[1])
    await wrapper.get('textarea[aria-label="交接说明"]').setValue('请取回签收单')
    await wrapper.get('form').trigger('submit')
    expect(ticket.owner).toBe(actors[1])
    expect(wrapper.find('[aria-label="工单处理动作"]').exists()).toBe(false)
    await router.push(start)
    await settle()
    expect(wrapper.findAll('.el-table__row')).toHaveLength(0)
    await chooseActor(actors[1]!)
    await chooseScope('我的待办')
    await button(ticket.id).trigger('click')
    await settle()
    expect(wrapper.get('.history').text()).toContain('请取回签收单')
    await button('完成工单').trigger('click')
    await wrapper.get('textarea[aria-label="处理结果"]').setValue('已取回签收凭证')
    await wrapper.get('form').trigger('submit')
    expect(ticket.status).toBe('已完成')
    expect(wrapper.get('.result').text()).toContain('已取回签收凭证')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(0)
  })

  it('从筛选结果打开来源并返回，恢复已选范围和搜索，同时精确定位店铺及来源单号', async () => {
    createTicket({ ...disputeSample, id: 'OTHER-CASE' }, { title: '另外的核查事项', description: '', owner: actors[0]!, nextAt: '', dueAt: '' })
    await chooseScope('全部工单')
    await wrapper.get('input[aria-label="工单搜索内容"]').setValue('索取签收')
    await button('查询').trigger('click')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(1)
    await button(disputeSample.id).trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toMatchObject({ shopId: disputeSample.shopId, caseId: disputeSample.id })
    router.back()
    await settle()
    expect(wrapper.get('[aria-label="工单范围"] [aria-selected="true"]').text()).toContain('全部工单')
    expect(wrapper.findAll('.el-table__row')).toHaveLength(1)
    expect(wrapper.get('.el-table__row').text()).toContain(ticket.title)
  })
})
