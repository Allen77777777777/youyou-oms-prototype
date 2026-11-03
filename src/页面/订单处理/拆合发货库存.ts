import type { 人工发货方案, 全渠道订单, 订单路由 } from '../全渠道订单/类型'
import { 关联演示数据, 查询订单关联库存, 来源身份键, type 关联查询数据 } from './库存关联模型'

export interface 人工发货库存行 {
  packageKey: string
  packageIndex: number
  orderNo: string
  lineId: string
  systemSku: string
  warehouseSku: string
  warehouse: string
  warehouseAccount: string
  required: number
  scopeRequired: number
  available: number | null
  remaining: number | null
  status: '充足' | '不足' | '待核实'
  reason: string
  sourceAt: string
  sourceKey: string
}
export interface 人工发货库存结果 { rows: 人工发货库存行[]; reasons: string[] }

const 文字完整 = (值: string[]) => 值.every(项 => Boolean(项?.trim()))

export function 核查发货仓库SKU(路由: 订单路由, 系统SKU: string, 数据: 关联查询数据 = 关联演示数据) {
  const 范围 = 数据.scopes.filter(仓 => 仓.provider === 路由.warehouseProvider && 仓.account === 路由.warehouseAccount && 仓.warehouse === 路由.warehouse)
  const 仓 = 范围[0]
  if (范围.length !== 1 || !仓 || !文字完整([仓.id, 仓.organization, 仓.provider, 仓.accountId, 仓.warehouseId])) return { reason: '所选仓库及账号的来源身份缺失或不唯一' } as const
  const 映射 = 数据.mappings.filter(项 => {
    if (项.systemSku !== 系统SKU) return false
    const 锚点 = 数据.scopes.filter(范围项 => 范围项.id === 项.scopeId)
    return 锚点.length === 1 && 锚点[0]!.organization === 仓.organization && 锚点[0]!.provider === 仓.provider && 锚点[0]!.accountId === 仓.accountId
  })
  const 映射身份 = new Set(映射.map(项 => JSON.stringify([项.warehouseSku, 项.status])))
  if (映射身份.size !== 1 || 映射.some(项 => 项.status !== '已映射' || !项.warehouseSku.trim())) return { reason: '仓库 SKU 映射缺失、冲突或待核实' } as const
  return { reason: '', 仓, warehouseSku: 映射[0]!.warehouseSku } as const
}

