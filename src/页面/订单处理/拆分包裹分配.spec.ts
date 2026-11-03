import { describe, expect, it } from 'vitest'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import {
  创建拆分矩阵草稿, 读取包裹分配数量, 更新拆分包裹数量, 重算首包余量,
  添加拆分包裹, 删除拆分包裹, 拆分包裹统计, 校验拆分商品分配,
} from './拆分包裹分配'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值)) as T
function 来源订单(): 全渠道订单 {
  const 单 = 克隆(全渠道订单模拟数据[0]!)
  return { ...单, systemOrderNo: 'MATRIX-ORDER', platformCode: 'Temu', manualShippingPlan: undefined, items: [
    { ...单.items[0]!, externalLineId: 'L1', orderedQuantity: 5, fulfillableQuantity: 5, systemSku: 'SKU-A', skuResolutionStatus: '成功' },
    { ...单.items[0]!, externalLineId: 'L2', orderedQuantity: 2, fulfillableQuantity: 2, systemSku: 'SKU-A', skuResolutionStatus: '成功' },
    { ...单.items[0]!, externalLineId: 'L3', orderedQuantity: 1, fulfillableQuantity: 1, systemSku: 'SKU-B', skuResolutionStatus: '成功' },
  ] }
}

describe('拆分数量矩阵的独立草稿', () => {
  it('新建默认包裹1全量、包裹2空，不改来源事实或既有模型初始化', () => {
    const 单 = 来源订单()
    const 原订单 = JSON.stringify(单)
    const 草稿 = 创建拆分矩阵草稿(单)
    expect(草稿.packages).toHaveLength(2)
    expect(草稿.packages[0]!.items.map(行 => 行.quantity)).toEqual([5, 2, 1])
    expect(草稿.packages[1]!.items).toEqual([])
    expect(校验拆分商品分配(草稿, 单).join('；')).toContain('包裹 2 没有分配商品')
    expect(JSON.stringify(单)).toBe(原订单)
  })

  it('编辑深克隆保留原包裹、分配、路线和原因，修改草稿不污染来源保存方案', () => {
    const 单 = 来源订单()
    const 草稿 = 创建拆分矩阵草稿(单)
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L1', 3)
    添加拆分包裹(草稿, 单)
    更新拆分包裹数量(草稿, 单, 草稿.packages[2]!.key, 'L2', 2)
    草稿.reason = '保留已有拆分'
    单.manualShippingPlan = 克隆(草稿)
    const 编辑 = 创建拆分矩阵草稿(单)
    expect(编辑).toEqual(草稿)
    expect(编辑).not.toBe(单.manualShippingPlan)
    更新拆分包裹数量(编辑, 单, 编辑.packages[1]!.key, 'L1', 1)
    expect(单.manualShippingPlan).toEqual(草稿)
  })

  it('SKU种类按系统SKU去重，商品行数、件数和SKU种类分别表达', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    expect(拆分包裹统计(草稿, 单, 草稿.packages[0]!.key)).toEqual({ quantity: 8, skuCount: 2 })
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L1', 3)
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L2', 1)
    expect(草稿.packages[1]!.items).toHaveLength(2)
    expect(拆分包裹统计(草稿, 单, 草稿.packages[1]!.key)).toEqual({ quantity: 4, skuCount: 1 })
    expect(拆分包裹统计(草稿, 单, 草稿.packages[0]!.key)).toEqual({ quantity: 4, skuCount: 2 })
  })
})

describe('包裹1自动余量与数量输入', () => {
  it('只读首包随其他包逐行余量变化，清空与0归还全部，不能手工改首包', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    const 首包 = 草稿.packages[0]!.key, 次包 = 草稿.packages[1]!.key
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 3)
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(2)
    const 余量 = JSON.stringify(草稿)
    更新拆分包裹数量(草稿, 单, 首包, 'L1', 4)
    expect(JSON.stringify(草稿)).toBe(余量)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', undefined)
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(5)
    expect(读取包裹分配数量(草稿, 次包, 单.systemOrderNo, 'L1')).toBe(0)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 2)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', null)
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(5)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 2)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 0)
    expect(草稿.packages[1]!.items).toEqual([])
  })

  it('多包超量显示负首包余量，保留各包原输入，不靠改写先填包掩盖超量', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    const 首包 = 草稿.packages[0]!.key, 次包 = 草稿.packages[1]!.key
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 4)
    expect(添加拆分包裹(草稿, 单).成功).toBe(true)
    const 三包 = 草稿.packages[2]!.key
    更新拆分包裹数量(草稿, 单, 三包, 'L1', 3)
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(-2)
    expect(读取包裹分配数量(草稿, 次包, 单.systemOrderNo, 'L1')).toBe(4)
    expect(读取包裹分配数量(草稿, 三包, 单.systemOrderNo, 'L1')).toBe(3)
    expect(校验拆分商品分配(草稿, 单).join('；')).toContain('负余量表示其他包裹已超量')
    const 其余包原输入 = JSON.stringify(草稿.packages.slice(1))
    重算首包余量(草稿, 单)
    expect(JSON.stringify(草稿.packages.slice(1))).toBe(其余包原输入)
  })

  it.each([0.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('非法输入 %s 保留用于校验，不能推进分配步骤', 数量 => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    const 次包 = 草稿.packages[1]!.key
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 数量)
    expect(读取包裹分配数量(草稿, 次包, 单.systemOrderNo, 'L1')).toBe(数量)
    expect(校验拆分商品分配(草稿, 单).join('；')).toContain('非负整数')
  })
})

