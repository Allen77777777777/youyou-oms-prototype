import { beforeEach, describe, expect, it } from 'vitest'
import * as model from './模型'
import { copyTemplate, deleteTemplate, getTemplateVariables, getVariableReferences, renderMessageTemplate, renderReplyTemplate, renderTemplate, resetTemplateSession, saveTemplate, setTemplateEnabled, templateSession, validateTemplate, type TemplateInput } from './模型'
import { validateDraft } from '../eBay站内信/模型'
import type { MessageAttachment } from '../eBay站内信/类型'

const input = (patch: Partial<TemplateInput> = {}): TemplateInput => ({ kind: 'message', title: '测试模板', subject: 'Order update', body: 'Hello {{buyerId}}', enabled: true, ...patch })
const attachment = (patch: Partial<MessageAttachment> = {}): MessageAttachment => ({ id: 'attachment-demo', name: 'manual.pdf', size: 100, type: 'application/pdf', source: 'local', ...patch })
beforeEach(resetTemplateSession)

describe('产研维护的固定变量', () => {
  it('只有六项固定变量，字典和定义均冻结且没有新增修改删除API', () => {
    expect(templateSession.variables.map(variable => variable.key)).toEqual(['buyerId', 'orderNo', 'productName', 'trackingNumber', 'platformProductName', 'platformSku'])
    expect(Object.isFrozen(templateSession.variables)).toBe(true)
    expect(templateSession.variables.every(Object.isFrozen)).toBe(true)
    expect(Reflect.set(templateSession.variables[0]!, 'label', 'Changed')).toBe(false)
    expect(Reflect.set(templateSession, 'variables', [])).toBe(false)
    expect('saveVariable' in model || 'deleteVariable' in model || 'validateVariable' in model).toBe(false)
  })
  it('全部变量读取对应可信字段，缺值去重且人工输入不能填补系统事实', () => {
    const result = renderTemplate('{{buyerId}} {{orderNo}} {{orderNo}} {{trackingNumber}} {{platformProductName}} {{platformSku}} {{productName}}', { buyerId: 'buyer_demo', trackingNumber: 'DEMO-TRACK', platformProductName: 'Demo listing', platformSku: 'DEMO-PLATFORM-SKU', productName: 'Demo product' }, { orderNo: 'WRONG-ORDER' })
    expect(result.body).toBe('buyer_demo {{orderNo}} {{orderNo}} DEMO-TRACK Demo listing DEMO-PLATFORM-SKU Demo product')
    expect(result.missing.map(variable => variable.key)).toEqual(['orderNo'])
    expect(result.unknown).toEqual([])
  })
  it('旧店铺与署名变量不再支持，未知与不完整语法保留占位并阻断', () => {
    expect(renderTemplate('{{shopName}} {{agentName}}', {}, { shopName: 'fake', agentName: 'fake' }).unknown).toEqual(['shopName', 'agentName'])
    expect(renderTemplate('{{missingKey}} {{missingKey}}', {}).unknown).toEqual(['missingKey'])
    expect(renderTemplate('{{}}', {}).unknown).toEqual(['空变量'])
    expect(renderTemplate('{{buyerId', {}).unknown).toContain('变量语法不完整')
    expect(renderTemplate('{{buyerId.toUpperCase()}}', { buyerId: 'demo' }).body).toBe('{{buyerId.toUpperCase()}}')
    expect(validateTemplate(input({ subject: '{{shopName}}' }))).toContain('未定义')
    expect(validateTemplate(input({ body: '{{agentName}}' }))).toContain('未定义')
  })
  it('一次替换，不递归处理上下文中的占位符；人工参数仍不能覆盖固定来源', () => {
    expect(renderTemplate('{{buyerId}} / {{orderNo}}', { buyerId: '{{orderNo}}', orderNo: 'DEMO-1001' }, { buyerId: 'WRONG' })).toEqual({ body: '{{orderNo}} / DEMO-1001', missing: [], unknown: [] })
  })
})

