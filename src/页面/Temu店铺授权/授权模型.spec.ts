import { afterEach, describe, expect, it } from 'vitest'

import {
  type AuthorizationInput,
  type AuthorizedStore,
  authorizedStores,
  getAuthorizationStatus,
  getDemoCodes,
  getFullManagedDemoCodes,
  getRegionOptions,
  getRegionStatus,
  invalidDemoCode,
  previewAuthorization,
  saveAuthorization,
  setStoreEnabled,
  updateStoreName,
} from './授权模型'

const now = new Date('2026-11-24T08:00:00.000Z')
const copyStores = (stores: AuthorizedStore[]) => stores.map(store => store.category === 'half-managed'
  ? { ...store, regions: store.regions.map(region => ({ ...region })) }
  : { ...store, authorization: { ...store.authorization } })
const initialStores = copyStores(authorizedStores.value)
const combined: Extract<AuthorizationInput, { category: 'half-managed' }> = {
  category: 'half-managed',
  currency: 'USD',
  name: '  美区与全球店  ',
  type: 'cross-border',
  region: 'US_GLOBAL',
  codes: { US: 'DEMO-800101-US', GLOBAL: 'DEMO-800101-GLOBAL' },
}

const fullManaged: Extract<AuthorizationInput, { category: 'full-managed' }> = {
  category: 'full-managed', currency: 'CNY', name: '全托文具店', accessToken: 'DEMO-800201-ACCESS',
}

afterEach(() => {
  authorizedStores.value = copyStores(initialStores)
})

