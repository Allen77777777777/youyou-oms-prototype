/** 独立评审统计契约。事件来自本地样例，不订阅其他业务页面或真实平台。 */
export const UNRECORDED_STAFF = '__unrecorded__'
export const UNASSOCIATED_SHOP = '__unassociated__'
export const KPI_REVIEW_AS_OF = '2026-11-06T10:00:00Z'

export const kpiMetricLabels = {
  humanMessages: '人工成功消息', repliedConversations: '人工回复会话',
  averageResponseMinutes: '平均响应时长', medianResponseMinutes: '响应时长中位数', p90ResponseMinutes: 'P90响应时长', responseSamples: '响应样本',
  cancellationHandled: '取消申请办理', returnHandled: '退货申请办理', disputeHandled: '纠纷办理',
  ticketsCompleted: '完成工单', ticketsAbandoned: '放弃工单',
  automaticMessages: '自动回复消息', incomingConversations: '来信会话', pendingReplies: '待人工回复',
  cancellationPending: '取消申请待办', returnPending: '退货申请待办', disputePending: '纠纷待办',
  cancellationOverdue: '取消申请逾期', returnOverdue: '退货申请逾期', disputeOverdue: '纠纷逾期',
} as const
export type KpiMetric = keyof typeof kpiMetricLabels
export type ResponseDurationMetric = 'averageResponseMinutes' | 'medianResponseMinutes' | 'p90ResponseMinutes'
export type KpiMetrics = Record<Exclude<KpiMetric, ResponseDurationMetric>, number> & Record<ResponseDurationMetric, number | null>
export function isResponseDurationMetric(metric: KpiMetric): metric is ResponseDurationMetric {
  return metric === 'averageResponseMinutes' || metric === 'medianResponseMinutes' || metric === 'p90ResponseMinutes'
}
export type KpiObjectType = 'conversation' | 'cancellation' | 'return' | 'dispute' | 'ticket'
export type KpiOutcome = 'success' | 'failed' | 'pending' | 'unknown'
export type KpiOwnerChange = { at: string; staffIds: string[] } | { at: string; staffId: string | null }

function membersAtChange(change?: KpiOwnerChange): (string | null)[] {
  if (!change) return [null]
  if ('staffId' in change) return [change.staffId || null]
  const members = [...new Set(change.staffIds.filter(Boolean))]
  return members.length ? members : [null]
}
/** id 为本地全局唯一会话主键，禁止直接传可能跨店重复的平台会话号；number 仅展示。 */
export interface KpiConversation { id: string; shopId: string; number: string; title: string; owners: KpiOwnerChange[] }
/** id 为本地全局唯一标准办理对象主键；接入层先按组织＋店铺＋对象类型＋平台 ID 解析，不能以裸平台 ID 代替。 */
export interface KpiWorkItem {
  id: string; shopId: string; type: 'cancellation' | 'return' | 'dispute'; number: string; title: string
  history: { id: string; at: string; state: 'seller_action' | 'waiting' | 'closed'; dueAt?: string | null; summary: string }[]
}
/** id 为本地全局唯一工单主键，包含无来源工单；number 不承担关联或去重身份。 */
export interface KpiTicket { id: string; shopId: string | null; number: string; title: string }
interface EventBase { id: string; at: string; summary?: string }
/** conversationId/workItemId/ticketId 均引用上方本地主键；messageId 与 actionId 另按所属对象范围去重。 */
export type KpiEvent =
  | (EventBase & { kind: 'incoming'; conversationId: string; messageId: string; requiresReply?: boolean })
  | (EventBase & { kind: 'message'; conversationId: string; messageId: string; source: 'human' | 'automatic'; purpose: 'reply' | 'outreach'; actorId: string | null; outcome: KpiOutcome })
  | (EventBase & { kind: 'handling'; workItemId: string; actionId: string; actorId: string | null; outcome: KpiOutcome })
  | (EventBase & { kind: 'ticket'; ticketId: string; actorId: string | null; state: 'open' | 'in_progress' | 'completed' | 'abandoned' | 'reopened' })
