import { 比价币种代码 } from './比价币种'

/** 中台货币汇率的一轮只读快照；方向固定为 1 单位原币 = cnyRate 人民币。 */
export interface 比价汇率快照 {
  snapshotId: string
  effectiveAt: string
  source: string
  rates: readonly { currencyCode: string; cnyRate: string }[]
}
export type 比价汇率来源 = Pick<比价汇率快照, 'snapshotId' | 'effectiveAt' | 'source'>
export interface 精确十进制 { coefficient: bigint; scale: number }
const 币种集合 = new Set<string>(比价币种代码)

function 规整金额(coefficient: bigint, scale: number): 精确十进制 {
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale-- }
  return { coefficient, scale }
}
/** 不接受指数、符号或 Number；十进制小数始终完整保留，不按展示精度截断。 */
export function 解析精确十进制(value: unknown): 精确十进制 | undefined {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined
  const [whole, fraction = ''] = value.trim().split('.')
  return 规整金额(BigInt(whole! + fraction), fraction.length)
}
export function 精确金额相乘(a: 精确十进制, b: 精确十进制): 精确十进制 {
  return 规整金额(a.coefficient * b.coefficient, a.scale + b.scale)
}
function 同精度金额(a: 精确十进制, scale: number): bigint { return a.coefficient * 10n ** BigInt(scale - a.scale) }
export function 比较精确金额(a: 精确十进制, b: 精确十进制): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale), x = 同精度金额(a, scale), y = 同精度金额(b, scale)
  return x < y ? -1 : x > y ? 1 : 0
}
/** 使用同一精度直接比较差额；无中间四舍五入，也不使用两两价格排序器决定价差池。 */
export function 精确价差小于(a: 精确十进制, minimum: 精确十进制, threshold: 精确十进制): boolean {
  const scale = Math.max(a.scale, minimum.scale, threshold.scale)
  return 同精度金额(a, scale) - 同精度金额(minimum, scale) < 同精度金额(threshold, scale)
}
export function 格式化精确金额(value: 精确十进制): string {
  const { coefficient, scale } = 规整金额(value.coefficient, value.scale)
  if (!scale) return coefficient.toString()
  const digits = coefficient.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

function 汇率时间有效(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) return false
  const [, y, m, d, h, minute, second, zone] = match
  const year = Number(y), month = Number(m), day = Number(d)
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]! || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59) return false
  if (zone !== 'Z') {
    if (zone === '-00:00') return false
    const [offsetHour, offsetMinute] = zone!.slice(1).split(':').map(Number)
    if (offsetHour! > 14 || offsetMinute! > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false
  }
  return Number.isFinite(Date.parse(value))
}

/** 仅在需要换算时调用；快照选择／有效期由中台来源契约决定，不自行取实时值或设过期时限。 */
export function 校验比价汇率快照(snapshot: 比价汇率快照 | undefined, requiredCurrencies: readonly string[]) {
  const rates = new Map<string, string>([['CNY', '1']])
  const fail = (reason: string) => ({ rates, reason, snapshot: undefined as 比价汇率来源 | undefined })
  if (!snapshot) return fail('未取得中台货币汇率快照，无法统一人民币比较')
  if ([snapshot.snapshotId, snapshot.source].some(value => typeof value !== 'string' || !value.trim()) || !汇率时间有效(snapshot.effectiveAt) || !Array.isArray(snapshot.rates)) return fail('中台货币汇率快照来源或生效时间无效，无法进行比价')
  const seen = new Set<string>()
  for (const item of snapshot.rates) {
    if (!item || !币种集合.has(item.currencyCode) || seen.has(item.currencyCode)) return fail('中台货币汇率快照币种无效或重复，无法进行比价')
    seen.add(item.currencyCode)
    const rate = 解析精确十进制(item.cnyRate)
    if (!rate || rate.coefficient <= 0n || (item.currencyCode === 'CNY' && 比较精确金额(rate, { coefficient: 1n, scale: 0 }) !== 0)) return fail('中台货币汇率须为正十进制且人民币汇率固定为1，无法进行比价')
    rates.set(item.currencyCode, 格式化精确金额(rate))
  }
  for (const currency of requiredCurrencies) if (!rates.has(currency)) return fail(`中台货币汇率快照缺少 ${currency} 对人民币汇率，无法进行比价`)
  return { rates, reason: '', snapshot: { snapshotId: snapshot.snapshotId, effectiveAt: snapshot.effectiveAt, source: snapshot.source } as 比价汇率来源 | undefined }
}
