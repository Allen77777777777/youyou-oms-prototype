import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type EffectScope } from 'vue'
import { 共享订单, 创建作业样例, 提交审核轮次, 当前版本 } from './演示会话'
import { 共享规则 } from '../订单规则/演示会话'
import { 共享自动合单设置, 保存自动合单设置 } from '../业务配置/自动合单设置'
import { 启动循环合单 } from '../业务配置/循环合单'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
import { 共享合单记录, 共享合单执行结果, 订单正在等单 } from './自动合单状态'
import { 订单到达合单节点, 接入下一张合单节点样例, 执行合单轮次 } from './自动合单会话'
import { 创建自动合单样例 } from './自动合单演示'
import { 执行待审核规则轮次 } from './审单规则执行'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const originalOrders = clone(共享订单.value), originalRules = clone(共享规则.value), originalSettings = clone(共享自动合单设置.value)
const minute = 60_000
const start = Date.parse('2026-11-13T02:00:00Z') // 北京时间 10:00
const ready = { skuResolution: '已完成', giftProcessing: '不适用', splitProcessing: '未拆单' } as const
let scope: EffectScope
function enable(mode: 'basic' | 'advanced', scheduled = false) {
  保存自动合单设置({ enabled: true, intervalMinutes: 30, policy: { ...创建默认合单动作(), mode, ...(scheduled ? { releaseMode: 'scheduled' as const, releaseTimes: ['10:50'] } : {}) } })
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start)
  共享订单.value = []; 共享规则.value = clone(originalRules)
  共享合单记录.value = []; 共享合单执行结果.value = null
  共享自动合单设置.value = { ...clone(originalSettings), enabled: false, intervalMinutes: 30, version: 1, policy: 创建默认合单动作() }
  scope = effectScope(); scope.run(启动循环合单)
})
afterEach(() => {
  scope.stop(); vi.useRealTimers()
  共享订单.value = clone(originalOrders); 共享规则.value = clone(originalRules); 共享自动合单设置.value = clone(originalSettings)
  共享合单记录.value = []; 共享合单执行结果.value = null
})

