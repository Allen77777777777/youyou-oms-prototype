import type { 全渠道订单 } from '../全渠道订单/类型'
import { 解析合单重量, type 合单动作配置 } from '../订单规则/合单规则模型'

/** 候选事实由来源订单及已核实资料提供；缺失站点、重量不补值。 */
export interface 合单候选 {
  orderNo: string
  ruleId: string
  ruleName: string
  ruleVersion: number
  /** 全局合单设置的已保存版本；规则版本仅供命中追踪，不隔离公共池。 */
  settingsVersion: number
  action: 合单动作配置
  groupKey: string
  quantity: number
  weightKg?: string
  shipByAt?: number
  /** 最长等待起点；有可信节点时取首次到达时间，旧快照缺省沿用实际入池时间。 */
  waitStartedAt?: number
}
export type 合单进度状态 = '待本轮处理' | '等单中' | '已放单' | '分仓待处理' | '已排除'
export interface 合单等待记录 extends 合单候选 {
  enteredAt: number
  deadlineAt: number | null
  deadlineReason: string
  status: 合单进度状态
  reason: string
  groupId?: string
  releasedAt?: number
  /** 明确人工解除原组合后，逐单接续分仓；保留原规则快照，不重新入池。 */
  independentRelease?: boolean
}
export interface 合单放单组 { orderNos: string[]; reason: string; groupKey: string }
export interface 合单执行结果 {
  executedAt: number
  source?: string
  total: number
  merged: number
  released: number
  waiting: number
  skipped: number
  rows: Array<{ orderNo: string; status: string; reason: string; groupId?: string }>
}
export const 是合单等待 = (记录: 合单等待记录) => 记录.status === '待本轮处理' || 记录.status === '等单中'
const 分钟 = 60_000
const 北京偏移 = 8 * 60 * 分钟
const 一日 = 24 * 60 * 分钟
const 文本 = (值?: string) => (值 ?? '').trim()

/** 仅接受携带时区的来源时间，避免客户端本地时区改变放单时刻。 */
export function 解析合单来源时间(value?: string): number | undefined {
  if (!value) return undefined
  const 原值 = value.trim()
  let 标准 = 原值
  const 匹配 = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))? UTC(?:(\+|\-)(\d{1,2}))?$/.exec(原值)
  if (匹配) 标准 = `${匹配[1]}T${匹配[2]}:${匹配[3] ?? '00'}${匹配[4] ? `${匹配[4]}${匹配[5]!.padStart(2, '0')}:00` : 'Z'}`
  else if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(原值)) return undefined
  const 时间 = Date.parse(标准)
  return Number.isFinite(时间) ? 时间 : undefined
}

export function 北京时间文本(time: number): string {
  return `${new Date(time + 北京偏移).toISOString().replace('T', ' ').slice(0, 19)} 北京时间`
}

/** 入池当刻等于固定时点时立即放行；否则取最近的下一个北京时间时点。 */
export function 下一固定放单时间(enteredAt: number, times: readonly string[]): number | undefined {
  const 当日零点 = Math.floor((enteredAt + 北京偏移) / 一日) * 一日 - 北京偏移
  const 候选 = times.filter(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)).map(time => {
    const [时, 分] = time.split(':').map(Number)
    const 时点 = 当日零点 + (时! * 60 + 分!) * 分钟
    return 时点 < enteredAt ? 时点 + 一日 : 时点
  })
  return 候选.length ? Math.min(...候选) : undefined
}

/** 五项固定条件，地址逐字段精确比较；未核实身份不可因空值相同而成组。 */
export function 读取合单分组身份(order: 全渠道订单, groupBySite = false, siteId?: string): { key?: string; reason?: string } {
  if (![order.platformCode, order.storeId, order.buyerExternalId, order.address.fullName, order.address.countryCode, order.address.addressLine1].every(值 => 文本(值))) return { reason: '平台、店铺、买家、收件人或完整收货地址缺失，不能判断为同一收件组' }
  if (groupBySite && !文本(siteId)) return { reason: '站点资料未核实，不能按同站点合单' }
  const 地址 = order.address
  return { key: JSON.stringify([order.platformCode, order.storeId, order.buyerExternalId, 地址.fullName, 地址.countryCode, 地址.stateProvince, 地址.city, 地址.district, 地址.addressLine1, 地址.addressLine2, 地址.postalCode, groupBySite ? siteId : ''].map(文本)) }
}

