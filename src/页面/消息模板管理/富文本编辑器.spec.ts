import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import RichEditor from './富文本编辑器.vue'

let wrapper: VueWrapper | undefined
const originalCommand = document.execCommand
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; window.getSelection()?.removeAllRanges(); Object.defineProperty(document, 'execCommand', { configurable: true, value: originalCommand }) })
function setup(value = '<p>Hello buyer</p>') {
  wrapper = mount(RichEditor, { props: { modelValue: value }, attachTo: document.body })
  return wrapper
}
function selectText(element: Element, start: number, end: number) {
  const text = element.firstChild!, range = document.createRange()
  range.setStart(text, start); range.setEnd(text, end)
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

describe('富文本编辑器', () => {
  it('初始值和外部更新均先清洗，输入只发布白名单HTML', async () => {
    const view = setup('<p onclick="alert(1)"><strong>Safe</strong><img src=x></p>')
    const content = view.get('[contenteditable=true]')
    expect(content.attributes('aria-label')).toBe('模板正文')
    expect(content.element.innerHTML).toBe('<p><strong>Safe</strong></p>')
    content.element.innerHTML = '<h2>Heading</h2><p><i>Body</i><script>alert(1)</script></p>'
    await content.trigger('input'); await flushPromises()
    expect(view.emitted('update:modelValue')?.[0]).toEqual(['<h2>Heading</h2><p><i>Body</i></p>'])
    await view.setProps({ modelValue: '<p>Replaced</p>', label: '回复正文' })
    expect(content.element.innerHTML).toBe('<p>Replaced</p>')
    expect(content.attributes('aria-label')).toBe('回复正文')
  })
  it('插入变量保留最后有效选区，离开后不覆盖整篇，失效选区在末尾追加', async () => {
    const view = setup(), paragraph = view.get('.message-rich-content p').element
    selectText(paragraph, 6, 11)
    const outside = document.createElement('input'); document.body.appendChild(outside); outside.focus()
    const api = view.vm as unknown as { insertText(value: string): void; focus(): void }
    api.insertText('{{buyerId}}')
    await flushPromises()
    expect(view.get('.message-rich-content').text()).toBe('Hello {{buyerId}}')
    await view.setProps({ modelValue: '<p>Replacement</p>' })
    api.insertText(' + safe <b>text</b>')
    expect(view.get('.message-rich-content').text()).toBe('Replacement + safe <b>text</b>')
    expect(view.find('.message-rich-content b').exists()).toBe(false)
  })
  it('粘贴保留安全格式、清除图片和事件，并使用文本落点插入', async () => {
    const view = setup('<p>Start </p>')
    selectText(view.get('.message-rich-content p').element, 6, 6)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? '<strong onclick="bad()">{{buyerId}}</strong><img src="https://example.com/a.png">' : '' } })
    view.get('.message-rich-content').element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(view.get('.message-rich-content').element.innerHTML).toBe('<p>Start <strong>{{buyerId}}</strong></p>')
  })
  it('字号工具恢复选区并将浏览器font输出规范为安全字号span', async () => {
    const view = setup('<p>Hello buyer</p>')
    selectText(view.get('.message-rich-content p').element, 6, 11)
    const exec = vi.fn((command: string, _show: boolean, value?: string) => {
      if (command === 'fontSize') {
        const range = window.getSelection()!.getRangeAt(0), font = document.createElement('font')
        font.setAttribute('size', value!); font.appendChild(range.extractContents()); range.insertNode(font)
      }
      return true
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    await view.get('select[aria-label="字号"]').setValue(20)
    expect(exec).toHaveBeenCalledWith('fontSize', false, '5')
    expect(view.get('.message-rich-content span').attributes('style')).toBe('font-size: 20px;')
    expect(view.get('.message-rich-content').text()).toBe('Hello buyer')
    expect(view.find('.message-rich-content font').exists()).toBe(false)
    await view.get('button[aria-label="加粗"]').trigger('click')
    expect(exec).toHaveBeenCalledWith('bold', false, undefined)
  })
  it('重开按首个正文格式显示工具栏，移动光标后同步对应段落与字号', async () => {
    const view = setup('<h2><span style="font-size:18px">Heading</span></h2><p><span style="font-size:24px">Body</span></p>')
    await flushPromises()
    expect((view.get('select[aria-label="段落格式"]').element as HTMLSelectElement).value).toBe('h2')
    expect((view.get('select[aria-label="字号"]').element as HTMLSelectElement).value).toBe('18')
    const content = view.get('.message-rich-content').element as HTMLElement; content.focus()
    selectText(view.get('.message-rich-content p span').element, 1, 1)
    await flushPromises()
    expect((view.get('select[aria-label="段落格式"]').element as HTMLSelectElement).value).toBe('p')
    expect((view.get('select[aria-label="字号"]').element as HTMLSelectElement).value).toBe('24')
  })
})
