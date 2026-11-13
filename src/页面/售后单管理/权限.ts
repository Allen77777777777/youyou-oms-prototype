import { ref } from 'vue'

export interface AfterSaleActor { id: string; name: string; canApprove: boolean; shopIds: 'all' | string[] }
export const afterSaleActors: AfterSaleActor[] = [
  { id: 'ops-01', name: '运营01', canApprove: true, shopIds: 'all' },
  { id: 'support-01', name: '客服01', canApprove: false, shopIds: 'all' },
  { id: 'ops-02', name: '运营02', canApprove: true, shopIds: ['shop-us'] },
]
export const activeAfterSaleActor = ref<AfterSaleActor>(afterSaleActors[0]!)

/** 唯一一份既有演示店铺授权；与售后数据初始化分离，避免 Return 互相导入。 */
export function canViewAfterSale(input: { shopId: string }, actor = activeAfterSaleActor.value): boolean {
  return actor.shopIds === 'all' || actor.shopIds.includes(input.shopId)
}
