import type { 全渠道订单, 履约单摘要, 订单处理状态 } from '../全渠道订单/类型'
import type { 仓库执行 } from './演示会话'

/** 独立的虚构核查证据，不向标准订单写入平台特有字段。 */
export interface 操作证据 {
  平台允许: boolean
  剩余已核实: boolean
  零出库已核实: boolean
  原请求未生效?: boolean
  失败已修复?: boolean
  原方案有效?: boolean
  原执行可继续?: boolean
  终止依据已纠正?: boolean
  同步结果?: '正常' | '查询失败' | '未查到' | '未知' | '已出库' | '拒绝截单'
  不支持查询?: boolean
  不支持截单?: boolean
  路由适用?: boolean
  发货资料有效?: boolean
  计划可停止?: boolean
  范围无重叠?: boolean
  范围已核清?: boolean
  查询标识完整?: boolean
  截单阶段可撤?: boolean
}

type 库存结果 = '充足' | '不足' | '结果未知'
interface 操作场景 {
  编号: string
  名称: string
  状态: 订单处理状态
  仓态?: 仓库执行['状态']
  库存?: 库存结果
  证据?: Partial<操作证据>
}

// 只使用一期 eBay 自配送虚构样例。ACTION 编号可用平台订单号／系统订单号精确搜索。
// 每条表示不同业务事实，不以一组重复订单填充页面。
const 独立场景: 操作场景[] = [
  { 编号: '01', 名称: '发货条件齐备，可审核', 状态: '待审核' },
  { 编号: '02', 名称: '库存不足，可改仓库物流但不能审核', 状态: '待审核', 库存: '不足' },
  { 编号: '03', 名称: '库存结果未知，不能审核', 状态: '待审核', 库存: '结果未知' },
  { 编号: '04', 名称: '系统 SKU 映射缺失，待中台资料修复', 状态: '待审核', 证据: { 发货资料有效: false } },
  { 编号: '05', 名称: '发货仓库物流未分配，待补方案', 状态: '待审核' },
  { 编号: '06', 名称: '平台部分履约，剩余范围尚未核实', 状态: '待审核', 证据: { 剩余已核实: false } },
  { 编号: '07', 名称: '已审核未推单，可推单或退回待审核', 状态: '待推单' },
  { 编号: '08', 名称: '仓库明确建单失败且问题已修复，可重新推单', 状态: '待推单', 仓态: '下单失败', 证据: { 原请求未生效: true, 失败已修复: true } },
  { 编号: '09', 名称: '仓库明确建单失败但问题未修复，不能重新推单', 状态: '待推单', 仓态: '下单失败', 证据: { 原请求未生效: true, 失败已修复: false } },
  { 编号: '10', 名称: '推单已受理，同步后取得明确建单成功', 状态: '待推单', 仓态: '下单中' },
  { 编号: '11', 名称: '推单结果未明且查询未查到，不得重新推单', 状态: '待推单', 仓态: '下单中', 证据: { 同步结果: '未查到', 原请求未生效: false } },
  { 编号: '12', 名称: '仓库已建单且零出库，可申请截单', 状态: '待发货', 仓态: '待出库' },
  { 编号: '13', 名称: '已明确截单成功，可退回待审核或不发货', 状态: '待发货', 仓态: '已取消' },
  { 编号: '14', 名称: '仓库截单处理中，等待明确结果', 状态: '待发货', 仓态: '取消中' },
  { 编号: '15', 名称: '计划两件已出库一件，整单终止及普通恢复被拦截', 状态: '待发货', 仓态: '待出库', 证据: { 零出库已核实: false } },
  { 编号: '16', 名称: '查询接口失败，保留原仓库及订单状态', 状态: '待发货', 仓态: '待出库', 证据: { 同步结果: '查询失败' } },
  { 编号: '17', 名称: '异常已复核，继续唯一原仓单恢复到待发货', 状态: '异常', 仓态: '待出库', 库存: '不足', 证据: { 原执行可继续: true } },
  { 编号: '18', 名称: '异常已复核且原方案仍适用，恢复到待推单', 状态: '异常', 仓态: '已取消', 证据: { 原方案有效: true } },
  { 编号: '19', 名称: '异常需重审及修复 SKU，恢复到待审核', 状态: '异常', 仓态: '已取消', 证据: { 原方案有效: false, 发货资料有效: false } },
  { 编号: '20', 名称: '平台仍取消中，不能恢复发货但可同步或截单', 状态: '异常', 仓态: '待出库', 证据: { 平台允许: false } },
  { 编号: '21', 名称: '误操作不发货且纠错依据明确，可撤销回待审核', 状态: '不发货', 仓态: '已取消', 证据: { 终止依据已纠正: true } },
  { 编号: '22', 名称: '平台仍已取消，原终止依据成立不可撤销', 状态: '不发货', 仓态: '已取消', 证据: { 平台允许: false, 终止依据已纠正: false } },
  { 编号: '23', 名称: '整单系统外履约已确认，无剩余发货需求不可撤销', 状态: '不发货', 证据: { 终止依据已纠正: false } },
  { 编号: '24', 名称: '同步取得足量出库事实，进入已发货', 状态: '待发货', 仓态: '待出库', 证据: { 同步结果: '已出库' } },
  { 编号: '25', 名称: '已发货终态仍可查询仓库及查看订单标发', 状态: '已发货', 仓态: '已出库', 证据: { 零出库已核实: false } },
  { 编号: '26', 名称: '仓库拒绝截单，保留原执行继续核查', 状态: '待发货', 仓态: '待出库', 证据: { 同步结果: '拒绝截单' } },
  { 编号: '27', 名称: '最新实际出库数量未核实，不能整单终止或恢复', 状态: '异常', 仓态: '已取消', 证据: { 零出库已核实: false, 剩余已核实: false } },
  { 编号: '28', 名称: '当前仓库查询能力未具备，提示联系仓库', 状态: '待发货', 仓态: '待出库', 证据: { 不支持查询: true } },
  { 编号: '29', 名称: '当前仓库截单能力未具备，禁止截单', 状态: '待发货', 仓态: '待出库', 证据: { 不支持截单: true } },
  { 编号: '30', 名称: '仓库返回未知结果，保留最后可信事实', 状态: '待发货', 仓态: '待出库', 证据: { 同步结果: '未知' } },
  { 编号: '31', 名称: '失败后商品方案已变化，必须退回重审', 状态: '待推单', 仓态: '下单失败', 证据: { 原请求未生效: true, 失败已修复: true, 原方案有效: false } },
  { 编号: '32', 名称: '异常已最终取消且仓库执行结束，可人工不发货', 状态: '异常', 仓态: '已取消', 证据: { 平台允许: false } },
]

