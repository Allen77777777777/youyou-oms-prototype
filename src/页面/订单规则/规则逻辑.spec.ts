import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 共享订单备注, 订单备注字数上限 } from '../订单处理/订单备注模型'
import { 创建规则样例, 命中规则, 试算规则, 校验规则配置, eBay平台订单状态选项, 规则动作, type 订单规则, type 规则条件 } from './规则逻辑'
import { 默认审单分组 } from './默认审单清单'
import { 创建规则渠道样例 } from './规则路由'
import { 创建规则草稿, 丢弃规则草稿 } from './规则编辑会话'
import { 基础多选字段, 多选条件字段, 是否多选条件字段, 多行文本字段, 是否多行文本字段, 读取条件多选值, 读取条件多行值, 读取范围边界, 条件分组, 条件定义, 条件字段名, 条件操作符, 创建空条件, 格式化条件值, 校验条件配置, type 条件字段 } from './规则条件定义'
import { 共享规则 } from './演示会话'
import { 中台系统用户资料 } from './规则基础选项'

describe('订单规则本地试算', () => {
  it('停用或无条件规则不会意外匹配所有订单', () => { const 规则 = 创建规则样例()[0]!; const 单 = 全渠道订单模拟数据[0]!; 规则.enabled = false; expect(命中规则(规则, 单)).toBe(false); 规则.enabled = true; 规则.conditions = []; expect(命中规则(规则, 单)).toBe(false) })
  it('所有条件必须同时满足，遗留任一满足配置不命中也不可保存', () => {
    const 规则 = 创建规则样例()[0]!, 单 = 全渠道订单模拟数据[0]!
    expect(命中规则(规则, 单)).toBe(true)
    规则.conditions[1]!.value = 'DE'
    expect(命中规则(规则, 单)).toBe(false)
    规则.mode = '任一满足'
    expect(命中规则(规则, 单)).toBe(false)
    expect(校验规则配置(规则, [规则])).toContain('仅支持全部条件同时满足')
    expect(试算规则([规则], 单, '审单规则').hit).toBeUndefined()
    expect(规则.mode).toBe('任一满足')
  })
  it('按优先级保留所有命中轨迹，但候选只有首条', () => { const 规则 = 创建规则样例().filter(项 => 项.type === '分仓规则'); 规则[1]!.enabled = true; 规则[1]!.priority = 1; const 结果 = 试算规则(规则, 全渠道订单模拟数据[0]!, '分仓规则'); expect(结果.hit?.id).toBe('RULE-ROUTE-02'); expect(结果.trace.filter(条 => 条.matched)).toHaveLength(2) })
  it('条件命中不能绕过订单处理阶段门禁，也不写入订单', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); const 原状态 = 单.processingStatus; const 原路由 = structuredClone(单.defaultRoute); const 结果 = 试算规则(创建规则样例(), 单, '分仓规则'); expect(结果.hit).toBeDefined(); expect(结果.gates).toContain('审单与首次路由分配只在待审核阶段执行'); expect(单.processingStatus).toBe(原状态); expect(单.defaultRoute).toEqual(原路由) })
  it('没有有效出库时标发规则只能返回候选并显示门禁', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.fulfillmentOrders = []; const 结果 = 试算规则(创建规则样例(), 单, '订单标发规则'); expect(结果.hit).toBeDefined(); expect(结果.gates).toContain('未取得有效出库事实，不得标发') })
  it('标准订单付款时间只用于展示，不作为规则试算门禁', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.processingStatus = '待审核'; 单.paidAt = undefined; const 结果 = 试算规则(创建规则样例(), 单, '审单规则'); expect(结果.gates.join('；')).not.toContain('付款') })
  it('部分出库但来源 OMS 尚未已发货时不允许提前标发，试算保持只读', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.processingStatus = '待发货'
    单.fulfillmentOrders[0]!.shippedQuantity = 1
    单.fulfillmentOrders[0]!.shippedAt = '2026-10-16 10:00:00 UTC+8'
    const 前快照 = JSON.stringify(单)
    const 结果 = 试算规则(创建规则样例(), 单, '订单标发规则')
    expect(结果.hit).toBeDefined()
    expect(结果.gates).toContain('来源 OMS 订单尚未已发货，不得生成或调度标发')
    expect(结果.gates).not.toContain('未取得有效出库事实，不得标发')
    expect(JSON.stringify(单)).toBe(前快照)
    单.processingStatus = '已发货'
    expect(试算规则(创建规则样例(), 单, '订单标发规则').gates).toEqual([])
  })
  it('标发仅有已发货状态但无有效出库仍被独立门禁拦截', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.processingStatus = '已发货'; 单.fulfillmentOrders = []
    expect(试算规则(创建规则样例(), 单, '订单标发规则').gates).toContain('未取得有效出库事实，不得标发')
  })
  it('店铺条件按稳定 ID 匹配，同名其他店铺不能命中；旧名称条件仍兼容', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    规则.conditions = [{ field: 'storeId', operator: '等于', value: 单.storeId }]
    expect(命中规则(规则, 单)).toBe(true)
    单.storeId = 'store-another-id'
    expect(命中规则(规则, 单)).toBe(false)
    规则.conditions = [{ field: 'storeName', operator: '等于', value: 单.storeName }]
    expect(命中规则(规则, 单)).toBe(true)
  })
  it.each(['等于', '不等于'] as const)('空店铺 ID 在%s条件中均不命中，并返回中文未知字段', operator => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    单.storeId = '  '
    规则.conditions = [{ field: 'storeId', operator, value: 'store-a' }]
    const 结果 = 试算规则([规则], 单, '审单规则')
    expect(命中规则(规则, 单)).toBe(false)
    expect(结果.unknownFields).toEqual(['订单店铺'])
    expect(结果.trace[0]!.unknownFields).toEqual(['订单店铺'])
  })
  it('缺失国家与平台状态保持未知，去重且不采集停用规则', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    单.address.countryCode = ''; 单.platformOrderStatus = undefined
    规则.conditions = [
      { field: 'platformCode', operator: '等于', value: 'eBay' },
      { field: 'platformOrderStatus', operator: '不等于', value: 'FULFILLED' },
      { field: 'countryCode', operator: '不等于', value: '', values: ['US', 'DE'] },
    ]
    const 结果 = 试算规则([规则], 单, '审单规则')
    expect(结果.hit).toBeUndefined()
    expect(结果.unknownFields).toEqual(['平台订单状态', '收货国家'])
    规则.enabled = false
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual([])
  })
  it('遗留任一满足配置即使含有已满足条件，也不返回试算候选', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    单.address.countryCode = ''
    规则.mode = '任一满足'
    规则.conditions = [{ field: 'countryCode', operator: '不等于', value: 'US' }, { field: 'platformCode', operator: '等于', value: 'eBay' }]
    const 结果 = 试算规则([规则], 单, '审单规则')
    expect(结果.hit).toBeUndefined()
    expect(结果.trace[0]!.matched).toBe(false)
    expect(规则.mode).toBe('任一满足')
  })
  it('eBay 履约状态使用标准投影，未知枚举不能被不等于匹配', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    规则.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }]
    单.platformOrderStatus = 'IN_PROGRESS'
    expect(命中规则(规则, 单)).toBe(true)
    单.platformOrderStatus = 'UNRECOGNIZED'
    规则.conditions[1]!.operator = '不等于'
    expect(命中规则(规则, 单)).toBe(false)
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual(['平台订单状态'])
  })
  it('平台状态条件不能用于其他平台或 OR 范围', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 创建规则样例()[0]!
    规则.conditions = [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }]
    单.platformOrderStatus = 'IN_PROGRESS'; 规则.mode = '任一满足'
    expect(命中规则(规则, 单)).toBe(false)
    规则.mode = '全部满足'; 单.platformCode = 'Temu'
    expect(命中规则(规则, 单)).toBe(false)
  })
  it('保留现有四条样例身份与顺序，不隐式创建默认规则', () => {
    expect(创建规则样例().map(规则 => 规则.id)).toEqual(['RULE-REVIEW-01', 'RULE-ROUTE-01', 'RULE-ROUTE-02', 'RULE-CONFIRM-01'])
  })
})