export interface KpiData {
  asOf: string
  /** 从该可靠时刻至 asOf 的来源采集覆盖完整；缺失时不能宣称上一期间可比。 */
  coverageStart?: string
  staff: { id: string; name: string; team?: string }[]
  shops: { id: string; name: string; site?: string }[]
  conversations: KpiConversation[]; workItems: KpiWorkItem[]; tickets: KpiTicket[]; events: KpiEvent[]
}
export interface KpiFilter { startDate: string; endDate: string; shopIds?: string[]; staffIds?: string[]; asOf?: string }
export interface KpiHistoryEntry { id: string; at: string; actor: string; action: string; result: string }
export interface KpiDetail {
  id: string; metric: KpiMetric; objectId: string; objectType: KpiObjectType; number: string; title: string
  shopId: string; shopName: string; staffId: string | null; staffName: string
  occurredAt: string; action: string; result: string; startedAt?: string; respondedAt?: string
  durationMinutes?: number; dueAt?: string; history: KpiHistoryEntry[]
}
export interface KpiRow { id: string; name: string; metrics: KpiMetrics }
export interface KpiTrendPoint { date: string; asOf: string; metrics: KpiMetrics }
export interface KpiIssue { id: string; reason: string }
export interface KpiResult {
  summary: KpiMetrics; staffRows: KpiRow[]; shopRows: KpiRow[]; trend: KpiTrendPoint[]
  details: KpiDetail[]; asOf: string; filter: KpiFilter; issues: KpiIssue[]; error: string | null
}
export interface KpiDetailScope { group: 'all' | 'staff' | 'shop'; id?: string }

export function createDefaultKpiFilter(): KpiFilter {
  return { startDate: '2026-11-01', endDate: '2026-11-06', shopIds: [], staffIds: [] }
}

/** 拒绝无偏移的来源时间，不能依运行机器时区猜测。 */
export function parseKpiTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const calendarDate = value.slice(0, 10)
  const calendarStamp = Date.parse(`${calendarDate}T00:00:00Z`)
  if (!Number.isFinite(calendarStamp) || new Date(calendarStamp).toISOString().slice(0, 10) !== calendarDate) return null
  if (Number(value.slice(11, 13)) >= 24 || Number(value.slice(14, 16)) >= 60 || Number(value.slice(17, 19)) >= 60) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dateStart(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const stamp = Date.parse(`${value}T00:00:00+08:00`)
  if (!Number.isFinite(stamp) || new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) !== value) return null
  return stamp
}

export function beijingKpiDate(value: string): string {
  const stamp = parseKpiTime(value)
  return stamp === null ? '' : new Date(stamp + 8 * 3600000).toISOString().slice(0, 10)
}

