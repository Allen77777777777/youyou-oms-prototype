import { shallowRef } from 'vue'
import { 共享订单, 仓库执行记录, 当前版本, 执行演示推单, 推单阻断原因, 记录操作 } from '../订单处理/演示会话'
import { 同步演示仓库状态 } from '../订单处理/操作功能模型'

interface 执行行 { fulfillmentNo: string; status: '已提交' | '拦截' | '跳过'; message: string }
export const 最近自动推单轮次 = shallowRef<{ time: string; submitted: number; blocked: number; skipped: number; rows: 执行行[] }>()
export const 自动推单调度错误 = shallowRef('')
// 自动化只认领扫描到的在途请求；默认关闭时不改动预置演示事实。
const 待回查 = new Set<string>()
let 执行中 = false

export function 运行自动推单轮次() {
  if (执行中) return
  执行中 = true
  try {
    const rows: 执行行[] = []
    const 履约号 = new Set(共享订单.value.filter(单 => 单.fulfillmentMode === '自配送' && 单.processingStatus === '待推单')
      .flatMap(单 => 单.fulfillmentOrders.filter(项 => 项.isActive).map(项 => 项.fulfillmentOrderNo)))
    for (const fulfillmentNo of 履约号) {
      const 来源 = 共享订单.value.filter(单 => 单.fulfillmentOrders.some(项 => 项.fulfillmentOrderNo === fulfillmentNo))
      const 订单 = 来源[0]!
      const 已有执行 = 仓库执行记录.value.filter(项 => 项.履约单号 === fulfillmentNo)
      if (已有执行.length) {
        if (已有执行.length === 1 && 已有执行[0]!.状态 === '下单中') 待回查.add(已有执行[0]!.出库单号)
        rows.push({ fulfillmentNo, status: '跳过', message: 已有执行.some(项 => 项.状态 === '下单失败') ? '原推单明确失败，请修复后人工重新推单' : '已有仓库执行，仅查询原请求，不重复推送' })
        continue
      }
      const 人工办理 = 来源.some(单 => 单.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === fulfillmentNo)?.autoPushHold)
      const 原因 = 人工办理 ? ['异常恢复的履约需人工推单；重新审核生成的新履约可按配置执行'] : 推单阻断原因(订单, fulfillmentNo)
      if (原因.length) {
        rows.push({ fulfillmentNo, status: '拦截', message: 原因.join('；') })
        continue
      }
      const 版本 = Object.fromEntries(来源.map(单 => [单.systemOrderNo, 当前版本(单.systemOrderNo)]))
      const 结果 = 执行演示推单(订单.systemOrderNo, fulfillmentNo, 版本[订单.systemOrderNo]!, 版本, '自动推单任务')
      rows.push({ fulfillmentNo, status: 结果.成功 ? '已提交' : '拦截', message: 结果.成功 ? '等待仓库明确建单，系统将自动同步结果' : 结果.信息 })
      if (结果.成功 && 结果.对象号) 待回查.add(结果.对象号)
    }
    最近自动推单轮次.value = { time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
      submitted: rows.filter(项 => 项.status === '已提交').length, blocked: rows.filter(项 => 项.status === '拦截').length,
      skipped: rows.filter(项 => 项.status === '跳过').length, rows }
    自动推单调度错误.value = ''
    return 最近自动推单轮次.value
  } finally { 执行中 = false }
}

export function 自动同步推单结果() {
  for (const 出库单号 of 待回查) {
    const 执行 = 仓库执行记录.value.find(项 => 项.出库单号 === 出库单号)
    if (!执行 || 执行.状态 !== '下单中') { 待回查.delete(出库单号); continue }
    const 结果 = 同步演示仓库状态(出库单号, '自动推单任务')
    if (!结果.成功) {
      for (const 订单 of 共享订单.value.filter(单 => 执行.订单号.includes(单.systemOrderNo))) {
        // 相同查询失败只记一次；原请求、仓单与发货事实均保留。
        const 内容 = `${出库单号}：${结果.信息}`
        if (!订单.operationLogs.some(项 => 项.operationType === '自动查询仓库失败' && 项.content === 内容)) 记录操作(订单, '自动查询仓库失败', 内容, false, '自动推单任务')
      }
    } else 待回查.delete(出库单号)
  }
}
