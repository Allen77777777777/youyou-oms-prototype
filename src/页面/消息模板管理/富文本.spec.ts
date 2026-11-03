import { describe, expect, it } from 'vitest'
import { plainTextToHtml, richHtmlToSendText, richHtmlToText, sanitizeRichHtml } from './富文本'

describe('富文本白名单', () => {
  it('保留段落标题、粗斜下划线和两类列表，普通div规范为段落', () => {
    const html = '<h1>标题</h1><h2>标题2</h2><h3>标题3</h3><p><strong>粗</strong><em>斜</em><u>线</u><br><b>粗2</b><i>斜2</i></p><ul><li>一</li></ul><ol><li>二</li></ol><div>尾</div>'
    expect(sanitizeRichHtml(html)).toBe(html.replace('<div>尾</div>', '<p>尾</p>'))
    expect(richHtmlToText(html)).toBe('标题\n标题2\n标题3\n粗斜线\n粗2斜2\n一\n二\n尾')
  })
  it('移除执行节点、远程图片、链接属性、事件和任意CSS，保留安全链接文字', () => {
    const clean = sanitizeRichHtml('<script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.com"></iframe><img src="https://example.com/a.png" onerror="alert(1)"><svg><script>alert(2)</script></svg><a href="javascript:alert(1)">链接文字</a><p id=x class=y onclick="alert(1)" style="background:url(https://example.com);color:red">正文</p>')
    expect(clean).toBe('链接文字<p>正文</p>')
  })
  it('span仅允许固定字号，变量保留且不会成为属性', () => {
    expect(sanitizeRichHtml('<span style="font-size:18px;color:red" data-id=x>{{buyerId}}</span><span style="font-size:100px">{{orderNo}}</span>')).toBe('<span style="font-size: 18px;">{{buyerId}}</span><span>{{orderNo}}</span>')
  })
  it('纯文本转HTML安全转义并保留换行和变量', () => {
    const value = '<b>text</b> & "quote"\n{{buyerId}}'
    const html = plainTextToHtml(value)
    expect(html).toContain('&lt;b&gt;text&lt;/b&gt;')
    expect(richHtmlToText(html)).toBe(value)
  })
  it('外发文字保留步骤编号、项目符号、嵌套层级和换行，样式不进入文字', () => {
    const html = '<h2>Instructions</h2><ol><li><strong>Check</strong><ul><li>Part A</li><li>Part B</li></ul></li><li>Reply<br>with details</li></ol><p>Thank you.</p>'
    expect(richHtmlToSendText(html)).toBe('Instructions\n\n1. Check\n  • Part A\n  • Part B\n2. Reply\nwith details\nThank you.')
  })
  it('自定义有序列表编号保留，危险节点不带入外发文本', () => {
    const html = '<ol start="3"><li>Third</li><li value="8">Eighth</li><li>Ninth</li></ol><script>unsafe()</script><p>&lt;b&gt;literal&lt;/b&gt;</p>'
    expect(richHtmlToSendText(html)).toBe('3. Third\n8. Eighth\n9. Ninth\n<b>literal</b>')
    expect(richHtmlToSendText('<ol reversed><li>Last</li><li>First</li></ol>')).toBe('2. Last\n1. First')
    expect(richHtmlToSendText('<p>First<br><br>Last</p>')).toBe('First\n\nLast')
  })
})
