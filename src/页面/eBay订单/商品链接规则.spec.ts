import { describe, expect, it } from 'vitest'
import { eBay商品域名字典, 生成eBay商品链接 } from './商品链接规则'

const 默认商品 = { title: '虚构 eBay 商品', itemId: '123456789012', listingMarketplaceId: 'EBAY_US' }
const 启用站点 = [
  ['EBAY_US', 'www.ebay.com'], ['EBAY_MOTORS_US', 'www.ebay.com'],
  ['EBAY_CA', 'www.ebay.ca'], ['EBAY_GB', 'www.ebay.co.uk'],
  ['EBAY_AU', 'www.ebay.com.au'], ['EBAY_AT', 'www.ebay.at'],
  ['EBAY_BE', 'www.benl.ebay.be'], ['EBAY_CH', 'www.ebay.ch'],
  ['EBAY_DE', 'www.ebay.de'], ['EBAY_ES', 'www.ebay.es'],
  ['EBAY_FR', 'www.ebay.fr'], ['EBAY_HK', 'www.ebay.com.hk'],
  ['EBAY_IE', 'www.ebay.ie'], ['EBAY_IT', 'www.ebay.it'],
  ['EBAY_MY', 'www.ebay.com.my'], ['EBAY_NL', 'www.ebay.nl'],
  ['EBAY_PH', 'www.ebay.ph'], ['EBAY_PL', 'www.ebay.pl'],
  ['EBAY_SG', 'www.ebay.com.sg'], ['EBAY_TW', 'www.ebay.com.tw'],
] as const
const 未启用站点 = [
  'EBAY_CN', 'EBAY_CZ', 'EBAY_DK', 'EBAY_FI', 'EBAY_GR', 'EBAY_HALF_US', 'EBAY_HU',
  'EBAY_ID', 'EBAY_IL', 'EBAY_IN', 'EBAY_JP', 'EBAY_NO', 'EBAY_NZ', 'EBAY_PE',
  'EBAY_PR', 'EBAY_PT', 'EBAY_RU', 'EBAY_SE', 'EBAY_TH', 'EBAY_VN', 'EBAY_ZA',
]

