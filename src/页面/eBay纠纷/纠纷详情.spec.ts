import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Detail from './纠纷详情.vue'
import { createDisputeData } from './数据'
import { disputeRecords } from './模型'
import { clearHandlingView, handlingView } from './办理会话'

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
const dialog = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot/><slot name="footer"/></section>' }
let wrapper: VueWrapper
function open(id: string) {
  const record = disputeRecords.value.find(row => row.id === id)!
  wrapper = mount(Detail, { props: { record }, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: dialog, ElTooltip: { inheritAttrs: false, template: '<slot />' } } } })
  return record
}
function button(text: string) {
  const match = wrapper.findAll('button').find(item => item.text().trim() === text)
  if (!match) throw new Error(`找不到按钮 ${text}`)
  return match
}
async function click(text: string) { await button(text).trigger('click'); await flushPromises() }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T07:00:00Z'))
  disputeRecords.value = createDisputeData()
})
afterEach(() => { wrapper?.unmount(); disputeRecords.value.forEach(clearHandlingView); ElMessage.closeAll(); vi.useRealTimers() })

describe('eBay 纠纷按对象办理', () => {
  it('未收到货请求的金额需要核对，退款受理后阻断再次提交，核查后才展示事实', async () => {
    const record = open('DEMO-INR-101')
    expect(wrapper.get('h1').text()).toBe('eBay纠纷详情')
    expect(wrapper.get('.status-summary').text()).toContain('2026-11-10')
    await click('全额退款')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('.action-form').text()).toContain('GBP 23.90')
    await click('确认内容')
    await click('确认申请全额退款')
    expect(wrapper.get('[role="alert"]').text()).toContain('核对金额')
    expect(record.pending).toBeNull()
    await wrapper.get('[role="dialog"] input[type=checkbox]').setValue(true)
    await click('确认申请全额退款')
    expect(record.pending?.action).toBe('REFUND')
    expect(wrapper.find('.action-list').exists()).toBe(false)
    await click('核查办理结果')
    expect(record.status).toBe('CLOSED')
    expect(wrapper.text()).toContain('已核实平台退款 GBP 23.90')
  })
  it('暂缓的 Case 只跟踪平台复核，关联未收到货请求保留同店身份', async () => {
    const record = open('DEMO-CASE-102')
    expect(wrapper.get('h1').text()).toBe('eBay纠纷详情')
    expect(wrapper.get('.dispute-work').text()).toContain('处理平台案件')
    expect(wrapper.get('.status-summary').text()).toContain('平台暂缓审阅至2026-11-09')
    expect(wrapper.find('.action-list').exists()).toBe(false)
    await click('DEMO-INR-102')
    expect(wrapper.emitted('open-record')).toEqual([['INR_REQUEST', 'DEMO-INR-102', record.shopId]])
  })
  it('已答复的 Payment dispute 可查看原答复、原因与单独的暂扣折算，无应答按钮', () => {
    open('DEMO-PD-103')
    expect(wrapper.get('h1').text()).toBe('eBay纠纷详情')
    expect(wrapper.get('.dispute-work').text()).toContain('处理支付争议')
    expect(wrapper.get('.response-detail').text()).toContain('具体选择待核实')
    expect(wrapper.find('.action-list').exists()).toBe(false)
    for (const value of ['GBP 20.00', 'GBP 16.72', 'USD 21.68', 'I did not make this purchase.', '商品与描述严重不符', '约 2–8 周']) expect(wrapper.text()).toContain(value)
  })
  it('严重不符的支付争议抗辩需完整的退回地址；付款机构的最终结果保持待确认', async () => {
    const record = open('DEMO-PD-104')
    await click('准备证据')
    const picker = wrapper.get('input[aria-label="选择举证图片"]')
    Object.defineProperty(picker.element, 'files', { configurable: true, value: [new File(['image'], 'item.png', { type: 'image/png' })] })
    await picker.trigger('change')
    await click('归集证据')
    expect(record.payment!.evidence[0]?.fileId).toBeTruthy()
    expect(record.payment!.response).toBe('')
    await click('继续抗辩')
    await wrapper.get('textarea[aria-label="证据说明"]').setValue('订单留有与刊登一致的交付证明。')
    await click('确认内容')
    expect(wrapper.get('[role="alert"]').text()).toContain('补全退回地址')
    for (const [label, value] of Object.entries({ 收件人: 'Service Desk', 联系电话: '07123456789', 街道地址: 'Demo House', 城市: 'London', 邮编: 'W1A 1AA', 国家: 'GB' })) await wrapper.get(`input[aria-label="${label}"]`).setValue(value)
    await click('确认内容')
    expect(record.pending).toBeNull()
    expect(wrapper.get('[role="dialog"]').text()).toContain('Service Desk')
    await click('确认正式抗辩')
    expect(record.pending?.action).toBe('CONTEST')
    await click('核查办理结果')
    expect(record.payment?.response).toBe('抗辩')
    expect(record.payment?.outcome).toBe('')
    expect(record.payment?.liability).toBeNull()
    expect(wrapper.find('.action-list').exists()).toBe(false)
  })
  it('某笔支付争议只返回接受时，隐藏索回、抗辩和证据操作', () => {
    open('DEMO-PD-105')
    expect(wrapper.get('.action-list').findAll('button').map(item => item.text())).toEqual(['接受争议'])
  })
  it('接受弹窗打开后平台版本变化，阻止按旧版本提交', async () => {
    const row = open('DEMO-PD-105')
    await click('接受争议')
    const localRevision = row.revision
    row.payment!.platformRevision = 3
    await flushPromises()
    expect(button('确认内容').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('平台版本')
    expect(row.pending).toBeNull()
    expect(row.revision).toBe(localRevision)
  })
  it('有资格的案件以新事实申诉，回查仅确认申诉受理', async () => {
    const record = open('DEMO-CASE-111')
    const original = record.caseInfo?.decision
    await click('办理申诉')
    expect(wrapper.find('input[type=file]').exists()).toBe(false)
    await click('确认内容')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('textarea[aria-label="新证据说明"]').setValue('已取得原裁决前的承运商签收明细，邮编与订单一致。')
    await click('确认内容')
    expect(wrapper.get('[role="dialog"]').text()).toContain('邮编与订单一致')
    await click('确认提交申诉')
    expect(record.pending?.action).toBe('APPEAL')
    await click('核查办理结果')
    expect(record.caseInfo?.decision).toBe(original)
    expect(record.caseInfo?.appeal).toContain('等待 eBay 复核')
    expect(wrapper.find('.action-list').exists()).toBe(false)
  })
  it('请求内留言在当前页填写，跨页签回来可以继续，关闭办理会清空当前草稿', async () => {
    const row = open('DEMO-INR-101')
    await click('给买家留言')
    await wrapper.get('textarea[aria-label="给买家的留言"]').setValue('我会核查这一单的物流。')
    wrapper.unmount()
    open('DEMO-INR-101')
    expect(wrapper.get('textarea[aria-label="给买家的留言"]').element).toHaveProperty('value', '我会核查这一单的物流。')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await click('发送请求内留言')
    expect(row.history[row.history.length - 1]!.detail).toBe('我会核查这一单的物流。')
    expect(handlingView(row).drafts.MESSAGE).toBeUndefined()
  })
  it('取用原单跟踪只回填表单，复选同号保留已核对的承运商', async () => {
    const row = open('DEMO-INR-101')
    await click('更新跟踪')
    await wrapper.get('input[aria-label="包裹 1 跟踪号"]').setValue('')
    await wrapper.get('input[aria-label="包裹 1 承运商"]').setValue('已核对的承运商')
    const before = row.history.length
    await click('选择原单跟踪')
    await wrapper.get('button[aria-label="选用 DEMO-GB-TRK-101"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('input[aria-label="包裹 1 跟踪号"]').element).toHaveProperty('value', 'DEMO-GB-TRK-101')
    expect(wrapper.get('input[aria-label="包裹 1 承运商"]').element).toHaveProperty('value', '已核对的承运商')
    await click('选择原单跟踪')
    await wrapper.get('button[aria-label="选用 DEMO-GB-TRK-101"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('input[aria-label$=" 跟踪号"]')).toHaveLength(1)
    expect(row.history).toHaveLength(before)
    await click('提交跟踪信息')
    expect(row.history).toHaveLength(before + 1)
  })
  it('暂离已准备确认的金额操作后，回到原案仍须使用初次核对的平台版本', async () => {
    const row = open('DEMO-PD-105')
    await click('接受争议')
    await click('确认内容')
    expect(wrapper.get('[role="dialog"]').text()).toContain('GBP 17.60')
    wrapper.unmount()
    row.payment!.platformRevision = 9
    open('DEMO-PD-105')
    expect(button('确认接受争议').attributes('disabled')).toBeDefined()
    expect(row.pending).toBeNull()
    await click('返回修改')
    expect(wrapper.get('.action-form [role="alert"]').text()).toContain('平台版本')
  })
  it('切往关联资料期间争议已答复，回来直接交接付款机构，撤销旧表单与确认快照', async () => {
    const row = open('DEMO-PD-105')
    await click('接受争议')
    await click('确认内容')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
    Object.assign(row, { status: 'OPEN', owner: '付款机构', progress: '平台已确认卖家答复', nextStep: '等待付款机构裁决' })
    row.payment!.response = '已抗辩'
    open('DEMO-PD-105')
    const work = wrapper.get('.dispute-work')
    expect(work.find('.action-form').exists()).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(work.get('.receipt').text()).toContain('等待付款机构裁决')
    expect(handlingView(row).drafts.ACCEPT).toBeUndefined()
    expect(row.pending).toBeNull()
  })
})
