const allowedTags = new Set(['P', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BR', 'SPAN'])
const discardedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'LINK', 'META', 'BASE', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'])
export const richTextFontSizes = Object.freeze([12, 14, 16, 18, 20, 24])

function fragment(html: string): HTMLTemplateElement {
  const template = document.createElement('template')
  template.innerHTML = html
  return template
}

/** 只生成本地白名单节点和字号，不保留事件、URL、图片或任意样式。 */
export function sanitizeRichHtml(html: string): string {
  const source = fragment(html), output = document.createElement('div')
  function append(node: Node, parent: Node): void {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.nodeValue ?? '')); return }
    if (!(node instanceof Element)) return
    const originalTag = node.tagName.toUpperCase()
    if (discardedTags.has(originalTag)) return
    const tag = originalTag === 'DIV' ? 'P' : originalTag
    if (!allowedTags.has(tag)) { [...node.childNodes].forEach(child => append(child, parent)); return }
    const clean = document.createElement(tag.toLowerCase())
    if (tag === 'SPAN') {
      const size = (node as HTMLElement).style.fontSize
      if (/^(12|14|16|18|20|24)px$/.test(size)) clean.style.fontSize = size
    }
    // 编号属于正文语义；仅保留安全整数，供编辑及纯文本发送转换使用。
    if (tag === 'OL' && /^-?\d{1,6}$/.test(node.getAttribute('start') ?? '')) clean.setAttribute('start', node.getAttribute('start')!)
    if (tag === 'OL' && node.hasAttribute('reversed')) clean.setAttribute('reversed', '')
    if (tag === 'LI' && /^-?\d{1,6}$/.test(node.getAttribute('value') ?? '')) clean.setAttribute('value', node.getAttribute('value')!)
    ;[...node.childNodes].forEach(child => append(child, clean))
    parent.appendChild(clean)
  }
  ;[...source.content.childNodes].forEach(node => append(node, output))
  return output.innerHTML
}

export function richHtmlToText(html: string): string {
  const source = fragment(sanitizeRichHtml(html))
  function read(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
    if (!(node instanceof Element)) return ''
    if (node.tagName === 'BR') return '\n'
    const body = [...node.childNodes].map(read).join('')
    return ['P', 'H1', 'H2', 'H3', 'LI'].includes(node.tagName) ? `${body}\n` : body
  }
  return [...source.content.childNodes].map(read).join('').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** 将本地模板格式转为实际外发文字；编号和项目符号进入正文及字数校验。 */
export function richHtmlToSendText(html: string): string {
  const source = fragment(sanitizeRichHtml(html))
  function read(node: Node, depth = 0): string {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
    if (!(node instanceof Element)) return ''
    if (node.tagName === 'BR') return '\n'
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      const items = [...node.children].filter(child => child.tagName === 'LI'), reversed = node.hasAttribute('reversed')
      let ordinal = Number(node.getAttribute('start') ?? (reversed ? items.length : 1))
      const lines = items.map(item => {
        if (item.hasAttribute('value')) ordinal = Number(item.getAttribute('value'))
        const marker = node.tagName === 'OL' ? `${ordinal}.` : '•'
        ordinal += reversed ? -1 : 1
        const body = [...item.childNodes].map(child => read(child, depth + 1)).join('').replace(/^\n+|\n+$/g, '')
        return `${'  '.repeat(depth)}${marker} ${body}`
      })
      return `\n${lines.join('\n')}\n`
    }
    const body = [...node.childNodes].map(child => read(child, depth)).join('')
    return ['P', 'H1', 'H2', 'H3', 'LI'].includes(node.tagName) ? `${body}\n` : body
  }
  return [...source.content.childNodes].map(node => read(node)).join('').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function plainTextToHtml(text: string): string {
  if (!text) return ''
  const paragraph = document.createElement('p')
  text.split(/\r?\n/).forEach((line, index) => {
    if (index) paragraph.appendChild(document.createElement('br'))
    paragraph.appendChild(document.createTextNode(line))
  })
  return paragraph.outerHTML
}
