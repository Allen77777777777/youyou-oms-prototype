import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 共享规则, 共享规则日志, 写入规则配置, 移动规则优先级 } from '../订单规则/演示会话'
import { 试算规则 } from '../订单规则/规则逻辑'
import { 创建空条件 } from '../订单规则/规则条件定义'
import { 人工发货上下文, 共享订单, 当前版本, 执行演示审核, 执行异常人工审核, 专项人工审核权限, 操作核查证据, 订单版本, 仓库执行记录, 演示路由, 演示库存 } from './演示会话'
import { 执行待审核规则轮次, 初始化新单首轮样例 } from './审单规则执行'
import { 共享订单备注 } from './订单备注模型'
import { 创建合并发货草稿, 创建拆分发货草稿, 保存人工发货方案, 撤销人工发货方案 } from './拆合发货模型'
import { 运行自动推单轮次 } from '../业务配置/自动推单执行'
import { 保存审单执行设置 } from '../业务配置/规则执行设置'
import { 启动循环审单 } from '../业务配置/循环审单'

const 克隆 = <T>(值: T): T => JSON.parse(JSON.stringify(值))
const 模板 = 克隆(共享订单.value.find(单 => 单.systemOrderNo === 'OMS260912000001')!)
const 拆单模板 = 克隆(共享订单.value.find(单 => 单.systemOrderNo === 'OMS-DEMO-SPLIT-01')!)
const 策略 = 克隆(共享规则.value.find(项 => 项.id === 'RULE-REVIEW-01')!)
const 初始规则 = 克隆(共享规则.value)
function 订单(编号: string, 修改: Partial<全渠道订单> = {}) {
  return { ...克隆(模板), systemOrderNo: 编号, platformOrderId: 编号, ...修改 }
}
const 人工 = { ...策略, action: '留在待审核', orderNote: '包装尺寸需复核' }
const 自动 = { ...策略, id: '自动', name: '准入订单放行', action: '自动审核', priority: 20 }

beforeEach(() => {
  保存审单执行设置({ enabled: false, intervalHours: 2, dailyRetryLimit: 3, retryDays: 3 })
  共享订单.value = []
  共享规则.value = 克隆([人工, 自动])
  共享订单备注.value = []
  订单版本.value = {}
  操作核查证据.value = {}
  仓库执行记录.value = []
  专项人工审核权限.value = true
})
afterEach(() => vi.useRealTimers())