describe('订单规则配置校验', () => {
  function 规则覆盖(覆盖: Partial<订单规则> = {}) { return { ...创建规则样例()[0]!, ...覆盖 } }
  it('合法旧字段配置可继续保存，名称比较去除首尾空格且限同类', () => {
    const 原规则 = 规则覆盖(), 新规则 = 规则覆盖({ id: 'NEW', name: ` ${原规则.name} ` })
    expect(校验规则配置(原规则, [原规则])).toBe('')
    expect(校验规则配置(新规则, [原规则])).toContain('同名')
    expect(校验规则配置(规则覆盖({ name: '   ' }), [])).toContain('名称')
    expect(校验规则配置(规则覆盖({ ...新规则, type: '订单标发规则', action: '无需标发' }), [原规则])).toBe('')
  })
  it('拒绝空条件、空值、非法字段、操作符、动作与匹配方式', () => {
    expect(校验规则配置(规则覆盖({ conditions: [] }), [])).toContain('完整条件')
    expect(校验规则配置(规则覆盖({ conditions: [{ field: 'storeId', operator: '等于', value: ' ' }] }), [])).toContain('完整条件')
    expect(校验规则配置(规则覆盖({ conditions: [{ field: 'paymentStatus', operator: '等于', value: 'PAID' } as unknown as 规则条件] }), [])).toContain('条件字段')
    expect(校验规则配置(规则覆盖({ conditions: [{ field: 'storeId', operator: '包含', value: 'x' } as unknown as 规则条件] }), [])).toContain('比较方式')
    expect(校验规则配置(规则覆盖({ action: '直接推仓' }), [])).toContain('执行动作')
    expect(校验规则配置(规则覆盖({ mode: '任意脚本' as 订单规则['mode'] }), [])).toContain('仅支持全部条件同时满足')
  })
  it('同字段多行即使曾用于表达矛盾条件也禁止保存，不能改成任一满足绕过', () => {
    const 条件: 规则条件[] = [{ field: 'countryCode', operator: '等于', value: 'US' }, { field: 'countryCode', operator: '不等于', value: 'US' }]
    expect(校验规则配置(规则覆盖({ conditions: 条件 }), [])).toContain('仅能配置一行')
    条件[1] = { field: 'countryCode', operator: '等于', value: 'DE' }
    expect(校验规则配置(规则覆盖({ conditions: 条件 }), [])).toContain('仅能配置一行')
    expect(校验规则配置(规则覆盖({ conditions: 条件, mode: '任一满足' }), [])).toContain('仅支持全部条件同时满足')
  })
  it('平台状态只允许 eBay 履约三枚举，要求 AND 和明确的 eBay 平台等于条件', () => {
    const 条件: 规则条件[] = [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }]
    expect(eBay平台订单状态选项.map(项 => 项.value)).toEqual(['NOT_STARTED', 'IN_PROGRESS', 'FULFILLED'])
    expect(校验规则配置(规则覆盖({ conditions: 条件 }), [])).toBe('')
    expect(校验规则配置(规则覆盖({ conditions: 条件, mode: '任一满足' }), [])).toContain('仅支持全部条件同时满足')
    expect(校验规则配置(规则覆盖({ conditions: 条件.slice(1) }), [])).toContain('限定平台等于 eBay')
    expect(校验规则配置(规则覆盖({ conditions: [{ field: 'platformCode', operator: '等于', value: 'Temu' }, 条件[1]!] }), [])).toContain('限定平台等于 eBay')
    expect(校验规则配置(规则覆盖({ conditions: [条件[0]!, { field: 'platformOrderStatus', operator: '等于', value: 'PAID' }] }), [])).toContain('eBay 履约状态')
  })
})

