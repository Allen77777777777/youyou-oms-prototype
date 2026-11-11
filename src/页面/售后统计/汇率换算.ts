import { formatMinor, parseMinor, parseTime } from './模型'
import type { Money, MoneyTotal } from './类型'

export const displayCurrencies = ['CNY', 'USD', 'EUR', 'GBP'] as const
export type DisplayCurrency = typeof displayCurrencies[number]
const currencyDigits: Record<string, number> = { CNY: 2, USD: 2, EUR: 2, GBP: 2, AUD: 2, CAD: 2, JPY: 0, KRW: 0 }

/** 来源为每1单位来源币对应多少基准币；base_cross显式允许反向及经基准交叉推导。 */
export interface ExchangeQuote {
  id: string; asOf: string; source: string; baseCurrency: string
  rateConvention: 'base_per_source'; derivation: 'base_cross'; rates: Record<string, string>
}
/** 独立虚构报价。仅用于本地评审，不宣称优优中台接口已实现，也不作为记账汇率。 */
export const demoExchangeQuote: ExchangeQuote = {
  id: 'DEMO-FX-CNY-20261109-01', asOf: '2026-11-09T02:00:00.000Z', source: '独立虚构汇率资料', baseCurrency: 'CNY',
  rateConvention: 'base_per_source', derivation: 'base_cross', rates: { CNY: '1', USD: '7.2', EUR: '7.8', GBP: '9.2' },
}

export interface ConversionTrace { quoteId?: string; asOf?: string; source?: string }
export interface ConvertedAmount extends ConversionTrace {
  value: string | null
  /** 目标币／1来源币。非终止小数仅作18位小数显示；金额始终使用rateExact有理数计算。 */
  rate: string | null; reason?: string; rateExact?: { numerator: string; denominator: string }; rateIsApproximate?: boolean
  derivation?: 'identity' | 'direct' | 'inverse' | 'base_cross'
}
export interface ConvertedTotal extends ConversionTrace {
  currency: string; value: string | null; missingCount: number; sourceCount: number; reasons: string[]
}
interface Rational { numerator: bigint; denominator: bigint }
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const supported = (currency: string) => Object.prototype.hasOwnProperty.call(currencyDigits, currency)
const trace = (quote?: ExchangeQuote | null): ConversionTrace => quote ? { quoteId: quote.id, asOf: quote.asOf, source: quote.source } : {}
function gcd(a: bigint, b: bigint): bigint { while (b) { const next = a % b; a = b; b = next } return a }
function reduce(numerator: bigint, denominator: bigint): Rational { const divisor = gcd(numerator, denominator); return { numerator: numerator / divisor, denominator: denominator / divisor } }
function decimalRate(value: unknown): Rational | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null
  const [whole = '', fraction = ''] = value.split('.'), numerator = BigInt(whole + fraction)
  return numerator > 0n ? reduce(numerator, 10n ** BigInt(fraction.length)) : null
}
function signedMinor(value: string, currency: string): bigint | null {
  if (typeof value !== 'string') return null
  const negative = value.startsWith('-'), minor = parseMinor(negative ? value.slice(1) : value, currency)
  return minor === null ? null : negative ? -minor : minor
}
/** 四舍五入到最小货币单位；负值按绝对值舍入后恢复符号。 */
function roundRatio(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n, absolute = negative ? -numerator : numerator
  const quotient = absolute / denominator, remainder = absolute % denominator
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n)
  return negative ? -rounded : rounded
}
function decimalText(minor: bigint, places: number): string {
  if (!places) return minor.toString()
  const base = 10n ** BigInt(places), text = (minor % base).toString().padStart(places, '0').replace(/0+$/, '')
  return (minor / base).toString() + (text ? '.' + text : '')
}
function rateText(rate: Rational): { rate: string; rateIsApproximate: boolean } {
  let denominator = rate.denominator, twos = 0, fives = 0
  while (denominator % 2n === 0n) { denominator /= 2n; twos++ }
  while (denominator % 5n === 0n) { denominator /= 5n; fives++ }
  if (denominator === 1n) {
    const places = Math.max(twos, fives)
    return { rate: decimalText(rate.numerator * 10n ** BigInt(places) / rate.denominator, places), rateIsApproximate: false }
  }
  return { rate: decimalText(roundRatio(rate.numerator * 10n ** 18n, rate.denominator), 18), rateIsApproximate: true }
}