export function 创建合单等待记录(候选: 合单候选, enteredAt: number, nextBatchAt?: number | null): 合单等待记录 {
  const 截止: Array<{ at: number; reason: string }> = []
  if (候选.action.mode === 'advanced') {
    截止.push({ at: (候选.waitStartedAt ?? enteredAt) + 候选.action.maxWaitMinutes * 分钟, reason: '最长等待时间已到' })
    if (候选.action.releaseTimes.length) {
      const 固定时间 = 下一固定放单时间(enteredAt, 候选.action.releaseTimes)
      if (固定时间 !== undefined) 截止.push({ at: 固定时间, reason: '已到固定放单时间' })
    }
  } else if (nextBatchAt !== undefined && nextBatchAt !== null) 截止.push({ at: nextBatchAt, reason: '本轮合单处理时间已到' })
  if (候选.shipByAt !== undefined) 截止.push({ at: 候选.shipByAt - 候选.action.shipByBufferMinutes * 分钟, reason: '已进入发货截止预留时间' })
  截止.sort((a, b) => a.at - b.at)
  return { ...JSON.parse(JSON.stringify(候选)) as 合单候选, enteredAt, deadlineAt: 截止[0]?.at ?? null, deadlineReason: 截止[0]?.reason ?? '', status: 候选.action.mode === 'basic' ? '待本轮处理' : '等单中', reason: 候选.action.mode === 'basic' ? '等待下一轮合单处理' : '等待同组订单或到期放单' }
}

function 是否超限(records: 合单等待记录[], action: 合单动作配置): boolean {
  if (records.length > action.maxOrders) return true
  if (action.maxQuantity !== undefined && records.reduce((sum, row) => sum + row.quantity, 0) > action.maxQuantity) return true
  if (action.maxWeightKg !== undefined) {
    const maximum = 解析合单重量(action.maxWeightKg)
    const weights = records.map(row => 解析合单重量(row.weightKg))
    if (maximum === undefined || weights.some(weight => weight === undefined)) return true
    if (weights.reduce<bigint>((sum, weight) => sum + weight!, 0n) > maximum) return true
  }
  return false
}

/** 按入池顺序稳定装组，限制针对完整组；从不拆分某张来源订单的商品。 */
export function 划分合单候选组(records: readonly 合单等待记录[]): 合单等待记录[][] {
  const 同身份 = new Map<string, 合单等待记录[]>()
  for (const record of [...records].filter(是合单等待).sort((a, b) => a.enteredAt - b.enteredAt || a.orderNo.localeCompare(b.orderNo))) {
    // 公共池跨入池规则分组；新旧全局设置快照隔离，旧等待不会被重新计时。
    const key = JSON.stringify([record.settingsVersion, record.action, record.groupKey])
    const list = 同身份.get(key) ?? []
    list.push(record)
    同身份.set(key, list)
  }
  const groups: 合单等待记录[][] = []
  for (const rows of 同身份.values()) {
    let current: 合单等待记录[] = []
    for (const row of rows) {
      if (current.length && 是否超限([...current, row], row.action)) { groups.push(current); current = [] }
      current.push(row)
      if (是否超限(current, row.action)) { groups.push(current); current = [] }
    }
    if (current.length) groups.push(current)
  }
  return groups
}

/** 纯计算：扫描批次、独立到期时钟和人工结束等单共用放单决策。 */
export function 计算合单放单(records: readonly 合单等待记录[], now: number, options: { batch?: boolean; forceOrderNos?: readonly string[]; forceReason?: string } = {}): 合单放单组[] {
  const result: 合单放单组[] = []
  for (const group of 划分合单候选组(records)) {
    const first = group[0]!
    const force = options.forceOrderNos?.some(no => group.some(row => row.orderNo === no))
    const 到期 = group.filter(row => row.deadlineAt !== null && row.deadlineAt <= now).sort((a, b) => a.deadlineAt! - b.deadlineAt!)[0]
    let reason = ''
    if (force) reason = options.forceReason || '人工结束等单'
    else if (是否超限(group, first.action)) reason = '单张订单已达到整组限制，独立放单'
    else if (到期) reason = 到期.deadlineReason
    else if (first.action.mode === 'basic' && options.batch) reason = group.length > 1 ? '本轮已找到可合并订单' : '本轮没有可合并订单，独立放单'
    else if (first.action.mode === 'advanced' && first.action.releaseMode === 'ready' && group.length >= first.action.readyOrderCount) reason = `同组已达到 ${first.action.readyOrderCount} 张订单，提前放单`
    if (reason) result.push({ orderNos: group.map(row => row.orderNo), reason, groupKey: first.groupKey })
  }
  return result
}