describe('系统默认审单只读清单', () => {
  it('严格保留 PRD 五组与连续 20 项，不提供启停配置', () => {
    const 清单 = 默认审单分组.flatMap(组 => 组.items)
    expect(默认审单分组.map(组 => [组.title, 组.items.length])).toEqual([['审核操作资格', 4], ['平台发货条件', 4], ['商品、数量与收件资料', 7], ['仓库、物流与库存', 4], ['订单标志', 1]])
    expect(清单.map(项 => 项.no)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(清单.every(项 => 项.name.trim() && 项.description.trim() && 项.result.trim())).toBe(true)
    expect(清单.some(项 => 'enabled' in 项)).toBe(false)
    expect(Object.isFrozen(默认审单分组)).toBe(true)
    expect(默认审单分组.every(组 => Object.isFrozen(组) && Object.isFrozen(组.items) && 组.items.every(Object.isFrozen))).toBe(true)
  })
  it('退或消任一存在均拦截，人工说明不可解除，其他候选不误写成默认项', () => {
    const 清单 = 默认审单分组.flatMap(组 => 组.items), 标志项 = 清单.find(项 => 项.no === 20)!
    expect(标志项.name).toContain('任一标志')
    expect(标志项.description).toContain('自动、人工及批量')
    expect(标志项.result).toContain('保持待审核')
    expect(标志项.result).toContain('人工解除方式待评审')
    expect(清单.map(项 => 项.name)).not.toContain('平台部分履约')
    expect(清单.map(项 => 项.name)).not.toContain('库存可信性')
    expect(清单.map(项 => 项.name)).not.toContain('面单获取模式')
  })
  it('负向检查说明保留操作资格与平台变化的不同处理', () => {
    const 清单 = 默认审单分组.flatMap(组 => 组.items)
    expect(清单[0]!.description).toContain('拒绝或跳过')
    expect(清单[2]!.description).toContain('不重复启动')
    expect(清单[4]!.description).toContain('付款时间不能替代')
    expect(清单[5]!.description).toContain('按当前订单所处阶段处理')
    expect(清单[13]!.description).toContain('指定寄中转仓')
    expect(清单[18]!.name).toContain('中台库存')
    expect(清单[19]!.description).toContain('保持待审核')
  })
})

describe('固定全部条件的独立草稿', () => {
  it('新增、复制和编辑草稿统一全部满足，遗留来源仍保持原配置等待用户复核保存', () => {
    const 来源 = 创建规则样例()[0]!
    来源.id = 'LEGACY-OR-DRAFT-TEST'; 来源.mode = '任一满足'
    const 前快照 = JSON.stringify(来源)
    const 草稿 = [
      创建规则草稿(来源.type, [来源], 'new')!,
      创建规则草稿(来源.type, [来源], 'copy', 来源)!,
      创建规则草稿(来源.type, [来源], 'edit', 来源)!,
    ]
    try {
      expect(草稿.every(项 => 项.draft.mode === '全部满足')).toBe(true)
      expect(JSON.stringify(来源)).toBe(前快照)
      const 编辑草稿 = 草稿[2]!
      编辑草稿.draft.mode = '任一满足'
      expect(创建规则草稿(来源.type, [来源], 'edit', 来源)?.draft.mode).toBe('全部满足')
      expect(来源.mode).toBe('任一满足')
    } finally { 草稿.forEach(项 => 丢弃规则草稿(项.key)) }
  })
})

describe('分仓规则的路由保存与只读试算', () => {
  it('保存必须引用完整可用路由，不按五个历史仓库名称限制动作', () => {
    const 规则 = 创建规则样例()[1]!, 渠道 = 创建规则渠道样例()
    const 新渠道 = 渠道.find(项 => 项.id === 'DEMO-CHANNEL-1111')!
    规则.action = 新渠道.warehouse
    规则.routeAction = { providerId: 新渠道.providerId, accountId: 新渠道.accountId, warehouseId: 新渠道.warehouseId, channelId: 新渠道.id }
    expect(校验规则配置(规则, [规则], 渠道)).toBe('')
    规则.routeAction.channelId = ''
    expect(校验规则配置(规则, [规则], 渠道)).toContain('请选择物流渠道')
    delete 规则.routeAction
    expect(校验规则配置(规则, [规则], 渠道)).toContain('发货仓库')
    const 审单 = 创建规则样例()[0]!
    expect(校验规则配置(审单, [审单], [])).toBe('')
  })

  it('试算输出明确仓库和渠道的副本，不写订单或源规则，后续变更不改历史结果', () => {
    const 规则 = 创建规则样例(), 渠道 = 创建规则渠道样例(), 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.processingStatus = '待审核'
    const 前订单 = JSON.stringify(单), 前规则 = JSON.stringify(规则), 前渠道 = JSON.stringify(渠道)
    const 结果 = 试算规则(规则, 单, '分仓规则', 渠道)
    expect(结果.hit?.id).toBe('RULE-ROUTE-01')
    expect(结果.route?.id).toBe('DEMO-CF-CHANNEL-WYT')
    expect(结果.route?.warehouse).toBe('万邑通美西仓')
    expect(结果.route?.name).toBe('USPS Ground Advantage')
    expect(结果.gates).toEqual([])
    expect(JSON.stringify(单)).toBe(前订单)
    expect(JSON.stringify(规则)).toBe(前规则)
    expect(JSON.stringify(渠道)).toBe(前渠道)
    渠道.find(项 => 项.id === 结果.route!.id)!.enabled = false
    规则[1]!.action = '已编辑仓库'; 规则[1]!.routeAction!.channelId = ''
    expect(结果.route?.enabled).toBe(true)
    expect(结果.hit?.action).toBe('万邑通美西仓')
    expect(结果.hit?.routeAction?.channelId).toBe('DEMO-CF-CHANNEL-WYT')
    expect(结果.gates).toEqual([])
  })

  it('命中路由失效保持首命中并提示门禁，不静默换成后续规则', () => {
    const 规则 = 创建规则样例(), 渠道 = 创建规则渠道样例(), 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.processingStatus = '待审核'; 规则[2]!.enabled = true
    渠道.find(项 => 项.id === 'DEMO-CF-CHANNEL-WYT')!.enabled = false
    const 结果 = 试算规则(规则, 单, '分仓规则', 渠道)
    expect(结果.hit?.id).toBe('RULE-ROUTE-01')
    expect(结果.route).toBeUndefined()
    expect(结果.gates).toContain('分仓路由：所选物流渠道已停用，请重新选择')
    expect(结果.trace.filter(项 => 项.matched)).toHaveLength(2)
    const 缺渠道 = 试算规则(规则, 单, '分仓规则', [])
    expect(缺渠道.route).toBeUndefined()
    expect(缺渠道.gates).toContain('分仓路由：所选物流渠道不存在，请重新选择')
  })
})

describe('24项条件目录和输入契约', () => {
  it('产品数量兼容旧范围为总数量，SKU模式独立保存类型且仍只收整数', () => {
    const old: 规则条件 = { field: 'warehouseSkuQuantity', operator: '介于', value: '0', upperValue: '10' }
    expect(条件字段名.warehouseSkuQuantity).toBe('产品数量')
    expect(校验条件配置(old)).toBe('')
    expect(格式化条件值(old)).toBe('总数量：大于等于 0，且 小于等于 10')
    const condition = 创建空条件('warehouseSkuQuantity')
    expect(condition.quantityMode).toBe('total')
    Object.assign(condition, { quantityMode: 'sku', value: '2', upperValue: '5' })
    expect(格式化条件值(condition)).toBe('SKU数量：大于 2，且 小于 5')
    expect(校验条件配置(condition)).toBe('')
    condition.value = '2.1'; expect(校验条件配置(condition)).toContain('整数')
    condition.value = '2'; Object.assign(condition, { quantityMode: 'unknown' }); expect(校验条件配置(condition)).toContain('数量类型')
    expect(old.quantityMode).toBeUndefined()
  })

  it('长宽高可选各轴各端，参与的轴同时满足，关闭端原值不参加校验或摘要', () => {
    const condition = 创建空条件('lengthWidthHeight'), bounds = condition.dimensionRanges!
    expect(校验条件配置(condition)).toContain('至少勾选')
    Object.assign(bounds.length, { value: '10', upperValue: '20', lowerEnabled: true, upperEnabled: true })
    Object.assign(bounds.width, { upperValue: '5.5', upperEnabled: true })
    bounds.height.value = '未启用的原文'
    expect(校验条件配置(condition)).toBe('')
    expect(格式化条件值(condition)).toBe('长度 大于 10 cm，且 小于 20 cm；宽度 小于 5.5 cm')
    bounds.length.upperValue = '9'; expect(校验条件配置(condition)).toContain('长度下界不能大于')
    bounds.length.upperValue = '10'; expect(校验条件配置(condition)).toContain('同时包含')
    bounds.length.lowerInclusive = true; bounds.length.upperInclusive = true
    expect(校验条件配置(condition)).toBe('')
    bounds.height.lowerEnabled = true; expect(校验条件配置(condition)).toContain('高度')
    expect(创建空条件('lengthWidthHeight').dimensionRanges!.length.value).toBe('')
  })

  it.each(['dimensionSum', 'longestSide', 'secondSide', 'lengthGirth'] as const)('%s独立cm范围保留严格端点和零值，不计算未知订单尺寸', field => {
    const condition = 创建空条件(field)
    expect(校验条件配置(condition)).toContain('至少勾选')
    Object.assign(condition, { value: '0', lowerEnabled: true })
    expect(校验条件配置(condition)).toBe('')
    expect(格式化条件值(condition)).toBe('大于 0 cm')
    condition.upperValue = '0'; condition.upperEnabled = true
    expect(校验条件配置(condition)).toContain('同时包含')
    condition.lowerInclusive = true; condition.upperInclusive = true
    expect(校验条件配置(condition)).toBe('')
    const rule = 创建规则样例()[0]!; rule.conditions = [condition]
    expect(试算规则([rule], 全渠道订单模拟数据[0]!, '审单规则').unknownFields).toEqual([条件字段名[field]])
  })

  it('四组目录移除未定义交易额及订单运费并统一订单总金额和客付运费名称，存量元数据仍可追溯', () => {
    expect(条件分组.map(组 => [组.title, 组.fields.map(字段 => 条件字段名[字段])])).toEqual([
      ['基础信息', ['订单平台', '订单站点', '订单店铺']],
      ['物流信息', ['收货国家', '收货省/州', '收货城市', '订单地址', '平台配送方式']],
      ['订单信息', ['订单重量（kg）', '订单总金额范围', '客付运费范围', '买家留言', '商品单价金额范围']],
      ['货品信息', ['产品尺寸', '仓库SKU', '平台SKU', '产品数量', '长宽高', '三边之和', '最长边', '次长边', '长+(宽+高)×2', '产品销售负责人', '材积范围']],
    ])
    const 可新增 = 条件分组.flatMap(组 => 组.fields)
    expect(new Set(可新增).size).toBe(24)
    expect(可新增).not.toContain('specifiedWarehouseSku')
    expect(可新增.filter(field => 条件定义[field].kind === 'range')).toHaveLength(9)
    expect(可新增.filter(field => 条件定义[field].money)).toHaveLength(3)
    expect(可新增).not.toContain('orderShippingAmount')
    expect(条件字段名.buyerPaidShipping).toBe('客付运费范围')
    expect(可新增).not.toContain('transactionAmount')
    expect(条件字段名.transactionAmount).toBe('订单交易额范围')
    expect(可新增).not.toContain('fulfillmentMode')
    expect(可新增).not.toContain('platformOrderStatus')
    expect(可新增).not.toContain('storeName')
    expect(条件定义.platformOrderStatus.kind).toBe('select')
    expect(条件字段名.fulfillmentMode).toBe('履约模式')
    expect(条件定义.countryCode.kind).toBe('multi')
    expect(多选条件字段).toEqual(['platformCode', 'siteCode', 'storeId', 'countryCode'])
    expect(是否多选条件字段('countryCode')).toBe(true)
    expect(是否多选条件字段('city')).toBe(false)
  })

  it('范围、尺寸、文本与枚举各用对应操作符，范围和尺寸新草稿互相独立', () => {
    expect(条件操作符('orderAmount')).toEqual(['介于'])
    expect(条件操作符('productDimensions')).toEqual(['等于', '不等于'])
    expect(条件操作符('platformCode')).toEqual(['等于', '不等于'])
    expect(条件操作符('platformSku')).toEqual(['等于', '不等于', '包含', '不包含'])
    expect(条件操作符('buyerMessage')).toContain('存在')
    expect(条件操作符('buyerMessage')).toContain('不存在')
    expect(多行文本字段).toEqual(['orderAddress', 'stateProvince', 'city', 'platformShippingMethod', 'buyerMessage', 'warehouseSku', 'platformSku'])
    for (const field of 多行文本字段) {
      expect(是否多行文本字段(field)).toBe(true)
      expect(校验条件配置({ field, operator: '包含', value: ' \n\r\n\t' })).toContain('完整条件')
      if (field === 'buyerMessage') {
        expect(条件操作符(field)).toEqual(['包含', '等于', '不等于', '不包含', '存在', '不存在'])
        expect(创建空条件(field)).toEqual({ field, operator: '包含', value: '' })
      } else if (field === 'warehouseSku' || field === 'platformSku') {
        expect(条件操作符(field)).toEqual(['等于', '不等于', '包含', '不包含'])
        expect(创建空条件(field)).toEqual({ field, operator: '等于', value: '' })
      } else {
        expect(条件操作符(field)).toEqual(['包含', '不包含'])
        expect(创建空条件(field)).toEqual({ field, operator: '包含', value: '' })
        for (const operator of ['等于', '不等于'] as const) expect(校验条件配置({ field, operator, value: '旧完整文本' })).toContain('比较方式')
      }
    }
    const 多行: 规则条件 = { field: 'city', operator: '包含', value: '  Los Angeles \r\n \nNew York\rChicago ' }
    expect(读取条件多行值(多行)).toEqual(['Los Angeles', 'New York', 'Chicago'])
    expect(格式化条件值(多行)).toBe('Los Angeles、New York、Chicago')
    const 金额 = 创建空条件('orderAmount'), 尺寸 = 创建空条件('productDimensions')
    expect(金额).toMatchObject({ operator: '介于', value: '', upperValue: '', currency: '' })
    expect(尺寸).toMatchObject({ operator: '等于', value: '', dimensionRules: { mode: '匹配任意规则', rows: [{ type: 'single', expression: '', note: '' }] } })
    金额.value = '10'; 尺寸.dimensionRules!.rows[0]!.expression = 'L>20'
    expect(创建空条件('orderAmount').value).toBe('')
    expect(创建空条件('productDimensions').dimensionRules!.rows[0]!.expression).toBe('')
    expect(校验条件配置({ field: 'platformCode', operator: '包含', value: 'Bay' })).toContain('比较方式')
    expect(校验条件配置({ field: 'orderWeight', operator: '等于', value: '1' })).toContain('比较方式')
  })

  it('范围至少勾选一端，旧非空值自动沿用闭边界，拒绝负数、浮点特殊记法、超精度与倒置边界', () => {
    const 基础: 规则条件 = { field: 'orderWeight', operator: '介于', value: '' }
    expect(校验条件配置(基础)).toContain('至少勾选一个边界')
    expect(读取范围边界(基础)).toEqual({ lowerEnabled: false, upperEnabled: false, lowerInclusive: true, upperInclusive: true })
    expect(读取范围边界({ ...基础, value: '0', upperValue: '10' })).toEqual({ lowerEnabled: true, upperEnabled: true, lowerInclusive: true, upperInclusive: true })
    expect(校验条件配置({ ...基础, value: '0' })).toBe('')
    expect(校验条件配置({ ...基础, upperValue: '0.000001' })).toBe('')
    expect(校验条件配置({ ...基础, value: '9007199254740993.000001', upperValue: '9007199254740993.000002' })).toBe('')
    for (const value of ['-1', '1e3', 'NaN', 'Infinity', '.5', '+1', '1,000', '1.', '1.0000001', '1234567890123456789012345']) {
      expect(校验条件配置({ ...基础, value }), value).not.toBe('')
    }
    expect(校验条件配置({ ...基础, value: '10.000001', upperValue: '10.000000' })).toContain('下界不能大于上界')
    expect(校验条件配置({ field: 'warehouseSkuQuantity', operator: '介于', value: '0', upperValue: '100' })).toBe('')
    expect(校验条件配置({ field: 'warehouseSkuQuantity', operator: '介于', value: '1.5' })).toContain('整数')
    expect(校验条件配置({ field: 'warehouseSkuQuantity', operator: '介于', value: '1', upperValue: '3.5' })).toContain('整数')
  })

  it('明确关闭的边界不从残值复活，忽略关闭端格式及摘要，勾选空值和空交集须修正', () => {
    const 条件: 规则条件 = { field: 'orderWeight', operator: '介于', value: '1e9', upperValue: '20', lowerEnabled: false, upperEnabled: true, lowerInclusive: false, upperInclusive: true }
    const 前条件 = JSON.stringify(条件)
    expect(读取范围边界(条件)).toEqual({ lowerEnabled: false, upperEnabled: true, lowerInclusive: false, upperInclusive: true })
    expect(校验条件配置(条件)).toBe('')
    expect(格式化条件值(条件)).toBe('小于等于 20 kg')
    expect(JSON.stringify(条件)).toBe(前条件)
    expect(校验条件配置({ ...条件, upperEnabled: false })).toContain('至少勾选一个边界')
    expect(格式化条件值({ ...条件, upperEnabled: false })).toBe('')
    expect(校验条件配置({ ...条件, value: '', lowerEnabled: true })).toContain('已勾选的边界须填写数值')
    expect(校验条件配置({ ...条件, upperValue: '  ' })).toContain('已勾选的边界须填写数值')
    expect(校验条件配置({ ...条件, lowerEnabled: true })).toContain('十进制定点数')
    const 相等: 规则条件 = { field: 'orderAmount', operator: '介于', value: '0', upperValue: '0.000000', currency: 'USD', lowerEnabled: true, upperEnabled: true }
    expect(校验条件配置(相等)).toBe('')
    expect(校验条件配置({ ...相等, lowerInclusive: false })).toContain('相等时须同时包含边界')
    expect(校验条件配置({ ...相等, upperInclusive: false })).toContain('相等时须同时包含边界')
  })

  it('金额必须填写大写三位币种，旧尺寸和材积保留原文但须重新配置', () => {
    for (const currency of ['', 'usd', 'US', 'USDA', '123']) expect(校验条件配置({ field: 'orderAmount', operator: '介于', value: '0', currency })).toContain('币种')
    expect(校验条件配置({ field: 'buyerPaidShipping', operator: '介于', value: '0', currency: 'USD' })).toBe('')
    const 尺寸: 规则条件 = { field: 'productDimensions', operator: '不等于', value: '10', widthValue: '20', heightValue: '30.000001' }
    expect(校验条件配置(尺寸)).toContain('重新配置')
    expect(校验条件配置({ field: 'volume', operator: '介于', value: '10' })).toContain('重新配置')
    expect(格式化条件值({ field: 'orderAmount', operator: '介于', value: '1.2', upperValue: '3.4', currency: 'USD' })).toBe('大于等于 1.2 USD，且 小于等于 3.4 USD')
    expect(格式化条件值({ field: 'orderAmount', operator: '介于', value: '10', upperValue: '20', currency: 'USD', lowerInclusive: false })).toBe('大于 10 USD，且 小于等于 20 USD')
    expect(格式化条件值({ field: 'orderWeight', operator: '介于', value: '1' })).toBe('大于等于 1 kg')
    expect(格式化条件值({ field: 'volume', operator: '介于', value: '', upperValue: '20', upperInclusive: false })).toBe('小于 20')
    expect(条件定义.volume.unit).toBe('cm³')
    expect(格式化条件值(尺寸)).toBe('10 × 20 × 30.000001 cm')
    expect(格式化条件值({ field: 'buyerMessage', operator: '不存在', value: '' })).toBe('')
  })
})

describe('新增条件只使用已核验的标准订单来源', () => {
  function 规则条件覆盖(conditions: 规则条件[]): 订单规则 { return { ...创建规则样例()[0]!, conditions } }

  it('地址多行关键词忽略大小写且任一词命中任一来源行，不跨地址行拼接匹配', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.address.addressLine1 = '123 Main Street'; 单.address.addressLine2 = 'Unit 8'
    单.address.fullName = '私密收件人'; 单.address.mobilePhone = '12345678'; 单.address.email = 'private@example.com'
    const 条件: 规则条件 = { field: 'orderAddress', operator: '包含', value: '  No Match \r\n\n mAIN sTREET ' }
    const 规则 = 规则条件覆盖([条件]), 前订单 = JSON.stringify(单), 前配置 = JSON.stringify(条件)
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    expect(JSON.stringify(条件)).toBe(前配置)
    条件.value = 'not found\n unit 8 '
    expect(命中规则(规则, 单)).toBe(true)
    条件.value = 'Street Unit'
    expect(命中规则(规则, 单)).toBe(false)
    条件.value = '私密收件人\n12345678\nprivate@example.com'
    expect(命中规则(规则, 单)).toBe(false)
    条件.operator = '不包含'
    expect(命中规则(规则, 单)).toBe(true)
    条件.value += '\nUnIt 8'
    expect(命中规则(规则, 单)).toBe(false)
    expect(JSON.stringify(单)).toBe(前订单)
  })

  it('地址负向条件要求已取得街道资料，不读取臆造第三行或收件人字段', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.address.addressLine1 = ' '; delete 单.address.addressLine2
    单.address.fullName = '已知收件人'
    Object.assign(单.address, { addressLine3: '无来源的第三行' })
    const 规则 = 规则条件覆盖([{ field: 'orderAddress', operator: '不包含', value: '不存在的词' }])
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual(['订单地址'])
    expect(命中规则(规则, 单)).toBe(false)
    单.address.addressLine2 = 'Confirmed Street'
    expect(命中规则(规则, 单)).toBe(true)
    规则.conditions[0]!.value = '无来源的第三行'
    规则.conditions[0]!.operator = '包含'
    expect(命中规则(规则, 单)).toBe(false)
    规则.conditions[0]!.operator = '等于'
    const 前规则 = JSON.stringify(规则)
    expect(校验规则配置(规则, [规则])).toContain('比较方式')
    expect(命中规则(规则, 单)).toBe(false)
    expect(JSON.stringify(规则)).toBe(前规则)
  })

  it('省州城市分别读取对应字段，多行正向任一命中且跨字段全部满足，负向排除所有词', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.address.stateProvince = 'California'; 单.address.city = 'Los Angeles'
    const 州: 规则条件 = { field: 'stateProvince', operator: '包含', value: 'Oregon\n  cALIF ' }
    const 城: 规则条件 = { field: 'city', operator: '包含', value: ' New York\r\n\nANGeles ' }
    const 规则 = 规则条件覆盖([州, 城]), 前订单 = JSON.stringify(单)
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    城.value = 'new york\nseattle'
    expect(命中规则(规则, 单)).toBe(false)
    城.operator = '不包含'
    expect(命中规则(规则, 单)).toBe(true)
    城.value += '\nLOS'
    expect(命中规则(规则, 单)).toBe(false)
    城.value = 'seattle'; 州.value = 'california'; 州.operator = '不包含'
    expect(命中规则(规则, 单)).toBe(false)
    expect(JSON.stringify(单)).toBe(前订单)
  })

  it('缺失或全空省州城市在包含和不包含中均未知，不从地址或国家兜底', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    delete 单.address.stateProvince; 单.address.city = ' '
    单.address.addressLine1 = 'California Los Angeles'; 单.address.countryCode = 'US'
    for (const field of ['stateProvince', 'city'] as const) {
      for (const operator of ['包含', '不包含'] as const) {
        const 规则 = 规则条件覆盖([{ field, operator, value: 'California\nLos Angeles' }])
        const 结果 = 试算规则([规则], 单, '审单规则')
        expect(结果.hit).toBeUndefined()
        expect(结果.unknownFields).toEqual([条件字段名[field]])
      }
    }
  })

  it('留言存在性区分明确空值和未取得资料，未知留言不能被不存在或否定条件放行', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!), 规则 = 规则条件覆盖([{ field: 'buyerMessage', operator: '存在', value: '' }])
    expect(校验规则配置(规则, [规则])).toBe('')
    单.address.buyerMessage = 'Please use the side gate'
    expect(命中规则(规则, 单)).toBe(true)
    规则.conditions[0]!.operator = '不存在'
    expect(命中规则(规则, 单)).toBe(false)
    单.address.buyerMessage = ''
    expect(命中规则(规则, 单)).toBe(true)
    单.address.buyerMessage = ' \r\n\t '
    expect(命中规则(规则, 单)).toBe(true)
    规则.conditions[0]!.operator = '存在'
    expect(命中规则(规则, 单)).toBe(false)
    规则.conditions[0]!.operator = '不存在'
    delete 单.address.buyerMessage
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual(['买家留言'])
    expect(命中规则(规则, 单)).toBe(false)
    规则.conditions = [{ field: 'buyerMessage', operator: '不包含', value: 'gate' }]
    expect(命中规则(规则, 单)).toBe(false)
  })

  it('留言多行等于匹配任一完整词行，包含匹配任一关键词，否定排除全部且保留大小写', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.address.buyerMessage = 'Please use side gate'
    const 条件: 规则条件 = { field: 'buyerMessage', operator: '等于', value: '  Other message\r\n\n Please use side gate  ' }
    const 规则 = 规则条件覆盖([条件]), 原订单 = JSON.stringify(单), 原条件 = JSON.stringify(条件)
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    expect(格式化条件值(条件)).toBe('Other message、Please use side gate')
    expect(JSON.stringify(条件)).toBe(原条件)
    条件.operator = '不等于'
    expect(命中规则(规则, 单)).toBe(false)
    条件.value = 'Please use side\nplease use side gate'
    expect(命中规则(规则, 单)).toBe(true)
    条件.operator = '等于'
    expect(命中规则(规则, 单)).toBe(false)
    条件.operator = '包含'; 条件.value = 'Unknown\r\n side gate '
    expect(命中规则(规则, 单)).toBe(true)
    条件.value = 'Unknown\nSIDE GATE'
    expect(命中规则(规则, 单)).toBe(false)
    条件.operator = '不包含'
    expect(命中规则(规则, 单)).toBe(true)
    条件.value += '\nPlease'
    expect(命中规则(规则, 单)).toBe(false)
    // 旧单值不改变语义；跨条件仍须同时满足。
    条件.operator = '等于'; 条件.value = 'Please use side gate'
    expect(命中规则(规则, 单)).toBe(true)
    规则.conditions.push({ field: 'countryCode', operator: '等于', value: 'NOT-THIS-COUNTRY' })
    expect(命中规则(规则, 单)).toBe(false)
    expect(试算规则([规则], 单, '审单规则').hit).toBeUndefined()
    expect(JSON.stringify(单)).toBe(原订单)
    规则.conditions = [{ ...条件, value: '\r\n \t' }]
    expect(校验规则配置(规则, [规则])).toContain('完整条件')
    expect(命中规则(规则, 单)).toBe(false)
  })

  it.each([
    { field: 'transactionAmount', name: '订单交易额范围' },
    { field: 'orderShippingAmount', name: '订单运费金额范围' },
  ] as const)('移除的$name条件保留原文和只读摘要，但不保存、不命中、不映射为其他金额', ({ field, name }) => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.amount.orderAmount = { value: '15', currency: 'USD' }
    单.amount.transactionFee = { value: '15', currency: 'USD' }
    单.amount.buyerPaidShipping = { value: '15', currency: 'USD' }
    Object.assign(单.amount, { [field]: { value: '15', currency: 'USD' } })
    const 条件: 规则条件 = { field, operator: '介于', value: '10', upperValue: '20', currency: 'USD' }
    const 规则 = 规则条件覆盖([条件]), 原规则 = JSON.stringify(规则), 原订单 = JSON.stringify(单)
    expect(条件字段名[条件.field]).toBe(name)
    expect(格式化条件值(条件)).toBe('大于等于 10 USD，且 小于等于 20 USD')
    expect(校验条件配置(条件)).toBe(`${name}已移除，请删除该条件`)
    expect(校验规则配置(规则, [规则])).toBe(`${name}已移除，请删除该条件`)
    expect(命中规则(规则, 单)).toBe(false)
    const 结果 = 试算规则([规则], 单, '审单规则')
    expect(结果.hit).toBeUndefined()
    expect(结果.trace[0]!.rule.conditions).toEqual([条件])
    expect(结果.unknownFields).toEqual([])
    expect(JSON.stringify(规则)).toBe(原规则)
    expect(JSON.stringify(单)).toBe(原订单)
  })

  it('指定仓库SKU退出目录，旧配置保留原文但不能保存或有效命中', () => {
    const 条件: 规则条件 = { field: 'specifiedWarehouseSku', operator: '等于', value: 'DEMO-WH-001' }
    const 规则 = 规则条件覆盖([条件]), 快照 = JSON.stringify(规则)
    expect(格式化条件值(条件)).toBe('DEMO-WH-001')
    expect(校验规则配置(规则, [规则])).toBe('指定仓库SKU已移除，请删除该条件')
    expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false)
    expect(试算规则([规则], 全渠道订单模拟数据[0]!, '审单规则').hit).toBeUndefined()
    expect(JSON.stringify(规则)).toBe(快照)
  })

  it('负责人仅接受中台用户ID，摘要显示姓名，旧自由文本及失效ID须重选', () => {
    const 用户 = 中台系统用户资料.value[0]!
    const 条件: 规则条件 = { field: 'salesOwner', operator: '等于', value: 用户.value }
    expect(条件操作符('salesOwner')).toEqual(['等于', '不等于'])
    expect(校验条件配置(条件)).toBe('')
    expect(格式化条件值(条件)).toBe(用户.label)
    for (const value of ['', 用户.label, 'REMOVED-USER']) {
      expect(校验条件配置({ ...条件, value })).toContain('重新选择')
      const 规则 = 规则条件覆盖([{ ...条件, value, operator: '不等于' }])
      expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false)
    }
    expect(校验条件配置({ ...条件, operator: '包含' })).toContain('比较方式')
    expect(格式化条件值({ ...条件, value: 用户.label })).toContain('待重新选择')
  })

  it('金额用定点比较精确处理超过安全整数的大数和六位小数，边界包含且不做跨币种换算', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.amount.orderAmount = { value: '9007199254740993.000001', currency: 'USD' }
    const 条件: 规则条件 = { field: 'orderAmount', operator: '介于', value: '9007199254740993.000001', upperValue: '9007199254740993.000001', currency: 'USD' }
    const 规则 = 规则条件覆盖([条件]), 前订单 = JSON.stringify(单)
    expect(命中规则(规则, 单)).toBe(true)
    条件.value = '9007199254740993.000002'; 条件.upperValue = ''
    expect(命中规则(规则, 单)).toBe(false)
    条件.value = ''; 条件.upperValue = '9007199254740993.000000'
    expect(命中规则(规则, 单)).toBe(false)
    条件.upperValue = '9007199254740993.000001'; 条件.currency = 'EUR'
    expect(试算规则([规则], 单, '审单规则').hit).toBeUndefined()
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual([])
    expect(JSON.stringify(单)).toBe(前订单)
    单.amount.buyerPaidShipping = { value: '0', currency: 'USD' }
    规则.conditions = [{ field: 'buyerPaidShipping', operator: '介于', value: '0', upperValue: '0', currency: 'USD' }]
    expect(命中规则(规则, 单)).toBe(true)
    delete 单.amount.buyerPaidShipping
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual(['客付运费范围'])
  })

  it('金额严格开边界按六位定点比较，关闭上下界的残值不影响命中', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    const 条件: 规则条件 = { field: 'orderAmount', operator: '介于', value: '9007199254740993.000001', upperValue: '9007199254740993.000003', currency: 'USD', lowerEnabled: true, upperEnabled: true, lowerInclusive: false, upperInclusive: false }
    const 规则 = 规则条件覆盖([条件])
    expect(校验规则配置(规则, [规则])).toBe('')
    for (const [value, expected] of [['9007199254740993.000001', false], ['9007199254740993.000002', true], ['9007199254740993.000003', false]] as const) {
      单.amount.orderAmount = { value, currency: 'USD' }
      expect(命中规则(规则, 单), value).toBe(expected)
    }
    条件.upperInclusive = true
    expect(命中规则(规则, 单)).toBe(true)
    单.amount.orderAmount!.value = 条件.value
    expect(命中规则(规则, 单)).toBe(false)
    条件.lowerInclusive = true
    expect(命中规则(规则, 单)).toBe(true)
    单.amount.orderAmount = { value: '15', currency: 'USD' }
    Object.assign(条件, { value: '1e9', upperValue: '20', lowerEnabled: false, upperEnabled: true })
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    Object.assign(条件, { value: '10', upperValue: '1e-9', lowerEnabled: true, upperEnabled: false })
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(格式化条件值(条件)).toBe('大于等于 10 USD')
    const 前规则 = JSON.stringify(规则), 前订单 = JSON.stringify(单)
    expect(试算规则([规则], 单, '审单规则').hit?.id).toBe(规则.id)
    expect(JSON.stringify(规则)).toBe(前规则)
    expect(JSON.stringify(单)).toBe(前订单)
    条件.currency = 'EUR'
    expect(命中规则(规则, 单)).toBe(false)
    条件.currency = 'USD'; 条件.lowerEnabled = false
    expect(校验规则配置(规则, [规则])).toContain('至少勾选一个边界')
    expect(命中规则(规则, 单)).toBe(false)
  })

  it('没有核验来源的15项始终资料未知，即使订单行或同名额外属性有值也不猜测或汇总', () => {
    const 未核验: 条件字段[] = ['siteCode', 'platformShippingMethod', 'orderWeight', 'unitPrice', 'productDimensions', 'warehouseSku', 'platformSku', 'warehouseSkuQuantity', 'salesOwner', 'volume', 'lengthWidthHeight', 'dimensionSum', 'longestSide', 'secondSide', 'lengthGirth']
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const field of 未核验) {
      Object.assign(单, { [field]: '看似可用但来源未核验' })
      const 条件 = 创建空条件(field)
      if (条件定义[field].kind === 'multi') { 条件.values = ['UNVERIFIED-SITE-ID']; 条件.operator = '不等于' }
      else if (条件定义[field].kind === 'range') { 条件.value = '0'; 条件.upperValue = '999'; if (条件定义[field].money) 条件.currency = 'USD' }
      else if (条件定义[field].kind === 'dimensions') { 条件.dimensionRules!.rows[0]!.expression = 'L>1'; 条件.dimensionRules!.mode = '全部不符合规则' }
      else if (条件定义[field].kind === 'dimensionRange') { 条件.dimensionRanges!.length.lowerEnabled = true; 条件.dimensionRanges!.length.value = '0' }
      else if (条件定义[field].kind === 'volume') 条件.volumeGroups![0]!.sumProducts.min = '0'
      else if (是否多行文本字段(field)) 条件.value = `  ${单.fulfillmentMode}\r\n\n${单.defaultRoute!.shippingChannel}\n看似可用但来源未核验 `
      else if (field === 'salesOwner') { 条件.value = 中台系统用户资料.value[0]!.value; 条件.operator = '不等于' }
      else { 条件.value = '不会相等的文本'; 条件.operator = '不等于' }
      const 规则 = 规则条件覆盖([条件])
      for (const operator of 是否多行文本字段(field) ? 条件操作符(field) : [条件.operator]) {
        条件.operator = operator
        expect(校验规则配置(规则, [规则]), field).toBe('')
        const 结果 = 试算规则([规则], 单, '审单规则')
        expect(结果.hit, field).toBeUndefined()
        expect(结果.unknownFields, field).toEqual([条件字段名[field]])
      }
      if (field === 'platformShippingMethod') {
        for (const operator of ['等于', '不等于'] as const) {
          条件.operator = operator
          const 前规则 = JSON.stringify(规则)
          expect(校验规则配置(规则, [规则])).toContain('比较方式')
          expect(命中规则(规则, 单)).toBe(false)
          expect(试算规则([规则], 单, '审单规则').hit).toBeUndefined()
          expect(JSON.stringify(规则)).toBe(前规则)
        }
      }
    }
  })

  it('试算先校验配置，非法范围不会通过不完整边界意外命中', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const conditions of [
      [{ field: 'orderAmount', operator: '介于', value: '', currency: 'USD' }],
      [{ field: 'orderAmount', operator: '介于', value: '1e3', currency: 'USD' }],
      [{ field: 'orderAmount', operator: '介于', value: '0', currency: '' }],
    ] satisfies 规则条件[][]) {
      const 规则 = 规则条件覆盖(conditions)
      expect(校验规则配置(规则, [规则])).not.toBe('')
      expect(命中规则(规则, 单)).toBe(false)
    }
    for (const key of ['lowerEnabled', 'upperEnabled', 'lowerInclusive', 'upperInclusive'] as const) {
      for (const 非布尔值 of ['false', 0, null]) {
        const 条件 = { field: 'orderAmount', operator: '介于', value: '1', upperValue: '20', currency: 'USD', lowerEnabled: true, upperEnabled: false, [key]: 非布尔值 } as unknown as 规则条件
        const 规则 = 规则条件覆盖([条件]), 前规则 = JSON.stringify(规则)
        expect(校验规则配置(规则, [规则]), key).toContain('边界选项格式无效')
        expect(命中规则(规则, 单), key).toBe(false)
        expect(试算规则([规则], 单, '审单规则').hit, key).toBeUndefined()
        expect(JSON.stringify(规则)).toBe(前规则)
      }
    }
  })

  it('存量同字段范围不静默求交或合并，即使边界相接也须人工整理为一行', () => {
    const 条件: 规则条件[] = [
      { field: 'orderAmount', operator: '介于', value: '1', upperValue: '5', currency: 'USD' },
      { field: 'orderAmount', operator: '介于', value: '5.000001', upperValue: '10', currency: 'USD' },
    ]
    const 规则 = 规则条件覆盖(条件)
    expect(校验规则配置(规则, [规则])).toContain('仅能配置一行')
    条件[1]!.value = '5'
    expect(校验规则配置(规则, [规则])).toContain('仅能配置一行')
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    单.amount.orderAmount = { value: '5', currency: 'USD' }
    expect(命中规则(规则, 单)).toBe(false)
    条件[1]!.currency = 'EUR'
    expect(校验规则配置(规则, [规则])).toContain('仅能配置一行')
  })
})

