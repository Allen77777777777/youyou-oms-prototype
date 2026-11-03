import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { 保存审单执行设置 } from './规则执行设置'
import { 启动循环审单 } from './循环审单'

const 执行 = vi.hoisted(() => vi.fn())
vi.mock('../订单处理/审单轮次会话', () => ({ 运行审单轮次: 执行 }))
const 一小时 = 3_600_000
let 作用域: EffectScope

async function 前进(时长: number) {
  await vi.advanceTimersByTimeAsync(时长)
  await vi.dynamicImportSettled()
}

beforeEach(() => {
  vi.useFakeTimers()
  执行.mockClear()
  保存审单执行设置({ enabled: false, intervalHours: 2 })
  作用域 = effectScope()
  作用域.run(启动循环审单)
})
afterEach(() => {
  作用域.stop()
  vi.useRealTimers()
})

describe('循环执行审单规则', () => {
  it('开启后每满两小时跑一轮，不在保存时立即处理，不因保存相同设置重复计时', async () => {
    await 前进(2 * 一小时)
    expect(执行).not.toHaveBeenCalled()
    保存审单执行设置({ enabled: true, intervalHours: 2 })
    await 前进(一小时)
    保存审单执行设置({ enabled: true, intervalHours: 2 })
    await 前进(一小时 - 1)
    expect(执行).not.toHaveBeenCalled()
    await 前进(1)
    expect(执行).toHaveBeenCalledExactlyOnceWith('定时执行')
    await 前进(2 * 一小时)
    expect(执行).toHaveBeenCalledTimes(2)
  })

  it('修改间隔从保存起重新计时，关闭与应用卸载会清理计时器', async () => {
    保存审单执行设置({ enabled: true, intervalHours: 2 })
    await 前进(一小时)
    保存审单执行设置({ enabled: true, intervalHours: 3 })
    await 前进(3 * 一小时 - 1)
    expect(执行).not.toHaveBeenCalled()
    await 前进(1)
    expect(执行).toHaveBeenCalledTimes(1)
    保存审单执行设置({ enabled: false, intervalHours: 3 })
    await 前进(3 * 一小时)
    expect(执行).toHaveBeenCalledTimes(1)
    保存审单执行设置({ enabled: true, intervalHours: 1 })
    作用域.stop()
    await 前进(一小时)
    expect(执行).toHaveBeenCalledTimes(1)
  })
})
