/** 门牌解析为本地评审实现方案；来源地址、来源独立门牌与处理结果分开保存。 */
export interface 收件信息动作配置 {
  sourceOrder: 'address1' | 'address2' | 'address1-address2' | 'address2-address1'
  method: 'firstNumber' | 'lastNumber' | 'leadingNumber' | 'firstDigits'
  tokenMode: 'digits' | 'alphanumeric'
  addressMode: 'keep' | 'remove'
}
export interface 门牌解析地址 { addressLine1?: string; addressLine2?: string; houseNumber?: string }
export interface 门牌解析地址快照 { addressLine1: string; addressLine2: string; houseNumber: string }
export type 门牌解析状态 = 'parsed' | 'preserved' | 'unrecognized' | 'needs_review' | 'invalid_config'
export interface 门牌解析结果 {
  status: 门牌解析状态
  reason: string
  before: 门牌解析地址快照
  after: 门牌解析地址快照
  houseNumber: string
  sourceField?: 'addressLine1' | 'addressLine2'
}
export const 门牌号字符上限 = 8
export const 门牌来源选项 = [
  { value: 'address1', label: '仅地址 1' }, { value: 'address2', label: '仅地址 2' },
  { value: 'address1-address2', label: '地址 1 优先，未识别再查地址 2' },
  { value: 'address2-address1', label: '地址 2 优先，未识别再查地址 1' },
] as const
/** 名称、说明及基础示例来自用户提供的易仓截图；候选边界的实现解释见读取门牌候选。 */
export const 门牌解析方式选项 = [
  { value: 'firstNumber', label: '从第一个数字开始', description: '从地址第一个数字开始匹配，如果匹配到的值超过8个字符，拆分截取会失败', example: 'Rue du Christ 712 → 712' },
  { value: 'lastNumber', label: '从最后一个数字开始', description: '从地址最后一个数字开始匹配，如果匹配到的值超过8个字符，拆分截取会失败', example: 'Rue du Christ 712 → 712' },
  { value: 'leadingNumber', label: '门牌号在前', description: '如果是数字开头的地址，从第一位数字截取到连续的最后一位数字，如果匹配到的值超过8个字符，拆分截取会失败', example: '712, Rue du Christ → 712' },
  { value: 'firstDigits', label: '门牌号在前只截取数字', description: '从地址中第一个数字开始截取，仅取出纯数字，超过8个数字则拆分截取失败', example: 'Rue du 712 Christ → 712' },
] as const
export const 门牌解析状态名称: Record<门牌解析状态, string> = {
  parsed: '解析成功', preserved: '保留已有门牌', unrecognized: '未识别到门牌', needs_review: '待核实', invalid_config: '配置无效',
}
export function 创建默认收件信息动作(): 收件信息动作配置 {
  return { sourceOrder: 'address1-address2', method: 'firstNumber', tokenMode: 'alphanumeric', addressMode: 'keep' }
}
export function 校验收件信息动作(action: unknown): string {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return '请配置门牌号解析动作'
  const value = action as Record<string, unknown>
  if (!门牌来源选项.some(option => option.value === value.sourceOrder)) return '请选择有效的门牌来源地址'
  if (!门牌解析方式选项.some(option => option.value === value.method)) return '请选择有效的门牌号解析方式'
  if (!['digits', 'alphanumeric'].includes(value.tokenMode as string)) return '请选择有效的门牌字符类型'
  if (!['keep', 'remove'].includes(value.addressMode as string)) return '请选择详细地址中的门牌处理方式'
  return ''
}
export function 收件信息动作摘要(action?: 收件信息动作配置): string {
  if (校验收件信息动作(action)) return '门牌号解析配置待完善'
  const source = { address1: '地址1', address2: '地址2', 'address1-address2': '地址1→地址2', 'address2-address1': '地址2→地址1' }[action!.sourceOrder]
  return `门牌号解析 · ${source} · ${门牌解析方式选项.find(option => option.value === action!.method)!.label} · ${action!.tokenMode === 'digits' ? '仅数字' : '数字/字母/连字符'} · ${action!.addressMode === 'keep' ? '保留地址中的门牌' : '移除处理地址中的门牌'}`
}

