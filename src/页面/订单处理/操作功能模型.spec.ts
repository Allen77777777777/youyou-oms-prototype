import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { 共享订单, 仓库执行记录, 操作核查证据, 演示库存, 订单版本, 当前版本, 演示路由, 执行演示审核, 执行演示推单, 推单阻断原因 } from './演示会话'
import { 不发货阻断原因, 修改仓库物流阻断原因, 执行演示不发货, 执行演示修改仓库物流 } from './批量操作模型'
import { 仓单来源订单, 仓单期望版本, 重新推单阻断原因, 截单阻断原因, 退回待审核阻断原因, 恢复发货目标, 恢复发货阻断原因, 撤销不发货阻断原因, 同步仓库状态阻断原因, 执行演示重新推单, 同步演示仓库状态, 执行演示截单, 执行演示退回待审核, 执行演示恢复发货, 执行演示撤销不发货 } from './操作功能模型'

const 初始 = JSON.stringify({ 订单: 共享订单.value, 执行: 仓库执行记录.value, 证据: 操作核查证据.value, 库存: 演示库存.value, 版本: 订单版本.value })
function 恢复() { const 状态 = JSON.parse(初始); 共享订单.value = 状态.订单; 仓库执行记录.value = 状态.执行; 操作核查证据.value = 状态.证据; 演示库存.value = 状态.库存; 订单版本.value = 状态.版本 }
beforeEach(恢复)
afterEach(恢复)
function 单(编号: string) { return 共享订单.value.find(项 => 项.systemOrderNo === `OMS-DEMO-ACTION-${编号}`)! }
function 仓(编号: string) { return 仓库执行记录.value.find(项 => 项.出库单号 === `OUT-DEMO-ACTION-${编号}`)! }

describe('重新推单仅处理明确失败且实际修复的原范围', () => {
  it('复用原业务单受理重推，保留失败历史且不直接建仓或出库', () => {
    const 原单 = 单('08'); const 执行 = 仓('08'); const 旧数量 = 原单.fulfillmentOrders[0]!.plannedQuantity
    expect(重新推单阻断原因(执行)).toEqual([])
    expect(执行演示重新推单(执行.出库单号, 仓单期望版本(执行), '渠道已开通并核验').成功).toBe(true)
    expect(执行).toMatchObject({ 状态: '下单中', 待核查: true })
    expect(原单.processingStatus).toBe('待推单')
    expect(原单.fulfillmentOrders[0]!.plannedQuantity).toBe(旧数量)
    expect(仓库执行记录.value.filter(项 => 项.出库单号 === 执行.出库单号)).toHaveLength(1)
    expect(原单.operationLogs[原单.operationLogs.length - 1]!.content).toContain('所选渠道尚未开通')
    expect(同步演示仓库状态(执行.出库单号).成功).toBe(true)
    expect(原单.processingStatus).toBe('待发货')
  })
  it.each(['09', '11', '31'])('%s 的未修复、未明或方案变化不因填写说明放行', 编号 => {
    const 原快照 = JSON.stringify(单(编号)); const 执行 = 仓(编号)
    expect(执行演示重新推单(执行.出库单号, 仓单期望版本(执行), '文字说明已修复').成功).toBe(false)
    expect(JSON.stringify(单(编号))).toBe(原快照)
  })
  it('出库量、库存或历史未明路径在提交时重新校验', () => {
    const 原单 = 单('08'); const 执行 = 仓('08')
    演示库存.value[原单.systemOrderNo] = '结果未知'
    expect(重新推单阻断原因(执行).join('；')).toContain('库存')
    演示库存.value[原单.systemOrderNo] = '充足'
    原单.fulfillmentOrders.push({ ...原单.fulfillmentOrders[0]!, fulfillmentOrderNo: 'FL-HISTORY', isActive: false, shippedQuantity: 1 })
    expect(重新推单阻断原因(执行).join('；')).toContain('出库事实')
  })
})

