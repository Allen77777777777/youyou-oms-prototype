import { 渠道会话 } from '../仓配管理/仓配会话'
import { 共享规则 } from '../订单规则/演示会话'
import { 计算规则命中, 校验规则配置, type 订单规则 } from '../订单规则/规则逻辑'
import { 校验条件配置 } from '../订单规则/规则条件定义'
import { 关联人工发货订单号, 人工发货组完整阻断原因 } from './拆合发货模型'
import { 人工发货上下文, 共享订单, 当前版本, 审核资格原因, 提交审核轮次, type 规则轮次来源 } from './演示会话'
import { 追加订单备注 } from './订单备注模型'

type 执行明细 = { 订单号: string; 结果: '通过' | '拦截' | '跳过'; 原因: string }
export interface 审单规则执行结果 { 总数: number; 通过: number; 拦截: number; 跳过: number; 明细: 执行明细[] }

/** 共用一轮同步本地执行。范围固定为开始时待审核的自配送订单，不读取操作页面的分页、筛选或勾选。 */
export function 执行待审核规则轮次(来源: 规则轮次来源): 审单规则执行结果 {
  const 上下文 = 人工发货上下文()
  const 待审 = 共享订单.value.filter(单 => 单.processingStatus === '待审核' && 单.fulfillmentMode === '自配送')
  const 版本 = Object.fromEntries(待审.map(单 => [单.systemOrderNo, 当前版本(单.systemOrderNo)]))
  const 规则 = 共享规则.value.filter(项 => 项.enabled && 项.type === '审单规则').sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  const 已处理 = new Set<string>()
  const 明细: 执行明细[] = []
  for (const 单 of 待审) {
    if (已处理.has(单.systemOrderNo)) continue
    const 关联号 = 关联人工发货订单号(上下文, [单.systemOrderNo])
    const 来源单 = 待审.filter(订单 => 关联号.includes(订单.systemOrderNo))
    for (const 订单 of 来源单) 已处理.add(订单.systemOrderNo)
    const 资格 = [来源单.length !== 关联号.length ? '发货安排部分来源缺失或不在待审核队列' : '',
      ...人工发货组完整阻断原因(上下文, 关联号), ...来源单.map(审核资格原因)].filter(Boolean)
    if (资格.length) {
      for (const 订单 of 来源单) 明细.push({ 订单号: 订单.systemOrderNo, 结果: '跳过', 原因: [...new Set(资格)].join('；') })
      continue
    }
    const 拦截: string[] = []
    const 备注: { 订单号: string; 规则: 订单规则 }[] = []
    for (const 订单 of 来源单) {
      const 前缀 = 来源单.length > 1 ? `${订单.systemOrderNo}：` : ''
      for (const 项 of 规则) {
        const 配置错误 = 校验规则配置(项, 共享规则.value, 渠道会话.value)
        if (配置错误) {
          // 已确认的 AND 条件可以排除范围外订单。平台状态条件依赖 eBay 平台限制，不能拆开单独判断。
          const 明确范围外 = 项.mode === '全部满足' && 项.conditions
            .filter(条件 => 条件.field !== 'platformOrderStatus' && !校验条件配置(条件))
            .some(条件 => {
              const 判定 = 计算规则命中({ ...项, conditions: [条件], action: '留在待审核', orderNote: undefined }, 订单, 渠道会话.value)
              return !判定.matched && !判定.pending
            })
          if (!明确范围外) 拦截.push(`${前缀}审单规则「${项.name}」配置待核实：${配置错误}`)
          continue
        }
        const 判定 = 计算规则命中(项, 订单, 渠道会话.value)
        if (判定.matched) {
          拦截.push(`${前缀}命中审单规则「${项.name}」`)
          if (项.orderNote?.trim()) 备注.push({ 订单号: 订单.systemOrderNo, 规则: 项 })
        } else if (判定.pending) {
          拦截.push(`${前缀}审单规则「${项.name}」待核实：${判定.unknownFields.join('、')}`)
        }
      }
    }
    const 轮次前 = 单.reviews.length
    const 结果 = 提交审核轮次(单.systemOrderNo, 版本[单.systemOrderNo]!, '', 版本, { 来源, 拦截 })
    const 已执行 = 单.reviews.length > 轮次前
    if (已执行) {
      for (const 项 of 备注) 追加订单备注(项.订单号, 项.规则.orderNote!, 项.规则.id)
    }
    for (const 订单 of 来源单) 明细.push({ 订单号: 订单.systemOrderNo, 结果: 结果.成功 ? '通过' : 已执行 ? '拦截' : '跳过', 原因: 结果.信息 })
  }
  return { 总数: 明细.length, 通过: 明细.filter(项 => 项.结果 === '通过').length, 拦截: 明细.filter(项 => 项.结果 === '拦截').length, 跳过: 明细.filter(项 => 项.结果 === '跳过').length, 明细 }
}