describe('eBay 商品标题链接规则', () => {
  it.each(启用站点)('%s 使用受控 HTTPS 刊登域名 %s', (站点, 域名) => {
    const 结果 = 生成eBay商品链接({ ...默认商品, listingMarketplaceId: 站点 })
    expect(结果).toEqual({ href: `https://${域名}/itm/123456789012` })
    const 链接 = new URL(结果.href!)
    expect(链接.protocol).toBe('https:')
    expect(链接.hostname).toBe(域名)
    expect(链接.pathname).toBe('/itm/123456789012')
    expect(链接.search).toBe('')
  })

  it('完整保留 20 个站点及两个法语入口，但 CA 和 BE 仅使用默认语言', () => {
    expect(Object.keys(eBay商品域名字典)).toHaveLength(20)
    expect(eBay商品域名字典.EBAY_CA.法语).toBe('www.cafr.ebay.ca')
    expect(eBay商品域名字典.EBAY_BE.法语).toBe('www.befr.ebay.be')
    expect(生成eBay商品链接({ ...默认商品, title: 'Article en français', listingMarketplaceId: 'EBAY_CA' }).href).toContain('https://www.ebay.ca/')
    expect(生成eBay商品链接({ ...默认商品, title: 'Article en français', listingMarketplaceId: 'EBAY_BE' }).href).toContain('https://www.benl.ebay.be/')
  })

  it.each([...未启用站点, 'EBAY_UNKNOWN', 'EBAY_UK', 'EBAY_CY', '0', 'US', 'ebay_us', '__proto__', 'constructor', 'https://evil.example'])('非空不可用站点 %s 不回退或猜测域名', 站点 => {
    expect(生成eBay商品链接({ ...默认商品, listingMarketplaceId: 站点 })).toEqual({ notice: '该刊登站点暂未配置商品跳转' })
  })

  it.each([undefined, null, '', ' \t\n '])('缺失刊登站点 %s 回退美国站，并只说明不回填', 站点 => {
    const 输入 = { ...默认商品, listingMarketplaceId: 站点 }
    expect(生成eBay商品链接(输入)).toEqual({ href: 'https://www.ebay.com/itm/123456789012', notice: '刊登站点未返回，将打开 eBay 美国站商品页' })
    expect(输入.listingMarketplaceId).toBe(站点)
  })

  it('去首尾空白且保留超长 ID 和前导零，不发生数字精度损失', () => {
    const 商品ID = '000123456789012345678901234567890123456789012345678901234567890'
    const 变体ID = '000987654321098765432109876543210987654321098765432109876543210'
    expect(生成eBay商品链接({ title: ' 商品 ', itemId: ` ${商品ID} `, variationId: `\t${变体ID}\n`, listingMarketplaceId: ' EBAY_GB ' })).toEqual({ href: `https://www.ebay.co.uk/itm/${商品ID}?var=${变体ID}` })
    expect(生成eBay商品链接({ ...默认商品, itemId: '1', variationId: '0001' })).toEqual({ href: 'https://www.ebay.com/itm/1?var=0001' })
  })

  it.each([undefined, null, '', ' ', '0', '000000', '１２３', '١٢٣', '-123', '+123', '1.2', '1e12', '12 34', '123/456', '123?token=secret', '123#456'])('非法 Item ID %s 不生成链接', itemId => {
    expect(生成eBay商品链接({ ...默认商品, itemId })).toEqual({ notice: '缺少有效的 eBay Item ID，无法打开商品' })
  })

  it.each([undefined, null, '', ' \t\n '])('变体缺失 %s 直接打开刊登页', variationId => {
    expect(生成eBay商品链接({ ...默认商品, variationId })).toEqual({ href: 'https://www.ebay.com/itm/123456789012' })
  })

  it.each(['0', '000', '１２３', '١٢٣', '-1', '+1', '1.2', '1e8', '12 34', '123&token=secret', '123#456'])('非法变体 %s 剥除 var 并说明降级', variationId => {
    expect(生成eBay商品链接({ ...默认商品, variationId })).toEqual({ href: 'https://www.ebay.com/itm/123456789012', notice: '变体标识异常，将打开商品刊登页' })
  })

  it('多问题优先级为缺标题、无效 Item ID、非空不可用站点', () => {
    expect(生成eBay商品链接({ title: ' ', itemId: '000', variationId: 'invalid', listingMarketplaceId: 'EBAY_UNKNOWN' })).toEqual({ notice: '商品标题未返回' })
    expect(生成eBay商品链接({ title: undefined, itemId: '1' })).toEqual({ notice: '商品标题未返回' })
    expect(生成eBay商品链接({ ...默认商品, itemId: '000', variationId: 'invalid', listingMarketplaceId: 'EBAY_UNKNOWN' })).toEqual({ notice: '缺少有效的 eBay Item ID，无法打开商品' })
    expect(生成eBay商品链接({ ...默认商品, variationId: 'invalid', listingMarketplaceId: 'EBAY_UNKNOWN' })).toEqual({ notice: '该刊登站点暂未配置商品跳转' })
  })

  it('可生成链接时合并美国站回退与非法变体提示，原始输入不变', () => {
    const 输入 = { title: '虚构商品', itemId: ' 0001 ', variationId: '非法变体', listingMarketplaceId: null }
    const 原始输入 = { ...输入 }
    expect(生成eBay商品链接(输入)).toEqual({ href: 'https://www.ebay.com/itm/0001', notice: '刊登站点未返回，将打开 eBay 美国站商品页；变体标识异常，将打开商品刊登页' })
    expect(输入).toEqual(原始输入)
  })

  it('商品标题作为文本而不是链接参数，不携带标题或敏感注入参数', () => {
    const 结果 = 生成eBay商品链接({ ...默认商品, title: '<script>token=secret</script>', variationId: '00987' })
    expect(结果).toEqual({ href: 'https://www.ebay.com/itm/123456789012?var=00987' })
    expect([...new URL(结果.href!).searchParams.keys()]).toEqual(['var'])
  })
})
