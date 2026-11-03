import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import CopyNumber from './单号复制.vue'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); ElMessage.closeAll() })
function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', new Proxy(navigator, { get: (target, key) => key === 'clipboard' ? { writeText } : Reflect.get(target, key, target) }))
  return writeText
}
describe('单号快捷复制', () => {
  it('只复制当前完整原始编号，不触发父级跳转，并反馈编号名称', async () => {
    const writeText = clipboard(), onClick = vi.fn(), success = vi.spyOn(ElMessage, 'success')
    const wrapper = mount({ components: { CopyNumber }, setup: () => ({ onClick }), template: '<div @click="onClick"><CopyNumber value="CK-DEMO-0001" label="OMS出库单号"><a href="#detail">CK-DEMO-0001</a></CopyNumber></div>' })
    await wrapper.get('button[aria-label="复制OMS出库单号"]').trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('CK-DEMO-0001')
    expect(onClick).not.toHaveBeenCalled(); expect(success).toHaveBeenCalledWith('已复制OMS出库单号')
    wrapper.unmount()
  })
  it.each([undefined, null, '', '   ', '—', '-'])('缺失或占位编号 %s 不显示复制入口', value => {
    const wrapper = mount(CopyNumber, { props: { value, label: '平台订单号' } })
    expect(wrapper.find('button').exists()).toBe(false); expect(wrapper.text()).toBe('—')
    wrapper.unmount()
  })
  it('剪贴板拒绝时提示手选、不声称成功且可重新点击', async () => {
    const writeText = clipboard(vi.fn().mockRejectedValue(new DOMException('Clipboard denied', 'NotAllowedError')))
    const warning = vi.spyOn(ElMessage, 'warning'), success = vi.spyOn(ElMessage, 'success')
    const wrapper = mount(CopyNumber, { props: { value: 'CXL-DEMO-0003', label: 'CancelID' } })
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledWith('CXL-DEMO-0003'); expect(success).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith('当前浏览器未允许复制，请手动选择单号')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
