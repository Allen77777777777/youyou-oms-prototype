export const 仓库状态 = ['下单中', '下单失败', '待出库', '出库异常', '已出库', '取消中', '已取消'] as const
export const 物流状态 = ['待下单', '下单中', '下单成功', '下单失败', '已作废'] as const
export const 仓储服务商 = ['万邑通', '谷仓', '4PX', '西邮', '出口易']
export type 作业类型 = '仓库' | '物流'
export type 作业动作 = '查询结果' | '重新提交' | '提交下单'
export interface 调用记录 { id: string; time: string; action: string; result: string; reason: string }
export interface 历史记录 { time: string; title: string; detail: string }
export interface 仓配单据 {
  id: string; kind: 作业类型; no: string; fulfillment: string; order: string; provider: string
  warehouse: string; account: string; channel: string; channelCode: string; platform: string; labelMode: string
  status: string; externalNo: string; tracking: string; createdAt: string; updatedAt: string
  planned: number; shipped: number; sku: string; goods: string; country: string
  reason: string; reasonCode: string; awaitingCheck: boolean; blocker: string
  history: 历史记录[]; attempts: 调用记录[]
}
export function 取得操作拦截(单据: 仓配单据, 动作: 作业动作): string {
  if (动作 === '查询结果') {
    if (['待下单', '已作废', '已取消'].includes(单据.status)) return '当前没有待核查的有效外部请求'
    return ''
  }
  if (单据.awaitingCheck) return '外部结果待核查，先查询或对账，禁止直接重提'
  if (单据.blocker) return 单据.blocker
  if (动作 === '提交下单') return 单据.kind === '物流' && 单据.status === '待下单' ? '' : '只有待下单的物流单可以提交'
  if (单据.status !== '下单失败') return '只允许处理已明确失败的原业务单据'
  return ''
}
export function 演示时间(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
}
export function 执行样例动作(单据: 仓配单据, 动作: 作业动作): { success: boolean; reason: string } {
  const 拦截 = 取得操作拦截(单据, 动作)
  if (拦截) return { success: false, reason: 拦截 }
  const 前态 = 单据.status
  const 时间 = 演示时间()
  let 结果 = ''
  if (动作 === '查询结果') {
    if (单据.awaitingCheck) {
      // 本地回放固定“明确未受理”样例；不由用户手工选择或篡改外部结果。
      if (单据.status === '取消中') {
        结果 = '本地样例：仓库仍未返回撤单结论，保留取消中并继续核查'
      } else {
        单据.status = '下单失败'; 单据.awaitingCheck = false
        单据.reasonCode = 'DEMO_CONFIRMED_NOT_ACCEPTED'
        单据.reason = '本地查询样例确认原请求未受理，可按门禁重新提交'
        结果 = 单据.reason
      }
    } else 结果 = '本地查询样例与当前状态一致，未产生新的出库或运单事实'
  } else if (动作 === '重新提交') {
    单据.status = 单据.kind === '物流' ? '待下单' : '下单中'
    单据.reason = ''; 单据.reasonCode = ''
    结果 = 单据.kind === '物流' ? '原物流单回到待下单，保留业务编号和历史记录' : '原出库单重新提交演示，等待仓库明确受理'
  } else {
    单据.status = '下单中'; 单据.reason = ''; 单据.reasonCode = ''
    结果 = '本地样例已受理下单任务，等待物流服务商明确结果'
  }
  单据.updatedAt = 时间
  单据.history.unshift({ time: 时间, title: `演示操作 · ${动作}`, detail: `${前态} → ${单据.status}；${结果}；操作者：演示操作员` })
  单据.attempts.unshift({ id: `DEMO-ATT-${单据.id}-${单据.attempts.length + 1}`, time: 时间, action: 动作, result: 单据.awaitingCheck ? '失败' : '成功', reason: 单据.awaitingCheck ? '外部结果待核查（本地样例）' : 结果 })
  return { success: true, reason: 结果 }
}
export function 创建仓配样例(kind: 作业类型): 仓配单据[] {
  const 状态集 = kind === '仓库' ? [...仓库状态, '待出库', '下单中', '已出库', '待出库', '出库异常', '下单失败', '待出库'] : [...物流状态, '下单失败', '待下单', '下单成功', '下单失败']
  return 状态集.map((status, i) => {
    const suffix = String(i + 1).padStart(4, '0')
    const provider = 仓储服务商[i % 仓储服务商.length]!
    const awaitingCheck = kind === '仓库' ? i === 0 || status === '取消中' : i === 3
    const blocker = i === (kind === '仓库' ? 12 : 8) ? '渠道映射缺失，请在物流渠道管理核查映射后再提交' : ''
    const reason = awaitingCheck ? '请求已发出但响应超时，外部结果待核查' : status === '出库异常' ? '仓库回传短拣，请核对计划数量与出库明细' : status === '下单失败' ? blocker || '服务商明确未受理；本地样例已完成前置校验' : status === '取消中' ? '等待仓库撤单确认' : ''
    const no = `${kind === '仓库' ? 'CK' : 'WL'}260912${suffix}`
    const createdAt = `2026-09-12 ${String(8 + i % 5).padStart(2, '0')}:${String(10 + i * 3).padStart(2, '0')}:00`
    return {
      id: `${kind === '仓库' ? 'outbound' : 'logistics'}-${suffix}`, kind, no,
      fulfillment: `LY260912${suffix}`, order: `OMS260912${suffix}`, provider,
      warehouse: `${['美西', '美东', '英国', '德国'][i % 4]}演示仓`, account: `演示账号 ${String(i % 3 + 1).padStart(2, '0')}`,
      channel: kind === '仓库' ? `${provider} · 标准配送` : '演示物流 · 标准包裹', channelCode: `DEMO-${kind === '仓库' ? 'WH' : 'API'}-${i % 5 + 1}`, labelMode: kind === '仓库' ? '仓库回传' : '自有物流 API（流程演示）',
      platform: ['eBay', 'Temu', '美客多', 'Coupang', 'OZON', 'TikTok Shop', '乐天'][i % 7]!, status,
      externalNo: ['待出库', '出库异常', '已出库', '取消中', '已取消', '下单成功'].includes(status) ? `DEMO-EXT-${suffix}` : '',
      tracking: ['已出库', '下单成功'].includes(status) ? `DEMO-TRACK-${suffix}` : '', createdAt, updatedAt: createdAt,
      planned: i % 3 + 1, shipped: status === '已出库' ? i % 3 + 1 : status === '出库异常' && i > 5 ? 1 : 0,
      sku: `DEMO-AUTO-${String(i + 1).padStart(3, '0')}`, goods: ['汽车空气滤芯', '车门把手组件', '刹车片套装', '雨刷器组件'][i % 4]!,
      country: ['美国 US', '美国 US', '英国 GB', '德国 DE'][i % 4]!,
      reason, reasonCode: awaitingCheck ? 'EXTERNAL_RESULT_PENDING_CHECK' : blocker ? 'DEMO_CHANNEL_MAPPING_MISSING' : status === '出库异常' ? 'DEMO_SHORT_PICK' : reason ? 'DEMO_REJECTED' : '',
      awaitingCheck, blocker,
      history: [{ time: createdAt, title: `当前阶段 · ${status}`, detail: reason || '根据本地演示业务事实生成当前状态；并非真实仓库或物流商回传。' }, { time: '2026-09-12 07:50:00', title: '形成执行快照', detail: '审核通过后生成履约单，固化本次仓库、账号、物流渠道及商品数量。' }],
      attempts: status === '待下单' ? [] : [{ id: `DEMO-ATT-${suffix}-1`, time: createdAt, action: kind === '仓库' ? '创建仓库出库单' : '创建物流单', result: awaitingCheck || status === '下单失败' ? '失败' : '成功', reason: reason || '本地演示返回，字段不代表服务商正式接口映射' }],
    }
  })
}

export interface 物流渠道 {
  id: string; name: string; code: string; provider: string; account: string; warehouse: string
  providerCode: string; countries: string[]; enabled: boolean; labelMode: string; updatedAt: string
}
export function 校验物流渠道(channel: 物流渠道, channels: 物流渠道[]): string {
  if (![channel.name, channel.code, channel.provider, channel.account, channel.warehouse, channel.providerCode].every(v => v.trim())) return '请完整填写渠道名称、代码、服务商、账号、仓库与服务商渠道代码'
  if (!/^[A-Z0-9_-]{2,40}$/.test(channel.code)) return '渠道代码需为 2–40 位大写字母、数字、下划线或短横线'
  if (!channel.countries.length) return '请至少选择一个目的国家或地区'
  if (channels.some(c => c.id !== channel.id && c.code === channel.code)) return '渠道代码已存在，请使用唯一代码'
  if (channels.some(c => c.id !== channel.id && c.provider === channel.provider && c.account === channel.account && c.warehouse === channel.warehouse && c.providerCode === channel.providerCode)) return '该服务商、账号、仓库与服务商渠道代码组合已存在'
  if (channel.labelMode !== '仓库回传') return '当前原型仅开放仓库回传面单的三方仓物流渠道'
  return ''
}
