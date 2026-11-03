import type { 人工发货包裹, 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'

/** 仅供本地原型评审。真实平台条件、库存与渠道适用性仍须由审核复验。 */
export interface 拆合仓库执行 {
  履约单号: string
  订单号: string[]
  状态: string
  待核查: boolean
  出库事实?: { shipped: number | null; shippedAt: string | null }
}

export interface 拆合发货上下文 {
  订单: 全渠道订单[]
  仓库执行: 拆合仓库执行[]
  当前版本: (订单号: string) => number
  记录操作: (订单: 全渠道订单, 类型: string, 内容: string) => void
  当前时间?: () => string
  可选路由?: readonly 订单路由[]
  库存检查?: (方案: 人工发货方案) => string[]
}

export interface 拆合发货结果 { 成功: boolean; 信息: string; 方案?: 人工发货方案 }

export interface 可合并订单组 { key: string; orderNos: string[] }
export interface 未合并订单 { orderNo: string; reasons: string[] }
export interface 合并订单计算结果 { groups: 可合并订单组[]; unmergedOrders: 未合并订单[] }

let 方案序号 = 0
const 空路由 = (): 订单路由 => ({ warehouse: '', warehouseProvider: '', warehouseAccount: '', shippingChannel: '', shippingChannelCode: '', labelMode: '仓配一体' })
const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
const 唯一 = (值: string[]) => [...new Set(值)]
const 文字 = (值?: string) => (值 ?? '').trim()
const 相同集合 = (甲: string[], 乙: string[]) => 甲.length === 乙.length && new Set(甲).size === 甲.length && 甲.every(项 => 乙.includes(项))
const 路由身份 = (路由: 订单路由) => JSON.stringify([路由.warehouseProvider, 路由.warehouseAccount, 路由.warehouse, 路由.shippingChannelId ?? '', 路由.shippingChannelCode, 路由.shippingChannel, 路由.labelMode])

export function 人工发货路由完整(路由?: 订单路由): boolean {
  return Boolean(路由 && 路由.labelMode === '仓配一体' && [路由.warehouseProvider, 路由.warehouseAccount, 路由.warehouse, 路由.shippingChannelCode, 路由.shippingChannel].every(项 => 文字(项)))
}

function 新方案(kind: 人工发货方案['kind'], 订单: 全渠道订单[], packages: 人工发货包裹[]): 人工发货方案 {
  return { id: `MSP-${Date.now()}-${++方案序号}`, kind, orderNos: 订单.map(项 => 项.systemOrderNo), packages, reason: '', updatedAt: '' }
}

function 来源分配(订单: 全渠道订单) {
  return 订单.items.filter(行 => Number.isInteger(行.fulfillableQuantity) && 行.fulfillableQuantity! > 0).map(行 => ({ orderNo: 订单.systemOrderNo, externalLineId: 行.externalLineId, quantity: 行.fulfillableQuantity! }))
}

/** 初始按来源商品行分成两包，具体数量由人工在分配矩阵中调整。 */
export function 创建拆分发货草稿(订单: 全渠道订单): 人工发货方案 {
  if (订单.manualShippingPlan?.kind === '拆分发货') return 克隆(订单.manualShippingPlan)
  const 行 = 来源分配(订单)
  const route = 订单.defaultRoute ?? 空路由()
  return 新方案('拆分发货', [订单], [
    { key: 'package-1', route: 克隆(route), items: 行.slice(0, 1) },
    { key: 'package-2', route: 克隆(route), items: 行.slice(1) },
  ])
}

export function 创建合并发货草稿(订单: 全渠道订单[]): 人工发货方案 {
  const 已有 = 订单[0]?.manualShippingPlan
  if (已有?.kind === '合并发货' && 相同集合(已有.orderNos, 订单.map(项 => 项.systemOrderNo))) return 克隆(已有)
  return 新方案('合并发货', 订单, [{ key: 'package-1', route: 克隆(订单[0]?.defaultRoute ?? 空路由()), items: 订单.flatMap(来源分配) }])
}

/** 递归展开已经保存的人工组合，损坏或缺失的来源编号仍保留用于明确阻断。 */
export function 关联人工发货订单号(上下文: 拆合发货上下文, 订单号: string[]): string[] {
  const 全部 = new Set(订单号)
  let 新增 = true
  while (新增) {
    新增 = false
    for (const 单 of 上下文.订单) {
      const 方案 = 单.manualShippingPlan
      if (方案 && (全部.has(单.systemOrderNo) || 方案.orderNos.some(号 => 全部.has(号)))) {
        for (const 号 of [单.systemOrderNo, ...方案.orderNos]) if (!全部.has(号)) { 全部.add(号); 新增 = true }
      }
    }
  }
  return [...全部]
}

export function 人工发货组完整阻断原因(上下文: 拆合发货上下文, 订单号: string[]): string[] {
  const 原因: string[] = []
  const 关联号 = 关联人工发货订单号(上下文, 订单号)
  if (!相同集合(关联号, 订单号)) 原因.push(`此操作须覆盖发货安排全部来源订单：${关联号.join('、')}`)
  const 来源 = 上下文.订单.filter(单 => 关联号.includes(单.systemOrderNo))
  for (const 单 of 来源) {
    const 方案 = 单.manualShippingPlan
    if (!方案) continue
    if (!方案.id || !方案.orderNos.includes(单.systemOrderNo) || !相同集合(方案.orderNos, 关联号)) 原因.push('发货安排来源关联不一致，请先核查全部来源订单')
    if (方案.orderNos.some(号 => {
      const 匹配 = 上下文.订单.filter(项 => 项.systemOrderNo === 号)
      return 匹配.length !== 1 || JSON.stringify(匹配[0]!.manualShippingPlan) !== JSON.stringify(方案)
    })) 原因.push('发货安排的来源副本缺失或不一致，请先核查')
  }
  return 唯一(原因)
}

export function 人工发货收件身份(订单: 全渠道订单): string {
  const 地址 = 订单.address
  return JSON.stringify([地址.fullName, 地址.countryCode, 地址.stateProvince, 地址.city, 地址.district, 地址.addressLine1, 地址.addressLine2, 地址.postalCode].map(文字))
}

/** 下游仓单快照仍需完整配送资料一致；五项匹配不负责选择有冲突的联系方式。 */
export function 人工发货完整收件身份(订单: 全渠道订单): string {
  const 地址 = 订单.address
  return JSON.stringify([地址.fullName, 地址.companyName, 地址.mobilePhone, 地址.telephone, 地址.email, 地址.countryCode, 地址.stateProvince, 地址.city, 地址.district, 地址.addressLine1, 地址.addressLine2, 地址.postalCode].map(文字))
}

const 收货地址身份 = (订单: 全渠道订单) => {
  const 地址 = 订单.address
  return JSON.stringify([地址.countryCode, 地址.stateProvince, 地址.city, 地址.district, 地址.addressLine1, 地址.addressLine2, 地址.postalCode].map(文字))
}

/** 五项同时相同；仅去首尾空格，不模糊匹配，不忽略门牌、公寓或邮编。 */
function 合并订单匹配阻断原因(来源: 全渠道订单[]): string[] {
  const 原因: string[] = []
  for (const 单 of 来源) {
    if (!文字(单.platformCode)) 原因.push(`${单.systemOrderNo} 平台身份缺失，请先核实`)
    if (!文字(单.storeId)) 原因.push(`${单.systemOrderNo} 店铺身份缺失，请先核实`)
    if (!文字(单.buyerExternalId)) 原因.push(`${单.systemOrderNo} 买家身份缺失，请先核实；不能按空值或姓名判断相同买家`)
    if (!文字(单.address.fullName)) 原因.push(`${单.systemOrderNo} 收件人缺失，请先核实`)
    if (!文字(单.address.countryCode) || !文字(单.address.addressLine1)) 原因.push(`${单.systemOrderNo} 收货地址不完整，请先核实`)
  }
  const 基准 = 来源[0]
  if (!基准) return 原因
  if (来源.some(单 => 文字(单.platformCode) !== 文字(基准.platformCode))) 原因.push('当前人工合并方案要求相同平台，不支持跨平台合并')
  if (来源.some(单 => 文字(单.storeId) !== 文字(基准.storeId))) 原因.push('当前人工合并方案要求相同店铺，不支持跨店铺合并')
  if (来源.some(单 => 文字(单.buyerExternalId) !== 文字(基准.buyerExternalId))) 原因.push('买家身份必须明确且相同，不根据姓名猜测买家')
  if (来源.some(单 => 文字(单.address.fullName) !== 文字(基准.address.fullName))) 原因.push('收件人必须相同，请分别发货')
  if (来源.some(单 => 收货地址身份(单) !== 收货地址身份(基准))) 原因.push('完整收货地址必须相同，请分别发货')
  return 唯一(原因)
}

function 发货执行安全阻断原因(上下文: 拆合发货上下文, 单: 全渠道订单): string[] {
  const 号 = 单.systemOrderNo
  const 原因: string[] = []
  if (单.fulfillmentOrders.some(项 => 项.isActive)) 原因.push(`${号} 已有有效履约，请先安全结束原方案并退回待审核`)
  if (单.fulfillmentOrders.some(项 => !Number.isInteger(项.shippedQuantity) || 项.shippedQuantity !== 0 || 项.shippedAt || 项.status === '已发货')) 原因.push(`${号} 已有出库事实或历史出库数量未核实，不能重新拆合`)
  const 履约号 = new Set(单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo))
  const 执行 = 上下文.仓库执行.filter(项 => 项.订单号.includes(号) || 履约号.has(项.履约单号))
  if (执行.some(项 => 项.待核查 || !['下单失败', '已取消'].includes(项.状态))) 原因.push(`${号} 仓库请求尚未安全结束或结果待核查`)
  if (执行.some(项 => !履约号.has(项.履约单号))) 原因.push(`${号} 仓库执行缺少关联履约，请先核实发货范围`)
  if (执行.some(项 => 项.出库事实 && (项.出库事实.shipped !== 0 || 项.出库事实.shippedAt))) 原因.push(`${号} 仓库出库事实未明确为零，不能重新拆合`)
  if (上下文.订单.some(项 => 项.systemOrderNo !== 号 && 项.fulfillmentOrders.some(履约 => 履约号.has(履约.fulfillmentOrderNo)))) 原因.push(`${号} 仍有关联共享履约历史，须先专项核实全部来源`)
  return 原因
}

