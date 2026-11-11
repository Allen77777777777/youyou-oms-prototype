import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditor, formatRuleTime, normalizeServiceRuleTimes, resetServiceRules, saveEditor, serviceRuleLogs, serviceRules, setRulesEnabled, sortedServiceRules, timestamp } from './规则模型'
import { resetTemplateSession } from '../消息模板管理/模型'

beforeEach(() => { resetTemplateSession(); resetServiceRules() })
afterEach(() => { resetTemplateSession(); resetServiceRules(); vi.useRealTimers() })

describe('自动客服规则统一北京时区和UTC事件', () => {
  it('来源和新操作保存UTC，列表格式化跨北京日期且不猜无偏移来源', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T17:30:25.123Z'))
    expect(serviceRules.value.every(rule => /Z$/.test(rule.updatedAt))).toBe(true)
    expect(timestamp()).toBe('2026-11-06T17:30:25.123Z')
    expect(formatRuleTime(timestamp())).toBe('2026-11-07 01:30:25')
    expect(formatRuleTime('2026-11-06T23:30:00-05:00')).toBe('2026-11-07 12:30:00')
    expect(formatRuleTime('2026-11-06 23:30:00')).toBe('时间待核实')
    const source = serviceRules.value[0]!, editor = createEditor(source.type, 'edit', source)
    editor.draft.note = '北京时间统一后的配置'
    expect(saveEditor(editor)).toBeUndefined()
    expect(serviceRules.value.find(rule => rule.id === source.id)?.updatedAt).toBe(timestamp())
    expect(serviceRuleLogs.value[0]?.at).toBe(timestamp())
  })
  it('仅按已知本模块旧生成口径迁移北京更新时间，非法日历不自动修正', () => {
    const source = serviceRules.value[0]!
    source.updatedAt = '2026-10-29 09:30:00'; normalizeServiceRuleTimes(source)
    expect(source.updatedAt).toBe('2026-10-29T01:30:00.000Z')
    expect(formatRuleTime(source.updatedAt)).toBe('2026-10-29 09:30:00')
    source.updatedAt = '2026-02-30 09:30:00'; normalizeServiceRuleTimes(source)
    expect(source.updatedAt).toBe('2026-02-30 09:30:00')
    expect(formatRuleTime(source.updatedAt)).toBe('时间待核实')
  })
  it('旧非北京配置停用并留原时段，清空当前范围，重复读取不重复迁移', () => {
    const source = serviceRules.value.find(rule => rule.type === 'autoReply')!
    source.enabled = true
    Object.assign(source.autoReply!, { timeZone: 'Europe/London', specificEnabled: true, specificPeriods: [{ id: 'old-holiday', start: '2026-12-24 18:00', end: '2026-12-28 09:00' }] })
    const oldWeekly = JSON.stringify(source.autoReply!.weekly), oldVersion = source.version
    sortedServiceRules('autoReply')
    expect(source).toMatchObject({ enabled: false, version: oldVersion + 1, autoReply: { timeZone: 'Asia/Shanghai', timeZoneReviewRequired: true, weeklyEnabled: false, specificEnabled: false, specificPeriods: [] } })
    expect(source.autoReply!.weekly.every(day => !day.enabled)).toBe(true)
    expect(source.autoReply!.legacySchedule).toMatchObject({ timeZone: 'Europe/London', specificPeriods: [{ start: '2026-12-24 18:00', end: '2026-12-28 09:00' }] })
    expect(JSON.stringify(source.autoReply!.legacySchedule!.weekly)).toBe(oldWeekly)
    expect(setRulesEnabled([{ id: source.id, version: source.version }], true).error).toContain('核对')
    sortedServiceRules('autoReply')
    expect(serviceRuleLogs.value).toHaveLength(1)
    expect(serviceRuleLogs.value[0]).toMatchObject({ action: '时区配置待核对', operator: '系统', result: '待核对' })
    expect(serviceRuleLogs.value[0]?.at).toMatch(/Z$/)
  })
  it('旧配置须重新填写有效北京时段并明确核对才保存，保存后保留旧时段与核对UTC时刻', () => {
    const source = serviceRules.value.find(rule => rule.type === 'autoReply')!
    source.autoReply!.timeZone = 'America/Los_Angeles'
    const editor = createEditor('autoReply', 'edit', source)
    editor.draft.autoReply!.weeklyEnabled = true
    Object.assign(editor.draft.autoReply!.weekly[0]!, { enabled: true, start: '22:00', end: '06:00' })
    expect(saveEditor(editor)).toContain('核对')
    editor.draft.autoReply!.timeZoneReviewRequired = false
    expect(saveEditor(editor)).toBeUndefined()
    const saved = serviceRules.value.find(rule => rule.id === source.id)!
    expect(saved.enabled).toBe(false)
    expect(saved.autoReply!.legacySchedule!.timeZone).toBe('America/Los_Angeles')
    expect(saved.autoReply!.legacySchedule!.reviewedAt).toMatch(/Z$/)
    expect(saved.autoReply!.weekly[0]).toMatchObject({ start: '22:00', end: '06:00' })
    expect(setRulesEnabled([{ id: saved.id, version: saved.version }], true).error).toBeUndefined()
  })
})
