import { computed, ref } from 'vue'
import { currentHandlerId, currentHandlerName } from '@/组件/客服处理人/处理人'

export interface AfterSaleActor { id: string; name: string; canApprove: boolean; shopIds: 'all' | string[] }
export const afterSaleActors: AfterSaleActor[] = [
  { id: 'ops-01', name: '运营01', canApprove: true, shopIds: 'all' },
  { id: 'support-01', name: '客服01', canApprove: false, shopIds: 'all' },
  { id: 'ops-02', name: '运营02', canApprove: true, shopIds: ['shop-us'] },
  { id: 'support-02', name: '客服02', canApprove: false, shopIds: 'all' },
  { id: 'support-03', name: '客服03', canApprove: false, shopIds: 'all' },
]
const sessionIds: Record<string, string> = { 'support-01': 'staff-01', 'support-02': 'staff-02', 'support-03': 'staff-03' }
const sessionIdFor = (actor: AfterSaleActor) => sessionIds[actor.id] ?? actor.id
// 保留演示权限范围调整入口；人员身份由全局会话唯一决定，不使用商品负责人授予权限。
const actorOverride = ref<{ sessionId: string; actor: AfterSaleActor }>()
export const activeAfterSaleActor = computed<AfterSaleActor>({
  get() {
    const sessionId = currentHandlerId.value
    if (actorOverride.value?.sessionId === sessionId) return actorOverride.value.actor
    return afterSaleActors.find(actor => sessionIdFor(actor) === sessionId) ??
      { id: sessionId, name: currentHandlerName.value, canApprove: false, shopIds: [] }
  },
  set(actor) {
    const sessionId = sessionIdFor(actor)
    actorOverride.value = { sessionId, actor }
    currentHandlerId.value = sessionId
  },
})

/** 唯一一份既有演示店铺授权；与售后数据初始化分离，避免 Return 互相导入。 */
export function canViewAfterSale(input: { shopId: string }, actor = activeAfterSaleActor.value): boolean {
  return actor.shopIds === 'all' || actor.shopIds.includes(input.shopId)
}