/** 交付与测试检索目录；场景说明仅记录在业务历史，不增加列表伪字段。 */
export const 操作演示场景目录 = [
  ...独立场景.map(({ 编号, 名称, 状态 }) => ({ 编号: `ACTION-${编号}`, 名称, 状态 })),
  { 编号: 'ACTION-33', 名称: '共享合单来源一，单个截单须展示全部来源', 状态: '待发货' as const },
  { 编号: 'ACTION-34', 名称: '共享合单来源二，批量截单及整单终止须跳过', 状态: '待发货' as const },
]

export function 创建操作演示(创建: (序号: number, 覆盖?: Partial<全渠道订单>) => 全渠道订单) {
  const 订单: 全渠道订单[] = []
  const 执行: 仓库执行[] = []
  const 证据: Record<string, 操作证据> = {}
  const 库存: Record<string, 库存结果> = {}
  const 开始 = '2026-10-10 09:03:00 UTC+8'
  const 核查时间 = '2026-10-10 11:00:00 UTC+8'

  function 创建订单(编号: string, 状态: 订单处理状态): 全渠道订单 {
    const 单 = 创建(200 + Number(编号), {
      systemOrderNo: `OMS-DEMO-ACTION-${编号}`,
      platformCode: 'eBay', storeId: 'demo-ebay-actions', storeName: '汽配操作评审店',
      platformOrderId: `DEMO-ACTION-${编号}`, platformOrderNo: `DEMO-ACTION-${编号}`,
      platformOrderStatus: 'NOT_STARTED', processingStatus: 状态, professionalOrder: undefined,
      orderedAt: `2026-10-10 08:${String(59 - Number(编号)).padStart(2, '0')}:00 UTC+8`,
      paidAt: '2026-10-10 09:01:00 UTC+8', createdAt: '2026-10-10 09:02:00 UTC+8',
      lastSyncedAt: 核查时间, shipByAt: '2026-10-12 18:00:00 UTC+8', shipByLabel: '10-12 18:00',
      platformUpdatedAt: undefined, cancelledAt: undefined, cancelledReason: undefined,
      blockReason: undefined, noShipmentReason: undefined, fulfillmentCompletedAt: undefined,
      buyerExternalId: `demo-action-buyer-${编号}`, tags: [], reviews: [], fulfillmentOrders: [], operationLogs: [],
      sync: { status: '已同步', normalizationStatus: '已标准化', latestAttempt: 核查时间, lastSuccess: 核查时间, message: '虚构来源快照，用于订单操作评审；未调用真实平台或仓库。' },
    })
    // 商品、收件人及编号均为虚构；数量与金额一致，不能继承基础样例的整单费用或已出库历史。
    单.items = [{
      ...structuredClone(单.items[0]!), externalLineId: `DEMO-ACTION-LINE-${编号}`,
      orderedQuantity: 2, fulfillableQuantity: 2,
      unitPrice: { value: '49.90', currency: 'USD' }, itemTotal: { value: '99.80', currency: 'USD' },
      actualReceived: { value: '99.80', currency: 'USD' }, actualReceivedSource: 'PLATFORM', currencyCode: 'USD',
    }]
    单.amount = { orderAmount: { value: '99.80', currency: 'USD' }, buyerPaidShipping: { value: '0.00', currency: 'USD' } }
    单.address = { fullName: `虚构收件人 ${编号}`, countryCode: 'US', stateProvince: 'CA', city: '演示城市', addressLine1: '演示地址 100 号', postalCode: '90000' }
    return 单
  }

  function 创建履约(单: 全渠道订单, 编号: string, 仓态?: 仓库执行['状态']): 履约单摘要 {
    const 已结束 = 仓态 === '已取消'
    const 已发货 = 仓态 === '已出库'
    return {
      fulfillmentOrderNo: `FL-DEMO-ACTION-${编号}`,
      status: 已结束 ? '已终止' : 已发货 ? '已发货' : 仓态 && !['下单中', '下单失败'].includes(仓态) ? '执行中' : '待执行',
      isActive: !已结束, route: structuredClone(单.defaultRoute!), plannedQuantity: 2,
      shippedQuantity: 已发货 ? 2 : 编号 === '15' ? 1 : 0,
      shippedAt: 已发货 || 编号 === '15' ? '2026-10-10 10:30:00 UTC+8' : undefined,
      trackingNumber: 已发货 || 编号 === '15' ? `DEMO-TRACK-ACTION-${编号}` : undefined,
    }
  }

  for (const 场景 of 独立场景) {
    const { 编号, 名称, 状态, 仓态 } = 场景
    const 单 = 创建订单(编号, 状态)
    if (状态 === '异常') 单.blockReason = '原发货问题已停止处理，待人工复核当前平台条件及原执行。'
    if (编号 === '04' || 编号 === '19') {
      单.items[0]!.systemSku = undefined
      单.items[0]!.skuResolutionStatus = '缺失'
    }
    if (编号 === '05') 单.defaultRoute = undefined
    if (编号 === '06') {
      单.platformOrderStatus = 'IN_PROGRESS'
      单.items[0]!.fulfillableQuantity = undefined
      单.blockReason = '平台部分履约，请人工核实已履约范围和剩余数量。'
      单.reviews = [{ round: 1, type: '自动审核', triggerSource: '虚构审核规则', status: '已拦截', decisionNote: '命中 eBay 部分履约规则；已履约及剩余商品数量尚未取得可信核查依据，保留待审核，不得按整单再次发货。', completedAt: 核查时间 }]
    }
    if (状态 !== '待审核' && 编号 !== '23') {
      单.reviews = [{ round: 1, type: '人工审核', triggerSource: '虚构操作核查', status: '已通过', decisionNote: '原审核已确认两件商品及原发货方案；旧审核和路由保留为历史，当前资格另行核查。', completedAt: '2026-10-10 09:05:00 UTC+8' }]
      单.fulfillmentOrders = [创建履约(单, 编号, 仓态)]
    }
    if (编号 === '17' || 编号 === '18') 单.blockReason = '此前平台发货条件变化已转异常；最新条件已恢复，等待人工复核后恢复发货。'
    if (编号 === '19') 单.blockReason = '原仓库执行已结束，系统 SKU 映射失效；需恢复待审核后修复发货方案。'
    if (编号 === '20') 单.blockReason = '平台取消处理中，已停止后续发货；尚无最终取消事实。'
    if (编号 === '21') 单.noShipmentReason = '原人工终止判断有误；已取得仍需发货的核查依据，等待撤销不发货。'
    if (编号 === '22' || 编号 === '32') {
      单.cancelledAt = '2026-10-10 10:00:00 UTC+8'
      单.cancelledReason = '虚构平台结果：买家取消，平台已确认最终取消。'
      if (编号 === '22') 单.noShipmentReason = '平台已最终取消，仓库已截单成功，无需 OMS 继续发货。'
      else 单.blockReason = '准入后平台已最终取消，原仓库执行已结束，待人工复核是否不发货。'
    }
    if (编号 === '23') {
      单.platformOrderStatus = 'FULFILLED'
      单.noShipmentReason = '整单已在系统外履约，已核查 OMS 零出库且无未结束执行，无剩余发货需求。'
      单.items[0]!.fulfillableQuantity = 0
    }
    if (编号 === '27') 单.blockReason = '原仓库已取消，但最新实际出库数量尚未完整核实，保留最后可信记录，不能按零出库放行。'
    if (编号 === '31') {
      单.items[0]!.systemSku = 'DEMO-SKU-CHANGED-ACTION-31'
      单.items[0]!.systemItemName = '虚构替换规格汽配商品'
    }
    if (编号 === '25') 单.fulfillmentCompletedAt = '2026-10-10 10:30:00 UTC+8'
    if (仓态) 执行.push({
      履约单号: `FL-DEMO-ACTION-${编号}`, 订单号: [单.systemOrderNo], 出库单号: `OUT-DEMO-ACTION-${编号}`,
      三方仓出库单号: ['下单中', '下单失败'].includes(仓态) ? undefined : `WH-DEMO-ACTION-${编号}`,
      状态: 仓态, 待核查: ['下单中', '取消中'].includes(仓态) || 编号 === '27',
      原因: 仓态 === '下单失败' ? '仓库明确拒绝原请求：所选渠道尚未开通。'
        : 仓态 === '下单中' ? '仓库建单结果尚未明确，请同步仓库状态。'
          : 仓态 === '取消中' ? '截单已受理，尚未取得仓库明确结果。'
            : 编号 === '15' ? '已有一件有效出库，剩余范围暂停并交专项核查。'
              : 编号 === '27' ? '最新出库量待核实；记录中的零仅是旧可信值，不能代替最新事实。' : '',
      更新时间: 核查时间,
    })
    单.operationLogs = [{ operatedAt: 开始, operationType: '虚构操作场景初始化', operationResult: '成功', operator: '原型用户', content: `ACTION-${编号}：${名称}。` }]
    if (仓态 === '已取消') 单.operationLogs.push({ operatedAt: '2026-10-10 10:45:00 UTC+8', operationType: '仓库截单结果', operationResult: '成功', operator: '原型用户', content: '虚构仓库已明确取消原出库单；原审核、履约及实际路由保留，不恢复旧仓单。' })
    订单.push(单)
    证据[单.systemOrderNo] = {
      平台允许: true, 剩余已核实: true, 零出库已核实: true, 原方案有效: true,
      路由适用: true, 发货资料有效: true, 计划可停止: true, 范围无重叠: true, 范围已核清: true,
      查询标识完整: true, 截单阶段可撤: true, ...场景.证据,
    }
    库存[单.systemOrderNo] = 场景.库存 ?? '充足'
  }

  // 一张履约及仓单共享两张来源。两单各一件，履约总计划两件；不能每个来源都记两件。
  const 共享 = ['33', '34'].map(编号 => 创建订单(编号, '待发货'))
  const 共享路由 = structuredClone(共享[0]!.defaultRoute!)
  for (const 单 of 共享) {
    单.defaultRoute = structuredClone(共享路由)
    单.items[0]!.orderedQuantity = 1
    单.items[0]!.fulfillableQuantity = 1
    单.items[0]!.itemTotal = { value: '49.90', currency: 'USD' }
    单.items[0]!.actualReceived = { value: '49.90', currency: 'USD' }
    单.amount.orderAmount = { value: '49.90', currency: 'USD' }
    单.address = structuredClone(共享[0]!.address)
    单.buyerExternalId = 'demo-action-shared-buyer'
    单.reviews = [{ round: 1, type: '人工审核', triggerSource: '虚构共享方案核查', status: '已通过', decisionNote: '核对两张来源各一件，合计两件，地址及路由一致；同一履约只提交一次。', completedAt: '2026-10-10 09:05:00 UTC+8' }]
    单.fulfillmentOrders = [{ fulfillmentOrderNo: 'FL-DEMO-ACTION-SHARED', status: '执行中', isActive: true, route: structuredClone(共享路由), plannedQuantity: 2, shippedQuantity: 0 }]
    单.operationLogs = [{ operatedAt: 开始, operationType: '虚构共享操作场景初始化', operationResult: '成功', operator: '原型用户', content: 'ACTION-33 与 ACTION-34 共用一张履约及仓库单，各一件，计划总量两件。单个截单核对全部来源，批量截单、退回及整单终止跳过共享路径。' }]
    证据[单.systemOrderNo] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true, 范围已核清: true }
    库存[单.systemOrderNo] = '充足'
  }
  执行.push({ 履约单号: 'FL-DEMO-ACTION-SHARED', 订单号: 共享.map(单 => 单.systemOrderNo), 出库单号: 'OUT-DEMO-ACTION-SHARED', 三方仓出库单号: 'WH-DEMO-ACTION-SHARED', 状态: '待出库', 待核查: false, 原因: '', 更新时间: 核查时间 })
  return { 订单: [...订单, ...共享], 执行, 证据, 库存 }
}
