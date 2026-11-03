import type { 人工发货方案, 全渠道订单 } from '../全渠道订单/类型'
import { 创建拆分发货草稿 } from './拆合发货模型'

export interface 拆分分配操作结果 { 成功: boolean; 信息: string }
export interface 拆分包裹数量统计 { quantity: number; skuCount: number }

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
const 来源行键 = (订单号: string, 商品行号: string) => JSON.stringify([订单号, 商品行号])

/** 三步拆分界面专用初始化。编辑保留已有方案，新建将全部数量放在只读的包裹 1。 */
export function 创建拆分矩阵草稿(订单: 全渠道订单): 人工发货方案 {
  if (订单.manualShippingPlan?.kind === '拆分发货') return 克隆(订单.manualShippingPlan)
  const 方案 = 创建拆分发货草稿(订单)
  方案.packages[0]!.items = 订单.items.filter(行 => 行.fulfillableQuantity !== 0).map(行 => ({ orderNo: 订单.systemOrderNo, externalLineId: 行.externalLineId, quantity: 行.fulfillableQuantity ?? Number.NaN }))
  方案.packages[1]!.items = []
  return 方案
}

export function 读取包裹分配数量(方案: 人工发货方案, 包裹键: string, 订单号: string, 商品行号: string): number {
  return 方案.packages.find(包 => 包.key === 包裹键)?.items.filter(行 => 行.orderNo === 订单号 && 行.externalLineId === 商品行号).reduce((总, 行) => 总 + 行.quantity, 0) ?? 0
}

/** 只重算包裹 1；其他包裹的超量、小数或无效输入都保留，负余量用于明确显示超量。 */
export function 重算首包余量(方案: 人工发货方案, 订单: 全渠道订单): void {
  const 首包 = 方案.packages[0]
  if (!首包) return
  首包.items = 订单.items.map(行 => {
    const 其他包数量 = 方案.packages.slice(1).reduce((总, 包) => 总 + 读取包裹分配数量(方案, 包.key, 订单.systemOrderNo, 行.externalLineId), 0)
    return { orderNo: 订单.systemOrderNo, externalLineId: 行.externalLineId, quantity: (行.fulfillableQuantity ?? Number.NaN) - 其他包数量 }
  }).filter(行 => 行.quantity !== 0)
}

/** 只允许编辑包裹 2 及以后；清空输入等同于 0，不钳制或修改其他包的数量。 */
export function 更新拆分包裹数量(方案: 人工发货方案, 订单: 全渠道订单, 包裹键: string, 商品行号: string, 数量: number | undefined | null): void {
  const 包裹索引 = 方案.packages.findIndex(包 => 包.key === 包裹键)
  if (包裹索引 < 1 || !订单.items.some(行 => 行.externalLineId === 商品行号)) return
  const 包 = 方案.packages[包裹索引]!
  const 输入量 = 数量 ?? 0
  包.items = 包.items.filter(行 => 行.orderNo !== 订单.systemOrderNo || 行.externalLineId !== 商品行号)
  if (输入量 !== 0) 包.items.push({ orderNo: 订单.systemOrderNo, externalLineId: 商品行号, quantity: 输入量 })
  重算首包余量(方案, 订单)
}

export function 拆分包裹统计(方案: 人工发货方案, 订单: 全渠道订单, 包裹键: string): 拆分包裹数量统计 {
  const 行 = 方案.packages.find(包 => 包.key === 包裹键)?.items ?? []
  const 系统SKU = 行.filter(项 => 项.orderNo === 订单.systemOrderNo && 项.quantity > 0).flatMap(项 => {
    const 商品 = 订单.items.find(候选 => 候选.externalLineId === 项.externalLineId)
    return 商品?.systemSku?.trim() ? [商品.systemSku.trim()] : []
  })
  return { quantity: 行.reduce((总, 项) => 总 + 项.quantity, 0), skuCount: new Set(系统SKU).size }
}

