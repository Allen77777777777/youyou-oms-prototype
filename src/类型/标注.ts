export interface 原型标注 {
  id: string
  标题: string
  说明: string
  路由?: string
  锚点?: string
  版本?: string
  状态?: '草稿' | '待评审' | '已确认'
  事实等级?: '已确认' | '合理假设' | '待确认'
  prd引用?: string[]
  交互规则?: string[]
  前置条件?: string[]
  触发方式?: string[]
  系统动作?: string[]
  成功结果?: string[]
  异常处理?: string[]
  数据来源?: string[]
  权限与审计?: string[]
  验收要点?: string[]
}
