import type { RouteRecordRaw } from 'vue-router'

export const returnDetailRoute: RouteRecordRaw = {
  path: '/oms/ebay-service/returns/:shopId/:returnId',
  name: 'oms-ebay-return-detail',
  component: () => import('./退货详情页面.vue'),
  meta: { title: '退货退款申请详情', source: '用户规划', activeMenu: '/oms/ebay-service/returns', tabTitlePrefix: '退货', tabTitleParam: 'returnId' },
}
