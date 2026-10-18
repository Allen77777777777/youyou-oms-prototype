import { describe, expect, it } from 'vitest'
import { 标发基础动作, 初始化标发动作, 校验标发动作, 格式化标发动作, 标发动作说明, type 标发时机配置 } from './标发动作'
import { 创建规则样例, 校验规则配置, 命中规则, 试算规则, type 订单规则 } from './规则逻辑'
import { 创建规则草稿, 丢弃规则草稿 } from './规则编辑会话'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'

function 规则覆盖(覆盖: Partial<订单规则> = {}): 订单规则 { return { ...创建规则样例().find(项 => 项.type === '订单标发规则')!, ...覆盖 } }

describe('订单标发执行动作', () => {
  it('只开放仓库发货完成后标发和无需标发，新建默认立即且不启用', () => {
    expect(标发基础动作).toEqual(['仓库发货完成后标发', '无需标发'])
    const session = 创建规则草稿('订单标发规则', [])!
    try { expect(session.draft).toMatchObject({ action: '仓库发货完成后标发', enabled: false, shippingAction: { timing: 'immediate' } }) }
    finally { 丢弃规则草稿(session.key) }
  })
  it.each(['1', '2', '5', '72'])('延迟与提前小时数%s可保存并出现在摘要中', hours => {
    for (const timing of ['delay', 'beforeDeadline'] as const) {
      const 规则 = 规则覆盖({ shippingAction: { timing, delayHours: hours, beforeDeadlineHours: hours } })
      expect(校验规则配置(规则, [])).toBe('')
      expect(格式化标发动作(规则)).toContain(`${hours} 小时`)
      expect(标发动作说明(规则)).toContain(timing === 'delay' ? `+ ${hours} 小时` : `− ${hours} 小时`)
    }
  })
  it.each(['', '0', '-1', '1.5', '73', '720', '1e2', ' 2 ', 'Infinity', 'abc'])('当前选择的延迟或提前值%s非法时阻断保存和有效试算', hours => {
    for (const timing of ['delay', 'beforeDeadline'] as const) {
      const 规则 = 规则覆盖({ shippingAction: { timing, delayHours: hours, beforeDeadlineHours: hours } })
      expect(校验规则配置(规则, [])).toContain('1～72')
      expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false)
      expect(格式化标发动作(规则)).toContain('配置待完善')
    }
  })
  it('不校验未选小时数，也不在摘要中使用残留值', () => {
    const 规则 = 规则覆盖({ shippingAction: { timing: 'immediate', delayHours: 'bad', beforeDeadlineHours: '-2' } })
    expect(校验规则配置(规则, [])).toBe('')
    expect(格式化标发动作(规则)).toBe('仓库发货完成后立即标发')
    规则.shippingAction = { timing: 'delay', delayHours: '2', beforeDeadlineHours: 'bad' }
    expect(校验标发动作(规则)).toBe('')
    expect(格式化标发动作(规则)).not.toContain('bad')
  })
  it('未知标发时机及物流下单动作不参与有效命中', () => {
    const 规则 = 规则覆盖({ shippingAction: { timing: 'unknown' } as unknown as 标发时机配置 })
    expect(校验规则配置(规则, [])).toContain('标发时机')
    expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false)
    规则.action = '物流下单后标发'
    expect(校验规则配置(规则, [])).toContain('标发动作')
    expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false)
  })
  it('无需标发忽略时间配置，含义与发货及平台成功独立', () => {
    const 规则 = 规则覆盖({ action: '无需标发', shippingAction: { timing: 'delay', delayHours: '' } })
    expect(校验规则配置(规则, [])).toBe('')
    expect(格式化标发动作(规则)).toBe('无需标发')
    expect(标发动作说明(规则)).toContain('不代表平台标发成功')
    expect(标发动作说明(规则)).toContain('不改变订单发货状态')
  })
  it('旧出库后建议只在草稿中映射，旧人工核查须明确重选', () => {
    const 原规则 = 规则覆盖({ action: '具备出库事实后建议标发', shippingAction: undefined }), before = JSON.stringify(原规则)
    const 草稿 = 创建规则草稿('订单标发规则', [原规则], 'edit', 原规则)!
    const 副本 = 创建规则草稿('订单标发规则', [原规则], 'copy', 原规则)!
    try {
      expect(草稿.draft).toMatchObject({ action: '仓库发货完成后标发', shippingAction: { timing: 'immediate' } })
      expect(副本.draft.shippingAction?.timing).toBe('immediate')
      expect(JSON.stringify(原规则)).toBe(before)
    } finally { 丢弃规则草稿(草稿.key); 丢弃规则草稿(副本.key) }
    const 旧人工 = 规则覆盖({ action: '进入人工核查', shippingAction: undefined })
    初始化标发动作(旧人工)
    expect(旧人工.action).toBe('进入人工核查')
    expect(校验规则配置(旧人工, [])).toContain('旧动作需重新配置')
  })
  it('三种时机及无需标发均保留有效出库和订单已发货生成前提，试算只读', () => {
    const 订单 = structuredClone(全渠道订单模拟数据[0]!)
    订单.processingStatus = '待发货'; 订单.fulfillmentOrders = []
    const before = JSON.stringify(订单)
    for (const shippingAction of [{ timing: 'immediate' }, { timing: 'delay', delayHours: '2' }, { timing: 'beforeDeadline', beforeDeadlineHours: '3' }] as 标发时机配置[]) {
      for (const action of 标发基础动作) {
        const 结果 = 试算规则([规则覆盖({ action, shippingAction })], 订单, '订单标发规则')
        expect(结果.hit).toBeDefined()
        expect(结果.gates).toContain('来源 OMS 订单尚未已发货，不得生成或调度标发')
        expect(结果.gates).toContain('未取得有效出库事实，不得标发')
      }
    }
    expect(JSON.stringify(订单)).toBe(before)
  })
  it('最晚标发时间来源未接入，不借用shipByAt，且复制隔离配置', () => {
    const 订单 = structuredClone(全渠道订单模拟数据[0]!)
    订单.processingStatus = '已发货'; 订单.shipByAt = '2026-10-20 12:00:00 UTC+8'
    订单.fulfillmentOrders[0]!.shippedQuantity = 1; 订单.fulfillmentOrders[0]!.shippedAt = '2026-10-19 10:00:00 UTC+8'
    const 原规则 = 规则覆盖({ shippingAction: { timing: 'beforeDeadline', beforeDeadlineHours: '2' } })
    expect(试算规则([原规则], 订单, '订单标发规则').gates).toContain('未取得平台最晚标发时间，无法确定提前标发计划')
    const session = 创建规则草稿('订单标发规则', [原规则], 'copy', 原规则)!
    try { session.draft.shippingAction!.beforeDeadlineHours = '5'; expect(原规则.shippingAction?.beforeDeadlineHours).toBe('2') }
    finally { 丢弃规则草稿(session.key) }
  })
})
