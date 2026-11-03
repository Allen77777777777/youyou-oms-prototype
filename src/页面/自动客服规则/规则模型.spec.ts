import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { serviceRules, serviceRuleLogs, activeRuleType, conditionFields, conditionSummary, actionSummary, createRuleCondition, sortedServiceRules, defaultRule, validateRule, typeTriggers, parseSkuValues, availableTemplates, templatePreview, createEditor, editorSessions, saveEditor, discardEditor, setRulesEnabled, deleteRule, moveRule, resetServiceRules, clone, type ServiceRule, type RuleCondition } from './规则模型'
import { feedbackTemplateSession, resetFeedbackTemplateSession } from '../消息模板管理/评价模板模型'
import { templateSession, resetTemplateSession } from '../消息模板管理/模型'
import { mailTagDefinitions } from '../eBay站内信/设置模型'
import { mailSession } from '../eBay站内信/会话'
import { 清理业务页签 } from '@/布局/页签操作'

function valid(type: ServiceRule['type'] = 'assignment') { return clone(serviceRules.value.find(item => item.type === type)!) }
function amountCondition(patch: Partial<NonNullable<RuleCondition['amountRange']>> = {}): RuleCondition {
  const condition = createRuleCondition('orderAmount')
  Object.assign(condition.amountRange!, { lowerEnabled: true, value: '20.00', currency: 'USD' }, patch)
  return condition
}
beforeEach(() => { resetFeedbackTemplateSession(); resetTemplateSession(); resetServiceRules() })
afterEach(() => { resetFeedbackTemplateSession(); resetTemplateSession(); resetServiceRules() })

