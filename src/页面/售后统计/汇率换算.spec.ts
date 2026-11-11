import { describe, expect, it } from 'vitest'
import { convertAmount, convertMoneyTotals, demoExchangeQuote, displayCurrencies, sumConverted } from './汇率换算'
import type { ExchangeQuote } from './汇率换算'
import { buildStatistics, createDefaultFilter } from './模型'
import { buildReasonRows, collectCostEvidence } from './分析工具'
import { createDemoData } from './数据'

const quote = (rates: Record<string, string> = {}): ExchangeQuote => ({ ...demoExchangeQuote, rates: { ...demoExchangeQuote.rates, ...rates } })

describe('精确展示币种换算', () => {
  it('默认币种及虚构报价有固定版本、时点与明确来源币到基准币方向', () => {
    expect(displayCurrencies).toEqual(['CNY', 'USD', 'EUR', 'GBP'])
    expect(demoExchangeQuote).toMatchObject({ id: 'DEMO-FX-CNY-20261109-01', asOf: '2026-11-09T02:00:00.000Z', baseCurrency: 'CNY', rateConvention: 'base_per_source', derivation: 'base_cross' })
    expect(convertAmount('10.00', 'USD', 'CNY', demoExchangeQuote)).toMatchObject({ value: '72.00', rate: '7.2', derivation: 'direct', quoteId: demoExchangeQuote.id })
    expect(convertAmount('72.00', 'CNY', 'USD', demoExchangeQuote)).toMatchObject({ value: '10.00', derivation: 'inverse', rateExact: { numerator: '5', denominator: '36' } })
  })
  it('同币种恒等显示不依赖外部汇率；没有资料的跨币转换不补0', () => {
    expect(convertAmount('12.3', 'USD', 'USD')).toMatchObject({ value: '12.30', rate: '1', derivation: 'identity' })
    expect(convertAmount('12.30', 'USD', 'CNY')).toMatchObject({ value: null, rate: null, reason: '未取得汇率资料' })
  })
  it('交叉汇率以精确有理数计算金额，显示近似率不参与金额计算', () => {
    const result = convertAmount('1.00', 'USD', 'EUR', demoExchangeQuote)
    expect(result).toMatchObject({ value: '0.92', rateExact: { numerator: '12', denominator: '13' }, rate: '0.923076923076923077', rateIsApproximate: true, derivation: 'base_cross' })
    expect(convertAmount('1.00', 'EUR', 'USD', demoExchangeQuote).value).toBe('1.08')
    expect(convertAmount('9007199254740993.12', 'USD', 'CNY', demoExchangeQuote).value).toBe('64851834634135150.46')
  })
  it('逐凭证或分摊项先按目标精度四舍五入，再相加以勾稽明细', () => {
    const parts = [{ value: '0.03', currency: 'USD' }, { value: '0.03', currency: 'USD' }]
    expect(sumConverted(parts, 'CNY', demoExchangeQuote)).toMatchObject({ value: '0.44', missingCount: 0, sourceCount: 2 })
    expect(convertAmount('0.06', 'USD', 'CNY', demoExchangeQuote).value).toBe('0.43')
    expect(convertAmount('-0.03', 'USD', 'CNY', demoExchangeQuote).value).toBe('-0.22')
  })
  it('遵守来源及目标币精度，未知精度和非法金额不执行换算', () => {
    expect(convertAmount('0.01', 'USD', 'JPY', quote({ JPY: '0.05' })).value).toBe('1')
    expect(convertAmount('2', 'JPY', 'CNY', quote({ JPY: '0.05' })).value).toBe('0.10')
    for (const value of ['0.001', '1e2', ' 1.00', 'NaN', '1.']) expect(convertAmount(value, 'USD', 'CNY', demoExchangeQuote).value).toBeNull()
    expect(convertAmount('1.1', 'JPY', 'CNY', quote({ JPY: '0.05' })).value).toBeNull()
    expect(convertAmount('1.00', 'ZZZ', 'CNY', demoExchangeQuote).value).toBeNull()
    expect(convertAmount('1.00', 'USD', 'ZZZ', demoExchangeQuote).value).toBeNull()
  })
  it('不使用缺失、非正、无方向或无追溯报价，保留缺失原因', () => {
    for (const invalid of ['0', '-1', '1e2', 'NaN', 'Infinity', '']) expect(convertAmount('1.00', 'USD', 'CNY', quote({ USD: invalid })).value).toBeNull()
    const missing = quote(); delete missing.rates.EUR
    expect(convertAmount('1.00', 'EUR', 'CNY', missing).reason).toContain('EUR')
    for (const patch of [{ id: '' }, { source: '' }, { asOf: '2026-11-09 10:00:00' }, { rateConvention: 'source_per_base' }, { derivation: undefined }]) {
      expect(convertAmount('1.00', 'USD', 'CNY', { ...quote(), ...patch } as ExchangeQuote).value).toBeNull()
    }
    expect(convertAmount('1.00', 'USD', 'CNY', quote({ CNY: '2' })).value).toBeNull()
  })
  it('任一分项缺率则整组不显示部分合计，空集合和明确零值分别表示', () => {
    const missing = quote(); delete missing.rates.EUR
    const total = sumConverted([{ value: '1.00', currency: 'USD' }, { value: '1.00', currency: 'EUR' }], 'CNY', missing)
    expect(total).toMatchObject({ currency: 'CNY', value: null, sourceCount: 2, missingCount: 1, reasons: ['缺少EUR的有效正汇率'] })
    expect(sumConverted([], 'CNY', quote())).toMatchObject({ value: null, sourceCount: 0, missingCount: 0 })
    expect(sumConverted([{ value: '0.00', currency: 'USD' }], 'CNY', quote()).value).toBe('0.00')
  })
})