describe('唯一同步入口取得仓库事实并保护订单六态', () => {
  it.each(['11', '16', '30'])('%s 的未查到、查询失败或未知保留仓库及订单原值', 编号 => {
    const 旧状态 = JSON.stringify({ 单: 单(编号), 仓: 仓(编号) })
    expect(同步演示仓库状态(仓(编号).出库单号).成功).toBe(false)
    expect(JSON.stringify({ 单: 单(编号), 仓: 仓(编号) })).toBe(旧状态)
  })
  it('取消中订单、终态订单及历史已取消仓单仍可查询，不要求 PAID 或零出库', () => {
    for (const 编号 of ['20', '21', '22', '25', '32']) {
      const 原状态 = 单(编号).processingStatus
      expect(同步仓库状态阻断原因(仓(编号))).toEqual([])
      expect(同步演示仓库状态(仓(编号).出库单号).成功).toBe(true)
      expect(单(编号).processingStatus).toBe(原状态)
    }
  })
  it('明确足量出库推进正常订单，异常和不发货仍保存事实并等待人工核查', () => {
    expect(同步演示仓库状态(仓('24').出库单号).成功).toBe(true)
    expect(单('24').processingStatus).toBe('已发货')
    expect(单('24').fulfillmentOrders[0]!.shippedQuantity).toBe(2)
    操作核查证据.value[单('17').systemOrderNo]!.同步结果 = '已出库'
    expect(同步演示仓库状态(仓('17').出库单号).成功).toBe(true)
    expect(单('17').processingStatus).toBe('异常')
    expect(单('17').fulfillmentOrders[0]!.shippedQuantity).toBe(2)
    操作核查证据.value[单('21').systemOrderNo]!.同步结果 = '已出库'
    expect(同步演示仓库状态(仓('21').出库单号).成功).toBe(true)
    expect(单('21').processingStatus).toBe('不发货')
    expect(单('21').fulfillmentOrders[0]!.isActive).toBe(false)
  })
  it('没有查询能力或账号/单号缺失时不会默认查询其他来源', () => {
    expect(同步演示仓库状态(仓('28').出库单号).信息).toContain('尚不支持')
    单('12').fulfillmentOrders[0]!.route.warehouseAccount = ''
    expect(同步演示仓库状态(仓('12').出库单号).成功).toBe(false)
    expect(同步演示仓库状态('MISSING').成功).toBe(false)
  })
  it('同一仓单关联去重为完整来源，版本表覆盖共享的两张订单', () => {
    const 执行 = 仓('SHARED')
    expect(仓单来源订单(执行).map(项 => 项.systemOrderNo)).toEqual([单('33').systemOrderNo, 单('34').systemOrderNo])
    expect(Object.keys(仓单期望版本(执行))).toHaveLength(2)
    const 旧版本 = 仓单期望版本(执行)
    同步演示仓库状态(执行.出库单号)
    expect(当前版本(单('33').systemOrderNo)).toBe(旧版本[单('33').systemOrderNo]! + 1)
    expect(当前版本(单('34').systemOrderNo)).toBe(旧版本[单('34').systemOrderNo]! + 1)
  })
})

