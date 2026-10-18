export interface 默认审单项 {
  readonly no: number
  readonly name: string
  readonly description: string
  readonly result: string
}
export interface 默认审单分组数据 {
  readonly title: string
  readonly items: readonly 默认审单项[]
}

const 分组: 默认审单分组数据[] = [
  {
    title: "审核操作资格",
    items: [
      { no: 1, name: "订单不存在或不属于待审核的自配送订单", description: "拒绝或跳过本轮审核。", result: "资格不满足时拒绝或跳过，不启动本轮审核。" },
      { no: 2, name: "缺少审核权限或订单数据权限", description: "拒绝或跳过本次操作，批量审核还需批量权限。", result: "无操作或数据权限时拒绝或跳过。" },
      { no: 3, name: "订单已有审核正在进行", description: "不重复启动审核。", result: "不重复启动审核轮次。" },
      { no: 4, name: "订单在预检后发生变化", description: "拒绝旧预检结果，重新检查当前订单及发货情况。", result: "拒绝旧预检提交，重新检查当前订单。" },
    ],
  },
  {
    title: "平台发货条件",
    items: [
      { no: 5, name: "付款状态不满足发货条件", description: "不能通过审核；eBay 按订单当前付款状态判断，付款时间不能替代。", result: "付款不满足时不能通过；新下载订单和已进入处理的订单分别按对应规则处理。" },
      { no: 6, name: "订单取消中或已取消", description: "不能通过审核，按当前订单所处阶段处理。", result: "取消中或已取消不能通过，按当前订单所处阶段处理。" },
      { no: 7, name: "订单已终止履约或存在未解除的发货阻断", description: "拦截审核，普通审核说明不能解除阻断。", result: "不能通过，保留阻断原因。" },
      { no: 8, name: "必要发货数据缺失、未知或读取失败", description: "先核查，不能猜测后放行。", result: "先核查，不能按缺省值放行。" },
    ],
  },
  {
    title: "商品、数量与收件资料",
    items: [
      { no: 9, name: "商品为空、无法识别或必要资料不可用", description: "拦截审核，先核清本次拟发商品。", result: "不能通过，说明缺失或无法判断的商品资料。" },
      { no: 10, name: "平台 SKU 与系统 SKU 配对缺失、冲突或失效", description: "配对未取得有效结果时拦截审核，由资料责任方修复。", result: "不能通过，由资料责任方修复已有映射。" },
      { no: 11, name: "系统 SKU 与当前仓库 SKU 配对缺失或不可用", description: "拦截审核，不借用其他服务商、账号或仓库的配对。", result: "不能通过，核查当前发货来源的海外仓 SKU 映射。" },
      { no: 12, name: "仍需 OMS 发货的商品和数量尚未核清", description: "拦截审核，已有履约时不能按整单再次发货。", result: "保留核实要求，核清剩余范围前不能通过。" },
      { no: 13, name: "拟发数量缺失、不合法或超过当前可发数量", description: "拦截审核，履约计划中的每项发货数量须大于零。", result: "不能通过，按当前可履约范围修正数量。" },
      { no: 14, name: "发运地址不符合本次配送要求", description: "拦截审核，指定寄中转仓时不能改寄买家地址或最终目的地。", result: "不能通过，核对本次实际发运地址。" },
      { no: 15, name: "本次发货必需的收件资料缺失或不合法", description: "拦截审核，按目的地、仓库和渠道要求补齐。", result: "不能通过，补齐本场景必需且合法的收件资料。" },
    ],
  },
  {
    title: "仓库、物流与库存",
    items: [
      { no: 16, name: "未配置发货仓库或仓库不可用", description: "拦截审核，保持待审核。", result: "记录已拦截并保持待审核，不生成履约、不推单。" },
      { no: 17, name: "仓储服务商或账号缺失、不可用或能力不足", description: "拦截审核，不混用同名账号。", result: "记录已拦截并保持待审核，核查服务商及账号。" },
      { no: 18, name: "未配置物流渠道、渠道停用或执行能力失效", description: "拦截审核，不自动换成其他渠道。", result: "记录已拦截并保持待审核，不能静默换渠道。" },
      { no: 19, name: "中台库存结果不足或尚无法判断", description: "拦截审核，保持待审核并核查库存结果。", result: "记录已拦截并保持待审核，核查当前库存结果。" },
    ],
  },
  {
    title: "订单标志",
    items: [
      { no: 20, name: "当前订单含有“退”或“消”任一标志", description: "默认拦截自动、人工及批量审核并保持待审核，普通审核说明不能解除。", result: "记录实际命中并保持待审核，不生成履约或推单；普通审核说明不能解除，人工解除方式待评审。" },
    ],
  },
]

export const 默认审单分组: readonly 默认审单分组数据[] = Object.freeze(分组.map(组 => Object.freeze({
  title: 组.title,
  items: Object.freeze(组.items.map(项 => Object.freeze(项))),
})))