describe('聚合指标的逐笔换算来源', () => {
  it('展开原始分项，拒绝跨币多证据缺分项或分项不能勾稽的合计', () => {
    const total = { currency: 'USD', value: '0.06', evidenceCount: 2, components: [{ value: '0.03', currency: 'USD' }, { value: '0.03', currency: 'USD' }] }
    expect(convertMoneyTotals([total], 'CNY', demoExchangeQuote)).toMatchObject({ value: '0.44', sourceCount: 2, missingCount: 0 })
    expect(convertMoneyTotals([{ currency: 'USD', value: '0.06', evidenceCount: 2 }], 'CNY', demoExchangeQuote)).toMatchObject({ value: null, sourceCount: 2, missingCount: 2 })
    expect(convertMoneyTotals([{ ...total, components: [{ value: '0.02', currency: 'USD' }, { value: '0.03', currency: 'USD' }] }], 'CNY', demoExchangeQuote).value).toBeNull()
    expect(convertMoneyTotals([{ ...total, components: [{ value: '0.03', currency: 'EUR' }, { value: '0.03', currency: 'USD' }] }], 'CNY', demoExchangeQuote).value).toBeNull()
    expect(convertMoneyTotals([{ currency: 'USD', value: '0.06', evidenceCount: 2 }], 'USD').value).toBe('0.06')
  })
  it('演示摘要、唯一凭证明细逐笔换算一致，SKU和原因均保留可核对分项', () => {
    const data = createDemoData(), result = buildStatistics(data, createDefaultFilter())
    const evidence = collectCostEvidence(data, result.records).filter(entry => entry.status === 'confirmed' && entry.kind !== '费用回收')
    const expected = sumConverted(evidence, 'CNY', demoExchangeQuote)
    expect(expected.value).toBe('3534.48')
    expect(sumConverted(evidence, 'USD', demoExchangeQuote).value).toBe('490.90')
    expect(convertMoneyTotals(result.summary.confirmedCosts, 'CNY', demoExchangeQuote)).toMatchObject({ value: expected.value, sourceCount: expected.sourceCount, missingCount: 0 })
    expect(result.skuRows.flatMap(row => row.confirmedCosts).every(total => total.components?.length === total.evidenceCount)).toBe(true)
    expect(buildReasonRows(data, result.records).flatMap(row => row.confirmedCosts).every(total => total.components?.length === total.evidenceCount)).toBe(true)
  })
})
