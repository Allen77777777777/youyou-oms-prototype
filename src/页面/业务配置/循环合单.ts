import { onScopeDispose, watch } from 'vue'
import { 共享自动合单设置, 共享下次合单时间, 记录合单执行成功, 记录合单执行失败 } from './自动合单设置'
import { 执行合单轮次, 处理合单到期, 获取最早合单到期时间, 释放全部等待, 初始化合单待处理 } from '../订单处理/自动合单会话'
import { 共享规则 } from '../订单规则/演示会话'

/** 挂在应用会话中，批次扫描和放单截止分别计时；正式调度由服务端承担。 */
export function 启动循环合单() {
  let active = true
  let batchTimer: ReturnType<typeof setTimeout> | undefined
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined

  function run(source: string, work: () => unknown) {
    try {
      work()
      记录合单执行成功(source)
    } catch (error) { 记录合单执行失败(error, source) }
  }
  function planBatch() {
    clearTimeout(batchTimer)
    if (!active || !共享自动合单设置.value.enabled) {
      共享下次合单时间.value = null
      return
    }
    const delay = 共享自动合单设置.value.intervalMinutes * 60_000
    共享下次合单时间.value = Date.now() + delay
    batchTimer = setTimeout(() => {
      if (!active || !共享自动合单设置.value.enabled) return
      // 先更新下一轮时间，基础模式本轮释放后才可等待后续批次。
      planBatch()
      run('定时执行', () => 执行合单轮次(Date.now(), '定时执行'))
      planDeadline(true)
    }, delay)
  }
  function planDeadline(afterAttempt = false) {
    clearTimeout(deadlineTimer)
    if (!active) return
    const earliest = 获取最早合单到期时间()
    if (earliest === null) return
    const untilDeadline = earliest - Date.now()
    const delay = untilDeadline > 0 ? untilDeadline : afterAttempt ? 1_000 : 0
    deadlineTimer = setTimeout(() => {
      if (!active) return
      run('到期放单', () => 处理合单到期(Date.now()))
      // 保留故障后的重试机会，同时避免过期记录导致零间隔循环。
      planDeadline(true)
    }, delay)
  }

  const stopSettings = watch(
    [() => 共享自动合单设置.value.enabled, () => 共享自动合单设置.value.intervalMinutes],
    ([enabled], previous) => {
      planBatch()
      if (enabled && previous?.[0] !== true) {
        run('开启任务检查', () => 初始化合单待处理(Date.now()))
      }
      if (previous?.[0] === true && !enabled) {
        run('关闭任务并结束等待', () => 释放全部等待('自动合单任务已关闭', Date.now()))
      }
      planDeadline()
    },
    { immediate: true, flush: 'sync' },
  )
  const stopDeadline = watch(() => 获取最早合单到期时间(), () => planDeadline(), { immediate: true, flush: 'post' })
  const stopRules = watch(
    () => 共享规则.value.filter(rule => rule.type === '合单规则').map(rule => `${rule.id}:${rule.enabled}`).join('|'),
    () => {
      run('入池规则变更检查', () => {
        处理合单到期(Date.now())
        if (共享自动合单设置.value.enabled) 初始化合单待处理(Date.now())
      })
      planDeadline()
    },
    { flush: 'post' },
  )
  function stop() {
    active = false
    clearTimeout(batchTimer)
    clearTimeout(deadlineTimer)
    stopSettings()
    stopDeadline()
    stopRules()
    共享下次合单时间.value = null
  }
  onScopeDispose(stop)
  return stop
}
