import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  autoReplyScheduleSummary, autoReplyTimeZones, autoReplyShopIds, autoReplyShopSummary, normalizeAutoReplyShops, defaultAutoReplyConfig, validateAutoReplyConfig, weeklyPeriodSummary,
  actionSummary, availableTemplates, clone, createEditor, defaultRule, deleteRule, discardEditor, moveRule,
  resetServiceRules, saveEditor, serviceRuleLogs, serviceRules, setRulesEnabled, sortedServiceRules,
  templatePreview, validateRule, ruleTriggerLabel, timingSummary, triggerLabels, type ServiceRule,
} from './规则模型'
import { resetTemplateSession, templateSession } from '../消息模板管理/模型'
import { mailSession } from '../eBay站内信/会话'

beforeEach(() => { resetTemplateSession(); resetServiceRules() })
afterEach(() => { resetTemplateSession(); resetServiceRules() })
const sourceReply = () => serviceRules.value.find(rule => rule.type === 'autoReply')!
function newReply(shopIds = ['shop-uk']): ServiceRule {
  const rule = defaultRule('autoReply')
  rule.name = '英国店铺休息回复'; rule.templateId = 'template-rest-auto-reply'; rule.autoReply!.shopIds = shopIds
  return rule
}

describe('自动回复休息时段配置', () => {
  it('默认北京时间与周末全天，每次配置独立且不需要订单条件或数字优先级', () => {
    const draft = defaultRule('autoReply'), config = draft.autoReply!
    expect(draft).toMatchObject({ enabled: false, order: 0, trigger: 'incoming', timing: 'immediate', conditions: [] })
    expect(config).toMatchObject({ shopIds: [], timeZone: 'Asia/Shanghai', weeklyEnabled: true, specificEnabled: false, specificPeriods: [] })
    expect(config.weekly.filter(day => day.enabled).map(day => day.day)).toEqual([6, 7])
    expect(config.weekly.filter(day => day.enabled).every(day => day.allDay)).toBe(true)
    config.weekly[0]!.enabled = true
    expect(defaultAutoReplyConfig().weekly[0]!.enabled).toBe(false)
    expect(validateRule(newReply())).toBeUndefined()
  })
  it('仅接受北京时间，不接受其他IANA时区、固定偏移或空值', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']
    for (const zone of autoReplyTimeZones) { config.timeZone = zone.value; expect(validateAutoReplyConfig(config)).toBeUndefined() }
    for (const zone of ['', '+08:00', 'Asia/Unknown', 'Asia/Shanghai ', 'Europe/London', 'UTC']) { config.timeZone = zone; expect(validateAutoReplyConfig(config)).toContain('北京时间') }
  })
  it('每周支持当天、跨天和明确全天，起止相同不能冒充全天', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']
    const sunday = config.weekly[6]!
    Object.assign(sunday, { allDay: false, start: '18:00', end: '09:00' })
    expect(validateAutoReplyConfig(config)).toBeUndefined()
    expect(weeklyPeriodSummary(sunday)).toBe('周日 18:00～次日 09:00')
    Object.assign(sunday, { start: '09:00', end: '18:00' })
    expect(weeklyPeriodSummary(sunday)).toBe('周日 09:00～18:00')
    Object.assign(sunday, { start: '00:00', end: '00:00' })
    expect(validateAutoReplyConfig(config)).toContain('不能相同')
    sunday.allDay = true; expect(validateAutoReplyConfig(config)).toBeUndefined()
    expect(weeklyPeriodSummary(sunday)).toBe('周日 全天休息')
  })
  it('星期必须完整唯一，启用每周时段必须至少勾选一天，错误时分不能保存', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']
    config.weekly[0]!.day = 6; expect(validateAutoReplyConfig(config)).toContain('周一至周日')
    config.weekly = defaultAutoReplyConfig().weekly
    config.weekly.forEach(day => { day.enabled = false }); expect(validateAutoReplyConfig(config)).toContain('请选择每周休息日')
    const day = config.weekly[0]!; day.enabled = true; day.allDay = false
    for (const time of ['', '24:00', '23:60', '9:00', '12:00:00']) { day.start = time; expect(validateAutoReplyConfig(config)).toContain('有效的每周休息') }
  })
  it('可单独配置特定时段或与每周并用，至少启用一种有效配置', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']; config.weeklyEnabled = false
    expect(validateAutoReplyConfig(config)).toContain('至少设置')
    config.specificEnabled = true; expect(validateAutoReplyConfig(config)).toContain('至少添加')
    config.specificPeriods = [{ id: 'holiday', start: '2026-12-24 18:00', end: '2026-12-28 09:00' }]
    expect(validateAutoReplyConfig(config)).toBeUndefined()
    expect(autoReplyScheduleSummary(config)).toEqual(['特定：2026-12-24 18:00 ～ 2026-12-28 09:00'])
    config.weeklyEnabled = true
    expect(autoReplyScheduleSummary(config)).toEqual(['每周：周六 全天休息；周日 全天休息', '特定：2026-12-24 18:00 ～ 2026-12-28 09:00'])
    expect(validateAutoReplyConfig(config)).toBeUndefined()
  })
  it('特定时段校验真实日历、分钟格式和严格起止，不借机器时区容错', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']; config.specificEnabled = true
    config.specificPeriods = [{ id: 'holiday', start: '2028-02-29 00:00', end: '2028-03-01 00:00' }]
    expect(validateAutoReplyConfig(config)).toBeUndefined()
    const period = config.specificPeriods[0]!
    for (const date of ['2027-02-29 00:00', '2026-04-31 10:00', '2026-13-01 10:00', '2026-01-00 10:00', '2026-01-01 24:00', '2026-01-01T10:00', '']) {
      period.start = date; expect(validateAutoReplyConfig(config)).toContain('有效的特定时间段')
    }
    period.start = period.end; expect(validateAutoReplyConfig(config)).toContain('结束时间必须晚于')
    period.start = '2029-01-01 00:00'; expect(validateAutoReplyConfig(config)).toContain('结束时间必须晚于')
  })
  it('关闭某种时段保留其草稿，隐藏配置不参与生效摘要和启用校验', () => {
    const config = defaultAutoReplyConfig(); config.shopIds = ['shop-uk']
    config.specificPeriods = [{ id: 'unfinished', start: '', end: '' }]
    expect(validateAutoReplyConfig(config)).toBeUndefined()
    expect(autoReplyScheduleSummary(config)).toHaveLength(1)
    config.specificEnabled = true; expect(validateAutoReplyConfig(config)).toContain('有效的特定时间段')
    config.specificEnabled = false; expect(config.specificPeriods[0]!.start).toBe('')
  })
})

