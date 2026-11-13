import { describe, expect, it } from 'vitest'
import { 共享订单 } from '../订单处理/演示会话'
import { 创建订单处理人分配, 获取订单处理人, 获取订单处理人缺失原因 } from '../订单处理/处理人模型'
import { 关联演示数据 } from '../订单处理/库存关联模型'
import { 共享规则 } from './演示会话'
import { 创建拆单演示订单 } from './拆单演示资料'
import { 初始化拆单规则演示, 读取拆单试算订单 } from './拆单规则会话'

describe('拆单演示订单创建边界与处理人', () => {
  it('新样例在入库时保存逐行分配依据；复用及后续查询不重分配存量', () => {
    const 原订单 = 共享订单.value.slice()
    const 原规则 = 共享规则.value.slice()
    const 原映射 = 关联演示数据.mappings.slice()
    const 原库存 = 关联演示数据.inventory.slice()
    try {
      const 已有 = 创建拆单演示订单()[0]!
      已有.handlerAssignment = 创建订单处理人分配(已有, '2026-11-12T12:00:00Z', () => ['staff-03'])
      共享订单.value.push(已有)
      初始化拆单规则演示()
      const 样例 = 共享订单.value.filter(单 => 单.systemOrderNo.startsWith('OMS-SPLIT-'))
      expect(样例).toHaveLength(6)
      const 复用 = 样例.find(单 => 单.systemOrderNo === 已有.systemOrderNo)!
      expect(获取订单处理人(复用)).toEqual(['staff-03'])
      expect(复用.handlerAssignment?.assignedAt).toBe('2026-11-12T12:00:00Z')
      for (const 单 of 样例.filter(单 => 单 !== 复用)) {
        expect(单.handlerAssignment).toMatchObject({ assignedAt: 单.createdAt, source: 'SKU' })
        expect(单.handlerAssignment?.lines.map(行 => [行.externalLineId, 行.systemSku])).toEqual(单.items.map(行 => [行.externalLineId, 行.systemSku]))
        // 样例尚未维护运营人员时也保存已核对的缺失依据，不能伪造某位员工。
        expect(获取订单处理人(单)).toEqual([])
        expect(获取订单处理人缺失原因(单)).toEqual(单.items.map(行 => `${行.systemSku}：系统 SKU 无运营人员`))
      }
      const 历史缺记录 = 样例.find(单 => 单 !== 复用)!
      delete 历史缺记录.handlerAssignment
      const 查询前 = JSON.stringify(共享订单.value)
      读取拆单试算订单()
      初始化拆单规则演示()
      expect(JSON.stringify(共享订单.value)).toBe(查询前)
      expect(历史缺记录.handlerAssignment).toBeUndefined()
    } finally {
      共享订单.value = 原订单
      共享规则.value = 原规则
      关联演示数据.mappings.splice(0, 关联演示数据.mappings.length, ...原映射)
      关联演示数据.inventory.splice(0, 关联演示数据.inventory.length, ...原库存)
    }
  })
})