type 门牌候选 = { value: string; start: number }
function 读取门牌候选(line: string, method: 收件信息动作配置['method']): 门牌候选 | undefined {
  if (method === 'leadingNumber') {
    const match = /^\s*(\d+)/.exec(line)
    return match ? { value: match[1]!, start: match[0].length - match[1]!.length } : undefined
  }
  if (method === 'firstDigits') {
    const match = /\d+/.exec(line)
    return match ? { value: match[0], start: match.index } : undefined
  }
  // 实现解释：截图未定义候选终点，此处以空白、逗号、分号分隔。
  // 12A-14B只生成一个完整候选；“最后一个”选末个候选，不取712的末位2。
  const candidates = Array.from(line.matchAll(/\d[^\s,;]*/g))
  const match = method === 'firstNumber' ? candidates[0] : candidates[candidates.length - 1]
  return match ? { value: match[0], start: match.index } : undefined
}

function 移除门牌片段(line: string, candidate: 门牌候选): string {
  const left = line.slice(0, candidate.start), right = line.slice(candidate.start + candidate.value.length)
  // 只整理删除接缝两侧空白，不全局替换；纯数字方式留下的字母、连字符等仍保留。
  const leftPart = left.replace(/\s+$/, ''), rightPart = right.replace(/^\s+/, '')
  const hasGap = leftPart.length !== left.length || rightPart.length !== right.length
  const joined = hasGap ? `${leftPart}${leftPart && rightPart ? ' ' : ''}${rightPart}` : `${left}${right}`
  // 沿用处理副本行首尾分隔符清理，712, Rue…移除后为Rue…；中间标点保持。
  return joined.replace(/^[\s,;]+|[\s,;]+$/g, '')
}

export function 解析门牌号(address: 门牌解析地址, action?: 收件信息动作配置): 门牌解析结果 {
  const before: 门牌解析地址快照 = {
    addressLine1: typeof address.addressLine1 === 'string' ? address.addressLine1 : '',
    addressLine2: typeof address.addressLine2 === 'string' ? address.addressLine2 : '',
    houseNumber: typeof address.houseNumber === 'string' ? address.houseNumber : '',
  }
  const result = (status: 门牌解析状态, reason: string, sourceField?: 'addressLine1' | 'addressLine2'): 门牌解析结果 => ({ status, reason, before: { ...before }, after: { ...before }, houseNumber: before.houseNumber, ...(sourceField ? { sourceField } : {}) })
  const error = 校验收件信息动作(action)
  if (error) return result('invalid_config', error)
  if (before.houseNumber.trim()) return result('preserved', '来源已提供独立门牌号，保留该值及原地址。')
  const config = action!
  const fields: ('addressLine1' | 'addressLine2')[] = config.sourceOrder === 'address1' ? ['addressLine1'] : config.sourceOrder === 'address2' ? ['addressLine2'] : config.sourceOrder === 'address1-address2' ? ['addressLine1', 'addressLine2'] : ['addressLine2', 'addressLine1']
  for (const field of fields) {
    const line = before[field]
    if (!line.trim()) continue
    const candidate = 读取门牌候选(line, config.method)
    if (!candidate) continue
    const token = candidate.value
    if (token.length > 门牌号字符上限) return result('needs_review', `候选门牌超过 ${门牌号字符上限} 个字符，请核实后补充。`, field)
    const valid = config.tokenMode === 'digits' ? /^\d+$/.test(token) : /^\d+[A-Za-z]*(?:-\d+[A-Za-z]*)?$/.test(token)
    if (!valid) return result('needs_review', '候选门牌不符合所选字符类型，保留完整内容，请核实后处理。', field)
    const methodLabel = 门牌解析方式选项.find(option => option.value === config.method)!.label
    const parsed = result('parsed', `已从${field === 'addressLine1' ? '地址 1' : '地址 2'}按“${methodLabel}”解析门牌号。`, field)
    parsed.houseNumber = token
    parsed.after.houseNumber = token
    if (config.addressMode === 'remove') parsed.after[field] = 移除门牌片段(line, candidate)
    return parsed
  }
  return result('unrecognized', '所选地址行未按当前方式识别到门牌，保留原地址；如发货要求门牌，请补齐后校验。')
}
