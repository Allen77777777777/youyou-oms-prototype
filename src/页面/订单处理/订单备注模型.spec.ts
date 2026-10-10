import { computed } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { 共享订单备注, 获取订单备注, 追加订单备注, 订单备注字数上限, 原型备注作者 } from './订单备注模型'
import { 共享订单, 订单版本, 仓库执行记录 } from './演示会话'

const 初始备注 = JSON.stringify(共享订单备注.value)
beforeEach(() => { 共享订单备注.value = [] })
afterEach(() => { 共享订单备注.value = JSON.parse(初始备注); vi.useRealTimers() })

describe('订单级纯文本备注', () => {
  it('追加保留历史、作者和实际创建时间，内部换行不被压平', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T02:03:04Z'))
    const 第一条 = 追加订单备注('ORDER-DEMO-A', '  首条记录\n补充说明  ')
    expect(第一条.成功).toBe(true)
    expect(第一条.备注).toMatchObject({ order_id: 'ORDER-DEMO-A', note_content: '首条记录\n补充说明', author_id: 原型备注作者, noted_at: '2026-10-09T02:03:04.000Z' })
    vi.setSystemTime(new Date('2026-10-09T02:04:05Z'))
    expect(追加订单备注('ORDER-DEMO-A', '第二条记录').成功).toBe(true)
    expect(获取订单备注('ORDER-DEMO-A').map(备注 => 备注.note_content)).toEqual(['首条记录\n补充说明', '第二条记录'])
    expect(获取订单备注('ORDER-DEMO-A')[1]!.noted_at).toBe('2026-10-09T02:04:05.000Z')
  })

  it('跨履约行及队列按来源订单共享读取，其他订单保持隔离', () => {
    const 履约甲 = { fulfillmentNo: 'FULFILLMENT-A', orderNo: 'ORDER-DEMO-A' }
    const 履约乙 = { fulfillmentNo: 'FULFILLMENT-B', orderNo: 'ORDER-DEMO-A' }
    const 甲备注 = computed(() => 获取订单备注(履约甲.orderNo))
    const 乙备注 = computed(() => 获取订单备注(履约乙.orderNo))
    expect(甲备注.value).toHaveLength(0)
    expect(乙备注.value).toHaveLength(0)
    追加订单备注('ORDER-DEMO-B', '其他订单记录')
    追加订单备注('ORDER-DEMO-A', '跨履约共享记录')
    expect(甲备注.value).toHaveLength(1)
    expect(乙备注.value[0]).toBe(甲备注.value[0])
    expect(获取订单备注('ORDER-DEMO-B').map(备注 => 备注.note_content)).toEqual(['其他订单记录'])
    expect(获取订单备注(履约甲.fulfillmentNo)).toEqual([])
  })

  it('拒绝空白内容和超长内容，明确上限内容可以保存', () => {
    expect(追加订单备注('ORDER-DEMO-A', ' \n\t ').成功).toBe(false)
    expect(追加订单备注('', '有效内容').成功).toBe(false)
    expect(追加订单备注('ORDER-DEMO-A', '文'.repeat(订单备注字数上限 + 1)).成功).toBe(false)
    expect(共享订单备注.value).toHaveLength(0)
    expect(追加订单备注('ORDER-DEMO-A', '文'.repeat(订单备注字数上限)).成功).toBe(true)
    expect(获取订单备注('ORDER-DEMO-A')[0]!.note_content).toHaveLength(订单备注字数上限)
  })

  it('备注不会变成订单业务命令，也不会把正文写入普通操作日志', () => {
    const 业务快照 = JSON.stringify({ orders: 共享订单.value, versions: 订单版本.value, executions: 仓库执行记录.value })
    expect(追加订单备注(共享订单.value[0]!.systemOrderNo, '仅记录内部沟通，不代表暂停发货或更换仓库。').成功).toBe(true)
    expect(JSON.stringify({ orders: 共享订单.value, versions: 订单版本.value, executions: 仓库执行记录.value })).toBe(业务快照)
  })
})
