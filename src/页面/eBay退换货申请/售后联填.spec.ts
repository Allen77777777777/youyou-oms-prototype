import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import SaleFields from './售后联填.vue'
import { createReturnData, returnSession } from './数据'
import { createReturnSaleDraft, prepareReship, returnSaleItem } from './售后联动'
import { activeAfterSaleActor, afterSaleActors, validateAfterSale } from '../售后单管理/会话'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  activeAfterSaleActor.value = afterSaleActors[0]!
  returnSession.records = createReturnData()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
function show() {
  const row = returnSession.records.find(record => record.id === 'DEMO-RT-015')!
  const draft = createReturnSaleDraft(row)
  wrapper = mount(SaleFields, { props: { row, draft, kind: '部分退款' },
    global: { directives: { prototype: {} }, stubs: { ElFormItem: { template: '<div><slot /></div>' } } } })
  return { row, draft }
}

describe('售后联填来源 SKU 摘要', () => {
  it('显示原申请 SKU 与未核实说明，展示值不进入真实提交商品或重发资格', () => {
    const { row, draft } = show()
    expect(wrapper!.get('.sale-item').text()).toContain('系统 SKU HOME-RACK-01')
    expect(wrapper!.get('.sale-item').text()).toContain('退货申请来源 · OMS 商品未核实')
    expect(returnSaleItem(row).sku).toBeUndefined()
    const input = prepareReship(row, draft)
    expect(input.items[0]!.sku).toBeUndefined()
    expect(validateAfterSale(input).some(message => message.includes('系统商品尚未核实'))).toBe(true)
  })

  it('来源详情读取失败或身份冲突时不沿用来源 SKU 补显', async () => {
    const { row } = show()
    row.detail!.readStatus.detail.status = 'failed'
    await nextTick()
    expect(wrapper!.get('.sale-item').text()).not.toContain('HOME-RACK-01')
    expect(wrapper!.get('.sale-item').text()).toContain('系统 SKU 待核实')
    row.detail!.readStatus.detail.status = 'success'
    row.detail!.identityConflicts = { detail: true }
    await nextTick()
    expect(wrapper!.get('.sale-item').text()).not.toContain('HOME-RACK-01')
    expect(returnSaleItem(row).sku).toBeUndefined()
  })
})
