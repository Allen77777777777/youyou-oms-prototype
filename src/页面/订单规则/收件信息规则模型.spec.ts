import { describe, expect, it } from 'vitest'
import { 创建默认收件信息动作, 校验收件信息动作, 解析门牌号, 收件信息动作摘要, 门牌解析方式选项, type 收件信息动作配置 } from './收件信息规则模型'

function config(method: 收件信息动作配置['method'], patch: Partial<收件信息动作配置> = {}): 收件信息动作配置 {
  return { ...创建默认收件信息动作(), method, ...patch }
}

describe('易仓四种门牌解析方式与来源保护', () => {
  it.each([
    ['firstNumber', 'Rue du Christ 712', '712'], ['lastNumber', 'Rue du Christ 712', '712'],
    ['leadingNumber', '712, Rue du Christ', '712'], ['firstDigits', 'Rue du 712 Christ', '712'],
  ] as const)('截图示例 %s：%s → %s', (method, line, expected) => {
    const result = 解析门牌号({ addressLine1: line }, config(method))
    expect(result.status).toBe('parsed'); expect(result.houseNumber).toBe(expected); expect(result.after.addressLine1).toBe(line)
  })

  it('四种名称及默认方式保持指定契约', () => {
    expect(门牌解析方式选项.map(item => item.label)).toEqual(['从第一个数字开始', '从最后一个数字开始', '门牌号在前', '门牌号在前只截取数字'])
    expect(创建默认收件信息动作().method).toBe('firstNumber')
    expect(收件信息动作摘要(config('firstDigits'))).toContain('门牌号在前只截取数字')
  })

  it('首个和末个数字起始候选不同，末个返回完整数字串或复合号', () => {
    const source = { addressLine1: 'Example Road 12A-14B Apt 712' }
    expect(解析门牌号(source, config('firstNumber')).houseNumber).toBe('12A-14B')
    expect(解析门牌号(source, config('lastNumber')).houseNumber).toBe('712')
    expect(解析门牌号({ addressLine1: 'Example 5 Road 12A-14B' }, config('lastNumber')).houseNumber).toBe('12A-14B')
  })

  it('候选以空白逗号分号结束，任意地址位置均可起始', () => {
    const source = { addressLine1: 'Rue 12, Christ; 34 Lane' }
    expect(解析门牌号(source, config('firstNumber')).houseNumber).toBe('12')
    expect(解析门牌号(source, config('lastNumber')).houseNumber).toBe('34')
    expect(解析门牌号({ addressLine1: 'Rue 12 Christ' }, config('firstNumber')).houseNumber).toBe('12')
    expect(解析门牌号({ addressLine1: 'Rue 12 Christ' }, config('lastNumber')).houseNumber).toBe('12')
  })

  it('门牌号在前要求数字开头，第四种允许地址中部数字', () => {
    expect(解析门牌号({ addressLine1: '  712, Rue du Christ' }, config('leadingNumber')).houseNumber).toBe('712')
    expect(解析门牌号({ addressLine1: 'Rue du 712 Christ' }, config('leadingNumber')).status).toBe('unrecognized')
    expect(解析门牌号({ addressLine1: 'Rue du 712 Christ' }, config('firstDigits')).houseNumber).toBe('712')
  })

  it.each(['digits', 'alphanumeric'] as const)('第三四种生成连续纯数字，同时保留并接受门牌字符选项 %s', tokenMode => {
    const leading = config('leadingNumber', { tokenMode }), anywhere = config('firstDigits', { tokenMode })
    expect(解析门牌号({ addressLine1: '12A-14B Example' }, leading).houseNumber).toBe('12')
    expect(解析门牌号({ addressLine1: 'Example 12A-14B Road 5' }, anywhere).houseNumber).toBe('12')
    expect(leading.tokenMode).toBe(tokenMode); expect(anywhere.tokenMode).toBe(tokenMode)
  })

  it.each(['firstNumber', 'lastNumber'] as const)('前两种 %s 按字符选项验证完整复合号，不静默截短', method => {
    for (const token of ['12A', '12-14', '12A-14B', '0008']) {
      const source = { addressLine1: `Example ${token} Road` }
      expect(解析门牌号(source, config(method)).houseNumber).toBe(token)
      const digits = 解析门牌号(source, config(method, { tokenMode: 'digits' }))
      expect(digits.status).toBe(token === '0008' ? 'parsed' : 'needs_review')
      if (token !== '0008') expect(digits.after).toEqual(digits.before)
    }
  })

  it.each(['firstNumber', 'lastNumber', 'leadingNumber', 'firstDigits'] as const)('%s 允许8位、9位完整失败且不截断或降级地址2', method => {
    const validLine = method === 'leadingNumber' ? '12345678 Example' : 'Example 12345678 Road'
    const invalidLine = method === 'leadingNumber' ? '123456789 Example' : 'Example 123456789 Road'
    expect(解析门牌号({ addressLine1: validLine }, config(method)).houseNumber).toBe('12345678')
    const result = 解析门牌号({ addressLine1: invalidLine, addressLine2: '9 Other Lane' }, config(method))
    expect(result.status).toBe('needs_review'); expect(result.houseNumber).toBe(''); expect(result.sourceField).toBe('addressLine1'); expect(result.after).toEqual(result.before)
  })

  it('字符上限包含字母和连字符', () => {
    expect(解析门牌号({ addressLine1: 'Example 1234-56A Road' }, config('firstNumber')).status).toBe('parsed')
    expect(解析门牌号({ addressLine1: 'Example 1234-567A Road' }, config('firstNumber')).status).toBe('needs_review')
  })

  it('无候选才查下一来源行，无效候选不会被下一行掩盖', () => {
    const source = { addressLine1: 'Example District', addressLine2: '128 Example Lane' }
    const result = 解析门牌号(source, config('firstNumber'))
    expect(result.status).toBe('parsed'); expect(result.sourceField).toBe('addressLine2')
    expect(解析门牌号(source, config('firstNumber', { sourceOrder: 'address1' })).status).toBe('unrecognized')
    const invalid = 解析门牌号({ addressLine1: 'Example 12/3 Lane', addressLine2: '9 Other Lane' }, config('firstNumber'))
    expect(invalid.status).toBe('needs_review'); expect(invalid.sourceField).toBe('addressLine1'); expect(invalid.houseNumber).toBe('')
  })

  it('不因邮政信箱、房号、多数字或没有街道额外拒绝', () => {
    expect(解析门牌号({ addressLine1: 'PO Box 128' }, config('firstNumber')).houseNumber).toBe('128')
    expect(解析门牌号({ addressLine1: '128 Example Apt 5' }, config('lastNumber')).houseNumber).toBe('5')
    expect(解析门牌号({ addressLine1: '128' }, config('firstNumber', { addressMode: 'remove' })).after.addressLine1).toBe('')
  })

  it('来源已有独立门牌时保留已有值与地址，不替换不裁剪', () => {
    const source = { addressLine1: '8 Example Lane Apt 5', houseNumber: ' 8 ' }
    const result = 解析门牌号(source, config('lastNumber', { addressMode: 'remove' }))
    expect(result.status).toBe('preserved'); expect(result.after).toEqual(result.before); expect(result.houseNumber).toBe(' 8 ')
  })

  it('只删命中位置并整理接缝，重复数字和其他内部空白保留，来源不可变', () => {
    const source = Object.freeze({ addressLine1: 'Rue  du   712   Christ  Road 712', addressLine2: 'Example  District' })
    const result = 解析门牌号(source, config('firstNumber', { addressMode: 'remove' }))
    expect(result.after.addressLine1).toBe('Rue  du Christ  Road 712')
    expect(result.after.addressLine2).toBe('Example  District')
    expect(result.before.addressLine1).toBe(source.addressLine1)
    expect(source.addressLine1).toBe('Rue  du   712   Christ  Road 712')
    expect(解析门牌号(source, config('firstNumber', { addressMode: 'remove' }))).toEqual(result)
    expect(解析门牌号({ addressLine1: 'Rue 712 Christ 712' }, config('lastNumber', { addressMode: 'remove' })).after.addressLine1).toBe('Rue 712 Christ')
  })

  it('清理行首尾分隔符，但保留中间标点与纯数字片段之外的字母连字符', () => {
    expect(解析门牌号({ addressLine1: ' 712, Rue du Christ ' }, config('leadingNumber', { addressMode: 'remove' })).after.addressLine1).toBe('Rue du Christ')
    expect(解析门牌号({ addressLine1: 'Rue 712, Christ' }, config('firstDigits', { addressMode: 'remove' })).after.addressLine1).toBe('Rue , Christ')
    expect(解析门牌号({ addressLine1: '12A Example' }, config('leadingNumber', { addressMode: 'remove' })).after.addressLine1).toBe('A Example')
    expect(解析门牌号({ addressLine1: 'Example 12A-14B Road' }, config('firstDigits', { addressMode: 'remove' })).after.addressLine1).toBe('Example A-14B Road')
  })

  it('旧position配置不自动迁移，缺失和未知方式阻断', () => {
    const old = { sourceOrder: 'address1', position: 'first', tokenMode: 'alphanumeric', addressMode: 'keep' }
    expect(校验收件信息动作(old)).toContain('门牌号解析方式')
    expect(解析门牌号({ addressLine1: '128 Example' }, old as unknown as 收件信息动作配置).status).toBe('invalid_config')
    expect(校验收件信息动作({ ...创建默认收件信息动作(), method: 'lastCharacter' })).toContain('门牌号解析方式')
    expect(解析门牌号({}, 创建默认收件信息动作()).status).toBe('unrecognized')
    expect(解析门牌号({ addressLine1: '128 Example' }).status).toBe('invalid_config')
  })
})
