import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import { 获取全部页面菜单 } from '@/配置/菜单'
import 中台布局 from '@/布局/中台布局.vue'
import eBay订单页面 from '@/页面/eBay订单/eBay订单页面.vue'
import 全渠道订单详情路由页 from '@/页面/全渠道订单/全渠道订单详情路由页.vue'
import 全渠道订单页面 from '@/页面/全渠道订单/全渠道订单页面.vue'
import 占位页面 from '@/页面/占位页面.vue'

const 已实现页面: Record<string, RouteRecordRaw['component']> = {
  'oms-all-orders': 全渠道订单页面,
  'oms-ebay-orders': eBay订单页面,
}

const 页面路由: RouteRecordRaw[] = 获取全部页面菜单().map((菜单) => ({
  path: 菜单.路径!,
  name: 菜单.id,
  component: 已实现页面[菜单.id] ?? 占位页面,
  meta: {
    title: 菜单.标题,
    source: 菜单.来源,
  },
}))

const eBay订单详情路由: RouteRecordRaw = {
  path: '/oms/orders/ebay/:sellerId/:orderId',
  name: 'oms-ebay-order-detail',
  component: eBay订单页面,
  meta: {
    title: 'eBay订单详情',
    source: '用户规划',
    activeMenu: '/oms/orders/ebay',
    tabTitlePrefix: 'eBay',
    tabTitleParam: 'orderId',
  },
}

const 全渠道订单详情路由: RouteRecordRaw = {
  path: '/oms/orders/all/:systemOrderNo',
  name: 'oms-all-order-detail',
  component: 全渠道订单详情路由页,
  meta: {
    title: '全渠道订单详情',
    source: '用户规划',
    activeMenu: '/oms/orders/all',
    tabTitlePrefix: '订单',
    tabTitleParam: 'systemOrderNo',
  },
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: 中台布局,
      redirect: '/index',
      children: [...页面路由, 全渠道订单详情路由, eBay订单详情路由],
    },
    { path: '/:pathMatch(.*)*', redirect: '/index' },
  ],
})
