import { ref } from 'vue'

export type AuthorizationCategory = 'half-managed' | 'full-managed'
export type Currency = 'USD' | 'CNY'
export type StoreType = 'cross-border' | 'local'
export type Region = 'US' | 'GLOBAL' | 'EU'
export type RegionSelection = Region | 'US_GLOBAL'
type RegionStatus = 'authorized' | 'expiring' | 'expired'
export type AuthStatus = RegionStatus | 'partial'

export interface AuthorizationPeriod {
  authorizedAt: string
  expiresAt: string
}

export interface RegionAuthorization extends AuthorizationPeriod {
  region: Region
}

interface StoreIdentity {
  id: string
  platformName: string
}

interface StoreSummary extends StoreIdentity {
  name: string
  currency: Currency
  enabled: boolean
}

export interface HalfManagedStore extends StoreSummary {
  category: 'half-managed'
  type: StoreType
  regions: RegionAuthorization[]
}

export interface FullManagedStore extends StoreSummary {
  category: 'full-managed'
  authorization: AuthorizationPeriod
}

export type AuthorizedStore = HalfManagedStore | FullManagedStore

interface AuthorizationForm {
  name: string
  currency: Currency | '' | undefined
  storeId?: string
}

interface HalfManagedInput extends AuthorizationForm {
  category: 'half-managed'
  type: StoreType
  region: RegionSelection
  codes: Partial<Record<Region, string>>
}

interface FullManagedInput extends AuthorizationForm {
  category: 'full-managed'
  accessToken: string
}

export type AuthorizationInput = HalfManagedInput | FullManagedInput
export type AuthorizationResult = { ok: true; store: AuthorizedStore } | { ok: false; message: string }

export const categoryLabels: Record<AuthorizationCategory, string> = {
  'half-managed': '半托管',
  'full-managed': '全托管',
}

export const currencyLabels: Record<Currency, string> = {
  USD: 'USD 美元',
  CNY: 'CNY 人民币',
}

export const storeTypeLabels: Record<StoreType, string> = {
  'cross-border': '跨境店铺',
  local: '本土店铺',
}

export const regionLabels: Record<RegionSelection, string> = {
  US: '美国',
  GLOBAL: '全球',
  EU: '欧区',
  US_GLOBAL: '美国 / Global',
}

export const authStatusLabels: Record<AuthStatus, string> = {
  authorized: '已授权',
  expiring: '即将到期',
  partial: '部分失效',
  expired: '已失效',
}

export const storeNameMaxLength = 50
export const invalidDemoCode = 'DEMO-INVALID'
const dayInMs = 24 * 60 * 60 * 1000
const validityDays = 90
const expiringDays = 7

export function getRegionOptions(type: StoreType): RegionSelection[] {
  return type === 'local' ? ['US', 'GLOBAL', 'EU'] : ['US', 'GLOBAL', 'EU', 'US_GLOBAL']
}

export function getSelectedRegions(selection: RegionSelection): Region[] {
  return selection === 'US_GLOBAL' ? ['US', 'GLOBAL'] : [selection]
}

export function getCredentialLabel(region: Region, type: StoreType): string {
  if (type === 'local') return 'Access Token'
  return `${region === 'GLOBAL' ? 'Global ' : regionLabels[region]}订单发货 Token`
}

export function getRegionStatus(expiresAt: string, now = new Date()): RegionStatus {
  const remaining = Date.parse(expiresAt) - now.getTime()
  if (remaining <= 0) return 'expired'
  if (remaining <= expiringDays * dayInMs) return 'expiring'
  return 'authorized'
}

export function getAuthorizationStatus(store: AuthorizedStore, now = new Date()): AuthStatus {
  if (store.category === 'full-managed') return getRegionStatus(store.authorization.expiresAt, now)
  const regionStatuses = store.regions.map(({ expiresAt }) => getRegionStatus(expiresAt, now))
  if (regionStatuses.every(status => status === 'expired')) return 'expired'
  if (regionStatuses.includes('expired')) return 'partial'
  return regionStatuses.includes('expiring') ? 'expiring' : 'authorized'
}