describe('正式审单三种去向', () => {
  it('编辑为同值和随后拖动时，正式首命中与试算同步使用已保存顺序', () => {
    const 首条 = { ...克隆(人工), id: 'Z' }
    const 次条 = { ...克隆(自动), id: 'A' }
    共享规则.value = [次条, 首条] // 初始存储、ID 顺序均与数字优先级相反。
    共享订单.value = [订单('同值')]
    const 单 = 共享订单.value[0]!
    写入规则配置({ ...次条, priority: 首条.priority })
    expect(试算规则(共享规则.value, 单, '审单规则').hit?.id).toBe('Z')
    expect(执行待审核规则轮次('立即执行').人工截留).toBe(1)

    const 原日志 = 共享规则日志.value.slice()
    try {
      expect(移动规则优先级('A', 'Z')).toBe(true)
      expect(共享规则.value.map(项 => [项.id, 项.priority])).toEqual([['A', 首条.priority], ['Z', 首条.priority]])
      expect(试算规则(共享规则.value, 单, '审单规则').hit?.id).toBe('A')
      expect(执行待审核规则轮次('定时执行').审核通过).toBe(1)
    } finally {
      共享规则日志.value = 原日志
    }
  })
  it('定时任务按最新资料重新判断已截留订单，命中相同规则时保留待审核且备注去重', async () => {
    共享订单.value = [订单('定时复核')]
    const 单 = 共享订单.value[0]!
    expect(执行待审核规则轮次('立即执行').人工截留).toBe(1)
    vi.useFakeTimers()
    const 作用域 = effectScope()
    try {
      保存审单执行设置({ enabled: true, intervalHours: 1 })
      作用域.run(启动循环审单)
      await vi.advanceTimersByTimeAsync(3_600_000)
      await vi.dynamicImportSettled()
      expect(单.processingStatus).toBe('待审核')
      expect(单.reviews[1]).toMatchObject({ triggerSource: '定时执行审单规则', ruleOutcome: '人工截留' })
      expect(共享订单备注.value).toHaveLength(1)
      单.address.countryCode = 'CA'
      await vi.advanceTimersByTimeAsync(3_600_000)
      await vi.dynamicImportSettled()
      expect(单.reviews[2]).toMatchObject({ triggerSource: '定时执行审单规则', ruleOutcome: '未匹配转异常' })
      expect(单.processingStatus).toBe('异常')
      expect(单.fulfillmentOrders).toHaveLength(0)
    } finally {
      作用域.stop()
      保存审单执行设置({ enabled: false, intervalHours: 2 })
      vi.useRealTimers()
    }
  })
  it('首条人工截留只写该条备注；交换优先级后定时轮次自动通过，重复运行不重复建履约', () => {
    共享订单.value = [订单('需复核')]
    const 单 = 共享订单.value[0]!
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 1, 人工截留: 1 })
    expect(单.reviews[0]).toMatchObject({ type: '自动审核', status: '已拦截', triggerSource: '立即执行审单规则', ruleOutcome: '人工截留' })
    expect(单.reviews[0]!.decisionNote).not.toContain(自动.name)
    expect(共享订单备注.value.map(项 => 项.rule_id)).toEqual([人工.id])
    expect(执行待审核规则轮次('立即执行').人工截留).toBe(1)
    expect(共享订单备注.value).toHaveLength(1)
    共享规则.value[1]!.priority = 1
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 审核通过: 1, 人工截留: 0 })
    expect(单.reviews[单.reviews.length - 1]).toMatchObject({ status: '已通过', ruleOutcome: '审核通过' })
    expect(单.reviews[单.reviews.length - 1]!.decisionNote).toContain(自动.name)
    expect(单.processingStatus).toBe('待推单')
    expect(执行待审核规则轮次('定时执行').总数).toBe(0)
    expect(单.fulfillmentOrders).toHaveLength(1)
    expect(仓库执行记录.value).toHaveLength(0)
  })
  it('无启用、条件未知、明确范围外均可未匹配；有有效下位匹配按该条审核', () => {
    共享规则.value[0]!.conditions.push({ ...创建空条件('orderWeight'), lowerEnabled: true, value: '20', upperEnabled: false })
    共享订单.value = [订单('待核实'), 订单('范围外')]
    共享订单.value[1]!.address.countryCode = 'CA'
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 2, 审核通过: 1, 未匹配转异常: 1 })
    共享规则.value = []
    共享订单.value.push(订单('空规则'))
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 2, 未匹配转异常: 2 })
    expect(共享订单备注.value).toHaveLength(0)
  })
  it('未明配置优先于放行时跳过，无法证明范围外不转异常；已命中后不再受下位坏配置影响', () => {
    共享规则.value[0]!.action = '旧动作'
    共享订单.value = [订单('范围内'), 订单('范围外')]
    共享订单.value[1]!.address.countryCode = 'CA'
    const 结果 = 执行待审核规则轮次('立即执行')
    expect(结果).toMatchObject({ 总数: 2, 未匹配转异常: 1, 跳过: 1 })
    expect(结果.明细[0]!.原因).toContain('配置待核实')
    expect(共享订单.value[0]!.reviews).toHaveLength(0)
    共享规则.value[1]!.priority = 1
    expect(执行待审核规则轮次('定时执行').审核通过).toBe(1)
  })
  it('自动命中后发货资料拦截，部分履约可被人工规则截留，普通人工提交仍核实剩余', () => {
    共享规则.value = [克隆(自动)]
    共享订单.value = [订单('缺仓'), 订单('正常'), 订单('在审', { reviews: [{ round: 1, type: '自动审核', triggerSource: '历史', status: '审核中' }] })]
    共享订单.value[0]!.defaultRoute = undefined
    const 结果 = 执行待审核规则轮次('立即执行')
    expect(结果).toMatchObject({ 总数: 3, 发货条件拦截: 1, 审核通过: 1, 跳过: 1, 未匹配转异常: 0 })
    expect(结果.明细[0]!.原因).toContain('未分配发货仓库')
    expect(共享订单.value[0]!.processingStatus).toBe('待审核')
    共享规则.value = [克隆(人工)]
    共享订单.value = [订单('部分', { platformOrderStatus: 'IN_PROGRESS' })]
    expect(执行待审核规则轮次('立即执行').人工截留).toBe(1)
    expect(执行演示审核('部分', 当前版本('部分')).成功).toBe(false)
    操作核查证据.value['部分'] = { 平台允许: true, 剩余已核实: true, 零出库已核实: true }
    expect(执行演示审核('部分', 当前版本('部分')).成功).toBe(true)
  })
  it('合并来源逐单分流，有未匹配单不会局部生成共享履约，完整撤销后可单笔审核', () => {
    共享订单.value = [订单('合并A'), 订单('合并B')]
    const [甲, 乙] = 共享订单.value
    甲!.address.buyerMessage = '验货'; 乙!.address.buyerMessage = '无'
    共享规则.value = [{ ...克隆(自动), conditions: [{ field: 'buyerMessage', operator: '包含', value: '验货' }] }]
    const 方案 = 创建合并发货草稿(共享订单.value)
    方案.packages[0]!.route = { ...甲!.defaultRoute! }
    expect(保存人工发货方案(人工发货上下文(), 方案, { 合并A: 1, 合并B: 1 }).成功).toBe(true)
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 总数: 2, 未匹配转异常: 1, 发货条件拦截: 1 })
    expect(甲!.fulfillmentOrders).toHaveLength(0)
    expect(执行异常人工审核('合并B', 当前版本('合并B')).信息).toContain('先撤销')
    expect(撤销人工发货方案(人工发货上下文(), 方案.orderNos, { 合并A: 当前版本('合并A'), 合并B: 当前版本('合并B') }, '分别发货').成功).toBe(true)
    expect(执行异常人工审核('合并B', 当前版本('合并B')).成功).toBe(true)
    expect(执行演示审核('合并A', 当前版本('合并A')).成功).toBe(true)
  })
  it('专项审核通过生成唯一履约，下一推单轮次复验当前条件，受理后不重复推仓', () => {
    共享规则.value = []
    共享订单.value = [订单('未匹配'), 订单('其他', { processingStatus: '异常', blockReason: '未匹配到审单规则' })]
    const 单 = 共享订单.value[0]!
    执行待审核规则轮次('立即执行')
    expect(单.reviewExceptionCode).toBe('NO_REVIEW_RULE_MATCH')
    expect(执行异常人工审核('其他', 1).成功).toBe(false)
    专项人工审核权限.value = false
    expect(执行异常人工审核('未匹配', 当前版本('未匹配')).成功).toBe(false)
    专项人工审核权限.value = true
    单.blockReason = '付款变化，请复核'
    expect(执行异常人工审核('未匹配', 当前版本('未匹配')).信息).toContain('付款变化')
    expect(单.processingStatus).toBe('异常')
    expect(单.fulfillmentOrders).toHaveLength(0)
    expect(单.reviews[单.reviews.length - 1]).toMatchObject({ type: '人工审核', status: '已拦截', decisionNote: expect.stringContaining('付款变化') })
    delete 单.blockReason
    const 版本 = 当前版本('未匹配')
    expect(执行异常人工审核('未匹配', 版本).成功).toBe(true)
    expect(执行异常人工审核('未匹配', 版本).成功).toBe(false)
    expect(单.processingStatus).toBe('待推单')
    expect(单.reviewExceptionCode).toBeUndefined()
    expect(单.fulfillmentOrders).toHaveLength(1)
    expect(单.fulfillmentOrders[0]!.autoPushHold).toBeUndefined()
    expect(仓库执行记录.value).toHaveLength(0)
    操作核查证据.value['未匹配'] = { 平台允许: false, 剩余已核实: true, 零出库已核实: true }
    expect(运行自动推单轮次()).toMatchObject({ blocked: 1, submitted: 0 })
    expect(仓库执行记录.value).toHaveLength(0)
    操作核查证据.value['未匹配']!.平台允许 = true
    expect(运行自动推单轮次()?.submitted).toBe(1)
    expect(运行自动推单轮次()).toMatchObject({ submitted: 0, skipped: 1 })
    expect(仓库执行记录.value).toHaveLength(1)
  })
  it('专项审核按原拆分方案生成待推单履约，每个包裹独立接受推单校验', () => {
    共享规则.value = []
    共享订单.value = [克隆(拆单模板)]
    const 单 = 共享订单.value[0]!
    const 方案 = 创建拆分发货草稿(单)
    方案.packages[0]!.route = { ...演示路由[0]! }
    方案.packages[1]!.route = { ...演示路由[1]! }
    expect(保存人工发货方案(人工发货上下文(), 方案, { [单.systemOrderNo]: 当前版本(单.systemOrderNo) }).成功).toBe(true)
    expect(执行待审核规则轮次('立即执行').未匹配转异常).toBe(1)
    expect(执行异常人工审核(单.systemOrderNo, 当前版本(单.systemOrderNo)).成功).toBe(true)
    expect(单.fulfillmentOrders).toHaveLength(2)
    expect(仓库执行记录.value).toHaveLength(0)
    expect(运行自动推单轮次()?.submitted).toBe(2)
    expect(new Set(仓库执行记录.value.map(项 => 项.履约单号))).toEqual(new Set(单.fulfillmentOrders.map(项 => 项.fulfillmentOrderNo)))
    expect(运行自动推单轮次()).toMatchObject({ submitted: 0, skipped: 2 })
  })
  it('平台样例只初始化一次，作业开放前已经执行首轮；无法判定配置的首轮可修复后重跑', () => {
    共享规则.value = 初始规则
    初始化新单首轮样例()
    初始化新单首轮样例()
    expect(共享订单.value.map(单 => [单.address.countryCode, 单.processingStatus, 单.reviews.length])).toEqual([['CA', '异常', 1], ['GB', '待推单', 1], ['US', '待审核', 1]])
    共享订单.value = []
    共享规则.value = [{ ...人工, action: '非法动作' }]
    初始化新单首轮样例()
    const 美国 = 共享订单.value.find(单 => 单.address.countryCode === 'US')!
    expect(美国.initialReviewPending).toBe(true)
    expect(执行演示审核(美国.systemOrderNo, 当前版本(美国.systemOrderNo)).成功).toBe(false)
    共享规则.value = [克隆(自动)]
    expect(执行待审核规则轮次('立即执行').审核通过).toBe(1)
    expect(美国.initialReviewPending).toBeUndefined()
  })
})

