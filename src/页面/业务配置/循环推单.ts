import { onScopeDispose, watch } from 'vue'
import { 共享自动推单设置, 是推单执行日 } from './自动推单设置'
import { 运行自动推单轮次, 自动同步推单结果, 自动推单调度错误 } from './自动推单执行'

export function 启动循环推单() {
  let 下次推单 = Number.POSITIVE_INFINITY
  const 停止监听 = watch(共享自动推单设置, 设置 => {
    下次推单 = 设置.enabled ? Date.now() + 设置.intervalHours * 3_600_000 : Number.POSITIVE_INFINITY
  }, { immediate: true, flush: 'sync' })
  const 定时器 = window.setInterval(() => {
    try {
      // 已提交请求继续核查，不受新推单的启停或星期限制；先查询再提交，受理不冒充成功。
      自动同步推单结果()
      const now = Date.now()
      const 设置 = 共享自动推单设置.value
      if (!设置.enabled || now < 下次推单) return
      下次推单 = now + 设置.intervalHours * 3_600_000
      if (是推单执行日(设置.weekdays, now)) 运行自动推单轮次()
    } catch {
      自动推单调度错误.value = '自动任务执行未完成，请查看订单与仓库状态；结果未核清前不要重复推单。'
    }
  }, 60_000)
  onScopeDispose(() => { 停止监听(); window.clearInterval(定时器) })
}
