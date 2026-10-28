import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import OutboundPage from './三方仓出库单页面.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import { 仓库会话单据, 创建仓库执行投影 } from './仓配会话'
import { 取得出库详情 } from './三方仓出库模型'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本, 当前版本, 执行演示推单 } from '../订单处理/演示会话'

const 页面路径 = '/oms/warehouse-delivery/outbound-orders'
const 初始 = JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, rows: 仓库会话单据.value })
let wrapper: VueWrapper | undefined
const 弹层桩 = { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue" class="测试弹窗" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>' }

function 恢复数据() {
  const data = JSON.parse(初始)
  共享订单.value = data.orders; 仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions; 仓库会话单据.value = data.rows
}
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 注入旧执行(...numbers: string[]) {
  const rows = numbers.map(number => {
    const execution = 仓库执行记录.value.find(item => item.出库单号 === `OUT-DEMO-ACTION-${number}`)
    if (!execution) throw new Error(`未找到专项执行样例：${number}`)
    return 创建仓库执行投影(execution)
  })
  仓库会话单据.value.push(...rows)
  await 稳定()
}
async function 打开(query: Record<string, string> = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: 页面路径, component: OutboundPage }, { path: '/oms/self-fulfillment/processing', component: { template: '<div />' } }, { path: '/oms/self-fulfillment/shipping-confirmation', component: { template: '<div />' } }, { path: '/oms/all-orders/:systemOrderNo', name: 'oms-all-order-detail', component: { template: '<div />' } }] })
  await router.push({ path: 页面路径, query }); await router.isReady()
  wrapper = mount(OutboundPage, { attachTo: document.body, global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDialog: 弹层桩, ElDrawer: 弹层桩, ElTooltip: { template: '<span><slot /></span>' } } } })
  await 稳定()
  return wrapper
}
function 按钮(root: { findAll(selector: string): DOMWrapper<Element>[] }, name: string) {
  const button = root.findAll('button').find(item => item.text() === name)
  if (!button) throw new Error(`未找到按钮：${name}`)
  return button
}
function 主行(page: VueWrapper) { return page.get('.出库表格').findAll('tbody tr.el-table__row') }
function 指定行(page: VueWrapper, no: string) {
  const row = 主行(page).find(item => item.text().includes(no))
  if (!row) throw new Error(`未找到出库单：${no}`)
  return row
}
function 弹窗(page: VueWrapper, title: string) { return page.get(`[data-title="${title}"]`) }
async function 搜索(page: VueWrapper, field: string, keyword: string) {
  const search = page.getComponent(FieldSearch)
  search.vm.$emit('update:field', field); search.vm.$emit('update:mode', 'exact'); search.vm.$emit('update:modelValue', keyword)
  await 稳定(); await 按钮(page.get('.出库筛选'), '搜索').trigger('click'); await 稳定()
}
function 单(编号: string) { return 共享订单.value.find(order => order.systemOrderNo === `OMS-DEMO-ACTION-${编号}`)! }
function 仓单(编号: string) { return 仓库会话单据.value.find(row => row.no === `OUT-DEMO-ACTION-${编号}`)! }
function 禁用(button: DOMWrapper<Element>) { return (button.element as HTMLButtonElement).disabled }
async function 读取下载(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob) })
}

