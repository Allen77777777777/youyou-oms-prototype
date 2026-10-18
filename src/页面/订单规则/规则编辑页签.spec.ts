import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { ElDropdown, ElDropdownItem, ElIcon, ElMessage, ElMessageBox, ElSelect, ElTooltip, type MessageBoxData } from 'element-plus'
import RulePage from './订单规则页面.vue'
import EditorPage from './规则编辑页面.vue'
import PageTabs from '@/布局/页面页签.vue'
import { 业务页签关闭请求 } from '@/布局/页签操作'
import { 当前规则分类, 读取规则草稿, 丢弃规则草稿, type 规则编辑模式 } from './规则编辑会话'
import { 共享规则, 共享规则日志, 记录规则操作 } from './演示会话'
import { 共享订单 } from '../订单处理/演示会话'

const 列表路径 = '/oms/self-fulfillment/order-rules'
const 初始 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value, orders: 共享订单.value })
const 已用会话 = new Set<string>()
let 页面: VueWrapper | undefined, router: Router
const 浮层桩 = { props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' }
const 应用壳 = defineComponent({ setup: () => () => h('div', [h(PageTabs), h(RouterView)]) })
function 恢复() { const data = JSON.parse(初始); 共享规则.value = data.rules; 共享规则日志.value = data.logs; 共享订单.value = data.orders; 当前规则分类.value = '审单规则'; 业务页签关闭请求.value = undefined }
async function 稳定() { await nextTick(); await flushPromises(); await nextTick() }
async function 打开() {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: 列表路径, component: RulePage, meta: { title: '订单规则' } },
    ...(['new', 'edit', 'copy'] as const).map(mode => ({ path: `${列表路径}/${mode}/:sessionId`, name: `oms-order-rule-${mode}`, component: EditorPage, meta: { ruleEditorMode: mode, title: mode === 'new' ? '新增规则' : mode === 'edit' ? '编辑规则' : '复制规则' } })),
  ] })
  router.afterEach(route => { if (route.meta.ruleEditorMode) 已用会话.add(`${String(route.meta.ruleEditorMode)}:${String(route.params.sessionId)}`) })
  await router.push(列表路径); await router.isReady()
  页面 = mount(应用壳, { attachTo: document.body, global: { plugins: [router], components: { ElIcon, ElTooltip }, stubs: { ElDrawer: 浮层桩, ElDialog: 浮层桩 }, directives: { prototype: {} } } })
  await 稳定(); return 页面
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
async function 更多菜单(行: DOMWrapper<Element>, command: 'copy' | 'logs' | 'delete') {
  await 按钮(行, '更多').trigger('click'); await 稳定()
  const 下拉 = 行.findComponent(ElDropdown)
  const 项 = 下拉.findAllComponents(ElDropdownItem).find(条 => 条.props('command') === command)
  if (!项) throw new Error(`未找到更多菜单项：${command}`)
  // ElDropdownItem 使用 fragment 根；通过真实菜单项配置验证组件对外的 command 事件。
  下拉.vm.$emit('command', 项.props('command')); await 稳定()
}
function 当前会话() { return 读取规则草稿(router.currentRoute.value.meta.ruleEditorMode as 规则编辑模式, String(router.currentRoute.value.params.sessionId))! }
function 页签标题(page: VueWrapper) { return page.findAll('.页签项 > span').map(项 => 项.text()) }

