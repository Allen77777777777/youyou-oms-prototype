import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElOption, ElRadioGroup, ElSelect } from 'element-plus'
import RecipientAction from './收件信息动作.vue'
import RecipientPreview from './收件信息试算.vue'
import { 创建默认收件信息动作, type 收件信息动作配置 } from './收件信息规则模型'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })
const options = { attachTo: document.body, global: { directives: { prototype: {} } } }
const select = (label: string) => wrapper!.findAllComponents(ElSelect).find(component => component.props('ariaLabel') === label || component.attributes('aria-label') === label)!
const radio = (label: string) => wrapper!.findAllComponents(ElRadioGroup).find(component => component.props('ariaLabel') === label || component.attributes('aria-label') === label)!
async function click(text: string) { await wrapper!.findAll('button').find(button => button.text() === text)!.trigger('click') }
function parsedNumber() { return wrapper!.findAll('.门牌前后对照 tbody tr').slice(-1)[0]!.findAll('td')[1]!.text() }

describe('收件信息配置与动作试算', () => {
  it('仅提供门牌解析，四种方式及两个保留配置均可选，切换不重置偏好', async () => {
    const rule = reactive({ recipientAction: 创建默认收件信息动作() })
    wrapper = mount(RecipientAction, { props: { rule }, ...options })
    expect(wrapper.text()).toContain('对外请求前执行')
    expect(wrapper.text()).not.toMatch(/电话整理|邮编整理|省州整理/)
    expect(select('门牌解析方式').findAllComponents(ElOption).map(option => option.props('label'))).toEqual(['从第一个数字开始', '从最后一个数字开始', '门牌号在前', '门牌号在前只截取数字'])
    select('门牌来源地址').vm.$emit('update:modelValue', 'address2-address1')
    radio('门牌字符类型').vm.$emit('update:modelValue', 'alphanumeric')
    radio('解析后的详细地址').vm.$emit('update:modelValue', 'remove')
    for (const method of ['firstNumber', 'lastNumber', 'leadingNumber', 'firstDigits'] as const) {
      select('门牌解析方式').vm.$emit('update:modelValue', method)
      await flushPromises()
      expect(rule.recipientAction.method).toBe(method)
      expect(rule.recipientAction.tokenMode).toBe('alphanumeric')
      expect(rule.recipientAction.addressMode).toBe('remove')
      expect(radio('门牌字符类型').props('disabled')).not.toBe(true)
      expect(radio('解析后的详细地址').props('disabled')).not.toBe(true)
    }
    radio('门牌字符类型').vm.$emit('update:modelValue', 'digits')
    radio('解析后的详细地址').vm.$emit('update:modelValue', 'keep')
    await flushPromises()
    expect(rule.recipientAction).toMatchObject({ sourceOrder: 'address2-address1', method: 'firstDigits', tokenMode: 'digits', addressMode: 'keep' })
  })

  it('只读配置禁用全部来源、方法、字符和地址处理输入', () => {
    wrapper = mount(RecipientAction, { props: { rule: { recipientAction: 创建默认收件信息动作() }, readonly: true }, ...options })
    expect(wrapper.findAllComponents(ElSelect).every(component => component.props('disabled'))).toBe(true)
    expect(wrapper.findAllComponents(ElRadioGroup).every(group => group.props('disabled'))).toBe(true)
  })

  it('实际切换四种方式清除旧试算，并按显式方式处理多组数字及房号文本', async () => {
    const rule = reactive({ recipientAction: { ...创建默认收件信息动作(), tokenMode: 'alphanumeric' as const } })
    wrapper = mount({ components: { RecipientAction, RecipientPreview }, setup: () => ({ rule }), template: '<div><RecipientAction :rule="rule" /><RecipientPreview :rule="rule" /></div>' }, options)
    await wrapper.get('input[aria-label="试算地址1"]').setValue('Example Road 12A-14B Apt 7')
    const cases = [
      ['firstNumber', '12A-14B'], ['lastNumber', '7'], ['leadingNumber', undefined], ['firstDigits', '12'],
    ] as const
    for (const [method, value] of cases) {
      select('门牌解析方式').vm.$emit('update:modelValue', method)
      await flushPromises()
      expect(wrapper.find('.门牌试算结果').exists()).toBe(false)
      await click('解析试算')
      expect(wrapper.get('.门牌试算结果').text()).toContain(value === undefined ? '未识别到门牌' : '解析成功')
      expect(parsedNumber()).toBe(value ?? '—')
      expect(rule.recipientAction.tokenMode).toBe('alphanumeric')
    }
    expect((wrapper.get('input[aria-label="试算地址1"]').element as HTMLInputElement).value).toBe('Example Road 12A-14B Apt 7')
  })

  it('试算展示前后值，改变输入或动作清除旧结果，不写规则', async () => {
    const rule = reactive({ recipientAction: { ...创建默认收件信息动作(), addressMode: 'remove' as const } })
    wrapper = mount(RecipientPreview, { props: { rule }, ...options })
    const before = JSON.stringify(rule)
    await click('解析试算')
    expect(wrapper.get('.门牌试算结果').text()).toContain('解析成功')
    expect(wrapper.get('.门牌前后对照').text()).toContain('Rue du Christ 712')
    expect(parsedNumber()).toBe('712')
    expect(JSON.stringify(rule)).toBe(before)
    await wrapper.get('input[aria-label="试算地址1"]').setValue('Example Lane 128')
    expect(wrapper.find('.门牌试算结果').exists()).toBe(false)
    await click('解析试算')
    expect(wrapper.get('.门牌试算结果').text()).toContain('解析成功')
    rule.recipientAction.method = 'leadingNumber'
    await flushPromises()
    expect(wrapper.find('.门牌试算结果').exists()).toBe(false)
    await click('解析试算')
    expect(wrapper.get('.门牌试算结果').text()).toContain('未识别到门牌')
  })

  it('快捷示例保留已有门牌，并可比较首末数字和完整字母连字符', async () => {
    const rule = reactive({ recipientAction: 创建默认收件信息动作() })
    wrapper = mount(RecipientPreview, { props: { rule }, ...options })
    await click('已有门牌'); await click('解析试算')
    expect(wrapper.get('.门牌试算结果').text()).toContain('保留已有门牌')
    await click('多组数字')
    expect(wrapper.find('.门牌试算结果').exists()).toBe(false)
    await click('解析试算')
    expect(parsedNumber()).toBe('12')
    rule.recipientAction.method = 'lastNumber'; await flushPromises(); await click('解析试算')
    expect(parsedNumber()).toBe('712')
    await click('字母及连字符'); await click('解析试算')
    expect(parsedNumber()).toBe('12A-14B')
    rule.recipientAction.method = 'leadingNumber'; await flushPromises(); await click('当前方式示例'); await click('解析试算')
    expect(parsedNumber()).toBe('712')
  })

  it('旧位置配置不能静默转换或执行，明确提示选择新解析方式', async () => {
    const legacy = { sourceOrder: 'address1', position: 'first', tokenMode: 'alphanumeric', addressMode: 'keep' } as unknown as 收件信息动作配置
    const rule = reactive({ recipientAction: legacy })
    wrapper = mount({ components: { RecipientAction, RecipientPreview }, setup: () => ({ rule }), template: '<div><RecipientAction :rule="rule" :validate="true" /><RecipientPreview :rule="rule" /></div>' }, options)
    expect(select('门牌解析方式').props('modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain('请选择有效的门牌号解析方式')
    await click('解析试算')
    expect(wrapper.get('.门牌试算结果').text()).toContain('配置无效')
    expect(parsedNumber()).toBe('—')
    expect(rule.recipientAction.method).toBeUndefined()
  })
})
