import { ref } from 'vue'
import { 是合单等待, type 合单等待记录, type 合单执行结果 } from './自动合单模型'

// 独立状态模块不引入订单会话，审单与人工编排可读取门禁而不形成循环依赖。
export const 共享合单记录 = ref<合单等待记录[]>([])
export const 共享合单执行结果 = ref<合单执行结果 | null>(null)
export function 读取订单合单进度(orderNo: string): 合单等待记录 | undefined {
  return 共享合单记录.value.find(row => row.orderNo === orderNo)
}
export function 订单正在等单(orderNo: string): boolean {
  const row = 读取订单合单进度(orderNo)
  return !!row && (是合单等待(row) || row.status === '分仓待处理')
}
export function 获取最早合单到期时间(): number | null {
  const deadlines = 共享合单记录.value.filter(是合单等待).map(row => row.deadlineAt).filter((value): value is number => value !== null)
  return deadlines.length ? Math.min(...deadlines) : null
}
