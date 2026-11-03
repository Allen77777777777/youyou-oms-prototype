import { computed } from 'vue'
import type { 全渠道订单, 脱敏收件信息 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 记录操作 } from '../订单处理/演示会话'
import { 校验手工原订单关联 } from './来源规则'

export const 手工订单场景 = ['线下销售', '寄样赠送', '售后补寄', '其他'] as const
export type 手工订单场景类型 = typeof 手工订单场景[number]
export const 手工订单币种 = ['USD', 'EUR', 'GBP', 'CNY', 'CAD', 'AUD', 'JPY', 'KRW', 'BRL', 'MXN', 'PLN', 'RUB'] as const

export interface 手工订单草稿 {
  requestId: string
  scenario: 手工订单场景类型
  originalOrderNo: string
  reason: string
  items: { systemSku: string; quantity: number }[]
  address: 脱敏收件信息
  amount: string
  currency: string
  paidConfirmed: boolean
}

/** 只读复用当前原型已有的系统商品资料，不创建或维护 SKU 映射。 */
export const 手工商品资料: { systemSku: string; systemItemName: string; itemImageUrl?: string }[] = [...new Map(
  共享订单.value.flatMap(订单 => 订单.items)
    .filter(行 => 行.skuResolutionStatus === '成功' && 行.systemSku && 行.systemItemName)
    .map(行 => [行.systemSku!, { systemSku: 行.systemSku!, systemItemName: 行.systemItemName!, itemImageUrl: 行.itemImageUrl }] as const),
).values()]

export const 可关联原订单 = computed(() => 共享订单.value.filter(订单 => !订单.manualOrder && 订单.platformCode !== '手工'))

let 草稿流水 = 0
export function 创建手工订单草稿(): 手工订单草稿 {
  return {
    requestId: `manual-${Date.now()}-${++草稿流水}`,
    scenario: '寄样赠送', originalOrderNo: '', reason: '', items: [],
    address: { fullName: '', countryCode: '', stateProvince: '', city: '', addressLine1: '', addressLine2: '', postalCode: '', telephone: '' },
    amount: '', currency: '', paidConfirmed: false,
  }
}

function 规范草稿(草稿: 手工订单草稿): 手工订单草稿 {
  return {
    requestId: String(草稿.requestId ?? '').trim(), scenario: 草稿.scenario,
    originalOrderNo: String(草稿.originalOrderNo ?? '').trim(), reason: String(草稿.reason ?? '').trim(),
    items: (草稿.items ?? []).map(行 => ({ systemSku: String(行.systemSku ?? '').trim(), quantity: 行.quantity })),
    address: Object.fromEntries(Object.entries(草稿.address ?? {}).map(([键, 值]) => [键, typeof 值 === 'string' ? 值.trim() : 值])) as unknown as 脱敏收件信息,
    amount: String(草稿.amount ?? '').trim(), currency: String(草稿.currency ?? '').trim().toUpperCase(), paidConfirmed: 草稿.paidConfirmed === true,
  }
}

/** 原订单仅作追溯；在途、未知或尚未核清的执行不能借补寄建立重复发货路径。 */
export function 原订单关联阻断原因(原订单号: string): string[] {
  return 校验手工原订单关联(原订单号, 共享订单.value, 仓库执行记录.value)
}

export function 校验手工订单(输入: 手工订单草稿): string[] {
  const 草稿 = 规范草稿(输入)
  const 原因: string[] = []
  if (!草稿.requestId || 草稿.requestId.length > 150) 原因.push('创建请求标识失效，请清空表单后重新填写')
  if (!手工订单场景.includes(草稿.scenario)) 原因.push('请选择有效的订单场景')
  if (!草稿.reason || 草稿.reason.length > 500) 原因.push('请填写创建原因，最多500字')
  if (草稿.scenario === '售后补寄' && !草稿.originalOrderNo) 原因.push('售后补寄必须关联原系统订单')
  if (草稿.originalOrderNo) 原因.push(...原订单关联阻断原因(草稿.originalOrderNo))
  if (!草稿.items.length) 原因.push('请至少选择一项系统商品')
  if (草稿.items.length > 50) 原因.push('单张手工订单最多50项商品')
  if (new Set(草稿.items.map(行 => 行.systemSku)).size !== 草稿.items.length) 原因.push('同一系统SKU请合并数量，不要重复添加')
  for (const [索引, 行] of 草稿.items.entries()) {
    if (!手工商品资料.some(资料 => 资料.systemSku === 行.systemSku)) 原因.push(`第${索引 + 1}项系统商品不存在，请重新选择`)
    if (!Number.isSafeInteger(行.quantity) || 行.quantity < 1 || 行.quantity > 9999) 原因.push(`第${索引 + 1}项数量须为1～9999的整数`)
  }
  if (!草稿.address.fullName || 草稿.address.fullName.length > 100) 原因.push('请填写收件人，最多100字')
  if (!/^[A-Z]{2}$/.test(草稿.address.countryCode ?? '')) 原因.push('请选择收件国家/地区')
  if (!草稿.address.city || 草稿.address.city.length > 100) 原因.push('请填写城市，最多100字')
  if (!草稿.address.addressLine1 || 草稿.address.addressLine1.length > 300) 原因.push('请填写详细地址，最多300字')
  if (!草稿.address.postalCode || 草稿.address.postalCode.length > 30) 原因.push('请填写邮编，最多30字符')
  if (!草稿.address.telephone && !草稿.address.mobilePhone) 原因.push('请填写联系电话')
  if ((草稿.address.telephone?.length ?? 0) > 40 || (草稿.address.mobilePhone?.length ?? 0) > 40) 原因.push('联系电话最多40字符')
  if (Object.values(草稿.address).some(值 => typeof 值 === 'string' && 值.length > 1000)) 原因.push('收件信息过长，请核对后提交')
  if (草稿.scenario === '线下销售' && !草稿.paidConfirmed) 原因.push('线下销售须先确认已收款；本期不支持货到付款')
  if (Boolean(草稿.amount) !== Boolean(草稿.currency)) 原因.push('订单金额和币种须同时填写，也可同时留空')
  if (草稿.currency && !手工订单币种.includes(草稿.currency as typeof 手工订单币种[number])) 原因.push('请选择有效币种')
  const 金额格式 = ['JPY', 'KRW'].includes(草稿.currency) ? /^\d{1,10}$/ : /^\d{1,10}(?:\.\d{1,2})?$/
  if (草稿.amount && !金额格式.test(草稿.amount)) 原因.push(['JPY', 'KRW'].includes(草稿.currency) ? '该币种订单金额须为非负整数' : '订单金额须为非负数，最多两位小数')
  return [...new Set(原因)]
}

