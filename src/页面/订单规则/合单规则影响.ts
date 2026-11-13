import { h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MergeImpact from './合单影响确认内容.vue'
import { 共享合单记录 } from '../订单处理/自动合单状态'
import { 划分合单候选组, type 合单等待记录 } from '../订单处理/自动合单模型'
import { 合单操作复核快照, 校验合单操作来源一致性 } from '../订单处理/合单操作快照'

/** 只读计算完整影响组；筛选规则 ID 只定位来源，不能裁剪同组其他来源。 */
export function 获取合单规则退出影响(ruleIds: readonly string[], records: readonly 合单等待记录[] = 共享合单记录.value) {
  const ids = new Set(ruleIds)
  const groups = 划分合单候选组(records).filter(group => group.some(row => ids.has(row.ruleId)))
  return groups.map(group => group.map(row => row.orderNo))
}
function 影响签名(groups: string[][]) { return JSON.stringify(groups.map(group => [...group].sort()).sort((a, b) => a.join('|').localeCompare(b.join('|')))) }

export async function 确认合单规则退出(ruleIds: readonly string[], options: { message: string; title: string; confirmButtonText: string; cancelButtonText?: string }): Promise<boolean> {
  const groups = 获取合单规则退出影响(ruleIds)
  const error = 校验合单操作来源一致性(groups.flat())
  if (error) { ElMessage.warning(error); return false }
  const sourceSnapshot = 合单操作复核快照(groups.flat())
  try {
    await ElMessageBox.confirm(h(MergeImpact, { message: options.message, groups }), options.title, {
      confirmButtonText: options.confirmButtonText, cancelButtonText: options.cancelButtonText ?? '取消', type: 'warning',
    })
  } catch { return false }
  // 确认期间新单、到期或退出会改变实际影响；不沿用旧名单扩大或缩小操作范围。
  if (影响签名(groups) !== 影响签名(获取合单规则退出影响(ruleIds)) || sourceSnapshot !== 合单操作复核快照(groups.flat())) {
    ElMessage.warning('等待组合已变化，本次操作未执行，请重新确认影响范围')
    return false
  }
  const currentError = 校验合单操作来源一致性(groups.flat())
  if (currentError) { ElMessage.warning(currentError); return false }
  return true
}
