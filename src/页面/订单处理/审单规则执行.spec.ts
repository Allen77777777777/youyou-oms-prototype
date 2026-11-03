import { beforeEach, describe, expect, it } from 'vitest'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 共享规则 } from '../订单规则/演示会话'
import { 创建空条件 } from '../订单规则/规则条件定义'
import { 共享订单, 当前版本, 执行演示审核, 操作核查证据, 订单版本, 仓库执行记录 } from './演示会话'
import { 执行待审核规则轮次 } from './审单规则执行'
import { 共享订单备注 } from './订单备注模型'
import { 创建合并发货草稿, 保存人工发货方案 } from './拆合发货模型'
import { 人工发货上下文 } from './演示会话'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值))
const 模板 = 克隆(共享订单.value.find(单 => 单.systemOrderNo === 'OMS260912000001')!)
const 策略 = 克隆(共享规则.value.find(项 => 项.id === 'RULE-REVIEW-01')!)
function 订单(编号: string, 修改: Partial<全渠道订单> = {}) {
  return { ...克隆(模板), systemOrderNo: 编号, platformOrderId: 编号, ...修改 }
}
beforeEach(() => {
  共享订单.value = []
  共享规则.value = [{ ...克隆(策略), orderNote: '包装尺寸需复核' }]
  共享订单备注.value = []
  订单版本.value = {}
  操作核查证据.value = {}
  仓库执行记录.value = []
})

