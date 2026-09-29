import { describe, expect, it } from 'vitest'
import { 创建渠道配置样例, 创建空白标发设置, 复制渠道, 渠道来源键, 同步渠道清单, 批量渠道启停, 校验渠道配置, 渠道CSV, 渠道变更摘要, 追加渠道日志, 标发平台, type 渠道操作记录 } from './物流渠道配置'

const 时间 = '2026-09-28 16:30:00'

describe('三方仓物流渠道来源与本地配置', () => {
  it('外部代码可空保存、缺返保留且经映射明确为空时清空，不泄露至业务日志与导出', () => {
    const row = 创建渠道配置样例()[0]!, source = 复制渠道(row)
    const rows = [row], logs: 渠道操作记录[] = []
    source.providerCode = 'DEMO_PRIVATE_PROVIDER_CODE'
    expect(同步渠道清单(rows, [source], logs, 时间)[0]!.result).toBe('成功')
    expect(row.providerCode).toBe(source.providerCode)
    expect(渠道CSV(rows)).not.toContain(source.providerCode)
    expect(JSON.stringify(logs)).not.toContain(source.providerCode)
    delete source.providerCode
    同步渠道清单(rows, [source], logs, 时间)
    expect(row.providerCode).toBe('DEMO_PRIVATE_PROVIDER_CODE')
    source.providerCode = null
    同步渠道清单(rows, [source], logs, 时间)
    expect(row.providerCode).toBeNull()
    expect(校验渠道配置(row)).toBe('')
  })

  it('有来源ID时无外部代码也能新建并重复同步，但外部代码不能代替缺失的来源身份', () => {
    const source = 创建渠道配置样例()[0]!, logs: 渠道操作记录[] = []
    const rows: typeof source[] = []
    expect(同步渠道清单(rows, [source], logs, 时间)[0]!.result).toBe('成功')
    expect(rows[0]!.providerCode).toBeNull()
    expect(rows[0]!.enabled).toBe(false)
    同步渠道清单(rows, [source], logs, 时间)
    expect(rows).toHaveLength(1)
    const before = 复制渠道(rows)
    source.sourceId = ''; source.providerCode = 'DEMO_CODE_WITHOUT_ID'
    expect(同步渠道清单(rows, [source], logs, 时间)[0]!.result).toBe('失败')
    expect(rows).toEqual(before)
  })

  it('同一来源标识按服务商、账号、仓库隔离', () => {
    const rows = 创建渠道配置样例()
    expect(new Set(rows.map(渠道来源键)).size).toBe(rows.length)
    const sameSource = rows.filter(r => r.sourceId === rows[0]!.sourceId)
    expect(sameSource.length).toBeGreaterThan(1)
    expect(rows.every(r => !('providerCode' in r))).toBe(true)
    const original = 复制渠道(rows)
    const incoming = 复制渠道(rows[0]!)
    incoming.sourceName = '来源名称变更'
    const logs: 渠道操作记录[] = []
    同步渠道清单(rows, [incoming], logs, 时间)
    expect(rows[0]!.sourceName).toBe('来源名称变更')
    expect(rows.slice(1)).toEqual(original.slice(1))
  })

  it('重新同步更新来源，保留本地名称、限制、备注、启停和各平台标发设置', () => {
    const row = 创建渠道配置样例()[0]!
    row.name = '业务自定义名称'; row.remark = '已核对配置'; row.enabled = false
    row.maxWeight = 18; row.countries = ['CA']
    row.shipmentMappings.find(m => m.platform === 'eBay')!.carrierCode = 'DEMO_EBAY_CARRIER'
    row.shipmentMappings.find(m => m.platform === 'eBay')!.trackingUrl = 'https://example.com/ebay-tracking'
    row.shipmentMappings.find(m => m.platform === 'Temu')!.carrierCode = 'DEMO_TEMU_CARRIER'
    const before = 复制渠道(row)
    const source = 复制渠道(row)
    source.name = '不可覆盖名称'; source.sourceName = '新来源名'
    source.enabled = true; source.remark = ''; source.maxWeight = 30; source.countries = ['US']
    source.shipmentMappings = 创建空白标发设置()
    const logs: 渠道操作记录[] = []
    同步渠道清单([row], [source], logs, 时间)
    expect(row).toMatchObject({ name: before.name, remark: before.remark, enabled: before.enabled, countries: before.countries, maxWeight: before.maxWeight, shipmentMappings: before.shipmentMappings })
    expect(row.sourceName).toBe(source.sourceName)
    expect(row.sourceId).toBe(before.sourceId)
    expect(row.syncedAt).toBe(时间)
    expect(logs[0]).toMatchObject({ channelId: row.id, action: '同步渠道', time: 时间 })
    expect(logs[0]!.before).not.toBe(logs[0]!.after)
  })

  it('新增默认停用且待配置，重复同步不重复新增，缺项不删除', () => {
    const rows = 创建渠道配置样例()
    const source = 创建渠道配置样例(true).find(r => r.sourceId === 'DEMO-SERVICE-4')!
    source.shipmentMappings[0]!.carrierCode = 'DEMO_SOURCE_CARRIER'
    source.shipmentMappings[0]!.trackingUrl = 'https://example.com/source-tracking'
    const count = rows.length
    const logs: 渠道操作记录[] = []
    同步渠道清单(rows, [source], logs, 时间)
    expect(rows).toHaveLength(count + 1)
    const added = rows.find(r => 渠道来源键(r) === 渠道来源键(source))!
    expect(added).toMatchObject({ enabled: false, countries: [], maxWeight: null, shipmentMappings: 创建空白标发设置() })
    expect(校验渠道配置(added)).toBe('')
    expect(批量渠道启停(rows, [added.id], true, logs, 时间)[0]!.result).toBe('成功')
    expect(added.enabled).toBe(true)
    added.shipmentMappings[0]!.carrierCode = 'DEMO_LOCAL_CARRIER'
    added.shipmentMappings[0]!.trackingUrl = 'https://example.com/local-tracking'
    同步渠道清单(rows, [source], logs, 时间)
    expect(rows).toHaveLength(count + 1)
    expect(added.shipmentMappings[0]!.carrierCode).toBe('DEMO_LOCAL_CARRIER')
    expect(added.shipmentMappings[0]!.trackingUrl).toBe('https://example.com/local-tracking')
    同步渠道清单(rows, [], logs, 时间)
    expect(rows).toHaveLength(count + 1)
  })

  it('查询失败保持全部旧值和成功时间', () => {
    const rows = 创建渠道配置样例()
    const before = 复制渠道(rows), logs: 渠道操作记录[] = []
    const result = 同步渠道清单(rows, 创建渠道配置样例(true), logs, 时间, true)
    expect(result.every(r => r.result === '失败')).toBe(true)
    expect(rows).toEqual(before)
    expect(logs).toHaveLength(0)
  })

  it('同批来源身份冲突整组隔离，不能先写入首条', () => {
    const rows = 创建渠道配置样例()
    const before = 复制渠道(rows), logs: 渠道操作记录[] = []
    const first = 复制渠道(rows[0]!); first.sourceName = '冲突名称甲'
    const second = 复制渠道(first); second.sourceName = '冲突名称乙'
    const result = 同步渠道清单(rows, [first, second], logs, 时间)
    expect(result.every(r => r.result === '失败')).toBe(true)
    expect(rows).toEqual(before)
    expect(logs).toHaveLength(0)
  })

  it('已有资料存在重复来源身份时不取首条覆盖', () => {
    const row = 创建渠道配置样例()[0]!
    const duplicate = 复制渠道(row); duplicate.id = 'DEMO-DUPLICATE'; duplicate.code = 'DEMO_DUPLICATE'
    const rows = [row, duplicate], before = 复制渠道(rows), logs: 渠道操作记录[] = []
    const source = 复制渠道(row); source.sourceName = '来源已更新'
    const result = 同步渠道清单(rows, [source], logs, 时间)
    expect(result[0]!.result).toBe('失败')
    expect(rows).toEqual(before)
    expect(logs).toHaveLength(0)
  })
})

