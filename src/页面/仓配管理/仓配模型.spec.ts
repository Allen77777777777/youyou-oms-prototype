import { describe, expect, it } from 'vitest'
import { 创建仓配样例, 取得操作拦截, 执行样例动作, 校验物流渠道, type 物流渠道 } from './仓配模型'

describe('仓配执行门禁', () => {
  it('物流结果待核查以失败保存，查询确认未受理后才可恢复待下单', () => {
    const 单 = 创建仓配样例('物流').find(r => r.awaitingCheck)!
    expect(单.status).toBe('下单失败')
    expect(执行样例动作(单, '重新提交').success).toBe(false)
    expect(执行样例动作(单, '查询结果').success).toBe(true)
    expect(单.awaitingCheck).toBe(false)
    const 编号 = 单.no
    执行样例动作(单, '重新提交')
    expect(单.status).toBe('待下单'); expect(单.no).toBe(编号)
    执行样例动作(单, '提交下单')
    expect(单.status).toBe('下单中')
    expect(执行样例动作(单, '提交下单').success).toBe(false)
  })
  it('仓库取消未确认保留取消中，不能重复建单或篡改已出库', () => {
    const 数据 = 创建仓配样例('仓库')
    const 取消单 = 数据.find(r => r.status === '取消中')!
    执行样例动作(取消单, '查询结果')
    expect(取消单.status).toBe('取消中'); expect(取消单.awaitingCheck).toBe(true)
    expect(取得操作拦截(取消单, '重新提交')).not.toBe('')
    expect(取得操作拦截(数据.find(r => r.status === '已出库')!, '重新提交')).not.toBe('')
  })
  it('仓库请求超时保持下单中，查询不能伪造出库数量', () => {
    const 单 = 创建仓配样例('仓库')[0]!
    expect(单.status).toBe('下单中')
    expect(执行样例动作(单, '重新提交').success).toBe(false)
    执行样例动作(单, '查询结果')
    expect(单.status).toBe('下单失败'); expect(单.shipped).toBe(0)
    执行样例动作(单, '重新提交')
    expect(单.status).toBe('下单中'); expect(单.externalNo).toBe('')
  })
  it('映射缺失不因明确失败就自动开放重提', () => {
    const 单 = 创建仓配样例('物流').find(r => r.blocker)!
    expect(执行样例动作(单, '重新提交').success).toBe(false)
    expect(单.status).toBe('下单失败')
  })
})
describe('物流渠道草案校验', () => {
  const 渠道: 物流渠道 = { id: 'a', name: '演示', code: 'DEMO_A', provider: '万邑通', account: '演示账号 01', warehouse: '美西演示仓', providerCode: 'DEMO_A', countries: ['US'], enabled: false, labelMode: '仓库回传', updatedAt: '' }
  it('拒绝重复代码、重复映射以及平台面单', () => {
    expect(校验物流渠道({ ...渠道, id: 'b' }, [渠道])).toContain('代码已存在')
    expect(校验物流渠道({ ...渠道, id: 'b', code: 'DEMO_B' }, [渠道])).toContain('组合已存在')
    expect(校验物流渠道({ ...渠道, labelMode: '平台面单' }, [])).toContain('仅开放')
    expect(校验物流渠道(渠道, [渠道])).toBe('')
  })
})