interface DemoShop extends StoreIdentity {
  type: StoreType
  regions: Region[]
}

interface SeedStore {
  shop: DemoShop
  name: string
  enabled: boolean
  validity: Partial<Record<Region, number>>
}

function demoIdentity(id: number, platformName: string): StoreIdentity {
  return { id: `DEMO-${id}`, platformName }
}

function demoShop(id: number, platformName: string, type: StoreType, ...regions: Region[]): DemoShop {
  return { ...demoIdentity(id, platformName), type, regions }
}

// These codes identify authored samples only. No Temu credentials are stored or sent.
const newDemoShops = [
  demoShop(800101, 'Cedar Lane', 'cross-border', 'US', 'GLOBAL'),
  demoShop(800102, 'Mesa Home', 'cross-border', 'US', 'GLOBAL'),
  demoShop(800103, 'Nova Living', 'cross-border', 'EU'),
  demoShop(800104, 'Quiet Harbor US', 'local', 'US'),
  demoShop(800105, 'Camino Supply MX', 'local', 'GLOBAL'),
  demoShop(800106, 'Fern House DE', 'local', 'EU'),
]

const seedStores: SeedStore[] = [
  { shop: demoShop(800001, 'Northlight Home', 'cross-border', 'US', 'GLOBAL'), name: '优优家居跨境店', enabled: true, validity: { US: 62, GLOBAL: 55 } },
  { shop: demoShop(800002, 'Riverstone Outdoor', 'cross-border', 'EU'), name: '户外用品欧区店', enabled: true, validity: { EU: 4 } },
  { shop: demoShop(800003, 'Pacific Daily US', 'local', 'US'), name: '美国本土日用品店', enabled: true, validity: { US: 43 } },
  { shop: demoShop(800004, 'Evergreen Studio', 'cross-border', 'GLOBAL'), name: '全球园艺用品店', enabled: false, validity: { GLOBAL: -9 } },
  { shop: demoShop(800005, 'Atlas Supply', 'cross-border', 'US', 'GLOBAL'), name: '运动配件跨境店', enabled: true, validity: { US: 23, GLOBAL: -3 } },
  { shop: demoShop(800006, 'Maple Coast CA', 'local', 'GLOBAL'), name: '加拿大本土家居店', enabled: true, validity: { GLOBAL: 6 } },
  { shop: demoShop(800007, 'Oakline Parts', 'cross-border', 'US'), name: '美国汽配跨境店', enabled: true, validity: { US: 71 } },
  { shop: demoShop(800008, 'Birch Daily DE', 'local', 'EU'), name: '德国本土日用品店', enabled: false, validity: { EU: -14 } },
]

const demoShops = [...newDemoShops, ...seedStores.map(({ shop }) => shop)]

interface FullManagedFixture {
  shop: StoreIdentity
  name: string
  currency: Currency
  enabled: boolean
  daysUntilExpiry: number
}

const fullManagedFixtures: FullManagedFixture[] = [
  { shop: demoIdentity(800011, 'Meadow Home'), name: '四季家居全托管店', currency: 'CNY', enabled: true, daysUntilExpiry: 61 },
  { shop: demoIdentity(800012, 'Westfield Outdoor'), name: '越野用品全托管店', currency: 'USD', enabled: true, daysUntilExpiry: 5 },
  { shop: demoIdentity(800013, 'Seaside Stationery'), name: '晴海文具全托管店', currency: 'CNY', enabled: false, daysUntilExpiry: -8 },
]

const fullManagedDemoShops = [
  demoIdentity(800201, 'Willow Studio'),
  demoIdentity(800202, 'Sierra Goods'),
  ...fullManagedFixtures.map(({ shop }) => shop),
]

function offsetDate(date: Date, days: number): string {
  return new Date(date.getTime() + days * dayInMs).toISOString()
}

function authorizationPeriod(now: Date, daysUntilExpiry = validityDays): AuthorizationPeriod {
  return {
    authorizedAt: offsetDate(now, daysUntilExpiry - validityDays),
    expiresAt: offsetDate(now, daysUntilExpiry),
  }
}