describe('截单是仓库申请，只有明确结果才允许退回或终止', () => {
  it('受理保持原订单状态，同步确认取消后才能退回，再修改路由及重审', () => {
    const 原单 = 单('12'); const 执行 = 仓('12'); const 路由快照 = JSON.stringify(原单.fulfillmentOrders[0]!.route)
    expect(执行演示截单(执行.出库单号, 仓单期望版本(执行), '需重新分仓，全部影响已核对').成功).toBe(true)
    expect(执行.状态).toBe('取消中')
    expect(原单.processingStatus).toBe('待发货')
    expect(退回待审核阻断原因(原单).length).toBeGreaterThan(0)
    expect(不发货阻断原因(原单).length).toBeGreaterThan(0)
    expect(同步演示仓库状态(执行.出库单号).信息).toContain('确认截单成功')
    expect(原单.processingStatus).toBe('待发货')
    expect(执行演示退回待审核(原单.systemOrderNo, 当前版本(原单.systemOrderNo), '更换分仓，旧路径已取消且零出库').成功).toBe(true)
    expect(原单.fulfillmentOrders[0]!.isActive).toBe(false)
    expect(JSON.stringify(原单.fulfillmentOrders[0]!.route)).toBe(路由快照)
    expect(修改仓库物流阻断原因(原单)).toEqual([])
    const 目标路由 = 演示路由.find(项 => 项.shippingChannelCode !== 原单.defaultRoute!.shippingChannelCode)!
    expect(执行演示修改仓库物流(原单.systemOrderNo, 当前版本(原单.systemOrderNo), 目标路由.shippingChannelCode, '修改仓库').成功).toBe(true)
    expect(执行演示审核(原单.systemOrderNo, 当前版本(原单.systemOrderNo), '重新审核说明').成功).toBe(true)
    expect(原单.fulfillmentOrders).toHaveLength(2)
    expect(原单.reviews[原单.reviews.length - 1]!.decisionNote).toContain('重新审核说明')
  })
  it('仓库拒绝截单不直接退回或不发货，保留仍有效仓库执行', () => {
    const 执行 = 仓('26')
    expect(执行演示截单(执行.出库单号, 仓单期望版本(执行), '改仓').成功).toBe(true)
    expect(同步演示仓库状态(执行.出库单号).信息).toContain('仓库拒绝截单')
    expect(执行.状态).toBe('待出库')
    expect(单('26').processingStatus).toBe('待发货')
    expect(退回待审核阻断原因(单('26')).length).toBeGreaterThan(0)
  })
  it('平台仍取消中可截单；部分出库、不支持撤单和待核查禁止截单', () => {
    expect(截单阻断原因(仓('20'))).toEqual([])
    for (const 编号 of ['15', '29', '14', '11']) expect(截单阻断原因(仓(编号)).length).toBeGreaterThan(0)
  })
  it('共享单单个检查全部影响并允许申请，批量跳过且任何来源出库即禁止', () => {
    const 执行 = 仓('SHARED')
    expect(截单阻断原因(执行, false)).toEqual([])
    expect(截单阻断原因(执行, true).join('；')).toContain('批量已跳过')
    单('34').fulfillmentOrders[0]!.shippedQuantity = 1
    expect(截单阻断原因(执行, false).join('；')).toContain('出库事实')
    单('34').fulfillmentOrders[0]!.shippedQuantity = 0
    const 版本表 = 仓单期望版本(执行)
    expect(执行演示截单(执行.出库单号, 版本表, '终止原共享执行，已核对两张来源').成功).toBe(true)
    expect(单('33').operationLogs[单('33').operationLogs.length - 1]!.content).toContain(单('34').systemOrderNo)
  })
})

