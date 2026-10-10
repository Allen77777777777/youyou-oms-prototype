/** PRD/eBay商品标题跳转规则PRD.md 第 3 节；默认语言是本地实现方案。 */
export const eBay商品域名字典 = Object.freeze({
  EBAY_US: { 默认: 'www.ebay.com' },
  EBAY_MOTORS_US: { 默认: 'www.ebay.com' },
  EBAY_CA: { 默认: 'www.ebay.ca', 法语: 'www.cafr.ebay.ca' },
  EBAY_GB: { 默认: 'www.ebay.co.uk' },
  EBAY_AU: { 默认: 'www.ebay.com.au' },
  EBAY_AT: { 默认: 'www.ebay.at' },
  EBAY_BE: { 默认: 'www.benl.ebay.be', 法语: 'www.befr.ebay.be' },
  EBAY_CH: { 默认: 'www.ebay.ch' },
  EBAY_DE: { 默认: 'www.ebay.de' },
  EBAY_ES: { 默认: 'www.ebay.es' },
  EBAY_FR: { 默认: 'www.ebay.fr' },
  EBAY_HK: { 默认: 'www.ebay.com.hk' },
  EBAY_IE: { 默认: 'www.ebay.ie' },
  EBAY_IT: { 默认: 'www.ebay.it' },
  EBAY_MY: { 默认: 'www.ebay.com.my' },
  EBAY_NL: { 默认: 'www.ebay.nl' },
  EBAY_PH: { 默认: 'www.ebay.ph' },
  EBAY_PL: { 默认: 'www.ebay.pl' },
  EBAY_SG: { 默认: 'www.ebay.com.sg' },
  EBAY_TW: { 默认: 'www.ebay.com.tw' },
} as const)

export interface eBay商品链接输入 {
  title?: string
  itemId?: string | null
  variationId?: string | null
  listingMarketplaceId?: string | null
}

export interface eBay商品链接结果 {
  href?: string
  notice?: string
}

function 去除首尾空白(值?: string | null): string {
  return typeof 值 === 'string' ? 值.trim() : ''
}

function 有效数字标识(值: string): boolean {
  return /^[0-9]+$/.test(值) && /[1-9]/.test(值)
}

/** 只读取当前商品行，不回填字段、不查询平台、不将 ID 转为数字。 */
export function 生成eBay商品链接(输入: eBay商品链接输入): eBay商品链接结果 {
  if (!去除首尾空白(输入.title)) return { notice: '商品标题未返回' }

  const 商品ID = 去除首尾空白(输入.itemId)
  if (!有效数字标识(商品ID)) return { notice: '缺少有效的 eBay Item ID，无法打开商品' }

  const 刊登站点 = 去除首尾空白(输入.listingMarketplaceId)
  if (刊登站点 && !Object.prototype.hasOwnProperty.call(eBay商品域名字典, 刊登站点)) {
    return { notice: '该刊登站点暂未配置商品跳转' }
  }

  // CA 英语、BE 荷兰语；法语入口保留，尚无可信语言来源，不启用。
  const 站点 = (刊登站点 || 'EBAY_US') as keyof typeof eBay商品域名字典
  let 链接 = `https://${eBay商品域名字典[站点].默认}/itm/${商品ID}`
  const 提示: string[] = []
  if (!刊登站点) 提示.push('刊登站点未返回，将打开 eBay 美国站商品页')

  const 变体ID = 去除首尾空白(输入.variationId)
  if (变体ID) {
    if (有效数字标识(变体ID)) 链接 += `?var=${变体ID}`
    else 提示.push('变体标识异常，将打开商品刊登页')
  }

  return 提示.length ? { href: 链接, notice: 提示.join('；') } : { href: 链接 }
}
