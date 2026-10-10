import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 获取处理建议, 展示处理原因, 获取仓库结束提示 } from './处理提示展示'
import { 共享订单, 仓库执行记录, 审核阻断原因, 执行演示审核, 当前版本, 订单版本 } from './演示会话'
import { 执行演示截单, 同步演示仓库状态, 仓单期望版本 } from './操作功能模型'
import type { 作业行 } from './展示工具'

describe('处理提示保留阻断及源证据', () => {
  it('截单受理不提示退回，明确成功后提示复核后续；部分出库及共享保持专项核查', () => {
    const 订单备份 = JSON.stringify(共享订单.value); const 执行备份 = JSON.stringify(仓库执行记录.value); const 版本备份 = { ...订单版本.value }
    try {
      const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 'OMS-DEMO-ACTION-12')!
      const 执行 = 仓库执行记录.value.find(项 => 项.出库单号 === 'OUT-DEMO-ACTION-12')!
      const 行: 作业行 = { key: 订单.fulfillmentOrders[0]!.fulfillmentOrderNo, order: 订单, fulfillment: 订单.fulfillmentOrders[0], execution: 执行, stage: '待发货' }
      expect(执行演示截单(执行.出库单号, 仓单期望版本(执行), '重新规划', '已核对零出库').成功).toBe(true)
      expect(获取仓库结束提示(行)).toBeUndefined()
      expect(同步演示仓库状态(执行.出库单号).成功).toBe(true)
      const 状态快照 = JSON.stringify({ 订单, 执行, 版本: 订单版本.value })
      expect(获取处理建议(行, [])).toBe('请复核后退回待审核或操作不发货')
      expect(获取仓库结束提示({ ...行, execution: undefined })?.原因).toBe('仓库已确认截单成功，原执行已结束')
      expect(JSON.stringify({ 订单, 执行, 版本: 订单版本.value })).toBe(状态快照)
      订单.fulfillmentOrders[0]!.shippedQuantity = 1
      expect(获取处理建议(行, [])).toBe('请核对已出库及剩余发货范围')
      订单.fulfillmentOrders[0]!.shippedQuantity = 0
      执行.待核查 = true
      expect(获取仓库结束提示(行)).toBeUndefined()
      执行.待核查 = false; 执行.订单号.push('OMS-DEMO-ACTION-33')
      expect(获取处理建议(行, [])).toBe('请专项核对共享履约的后续处理')
      expect(订单.processingStatus).toBe('待发货')
    } finally { 共享订单.value = JSON.parse(订单备份); 仓库执行记录.value = JSON.parse(执行备份); 订单版本.value = 版本备份 }
  })
  it('取消、库存未知、部分出库、仓库待核查和仓配分离仍明确提示', () => {
    expect(展示处理原因('DEMO：准入后平台取消处理中，已转异常，停止后续发货；尚无最终取消事实。')).toBe('准入后平台取消处理中，已转异常，停止后续发货；尚无最终取消事实。')
    expect(展示处理原因('中台库存结果未知；本轮不允许审核通过')).toContain('结果未知；不能通过审核')
    expect(展示处理原因('已部分出库；剩余范围暂停，状态及恢复规则待确认。')).toContain('剩余范围暂停')
    expect(展示处理原因('演示查询仍未取得明确结果；保留下单中，禁止重复推仓。')).toContain('禁止重复推仓')
    expect(展示处理原因('仓配分离范围待评审，请查看物流下单')).toBe('本期不支持仓配分离，请选择仓配一体渠道')
  })
  it('受理、失败和豁免只描述已有结果，不补造建仓或标发成功', () => {
    expect(展示处理原因('演示请求已受理，等待读取仓库结果；提交受理不代表建仓成功。')).toBe('请求已受理，等待读取仓库结果；提交受理不代表建仓成功。')
    expect(展示处理原因('平台明确拒绝：演示授权校验失败；已更新演示凭据，可重新校验')).toContain('平台明确拒绝：授权校验失败')
    expect(展示处理原因('DEMO_EXEMPTION_ONLY：用于评审豁免事实展示，实际适用场景待确认')).toBe('已有标发豁免记录，请核对豁免依据')
  })
  it('未识别的接口错误及空值保持原语义，不按关键词吞掉原因', () => {
    const 原因 = '上游返回 DEMO-ERR-42：渠道虚构字段缺失，请核查；演示文件是买家附件名称'
    expect(展示处理原因(原因)).toBe(原因)
    expect(展示处理原因(undefined)).toBe('')
  })
  it('显示转换不改变审核拦截、存储原文、版本和数量', () => {
    const 备份 = JSON.stringify(共享订单.value)
    const 版本备份 = { ...订单版本.value }
    try {
      const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 'OMS260912000001')!
      订单.defaultRoute!.labelMode = '仓配分离'
      const 原因 = 审核阻断原因(订单)
      expect(原因).toContain('仓配分离的一期交付范围待确认')
      const 结果 = 执行演示审核(订单.systemOrderNo, 当前版本(订单.systemOrderNo))
      const 执行后 = JSON.stringify(订单)
      展示处理原因(结果.信息)
      expect(JSON.stringify(订单)).toBe(执行后)
      expect(结果.成功).toBe(false)
      expect(订单.processingStatus).toBe('待审核')
      expect(订单.fulfillmentOrders).toHaveLength(0)
      expect(订单.reviews[订单.reviews.length - 1]!.decisionNote).toContain('演示审核拦截')
    } finally { 共享订单.value = JSON.parse(备份); 订单版本.value = 版本备份 }
  })
})

describe('六态十二个建议分支', () => {
  const 用例 = [
    ['待审核', false, undefined, '', undefined, '请审核通过'],
    ['待审核', true, undefined, '', undefined, '请核对拦截原因，补齐发货条件'],
    ['待推单', false, '下单失败', '账号错误', undefined, '请查看出库单，核查失败原因'],
    ['待推单', true, '下单中', '请求待核查', undefined, '请同步仓库状态，核查原请求'],
    ['待推单', true, undefined, '', undefined, '请核对拦截原因，补齐推单条件'],
    ['待推单', false, undefined, '', undefined, '请推单，等待仓库接单结果'],
    ['待发货', false, '待出库', '已部分出库', undefined, '请查看出库单，核查仓库执行情况'],
    ['待发货', false, '待出库', '', undefined, '请跟进仓库发货，等待出库结果'],
    ['已发货', false, undefined, '', '标发失败', '请查看订单标发，核查失败原因'],
    ['已发货', false, undefined, '', undefined, '请查看订单标发，核对平台回传结果'],
    ['异常', true, undefined, '', undefined, '请人工复核异常原因及仓库执行'],
    ['不发货', false, undefined, '', undefined, '请查看不发货原因及执行记录'],
  ] as const
  it.each(用例)('%s 阻断=%s 执行=%s 原因=%s 标发=%s', (stage, blocked, status, reason, confirmation, expected) => {
    const row: 作业行 = { key: 'test', order: structuredClone(全渠道订单模拟数据[0]!), stage }
    if (status) row.execution = { 履约单号: 'test', 订单号: [row.order.systemOrderNo], 出库单号: 'out', 状态: status, 待核查: status === '下单中', 原因: reason, 更新时间: '' }
    expect(获取处理建议(row, blocked ? ['阻断'] : [], confirmation)).toBe(expected)
  })
})
