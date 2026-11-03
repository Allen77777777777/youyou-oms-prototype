import { watch } from 'vue'
import { 共享审单执行设置 } from './规则执行设置'

// 在应用根作用域监听，切换业务页签不影响周期。设置改变或根组件卸载时清理旧计时器。
export function 启动循环审单() {
  return watch(共享审单执行设置, (设置, _, 清理) => {
    if (!设置.enabled) return
    let 有效 = true
    const 定时器 = window.setInterval(async () => {
      const { 运行审单轮次 } = await import('../订单处理/审单轮次会话')
      if (有效) 运行审单轮次('定时执行')
    }, 设置.intervalHours * 3_600_000)
    清理(() => {
      有效 = false
      window.clearInterval(定时器)
    })
  }, { immediate: true, flush: 'sync' })
}