describe('基础三项与收货国家同行多选', () => {
  function 多选规则(conditions: 规则条件[]): 订单规则 { return { ...创建规则样例()[0]!, conditions } }

  it('基础三项均为独立多选草稿，只有等于和不等于，旧平台店铺单值可读而旧站点必须重选', () => {
    expect(基础多选字段).toEqual(['platformCode', 'siteCode', 'storeId'])
    for (const field of 基础多选字段) {
      expect(条件定义[field].kind).toBe('multi')
      expect(条件操作符(field)).toEqual(['等于', '不等于'])
      const 空条件 = 创建空条件(field)
      expect(空条件).toMatchObject({ value: '', values: [], operator: '等于' })
      空条件.values!.push('DRAFT-ONLY')
      expect(创建空条件(field).values).toEqual([])
    }
    expect(读取条件多选值({ field: 'platformCode', operator: '等于', value: 'eBay' })).toEqual(['eBay'])
    expect(读取条件多选值({ field: 'storeId', operator: '等于', value: 'store-legacy-id' })).toEqual(['store-legacy-id'])
    const 旧站点: 规则条件 = { field: 'siteCode', operator: '等于', value: 'US' }
    expect(读取条件多选值(旧站点)).toEqual([])
    expect(校验条件配置(旧站点)).toContain('重新选择站点')
    expect(格式化条件值(旧站点)).toBe('')
  })

  it('values为权威来源，清空不会恢复残留value，新数组不会污染原条件', () => {
    const 条件: 规则条件 = { field: 'platformCode', operator: '等于', value: 'eBay', values: [] }
    const 规则 = 多选规则([条件]), 单 = structuredClone(全渠道订单模拟数据[0]!)
    expect(读取条件多选值(条件)).toEqual([])
    expect(校验规则配置(规则, [规则])).toContain('至少选择一项')
    expect(命中规则(规则, 单)).toBe(false)
    条件.values = ['Temu']
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(false)
    expect(格式化条件值(条件)).toBe('Temu')
    const 副本 = 读取条件多选值(条件)
    副本.push('eBay')
    expect(条件.values).toEqual(['Temu'])
    单.platformCode = 'Temu'
    expect(命中规则(规则, 单)).toBe(true)
    条件.values = ['eBay', 'Temu']
    expect(格式化条件值(条件)).toBe('eBay、Temu')
  })

  it('国家复选兼容旧单值，正向属于任一选中值、负向排除全部，未知国家不放行', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.address.countryCode = 'US'
    const 条件: 规则条件 = { field: 'countryCode', operator: '等于', value: 'US' }, 规则 = 多选规则([条件])
    expect(读取条件多选值(条件)).toEqual(['US'])
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    expect(创建空条件('countryCode')).toEqual({ field: 'countryCode', operator: '等于', value: '', values: [] })
    条件.values = []
    expect(读取条件多选值(条件)).toEqual([])
    expect(校验规则配置(规则, [规则])).toContain('至少选择一项')
    expect(命中规则(规则, 单)).toBe(false)
    条件.values = ['DE', 'US']
    expect(格式化条件值(条件)).toBe('DE、US')
    expect(命中规则(规则, 单)).toBe(true)
    条件.operator = '不等于'
    expect(命中规则(规则, 单)).toBe(false)
    条件.values = ['CA', 'DE']
    expect(命中规则(规则, 单)).toBe(true)
    单.address.countryCode = ''
    const 结果 = 试算规则([规则], 单, '审单规则')
    expect(结果.hit).toBeUndefined()
    expect(结果.unknownFields).toEqual(['收货国家'])
    条件.values = ['US', ' US ']
    expect(校验规则配置(规则, [规则])).toContain('重复选项')
    条件.values = ['US', ' ']
    expect(校验规则配置(规则, [规则])).toContain('有效选项')
  })

  it('无效数组、空项与重复项不能保存，校验不静默去掉用户的有效选择', () => {
    const 基础: 规则条件 = { field: 'platformCode', operator: '等于', value: 'eBay' }
    for (const values of ['eBay', null, ['eBay', 1], ['eBay', ''], ['eBay', '   '], ['eBay', 'eBay'], ['eBay', ' eBay ']]) {
      const 条件 = { ...基础, values } as unknown as 规则条件
      const 前快照 = JSON.stringify(条件)
      expect(校验条件配置(条件), 前快照).not.toBe('')
      expect(JSON.stringify(条件)).toBe(前快照)
      expect(命中规则(多选规则([条件]), 全渠道订单模拟数据[0]!)).toBe(false)
    }
    expect(校验条件配置({ field: 'siteCode', operator: '包含', value: '', values: ['SITE-DEMO-US'] })).toContain('比较方式')
  })

  it('每个基础字段最多一行，重复行即使同时满足也禁止保存及试算', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const field of 基础多选字段) {
      const value = field === 'platformCode' ? 单.platformCode : field === 'storeId' ? 单.storeId : 'SITE-DEMO-US'
      const 规则 = 多选规则([
        { field, operator: '等于', value: '', values: [value] },
        { field, operator: '等于', value: '', values: [value, 'ANOTHER-SELECTED-ID'] },
      ])
      expect(校验规则配置(规则, [规则]), field).toContain('仅能配置一行')
      expect(命中规则(规则, 单), field).toBe(false)
      expect(试算规则([规则], 单, '审单规则').hit, field).toBeUndefined()
    }
  })

  it('全部24个新增字段及6个存量字段均只有一行，旧重复配置拒绝且不自动合并', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const field of Object.keys(条件定义) as 条件字段[]) {
      const 条件 = 创建空条件(field), definition = 条件定义[field]
      if (definition.kind === 'multi') 条件.values = ['VALID-OPTION-ID']
      else if (definition.kind === 'range') { 条件.value = '0'; if (definition.money) 条件.currency = 'USD' }
      else if (definition.kind === 'dimensions') { 条件.value = '1'; 条件.widthValue = '2'; 条件.heightValue = '3' }
      else 条件.value = field === 'platformOrderStatus' ? 'IN_PROGRESS' : field === 'fulfillmentMode' ? '自配送' : '已配置文本'
      const 规则 = 多选规则([条件, structuredClone(条件)]), 前规则 = JSON.stringify(规则)
      expect(校验规则配置(规则, [规则]), field).toContain('仅能配置一行')
      expect(命中规则(规则, 单), field).toBe(false)
      expect(试算规则([规则], 单, '审单规则').hit, field).toBeUndefined()
      expect(JSON.stringify(规则), field).toBe(前规则)
    }
  })

  it('同一行等于按集合任一值匹配，不等于排除全部选中值，跨字段仍为AND', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    const 平台: 规则条件 = { field: 'platformCode', operator: '等于', value: '', values: ['Temu', 'eBay'] }
    const 店铺: 规则条件 = { field: 'storeId', operator: '等于', value: '', values: ['another-store-id', 单.storeId] }
    const 规则 = 多选规则([平台, 店铺])
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    店铺.values = ['not-this-store']
    expect(命中规则(规则, 单)).toBe(false)
    店铺.operator = '不等于'
    expect(命中规则(规则, 单)).toBe(true)
    平台.operator = '不等于'
    expect(命中规则(规则, 单)).toBe(false)
    平台.values = ['OZON', 'Coupang']
    expect(命中规则(规则, 单)).toBe(true)
    单.storeId = ''
    expect(命中规则(规则, 单)).toBe(false)
    expect(试算规则([规则], 单, '审单规则').unknownFields).toEqual(['订单店铺'])
  })

  it('旧eBay履约状态条件要求平台集合恰好只有eBay，不能借混选或否定扩大适用平台', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.platformOrderStatus = 'IN_PROGRESS'
    const 平台: 规则条件 = { field: 'platformCode', operator: '等于', value: 'eBay', values: ['eBay', 'Temu'] }
    const 规则 = 多选规则([平台, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }])
    expect(校验规则配置(规则, [规则])).toContain('限定平台等于 eBay')
    expect(命中规则(规则, 单)).toBe(false)
    平台.values = ['eBay']
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
    平台.values = ['Temu']; 平台.operator = '不等于'
    expect(校验规则配置(规则, [规则])).toContain('限定平台等于 eBay')
    expect(命中规则(规则, 单)).toBe(false)
    平台.operator = '等于'; delete 平台.values
    expect(校验规则配置(规则, [规则])).toBe('')
    expect(命中规则(规则, 单)).toBe(true)
  })

  it('站点选中值仍没有可信订单事实，匹配与否定均资料未知，不用国家或同名扩展属性替代', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.address.countryCode = 'US'
    Object.assign(单, { siteCode: 'SITE-DEMO-US' })
    for (const operator of ['等于', '不等于'] as const) {
      const 规则 = 多选规则([{ field: 'siteCode', operator, value: 'US', values: ['SITE-DEMO-US'] }])
      expect(校验规则配置(规则, [规则])).toBe('')
      const 结果 = 试算规则([规则], 单, '审单规则')
      expect(结果.hit).toBeUndefined()
      expect(结果.unknownFields).toEqual(['订单站点'])
    }
  })
})