function createInitialStores(now: Date): AuthorizedStore[] {
  const halfManaged: HalfManagedStore[] = seedStores.map(({ shop, name, enabled, validity }) => ({
    category: 'half-managed',
    id: shop.id,
    platformName: shop.platformName,
    type: shop.type,
    name,
    currency: 'USD',
    enabled,
    regions: shop.regions.map(region => ({ region, ...authorizationPeriod(now, validity[region]) })),
  }))
  const fullManaged: FullManagedStore[] = fullManagedFixtures.map(({ shop, name, currency, enabled, daysUntilExpiry }) => ({
    category: 'full-managed',
    ...shop,
    name,
    currency,
    enabled,
    authorization: authorizationPeriod(now, daysUntilExpiry),
  }))
  return [...halfManaged, ...fullManaged]
}

export const authorizedStores = ref<AuthorizedStore[]>(createInitialStores(new Date()))

function demoCode(storeId: string, region: Region): string {
  return `${storeId}-${region}`
}

interface DemoCredential {
  code: string
  platformName: string
  storeId: string
}

export function getDemoCodes(type: StoreType, region: Region, storeId?: string, selection: RegionSelection = region): DemoCredential[] {
  const selectedRegions = getSelectedRegions(selection)
  return demoShops
    .filter(shop => shop.type === type && (!storeId || shop.id === storeId) &&
      shop.regions.includes(region) && selectedRegions.every(selected => shop.regions.includes(selected)))
    .map(shop => ({ code: demoCode(shop.id, region), platformName: shop.platformName, storeId: shop.id }))
}

export function getFullManagedDemoCodes(storeId?: string): DemoCredential[] {
  return fullManagedDemoShops
    .filter(shop => !storeId || shop.id === storeId)
    .map(shop => ({ code: `${shop.id}-ACCESS`, platformName: shop.platformName, storeId: shop.id }))
}

function validateStoreName(inputName: string, stores: readonly AuthorizedStore[], storeId?: string): string {
  if (!inputName) return '请输入店铺名称。'
  if (inputName.length > storeNameMaxLength) return `店铺名称最多 ${storeNameMaxLength} 个字符。`
  const normalizedName = inputName.toLocaleLowerCase()
  if (stores.some(store => store.id !== storeId && store.name.toLocaleLowerCase() === normalizedName)) {
    return '此店铺名称已被使用，请填写其他名称。'
  }
  return ''
}

interface CredentialField {
  label: string
  value: string | undefined
  demos: readonly DemoCredential[]
}

type CredentialResult = { ok: true; shop: StoreIdentity | undefined } | { ok: false; message: string }

function resolveCredentials(fields: CredentialField[], currentId?: string): CredentialResult {
  const values = new Set<string>()
  const shops = new Map<string, StoreIdentity>()
  let manualCount = 0
  for (const field of fields) {
    const credential = field.value?.trim()
    if (!credential) return { ok: false, message: `请输入${field.label}。` }
    if (credential === invalidDemoCode) return { ok: false, message: `${field.label}校验失败，凭证已失效，请重新获取。` }
    if (values.has(credential)) return { ok: false, message: '请为各区域填写不同的订单发货 Token。' }
    values.add(credential)

    const demo = field.demos.find(option => option.code === credential)
    if (!demo) {
      if (/^DEMO-/i.test(credential)) {
        return { ok: false, message: `${field.label}校验失败，请确认 Token 与所选店铺类型、授权类别及区域一致。` }
      }
      manualCount++
      continue
    }
    if (currentId && currentId !== demo.storeId) {
      return { ok: false, message: `${field.label}关联到其他店铺，请填写原店铺的 Token。` }
    }
    shops.set(demo.storeId, { id: demo.storeId, platformName: demo.platformName })
  }

  if (shops.size > 1) return { ok: false, message: '各区域 Token 属于不同店铺，请填写同一店铺的 Token。' }
  if (shops.size && manualCount) return { ok: false, message: '请核对凭证来源后，分别粘贴同一店铺的各区域 Token。' }
  return { ok: true, shop: shops.values().next().value }
}

