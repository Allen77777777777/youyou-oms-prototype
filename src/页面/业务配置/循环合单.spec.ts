import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { 共享自动合单设置, 共享下次合单时间, 自动合单调度错误, 共享合单运行状态, 保存自动合单设置 } from './自动合单设置'
import { 启动循环合单 } from './循环合单'

const runtime = vi.hoisted(() => ({ run: vi.fn(), release: vi.fn(), close: vi.fn(), enroll: vi.fn(), earliest: vi.fn<() => number | null>() }))
vi.mock('../订单处理/自动合单会话', () => ({
  执行合单轮次: runtime.run,
  处理合单到期: runtime.release,
  释放全部等待: runtime.close,
  获取最早合单到期时间: runtime.earliest,
  初始化合单待处理: runtime.enroll,
}))
vi.mock('../订单规则/演示会话', async () => {
  const { ref } = await import('vue')
  return { 共享规则: ref([]) }
})
import { 共享规则 } from '../订单规则/演示会话'
import { 创建默认合单动作 } from '../订单规则/合单规则模型'
const deadline = ref<number | null>(null)
const minute = 60_000
let scope: EffectScope
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T04:00:00Z'))
  vi.clearAllMocks()
  deadline.value = null
  runtime.earliest.mockImplementation(() => deadline.value)
  runtime.release.mockImplementation(() => { deadline.value = null })
  runtime.close.mockImplementation(() => { deadline.value = null })
  共享自动合单设置.value = { enabled: false, intervalMinutes: 30, policy: 创建默认合单动作(), version: 1, updatedAt: '' }
  共享下次合单时间.value = null
  自动合单调度错误.value = ''
  共享合单运行状态.value = { status: '未执行', source: '', lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, failureReason: '', nextAction: '' }
  共享规则.value = []
  scope = effectScope()
  scope.run(启动循环合单)
})
afterEach(() => {
  scope.stop()
  vi.useRealTimers()
})

