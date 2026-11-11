import { ref } from 'vue'
import { eBay订单模拟数据 } from './模拟数据'
import type { eBay订单 } from './类型'

/** 共用本地订单投影；买家概览与订单页读取同一份刷新结果。 */
export const ebayOrderSession = ref<eBay订单[]>(
  eBay订单模拟数据.map(订单 => ({ ...订单, sync: { ...订单.sync } })),
)
