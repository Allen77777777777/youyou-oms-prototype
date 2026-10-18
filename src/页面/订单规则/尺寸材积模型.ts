export const 尺寸匹配方式 = ['匹配全部规则', '匹配任意规则', '全部不符合规则'] as const
export const 尺寸操作类型 = [
  { value: 'single', label: '单个产品长高宽' },
  { value: 'singlePiece', label: '单个产品长高宽(一件一票)' },
  { value: 'longestProduct', label: '产品最长单边长宽高' },
  { value: 'stackGeLongest', label: '一票多件最短边尺寸总和>=最长边' },
  { value: 'stackBetween', label: '第二长边<=一票多件最短边尺寸总和<最长边' },
  { value: 'stackLeMiddle', label: '一票多件最短边尺寸总和<=次长边' },
  { value: 'singleStack', label: '一票多件订单尺寸叠加' },
] as const
export interface 尺寸公式行 { type: typeof 尺寸操作类型[number]['value']; expression: string; note: string }
export interface 尺寸配置 { mode: typeof 尺寸匹配方式[number]; rows: 尺寸公式行[] }
export interface 尺寸范围 { min: string; max: string; stack: boolean }
export interface 材积边界 { min: string; max: string; minInclusive: boolean; maxInclusive: boolean }
export interface 材积组 {
  method: 'sumProducts' | 'stackHeight'
  sumProducts: 材积边界
  stackHeight: 材积边界
  length: 尺寸范围; width: 尺寸范围; height: 尺寸范围
  convert: boolean
}
export const 材积方式 = [
  { value: 'sumProducts', label: '长*(宽*高)叠加' },
  { value: 'stackHeight', label: '长 * 宽 * (高叠加)' },
] as const
export function 创建尺寸公式行(): 尺寸公式行 { return { type: 'single', expression: '', note: '' } }
export function 创建尺寸配置(): 尺寸配置 { return { mode: '匹配任意规则', rows: [创建尺寸公式行()] } }
export function 创建材积组(): 材积组 {
  const 边界 = (): 材积边界 => ({ min: '', max: '', minInclusive: true, maxInclusive: true })
  const 尺寸 = (): 尺寸范围 => ({ min: '', max: '', stack: false })
  return { method: 'sumProducts', sumProducts: 边界(), stackHeight: 边界(), length: 尺寸(), width: 尺寸(), height: 尺寸(), convert: false }
}

// 以下帮助文字按用户提供的易仓截图转录，保留其措辞；不代表真实中台尺寸数据已接入。
export const 尺寸帮助 = [
  { title: '1、规则参数说明：', lines: ['L=长(CM),W=宽(CM),H=高(CM) 例如:当长大于200时,则公式为:L>200'] },
  { title: '2、公式支持操作符：', lines: ['> < >= <= * + - = and (且) or (或) 例如:L>200 and W>150 and H>2 或者 (L+W)*2>150'] },
  { title: '3、操作类型说明：', lines: [
    '单个产品长宽高：校验每个订单中每个产品的长宽高',
    '单个产品长宽高(一件一票)：匹配订单中产品的长宽高,仅针对一件一票订单有效,其他类型订单默认匹配失败',
    '产品最长单边长宽高：匹配所有产品最大的长宽高,取所有产品的最大长+最大宽,高叠加',
    '一票多件最短边尺寸总和 ≥ 最长边：长宽高取值为：原最短边叠加为最长边，原最长边为第二长边，原第二长边为最短边',
    '第二长边 ≤ 一票多件最短边尺寸总和 < 最长边：长宽高取值为：原最长边不变，原最短边叠加为第二长边，原第二长边为最短边',
    '一票多件最短边尺寸总和 ≤ 次长边类型：长宽高取值为：长宽高取值后，再进行公式编辑，原最短边叠加为最短边',
    '一票多件订单尺寸叠加：长宽高取值为：原最长边不变，原最短边叠加为第二长边、原第二长边为最短边，长宽高取值后，再进行公式编辑。',
  ] },
]
export const 材积帮助 = "材积范围中说的叠加是指货物重叠，砌在一起(像砌墙一样)，比如'高'叠加，是按照货物的高，来进行货物的叠加。\n例如：货物A有三个，货物的材积为[长10，宽5，高2]，使用'高'叠加，那么计算材积的方式，就是[长 * 宽 * (高 * 3)];"
export const 叠加换算帮助 = "例如'高'叠加，当高叠加的长度超过了货物本身的长时，那么我们会将叠加后的货物当做一个整体，重新定义长宽高来计算材积，以此类推"

