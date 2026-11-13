/** 公共合单池的统一配置，按全局设置保存；单条规则仅筛选订单，不保存此策略。 */
export interface 合单动作配置 {
  mode: 'basic' | 'advanced'
  groupBySite: boolean
  maxOrders: number
  maxQuantity?: number
  maxWeightKg?: string
  maxWaitMinutes: number
  releaseMode: 'ready' | 'scheduled'
  releaseTimes: string[]
  readyOrderCount: number
  shipByBufferMinutes: number
}

export const 合单固定条件 = ['同平台', '同店铺', '同买家', '同收件人', '完整收货地址一致'] as const

export function 创建默认合单动作(): 合单动作配置 {
  return {
    mode: 'basic', groupBySite: false, maxOrders: 5,
    maxWaitMinutes: 120, releaseMode: 'ready', releaseTimes: [],
    readyOrderCount: 2, shipByBufferMinutes: 120,
  }
}

function 是整数范围(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** 新编辑表单使用半小时粒度；运行校验仍兼容旧等待的分钟快照。 */
export function 校验合单时长输入(config: 合单动作配置): string {
  if (!是整数范围(config.shipByBufferMinutes, 0, 10080) || config.shipByBufferMinutes % 30 !== 0) return '履约预留时间须为 0～168 小时，按 0.5 小时调整'
  if (config.mode === 'advanced' && (!是整数范围(config.maxWaitMinutes, 30, 10080) || config.maxWaitMinutes % 30 !== 0)) return '最长等待时间须为 0.5～168 小时，按 0.5 小时调整'
  return ''
}

/** 新配置均按小时展示；旧非半小时快照保留精确余分钟，不四舍五入期限。 */
export function 合单时长显示(minutes: number): string {
  if (minutes % 30 === 0) return `${minutes / 60} 小时`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 以百万分之一 kg 保存比较量；不将缺失重量补成零。 */
export function 解析合单重量(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,6})?$/.test(value.trim())) return undefined
  const [whole, fraction = ''] = value.trim().split('.')
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

export function 校验合单动作(config: 合单动作配置 | undefined): string {
  if (!config || !['basic', 'advanced'].includes(config.mode)) return '请选择合单处理模式'
  if (typeof config.groupBySite !== 'boolean') return '请选择附加分组条件'
  if (!是整数范围(config.maxOrders, 2, 100)) return '每组最多订单数须为 2～100 的整数'
  if (config.maxQuantity !== undefined && !是整数范围(config.maxQuantity, 1, 999999)) return '合并后总件数上限须为 1～999999 的整数'
  if (config.maxWeightKg !== undefined) {
    const weight = 解析合单重量(config.maxWeightKg)
    if (weight === undefined || weight <= 0n) return '合并后重量上限须大于 0，最多 6 位小数'
  }
  // 发货时限保护也适用于基础模式，不能随高级参数隐藏而失效。
  if (!是整数范围(config.shipByBufferMinutes, 0, 10080)) return '履约预留时间须为 0～10080 分钟的整数'
  if (config.mode === 'basic') return ''
  if (!是整数范围(config.maxWaitMinutes, 1, 10080)) return '最长等待时间须为 1～10080 分钟的整数'
  if (!['ready', 'scheduled'].includes(config.releaseMode)) return '请选择高级放单方式'
  if (!Array.isArray(config.releaseTimes) || config.releaseTimes.length > 24 || config.releaseTimes.some(time => typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return '固定放单时间须为有效的北京时间，最多 24 个时点'
  if (new Set(config.releaseTimes).size !== config.releaseTimes.length) return '固定放单时间不能重复'
  if (config.releaseMode === 'scheduled' && !config.releaseTimes.length) return '到点集中放单须至少设置一个固定放单时间'
  if (config.releaseMode === 'ready' && !是整数范围(config.readyOrderCount, 2, config.maxOrders)) return `提前放单订单数须为 2～${config.maxOrders} 的整数，且不能超过每组最多订单数`
  return ''
}

export function 合单动作摘要(config: 合单动作配置 | undefined): string {
  if (!config || 校验合单动作(config)) return '合单配置待完善'
  const parts = [config.mode === 'basic' ? '基础模式 · 本轮处理后放单' : config.releaseMode === 'ready' ? `高级模式 · 达到 ${config.readyOrderCount} 单提前放单` : '高级模式 · 到点集中放单', `每组最多 ${config.maxOrders} 单`]
  if (config.maxQuantity !== undefined) parts.push(`总件数 ≤ ${config.maxQuantity}`)
  if (config.maxWeightKg !== undefined) parts.push(`总重量 ≤ ${config.maxWeightKg} kg`)
  if (config.groupBySite) parts.push('同站点')
  if (config.mode === 'advanced') {
    parts.push(`最多等待 ${合单时长显示(config.maxWaitMinutes)}`)
    if (config.releaseTimes.length) parts.push(`北京时间 ${[...config.releaseTimes].sort().join('、')} 放单`)
  }
  parts.push(`发货截止前预留 ${合单时长显示(config.shipByBufferMinutes)}`)
  return parts.join('；')
}
