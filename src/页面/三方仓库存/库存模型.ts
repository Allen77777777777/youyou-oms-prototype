export const 数量定义 = [
  { key: 'available', label: '可用数量', code: 'available_qty', definition: '仓库认定尚可分配给新出库需求的商品数量，不代表已为某一 OMS 订单预留。' },
  { key: 'reserved', label: '占用数量', code: 'reserved_qty', definition: '已分配或预留给订单、出库任务等业务，尚未完成出库且不能重复分配的商品数量。' },
  { key: 'unavailable', label: '不可用数量', code: 'unavailable_qty', definition: '因质量、管控或作业状态等原因不能用于正常出库的商品数量，具体包含范围需按来源确认。' },
  { key: 'transit', label: '在途数量', code: 'in_transit_qty', definition: '已发往当前仓库、尚未完成入库并被仓库识别为在途的数量，不含尚未发出的计划。' },
  { key: 'onHand', label: '在库数量', code: 'on_hand_qty', definition: '已计入仓库库存账、尚未出库的商品存量，不含在途；各库存状态的包含范围按来源确认。' },
  { key: 'defective', label: '次品数量', code: 'defective_qty', definition: '已判定为质量不合格、破损或其他次品，不能按正常良品出库的数量，不等于全部不可用库存。' },
  { key: 'frozen', label: '冻结数量', code: 'frozen_qty', definition: '因仓库管控而暂停分配或出库、需要解除冻结才能恢复相应作业的数量，不代表一定存在质量问题。' },
  { key: 'putaway', label: '待上架数量', code: 'pending_putaway_qty', definition: '仓库已收货并识别为待上架、尚未完成上架作业的数量；是否计入在库按来源确认。' },
] as const
export type 数量键 = typeof 数量定义[number]['key']
export type 映射状态 = '已映射' | '未映射' | '映射冲突'
export interface 库存记录 {
  id: string; provider: string; accountId: string; account: string; warehouseId: string; warehouse: string; country: string
  systemSku: string; warehouseSku: string; name: string; specification: string; unit: string
  quantities: Record<数量键, number | null>; mapping: 映射状态; issues: string[]; updatedAt: string; sourceAt: string
  lastAttempt: string; attemptResult: string; enabled: boolean; presence: string
}
const 仓库样例 = [
  ['万邑通', 'demo-winit-a', '演示账号甲', 'demo-la', '演示洛杉矶仓', '美国'],
  ['谷仓', 'demo-good-a', '演示账号甲', 'demo-nj', '演示新泽西仓', '美国'],
  ['4PX', 'demo-4px-a', '演示账号甲', 'demo-bh', '演示伯明翰仓', '英国'],
  ['西邮', 'demo-west-a', '演示账号甲', 'demo-du', '演示杜伊斯堡仓', '德国'],
  ['出口易', 'demo-ck-a', '演示账号甲', 'demo-to', '演示多伦多仓', '加拿大'],
  ['万邑通', 'demo-winit-b', '演示账号乙', 'demo-la', '演示洛杉矶仓', '美国'],
] as const
const 商品样例 = [
  ['DEMO-BRK-001', '陶瓷刹车片', '前轮 · 4 片装'], ['DEMO-FLT-002', '发动机空气滤芯', '标准型 · 单件'],
  ['DEMO-LMP-003', 'LED 前照灯', '左侧 · 白光'], ['DEMO-MIR-004', '外后视镜总成', '右侧 · 黑色'],
  ['DEMO-SPK-005', '点火线圈', '12V · 单件'], ['DEMO-WPR-006', '无骨雨刷', '24 英寸 · 2 支装'],
] as const
// 全部为固定虚构来源样例，数量直接赋值，不从订单或其他数量指标计算。
export const 库存样例: 库存记录[] = Array.from({ length: 62 }, (_, i) => {
  const w = 仓库样例[i % 仓库样例.length]!
  const p = 商品样例[Math.floor(i / 6) % 商品样例.length]!
  return { id: `inventory-demo-${i + 1}`, provider: w[0], accountId: w[1], account: w[2], warehouseId: w[3], warehouse: w[4], country: w[5],
    systemSku: p[0], warehouseSku: `WH-DEMO-${String(i + 1).padStart(4, '0')}`, name: p[1], specification: p[2], unit: '件',
    quantities: { available: [128, 56, 0, 240, 18, 10][i % 6]!, reserved: [12, 4, 0, 26, 2, 3][i % 6]!, unavailable: [2, 0, null, 4, 1, 0][i % 6]!, transit: [60, 0, null, 120, 24, 20][i % 6]!, onHand: null, defective: null, frozen: null, putaway: null },
    mapping: '已映射', issues: [], updatedAt: '2026-09-23T02:30:00Z', sourceAt: '2026-09-23T02:28:00Z', lastAttempt: '2026-09-23T02:30:00Z', attemptResult: '成功', enabled: true, presence: '已确认存在' }
})
Object.assign(库存样例[1]!, { mapping: '未映射', systemSku: '', name: '', specification: '', issues: ['未映射'] })
Object.assign(库存样例[3]!, { updatedAt: '2026-09-22T01:00:00Z', sourceAt: '2026-09-22T00:58:00Z', attemptResult: '失败', issues: ['更新失败', '可能过期'] })
Object.assign(库存样例[4]!, { sourceAt: '', issues: ['来源时间未知'] })
Object.assign(库存样例[6]!, { unit: '箱' })
Object.assign(库存样例[7]!, { mapping: '映射冲突', systemSku: '', name: '', issues: ['映射冲突'] })
库存样例[8]!.quantities.available = -1
库存样例[8]!.issues = ['数量异常']
Object.assign(库存样例[9]!, { enabled: false, issues: ['资料停用'] })
库存样例[10]!.quantities.available = null
库存样例[10]!.issues = ['可用数量未取得']
Object.assign(库存样例[11]!, { presence: '本次未确认', issues: ['本次未确认'] })
库存样例[12]!.quantities = { available: 10, reserved: 3, unavailable: 0, transit: 20, onHand: 15, defective: 1, frozen: 1, putaway: 2 }
// 同一仓库 SKU 在两个账号下，仍是两条独立来源记录。
库存样例[5]!.warehouseSku = 库存样例[0]!.warehouseSku
export interface 库存筛选 {
  providers: string[]; accounts: string[]; warehouses: string[]; keywordType: 'systemSku' | 'warehouseSku' | 'name'; keyword: string
  country: string; mapping: string; issue: string; metric: 数量键; operator: '' | 'eq' | 'gt' | 'lt' | 'range'; minimum: string; maximum: string; dates: string[]
}
export function 初始筛选(): 库存筛选 { return { providers: [], accounts: [], warehouses: [], keywordType: 'systemSku', keyword: '', country: '', mapping: '', issue: '', metric: 'available', operator: '', minimum: '', maximum: '', dates: [] } }
export function 校验筛选(f: 库存筛选): string {
  if (f.keywordType !== 'name' && new Set(f.keyword.split(/\r?\n/).map(s => s.trim()).filter(Boolean)).size > 200) return '批量 SKU 最多 200 个，请减少查询内容。'
  if (f.operator && (!f.minimum.trim() || !Number.isFinite(Number(f.minimum)))) return '请输入有效的数量条件。'
  if (f.operator === 'range' && (!f.maximum.trim() || !Number.isFinite(Number(f.maximum)) || Number(f.minimum) > Number(f.maximum))) return '数量区间结束值应大于或等于起始值。'
  return ''
}
export function 查询库存(rows: 库存记录[], f: 库存筛选): 库存记录[] {
  const words = f.keyword.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  return rows.filter(r => (!f.providers.length || f.providers.includes(r.provider)) && (!f.accounts.length || f.accounts.includes(r.accountId)) && (!f.warehouses.length || f.warehouses.includes(r.warehouseId))
    && (!words.length || (f.keywordType === 'name' ? r.name.includes(f.keyword.trim()) : words.includes(r[f.keywordType])))
    && (!f.country || r.country === f.country) && (!f.mapping || r.mapping === f.mapping) && (!f.issue || 数据提示(r).includes(f.issue))
    && (!f.dates.length || (!!r.updatedAt && Date.parse(r.updatedAt) >= Date.parse(`${f.dates[0]}T00:00:00+08:00`) && Date.parse(r.updatedAt) <= Date.parse(`${f.dates[1]}T23:59:59.999+08:00`)))
    && (!f.operator || (r.quantities[f.metric] !== null && ({ eq: (v: number) => v === Number(f.minimum), gt: (v: number) => v > Number(f.minimum), lt: (v: number) => v < Number(f.minimum), range: (v: number) => v >= Number(f.minimum) && v <= Number(f.maximum) }[f.operator])(r.quantities[f.metric]!))))
}
export function 数据提示(r: 库存记录): string[] { return [...r.issues, ...(Object.values(r.quantities).some(v => v === null) ? ['部分字段未提供'] : [])] }
export function 空值说明(r: 库存记录, key: 数量键): string { return key === 'available' && r.issues.includes('可用数量未取得') ? '未取得' : '来源未提供' }
export function 数量文本(r: 库存记录, key: 数量键): string { return r.quantities[key] === null ? '—' : String(r.quantities[key]) }
export function 时间文本(value: string): string { return value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '未提供' }
