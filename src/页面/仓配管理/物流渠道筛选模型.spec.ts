import { describe, expect, it } from 'vitest'
import { 创建渠道配置样例 } from './物流渠道配置'
import { 默认渠道筛选, 校验渠道筛选, 查询物流渠道, 读取渠道同步范围 } from './物流渠道筛选模型'

describe('物流渠道公共筛选与同步范围', () => {
  const rows = 创建渠道配置样例(true)
  it('分类同字段OR、字段间AND，指定内部代码精确，不搜索外部渠道代码', () => {
    const first = rows[0]!, secondAccount = rows.find(row => row.provider === first.provider && row.accountId !== first.accountId)!
    const selected = 查询物流渠道(rows, { ...默认渠道筛选(), accountId: [first.accountId, secondAccount.accountId], state: ['启用', '停用'], country: ['US', 'unknown'] }, { provider: first.provider })
    expect(selected).toHaveLength(16)
    expect(查询物流渠道([{ ...first, providerCode: 'SECRET-EXTERNAL' }], { ...默认渠道筛选(), keywordType: 'code', searchMatch: 'exact', keyword: 'SECRET-EXTERNAL' }, {})).toEqual([])
    expect(查询物流渠道(rows, { ...默认渠道筛选(), keywordType: 'code', searchMatch: 'exact', keyword: `${first.code}\n${first.code}` }, {})).toEqual([first])
  })
  it('导航及已应用账号数组固定同步范围，即使其他筛选无结果仍同步两账号', () => {
    const first = rows[0]!, accounts = [...new Set(rows.filter(row => row.provider === first.provider).map(row => row.accountId))]
    const navigation = { provider: first.provider, warehouseId: first.warehouseId }
    const filters = { ...默认渠道筛选(), accountId: accounts, keyword: '不会命中', state: ['停用'], country: ['GB'], dates: ['2026-10-09 00:00:00', '2026-10-09 23:59:59'] }
    expect(查询物流渠道(rows, filters, navigation)).toEqual([])
    const incoming = 读取渠道同步范围(rows, navigation, filters.accountId)
    expect(incoming).toHaveLength(8)
    expect(new Set(incoming.map(row => row.accountId)).size).toBe(2)
    expect(incoming.every(row => row.warehouseId === first.warehouseId && row.provider === first.provider)).toBe(true)
  })
  it('时间按已明确UTC+8的本地墙钟含整秒，缺失不命中且非法/超量不应用', () => {
    const first = rows[0]!, records = [{ ...first, updatedAt: '2026-09-28 09:30:00' }, { ...first, id: 'later', updatedAt: '2026-09-28 09:30:01' }, { ...first, id: 'missing', updatedAt: '' }]
    expect(查询物流渠道(records, { ...默认渠道筛选(), dates: ['2026-09-28 09:30:00', '2026-09-28 09:30:00'] }, {}).map(row => row.id)).toEqual([first.id])
    expect(校验渠道筛选({ ...默认渠道筛选(), dates: ['2026-10-10 00:00:00', '2026-10-09 00:00:00'] })).not.toBe('')
    expect(校验渠道筛选({ ...默认渠道筛选(), searchMatch: 'exact', keyword: Array.from({ length: 1001 }, (_, i) => `渠道 ${i}`).join('\n') })).not.toBe('')
  })
})
