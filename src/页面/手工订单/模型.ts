import { computed } from 'vue'
import type { 全渠道订单, 脱敏收件信息, 订单路由 } from '../全渠道订单/类型'
import { 共享订单, 仓库执行记录, 演示路由, 记录操作 } from '../订单处理/演示会话'
import { 查找所选仓库物流 } from '../订单处理/仓库物流选择模型'
import { 追加订单备注, 订单备注字数上限 } from '../订单处理/订单备注模型'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 是手工订单, 校验手工原订单关联 } from './来源规则'

export const 手工订单场景 = ['线下销售', '寄样赠送', '售后补寄', '其他'] as const
export type 手工订单场景类型 = typeof 手工订单场景[number]
export const 手工订单币种 = ['USD', 'EUR', 'GBP', 'CNY', 'CAD', 'AUD', 'JPY', 'KRW', 'BRL', 'MXN', 'PLN', 'RUB'] as const

export interface 手工订单草稿 {
  requestId: string
  scenario: 手工订单场景类型
  originalOrderNo: string
  reason: string
  storeId: string
  warehouse: string
  channel: string
  note: string
  tags: string[]
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

export const 可关联原订单 = computed(() => 共享订单.value.filter(订单 => !是手工订单(订单)))

/** 退货工作台可在建单模块初始化后载入关联订单。仅取该原单可靠解析的系统商品。 */
function 查找手工商品(草稿: 手工订单草稿, sku: string) {
  const 资料 = 手工商品资料.find(商品 => 商品.systemSku === sku)
  if (资料 || 草稿.scenario !== '售后补寄') return 资料
  const 原单 = 可关联原订单.value.find(订单 => 订单.systemOrderNo === 草稿.originalOrderNo)
  const 来源行 = 原单?.items.find(行 => 行.skuResolutionStatus === '成功' && 行.systemSku === sku && 行.systemItemName)
  return 来源行 ? { systemSku: sku, systemItemName: 来源行.systemItemName!, itemImageUrl: 来源行.itemImageUrl } : undefined
}

/** 仅复用已存在的跨平台店铺资料；同一 ID 的平台或名称有冲突时不猜选。 */
export const 手工店铺选项 = computed(() => {
  const 资料 = new Map<string, { storeId: string; storeName: string; platformCode: 全渠道订单['platformCode'] }>()
  const 冲突 = new Set<string>()
  for (const 订单 of 可关联原订单.value) {
    const storeId = 订单.storeId.trim(), storeName = 订单.storeName.trim()
    if (!storeId || !storeName) continue
    const 已有 = 资料.get(storeId)
    if (已有 && (已有.storeName !== storeName || 已有.platformCode !== 订单.platformCode)) 冲突.add(storeId)
    else 资料.set(storeId, { storeId, storeName, platformCode: 订单.platformCode })
  }
  return [...资料.values()].filter(店铺 => !冲突.has(店铺.storeId))
})

function 路由资料阻断原因(路由: 订单路由): string[] {
  if (![路由.warehouse, 路由.warehouseProvider, 路由.warehouseAccount, 路由.shippingChannel, 路由.shippingChannelCode, 路由.shippingChannelId].every(值 => 值?.trim())) return ['仓库物流资料不完整，请重新选择']
  const 匹配 = 渠道会话.value.filter(渠道 => 渠道.id === 路由.shippingChannelId)
  if (匹配.length !== 1) return ['物流渠道来源不存在或身份不唯一，请重新选择']
  const 渠道 = 匹配[0]!
  if (渠道.provider !== 路由.warehouseProvider || 渠道.account !== 路由.warehouseAccount || 渠道.warehouse !== 路由.warehouse || 渠道.code !== 路由.shippingChannelCode || 渠道.name !== 路由.shippingChannel) return ['物流渠道与所选仓储服务商、账号、仓库或渠道资料不一致，请重新选择']
  if (!渠道.enabled) return ['所选物流渠道已停用，请重新选择']
  if (路由.labelMode !== '仓配一体' || 渠道.labelMode !== '仓库回传') return ['本期仅支持仓库提供面单的仓配一体物流渠道']
  return []
}

/** 当前只开放已接入履约演示的路由，不为其他渠道猜补仓库 SKU 或库存资料。 */
export const 手工订单路由 = computed<订单路由[]>(() => 演示路由.filter(路由 => !路由资料阻断原因(路由).length).map(路由 => ({ ...路由 })))

export function 校验手工订单路由(输入: Pick<手工订单草稿, 'warehouse' | 'channel'>): string[] {
  const 仓库 = String(输入.warehouse ?? '').trim(), 渠道 = String(输入.channel ?? '').trim()
  const 原因: string[] = []
  if (!仓库) 原因.push('请选择发货仓库')
  if (!渠道) 原因.push('请选择物流渠道')
  if (原因.length) return 原因
  const 路由 = 查找所选仓库物流(演示路由, 仓库, 渠道)
  return 路由 ? 路由资料阻断原因(路由) : ['所选仓库与物流渠道组合无效或不唯一，请重新选择']
}

let 草稿流水 = 0
export function 创建手工订单草稿(): 手工订单草稿 {
  return {
    requestId: `manual-${Date.now()}-${++草稿流水}`,
    scenario: '寄样赠送', originalOrderNo: '', reason: '', items: [],
    storeId: '', warehouse: '', channel: '', note: '', tags: [],
    address: { fullName: '', countryCode: '', stateProvince: '', city: '', addressLine1: '', addressLine2: '', postalCode: '', telephone: '' },
    amount: '', currency: '', paidConfirmed: false,
  }
}

function 规范草稿(草稿: 手工订单草稿): 手工订单草稿 {
  return {
    requestId: String(草稿.requestId ?? '').trim(), scenario: 草稿.scenario,
    originalOrderNo: String(草稿.originalOrderNo ?? '').trim(), reason: String(草稿.reason ?? '').trim(),
    storeId: String(草稿.storeId ?? '').trim(), warehouse: String(草稿.warehouse ?? '').trim(), channel: String(草稿.channel ?? '').trim(),
    note: String(草稿.note ?? '').trim(), tags: [...new Set((Array.isArray(草稿.tags) ? 草稿.tags : []).map(标签 => String(标签 ?? '').trim()).filter(Boolean))],
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
  if (!草稿.storeId) 原因.push('请选择发货店铺')
  else if (!手工店铺选项.value.some(店铺 => 店铺.storeId === 草稿.storeId)) 原因.push('发货店铺不存在或资料不唯一，请重新选择')
  原因.push(...校验手工订单路由(草稿))
  if (草稿.note.length > 订单备注字数上限) 原因.push(`订单备注最多${订单备注字数上限}字`)
  if (草稿.tags.length > 10) 原因.push('订单标签最多10个')
  if (草稿.tags.some(标签 => 标签.length > 20)) 原因.push('每个订单标签最多20字')
  if (草稿.scenario === '售后补寄' && !草稿.originalOrderNo) 原因.push('售后补寄必须关联原系统订单')
  if (草稿.originalOrderNo) 原因.push(...原订单关联阻断原因(草稿.originalOrderNo))
  if (!草稿.items.length) 原因.push('请至少选择一项系统商品')
  if (草稿.items.length > 50) 原因.push('单张手工订单最多50项商品')
  if (new Set(草稿.items.map(行 => 行.systemSku)).size !== 草稿.items.length) 原因.push('同一系统SKU请合并数量，不要重复添加')
  for (const [索引, 行] of 草稿.items.entries()) {
    if (!查找手工商品(草稿, 行.systemSku)) 原因.push(`第${索引 + 1}项系统商品不存在，请重新选择`)
    if (!Number.isSafeInteger(行.quantity) || 行.quantity < 1 || 行.quantity > 9999) 原因.push(`第${索引 + 1}项数量须为1～9999的整数`)
  }
  if (!草稿.address.fullName || 草稿.address.fullName.length > 100) 原因.push('请填写收件人，最多100字')
  if (!/^[A-Z]{2}$/.test(草稿.address.countryCode ?? '')) 原因.push('请选择收件国家/地区')
  if (!草稿.address.city || 草稿.address.city.length > 100) 原因.push('请填写城市，最多100字')
  if ((草稿.address.stateProvince?.length ?? 0) > 100) 原因.push('州/省最多100字')
  if (!草稿.address.addressLine1 || 草稿.address.addressLine1.length > 300) 原因.push('请填写详细地址，最多300字')
  if ((草稿.address.addressLine2?.length ?? 0) > 300) 原因.push('地址2最多300字')
  if ((草稿.address.companyName?.length ?? 0) > 100) 原因.push('公司名称最多100字')
  if (草稿.address.email && (草稿.address.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(草稿.address.email))) 原因.push('请填写有效邮箱，最多254字符')
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
export function 创建手工订单(输入: 手工订单草稿, 售后单号?: string): { 成功: boolean; 信息: string; 订单?: 全渠道订单 } {
  const 草稿 = 规范草稿(输入)
  if (售后单号 !== undefined && (!售后单号.trim() || 草稿.scenario !== '售后补寄')) return { 成功: false, 信息: '售后重发仅可建立有来源售后单号的售后补寄订单' }
  const 原请求 = 请求内容.get(草稿.requestId)
  const 现有订单 = 共享订单.value.find(订单 => 订单.manualOrder?.requestId === 草稿.requestId)
  const 内容 = JSON.stringify(草稿)
  if (现有订单) {
    if (现有订单.manualOrder?.afterSaleNo !== 售后单号 || (原请求 && 原请求.content !== 内容)) return { 成功: false, 信息: '该创建请求已提交，内容已变化；请重新新增订单' }
    return { 成功: true, 信息: '该请求已创建订单，已返回原订单', 订单: 现有订单 }
  }
  const 原因 = 校验手工订单(草稿)
  if (原因.length) return { 成功: false, 信息: 原因.join('；') }
  const 店铺 = 手工店铺选项.value.find(项 => 项.storeId === 草稿.storeId)!
  const 路由 = 查找所选仓库物流(手工订单路由.value, 草稿.warehouse, 草稿.channel)!
  const 日期 = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
  let 流水 = 1
  while (共享订单.value.some(订单 => 订单.systemOrderNo === `OMS-MAN-${日期}-${String(流水).padStart(4, '0')}`)) 流水++
  const 单号 = `OMS-MAN-${日期}-${String(流水).padStart(4, '0')}`
  const 时间 = 本地时间()
  const 空金额 = { value: '', currency: '' }
  const 订单: 全渠道订单 = {
    systemOrderNo: 单号, platformCode: '手工', storeId: 店铺.storeId, storeName: 店铺.storeName, platformOrderNo: '', platformOrderStatus: undefined, orderType: '手工订单',
    manualOrder: { scenario: 草稿.scenario, originalOrderNo: 草稿.originalOrderNo || undefined, reason: 草稿.reason, paidConfirmed: 草稿.paidConfirmed, requestId: 草稿.requestId, ...(售后单号 ? { afterSaleNo: 售后单号 } : {}) },
    fulfillmentMode: '自配送', processingStatus: '待审核', defaultRoute: { ...路由 }, admissionReason: '人工创建；已填写店铺及仓库物流，由订单处理核对资料并审核后发货。',
    orderedAt: 时间, createdAt: 时间, lastSyncedAt: '', shipByLabel: '无平台时限', urgency: '无时限', tags: [...草稿.tags], address: { ...草稿.address },
    amount: { orderAmount: 草稿.amount ? { value: 金额文本(草稿), currency: 草稿.currency } : { ...空金额 } },
    items: 草稿.items.map((行, 索引) => {
      const 商品 = 查找手工商品(草稿, 行.systemSku)!
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
  if (草稿.note) 追加订单备注(单号, 草稿.note)
  记录操作(已保存, '创建手工订单', `场景：${草稿.scenario}；发货店铺：${店铺.storeName}；仓库物流：${路由.warehouse} / ${路由.warehouseAccount} / ${路由.shippingChannel}；${草稿.originalOrderNo ? `关联原订单：${草稿.originalOrderNo}；` : ''}原因：${草稿.reason}。进入待审核；未审核、未推仓。`)
  请求内容.set(草稿.requestId, { content: 内容, orderNo: 单号 })
  return { 成功: true, 信息: '手工订单已创建并进入待审核，请到订单处理核对并审核', 订单: 已保存 }
}