describe('完整模板渲染', () => {
  it('回复渲染忽略内部标题的缺值和未知变量，管理预览仍保留原值', () => {
    const template = input({ subject: '{{orderNo}} {{legacy}} {{', body: 'Hello {{buyerId}}', attachments: [attachment()] })
    const reply = renderReplyTemplate(template, { buyerId: 'buyer_demo' })
    expect(reply.subject).toBe('')
    expect(reply.body).toBe('Hello buyer_demo')
    expect(reply.missing).toEqual([]); expect(reply.unknown).toEqual([])
    expect(reply.attachments).toEqual(template.attachments)
    expect(reply.attachments[0]).not.toBe(template.attachments![0])
    const preview = renderMessageTemplate(template, { buyerId: 'buyer_demo' })
    expect(preview.subject).toBe(template.subject)
    expect(preview.missing.map(variable => variable.key)).toEqual(['orderNo'])
    expect(preview.unknown).toEqual(['legacy', '变量语法不完整'])
    expect(template.subject).toBe('{{orderNo}} {{legacy}} {{')
  })
  it('回复只检查正文变量，变量替换后的最终正文继续受到2000字符限制', () => {
    const unresolved = renderReplyTemplate(input({ subject: '{{legacy}}', body: '{{orderNo}} {{missing}}' }), {})
    expect(unresolved.missing.map(variable => variable.key)).toEqual(['orderNo'])
    expect(unresolved.unknown).toEqual(['missing'])
    const template = input({ body: `${'a'.repeat(1980)}{{productName}}` })
    expect(validateTemplate(template)).toBeUndefined()
    expect(validateDraft(renderReplyTemplate(template, { productName: 'b'.repeat(20) }))).toBeUndefined()
    expect(validateDraft(renderReplyTemplate(template, { productName: 'b'.repeat(21) }))).toContain('2000')
  })
  it('回复模板输出最终纯文本，列表编号计入发送长度且管理模板格式保留', () => {
    const template = input({ bodyHtml: '<ol><li><b>{{buyerId}}</b></li><li>Review</li></ol>' })
    const reply = renderReplyTemplate(template, { buyerId: 'buyer_demo' })
    expect(reply.body).toBe('1. buyer_demo\n2. Review')
    expect(reply.bodyHtml).toBe('')
    expect(template.bodyHtml).toContain('<b>{{buyerId}}</b>')
    const boundary = input({ bodyHtml: `<ol><li>${'x'.repeat(1998)}</li></ol>` })
    expect(validateTemplate(boundary)).toContain('2000')
    expect(validateDraft(renderReplyTemplate(boundary, {}))).toContain('2000')
  })
  it('标题与格式正文合并检测缺值和未知变量，同一缺值只报一次', () => {
    const result = renderMessageTemplate(input({ subject: 'Order {{orderNo}} {{legacy}}', bodyHtml: '<h2>Hello {{buyerId}}</h2><p>Order <strong>{{orderNo}}</strong> / {{legacy}}</p>' }), { buyerId: 'buyer_demo' })
    expect(result.subject).toBe('Order {{orderNo}} {{legacy}}')
    expect(result.bodyHtml).toBe('<h2>Hello buyer_demo</h2><p>Order <strong>{{orderNo}}</strong> / {{legacy}}</p>')
    expect(result.missing.map(variable => variable.key)).toEqual(['orderNo'])
    expect(result.unknown).toEqual(['legacy'])
  })
  it('变量值只插入HTML文本节点，标签和属性片段作为文字展示', () => {
    const value = '<img src=x onerror="alert(1)"> & {{orderNo}}'
    const result = renderMessageTemplate(input({ subject: '{{buyerId}}', bodyHtml: '<p><strong>{{buyerId}}</strong></p><span style="font-size: 18px" onclick="alert(2)">{{trackingNumber}}</span>' }), { buyerId: value, trackingNumber: 'DEMO-TRACK' })
    const node = document.createElement('div'); node.innerHTML = result.bodyHtml
    expect(node.querySelector('img')).toBeNull()
    expect(node.querySelector('strong')?.textContent).toBe(value)
    expect(node.querySelector('span')?.getAttribute('onclick')).toBeNull()
    expect(node.querySelector('span')?.style.fontSize).toBe('18px')
    expect(result.subject).toBe(value)
    expect(result.missing).toEqual([])
    expect(result.body).toBe(`${value}\nDEMO-TRACK`)
  })
  it('HTML正文优先投影纯文本；附件返回独立副本，常用语不携带标题和附件', () => {
    const attachments = [attachment()]
    const template = input({ body: 'old plain text', bodyHtml: '<p><b>Hello {{buyerId}}</b></p>', attachments })
    const rendered = renderMessageTemplate(template, { buyerId: 'buyer_demo' })
    expect(rendered.body).toBe('Hello buyer_demo')
    rendered.attachments[0]!.name = 'Changed'
    expect(attachments[0]!.name).toBe('manual.pdf')
    const phrase = renderMessageTemplate({ ...template, kind: 'phrase' }, { buyerId: 'buyer_demo' })
    expect(phrase.subject).toBe(''); expect(phrase.attachments).toEqual([])
  })
  it('合法变量跨行内格式仍替换一次，保留变量起始位置格式和相邻正文', () => {
    const rendered = renderMessageTemplate(input({ bodyHtml: '<p><strong>Hello {{buy<span>erId</span>}}!</strong> Order {{or<i>derNo}}</i> / {{buyerId}}</p>' }), { buyerId: '<Demo> {{orderNo}}', orderNo: 'DEMO-1001' })
    expect(rendered.missing).toEqual([]); expect(rendered.unknown).toEqual([])
    expect(rendered.body).toBe('Hello <Demo> {{orderNo}}! Order DEMO-1001 / <Demo> {{orderNo}}')
    const node = document.createElement('div'); node.innerHTML = rendered.bodyHtml
    expect(node.querySelector('strong')?.textContent).toBe('Hello <Demo> {{orderNo}}!')
    expect(node.querySelector('demo')).toBeNull()
  })
  it('变量不能跨段落或换行拼成一个标识，原占位保留并提示修复', () => {
    const rendered = renderMessageTemplate(input({ bodyHtml: '<p>{{buy</p><p>erId}}</p>' }), { buyerId: 'demo' })
    expect(rendered.unknown).toContain('变量语法不完整')
    expect(rendered.body).toBe('{{buy\nerId}}')
  })
})