describe('Temu 店铺授权', () => {
  it('跨境合并授权以平台店铺 ID 建一条记录并保留两个区域授权结果', () => {
    const result = previewAuthorization(combined, initialStores, now)
    expect(result).toEqual({
      ok: true,
      store: {
        id: 'DEMO-800101',
        name: '美区与全球店',
        platformName: 'Cedar Lane',
        category: 'half-managed',
        currency: 'USD',
        type: 'cross-border',
        enabled: true,
        regions: [
          { region: 'US', authorizedAt: '2026-11-24T08:00:00.000Z', expiresAt: '2027-02-22T08:00:00.000Z' },
          { region: 'GLOBAL', authorizedAt: '2026-11-24T08:00:00.000Z', expiresAt: '2027-02-22T08:00:00.000Z' },
        ],
      },
    })
    expect(JSON.stringify(result)).not.toContain('DEMO-800101-US')
    expect(authorizedStores.value).toHaveLength(initialStores.length)
  })

  it('联合授权缺凭据、跨区域、凭据无效或各区域属于不同店铺时拒绝整次提交', () => {
    expect(previewAuthorization({ ...combined, codes: { US: combined.codes.US } })).toEqual({
      ok: false, message: expect.stringContaining('Global'),
    })
    expect(previewAuthorization({ ...combined, codes: { US: combined.codes.US, GLOBAL: 'DEMO-800102-US' } })).toEqual({
      ok: false, message: expect.stringContaining('校验失败'),
    })
    expect(previewAuthorization({ ...combined, codes: { ...combined.codes, US: invalidDemoCode } })).toEqual({
      ok: false, message: expect.stringContaining('校验失败'),
    })
    expect(saveAuthorization({ ...combined, codes: { ...combined.codes, GLOBAL: 'DEMO-800102-GLOBAL' } })).toEqual({
      ok: false, message: expect.stringContaining('不同店铺'),
    })
    expect(authorizedStores.value).toHaveLength(initialStores.length)
  })

  it('本土店铺可按各自站点授权一个区域，联合选项仅用于跨境店铺', () => {
    const regions = getRegionOptions('local')
    expect(regions).toEqual(['US', 'GLOBAL', 'EU'])
    expect(previewAuthorization({ ...combined, type: 'local' }).ok).toBe(false)
    expect(previewAuthorization({
      category: 'half-managed', currency: 'USD', name: '本土墨西哥店', type: 'local', region: 'GLOBAL',
      codes: { GLOBAL: 'DEMO-800105-GLOBAL' },
    }).ok).toBe(true)
    expect(getDemoCodes('cross-border', 'US', undefined, 'US_GLOBAL').map(({ storeId }) => storeId)).not.toContain('DEMO-800007')
  })

  it('拒绝重复店名和重复平台店铺 ID，并保留已写入的状态', () => {
    const created = saveAuthorization(combined)
    expect(created.ok).toBe(true)
    expect(saveAuthorization({ ...combined, name: '另一店名' })).toEqual({
      ok: false, message: expect.stringContaining('该平台店铺已授权'),
    })
    expect(saveAuthorization({
      ...combined, codes: { US: 'DEMO-800102-US', GLOBAL: 'DEMO-800102-GLOBAL' },
    })).toEqual({ ok: false, message: expect.stringContaining('店铺名称已被使用') })
    expect(authorizedStores.value).toHaveLength(initialStores.length + 1)
  })

  it('续权只接受原店铺的已选区域，并保留原名称、停用状态及其余区域', () => {
    const existing = initialStores.find(({ id }) => id === 'DEMO-800005')!
    if (existing.category !== 'half-managed') throw new Error('Expected half-managed fixture.')
    const renewal: AuthorizationInput = {
      category: 'half-managed', currency: 'CNY', name: '不应用的店名',
      type: existing.type, region: 'GLOBAL', storeId: existing.id, codes: { GLOBAL: 'DEMO-800005-GLOBAL' },
    }
    expect(previewAuthorization({ ...renewal, codes: { GLOBAL: 'DEMO-800101-GLOBAL' } }).ok).toBe(false)
    expect(previewAuthorization({ ...renewal, region: 'EU', codes: { EU: 'DEMO-800103-EU' } }).ok).toBe(false)
    expect(setStoreEnabled(existing.id, false).ok).toBe(true)
    const result = saveAuthorization(renewal)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    if (result.store.category !== 'half-managed') throw new Error('Expected half-managed result.')
    expect(result.store.name).toBe(existing.name)
    expect(result.store.currency).toBe(existing.currency)
    expect(result.store.enabled).toBe(false)
    expect(result.store.regions[0]).toEqual(existing.regions[0])
    expect(result.store.regions[1]?.expiresAt).not.toBe(existing.regions[1]?.expiresAt)
    expect(authorizedStores.value).toHaveLength(initialStores.length)
  })

  it('编辑名称与店铺开关不会修改区域授权时间或授权状态', () => {
    const existing = initialStores[3]!
    expect(updateStoreName(existing.id, initialStores[0]!.name).ok).toBe(false)
    expect(updateStoreName(existing.id, '  新的店铺名称  ').ok).toBe(true)
    const updated = setStoreEnabled(existing.id, true)
    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error(updated.message)
    expect(updated.store.name).toBe('新的店铺名称')
    expect(updated.store).toMatchObject({ ...existing, name: '新的店铺名称', enabled: true })
    expect(getAuthorizationStatus(updated.store)).toBe('expired')
  })

  it('区分到期预警、全部失效和部分区域失效', () => {
    expect(getRegionStatus('2026-12-01T08:00:00.001Z', now)).toBe('authorized')
    expect(getRegionStatus('2026-12-01T08:00:00.000Z', now)).toBe('expiring')
    expect(getRegionStatus(now.toISOString(), now)).toBe('expired')
    expect(getAuthorizationStatus(initialStores[4]!)).toBe('partial')
  })

  it('全托管授权只保存 Access Token 对应身份和单一有效期，币种必填', () => {
    expect(previewAuthorization({ ...fullManaged, currency: '' })).toEqual({
      ok: false, message: '请选择店铺币种。',
    })
    expect(previewAuthorization({ ...combined, currency: '' })).toEqual({
      ok: false, message: '请选择店铺币种。',
    })
    expect(previewAuthorization({ ...fullManaged, accessToken: 'DEMO-800101-US' }).ok).toBe(false)
    const result = previewAuthorization(fullManaged, initialStores, now)
    expect(result).toEqual({
      ok: true,
      store: {
        id: 'DEMO-800201', name: '全托文具店', platformName: 'Willow Studio',
        category: 'full-managed', currency: 'CNY', enabled: true,
        authorization: { authorizedAt: '2026-11-24T08:00:00.000Z', expiresAt: '2027-02-22T08:00:00.000Z' },
      },
    })
    if (!result.ok) throw new Error(result.message)
    expect(getAuthorizationStatus(result.store, now)).toBe('authorized')
  })

  it('全托管续权维持原管理模式、币种和身份，重新计算原授权的有效期', () => {
    const existing = initialStores.find(store => store.id === 'DEMO-800013')!
    if (existing.category !== 'full-managed') throw new Error('Expected full-managed fixture.')
    const code = getFullManagedDemoCodes(existing.id)[0]!.code
    expect(getAuthorizationStatus(existing)).toBe('expired')
    expect(previewAuthorization({ ...combined, storeId: existing.id }).ok).toBe(false)
    expect(previewAuthorization({ ...fullManaged, storeId: existing.id }).ok).toBe(false)
    const result = saveAuthorization({ ...fullManaged, currency: 'USD', storeId: existing.id, accessToken: code })
    if (!result.ok) throw new Error(result.message)
    expect(result.store).toMatchObject({ id: existing.id, currency: existing.currency, enabled: false })
    expect(getAuthorizationStatus(result.store)).toBe('authorized')
    expect(authorizedStores.value).toHaveLength(initialStores.length)
  })

  it('手动粘贴仅在本地模拟校验，保存与预览使用相同虚构身份且不保留输入', () => {
    const enteredValue = 'test-only-value-for-preview'
    const input = { ...fullManaged, accessToken: `  ${enteredValue}  ` }
    const preview = previewAuthorization(input)
    const saved = saveAuthorization(input)
    if (!preview.ok) throw new Error(preview.message)
    if (!saved.ok) throw new Error(saved.message)
    expect(saved.store.id).toBe(preview.store.id)
    expect(JSON.stringify(authorizedStores.value)).not.toContain(enteredValue)
    expect(previewAuthorization({ ...combined, codes: { US: enteredValue, GLOBAL: enteredValue } }).ok).toBe(false)
    expect(previewAuthorization({ ...combined, codes: { US: enteredValue, GLOBAL: combined.codes.GLOBAL } }).ok).toBe(false)
    expect(previewAuthorization({ ...combined, codes: { US: enteredValue, GLOBAL: 'test-second-value' } }).ok).toBe(true)
  })
})