describe('人工审核及立即、定时审单', () => {
  it('整轮逐单分流，按规则优先级记录；重扫不重复备注或履约，人工能放行已复核单', () => {
    共享规则.value.push({ ...克隆(策略), id: '前置', name: '提前验货', priority: 1 })
    共享订单.value = [订单('需复核'), 订单('通过'), 订单('缺仓'), 订单('已推', { processingStatus: '待推单' }), 订单('平台履约', { fulfillmentMode: '平台履约' })]
    const [待复核, 可通过, 缺仓] = 共享订单.value
    可通过!.address.countryCode = 'CA'
    缺仓!.defaultRoute = undefined
    const 首轮 = 执行待审核规则轮次('立即执行')
    expect(首轮).toMatchObject({ 总数: 3, 通过: 1, 拦截: 2, 跳过: 0 })
    expect(待复核!.reviews[0]).toMatchObject({ type: '自动审核', status: '已拦截', triggerSource: '立即执行审单规则' })
    expect(待复核!.reviews[0]!.decisionNote).toMatch(/提前验货.*eBay 北美订单人工复核/)
    expect(缺仓!.reviews[0]!.decisionNote).toMatch(/未分配发货仓库.*命中审单规则/)
    expect(缺仓!.defaultRoute).toBeUndefined()
    expect(可通过!.processingStatus).toBe('待推单')
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 2, 拦截: 2 })
    expect(共享订单备注.value.map(项 => 项.order_id).sort()).toEqual(['缺仓', '需复核'].sort())
    expect(待复核!.reviews[1]!.triggerSource).toBe('定时执行审单规则')
    expect(可通过!.fulfillmentOrders).toHaveLength(1)
    expect(执行演示审核('需复核', 当前版本('需复核')).成功).toBe(true)
    expect(待复核!.reviews[待复核!.reviews.length - 1]).toMatchObject({ type: '人工审核', status: '已通过' })
    expect(执行演示审核('缺仓', 当前版本('缺仓')).成功).toBe(false)
    expect(仓库执行记录.value).toHaveLength(0)
  })
  it('未知条件只有在整条规则仍可能命中时才拦截；每轮读取当前启停配置', () => {
    const 范围 = { ...创建空条件('orderWeight'), lowerEnabled: true, value: '20', upperEnabled: false }
    共享规则.value[0]!.conditions.push(范围)
    共享订单.value = [订单('待核实'), 订单('范围外')]
    共享订单.value[1]!.address.countryCode = 'CA'
    const 结果 = 执行待审核规则轮次('立即执行')
    expect(结果).toMatchObject({ 通过: 1, 拦截: 1, 跳过: 0 })
    expect(结果.明细[0]!.原因).toContain('待核实：订单重量')
    expect(共享订单备注.value).toHaveLength(0)
    共享规则.value[0]!.enabled = false
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 1, 通过: 1 })
  })
  it('合并来源只运行一次，任一来源命中拦截全组，规则备注只归属该来源', () => {
    共享订单.value = [订单('合并A'), 订单('合并B')]
    const [甲, 乙] = 共享订单.value
    甲!.address.buyerMessage = '验货'
    乙!.address.buyerMessage = '无'
    共享规则.value[0]!.conditions = [{ field: 'buyerMessage', operator: '包含', value: '验货' }]
    const 方案 = 创建合并发货草稿(共享订单.value)
    方案.packages[0]!.route = { ...甲!.defaultRoute! }
    expect(保存人工发货方案(人工发货上下文(), 方案, { 合并A: 1, 合并B: 1 }).成功).toBe(true)
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 2, 拦截: 2 })
    expect(共享订单.value.map(单 => 单.reviews.length)).toEqual([1, 1])
    expect(共享订单备注.value.map(项 => 项.order_id)).toEqual(['合并A'])
    共享规则.value = []
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 2, 通过: 2 })
    expect(甲!.fulfillmentOrders[0]?.fulfillmentOrderNo).toBe(乙!.fulfillmentOrders[0]?.fulfillmentOrderNo)
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 0 })
  })
  it('启用的旧规则须核实配置，明确范围外的订单可通过，人工审核仍只检查硬条件', () => {
    共享规则.value[0]!.action = '旧动作'
    共享订单.value = [订单('范围内'), 订单('范围外')]
    共享订单.value[1]!.address.countryCode = 'CA'
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 2, 通过: 1, 拦截: 1 })
    expect(共享订单.value[0]!.reviews[0]!.decisionNote).toContain('配置待核实')
    expect(共享订单备注.value).toHaveLength(0)
    expect(执行演示审核('范围内', 当前版本('范围内')).成功).toBe(true)
    共享规则.value[0]!.action = '留在待审核'
    共享规则.value[0]!.mode = '任一满足'
    共享订单.value = [订单('旧条件模式')]
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 1, 拦截: 1 })
    expect(共享订单.value[0]!.reviews[0]!.decisionNote).toContain('重新编辑')
  })
  it('普通硬条件形成拦截记录，在审和未核清部分履约跳过，核实后的部分履约只生成剩余量', () => {
    共享规则.value = []
    共享订单.value = [订单('仓库SKU'), 订单('缺渠道'), 订单('缺地址'), 订单('部分', { platformOrderStatus: 'IN_PROGRESS' }),
      订单('在审', { reviews: [{ round: 1, type: '自动审核', triggerSource: '历史', status: '审核中' }] })]
    const [缺映射, 缺渠道, 缺地址, 部分] = 共享订单.value
    缺映射!.items[0]!.systemSku = '不存在的仓库映射'
    缺渠道!.defaultRoute!.shippingChannel = ' '
    缺地址!.address.addressLine1 = ''
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 5, 拦截: 3, 跳过: 2 })
    expect(缺映射!.reviews[0]!.decisionNote).toContain('仓库 SKU 映射缺失')
    expect(缺渠道!.reviews[0]!.decisionNote).toContain('未分配物流渠道')
    expect(缺地址!.reviews[0]!.decisionNote).toContain('详细地址缺失')
    expect(部分!.reviews).toHaveLength(0)
    expect(执行演示审核('部分', 当前版本('部分')).成功).toBe(false)
    操作核查证据.value['部分'] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true }
    部分!.items[0]!.orderedQuantity = 4
    部分!.items[0]!.fulfillableQuantity = 2
    expect(执行演示审核('部分', 当前版本('部分')).成功).toBe(true)
    expect(部分!.fulfillmentOrders[0]!.plannedQuantity).toBe(2)
  })
})