describe('自动合单会话调度', () => {
  it('默认不扫描，启用满周期执行；相同设置不重置计时', async () => {
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(runtime.run).not.toHaveBeenCalled()
    expect(共享合单运行状态.value.status).toBe('未执行')
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    expect(runtime.enroll).toHaveBeenCalledExactlyOnceWith(Date.now())
    const planned = 共享下次合单时间.value
    await vi.advanceTimersByTimeAsync(10 * minute)
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    expect(共享下次合单时间.value).toBe(planned)
    await vi.advanceTimersByTimeAsync(20 * minute - 1)
    expect(runtime.run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.run).toHaveBeenCalledExactlyOnceWith(Date.now(), '定时执行')
    expect(共享下次合单时间.value).toBe(Date.now() + 30 * minute)
  })

  it('12:05 到期独立放单，不等待 12:30 批次', async () => {
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    deadline.value = Date.now() + 5 * minute
    await nextTick()
    await vi.advanceTimersByTimeAsync(5 * minute - 1)
    expect(runtime.release).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.release).toHaveBeenCalledExactlyOnceWith(Date.now())
    expect(runtime.run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(25 * minute)
    expect(runtime.run).toHaveBeenCalledTimes(1)
  })

  it('关闭结束已有等待，之后在关闭状态立即执行产生的等单仍按时放单', async () => {
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    deadline.value = Date.now() + 5 * minute
    await nextTick()
    保存自动合单设置({ enabled: false, intervalMinutes: 30 })
    expect(runtime.close).toHaveBeenCalledExactlyOnceWith('自动合单任务已关闭', Date.now())
    expect(共享下次合单时间.value).toBeNull()
    deadline.value = Date.now() + 2 * minute
    await nextTick()
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(runtime.release).toHaveBeenCalledTimes(1)
    expect(runtime.run).not.toHaveBeenCalled()
    expect(runtime.close).toHaveBeenCalledTimes(1)
  })

  it('修改间隔重新计时，应用卸载清理两类任务', async () => {
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    await vi.advanceTimersByTimeAsync(20 * minute)
    保存自动合单设置({ enabled: true, intervalMinutes: 60 })
    await vi.advanceTimersByTimeAsync(60 * minute - 1)
    expect(runtime.run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.run).toHaveBeenCalledTimes(1)
    deadline.value = Date.now() + minute
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(60 * minute)
    expect(runtime.run).toHaveBeenCalledTimes(1)
    expect(runtime.release).not.toHaveBeenCalled()
    expect(共享下次合单时间.value).toBeNull()
  })

  it('到期处理失败显示原因且限速重试，恢复后清理到期任务', async () => {
    runtime.release.mockImplementationOnce(() => { throw new Error('当前订单被占用') })
    deadline.value = Date.now() + minute
    await nextTick()
    await vi.advanceTimersByTimeAsync(minute)
    expect(自动合单调度错误.value).toContain('当前订单被占用')
    expect(共享合单运行状态.value).toMatchObject({ status: '执行失败', source: '到期放单', lastFailureAt: Date.now(), lastSuccessAt: null })
    expect(共享合单运行状态.value.failureReason).toContain('订单正在被其他操作处理')
    expect(共享合单运行状态.value.nextAction).toContain('先查看最近执行结果')
    expect(runtime.release).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(runtime.release).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runtime.release).toHaveBeenCalledTimes(2)
    expect(自动合单调度错误.value).toBe('')
    expect(共享合单运行状态.value).toMatchObject({ status: '执行成功', lastSuccessAt: Date.now(), failureReason: '', nextAction: '' })
    await vi.advanceTimersByTimeAsync(5 * minute)
    expect(runtime.release).toHaveBeenCalledTimes(2)
  })

  it('任务保持开启时执行仍可失败，保留上次成功时间并在下一次成功后恢复', async () => {
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    const previousSuccess = Date.now()
    runtime.run.mockImplementationOnce(() => { throw new Error('network unavailable') })
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(共享自动合单设置.value.enabled).toBe(true)
    expect(共享合单运行状态.value).toMatchObject({ status: '执行失败', source: '定时执行', lastSuccessAt: previousSuccess, lastFailureAt: Date.now() })
    expect(共享合单运行状态.value.failureReason).toContain('连接中断')
    expect(共享合单运行状态.value.failureReason).not.toContain('network unavailable')
    await vi.advanceTimersByTimeAsync(30 * minute)
    expect(共享合单运行状态.value).toMatchObject({ status: '执行成功', source: '定时执行', lastSuccessAt: Date.now(), lastFailureAt: previousSuccess + 30 * minute })
  })

  it('规则停用或删除立即检查旧等待，修改入池条件不重置等待', async () => {
    const rule: typeof 共享规则.value[number] = { id: 'merge-1', name: '美国订单入池', type: '合单规则', enabled: true, priority: 1, mode: '全部满足', conditions: [], action: '进入合单池', version: 1, updatedAt: '', note: '' }
    // 测试只观察调度依赖，规则引擎由运行时专项覆盖。
    共享规则.value = [rule]
    await nextTick()
    runtime.release.mockClear()
    共享规则.value[0]!.conditions = [{ field: 'countryCode', operator: '等于', value: 'US' }]
    共享规则.value[0]!.version += 1
    await nextTick()
    expect(runtime.release).not.toHaveBeenCalled()
    共享规则.value[0]!.enabled = false
    await nextTick()
    expect(runtime.release).toHaveBeenCalledTimes(1)
    共享规则.value = []
    await nextTick()
    expect(runtime.release).toHaveBeenCalledTimes(2)
  })
  it('仅保存全局策略不重置批次或现有等待截止', async () => {
    保存自动合单设置({ enabled: true, intervalMinutes: 30 })
    deadline.value = Date.now() + 5 * minute
    await nextTick()
    const planned = 共享下次合单时间.value
    await vi.advanceTimersByTimeAsync(minute)
    共享自动合单设置.value = { ...共享自动合单设置.value, version: 2, policy: { ...创建默认合单动作(), mode: 'advanced', maxWaitMinutes: 600 } }
    await nextTick()
    expect(共享下次合单时间.value).toBe(planned)
    expect(runtime.enroll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4 * minute)
    expect(runtime.release).toHaveBeenCalledExactlyOnceWith(Date.now())
    expect(runtime.run).not.toHaveBeenCalled()
  })
})
