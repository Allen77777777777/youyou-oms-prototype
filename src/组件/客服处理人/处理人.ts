import { computed, ref } from 'vue'

/** 本地评审所用的中台员工及系统 SKU 运营人员资料。只接受系统 SKU，正式数据由优优中台提供。 */
export const handlerOptions = [
  { value: 'staff-01', label: '客服01' },
  { value: 'staff-02', label: '客服02' },
  { value: 'staff-03', label: '客服03' },
]
export const handlerFilterOptions = [...handlerOptions, { value: '', label: '未分配' }]

const skuOwners = new Map<string, string>()
const assignedSkus: Record<string, string[]> = {
  'staff-01': ['DEMO-BP-01', 'DEMO-AF-04', 'DEMO-STORAGE-01', 'DEMO-PET-05', 'HOME-DEMO-01',
    'AUTO-DEMO-04', 'HOME-RACK-01', 'DEMO-RET-ACCESSORY-2', 'OUT-LIGHT-BL', 'OUT-LAMP-13',
    'YY-CA-1048-US', 'YY-WH-7781-US', 'DEMO-SKU-1', 'DEMO-SKU-A'],
  'staff-02': ['DEMO-DH-02', 'DEMO-IC-05', 'DEMO-YOGA-02', 'DEMO-CUP-04', 'DEMO-CHAIR-10', 'OUTDOOR-DEMO-02',
    'PET-DEMO-03', 'HOME-DEMO-EXTRA', 'OUT-CHAIR-02', 'KIT-POT-SV', 'OUT-RACK-13',
    'YY-EM-2207-US', 'YY-CV-3308-BR', 'DEMO-SKU-2', 'DEMO-SKU-B'],
  'staff-03': ['DEMO-MC-07', 'DEMO-WB-06', 'DEMO-LAMP-03', 'DEMO-HOLDER-06', 'LIGHT-DEMO-05',
    'SPORT-DEMO-06', 'HOME-LAMP-03', 'KIT-CUP-02', 'OUT-COVER-13',
    'YY-BM-1280-KR', 'YY-SA-9055-EU', 'YY-AF-0312-JP', 'DEMO-SKU-3', 'DEMO-SKU-C'],
}
for (const [id, skus] of Object.entries(assignedSkus)) {
  for (const sku of skus) skuOwners.set(sku, id)
}

export function getSkuHandlerIds(skus: readonly string[]): string[] {
  const ids = new Set(skus.map(sku => skuOwners.get(sku.trim())))
  return handlerOptions.filter(person => ids.has(person.value)).map(person => person.value)
}

export function handlerIdFromLegacy(name: string): string {
  const value = name.trim()
  if (!value) return ''
  const person = handlerOptions.find(person => person.label === value || person.value === value)
  return person?.value ?? (value.startsWith('legacy:') ? value : 'legacy:' + value)
}

export function handlerNames(ids: readonly string[]): string {
  const names = [...new Set(ids.filter(Boolean))].map(id =>
    handlerOptions.find(person => person.value === id)?.label ?? (id.startsWith('legacy:') ? id.slice(7) : id))
  return names.join('、') || '未分配'
}

export function matchesHandlerFilter(ids: readonly string[], selected: readonly string[]): boolean {
  return !selected.length || (ids.length ? ids.some(id => selected.includes(id)) : selected.includes(''))
}

export const currentHandlerId = ref(handlerOptions[0]!.value)
export const currentHandlerName = computed(() => handlerNames([currentHandlerId.value]))
