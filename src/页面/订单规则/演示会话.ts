import { ref } from 'vue'
import { 创建规则样例, type 订单规则 } from './规则逻辑'

const 补充规则: 订单规则[] = [
  { id: 'RULE-REVIEW-PARTIAL', name: 'eBay 部分履约订单人工核对', type: '审单规则', enabled: true, priority: 5, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'platformOrderStatus', operator: '等于', value: 'IN_PROGRESS' }], action: '留在待审核', version: 1, updatedAt: '2026-10-16 09:00:00 UTC+8', note: '' },
  { id: 'RULE-REVIEW-EU', name: '欧洲自配送订单审核建议', type: '审单规则', enabled: false, priority: 20, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }, { field: 'countryCode', operator: '等于', value: 'DE' }], action: '留在待审核', version: 1, updatedAt: '2026-10-16 09:05:00 UTC+8', note: '' },
  { id: 'RULE-CONFIRM-MANUAL', name: '英国订单无需标发', type: '订单标发规则', enabled: false, priority: 20, mode: '全部满足', conditions: [{ field: 'countryCode', operator: '等于', value: 'GB' }], action: '无需标发', version: 1, updatedAt: '2026-10-16 09:10:00 UTC+8', note: '' },
]
export const 共享规则 = ref([...创建规则样例(), ...补充规则])
export type 规则操作 = '新增' | '编辑' | '复制' | '启用' | '停用' | '调整优先级' | '删除'
export interface 规则操作日志 { time: string; text: string; ruleId?: string; ruleName?: string; action?: 规则操作; operator?: string }
export const 共享规则日志 = ref<规则操作日志[]>([])
export function 记录规则操作(规则: Pick<订单规则, 'id' | 'name'>, action: 规则操作, text: string, time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8') {
  共享规则日志.value.unshift({ ruleId: 规则.id, ruleName: 规则.name, action, operator: '演示用户', time, text })
}