describe('自动客服规则配置边界', () => {
  it('仅自动发信使用三种独立新触发，其他两类触发保持且不默认开启买家去重', () => {
    expect(typeTriggers.message).toEqual(['unpaidOrder', 'paidBeforeShipment', 'orderOutbound'])
    expect(typeTriggers.assignment).toEqual(['incoming']); expect(typeTriggers.feedback).toEqual(['paid', 'shipped', 'positive'])
    expect(defaultRule('message')).toMatchObject({ trigger: 'unpaidOrder', messageDedup: { enabled: false, days: 1 } })
    expect(defaultRule('assignment').messageDedup).toBeUndefined(); expect(defaultRule('feedback').messageDedup).toBeUndefined()
    for (const trigger of typeTriggers.message) { const rule = valid('message'); rule.trigger = trigger; expect(validateRule(rule)).toBeUndefined() }
  })
  it('旧发信触发保留原值但不能保存或启用，其他类型同名事件仍合法且旧规则可停用', () => {
    const source = serviceRules.value.find(item => item.type === 'message')!
    for (const trigger of ['incoming', 'paid', 'shipped', 'delivered', 'dispute'] as const) {
      source.trigger = trigger
      const session = createEditor('message', 'edit', source)
      expect(session.draft.trigger).toBe(trigger)
      expect(saveEditor(session)).toBe('原自动发信触发事件已移除，请重新选择')
      expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('已移除')
      expect(source.enabled).toBe(false); discardEditor(session.key)
    }
    expect(validateRule(valid('assignment'))).toBeUndefined()
    for (const trigger of ['paid', 'shipped', 'positive'] as const) { const feedback = valid('feedback'); feedback.trigger = trigger; expect(validateRule(feedback)).toBeUndefined() }
    source.enabled = true; expect(setRulesEnabled([{ id: source.id, version: source.version }], false).changed).toBe(1)
  })
  it('旧发信缺少去重字段时仅在独立编辑或复制草稿补默认值，不修改来源对象', () => {
    const source = serviceRules.value.find(item => item.type === 'message')!; delete source.messageDedup
    const before = clone(source), session = createEditor('message', 'edit', source), copy = createEditor('message', 'copy', source)
    expect(session.draft.messageDedup).toEqual({ enabled: false, days: 1 }); expect(copy.draft.messageDedup).toEqual({ enabled: false, days: 1 })
    session.draft.messageDedup!.enabled = true; session.draft.messageDedup!.days = 7
    expect(copy.draft.messageDedup).toEqual({ enabled: false, days: 1 }); expect(source).toEqual(before)
    discardEditor(session.key); discardEditor(copy.key); expect(source).toEqual(before)
  })
  it('去重天数及开关须为有效类型和1～90整数，未勾选保留的配置同样不能存非法值', () => {
    const rule = valid('message')
    for (const enabled of [false, true]) for (const days of [0, -1, 1.5, 91, Number.NaN, undefined, '3']) {
      Object.assign(rule.messageDedup!, { enabled, days }); expect(validateRule(rule)).toContain('1～90的整数天数')
    }
    for (const days of [1, 90]) { rule.messageDedup = { enabled: true, days }; expect(validateRule(rule)).toBeUndefined() }
    Object.assign(rule.messageDedup!, { enabled: 'true' }); expect(validateRule(rule)).toContain('1～90的整数天数')
  })
  it('去重配置可保存复制并出现在动作摘要和日志，取消选择保留天数且不更改站内信', () => {
    const source = serviceRules.value.find(item => item.type === 'message')!, before = JSON.stringify(mailSession)
    const session = createEditor('message', 'edit', source); session.draft.messageDedup = { enabled: true, days: 30 }
    expect(saveEditor(session)).toBeUndefined()
    const saved = serviceRules.value.find(item => item.id === source.id)!
    expect(actionSummary(saved)).toContain('同一个买家不重复发信：30天')
    expect(serviceRuleLogs.value[0]?.content).toContain('同一个买家不重复发信：30天')
    const copy = createEditor('message', 'copy', saved); expect(copy.draft.enabled).toBe(false); expect(copy.draft.messageDedup).toEqual({ enabled: true, days: 30 })
    copy.draft.messageDedup!.days = 7; expect(saved.messageDedup?.days).toBe(30); discardEditor(copy.key)
    const disabled = createEditor('message', 'edit', saved); disabled.draft.messageDedup!.enabled = false; expect(saveEditor(disabled)).toBeUndefined()
    const stored = serviceRules.value.find(item => item.id === source.id)!
    expect(stored.messageDedup).toEqual({ enabled: false, days: 30 }); expect(actionSummary(stored)).toContain('同一个买家不重复发信：30天（未启用）')
    expect(JSON.stringify(mailSession)).toBe(before)
  })
  it('启用发信规则重验去重天数，其他两类不读取或展示买家去重动作', () => {
    const source = serviceRules.value.find(item => item.type === 'message')!; source.messageDedup = { enabled: true, days: 91 }
    expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('1～90')
    expect(source.enabled).toBe(false)
    for (const type of ['assignment', 'feedback'] as const) {
      const rule = valid(type); rule.messageDedup = { enabled: true, days: 0 }
      expect(validateRule(rule)).toBeUndefined(); expect(actionSummary(rule).join('；')).not.toContain('不重复发信')
    }
  })
  it('数字优先级仅接受1～999999正整数，保存及启用均拒绝非法值', () => {
    const source = serviceRules.value[0]!, before = clone(source), session = createEditor(source.type, 'edit', source)
    for (const order of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1000000, undefined, null, '800']) {
      Object.assign(session.draft, { order }); expect(saveEditor(session)).toBe('优先级须为1～999999的正整数')
    }
    for (const order of [1, 999999]) { session.draft.order = order; expect(validateRule(session.draft)).toBeUndefined() }
    expect(source).toEqual(before); expect(serviceRuleLogs.value).toHaveLength(0)
    source.order = 0; expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('优先级')
    expect(source.enabled).toBe(false)
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s新增复制默认同类最大值加10并保留输入800及700', type => {
    const source = serviceRules.value.find(item => item.type === type)!, maximum = Math.max(...sortedServiceRules(type).map(item => item.order))
    const created = createEditor(type, 'new'), copy = createEditor(type, 'copy', source)
    expect(created.draft.order).toBe(maximum + 10); expect(copy.draft.order).toBe(maximum + 10)
    Object.assign(created.draft, clone(source), { id: '', name: `数字新增-${type}`, enabled: false, order: 800 })
    copy.draft.order = 700
    expect(saveEditor(created)).toBeUndefined(); expect(saveEditor(copy)).toBeUndefined()
    expect(serviceRules.value.find(item => item.name === `数字新增-${type}`)?.order).toBe(800)
    expect(serviceRules.value.find(item => item.name === copy.draft.name)?.order).toBe(700)
    expect(serviceRuleLogs.value.find(item => item.content.includes(`数字新增-${type}`))?.content).toContain('优先级 800')
    expect(source.order).not.toBe(700)
  })
  it('默认优先级达到上限封顶，编辑其他字段不修改原优先级或其他规则字段', () => {
    const source = serviceRules.value[0]!; source.order = 999999
    expect(createEditor(source.type, 'new').draft.order).toBe(999999)
    expect(createEditor(source.type, 'copy', source).draft.order).toBe(999999)
    const other = clone(serviceRules.value.filter(item => item.id !== source.id)), session = createEditor(source.type, 'edit', source)
    session.draft.note = '只改说明'; expect(saveEditor(session)).toBeUndefined()
    expect(serviceRules.value.find(item => item.id === source.id)?.order).toBe(999999)
    for (const rule of other) expect(serviceRules.value.find(item => item.id === rule.id)).toEqual(rule)
  })
  it('数字更新后以此前显示相对序处理同值，新增同值进入组末尾且不按名称排序', () => {
    const [first, second, third] = sortedServiceRules('assignment')
    const front = createEditor('assignment', 'edit', third!); front.draft.order = 5; expect(saveEditor(front)).toBeUndefined()
    expect(sortedServiceRules('assignment').map(item => item.id)).toEqual([third!.id, first!.id, second!.id])
    const tie = createEditor('assignment', 'edit', first!); tie.draft.order = 5; tie.draft.name = 'A同值'; expect(saveEditor(tie)).toBeUndefined()
    expect(sortedServiceRules('assignment').map(item => item.id)).toEqual([third!.id, first!.id, second!.id])
    const added = createEditor('assignment', 'new'); Object.assign(added.draft, clone(first!), { id: '', name: '0新同值', enabled: false, order: 5 })
    expect(saveEditor(added)).toBeUndefined()
    expect(sortedServiceRules('assignment').slice(0, 3).map(item => item.name)).toEqual([third!.name, 'A同值', '0新同值'])
  })
  it('超过20条时数字优先级按同类型全局排序，可把后页规则调整到首位', () => {
    const source = valid(), other = serviceRules.value.filter(item => item.type !== source.type)
    serviceRules.value = [...Array.from({ length: 26 }, (_, index) => ({ ...clone(source), id: `P-${index}`, name: `跨页规则-${index}`, order: (index + 1) * 10 })), ...other]
    const target = serviceRules.value[25]!, session = createEditor(target.type, 'edit', target); session.draft.order = 1
    expect(saveEditor(session)).toBeUndefined(); expect(sortedServiceRules(target.type)[0]?.id).toBe(target.id)
    expect(serviceRules.value.filter(item => item.type !== target.type)).toEqual(other)
  })
  it('拖动只分配移动区间原数字槽位，区间外和其他类型的数字版本日志均不变', () => {
    const base = valid(), rules = [10, 20, 100, 200, 800].map((order, index) => ({ ...clone(base), id: `DRAG-${index}`, name: `拖动-${index}`, order }))
    const other = serviceRules.value.filter(item => item.type !== base.type)
    serviceRules.value = [rules[0]!, other[0]!, rules[1]!, other[1]!, ...rules.slice(2)]
    const outside = clone([rules[0]!, rules[4]!]), others = clone(other.slice(0, 2)), before = JSON.stringify(sortedServiceRules(base.type))
    expect(moveRule(rules[3]!.id, rules[1]!.id, before)).toBeUndefined()
    const ordered = sortedServiceRules(base.type)
    expect(ordered.map(item => item.id)).toEqual([rules[0]!.id, rules[3]!.id, rules[1]!.id, rules[2]!.id, rules[4]!.id])
    expect(ordered.map(item => item.order)).toEqual([10, 20, 100, 200, 800])
    for (const rule of outside) expect(serviceRules.value.find(item => item.id === rule.id)).toEqual(rule)
    expect([serviceRules.value[1], serviceRules.value[3]]).toEqual(others)
    expect(serviceRuleLogs.value).toHaveLength(3)
    expect(serviceRuleLogs.value.every(item => item.content.includes('→') && item.content.includes('匹配顺序'))).toBe(true)
    expect(ordered.slice(1, 4).every(item => item.version === 2)).toBe(true)
    expect(moveRule(rules[0]!.id, rules[0]!.id, JSON.stringify(ordered))).toBeUndefined(); expect(serviceRuleLogs.value).toHaveLength(3)
  })
  it('同值拖动保存实际相对顺序，位置变化项即使数字不变也更新版本并拦截旧草稿', () => {
    const rules = sortedServiceRules('assignment'); rules.forEach(item => { item.order = 20 })
    const session = createEditor('assignment', 'edit', rules[0]!)
    expect(moveRule(rules[2]!.id, rules[0]!.id, JSON.stringify(rules))).toBeUndefined()
    expect(sortedServiceRules('assignment').map(item => item.id)).toEqual([rules[2]!.id, rules[0]!.id, rules[1]!.id])
    expect(sortedServiceRules('assignment').every(item => item.order === 20 && item.version === 2)).toBe(true)
    expect(serviceRuleLogs.value).toHaveLength(3)
    expect(serviceRuleLogs.value.every(item => item.content.includes('20 → 20'))).toBe(true)
    expect(saveEditor(session)).toContain('已变化')
  })
  it('数字编辑后旧拖动完整快照失效，随后拖动也使区间内旧数字草稿失效', () => {
    const rules = sortedServiceRules('assignment'), snapshot = JSON.stringify(rules)
    const stale = createEditor('assignment', 'edit', rules[0]!), changed = createEditor('assignment', 'edit', rules[2]!)
    changed.draft.order = 15; expect(saveEditor(changed)).toBeUndefined()
    expect(moveRule(rules[1]!.id, rules[0]!.id, snapshot)).toContain('已变化')
    expect(moveRule(rules[1]!.id, rules[0]!.id, JSON.stringify(sortedServiceRules('assignment')))).toBeUndefined()
    stale.draft.order = 800; expect(saveEditor(stale)).toContain('已变化')
  })
  it('前三类提供七条件，新增自动回复独立配置；演示规则默认全部停用且不自动补新条件', () => {
    expect(conditionFields.map(item => item.value)).toEqual(['shop', 'site', 'systemSku', 'platformSku', 'fulfillmentMode', 'isSplit', 'orderAmount'])
    expect(new Set(serviceRules.value.map(item => item.type)).size).toBe(4)
    for (const rule of serviceRules.value) { expect(rule.enabled).toBe(false); expect(validateRule(rule)).toBeUndefined(); expect(rule.conditions.some(item => ['fulfillmentMode', 'isSplit', 'orderAmount'].includes(item.field))).toBe(false) }
    for (const type of ['assignment', 'feedback', 'message'] as const) expect(defaultRule(type).conditions.some(item => ['fulfillmentMode', 'isSplit', 'orderAmount'].includes(item.field))).toBe(false)
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s规则可保存拆单单选与金额范围，复制保留值且互不影响', type => {
    const source = serviceRules.value.find(item => item.type === type)!, session = createEditor(type, 'edit', source)
    session.draft.conditions.push({ field: 'isSplit', operator: 'eq', values: ['false'] }, amountCondition({ upperEnabled: true, upperValue: '100.00', lowerInclusive: false }))
    expect(saveEditor(session)).toBeUndefined()
    const saved = serviceRules.value.find(item => item.id === source.id)!
    expect(conditionSummary(saved.conditions[1]!)).toBe('是否有拆单发货 等于 否')
    expect(conditionSummary(saved.conditions[2]!)).toBe('订单总金额 大于 20.00 USD，且 小于等于 100.00 USD')
    const copy = createEditor(type, 'copy', saved)
    expect(copy.draft.conditions).toEqual(saved.conditions)
    copy.draft.conditions[1]!.values = ['true']; copy.draft.conditions[2]!.amountRange!.value = '30.00'
    expect(saved.conditions[1]!.values).toEqual(['false']); expect(saved.conditions[2]!.amountRange!.value).toBe('20.00')
    const count = serviceRules.value.length; discardEditor(copy.key); expect(serviceRules.value).toHaveLength(count)
  })
  it('拆单只接受单个稳定是或否，空值、未知、多选和反向运算符拒绝保存及启用', () => {
    const session = createEditor('assignment', 'edit', serviceRules.value[0]!)
    for (const values of [[], ['true', 'false'], ['是'], ['unknown'], ['TRUE'], [' false ']]) {
      session.draft.conditions = [{ field: 'isSplit', operator: 'eq', values }]
      expect(saveEditor(session)).toBeTruthy()
    }
    session.draft.conditions = [{ field: 'isSplit', operator: 'neq', values: ['false'] }]
    expect(saveEditor(session)).toContain('单选是或否')
    for (const value of ['true', 'false']) { session.draft.conditions = [{ field: 'isSplit', operator: 'eq', values: [value] }]; expect(validateRule(session.draft)).toBeUndefined() }
    const source = serviceRules.value[0]!; source.conditions = [{ field: 'isSplit', operator: 'eq', values: ['unknown'] }]
    expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('选项已失效')
    expect(source.enabled).toBe(false)
  })
  it('金额必须使用范围专用配置、至少一端及有效币种，不能复用外层等于或选值', () => {
    const rule = valid(), condition = createRuleCondition('orderAmount'); rule.conditions = [condition]
    expect(validateRule(rule)).toContain('至少勾选一个边界')
    condition.amountRange!.lowerEnabled = true; expect(validateRule(rule)).toContain('已勾选的边界须填写数值')
    condition.amountRange!.value = '0'; expect(validateRule(rule)).toContain('币种')
    for (const currency of ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'CAD', 'AUD', 'BRL', 'MXN', 'PLN', 'RUB']) { condition.amountRange!.currency = currency; expect(validateRule(rule)).toBeUndefined() }
    for (const currency of ['usd', 'XXX', 'SGD', ' USD ']) { condition.amountRange!.currency = currency; expect(validateRule(rule)).toContain('币种') }
    condition.amountRange!.currency = 'USD'; condition.operator = 'eq'; expect(validateRule(rule)).toContain('有效范围')
    condition.operator = 'range'; condition.values = ['20']; expect(validateRule(rule)).toContain('有效范围')
    rule.conditions = [{ field: 'orderAmount', operator: 'range', values: [] }]; expect(validateRule(rule)).toContain('有效范围')
    rule.conditions = [{ field: 'shop', operator: 'range', values: ['shop-us'] }]; expect(validateRule(rule)).toContain('运算符')
  })
  it('金额沿用精确定点数校验，拒绝科学计数、负数、超精度与倒置或空区间', () => {
    const rule = valid(), condition = amountCondition(); rule.conditions = [condition]
    for (const value of ['-1', '1e3', '1,000', '1.0000001', '1234567890123456789012345', 'NaN']) { condition.amountRange!.value = value; expect(validateRule(rule)).toContain('非负十进制定点数') }
    Object.assign(condition.amountRange!, { value: '9007199254740992.000002', upperValue: '9007199254740992.000001', upperEnabled: true })
    expect(validateRule(rule)).toContain('下界不能大于上界')
    Object.assign(condition.amountRange!, { value: '20.000001', upperValue: '20.000001', lowerInclusive: false })
    expect(validateRule(rule)).toContain('上下界相等时须同时包含边界')
    condition.amountRange!.lowerInclusive = true; expect(validateRule(rule)).toBeUndefined()
    condition.amountRange!.upperInclusive = false; expect(validateRule(rule)).toContain('上下界相等')
  })
  it('金额关闭一端保留原值且不参与数值校验，保存及启用均校验启用端', () => {
    const source = serviceRules.value[0]!, session = createEditor('assignment', 'edit', source)
    session.draft.conditions = [amountCondition({ value: 'not-a-number', lowerEnabled: false, upperEnabled: true, upperValue: '100.000001' })]
    expect(saveEditor(session)).toBeUndefined()
    const saved = serviceRules.value.find(item => item.id === source.id)!
    expect(saved.conditions[0]!.amountRange!.value).toBe('not-a-number')
    expect(conditionSummary(saved.conditions[0]!)).toBe('订单总金额 小于等于 100.000001 USD')
    saved.conditions[0]!.amountRange!.lowerEnabled = true
    expect(setRulesEnabled([{ id: saved.id, version: saved.version }], true).error).toContain('非负十进制定点数')
    expect(saved.enabled).toBe(false)
  })
  it.each(['assignment', 'feedback', 'message'] as const)('%s规则支持履约模式正反向多选，保存并复制后保留独立配置', type => {
    const source = serviceRules.value.find(item => item.type === type)!, edit = createEditor(type, 'edit', source)
    edit.draft.conditions.push({ field: 'fulfillmentMode', operator: 'eq', values: ['自配送', '平台履约'] })
    expect(validateRule(edit.draft)).toBeUndefined()
    expect(conditionSummary(edit.draft.conditions[1]!)).toBe('履约模式 等于 自配送、平台履约')
    edit.draft.conditions[1]!.operator = 'neq'
    expect(conditionSummary(edit.draft.conditions[1]!)).toBe('履约模式 不等于 自配送、平台履约')
    expect(saveEditor(edit)).toBeUndefined()
    const saved = serviceRules.value.find(item => item.id === source.id)!
    const copy = createEditor(type, 'copy', saved)
    expect(copy.draft.conditions).toEqual(saved.conditions); expect(copy.draft.enabled).toBe(false)
    copy.draft.conditions[1]!.values.splice(0, 1)
    expect(saved.conditions[1]!.values).toEqual(['自配送', '平台履约'])
    const count = serviceRules.value.length; discardEditor(copy.key); expect(serviceRules.value).toHaveLength(count)
  })
  it('履约模式空值、重复及未知枚举均拒绝保存，启用同样复验', () => {
    const source = serviceRules.value[0]!, before = clone(source), session = createEditor(source.type, 'edit', source)
    const condition = { field: 'fulfillmentMode' as const, operator: 'neq' as const, values: [] as string[] }
    session.draft.conditions = [condition]
    expect(saveEditor(session)).toBe('请填写履约模式条件')
    condition.values = ['自配送', '自配送']; expect(saveEditor(session)).toContain('重复值')
    for (const invalid of ['未知', 'seller', '平台发货', ' 平台履约 ']) {
      condition.values = [invalid]; expect(saveEditor(session)).toBe('履约模式选项已失效，请重新选择')
    }
    expect(serviceRules.value.find(item => item.id === source.id)).toEqual(before)
    source.conditions = [{ field: 'fulfillmentMode', operator: 'eq', values: ['unknown'] }]
    expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('履约模式选项已失效')
    expect(source.enabled).toBe(false); expect(serviceRuleLogs.value).toHaveLength(0)
  })
  it('分配动作可单独设置处理状态或标签，不强制指派；未勾选字段不校验', () => {
    const rule = valid(); Object.assign(rule.assignment, { assign: false, assignee: '', status: true, workStatus: 'processed', tag: false, tagIds: ['deleted'], prioritize: false })
    expect(validateRule(rule)).toBeUndefined()
    rule.assignment.status = false; expect(validateRule(rule)).toContain('至少选择一项执行动作')
    rule.assignment.tag = true; expect(validateRule(rule)).toContain('有效标签')
    rule.assignment.tagIds = [mailTagDefinitions[0]!.id]; expect(validateRule(rule)).toBeUndefined()
  })
  it('四动作组合保存只更新规则，不更改站内信或订单资料', () => {
    const before = JSON.stringify(mailSession)
    const session = createEditor('assignment', 'new'); session.draft = valid(); session.draft.id = ''; session.draft.name = '四动作规则'
    Object.assign(session.draft.assignment, { assign: true, status: true, tag: true, tagIds: [mailTagDefinitions[0]!.id], prioritize: true, priority: 'urgent' })
    expect(saveEditor(session)).toBeUndefined()
    expect(serviceRules.value.find(item => item.name === session.draft.name)?.assignment).toEqual(session.draft.assignment)
    expect(JSON.stringify(mailSession)).toBe(before)
  })
  it('触发事件不能跨类型，分配禁止延迟；延迟支持1到999整数', () => {
    const rule = valid(); rule.trigger = 'delivered'; expect(validateRule(rule)).toContain('触发时机')
    rule.trigger = 'incoming'; rule.timing = 'delayed'; expect(validateRule(rule)).toContain('执行时机')
    const feedback = valid('feedback'); feedback.timing = 'delayed'
    for (const delay of [0, 1.5, 1000]) { feedback.delay = delay; expect(validateRule(feedback)).toContain('1～999') }
    for (const delay of [1, 999]) { feedback.delay = delay; expect(validateRule(feedback)).toBeUndefined() }
    expect(typeTriggers.message).toContain('unpaidOrder'); expect(typeTriggers.message).toContain('orderOutbound')
  })
  it('空条件、重复条件、跨平台站点和未知店铺不能保存', () => {
    const rule = valid(); rule.conditions = []; expect(validateRule(rule)).toContain('至少选择')
    rule.conditions = [{ field: 'shop', operator: 'eq', values: ['shop-us'] }, { field: 'shop', operator: 'eq', values: ['shop-uk'] }]; expect(validateRule(rule)).toContain('不能重复')
    rule.conditions = [{ field: 'site', operator: 'eq', values: ['US'] }]; expect(validateRule(rule)).toContain('选项已失效')
    rule.conditions = [{ field: 'shop', operator: 'neq', values: ['unknown'] }]; expect(validateRule(rule)).toContain('选项已失效')
  })
  it('SKU分隔去重但保留大小写和内部空格，1000项以外阻断', () => {
    expect(parseSkuValues(' A 1\nA 1,b-2；B-2\r\n; ')).toEqual(['A 1', 'b-2', 'B-2'])
    const rule = valid(); rule.conditions = [{ field: 'systemSku', operator: 'eq', values: Array.from({ length: 1001 }, (_, index) => `SKU-${index}`) }]
    expect(validateRule(rule)).toContain('1000')
  })
  it('按用途隔离模板，并在保存前重验停用和删除状态', () => {
    const feedback = valid('feedback'), message = valid('message')
    expect(availableTemplates('feedback').some(item => item.value === 'review-reply-help')).toBe(false)
    expect(availableTemplates('message').some(item => item.value === 'phrase-greeting')).toBe(false)
    feedback.templateId = 'review-reply-help'; expect(validateRule(feedback)).toContain('类型不符')
    message.templateId = 'buyer-thanks'; expect(validateRule(message)).toContain('类型不符')
    feedback.templateId = 'buyer-thanks'; feedbackTemplateSession.templates.find(item => item.id === feedback.templateId)!.enabled = false
    expect(validateRule(feedback)).toContain('停用')
    const session = createEditor('message', 'edit', serviceRules.value.find(item => item.type === 'message')!)
    templateSession.templates = templateSession.templates.filter(item => item.id !== session.draft.templateId)
    expect(saveEditor(session)).toContain('删除')
  })
  it('消息预览复用当前模板，保留变量但不展示或发送内部参考标题', () => {
    const rule = valid('message'), source = templateSession.templates.find(item => item.id === rule.templateId)!
    source.subject = 'INTERNAL ONLY'; source.body = 'Hello {{buyerId}}'; delete source.bodyHtml
    expect(templatePreview(rule)?.body).toBe('Hello {{buyerId}}')
    expect(templatePreview(rule)?.variables).toEqual(['买家 ID'])
    expect(templatePreview(rule)?.body).not.toContain('INTERNAL ONLY')
    source.body = 'Updated {{orderNo}}'; expect(templatePreview(rule)?.body).toBe('Updated {{orderNo}}')
  })
  it('复制为独立停用草稿，取消不新增规则，保存生成独立身份', () => {
    const source = serviceRules.value[0]!; source.enabled = true
    const before = serviceRules.value.length, session = createEditor(source.type, 'copy', source)
    expect(session.draft.enabled).toBe(false); expect(session.draft.id).toBe('')
    session.draft.assignment.assignee = '客服03'; expect(source.assignment.assignee).toBe('客服01')
    discardEditor(session.key); expect(serviceRules.value).toHaveLength(before)
    const copy = createEditor(source.type, 'copy', source); expect(saveEditor(copy)).toBeUndefined()
    expect(serviceRules.value).toHaveLength(before + 1); expect(serviceRules.value[serviceRules.value.length - 1]?.id).not.toBe(source.id)
    expect(serviceRules.value[serviceRules.value.length - 1]?.enabled).toBe(false)
  })
  it('切页签复用同一编辑草稿，关闭业务页签清理', () => {
    const source = serviceRules.value[0]!, session = createEditor(source.type, 'edit', source)
    session.draft.note = '未保存'; session.skuInputs.systemSku = 'A\n'
    expect(createEditor(source.type, 'edit', source)).toBe(session)
    expect(createEditor(source.type, 'edit', source).draft.note).toBe('未保存')
    清理业务页签(`/oms/ebay-service/automation-rules/edit/${source.id}`)
    expect(editorSessions.has(session.key)).toBe(false)
  })
  it('源规则改动或删除后，旧编辑不能覆盖', () => {
    const source = serviceRules.value[0]!, session = createEditor(source.type, 'edit', source)
    source.version++; expect(saveEditor(session)).toContain('已变化')
    expect(deleteRule(source.id, source.version)).toBeUndefined()
    expect(saveEditor(session)).toContain('已结束')
    expect(serviceRuleLogs.value.some(item => item.ruleId === source.id && item.action === '删除')).toBe(true)
  })
  it('批量启用预先检查全部目标，失效模板或旧版本不能造成部分写入', () => {
    const target = serviceRules.value.filter(item => item.type === 'feedback').slice(0, 2)
    feedbackTemplateSession.templates.find(item => item.id === target[1]!.templateId)!.enabled = false
    const result = setRulesEnabled(target.map(item => ({ id: item.id, version: item.version })), true)
    expect(result.error).toContain('停用'); expect(target.every(item => !item.enabled)).toBe(true); expect(serviceRuleLogs.value).toHaveLength(0)
    expect(setRulesEnabled([{ id: target[0]!.id, version: 99 }], true).error).toContain('已变化')
  })
  it('同状态跳过不写日志，停用失效模板仍可操作', () => {
    const rule = serviceRules.value.find(item => item.type === 'feedback')!
    expect(setRulesEnabled([{ id: rule.id, version: rule.version }], false)).toEqual({ changed: 0, skipped: 1 })
    rule.enabled = true; feedbackTemplateSession.templates.find(item => item.id === rule.templateId)!.enabled = false
    expect(setRulesEnabled([{ id: rule.id, version: rule.version }], false)).toEqual({ changed: 1, skipped: 0 })
    expect(serviceRuleLogs.value).toHaveLength(1)
  })
  it('同类排序保留其他类型，过期快照和跨类型拒绝', () => {
    const list = serviceRules.value.filter(item => item.type === 'assignment').sort((a, b) => a.order - b.order), other = clone(serviceRules.value.filter(item => item.type !== 'assignment'))
    const before = JSON.stringify(list)
    expect(moveRule(list[2]!.id, list[0]!.id, before)).toBeUndefined()
    expect(serviceRules.value.filter(item => item.type === 'assignment').sort((a, b) => a.order - b.order)[0]?.id).toBe(list[2]!.id)
    expect(serviceRules.value.filter(item => item.type !== 'assignment')).toEqual(other)
    expect(moveRule(list[0]!.id, list[1]!.id, before)).toContain('已变化')
    expect(moveRule(list[0]!.id, other[0]!.id, '')).toContain('失效')
  })
  it('名称按同类判重，跨类型可同名；保存后回到所属分类', () => {
    const session = createEditor('message', 'new'); session.draft = valid('message'); session.draft.id = ''; session.draft.name = serviceRules.value[0]!.name
    expect(saveEditor(session)).toBeUndefined(); expect(activeRuleType.value).toBe('message')
    const duplicate = defaultRule('message'); duplicate.name = session.draft.name
    expect(validateRule(duplicate)).toContain('同名')
  })
})
