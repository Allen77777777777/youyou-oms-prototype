import type { 原型标注 } from '@/类型/标注'

const entries = {
  list: ['售后单管理列表', '每行一张售后单。Return ID 下方显示来源场景「eBay退货申请」，点击申请号可查看同店该申请的全部处理记录。商品列显示商品名和系统 SKU，店铺、平台订单号、系统售后原因各占一列。', '跨页共用浏览器会话中的虚构资料，真实 API、服务端权限、审计和持久化尚未接入。'],
  filters: ['售后单查询范围', '按方法、店铺、原因、创建日期及单号或 SKU 查询授权范围内的售后单。', '查询才应用筛选草稿；日期按北京时间的自然日计算。切换审核队列或分页不会提交未应用的草稿。'],
  queues: ['审核队列', '全额退款、部分退款及需要买家寄回的退货直接建单。买家保留商品时只记录平台决定，后续退款时登记退款单。仅重发有待审核、已审核两态。', '「无需审核」是直接建单的展示分组，审核人和审核时间保持为空。各队列数量取已经应用的筛选范围。'],
  reviewSelection: ['待审核操作', '在待审核页签单选一张有权限的重发单，点击筛选条件下方的审核按钮，核对并补齐发货资料。', '切换页签、分页、查询或身份时清空选择。完成审核后单据移至已审核队列。'],
  detail: ['来源与商品明细', '单据关联原 eBay 申请及已核实的系统订单，系统原因、平台原因和内部备注分别展示。', '来源申请按店铺和 Return ID 定位，手工订单按关联的系统订单号定位。'],
  result: ['本次处理结果', '平台售后状态跟随原申请，主行使用 eBay SUMMARY.state，补充使用 SUMMARY.status。两项中文不同时显示总体状态，悬停可查看原码。', '本地办理结果仅在本次办理明细及同申请处理记录中展示。仓库实收与本笔实际退款按各自凭证核实。'],
  related: ['同申请处理记录', '同店铺、同一 Return ID 的每次独立办理分行展示，可直接打开对应售后单。', '申请合计分别展示已批准退回、仓库实收及已确认实际退款。实际退款按币种汇总一次，缺少依据显示待核实。'],
  approval: ['重发人工审核', '有重发审核权限的运营可以审核自己提交的单，核对商品、原单收件地址及发货路由后生成手工订单。', '打开审核时自动带入可靠原单资料。审核人补齐缺项后确认，重新校验店铺权限、原单及履约资料。每张售后单只生成一张手工订单，由 OMS 人工审单。'],
} as const

export const afterSaleAnnotations: 原型标注[] = Object.entries(entries).map(([key, [title, description, rule]]) => ({
  id: 'oms.after-sale-orders.' + key,
  锚点: 'oms.after-sale-orders.' + key,
  路由: '/oms/ebay-service/after-sale-orders',
  分类: key === 'list' ? '页面' : key === 'approval' ? '规则' : '交互',
  标题: title,
  说明: description,
  版本: '1.2',
  状态: '待评审',
  事实等级: key === 'approval' || key === 'queues' ? '已确认' : '合理假设',
  prd引用: ['PRD/售后单管理功能PRD.md', 'PRD/eBay退换货申请功能PRD.md'],
  交互规则: [rule],
}))

export const afterSaleAnnotation = (key: keyof typeof entries) => afterSaleAnnotations.find(item => item.id === 'oms.after-sale-orders.' + key)!