describe('审单规则唯一动作留在待审核', () => {
  it('动作目录、全部审单样例和新建默认一致，旧动作及空动作不得保存或试算命中', () => {
    expect(规则动作.审单规则).toEqual(['留在待审核'])
    expect(共享规则.value.filter(项 => 项.type === '审单规则').every(项 => 项.action === '留在待审核')).toBe(true)
    const 新建 = 创建规则草稿('审单规则', 创建规则样例())!
    try { expect(新建.draft.action).toBe('留在待审核') } finally { 丢弃规则草稿(新建.key) }
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const action of ['进入人工复核', '满足门禁后建议自动审核', '']) {
      const 规则 = { ...创建规则样例()[0]!, action }, 前快照 = JSON.stringify(规则)
      expect(校验规则配置(规则, [规则]), action).toContain('执行动作')
      expect(命中规则(规则, 单), action).toBe(false)
      expect(试算规则([规则], 单, '审单规则').hit, action).toBeUndefined()
      expect(JSON.stringify(规则)).toBe(前快照)
    }
  })

  it('旧人工复核措辞只在独立编辑或复制草稿映射，来源已保存规则保持不变', () => {
    const 来源 = { ...创建规则样例()[0]!, id: 'LEGACY-MANUAL-ACTION-TEST', action: '进入人工复核' }
    const 前快照 = JSON.stringify(来源)
    const 编辑 = 创建规则草稿(来源.type, [来源], 'edit', 来源)!, 复制 = 创建规则草稿(来源.type, [来源], 'copy', 来源)!
    try {
      expect(编辑.draft.action).toBe('留在待审核')
      expect(复制.draft.action).toBe('留在待审核')
      expect(校验规则配置(编辑.draft, [来源])).toBe('')
      expect(复制.draft.enabled).toBe(false)
      编辑.draft.action = '进入人工复核'
      expect(创建规则草稿(来源.type, [来源], 'edit', 来源)).toBe(编辑)
      expect(编辑.draft.action).toBe('留在待审核')
      expect(JSON.stringify(来源)).toBe(前快照)
    } finally { 丢弃规则草稿(编辑.key); 丢弃规则草稿(复制.key) }
  })

  it('旧自动审核建议不自动迁移，用户复核并改选唯一动作后才允许保存', () => {
    const 来源 = { ...创建规则样例()[0]!, id: 'LEGACY-AUTO-REVIEW-ACTION-TEST', action: '满足门禁后建议自动审核' }
    const 前快照 = JSON.stringify(来源), 草稿 = 创建规则草稿(来源.type, [来源], 'edit', 来源)!
    try {
      expect(草稿.draft.action).toBe('满足门禁后建议自动审核')
      expect(校验规则配置(草稿.draft, [来源])).toContain('执行动作')
      expect(命中规则(草稿.draft, 全渠道订单模拟数据[0]!)).toBe(false)
      草稿.draft.action = '留在待审核'
      expect(校验规则配置(草稿.draft, [来源])).toBe('')
      expect(命中规则(草稿.draft, 全渠道订单模拟数据[0]!)).toBe(true)
      expect(JSON.stringify(来源)).toBe(前快照)
    } finally { 丢弃规则草稿(草稿.key) }
  })
})

