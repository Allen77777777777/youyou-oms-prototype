import type { 拆单轨迹 } from './拆单规则模型'

const 关键状态 = new Set<拆单轨迹['status']>(['命中', '失败', '资料待核实'])

/** 编号只根据本次真实父子关系生成，供执行轨迹和最终包裹卡共用。 */
export function 构建拆单包裹编号(trace: readonly 拆单轨迹[], packages: readonly { key: string }[] = []): Map<string, string> {
  const numbers = new Map<string, string>()
  let rootNumber = 0
  const ensureRoot = (key: string) => {
    if (key && key !== '—' && !numbers.has(key)) numbers.set(key, String(++rootNumber))
  }
  for (const entry of trace) {
    ensureRoot(entry.packageKey)
    const parent = numbers.get(entry.packageKey)
    if (!parent) continue
    for (const [index, key] of (entry.outputPackageKeys ?? []).entries()) {
      if (key && key !== '—' && key !== entry.packageKey && !numbers.has(key)) numbers.set(key, `${parent}-${index + 1}`)
    }
  }
  // 旧记录可能没有输出包身份：单独编号，不从内部 ID 或相邻轨迹猜测关系。
  packages.forEach(pack => ensureRoot(pack.key))
  return numbers
}

export function 格式化拆单包裹流向(entry: 拆单轨迹, numbers: ReadonlyMap<string, string>): string {
  const number = numbers.get(entry.packageKey)
  if (!number) return entry.status === '停用' ? '不参与匹配' : '包裹范围待核实'
  const parent = `包裹 ${number}`
  if (entry.status === '失败' || entry.status === '资料待核实') return `${parent} · 本步未生成新包裹`
  if (entry.status !== '命中') return `${parent} · 保持不变`
  const outputs = entry.outputPackageKeys?.map(key => numbers.get(key))
  if (outputs?.length && outputs.every((value): value is string => !!value)) {
    return entry.outputPackageKeys?.length === 1 && entry.outputPackageKeys[0] === entry.packageKey
      ? `${parent} · 保持一包`
      : `${parent} → ${outputs.map(value => `包裹 ${value}`).join('、')}`
  }
  return entry.afterCount > 1 ? `${parent} → ${entry.afterCount} 个包裹` : `${parent} · 保持一包`
}

export function 分组拆单轨迹(trace: readonly 拆单轨迹[]) {
  const rows = trace.map((entry, index) => ({ entry, index }))
  return { important: rows.filter(row => 关键状态.has(row.entry.status)), other: rows.filter(row => !关键状态.has(row.entry.status)) }
}

export function 拆单其他轨迹摘要(trace: readonly 拆单轨迹[]): string {
  return (['未命中', '停用', '未继续匹配'] as const).map(status => {
    const count = trace.filter(entry => entry.status === status).length
    return count ? `${status} ${count} 条` : ''
  }).filter(Boolean).join(' · ')
}
