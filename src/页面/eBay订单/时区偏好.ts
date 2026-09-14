import { ref } from 'vue'
import type { eBay时区模式 } from './时间工具'

// 列表与内部详情页签共享显示偏好，不修改平台原始时间。
export const 当前eBay时区 = ref<eBay时区模式>('beijing')
