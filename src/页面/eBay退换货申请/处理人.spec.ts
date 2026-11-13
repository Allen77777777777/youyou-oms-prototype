import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import type { ReturnRecord } from './模型'
import { assignReturnHandlers, captureReturnHandlers, getReturnHandlerIds, getReturnHandlerPresentation, getReturnHandlerSourceLines, initializeReturnHandlers, matchesReturnHandlerFilter, type ReturnHandlerSourceLine } from './处理人'

const at = '2026-11-13T01:00:00Z'
const line = (systemSku = 'HOME-RACK-01', sourceId = 'line-1'): ReturnHandlerSourceLine => ({ sourceId, systemSku, verified: true })
const row = () => ({ id: 'RETURN-1', shopId: 'shop-us', orderNo: 'ORDER-1', state: 'RETURN_REQUESTED', status: 'RETURN_REQUESTED',
  sku: 'HOME-RACK-01', logs: [] } as unknown as ReturnRecord)
const initialize = (record: ReturnRecord) => initializeReturnHandlers(record, { at, actorId: 'system', lines: [line()] })

describe('退货处理人 P01～P03', () => {
  it('创建时保存名单、来源、操作者和时刻，目录变更与重复初始化均不静默重算', () => {
    const record = row(), read = vi.fn(() => ['staff-01', 'staff-01'])
    expect(initializeReturnHandlers(record, { at, actorId: 'system', lines: [line()] }, read)).toEqual({ ok: true, version: 1, changed: true })
    expect(record.handlerAssignment).toMatchObject({ shopId: record.shopId, returnId: record.id, version: 1,
      events: [{ version: 1, handlerIds: ['staff-01'], previousHandlerIds: [], assignedAt: at, actorId: 'system', source: 'initial', manualOverride: false }] })
    read.mockReturnValue(['staff-02'])
    record.sku = 'OUT-CHAIR-02'
    expect(getReturnHandlerIds(record)).toEqual(['staff-01'])
    expect(initializeReturnHandlers(record, { at, actorId: 'viewer', lines: [line()] }, read)).toEqual({ ok: true, version: 1, changed: false })
    expect(read).toHaveBeenCalledTimes(1)
    expect(record.logs).toHaveLength(1)
  })

  it('普通读取缺历史只显示未记录，不查目录或为查看人生成责任', () => {
    const record = row()
    expect(getReturnHandlerIds(record)).toEqual([])
    expect(getReturnHandlerPresentation(record)).toMatchObject({ status: 'unrecorded', label: '未记录', version: 0 })
    expect(record.handlerAssignment).toBeUndefined()
    expect(record.logs).toEqual([])
    expect(matchesReturnHandlerFilter(record, [''])).toBe(false)
  })

  it('未核实交易行不以商品卡 SKU 分配，显式记录空名单与原因', () => {
    const record = row()
    expect(getReturnHandlerSourceLines(record)[0]).toMatchObject({ verified: false, issue: '本次申请交易商品行尚未核实' })
    expect(initializeReturnHandlers(record, { at, actorId: 'system' }).ok).toBe(true)
    expect(getReturnHandlerPresentation(record)).toMatchObject({ status: 'recorded', label: '未分配', handlerIds: [] })
    expect(getReturnHandlerPresentation(record).issues.join(' ')).toContain('本次申请交易商品行尚未核实')
    expect(matchesReturnHandlerFilter(record, [''])).toBe(true)
  })

  it('部分匹配保留已知人员及每条未匹配来源，不将缺失当完整或丢掉已知人员', () => {
    const record = row()
    initializeReturnHandlers(record, { at, actorId: 'system', lines: [line(), line('NO-OWNER', 'line-2'),
      { sourceId: 'unresolved-transaction', verified: false, issue: '交易行未核实' }, line('HOME-RACK-01', 'line-4')] })
    expect(getReturnHandlerIds(record)).toEqual(['staff-01'])
    expect(getReturnHandlerPresentation(record).issues).toEqual(['NO-OWNER：系统 SKU 无有效运营人员绑定', 'unresolved-transaction：交易行未核实'])
    expect(record.handlerAssignment!.events[0]!.lines).toHaveLength(4)
    expect(matchesReturnHandlerFilter(record, ['staff-01'])).toBe(true)
    expect(matchesReturnHandlerFilter(record, [''])).toBe(false)
  })

  it('可信补齐必须有适用规则与权限，接受后保存前后名单和版本', () => {
    const record = row()
    initialize(record)
    const change = { expectedVersion: 1, source: 'trusted-association' as const, at, actorId: 'staff-03', authorized: true, lines: [line('OUT-CHAIR-02')] }
    expect(assignReturnHandlers(record, change).ok).toBe(false)
    expect(assignReturnHandlers(record, { ...change, associationAllowed: true, authorized: false }).ok).toBe(false)
    expect(assignReturnHandlers(record, { ...change, associationAllowed: true })).toEqual({ ok: true, version: 2, changed: true })
    expect(getReturnHandlerIds(record)).toEqual(['staff-02'])
    expect(record.handlerAssignment!.events[1]).toMatchObject({ previousHandlerIds: ['staff-01'], handlerIds: ['staff-02'], actorId: 'staff-03', source: 'trusted-association' })
    expect(record.logs).toHaveLength(2)
  })

  it('同版本竞争拒绝第二笔且保留输入，不覆盖或合并人员', () => {
    const record = row()
    initialize(record)
    const second = { expectedVersion: 1, source: 'manual' as const, at, actorId: 'staff-03', authorized: true, handlerIds: ['staff-03'] }
    expect(assignReturnHandlers(record, { ...second, handlerIds: ['staff-02'] }).ok).toBe(true)
    expect(assignReturnHandlers(record, second)).toEqual({ ok: false, version: 2, error: '人员已变化，请保留输入并重新核对' })
    expect(second.handlerIds).toEqual(['staff-03'])
    expect(getReturnHandlerIds(record)).toEqual(['staff-02'])
    expect(record.handlerAssignment!.events).toHaveLength(2)
    expect(record.logs).toHaveLength(2)
  })

  it('人工空名单是有效覆盖，迟到可信关联不能覆盖；同一时刻以版本稳定排序', () => {
    const record = row()
    initialize(record)
    expect(assignReturnHandlers(record, { expectedVersion: 1, source: 'manual', at, actorId: 'staff-03', authorized: true, handlerIds: [] }).ok).toBe(true)
    expect(getReturnHandlerPresentation(record).label).toBe('未分配')
    expect(record.handlerAssignment!.events[1]!.manualOverride).toBe(true)
    expect(assignReturnHandlers(record, { expectedVersion: 2, source: 'trusted-association', at, actorId: 'system', authorized: true,
      associationAllowed: true, lines: [line('OUT-CHAIR-02')] }).ok).toBe(false)
    expect(assignReturnHandlers(record, { expectedVersion: 2, source: 'manual', at, actorId: 'staff-03', authorized: true, handlerIds: ['staff-03', 'staff-01'] }).ok).toBe(true)
    expect(record.handlerAssignment!.events.map(event => [event.version, event.assignedAt])).toEqual([[1, at], [2, at], [3, at]])
    expect(getReturnHandlerIds(record)).toEqual(['staff-03', 'staff-01'])
  })

  it('未核实的补齐或倒序事件不覆盖已有责任，可靠身份与时刻必填', () => {
    const record = row()
    initialize(record)
    const change = { expectedVersion: 1, source: 'trusted-association' as const, at, actorId: 'system', authorized: true, associationAllowed: true }
    expect(assignReturnHandlers(record, { ...change, lines: [{ sourceId: 'unknown', verified: false }] }).ok).toBe(false)
    expect(assignReturnHandlers(record, { ...change, at: '2026-11-12T01:00:00Z', lines: [line()] }).ok).toBe(false)
    expect(assignReturnHandlers(record, { ...change, at: '2026-11-13', lines: [line()] }).ok).toBe(false)
    expect(assignReturnHandlers(record, { ...change, actorId: '', lines: [line()] }).ok).toBe(false)
    expect(getReturnHandlerIds(record)).toEqual(['staff-01'])
    expect(record.handlerAssignment!.version).toBe(1)
  })

  it('关闭只复制已有快照，不读取当前目录；已结束历史不能初始化或重分配', () => {
    const record = row()
    initialize(record)
    record.state = 'CLOSED'; record.sku = 'OUT-CHAIR-02'
    captureReturnHandlers(record)
    expect(record.closedHandlerIds).toEqual(['staff-01'])
    expect(assignReturnHandlers(record, { expectedVersion: 1, source: 'manual', at, actorId: 'staff-03', authorized: true, handlerIds: ['staff-02'] }).ok).toBe(false)
    const historical = { ...row(), state: 'CLOSED' }
    expect(initialize(historical).ok).toBe(false)
    captureReturnHandlers(historical)
    expect(historical.closedHandlerIds).toBeUndefined()
    expect(getReturnHandlerPresentation(historical).label).toBe('未记录')
  })

  it('旧关闭名单保留已知身份但不补造可靠时刻，旧空名单不冒充已记录空分配', () => {
    const historical = { ...row(), state: 'CLOSED', closedHandlerIds: ['staff-01', 'staff-01'] }
    expect(getReturnHandlerPresentation(historical)).toMatchObject({ status: 'legacy', label: '客服01', handlerIds: ['staff-01'], assignedAt: undefined })
    expect(getReturnHandlerPresentation(historical).issues.join('')).toContain('历史未记录')
    historical.closedHandlerIds = []
    expect(getReturnHandlerPresentation(historical).label).toBe('未记录')
  })

  it('响应式代理与序列化重建沿用记录，不依赖对象地址；跨店复制不能借用旧快照', () => {
    const record = row()
    initialize(record)
    expect(getReturnHandlerIds(reactive(record))).toEqual(['staff-01'])
    const restored = JSON.parse(JSON.stringify(record)) as ReturnRecord
    expect(getReturnHandlerIds(restored)).toEqual(['staff-01'])
    restored.shopId = 'other-shop'
    expect(getReturnHandlerPresentation(restored).label).toBe('未记录')
    expect(initialize(restored).ok).toBe(false)
  })

  it('最新历史缺可靠时刻时显示未记录，不沿用旧版本或当前目录补造', () => {
    const record = row()
    initialize(record)
    assignReturnHandlers(record, { expectedVersion: 1, source: 'manual', at, actorId: 'staff-03', authorized: true, handlerIds: ['staff-02'] })
    record.handlerAssignment!.events[1]!.assignedAt = 'unknown'
    expect(getReturnHandlerIds(record)).toEqual([])
    expect(getReturnHandlerPresentation(record).label).toBe('未记录')
    expect(initialize(record).ok).toBe(false)
  })
})
