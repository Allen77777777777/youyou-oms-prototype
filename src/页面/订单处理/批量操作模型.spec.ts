import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 当前版本, 演示路由, 订单版本, type 仓库执行 } from './演示会话'
import { 共享订单备注, 获取订单备注, 订单备注字数上限 } from './订单备注模型'
import { 修改仓库物流阻断原因, 不发货阻断原因, 执行演示修改仓库物流, 执行演示不发货, 执行批量备注 } from './批量操作模型'

const 初始订单 = JSON.stringify(共享订单.value)
const 初始执行 = JSON.stringify(仓库执行记录.value)
const 初始备注 = JSON.stringify(共享订单备注.value)
const 初始版本 = JSON.stringify(订单版本.value)

function 恢复会话() {
  共享订单.value = JSON.parse(初始订单)
  仓库执行记录.value = JSON.parse(初始执行)
  共享订单备注.value = JSON.parse(初始备注)
  订单版本.value = JSON.parse(初始版本)
}
beforeEach(恢复会话)
afterEach(恢复会话)

function 待审订单(): 全渠道订单 { return 共享订单.value.find(订单 => 订单.systemOrderNo === 'OMS260912000001')! }
function 末项<T>(列表: T[]): T { return 列表[列表.length - 1]! }
function 添加履约(订单: 全渠道订单, 覆盖: Partial<履约单摘要> = {}): 履约单摘要 {
  订单.fulfillmentOrders.push({ fulfillmentOrderNo: `FL-TEST-${订单.systemOrderNo}`, status: '待执行', isActive: true, route: { ...订单.defaultRoute! }, plannedQuantity: 1, shippedQuantity: 0, ...覆盖 })
  return 末项(订单.fulfillmentOrders)
}
function 添加执行(订单: 全渠道订单, 履约: 履约单摘要, 覆盖: Partial<仓库执行> = {}): 仓库执行 {
  仓库执行记录.value.push({ 履约单号: 履约.fulfillmentOrderNo, 订单号: [订单.systemOrderNo], 出库单号: `OUT-${履约.fulfillmentOrderNo}`, 状态: '下单失败', 待核查: false, 原因: '虚构渠道拒绝', 更新时间: '2026-10-09T00:00:00Z', ...覆盖 })
  return 末项(仓库执行记录.value)
}

describe('批量仓库物流的逐订单命令', () => {
  it('更新默认路由为独立渠道快照，保留待审核、历史履约和平台事实，并记录版本与原因', () => {
    const 订单 = 待审订单()
    const 原路由 = 订单.defaultRoute!
    const 历史履约 = 添加履约(订单, { isActive: false, status: '已终止' })
    const 历史快照 = JSON.stringify(历史履约)
    const 版本 = 当前版本(订单.systemOrderNo)
    const 结果 = 执行演示修改仓库物流(订单.systemOrderNo, 版本, 演示路由[0]!.shippingChannelCode, '  调整演示仓库  ')
    expect(结果.成功).toBe(true)
    expect(订单.defaultRoute).toEqual(演示路由[0])
    expect(订单.defaultRoute).not.toBe(演示路由[0])
    expect(订单.defaultRoute).not.toBe(原路由)
    expect(JSON.stringify(历史履约)).toBe(历史快照)
    expect(订单.processingStatus).toBe('待审核')
    expect(订单.platformOrderStatus).toBe('NOT_STARTED')
    expect(末项(订单.operationLogs)).toMatchObject({ operationType: '修改仓库物流', operationResult: '成功', operator: '演示操作员' })
    expect(末项(订单.operationLogs).content).toContain('调整演示仓库')
    expect(当前版本(订单.systemOrderNo)).toBe(版本 + 1)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 版本, 演示路由[1]!.shippingChannelCode, '重放').成功).toBe(false)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 当前版本(订单.systemOrderNo), 演示路由[0]!.shippingChannelCode, '重复').成功).toBe(false)
  })

  it('缺失组合、空原因、失效版本和不存在订单均不产生修改或日志', () => {
    const 订单 = 待审订单()
    const 快照 = JSON.stringify(订单)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 'UNKNOWN', '原因').成功).toBe(false)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, ' \n ').成功).toBe(false)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 0, 演示路由[0]!.shippingChannelCode, '原因').成功).toBe(false)
    expect(执行演示修改仓库物流('MISSING', 1, 演示路由[0]!.shippingChannelCode, '原因').成功).toBe(false)
    expect(JSON.stringify(订单)).toBe(快照)
    expect(当前版本(订单.systemOrderNo)).toBe(1)
  })

  it('阻断订单、有效履约和未结束历史执行不能改路由，已取消零出库历史不永久阻止重规划', () => {
    const 订单 = 待审订单()
    订单.blockReason = '等待核实剩余履约范围'
    expect(修改仓库物流阻断原因(订单)).toContain('等待核实剩余履约范围')
    订单.blockReason = undefined
    订单.cancelledAt = '2026-10-09T00:00:00Z'
    expect(修改仓库物流阻断原因(订单).join('；')).toContain('最终取消')
    订单.cancelledAt = undefined
    const 履约 = 添加履约(订单)
    expect(修改仓库物流阻断原因(订单).join('；')).toContain('有效履约')
    履约.isActive = false
    const 执行 = 添加执行(订单, 履约, { 状态: '取消中', 待核查: true })
    const 快照 = JSON.stringify(订单)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, '原因').成功).toBe(false)
    expect(JSON.stringify(订单)).toBe(快照)
    执行.状态 = '已取消'; 执行.待核查 = false; 履约.status = '已终止'
    expect(修改仓库物流阻断原因(订单)).toEqual([])
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, '原仓已取消，重新规划').成功).toBe(true)
  })

  it.each(['待推单', '待发货', '异常', '已发货', '不发货'] as const)('%s 不通过待审核路由门禁', 状态 => {
    const 订单 = 待审订单()
    订单.processingStatus = 状态
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, '原因').成功).toBe(false)
  })
})