export function formatKpiDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  if (minutes < 1) return `${Math.round(minutes * 60)} 秒`
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} 分钟`
  const hours = Math.floor(rounded / 60)
  return `${hours} 小时${rounded % 60 ? ` ${rounded % 60} 分钟` : ''}`
}

function emptyMetrics(): KpiMetrics {
  return Object.fromEntries((Object.keys(kpiMetricLabels) as KpiMetric[]).map(key => [key, isResponseDurationMetric(key) ? null : 0])) as KpiMetrics
}

/** 每个指标自己的稳定统计身份去重；同对象多人参与的团队总计不是人员行相加。 */
function dedupeDetails(rows: KpiDetail[]): KpiDetail[] {
  const groups = new Map<string, KpiDetail[]>()
  for (const row of rows) {
    const group = groups.get(row.id) ?? []
    group.push(row)
    groups.set(row.id, group)
  }
  return [...groups.values()].map(group => {
    const first = group[0]!
    const history = [...new Map(group.flatMap(row => row.history).map(event => [event.id, event])).values()]
      .sort((a, b) => (parseKpiTime(a.at) ?? 0) - (parseKpiTime(b.at) ?? 0) || a.id.localeCompare(b.id))
    const people = [...new Set(group.map(row => row.staffName))]
    return { ...first, staffName: people.join('、'), history }
  }).sort((a, b) => (parseKpiTime(b.occurredAt) ?? 0) - (parseKpiTime(a.occurredAt) ?? 0) || a.id.localeCompare(b.id))
}

export function metricDetails(result: KpiResult, metric: KpiMetric, scope: KpiDetailScope = { group: 'all' }): KpiDetail[] {
  const actualMetric = isResponseDurationMetric(metric) ? 'responseSamples' : metric
  return dedupeDetails(result.details.filter(row => row.metric === actualMetric
    && (scope.group === 'all' || (scope.group === 'staff' ? row.staffId : row.shopId) === scope.id)))
}

function aggregate(rows: KpiDetail[]): KpiMetrics {
  const metrics = emptyMetrics()
  for (const key of Object.keys(kpiMetricLabels) as KpiMetric[]) {
    if (isResponseDurationMetric(key)) continue
    metrics[key] = dedupeDetails(rows.filter(row => row.metric === key)).length
  }
  const responses = dedupeDetails(rows.filter(row => row.metric === 'responseSamples'))
  const durations = responses.map(row => row.durationMinutes!).sort((a, b) => a - b)
  if (durations.length) {
    metrics.averageResponseMinutes = durations.reduce((sum, value) => sum + value, 0) / durations.length
    const middle = Math.floor(durations.length / 2)
    metrics.medianResponseMinutes = durations.length % 2 ? durations[middle]! : (durations[middle - 1]! + durations[middle]!) / 2
    // nearest-rank：按有效去重样本升序取 ceil(0.9 × n) 对应值，不平均分组 P90。
    metrics.p90ResponseMinutes = durations[Math.ceil(durations.length * .9) - 1]!
  }
  return metrics
}

export function queryKpi(data: KpiData, filter: KpiFilter): KpiResult {
  const result: KpiResult = {
    summary: emptyMetrics(), staffRows: [], shopRows: [], trend: [], details: [],
    asOf: data.asOf, filter: { ...filter, shopIds: [...filter.shopIds ?? []], staffIds: [...filter.staffIds ?? []] }, issues: [], error: null,
  }
  const start = dateStart(filter.startDate), endDay = dateStart(filter.endDate)
  const dataAsOf = parseKpiTime(data.asOf), requestedAsOf = filter.asOf ? parseKpiTime(filter.asOf) : dataAsOf
  if (start === null || endDay === null || start > endDay || dataAsOf === null || requestedAsOf === null) {
    result.error = '请选择有效的起止日期和统计截至时间'
    return result
  }
  if (data.coverageStart !== undefined) {
    const coverageStart = parseKpiTime(data.coverageStart)
    if (coverageStart === null) {
      result.error = '完整数据覆盖起点无效，暂无法统计'
      return result
    }
    if (start < coverageStart) {
      const coverageLabel = new Date(coverageStart + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
      result.error = `所选起始日期早于完整数据覆盖起点（北京时间 ${coverageLabel}），请选择已覆盖日期`
      return result
    }
  }
  const endExclusive = endDay + 86400000
  // 过去期间截至末日最后一毫秒；当前期间最多展示已取得数据的时点。
  const cutoff = Math.min(endExclusive - 1, dataAsOf, requestedAsOf)
  result.asOf = new Date(cutoff).toISOString()
  if (start > cutoff) {
    result.error = '所选期间尚无可用数据'
    return result
  }
  const inPeriod = (stamp: number) => stamp >= start && stamp < endExclusive && stamp <= cutoff
  const shopId = (id: string | null) => id ?? UNASSOCIATED_SHOP
  const shopName = (id: string | null) => id === null || id === UNASSOCIATED_SHOP ? '未关联店铺' : data.shops.find(shop => shop.id === id)?.name ?? '未记录店铺'
  const staffId = (id: string | null) => id ?? UNRECORDED_STAFF
  const staffName = (id: string | null) => id === null || id === UNRECORDED_STAFF ? '未记录' : data.staff.find(staff => staff.id === id)?.name ?? '未记录'
  const includeShop = (id: string | null) => !filter.shopIds?.length || filter.shopIds.includes(shopId(id))
  const includeStaff = (id: string | null) => !filter.staffIds?.length || filter.staffIds.includes(staffId(id))
  const conversations = new Map(data.conversations.map(item => [item.id, item]))
  const workItems = new Map(data.workItems.map(item => [item.id, item]))
  const tickets = new Map(data.tickets.map(item => [item.id, item]))
  const issue = (event: KpiEvent, reason: string) => {
    const item = event.kind === 'handling' ? workItems.get(event.workItemId) : event.kind === 'ticket' ? tickets.get(event.ticketId) : conversations.get(event.conversationId)
    if (filter.shopIds?.length && (!item || !includeShop(item.shopId))) return
    if (filter.staffIds?.length && (!('actorId' in event) || !includeStaff(event.actorId) || (event.kind === 'message' && event.source === 'automatic'))) return
    result.issues.push({ id: event.id, reason })
  }
  const events: (KpiEvent & { stamp: number })[] = []
  for (const event of data.events) {
    const stamp = parseKpiTime(event.at)
    if (stamp === null) { issue(event, '事件时间缺失或无法可靠归日，未计入统计'); continue }
    if (stamp <= cutoff) events.push({ ...event, stamp })
  }
  events.sort((a, b) => a.stamp - b.stamp || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  const openRounds = new Map<string, (typeof events)[number]>()
  const ownership = new Map(data.conversations.map(conversation => [conversation.id, {
    uncertain: conversation.owners.some(item => parseKpiTime(item.at) === null),
    history: conversation.owners.map(item => ({ ...item, stamp: parseKpiTime(item.at) }))
      .filter((item): item is KpiOwnerChange & { stamp: number } => item.stamp !== null).sort((a, b) => a.stamp - b.stamp),
  }]))
  const ownerAt = (id: string, stamp: number) => {
    const source = ownership.get(id)!
    const owners = source.history.filter(item => item.stamp <= stamp)
    return { members: membersAtChange(source.uncertain ? undefined : owners[owners.length - 1]), uncertainOwner: source.uncertain, owners }
  }
  // 在同一次有序事件扫描中，先封存下一事件前的各日快照；不重跑整段查询，也不读取日后的回复或交接。
  const dailyBacklog = new Map<string, { count: number; asOf: string }>()
  let snapshotDay = start
  const captureSnapshotsBefore = (nextStamp: number) => {
    while (snapshotDay <= cutoff) {
      const snapshotAt = Math.min(snapshotDay + 86400000 - 1, cutoff)
      if (snapshotAt >= nextStamp) break
      const date = new Date(snapshotDay + 8 * 3600000).toISOString().slice(0, 10)
      const count = [...openRounds.keys()].filter(id => ownerAt(id, snapshotAt).members.some(includeStaff)).length
      dailyBacklog.set(date, { count, asOf: new Date(snapshotAt).toISOString() })
      snapshotDay += 86400000
    }
  }
  const conversationHistory = new Map<string, KpiHistoryEntry[]>()
  const historyOf = (id: string) => conversationHistory.get(id) ?? []
  const base = (type: KpiObjectType, item: { id: string; shopId: string | null; number: string; title: string }, actor: string | null, at: string) => ({
    objectId: item.id, objectType: type, number: item.number, title: item.title,
    shopId: shopId(item.shopId), shopName: shopName(item.shopId), staffId: staffId(actor), staffName: staffName(actor), occurredAt: at,
  })
  const add = (metric: KpiMetric, key: string, row: Omit<KpiDetail, 'id' | 'metric'>) => result.details.push({ ...row, id: `${metric}:${key}`, metric })
  for (const event of events) {
    captureSnapshotsBefore(event.stamp)
    if (event.kind === 'incoming' || event.kind === 'message') {
      const conversation = conversations.get(event.conversationId)
      if (!conversation) { issue(event, '会话身份缺失，未计入统计'); continue }
      if (!includeShop(conversation.shopId)) continue
      const messageKey = `${conversation.shopId}:${conversation.id}:${event.messageId}`
      if (event.kind === 'incoming') {
        if (seen.has(`incoming:${messageKey}`)) continue
        seen.add(`incoming:${messageKey}`)
        const history: KpiHistoryEntry = { id: event.id, at: event.at, actor: '买家', action: '收到来信', result: event.summary ?? '已收到' }
        conversationHistory.set(conversation.id, [...historyOf(conversation.id), history])
        if (event.requiresReply !== false && !openRounds.has(conversation.id)) openRounds.set(conversation.id, event)
        if (inPeriod(event.stamp)) add('incomingConversations', `${conversation.shopId}:${conversation.id}`, {
          ...base('conversation', conversation, null, event.at), staffId: null, staffName: '—', action: '收到买家来信', result: '已收到', history: [history],
        })
        continue
      }
      const actor = event.source === 'automatic' ? '自动客服' : staffName(event.actorId)
      const outcomeName = { success: '成功', failed: '失败', pending: '已提交待回查', unknown: '结果待核查' }[event.outcome]
      const history: KpiHistoryEntry = { id: event.id, at: event.at, actor, action: event.source === 'automatic' ? '自动回复' : event.purpose === 'reply' ? '人工回复' : '人工主动联系', result: outcomeName }
      if (event.outcome !== 'success') {
        conversationHistory.set(conversation.id, [...historyOf(conversation.id), history])
        continue
      }
      if (seen.has(`sent:${messageKey}`)) continue
      seen.add(`sent:${messageKey}`)
      conversationHistory.set(conversation.id, [...historyOf(conversation.id), history])
      if (event.source === 'automatic') {
        if (event.purpose === 'reply' && inPeriod(event.stamp)) add('automaticMessages', messageKey, {
          ...base('conversation', conversation, null, event.at), staffId: null, staffName: '自动客服', action: '自动回复', result: '成功', history: [history],
        })
        continue
      }
      const row = { ...base('conversation', conversation, event.actorId, event.at), action: history.action, result: '成功', history: [history] }
      if (inPeriod(event.stamp) && includeStaff(event.actorId)) {
        add('humanMessages', messageKey, row)
        if (event.purpose === 'reply') add('repliedConversations', `${conversation.shopId}:${conversation.id}`, row)
      }
      const incoming = openRounds.get(conversation.id)
      // 所有人工成功回复都结束对应等待轮次；筛选另一个客服不能把已完成轮次重开。
      if (event.purpose === 'reply' && incoming) {
        if (inPeriod(event.stamp) && includeStaff(event.actorId)) add('responseSamples', `${conversation.shopId}:${conversation.id}:${incoming.id}`, {
          ...row, startedAt: incoming.at, respondedAt: event.at, durationMinutes: (event.stamp - incoming.stamp) / 60000,
          history: historyOf(conversation.id).filter(item => (parseKpiTime(item.at) ?? -Infinity) >= incoming.stamp),
        })
        openRounds.delete(conversation.id)
      }
      continue
    }
    if (event.kind === 'handling') {
      const item = workItems.get(event.workItemId)
      if (!item) { issue(event, '办理对象身份缺失，未计入统计'); continue }
      const key = `${item.shopId}:${item.type}:${item.id}:${event.actionId}`
      if (!includeShop(item.shopId) || event.outcome !== 'success' || seen.has(`handling:${key}`)) continue
      seen.add(`handling:${key}`)
      if (!inPeriod(event.stamp) || !includeStaff(event.actorId)) continue
      const metric = { cancellation: 'cancellationHandled', return: 'returnHandled', dispute: 'disputeHandled' }[item.type] as KpiMetric
      add(metric, `${item.shopId}:${item.type}:${item.id}`, {
        ...base(item.type, item, event.actorId, event.at), action: event.summary ?? '办理已确认', result: '已确认办理',
        history: [{ id: event.id, at: event.at, actor: staffName(event.actorId), action: event.summary ?? '办理已确认', result: '已确认；不代表结案或资金成功' }],
      })
      continue
    }
    const ticket = tickets.get(event.ticketId)
    if (!ticket) { issue(event, '工单身份缺失，未计入统计'); continue }
    if (!['completed', 'abandoned'].includes(event.state)) continue
    const metric = event.state === 'completed' ? 'ticketsCompleted' : 'ticketsAbandoned'
    // 首次对应有效事件唯一归日。跨月重开、换人后再次完成，不新增绩效数量。
    const ticketResultKey = `${metric}:${ticket.id}`
    if (seen.has(ticketResultKey)) continue
    seen.add(ticketResultKey)
    if (!includeShop(ticket.shopId) || !inPeriod(event.stamp) || !includeStaff(event.actorId)) continue
    add(metric, ticket.id, {
      ...base('ticket', ticket, event.actorId, event.at), action: event.state === 'completed' ? '完成工单' : '放弃工单', result: event.summary ?? (event.state === 'completed' ? '已完成' : '已放弃'),
      history: events.filter(item => item.kind === 'ticket' && item.ticketId === ticket.id).map(item => {
        const ticketEvent = item as Extract<KpiEvent, { kind: 'ticket' }>
        return { id: item.id, at: item.at, actor: staffName(ticketEvent.actorId), action: ({ open: '创建工单', in_progress: '记录跟进', completed: '完成工单', abandoned: '放弃工单', reopened: '重新打开' } as const)[ticketEvent.state], result: item.summary ?? '已记录' }
      }),
    })
  }
  captureSnapshotsBefore(cutoff + 1)
  // 积压读取截至时点仍未回复的完整历史，不能用期间开始时间截掉跨月来信。
  for (const [id, incoming] of openRounds) {
    const conversation = conversations.get(id)!
    // 无时刻的交接无法判断发生在截至点之前还是之后，不能回落旧负责人。
    const { members, uncertainOwner, owners } = ownerAt(id, cutoff)
    const selectedMembers = members.filter(includeStaff)
    if (!selectedMembers.length) continue
    if (uncertainOwner) result.issues.push({ id: `owner-history:${id}`, reason: `${conversation.number} 的责任历史时间无效，无法判断截至时点负责人；待回复保留，责任归入未记录` })
    const history = [...historyOf(id), ...owners.map((item, index) => ({
      id: `owner:${id}:${index}`, at: item.at, actor: '系统', action: '客服分配',
      result: `处理人：${membersAtChange(item).map(staffName).join('、')}`,
    }))]
    for (const member of selectedMembers) {
      add('pendingReplies', `${conversation.shopId}:${conversation.id}`, {
        ...base('conversation', conversation, member, incoming.at), action: '等待人工回复', result: '待回复', startedAt: incoming.at,
        durationMinutes: (cutoff - incoming.stamp) / 60000, history,
      })
    }
  }
  for (const item of data.workItems) {
    if (!includeShop(item.shopId)) continue
    // 无效状态时刻可能在截止点前改变应办方或终态。隔离该对象的快照，可靠办理动作仍按事件统计。
    if (item.history.some(event => parseKpiTime(event.at) === null)) {
      if (!filter.staffIds?.length) result.issues.push({ id: `work-history:${item.id}`, reason: `${item.number} 的平台状态历史时间无效，无法判断截至时点待办与逾期；该对象未纳入快照统计` })
      continue
    }
    const history = item.history.map(event => ({ ...event, stamp: parseKpiTime(event.at) }))
      .filter((event): event is KpiWorkItem['history'][number] & { stamp: number } => event.stamp !== null && event.stamp <= cutoff).sort((a, b) => a.stamp - b.stamp)
    const current = history[history.length - 1]
    if (!current || current.state !== 'seller_action') continue
    const due = parseKpiTime(current.dueAt)
    const row = {
      ...base(item.type, item, null, current.at), staffId: null, staffName: '店铺待办', action: '卖家待办理', result: '待办理',
      dueAt: due === null ? undefined : current.dueAt ?? undefined,
      history: history.map(event => ({ id: event.id, at: event.at, actor: '平台', action: event.summary, result: ({ seller_action: '待卖家办理', waiting: '等待买家或平台', closed: '已关闭' } as const)[event.state] })),
    }
    const key = `${item.shopId}:${item.type}:${item.id}`
    add(({ cancellation: 'cancellationPending', return: 'returnPending', dispute: 'disputePending' } as const)[item.type], key, row)
    if (due !== null && due < cutoff) add(({ cancellation: 'cancellationOverdue', return: 'returnOverdue', dispute: 'disputeOverdue' } as const)[item.type], key, { ...row, result: '已超过平台明确期限' })
  }
  result.summary = aggregate(result.details)
  const visibleStaff = new Set([...data.staff.map(item => item.id), ...result.details.flatMap(item => item.staffId === null ? [] : [item.staffId])])
  result.staffRows = [...visibleStaff].filter(includeStaff).map(id => ({ id, name: staffName(id), metrics: aggregate(result.details.filter(row => row.staffId === id)) }))
  const visibleShops = new Set([...data.shops.map(item => item.id), ...result.details.map(item => item.shopId)])
  result.shopRows = [...visibleShops].filter(includeShop).map(id => ({ id, name: shopName(id), metrics: aggregate(result.details.filter(row => row.shopId === id)) }))
  const snapshotMetrics: KpiMetric[] = ['pendingReplies', 'cancellationPending', 'returnPending', 'disputePending', 'cancellationOverdue', 'returnOverdue', 'disputeOverdue']
  for (let day = start; day <= cutoff; day += 86400000) {
    const date = new Date(day + 8 * 3600000).toISOString().slice(0, 10)
    const metrics = aggregate(result.details.filter(row => !snapshotMetrics.includes(row.metric) && beijingKpiDate(row.occurredAt) === date))
    const snapshot = dailyBacklog.get(date)!
    metrics.pendingReplies = snapshot.count
    result.trend.push({ date, asOf: snapshot.asOf, metrics })
  }
  return result
}
