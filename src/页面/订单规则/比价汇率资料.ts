import { shallowRef } from 'vue'
import type { 比价汇率快照 } from './比价汇率'

// 复用中台货币汇率资料的接入位置；未接真实资料前保持空值，不提供默认或模拟汇率。
export const 中台比价汇率快照 = shallowRef<比价汇率快照>()
