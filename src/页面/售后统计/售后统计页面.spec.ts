import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDrawer, ElMessage, ElPagination, ElRadioGroup, ElSelect, ElInputNumber } from 'element-plus'
import DateRange from '@/组件/筛选/时间范围.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import StatisticsPage from './售后统计页面.vue'
import { demoData } from './数据'
import { demoExchangeQuote } from './汇率换算'
import type { AfterSaleRecord, HandlingRow, OrderLine, SkuRow } from './类型'

let wrapper: VueWrapper
let downloads: Blob[]
const metric = (key: string) => wrapper.get(`[data-testid="metric-${key}"]`).text()
async function click(label: string, scope = wrapper) {
  const button = scope.findAll('button').find(node => node.text().trim() === label)
  if (!button) throw new Error(`未找到按钮：${label}`)
  await button.trigger('click'); await flushPromises()
}
const table = (className: string) => wrapper.findAllComponents({ name: 'ElTable' }).find(node => node.classes().includes(className))!
const rows = <T>(className: string) => table(className).props('data') as T[]
const drawer = () => wrapper.findComponent(ElDrawer)
const detailRows = () => drawer().findComponent({ name: 'ElTable' }).props('data') as AfterSaleRecord[]
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob) })
}

beforeEach(() => {
  downloads = []
  vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:after-sale-statistics' }), revokeObjectURL: vi.fn() }))
  wrapper = mount(StatisticsPage, { attachTo: document.body, global: { directives: { prototype: {} }, // Select/InputNumber 的真实展开与尺寸行为由浏览器验收；组件测试只验证已应用状态与统计集合。
  stubs: { DateRange: true, MultiFilter: true, ElSelect: true, ElOption: true, ElInputNumber: true, teleport: true } } })
})
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('售后统计页面交互', () => {
  it('店铺、来源和SKU草稿仅查询后生效，重置恢复完整统计', async () => {
    expect(metric('recordCount')).toBe('26')
    expect(metric('orderCount')).toBe('14')
    const shop = demoData.shops[0]!
    const shopFilter = wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '店铺')!
    shopFilter.vm.$emit('update:modelValue', [shop.id]); await flushPromises()
    expect(metric('recordCount')).toBe('26')
    expect(wrapper.get('.as-filter-meta').text()).toContain('全部可见店铺')
    await click('查询')
    expect(metric('recordCount')).toBe('10')
    expect(wrapper.get('.as-filter-meta').text()).toContain(shop.name)
    await wrapper.get('input[aria-label="系统SKU精确搜索"]').setValue(' HOME-BOX-WH ')
    expect(metric('recordCount')).toBe('10')
    await click('查询')
    expect(metric('recordCount')).toBe('4')
    await click('重置')
    expect(metric('recordCount')).toBe('26')
    expect((wrapper.get('input[aria-label="系统SKU精确搜索"]').element as HTMLInputElement).value).toBe('')
    expect(shopFilter.props('modelValue')).toEqual([])
    wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '来源渠道')!.vm.$emit('update:modelValue', ['内部售后'])
    await flushPromises()
    expect(metric('recordCount')).toBe('26')
    await click('查询')
    expect(metric('recordCount')).toBe('6')
    await wrapper.get('[data-testid="metric-recordCount"]').trigger('click'); await flushPromises()
    expect(detailRows().every(row => row.origin === '内部售后')).toBe(true)
    await click('重置')
    expect(metric('recordCount')).toBe('26')
  }, 15000)

  it('日期倒置或缺失保留已查询结果，无匹配SKU正确呈现空态', async () => {
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-10-31', '2026-10-01'])
    await flushPromises(); await click('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('开始时间不能晚于结束时间')
    expect(metric('recordCount')).toBe('26')
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', null)
    await flushPromises(); await click('查询')
    expect(wrapper.get('[role="alert"]').text()).toContain('完整的日期范围')
    expect(metric('recordCount')).toBe('26')
    await click('重置')
    await wrapper.get('input[aria-label="系统SKU精确搜索"]').setValue('HOME-BOX')
    await click('查询')
    expect(metric('recordCount')).toBe('0')
    expect(metric('pendingCount')).toBe('0')
    expect(wrapper.text()).toContain('暂无售后记录')
  }, 15000)

  it('SKU采用独立订单批次，涉及率下钻分子分母且覆盖不足不显示零比率', async () => {
    wrapper.findComponent(DateRange).vm.$emit('update:modelValue', ['2026-10-01', '2026-10-01'])
    await flushPromises(); await click('查询')
    expect(metric('recordCount')).toBe('2')
    await click('SKU售后分析')
    expect(wrapper.findComponent(DateRange).props('ariaPrefix')).toBe('售后统计订单批次')
    expect(wrapper.get('.as-filter-meta').text()).toContain('2026-09-01 至 2026-09-30')
    const skuRows = rows<SkuRow>('as-sku-table')
    const sku = skuRows.find(row => row.sku === 'HOME-BOX-WH')!
    expect(sku).toMatchObject({ recordCount: 3, soldLineCount: 8, affectedLineCount: 2, rate: .25 })
    expect(skuRows.find(row => row.sku === 'GARDEN-LIGHT-4')?.rate).toBeNull()
    expect(skuRows.find(row => row.sku === '未关联 SKU')?.rate).toBeNull()
    const row = table('as-sku-table').findAll('tbody tr').find(node => node.text().includes('HOME-BOX-WH'))!
    await row.findAll('button').find(node => node.text() === '25.00%')!.trigger('click'); await flushPromises()
    expect(drawer().text()).toContain('2 条订单商品行')
    const radio = drawer().findComponent(ElRadioGroup)
    radio.vm.$emit('update:modelValue', 'denominator'); await flushPromises()
    expect(drawer().text()).toContain('8 条订单商品行')
    const denominator = drawer().findComponent({ name: 'ElTable' }).props('data') as OrderLine[]
    expect(denominator).toHaveLength(8)
    expect(new Set(denominator.map(line => line.id)).size).toBe(8)
    radio.vm.$emit('update:modelValue', 'observing'); await flushPromises()
    expect(drawer().text()).toContain('0 条订单商品行')
    await click('售后总览')
    expect(metric('recordCount')).toBe('2')
    expect(wrapper.findComponent(DateRange).props('modelValue')).toEqual(['2026-10-01', '2026-10-01'])
  }, 15000)

  it('展示币种查询后应用，混币凭证全部保留并精确折算', async () => {
    await click('售后成本分析')
    expect(metric('confirmedCosts')).toBe('CNY 3534.48')
    expect(metric('recoveries')).toBe('CNY 101.20')
    expect(metric('pendingCosts')).toBe('CNY 575.76')
    const select=wrapper.findAllComponents(ElSelect).find(c=>c.attributes('aria-label')==='展示币种')!
    select.vm.$emit('update:modelValue','USD'); await flushPromises()
    expect(metric('confirmedCosts')).toBe('CNY 3534.48')
    await click('查询')
    expect(metric('confirmedCosts')).toBe('USD 490.90')
    expect(metric('pendingCosts')).toBe('USD 79.97')
    expect(metric('recoveries')).toBe('USD 14.06')
    await click('查看全部凭证')
    const proofs=rows<{currency:string;recordIds:string[]}>('as-evidence-table')
    expect(new Set(proofs.map(r=>r.currency))).toEqual(new Set(['EUR','GBP','USD']))
    const no=demoData.records.find(r=>r.internalId===proofs[0]!.recordIds[0])!.no
    await click(no,drawer())
    expect(wrapper.findAllComponents(ElDrawer)).toHaveLength(1)
    expect(drawer().find('.as-record-detail').exists()).toBe(true)
    expect(drawer().text()).toContain('实际执行结果')
    expect(drawer().text()).toContain('统一展示 USD')
    await click('返回上一级',drawer())
    expect(rows<unknown>('as-evidence-table')).toHaveLength(proofs.length)
    await click('导出明细',drawer())
    const csv=await blobText(downloads[0]!)
    expect(csv).toContain('展示币种')
    expect(csv).toContain('EUR')
    expect(csv).toContain(demoExchangeQuote.id)
  },15000)

  it('客户按建单批次，客服待办保留跨月积压，切换维度关闭旧明细', async () => {
    await click('售后处理分析')
    expect(metric('pendingCount')).toBe('8')
    const customerRows = table('as-handling-table').findAll('tbody tr').filter(node => node.text().includes('buyer_demo_01'))
    expect(customerRows).toHaveLength(3)
    expect(customerRows.map(row => row.find('.as-muted').text())).toEqual(['优优美国综合店', '优优英国生活店', '优优美国综合店'])
    await wrapper.get('[data-testid="metric-pendingCount"]').trigger('click'); await flushPromises()
    expect(drawer().text()).toContain('8 张售后单')
    expect(detailRows().every(row => row.createdAt.startsWith('2026-10'))).toBe(true)
    const dimension = wrapper.findAllComponents(ElRadioGroup).find(node => node.attributes('aria-label') === '售后处理分析维度')!
    dimension.vm.$emit('update:modelValue', 'staff'); await flushPromises()
    expect(drawer().props('modelValue')).toBe(false)
    expect(metric('staffPending')).toBe('10')
    expect(wrapper.get('.as-date').text()).toContain('办理日期')
    expect(rows<HandlingRow>('as-handling-table').map(row => row.name)).toEqual(expect.arrayContaining(['陈晓', '林悦', '周宁', '陈晨']))
    await wrapper.get('[data-testid="metric-staffPending"]').trigger('click'); await flushPromises()
    expect(detailRows().map(row => row.internalId)).toEqual(expect.arrayContaining(['stat-record-27', 'stat-record-28']))
    expect(drawer().text()).toContain('10 张售后单')
    await click('售后原因分析')
    expect(drawer().props('modelValue')).toBe(false)
    await click('商品关联待核实 1 单'); await flushPromises()
    expect(detailRows().map(row => row.internalId)).toEqual(['stat-record-15'])
  }, 15000)

  it('明细分页不截断CSV，来源记录只读呈现北京时间，未查询草稿不改变导出', async () => {
    await wrapper.get('[data-testid="metric-recordCount"]').trigger('click'); await flushPromises()
    expect(detailRows()).toHaveLength(10)
    const pager = drawer().findComponent(ElPagination)
    expect(pager.props('total')).toBe(26)
    pager.vm.$emit('update:current-page', 3); await flushPromises()
    expect(detailRows()).toHaveLength(6)
    const record = detailRows()[0]!
    await click(record.no, drawer());
    expect(drawer().find('.as-record-detail').exists()).toBe(true)
    expect(drawer().text()).toContain('费用凭证')
    expect(drawer().text()).toContain('办理证据')
    expect(drawer().text()).not.toContain('固定虚构评审资料')
    await click('返回上一级', drawer())
    expect(drawer().findComponent(ElPagination).props('currentPage')).toBe(3)
    wrapper.findAllComponents(MultiFilter).find(node => node.props('placeholder') === '店铺')!.vm.$emit('update:modelValue', [demoData.shops[1]!.id]); await flushPromises()
    await click('导出明细', drawer())
    expect(downloads).toHaveLength(1)
    const csv = await blobText(downloads[0]!)
    expect(csv).toContain('"店铺范围","全部可见店铺"')
    expect(csv).toContain('"资料性质","本地独立虚构')
    const numbers = [...new Set(demoData.records.filter(row => row.createdAt.startsWith('2026-10')).map(row => row.no))]
    expect(numbers).toHaveLength(26)
    numbers.forEach(no => expect(csv).toContain(`"${no}"`))
    await click('导出统计')
    expect(downloads).toHaveLength(2)
    expect(await blobText(downloads[1]!)).toContain('"单据办理量（系统售后单）","26"')
  }, 15000)

  it('建单、办理、订单批次分别保留草稿及已应用日期，当前积压不被期间截断', async () => {
    const dates=()=>wrapper.findComponent(DateRange)
    dates().vm.$emit('update:modelValue',['2026-10-01','2026-10-01']); await flushPromises();await click('查询')
    expect(metric('recordCount')).toBe('2')
    await click('售后处理分析')
    const view=wrapper.findAllComponents(ElRadioGroup).find(c=>c.attributes('aria-label')==='售后处理分析维度')!
    view.vm.$emit('update:modelValue','staff');await flushPromises()
    expect(dates().props('modelValue')).toEqual(['2026-10-01','2026-10-31'])
    dates().vm.$emit('update:modelValue',['2026-11-01','2026-11-06']);await flushPromises();await click('查询')
    expect(metric('staffPending')).toBe('10')
    await wrapper.get('[data-testid="metric-staffPending"]').trigger('click');await flushPromises()
    await click('导出明细',drawer())
    expect(await blobText(downloads[0]!)).toContain('截至资料时点的当前积压')
    await click('售后总览')
    expect(dates().props('modelValue')).toEqual(['2026-10-01','2026-10-01'])
    expect(metric('recordCount')).toBe('2')
    await click('SKU售后分析')
    expect(dates().props('modelValue')).toEqual(['2026-09-01','2026-09-30'])
    await click('售后处理分析')
    expect(dates().props('modelValue')).toEqual(['2026-11-01','2026-11-06'])
  },15000)

  it('原因分类仅作用本页，原因到SKU到售后记录有逐级返回', async () => {
    await click('售后原因分析')
    wrapper.findAllComponents(ElSelect).find(c=>c.attributes('aria-label')==='原因分析分类')!.vm.$emit('update:modelValue','产品相关');await flushPromises()
    const reasons=rows<{category:string;skuCount:number;name:string}>('as-reason-table')
    expect(reasons.length).toBeGreaterThan(0);expect(reasons.every(r=>r.category==='产品相关')).toBe(true)
    const row=table('as-reason-table').findAll('tbody tr')[0]!
    await row.findAll('button')[1]!.trigger('click');await flushPromises()
    expect(rows<unknown>('as-reason-sku-table').length).toBeGreaterThan(0)
    await table('as-reason-sku-table').find('tbody button').trigger('click');await flushPromises()
    const first=detailRows()[0]!
    await click(first.no,drawer());expect(drawer().find('.as-record-detail').exists()).toBe(true)
    await click('返回上一级',drawer());expect(drawer().find('.as-detail-table').exists()).toBe(true)
    await click('返回上一级',drawer());expect(drawer().find('.as-reason-sku-table').exists()).toBe(true)
    await click('售后总览');await wrapper.get('[data-testid="metric-recordCount"]').trigger('click');await flushPromises()
    expect(drawer().text()).toContain('26 张售后单')
    await click('导出明细',drawer());const csv=await blobText(downloads[0]!)
    expect(csv).toContain('DEMO-AS-202610-003')
  },15000)

  it('SKU样本条件和排序影响完整导出集合，不改分母卡片', async () => {
    await click('SKU售后分析')
    expect(wrapper.find('.as-filters').text()).toContain('仅筛分子')
    const total=metric('matureLines')
    wrapper.findComponent(ElInputNumber).vm.$emit('update:modelValue',9);await flushPromises()
    expect(rows<SkuRow>('as-sku-table')).toHaveLength(0)
    expect(metric('matureLines')).toBe(total)
    await click('导出统计');const csv=await blobText(downloads[0]!)
    expect(csv).not.toContain('HOME-BOX-WH')
  },15000)


  it('缺少必要汇率阻断完整费用金额，保留全部原币凭证', async () => {
    const previous=demoExchangeQuote.rates.EUR
    try {
      delete demoExchangeQuote.rates.EUR
      await click('售后成本分析')
      expect(metric('confirmedCosts')).toBe('—')
      expect(wrapper.text()).toContain('缺少必要汇率')
      expect(metric('recoveries')).toBe('CNY 101.20')
      await click('查看全部凭证')
      expect(rows<{currency:string}>('as-evidence-table').some(r=>r.currency==='EUR')).toBe(true)
    } finally { demoExchangeQuote.rates.EUR=previous! }
  },15000)

  it('统一币种跨页签保留，排序不会再把其他来源币种排除', async () => {
    const select=wrapper.findAllComponents(ElSelect).find(c=>c.attributes('aria-label')==='展示币种')!
    select.vm.$emit('update:modelValue','USD');await flushPromises();await click('查询')
    await click('SKU售后分析')
    const sort=wrapper.findAllComponents(ElSelect).find(c=>c.attributes('aria-label')==='SKU排序')!
    sort.vm.$emit('update:modelValue','cost');await flushPromises()
    const products=rows<SkuRow>('as-sku-table')
    expect(products.some(r=>r.confirmedCosts.some(c=>c.currency==='EUR'))).toBe(true)
    expect(wrapper.text()).toContain('USD')
    await click('售后原因分析')
    expect(wrapper.get('.as-filter-meta').text()).toContain('统一展示 USD')
  },15000)

})