/** 撤销只移除未审核方案；商品、地址或平台发货条件失效不能把来源锁在旧方案内。 */
export function 人工发货撤销阻断原因(上下文: 拆合发货上下文, 订单号: string[]): string[] {
  const 原因 = 人工发货组完整阻断原因(上下文, 订单号)
  if (!订单号.length || new Set(订单号).size !== 订单号.length) 原因.push('请选择有效且不重复的来源订单')
  for (const 号 of 订单号) {
    const 匹配 = 上下文.订单.filter(项 => 项.systemOrderNo === 号)
    if (匹配.length !== 1) { 原因.push(`来源订单 ${号} 不存在或编号不唯一，请刷新后核实`); continue }
    const 单 = 匹配[0]!
    if (!单.manualShippingPlan) 原因.push(`${号} 当前没有已保存的发货安排，请刷新列表`)
    if (单.fulfillmentMode !== '自配送' || 单.processingStatus !== '待审核') 原因.push(`${号} 仅待审核自配送订单可以撤销发货安排`)
    if (单.reviews.some(项 => 项.status === '审核中')) 原因.push(`${号} 尚有审核未结束，请稍后刷新`)
    原因.push(...发货执行安全阻断原因(上下文, 单))
  }
  return 唯一(原因)
}

function 人工发货来源阻断原因(上下文: 拆合发货上下文, 单: 全渠道订单, 类型: 人工发货方案['kind']): string[] {
  const 号 = 单.systemOrderNo
  const 原因: string[] = []
  if (单.fulfillmentMode !== '自配送' || 单.processingStatus !== '待审核') 原因.push(`${号} 仅待审核自配送订单可编排发货安排`)
  if (单.blockReason || 单.cancelledAt) 原因.push(`${号} ${单.blockReason || '已确认最终取消，禁止继续发货'}`)
  if (单.reviews.some(项 => 项.status === '审核中')) 原因.push(`${号} 尚有审核未结束，请稍后刷新`)
  if (单.manualShippingPlan && 单.manualShippingPlan.kind !== 类型) 原因.push(`${号} 已有${单.manualShippingPlan.kind}方案，请先撤销后重新编排`)
  if (!单.items.length || 单.items.some(行 => !文字(行.externalLineId) || !Number.isInteger(行.orderedQuantity) || 行.orderedQuantity <= 0 || !Number.isInteger(行.fulfillableQuantity) || 行.fulfillableQuantity! < 0 || 行.fulfillableQuantity! > 行.orderedQuantity) || !单.items.some(行 => 行.fulfillableQuantity! > 0)) 原因.push(`${号} 当前可发商品及数量未核实，不能编排发货安排`)
  if (new Set(单.items.map(行 => 行.externalLineId)).size !== 单.items.length) 原因.push(`${号} 来源商品行标识重复，请先核实`)
  if (单.items.some(行 => !文字(行.systemSku) || 行.skuResolutionStatus !== '成功')) 原因.push(`${号} 商品 SKU 映射尚未完成`)
  if (!文字(单.address.fullName) || !文字(单.address.countryCode) || !文字(单.address.addressLine1)) 原因.push(`${号} 收件信息不完整，请先核实`)
  原因.push(...发货执行安全阻断原因(上下文, 单))
  return 原因
}

