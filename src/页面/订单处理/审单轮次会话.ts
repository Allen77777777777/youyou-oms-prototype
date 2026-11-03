import { shallowRef } from 'vue'
import { 执行待审核规则轮次 } from './审单规则执行'

type 执行来源 = Parameters<typeof 执行待审核规则轮次>[0]
type 轮次记录 = ReturnType<typeof 执行待审核规则轮次> & { 来源: 执行来源; 执行时间: string }

export const 最近审单轮次 = shallowRef<轮次记录>()

export function 运行审单轮次(来源: 执行来源) {
  const 结果 = 执行待审核规则轮次(来源)
  const 执行时间 = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  最近审单轮次.value = { ...结果, 来源, 执行时间 }
  return 最近审单轮次.value
}
