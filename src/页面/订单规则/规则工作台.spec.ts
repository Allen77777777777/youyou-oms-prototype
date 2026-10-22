import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElDrawer, ElDropdown, ElDropdownItem, ElMessage, ElMessageBox, type MessageBoxData } from 'element-plus'
import RulePage from './订单规则页面.vue'
import PricingResult from './比价试算结果.vue'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import { 共享规则, 共享规则日志, 记录规则操作 } from './演示会话'
import { 当前规则分类 } from './规则编辑会话'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本 } from '../订单处理/演示会话'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 中台比价汇率快照 } from './比价汇率资料'

// 只替换浮层外壳，表单、表格及规则编辑组件仍使用实际组件和事件。
const 浮层桩 = {
  props: ['modelValue', 'title'], emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="测试浮层" :data-title="title"><slot /><footer><slot name="footer" /></footer></section>',
}
const 初始 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value, orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value, channels: 渠道会话.value, exchangeRates: 中台比价汇率快照.value ?? null })
let 页面: VueWrapper | undefined

function 恢复() {
  const data = JSON.parse(初始)
  共享规则.value = data.rules; 共享规则日志.value = data.logs; 共享订单.value = data.orders
  仓库执行记录.value = data.executions; 操作核查证据.value = data.evidence
  演示库存.value = data.inventory; 订单版本.value = data.versions
  渠道会话.value = data.channels
  中台比价汇率快照.value = data.exchangeRates ?? undefined
}
function 订单事实快照() {
  return JSON.stringify({ orders: 共享订单.value, executions: 仓库执行记录.value, evidence: 操作核查证据.value, inventory: 演示库存.value, versions: 订单版本.value })
}
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RulePage }] })
  await router.push('/'); await router.isReady()
  页面 = mount(RulePage, { attachTo: document.body, global: { plugins: [router], stubs: { ElDrawer: 浮层桩, ElDialog: 浮层桩 }, directives: { prototype: {} } } })
  await 稳定()
  return 页面
}
function 按钮(容器: Pick<DOMWrapper<Element>, 'findAll'>, 名称: string) {
  const 目标 = 容器.findAll('button').find(项 => 项.text() === 名称)
  if (!目标) throw new Error(`未找到按钮：${名称}`)
  return 目标
}
function 规则行(page: VueWrapper, 名称: string) {
  const 行 = page.findAll('.el-table__row').find(项 => 项.find('.规则名称').text() === 名称)
  if (!行) throw new Error(`未找到规则：${名称}`)
  return 行
}
function 规则身份行(page: VueWrapper, id: string) {
  const 行 = page.findAll('.el-table__row').find(项 => 项.find(`.优先级单元[data-rule-id="${id}"]`).exists())
  if (!行) throw new Error(`未找到规则 ID：${id}`)
  return 行
}
async function 更多菜单(行: DOMWrapper<Element>, command: 'copy' | 'logs' | 'delete') {
  await 按钮(行, '更多').trigger('click'); await 稳定()
  const 下拉 = 行.findComponent(ElDropdown)
  const 项 = 下拉.findAllComponents(ElDropdownItem).find(条 => 条.props('command') === command)
  if (!项) throw new Error(`未找到更多菜单项：${command}`)
  // ElDropdownItem 使用 fragment 根；通过真实菜单项配置验证组件对外的 command 事件。
  下拉.vm.$emit('command', 项.props('command')); await 稳定()
}
function 浮层(page: VueWrapper, 标题: string) { return page.get(`.测试浮层[data-title="${标题}"]`) }