/** 只计算已勾选订单；已有发货安排通过原入口编辑，不扩展其来源或静默加入未选订单。 */
export function 计算可合并订单(上下文: 拆合发货上下文, 订单号: string[]): 合并订单计算结果 {
  const 结果: 合并订单计算结果 = { groups: [], unmergedOrders: [] }
  const 待分组 = new Map<string, string[]>()
  for (const 号 of 唯一(订单号)) {
    const 匹配 = 上下文.订单.filter(单 => 单.systemOrderNo === 号)
    const 原因: string[] = []
    if (订单号.filter(单号 => 单号 === 号).length !== 1) 原因.push('来源订单重复勾选，请刷新后重新选择')
    if (!文字(号) || 匹配.length !== 1) 原因.push(`来源订单 ${号 || '（空编号）'} 不存在或编号不唯一，请刷新后核实`)
    const 单 = 匹配.length === 1 ? 匹配[0] : undefined
    if (单) {
      原因.push(...人工发货来源阻断原因(上下文, 单, '合并发货'), ...合并订单匹配阻断原因([单]))
      if (单.manualShippingPlan) 原因.push(`已有${单.manualShippingPlan.kind}安排，请通过原安排编辑或撤销后重新合并`)
      else 原因.push(...人工发货组完整阻断原因(上下文, [号]))
    }
    if (原因.length || !单) {
      结果.unmergedOrders.push({ orderNo: 号, reasons: 唯一(原因) })
      continue
    }
    const 身份 = JSON.stringify([文字(单.platformCode), 文字(单.storeId), 文字(单.buyerExternalId), 人工发货收件身份(单)])
    const 分组 = 待分组.get(身份) ?? []
    分组.push(号)
    待分组.set(身份, 分组)
  }
  for (const 分组 of 待分组.values()) {
    if (分组.length < 2) {
      结果.unmergedOrders.push({ orderNo: 分组[0]!, reasons: ['所选订单中没有同平台、同店铺、同买家、同收件人和完整收货地址一致的其他可合并订单'] })
      continue
    }
    const 原因 = 人工发货操作阻断原因(上下文, 分组, '合并发货')
    if (原因.length) for (const 号 of 分组) 结果.unmergedOrders.push({ orderNo: 号, reasons: 原因 })
    else 结果.groups.push({ key: `merge-group-${结果.groups.length + 1}`, orderNos: 分组 })
  }
  // 未合并结果沿用用户的勾选顺序，便于与原列表逐单核对。
  结果.unmergedOrders.sort((甲, 乙) => 订单号.indexOf(甲.orderNo) - 订单号.indexOf(乙.orderNo))
  return 结果
}

