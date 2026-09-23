import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import AgingPage from './三方仓库龄页面.vue'
import { createAgingWorkbook } from './库龄导出'
import type { AgingRecord } from './库龄模型'

vi.mock('./库龄模型', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./库龄模型')>()
  const base = actual.agingRecords[0]!
  const record = (id: string, changes: Partial<AgingRecord>): AgingRecord => ({ ...base, id, issues: [], ...changes })
  return {
    ...actual,
    agingRecords: [
      record('pair-a', { warehouseSku: 'WH-PAIR', batchNo: 'BATCH-SAME', consignmentNo: 'DEMO-CN-A', agingDays: 45, onHandQty: '3' }),
      record('pair-b', { warehouseSku: 'WH-PAIR', batchNo: 'BATCH-SAME', consignmentNo: 'DEMO-CN-B', agingDays: 45, onHandQty: '5' }),
      record('pair-other', { warehouseSku: 'WH-PAIR', batchNo: 'BATCH-OTHER', consignmentNo: 'DEMO-CN-C', agingDays: 90, onHandQty: '9' }),
      ...Array.from({ length: 51 }, (_, i) => record(`single-${i + 1}`, {
        warehouseSku: `WH-SINGLE-${i + 1}`, batchNo: `BATCH-SINGLE-${i + 1}`, consignmentNo: `DEMO-SINGLE-${i + 1}`,
        agingDays: i + 1, onHandQty: '1', quality: i === 50 ? '不良品' : '良品',
      })),
    ],
  }
})

vi.mock('./库龄导出', () => ({ createAgingWorkbook: vi.fn(() => new Uint8Array([80, 75, 3, 4])) }))

let wrapper: VueWrapper | undefined

async function settle() { await nextTick(); await flushPromises(); await nextTick() }

async function openDetails() {
  wrapper = mount(AgingPage, { attachTo: document.body, global: { directives: { prototype: {} } } })
  await wrapper.get('input[type="radio"][value="detail"]').setValue(true)
  await settle()
  return wrapper
}

function namedButton(root: VueWrapper | DOMWrapper<Element>, name: string) {
  const button = root.findAll('button').find(candidate => candidate.text() === name)
  if (!button) throw new Error(`未找到按钮：${name}`)
  return button
}

