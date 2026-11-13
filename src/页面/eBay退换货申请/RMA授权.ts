/** 仅实现官方 Return GraphQL 的 RMA 契约；不发网络请求、不修改退货地址。 */
import type { ReturnRecord } from './模型'
import type { ReturnApiRequest } from './接口契约'

export interface RmaReadContext { shopId: string; returnId: string; marketplaceId: string; enabled: boolean }
export interface RmaGraphqlSource extends RmaReadContext {
  readStatus: 'success' | 'failed' | 'unknown'
  status: string
  actions: string[]
  details: Array<{ rmaNumber: string | null; rmaRequirementWaived: boolean }>
  error: string
  lastAttemptAt?: string
  lastSuccessAt?: string
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const hasErrors = (value: unknown) => value !== undefined && (!Array.isArray(value) || value.length > 0)
const bindingMatches = (row: ReturnRecord, context: RmaReadContext) => !!context.shopId && !!context.returnId && !!context.marketplaceId && context.shopId === row.shopId && context.returnId === row.id && context.marketplaceId === row.marketplaceId
export const usesRmaGraphql = (row: ReturnRecord) => row.detail?.rmaGraphql !== undefined
export function rmaGraphqlBlockedReason(row: ReturnRecord): string {
  const source = row.detail?.rmaGraphql
  if (!source?.enabled) return '当前店铺尚未开通本次退货授权办理'
  if (!bindingMatches(row, source)) return '退货授权资料与当前店铺或申请不一致，请刷新核实'
  if (source.readStatus !== 'success') return source.error || '退货授权资格尚未刷新，请核实后处理'
  if (!['OPEN', 'REQUESTED'].includes(source.status)) return '当前退货阶段不支持提供退货授权'
  if (!source.actions.includes('PROVIDE_RMA_NUMBER')) return '当前申请不支持提供退货授权'
  return ''
}
export const canWaiveRma = (row: ReturnRecord) => usesRmaGraphql(row) && !rmaGraphqlBlockedReason(row)
export const rmaWasWaived = (row: ReturnRecord) => {
  const source = row.detail?.rmaGraphql
  // 已取得的结果与当前可操作资格分开；读取失败不能撤销此前确认的豁免。
  return !!source && bindingMatches(row, source) && source.details.length === 1 && source.details[0]!.rmaRequirementWaived
}

const orderFields = `returnId status { code }
  sellerAvailableActions { respondByAction { respondAction { code } } secondaryActions { code } }
  returnFulfillment { rmaDetails { rmaNumber rmaRequirementWaived } }`
export const rmaQuery = `query ReadReturnRma($input: OrderReturnInput!) {
  orderReturn(input: $input) { __typename ... on OrderReturn { ${orderFields} } ... on ReturnNotFoundError { errorCode } }
}`
export const rmaMutation = `mutation ProvideReturnRma($input: ProvideRmaNumberInput!) {
  provideRmaNumber(input: $input) { __typename ... on OrderReturn { ${orderFields} }
    ... on ProvideRmaNumberInputValidationError { errorCode violations { code displayMessage } }
    ... on ReturnActionNotPermittedError { errorCode }
    ... on ReturnNotFoundError { errorCode }
  }
}`
export function buildRmaGraphqlRequest(row: ReturnRecord, number: string): { error: string; request?: ReturnApiRequest } {
  const error = rmaGraphqlBlockedReason(row)
  if (error) return { error }
  const rmaNumber = number.trim()
  if (Array.from(rmaNumber).length > 100) return { error: '退货授权编号最多 100 个字符' }
  const input = { returnId: row.id, rmaRequirementWaived: !rmaNumber, ...(rmaNumber ? { rmaNumber } : {}) }
  return { error: '', request: { method: 'POST', api: 'return-graphql', path: 'https://graphqlapi.ebay.com/graphql', headers: { 'X-EBAY-C-MARKETPLACE-ID': row.marketplaceId!, 'Content-Type': 'application/json' }, body: { operationName: 'ProvideReturnRma', query: rmaMutation, variables: { input } } } }
}

function readOrderReturn(row: ReturnRecord, value: unknown, context: RmaReadContext, now: string): RmaGraphqlSource {
  const source = object(value), actions = object(source.sellerAvailableActions), primary = object(object(actions.respondByAction).respondAction)
  if (!bindingMatches(row, context) || source.__typename !== 'OrderReturn' || source.returnId !== context.returnId) throw new Error('退货授权响应与当前店铺或申请不一致，请刷新核实')
  const status = object(source.status).code
  if (typeof status !== 'string' || !status) throw new Error('退货授权响应缺少当前状态')
  if (source.sellerAvailableActions === undefined || (source.sellerAvailableActions !== null && !Object.keys(actions).length)) throw new Error('退货授权响应缺少当前操作资格')
  const secondary = actions.secondaryActions
  if (secondary != null && !Array.isArray(secondary)) throw new Error('退货授权操作资格格式无效')
  const codes = [primary, ...(Array.isArray(secondary) ? secondary.map(object) : [])].flatMap(action => typeof action.code === 'string' ? [action.code] : [])
  const fulfillment = object(source.returnFulfillment), details = fulfillment.rmaDetails
  if (details != null && !Array.isArray(details)) throw new Error('退货授权结果格式无效')
  const parsed = (Array.isArray(details) ? details : []).map(value => {
    const detail = object(value)
    if (typeof detail.rmaRequirementWaived !== 'boolean' || (detail.rmaNumber != null && typeof detail.rmaNumber !== 'string')) throw new Error('退货授权结果缺少有效编号或豁免标志')
    return { rmaNumber: typeof detail.rmaNumber === 'string' ? detail.rmaNumber : null, rmaRequirementWaived: detail.rmaRequirementWaived }
  })
  return { ...context, readStatus: 'success', status, actions: codes, details: parsed, error: '', lastAttemptAt: now, lastSuccessAt: now }
}
function clearUnmatchedProjection(row: ReturnRecord, previous: RmaGraphqlSource | undefined): void {
  if (!row.detail || !previous || bindingMatches(row, previous)) return
  // 只清理由此前 GraphQL 结果投影的编号，不覆盖当前独立 Post-Order 来源编号。
  if (previous.details.length === 1 && previous.details[0]!.rmaNumber === row.detail.rmaNumber) row.detail.rmaNumber = null
}
/** 查询上下文由服务端店铺连接提供，不能把 Post-Order 动作直接转换为 GraphQL 资格。 */
export function applyRmaGraphqlQuery(row: ReturnRecord, payload: unknown, context: RmaReadContext, now = new Date().toISOString()): void {
  if (!row.detail) throw new Error('请先读取退货详情')
  const previous = row.detail.rmaGraphql
  clearUnmatchedProjection(row, previous)
  try {
    const response = object(payload)
    if (hasErrors(response.errors)) throw new Error('退货授权资料读取失败，请重新核实')
    row.detail.rmaGraphql = readOrderReturn(row, object(response.data).orderReturn, context, now)
  } catch (error) {
    const retained = previous && bindingMatches(row, previous) ? previous : undefined
    row.detail.rmaGraphql = {
      ...(retained || { shopId: context.shopId, returnId: context.returnId, marketplaceId: context.marketplaceId, enabled: context.enabled }),
      readStatus: 'failed', status: retained?.status || '', actions: [],
      details: retained?.details.map(detail => ({ ...detail })) || [],
      error: error instanceof Error ? error.message : '退货授权资料读取失败', lastAttemptAt: now,
      ...(retained?.lastSuccessAt ? { lastSuccessAt: retained.lastSuccessAt } : {}),
    }
    throw error
  }
}
export function resolveRmaGraphqlMutation(row: ReturnRecord, payload: unknown, now = new Date().toISOString()): { outcome: 'confirmed' | 'failed' | 'unknown'; error: string } {
  const response = object(payload), value = object(object(response.data).provideRmaNumber), source = row.detail?.rmaGraphql
  clearUnmatchedProjection(row, source)
  if (source) source.lastAttemptAt = now
  const unknown = (error: string) => ({ outcome: 'unknown' as const, error })
  if (hasErrors(response.errors) || !source || row.pendingRequest?.api !== 'return-graphql') return unknown('退货授权结果待核查，请刷新核实，勿重复提交')
  if (['ProvideRmaNumberInputValidationError', 'ReturnActionNotPermittedError', 'ReturnNotFoundError'].includes(String(value.__typename))) {
    source.readStatus = 'unknown'; source.actions = []
    return { outcome: 'failed', error: value.__typename === 'ProvideRmaNumberInputValidationError' ? '平台未接受退货授权资料，请核对编号和当前要求后重新办理' : '平台未允许本次退货授权，请刷新申请资格后核实' }
  }
  try {
    const result = readOrderReturn(row, value, source, now), input = object(object(row.pendingRequest.body.variables).input)
    // 不取第一条覆盖多条来源结果；只有唯一且与本次请求一致的结果才确认。
    if (result.details.length !== 1) return unknown('退货授权结果尚未唯一确认，请继续核查')
    const actual = result.details[0]!
    if (input.returnId !== row.id || typeof input.rmaRequirementWaived !== 'boolean' || actual.rmaRequirementWaived !== input.rmaRequirementWaived || (!actual.rmaRequirementWaived && actual.rmaNumber !== input.rmaNumber) || (actual.rmaRequirementWaived && !!actual.rmaNumber)) return unknown('退货授权返回结果与本次提交不一致，请继续核查')
    row.detail!.rmaGraphql = result
    row.detail!.rmaNumber = actual.rmaRequirementWaived ? null : actual.rmaNumber
    return { outcome: 'confirmed', error: '' }
  } catch { return unknown('退货授权返回资料不完整或身份不一致，请继续核查') }
}
/** 只供原型演示，模拟独立平台回查；生产不得从请求自行生成这些事实。 */
export function demoRmaMutationResponse(row: ReturnRecord): unknown {
  const input = object(object(row.pendingRequest?.body.variables).input)
  return { data: { provideRmaNumber: { __typename: 'OrderReturn', returnId: row.id, status: { code: 'OPEN' }, sellerAvailableActions: { respondByAction: null, secondaryActions: [] }, returnFulfillment: { rmaDetails: [{ rmaNumber: input.rmaNumber ?? null, rmaRequirementWaived: input.rmaRequirementWaived }] } } } }
}