export function convertAmount(value: string, source: string, target: string, quote?: ExchangeQuote | null): ConvertedAmount {
  if (!supported(source) || !supported(target)) return { value: null, rate: null, reason: `暂不支持币种精度：${!supported(source) ? source : target}` }
  const amount = signedMinor(value, source)
  if (amount === null) return { value: null, rate: null, reason: `${source}金额或小数精度无效` }
  // 同币种是恒等显示，不依赖外部报价是否取得。
  if (source === target) return { value: formatMinor(amount, target), rate: '1', rateExact: { numerator: '1', denominator: '1' }, rateIsApproximate: false, derivation: 'identity' }
  if (!quote) return { value: null, rate: null, reason: '未取得汇率资料' }
  const provenance = trace(quote)
  if (!nonEmpty(quote.id) || !nonEmpty(quote.source) || parseTime(quote.asOf) === null) return { ...provenance, value: null, rate: null, reason: '汇率来源、版本或时点未核实' }
  if (quote.rateConvention !== 'base_per_source' || quote.derivation !== 'base_cross' || !supported(quote.baseCurrency)) return { ...provenance, value: null, rate: null, reason: '汇率方向或交叉换算契约未确认' }
  const baseRate = decimalRate(quote.rates?.[quote.baseCurrency])
  if (!baseRate || baseRate.numerator !== baseRate.denominator) return { ...provenance, value: null, rate: null, reason: '基准币种汇率必须明确为1' }
  const sourceRate = decimalRate(quote.rates?.[source]), targetRate = decimalRate(quote.rates?.[target])
  if (!sourceRate || !targetRate) return { ...provenance, value: null, rate: null, reason: `缺少${!sourceRate ? source : target}的有效正汇率` }
  const rate = reduce(sourceRate.numerator * targetRate.denominator, sourceRate.denominator * targetRate.numerator)
  const converted = roundRatio(amount * rate.numerator * 10n ** BigInt(currencyDigits[target]!), rate.denominator * 10n ** BigInt(currencyDigits[source]!))
  return { ...provenance, value: formatMinor(converted, target), ...rateText(rate), rateExact: { numerator: rate.numerator.toString(), denominator: rate.denominator.toString() },
    derivation: target === quote.baseCurrency ? 'direct' : source === quote.baseCurrency ? 'inverse' : 'base_cross' }
}

export function sumConverted(entries: readonly Money[], target: string, quote?: ExchangeQuote | null): ConvertedTotal {
  const converted = entries.map(entry => convertAmount(entry.value, entry.currency, target, quote))
  const missingCount = converted.filter(entry => entry.value === null).length
  const reasons = [...new Set(converted.flatMap(entry => entry.reason ? [entry.reason] : []))]
  return { ...trace(quote), currency: target, value: !entries.length || missingCount ? null : formatMinor(converted.reduce((sum, entry) => sum + signedMinor(entry.value!, target)!, 0n), target),
    missingCount, sourceCount: entries.length, reasons }
}

/** 聚合值只提供兼容读取；跨币多凭证必须有原始分项，不能由合计猜测逐项舍入结果。 */
export function convertMoneyTotals(totals: readonly MoneyTotal[], target: string, quote?: ExchangeQuote | null): ConvertedTotal {
  const entries: Money[] = [], failures: { count: number; reason: string }[] = []
  let sourceCount = 0
  for (const total of totals) {
    const count = Number.isSafeInteger(total.evidenceCount) && total.evidenceCount > 0 ? total.evidenceCount : 1
    sourceCount += count
    if (!Number.isSafeInteger(total.evidenceCount) || total.evidenceCount <= 0) { failures.push({ count, reason: '费用依据数量无效' }); continue }
    if (total.components) {
      const amount = signedMinor(total.value, total.currency)
      const parts = total.components.map(part => part.currency === total.currency ? signedMinor(part.value, part.currency) : null)
      if (total.components.length !== total.evidenceCount || amount === null || parts.some(part => part === null) || parts.reduce<bigint>((sum, part) => sum + (part ?? 0n), 0n) !== amount) {
        failures.push({ count, reason: '费用分项与原币合计不一致' }); continue
      }
      entries.push(...total.components)
    } else if (total.evidenceCount === 1 || total.currency === target) entries.push({ value: total.value, currency: total.currency })
    else failures.push({ count, reason: '缺少逐笔换算依据，不能由聚合金额推断舍入' })
  }
  const result = sumConverted(entries, target, quote)
  return { ...result, sourceCount, missingCount: result.missingCount + failures.reduce((sum, failure) => sum + failure.count, 0),
    value: failures.length ? null : result.value, reasons: [...new Set([...result.reasons, ...failures.map(failure => failure.reason)])] }
}
