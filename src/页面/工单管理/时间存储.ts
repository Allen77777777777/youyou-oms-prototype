import { 解析来源时刻 } from '../订单处理/时间展示工具'
import type { Ticket, TicketNotification } from './会话'

/** 工单视图及日期输入使用明确的北京墙钟；本模块的持久化 DTO 只存 UTC。 */
export const ticketTimeEncoding = 'utc-v1' as const
export const ticketUnknownTime = '时间待核实'
interface TimeSession { items: Ticket[]; notifications?: TicketNotification[]; timeEncoding?: string }

/** 仅供本模块已知北京时间的视图／旧本地资料，不用于解释无时区的外部接口数据。 */
export function ticketViewTimeToUtc(value: string): string {
  if (!value) return value
  const wall = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2})(\.\d{1,3})?)?$/)
  const source = wall ? `${wall[1]}T${wall[2]}:${wall[3] || '00'}${wall[4] || ''}+08:00` : value
  const instant = 解析来源时刻(source)
  if (instant === undefined) throw new Error('工单时间无效，请核对后重试')
  return new Date(instant).toISOString()
}

/** UTC／明确偏移回读为北京视图；不按机器时区解析，无偏移的外部时间一律拒绝。 */
export function utcToTicketViewTime(value: string): string {
  if (!value) return value
  const instant = 解析来源时刻(value)
  if (instant === undefined) throw new Error('工单来源时间缺少有效时区')
  const beijing = new Date(instant + 8 * 3_600_000).toISOString().replace('T', ' ').replace(/Z$/, '')
  // 既有原型按分钟输入和显示；若取得更高精度，保留秒／毫秒，往返不截断事实。
  return beijing.endsWith(':00.000') ? beijing.slice(0, 16) : beijing.endsWith('.000') ? beijing.slice(0, 19) : beijing
}

/** 只允许已投影的北京墙钟参与页面预约判断；UTC 原值及待核实占位不能参与比较。 */
export function isTicketViewTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) return false
  try { ticketViewTimeToUtc(value); return true } catch { return false }
}

function mapSessionTimes<T extends TimeSession>(session: T, convert: (value: string) => string): T {
  return {
    ...session,
    items: session.items.map(item => ({
      ...item,
      nextAt: convert(item.nextAt), dueAt: convert(item.dueAt),
      createdAt: convert(item.createdAt), updatedAt: convert(item.updatedAt),
      ...(item.closedAt !== undefined ? { closedAt: convert(item.closedAt) } : {}),
      logs: (item.logs || []).map(log => ({ ...log, time: convert(log.time) })),
    })),
    notifications: (session.notifications || []).map(item => ({
      ...item, time: convert(item.time), ...(item.readAt !== undefined ? { readAt: convert(item.readAt) } : {}),
    })),
  }
}

export function serializeTicketTimes<T extends TimeSession>(session: T): T {
  return { ...mapSessionTimes(session, ticketViewTimeToUtc), timeEncoding: ticketTimeEncoding }
}

export function restoreTicketTimes<T extends TimeSession>(session: T): T & { timeRestoreIssue?: string } {
  // 只有本模块旧 sessionStorage 的历史墙钟已明确为北京，可以原样作为视图恢复。
  // 新契约必须提供 UTC/明确偏移，不能将接口无时区字符串当北京或 UTC 猜测。
  if (session.timeEncoding === undefined) return session
  let issue = session.timeEncoding !== ticketTimeEncoding ? '工单时间存储版本待核实，原记录已保留' : ''
  const view = mapSessionTimes(session, value => {
    try { return utcToTicketViewTime(value) }
    catch {
      issue ||= '工单时间资料待核实，原记录已保留'
      return ticketUnknownTime
    }
  })
  // 部分来源异常不能让其余 UTC 原值直接上屏；原 DTO 仍在存储中，调用方据此阻断写入。
  return issue ? { ...view, timeRestoreIssue: issue } : view
}