describe('模板与常用语维护', () => {
  it('模板名称与可选内部参考标题独立，标题保留200字符及单行限制', () => {
    expect(validateTemplate(input({ title: '' }))).toContain('名称')
    expect(validateTemplate(input({ subject: '' }))).toBeUndefined()
    expect(validateTemplate(input({ subject: undefined }))).toBeUndefined()
    expect(validateTemplate(input({ subject: 'x'.repeat(201) }))).toContain('200')
    expect(validateTemplate(input({ subject: 'Line1\nLine2' }))).toContain('换行')
    expect(validateTemplate(input({ subject: '\nLeading line break' }))).toContain('换行')
    const created = saveTemplate(input({ subject: '  Hello {{buyerId}}  ' })).template!
    expect(created.title).toBe('测试模板'); expect(created.subject).toBe('Hello {{buyerId}}')
    expect(saveTemplate(input({ title: ' 测试模板 ' })).error).toContain('同名')
    expect(saveTemplate(input({ kind: 'phrase', subject: undefined })).error).toBeUndefined()
  })
  it('保存格式正文和附件，复制停用且深隔离输入、原件、复制件和预览', () => {
    const draft = input({ bodyHtml: '<h2>Hello {{buyerId}}</h2><p><strong>Thank you</strong></p>', attachments: [attachment()] })
    const source = saveTemplate(draft).template!, copy = copyTemplate(source.id).template!
    expect(source.body).toBe('Hello {{buyerId}}\nThank you')
    expect(source.bodyHtml).toBe(draft.bodyHtml)
    expect(copy.id).not.toBe(source.id); expect(copy.enabled).toBe(false)
    expect(copy.bodyHtml).toBe(source.bodyHtml); expect(copy.subject).toBe(source.subject)
    draft.attachments![0]!.name = 'Unsaved draft'
    copy.attachments![0]!.name = 'Copy name'
    copy.attachments!.push(attachment({ id: 'copy-only' }))
    expect(source.attachments).toEqual([attachment()])
    expect(copyTemplate(source.id).template?.title).not.toBe(copy.title)
    expect(setTemplateEnabled(copy.id, true)).toBeUndefined()
    expect(deleteTemplate(copy.id)).toBeUndefined()
    expect(templateSession.templates.some(item => item.id === source.id)).toBe(true)
  })
  it('切为常用语去掉旧标题和附件，缺系统值仍能保存可复用模板', () => {
    const template = saveTemplate(input({ body: '{{orderNo}}', attachments: [attachment()] })).template!
    expect(template).toBeDefined()
    expect(getVariableReferences('orderNo').some(item => item.id === template.id)).toBe(true)
    const phrase = saveTemplate({ ...template, kind: 'phrase' }, template.id).template!
    expect(phrase.subject).toBeUndefined(); expect(phrase.attachments).toBeUndefined()
    expect(getTemplateVariables(phrase.body).map(variable => variable.key)).toEqual(['orderNo'])
  })
  it('名称、纯文本正文边界、危险空HTML及陈旧编辑受保护', () => {
    expect(validateTemplate(input({ title: 'x'.repeat(81) }))).toContain('80')
    expect(validateTemplate(input({ body: ' \n' }))).toContain('正文')
    expect(validateTemplate(input({ body: 'x'.repeat(2001) }))).toContain('2000')
    expect(validateTemplate(input({ bodyHtml: `<b>${'x'.repeat(2000)}</b>` }))).toBeUndefined()
    expect(validateTemplate(input({ kind: 'phrase', body: 'x'.repeat(2000) }))).toBeUndefined()
    expect(validateTemplate(input({ kind: 'phrase', body: 'x'.repeat(2001) }))).toContain('2000')
    expect(validateTemplate(input({ bodyHtml: '<script>alert(1)</script>' }))).toContain('正文')
    expect(saveTemplate(input(), 'gone-id').error).toContain('不存在')
    const item = templateSession.templates[0]!
    item.body = '{{removedVariable}}'; item.enabled = false
    expect(setTemplateEnabled(item.id, true)).toContain('未定义')
  })
  it('附件采用5个/5MiB/PNG-JPG-PDF与公网URL校验，不接收无效元数据', () => {
    expect(validateTemplate(input({ attachments: Array.from({ length: 5 }, (_, index) => attachment({ id: String(index) })) }))).toBeUndefined()
    expect(validateTemplate(input({ attachments: Array.from({ length: 6 }, (_, index) => attachment({ id: String(index) })) }))).toContain('5')
    expect(validateTemplate(input({ attachments: [attachment({ size: 5 * 1024 * 1024 + 1 })] }))).toContain('5 MB')
    expect(validateTemplate(input({ attachments: [attachment({ type: 'text/html' })] }))).toContain('PNG')
    expect(validateTemplate(input({ attachments: [attachment({ source: 'url', url: 'http://localhost/file.pdf', size: 0 })] }))).toContain('公网')
    expect(validateTemplate(input({ attachments: [attachment({ source: 'url', url: 'https://assets.example.com/file.pdf', size: 0 })] }))).toBeUndefined()
  })
  it('初始化所有样例可通过保存校验，无已移除变量；重置不变更固定字典', () => {
    for (const template of templateSession.templates) expect(validateTemplate(template, template.id), template.id).toBeUndefined()
    const variables = templateSession.variables
    templateSession.templates[0]!.body = 'Changed'
    resetTemplateSession()
    expect(templateSession.variables).toBe(variables)
    expect(templateSession.templates[0]!.body).not.toBe('Changed')
  })
})
