import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OperationLogs from './日志列表.vue'
import { createCustomerServiceLog, customerServiceLogResultTone, type CustomerServiceLog } from './日志工具'

describe('客服日志可读投影', () => {
  it('按事件倒序，历史缺人保持未记录，长文本及受控模板以普通文字显示', () => {
    const wrapper = mount(OperationLogs, { props: { entries: [
      { at: '2026-11-05T01:00:00Z', action: '历史执行记录', content: '原始记录' },
      { id: 'new', at: '2026-11-05T02:00:00Z', operator: '客服小林', action: '请求介入', content: '<script>内容</script>', result: '已提交' },
    ] } })
    expect(wrapper.get('summary').text()).toBe('操作日志（2）')
    expect(wrapper.findAll('li')[0]!.text()).toContain('客服小林')
    expect(wrapper.findAll('li')[1]!.text()).toContain('操作人：未记录')
    expect(wrapper.text()).toContain('2026-11-05 10:00:00')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>内容</script>')
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
  })
  it('模板使用变更记录，保留原业务时间格式', () => {
    const wrapper = mount(OperationLogs, { props: { title: '变更记录', collapsed: false,
      entries: [{ at: 'source', operator: '客服小林', action: '修改模板', content: '正文长度有变化' }],
      formatTime: value => '原格式 ' + value } })
    expect(wrapper.get('summary').text()).toBe('变更记录（1）')
    expect(wrapper.get('time').text()).toBe('原格式 source')
    expect(wrapper.get('details').attributes('open')).toBeDefined()
  })
  it('同一时刻发生多次操作时，追加或前插的日志都显示最近操作在前', () => {
    const at = '2026-11-05T01:00:00Z'
    const first = createCustomerServiceLog('客服小林', '提交', '第一次提交', '已提交', at)
    const second = createCustomerServiceLog('系统', '核查', '收到回执', '已受理', at)
    for (const entries of [[first, second], [second, first]]) {
      const wrapper = mount(OperationLogs, { props: { entries } })
      expect(wrapper.findAll('li')[0]!.text()).toContain('核查')
      expect(wrapper.findAll('li')[1]!.text()).toContain('提交')
      wrapper.unmount()
    }
  })
  it('独立日志窗口隐藏重复标题，历史缺失人员、时间和结果保持未记录', () => {
    const wrapper = mount(OperationLogs, { props: { showHeading: false, entries: [
      { at: ' ', operator: ' ', action: '历史处理', content: '仅有摘要' },
    ] } })
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('summary').exists()).toBe(false)
    expect(wrapper.get('section').attributes('aria-label')).toBe('操作日志')
    expect(wrapper.get('.log-meta').text()).toContain('操作人：未记录')
    expect(wrapper.get('time').text()).toBe('未记录')
    expect(wrapper.get('.log-result').text()).toBe('未记录')
    expect(wrapper.get('.log-result').attributes('data-tone')).toBe('neutral')
  })
  it('长摘要以普通文字保留原文，可用按钮展开和收起', async () => {
    const content = '<img src=x onerror=alert(1)>\n' + '原始变更说明。'.repeat(35)
    const wrapper = mount(OperationLogs, { props: { collapsed: false, entries: [
      { id: 'long', at: '2026-11-05T01:00:00Z', operator: '客服小林', action: '修改规则', content },
    ] } })
    const button = wrapper.get('.log-expand')
    const paragraph = wrapper.get('.log-body p')
    expect(paragraph.text()).toBe(content)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(paragraph.classes()).toContain('log-content-collapsed')
    expect(button.attributes('aria-controls')).toBe(paragraph.attributes('id'))
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.text()).toBe('收起内容')
    expect(paragraph.classes()).not.toContain('log-content-collapsed')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(paragraph.classes()).toContain('log-content-collapsed')
  })
  it('多行摘要可展开，少量短记录保持简洁', () => {
    const wrapper = mount(OperationLogs, { props: { entries: [
      { at: '2026-11-05T01:00:00Z', action: '修改配置', content: '名称：原名称 → 新名称\n启用：否 → 是\n店铺：甲 → 乙\n模板：A → B' },
    ] } })
    expect(wrapper.find('.log-expand').exists()).toBe(true)
    expect(wrapper.find('.log-filters').exists()).toBe(false)
    expect(wrapper.find('.log-footer').exists()).toBe(false)
  })
  it('从全部日志筛选后加载，组合筛选及重置不会漏掉首批以外的记录', async () => {
    const entries: CustomerServiceLog[] = Array.from({ length: 24 }, (_, index) => ({
      id: `entry-${index}`, at: `2026-11-05T01:${String(index).padStart(2, '0')}:00Z`,
      operator: index < 12 ? '客服小林' : '系统', action: index % 2 ? '提交退款' : '回查结果',
      content: `记录 ${index}`, result: index % 2 ? '已提交' : '平台已确认受理',
    }))
    const originalOrder = entries.map(entry => entry.id)
    const wrapper = mount(OperationLogs, { props: { entries, showHeading: false } })
    expect(wrapper.findAll('li')).toHaveLength(10)
    expect(wrapper.findAll('li')[0]!.text()).toContain('记录 23')
    await wrapper.get('.log-footer button').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(20)
    await wrapper.get('select[aria-label="日志操作人"]').setValue('客服小林')
    expect(wrapper.findAll('li')).toHaveLength(10)
    expect(wrapper.findAll('li')[0]!.text()).toContain('记录 11')
    expect(wrapper.get('[role="status"]').text()).toContain('筛选到 12 条')
    await wrapper.get('select[aria-label="日志动作"]').setValue('提交退款')
    expect(wrapper.findAll('li')).toHaveLength(6)
    await wrapper.get('select[aria-label="日志结果"]').setValue('平台已确认受理')
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.get('.log-empty').text()).toBe('暂无符合筛选条件的记录')
    await wrapper.get('.log-filter-reset').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(10)
    expect(wrapper.findAll('li')[0]!.text()).toContain('记录 23')
    expect(entries.map(entry => entry.id)).toEqual(originalOrder)
  })
  it('原记录追加或重新投影时保留筛选，筛选变化收起长摘要并回到首批', async () => {
    const entries: CustomerServiceLog[] = Array.from({ length: 12 }, (_, index) => ({
      id: `entry-${index}`, at: `2026-11-05T01:${String(index).padStart(2, '0')}:00Z`,
      operator: '客服小林', action: '修改规则', content: '变更说明。'.repeat(40), result: '已完成',
    }))
    const wrapper = mount(OperationLogs, { props: { entries } })
    await wrapper.get('select[aria-label="日志操作人"]').setValue('客服小林')
    await wrapper.get('.log-expand').trigger('click')
    await wrapper.get('.log-footer button').trigger('click')
    await wrapper.setProps({ entries: [...entries] })
    expect((wrapper.get('select[aria-label="日志操作人"]').element as HTMLSelectElement).value).toBe('客服小林')
    expect(wrapper.findAll('li')).toHaveLength(12)
    expect(wrapper.get('.log-expand').attributes('aria-expanded')).toBe('true')
    await wrapper.get('select[aria-label="日志结果"]').setValue('已完成')
    expect(wrapper.findAll('li')).toHaveLength(10)
    expect(wrapper.get('.log-expand').attributes('aria-expanded')).toBe('false')
  })
  it('仅按真实结果原文着色，提交、受理和未知结果均不显示为成功', () => {
    for (const value of ['已提交', '已提交，待回查', '平台已确认受理', '已回查']) expect(customerServiceLogResultTone(value)).toBe('info')
    for (const value of ['结果待核查，禁止重提', '退款结果未知', '失败但结果待核查']) expect(customerServiceLogResultTone(value)).toBe('warning')
    for (const value of ['明确失败', '部分读取失败', '未成功']) expect(customerServiceLogResultTone(value)).toBe('danger')
    for (const value of ['成功', '发送成功', '读取成功', '已完成']) expect(customerServiceLogResultTone(value)).toBe('success')
    for (const value of ['', '已记录', '尚未退款成功', '待业务确认']) expect(customerServiceLogResultTone(value)).toBe('neutral')
  })
  it('无ID历史长摘要展开后前插新日志，展开状态仍归原记录且不误展开其他条', async () => {
    const history: CustomerServiceLog[] = [
      { at: '2026-11-05T01:00:00Z', action: '历史核查', content: '历史核查资料。'.repeat(40) },
      { at: '2026-11-05T00:00:00Z', action: '更早提交', content: '更早提交资料。'.repeat(40) },
    ]
    const wrapper = mount(OperationLogs, { props: { entries: history, showHeading: false } })
    await wrapper.findAll('li')[0]!.get('.log-expand').trigger('click')
    await wrapper.setProps({ entries: [
      { at: '2026-11-05T03:00:00Z', action: '新核查', content: '新核查资料。'.repeat(40) },
      { id: 'legacy-0', at: '2026-11-05T02:00:00Z', action: '有ID新提交', content: '有ID新提交资料。'.repeat(40) },
      ...history.map(entry => ({ ...entry })),
    ] })
    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      const isHistory = row.get('strong').text() === '历史核查'
      expect(row.get('.log-expand').attributes('aria-expanded')).toBe(String(isHistory))
      expect(row.get('.log-body p').classes().includes('log-content-collapsed')).toBe(!isHistory)
    }
  })
})
