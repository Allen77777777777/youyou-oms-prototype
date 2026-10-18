import { shallowRef } from 'vue'
import type { 全渠道订单 } from '../全渠道订单/类型'

// 仅为用户授权的虚构占位；正式枚举由优优中台提供，配置保存稳定用户ID。
export const 中台系统用户资料 = shallowRef([
  { value: 'DEMO-USER-001', label: '林晓禾' },
  { value: 'DEMO-USER-002', label: '陈星遥' },
  { value: 'DEMO-USER-003', label: '周沐青' },
  { value: 'DEMO-USER-004', label: '许云舟' },
  { value: 'DEMO-USER-005', label: '宋知夏' },
])

export const 规则平台资料 = [
  { value: 'eBay', label: 'eBay' }, { value: 'Temu', label: 'Temu' },
  { value: 'Mercado Libre', label: '美客多' }, { value: 'Coupang', label: 'Coupang' },
  { value: 'OZON', label: 'OZON' }, { value: 'TikTok Shop', label: 'TikTok Shop' },
  { value: 'Rakuten', label: '乐天' },
]
export const 规则国家资料 = [
  { value: 'US', label: '美国（US）' }, { value: 'GB', label: '英国（GB）' },
  { value: 'DE', label: '德国（DE）' }, { value: 'FR', label: '法国（FR）' },
  { value: 'PL', label: '波兰（PL）' }, { value: 'BR', label: '巴西（BR）' },
  { value: 'CA', label: '加拿大（CA）' }, { value: 'JP', label: '日本（JP）' },
  { value: 'KR', label: '韩国（KR）' }, { value: 'MX', label: '墨西哥（MX）' },
  { value: 'AU', label: '澳大利亚（AU）' },
]
export interface 平台站点资料 { id: string; platformCode: string; siteName: string }
// 用户授权原型先放演示站点；下列ID仅属DEMO命名空间，不是中台实际字典ID。
// 正式来源：调取优优中台的各平台的站点基础资料表；不从订单收货国家推导。
export function 创建平台站点演示资料(): 平台站点资料[] {
  return [
    { id: 'DEMO-EBAY-US', platformCode: 'eBay', siteName: '美国' },
    { id: 'DEMO-EBAY-GB', platformCode: 'eBay', siteName: '英国' },
    { id: 'DEMO-EBAY-DE', platformCode: 'eBay', siteName: '德国' },
    { id: 'DEMO-TEMU-US', platformCode: 'Temu', siteName: '美国' },
    { id: 'DEMO-TEMU-FR', platformCode: 'Temu', siteName: '法国' },
    { id: 'DEMO-MELI-BR', platformCode: 'Mercado Libre', siteName: '巴西' },
    { id: 'DEMO-MELI-MX', platformCode: 'Mercado Libre', siteName: '墨西哥' },
    { id: 'DEMO-COUPANG-KR', platformCode: 'Coupang', siteName: '韩国' },
    { id: 'DEMO-OZON-RU', platformCode: 'OZON', siteName: '俄罗斯' },
    { id: 'DEMO-TIKTOK-US', platformCode: 'TikTok Shop', siteName: '美国' },
    { id: 'DEMO-TIKTOK-GB', platformCode: 'TikTok Shop', siteName: '英国' },
    { id: 'DEMO-RAKUTEN-JP', platformCode: 'Rakuten', siteName: '日本' },
  ]
}
export const 中台平台站点资料 = shallowRef<平台站点资料[]>(创建平台站点演示资料())
export function 站点选择值(项: 平台站点资料): string { return JSON.stringify([项.platformCode, 项.id]) }
export function 规则基础选项(field: 'platformCode' | 'siteCode' | 'storeId' | 'countryCode', orders: 全渠道订单[]) {
  if (field === 'platformCode') return 规则平台资料
  if (field === 'countryCode') return 规则国家资料
  if (field === 'storeId') return [...new Map(orders.map(项 => [项.storeId, { value: 项.storeId, label: `[${规则平台资料.find(平台 => 平台.value === 项.platformCode)?.label || 项.platformCode}].${项.storeName}` }])).values()]
  return 中台平台站点资料.value.filter(项 => 项.id.trim() && 项.siteName.trim() && 规则平台资料.some(平台 => 平台.value === 项.platformCode)).map(项 => ({ value: 站点选择值(项), label: `[${规则平台资料.find(平台 => 平台.value === 项.platformCode)!.label}].${项.siteName}` }))
}