describe('动态包裹增删', () => {
  it('最后一包非空才可添加，每次只添一个空包，包裹身份唯一', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    const 原草稿 = JSON.stringify(草稿)
    expect(添加拆分包裹(草稿, 单).成功).toBe(false)
    expect(JSON.stringify(草稿)).toBe(原草稿)
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L1', 2)
    expect(添加拆分包裹(草稿, 单).成功).toBe(true)
    expect(草稿.packages).toHaveLength(3)
    expect(草稿.packages[2]!.items).toEqual([])
    expect(添加拆分包裹(草稿, 单).成功).toBe(false)
    更新拆分包裹数量(草稿, 单, 草稿.packages[2]!.key, 'L2', 1)
    expect(添加拆分包裹(草稿, 单).成功).toBe(true)
    expect(new Set(草稿.packages.map(包 => 包.key)).size).toBe(4)
  })

  it('只有超过两个包才允许删除次包，首包不可删，删除的量自动归还首包', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    const 首包 = 草稿.packages[0]!.key, 次包 = 草稿.packages[1]!.key
    expect(删除拆分包裹(草稿, 单, 次包).成功).toBe(false)
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 2)
    添加拆分包裹(草稿, 单)
    const 三包 = 草稿.packages[2]!.key
    更新拆分包裹数量(草稿, 单, 三包, 'L1', 1)
    expect(删除拆分包裹(草稿, 单, 首包).成功).toBe(false)
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(2)
    expect(删除拆分包裹(草稿, 单, 次包).成功).toBe(true)
    expect(草稿.packages.map(包 => 包.key)).toEqual([首包, 三包])
    expect(读取包裹分配数量(草稿, 首包, 单.systemOrderNo, 'L1')).toBe(4)
    expect(读取包裹分配数量(草稿, 三包, 单.systemOrderNo, 'L1')).toBe(1)
    expect(删除拆分包裹(草稿, 单, 三包).成功).toBe(false)
  })
})

describe('第一步只校验分配且保留平台边界', () => {
  it('分配完整有效时无需填写路线或原因即可进入第二步', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L1', 3)
    草稿.reason = ''
    for (const 包 of 草稿.packages) 包.route = { warehouse: '', warehouseProvider: '', warehouseAccount: '', shippingChannel: '', shippingChannelCode: '', labelMode: '仓配一体' }
    expect(校验拆分商品分配(草稿, 单)).toEqual([])
  })

  it('eBay 同一平台行可以在两包或三包拆数量，分配守恒即可通过第一步', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    单.platformCode = 'eBay'
    const 次包 = 草稿.packages[1]!.key
    更新拆分包裹数量(草稿, 单, 次包, 'L1', 3)
    expect(校验拆分商品分配(草稿, 单)).toEqual([])
    expect(读取包裹分配数量(草稿, 草稿.packages[0]!.key, 单.systemOrderNo, 'L1')).toBe(2)
    expect(添加拆分包裹(草稿, 单).成功).toBe(true)
    更新拆分包裹数量(草稿, 单, 草稿.packages[2]!.key, 'L1', 1)
    expect(草稿.packages.map(包 => 读取包裹分配数量(草稿, 包.key, 单.systemOrderNo, 'L1'))).toEqual([1, 3, 1])
    expect(校验拆分商品分配(草稿, 单)).toEqual([])
  })

  it('第二包独占全部商品导致首包为空时阻断，不能把一包包装成拆分', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    for (const 行 of 单.items) 更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 行.externalLineId, 行.fulfillableQuantity)
    expect(校验拆分商品分配(草稿, 单).join('；')).toContain('包裹 1 没有分配商品')
  })

  it('未知来源、重复分配、漏分及失真来源数量均阻断，校验过程不修复输入', () => {
    const 单 = 来源订单(), 草稿 = 创建拆分矩阵草稿(单)
    更新拆分包裹数量(草稿, 单, 草稿.packages[1]!.key, 'L1', 3)
    草稿.packages[1]!.items.push({ orderNo: 'OTHER', externalLineId: 'L1', quantity: 1 })
    草稿.packages[1]!.items.push({ orderNo: 单.systemOrderNo, externalLineId: 'L1', quantity: 1 })
    草稿.packages[0]!.items = 草稿.packages[0]!.items.filter(行 => 行.externalLineId !== 'L2')
    const 之前 = JSON.stringify(草稿)
    const 错误 = 校验拆分商品分配(草稿, 单).join('；')
    expect(错误).toContain('不属于当前订单')
    expect(错误).toContain('来源商品行重复')
    expect(错误).toContain('分配总数必须等于')
    expect(JSON.stringify(草稿)).toBe(之前)
    单.items[0]!.fulfillableQuantity = undefined
    expect(校验拆分商品分配(草稿, 单).join('；')).toContain('当前可发商品及数量未核实')
  })
})
