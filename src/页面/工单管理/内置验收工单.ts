import type { Ticket } from './会话'
import { builtinTicketAttachments } from './演示附件'

/** 将已验收的虚构办理过程内置；原件由随工程分发的演示附件提供。 */
export function builtinAcceptanceTickets(firstNumber: number, agent: string, clerk: string, at: (day: number, hour: string) => string): Ticket[] {
  const followup = at(1, '10:00')
  const deadline = at(2, '18:00')
  const materials: Ticket = {
    id: 'GD-' + firstNumber,
    demoKey: 'ticket-acceptance-materials-v1',
    title: '核对退件实收照片与仓库回函',
    description: '核对折叠收纳箱退件数量，将现场照片与仓库回函归入同一条跟进，便于客服回看。',
    creator: agent, owner: clerk, priority: '普通', status: '处理中',
    nextAt: followup, dueAt: deadline, createdAt: at(-1, '16:37'), updatedAt: at(-1, '16:44'), result: '',
    followupRevision: 1,
    logs: [
      { action: '创建工单', actor: agent, time: at(-1, '16:37'), note: '负责人：' + agent },
      {
        action: '记录跟进', actor: agent, time: at(-1, '16:37'),
        note: '仓库已回传退件现场照片与实收清单。横图查看包裹外观，竖图查看数量；回函和明细文件一并留存。\n待核对：外箱完整，实收 2 件。',
        attachments: builtinTicketAttachments.map(file => ({ ...file })),
      },
      { action: '转交工单', actor: agent, time: at(-1, '16:43'), note: '转交给' + clerk + '。请对照照片和附件核实实收数量，并反馈客服。' },
      {
        action: '内部补充', actor: agent, time: at(-1, '16:43'), note: '买家补充：第二件商品外箱编号不同，请一并核对。',
        attachments: builtinTicketAttachments.filter(file => file.type === 'text/plain').map(file => ({ ...file })),
      },
      {
        action: '调整办理安排', actor: clerk, time: at(-1, '16:44'),
        note: '下次跟进：未安排 → ' + followup + '\n完成期限：未设置 → ' + deadline + '\n调整原因：仓库需一个工作日核查两件实收信息',
      },
      { action: '记录跟进', actor: clerk, time: at(-1, '16:44'), note: '已接手核对，材料已收到，将按新预约反馈。（下次跟进：' + followup + '）' },
    ],
  }
  const conclusion = '原工单已完成核查\n剩余 1 项未完成：该事项已在原工单核实，本单无需重复执行'
  const abandonReason = '重复建单，后续继续在原工单跟进'
  const abandoned: Ticket = {
    id: 'GD-' + (firstNumber + 1),
    demoKey: 'ticket-acceptance-abandoned-v1',
    title: '复核重复建单是否仍需继续办理', description: '',
    creator: agent, owner: agent, priority: '普通', status: '已放弃',
    nextAt: '', dueAt: '', createdAt: at(-1, '16:39'), updatedAt: at(-1, '16:42'), closedAt: at(-1, '16:42'),
    result: conclusion, abandonReason,
    checklist: [{ id: 'item-1', text: '核实重复任务', done: false }],
    logs: [
      { action: '创建工单', actor: agent, time: at(-1, '16:39'), note: '负责人：' + agent + '\n☐ 核实重复任务' },
      { action: '完成工单', actor: agent, time: at(-1, '16:40'), note: conclusion },
      { action: '重新打开工单', actor: agent, time: at(-1, '16:41'), note: '需要重新核对是否属于重复任务' },
      { action: '放弃工单', actor: agent, time: at(-1, '16:42'), note: abandonReason },
    ],
  }
  return [materials, abandoned]
}

/** 认领上轮手建的验收记录，不用编号或可变的当前状态、负责人推断身份。 */
export function matchesLegacyAcceptanceTicket(item: Ticket, example: Ticket): boolean {
  if (item.title !== example.title || item.description !== example.description || item.creator !== example.creator || item.source) return false
  const created = item.logs[0]
  if (!created || created.action !== '创建工单' || created.actor !== example.creator || created.time !== item.createdAt) return false
  const ownerNote = '负责人：' + example.creator
  if (created.note !== ownerNote && !(example.demoKey === 'ticket-acceptance-abandoned-v1' && created.note === ownerNote + '\n☐ 核实重复任务')) return false
  if (example.demoKey === 'ticket-acceptance-materials-v1') {
    return item.logs.some(log => log.action === '记录跟进' && log.actor === example.creator
      && log.note.startsWith('仓库已回传退件现场照片与实收清单。') && log.attachments?.length === 4
      && builtinTicketAttachments.every(file => log.attachments!.some(saved => saved.name === file.name && saved.type === file.type)))
  }
  return item.logs.some(log => log.action === '完成工单' && log.actor === example.creator && log.note.startsWith('原工单已完成核查'))
    && item.logs.some(log => log.action === '放弃工单' && log.actor === example.creator && log.note === '重复建单，后续继续在原工单跟进')
}