function 本地时间(): string { return `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC` }
function 金额文本(草稿: 手工订单草稿): string {
  if (!草稿.amount) return ''
  const [整数 = '0', 小数 = ''] = 草稿.amount.split('.')
  const 标准整数 = 整数.replace(/^0+(?=\d)/, '')
  return ['JPY', 'KRW'].includes(草稿.currency) ? 标准整数 : `${标准整数}.${小数.padEnd(2, '0')}`
}

// 只在本次浏览器会话使用；请求重放返回同一订单，改内容须新建请求。
const 请求内容 = new Map<string, { content: string; orderNo: string }>()
export function 创建手工订单(输入: 手工订单草稿): { 成功: boolean; 信息: string; 订单?: 全渠道订单 } {
  const 草稿 = 规范草稿(输入)
  const 原请求 = 请求内容.get(草稿.requestId)
  const 现有订单 = 共享订单.value.find(订单 => 订单.manualOrder?.requestId === 草稿.requestId)
  const 内容 = JSON.stringify(草稿)
  if (现有订单) {
    if (原请求 && 原请求.content !== 内容) return { 成功: false, 信息: '该创建请求已提交，内容已变化；请重新新增订单' }
    return { 成功: true, 信息: '该请求已创建订单，已返回原订单', 订单: 现有订单 }
  }
  const 原因 = 校验手工订单(草稿)
  if (原因.length) return { 成功: false, 信息: 原因.join('；') }
  const 日期 = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  let 流水 = 1
  while (共享订单.value.some(订单 => 订单.systemOrderNo === `OMS-MAN-${日期}-${String(流水).padStart(4, '0')}`)) 流水++
  const 单号 = `OMS-MAN-${日期}-${String(流水).padStart(4, '0')}`
  const 时间 = 本地时间()
  const 空金额 = { value: '', currency: '' }
  const 订单: 全渠道订单 = {
    systemOrderNo: 单号, platformCode: '手工', storeId: '', storeName: '', platformOrderNo: '', orderType: '手工订单',
    manualOrder: { scenario: 草稿.scenario, originalOrderNo: 草稿.originalOrderNo || undefined, reason: 草稿.reason, paidConfirmed: 草稿.paidConfirmed, requestId: 草稿.requestId },
    fulfillmentMode: '自配送', processingStatus: '待审核', admissionReason: '人工创建；由订单处理核对资料、分配仓库物流并审核后发货。',
    orderedAt: 时间, createdAt: 时间, lastSyncedAt: '', shipByLabel: '无平台时限', urgency: '无时限', tags: [], address: { ...草稿.address },
    amount: { orderAmount: 草稿.amount ? { value: 金额文本(草稿), currency: 草稿.currency } : { ...空金额 } },
    items: 草稿.items.map((行, 索引) => {
      const 商品 = 手工商品资料.find(资料 => 资料.systemSku === 行.systemSku)!
      return {
        // 共享原型以此字段作为稳定行键；手工来源不将其展示为平台返回的行ID。
        externalLineId: `MANUAL-LINE-${单号}-${索引 + 1}`, systemSku: 商品.systemSku, systemItemName: 商品.systemItemName,
        itemImageUrl: 商品.itemImageUrl, orderedQuantity: 行.quantity, fulfillableQuantity: 行.quantity, skuResolutionStatus: '成功',
        currencyCode: '', unitPrice: { ...空金额 }, itemTotal: { ...空金额 },
      }
    }),
    fulfillmentOrders: [], reviews: [], sync: { latestAttempt: '', message: '人工创建，无平台下载或同步任务。' }, operationLogs: [],
  }
  共享订单.value.unshift(订单)
  const 已保存 = 共享订单.value.find(单 => 单.systemOrderNo === 单号)!
  记录操作(已保存, '创建手工订单', `场景：${草稿.scenario}；${草稿.originalOrderNo ? `关联原订单：${草稿.originalOrderNo}；` : ''}原因：${草稿.reason}。进入待审核；未分仓、未审核、未推仓。`)
  请求内容.set(草稿.requestId, { content: 内容, orderNo: 单号 })
  return { 成功: true, 信息: '手工订单已创建并进入待审核，请到订单处理分配仓库物流并审核', 订单: 已保存 }
}

