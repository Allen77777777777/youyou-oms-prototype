import { customerServiceLogLayoutRule } from '@/组件/客服日志/排版标注'
import type { 原型标注 } from '@/类型/标注'
const descriptions: Record<string, [string, string[]]> = {
  overview: ['退货退款申请工作台', ['用户要求按Post-Order当前能力、请求和返回修正原型，保留连续详情与可靠关联。仅处理卖家已有Return；仅MONEY_BACK，不提供平台补发、代买家接受报价或创建退货。', 'PRD V1.0澄清目标设计，原型仍沿用V0.28交互及虚构回放。未关闭申请的处理人动态读取当前SKU绑定，关闭才存名单，缺历史名单按空集合显示；生效快照不静默重算及未记录区分尚未实现。真实API、服务端调度、权限、持久化及审计未接入，本轮未改造这些业务能力。']],
  filters: ['申请筛选与店铺范围', ['店铺来自已有可见店铺资料，零申请店铺仍可选择。店铺、state、原因、关键词和日期取交集；查询才应用草稿，重置及查询回第一页。V0.8申请日期按北京自然日，包含起日00:00:00至末日23:59:59.999，未知站点也用此口径。界面不加时区注释。', 'SKU/买家多行查询和北京自然日筛选是本地能力。Search指定return_id会忽略其他参数，不能直接透传后声称仍满足交集；交易查询需同时提供item_id。不按浏览器／服务器当地日期过滤，不改原事件时刻。']],
  queues: ['业务处理队列', ['用户确认将协商／退货中与退款处理合并为处理中；五队列为全部、待处理、处理中、已升级纠纷、已关闭，是平台state/status及Case资料的本地投影，不是平台原始状态。处理中覆盖协商、寄回、收货及退款，具体进展仍看平台状态和当前待办。', '待处理、纠纷与关闭的原归类边界不变。失败、超时、部分退款状态须有投影或待核实兜底；内部pending、failed、unknown不覆盖平台阶段，未知结果仍阻止重复提交，CaseID缺失的ESCALATED也不可再次升级。']],
  table: ['申请身份与详情标签', ['一行按shopId＋ReturnID稳定定位，点击编号或处理在应用内打开详情标签；路径包含店铺及申请，同店同号复用、跨店同号隔离。state与status分别展示并保留原值，内部执行结果不冒充平台状态。', '申请商品和数量独立于整单；买卖双方预计与实际退款分别保存，不用卖家预计额当报价上限或本次可退余额。列表筛选、队列、分页及滚动按会话保留。列表申请／待办时间固定Asia/Shanghai，显示YYYY-MM-DD HH:mm:ss无时区后缀及悬停提示，未知站点不影响；日期筛选按北京自然日，原始绝对时刻不变。']],
  sync: ['刷新数据', ['V0.7按用户要求移除可见问号，悬停／聚焦刷新按钮显示原说明，不常驻、不触发刷新。点击按已应用店铺范围读取，不受关键词、日期、队列、分页或草稿影响；当前仅回读虚构场景。', '刷新不重新发送任何写操作。明确失败、部分成功和成功分别反馈；失败不洗空旧值、不更新成功时间。真实新增采集与旧申请回查分别设计，频率及历史范围待联调，买家及平台事件不要求先有本地提交。']],
  'detail-sync': ['刷新当前申请', ['V0.7刷新固定在右上标题栏，移除可见问号及独立帮助入口；悬停／聚焦按钮显示原说明，点击才刷新当前shopId＋ReturnID。SUMMARY、FULL、附件和轨迹分别保存读取结果，不假定FULL包含SUMMARY。已知非空商品或交易身份冲突时拒绝合并、标记读取失败并暂停处理。', '平台业务时间、本地最近尝试与最近成功读取分开。结果未知只能凭回执和来源证据恢复，不能通过刷新直接改成功，也不改变OMS、仓库或库存。']],
  detail: ['新标签详情与左右工作区', ['用户要求左侧阅读、右侧办理且独立滚动；V0.8加宽的独立460px办理栏沿用现行规则。V0.13当前待办后阅读资料改为等宽两列，各占扣除间距后可分配宽度的50%：现行左列申请信息（V0.14内含关联订单摘要）、退款明细、商品、适用订单商品、原发货出库、退回物流及适用纠纷；右列处理过程、申请附件、买家站内信、相关地址。申请信息位于左列顶部，处理过程位于右列顶部并与附件同宽，替代V0.6跨栏历史及旧不等宽比例。阅读网格repeat(2,minmax(0,1fr))，1280／1440／1920维持双栏，视口不大于1050px时改为单列，替代旧1550px单列断点；1050px为实现选择。头部仅标题及刷新，切换／关闭用全局页签，错误身份空态可返回。草稿与滚动按店铺＋ReturnID隔离；双栏验收保留于原型/退货详情双栏布局验收2026-11-03.md，V0.14历史验收见原型/退货申请订单摘要合并验收2026-11-03.md，不预填测试结果。', '用户确认本功能全部时间固定Asia/Shanghai，以YYYY-MM-DD HH:mm:ss显示，不加UTC偏移、北京时间文字、时区问号或悬停注释。覆盖列表申请／待办、详情刷新／责任期限／退款／附件／物流／原仓发货／处理过程／关联来信／内部备注及日志、确认摘要。未知站点不影响显示；缺失—、无效或无偏移来源时间待核实，原始UTC或明确偏移时刻保留。北京自然日筛选及面单输入同口径，截止判断用绝对时刻。本规则替代此前站点时区，只影响退货工作区。']],
  'order-context': ['订单上下文与商品名称', ['用户批注希望六字段更靠上，并讨论合入申请信息的方式。V0.14可评审实现方案：申请卡片原四字段之后嵌入“关联订单”分区，原样迁入OMS订单号、平台订单号、平台订单状态、OMS订单状态、订单金额、实际出库数量，其后为买家申请说明。下方原订单信息不重复六字段，仅在可靠关联有商品时保留独立订单商品表。本稳定ID移到嵌入分区且不重复挂载。申请卡片可用内容宽度不小于600px时，申请及订单字段每行两组标签值，更窄每行一组；分区、顺序及容器断点是实现方案，不代表用户逐项确认。OMS编号仍在同店、平台订单、买家及唯一系统身份复验后打开共享完整详情；冲突仅保留文本，不造号、不跳空详情，原复制及缺失值语义不变。', '整单金额及实际出库数量仍为订单上下文，不是本次可退金额或申请数量；无可靠关联不补金额。商品沿用“平台 SKU”“系统 SKU”“平台订单行 ID”，平台SKU和行ID只读可靠关联的唯一订单行，缺失或冲突显示—；系统SKU允许已有明确row.sku来源只读回显，不能证明平台交易行已核实。itemId是eBay刊登标识，transactionId是购买交易标识，两者均非SKU，不直接标成平台订单行ID。技术原值保留追溯，虚构桥接不代表生产方案已确认。整单金额和原订单收货地址只读可靠上下文，不用退款预计额或默认路由补值；V0.14历史验收见原型/退货申请订单摘要合并验收2026-11-03.md。']],
  outbound: ['原发货出库单', ['按稳定仓单ID和来源订单逐单展示实际发货仓库、账号、渠道、状态、跟踪号和时间；两种出库号可打开同一可靠仓单详情。', '多仓不取首单代表整单；null待核实与空数组暂无分开，不用默认路由补实际仓单。平台退货、标收和退款不改原发货事实或增加库存。']],
  'return-shipping': ['退回物流与RMA', ['显示本申请RMA要求/编号、运费承担方、多条退回运单及适用扫描轨迹。使用actualShipDate/actualDeliveryDate；物流送达与卖家markAsReceived分别保存。确认收到不自行写承运商送达状态或实际送达日期。', 'RMA 策略兼容 returnPolicy.rmaRequired 和 rmarequired 两种拼写，false 表示无需提供编号，缺失、非布尔或冲突显示待核实。编号取 detail.RMANumber。确认地址与提供编号是独立操作，PROVIDE_RMA 需有对应资格及有效编号。面单提供与文件上传分两步，确认收货不自动退款或生成仓库入库。']],
  history: ['处理过程', ['来源为eBay Return详情responseHistory，记录买家、卖家或eBay在本申请上的历史活动；activity、author、creationDate、fromState、toState、notes及适用attributes分别保留。V0.12按官方ReturnResponseHistoryType核验notes为字符串，直接读取notes而非notes.content；缺失notes时保留其余活动字段。它与决定请求comments.content、留言请求message.content的结构不同。包含留言及批准／报价／退款等业务事件，不是纯聊天，也不包含独立站内信或本地备注日志。V0.11按用户说明，数组有多条时逐条展示全部返回记录，不取首条、不压成单条摘要；无记录沿用空态。', 'V0.13按用户要求移到阅读资料右列顶部、申请附件之前，并与附件同宽，占扣除列间距后可分配阅读宽度的50%，替代V0.6跨阅读区展示；左列申请信息同时上提。保留来源数组原顺序，不宣称平台约定了倒序。当前DEMO为本地虚构数据，并非实际API回执；未知activity保留原值，模拟事件名称不能作为平台原生枚举或当前动作资格依据。附件不凭时间近似挂到留言。contentOnHold时遮盖Return历史notes，保留活动事实；独立站内信不跟随隐藏。字段核验记录保留于原型/退货历史字段核验2026-11-03.md；本轮布局验收见原型/退货详情双栏布局验收2026-11-03.md，不预填测试结果。']],
  'buyer-mail': ['买家站内信与发送入口', ['位于申请附件与相关地址之间，显示本店该买家的来信。右上角「发送站内信」复用评价页联系买家弹窗。已有多条会话须选择，首次联系须核实该店收件身份，发送结果可在站内信查看。', '办理栏「发送消息」仍按本次 Return ID 提交售后留言。站内信独立于申请处理过程、响应时限及售后单；打开原来信仍按站内信规则标读。']],
  notes: ['右侧内部备注', ['内部备注在右侧办理表单／只读反馈之后独立成卡片，不依赖选中某个处理动作。输入区下方逐条显示历史正文、操作人和时间，最新追加的备注在前；只倒序显示，不改写原备注数组。最多500字符，新追加时记录当前体验人员、时间和正文，不外发。已有原文保留，人员或时间缺失／空白显示未记录，不补造当前身份或时间。', '备注按店铺＋ReturnID隔离；独立折叠的操作日志只记事件摘要，不替代备注正文。仅本地会话保存，真实权限与持久审计待接入，不混入responseHistory或站内信。']],
  logs: ['操作日志', ['右侧内部备注后提供独立操作日志，默认折叠。按店铺＋ReturnID保存提交、附件上传、实际资料／办理结果变更、读取失败、添加备注及重发建单的操作人、动作、时间、摘要和结果。普通无变化刷新只更新时间，不记业务日志；技术尝试／成功时间及本地资格版本不作为业务变化。相同原提交的同一待核查或回执不重复记录；重复相同读取失败不刷屏，读取恢复后再次失败可记录。新提交冻结当前体验人员与提交标识，回查记系统并关联原提交人；历史人员缺失显示未记录，不从卖家角色或当前身份补造。', '明确失败、结果待核查、已提交待回查、平台已确认受理分别记录，读取成功不当作退款成功或到账。日志只留摘要，不复制对客消息、内部备注、地址或附件正文；请求快照及平台处理过程保持独立。时间沿用北京时间；本地虚构数据和会话内日志不代表真实API或持久审计已接入。']],
  action: ['右侧处理申请', ['V0.9按用户决定仅保留一个“接受退货”入口，删除独立“提议退回商品”按钮；九个业务入口仍对应十类技术动作。按当前sellerAvailableOptions选择技术动作：有SELLER_APPROVE_REQUEST优先APPROVE，仅有SELLER_OFFER_RETURNS时OFFER_RETURN，均无则阻断；双资格优先APPROVE为实现选择。APPROVE批准已有申请，OFFER_RETURN提议退回，技术语义、各自资格、请求快照及提交复验继续独立，不扩大权限、不将OFFER_RETURN等同免退。', 'approve／offerReturn均回显为统一入口选中；旧offerReturn草稿保留原技术动作，来源变化不静默偷换，失去原资格则阻断；重新选择接受入口才按当前资格重选并初始化表单。首次进入详情仍默认无选中，仅当前选择高亮及aria-pressed，选择不直接提交。接受退货的商品安排由keepOriginalItem表达；废弃无面单决策不恢复，不从历史活动授权；已升级／关闭只读及pending／unknown互斥保留。']],
  'action-form': ['参数与确认内容', ['“接受退货”表单内“买家退回商品”“买家保留商品，无需寄回”互斥，分别只设置keepOriginalItem=false／true，不切换APPROVE／OFFER_RETURN；默认前者为实现选择，两种接受动作继续提交各自选择。V0.10按用户要求删除“提出部分退款”的免退复选，只填写金额及说明，请求不提交keepOriginalItem，确认摘要不展示商品安排；缓存旧隐藏值不参与请求或确认，不自动决定商品去向或修改免退来源事实，替代V0.9沿用部分退款复选的方案。两种接受动作均要求FULL读取成功；免退时隐藏RMA、不提交遗留RMA，演示回查只读实际请求RMANumber。接受确认展示业务名称及商品安排，实际技术decision留在请求快照；确认冻结店铺、申请、买家、实际决定、适用商品安排、正文、金额及资格／来源指纹，变化须重确认。按冻结技术动作独立复验，选择、确认及受理均不提前更新状态、免退或退款事实。', '退款分项按币种精度精确合计；partial是买家保留商品的部分退款协商方案，报价用已核验额度，不从预计金额或分项max猜上限。仍须等待买家决定及平台结果，提交后不提前认定已免退、实退或关闭。面单三分支只提交适用字段，发送时间按北京时间输入并严格换算UTC请求，确认摘要转回北京时间，无时区注释。keepOriginalItem为decide独立可选布尔参数，官方未按decision限定更窄范围，本期部分退款不提交是产品范围选择；生产按平台响应／回查更新，本地回执明确虚构。DEMO-RT-003展开“发起退款”仅供查看，不触发提交。说明2000字符为本地限制；本轮验收见原型/部分退款精简与全额退款演示验收2026-11-03.md，不沿用历史测试数量。']],
  escalation: ['关联纠纷与请求介入', ['同时核验SELLER_ESCALATE、卖家eligible、起止窗口及适用卖家原因。原因与说明必填为本地校验；缺窗口是待核实，不因可选字段自动放行。RESOLVED_WITH_BUYER仅用于读取历史，不放入卖家请求。V0.11按用户要求打开支持介入的DEMO-RT-005表单仅供查看，不绕过当前资格或提交请求。', '成功回执保存caseId/caseUrl，原申请与案件分别回查并保留。案件确属本店、本申请时可按 Case ID 打开内部纠纷详情，其他情况保留编号或待关联提示。本页只负责申请阶段的请求介入。']],
  'refund-detail': ['退款金额、分项与资金结果', ['卖家预计/实际承担和买家预计/实际所得分别显示；预计分项来自itemizedRefundDetails和optionalRefundLineItems，提交请求为itemizedRefundDetail。任一分项不完整即阻断退款，不丢坏行后提交；总额等于所选分项合计。', 'refundStatus与HTTP受理、Return状态独立，报价不等于到账。资金requestedAmount/actualAmount、临时退款发放/撤回及追偿金额/付款批次分别展示，不用请求额补实际额、不重复求和或自建财务账。退款retry保留待核实，不猜接口、不盲目重退，也不提供eBay后台外跳。']],
  attachments: ['附件大图、下载与操作内上传', ['V0.13申请附件位于阅读区右列处理过程之后，两组同宽，买家站内信及相关地址随后。资料区按提交方及用途只读展示，缩略图／文件名可单击查看大图并下载可读原件，PDF仅面单；具体控件为实现方案。DELETED或contentOnHold禁内容访问，读取失败不冒充暂无，CREATED仍显示待关联。V0.7拒绝表单新增可选申请材料，复用当前拒绝资格及原状态／读取／在途保护作为本地门禁，不当平台通用上传资格。', '拒绝／消息表单独立上传商品凭证或退款资料，面单表单上传面单；file/upload与decide／send_message分别提交，取消拒绝不撤销已上传材料，CREATED不冒充发布或买家可见。官方支持BMP/GIF/JPEG/PNG、PDF仅面单，5MiB为本地限制。旧file/submit已于2026-02-02下线，不恢复；真实上传／存储未接入。下载使用可靠原件，不拿缩略图冒充原件。']],
  addresses: ['地址来源', ['V0.11按用户要求放到阅读区右侧资料栏最下面，优先展示申请附件和买家站内信；只调整阅读顺序。买家默认及卖家退货地址分别来自Return FULL的detail.buyerAddress／sellerAddress；“原订单收货地址”取可靠关联OMS订单linkedOrder.address，不是Return返回。具体退回目的地来自运单destinationAddress。本组不查询系统基础资料地址簿，也不用原发货仓地址或默认路由兜底。', '原订单关联失效／冲突不显示旧地址，地址分别展示、不覆盖或猜补。姓名、街道、城市、州省、邮编、国家按源资料呈现；Post-Order地址无电话／邮箱，其他来源须标明。买家默认地址不能直接当补发地址。']],
  responsibility: ['当前责任方与期限', ['分别读取sellerResponseDue、buyerResponseDue的activityDue/respondByDate，显示待办方、具体动作和截止时间；timeoutDate及升级窗口独立。', '进入等待买家报价决定等新阶段时不能沿用旧卖家期限。完整读取确认为空才清空，读取失败保留旧资料但说明未刷新，不自动加固定天数或到时关闭。']],
  execution: ['提交与回查结果', ['区分受理待回查、明确失败、结果未知和已确认；与资金FAILED/PENDING/REQUESTED/SUCCESS/UNKNOWN分别保存。明确失败按原因修正后重新确认，超时不盲目重发。', '本地场景覆盖未知恢复、外部事件及读取部分失败；退款终态来自独立虚构回执，不把待提交或预计金额复制为实际金额。人工不直接改成功；保留请求和证据，原型回执不表示真实平台执行。']],
}
descriptions.application = ['申请类型、原因与商品去向', ['V0.15分别展示summary.currentType当前诉求、creationInfo.type初始诉求、reasonType原因分类及来源商品去向，不从初始类型填补当前类型。商品去向取明确ITEM_KEPT阶段或适用历史keepOriginalItem，并标出来源；冲突与未知待核实。保留申请时间、RMA及下方关联订单六字段和买家说明。', '当前申请类型及历史属性均为只读来源，不据此扩大办理资格。接受退货保留两个商品安排选项；部分退款继续无keepOriginalItem输入、请求或确认内容。申请与独立OMS订单、仓单及来信保持来源隔离。']]
descriptions['application-item'] = ['申请商品、价格与来源资料', ['V0.15展示本申请来源图片、标题、申请数量、价格及其币种／换汇来源、成交时间；点图片打开大图，加载失败可解释。summary与FULL数量冲突显示待核实，缺失显示—，不猜为1。平台SKU、系统SKU及平台订单行ID继续遵守可靠订单行关联；itemId与transactionId继续仅留后台追溯，不恢复页面展示，也不能冒充SKU或订单行ID。', 'returnContentOnHold或itemOnHold任一为true均隐藏本申请标题和图片，不回显旧缓存、不显示图片地址；独立OMS订单商品仍按其本身来源展示。图片只读合法HTTPS、明确图片数据URI或固定原创本地示意资源；不将举证附件冒充商品图片。itemMetadata等低优先级资料继续保留后台，不新增页面显示。所有样例为虚构资料，真实接口未接入。']]
descriptions['hold-detail'] = ['平台暂缓处理资料', ['V0.15折叠展示holdStatus、holdCreationDate、holdReleaseDate、holdReferenceId及holdTransactionId；release为预计解除时间，不作为最终解除事实。原始参考ID与交易ID分别展示，不冒充ReturnID或OMS编号。', '不添加官方不存在的hold原因映射；旧资料如有独立非空说明仅按其来源回显。所有时间按既有北京时间规则，无效或无偏移时间待核实，缺失不猜。']]
descriptions.detail![1].unshift('V0.15补齐申请、商品、期限、Hold、实际退款／资金来源、历史适用属性、运单与面单返回资料。保留V0.14左上申请卡片内关联订单六摘要、等宽阅读双栏、460px办理栏及右列处理过程→附件→站内信→地址顺序。新增只读来源使用折叠／换行／表内滚动，不改操作资格，不恢复平台办理外跳、不增加真实请求。')
descriptions['order-context']![1][0] = descriptions['order-context']![1][0]!.replace('申请卡片原四字段之后', '申请卡片申请字段之后')
descriptions.history![1].unshift('V0.15处理过程继续逐条保留来源顺序，attributes只展示适用的keepOriginalItem、partialRefundAmount、refundDeductionType金额／比例、RMA、当时退回地址、更新跟踪号、资金记录引用及介入原因／面单提供方原值。不铺JSON，不显示toEmailAddress；历史属性不回写当前地址、商品去向或资金结果。returnContentOnHold时历史地址采用保守隐藏，notes沿用遮盖；活动及非文本事实保留。')
descriptions['refund-detail']![1].unshift('V0.15独立显示actualRefund.totalAmount退款实际总额、netChargeAmount卖家实际扣款及feeCreditAmount手续费返还，不能用双方预计／实际汇总或请求金额代填；展示实际分项完整性与总额一致性结果。fundings逐条只读折叠展示类型、品牌、状态、金额、时间，不展示fundingSource.memo；金额保留各自币种和来源换汇值／汇率，仅作来源说明，不自行换算或求和资金来源，不建立财务账。')
descriptions['return-shipping']![1].unshift('V0.15逐运单补齐始发地与目的地、最早／最晚预计到达、运输方式／寄件方／错误原值、面单日期／可用截止及打印／作废过期状态；面单费用按来源合计与分项折叠，不反算。扫描事件原值可折叠查看。ProvideLabelResponse的labelData按安全纯文本折叠，只对明确图片／PDF数据URI预览，不假定Base64或PDF；labelURL仅允许无凭据HTTPS来源。面单ID与跟踪号分开，未知／失败读取或内容隐藏禁止打开旧面单，不将返回面单当寄出／送达事实。')
descriptions.responsibility![1].unshift('在办申请沿用 V0.16 按值展示规则：平台可能关闭时间有非空来源值才显示；卖家资格为true或存在任一起止时间时显示介入资料，false／未知且无窗口时整组隐藏。起止时间分别有值才显示；全部缺失时移除附加区及分隔线，双方待办保留。缺失资格但存在时间显示待核实，读取失败沿用原失败提示；不迁移至右侧，不改下载、资格门禁、Case资料或状态流转。')
descriptions['refund-detail']![1].unshift('V0.17删除自动退款样例中手写的追偿提示。追偿资料只读FULL实际返回的detail.payoutRecoupInfo：有效amountToRecoup显示待追回金额，payoutId存在才附加卖家收款批次；无有效金额不显示，不按AUTO_REFUND_INITIATED、REFUND_TIMEOUT或本地回放事件生成追偿结论，也不表示已完成扣款。业务界面、失败提示、轨迹及内部记录不混入虚构来源／回执或接口未接入等研发说明；数据性质继续保存在本标注、源码注释和验收文档。')
descriptions.table![1].push('Return 已关闭时，列表保留申请时间，当前待办显示“暂无待办”。原始记录保留之前的动作和截止时间。')
descriptions.responsibility![1].unshift('Return 已关闭后收起当前待办、截止及平台可能关闭时间。关闭原因和时间取退货申请的关闭资料。仍在办理时隐藏 OTHER／UNKNOWN 占位结果。PARTIALLY_REFUNDED 显示已部分退款，REQUEST_DECLINED 显示退货申请被拒绝。')
descriptions.application![1].unshift('RMA 策略与本次操作分开显示。正式拼写 rmaRequired 与实报拼写 rmarequired 均读取布尔值，同报冲突时显示待核实。')
descriptions['refund-detail']![1].unshift('展示每条已取得的预计费用金额及实际提供的上下限。固定金额只读。金额可读与允许提交分别判断，缺少写入依据时保留来源明细并提示核实。')
descriptions['action-form']![1].unshift('发起退款须核实本次可提交的金额和范围。平台提供此操作时，已知预计分项可读，金额不可调或边界缺失按来源展示。')
descriptions.filters![1].push('处理人支持任一人匹配或未分配，查询后同其他条件取交集。')
descriptions.table![1].push('处理人读取本次申请已核实交易行的系统 SKU 绑定。关联订单其他商品独立，实际办理人按操作记录。')
const reviewedFields = new Set(['table', 'responsibility', 'application', 'refund-detail', 'return-shipping', 'action-form'])
const listKeys = new Set(['overview', 'filters', 'queues', 'table', 'sync'])
descriptions['action-form']![1].unshift('选择「买家保留商品，无需寄回」，只确认平台决定和对客说明，后续办理退款时生成退款售后单。选择「买家退回商品」时联填原因并创建退货售后单。')
descriptions.action![1].push('重发在拒绝退货右侧独立展示，属于本地售后办理。平台拒绝退货按来源资格启用，重发按本地商品来源和权限办理。')
descriptions['after-sale-fields'] = ['售后单联填', ['商品和可核实的数量由来源申请带入，系统售后原因使用业务确认的22项枚举，客服须明确选择，内部备注选填。本次资料在平台提交前校验。接受退货作用于整笔申请，其数量从申请带入并只读。', '直接退款按已知金额分项核实全额或部分，无法判定时必须人工确认。报价、平台资金结果和仓库实收分别记录。']]
descriptions['after-sale-links'] = ['本申请关联的售后单', ['按店铺和ReturnID列出每次业务办理的售后单及笔数，点击单号定位对应记录。同一次提交或回查不重复成单。', 'V1.0目标：售后单按本次业务办理登记，与各执行尝试稳定关联；同次办理合法重试共用原售后单，不能把其他办理的回执套给本笔。退款成功证据与本笔实退金额分别保存；卖家承担／买家所得等金额口径及分笔归属待售后专项确认，无法唯一归属不计入某笔实退。原型现有本地联动不代表生产资金对账及事务一致性已完成；仓库实收入库仍只展示来源事实。']]
descriptions['after-sale-reship'] = ['商家重发与售后审核', ['核对原订单和商品、选择原因并确认数量，点击「提交售后单」生成待审核重发单。在售后单管理审核时核对发货资料，通过后生成一张待人工审单的售后补寄手工订单。', '重发不调用eBay办理动作。无可靠原单／商品关联时阻断建单，有当前店铺审核权限的运营可自审。']]
descriptions['action-form']![1].unshift('V0.26：新版 Return GraphQL provideRmaNumber 支持本次编号豁免。有本店接入能力、独立成功读取且当前卖家动作含 PROVIDE_RMA_NUMBER 时，编号显示选填；去首尾空白后为空则省略 rmaNumber 并传 rmaRequirementWaived=true，填写则传编号和 false，最多100字符。确认弹窗明确本次免除编号要求；新版没有 comments，隐藏处理说明且旧草稿不外发。旧 Post-Order PROVIDE_RMA 仍须填号，不用 APPROVE 代替，也不自动降级重试。')
descriptions.action![1].push('V0.26：WAITING_FOR_RMA 单独不能授予新版权限。资格绑定店铺＋ReturnID＋站点，读取失败、身份变化、已关闭、未知状态、无当前动作或已有待核查提交均阻断。原型从严放行 OPEN／REQUESTED＋明确动作，不将 GraphQL 状态映射为旧平台状态。')
descriptions.application![1].push('V0.26：本次豁免结果来自新版独立成功响应／回查的 rmaDetails，不改来源 RMA 策略。保留“要求提供编号”并另显“本次已免除编号要求”；只对唯一匹配本次提交的明细确认，多条或冲突待核查。')
descriptions['return-shipping']![1][1] = 'RMA 策略兼容 returnPolicy.rmaRequired 和 rmarequired，明确 false 表示来源不要求编号，冲突／缺失待核实。旧版编号读取 detail.RMANumber；新版按独立 rmaDetails 保存编号及本次豁免，已确认豁免显示“本次无需提供编号”。两者不修改地址或店铺配置。旧 PROVIDE_RMA 仍需有效编号；新版可空契约见表单标注。面单提供与文件上传分两步，确认收货不自动退款或生成仓库入库。'
descriptions.addresses![1].push('2026-11-11核验：旧 Provides Return Address 已停用，官方迁移指南无对应新API，替代地址须在 My eBay 添加。本页地址继续只读，授权表单提示到 eBay 后台更改后刷新，不增加编辑或后台外跳；提供RMA／豁免不代表确认或修改地址。')
descriptions.logs![1].push('V0.26：新版RMA请求与结果独立记录；HTTP200中的业务错误仍失败，顶层errors、缺失／冲突结果保持待核查，禁止重复或跨接口重试。GraphQL回执不造Post-Order responseHistory。DEMO-RT-010的新版资格和成功后待面单均为独立虚构回放，真实账号能力与API未接入。')
descriptions.logs![1].push(customerServiceLogLayoutRule)
descriptions.filters![1].unshift('V0.28：五个状态页签位于筛选上方，筛选下方为工具栏；查询与重置统一32px高、12px字号。仅调整展示，草稿提交、条件交集及重置规则保持。')
descriptions.queues![1].unshift('V0.28：全部、待处理、处理中、已升级纠纷、已关闭五个页签独立置于筛选上方。队列归类及已应用条件下的计数保持，切换不提交未查询的筛选草稿。')
descriptions.table![1].unshift('V0.28：行内处理／查看与创建工单统一12px字号，保留原详情和工单入口及资格。本轮不新增导出、行勾选或批量办理，不改变Return业务规则。')
descriptions.sync![1].unshift('V0.28：工具栏在筛选下方，刷新反馈在左侧，刷新按钮有无反馈均右对齐；与查询、重置及详情刷新统一32px高、12px字号。列表及详情保持无独立刷新问号，保留原按钮hover／focus说明，悬停或聚焦不触发读取；点击范围及真实接口边界保持。')
descriptions.queues![1].push('V1.0：队列只用于查询分组，不授予办理资格。当前仅单Case演示；生产存在多个Case时须核验完整关联及适用结束条件，不能因任一Case关闭就判整体结束。队列归类不改写Return的state/status，也不证明退款成功；动作仍逐项核验当前来源。')
descriptions.execution![1].unshift('V1.1：可信issue_refund SUCCESS绑定同店申请、原执行尝试及请求，独立保留成功证据。旧详情不解除退款／报价防重；不抄请求金额、不关闭Return。DEMO-RT-015先核查明确失败，再重新确认退款可演示直接SUCCESS；真实API未接入。')
descriptions['refund-detail']![1].push('V1.0：报价不等于资金成功；可信issue_refund SUCCESS不因旧详情而降回未知或重退。成功事实可先保留，实际金额、币种及所属尝试须另有来源证据；本笔售后实退口径仍待确认。本轮只澄清目标，未新增真实资金处理。')
descriptions['action-form']![1].push('V1.0目标：生产提交在同一店铺＋ReturnID互斥控制内重验人员权限、未完成尝试、最新资格、资金及适用期限，可靠保存尝试后才发送。同次业务办理允许重试时新建尝试并关联原动作；重复点击返回原尝试，结果未知不得重试。当前只有前端冻结内容／来源指纹复验和内存防重，未实现服务端互斥、可靠保存及故障恢复；请求可能已发出时不得为补记录而重发。')
descriptions.sync![1].push('V1.0：读取成功不等于原操作或资金成功；没有足以归属原尝试的新证据时继续待核查，保留已知成功事实。正式人工核查须每次记实际核查人、原尝试及结论；当前模拟未知回查按系统记录并去重，正式核查入口、权限及证据留存尚未完整实现。')
descriptions['after-sale-fields']![1].push('V1.0：联填资料随本次平台动作确认，按本次业务办理登记并稳定关联各执行尝试，合法重试复用原售后单；需寄回的接受、报价与退款沿用各自建单条件，免寄回决定不提前建退货单。生产可靠建单与平台发送的一致性尚未接入。')
descriptions.overview![1][1] = 'V1.1已补处理人创建快照及显式版本变更、缺历史显示未记录、升级后停止旧Return待办、RMA失败保留、同确认防重与失败重试、直接退款成功证据。现有演示店铺权限覆盖Return写动作；角色矩阵、正式核查、多Case聚合、本笔实退及生产服务仍待落实。'
descriptions['action-form']![1].push('V1.1本地实现：确认使用唯一标识，重复点击返回原尝试；明确失败后新确认另存尝试且复用原售后单。模拟保存失败在落单／执行前阻断。全部Return写动作及附件提交复验演示店铺权限；不把此实现称为服务端锁、持久恢复或真实授权。')
descriptions['return-shipping']![1].push('V1.1：同身份RMA读取失败保留旧状态、编号／豁免及上次成功时间，但撤销当前操作资格；身份变化不继承旧事实，多明细匹配规则未扩展。')
descriptions.queues![1].push('V1.1：列表与详情均不沿用已升级申请的旧Return待办，Case多关联归类保持待评审。')
descriptions.sync![1].push('V1.1：PRD第5.1～5.2节补采集与回查分层、额度预算、启停及退避；具体频率仅为待评审建议。依用户要求不增加任务配置入口或后台调度。')
export const returnAnnotations: 原型标注[] = Object.entries(descriptions).map(([key, [title, rules]]) => ({ id: 'oms.ebay-returns.' + key, 锚点: 'oms.ebay-returns.' + key, 标题: title, 分类: key === 'overview' ? '页面' : '交互', 说明: rules[0]!, 交互规则: rules, 路由: listKeys.has(key) ? '/oms/ebay-service/returns' : '/oms/ebay-service/returns/:shopId/:returnId', 版本: reviewedFields.has(key) ? '0.22 / 2026-11-05' : key === 'buyer-mail' ? '0.21 / 2026-11-05' : (key === 'action' || key === 'action-form' || key.startsWith('after-sale-')) ? '0.20 / 2026-11-04' : '0.17 / 2026-11-03', 状态: '待评审', 事实等级: key === 'overview' ? '已确认' : '合理假设', prd引用: key === 'buyer-mail' ? ['PRD/eBay退换货申请功能PRD.md', 'PRD/eBay站内信功能PRD.md'] : key.startsWith('after-sale-') ? ['PRD/eBay退换货申请功能PRD.md', 'PRD/售后单管理功能PRD.md'] : ['PRD/eBay退换货申请功能PRD.md'], 数据来源: ['eBay Post-Order当前方法、字段与发布记录；2026-10-31详情与六项布局评审、2026-11-03三项批注、北京时间与操作栏评审、接受退货双选项决定（V0.9替代V0.8并列按钮方案）、部分退款精简决定（V0.10替代V0.9沿用部分退款免退复选方案，保留接受退货双选项）、资料排序及多条处理历史说明（V0.11将相关地址放到资料栏末尾）、历史notes字符串字段核验（V0.12修正notes.content误读）、阅读双栏布局（V0.13替代跨栏历史及旧不等宽比例）、订单字段上提批注及关联订单分区评审方案（V0.14，具体分组与密度是实现方案）、字段补齐与来源安全展示（V0.15）、介入及平台期限按来源值展示（V0.16）、业务文案清理与追偿来源核验（V0.17）；官方ReturnResponseHistoryType、Upload Return File与Process Return Request；V0.14历史验收：原型/退货申请订单摘要合并验收2026-11-03.md；本地虚构申请/回执/附件、已有OMS与仓单快照及同店同买家来信，DEMO不是实际API回执，模拟事件不作为原生枚举依据。'], 权限与审计: ['真实API、订单关联、附件存储、服务端权限及持久审计尚未接入。'] }))
for (const entry of returnAnnotations.filter(item => /\.(notes|logs)$/.test(item.id))) {
  entry.版本 = entry.id.endsWith('.logs') ? '日志排版 0.2 / 2026-11-05' : '0.23 / 2026-11-05'
  entry.prd引用 = ['PRD/eBay退换货申请功能PRD.md', 'PRD/eBay客服操作日志通用规范.md']
}
export const returnAnnotation = (id: string) => returnAnnotations.find(item => item.id === 'oms.ebay-returns.' + id)!
for (const entry of returnAnnotations.filter(item => /\.(action|action-form|application|return-shipping|addresses|logs)$/.test(item.id))) {
  entry.版本 = '0.26 / 2026-11-11'
  entry.prd引用 = [...(entry.prd引用 || []), '文档/集成/eBay退货地址与RMA授权接口核验2026-11-11.md']
  entry.数据来源 = [...(entry.数据来源 || []), 'eBay官方Return GraphQL schema（provideRmaNumber、ProvideRmaNumberInput、RmaDetail）、现代API迁移指南及Post-Order发布记录；本轮验收：原型/退货地址与RMA授权验收2026-11-11.md。']
}
for (const entry of returnAnnotations.filter(item => /\.(filters|queues|table|sync)$/.test(item.id))) entry.版本 = '0.28 / 2026-11-13'
for (const entry of returnAnnotations.filter(item => /\.(overview|queues|execution|refund-detail|action-form|sync|after-sale-fields|after-sale-links)$/.test(item.id))) {
  entry.版本 = '1.1 / 2026-11-13'
  entry.prd引用 = [...new Set([...(entry.prd引用 || []), 'PRD/eBay退换货申请功能PRD.md', '文档/需求/退货退款申请PRD复盘2026-11-13/复盘记录.md'])]
}

for (const entry of returnAnnotations.filter(item => /\.(execution|action-form|after-sale-fields|after-sale-links)$/.test(item.id))) {
  entry.版本 = '售后关联 1.2 / 2026-11-13'
  entry.交互规则?.push('售后联动完善：可靠退款成功按原执行尝试回填原售后单，报价回复按原报价归属并去重。明确失败后原请求重试复用原单、更正后新办理生成新单；均重新复验资格并确认，未知不得绕过防重。实际提交人与售后创建人共用当前操作身份，失败摘要按本笔尝试保留，金额仍按独立凭据核实。')
  entry.prd引用 = [...new Set([...(entry.prd引用 || []), 'PRD/售后单管理功能PRD.md'])]
}



