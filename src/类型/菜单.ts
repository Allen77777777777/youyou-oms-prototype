import type { Component } from 'vue'

export type 菜单节点类型 = '页面' | '分组'

export interface 菜单节点 {
  id: string
  标题: string
  类型: 菜单节点类型
  排序: number
  路径?: string
  图标?: Component
  子菜单?: 菜单节点[]
  来源: '现有中台' | '用户规划' | '易仓现状'
  事实等级: '已确认' | '现状证据' | '待核验'
}