describe('恢复与终态纠错只恢复处理资格，不立即向仓库发货', () => {
  it('恢复待发货继续唯一原仓单，不再次要求受理计划库存', () => {
    const 原单 = 单('17'); const 原仓快照 = JSON.stringify(仓('17')); const 原履约号 = 原单.fulfillmentOrders[0]!.fulfillmentOrderNo
    expect(演示库存.value[原单.systemOrderNo]).toBe('不足')
    expect(恢复发货目标(原单)).toBe('待发货')
    expect(恢复发货阻断原因(原单)).toEqual([])
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '发货条件恢复，原仓单明确可继续').成功).toBe(true)
    expect(原单.processingStatus).toBe('待发货')
    expect(原单.fulfillmentOrders).toHaveLength(1)
    expect(原单.fulfillmentOrders[0]!.fulfillmentOrderNo).toBe(原履约号)
    expect(JSON.stringify(仓('17'))).toBe(原仓快照)
    expect(原单.operationLogs[原单.operationLogs.length - 1]!.content).toContain('原异常')
  })
  it('恢复待推单建立独立可执行新路径，旧已取消仓单及快照不复活', () => {
    const 原单 = 单('18'); const 原履约快照 = JSON.stringify(原单.fulfillmentOrders[0]); const 原仓快照 = JSON.stringify(仓('18'))
    expect(恢复发货目标(原单)).toBe('待推单')
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '仍需发货，原方案仍适用').成功).toBe(true)
    expect(原单.processingStatus).toBe('待推单')
    expect(JSON.stringify(原单.fulfillmentOrders[0])).toBe(原履约快照)
    expect(JSON.stringify(仓('18'))).toBe(原仓快照)
    expect(原单.fulfillmentOrders[1]!).toMatchObject({ isActive: true, status: '待执行', shippedQuantity: 0 })
    expect(推单阻断原因(原单, 原单.fulfillmentOrders[1]!.fulfillmentOrderNo)).toEqual([])
  })
  it('回待审核允许未修复 SKU、地址、路由和库存，后续审核仍会拦截', () => {
    const 原单 = 单('19'); 原单.address.addressLine1 = ''; 原单.defaultRoute = undefined; 演示库存.value[原单.systemOrderNo] = '结果未知'
    expect(恢复发货目标(原单)).toBe('待审核')
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '重新规划，原执行已结束仍有真实待发需求').成功).toBe(true)
    expect(执行演示审核(原单.systemOrderNo, 当前版本(原单.systemOrderNo)).成功).toBe(false)
  })
  it('恢复必须继续同一原仓单，不能把旧仓单事实套到另一个当前计划', () => {
    const 原单 = 单('17')
    原单.fulfillmentOrders[0]!.fulfillmentOrderNo = 'FL-ANOTHER-ACTIVE'
    expect(恢复发货目标(原单)).toBeUndefined()
    expect(恢复发货阻断原因(原单).length).toBeGreaterThan(0)
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '恢复').成功).toBe(false)
  })
  it('恢复待推单校验将实际复制的旧履约快照，不能借当前默认路由通过', () => {
    const 原单 = 单('18')
    原单.fulfillmentOrders[0]!.route.warehouseAccount = ''
    expect(原单.defaultRoute!.warehouseAccount).toBeTruthy()
    expect(恢复发货目标(原单)).toBe('待审核')
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '重新规划，旧履约路由需修复').成功).toBe(true)
    expect(原单.processingStatus).toBe('待审核')
    expect(原单.fulfillmentOrders).toHaveLength(1)
  })
  it.each(['20', '27'])('%s 的平台条件或实际出库/剩余未明不允许恢复', 编号 => {
    expect(执行演示恢复发货(单(编号).systemOrderNo, 1, '恢复').成功).toBe(false)
    expect(单(编号).processingStatus).toBe('异常')
  })
  it('有明确纠错依据的误终止回待审核，保留原不发货结论和旧仓单', () => {
    const 原单 = 单('21'); const 原原因 = 原单.noShipmentReason; const 原仓 = JSON.stringify(仓('21'))
    原单.items[0]!.systemSku = undefined; 原单.defaultRoute = undefined
    expect(撤销不发货阻断原因(原单)).toEqual([])
    expect(执行演示撤销不发货(原单.systemOrderNo, 1, '误操作，已核查原判断错误仍需发货').成功).toBe(true)
    expect(原单.processingStatus).toBe('待审核')
    expect(原单.noShipmentReason).toBeUndefined()
    expect(原单.operationLogs[原单.operationLogs.length - 1]!.content).toContain(原原因!)
    expect(JSON.stringify(仓('21'))).toBe(原仓)
  })
  it.each(['22', '23'])('%s 原终止依据仍成立不能撤销', 编号 => {
    expect(执行演示撤销不发货(单(编号).systemOrderNo, 1, '纠错').成功).toBe(false)
    expect(单(编号).processingStatus).toBe('不发货')
  })
  it('最终取消且仓库已结束的异常可不发货，正常状态须先异常复核', () => {
    expect(执行演示不发货(单('32').systemOrderNo, 1, '平台已取消，仓库已取消且零出库').成功).toBe(true)
    expect(单('32').cancelledAt).toBeTruthy()
    const 原单 = 单('13'); 操作核查证据.value[原单.systemOrderNo]!.平台允许 = false
    expect(不发货阻断原因(原单).join('；')).toContain('异常复核')
    expect(退回待审核阻断原因(原单).join('；')).toContain('异常复核')
    操作核查证据.value[原单.systemOrderNo]!.平台允许 = true
    原单.cancelledAt = '2026-10-10T00:00:00Z'
    expect(不发货阻断原因(原单).join('；')).toContain('异常复核')
  })
})