describe('有限重跑与未匹配异常恢复', () => {
  it('异常命中人工回待审，跨状态共用次数；随后命中自动生成唯一履约并参加原自动推单', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-06T02:00:00Z')
    共享订单.value = [订单('跨状态')]
    const 单 = 共享订单.value[0]!
    共享规则.value = []
    执行待审核规则轮次('立即执行')
    const 起点 = 单.reviewRetry!.firstCompletedAt
    expect(单.reviewRetry!.dailyCount).toBe(0)
    共享规则.value = 克隆([人工, 自动])
    expect(执行待审核规则轮次('定时执行').人工截留).toBe(1)
    expect(单.processingStatus).toBe('待审核')
    expect(单.reviewExceptionCode).toBeUndefined()
    expect(单.reviews[单.reviews.length - 1]?.decisionNote).toContain('由未匹配异常进入待审核')
    共享规则.value = []
    expect(执行待审核规则轮次('定时执行').未匹配转异常).toBe(1)
    expect(单.reviewRetry).toMatchObject({ firstCompletedAt: 起点, dailyCount: 2, totalCount: 2 })
    共享规则.value = [克隆(自动)]
    expect(执行待审核规则轮次('定时执行').审核通过).toBe(1)
    expect(单.processingStatus).toBe('待推单')
    expect(单.reviewRetry).toMatchObject({ firstCompletedAt: 起点, dailyCount: 3 })
    expect(单.fulfillmentOrders).toHaveLength(1)
    expect(执行待审核规则轮次('定时执行').总数).toBe(0)
    expect(运行自动推单轮次()?.submitted).toBe(1)
    expect(运行自动推单轮次()?.submitted).toBe(0)
    expect(仓库执行记录.value).toHaveLength(1)
  })

  it('命中自动但库存或路由不齐，解除未匹配原因并回待审核；修复后可再次通过', () => {
    共享订单.value = [订单('缺项'), 订单('缺库')]
    共享订单.value[0]!.defaultRoute = undefined
    演示库存.value['缺库'] = '不足'
    try {
      共享规则.value = []
      执行待审核规则轮次('立即执行')
      共享规则.value = [克隆(自动)]
      expect(执行待审核规则轮次('定时执行')).toMatchObject({ 发货条件拦截: 2, 审核通过: 0 })
      for (const 单 of 共享订单.value) {
        expect(单.processingStatus).toBe('待审核')
        expect(单.reviewExceptionCode).toBeUndefined()
        expect(单.fulfillmentOrders).toHaveLength(0)
        expect(单.reviewRetry?.dailyCount).toBe(1)
      }
      const 缺项审核 = 共享订单.value[0]!.reviews
      expect(缺项审核[缺项审核.length - 1]?.decisionNote).toContain('未分配发货仓库')
      共享订单.value[0]!.defaultRoute = 克隆(模板.defaultRoute!)
      演示库存.value['缺库'] = '充足'
      expect(执行待审核规则轮次('定时执行').审核通过).toBe(2)
    } finally { delete 演示库存.value['缺库'] }
  })

  it('同日上限不新增审核或操作日志，次日恢复额度，人工执行不消耗或清零', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-06T15:00:00Z')
    保存审单执行设置({ enabled: false, intervalHours: 1, dailyRetryLimit: 1, retryDays: 3 })
    共享订单.value = [订单('额度')]
    共享规则.value = []
    const 单 = 共享订单.value[0]!
    执行待审核规则轮次('立即执行')
    const 起点 = 单.reviewRetry!.firstCompletedAt
    执行待审核规则轮次('定时执行')
    const 轮数 = 单.reviews.length, 日志数 = 单.operationLogs.length
    expect(执行待审核规则轮次('定时执行').明细[0]).toMatchObject({ 结果: '跳过', 原因: expect.stringContaining('每日重跑次数上限') })
    expect(单.reviews).toHaveLength(轮数)
    expect(单.operationLogs).toHaveLength(日志数)
    执行待审核规则轮次('立即执行')
    expect(单.reviewRetry).toMatchObject({ firstCompletedAt: 起点, dailyCount: 1, totalCount: 1 })
    expect(执行待审核规则轮次('定时执行').跳过).toBe(1)
    vi.setSystemTime('2026-11-06T16:00:00Z')
    expect(执行待审核规则轮次('定时执行').未匹配转异常).toBe(1)
    expect(单.reviewRetry).toMatchObject({ firstCompletedAt: 起点, dailyDate: '2026-11-07', dailyCount: 1, totalCount: 2 })
  })

  it('达到期限保留当前待审或异常状态；人工重新执行不重置期限', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-06T02:00:00Z')
    保存审单执行设置({ enabled: false, intervalHours: 2, dailyRetryLimit: 3, retryDays: 1 })
    共享订单.value = [订单('已过期待审'), 订单('已过期异常')]
    共享订单.value[1]!.address.countryCode = 'CA'
    执行待审核规则轮次('立即执行')
    const 期限起点 = 共享订单.value.map(单 => 单.reviewRetry!.firstCompletedAt)
    vi.setSystemTime('2026-11-07T02:00:00Z')
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 2, 跳过: 2 })
    expect(共享订单.value.map(单 => [单.processingStatus, 单.reviews.length])).toEqual([['待审核', 1], ['异常', 1]])
    expect(执行待审核规则轮次('立即执行')).toMatchObject({ 人工截留: 1, 未匹配转异常: 1 })
    expect(共享订单.value.map(单 => 单.reviewRetry!.firstCompletedAt)).toEqual(期限起点)
    expect(执行待审核规则轮次('定时执行').跳过).toBe(2)
  })

  it('其他异常不取单，带未匹配代码的取消、付款、历史出库、在审及原仓请求仍须人工核查', () => {
    const 未匹配: Partial<全渠道订单> = { processingStatus: '异常', reviewExceptionCode: 'NO_REVIEW_RULE_MATCH' }
    共享订单.value = [
      订单('其他异常', { processingStatus: '异常' }),
      订单('取消', { ...未匹配, cancelledAt: '2026-11-06 10:00:00' }),
      订单('付款', 未匹配),
      订单('出库', { ...未匹配, fulfillmentOrders: [{ fulfillmentOrderNo: '旧履约', isActive: false, status: '已终止', route: 模板.defaultRoute!, shippedQuantity: 1, plannedQuantity: 2 }] }),
      订单('原仓', 未匹配),
      订单('在审', { ...未匹配, reviews: [{ type: '自动审核', round: 1, triggerSource: '其他任务', status: '审核中' }] }),
    ]
    操作核查证据.value['付款'] = { 平台允许: false, 剩余已核实: true, 零出库已核实: true }
    仓库执行记录.value.push({ 订单号: ['原仓'], 履约单号: 'UNKNOWN', 出库单号: 'DEMO-UNKNOWN', 状态: '下单中', 待核查: true, 原因: '仓库受理结果未知', 更新时间: '2026-11-06 10:00:00 UTC+8' })
    共享规则.value = [克隆(自动)]
    expect(执行待审核规则轮次('定时执行')).toMatchObject({ 总数: 5, 跳过: 5, 审核通过: 0 })
    expect(共享订单.value.every(单 => 单.processingStatus === '异常' && !单.reviewRetry)).toBe(true)
    expect(共享订单.value.reduce((和, 单) => 和 + 单.reviews.filter(项 => 项.status !== '审核中').length, 0)).toBe(0)
    共享规则.value = [克隆(人工)]
    expect(执行待审核规则轮次('立即执行').跳过).toBe(5)
    expect(共享订单.value.every(单 => 单.processingStatus === '异常')).toBe(true)
  })

  it('无效规则跳过不计次、不建起点；修复后首次完成才起算', () => {
    共享订单.value = [订单('坏配置')]
    const 单 = 共享订单.value[0]!
    共享规则.value = [{ ...克隆(人工), action: '无效动作' }]
    expect(执行待审核规则轮次('定时执行').跳过).toBe(1)
    expect(单.reviewRetry).toBeUndefined()
    expect(单.reviews).toHaveLength(0)
    共享规则.value = [克隆(人工)]
    expect(执行待审核规则轮次('定时执行').人工截留).toBe(1)
    expect(单.reviewRetry?.dailyCount).toBe(0)
    共享规则.value[0]!.action = '无效动作'
    expect(执行待审核规则轮次('定时执行').跳过).toBe(1)
    expect(单.reviewRetry?.dailyCount).toBe(0)
    expect(单.reviews).toHaveLength(1)
  })

  it.each([1, null])('仓单已取消也不覆盖已出库或未知出库数量 %s', (出库量) => {
    const 单 = 订单('取消仓单', { processingStatus: '异常', reviewExceptionCode: 'NO_REVIEW_RULE_MATCH', fulfillmentOrders: [{ fulfillmentOrderNo: '历史履约', status: '已终止', isActive: false, route: 模板.defaultRoute!, plannedQuantity: 1, shippedQuantity: 0 }] })
    共享订单.value = [单]
    仓库执行记录.value.push({ 订单号: ['取消仓单'], 履约单号: '历史履约', 出库单号: 'DEMO-CANCELED', 状态: '已取消', 待核查: false, 原因: '', 更新时间: '2026-11-06 10:00:00 UTC+8', 出库事实: { planned: 1, shipped: 出库量, tracking: null, shippedAt: null } })
    共享规则.value = [克隆(自动)]
    expect(执行待审核规则轮次('定时执行').明细[0]).toMatchObject({ 结果: '跳过', 原因: expect.stringContaining('出库数量未知') })
    expect(共享订单.value[0]!.processingStatus).toBe('异常')
    expect(共享订单.value[0]!.reviews).toHaveLength(0)
  })

  it('合并组有异常来源或额度不足时整组跳过，不单独恢复和生成履约', () => {
    共享订单.value = [订单('组A'), 订单('组B')]
    const 方案 = 创建合并发货草稿(共享订单.value)
    方案.packages[0]!.route = 克隆(模板.defaultRoute!)
    expect(保存人工发货方案(人工发货上下文(), 方案, { 组A: 1, 组B: 1 }).成功).toBe(true)
    执行待审核规则轮次('立即执行')
    const [甲, 乙] = 共享订单.value
    甲!.reviewRetry!.dailyCount = 3
    甲!.reviewRetry!.totalCount = 3
    共享规则.value = [克隆(自动)]
    expect(执行待审核规则轮次('定时执行').跳过).toBe(2)
    expect(乙!.reviewRetry!.dailyCount).toBe(0)
    甲!.reviewRetry!.dailyCount = 0
    甲!.processingStatus = '异常'; 甲!.reviewExceptionCode = 'NO_REVIEW_RULE_MATCH'
    expect(执行待审核规则轮次('立即执行').跳过).toBe(2)
    expect(甲!.processingStatus).toBe('异常')
    expect(乙!.processingStatus).toBe('待审核')
    expect(共享订单.value.every(单 => 单.fulfillmentOrders.length === 0)).toBe(true)
  })
})