/** 只读对比三方仓良品来源可用量；不预留、不扣减，也不合并或猜补库存来源。 */
export function 查询人工方案库存(方案: 人工发货方案, 订单: readonly 全渠道订单[], 数据: 关联查询数据 = 关联演示数据): 人工发货库存结果 {
  const rows: 人工发货库存行[] = []
  const reasons: string[] = []
  for (const [packageIndex, 包] of 方案.packages.entries()) {
    if (!包.items.length) reasons.push(`包裹 ${packageIndex + 1} 没有分配商品，无法核实库存`)
    for (const 分配 of 包.items) {
      const row: 人工发货库存行 = {
        packageKey: 包.key, packageIndex, orderNo: 分配.orderNo, lineId: 分配.externalLineId,
        systemSku: '', warehouseSku: '', warehouse: 包.route.warehouse, warehouseAccount: 包.route.warehouseAccount,
        required: 分配.quantity, scopeRequired: 分配.quantity, available: null, remaining: null,
        status: '待核实', reason: '', sourceAt: '', sourceKey: '',
      }
      rows.push(row)
      const 来源 = 订单.filter(单 => 单.systemOrderNo === 分配.orderNo)
      const 商品候选 = 来源.length === 1 ? 来源[0]!.items.filter(行 => 行.externalLineId === 分配.externalLineId) : []
      const 商品 = 商品候选[0]
      if (来源.length !== 1 || 商品候选.length !== 1 || !方案.orderNos.includes(分配.orderNo)) { row.reason = '来源订单或商品行关联缺失或不唯一'; continue }
      row.systemSku = 商品!.systemSku?.trim() ?? ''
      if (!row.systemSku || 商品!.skuResolutionStatus !== '成功') { row.reason = '系统 SKU 映射尚未核实'; continue }
      if (!Number.isInteger(分配.quantity) || 分配.quantity <= 0) { row.reason = '本包商品需求数量不合法'; continue }
      const 映射 = 核查发货仓库SKU(包.route, row.systemSku, 数据)
      if (映射.reason) { row.reason = 映射.reason; continue }
      const 仓 = 映射.仓
      row.warehouseSku = 映射.warehouseSku
      // 同账号映射可跨仓复用；查询仍复用现有只读来源服务，随后限定到本包精确仓库。
      const 候选 = 查询订单关联库存({ key: `${方案.id}-${包.key}-${分配.externalLineId}`, stage: '待审核', order: { ...来源[0]!, defaultRoute: { ...包.route }, items: [商品!] } }, 数据)
        .filter(项 => 项.scope?.id === 仓.id && 项.warehouseSku === row.warehouseSku && 项.quality === '良品' && 项.inventory)
      const 原库存 = 数据.inventory.filter(项 => 项.organization === 仓.organization && 项.provider === 仓.provider && 项.accountId === 仓.accountId && 项.warehouseId === 仓.warehouseId && 项.warehouseSku === row.warehouseSku)
      if (原库存.some(项 => !['良品', '不良品'].includes(项.quality))) { row.reason = '来源库存质量尚未核实，不能确认可发良品库存'; continue }
      const 良品来源 = 原库存.filter(项 => 项.quality === '良品')
      if (良品来源.length !== 1 || 候选.length !== 1) { row.reason = 良品来源.length > 1 || 候选.length > 1 ? '存在多条或重复良品库存来源，不能取首条或合计作为可用库存' : '尚未取得本仓唯一可核实的良品库存来源'; continue }
      const 库存 = 良品来源[0]!
      row.sourceKey = 来源身份键(库存)
      row.sourceAt = 库存.sourceAt
      const 可用量 = 库存.quantities.available
      const 可信来源 = 文字完整([库存.id, 库存.organization, 库存.provider, 库存.accountId, 库存.warehouseId, 库存.sourceCustomer, 库存.warehouseSku, 库存.quality, 库存.unit])
        && 库存.mapping === '已映射' && 库存.presence === '已确认存在' && 库存.enabled && 库存.issues.length === 0
        && 候选[0]!.availableText !== '待核实' && 候选[0]!.availableText !== '未取得'
      if (!可信来源) { row.reason = '来源库存身份、映射、有效性或数量仍待核实'; continue }
      if (库存.unit !== '件') { row.reason = '来源库存单位与订单件数的比较口径待核实，不换算数量'; continue }
      if (typeof 可用量 !== 'number' || !Number.isFinite(可用量) || 可用量 < 0) { row.reason = 可用量 === null ? '来源未提供可用库存数量' : '来源可用库存数量不合法'; continue }
      row.available = 可用量
    }
  }
  // 同仓、同仓库 SKU 共享同一库存来源：先合并全方案需求，再逐行展示同一比较结果。
  const 需求 = new Map<string, number>()
  for (const row of rows) if (row.sourceKey && Number.isInteger(row.required) && row.required > 0) 需求.set(row.sourceKey, (需求.get(row.sourceKey) ?? 0) + row.required)
  for (const row of rows) {
    if (row.sourceKey) row.scopeRequired = 需求.get(row.sourceKey) ?? row.required
    if (row.available !== null && !row.reason) {
      row.remaining = row.available - row.scopeRequired
      row.status = row.remaining >= 0 ? '充足' : '不足'
      row.reason = row.status === '不足' ? `本仓可用库存 ${row.available} 件，不足以满足本方案同仓商品总需求 ${row.scopeRequired} 件` : ''
    }
    if (row.status !== '充足') reasons.push(`包裹 ${row.packageIndex + 1} ${row.systemSku || row.lineId}：${row.reason || '库存待核实'}`)
  }
  if (!rows.length && !reasons.length) reasons.push('尚未取得需要核实的包裹商品库存')
  return { rows, reasons: [...new Set(reasons)] }
}
