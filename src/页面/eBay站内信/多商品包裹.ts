import type { ContextRecord, RelatedOrder, RelatedOrderItem } from './类型'

export interface PackageItemProjection {
  orderItemId: string
  item?: RelatedOrderItem
  quantity: number
  verified: boolean
  warning?: string
}
export interface PackageItemsProjection {
  state: 'confirmed' | 'unconfirmed'
  lines: PackageItemProjection[]
  message?: string
}

/** 兼容旧摘要，但不为它补造可用于履约分配的订单行 ID。 */
export function getOrderItems(order: RelatedOrder): RelatedOrderItem[] {
  if (order.items !== undefined) return order.items
  return [{
    title: order.product.title,
    systemSku: order.product.sku || undefined,
    platformSku: order.platformProduct?.sku || undefined,
    quantity: order.product.quantity,
  }]
}

const validQuantity = (quantity: number) => Number.isSafeInteger(quantity) && quantity > 0

/** 只投影来源明确的包裹商品分配；异常行保留来源数量并说明待核实。 */
export function getPackageItems(order: RelatedOrder, record: ContextRecord): PackageItemsProjection {
  if (order.logistics.state !== 'ready') return { state: 'unconfirmed', lines: [], message: '物流资料尚不可用，包裹商品范围待核实' }
  const items = getOrderItems(order)
  const packages = order.logistics.records
  const matchingPackages = packages.filter(value => value.id === record.id)
  const recordIdentityValid = !!record.id.trim() && matchingPackages.length === 1
  const sourceRecord = recordIdentityValid ? matchingPackages[0]! : record
  if (!sourceRecord.packageItems?.length) return { state: 'unconfirmed', lines: [], message: '包裹商品范围待核实' }
  const lines: PackageItemProjection[] = sourceRecord.packageItems.map(allocation => {
    const matchingItems = items.filter(item => item.id && item.id === allocation.orderItemId)
    const item = matchingItems.length === 1 ? matchingItems[0] : undefined
    let warning: string | undefined
    if (!recordIdentityValid) warning = '包裹来源身份待核实'
    else if (!allocation.orderItemId.trim() || !item) warning = '订单行关联待核实'
    else if (!validQuantity(allocation.quantity) || !validQuantity(item.quantity)) warning = '包裹商品数量待核实'
    else {
      const duplicates = sourceRecord.packageItems!.filter(value => value.orderItemId === allocation.orderItemId)
      const allocations = packages.flatMap(value => (value.packageItems ?? []).filter(line => line.orderItemId === allocation.orderItemId))
      const ambiguousPackage = packages.some(value => value.packageItems?.some(line => line.orderItemId === allocation.orderItemId)
        && (!value.id.trim() || packages.filter(other => other.id === value.id).length !== 1
          || value.packageItems.filter(line => line.orderItemId === allocation.orderItemId).length !== 1))
      if (duplicates.length !== 1 || ambiguousPackage) warning = '包裹商品分配重复，待核实'
      else if (allocations.some(value => !validQuantity(value.quantity))) warning = '包裹商品数量待核实'
      else if (allocations.reduce((sum, value) => sum + value.quantity, 0) > item.quantity) warning = '包裹分配数量超过订单数量，待核实'
    }
    return { orderItemId: allocation.orderItemId, item, quantity: allocation.quantity, verified: !warning, ...(warning ? { warning } : {}) }
  })
  const confirmed = lines.every(line => line.verified)
  return { state: confirmed ? 'confirmed' : 'unconfirmed', lines, ...(confirmed ? {} : { message: '部分包裹商品分配待核实' }) }
}

/** 商品行只列可核实的包裹；不计算或改写订单、商品的整体签收状态。 */
export function getItemPackageAllocations(order: RelatedOrder, orderItemId?: string): Array<{ package: ContextRecord; quantity: number }> {
  if (!orderItemId?.trim() || order.logistics.state !== 'ready') return []
  return order.logistics.records.flatMap(record => getPackageItems(order, record).lines
    .filter(line => line.verified && line.orderItemId === orderItemId)
    .map(line => ({ package: record, quantity: line.quantity })))
}
