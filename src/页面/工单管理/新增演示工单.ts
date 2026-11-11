import type { Ticket, TicketPriority, TicketSource } from './会话'

// 使用各来源模块的虚构业务编号，以便从每张工单回到原记录。
export function additionalTickets(firstNumber: number, agent: string, clerk: string, at: (day: number, hour: string) => string, now: string): Ticket[] {
  const us = { shopId: 'shop-us', shopName: '演示店铺-US' }
  const outdoor = { shopId: 'demo-outdoor-uk', shopName: '户外精选店 UK' }
  function open(index: number, title: string, description: string, source: TicketSource | undefined,
    creator: string, owner: string, priority: TicketPriority, createdAt: string, nextAt: string, dueAt: string): Ticket {
    return {
      id: 'GD-' + (firstNumber + index), title, description, source, creator, owner, priority, status: '待处理',
      createdAt, updatedAt: createdAt, nextAt, dueAt, result: '',
      logs: [{ action: '创建工单', actor: creator, time: createdAt, note: '负责人：' + owner }],
    }
  }
  function progress(ticket: Ticket, time: string, note: string) {
    ticket.status = '处理中'
    ticket.updatedAt = time
    ticket.logs.push({ action: '记录跟进', actor: ticket.owner, time, note })
  }
  function complete(ticket: Ticket, time: string, note: string) {
    ticket.status = '已完成'
    ticket.updatedAt = time
    ticket.nextAt = ''
    ticket.result = note
    ticket.logs.push({ action: '完成工单', actor: ticket.owner, time, note })
  }

  const parcels = open(0, '分开回复两个包裹的配送进度', '买家询问两件车门把手的去向，分别核对每个运单后回复原会话。',
    { ...us, kind: 'message', contextId: 'conv-02', id: 'msg-02-1', summary: '物流进度咨询' },
    agent, agent, '紧急', at(-2, '09:15'), at(-1, '17:00'), at(0, '18:00'))
  progress(parcels, at(-1, '14:30'), '已按原订单核对两件车门把手，每个包裹各一件。\n包裹 DEMO-TRACK-02A 的轨迹仍为运输中，已向物流同事查询下一站扫描时间。\n包裹 DEMO-TRACK-02B 已显示签收。回复时需分别说明两个包裹的进展，并请买家确认实际收到的是哪一件。')
  parcels.checklist = [
    { id: 'item-1', text: '核对两件车门把手各自对应的运单号', done: true },
    { id: 'item-2', text: '向物流确认在途包裹的下一站扫描时间', done: false },
    { id: 'item-3', text: '在原会话分别说明两个包裹的进度', done: false },
  ]

  const chair = open(1, '追踪深绿折叠椅的退回运单', '买家已经寄回折叠椅，请跟踪入仓时间并将收件记录交回客服。',
    { ...outdoor, kind: 'return', id: 'DEMO-RT-002', summary: '露营折叠椅 · 深绿' },
    agent, agent, '优先', at(-2, '11:00'), at(0, '17:45'), at(2, '16:00'))
  chair.logs.push({ action: '转交工单', actor: agent, time: at(-1, '09:20'), note: '转交给' + clerk + '。请接手跟踪退件入仓。' })
  chair.owner = clerk
  progress(chair, at(-1, '14:15'), '退回包裹仍在运输中。已将运单交给仓库接收岗，签收后再核对实收数量。')

  const inquiry = open(2, '核查营灯包裹的最后一站扫描', '原请求已提供 Royal Mail 跟踪号，请核对最新轨迹并跟进买家。',
    { ...outdoor, kind: 'dispute', contextId: 'INR_REQUEST', id: 'DEMO-INR-101', summary: '便携营灯 · 雾蓝' },
    clerk, agent, '紧急', now, at(1, '09:30'), at(1, '16:00'))

  const evidence = open(3, '补齐香薰座支付争议的商品凭证', '根据付款机构补证要求，核对发货时的商品描述及包装照片，整理齐全后交客服。',
    { ...outdoor, kind: 'dispute', contextId: 'PAYMENT_DISPUTE', id: 'DEMO-PD-110', summary: '陶瓷香薰座' },
    agent, clerk, '优先', at(-1, '10:00'), at(1, '13:30'), at(2, '18:00'))
  progress(evidence, at(-1, '16:20'), '已找到发货当天的商品描述，正在向仓库核对出库照片对应的订单行。')

  const handoff = open(4, '确认周末退件查收的仓库联系人', '汇总两个值班时段的退件查收联系人和交接时间，发给晚班客服。',
    undefined, clerk, clerk, '普通', at(-1, '15:00'), '', '')

  const feedback = open(5, '核对延迟送达评价的买家补充说明', '客服需要确认买家是否已经收到包裹，再决定如何回复评价。',
    { kind: 'review', id: 'REV-DEMO-002', shopId: 'shop-uk', shopName: '演示店铺-UK', summary: '车门把手 · 配送延迟' },
    agent, agent, '优先', at(-2, '09:30'), '', at(-1, '18:00'))
  complete(feedback, at(-1, '15:40'), '已查到买家的补充说明：包裹已送达，买家正在检查商品。已把原文位置交接给评价经办人。')

  const cancellation = open(6, '核对阅读灯取消申请的退款记录', '请核对取消申请中已记录的退款结果，供客服答复买家。',
    { kind: 'cancel', id: 'CXL-DEMO-0005', shopId: 'shop-demo-2', shopName: 'DEMO 英国二店', summary: '桌面阅读灯' },
    agent, clerk, '紧急', at(-2, '10:30'), '', at(-1, '17:00'))
  complete(cancellation, at(-1, '16:50'), '已核对取消申请的关闭状态及退款成功记录，原申请编号已交回客服。')

  const installation = open(7, '回访安装说明是否清楚', '查看买家反馈，确认是否还需要补充安装步骤。',
    { ...us, kind: 'message', id: 'msg-03-1', contextId: 'conv-03', summary: '安装方式咨询' },
    agent, agent, '普通', at(-2, '11:10'), '', at(-1, '12:00'))
  complete(installation, at(-1, '10:15'), '买家已确认安装说明清楚，回访完成。')

  return [parcels, chair, inquiry, evidence, handoff, feedback, cancellation, installation]
}