export function 添加拆分包裹(方案: 人工发货方案, 订单: 全渠道订单): 拆分分配操作结果 {
  const 最后包 = 方案.packages[方案.packages.length - 1]
  if (!最后包 || !最后包.items.some(行 => 行.orderNo === 订单.systemOrderNo && Number.isFinite(行.quantity) && 行.quantity > 0 && 订单.items.some(商品 => 商品.externalLineId === 行.externalLineId))) return { 成功: false, 信息: '请先给最后一个包裹分配商品，再添加新包裹' }
  let 序号 = 方案.packages.length + 1
  while (方案.packages.some(包 => 包.key === `matrix-package-${序号}`)) 序号++
  方案.packages.push({ key: `matrix-package-${序号}`, route: { ...方案.packages[0]!.route }, items: [] })
  重算首包余量(方案, 订单)
  return { 成功: true, 信息: '已添加包裹，请分配商品数量' }
}

export function 删除拆分包裹(方案: 人工发货方案, 订单: 全渠道订单, 包裹键: string): 拆分分配操作结果 {
  if (方案.packages.length <= 2) return { 成功: false, 信息: '拆分发货至少保留两个包裹' }
  const 索引 = 方案.packages.findIndex(包 => 包.key === 包裹键)
  if (索引 === 0) return { 成功: false, 信息: '包裹 1 接收自动余量，不能删除' }
  if (索引 < 0) return { 成功: false, 信息: '包裹不存在，请刷新后重试' }
  方案.packages.splice(索引, 1)
  重算首包余量(方案, 订单)
  return { 成功: true, 信息: '已删除包裹，商品数量自动归还包裹 1' }
}

/** 第一步只校验商品分配，仓库渠道和操作原因分别在后续步骤处理。 */
export function 校验拆分商品分配(方案: 人工发货方案, 订单: 全渠道订单): string[] {
  const 原因: string[] = []
  if (方案.kind !== '拆分发货' || 方案.orderNos.length !== 1 || 方案.orderNos[0] !== 订单.systemOrderNo) 原因.push('拆分方案必须准确关联当前一张来源订单')
  if (方案.packages.length < 2) 原因.push('拆分发货至少保留两个非空包裹')
  if (方案.packages.some(包 => !包.key.trim()) || new Set(方案.packages.map(包 => 包.key)).size !== 方案.packages.length) 原因.push('包裹标识缺失或重复，请重新编排')
  if (!订单.items.length || new Set(订单.items.map(行 => 行.externalLineId)).size !== 订单.items.length || 订单.items.some(行 => !行.externalLineId.trim())) 原因.push('来源商品行缺失或标识重复，请先核实')
  if (订单.items.some(行 => !Number.isInteger(行.fulfillableQuantity) || 行.fulfillableQuantity! < 0 || !Number.isInteger(行.orderedQuantity) || 行.orderedQuantity <= 0 || 行.fulfillableQuantity! > 行.orderedQuantity) || !订单.items.some(行 => (行.fulfillableQuantity ?? 0) > 0)) 原因.push('当前可发商品及数量未核实，不能继续拆分')
  const 分配 = new Map<string, number>()
  for (const [索引, 包] of 方案.packages.entries()) {
    const 包名 = `包裹 ${索引 + 1}`
    if (!包.items.some(行 => Number.isFinite(行.quantity) && 行.quantity > 0)) 原因.push(`${包名} 没有分配商品，请分配商品或删除空包裹`)
    const 包内 = new Set<string>()
    for (const 行 of 包.items) {
      const 身份 = 来源行键(行.orderNo, 行.externalLineId)
      if (包内.has(身份)) 原因.push(`${包名} 的同一来源商品行重复，请重新分配`)
      包内.add(身份)
      const 商品 = 行.orderNo === 订单.systemOrderNo ? 订单.items.find(候选 => 候选.externalLineId === 行.externalLineId) : undefined
      if (!商品) 原因.push(`${包名} 包含不属于当前订单的来源商品行`)
      if (!Number.isInteger(行.quantity) || 行.quantity < 0) 原因.push(`${包名} 商品数量必须为非负整数；负余量表示其他包裹已超量`)
      分配.set(身份, (分配.get(身份) ?? 0) + 行.quantity)
    }
  }
  for (const 商品 of 订单.items) {
    const 数量 = 分配.get(来源行键(订单.systemOrderNo, 商品.externalLineId)) ?? 0
    if (数量 !== 商品.fulfillableQuantity) 原因.push(`商品行 ${商品.externalLineId} 的分配总数必须等于当前可发数量 ${商品.fulfillableQuantity ?? '待核实'}`)
  }
  return [...new Set(原因)]
}
