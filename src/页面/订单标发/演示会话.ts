import { ref } from 'vue'
import { 共享订单 } from '../订单处理/演示会话'
import { 创建标发演示单 } from './标发逻辑'

// 模块级状态保证切换中台页签时仍能核对本次演示的接口尝试。
export const 共享标发单 = ref(创建标发演示单(共享订单.value))
