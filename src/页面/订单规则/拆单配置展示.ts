import type { 拆单动作配置 } from './拆单规则模型'
import { 格式化拆单动作 } from './拆单规则模型'
import type { 渠道配置 } from '../仓配管理/物流渠道配置'

/** 列表优先展示会影响分包结果的参数；完整配置仍由详情和浮窗承载。 */
export function 拆单列表摘要(action?: 拆单动作配置): string[] {
  if (!action) return ['拆单动作待配置']
  if (action.basis === 'warehouse') return ['原仓库 SKU 拆分依据已移除', '请重新选择系统 SKU 或平台 SKU']
  const basis = { platform: '平台 SKU', system: '系统 SKU', warehouse: '仓库 SKU' }[action.basis] || '依据待核实'
  const strategy = { unit: '每件一包', sku: '同 SKU 一包', selected: '指定 SKU 合包', selectedQty: '指定 SKU 按件数', capacity: '按包裹限制分包' }[action.strategy] || '拆法待核实'
  const result = [`${basis} · ${strategy}`]
  if (action.strategy === 'selected' || action.strategy === 'selectedQty') {
    result.push(`指定 ${action.selectedSkus.join('、') || '未配置'}${action.strategy === 'selectedQty' ? `；各 SKU 每包最多 ${action.quantityPerPackage} 件` : ' 同包'}；其余商品另包`)
  } else if (action.strategy === 'capacity') {
    const { limits, mixing } = action
    const constraints = [limits.maxQuantity !== undefined ? `≤${limits.maxQuantity} 件` : '', limits.maxWeightKg !== undefined ? `≤${limits.maxWeightKg} kg` : '', limits.maxVolumeCm3 !== undefined ? `体积≤${limits.maxVolumeCm3} cm³` : '', limits.maxAmount !== undefined ? `≤${limits.maxAmount} ${limits.currency || '币种待配置'}` : '', limits.maxLongestDifferenceCm !== undefined ? `最长边差≤${limits.maxLongestDifferenceCm} cm` : ''].filter(Boolean)
    if (constraints.length) result.push(`每包 ${constraints.join(' / ')}`)
    result.push(mixing.mode === 'free' ? '允许混装' : mixing.mode === 'separateSelected' ? `${mixing.skus.join('、') || '指定 SKU'}与其余商品分开` : mixing.mode === 'togetherSelected' ? `${mixing.skus.join('、') || '指定 SKU'}必须同包` : `${mixing.attributes.join('、') || '特殊属性'}商品与普通商品分开`)
  } else result.push(action.strategy === 'unit' ? '每包只放一件商品' : action.strategy === 'sku' ? '相同 SKU 放在同一包' : '请重新选择拆分方式')
  const continuation = action.continueMatching ? '逐包继续拆单匹配' : '结束拆单匹配'
  if (action.strategy === 'capacity' && result.length > 2) result[result.length - 1] += `；${continuation}`
  else result.push(continuation)
  return result
}

/** 配置详情、操作日志使用同一份完整可读摘要。 */
export function 拆单配置摘要(action: 拆单动作配置 | undefined, _channels: readonly 渠道配置[]): string[] {
  if (!action) return ['拆单动作待配置']
  const result = [格式化拆单动作(action)]
  if (action.basis === 'warehouse') result.push('原仓库 SKU 拆分依据已移除，请重新选择按系统 SKU 或按平台 SKU，并核对指定 SKU 配置。')
  if (['selected', 'selectedQty'].includes(action.strategy)) result.push(`指定 SKU：${action.selectedSkus.join('、') || '未填写'}`)
  if (action.strategy === 'capacity') {
    const limits = action.limits
    const constraints = [limits.maxWeightKg !== undefined ? `每包重量 ≤ ${limits.maxWeightKg} kg` : '', limits.maxVolumeCm3 !== undefined ? `每包商品体积 ≤ ${limits.maxVolumeCm3} cm³` : '', limits.maxQuantity !== undefined ? `每包件数 ≤ ${limits.maxQuantity}` : '', limits.maxAmount !== undefined ? `每包商品金额 ≤ ${limits.maxAmount} ${limits.currency || ''}` : '', limits.maxLongestDifferenceCm !== undefined ? `商品最长边差 ≤ ${limits.maxLongestDifferenceCm} cm` : ''].filter(Boolean)
    if (constraints.length) result.push(`包裹限制：${constraints.join('；')}`)
    const mixing = action.mixing
    result.push(mixing.mode === 'free' ? '混装要求：允许混装' : mixing.mode === 'separateSelected' ? `混装要求：${mixing.skus.join('、')} 与其余商品分开发` : mixing.mode === 'togetherSelected' ? `混装要求：${mixing.skus.join('、')} 必须同包` : `混装要求：${mixing.attributes.join('、')} 属性商品与普通商品分开发`)
  }
  result.push('后续流程：逐包执行分仓规则 → 审单规则 → 系统默认审单；实际拆分仅不参与合单')
  result.push(`后续匹配：${action.continueMatching ? '本规则执行成功后，逐包继续匹配后续拆单规则；只能细分各自包裹，不能跨包合并' : '本规则命中并执行成功后，结束拆单匹配，继续后续订单处理流程'}；本规则未命中时仍匹配下一条`)
  return result
}