// 有限语法解析；不执行JS。数字使用有理数，乘法不会丢失六位小数输入的精度。
type 数 = { n: bigint; d: bigint }
type 节点 = { kind: 'number'; value: 数 } | { kind: 'variable'; name: 'L' | 'W' | 'H' } | { kind: 'binary'; op: string; left: 节点; right: 节点; boolean: boolean }
function 数值(text: string): 数 {
  if (!/^\d+(?:\.\d{1,6})?$/.test(text) || text.replace('.', '').length > 24) throw new Error('数值须为非负十进制数，最多24位数字及6位小数')
  const [whole, fraction = ''] = text.split('.')
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) }
}
function 为布尔(node: 节点): boolean { return node.kind === 'binary' && node.boolean }
const 优先级: Record<string, number> = { or: 1, and: 2, '>': 3, '<': 3, '>=': 3, '<=': 3, '=': 3, '+': 4, '-': 4, '*': 5 }
function 解析公式(text: string): 节点 {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入产品尺寸公式')
  if (text.length > 1000) throw new Error('产品尺寸公式最多1000字符')
  const tokens: string[] = []
  let rest = text.trim()
  while (rest) {
    const match = /^(>=|<=|[><=*+()\-]|and\b|or\b|[LWH]\b|\d+(?:\.\d+)?)/.exec(rest)
    if (!match) throw new Error('公式仅支持L、W、H、数字、括号及说明中的操作符')
    tokens.push(match[0]); rest = rest.slice(match[0].length).trimStart()
    if (tokens.length > 200) throw new Error('公式过长，请拆分为多条规则')
  }
  let index = 0, depth = 0
  function expression(minimum = 1): 节点 {
    if (++depth > 32) throw new Error('公式括号嵌套过深')
    const token = tokens[index++]
    let left: 节点
    if (token === '(') { left = expression(); if (tokens[index++] !== ')') throw new Error('公式括号不匹配') }
    else if (token === '+' || token === '-') {
      const right = expression(6)
      if (为布尔(right)) throw new Error('算术运算须使用数值')
      left = { kind: 'binary', op: token, left: { kind: 'number', value: { n: 0n, d: 1n } }, right, boolean: false }
    }
    else if (token === 'L' || token === 'W' || token === 'H') left = { kind: 'variable', name: token }
    else if (token && /^\d/.test(token)) left = { kind: 'number', value: 数值(token) }
    else throw new Error('公式缺少数值、尺寸参数或完整比较')
    while (index < tokens.length && (优先级[tokens[index]!] ?? 0) >= minimum) {
      const op = tokens[index++]!, priority = 优先级[op]!, right = expression(priority + 1)
      const logic = op === 'and' || op === 'or', arithmetic = priority >= 4
      if (logic ? !为布尔(left) || !为布尔(right) : 为布尔(left) || 为布尔(right)) throw new Error(logic ? 'and／or两侧须为完整比较条件' : '算术及比较运算须使用数值')
      left = { kind: 'binary', op, left, right, boolean: !arithmetic }
    }
    depth--; return left
  }
  const root = expression()
  if (index !== tokens.length) throw new Error('公式存在多余字符或括号不匹配')
  if (!为布尔(root) || !tokens.some(token => ['L', 'W', 'H'].includes(token))) throw new Error('公式须包含尺寸参数和比较条件，例如L>200')
  return root
}
export function 校验尺寸公式(expression: string): string { try { 解析公式(expression); return '' } catch (error) { return (error as Error).message } }
export function 计算尺寸公式(expression: string, values: { L: string; W: string; H: string }): boolean {
  const root = 解析公式(expression)
  function compute(node: 节点): 数 | boolean {
    if (node.kind === 'number') return node.value
    if (node.kind === 'variable') return 数值(values[node.name])
    const left = compute(node.left), right = compute(node.right)
    if (typeof left === 'boolean' && typeof right === 'boolean') return node.op === 'and' ? left && right : left || right
    if (typeof left === 'boolean' || typeof right === 'boolean') throw new Error('公式类型无效')
    const a = left.n * right.d, b = right.n * left.d
    switch (node.op) {
      case '+': return { n: a + b, d: left.d * right.d }
      case '-': return { n: a - b, d: left.d * right.d }
      case '*': return { n: left.n * right.n, d: left.d * right.d }
      case '>': return a > b
      case '<': return a < b
      case '>=': return a >= b
      case '<=': return a <= b
      case '=': return a === b
      default: throw new Error('不支持的操作符')
    }
  }
  return compute(root) === true
}
export function 校验尺寸配置(config: 尺寸配置): string {
  if (!config || !尺寸匹配方式.includes(config.mode) || !Array.isArray(config.rows) || !config.rows.length) return '产品尺寸须选择匹配方式并至少配置一条规则'
  for (const [index, row] of config.rows.entries()) {
    if (!row || !尺寸操作类型.some(type => type.value === row.type)) return `第${index + 1}条产品尺寸操作类型无效`
    const error = 校验尺寸公式(row.expression)
    if (error) return `第${index + 1}条：${error}`
    if (typeof row.note !== 'string' || row.note.length > 200) return `第${index + 1}条备注最多200字符`
  }
  return ''
}
/** 调用方须先按操作类型取得可信尺寸；缺失不是“不符合”，禁止被否定模式放行。 */
export function 匹配尺寸配置(config: 尺寸配置, read: (type: 尺寸公式行['type']) => { L: string; W: string; H: string }[] | undefined): boolean | undefined {
  if (校验尺寸配置(config)) return false
  const results = config.rows.map(row => {
    const dimensions = read(row.type)
    if (!dimensions?.length) return undefined
    try { return dimensions.every(value => 计算尺寸公式(row.expression, value)) } catch { return undefined }
  })
  if (results.some(result => result === undefined)) return undefined
  return config.mode === '匹配全部规则' ? results.every(Boolean) : config.mode === '匹配任意规则' ? results.some(Boolean) : results.every(result => result === false)
}
function 校验边界(min: string, max: string, minInclusive = true, maxInclusive = true, required = false): string {
  if (typeof min !== 'string' || typeof max !== 'string') return '范围格式无效'
  if (!min.trim() && !max.trim()) return required ? '至少填写一个材积边界' : ''
  try {
    const a = min.trim() ? 数值(min.trim()) : undefined, b = max.trim() ? 数值(max.trim()) : undefined
    if (a && b && (a.n * b.d > b.n * a.d || (a.n * b.d === b.n * a.d && (!minInclusive || !maxInclusive)))) return '范围下限不能大于上限，相等时须包含边界'
  } catch (error) { return (error as Error).message }
  return ''
}
export function 校验材积配置(groups: 材积组[]): string {
  if (!Array.isArray(groups) || !groups.length) return '请至少配置一组材积范围'
  for (const [index, group] of groups.entries()) {
    if (!group || !材积方式.some(method => method.value === group.method)) return '请选择有效材积计算方式'
    const range = group[group.method]
    if (!range || typeof range.minInclusive !== 'boolean' || typeof range.maxInclusive !== 'boolean' || typeof group.convert !== 'boolean') return '材积范围选项格式无效'
    const error = 校验边界(range.min, range.max, range.minInclusive, range.maxInclusive, true)
    if (error) return `第${index + 1}组：${error}`
    for (const [key, label] of [['length', '长'], ['width', '宽'], ['height', '高']] as const) {
      if (!group[key] || typeof group[key].stack !== 'boolean') return `材积${label}叠加选项无效`
      const dimensionError = 校验边界(group[key].min, group[key].max)
      if (dimensionError) return `第${index + 1}组${label}：${dimensionError}`
    }
  }
  return ''
}
export function 尺寸配置摘要(config: 尺寸配置): string {
  return `${config.mode}：${config.rows.map(row => `${尺寸操作类型.find(type => type.value === row.type)?.label ?? '未知类型'} [${row.expression}]${row.note ? `（${row.note}）` : ''}`).join('；')}`
}
export function 材积配置摘要(groups: 材积组[]): string {
  return groups.map((group, index) => {
    const range = group[group.method], parts: string[] = []
    if (range.min.trim()) parts.push(`${range.minInclusive ? '>=' : '>'} ${range.min} cm³`)
    if (range.max.trim()) parts.push(`${range.maxInclusive ? '<=' : '<'} ${range.max} cm³`)
    for (const [key, label] of [['length', '长'], ['width', '宽'], ['height', '高']] as const) {
      const dim = group[key]
      if (dim.min.trim() || dim.max.trim()) parts.push(`${label} ${dim.min || '不限'}～${dim.max || '不限'} cm${dim.stack ? '（叠加）' : ''}`)
      else if (dim.stack) parts.push(`${label}叠加`)
    }
    if (group.convert) parts.push('叠加换算')
    return `第${index + 1}组 ${材积方式.find(method => method.value === group.method)?.label}：${parts.join('，')}`
  }).join('；或 ')
}
