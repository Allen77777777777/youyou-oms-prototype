import { describe, expect, it } from 'vitest'
import { 全渠道订单模拟数据 } from '../全渠道订单/模拟数据'
import { 创建规则样例, 命中规则, 试算规则 } from './规则逻辑'

describe('订单规则本地试算', () => {
  it('停用或无条件规则不会意外匹配所有订单', () => { const 规则 = 创建规则样例()[0]!; const 单 = 全渠道订单模拟数据[0]!; 规则.enabled = false; expect(命中规则(规则, 单)).toBe(false); 规则.enabled = true; 规则.conditions = []; expect(命中规则(规则, 单)).toBe(false) })
  it('AND 与 OR 条件表达式分别计算', () => { const 规则 = 创建规则样例()[0]!; 规则.conditions[1]!.value = 'DE'; expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(false); 规则.mode = '任一满足'; expect(命中规则(规则, 全渠道订单模拟数据[0]!)).toBe(true) })
  it('按优先级保留所有命中轨迹，但候选只有首条', () => { const 规则 = 创建规则样例().filter(项 => 项.type === '分仓规则'); 规则[1]!.enabled = true; 规则[1]!.priority = 1; const 结果 = 试算规则(规则, 全渠道订单模拟数据[0]!, '分仓规则'); expect(结果.hit?.id).toBe('RULE-ROUTE-02'); expect(结果.trace.filter(条 => 条.matched)).toHaveLength(2) })
  it('条件命中不能绕过订单处理阶段门禁，也不写入订单', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); const 原状态 = 单.processingStatus; const 原路由 = structuredClone(单.defaultRoute); const 结果 = 试算规则(创建规则样例(), 单, '分仓规则'); expect(结果.hit).toBeDefined(); expect(结果.gates).toContain('审单与首次路由分配只在待审核阶段执行'); expect(单.processingStatus).toBe(原状态); expect(单.defaultRoute).toEqual(原路由) })
  it('没有有效出库时标发规则只能返回候选并显示门禁', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.fulfillmentOrders = []; const 结果 = 试算规则(创建规则样例(), 单, '订单标发规则'); expect(结果.hit).toBeDefined(); expect(结果.gates).toContain('未取得有效出库事实，不得标发') })
  it('标准订单付款时间只用于展示，不作为规则试算门禁', () => { const 单 = structuredClone(全渠道订单模拟数据[0]!); 单.processingStatus = '待审核'; 单.paidAt = undefined; const 结果 = 试算规则(创建规则样例(), 单, '审单规则'); expect(结果.gates.join('；')).not.toContain('付款') })
})