describe('自动回复规则店铺唯一性及编辑保护', () => {
  it('一条规则可关联多个店铺，保存只创建一条记录且完整保留时间与模板', () => {
    const editor = createEditor('autoReply', 'new'), rule = newReply(['shop-uk', 'shop-de'])
    rule.autoReply!.specificEnabled = true
    rule.autoReply!.specificPeriods = [{ id: 'holiday', start: '2026-12-24 18:00', end: '2026-12-28 09:00' }]
    editor.draft = rule
    const before = serviceRules.value.length
    expect(saveEditor(editor)).toBeUndefined()
    expect(serviceRules.value).toHaveLength(before + 1)
    const saved = serviceRules.value.find(item => item.name === rule.name)!
    expect(saved.autoReply).toEqual(rule.autoReply); expect(saved.templateId).toBe(rule.templateId)
    expect(saved.autoReply!.shopIds).toEqual(['shop-uk', 'shop-de'])
    expect(autoReplyShopSummary(saved.autoReply)).toBe('演示店铺-UK、演示店铺-DE')
    expect(serviceRuleLogs.value[0]!.content).toContain('演示店铺-UK、演示店铺-DE')
  })
  it('多个账号与其他规则有任一交集就整次拒绝，未冲突账号不部分保存', () => {
    const editor = createEditor('autoReply', 'new'); editor.draft = newReply(['shop-uk', 'shop-us'])
    const before = clone(serviceRules.value)
    expect(saveEditor(editor)).toContain('已配置自动回复')
    expect(serviceRules.value).toEqual(before); expect(serviceRuleLogs.value).toHaveLength(0)
    expect(editor.draft.autoReply!.shopIds).toEqual(['shop-uk', 'shop-us'])
    expect(validateRule(newReply(['shop-uk']))).toBeUndefined()
  })
  it('多选账号拒绝空、未知、重复和非法值，不静默去重或丢弃错误值', () => {
    const rule = newReply()
    for (const values of [[], ['shop-uk', 'shop-uk'], ['shop-uk', 'missing'], ['shop-uk', ''], ['shop-uk', ' shop-de '], ['shop-uk', 3], null, 'shop-uk']) {
      Object.assign(rule.autoReply!, { shopIds: values })
      const before = clone(rule.autoReply)
      expect(validateRule(rule)).toBeTruthy()
      normalizeAutoReplyShops(rule.autoReply)
      expect(rule.autoReply).toEqual(before)
    }
    rule.autoReply!.shopIds = ['shop-uk', 'shop-de']; expect(validateRule(rule)).toBeUndefined()
  })
  it('编辑移除账号后立即释放名额，保留账号继续占用，取消编辑不释放', () => {
    const source = sourceReply(); source.autoReply!.shopIds.push('shop-uk')
    const cancel = createEditor('autoReply', 'edit', source); cancel.draft.autoReply!.shopIds = ['shop-us']
    discardEditor(cancel.key)
    expect(validateRule(newReply(['shop-uk']))).toContain('已配置自动回复')
    const editor = createEditor('autoReply', 'edit', source); editor.draft.autoReply!.shopIds = ['shop-uk']
    expect(saveEditor(editor)).toBeUndefined()
    expect(validateRule(newReply(['shop-us']))).toBeUndefined()
    expect(validateRule(newReply(['shop-uk']))).toContain('已配置自动回复')
  })
  it('旧单店铺记录参与占用校验，编辑及已打开草稿无损迁移，保存只保留数组', () => {
    const source = sourceReply(), config = source.autoReply!
    Reflect.deleteProperty(config, 'shopIds'); config.shopId = 'shop-us'
    const original = clone(source)
    expect(autoReplyShopIds(config)).toEqual(['shop-us'])
    expect(validateRule(source)).toBeUndefined()
    expect(validateRule(newReply(['shop-uk', 'shop-us']))).toContain('已配置自动回复')
    const editor = createEditor('autoReply', 'edit', source)
    expect(editor.draft.autoReply!.shopIds).toEqual(['shop-us']); expect(editor.draft.autoReply!.shopId).toBeUndefined()
    expect(editor.draft.autoReply!.weekly).toEqual(original.autoReply!.weekly)
    expect(editor.draft.templateId).toBe(original.templateId); expect(source).toEqual(original)
    editor.draft.note = '保留未保存说明'
    Reflect.deleteProperty(editor.draft.autoReply!, 'shopIds'); editor.draft.autoReply!.shopId = 'shop-us'
    expect(createEditor('autoReply', 'edit', source)).toBe(editor)
    expect(editor.draft.autoReply!.shopIds).toEqual(['shop-us']); expect(editor.draft.note).toBe('保留未保存说明')
    expect(saveEditor(editor)).toBeUndefined()
    const saved = serviceRules.value.find(item => item.id === source.id)!
    expect(saved.autoReply!.shopIds).toEqual(['shop-us']); expect(Object.prototype.hasOwnProperty.call(saved.autoReply!, 'shopId')).toBe(false)
    expect(saved.autoReply!.weekly).toEqual(original.autoReply!.weekly); expect(saved.templateId).toBe(original.templateId)
  })
  it('数组存在时始终优先于旧字段，空数组及非法数组不能回退旧账号', () => {
    const config = defaultAutoReplyConfig(); config.shopId = 'shop-us'; config.shopIds = ['shop-uk', 'shop-de']
    expect(autoReplyShopIds(config)).toEqual(['shop-uk', 'shop-de'])
    normalizeAutoReplyShops(config); expect(config.shopId).toBeUndefined()
    config.shopIds = []; config.shopId = 'shop-us'
    expect(autoReplyShopIds(config)).toEqual([]); expect(validateAutoReplyConfig(config)).toContain('请选择店铺账号')
    config.shopIds = ['shop-uk', 'shop-uk']; normalizeAutoReplyShops(config)
    expect(config.shopIds).toEqual(['shop-uk', 'shop-uk']); expect(validateAutoReplyConfig(config)).toContain('重复选择')
  })
  it('所有买家来信使用同一触发文案，其他类型事件名称保持原定义', () => {
    const rule = newReply()
    expect(ruleTriggerLabel(rule)).toBe('收到买家来信')
    expect(timingSummary(rule)).toBe('休息时段收到买家来信后回复')
    expect(ruleTriggerLabel(rule)).not.toContain('新买家')
    for (const other of serviceRules.value.filter(item => item.type !== 'autoReply')) expect(ruleTriggerLabel(other)).toBe(triggerLabels[other.trigger])
  })
  it('同店铺最多一条，包括已停用配置；编辑自己允许，其他三类店铺条件不占名额', () => {
    const source = sourceReply()
    expect(source.enabled).toBe(false); expect(validateRule(source)).toBeUndefined()
    expect(validateRule(newReply(['shop-us']))).toContain('已配置自动回复')
    expect(validateRule(newReply(['shop-uk']))).toBeUndefined()
    const edit = createEditor('autoReply', 'edit', source); edit.draft.note = '修改休息排班'
    expect(saveEditor(edit)).toBeUndefined()
    expect(serviceRules.value.filter(rule => rule.type === 'autoReply')).toHaveLength(1)
  })
  it('账号必须来自现有店铺资料，自动回复固定来信触发及立即回复，不接收订单条件', () => {
    const rule = newReply()
    rule.autoReply!.shopIds = []; expect(validateRule(rule)).toContain('请选择店铺账号')
    rule.autoReply!.shopIds = ['missing']; expect(validateRule(rule)).toContain('店铺账号已失效')
    rule.autoReply!.shopIds = ['shop-uk']; rule.trigger = 'paid'; expect(validateRule(rule)).toContain('触发时机')
    rule.trigger = 'incoming'; rule.timing = 'delayed'; expect(validateRule(rule)).toContain('执行时机')
    rule.timing = 'immediate'; rule.conditions = [{ field: 'shop', operator: 'eq', values: ['shop-uk'] }]
    expect(validateRule(rule)).toContain('不支持订单判断条件')
  })
  it('新建及复制清空店铺，复制保留独立时间和模板且默认停用', () => {
    const source = sourceReply(); source.enabled = true; source.autoReply!.shopIds.push('shop-uk')
    expect(createEditor('autoReply', 'new').draft.autoReply!.shopIds).toEqual([])
    const copy = createEditor('autoReply', 'copy', source)
    expect(copy.draft).toMatchObject({ enabled: false, templateId: source.templateId, autoReply: { shopIds: [] } })
    expect(copy.draft.autoReply!.weekly).toEqual(source.autoReply!.weekly)
    copy.draft.autoReply!.weekly[0]!.enabled = true
    expect(source.autoReply!.weekly[0]!.enabled).toBe(false)
    expect(saveEditor(copy)).toContain('请选择店铺账号')
    copy.draft.autoReply!.shopIds = ['shop-de']; expect(saveEditor(copy)).toBeUndefined()
    expect(serviceRules.value.filter(rule => rule.type === 'autoReply')).toHaveLength(2)
  })
  it('两个新建草稿同时选同一店铺，先保存者成功，后保存者保留草稿并阻断', () => {
    const first = createEditor('autoReply', 'new'), second = createEditor('autoReply', 'new')
    first.draft = newReply(['shop-uk', 'shop-de']); second.draft = newReply(); second.draft.name = '另一份英国规则'
    expect(saveEditor(first)).toBeUndefined()
    expect(saveEditor(second)).toContain('已配置自动回复')
    expect(second.draft.autoReply!.shopIds).toEqual(['shop-uk']); expect(serviceRules.value.filter(rule => autoReplyShopIds(rule.autoReply).includes('shop-uk'))).toHaveLength(1)
    discardEditor(second.key)
  })
  it('启用前复验唯一性、时段和模板；批量失败不部分启用', () => {
    const first = sourceReply(), another = newReply(['shop-uk', 'shop-us']); another.id = 'conflict'; another.name = '冲突规则'
    serviceRules.value.push(another)
    expect(setRulesEnabled([{ id: first.id, version: first.version }, { id: another.id, version: another.version }], true).error).toContain('已配置自动回复')
    expect(first.enabled).toBe(false); expect(another.enabled).toBe(false); serviceRules.value.pop()
    first.autoReply!.weeklyEnabled = false
    expect(setRulesEnabled([{ id: first.id, version: first.version }], true).error).toContain('至少设置')
    first.autoReply!.weeklyEnabled = true
    templateSession.templates.find(item => item.id === first.templateId)!.enabled = false
    expect(setRulesEnabled([{ id: first.id, version: first.version }], true).error).toContain('停用')
    expect(first.enabled).toBe(false)
  })
  it('回复复用有效站内信模板、纯文本预览和附件用途边界', () => {
    const source = sourceReply()
    expect(availableTemplates('autoReply')).toEqual(availableTemplates('message'))
    expect(availableTemplates('autoReply').some(item => item.value === 'phrase-greeting')).toBe(false)
    expect(templatePreview(source)?.body).toContain('working hours')
    expect(actionSummary(source)[0]).toContain('回复买家')
    source.templateId = 'phrase-greeting'; expect(validateRule(source)).toContain('类型不符')
  })
  it('保存日志保留新旧账号、时区、两类时段和模板；不更改站内信或建立发送结果', () => {
    const source = sourceReply(), before = JSON.stringify(mailSession), edit = createEditor('autoReply', 'edit', source)
    edit.draft.autoReply!.shopIds = ['shop-uk']
    edit.draft.autoReply!.specificEnabled = true
    edit.draft.autoReply!.specificPeriods = [{ id: 'holiday', start: '2026-12-24 18:00', end: '2026-12-28 09:00' }]
    expect(saveEditor(edit)).toBeUndefined()
    const log = serviceRuleLogs.value[0]!.content
    for (const value of ['演示店铺-UK', 'Asia/Shanghai', '每周', '2026-12-24 18:00', 'template-rest-auto-reply', '变更前', 'shop-us', 'Asia/Shanghai']) expect(log).toContain(value)
    expect(log).not.toContain('优先级'); expect(log).not.toContain('0项条件')
    expect(JSON.stringify(mailSession)).toBe(before)
  })
  it('编辑保持版本保护；停用也占名额，删除后释放且保留删除日志', () => {
    const source = sourceReply(), edit = createEditor('autoReply', 'edit', source), old = clone(edit.draft)
    expect(setRulesEnabled([{ id: source.id, version: source.version }], true).changed).toBe(1)
    expect(saveEditor(edit)).toContain('已变化'); expect(edit.draft).toEqual(old)
    expect(deleteRule(source.id, source.version)).toBeUndefined()
    expect(validateRule(newReply(['shop-us']))).toBeUndefined()
    expect(serviceRuleLogs.value.some(log => log.ruleId === source.id && log.action === '删除')).toBe(true)
  })
  it('自动回复按店铺展示且拒绝隐藏数字调序，不改其他类型优先级', () => {
    const first = sourceReply(), second = newReply(); second.id = 'uk-reply'; second.order = -100
    serviceRules.value.push(second)
    const originals = clone(serviceRules.value.filter(rule => rule.type !== 'autoReply'))
    expect(sortedServiceRules('autoReply').map(rule => rule.autoReply!.shopIds)).toEqual([['shop-uk'], ['shop-us']])
    expect(moveRule(first.id, second.id, JSON.stringify(sortedServiceRules('autoReply')))).toContain('无需调整优先级')
    expect(serviceRules.value.filter(rule => rule.type !== 'autoReply')).toEqual(originals)
  })
})
