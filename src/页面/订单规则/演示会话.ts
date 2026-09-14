import { ref } from 'vue'
import { 创建规则样例 } from './规则逻辑'

export const 共享规则 = ref(创建规则样例())
export const 共享规则日志 = ref<Array<{ time: string; text: string }>>([])
