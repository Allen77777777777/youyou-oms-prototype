import { watch } from 'vue'
import { 共享审单执行设置 } from './规则执行设置'

// 仅启停或扫描间隔改变时重建计时器；额度与天数由每轮读取，调整它们不延后下一轮。
export function 启动循环审单() {
  return watch([() => 共享审单执行设置.value.enabled, () => 共享审单执行设置.value.intervalHours], ([启用, 间隔], _, 清理) => {
    if (!启用) return
    let 有效 = true
    const 定时器 = window.setInterval(async () => {
      const { 运行审单轮次 } = await import('../订单处理/审单轮次会话')
      if (有效) 运行审单轮次('定时执行')
    }, 间隔 * 3_600_000)
    清理(() => {
      有效 = false
      window.clearInterval(定时器)
    })
  }, { immediate: true, flush: 'sync' })
}