describe('渠道编辑与批量启停', () => {
  it('同名渠道和同一渠道不同平台的标发设置独立，日志逐平台记录变更', () => {
    const rows = 创建渠道配置样例()
    const row = rows[0]!, other = rows.find(r => r.name === row.name && r.id !== row.id)!
    expect(渠道来源键(other)).not.toBe(渠道来源键(row))
    expect(row.shipmentMappings.every(m => m.carrierCode === '' && m.trackingUrl === '')).toBe(true)
    const before = 渠道变更摘要(row), otherBefore = 复制渠道(other)
    row.shipmentMappings.find(m => m.platform === 'eBay')!.carrierCode = 'DEMO_EBAY_CARRIER'
    row.shipmentMappings.find(m => m.platform === 'eBay')!.trackingUrl = 'https://example.com/ebay-tracking'
    expect(row.shipmentMappings.filter(m => m.platform !== 'eBay').every(m => m.carrierCode === '' && m.trackingUrl === '')).toBe(true)
    row.shipmentMappings.find(m => m.platform === 'Temu')!.carrierCode = 'DEMO_TEMU_CARRIER'
    expect(other).toEqual(otherBefore)
    const logs: 渠道操作记录[] = []
    追加渠道日志(logs, row, '编辑渠道', before, 时间, '修改两个平台的标发设置。')
    const oldValues = JSON.parse(logs[0]!.before), newValues = JSON.parse(logs[0]!.after)
    expect(oldValues['eBay 标发设置']).toBe('承运商：未配置；标发单号：使用跟踪号；查询地址：未配置')
    expect(newValues['eBay 标发设置']).toBe('承运商：DEMO_EBAY_CARRIER；标发单号：使用跟踪号；查询地址：https://example.com/ebay-tracking')
    expect(newValues['Temu 标发设置']).toBe('承运商：DEMO_TEMU_CARRIER；标发单号：使用跟踪号；查询地址：未配置')
    expect(newValues['美客多 标发设置']).toBe(oldValues['美客多 标发设置'])
    expect(newValues).not.toHaveProperty('外部代码')
  })

  it('查询地址允许留空，只接受完整 HTTP(S) URL，限制长度且不改写输入', () => {
    const row = 创建渠道配置样例()[0]!, mapping = row.shipmentMappings[0]!
    const valid = ['', 'https://example.com/tracking?id=DEMO%2F123#result', 'http://example.com/track', 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length)]
    for (const trackingUrl of valid) {
      mapping.trackingUrl = trackingUrl
      expect(校验渠道配置(row)).toBe('')
      expect(mapping.trackingUrl).toBe(trackingUrl)
    }
    for (const trackingUrl of ['javascript:alert(1)', 'ftp://example.com/track', '/track', 'example.com/track', 'https:example.com', 'https://', 'https://example.com/a b']) {
      mapping.trackingUrl = trackingUrl
      expect(校验渠道配置(row)).toContain('http 或 https URL')
    }
    mapping.trackingUrl = 'https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length)
    expect(校验渠道配置(row)).toContain('2048')
    Object.assign(mapping, { trackingUrl: null })
    expect(校验渠道配置(row)).toContain('查询地址必须为文本')
  })

  it('拒绝缺失、重复、未知平台和无效代码或单号来源，允许未配置代码', () => {
    const row = 创建渠道配置样例()[0]!
    expect(校验渠道配置(row)).toBe('')
    row.shipmentMappings.pop()
    expect(校验渠道配置(row)).toContain('完整')
    row.shipmentMappings = 创建空白标发设置()
    row.shipmentMappings[1]!.platform = 'eBay'
    expect(校验渠道配置(row)).toContain('重复')
    row.shipmentMappings = 创建空白标发设置()
    Object.assign(row.shipmentMappings[0]!, { platform: 'UNKNOWN' })
    expect(校验渠道配置(row)).toContain('不支持的平台')
    row.shipmentMappings = 创建空白标发设置()
    row.shipmentMappings[0]!.carrierCode = 'A'.repeat(129)
    expect(校验渠道配置(row)).toContain('128')
    row.shipmentMappings[0]!.carrierCode = 'A'.repeat(128)
    expect(校验渠道配置(row)).toBe('')
    Object.assign(row.shipmentMappings[0]!, { carrierCode: null })
    expect(校验渠道配置(row)).toContain('文本')
    row.shipmentMappings[0]!.carrierCode = ''
    Object.assign(row.shipmentMappings[0]!, { trackingNumberSource: 'reference_number' })
    expect(校验渠道配置(row)).toContain('仅支持使用跟踪号')
  })

  it('未配置不等于零或无限制，拒绝错误重量区间与越界面单模式', () => {
    const row = 创建渠道配置样例()[0]!
    row.minWeight = null; row.maxWeight = null; row.countries = []
    expect(校验渠道配置(row)).toBe('')
    row.minWeight = 20; row.maxWeight = 10
    expect(校验渠道配置(row)).toContain('最小重量')
    row.minWeight = null; row.maxWeight = Number.NaN
    expect(校验渠道配置(row)).toContain('最大重量')
    row.maxWeight = null; row.labelMode = '仓配分离'
    expect(校验渠道配置(row)).toContain('本期仅')
  })

  it('批量逐项返回成功、失败和跳过，重复ID不重复日志', () => {
    const rows = 创建渠道配置样例().slice(0, 3)
    rows[0]!.enabled = false
    rows[1]!.enabled = false; rows[1]!.name = ''
    rows[2]!.enabled = true
    const logs: 渠道操作记录[] = []
    const result = 批量渠道启停(rows, [rows[0]!.id, rows[0]!.id, rows[1]!.id, rows[2]!.id, 'missing'], true, logs, 时间)
    expect(result.map(r => r.result)).toEqual(['成功', '失败', '跳过', '失败'])
    expect(rows.map(r => r.enabled)).toEqual([true, false, true])
    expect(logs).toHaveLength(1)
    expect(logs[0]!.before).toContain('停用')
    expect(logs[0]!.after).toContain('启用')
    expect(批量渠道启停(rows, [rows[0]!.id], true, logs, 时间)[0]!.result).toBe('跳过')
    expect(logs).toHaveLength(1)
  })

  it('导出保留虚构标识、空值和CSV文本边界', () => {
    const row = 创建渠道配置样例()[0]!
    row.name = '=FORMULA'; row.remark = '有逗号,引号"和\n换行'; row.maxWeight = null
    row.shipmentMappings.find(m => m.platform === 'eBay')!.carrierCode = 'DEMO_EBAY_CARRIER'
    row.shipmentMappings.find(m => m.platform === 'eBay')!.trackingUrl = 'https://example.com/ebay-tracking'
    const csv = 渠道CSV([row])
    expect(csv).toContain('本地虚构评审数据')
    expect(csv).toContain("'=FORMULA")
    expect(csv).toContain('有逗号,引号""和\n换行')
    expect(csv).toContain('未配置')
    expect(csv).toContain('UTC+8')
    expect(csv.split('\r\n')[0]).toContain('"渠道代码"')
    expect(csv).toContain(row.accountId)
    expect(csv).toContain(row.warehouseId)
    for (const platform of 标发平台) expect(csv.split('\r\n')[0]).toContain(`"${platform}标发设置（待核验）"`)
    expect(csv).toContain('承运商：DEMO_EBAY_CARRIER；标发单号：使用跟踪号；查询地址：https://example.com/ebay-tracking')
    expect(csv).toContain('承运商：未配置；标发单号：使用跟踪号；查询地址：未配置')
    expect(csv).not.toMatch(/实际承运商|平台承运商|承运模式|标准代码|外部渠道代码/)
  })
})