beforeEach(() => {
  vi.clearAllMocks()
  const OriginalURL = URL
  vi.stubGlobal('URL', class extends OriginalURL {
    static createObjectURL = vi.fn(() => 'blob:aging-test')
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('三方仓库龄 SKU 展开交互', () => {
  it('批次视图默认折叠，展开同一 SKU 的多条原始批次；已撤去页面提示区', async () => {
    const page = await openDetails()
    expect(page.get('.result-info').text()).toContain('52 个 SKU 组')
    expect(page.get('.result-info').text()).toContain('54 条批次明细')
    expect(page.find('.batch-panel').exists()).toBe(false)
    expect(page.get('button[aria-label="展开 WH-PAIR 批次明细"]').attributes('aria-expanded')).toBe('false')

    expect(page.find('.el-alert').exists()).toBe(false)
    expect(page.get('.view-bar').text()).not.toContain('虚构演示数据')
    expect(page.get('.aging-footer').text()).not.toContain('库龄天数直接取来源值')
    expect(page.get('.aging-footer').text()).not.toContain('各分段数量沿用来源单位')

    await page.get('button[aria-label="展开 WH-PAIR 批次明细"]').trigger('click')
    await settle()
    const panel = page.get('.batch-panel')
    expect(panel.get('.batch-heading').text()).toContain('3 条')
    const batches = panel.findAll('tbody tr.el-table__row')
    expect(batches).toHaveLength(3)
    expect(batches.filter(batch => batch.text().includes('BATCH-SAME'))).toHaveLength(2)
    expect(panel.text()).toContain('DEMO-CN-A')
    expect(panel.text()).toContain('DEMO-CN-B')
    expect(batches[0]!.text()).toContain('BATCH-OTHER')
    const headers = panel.findAll('th').map(header => header.text())
    expect(headers).toContain('在库数量（良品）')
    expect(headers).toContain('在库数量（不良品）')
    expect(headers).not.toContain('在库数量')
    expect(headers).not.toContain('数据说明')
    expect(batches[0]!.findAll('td')[headers.indexOf('在库数量（良品）')]!.text()).toBe('9')
    expect(batches[0]!.findAll('td')[headers.indexOf('在库数量（不良品）')]!.text()).toBe('—')

    await page.get('button[aria-label="收起 WH-PAIR 批次明细"]').trigger('click')
    await page.get('button[aria-label="展开 WH-SINGLE-51 批次明细"]').trigger('click')
    await settle()
    const defectiveCells = page.get('.batch-panel').get('tbody tr.el-table__row').findAll('td')
    expect(defectiveCells[headers.indexOf('在库数量（良品）')]!.text()).toBe('—')
    expect(defectiveCells[headers.indexOf('在库数量（不良品）')]!.text()).toBe('1')
    await page.get('input[type="radio"][value="summary"]').setValue(true)
    await settle()
    expect(page.findAll('th').map(header => header.text())).not.toContain('数据说明')
  }, 10_000)

  it('在第二页勾选和展开后查询批次，回第一页并清理操作状态，只展开命中的来源行', async () => {
    const page = await openDetails()
    await page.get('.el-pagination .btn-next').trigger('click')
    await settle()
    expect(page.get('.el-pager .is-active').text()).toBe('2')

    const expand = page.findAll('button[aria-expanded="false"]').find(button => button.attributes('aria-label')?.startsWith('展开 WH-SINGLE-'))!
    const selectedRow = new DOMWrapper(expand.element.closest('tr')!)
    await selectedRow.get('input[type="checkbox"]').setValue(true)
    await expand.trigger('click')
    await settle()
    expect(page.get('.result-info').text()).toContain('已选 1 个 SKU 组')
    expect(page.find('.batch-panel').exists()).toBe(true)

    await page.get('input[aria-label="批次号"]').setValue('BATCH-SAME')
    await page.get('form.filters').trigger('submit')
    await settle()
    expect(page.get('.el-pager .is-active').text()).toBe('1')
    expect(page.get('.result-info').text()).toContain('1 个 SKU 组')
    expect(page.get('.result-info').text()).toContain('2 条批次明细')
    expect(page.get('.result-info').text()).not.toContain('已选')
    expect(page.find('.batch-panel').exists()).toBe(false)
    expect(page.findAll('.aging-table input[type="checkbox"]:checked')).toHaveLength(0)

    await page.get('button[aria-label="展开 WH-PAIR 批次明细"]').trigger('click')
    await settle()
    const panel = page.get('.batch-panel')
    expect(panel.findAll('tbody tr.el-table__row')).toHaveLength(2)
    expect(panel.text()).toContain('DEMO-CN-A')
    expect(panel.text()).toContain('DEMO-CN-B')
    expect(panel.text()).not.toContain('BATCH-OTHER')
  }, 10_000)

  it('勾选折叠的 SKU 组导出全部匹配来源行，确认数量与工作簿输入一致且不按批次号去重', async () => {
    const page = await openDetails()
    const expand = page.get('button[aria-label="展开 WH-PAIR 批次明细"]')
    const selectedRow = new DOMWrapper(expand.element.closest('tr')!)
    await selectedRow.get('input[type="checkbox"]').setValue(true)
    await namedButton(page, '导出').trigger('click')
    await settle()
    expect(page.find('.batch-panel').exists()).toBe(false)

    const dialog = new DOMWrapper(document.body.querySelector('.el-dialog')!)
    expect(dialog.text()).toContain('当前页勾选（1 个 SKU 组，3 条明细）')
    expect(dialog.text()).toContain('共导出 3 条')
    await namedButton(dialog, '确认导出').trigger('click')
    await settle()

    expect(createAgingWorkbook).toHaveBeenCalledTimes(1)
    const [view, exported] = vi.mocked(createAgingWorkbook).mock.calls[0]!
    expect(view).toBe('detail')
    expect(exported).toHaveLength(3)
    expect((exported as AgingRecord[]).map(record => record.id)).toEqual(['pair-other', 'pair-a', 'pair-b'])
    expect((exported as AgingRecord[]).filter(record => record.batchNo === 'BATCH-SAME').map(record => record.onHandQty)).toEqual(['3', '5'])
    // 等待下载资源释放，避免页面的一秒清理定时器越过测试的 URL mock 生命周期。
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:aging-test'), { timeout: 1500 })
  }, 10_000)
})
