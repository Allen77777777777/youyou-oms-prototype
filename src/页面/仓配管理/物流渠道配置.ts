import { 仓储服务商, type 物流渠道 } from './仓配模型'

export const 标发平台 = ['eBay', 'Temu', '美客多', 'Coupang', 'OZON', 'TikTok Shop', '乐天'] as const
export interface 渠道标发设置 { platform: typeof 标发平台[number]; carrierCode: string; trackingNumberSource: 'tracking_number'; trackingUrl: string }
export interface 渠道配置 extends 物流渠道 {
  providerId: string; accountId: string; warehouseId: string; sourceId: string; sourceName: string
  remark: string
  shipmentMappings: 渠道标发设置[]
  minWeight: number | null; maxWeight: number | null; maxLength: number | null; maxWidth: number | null; maxHeight: number | null
  syncedAt: string
}
export interface 渠道操作记录 { channelId: string; code: string; action: string; time: string; operator: string; detail: string; before: string; after: string }
export interface 渠道处理结果 { id: string; name: string; code: string; result: '成功' | '失败' | '跳过'; detail: string }
export const 渠道国家 = [{ code: 'US', name: '美国 US' }, { code: 'CA', name: '加拿大 CA' }, { code: 'GB', name: '英国 GB' }, { code: 'DE', name: '德国 DE' }, { code: 'FR', name: '法国 FR' }]
export function 复制渠道<T>(row: T): T { return JSON.parse(JSON.stringify(row)) as T }
export function 渠道来源键(row: Pick<渠道配置, 'providerId' | 'accountId' | 'warehouseId' | 'sourceId'>) { return JSON.stringify([row.providerId, row.accountId, row.warehouseId, row.sourceId]) }
export function 创建空白标发设置(): 渠道标发设置[] {
  return 标发平台.map(platform => ({ platform, carrierCode: '', trackingNumberSource: 'tracking_number', trackingUrl: '' }))
}
export function 标发设置文本(mapping?: 渠道标发设置): string {
  return `承运商：${mapping?.carrierCode.trim() || '未配置'}；标发单号：使用跟踪号；查询地址：${mapping?.trackingUrl.trim() || '未配置'}`
}
export function 校验渠道标发设置(mappings: 渠道标发设置[]): string {
  if (!Array.isArray(mappings) || mappings.length !== 标发平台.length) return '请保留完整的七个平台标发设置'
  const platforms = new Set<string>()
  for (const mapping of mappings) {
    if (!mapping || !标发平台.includes(mapping.platform)) return '标发设置包含不支持的平台'
    if (platforms.has(mapping.platform)) return '同一渠道的平台标发设置不能重复'
    platforms.add(mapping.platform)
    if (typeof mapping.carrierCode !== 'string') return `${mapping.platform} 承运商代码必须为文本`
    if (mapping.carrierCode.trim().length > 128) return `${mapping.platform} 承运商代码最多 128 个字符`
    if (mapping.trackingNumberSource !== 'tracking_number') return `${mapping.platform} 标发单号仅支持使用跟踪号`
    if (typeof mapping.trackingUrl !== 'string') return `${mapping.platform} 查询地址必须为文本`
    const trackingUrl = mapping.trackingUrl.trim()
    if (trackingUrl.length > 2048) return `${mapping.platform} 查询地址最多 2048 个字符`
    if (trackingUrl) {
      try {
        const url = new URL(trackingUrl)
        if (!/^https?:\/\/\S+$/i.test(trackingUrl) || !['http:', 'https:'].includes(url.protocol)) return `${mapping.platform} 查询地址须为有效的 http 或 https URL`
      } catch {
        return `${mapping.platform} 查询地址须为有效的 http 或 https URL`
      }
    }
  }
  return ''
}