// Generic pasted text is accepted for the local prototype only. Its value does not determine shop identity.
function nextDemoIdentity(stores: readonly AuthorizedStore[]): StoreIdentity {
  let serial = 1
  while (stores.some(shop => shop.id === `DEMO-MANUAL-${String(serial).padStart(3, '0')}`)) serial++
  const suffix = String(serial).padStart(3, '0')
  return { id: `DEMO-MANUAL-${suffix}`, platformName: `Temu 店铺 ${suffix}` }
}

export function previewAuthorization(
  input: AuthorizationInput,
  stores: readonly AuthorizedStore[] = authorizedStores.value,
  now = new Date(),
): AuthorizationResult {
  const { storeId, category } = input
  const current = stores.find(store => store.id === storeId)
  if (storeId && !current) return { ok: false, message: '原授权店铺已不存在，请返回列表刷新。' }
  if (current && current.category !== category) return { ok: false, message: '更新授权仅支持原授权类别。' }

  const name = current?.name ?? input.name.trim()
  const nameError = validateStoreName(name, stores, storeId)
  if (nameError) return { ok: false, message: nameError }
  const currency = current?.currency ?? input.currency
  if (currency !== 'USD' && currency !== 'CNY') return { ok: false, message: '请选择店铺币种。' }

  let fields: CredentialField[]
  let selectedRegions: Region[] = []
  const currentHalf = current?.category === 'half-managed' ? current : undefined
  if (input.category === 'half-managed') {
    const { type, region, codes } = input
    if (!getRegionOptions(type).includes(region)) return { ok: false, message: '请选择该店铺类型支持的区域。' }
    selectedRegions = getSelectedRegions(region)
    if (currentHalf && (currentHalf.type !== type
      || selectedRegions.some(area => !currentHalf.regions.some(item => item.region === area)))) {
      return { ok: false, message: '更新授权仅支持原店铺类型和已授权区域。' }
    }
    fields = selectedRegions.map(area => ({
      label: getCredentialLabel(area, type),
      value: codes[area],
      demos: getDemoCodes(type, area),
    }))
  } else {
    fields = [{ label: 'Access Token', value: input.accessToken, demos: getFullManagedDemoCodes() }]
  }

  const resolved = resolveCredentials(fields, storeId)
  if (!resolved.ok) return resolved
  const identity = resolved.shop ?? current ?? nextDemoIdentity(stores)
  if (!current && stores.some(store => store.id === identity.id)) {
    return { ok: false, message: '该平台店铺已授权，请在列表中选择更新授权。' }
  }
  const summary: StoreSummary = { id: identity.id, platformName: identity.platformName, name, currency, enabled: current?.enabled ?? true }
  const period = authorizationPeriod(now)
  if (input.category === 'full-managed') {
    return { ok: true, store: { ...summary, category: input.category, authorization: period } }
  }

  const updatedRegions = selectedRegions.map(region => ({ region, ...period }))
  const regions = currentHalf
    ? currentHalf.regions.map(item => updatedRegions.find(updated => updated.region === item.region) ?? item)
    : updatedRegions
  return {
    ok: true,
    store: { ...summary, category: input.category, type: input.type, regions },
  }
}

export function saveAuthorization(input: AuthorizationInput): AuthorizationResult {
  const result = previewAuthorization(input)
  if (!result.ok) return result
  authorizedStores.value = input.storeId
    ? authorizedStores.value.map(store => store.id === input.storeId ? result.store : store)
    : [result.store, ...authorizedStores.value]
  return result
}

export function updateStoreName(id: string, value: string): AuthorizationResult {
  const current = authorizedStores.value.find(store => store.id === id)
  if (!current) return { ok: false, message: '店铺不存在，请返回列表刷新。' }
  const name = value.trim()
  const nameError = validateStoreName(name, authorizedStores.value, id)
  if (nameError) return { ok: false, message: nameError }
  current.name = name
  return { ok: true, store: current }
}

export function setStoreEnabled(id: string, enabled: boolean): AuthorizationResult {
  const current = authorizedStores.value.find(store => store.id === id)
  if (!current) return { ok: false, message: '店铺不存在，请返回列表刷新。' }
  current.enabled = enabled
  return { ok: true, store: current }
}