describe('前置完成后到达合单节点', () => {
  it('高级实时接入第二张即放，不等下一轮；重复通知和后续扫描均不重入', async () => {
    enable('advanced')
    await vi.advanceTimersByTimeAsync(5 * minute)
    const first = 接入下一张合单节点样例()
    expect(first.成功).toBe(true)
    expect(first.信息).toContain('等单中')
    expect(共享合单记录.value[0]).toMatchObject({ orderNo: first.订单号, enteredAt: start + 5 * minute, deadlineAt: start + 125 * minute, status: '等单中' })
    await vi.advanceTimersByTimeAsync(35 * minute)
    const second = 接入下一张合单节点样例()
    expect(second.信息).toContain('已放单')
    expect(共享合单记录.value).toHaveLength(2)
    expect(共享合单记录.value.every(record => record.status === '已放单' && record.releasedAt === start + 40 * minute)).toBe(true)
    expect(共享订单.value[0]!.manualShippingPlan?.orderNos).toEqual([first.订单号, second.订单号])
    expect(共享合单执行结果.value?.source).toBe('订单到达合单节点')
    const original = clone(共享合单记录.value)
    订单到达合单节点(first.订单号, ready)
    await vi.advanceTimersByTimeAsync(20 * minute)
    expect(共享合单记录.value).toEqual(original)
  })

  it('基础先登记待本轮但不提前合放，等待期间审单不能抢跑；跨批次两单独立放', async () => {
    enable('basic')
    await vi.advanceTimersByTimeAsync(5 * minute)
    const first = 接入下一张合单节点样例()
    expect(共享合单记录.value[0]!.status).toBe('待本轮处理')
    expect(订单正在等单(first.订单号)).toBe(true)
    const review = 执行待审核规则轮次('立即执行')
    expect(review.明细[0]!.结果).toBe('跳过')
    expect(共享订单.value[0]!.initialReviewPending).toBe(true)
    expect(提交审核轮次(first.订单号, 当前版本(first.订单号), '人工审核').成功).toBe(false)
    await vi.advanceTimersByTimeAsync(25 * minute)
    expect(共享合单记录.value[0]).toMatchObject({ status: '已放单', releasedAt: start + 30 * minute })
    expect(共享订单.value[0]!.manualShippingPlan).toBeUndefined()
    await vi.advanceTimersByTimeAsync(10 * minute)
    接入下一张合单节点样例()
    expect(共享合单记录.value[1]!.status).toBe('待本轮处理')
    await vi.advanceTimersByTimeAsync(20 * minute)
    expect(共享合单记录.value[1]).toMatchObject({ status: '已放单', releasedAt: start + 60 * minute })
    expect(共享订单.value.every(order => !order.manualShippingPlan)).toBe(true)
  })

  it('高级集中放单凑够也继续等，到点独立触发，不等待批次', async () => {
    enable('advanced', true)
    await vi.advanceTimersByTimeAsync(5 * minute); 接入下一张合单节点样例()
    await vi.advanceTimersByTimeAsync(35 * minute); 接入下一张合单节点样例()
    expect(共享合单记录.value.every(record => record.status === '等单中')).toBe(true)
    await vi.advanceTimersByTimeAsync(10 * minute)
    expect(共享合单记录.value.every(record => record.status === '已放单' && record.releasedAt === start + 50 * minute)).toBe(true)
  })

  it('基础同批次已凑齐两单也不提前合放，直到周期到达才一起处理', async () => {
    enable('basic')
    await vi.advanceTimersByTimeAsync(5 * minute); 接入下一张合单节点样例()
    await vi.advanceTimersByTimeAsync(5 * minute); 接入下一张合单节点样例()
    expect(共享合单记录.value).toHaveLength(2)
    expect(共享合单记录.value.every(record => record.status === '待本轮处理')).toBe(true)
    expect(共享订单.value.every(order => !order.manualShippingPlan)).toBe(true)
    await vi.advanceTimersByTimeAsync(20 * minute)
    expect(共享合单记录.value.every(record => record.status === '已放单' && record.releasedAt === start + 30 * minute)).toBe(true)
    expect(共享订单.value[0]!.manualShippingPlan?.orderNos).toHaveLength(2)
  })

  it('仅待审核或SKU已配对不能推断前置完成，未到节点的新单扫描也不入池', async () => {
    enable('advanced')
    const order = 创建自动合单样例(创建作业样例, Date.now())[0]!
    delete order.mergeNodeArrival
    共享订单.value.push(order)
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(共享合单记录.value).toEqual([])
    expect(订单到达合单节点(order.systemOrderNo, { ...ready, giftProcessing: '未完成' }).成功).toBe(false)
    expect(共享订单.value[0]!.mergeNodeArrival).toBeUndefined()
    expect(订单到达合单节点(order.systemOrderNo, ready).成功).toBe(true)
    expect(共享合单记录.value[0]!.enteredAt).toBe(start + 30 * minute)
  })

  it('已拆单跳过节点；真实资格仍复核，假报前置完成不能绕过SKU或审核门禁', () => {
    enable('advanced')
    const samples = 创建自动合单样例(创建作业样例, Date.now())
    const split = samples.find(order => order.systemOrderNo.endsWith('SPLIT-01'))!
    共享订单.value.push(split)
    expect(订单到达合单节点(split.systemOrderNo, ready).成功).toBe(false)
    const order = samples[0]!
    delete order.mergeNodeArrival
    order.items[0]!.skuResolutionStatus = '缺失'; order.items[0]!.systemSku = undefined
    共享订单.value.push(order)
    const rejected = 订单到达合单节点(order.systemOrderNo, ready)
    expect(rejected.成功).toBe(true)
    expect(rejected.信息).toContain('已排除')
    expect(rejected.信息).toContain('SKU')
    expect(共享合单执行结果.value?.rows.find(row => row.orderNo === order.systemOrderNo)).toMatchObject({ status: '已排除', reason: expect.stringContaining('SKU') })
    expect(共享订单.value[1]!.mergeNodeArrival).toBeDefined()
    expect(共享合单记录.value).toEqual([])
    const review = 执行待审核规则轮次('立即执行')
    expect(review.明细.find(row => row.订单号 === order.systemOrderNo)!.结果).toBe('跳过')
    expect(共享订单.value[1]!.initialReviewPending).toBe(true)
  })

  it('任务关闭只记录节点，不扣留或放单；再次开启才按当前模式处理', () => {
    const first = 接入下一张合单节点样例()
    expect(共享订单.value[0]!.mergeNodeArrival?.arrivedAt).toBe(start)
    expect(共享合单记录.value).toEqual([])
    expect(共享订单.value[0]!.defaultRoute).toBeUndefined()
    enable('advanced')
    expect(共享合单记录.value[0]).toMatchObject({ orderNo: first.订单号, status: '等单中' })
  })

  it('延迟开启仍从首次节点到达计时，不将开启前的等待重新计算', async () => {
    const first = 接入下一张合单节点样例()
    await vi.advanceTimersByTimeAsync(90 * minute)
    enable('advanced')
    expect(共享合单记录.value[0]).toMatchObject({ orderNo: first.订单号, enteredAt: start + 90 * minute, waitStartedAt: start, deadlineAt: start + 120 * minute, status: '等单中' })
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(共享合单记录.value[0]).toMatchObject({ status: '已放单', releasedAt: start + 120 * minute })
  })

  it('开启时最长等待已到期的来源立即放单，不额外等待两小时或下一轮', async () => {
    const first = 接入下一张合单节点样例()
    await vi.advanceTimersByTimeAsync(150 * minute)
    enable('advanced')
    expect(共享合单记录.value[0]).toMatchObject({ orderNo: first.订单号, enteredAt: start + 150 * minute, waitStartedAt: start, deadlineAt: start + 120 * minute, status: '已放单', releasedAt: start + 150 * minute })
    expect(共享合单记录.value[0]!.reason).toContain('最长等待时间已到')
  })

  it('前置资料修复后的补扫沿首次节点时间，已过期当轮放单', async () => {
    enable('advanced')
    const order = 创建自动合单样例(创建作业样例, start)[0]!
    delete order.mergeNodeArrival
    order.items[0]!.skuResolutionStatus = '缺失'
    共享订单.value.push(order)
    订单到达合单节点(order.systemOrderNo, ready)
    expect(共享合单记录.value).toEqual([])
    await vi.advanceTimersByTimeAsync(150 * minute)
    共享订单.value[0]!.items[0]!.skuResolutionStatus = '成功'
    执行合单轮次()
    expect(共享合单记录.value[0]).toMatchObject({ enteredAt: start + 150 * minute, waitStartedAt: start, deadlineAt: start + 120 * minute, status: '已放单', releasedAt: start + 150 * minute })
  })

  it('节点时间无效或晚于当前时刻时等待核实，不用当前时间掩盖错误', () => {
    enable('advanced')
    for (const arrivedAt of [NaN, start + minute]) {
      const order = 创建自动合单样例(创建作业样例, start)[0]!
      order.mergeNodeArrival!.arrivedAt = arrivedAt
      共享订单.value = [order]
      const result = 执行合单轮次(start)!
      expect(共享合单记录.value).toEqual([])
      expect(result.rows[0]!.reason).toContain('首次到达合单节点时间未核实')
    }
  })

  it('无节点记录的旧存量仅从实际入池计时，不以创建或付款时间回填', () => {
    const order = 创建自动合单样例(创建作业样例, start - 180 * minute)[0]!
    delete order.mergeNodeArrival
    delete order.initialReviewPending
    共享订单.value = [order]
    enable('advanced')
    expect(共享订单.value[0]!.mergeNodeArrival).toBeUndefined()
    expect(共享合单记录.value[0]).toMatchObject({ enteredAt: start, deadlineAt: start + 120 * minute, status: '等单中' })
  })

  it.each(['basic', 'advanced'] as const)('%s 节点条件未知立即返回原因并写结果，不能误报已入池', mode => {
    共享规则.value = [{ id: 'unknown-entry', name: '待核实重量入池', type: '合单规则', enabled: true, priority: 1, mode: '全部满足', conditions: [{ field: 'orderWeight', operator: '介于', value: '1', upperValue: '2' }], action: '进入合单池', version: 1, updatedAt: '', note: '' }]
    enable(mode)
    const result = 接入下一张合单节点样例()
    expect(result.信息).toContain('未入池')
    expect(result.信息).toContain('待核实')
    expect(共享合单记录.value).toEqual([])
    expect(共享合单执行结果.value).toMatchObject({ source: '订单到达合单节点', total: 1, released: 0, waiting: 0, skipped: 1, rows: [{ orderNo: result.订单号, status: '未入池', reason: expect.stringContaining('待核实') }] })
    expect(执行待审核规则轮次('立即执行').明细[0]!.结果).toBe('跳过')
  })

  it('节点明确未命中规则独立放单后，立即结果仍记录该订单而非被空轮覆盖', () => {
    共享规则.value.filter(rule => rule.type === '合单规则').forEach(rule => { rule.enabled = false })
    enable('advanced')
    const result = 接入下一张合单节点样例()
    expect(result.信息).toContain('已放单')
    expect(result.信息).toContain('未匹配')
    expect(共享合单执行结果.value).toMatchObject({ source: '订单到达合单节点', total: 1, released: 1, waiting: 0 })
    expect(共享合单执行结果.value?.rows[0]).toMatchObject({ orderNo: result.订单号, status: '已放单' })
  })

  it('重复节点事件不改首次到达、等待快照和期限，新版本第二张不与旧版本混组', async () => {
    enable('advanced')
    const first = 接入下一张合单节点样例()
    const previous = clone(共享合单记录.value[0]!)
    保存自动合单设置({ enabled: true, intervalMinutes: 30, policy: { ...创建默认合单动作(), mode: 'advanced', maxWaitMinutes: 600 } })
    await nextTick(); await vi.advanceTimersByTimeAsync(minute)
    订单到达合单节点(first.订单号, ready)
    expect(共享订单.value[0]!.mergeNodeArrival?.arrivedAt).toBe(start)
    expect(共享合单记录.value[0]).toEqual(previous)
    接入下一张合单节点样例()
    expect(共享合单记录.value.every(record => record.status === '等单中')).toBe(true)
    expect(共享合单记录.value[1]!.settingsVersion).not.toBe(previous.settingsVersion)
    执行合单轮次()
    expect(共享合单记录.value[0]!.deadlineAt).toBe(previous.deadlineAt)
  })
})
