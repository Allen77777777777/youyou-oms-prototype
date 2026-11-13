import { ref } from 'vue'
import { 创建默认合单动作, 校验合单动作, type 合单动作配置 } from '../订单规则/合单规则模型'

export interface 自动合单设置 {
  enabled: boolean
  intervalMinutes: number
  policy: 合单动作配置
  version: number
  updatedAt: string
}

// 本地评审会话；正式配置、后台调度及审计由服务端接入。
export const 共享自动合单设置 = ref<自动合单设置>({
  enabled: false,
  intervalMinutes: 30,
  policy: 创建默认合单动作(),
  version: 1,
  updatedAt: '',
})
export const 共享下次合单时间 = ref<number | null>(null)
export const 自动合单调度错误 = ref('')

export interface 合单运行状态 {
  status: '未执行' | '执行成功' | '执行失败'
  source: string
  lastAttemptAt: number | null
  lastSuccessAt: number | null
  lastFailureAt: number | null
  failureReason: string
  nextAction: string
}
/** 执行结果独立于任务开关；开启任务不等于执行成功，业务受阻仍在处理明细中表达。 */
export const 共享合单运行状态 = ref<合单运行状态>({ status: '未执行', source: '', lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, failureReason: '', nextAction: '' })

export function 记录合单执行成功(source: string, now = Date.now()): void {
  共享合单运行状态.value = { ...共享合单运行状态.value, status: '执行成功', source, lastAttemptAt: now, lastSuccessAt: now, failureReason: '', nextAction: '' }
  自动合单调度错误.value = ''
}

export function 记录合单执行失败(error: unknown, source: string, now = Date.now()): void {
  const detail = error instanceof Error ? error.message : String(error)
  const reason = /占用|版本|冲突/.test(detail) ? '订单正在被其他操作处理，本次合单未完成。'
    : /timeout|timed out|超时/i.test(detail) ? '本次合单处理超时，尚未确认全部处理结果。'
      : /network|fetch|网络|连接/i.test(detail) ? '合单处理连接中断，尚未确认全部处理结果。'
        : '本次合单执行遇到错误，尚未确认全部处理结果。'
  共享合单运行状态.value = {
    ...共享合单运行状态.value, status: '执行失败', source, lastAttemptAt: now, lastFailureAt: now,
    failureReason: reason,
    nextAction: '请打开合单处理，先查看最近执行结果和分仓待处理订单；核实后再重试，持续失败请联系管理员。',
  }
  // 保留既有错误入口用于调度兼容；业务界面使用上方可读原因，不直接暴露技术异常。
  自动合单调度错误.value = `自动合单执行失败：${detail}`
}

function 策略快照(policy: 合单动作配置): 合单动作配置 {
  return JSON.parse(JSON.stringify({
    mode: policy.mode, groupBySite: policy.groupBySite, maxOrders: policy.maxOrders,
    maxQuantity: policy.maxQuantity, maxWeightKg: policy.maxWeightKg,
    maxWaitMinutes: policy.maxWaitMinutes, releaseMode: policy.releaseMode,
    releaseTimes: policy.releaseTimes, readyOrderCount: policy.readyOrderCount,
    shipByBufferMinutes: policy.shipByBufferMinutes,
  })) as 合单动作配置
}

export function 保存自动合单设置(input: Pick<自动合单设置, 'enabled' | 'intervalMinutes'> & { policy?: 合单动作配置 }): string {
  if (typeof input.enabled !== 'boolean') return '请选择是否开启自动合单'
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 1440) return '执行间隔须为 1～1440 的整数分钟'
  const current = 共享自动合单设置.value
  const policy = input.policy ?? current.policy
  const error = 校验合单动作(policy)
  if (error) return error
  const copied = 策略快照(policy)
  if (current.enabled === input.enabled && current.intervalMinutes === input.intervalMinutes && JSON.stringify(策略快照(current.policy)) === JSON.stringify(copied)) return ''
  共享自动合单设置.value = {
    enabled: input.enabled,
    intervalMinutes: input.intervalMinutes,
    policy: copied,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  }
  return ''
}
