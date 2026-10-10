import type { 订单处理状态 } from '../全渠道订单/类型'

/** 只解析自带时区的来源时刻；不依赖浏览器或服务器的本地时区。 */
export function 解析来源时刻(来源?: string): number | undefined {
  const 文本 = 来源?.trim()
  if (!文本 || 文本 === '—') return undefined
  const 旧格式 = 文本.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))? UTC(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/i)
  const 标准格式 = 文本.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/i)
  const 匹配 = 旧格式 || 标准格式
  if (!匹配) return undefined
  const [年, 月, 日, 时, 分, 秒] = 匹配.slice(1, 7).map(值 => Number(值 ?? 0))
  const 毫秒 = 标准格式 ? Number((标准格式[7] || '').padEnd(3, '0').slice(0, 3)) : 0
  if (月! < 1 || 月! > 12 || 日! < 1 || 日! > 31 || 时! > 23 || 分! > 59 || 秒! > 59) return undefined
  // setUTCFullYear 避免 Date.UTC 对 0～99 年的隐式 1900 年偏移。
  const 墙钟 = new Date(0)
  墙钟.setUTCFullYear(年!, 月! - 1, 日!)
  墙钟.setUTCHours(时!, 分!, 秒!, 毫秒)
  if (墙钟.getUTCFullYear() !== 年 || 墙钟.getUTCMonth() !== 月! - 1 || 墙钟.getUTCDate() !== 日) return undefined
  let 偏移分 = 0
  if (旧格式?.[7]) {
    const 偏移时 = Number(旧格式[8]), 偏移分钟 = Number(旧格式[9] || 0)
    if (偏移时 > 14 || 偏移分钟 > 59 || (偏移时 === 14 && 偏移分钟 !== 0)) return undefined
    偏移分 = (旧格式[7] === '+' ? 1 : -1) * (偏移时 * 60 + 偏移分钟)
  } else if (标准格式 && 标准格式[8]!.toUpperCase() !== 'Z') {
    const 时区 = 标准格式[8]!
    // RFC 3339 的 -00:00 表示来源本地偏移未知，不能当成 UTC。
    if (时区 === '-00:00') return undefined
    const 偏移时 = Number(时区.slice(1, 3)), 偏移分钟 = Number(时区.slice(4, 6))
    if (偏移时 > 14 || 偏移分钟 > 59 || (偏移时 === 14 && 偏移分钟 !== 0)) return undefined
    偏移分 = (时区[0] === '+' ? 1 : -1) * (偏移时 * 60 + 偏移分钟)
  }
  return 墙钟.getTime() - 偏移分 * 60_000
}

const 北京时间格式 = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** 订单处理固定按北京时间显示完整年月日及秒，原字段与其他页面格式不变。 */
export function 格式化北京时间(来源?: string): string {
  if (!来源?.trim() || 来源.trim() === '—') return '—'
  const 时刻 = 解析来源时刻(来源)
  if (时刻 === undefined) return '时间待核实'
  const 部分 = 北京时间格式.formatToParts(new Date(时刻))
  const 取 = (类型: Intl.DateTimeFormatPartTypes) => 部分.find(项 => 项.type === 类型)?.value || ''
  return `${取('year').padStart(4, '0')}-${取('month')}-${取('day')} ${取('hour')}:${取('minute')}:${取('second')}`
}

export interface 发货时效展示 {
  kind: 'remaining' | 'overdue' | 'missing' | 'invalid' | 'complete'
  text: string
}

/** 时效仅为显示投影，不改变处理状态；已发货及不发货终态停止倒计时。 */
export function 计算剩余发货时间(截止: string | undefined, 阶段: 订单处理状态, 当前时刻: number): 发货时效展示 {
  if (阶段 === '已发货') return { kind: 'complete', text: '已发货' }
  if (阶段 === '不发货') return { kind: 'complete', text: '无需发货' }
  if (!截止?.trim() || 截止.trim() === '—') return { kind: 'missing', text: '—' }
  const 截止时刻 = 解析来源时刻(截止)
  if (截止时刻 === undefined || !Number.isFinite(当前时刻)) return { kind: 'invalid', text: '时间待核实' }
  if (截止时刻 <= 当前时刻) return { kind: 'overdue', text: '已超时' }
  // 向上取整，截止前不足一秒仍展示剩余一秒，不能提前变成超时。
  const 秒数 = Math.ceil((截止时刻 - 当前时刻) / 1_000)
  const 天 = Math.floor(秒数 / 86_400)
  const 两位 = (值: number) => String(值).padStart(2, '0')
  const 时间 = `${两位(Math.floor(秒数 % 86_400 / 3_600))}:${两位(Math.floor(秒数 % 3_600 / 60))}:${两位(秒数 % 60)}`
  return { kind: 'remaining', text: `${天 ? `${天}天 ` : ''}${时间}` }
}