export function 创建渠道配置样例(includeNew = false): 渠道配置[] {
  return 仓储服务商.flatMap((provider, p) => [0, 1].flatMap(a => [0, 1].flatMap(w => (includeNew ? [0, 1, 2, 3] : [0, 1, 2]).map(c => {
    const suffix = `${p + 1}${a + 1}${w + 1}${c + 1}`
    const sourceId = `DEMO-SERVICE-${c + 1}`
    return {
      id: `DEMO-CHANNEL-${suffix}`, code: `DEMO_CH_${suffix}`, name: ['标准配送', '经济配送', '优选配送', '特快配送'][c]!,
      provider, providerId: `DEMO-PROVIDER-${p + 1}`, account: `演示账号 ${String(a + 1).padStart(2, '0')}`, accountId: `DEMO-ACCOUNT-${p + 1}-${a + 1}`,
      warehouse: w ? '美东演示仓' : '美西演示仓', warehouseId: `DEMO-WAREHOUSE-${p + 1}-${w + 1}`,
      sourceId, sourceName: ['标准配送', '经济配送', '优选配送', '特快配送'][c]!,
      countries: c === 1 ? [] : ['US', ...(c === 2 ? ['CA'] : [])], enabled: c !== 2 && p !== 4,
      labelMode: '仓库回传', updatedAt: '2026-09-28 09:30:00', syncedAt: '2026-09-28 09:00:00',
      remark: '', shipmentMappings: 创建空白标发设置(),
      minWeight: c === 1 ? null : 0, maxWeight: c === 1 ? null : 30, maxLength: null, maxWidth: null, maxHeight: null,
    }
  }))))
}

