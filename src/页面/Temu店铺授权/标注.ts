import type { 原型标注 } from '@/类型/标注'

type AnnotationKey = 'filters' | 'list' | 'add' | 'actions' | 'form' | 'confirm' | 'detail'
type AnnotationContent = Pick<原型标注, '标题' | '分类' | '说明' | '交互规则'>

function annotation(key: AnnotationKey, content: AnnotationContent): 原型标注 {
  const anchor = `temu-auth-${key}`
  return {
    ...content,
    id: anchor,
    锚点: anchor,
    路由: '/oms/orders/temu-authorization',
    版本: 'V0.2 / 2026-11-24',
    状态: '待评审',
    事实等级: '合理假设',
    prd引用: ['AGENTS.md · 店铺接入方式、一期目标边界', 'https://www.lingxing.com/help/article/TemuFBMAuthorization', 'https://www.lingxing.com/help/article/TemuAuthorization'],
    数据来源: ['本地虚构店铺、授权状态、期限和操作结果。'],
    权限与审计: ['授权校验在本地模拟。凭证仅用于当前表单，输入时遮罩显示，不写入店铺记录、浏览器持久存储或外部存储，也不发送网络请求。'],
  }
}

export const temuAuthAnnotation: Record<AnnotationKey, 原型标注> = {
  filters: annotation('filters', {
    标题: '查询店铺授权',
    分类: '交互',
    说明: '可按店铺名称、托管类型、店铺类型、授权区域或状态查找授权记录。',
    交互规则: ['组合查询用于缩小列表范围。重置后恢复默认列表。'],
  }),
  list: annotation('list', {
    标题: 'Temu 授权记录',
    分类: '页面',
    说明: '本页管理 Temu 半托管跨境、半托管本土和全托管店铺授权。',
    交互规则: ['列表为本地授权资料。授权结果和店铺启停分别展示，店铺启停不会更新平台授权期限。', '商品及库存授权另属中台现有能力，原型演示店铺凭证录入及授权记录维护。'],
  }),
  add: annotation('add', {
    标题: '添加店铺授权',
    分类: '交互',
    说明: '选择托管类型，填写店铺名称和币种，按对应表单粘贴授权凭证。',
    交互规则: ['新增店铺采用人工录入。半托管与全托管均须选择店铺币种，可选 CNY 或 USD。半托管按适用站点选择授权区域。'],
  }),
  actions: annotation('actions', {
    标题: '管理单条授权',
    分类: '交互',
    说明: '查看店铺详情、编辑名称、更新凭证及启停店铺。',
    交互规则: ['名称维护仅更新中台显示名称。更新授权以当前店铺记录为准，无法确认结果时保留已有授权资料。'],
  }),
  form: annotation('form', {
    标题: '录入店铺授权',
    分类: '交互',
    说明: '使用遮罩输入框，手动粘贴对应店铺的授权凭证。',
    交互规则: ['半托管跨境店铺选择美国、全球、欧区或美国 / Global；选择美国 / Global 时，在两个输入框分别粘贴各区域的订单发货 Token。', '半托管本土店铺按站点选择单个区域，墨西哥、加拿大等非美国及欧区站点选 Global，粘贴一个 Access Token。', '全托管店铺选择币种并粘贴一个 Access Token，表单不提供区域选项。原型使用测试文本演示校验和结果。'],
  }),
  confirm: annotation('confirm', {
    标题: '确认店铺变更',
    分类: '交互',
    说明: '确认前展示目标店铺和本次操作，取消后保留原有资料。',
    交互规则: ['启停只影响该店铺在中台的启用状态，不修改 Temu 卖家中心的店铺状态或平台授权有效期。'],
  }),
  detail: annotation('detail', {
    标题: '查看授权详情',
    分类: '字段',
    说明: '按当前店铺查看身份、店铺币种、授权状态和有效时间。',
    交互规则: ['半托管按已授权区域查看。全托管按整店查看。详情显示授权结果及时间，凭证只在当前录入表单使用。'],
  }),
}