beforeEach(() => {
  恢复()
  // 页签生命周期只需要两条来源和一张订单，避免每次路由切换重复渲染整套演示资料。
  共享规则.value = 共享规则.value.filter(项 => 项.type === '审单规则').slice(0, 2)
  共享订单.value = 共享订单.value.slice(0, 1)
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }))
})
afterEach(() => { 页面?.unmount(); 页面 = undefined; 已用会话.forEach(丢弃规则草稿); 已用会话.clear(); 恢复(); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('规则编辑应用内页签', () => {
  it('新增打开独立页签且默认停用，空条件保存被拦截，取消关闭页签并丢弃草稿', async () => {
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const page = await 打开()
    await 按钮(page, '新增规则').trigger('click'); await 稳定()
    const path = router.currentRoute.value.path, session = 当前会话()
    expect(router.currentRoute.value.name).toBe('oms-order-rule-new')
    expect(页签标题(page)).toEqual(['订单规则', '新增规则'])
    expect(page.get('.编辑页标题 h1').text()).toBe('新增规则')
    expect(session.draft.mode).toBe('全部满足')
    expect(page.find('[aria-label="匹配方式"]').exists()).toBe(false)
    expect(page.text()).not.toContain('以下任一条件')
    const 状态 = page.findAllComponents(ElSelect).find(项 => 项.find('[aria-label="规则状态"]').exists())!
    expect(状态.props('modelValue')).toBe(false)
    await page.get('input[aria-label="规则名称"]').setValue('无条件草稿')
    await page.get('button[aria-label="删除第1项条件"]').trigger('click')
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(page.get('[role="alert"]').text()).toContain('完整条件')
    expect(router.currentRoute.value.path).toBe(path)
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
    await 按钮(page, '取消').trigger('click'); await 稳定()
    expect(router.currentRoute.value.path).toBe(列表路径)
    expect(页签标题(page)).toEqual(['订单规则'])
    expect(读取规则草稿(session.mode, session.id)).toBeUndefined()
    expect(业务页签关闭请求.value).toEqual({ path, returnTo: 列表路径 })
  })

  it('复制启用规则保存为新 ID 的停用规则，来源不变且保存后关闭复制页签', async () => {
    const 来源 = 共享规则.value.find(项 => 项.type === '审单规则' && 项.enabled)!
    const 来源快照 = JSON.stringify(来源), 原ID = 共享规则.value.map(项 => 项.id)
    const 确认 = vi.spyOn(ElMessageBox, 'confirm')
    const page = await 打开()
    await 更多菜单(规则行(page, 来源.name), 'copy')
    const session = 当前会话(), path = router.currentRoute.value.path
    expect(router.currentRoute.value.name).toBe('oms-order-rule-copy')
    expect(页签标题(page)).toEqual(['订单规则', '复制规则'])
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    const 副本 = 共享规则.value.find(项 => !原ID.includes(项.id))!
    expect(共享规则.value).toHaveLength(原ID.length + 1)
    expect(副本.id).toBeTruthy(); expect(副本.id).not.toBe(来源.id)
    expect(副本).toMatchObject({ enabled: false, version: 1, type: 来源.type, mode: '全部满足', conditions: 来源.conditions })
    expect(副本.name).toContain('副本')
    expect(JSON.stringify(共享规则.value.find(项 => 项.id === 来源.id))).toBe(来源快照)
    expect(确认).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe(列表路径)
    expect(页签标题(page)).toEqual(['订单规则'])
    expect(读取规则草稿(session.mode, session.id)).toBeUndefined()
    expect(业务页签关闭请求.value?.path).toBe(path)
    expect(共享规则日志.value).toHaveLength(1)
    expect(共享规则日志.value[0]).toMatchObject({ ruleId: 副本.id, ruleName: 副本.name, action: '复制', operator: '演示用户' })
  })

  // 六次真实列表/表单路由挂载需要比单页操作更长的执行窗口。
  it('两条规则草稿跨页切换独立保留，取消当前编辑仅丢弃对应草稿和页签', async () => {
    const 同类 = 共享规则.value.filter(项 => 项.type === '审单规则')
    const A = 同类.find(项 => 项.conditions.length > 1)!, B = 同类.find(项 => 项.id !== A.id)!
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const page = await 打开()
    await 按钮(规则行(page, A.name), '编辑').trigger('click'); await 稳定()
    const 路径A = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('独立草稿 A')
    await page.get('button[aria-label="删除第1项条件"]').trigger('click')
    await 按钮(page, '返回规则列表').trigger('click'); await 稳定()
    await 按钮(规则行(page, B.name), '编辑').trigger('click'); await 稳定()
    const 路径B = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('独立草稿 B')
    expect(路径B).not.toBe(路径A)
    await router.push(路径A); await 稳定()
    expect((page.get('input[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('独立草稿 A')
    expect(page.findAll('.编辑条件行')).toHaveLength(A.conditions.length - 1)
    expect(读取规则草稿('edit', B.id)?.draft.name).toBe('独立草稿 B')
    expect(页签标题(page)).toEqual(['订单规则', '编辑规则', '编辑规则'])
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
    await 按钮(page, '取消').trigger('click'); await 稳定()
    expect(读取规则草稿('edit', A.id)).toBeUndefined()
    expect(读取规则草稿('edit', B.id)?.draft.name).toBe('独立草稿 B')
    expect(页签标题(page)).toEqual(['订单规则', '编辑规则'])
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
  }, 10_000)

  it('编辑期间来源版本变化时禁止覆盖，保留草稿页签并提示重新打开', async () => {
    const 来源 = 共享规则.value.find(项 => 项.type === '审单规则')!
    const page = await 打开()
    await 按钮(规则行(page, 来源.name), '编辑').trigger('click'); await 稳定()
    const path = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('不应覆盖新版本')
    来源.version++; 来源.note = '另一操作已更新规则'
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(ElMessage.warning).toHaveBeenCalledWith('规则已变化，请取消后重新打开编辑')
    expect(router.currentRoute.value.path).toBe(path)
    expect(page.get('.编辑页标题 h1').text()).toBe('编辑规则')
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
  })

  it('等待 A 的启用保存确认时切换到已有草稿 B，确认仅保存清理 A 并保留 B', async () => {
    const A = 共享规则.value[0]!, B = 共享规则.value[1]!
    const 原版本A = A.version, 原快照B = JSON.stringify(B)
    const page = await 打开()
    await 按钮(规则行(page, B.name), '编辑').trigger('click'); await 稳定()
    const 路径B = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('B 保留的未保存草稿')
    await router.push({ name: 'oms-order-rule-edit', params: { sessionId: A.id } }); await 稳定()
    const 路径A = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('A 确认后保存的名称')
    let 完成确认!: () => void
    // 此版本 Element Plus 将返回值声明为输入数据与 Action 的交叉类型。
    const 待确认 = new Promise<MessageBoxData>(resolve => { 完成确认 = () => resolve(Object.assign('confirm' as const, { value: '', action: 'confirm' as const })) })
    const 确认 = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(待确认)
    await 按钮(page, '保存规则').trigger('click'); await 稳定()
    expect(确认).toHaveBeenCalledOnce()
    expect(共享规则.value.find(项 => 项.id === A.id)?.version).toBe(原版本A)
    await router.push(路径B); await 稳定()
    完成确认(); await 稳定()
    expect(共享规则.value.find(项 => 项.id === A.id)).toMatchObject({ name: 'A 确认后保存的名称', version: 原版本A + 1 })
    expect(JSON.stringify(共享规则.value.find(项 => 项.id === B.id))).toBe(原快照B)
    expect(读取规则草稿('edit', A.id)).toBeUndefined()
    expect(读取规则草稿('edit', B.id)?.draft.name).toBe('B 保留的未保存草稿')
    expect(页签标题(page)).toEqual(['订单规则', '编辑规则'])
    expect(业务页签关闭请求.value?.path).toBe(路径A)
    expect(共享规则日志.value).toHaveLength(1)
    expect(共享规则日志.value[0]!.text).toContain('A 确认后保存的名称')
    expect(共享规则日志.value[0]).toMatchObject({ ruleId: A.id, ruleName: 'A 确认后保存的名称', action: '编辑' })
  }, 10_000)

  it('顶部关闭编辑页签丢弃未保存名称和嵌套条件，重新打开从共享规则创建新草稿', async () => {
    const 来源 = 共享规则.value.find(项 => 项.conditions.length > 1)!
    const 前快照 = JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })
    const page = await 打开()
    await 按钮(规则行(page, 来源.name), '编辑').trigger('click'); await 稳定()
    await page.get('input[aria-label="规则名称"]').setValue('顶部关闭应丢弃')
    await page.get('button[aria-label="删除第1项条件"]').trigger('click')
    await page.get('.页签项.激活 .关闭页签').trigger('click'); await 稳定()
    expect(router.currentRoute.value.path).toBe(列表路径)
    expect(页签标题(page)).toEqual(['订单规则'])
    expect(读取规则草稿('edit', 来源.id)).toBeUndefined()
    await 按钮(规则行(page, 来源.name), '编辑').trigger('click'); await 稳定()
    expect((page.get('input[aria-label="规则名称"]').element as HTMLInputElement).value).toBe(来源.name)
    expect(page.findAll('.编辑条件行')).toHaveLength(来源.conditions.length)
    expect(JSON.stringify({ rules: 共享规则.value, logs: 共享规则日志.value })).toBe(前快照)
  }, 10_000)

  it('确认删除只移除目标规则及其编辑草稿和页签，其他草稿保留且删除历史可追溯', async () => {
    const A = 共享规则.value[0]!, B = 共享规则.value[1]!, 原快照B = JSON.stringify(共享规则.value[1])
    记录规则操作(A, '编辑', '删除前仍需保留的历史操作')
    const page = await 打开()
    await 按钮(规则行(page, A.name), '编辑').trigger('click'); await 稳定()
    const 路径A = router.currentRoute.value.path
    await page.get('input[aria-label="规则名称"]').setValue('A 未保存的删除前草稿')
    await 按钮(page, '返回规则列表').trigger('click'); await 稳定()
    await 按钮(规则行(page, B.name), '编辑').trigger('click'); await 稳定()
    await page.get('input[aria-label="规则名称"]').setValue('B 删除其他规则后仍保留的草稿')
    await 按钮(page, '返回规则列表').trigger('click'); await 稳定()
    expect(读取规则草稿('edit', A.id)).toBeDefined()
    expect(读取规则草稿('edit', B.id)).toBeDefined()
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(Object.assign('confirm' as const, { value: '', action: 'confirm' as const }))
    await 更多菜单(规则行(page, A.name), 'delete')
    expect(共享规则.value.some(项 => 项.id === A.id)).toBe(false)
    expect(JSON.stringify(共享规则.value.find(项 => 项.id === B.id))).toBe(原快照B)
    expect(读取规则草稿('edit', A.id)).toBeUndefined()
    expect(读取规则草稿('edit', B.id)?.draft.name).toBe('B 删除其他规则后仍保留的草稿')
    expect(页签标题(page)).toEqual(['订单规则', '编辑规则'])
    expect(router.currentRoute.value.path).toBe(列表路径)
    expect(业务页签关闭请求.value?.path).toBe(路径A)
    expect(共享规则日志.value.filter(项 => 项.ruleId === A.id)).toHaveLength(2)
    expect(共享规则日志.value.find(项 => 项.action === '删除')).toMatchObject({ ruleId: A.id, ruleName: A.name, operator: '演示用户' })
    expect(共享规则日志.value.some(项 => 项.text === '删除前仍需保留的历史操作')).toBe(true)
    expect(共享规则日志.value.some(项 => 项.ruleId === B.id)).toBe(false)
  }, 10_000)
})