beforeEach(async () => {
  恢复数据(); await 稳定()
  const OriginalURL = URL
  vi.stubGlobal('URL', class extends OriginalURL { static createObjectURL = vi.fn(() => 'blob:outbound-test'); static revokeObjectURL = vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(async () => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; 恢复数据(); await 稳定(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('三方仓出库单的订单同源及操作交互', () => {
  it('正常默认工作台含14条完整CK样例及4条详情演示仓单，翻页覆盖全部，旧执行保留但查不到旧OUT评审投影', async () => {
    const page = await 打开()
    expect(仓库会话单据.value).toHaveLength(18)
    expect(仓库执行记录.value.some(execution => execution.出库单号 === 'OUT-DEMO-ACTION-12')).toBe(true)
    expect(page.get('.出库分页').text()).toContain('共 18 单')
    const numbers = 主行(page).map(row => row.get('.单号').text())
    expect(numbers).toHaveLength(10)
    await page.get('.出库分页 .btn-next').trigger('click'); await 稳定()
    numbers.push(...主行(page).map(row => row.get('.单号').text()))
    expect(numbers).toHaveLength(18)
    expect(new Set(numbers).size).toBe(18)
    expect(numbers.filter(no => /^CK261010\d{4}$/.test(no))).toHaveLength(14)
    expect(numbers.filter(no => no.startsWith('CK-DEMO-DETAIL-'))).toHaveLength(4)
    await 搜索(page, 'no', 'OUT-DEMO-ACTION-12')
    expect(主行(page)).toHaveLength(0)
    expect(page.get('.出库分页').text()).toContain('共 0 单')
    expect(仓库会话单据.value).toHaveLength(18)
  })

  it('重新推单只在全部和下单失败页签显示，截单仅在适用页签显示', async () => {
    const page = await 打开()
    for (const state of ['全部', '下单中', '待出库', '已出库', '下单失败', '出库异常', '取消中', '已取消']) {
      const tab = page.get('.出库状态栏').findAll('button').find(button => button.text().startsWith(state))!
      await tab.trigger('click'); await 稳定()
      const tools = page.get('.出库工具栏').findAll('button').map(button => button.text())
      expect(tools.includes('重新推单')).toBe(['全部', '下单失败'].includes(state))
      expect(tools.includes('批量截单')).toBe(['全部', '待出库', '出库异常'].includes(state))
    }
  })

  it('截单须原因及全部来源确认，受理保持取消中，同步成功仍保留OMS原阶段', async () => {
    await 注入旧执行('12')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-12' })
    const row = 仓单('12'), id = row.id, count = 仓库会话单据.value.length
    await 按钮(指定行(page, row.no), '截单').trigger('click'); await 稳定()
    const confirmation = 弹窗(page, '截单 · 执行确认')
    expect(confirmation.text()).toContain('OMS-DEMO-ACTION-12')
    expect(confirmation.text()).toContain('DEMO-ACTION-12')
    expect(confirmation.text()).toContain('汽配操作评审店')
    expect(禁用(按钮(confirmation, '确认截单'))).toBe(true)
    await confirmation.get('input[type="checkbox"]').setValue(true); await 稳定()
    await 按钮(confirmation, '确认截单').trigger('click'); await 稳定()
    expect(row.status).toBe('待出库'); expect(page.find('[data-title="截单 · 执行确认"]').exists()).toBe(true)
    await confirmation.get('#outbound-cancel-note').setValue('业务确认需要停止原仓库发货')
    await 按钮(confirmation, '确认截单').trigger('click'); await 稳定()
    expect(row).toMatchObject({ id, status: '取消中', awaitingCheck: true, shipped: 0 })
    expect(单('12').processingStatus).toBe('待发货'); expect(仓库会话单据.value).toHaveLength(count)
    expect(row.attempts[0]!.action).toBe('截单')
    expect(row.history[0]!.title).toContain('截单')
    expect(指定行(page, row.no).findAll('button').some(button => button.text() === '截单')).toBe(false)
    await 按钮(弹窗(page, '出库单处理结果'), '完成').trigger('click'); await 稳定()
    await 按钮(指定行(page, row.no), '同步仓库状态').trigger('click'); await 稳定()
    await 按钮(弹窗(page, '同步仓库状态 · 执行确认'), '确认同步仓库状态').trigger('click'); await 稳定()
    expect(row.status).toBe('已取消'); expect(row.awaitingCheck).toBe(false)
    expect(单('12').processingStatus).toBe('待发货')
  })

  it('共享仓单单个截单展示全部来源，工具栏选一单仍按批量跳过共享范围', async () => {
    await 注入旧执行('SHARED')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-SHARED' })
    const row = 仓库会话单据.value.find(item => item.no === 'OUT-DEMO-ACTION-SHARED')!
    await 指定行(page, row.no).get('input[type="checkbox"]').setValue(true); await 稳定()
    await 按钮(page.get('.出库工具栏'), '批量截单').trigger('click'); await 稳定()
    const batch = 弹窗(page, '截单 · 执行确认')
    expect(batch.text()).toContain('OMS-DEMO-ACTION-33'); expect(batch.text()).toContain('OMS-DEMO-ACTION-34')
    expect(batch.text()).toContain('批量')
    expect(禁用(按钮(batch, '确认截单'))).toBe(true)
    await 按钮(batch, '取消').trigger('click'); await 稳定()
    await 按钮(指定行(page, row.no), '截单').trigger('click'); await 稳定()
    const single = 弹窗(page, '截单 · 执行确认')
    expect(single.text()).toContain('OMS-DEMO-ACTION-33'); expect(single.text()).toContain('OMS-DEMO-ACTION-34')
    await single.get('#outbound-cancel-note').setValue('核对两张来源订单后，整张仓单申请截单')
    await single.get('input[type="checkbox"]').setValue(true); await 稳定()
    expect(禁用(按钮(single, '确认截单'))).toBe(false)
    await 按钮(single, '确认截单').trigger('click'); await 稳定()
    expect(row.status).toBe('取消中')
    expect(单('33').processingStatus).toBe('待发货'); expect(单('34').processingStatus).toBe('待发货')
  })

  it('截单预检后任一来源版本变化不发申请，部分出库和能力不足行不可截单', async () => {
    await 注入旧执行('12', '15', '29')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-12' })
    const row = 仓单('12')
    await 按钮(指定行(page, row.no), '截单').trigger('click'); await 稳定()
    const confirmation = 弹窗(page, '截单 · 执行确认')
    await confirmation.get('#outbound-cancel-note').setValue('提交前核对过来源范围')
    await confirmation.get('input[type="checkbox"]').setValue(true); await 稳定()
    订单版本.value[单('12').systemOrderNo] = 当前版本(单('12').systemOrderNo) + 1
    await 按钮(confirmation, '确认截单').trigger('click'); await 稳定()
    expect(弹窗(page, '出库单处理结果').text()).toContain('已变化')
    expect(row.status).toBe('待出库'); expect(row.attempts.some(attempt => attempt.action === '截单')).toBe(false)
    await 按钮(弹窗(page, '出库单处理结果'), '完成').trigger('click'); await 稳定()
    for (const no of ['OUT-DEMO-ACTION-15', 'OUT-DEMO-ACTION-29']) {
      await 搜索(page, 'no', no)
      expect(禁用(按钮(指定行(page, no), '截单'))).toBe(true)
    }
  })

  it('订单处理推单形成一张出库单，履约深链能查询同一身份，受理不伪造已出库', async () => {
    const originalCount = 仓库会话单据.value.length
    const order = 单('07'), fulfillment = order.fulfillmentOrders[0]!
    const result = 执行演示推单(order.systemOrderNo, fulfillment.fulfillmentOrderNo, 当前版本(order.systemOrderNo))
    expect(result.成功).toBe(true); await 稳定()
    const no = result.对象号!, count = 仓库会话单据.value.length
    expect(count).toBe(originalCount + 1)
    expect(no.startsWith('CK-')).toBe(true)
    const page = await 打开({ fulfillmentOrderNo: fulfillment.fulfillmentOrderNo })
    expect(主行(page)).toHaveLength(1)
    expect(指定行(page, no).text()).toContain('下单中')
    expect(order.processingStatus).toBe('待推单')
    const row = 仓库会话单据.value.find(item => item.no === no)!
    expect(取得出库详情(row).items.map(item => item.plannedQuantity)).toEqual([2])
    await 按钮(指定行(page, no), '同步仓库状态').trigger('click'); await 稳定()
    await 按钮(弹窗(page, '同步仓库状态 · 执行确认'), '确认同步仓库状态').trigger('click'); await 稳定()
    expect(row.status).toBe('待出库'); expect(row.shipped).toBe(0); expect(row.tracking).toBe('')
    expect(order.processingStatus).toBe('待发货')
    expect(仓库会话单据.value).toHaveLength(count)
    await 按钮(弹窗(page, '出库单处理结果'), '完成').trigger('click')
    expect(page.get('.出库工具栏').text()).not.toContain('刷新列表')
    expect(仓库会话单据.value.filter(item => item.no === no)).toHaveLength(1)
    expect(仓库执行记录.value.filter(item => item.出库单号 === no)).toHaveLength(1)
  })

  it('合单必须同一来源满足平台和编号筛选，命中后保留整张仓单及全部来源', async () => {
    const page = await 打开()
    await 按钮(page.get('.出库筛选'), '更多').trigger('click'); await 稳定()
    const platform = page.findAllComponents(MultiSelectFilter).find(item => item.props('placeholder') === '平台')!
    platform.vm.$emit('update:modelValue', ['Temu']); await 稳定()
    await 搜索(page, 'order', 'OMS2610100008')
    expect(主行(page)).toHaveLength(0)
    await 搜索(page, 'order', 'OMS261010M0002')
    expect(主行(page)).toHaveLength(1)
    const row = 指定行(page, 'CK2610100008')
    expect(row.text()).toContain('OMS2610100008'); expect(row.text()).toContain('OMS261010M0002')
    await 按钮(row, '出库单详情').trigger('click'); await 稳定()
    const detail = 弹窗(page, '三方仓出库单详情')
    expect(detail.text()).toContain('来源订单 2 单')
    expect(detail.text()).toContain('OMS2610100008'); expect(detail.text()).toContain('OMS261010M0002')
    await 按钮(detail.get('.详情页签'), '商品明细').trigger('click'); await 稳定()
    const records = detail.get('.详情商品表').findAll('tbody tr.el-table__row')
    expect(records).toHaveLength(2)
    expect(records[0]!.text()).toContain('OMS2610100008'); expect(records[1]!.text()).toContain('OMS261010M0002')
    const snapshot = 取得出库详情(仓库会话单据.value.find(item => item.no === 'CK2610100008')!)
    expect(snapshot.items.reduce((sum, item) => sum + item.plannedQuantity!, 0)).toBe(2)
  })

  it('各时间读取自己的原值，缺失不借用其他事件；渠道代码只在详情及导出保留', async () => {
    const row = 仓库会话单据.value.find(item => item.no === 'CK2610100003')!
    Object.assign(row, { createdAt: '2026-10-01 01:02:03', updatedAt: '2026-10-07 07:08:09' })
    Object.assign(row.outboundDetail!, { submittedAt: '2026-10-02 02:03:04', acceptedAt: null, operationStartedAt: '2026-10-03 03:04:05', shippedAt: null, lastSyncedAt: '2026-10-06 06:07:08' })
    const page = await 打开()
    await 搜索(page, 'no', row.no)
    const listed = 指定行(page, row.no)
    const listTimes = Object.fromEntries(listed.get('.时间格').findAll('.字段行').map(field => [field.get('span').text(), field.get('b').text()]))
    expect(listTimes).toEqual({ 创建: '2026-10-01 01:02:03', 推仓: '2026-10-02 02:03:04', 受理: '—', 首次作业: '2026-10-03 03:04:05', 最近更新: '2026-10-07 07:08:09', 最后同步: '2026-10-06 06:07:08' })
    expect(listed.text()).not.toContain(row.channelCode)
    await 按钮(listed, '出库单详情').trigger('click'); await 稳定()
    const detail = 弹窗(page, '三方仓出库单详情')
    const timeGroup = detail.get('.详情时间信息')
    const detailTimes = Object.fromEntries(timeGroup.findAll('td.el-descriptions__label').map(label => [label.text(), new DOMWrapper(label.element.nextElementSibling!).text()]))
    expect(detailTimes).toEqual({ 创建时间: '2026-10-01 01:02:03', 推仓时间: '2026-10-02 02:03:04', 受理时间: '—', 首次作业时间: '2026-10-03 03:04:05', 完成出库时间: '—', 最后同步时间: '2026-10-06 06:07:08', 最近更新时间: '2026-10-07 07:08:09' })
    expect(detail.text()).toContain(row.channelCode)
    row.createdAt = ''
    await 稳定()
    const createdLabel = timeGroup.findAll('td.el-descriptions__label').find(label => label.text() === '创建时间')!
    expect(new DOMWrapper(createdLabel.element.nextElementSibling!).text()).toBe('—')
    const createdCell = 指定行(page, row.no).get('.时间格').findAll('.字段行').find(field => field.get('span').text() === '创建')!
    expect(createdCell.get('b').text()).toBe('—')
    await 按钮(detail, '关闭').trigger('click'); await 稳定()
    await 按钮(page.get('.出库工具栏'), '导出').trigger('click'); await 稳定()
    await 按钮(弹窗(page, '导出三方仓出库单'), '确认导出').trigger('click'); await 稳定()
    const csv = await 读取下载(vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob)
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    const cells = (line: string) => Array.from(line.matchAll(/(?:^|,)"((?:[^"]|"")*)"/g), match => match[1]!.replace(/""/g, '"'))
    const headers = cells(lines[0]!), values = cells(lines[1]!)
    const exported = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    expect(exported).toMatchObject({ OMS出库单号: row.no, 渠道代码: row.channelCode, '创建时间（北京时间）': '', '推仓时间（北京时间）': '2026-10-02 02:03:04', '受理时间（北京时间）': '', '首次作业时间（北京时间）': '2026-10-03 03:04:05', '完成出库时间（北京时间）': '', '最后同步时间（北京时间）': '2026-10-06 06:07:08', '最近更新时间（北京时间）': '2026-10-07 07:08:09' })
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:outbound-test'), { timeout: 1500 })
  })

  it('待核查查询未查到仍保持下单中，结果下载明确失败和待核查且不生成新单', async () => {
    await 注入旧执行('11')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-11' })
    const row = 仓单('11'), originalId = row.id, count = 仓库会话单据.value.length
    await 按钮(指定行(page, row.no), '同步仓库状态').trigger('click'); await 稳定()
    await 按钮(弹窗(page, '同步仓库状态 · 执行确认'), '确认同步仓库状态').trigger('click'); await 稳定()
    expect(row).toMatchObject({ id: originalId, status: '下单中', awaitingCheck: true, externalNo: '' })
    expect(单('11').processingStatus).toBe('待推单'); expect(仓库会话单据.value).toHaveLength(count)
    const result = 弹窗(page, '出库单处理结果')
    expect(result.text()).toContain('失败'); expect(result.text()).toContain('暂未查询到')
    await 按钮(result, '下载逐项结果').trigger('click'); await 稳定()
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob
    const csv = await 读取下载(blob)
    expect(csv).toContain('"出库单号","操作","操作结果","业务状态","待核查"')
    expect(csv).toContain('"OUT-DEMO-ACTION-11","同步仓库状态","失败","下单中","是"')
    expect(csv).toContain('不能据此直接重新推单'); expect(csv).toContain('本地虚构评审数据')
    expect(仓库会话单据.value.filter(item => item.id === originalId)).toHaveLength(1)
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:outbound-test'), { timeout: 1500 })
  })

  it('未修复失败项预检阻断，已修复项在确认前版本变化也不能重新推单', async () => {
    await 注入旧执行('09', '08')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-09' })
    const row09 = 指定行(page, 'OUT-DEMO-ACTION-09')
    expect(禁用(按钮(row09, '重新推单'))).toBe(true)
    await row09.get('input[type="checkbox"]').setValue(true); await 稳定()
    await 按钮(page.get('.出库工具栏'), '重新推单').trigger('click'); await 稳定()
    const blocked = 弹窗(page, '重新推单 · 执行确认')
    expect(blocked.text()).toContain('原失败原因尚未解决')
    expect(禁用(按钮(blocked, '确认重新推单'))).toBe(true)
    await 按钮(blocked, '取消').trigger('click'); await 稳定()
    await 搜索(page, 'no', 'OUT-DEMO-ACTION-08')
    await 按钮(指定行(page, 'OUT-DEMO-ACTION-08'), '重新推单').trigger('click'); await 稳定()
    const confirmation = 弹窗(page, '重新推单 · 执行确认')
    await confirmation.get('#outbound-repair-note').setValue('已开通渠道并核实原请求未受理')
    const before = JSON.stringify(仓库执行记录.value.find(item => item.出库单号 === 'OUT-DEMO-ACTION-08'))
    订单版本.value[单('08').systemOrderNo] = 当前版本(单('08').systemOrderNo) + 1
    await 稳定(); await 按钮(confirmation, '确认重新推单').trigger('click'); await 稳定()
    expect(弹窗(page, '出库单处理结果').text()).toContain('已变化')
    expect(JSON.stringify(仓库执行记录.value.find(item => item.出库单号 === 'OUT-DEMO-ACTION-08'))).toBe(before)
    expect(仓单('08').status).toBe('下单失败')
  })

  it('明确失败修复后复用原出库身份重新推单，提交受理仍等待仓库结论', async () => {
    await 注入旧执行('08')
    const page = await 打开({ fulfillmentOrderNo: 'FL-DEMO-ACTION-08' })
    const row = 仓单('08'), originalId = row.id, count = 仓库会话单据.value.length
    await 按钮(指定行(page, row.no), '重新推单').trigger('click'); await 稳定()
    const confirmation = 弹窗(page, '重新推单 · 执行确认')
    await confirmation.get('#outbound-repair-note').setValue('账号渠道已开通，核实原请求未生效')
    await 按钮(confirmation, '确认重新推单').trigger('click'); await 稳定()
    expect(row).toMatchObject({ id: originalId, status: '下单中', awaitingCheck: true, shipped: 0, externalNo: '' })
    expect(单('08').processingStatus).toBe('待推单')
    expect(仓库会话单据.value).toHaveLength(count)
    expect(仓库执行记录.value.filter(item => item.出库单号 === row.no)).toHaveLength(1)
    expect(取得出库详情(row).items.map(item => item.plannedQuantity)).toEqual([2])
    expect(弹窗(page, '出库单处理结果').text()).toContain('成功')
    expect(弹窗(page, '出库单处理结果').text()).toContain('下单中')
  })

  it('详情顶部两个复制按钮各自只写入精确原始单号，并反馈对应复制成功', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    vi.stubGlobal('navigator', new Proxy(navigator, { get: (target, key) => key === 'clipboard' ? clipboard : Reflect.get(target, key, target) }))
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
    const page = await 打开()
    await 搜索(page, 'no', 'CK2610100008')
    expect(主行(page)).toHaveLength(1)
    await 按钮(指定行(page, 'CK2610100008'), '出库单详情').trigger('click'); await 稳定()
    const detail = 弹窗(page, '三方仓出库单详情')
    await detail.get('button[aria-label="复制OMS出库单号"]').trigger('click'); await 稳定()
    await detail.get('button[aria-label="复制三方仓出库单号"]').trigger('click'); await 稳定()
    expect(clipboard.writeText.mock.calls).toEqual([['CK2610100008'], ['4PX-261010-0008']])
    expect(success.mock.calls.map(call => call[0])).toEqual(['已复制OMS出库单号', '已复制三方仓出库单号'])
    expect(warning).not.toHaveBeenCalled()
  })

  it('复制被浏览器拒绝只提示手动选择，外部单号缺失时不提供复制按钮或复制占位符', async () => {
    await 注入旧执行('11')
    const clipboard = { writeText: vi.fn().mockRejectedValue(new DOMException('Clipboard denied', 'NotAllowedError')) }
    vi.stubGlobal('navigator', new Proxy(navigator, { get: (target, key) => key === 'clipboard' ? clipboard : Reflect.get(target, key, target) }))
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
    const page = await 打开()
    await 搜索(page, 'no', 'OUT-DEMO-ACTION-11')
    expect(主行(page)).toHaveLength(1)
    expect(仓单('11').externalNo).toBe('')
    await 按钮(指定行(page, 'OUT-DEMO-ACTION-11'), '出库单详情').trigger('click'); await 稳定()
    const detail = 弹窗(page, '三方仓出库单详情')
    expect(detail.get('.详情概要').text()).toContain('—')
    expect(detail.find('button[aria-label="复制三方仓出库单号"]').exists()).toBe(false)
    await detail.get('button[aria-label="复制OMS出库单号"]').trigger('click'); await 稳定()
    expect(clipboard.writeText.mock.calls).toEqual([['OUT-DEMO-ACTION-11']])
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith('当前浏览器未允许复制，请手动选择单号')
    expect(success).not.toHaveBeenCalled()
  })
})