export function 人工发货操作阻断原因(上下文: 拆合发货上下文, 订单号: string[], 类型: 人工发货方案['kind']): string[] {
  const 原因 = 人工发货组完整阻断原因(上下文, 订单号)
  if (!订单号.length || new Set(订单号).size !== 订单号.length) 原因.push('请选择有效且不重复的来源订单')
  if (类型 === '拆分发货' && 订单号.length !== 1) 原因.push('拆分发货每次只处理一张来源订单；已有合并请先撤销')
  if (类型 === '合并发货' && 订单号.length < 2) 原因.push('合并发货至少选择两张来源订单')
  const 来源: 全渠道订单[] = []
  for (const 号 of 订单号) {
    const 匹配 = 上下文.订单.filter(项 => 项.systemOrderNo === 号)
    if (匹配.length !== 1) { 原因.push(`来源订单 ${号} 不存在或编号不唯一，请刷新后核实`); continue }
    const 单 = 匹配[0]!
    来源.push(单)
    原因.push(...人工发货来源阻断原因(上下文, 单, 类型))
  }
  if (类型 === '合并发货') 原因.push(...合并订单匹配阻断原因(来源))
  return 唯一(原因)
}

export function 校验人工发货方案(上下文: 拆合发货上下文, 方案: 人工发货方案): string[] {
  const 原因 = 人工发货操作阻断原因(上下文, 方案.orderNos, 方案.kind)
  if (!文字(方案.id)) 原因.push('发货安排标识缺失，请重新打开')
  if (!['拆分发货', '合并发货'].includes(方案.kind)) 原因.push('未知的发货安排类型')
  if (文字(方案.reason).length > 2000) 原因.push('操作原因最多 2000 字符')
  if (方案.kind === '拆分发货' && 方案.packages.length < 2) 原因.push('拆分发货至少保留两个非空包裹')
  if (方案.kind === '合并发货' && 方案.packages.length !== 1) 原因.push('合并发货必须使用一个包裹和一条共同仓库物流路线')
  if (new Set(方案.packages.map(包 => 包.key)).size !== 方案.packages.length || 方案.packages.some(包 => !文字(包.key))) 原因.push('包裹标识缺失或重复，请重新编排')
  const 来源 = 上下文.订单.filter(单 => 方案.orderNos.includes(单.systemOrderNo))
  const 已有 = 来源.find(单 => 单.manualShippingPlan)?.manualShippingPlan
  if (已有 && (已有.id !== 方案.id || 已有.kind !== 方案.kind || !相同集合(已有.orderNos, 方案.orderNos))) 原因.push('当前已有发货安排，请编辑原安排或先撤销后重建')
  const 分配 = new Map<string, number>()
  for (const 包 of 方案.packages) {
    if (!人工发货路由完整(包.route)) 原因.push(`包裹 ${包.key} 请选择完整的发货仓库及物流渠道；本期仅支持仓配一体`)
    else if (上下文.可选路由 && !上下文.可选路由.some(项 => 路由身份(项) === 路由身份(包.route))) 原因.push(`包裹 ${包.key} 的仓库物流组合已失效，请重新选择`)
    if (!包.items.length) 原因.push(`包裹 ${包.key} 没有分配商品，请分配或删除空包裹`)
    const 包内 = new Set<string>()
    for (const 行 of 包.items) {
      const 身份 = JSON.stringify([行.orderNo, 行.externalLineId])
      if (包内.has(身份)) 原因.push(`包裹 ${包.key} 同一来源商品行重复，请合为一条分配`)
      包内.add(身份)
      const 单 = 来源.find(项 => 项.systemOrderNo === 行.orderNo)
      if (!单 || !单.items.some(项 => 项.externalLineId === 行.externalLineId)) 原因.push('包裹含有不属于本方案的来源商品行')
      if (!Number.isInteger(行.quantity) || 行.quantity <= 0) 原因.push('每条商品分配数量必须为正整数')
      分配.set(身份, (分配.get(身份) ?? 0) + 行.quantity)
    }
  }
  for (const 单 of 来源) for (const 行 of 单.items) {
    const 数量 = 分配.get(JSON.stringify([单.systemOrderNo, 行.externalLineId])) ?? 0
    if (数量 !== 行.fulfillableQuantity) 原因.push(`${单.systemOrderNo} 商品行 ${行.externalLineId} 分配总数必须等于当前可发数量 ${行.fulfillableQuantity ?? '待核实'}`)
  }
  if (上下文.库存检查) 原因.push(...上下文.库存检查(方案))
  return 唯一(原因)
}

