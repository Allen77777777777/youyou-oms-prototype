import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router'

export function buyerLocation(shopId: string, buyerId: string): RouteLocationRaw {
  return { name: 'oms-ebay-buyer-detail', params: { shopId, buyerId } }
}

export const buyerDetailRoute: RouteRecordRaw = {
  path: '/oms/ebay-service/buyers/:shopId/:buyerId',
  name: 'oms-ebay-buyer-detail',
  component: () => import('./买家详情页面.vue'),
  meta: { title: '买家详情', source: '用户规划', activeMenu: '/oms/ebay-service/messages', tabTitlePrefix: '买家', tabTitleParam: 'buyerId' },
}
