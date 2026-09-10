import type { Component } from 'vue'
import {
  Box as BoxIcon,
  DataBoard,
  Grid,
  Histogram,
  House,
  Money,
  PieChart,
  Setting,
  ShoppingBag,
  ShoppingCart,
  Tickets,
  Tools,
  TrendCharts,
  Van,
  View,
} from '@element-plus/icons-vue'

import type { 菜单节点 } from '@/类型/菜单'
import { 现有菜单数据 } from './现有菜单'

const 页面 = (
  id: string,
  标题: string,
  路径: string,
  排序: number,
  来源: 菜单节点['来源'],
  事实等级: 菜单节点['事实等级'],
): 菜单节点 => ({ id, 标题, 路径, 排序, 来源, 事实等级, 类型: '页面' })

const 现有模块图标: Record<string, Component> = {
  product: Grid,
  dashboard: PieChart,
  sales: ShoppingBag,
  visual: View,
  purchase: ShoppingCart,
  warehouse: House,
  logistics: Van,
  wms: BoxIcon,
  finance: Money,
  basic: Setting,
  bi: TrendCharts,
  system: Tools,
}

const 现有功能模块: 菜单节点[] = 现有菜单数据.map((模块, 模块索引) => ({
  id: 模块.id,
  标题: 模块.标题,
  类型: '分组',
  排序: (模块索引 + 2) * 10 + (模块索引 >= 2 ? 10 : 0),
  图标: 现有模块图标[模块.id],
  来源: '现有中台',
  事实等级: '已确认',
  子菜单: 模块.分组.map((分组, 分组索引) => ({
    id: `${模块.id}-group-${分组索引 + 1}`,
    标题: 分组.标题,
    类型: '分组',
    排序: (分组索引 + 1) * 10,
    来源: '现有中台',
    事实等级: '已确认',
    子菜单: 分组.菜单.map((标题, 菜单索引) =>
      页面(
        `${模块.id}-${分组索引 + 1}-${菜单索引 + 1}`,
        标题,
        `/legacy/${模块.id}/${分组索引 + 1}/${菜单索引 + 1}`,
        (菜单索引 + 1) * 10,
        '现有中台',
        '已确认',
      ),
    ),
  })),
}))

const OMS菜单: 菜单节点 = {
  id: 'oms',
  标题: 'OMS',
  类型: '分组',
  排序: 40,
  图标: Tickets,
  来源: '用户规划',
  事实等级: '已确认',
  子菜单: [
    {
      id: 'oms-sales-order',
      标题: '销售订单',
      类型: '分组',
      排序: 10,
      来源: '用户规划',
      事实等级: '已确认',
      子菜单: [
        页面('oms-all-orders', '全渠道订单', '/oms/orders/all', 10, '用户规划', '已确认'),
        页面('oms-ebay-orders', 'eBay订单', '/oms/orders/ebay', 20, '用户规划', '已确认'),
        页面('oms-temu-orders', 'Temu订单', '/oms/orders/temu', 30, '用户规划', '已确认'),
      ],
    },
    {
      id: 'oms-self-fulfillment',
      标题: '自发货订单',
      类型: '分组',
      排序: 20,
      来源: '用户规划',
      事实等级: '已确认',
      子菜单: [
        页面('oms-order-processing', '订单处理', '/oms/self-fulfillment/processing', 10, '用户规划', '已确认'),
        页面('oms-shipping-confirmation', '订单标发', '/oms/self-fulfillment/shipping-confirmation', 20, '用户规划', '已确认'),
        页面('oms-manual-orders', '手工订单', '/oms/self-fulfillment/manual-orders', 30, '用户规划', '已确认'),
        页面('oms-order-rules', '订单规则', '/oms/self-fulfillment/order-rules', 40, '用户规划', '已确认'),
        页面('oms-tracking', '物流轨迹', '/oms/self-fulfillment/tracking', 50, '用户规划', '已确认'),
        页面('oms-business-settings', '业务配置', '/oms/self-fulfillment/business-settings', 60, '用户规划', '已确认'),
      ],
    },
    {
      id: 'oms-warehouse-delivery',
      标题: '仓配管理',
      类型: '分组',
      排序: 30,
      来源: '用户规划',
      事实等级: '已确认',
      子菜单: [
        页面('oms-outbound-orders', '三方仓出库单', '/oms/warehouse-delivery/outbound-orders', 10, '用户规划', '已确认'),
        页面('oms-logistics-orders', '物流下单', '/oms/warehouse-delivery/logistics-orders', 20, '用户规划', '已确认'),
        页面('oms-logistics-channels', '物流渠道管理', '/oms/warehouse-delivery/logistics-channels', 30, '用户规划', '已确认'),
      ],
    },
    {
      id: 'oms-ebay-service',
      标题: 'eBay客服',
      类型: '分组',
      排序: 40,
      来源: '用户规划',
      事实等级: '已确认',
      子菜单: [
        页面('oms-ebay-messages', 'eBay站内信', '/oms/ebay-service/messages', 10, '用户规划', '已确认'),
        页面('oms-ebay-disputes', 'eBay纠纷', '/oms/ebay-service/disputes', 20, '用户规划', '已确认'),
        页面('oms-ebay-reviews', 'eBay评价', '/oms/ebay-service/reviews', 30, '用户规划', '已确认'),
        页面('oms-ebay-negative-reviews', 'eBay中差评管理', '/oms/ebay-service/negative-reviews', 40, '用户规划', '已确认'),
        页面('oms-message-templates', '消息模板管理', '/oms/ebay-service/message-templates', 50, '用户规划', '已确认'),
        页面('oms-auto-service-rules', '自动客服规则', '/oms/ebay-service/automation-rules', 60, '用户规划', '已确认'),
        页面('oms-tickets', '工单管理', '/oms/ebay-service/tickets', 70, '用户规划', '已确认'),
        页面('oms-ebay-after-sales', 'eBay售后', '/oms/ebay-service/after-sales', 80, '用户规划', '已确认'),
        页面('oms-service-kpi', '客服KPI统计', '/oms/ebay-service/kpi', 90, '用户规划', '已确认'),
      ],
    },
  ],
}

const 工作台菜单: 菜单节点 = {
  id: 'workbench',
  标题: '工作台',
  类型: '页面',
  排序: 10,
  路径: '/index',
  图标: DataBoard,
  来源: '现有中台',
  事实等级: '已确认',
}

export const 菜单配置: 菜单节点[] = [
  工作台菜单,
  ...现有功能模块,
  OMS菜单,
].sort((a, b) => a.排序 - b.排序)

const 排序菜单 = (节点: 菜单节点[]): 菜单节点[] => [...节点].sort((a, b) => a.排序 - b.排序)

export function 获取全部页面菜单(节点: 菜单节点[] = 菜单配置): 菜单节点[] {
  return 排序菜单(节点).flatMap((菜单) =>
    菜单.类型 === '页面' ? [菜单] : 获取全部页面菜单(菜单.子菜单 ?? []),
  )
}

export function 获取菜单路径(目标路径: string, 节点: 菜单节点[] = 菜单配置): 菜单节点[] {
  for (const 菜单 of 排序菜单(节点)) {
    if (菜单.路径 === 目标路径) return [菜单]

    const 子路径 = 获取菜单路径(目标路径, 菜单.子菜单 ?? [])
    if (子路径.length) return [菜单, ...子路径]
  }

  return []
}

export function 获取首个页面(菜单: 菜单节点): 菜单节点 | undefined {
  if (菜单.类型 === '页面') return 菜单
  return 获取全部页面菜单(菜单.子菜单 ?? [])[0]
}