describe('人工确认后的不发货命令', () => {
  it('零出库的异常订单可终止，审计保留原阻断和操作者时间，取消中不伪造最终取消事实', () => {
    const 订单 = 待审订单()
    订单.processingStatus = '异常'
    订单.blockReason = '平台取消处理中'
    const 平台状态 = 订单.platformOrderStatus
    const 结果 = 执行演示不发货(订单.systemOrderNo, 1, '  人工核实无需继续发货  ')
    expect(结果.成功).toBe(true)
    expect(订单.processingStatus).toBe('不发货')
    expect(订单.noShipmentReason).toBe('人工核实无需继续发货')
    expect(订单.blockReason).toBeUndefined()
    expect(订单.cancelledAt).toBeUndefined()
    expect(订单.cancelledReason).toBeUndefined()
    expect(订单.platformOrderStatus).toBe(平台状态)
    const 日志 = 末项(订单.operationLogs)
    expect(日志).toMatchObject({ operationType: '不发货', operator: '演示操作员', operationResult: '成功' })
    expect(日志.operatedAt).toMatch(/UTC$/)
    expect(日志.content).toContain('异常 → 不发货')
    expect(日志.content).toContain('平台取消处理中')
    expect(当前版本(订单.systemOrderNo)).toBe(2)
  })

  it.each(['下单失败', '已取消'] as const)('已明确%s且零出库的执行可终止本地路径，保留仓单与历史快照', 状态 => {
    const 订单 = 待审订单()
    订单.processingStatus = '异常'
    订单.cancelledAt = '2026-10-09T00:00:00Z'
    订单.cancelledReason = '虚构最终取消事实'
    const 履约 = 添加履约(订单)
    const 执行 = 添加执行(订单, 履约, { 状态 })
    const 执行快照 = JSON.stringify(执行)
    const 路由快照 = JSON.stringify(履约.route)
    expect(执行演示不发货(订单.systemOrderNo, 1, '确认无需发货').成功).toBe(true)
    expect(履约).toMatchObject({ isActive: false, status: '已终止', shippedQuantity: 0, plannedQuantity: 1 })
    expect(JSON.stringify(履约.route)).toBe(路由快照)
    expect(JSON.stringify(执行)).toBe(执行快照)
    expect(订单.cancelledAt).toBe('2026-10-09T00:00:00Z')
    expect(订单.cancelledReason).toBe('虚构最终取消事实')
  })

  it('有效或失效历史履约已有部分出库都禁止整单终止', () => {
    const 订单 = 待审订单()
    const 履约 = 添加履约(订单, { plannedQuantity: 2, shippedQuantity: 1 })
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    履约.isActive = false
    expect(不发货阻断原因(订单).join('；')).toContain('有效出库事实')
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    expect(履约.shippedQuantity).toBe(1)
    expect(订单.processingStatus).toBe('待审核')
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0.5])('出库数量 %s 不被当作可信零值', 数量 => {
    const 订单 = 待审订单()
    const 履约 = 添加履约(订单)
    履约.shippedQuantity = 数量 as number
    expect(不发货阻断原因(订单).join('；')).toContain('出库数量缺失或不可信')
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
  })

  it.each(['下单中', '待出库', '出库异常', '取消中', '已出库'] as const)('仓库%s阻止终止，不在本地模拟撤单', 状态 => {
    const 订单 = 待审订单()
    const 履约 = 添加履约(订单)
    const 执行 = 添加执行(订单, 履约, { 状态 })
    const 快照 = JSON.stringify({ 订单, 执行 })
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    expect(JSON.stringify({ 订单, 执行 })).toBe(快照)
  })

  it('即使显示下单失败或已取消，待核查仍不能终止', () => {
    const 订单 = 待审订单()
    const 履约 = 添加履约(订单)
    const 执行 = 添加执行(订单, 履约, { 状态: '下单失败', 待核查: true })
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因')).toMatchObject({ 成功: false, 待核查: true })
    执行.状态 = '已取消'
    expect(不发货阻断原因(订单).join('；')).toContain('待核查')
  })

  it('通过订单号或历史履约号关联全部仓库执行，不遗漏失效路径', () => {
    const 订单 = 待审订单()
    const 历史履约 = 添加履约(订单, { isActive: false, status: '已终止' })
    const 执行 = 添加执行(订单, 历史履约, { 订单号: [], 状态: '取消中' })
    expect(不发货阻断原因(订单).join('；')).toContain('未安全结束')
    执行.履约单号 = 'FL-UNRESOLVED-HISTORY'
    执行.订单号 = [订单.systemOrderNo]
    执行.状态 = '已取消'
    expect(不发货阻断原因(订单).join('；')).toContain('缺少关联履约数量')
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
  })

  it('执行中履约缺少仓库记录时不能把未知执行当成已经结束，纯待执行计划仍可终止', () => {
    const 订单 = 待审订单()
    订单.processingStatus = '待发货'
    const 履约 = 添加履约(订单, { status: '执行中' })
    const 快照 = JSON.stringify(订单)
    expect(不发货阻断原因(订单).join('；')).toContain('缺少仓库明确结束证据')
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    expect(JSON.stringify(订单)).toBe(快照)
    履约.status = '待执行'
    expect(不发货阻断原因(订单).join('；')).toContain('截单成功')
    订单.processingStatus = '待推单'
    expect(不发货阻断原因(订单)).toEqual([])
    expect(执行演示不发货(订单.systemOrderNo, 1, '纯计划无需继续发货').成功).toBe(true)
  })

  it.each(['下单失败', '已取消'] as const)('执行中履约只有取得明确%s且非待核查的结束证据，才可终止', 状态 => {
    const 订单 = 待审订单()
    const 履约 = 添加履约(订单, { status: '执行中' })
    const 执行 = 添加执行(订单, 履约, { 状态, 待核查: true })
    expect(不发货阻断原因(订单).join('；')).toContain('缺少仓库明确结束证据')
    执行.待核查 = false
    expect(不发货阻断原因(订单)).toEqual([])
    expect(执行演示不发货(订单.systemOrderNo, 1, '仓库执行已明确结束').成功).toBe(true)
  })

  it('共享仓库执行以及没有仓单的共享履约均不能单独终止来源订单', () => {
    const 订单 = 待审订单()
    const 其他订单 = 共享订单.value.find(项 => 项.systemOrderNo === 'OMS260912000002')!
    const 履约 = 添加履约(订单)
    添加执行(订单, 履约, { 订单号: [订单.systemOrderNo, 其他订单.systemOrderNo], 状态: '已取消' })
    expect(不发货阻断原因(订单).join('；')).toContain('共享履约路径')
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    仓库执行记录.value = 仓库执行记录.value.filter(执行 => 执行.履约单号 !== 履约.fulfillmentOrderNo)
    添加履约(其他订单, { fulfillmentOrderNo: 履约.fulfillmentOrderNo })
    expect(不发货阻断原因(订单).join('；')).toContain('共享履约路径')
    expect(其他订单.fulfillmentOrders[0]!.isActive).toBe(true)
  })

  it('空原因、过期版本和终态重复不会再写日志或修改状态', () => {
    const 订单 = 待审订单()
    const 快照 = JSON.stringify(订单)
    expect(执行演示不发货(订单.systemOrderNo, 1, ' \n ').成功).toBe(false)
    expect(执行演示不发货(订单.systemOrderNo, 0, '原因').成功).toBe(false)
    expect(执行演示不发货('MISSING', 1, '原因').成功).toBe(false)
    expect(JSON.stringify(订单)).toBe(快照)
    订单.processingStatus = '已发货'
    expect(执行演示不发货(订单.systemOrderNo, 1, '原因').成功).toBe(false)
    订单.processingStatus = '待审核'
    expect(执行演示不发货(订单.systemOrderNo, 1, '首次原因').成功).toBe(true)
    const 终态快照 = JSON.stringify(订单)
    expect(执行演示不发货(订单.systemOrderNo, 1, '旧版本重放').成功).toBe(false)
    expect(执行演示不发货(订单.systemOrderNo, 2, '新版本重放').成功).toBe(false)
    expect(JSON.stringify(订单)).toBe(终态快照)
  })

  it('直调用不能绕过 2000 字表单原因限制，恰好上限可执行', () => {
    const 订单 = 待审订单()
    const 快照 = JSON.stringify(订单)
    const 超长原因 = '文'.repeat(2001)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, 超长原因)).toMatchObject({ 成功: false, 信息: '修改原因最多 2000 字' })
    expect(执行演示不发货(订单.systemOrderNo, 1, 超长原因)).toMatchObject({ 成功: false, 信息: '不发货原因最多 2000 字' })
    expect(JSON.stringify(订单)).toBe(快照)
    expect(当前版本(订单.systemOrderNo)).toBe(1)
    expect(执行演示修改仓库物流(订单.systemOrderNo, 1, 演示路由[0]!.shippingChannelCode, '文'.repeat(2000)).成功).toBe(true)
    expect(执行演示不发货(订单.systemOrderNo, 当前版本(订单.systemOrderNo), '文'.repeat(2000)).成功).toBe(true)
  })
})