function 版本阻断(上下文: 拆合发货上下文, 订单号: string[], 期望版本: Record<string, number>): string[] {
  return 订单号.some(号 => !Number.isInteger(期望版本[号]) || 期望版本[号] !== 上下文.当前版本(号)) ? ['全部来源订单版本未确认或已变化，请重新打开后提交'] : []
}

function 写入已复验人工发货方案(上下文: 拆合发货上下文, 方案: 人工发货方案): 拆合发货结果 {
  const 已存 = 克隆(方案)
  已存.reason = 已存.reason.trim()
  已存.updatedAt = 上下文.当前时间?.() ?? `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`
  const 来源 = 已存.orderNos.map(号 => 上下文.订单.find(单 => 单.systemOrderNo === 号)!)
  const 旧方案 = 来源[0]?.manualShippingPlan
  const 摘要 = 已存.packages.map((包, 索引) => `包裹${索引 + 1}：${包.route.warehouseProvider}／${包.route.warehouseAccount}／${包.route.warehouse}／${包.route.shippingChannel}；${包.items.map(行 => `${行.orderNo}/${行.externalLineId}×${行.quantity}`).join('、')}`).join('；')
  // 全组复验完成后同步替换所有副本。这里不创建履约、仓库请求或修改平台订单事实。
  for (const 单 of 来源) 单.manualShippingPlan = 克隆(已存)
  for (const 单 of 来源) 上下文.记录操作(单, 旧方案 ? `修改${已存.kind}` : 已存.kind, `方案 ${已存.id}；全部来源：${已存.orderNos.join('、')}；${摘要}；${已存.reason ? `原因：${已存.reason}；` : ''}保持待审核，审核通过后按方案生成履约。${旧方案 ? `修改前方案：${JSON.stringify(旧方案)}；` : ''}`)
  return { 成功: true, 信息: `${已存.kind}方案已保存，保持待审核；审核通过后生成履约单`, 方案: 克隆(已存) }
}

