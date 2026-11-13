import type { 全渠道订单 } from '../全渠道订单/类型'
import type { 拆单动作配置 } from './拆单规则模型'

export interface 拆单平台SKU选项 { value: string; label: string; disabled?: boolean }

/** 读取已有平台 SKU → 系统 SKU 识别结果，不维护映射，也不创建商品。 */
export function 读取拆单平台SKU选项(orders: readonly 全渠道订单[]): 拆单平台SKU选项[] {
  const products = new Map<string, Set<string>>()
  for (const order of orders) for (const item of order.items) {
    const sku = item.platformSku?.trim()
    if (!sku || !item.systemSku?.trim() || item.skuResolutionStatus !== '成功') continue
    const names = products.get(sku) ?? new Set<string>()
    const name = item.systemItemName || item.platformItemTitle
    if (name) names.add(name)
    products.set(sku, names)
  }
  return [...products].sort(([a], [b]) => a.localeCompare(b)).map(([value, names]) => ({ value, label: `${value}${names.size ? ` · ${[...names].join(' / ')}` : ''}` }))
}

export function 保留拆单平台SKU旧值(options: readonly 拆单平台SKU选项[], selected: readonly string[]): 拆单平台SKU选项[] {
  const available = new Set(options.map(item => item.value))
  return [...options, ...[...new Set(selected)].filter(value => value && !available.has(value)).map(value => ({ value, label: `${value}（已不可用）`, disabled: true }))]
}

export function 校验拆单平台SKU选择(action: 拆单动作配置 | undefined, orders: readonly 全渠道订单[]): string {
  if (!action || action.basis !== 'platform') return ''
  const selected = action.strategy === 'selected' || action.strategy === 'selectedQty' ? action.selectedSkus
    : action.strategy === 'capacity' && ['separateSelected', 'togetherSelected'].includes(action.mixing.mode) ? action.mixing.skus : []
  const available = new Set(读取拆单平台SKU选项(orders).map(item => item.value))
  return selected.some(value => !available.has(value)) ? '已选平台 SKU 中包含不可用资料，请移除后从下拉列表重新选择' : ''
}
