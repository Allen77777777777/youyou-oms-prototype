import { 是未匹配审单异常, type 全渠道订单 } from '../全渠道订单/类型'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 共享规则 } from '../订单规则/演示会话'
import { 按规则优先级排序, 评估审单候选, 读取审单动作, type 订单规则 } from '../订单规则/规则逻辑'
import { 关联人工发货订单号, 人工发货组完整阻断原因 } from './拆合发货模型'
import { 人工发货上下文, 共享订单, 当前版本, 提交审核轮次, 记录审核结论, 是售后重发订单, 未匹配异常重跑阻断原因, 创建作业样例, type 规则轮次来源, type 规则分流结果 } from './演示会话'
import { 追加订单备注 } from './订单备注模型'
import { 共享审单执行设置 } from '../业务配置/规则执行设置'
import { 读取审单重跑状态, 记录已完成审单 } from './审单重跑'

type 执行明细 = { 订单号: string; 结果: 规则分流结果 | '跳过'; 原因: string }
export interface 审单规则执行结果 { 总数: number; 人工截留: number; 审核通过: number; 未匹配转异常: number; 发货条件拦截: number; 跳过: number; 明细: 执行明细[] }

function 执行审单(待审: 全渠道订单[], 来源: 规则轮次来源): 审单规则执行结果 {
  const 本轮时间 = Date.now()
  const 设置 = { ...共享审单执行设置.value }
  const 上下文 = 人工发货上下文()
  const 版本 = Object.fromEntries(待审.map(单 => [单.systemOrderNo, 当前版本(单.systemOrderNo)]))
  const 规则 = 按规则优先级排序(共享规则.value.filter(项 => 项.enabled && 项.type === '审单规则'))
  const 已处理 = new Set<string>()
  const 明细: 执行明细[] = []
  for (const 单 of 待审) {
    if (已处理.has(单.systemOrderNo)) continue
    const 关联号 = 关联人工发货订单号(上下文, [单.systemOrderNo])
    const 来源单 = 待审.filter(订单 => 关联号.includes(订单.systemOrderNo))
    for (const 订单 of 来源单) 已处理.add(订单.systemOrderNo)
    const 资格 = [...人工发货组完整阻断原因(上下文, 关联号)]
    if (来源单.length !== 关联号.length) 资格.push('发货安排部分来源缺失或不在本轮审单范围')
    if (来源单.some(订单 => 订单.reviews.some(项 => 项.status === '审核中'))) 资格.push('本轮审核尚未结束，请查看当前结果')
    if (来源单.some(是售后重发订单)) 资格.push('售后重发订单须人工审核，请在订单处理中核对后审核')
    for (const 订单 of 来源单) {
      if (是未匹配审单异常(订单)) 资格.push(...未匹配异常重跑阻断原因(订单).map(原因 => `${订单.systemOrderNo}：${原因}`))
      if (来源 === '定时执行') {
        const 重跑 = 读取审单重跑状态(订单, 设置, 本轮时间)
        if (!['未开始', '可重跑'].includes(重跑.状态)) 资格.push(`${订单.systemOrderNo}：${重跑.原因}`)
      }
    }
    if (资格.length) {
      for (const 订单 of 来源单) 明细.push({ 订单号: 订单.systemOrderNo, 结果: '跳过', 原因: 资格.join('；') })
      continue
    }
    const 判定 = 来源单.map(订单 => {
      let 首条: 订单规则 | undefined
      let 配置拦截 = ''
      for (const 项 of 规则) {
        const 候选 = 评估审单候选(项, 共享规则.value, 订单, 渠道会话.value)
        if (候选.configBlocks) {
          配置拦截 = `审单规则「${项.name}」配置待核实：${候选.configError}。本轮未完成，请修复后重新执行。`
          break
        }
        if (候选.matched) { 首条 = 项; break }
      }
      return { 订单, 首条, 配置拦截, 动作: 首条 && 读取审单动作(首条.action) }
    })
    if (来源单.some(订单 => 当前版本(订单.systemOrderNo) !== 版本[订单.systemOrderNo] ||
      (订单.processingStatus !== '待审核' && !是未匹配审单异常(订单)))) {
      for (const 订单 of 来源单) 明细.push({ 订单号: 订单.systemOrderNo, 结果: '跳过', 原因: '订单状态或版本已变化，请重新执行审单' })
      continue
    }
    if (判定.every(项 => 项.动作 === '自动审核')) {
      const 异常单 = 来源单.filter(是未匹配审单异常)
      const 命中说明 = 判定.map(({ 订单, 首条 }) => `${来源单.length > 1 ? 订单.systemOrderNo + '：' : ''}${是未匹配审单异常(订单) ? '原未匹配异常重新审单，' : ''}命中审单规则「${首条!.name}」，执行自动审核。`).join('')
      const 首轮单 = 来源单.filter(订单 => 订单.initialReviewPending)
      for (const 订单 of 首轮单) delete 订单.initialReviewPending
      // 同步命令内先解除唯一的未匹配原因，再复用完整审核。资格跳过会回滚，不留下无审核的状态变更。
      for (const 订单 of 异常单) { 订单.processingStatus = '待审核'; delete 订单.reviewExceptionCode }
      const 原轮数 = 单.reviews.length
      const 提交 = 提交审核轮次(单.systemOrderNo, 版本[单.systemOrderNo]!, '', 版本, { 来源, 命中说明 })
      const 结果 = 提交.成功 ? '审核通过' : 单.reviews.length > 原轮数 ? '发货条件拦截' : '跳过'
      if (结果 === '跳过') {
        for (const 订单 of 首轮单) 订单.initialReviewPending = true
        for (const 订单 of 异常单) { 订单.processingStatus = '异常'; 订单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH' }
      } else for (const 订单 of 来源单) 记录已完成审单(订单, 来源, 本轮时间)
      for (const 订单 of 来源单) 明细.push({ 订单号: 订单.systemOrderNo, 结果, 原因: 提交.信息 })
      continue
    }
    for (const { 订单, 首条, 动作, 配置拦截 } of 判定) {
      if (配置拦截) {
        明细.push({ 订单号: 订单.systemOrderNo, 结果: '跳过', 原因: 配置拦截 })
        continue
      }
      delete 订单.initialReviewPending
      let 结果: 规则分流结果
      let 原因: string
      if (!首条) {
        结果 = '未匹配转异常'
        原因 = `未匹配到审单规则，${是未匹配审单异常(订单) ? '保留' : '已转入'}异常 → 发货审核失败。在次数和期限内继续自动重跑，也可人工审核。`
        订单.processingStatus = '异常'
        订单.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
      } else if (动作 === '人工审核') {
        结果 = '人工截留'
        原因 = `命中审单规则「${首条.name}」，${是未匹配审单异常(订单) ? '由未匹配异常进入' : '留在'}待审核，请人工复核。${首条.orderNote?.trim() || ''}`
        订单.processingStatus = '待审核'
        delete 订单.reviewExceptionCode
        if (首条.orderNote?.trim()) 追加订单备注(订单.systemOrderNo, 首条.orderNote, 首条.id)
      } else {
        结果 = '发货条件拦截'
        原因 = `命中审单规则「${首条.name}」，合并发货方案仍有来源需人工处理，不能单独审核通过。请核对全部来源或撤销原方案。`
      }
      记录审核结论(订单, '自动审核', `${来源}审单规则`, false, 原因, 结果)
      记录已完成审单(订单, 来源, 本轮时间)
      明细.push({ 订单号: 订单.systemOrderNo, 结果, 原因 })
    }
  }
  const 统计: 审单规则执行结果 = { 总数: 明细.length, 人工截留: 0, 审核通过: 0, 未匹配转异常: 0, 发货条件拦截: 0, 跳过: 0, 明细 }
  for (const 行 of 明细) 统计[行.结果]++
  return 统计
}

/** 对待审核及仅未匹配异常的自配送订单执行，独立于分页、筛选及勾选；定时轮次按单限制重跑。 */
export function 执行待审核规则轮次(来源: '立即执行' | '定时执行'): 审单规则执行结果 {
  return 执行审单(共享订单.value.filter(单 => 单.fulfillmentMode === '自配送' && (单.processingStatus === '待审核' || 是未匹配审单异常(单))), 来源)
}

/** 本地接入已通过准入及 SKU 前置解析的平台样例；在同一同步调用中完成首轮，之后才开放作业。 */
export function 初始化新单首轮样例() {
  for (const [索引, 国家] of ['US', 'GB', 'CA'].entries()) {
    const 订单号 = `OMS-DEMO-REVIEW-${国家}`
    if (共享订单.value.some(单 => 单.systemOrderNo === 订单号)) continue
    const 新单 = 创建作业样例(40 + 索引, { systemOrderNo: 订单号, initialReviewPending: true, admissionReason: '平台订单已通过准入，已读取中台 SKU 映射。' })
    新单.address.countryCode = 国家
    共享订单.value.unshift(新单)
    执行审单([共享订单.value[0]!], '新单首轮')
  }
}