export function 校验渠道配置(row: 渠道配置): string {
  if (!row.name.trim()) return '请填写渠道名称'
  if (row.name.trim().length > 60) return '渠道名称最多 60 个字符'
  if (row.remark.length > 500) return '备注最多 500 个字符'
  for (const [label, value] of [['最小重量', row.minWeight], ['最大重量', row.maxWeight], ['最长边', row.maxLength], ['次长边', row.maxWidth], ['最短边', row.maxHeight]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return `${label}必须为非负有效数字`
  }
  if (row.minWeight !== null && row.maxWeight !== null && row.minWeight > row.maxWeight) return '最小重量不能大于最大重量'
  if (row.labelMode !== '仓库回传') return '本期仅开放仓配一体，由仓库提供面单'
  return 校验渠道标发设置(row.shipmentMappings)
}

export function 渠道变更摘要(row: 渠道配置): string {
  const 标发设置 = Object.fromEntries(标发平台.map(platform => [`${platform} 标发设置`, 标发设置文本(row.shipmentMappings.find(mapping => mapping.platform === platform))]))
  return JSON.stringify({ 名称: row.name, 备注: row.remark, 状态: row.enabled ? '启用' : '停用', 目的国家: row.countries, 重量kg: [row.minWeight, row.maxWeight], 尺寸cm: [row.maxLength, row.maxWidth, row.maxHeight], 来源名称: row.sourceName, ...标发设置 })
}
export function 追加渠道日志(logs: 渠道操作记录[], row: 渠道配置, action: string, before: string, time: string, detail: string) {
  logs.unshift({ channelId: row.id, code: row.code, action, time, operator: '演示操作员', detail, before, after: 渠道变更摘要(row) })
}
export function 批量渠道启停(rows: 渠道配置[], ids: string[], enabled: boolean, logs: 渠道操作记录[], time: string): 渠道处理结果[] {
  return [...new Set(ids)].map(id => {
    const row = rows.find(r => r.id === id)
    if (!row) return { id, name: '记录已不存在', code: '', result: '失败', detail: '请刷新列表后重试' }
    if (row.enabled === enabled) return { id, name: row.name, code: row.code, result: '跳过', detail: `已为${enabled ? '启用' : '停用'}，无需重复操作` }
    const error = enabled ? 校验渠道配置(row) : ''
    if (error) return { id, name: row.name, code: row.code, result: '失败', detail: error }
    const before = 渠道变更摘要(row)
    row.enabled = enabled; row.updatedAt = time
    追加渠道日志(logs, row, enabled ? '启用渠道' : '停用渠道', before, time, '仅修改本地业务开关；不改变已生成履约快照或在途订单。')
    return { id, name: row.name, code: row.code, result: '成功', detail: `已${enabled ? '启用' : '停用'}；外部可用性仍待核验` }
  })
}
export function 同步渠道清单(rows: 渠道配置[], incoming: 渠道配置[], logs: 渠道操作记录[], time: string, failed = false): 渠道处理结果[] {
  if (failed) return incoming.map(r => ({ id: r.id, name: r.name, code: r.code, result: '失败', detail: '模拟连接超时；保留旧资料与上次成功同步时间' }))
  const incomingCounts = new Map<string, number>(), existingCounts = new Map<string, number>()
  incoming.forEach(row => { const key = 渠道来源键(row); incomingCounts.set(key, (incomingCounts.get(key) || 0) + 1) })
  rows.forEach(row => { const key = 渠道来源键(row); existingCounts.set(key, (existingCounts.get(key) || 0) + 1) })
  return incoming.map(source => {
    if ([source.providerId, source.accountId, source.warehouseId, source.sourceId].some(value => typeof value !== 'string' || !value.trim())) return { id: source.id, name: source.name, code: source.code, result: '失败', detail: '来源身份缺失，待核查，未覆盖已有资料' }
    const key = 渠道来源键(source)
    if ((incomingCounts.get(key) || 0) > 1 || (existingCounts.get(key) || 0) > 1) return { id: source.id, name: source.name, code: source.code, result: '失败', detail: '来源身份重复冲突，整组待核查，未覆盖已有资料' }
    const existing = rows.find(r => 渠道来源键(r) === key)
    // 已映射来源契约：undefined 表示未返回，null 表示适配层已核实无值或明确清空。
    // 该可空属性对应后台 external_channel_code，不进入页面、搜索、业务日志或导出。
    const providerCode = source.providerCode === undefined ? existing?.providerCode ?? null : source.providerCode
    if (existing) {
      const before = 渠道变更摘要(existing)
      const changed = existing.sourceName !== source.sourceName || (existing.providerCode ?? null) !== providerCode
      existing.providerCode = providerCode
      existing.sourceName = source.sourceName; existing.syncedAt = time
      if (changed) existing.updatedAt = time
      追加渠道日志(logs, existing, '同步渠道', before, time, changed ? '更新来源资料；保留业务配置。' : '来源记录无变化；更新最后成功同步时间。')
      return { id: existing.id, name: existing.name, code: existing.code, result: '成功', detail: changed ? '已更新来源资料，保留管理员配置' : '已匹配现有记录，无新增' }
    }
    const added = 复制渠道(source)
    added.providerCode = providerCode
    added.shipmentMappings = 创建空白标发设置()
    added.enabled = false; added.countries = []; added.minWeight = null; added.maxWeight = null; added.maxLength = null; added.maxWidth = null; added.maxHeight = null
    added.updatedAt = time; added.syncedAt = time; rows.push(added)
    追加渠道日志(logs, added, '同步新增', '无记录', time, '来源清单新增渠道，默认停用；目的国家及重量、尺寸限制待核验，平台标发设置为空。')
    return { id: added.id, name: added.name, code: added.code, result: '成功', detail: '新增渠道，默认停用，待完善配置' }
  })
}
export function 渠道CSV(rows: 渠道配置[]) {
  const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
  const headers = ['数据性质', '渠道名称', '渠道代码', '服务商', '账号', '账号ID', '仓库', '仓库ID', '目的国家', '最小重量kg', '最大重量kg', '最长边cm', '次长边cm', '最短边cm', '面单模式', '状态', ...标发平台.map(platform => `${platform}标发设置（待核验）`), '备注', '更新时间（UTC+8）']
  return '\uFEFF' + [headers, ...rows.map(r => ['本地虚构评审数据', r.name, r.code, r.provider, r.account, r.accountId, r.warehouse, r.warehouseId, r.countries.join(' / ') || '未配置', r.minWeight ?? '未配置', r.maxWeight ?? '未配置', r.maxLength ?? '未配置', r.maxWidth ?? '未配置', r.maxHeight ?? '未配置', '仓配一体 / 仓库提供', r.enabled ? '启用' : '停用', ...标发平台.map(platform => 标发设置文本(r.shipmentMappings.find(mapping => mapping.platform === platform))), r.remark, r.updatedAt])].map(line => line.map(cell).join(',')).join('\r\n')
}
