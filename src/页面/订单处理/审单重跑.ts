import { 是未匹配审单异常, type 全渠道订单 } from '../全渠道订单/类型'

export interface 审单重跑限制 { dailyRetryLimit: number; retryDays: number }
export type 审单重跑状态 = '未开始' | '可重跑' | '今日已达上限' | '已到期' | '已退出' | '待核查'

const 一天 = 86_400_000
/** 北京自然日，不依赖浏览器或执行主机时区。 */
export function 审单重跑日期(now: number) { return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10) }

export function 读取审单重跑状态(订单: 全渠道订单, 设置: 审单重跑限制, now = Date.now()): {
  状态: 审单重跑状态; 原因: string; 今日次数: number; 截止时间?: string
} {
  const 记录 = 订单.reviewRetry
  const 今日次数 = 记录?.dailyDate === 审单重跑日期(now) ? 记录.dailyCount : 0
  if (订单.fulfillmentMode !== '自配送' || (订单.processingStatus !== '待审核' && !是未匹配审单异常(订单)) ||
    (订单.orderType === '手工订单' && 订单.manualOrder?.scenario === '售后补寄' && !!订单.manualOrder.afterSaleNo)) {
    return { 状态: '已退出', 原因: '当前订单不参加自动审单重跑', 今日次数 }
  }
  if (!记录) return { 状态: '未开始', 原因: '首次完成审单后开始计算重跑期限，首轮不计重跑次数', 今日次数 }
  const 起点 = Date.parse(记录.firstCompletedAt)
  if (!Number.isFinite(起点) || 起点 > now || !Number.isSafeInteger(记录.dailyCount) || 记录.dailyCount < 0 ||
    !Number.isSafeInteger(记录.totalCount) || 记录.totalCount < 记录.dailyCount ||
    !Number.isInteger(设置.retryDays) || 设置.retryDays < 1 || 设置.retryDays > 30 ||
    !Number.isInteger(设置.dailyRetryLimit) || 设置.dailyRetryLimit < 1 || 设置.dailyRetryLimit > 24) {
    return { 状态: '待核查', 原因: '审单重跑时间、次数或配置无效，请人工核对', 今日次数 }
  }
  const 截止 = 起点 + 设置.retryDays * 一天
  const 截止时间 = new Date(截止).toISOString()
  if (now >= 截止) return { 状态: '已到期', 原因: '已达到重跑天数上限，停止自动重跑，待人工处理', 今日次数, 截止时间 }
  if (今日次数 >= 设置.dailyRetryLimit) return { 状态: '今日已达上限', 原因: '已达到每日重跑次数上限，次日继续，人工操作不受影响', 今日次数, 截止时间 }
  return { 状态: '可重跑', 原因: '等待下一次定时审单', 今日次数, 截止时间 }
}

/** 只在确实完成规则判定后写入；资格、配置和额度跳过均不调用。 */
export function 记录已完成审单(订单: 全渠道订单, 来源: '立即执行' | '定时执行' | '新单首轮', now = Date.now()) {
  const 日期 = 审单重跑日期(now)
  if (!订单.reviewRetry) {
    // 无起点的存量样例从首次完成的新轮次开始，不把旧审核或订单日期补造为起点。
    订单.reviewRetry = { firstCompletedAt: new Date(now).toISOString(), dailyDate: 日期, dailyCount: 0, totalCount: 0 }
    return
  }
  if (来源 !== '定时执行') return
  if (订单.reviewRetry.dailyDate !== 日期) {
    订单.reviewRetry.dailyDate = 日期
    订单.reviewRetry.dailyCount = 0
  }
  订单.reviewRetry.dailyCount++
  订单.reviewRetry.totalCount++
}
