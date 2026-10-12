import { describe, expect, it } from 'vitest'
import { 共享订单 } from '../订单处理/演示会话'
import { 标发动作阻断, 标发确认指纹, 设置不标发 } from './标发工作台模型'
import type { 标发单 } from './标发逻辑'

const 来源 = 共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-CF-01')!
const 单: 标发单 = { no: 'CF-TEST', orderNo: 来源.systemOrderNo, fulfillmentNo: 来源.fulfillmentOrders[0]!.fulfillmentOrderNo,
  status: '标发失败', tracking: 'DEMO-TRACK', carrier: 'USPS', shippedAt: 来源.fulfillmentOrders[0]!.shippedAt!, quantity: 1,
  lineId: 来源.items[0]!.externalLineId, idempotencyKey: 'DEMO-KEY', pendingVerification: true, reason: '请求超时', attempts: [] }

describe('标发工作台动作范围', () => {
  it('待核查仅允许查询，成功和豁免不能查询或重提，未接入平台不伪造查询成功', () => {
    expect(标发动作阻断(单, '查询结果', 来源)).toEqual([])
    expect(标发动作阻断(单, '重新提交', 来源).join()).toContain('禁止重提')
    expect(标发动作阻断(单, '查询结果', { ...来源, platformCode: 'Temu' }).join()).toContain('尚未接入')
    for (const status of ['标发成功', '无需标发'] as const) {
      expect(标发动作阻断({ ...单, status, pendingVerification: false }, '查询结果', 来源).length).toBeGreaterThan(0)
      expect(标发动作阻断({ ...单, status, pendingVerification: false }, '重新提交', 来源).length).toBeGreaterThan(0)
    }
  })
  it('待标发与合格失败分别进入自己的动作，不因混选合并提交和重试范围', () => {
    const ready = { ...单, status: '待标发' as const, pendingVerification: false }
    expect(标发动作阻断(ready, '提交标发', 来源)).toEqual([])
    expect(标发动作阻断(ready, '重新提交', 来源).length).toBeGreaterThan(0)
    const retry = { ...ready, status: '标发失败' as const }
    expect(标发动作阻断(retry, '重新提交', 来源)).toEqual([])
    expect(标发动作阻断(retry, '提交标发', 来源).length).toBeGreaterThan(0)
  })
  it('状态、载荷、历史尝试及请求身份变化使原确认失效', () => {
    const fingerprint = 标发确认指纹(单)
    expect(标发确认指纹(structuredClone(单))).toBe(fingerprint)
    for (const changed of [{ ...单, tracking: 'NEW' }, { ...单, quantity: 2 }, { ...单, idempotencyKey: 'NEW' }, { ...单, pendingVerification: false }, { ...单, attempts: [{ time: '2026-10-10 10:00:00 UTC+8', action: '查询', result: '失败', evidence: '尚未取得结果' }] }]) {
      expect(标发确认指纹(changed)).not.toBe(fingerprint)
    }
  })
  it('未到已发货同时阻断提交与重试，已有待核查请求仍可查询原结果', () => {
    const partial = { ...来源, processingStatus: '待发货' as const }
    expect(标发动作阻断({ ...单, status: '待标发', pendingVerification: false }, '提交标发', partial)).toContain('OMS 订单尚未已发货，本期暂不提交标发')
    expect(标发动作阻断({ ...单, pendingVerification: false }, '重新提交', partial)).toContain('OMS 订单尚未已发货，本期暂不提交标发')
    expect(标发动作阻断(单, '查询结果', partial)).toEqual([])
  })
})

describe('不标发仅结束本单 OMS 回传责任', () => {
  it('缺物流或平台接口未接入不阻止人工停发，原因和前状态独立留存，接口及出库事实保持', () => {
    const source = JSON.parse(JSON.stringify({ ...来源, platformCode: 'Temu' }))
    const target = structuredClone({ ...单, pendingVerification: false, tracking: '', carrier: '' })
    const before = JSON.stringify(source), attempts = JSON.stringify(target.attempts), key = target.idempotencyKey
    expect(设置不标发(target, source, '  已在店铺后台自行处理  ', '2026-10-10 14:30:00 UTC+8', '虚构用户')).toEqual([])
    expect(target.status).toBe('无需标发')
    expect(target.nonMarkRecord).toEqual({ reason: '已在店铺后台自行处理', operator: '虚构用户', time: '2026-10-10 14:30:00 UTC+8', previousStatus: '标发失败' })
    expect(target.externalId).toBeUndefined()
    expect(JSON.stringify(target.attempts)).toBe(attempts)
    expect(target.idempotencyKey).toBe(key)
    expect(JSON.stringify(source)).toBe(before)
    expect(标发动作阻断(target, '提交标发', source).length).toBeGreaterThan(0)
    const closed = JSON.stringify(target)
    expect(设置不标发(target, source, '再次点击', 'later', '虚构用户').length).toBeGreaterThan(0)
    expect(JSON.stringify(target)).toBe(closed)
  })
  it('标发中、待核查、成功、无需标发、已有回执及关联缺失均保持原事实', () => {
    const cases: 标发单[] = [单, { ...单, status: '标发中', pendingVerification: false }, { ...单, status: '标发成功', pendingVerification: false }, { ...单, status: '无需标发', pendingVerification: false }, { ...单, pendingVerification: false, externalId: 'RECEIPT' }]
    for (const original of cases) {
      const target = structuredClone(original), before = JSON.stringify(target)
      expect(设置不标发(target, 来源, '店铺自行处理', 'time', '用户').length).toBeGreaterThan(0)
      expect(JSON.stringify(target)).toBe(before)
    }
    const ready = { ...单, status: '待标发' as const, pendingVerification: false }
    expect(标发动作阻断(ready, '不标发').join()).toContain('来源订单')
    expect(标发动作阻断(ready, '不标发', { ...来源, systemOrderNo: 'OTHER' }).join()).toContain('关联不一致')
  })
  it('空白或超长原因不写入，待标发可操作且再次修改人工结论使确认指纹失效', () => {
    const ready = structuredClone({ ...单, status: '待标发' as const, pendingVerification: false })
    const before = JSON.stringify(ready)
    for (const reason of ['  ', '字'.repeat(501)]) {
      expect(设置不标发(ready, 来源, reason, 'time', '用户').length).toBeGreaterThan(0)
      expect(JSON.stringify(ready)).toBe(before)
    }
    expect(设置不标发(ready, 来源, '字'.repeat(500), 'time', '用户')).toEqual([])
    const fingerprint = 标发确认指纹(ready)
    ready.nonMarkRecord!.reason = '变更理由'
    expect(标发确认指纹(ready)).not.toBe(fingerprint)
  })
  it('确认后原平台订单或店铺归属变化使确认失效', () => {
    const fingerprint = 标发确认指纹(单, 来源)
    expect(标发确认指纹(单, { ...来源, storeId: 'OTHER-STORE' })).not.toBe(fingerprint)
    expect(标发确认指纹(单, { ...来源, platformOrderNo: 'OTHER-ORDER' })).not.toBe(fingerprint)
  })
})