beforeEach(() => {
  恢复()
  当前规则分类.value = '审单规则'
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { 页面?.unmount(); 页面 = undefined; 恢复(); 当前规则分类.value = '审单规则'; document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('订单规则工作台的草稿与只读边界', () => {
  it('分类只显示名称，列表状态只用开关，规则说明为空时不显示占位', async () => {
    const 空说明 = 共享规则.value.find(项 => 项.type === '审单规则')!
    const 有说明 = 共享规则.value.find(项 => 项.type === '审单规则' && 项.id !== 空说明.id)!
    空说明.note = '  '; 有说明.note = '需要展示的规则说明'
    const page = await 打开()
    expect(page.findAll('.规则页签 [role="tab"]').map(项 => 项.text())).toEqual(['审单规则', '分仓规则', '订单标发规则'])
    expect(规则行(page, 空说明.name).find('.规则说明').exists()).toBe(false)
    expect(规则行(page, 有说明.name).get('.规则说明').text()).toBe('需要展示的规则说明')
    expect(page.findAll('.状态文字')).toHaveLength(0)
    expect(page.findAll('.el-table__row [role="switch"]')).toHaveLength(共享规则.value.filter(项 => 项.type === '审单规则').length)
    expect(page.findAll('button').map(项 => 项.text())).not.toContain('调整优先级')
    expect(page.find('.测试浮层[data-title="调整优先级"]').exists()).toBe(false)
    expect(page.find('.规则介绍').exists()).toBe(false)
    expect(page.findAll('.el-table__row .规则副文').map(项 => 项.text())).not.toContain('北京时间')
    expect(page.findAll('.规则工具栏 .左工具 button').map(项 => 项.text())).toEqual(['新增规则', '规则试算', '批量启用', '批量停用'])
    expect(page.find('.排序触发').exists()).toBe(false)
    expect(page.findAll('.优先级数字')).toHaveLength(0)
    expect(page.findAll('.顶栏操作 button').map(项 => 项.text())).toEqual(['系统默认审定规则'])
    const 操作 = 规则行(page, 空说明.name).get('.规则行操作')
    expect(操作.findAll('button').map(项 => 项.text())).toEqual(['编辑', '更多'])
    expect(操作.findComponent(ElDropdown).props('trigger')).toBe('click')
  })

  it('选中启用规则后取消批量停用，不改变状态、版本或变更日志', async () => {
    const 来源 = 共享规则.value.find(项 => 项.type === '审单规则' && 项.enabled)!
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const 确认 = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const page = await 打开()
    await 规则行(page, 来源.name).get('input[type="checkbox"]').setValue(true); await 稳定()
    expect((按钮(page, '批量停用').element as HTMLButtonElement).disabled).toBe(false)
    await 按钮(page, '批量停用').trigger('click'); await 稳定()
    expect(确认).toHaveBeenCalledOnce()
    expect(确认.mock.calls[0]![0]).toContain('停用 1 条')
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
  })

  it('列表手柄方向键即时移动并保留既有优先级数值，边界不写入且只更新实际变化项', async () => {
    const 同类 = 共享规则.value.filter(项 => 项.type === '审单规则').sort((a, b) => a.priority - b.priority)
    const 首项 = 同类[0]!, 次项 = 同类[1]!, 首优先级 = 首项.priority, 次优先级 = 次项.priority
    const 原规则 = JSON.parse(JSON.stringify(共享规则.value)) as typeof 共享规则.value
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value }), 前日志数 = 共享规则日志.value.length, 前订单 = 订单事实快照()
    const page = await 打开()
    const 手柄 = 规则行(page, 首项.name).get(`button[aria-label="调整${首项.name}优先级"]`)
    await 手柄.trigger('keydown', { key: 'ArrowUp' }); await 稳定()
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
    await 规则行(page, 首项.name).get('input[type="checkbox"]').setValue(true); await 稳定()
    await 手柄.trigger('keydown', { key: 'ArrowDown' }); await 稳定()
    expect(page.findAll('.el-table__row .规则名称').map(项 => 项.text())).toEqual([次项.name, 首项.name, ...同类.slice(2).map(项 => 项.name)])
    for (const 原 of 原规则) {
      const 现 = 共享规则.value.find(项 => 项.id === 原.id)!
      if (原.id === 首项.id || 原.id === 次项.id) {
        expect(现).toEqual({ ...原, priority: 原.id === 首项.id ? 次优先级 : 首优先级, version: 原.version + 1, updatedAt: expect.any(String) })
      } else expect(现).toEqual(原)
    }
    expect(共享规则日志.value).toHaveLength(前日志数 + 2)
    expect(共享规则日志.value.slice(0, 2).map(项 => 项.ruleId).sort()).toEqual([首项.id, 次项.id].sort())
    expect(共享规则日志.value.slice(0, 2).every(项 => 项.action === '调整优先级' && 项.operator === '演示用户')).toBe(true)
    expect((按钮(page, '批量停用').element as HTMLButtonElement).disabled).toBe(true)
    expect(订单事实快照()).toBe(前订单)
    expect(page.find('.测试浮层[data-title="调整优先级"]').exists()).toBe(false)
  })

  it('已应用搜索或启停筛选禁止调整，重置后恢复且列表固定按优先级升序', async () => {
    const 首项 = 共享规则.value.find(项 => 项.type === '审单规则')!
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const page = await 打开()
    const 手柄已禁用 = () => page.findAll('.列表拖拽手柄').every(项 => (项.element as HTMLButtonElement).disabled)
    await page.get('input[aria-label="订单规则搜索内容"]').setValue(首项.name)
    await 按钮(page, '查询').trigger('click'); await 稳定()
    expect(page.findAll('.el-table__row')).toHaveLength(1)
    expect(手柄已禁用()).toBe(true)
    await 规则行(page, 首项.name).get('.列表拖拽手柄').trigger('keydown', { key: 'ArrowDown' })
    await 按钮(page, '重置').trigger('click'); await 稳定()
    expect(手柄已禁用()).toBe(false)
    page.findComponent(MultiSelectFilter).vm.$emit('update:modelValue', ['true'])
    await 按钮(page, '查询').trigger('click'); await 稳定()
    expect(手柄已禁用()).toBe(true)
    await 按钮(page, '重置').trigger('click'); await 稳定()
    expect(手柄已禁用()).toBe(false)
    expect(page.findAll('.el-table__row .规则名称').map(项 => 项.text())).toEqual(共享规则.value.filter(项 => 项.type === '审单规则').sort((a, b) => a.priority - b.priority).map(项 => 项.name))
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
  })

  it('列表指针拖到目标行直接提交；拖动期间规则变化则拒绝覆盖，不追加排序日志', async () => {
    const 同类 = 共享规则.value.filter(项 => 项.type === '审单规则').sort((a, b) => a.priority - b.priority)
    const 首项 = 同类[0]!, 次项 = 同类[1]!, 首优先级 = 首项.priority, 次优先级 = 次项.priority
    const page = await 打开()
    const 原取点 = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
    const 取点 = vi.fn(() => 规则行(page, 次项.name).get('.优先级单元').element)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: 取点 })
    const 指针事件 = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: type === 'pointerdown' ? 80 : 120, clientY: type === 'pointerdown' ? 120 : 180 })
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
      return event
    }
    try {
      规则行(page, 首项.name).get('.列表拖拽手柄').element.dispatchEvent(指针事件('pointerdown'))
      window.dispatchEvent(指针事件('pointermove')); window.dispatchEvent(指针事件('pointerup')); await 稳定()
      expect(取点).toHaveBeenCalled()
      expect(共享规则.value.find(项 => 项.id === 首项.id)?.priority).toBe(次优先级)
      expect(共享规则.value.find(项 => 项.id === 次项.id)?.priority).toBe(首优先级)
      expect(共享规则日志.value).toHaveLength(2)
      expect(共享规则日志.value.map(项 => 项.ruleId).sort()).toEqual([首项.id, 次项.id].sort())
      取点.mockImplementation(() => 规则行(page, 首项.name).get('.优先级单元').element)
      规则行(page, 次项.name).get('.列表拖拽手柄').element.dispatchEvent(指针事件('pointerdown'))
      共享规则.value.find(项 => 项.id === 首项.id)!.version++
      const 并发后快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
      window.dispatchEvent(指针事件('pointermove')); window.dispatchEvent(指针事件('pointerup')); await 稳定()
      expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(并发后快照)
      expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('变化'))
    } finally {
      if (原取点) Object.defineProperty(document, 'elementFromPoint', 原取点)
      else Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })

  it('系统默认审定规则显示统一未通过说明和五组 20 项条件，不重复展示逐项结果', async () => {
    const 前规则 = JSON.stringify(共享规则.value), 前订单 = 订单事实快照()
    const page = await 打开()
    await 按钮(page, '系统默认审定规则').trigger('click'); await 稳定()
    const 默认 = 浮层(page, '系统默认审定规则')
    expect(默认.get('.默认说明').text()).toBe('命中以下任意一条规则，订单审核不通过。')
    expect(默认.findAll('.默认分组')).toHaveLength(5)
    expect(默认.findAll('.默认检查项')).toHaveLength(20)
    expect(默认.findAll('.默认检查项 small')).toHaveLength(0)
    expect(默认.findAll('.默认检查项 p')).toHaveLength(0)
    expect(默认.find('.默认概览').exists()).toBe(false)
    expect(默认.findAll('input, select, textarea, [role="switch"]')).toHaveLength(0)
    expect(默认.findAll('button').map(项 => 项.text())).toEqual(['关闭'])
    await 按钮(默认, '关闭').trigger('click'); await 稳定()
    expect(JSON.stringify(共享规则.value)).toBe(前规则)
    expect(订单事实快照()).toBe(前订单)
  })

  it('从页面试算展示命中轨迹，不写操作日志、不改变订单事实或规则配置', async () => {
    const 前规则 = JSON.stringify(共享规则.value), 前订单 = 订单事实快照(), 前日志 = JSON.stringify(共享规则日志.value)
    const page = await 打开()
    await 按钮(page, '规则试算').trigger('click'); await 稳定()
    const 试算 = 浮层(page, '规则试算')
    await 按钮(试算, '开始试算').trigger('click'); await 稳定()
    expect(试算.find('.试算结论').exists()).toBe(true)
    expect(试算.findAll('.轨迹标题行').length).toBeGreaterThan(0)
    expect(JSON.stringify(共享规则日志.value)).toBe(前日志)
    expect(JSON.stringify(共享规则.value)).toBe(前规则)
    expect(订单事实快照()).toBe(前订单)
  })

  it('缺汇率时保留原报价且不推荐，接收新快照后须重试，并固定每轮人民币比较依据', async () => {
    const source = 共享规则.value.find(rule => rule.type === '分仓规则')!
    const channels = ['DEMO-CF-CHANNEL-WYT', 'DEMO-CF-CHANNEL-GC'].map(id => 渠道会话.value.find(channel => channel.id === id)!)
    source.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
    source.enabled = true
    source.warehouseAction = {
      mode: 'price', checkRemainingStock: false,
      priceRoutes: channels.map(channel => ({ providerId: channel.providerId, accountId: channel.accountId, warehouseId: channel.warehouseId, channelId: channel.id })),
      priceComparison: 'priceAge', priceAgeLogic: 'priceGap', priceDifference: '1', priceDifferenceCurrency: 'CNY', agePreference: 'recent',
    }
    共享规则.value = [source]
    当前规则分类.value = '分仓规则'
    中台比价汇率快照.value = undefined
    const beforeRules = JSON.stringify(共享规则.value), beforeLogs = JSON.stringify(共享规则日志.value), beforeOrders = 订单事实快照(), beforeChannels = JSON.stringify(渠道会话.value)
    const page = await 打开()
    await 按钮(page, '规则试算').trigger('click'); await 稳定()
    const simulation = 浮层(page, '规则试算')
    await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
    const result = () => simulation.getComponent(PricingResult).props('result')
    const originalAmounts = () => result().ranked.map(item => [item.route.id, item.quote.totalAmount, item.quote.currencyCode])
    const originalQuotes = [['DEMO-CF-CHANNEL-WYT', '13.40', 'USD'], ['DEMO-CF-CHANNEL-GC', '15.30', 'USD']]
    expect(originalAmounts()).toEqual(originalQuotes)
    expect(result().gates).toContain('未取得中台货币汇率快照，无法统一人民币比较')
    expect(result().route).toBeUndefined()
    expect(simulation.find('.比价选中').exists()).toBe(false)
    expect(simulation.find('.过期提示').exists()).toBe(false)

    // 虚构中台快照；shallowRef 接入口以替换整个对象接收新一轮资料。
    const firstRates = { snapshotId: 'DEMO-FX-7', effectiveAt: '2026-10-22T09:00:00+08:00', source: '中台货币汇率', rates: [{ currencyCode: 'USD', cnyRate: '7' }] }
    const beforeFirstRates = JSON.stringify(firstRates)
    中台比价汇率快照.value = firstRates; await 稳定()
    expect(simulation.get('.过期提示').text()).toContain('请重新试算')
    expect(result().route).toBeUndefined()
    expect(result().exchangeRateSnapshot).toBeUndefined()
    await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
    expect(simulation.find('.过期提示').exists()).toBe(false)
    expect(result().gates).toEqual([])
    expect(result().route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(result().ranked.map(item => [item.comparisonAmount, item.comparisonCurrency, item.exchangeRate])).toEqual([['93.8', 'CNY', '7'], ['107.1', 'CNY', '7']])
    expect(result().exchangeRateSnapshot).toEqual({ snapshotId: firstRates.snapshotId, effectiveAt: firstRates.effectiveAt, source: firstRates.source })
    expect(simulation.get('.比价结果表').text()).toContain('人民币比较金额')
    expect(simulation.get('.比价试算结果').text()).toContain('1 USD = 7 CNY')
    expect(simulation.get('.比价试算结果').text()).toContain('汇率来源：中台货币汇率；生效时间（北京时间）：2026-10-22 09:00:00')
    expect(simulation.findAll('.比价选中')).toHaveLength(1)
    expect(originalAmounts()).toEqual(originalQuotes)

    中台比价汇率快照.value = { ...firstRates, snapshotId: 'DEMO-FX-8', effectiveAt: '2026-10-22T10:00:00+08:00', rates: [{ currencyCode: 'USD', cnyRate: '8' }] }; await 稳定()
    expect(simulation.find('.过期提示').exists()).toBe(true)
    expect(result().exchangeRateSnapshot?.snapshotId).toBe('DEMO-FX-7')
    expect(result().ranked.map(item => item.exchangeRate)).toEqual(['7', '7'])
    await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
    expect(simulation.find('.过期提示').exists()).toBe(false)
    expect(result().exchangeRateSnapshot?.snapshotId).toBe('DEMO-FX-8')
    expect(result().ranked.map(item => [item.comparisonAmount, item.exchangeRate])).toEqual([['107.2', '8'], ['122.4', '8']])
    expect(originalAmounts()).toEqual(originalQuotes)
    expect(JSON.stringify(firstRates)).toBe(beforeFirstRates)
    expect(JSON.stringify(共享规则.value)).toBe(beforeRules)
    expect(JSON.stringify(共享规则日志.value)).toBe(beforeLogs)
    expect(JSON.stringify(渠道会话.value)).toBe(beforeChannels)
    expect(订单事实快照()).toBe(beforeOrders)
  })

  it.each(['审单规则', '订单标发规则'] as const)('%s试算不依赖比价汇率快照，资料到达或替换均不使结果过期', async type => {
    const source = 共享规则.value.find(rule => rule.type === type)!
    source.enabled = true
    source.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
    共享规则.value = [source]
    当前规则分类.value = type
    中台比价汇率快照.value = undefined
    const beforeRules = JSON.stringify(共享规则.value), beforeLogs = JSON.stringify(共享规则日志.value), beforeOrders = 订单事实快照()
    const page = await 打开()
    await 按钮(page, '规则试算').trigger('click'); await 稳定()
    const simulation = 浮层(page, '规则试算')
    await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
    const beforeResult = simulation.get('.试算结论').text(), beforeGates = simulation.get('.门禁结果').text()
    expect(simulation.findComponent(PricingResult).exists()).toBe(false)
    for (const rate of ['7', '8']) {
      中台比价汇率快照.value = { snapshotId: `DEMO-FX-${rate}`, effectiveAt: '2026-10-22T09:00:00+08:00', source: '中台货币汇率', rates: [{ currencyCode: 'USD', cnyRate: rate }] }; await 稳定()
      expect(simulation.find('.过期提示').exists()).toBe(false)
      expect(simulation.get('.试算结论').text()).toBe(beforeResult)
      expect(simulation.get('.门禁结果').text()).toBe(beforeGates)
    }
    expect(JSON.stringify(共享规则.value)).toBe(beforeRules)
    expect(JSON.stringify(共享规则日志.value)).toBe(beforeLogs)
    expect(订单事实快照()).toBe(beforeOrders)
  })

  it.each([
    { type: '审单规则', hasWarehouse: true },
    { type: '订单标发规则', hasWarehouse: true },
    { type: '审单规则', hasWarehouse: false },
  ] as const)('$type含发货仓库=$hasWarehouse时展示可读身份，并仅对所依赖的渠道变更标记试算过期', async ({ type, hasWarehouse }) => {
    const source = 共享规则.value.find(rule => rule.type === type)!
    const channel = 渠道会话.value.find(item => item.enabled && item.labelMode === '仓库回传')!
    const warehouseKey = JSON.stringify([channel.providerId, channel.accountId, channel.warehouseId])
    source.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }]
    if (hasWarehouse) source.conditions.push({ field: 'shippingWarehouse', operator: '等于', value: '', values: [warehouseKey] })
    source.enabled = true
    共享规则.value = [source]
    当前规则分类.value = type
    const beforeRules = JSON.stringify(共享规则.value), beforeLogs = JSON.stringify(共享规则日志.value), beforeOrders = 订单事实快照()
    const page = await 打开(), row = 规则身份行(page, source.id)
    if (hasWarehouse) {
      const summary = row.get('.条件摘要三行').text()
      expect(summary).toContain('发货仓库 等于')
      for (const label of [channel.warehouse, channel.provider, channel.account]) expect(summary).toContain(label)
      expect(summary).not.toContain(warehouseKey)
      await row.get('.规则名称').trigger('click'); await 稳定()
      const details = 浮层(page, '规则详情')
      const warehouseCondition = details.findAll('.详情条件').find(item => item.get('span').text() === '发货仓库')!
      expect(warehouseCondition.get('strong').text()).toBe(`${channel.warehouse} · ${channel.provider} · ${channel.account}`)
      expect(warehouseCondition.text()).not.toContain(warehouseKey)
      await 按钮(details, '关闭').trigger('click'); await 稳定()
    } else expect(row.get('.条件摘要三行').text()).not.toContain('发货仓库')
    await 按钮(page, '规则试算').trigger('click'); await 稳定()
    const simulation = 浮层(page, '规则试算')
    await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
    expect(simulation.find('.试算结论').exists()).toBe(true)
    expect(simulation.findAll('.轨迹标题行').map(item => item.text()).join(' ')).toContain(source.name)
    expect(simulation.find('.过期提示').exists()).toBe(false)
    channel.name = '本轮变更后的演示渠道名称'; await 稳定()
    expect(simulation.find('.过期提示').exists()).toBe(hasWarehouse)
    if (hasWarehouse) {
      expect(simulation.get('.过期提示').text()).toContain('请重新试算')
      await 按钮(simulation, '开始试算').trigger('click'); await 稳定()
      expect(simulation.find('.过期提示').exists()).toBe(false)
    }
    expect(JSON.stringify(共享规则.value)).toBe(beforeRules)
    expect(JSON.stringify(共享规则日志.value)).toBe(beforeLogs)
    expect(订单事实快照()).toBe(beforeOrders)
  })

  it('逐规则操作日志初始为空，同名规则也按稳定 ID 隔离操作内容', async () => {
    const [A, B] = 共享规则.value.filter(项 => 项.type === '审单规则')
    B!.name = A!.name
    const page = await 打开()
    await 更多菜单(规则身份行(page, A!.id), 'logs')
    const 日志 = 浮层(page, '操作日志')
    expect(日志.get('.规则操作日志表').text()).toContain('暂无操作日志')
    记录规则操作(A!, '编辑', '仅属于规则 A 的操作内容', '2026-10-16 09:10:00 UTC+8')
    记录规则操作(B!, '停用', '仅属于规则 B 的操作内容', '2026-10-16 09:11:00 UTC+8')
    await 稳定()
    expect(日志.get('.规则操作日志表').text()).toContain('仅属于规则 A 的操作内容')
    expect(日志.get('.规则操作日志表').text()).not.toContain('仅属于规则 B 的操作内容')
    expect(日志.findAll('th .cell').map(项 => 项.text())).toEqual(['操作时间', '操作人', '操作', '操作内容'])
    page.findAllComponents(ElDrawer).find(项 => 项.props('title') === '操作日志')!.vm.$emit('update:modelValue', false); await 稳定()
    await 更多菜单(规则身份行(page, B!.id), 'logs')
    const B日志 = 浮层(page, '操作日志').get('.规则操作日志表')
    expect(B日志.text()).toContain('仅属于规则 B 的操作内容')
    expect(B日志.text()).not.toContain('仅属于规则 A 的操作内容')
  })

  it('删除取消不落地，等待确认时来源版本变化也拒绝删除并保留日志', async () => {
    const 来源 = 共享规则.value.find(项 => 项.type === '审单规则')!
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const 确认 = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    const page = await 打开()
    await 更多菜单(规则行(page, 来源.name), 'delete')
    expect(确认.mock.calls[0]![1]).toBe('删除规则')
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
    let 完成确认!: () => void
    确认.mockReturnValueOnce(new Promise<MessageBoxData>(resolve => { 完成确认 = () => resolve(Object.assign('confirm' as const, { value: '', action: 'confirm' as const })) }))
    await 更多菜单(规则行(page, 来源.name), 'delete')
    来源.version++; 来源.note = '确认期间被另一操作修改'
    const 并发后快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    完成确认(); await 稳定()
    expect(ElMessage.warning).toHaveBeenCalledWith('规则已变化，请重新确认删除')
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(并发后快照)
  })
})
