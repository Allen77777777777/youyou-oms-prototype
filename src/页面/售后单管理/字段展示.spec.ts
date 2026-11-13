import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import Page from './售后单管理页面.vue'
import { activeAfterSaleActor, afterSaleActors, afterSaleRecords, createAfterSale, validateAfterSale, type AfterSaleRecord } from './会话'
import { afterSaleDisplayItems } from './商品展示'
import { initializeAfterSaleDemo } from './演示数据'
import { createReturnData, returnSession } from '../eBay退换货申请/数据'
import { returnSaleItem } from '../eBay退换货申请/售后联动'
import FieldSearch from '@/组件/筛选/字段搜索.vue'

const path = '/oms/ebay-service/after-sale-orders'
const shell = { props: ['modelValue', 'title'], template: '<section v-if="modelValue" :aria-label="title"><slot /><footer><slot name="footer" /></footer></section>' }
let wrapper: VueWrapper | undefined
beforeEach(() => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  returnSession.records = createReturnData()
  afterSaleRecords.value = []
  initializeAfterSaleDemo()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
async function open(record: AfterSaleRecord) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: Page }] })
  await router.push({ path, query: { documentNo: record.no } }); await router.isReady()
  wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router], directives: { prototype: {} }, stubs: { ElDrawer: shell, ElDialog: shell } } })
  await flushPromises()
  return wrapper
}
function sourceOnlySkuRecord() {
  const source = returnSession.records.find(row => row.id === 'DEMO-RT-004')!
  const created = createAfterSale({ requestId: 'display-fields-refund', shopId: source.shopId, shopName: source.shopName,
    returnId: source.id, orderNo: source.orderNo, kind: '部分退款', amount: { value: '5.00', currency: source.currency },
    actionLabel: '发起退款', items: [{ ...returnSaleItem(source), quantity: source.quantity!, reason: '破损' }] })
  expect(created.ok).toBe(true)
  expect(created.record!.items[0]!.sku).toBeUndefined()
  return { source, record: created.record! }
}

describe('售后商品字段展示', () => {
  it.each(['itemOnHold', 'contentOnHold'] as const)('来源后续 %s 时，列表和详情隐藏旧标题而不改历史底稿', async field => {
    const record = afterSaleRecords.value.find(row => row.kind === '退货')!
    const source = returnSession.records.find(row => row.shopId === record.shopId && row.id === record.returnId)!
    const title = record.items[0]!.title
    const page = await open(record)
    expect(page.get('.table-area').text()).toContain(title)
    expect(page.get('.after-detail').text()).toContain(title)
    source.detail![field] = true
    await nextTick()
    expect(page.get('.table-area').text()).not.toContain(title)
    expect(page.get('.after-detail').text()).not.toContain(title)
    expect(page.get('.table-area').text()).toContain('平台已隐藏商品内容')
    expect(page.get('.after-detail').text()).toContain('平台已隐藏商品内容')
    expect(record.items[0]!.title).toBe(title)
  })

  it('来源 SKU 在两处只读展示并可检索，仍不能作为重发的已核实商品', async () => {
    const { source, record } = sourceOnlySkuRecord()
    const page = await open(record)
    expect(page.get('.table-area').text()).toContain(source.sku)
    expect(page.get('.after-detail').text()).toContain(source.sku)
    expect(page.get('.table-area').text()).toContain('退货申请来源 · OMS 商品未核实')
    expect(page.get('.after-detail').text()).toContain('退货申请来源 · OMS 商品未核实')
    const search = page.getComponent(FieldSearch)
    search.vm.$emit('update:field', 'sku'); search.vm.$emit('update:mode', 'exact'); search.vm.$emit('update:modelValue', source.sku)
    await nextTick()
    await page.findAll('button').find(node => node.text() === '查询')!.trigger('click')
    expect(page.get('.table-area').text()).toContain(record.no)
    expect(record.items[0]!.sku).toBeUndefined()
    expect(validateAfterSale({ ...record, kind: '重发' }).some(message => message.includes('系统商品尚未核实'))).toBe(true)
  })

  it('交易行不同、来源重复或读取失败时不将来源 SKU 填到本笔', () => {
    const { source, record } = sourceOnlySkuRecord()
    const originalLine = record.items[0]!.lineId
    record.items[0]!.lineId = 'OTHER-ITEM'
    expect(afterSaleDisplayItems(record)[0]!.sku).toBeUndefined()
    record.items[0]!.lineId = originalLine
    expect(afterSaleDisplayItems(record, [source, source])[0]!.sku).toBeUndefined()
    source.detail!.readStatus.detail.status = 'failed'
    expect(afterSaleDisplayItems(record)[0]!.sku).toBeUndefined()
  })

  it('已经保存的系统 SKU 不随来源回显值变化，也不附加未核实说明', () => {
    const record = afterSaleRecords.value.find(row => row.kind === '重发')!
    const source = returnSession.records.find(row => row.shopId === record.shopId && row.id === record.returnId)!
    const sku = record.items[0]!.sku
    source.sku = 'UNRELATED-SKU'
    expect(afterSaleDisplayItems(record)[0]).toMatchObject({ sku, skuSourceNote: '' })
  })

  it('列表和详情只显示本次办理保存的失败原因，不读取另一笔当前错误', async () => {
    const record = afterSaleRecords.value.find(row => row.kind === '部分退款')!
    const source = returnSession.records.find(row => row.shopId === record.shopId && row.id === record.returnId)!
    record.executionResult = '平台明确失败'
    source.submissionAttempts = [
      { id: 'OWN-ATTEMPT', operator: '客服01', action: '部分退款', businessId: record.requestId, outcome: 'failed', resultError: '本次报价超出当前可退金额' },
      { id: 'OTHER-ATTEMPT', operator: '客服02', action: '留言', businessId: 'another-business', outcome: 'failed', resultError: '另一笔留言错误' },
    ]
    source.submissionError = '另一笔当前错误'
    const page = await open(record)
    expect(page.get('.table-area').text()).toContain('失败原因：本次报价超出当前可退金额')
    expect(page.get('.after-detail').text()).toContain('本次报价超出当前可退金额')
    expect(page.text()).not.toContain('另一笔留言错误')
    expect(page.text()).not.toContain('另一笔当前错误')
  })

  it('同一人员审核权限收缩后关闭旧确认，权限恢复也不重新打开', async () => {
    const record = afterSaleRecords.value.find(row => row.kind === '重发')!
    const page = await open(record)
    await page.findAll('button').find(node => node.text() === '审核重发')!.trigger('click')
    expect(page.find('[aria-label="审核重发"]').exists()).toBe(true)
    const actor = activeAfterSaleActor.value
    activeAfterSaleActor.value = { ...actor, canApprove: false }
    await nextTick()
    expect(page.find('[aria-label="审核重发"]').exists()).toBe(false)
    activeAfterSaleActor.value = actor
    await nextTick()
    expect(page.find('[aria-label="审核重发"]').exists()).toBe(false)
    expect(record.approval).toBe('待审核')
    expect(record.manualOrderNo).toBeUndefined()
  })
})