describe('批量备注按系统订单去重', () => {
  it('同一来源订单只追加一次，逐项返回不存在对象，备注不写普通日志或版本', () => {
    const 订单 = 待审订单()
    const 其他订单号 = 'OMS260912000002'
    const 原备注数 = 获取订单备注(订单.systemOrderNo).length
    const 业务快照 = JSON.stringify({ 订单: 共享订单.value, 执行: 仓库执行记录.value, 版本: 订单版本.value })
    const 结果 = 执行批量备注([订单.systemOrderNo, 订单.systemOrderNo, 其他订单号, 'MISSING'], '  批量交接\n补充记录  ')
    expect(结果.map(项 => 项.key)).toEqual([订单.systemOrderNo, 其他订单号, 'MISSING'])
    expect(结果.map(项 => 项.result.成功)).toEqual([true, true, false])
    expect(获取订单备注(订单.systemOrderNo)).toHaveLength(原备注数 + 1)
    expect(末项(获取订单备注(订单.systemOrderNo)).note_content).toBe('批量交接\n补充记录')
    expect(末项(获取订单备注(其他订单号)).note_content).toBe('批量交接\n补充记录')
    expect(获取订单备注('MISSING')).toHaveLength(0)
    expect(JSON.stringify({ 订单: 共享订单.value, 执行: 仓库执行记录.value, 版本: 订单版本.value })).toBe(业务快照)
  })

  it('空白或超长备注逐项失败，合法上限复用备注规则，空目标不写数据', () => {
    const 订单号 = 待审订单().systemOrderNo
    const 原备注 = JSON.stringify(共享订单备注.value)
    expect(执行批量备注([订单号], ' \n ')[0]!.result.成功).toBe(false)
    expect(执行批量备注([订单号], '文'.repeat(订单备注字数上限 + 1))[0]!.result.成功).toBe(false)
    expect(执行批量备注([], '有效备注')).toEqual([])
    expect(JSON.stringify(共享订单备注.value)).toBe(原备注)
    expect(执行批量备注([订单号], '文'.repeat(订单备注字数上限))[0]!.result.成功).toBe(true)
  })
})