describe('审单动作可选订单备注', () => {
  it('旧规则缺省、空白与trim后2000字边界均兼容，校验及试算不追加订单备注', () => {
    expect(订单备注字数上限).toBe(2000)
    const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.processingStatus = '待审核'
    const 原订单 = JSON.stringify(单), 原备注 = JSON.stringify(共享订单备注.value)
    for (const orderNote of [undefined, '', ' \r\n\t ', '  请人工核对收件地址  ', `  ${'注'.repeat(订单备注字数上限)} \n`]) {
      const 规则 = 创建规则样例()[0]!
      if (orderNote !== undefined) 规则.orderNote = orderNote
      const 原规则 = JSON.stringify(规则)
      expect(校验规则配置(规则, [规则])).toBe('')
      expect(命中规则(规则, 单)).toBe(true)
      const 结果 = 试算规则([规则], 单, '审单规则')
      expect(结果.hit?.id).toBe(规则.id)
      expect(结果.gates).toEqual([])
      expect(JSON.stringify(规则)).toBe(原规则)
    }
    expect(JSON.stringify(单)).toBe(原订单)
    expect(JSON.stringify(共享订单备注.value)).toBe(原备注)
  })

  it('订单备注超过上限或不是字符串时禁止保存且不能被试算命中', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const orderNote of ['注'.repeat(订单备注字数上限 + 1), null, 123, { text: '无效备注' }, ['无效备注']]) {
      const 规则 = { ...创建规则样例()[0]!, orderNote } as unknown as 订单规则
      const 原规则 = JSON.stringify(规则)
      expect(校验规则配置(规则, [规则])).toContain('订单备注')
      expect(命中规则(规则, 单)).toBe(false)
      expect(试算规则([规则], 单, '审单规则').hit).toBeUndefined()
      expect(JSON.stringify(规则)).toBe(原规则)
    }
  })

  it('分仓和标发不能携带审单动作备注，既有无备注配置的行为保持不变', () => {
    const 单 = structuredClone(全渠道订单模拟数据[0]!)
    for (const 规则 of 创建规则样例().filter(项 => 项.type !== '审单规则' && 项.enabled)) {
      expect(校验规则配置(规则, [规则])).toBe('')
      expect(命中规则(规则, 单)).toBe(true)
      规则.orderNote = '仅供命中审单规则后追加的备注'
      expect(校验规则配置(规则, [规则])).toContain('仅适用于审单规则')
      expect(命中规则(规则, 单)).toBe(false)
      expect(试算规则([规则], 单, 规则.type).hit).toBeUndefined()
      delete 规则.orderNote
      expect(命中规则(规则, 单)).toBe(true)
    }
  })
})