export function 保存人工发货方案(上下文: 拆合发货上下文, 方案: 人工发货方案, 期望版本: Record<string, number>): 拆合发货结果 {
  const 原因 = [...版本阻断(上下文, 方案.orderNos, 期望版本), ...校验人工发货方案(上下文, 方案)]
  if (原因.length) return { 成功: false, 信息: 唯一(原因).join('；') }
  return 写入已复验人工发货方案(上下文, 方案)
}

/** 批次纯预检，供保存与保存并审核共用；此函数不写方案、日志或版本。 */
export function 校验多组合并发货方案(上下文: 拆合发货上下文, 方案列表: 人工发货方案[], 期望版本: Record<string, number>): string[] {
  const 原因: string[] = []
  if (!方案列表.length) 原因.push('请先选择至少一组可合并订单并预览发货方案')
  const 全部来源 = 方案列表.flatMap(方案 => 方案.orderNos)
  if (new Set(全部来源).size !== 全部来源.length) 原因.push('不同合并组不能包含重复来源订单，请重新计算可合并订单')
  if (new Set(方案列表.map(方案 => 方案.id)).size !== 方案列表.length) 原因.push('不同合并组的方案标识重复，请重新打开后预览')
  for (const [索引, 方案] of 方案列表.entries()) {
    if (方案.kind !== '合并发货') 原因.push(`第 ${索引 + 1} 组只支持合并发货方案`)
    原因.push(...[...版本阻断(上下文, 方案.orderNos, 期望版本), ...校验人工发货方案(上下文, 方案)].map(项 => `第 ${索引 + 1} 组：${项}`))
  }
  return 唯一(原因)
}

/** 同步原型中的批次提交：全部组通过复验才写入，不因后组校验失败留下前组方案。 */
export function 保存多组合并发货方案(上下文: 拆合发货上下文, 方案列表: 人工发货方案[], 期望版本: Record<string, number>): 拆合发货结果 {
  const 原因 = 校验多组合并发货方案(上下文, 方案列表, 期望版本)
  if (原因.length) return { 成功: false, 信息: 原因.join('；') }
  const 全部来源 = 方案列表.flatMap(方案 => 方案.orderNos)
  // 各组来源互不重叠；所有版本、发货条件、数量与共同路由已在任何写入前同步复验。
  for (const 方案 of 方案列表) 写入已复验人工发货方案(上下文, 方案)
  return { 成功: true, 信息: `已保存 ${方案列表.length} 组合并发货方案，覆盖 ${全部来源.length} 张订单，保持待审核；审核通过后按各组方案生成履约单` }
}

export function 撤销人工发货方案(上下文: 拆合发货上下文, 订单号: string[], 期望版本: Record<string, number>, 撤销原因: string): 拆合发货结果 {
  const 方案 = 上下文.订单.find(单 => 订单号.includes(单.systemOrderNo))?.manualShippingPlan
  if (!方案) return { 成功: false, 信息: '当前没有已保存的发货安排，请刷新列表' }
  const 原因 = [...版本阻断(上下文, 订单号, 期望版本), ...人工发货撤销阻断原因(上下文, 订单号)]
  if (!文字(撤销原因) || 文字(撤销原因).length > 2000) 原因.push('请填写撤销原因，最多 2000 字符')
  if (原因.length) return { 成功: false, 信息: 唯一(原因).join('；') }
  const 来源 = 订单号.map(号 => 上下文.订单.find(单 => 单.systemOrderNo === 号)!)
  const 旧方案 = 克隆(方案)
  for (const 单 of 来源) delete 单.manualShippingPlan
  for (const 单 of 来源) 上下文.记录操作(单, `撤销${方案.kind}`, `撤销方案 ${方案.id}；全部来源：${订单号.join('、')}；原因：${撤销原因.trim()}；方案已移除，来源订单保持待审核，后续须重新校验发货条件；原方案：${JSON.stringify(旧方案)}`)
  return { 成功: true, 信息: `已撤销${方案.kind}方案，来源订单保持待审核` }
}