describe('所有新命令提交时核对版本与输入，阻止重放和范围变化', () => {
  const 单原因命令 = [
    { 名称: '截单', 编号: '12', 执行: (原因: string) => 执行演示截单(仓('12').出库单号, 仓单期望版本(仓('12')), 原因) },
    { 名称: '退回待审核', 编号: '13', 执行: (原因: string) => 执行演示退回待审核(单('13').systemOrderNo, 1, 原因) },
    { 名称: '不发货', 编号: '01', 执行: (原因: string) => 执行演示不发货(单('01').systemOrderNo, 1, 原因) },
    { 名称: '恢复发货', 编号: '17', 执行: (原因: string) => 执行演示恢复发货(单('17').systemOrderNo, 1, 原因) },
    { 名称: '撤销不发货', 编号: '21', 执行: (原因: string) => 执行演示撤销不发货(单('21').systemOrderNo, 1, 原因) },
  ]
  it.each(单原因命令)('$名称 只验证一个必填原因且仅记录一次，既有历史保留', ({ 编号, 执行 }) => {
    const 订单 = 单(编号)
    const 原历史 = JSON.stringify(订单.operationLogs)
    expect(执行(' \n ').成功).toBe(false)
    expect(执行('文'.repeat(2001)).成功).toBe(false)
    expect(JSON.stringify(订单.operationLogs)).toBe(原历史)
    const 原历史条数 = 订单.operationLogs.length
    expect(执行('  本次后续处理原因  ').成功).toBe(true)
    expect(JSON.stringify(订单.operationLogs.slice(0, 原历史条数))).toBe(原历史)
    const 日志 = 订单.operationLogs[订单.operationLogs.length - 1]!.content
    expect(日志.match(/本次后续处理原因/g)).toHaveLength(1)
    expect(日志).not.toMatch(/复核：|复核说明：|纠错说明：|核查依据：/)
  })
  it('共享仓单任何来源版本变化均阻止申请，不只检查代表订单', () => {
    const 执行 = 仓('SHARED'); const 版本表 = 仓单期望版本(执行)
    订单版本.value[单('34').systemOrderNo] = 2
    expect(执行演示截单(执行.出库单号, 版本表, '截单').信息).toContain('已变化')
    expect(执行.状态).toBe('待出库')
  })
  it('空必填及超过 2000 字符均不写日志，过期恢复版本不可重放', () => {
    const 原单 = 单('17'); const 快照 = JSON.stringify(原单)
    expect(执行演示恢复发货(原单.systemOrderNo, 1, ' ').成功).toBe(false)
    expect(执行演示恢复发货(原单.systemOrderNo, 1, '文'.repeat(2001)).成功).toBe(false)
    expect(执行演示恢复发货(原单.systemOrderNo, 0, '恢复').成功).toBe(false)
    expect(JSON.stringify(原单)).toBe(快照)
    expect(执行演示不发货(单('01').systemOrderNo, 1, ' ').成功).toBe(false)
    expect(执行演示撤销不发货(单('21').systemOrderNo, 1, ' ').成功).toBe(false)
  })
  it('共享推单要求全部来源版本且每条来源当前状态均合格', () => {
    const 来源一 = 单('33'); const 来源二 = 单('34'); const 履约号 = 来源一.fulfillmentOrders[0]!.fulfillmentOrderNo
    仓库执行记录.value = 仓库执行记录.value.filter(项 => 项.履约单号 !== 履约号)
    来源一.processingStatus = '待推单'; 来源二.processingStatus = '异常'
    const 版本表 = { [来源一.systemOrderNo]: 1, [来源二.systemOrderNo]: 1 }
    expect(执行演示推单(来源一.systemOrderNo, 履约号, 1).信息).toContain('全部来源订单版本')
    expect(执行演示推单(来源一.systemOrderNo, 履约号, 1, 版本表).成功).toBe(false)
    expect(仓库执行记录.value.some(项 => 项.履约单号 === 履约号)).toBe(false)
  })
})
