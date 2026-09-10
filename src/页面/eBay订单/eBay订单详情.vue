<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CopyDocument,
  Link,
  Lock,
  RefreshRight,
  Right,
  WarningFilled,
} from '@element-plus/icons-vue'
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElIcon,
  ElInput,
  ElMessage,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus'
import { useRouter } from 'vue-router'

import type { 原型标注 } from '@/类型/标注'
import 手机商品占位图 from '@/资源/eBay订单/旗舰手机商品占位-概念图.png'
import { 格式化eBay站点, 格式化金额, 获取状态说明, 计算商品单价 } from './订单工具'
import type { eBay履约指令, eBay订单 } from './类型'

const props = defineProps<{
  order: eBay订单
  refreshing: boolean
}>()

const emit = defineEmits<{
  refresh: [order: eBay订单]
}>()

const router = useRouter()
const 联系信息授权弹窗 = ref(false)
const 查看原因 = ref('')
const 已授权查看 = ref(false)

type eBay收件指令 = eBay履约指令 & {
  type: 'SHIP_TO'
  shipTo: NonNullable<eBay履约指令['shipTo']>
}

const 收件指令列表 = computed(() =>
  props.order.instructions.filter(
    (指令): 指令 is eBay收件指令 => 指令.type === 'SHIP_TO' && 指令.shipTo !== undefined,
  ),
)
const 首条配送指令 = computed(() => 收件指令列表.value[0])
const 首笔成功付款 = computed(() => props.order.payments.find((付款) => 付款.status === 'PAID'))
const 是否存在未知枚举 = computed(() =>
  [
    获取状态说明('fulfillment', props.order.fulfillmentStatus),
    获取状态说明('payment', props.order.paymentStatus),
    获取状态说明('cancel', props.order.cancelStatus),
  ].some((状态) => 状态.unknown),
)

const 标注 = (
  id: string,
  标题: string,
  说明: string,
  事实等级: 原型标注['事实等级'],
  prd引用: string[],
  交互规则: string[] = [],
  逻辑: Pick<原型标注, '前置条件' | '触发方式' | '系统动作' | '成功结果' | '异常处理' | '数据来源' | '权限与审计' | '验收要点'> = {},
): 原型标注 => ({
  id,
  标题,
  说明,
  路由: '/oms/orders/ebay/:sellerId/:orderId',
  锚点: id,
  版本: '0.6.0',
  状态: '待评审',
  事实等级,
  prd引用,
  交互规则,
  ...逻辑,
})

const 顶部识别标注 = 标注(
  'oms.ebay-order.detail.identity',
  'eBay订单顶部识别区',
  '详情作为系统内部页签打开；以 eBay 订单号为主标题，eBay 履约、付款、取消与 OMS 处理状态分别呈现，互不覆盖。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04', 'PRD/eBay订单功能PRD.md#EB-07'],
  [],
  {
    前置条件: ['已通过列表或直接路由定位到 sellerId + orderId。'],
    系统动作: ['以 eBay orderId 作为页面主标识；平台履约、付款、取消和 OMS 处理状态分栏投影。'],
    成功结果: ['研发和测试可以分别判断平台状态与 OMS 状态，不通过综合“订单状态”推断业务结果。'],
    异常处理: ['未知枚举保留原值并显示待核查提示，不推进 OMS 状态。'],
    数据来源: ['eBay Order 状态字段与 OMS order_processing_status。'],
    验收要点: ['检查四种状态在同一订单上同时展示且互不覆盖。'],
  },
)

const 复制订单号标注 = 标注(
  'oms.ebay-order.detail.copy-order-id',
  '复制 eBay 订单号',
  '订单号复制只用于辅助核对和检索，不改变订单状态或生成新单据。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04'],
  [],
  {
    触发方式: ['点击订单号右侧复制图标。'],
    系统动作: ['将当前 eBay orderId 写入剪贴板。'],
    成功结果: ['提示“eBay订单号已复制”。'],
    异常处理: ['浏览器未授予剪贴板权限时提示用户手动复制，不影响订单数据。'],
    验收要点: ['确认复制内容为平台 orderId，而不是销售记录号或系统订单号。'],
  },
)

const 刷新标注 = 标注(
  'oms.ebay-order.detail.refresh',
  '单笔刷新 eBay 数据',
  '提交 order 与 shipping_fulfillment 的异步刷新。刷新失败时继续显示最后一次可信数据，且不推进 OMS 状态。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-05'],
  ['点击后进入“更新中”状态。', '原型约 1.2 秒后模拟成功；更新失败样例会保留失败摘要。'],
  {
    前置条件: ['当前订单不处于“更新中”，且用户拥有当前店铺的更新权限。'],
    触发方式: ['点击详情顶部“刷新 eBay 数据”。'],
    系统动作: ['提交 order 与 shipping_fulfillment 更新任务；按钮进入 loading，顶部保留最近成功时间。'],
    成功结果: ['订单和平台发货记录刷新成功，显示新的最近成功更新时间；OMS 状态不变。'],
    异常处理: ['更新失败时保留最后可信数据和失败摘要；未知枚举只进入待核查，不推进 OMS。'],
    数据来源: ['eBay order、shipping_fulfillment 本地投影和更新任务结果。'],
    权限与审计: ['记录操作者、店铺、订单、任务版本、开始/结束时间和结果。'],
    验收要点: ['验证 loading 门禁、成功、失败和未知枚举四种结果。'],
  },
)

const 时效标注 = 标注(
  'oms.ebay-order.detail.fulfillment-timing',
  '订单时间与履约时限',
  '以稳定四项网格展示下单、付款、最晚发货和预计送达范围；桌面窄宽度切换为两列，避免预计送达起止时间拥挤。',
  '合理假设',
  ['PRD/eBay订单功能PRD.md#EB-04', 'PRD/eBay订单功能PRD.md#Q-02'],
  [],
  {
    系统动作: ['按四个独立信息单元展示 creationDate、成功付款时间、订单级 shipByDate 和预计送达范围。'],
    异常处理: ['多行时限、多笔付款、多条预计送达的订单级聚合未确认时，保留原始明细并显示待确认口径。'],
    数据来源: ['Order.creationDate、paymentSummary.payments、lineItems.lineItemFulfillmentInstructions、fulfillmentStartInstructions。'],
    验收要点: ['检查时间来源时区、付款未成功、无时限、临期和多条配送指令场景。'],
  },
)

const 配送标注 = 标注(
  'oms.ebay-order.detail.shipping-instructions',
  'SHIP_TO 收件信息',
  '收件区只展示 SHIP_TO 指令中的收件人、实际投递地址和联系信息，并同时标明 OMS 履约模式；非地址类指令不在此区域重复展示。敏感联系信息默认脱敏。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04', 'PRD/eBay订单功能PRD.md#EB-08'],
  [],
  {
    前置条件: ['仅存在 type=SHIP_TO 且含 shipTo 的履约指令时渲染收件卡。'],
    触发方式: ['查看页面默认脱敏的收件信息；需要明文核对时点击“查看联系信息”。'],
    系统动作: ['只读取 shippingStep.shipTo；不回退 buyerRegistrationAddress 或 finalDestinationAddress。'],
    成功结果: ['显示真实投递收件人、地址、配送服务和履约模式；非地址指令不被伪造为地址卡。'],
    异常处理: ['无 SHIP_TO 时显示“平台未返回 SHIP_TO 收件信息”；授权原因为空时不得打开明文查看结果。'],
    数据来源: ['Order.fulfillmentStartInstructions[].shippingStep.shipTo 及对应指令字段。'],
    权限与审计: ['联系信息明文查看需要敏感数据权限，记录订单、操作者、原因、时间和结果。'],
    验收要点: ['验证多条 SHIP_TO、无地址指令、默认脱敏、授权原因校验和审计反馈。'],
  },
)

const 商品标注 = 标注(
  'oms.ebay-order.detail.line-items',
  'eBay商品行',
  '按 lineItemId 展示多商品行，分别保留平台 SKU、系统 SKU、站点、数量、行级履约和金额事实。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04', '文档/集成/eBay/eBay订单功能与字段接入说明.md#3.2'],
  [],
  {
    系统动作: ['按 lineItemId 渲染商品行；商品单价使用折扣前 lineItemCost ÷ quantity 的 Decimal 口径。'],
    成功结果: ['平台 SKU、系统 SKU、Item ID、变体/适配属性、数量、行金额与行级履约状态并列展示。'],
    异常处理: ['系统 SKU 未映射时只读显示“未配对系统SKU”；未知履约枚举保留原值并待核查。'],
    数据来源: ['Order.lineItems[]；系统 SKU 只读读取现有 SKU 映射资料。'],
    验收要点: ['验证多商品行、未配对 SKU、金额币种、数量为 0/缺失和未知行级履约状态。'],
  },
)

const 平台履约标注 = 标注(
  'oms.ebay-order.detail.platform-fulfillment',
  'eBay平台发货记录',
  '一个订单可有多个 fulfillment。平台标发时间不等于仓库实际出库时间，也不与 OMS 履约单合并。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04', '文档/集成/eBay/eBay订单功能与字段接入说明.md#3.4'],
  [],
  {
    系统动作: ['按 fulfillmentId 展开平台返回的每个包裹、承运商、跟踪号、标发时间和商品行数量。'],
    成功结果: ['平台标发事实与 OMS 履约单并列呈现，研发可区分平台回传与仓库实际出库。'],
    异常处理: ['更新失败或待更新时保留最后可信数据，不把空包裹列表解释为没有包裹。'],
    数据来源: ['ShippingFulfillment.fulfillments[]；fulfillment.warnings[] 作为诊断信息。'],
    验收要点: ['验证多包裹、无包裹、更新失败、跟踪号和平台标发时间不反推仓库出库。'],
  },
)

const OMS上下文标注 = 标注(
  'oms.ebay-order.detail.oms-context',
  'OMS关联单据',
  '只读展示系统订单、履约单与标发单，并附带 OMS 六态、履约模式和路由摘要；业务动作跳转到所属模块执行。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-06'],
  [],
  {
    前置条件: ['存在 OMS 关联单据或明确知道当前 eBay 订单尚未关联。'],
    触发方式: ['点击系统订单、订单标发中心等跨模块入口。'],
    系统动作: ['只读展示系统订单、OMS 六态、履约模式、首次/默认路由及履约/标发单；业务动作跳转到所属模块。'],
    成功结果: ['关联存在时可定位目标业务对象；缺失时显示“暂无关联单据”而不生成虚构编号。'],
    异常处理: ['平台履约订单不进入自配送标发中心；无系统订单时禁用全渠道订单入口。'],
    数据来源: ['OMS 订单、履约单、订单标发单及订单头路由快照。'],
    权限与审计: ['跳转目标继续执行权限校验；订单关键状态和路由变更由目标模块审计。'],
    验收要点: ['验证已关联、未关联、平台履约、自配送、多仓路由和入口禁用状态。'],
  },
)

const 订单金额标注 = 标注(
  'oms.ebay-order.detail.amounts',
  '订单金额与付款明细',
  '订单金额卡只表达买家订单金额构成和付款/退款明细，不推导卖家收益、资金状态或平台费用。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-04', '文档/集成/eBay/eBay订单功能与字段接入说明.md#3.3'],
  [],
  {
    系统动作: ['以 pricingSummary.total 为订单总额，按币种展示订单头金额构成；付款和退款按明细逐笔呈现。'],
    成功结果: ['用户可以核对小计、优惠、配送费、税费、费用、调整和买家付款/退款明细。'],
    异常处理: ['字段缺失、0 和未知不可混同；多币种不得直接相加；退款状态未知显示待核查。'],
    数据来源: ['Order.pricingSummary、paymentSummary.payments[]、paymentSummary.refunds[]。'],
    验收要点: ['验证金额币种、金额构成、付款状态、退款状态和不展示资金收益字段。'],
  },
)

const 联系信息授权标注 = 标注(
  'oms.ebay-order.detail.contact-authorization',
  '查看联系信息授权',
  '敏感联系信息默认脱敏；明文查看必须先填写原因并记录审计，原型样例仍不展示真实身份数据。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-08', 'PRD/eBay订单功能PRD.md#AC-06'],
  [],
  {
    前置条件: ['存在 SHIP_TO 收件信息；用户具备敏感数据明文查看权限。'],
    触发方式: ['点击“查看联系信息”，在授权弹窗填写查看原因并确认。'],
    系统动作: ['校验查看原因非空；记录操作者、订单、原因、时间和结果。'],
    成功结果: ['界面显示“已记录审计”反馈；原型数据继续保持脱敏。'],
    异常处理: ['原因为空时阻止确认并提示；无 SHIP_TO 时不显示入口。'],
    权限与审计: ['明文查看必须受角色、店铺和敏感数据权限控制，禁止写入普通日志。'],
    验收要点: ['验证入口条件、空原因拦截、确认反馈和默认脱敏。'],
  },
)

const 未知枚举标注 = 标注(
  'oms.ebay-order.detail.unknown-enum',
  '未知平台枚举提示',
  '平台返回未在当前字典中的枚举时，保留原始值并进入待核查，不按猜测推进订单。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-07', 'PRD/eBay订单功能PRD.md#EB-09'],
  [],
  {
    触发方式: ['详情订单的履约、付款或取消字段命中未知枚举。'],
    系统动作: ['页面显示原值和待核查提示；不覆盖其他状态、不生成取消或发货结论。'],
    成功结果: ['研发可从订单号追踪原始报文和更新任务，测试可验证门禁未被绕过。'],
    数据来源: ['eBay 原始订单报文、状态映射表和更新任务诊断。'],
    验收要点: ['构造未知付款枚举样例，确认提示出现且 OMS 状态保持不变。'],
  },
)

const OMS跳转标注 = 标注(
  'oms.ebay-order.detail.cross-module-actions',
  '跨模块业务跳转',
  'eBay订单详情只负责提供关联入口；系统订单和标发动作在所属 OMS 模块执行。',
  '已确认',
  ['PRD/eBay订单功能PRD.md#EB-06'],
  [],
  {
    触发方式: ['点击“查看全渠道订单”或“前往订单标发中心”。'],
    系统动作: ['携带系统订单号或 eBay 订单号跳转到目标模块。'],
    成功结果: ['目标模块获得正确关联上下文；本页面不直接创建、审核、发货、取消或退款。'],
    异常处理: ['无系统订单或平台履约模式时禁用不适用入口。'],
    验收要点: ['验证入口可用性、跳转参数和不越权执行专业订单外的业务动作。'],
  },
)

async function 复制文本(文本: string, 名称: string) {
  try {
    await navigator.clipboard.writeText(文本)
    ElMessage.success(`${名称}已复制`)
  } catch {
    ElMessage.warning('浏览器未授予剪贴板权限，请手动复制')
  }
}

function 打开联系信息授权() {
  查看原因.value = ''
  联系信息授权弹窗.value = true
}

function 确认查看联系信息() {
  if (!查看原因.value.trim()) {
    ElMessage.warning('请填写查看原因')
    return
  }
  已授权查看.value = true
  联系信息授权弹窗.value = false
  ElMessage.success('已记录查看审计；原型样例仍保持脱敏')
}

async function 前往系统订单() {
  if (!props.order.oms.systemOrderNo) return
  await router.push({
    name: 'oms-all-order-detail',
    params: { systemOrderNo: props.order.oms.systemOrderNo },
  })
}

async function 前往标发中心() {
  await router.push({ path: '/oms/self-fulfillment/shipping-confirmation', query: { ebayOrder: props.order.orderId } })
}
</script>

<template>
  <section class="详情页面">
    <header class="详情顶栏">
      <div class="详情主标题区">
        <div class="详情标题行">
          <div>
            <div class="订单标题">
              <h1>{{ order.orderId }}</h1>
                <ElTooltip content="复制 eBay 订单号">
                <button v-prototype="复制订单号标注" class="复制图标" type="button" aria-label="复制 eBay 订单号" @click="复制文本(order.orderId, 'eBay订单号')">
                  <ElIcon><CopyDocument /></ElIcon>
                </button>
              </ElTooltip>
            </div>
            <div class="订单副标题">
              <span>销售记录号 {{ order.salesRecordReference || '—' }}</span>
              <span>{{ order.store }}</span>
              <ElTooltip :content="order.purchaseMarketplaces.join(' / ')" placement="top">
                <span>站点 {{ order.purchaseMarketplaces.map(格式化eBay站点).join(' / ') }}</span>
              </ElTooltip>
            </div>
          </div>
          <div class="详情顶栏操作">
            <span class="最近同步">最后成功更新 {{ order.sync.lastSuccess || '—' }}</span>
            <ElButton v-prototype="刷新标注" :loading="refreshing" @click="emit('refresh', order)">
              <ElIcon><RefreshRight /></ElIcon>
              刷新 eBay 数据
            </ElButton>
          </div>
        </div>
      </div>
      <div v-prototype="顶部识别标注" class="独立状态条">
        <div class="状态项">
          <span>eBay 履约</span>
          <b class="状态徽标" :class="`tone-${获取状态说明('fulfillment', order.fulfillmentStatus).tone}`">
            {{ 获取状态说明('fulfillment', order.fulfillmentStatus).text }}
          </b>
        </div>
        <div class="状态项">
          <span>eBay 付款</span>
          <b class="状态徽标" :class="`tone-${获取状态说明('payment', order.paymentStatus).tone}`">
            {{ 获取状态说明('payment', order.paymentStatus).text }}
          </b>
        </div>
        <div class="状态项">
          <span>eBay 取消</span>
          <b class="状态徽标" :class="`tone-${获取状态说明('cancel', order.cancelStatus).tone}`">
            {{ 获取状态说明('cancel', order.cancelStatus).text }}
          </b>
        </div>
        <div class="状态分隔"></div>
        <div class="状态项">
          <span>OMS 处理</span>
          <b class="状态徽标" :class="`tone-${获取状态说明('oms', order.oms.processingStatus).tone}`">
            {{ order.oms.processingStatus || (order.oms.fulfillmentMode === '平台履约' ? '不适用' : '未进入处理') }}
          </b>
        </div>
      </div>
      <ElAlert
        v-if="是否存在未知枚举"
        v-prototype="未知枚举标注"
        class="顶部异常提示"
        type="warning"
        :closable="false"
        show-icon
        title="平台返回了未识别的枚举值；页面已保留原值并标记待核查，不会据此推进 OMS 状态。"
      />
    </header>

    <div class="详情内容">
      <main class="详情主区">
        <article class="详情卡片">
          <div v-prototype="时效标注" class="区块标题">
            <div>
              <span class="区块序号">01</span>
              <h2>订单时间与履约时限</h2>
            </div>
          </div>
          <div class="时间网格">
            <section class="时间项">
              <span class="时间项标签">下单时间</span>
              <strong>{{ order.creationDate }}</strong>
              <small>eBay 订单创建时间，保留平台来源时区</small>
            </section>
            <section class="时间项" :class="{ '时间项-提示': !首笔成功付款 }">
              <span class="时间项标签">买家付款</span>
              <strong>{{ 首笔成功付款?.date || '尚无明确成功付款时间' }}</strong>
              <small>{{ 首笔成功付款 ? `${格式化金额(首笔成功付款.amount)} · ${首笔成功付款.method}` : '请查看付款明细' }}</small>
            </section>
            <section class="时间项" :class="{ '时间项-提示': order.urgency === '临期' }">
              <span class="时间项标签">最晚发货</span>
              <strong>{{ order.shipBy || '平台未提供' }}</strong>
              <small>{{ order.shipByLabel }}</small>
            </section>
            <section class="时间项 预计送达项">
              <span class="时间项标签">预计送达范围</span>
              <div class="预计送达范围">
                <div>
                  <span>最早</span>
                  <strong>{{ 首条配送指令?.minEstimatedDelivery || '—' }}</strong>
                </div>
                <div>
                  <span>最晚</span>
                  <strong>{{ 首条配送指令?.maxEstimatedDelivery || '—' }}</strong>
                </div>
              </div>
              <small>仅为 eBay 预计信息，不代表已签收或已妥投</small>
            </section>
          </div>
        </article>

        <article class="详情卡片">
          <div v-prototype="配送标注" class="区块标题">
            <div>
              <span class="区块序号">02</span>
              <h2>收件信息</h2>
            </div>
            <div class="区块标题操作">
              <ElTag size="small" type="info" effect="plain">履约模式：{{ order.oms.fulfillmentMode }}</ElTag>
              <ElButton v-if="收件指令列表.length" v-prototype="联系信息授权标注" text type="primary" @click="打开联系信息授权">
                <ElIcon><Lock /></ElIcon>
                查看联系信息
              </ElButton>
            </div>
          </div>
          <div v-if="收件指令列表.length" class="收件列表">
            <section v-for="(指令, 索引) in 收件指令列表" :key="指令.id" class="收件卡">
              <div class="收件卡标题">
                <strong>收件地址 {{ 索引 + 1 }}</strong>
                <code>SHIP_TO</code>
              </div>
              <div class="收件信息网格">
                <div class="收件字段">
                  <span class="字段标签">收件人</span>
                  <strong>{{ 指令.shipTo.fullName }}</strong>
                  <span v-if="指令.shipTo.companyName">{{ 指令.shipTo.companyName }}</span>
                </div>
                <div class="收件字段 收件地址">
                  <span class="字段标签">实际投递地址</span>
                  <strong>{{ 指令.shipTo.addressLine1 }} {{ 指令.shipTo.addressLine2 }}</strong>
                  <span>{{ 指令.shipTo.city }}, {{ 指令.shipTo.state }} {{ 指令.shipTo.postalCode }} · {{ 指令.shipTo.countryCode }}</span>
                </div>
                <div class="收件字段">
                  <span class="字段标签">联系信息</span>
                  <strong>{{ 指令.shipTo.phone }}</strong>
                  <span>{{ 指令.shipTo.email }}</span>
                  <ElTag v-if="已授权查看" class="审计标签" size="small" type="success" effect="plain">已记录审计</ElTag>
                </div>
              </div>
            </section>
          </div>
          <div v-else class="区块空态">
            <span>平台未返回 SHIP_TO 收件信息</span>
            <small>该区域仅展示订单实际投递地址，不补造或替代地址。</small>
          </div>
        </article>

        <article class="详情卡片">
          <div v-prototype="商品标注" class="区块标题">
            <div>
              <span class="区块序号">03</span>
              <h2>商品行</h2>
            </div>
            <span class="区块统计">{{ order.items.length }} 个商品行 · {{ order.items.reduce((总数, 商品) => 总数 + 商品.quantity, 0) }} 件</span>
          </div>
          <ElTable :data="order.items" class="商品表格" table-layout="fixed">
            <ElTableColumn label="商品" min-width="310">
              <template #default="{ row }">
                <div class="商品详情">
                  <ElTooltip content="原型概念占位图，非订单真实商品图" placement="top">
                    <img class="商品占位图" :src="手机商品占位图" alt="原型商品概念占位图" />
                  </ElTooltip>
                  <div class="商品文字">
                    <strong>{{ row.title }}</strong>
                    <span>Line item {{ row.lineItemId }}</span>
                    <span>Item ID {{ row.itemId }}<template v-if="row.variationId"> · Variation {{ row.variationId }}</template></span>
                    <div class="属性标签">
                      <span v-for="属性 in [...row.variations, ...row.compatibility]" :key="属性">{{ 属性 }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="SKU / 站点" min-width="185">
              <template #default="{ row }">
                <div class="纵向字段">
                  <span>平台 <code>{{ row.platformSku }}</code></span>
                  <span v-if="row.systemSku">系统 <code>{{ row.systemSku }}</code></span>
                  <span v-else class="待识别">未配对系统SKU</span>
                  <ElTooltip :content="`成交 ${row.purchaseMarketplaceId} / 刊登 ${row.listingMarketplaceId}`" placement="top">
                    <span>成交 {{ 格式化eBay站点(row.purchaseMarketplaceId) }} / 刊登 {{ 格式化eBay站点(row.listingMarketplaceId) }}</span>
                  </ElTooltip>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="下单数量 / 履约" width="132" align="center">
              <template #default="{ row }">
                <div class="纵向字段 居中">
                  <strong>下单数量 × {{ row.quantity }}</strong>
                  <span class="状态徽标 小号" :class="`tone-${获取状态说明('fulfillment', row.fulfillmentStatus).tone}`">
                    {{ 获取状态说明('fulfillment', row.fulfillmentStatus).text }}
                  </span>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="单价 / 行金额" width="172" align="right">
              <template #default="{ row }">
                <div class="金额明细">
                  <strong>单价 {{ 格式化金额(计算商品单价(row.lineCost, row.quantity)) }}</strong>
                  <span>行总额 {{ 格式化金额(row.total) }}</span>
                  <span>折后商品 {{ 格式化金额(row.discountedLineCost) }}</span>
                  <span>运费 {{ 格式化金额(row.deliveryCost) }}</span>
                  <span>税费 {{ 格式化金额(row.tax) }}</span>
                </div>
              </template>
            </ElTableColumn>
          </ElTable>
        </article>

        <article class="详情卡片">
          <div v-prototype="平台履约标注" class="区块标题">
            <div>
              <span class="区块序号">04</span>
              <h2>eBay 平台发货记录</h2>
            </div>
            <span class="区块统计">{{ order.fulfillments.length }} 个 fulfillment</span>
          </div>
          <ElAlert
            v-if="!order.fulfillments.length && order.sync.status !== '已同步'"
            :title="order.sync.status === '同步失败' ? '平台发货记录更新失败，当前仍显示最后可信数据。' : '平台发货记录待更新，不能据此判断为无包裹。'"
            :type="order.sync.status === '同步失败' ? 'error' : 'warning'"
            :closable="false"
            show-icon
          />
          <div v-else-if="order.fulfillments.length" class="包裹列表">
            <section v-for="(履约, 索引) in order.fulfillments" :key="履约.fulfillmentId" class="包裹卡">
              <div class="包裹序号">{{ String(索引 + 1).padStart(2, '0') }}</div>
              <div class="包裹主体">
                <div class="包裹标题">
                  <div>
                    <span>FULFILLMENT ID</span>
                    <strong>{{ 履约.fulfillmentId }}</strong>
                  </div>
                  <div>
                    <span>承运商 / 跟踪号</span>
                    <strong>{{ 履约.carrierCode }} · {{ 履约.trackingNumber }}</strong>
                  </div>
                  <div>
                    <span>eBay 平台标发时间</span>
                    <strong>{{ 履约.shippedDate }}</strong>
                  </div>
                </div>
                <div class="包裹商品行">
                  <span v-for="行 in 履约.lines" :key="行.lineItemId">{{ 行.lineItemId }} · 数量 {{ 行.quantity }}</span>
                </div>
              </div>
            </section>
            <p class="事实提示"><ElIcon><WarningFilled /></ElIcon> 平台标发时间仅表示 eBay 平台记录，不反推仓库实际出库时间。</p>
          </div>
          <div v-else class="区块空态">
            <span>最近一次平台发货记录更新成功，eBay 未返回 fulfillment</span>
            <small>这是平台查询结果，不是 OMS 发货结论。</small>
          </div>
        </article>
      </main>

      <aside class="详情侧栏">
        <section v-prototype="订单金额标注" class="侧栏卡片 金额卡片">
          <div class="侧栏标题">
            <h2>订单金额</h2>
            <span>买家支付口径</span>
          </div>
          <dl class="金额构成">
            <dt>商品小计</dt><dd>{{ 格式化金额(order.pricing.subtotal) }}</dd>
            <dt>商品优惠</dt><dd>{{ 格式化金额(order.pricing.discount) }}</dd>
            <dt>配送费</dt><dd>{{ 格式化金额(order.pricing.delivery) }}</dd>
            <dt>配送优惠</dt><dd>{{ 格式化金额(order.pricing.deliveryDiscount) }}</dd>
            <dt>税费</dt><dd>{{ 格式化金额(order.pricing.tax) }}</dd>
            <dt>费用</dt><dd>{{ 格式化金额(order.pricing.fee) }}</dd>
            <dt>调整</dt><dd>{{ 格式化金额(order.pricing.adjustment) }}</dd>
          </dl>
          <div class="订单总额">
            <span>订单总额</span>
            <strong>{{ 格式化金额(order.pricing.total) }}</strong>
          </div>
          <p class="金额口径">不等于卖家收益；本期不展示资金状态、卖家侧平台费用或订单收益。</p>
          <ElDivider />
          <div class="明细小标题">付款明细</div>
          <div class="支付明细列表">
            <div v-for="付款 in order.payments" :key="付款.id" class="支付明细">
              <div><span>{{ 付款.method }}</span><strong>{{ 格式化金额(付款.amount) }}</strong></div>
              <div><code>{{ 付款.status }}</code><small>{{ 付款.date || '未返回付款时间' }}</small></div>
            </div>
          </div>
          <template v-if="order.refunds.length">
            <div class="明细小标题 退款标题">退款明细</div>
            <div class="支付明细列表">
              <div v-for="退款 in order.refunds" :key="退款.id" class="支付明细 退款">
                <div><span>{{ 退款.status || '状态待核查' }}</span><strong>-{{ 格式化金额(退款.amount) }}</strong></div>
                <div><code>{{ 退款.referenceId }}</code><small>{{ 退款.date }}</small></div>
              </div>
            </div>
          </template>
        </section>

        <section class="侧栏卡片">
          <div v-prototype="OMS上下文标注" class="侧栏标题">
            <h2>OMS 关联单据</h2>
            <span>只读</span>
          </div>
          <div v-if="order.oms.systemOrderNo" class="系统订单链接" @click="前往系统订单">
            <div>
              <span>系统订单号</span>
              <strong>{{ order.oms.systemOrderNo }}</strong>
            </div>
            <ElIcon><Right /></ElIcon>
          </div>
          <ElAlert v-else title="暂无关联单据" description="当前仅有 eBay 平台订单，尚未关联 OMS 系统订单号。" type="info" :closable="false" show-icon />
          <ElDescriptions :column="1" size="small" class="OMS描述">
            <ElDescriptionsItem label="处理状态">{{ order.oms.processingStatus || (order.oms.fulfillmentMode === '平台履约' ? '不适用' : '未进入处理') }}</ElDescriptionsItem>
            <ElDescriptionsItem label="履约模式">{{ order.oms.fulfillmentMode }}</ElDescriptionsItem>
            <ElDescriptionsItem label="首次/默认仓">{{ order.oms.warehouse || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="仓储服务商">{{ order.oms.warehouseProvider || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="仓库账号">{{ order.oms.warehouseAccount || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="物流渠道">{{ order.oms.shippingChannel || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="面单模式">{{ order.oms.labelMode || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="履约单">{{ order.oms.fulfillmentNo || '—' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="OMS 标发单">{{ order.oms.confirmationNo || '—' }}</ElDescriptionsItem>
          </ElDescriptions>
          <ElAlert v-if="order.oms.noShipmentReason" :title="order.oms.noShipmentReason" type="info" :closable="false" show-icon />
          <div class="侧栏操作">
            <ElButton v-prototype="OMS跳转标注" :disabled="!order.oms.systemOrderNo" @click="前往系统订单"><ElIcon><Link /></ElIcon>查看全渠道订单</ElButton>
            <ElButton v-prototype="OMS跳转标注" :disabled="order.oms.fulfillmentMode === '平台履约'" @click="前往标发中心">前往订单标发中心</ElButton>
          </div>
        </section>

      </aside>
    </div>

    <ElDialog v-model="联系信息授权弹窗" title="查看敏感联系信息" width="440px" append-to-body>
      <div class="授权说明">
        <ElIcon><Lock /></ElIcon>
        <p>此操作需要敏感数据权限，并记录操作者、时间、订单、查看原因和结果。原型数据始终保持脱敏。</p>
      </div>
      <ElInput v-model="查看原因" type="textarea" :rows="3" maxlength="100" show-word-limit placeholder="请填写本次查看原因，例如：核对仓库退件地址" />
      <template #footer>
        <ElButton @click="联系信息授权弹窗 = false">取消</ElButton>
        <ElButton type="primary" @click="确认查看联系信息">确认并记录审计</ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<style scoped>
.详情页面 {
  min-width: 0;
  min-height: 100%;
  background: #f5f6f8;
  color: var(--yy-text-primary);
}

.详情顶栏 {
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--yy-border-light);
  background: white;
}

.详情主标题区 {
  min-width: 0;
}

.详情标题行 {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.订单标题 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.订单标题 h1 {
  margin: 0;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.复制图标 {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #8a93a2;
  cursor: pointer;
}

.复制图标:hover {
  background: #f2f6fc;
  color: var(--yy-primary);
}

.订单副标题 {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 4px;
  color: var(--yy-text-secondary);
  font-size: 12px;
}

.详情顶栏操作 {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
}

.最近同步 {
  color: #8a93a2;
  font-size: 12px;
}

.独立状态条 {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 20px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f0f2f5;
}

.状态项 {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.状态项 > span {
  color: #8a93a2;
  font-size: 11px;
}

.状态分隔 {
  width: 1px;
  height: 18px;
  background: #dfe3e8;
}

.状态徽标 {
  display: inline-flex;
  width: max-content;
  min-height: 22px;
  align-items: center;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

.状态徽标.小号 {
  min-height: 20px;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.tone-neutral { border-color: #dfe3e8; background: #f5f6f8; color: #667085; }
.tone-info { border-color: #bad9ff; background: #edf6ff; color: #2878d0; }
.tone-success { border-color: #b7e1cb; background: #eef9f2; color: #237a4b; }
.tone-warning { border-color: #f1d0a6; background: #fff7e8; color: #a65e00; }
.tone-danger { border-color: #efb7ba; background: #fff0f0; color: #c6363d; }

.顶部异常提示 {
  margin-top: 10px;
}

.详情内容 {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start;
  gap: 12px;
  padding: 12px;
}

.详情主区,
.详情侧栏 {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.详情侧栏 {
  position: sticky;
  top: 12px;
}

.详情卡片,
.侧栏卡片 {
  min-width: 0;
  border: 1px solid var(--yy-border-light);
  border-radius: 6px;
  background: white;
}

.详情卡片 {
  padding: 16px;
}

.侧栏卡片 {
  padding: 14px;
}

.区块标题,
.侧栏标题 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.区块标题 > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.区块标题 h2,
.侧栏标题 h2 {
  margin: 0;
  color: #252a31;
  font-size: 15px;
  font-weight: 650;
}

.区块序号 {
  color: #b2b8c2;
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
}

.区块统计,
.侧栏标题 > span {
  color: #8a93a2;
  font-size: 11px;
}

.区块标题操作 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.时间网格 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.时间项 {
  min-width: 0;
  min-height: 122px;
  padding: 12px 13px;
  border: 1px solid #e5e9ef;
  border-top: 2px solid #8bb6ee;
  border-radius: 5px;
  background: #fbfcfe;
}

.时间项-提示 {
  border-top-color: #e9ae55;
  background: #fffdf8;
}

.时间项标签 {
  color: #778292;
  font-size: 11px;
  font-weight: 600;
}

.时间项 > strong {
  display: block;
  margin-top: 9px;
  color: #303946;
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.时间项 > small {
  display: block;
  margin-top: 7px;
  color: #87909d;
  font-size: 10px;
  line-height: 1.5;
}

.预计送达范围 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 8px;
}

.预计送达范围 > div {
  min-width: 0;
  padding: 7px 8px;
  border-radius: 4px;
  background: white;
}

.预计送达范围 span,
.预计送达范围 strong {
  display: block;
}

.预计送达范围 span {
  color: #929ba7;
  font-size: 9px;
}

.预计送达范围 strong {
  margin-top: 3px;
  color: #3f4855;
  font-family: Consolas, monospace;
  font-size: 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.收件列表 {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.收件卡 {
  padding: 13px;
  border: 1px solid #e7eaf0;
  border-radius: 5px;
  background: #fbfcfd;
}

.收件卡标题 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.收件卡标题 strong {
  color: #303946;
  font-size: 13px;
}

code {
  padding: 1px 4px;
  border-radius: 3px;
  background: #f1f3f6;
  color: #536071;
  font-family: Consolas, monospace;
  font-size: 10px;
}

.配送网格 {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  gap: 18px;
  margin-top: 12px;
}

.字段标签 {
  display: block;
  margin-bottom: 8px;
  color: #9098a5;
  font-size: 10px;
  text-transform: uppercase;
}

.地址主块 strong {
  font-size: 13px;
}

.地址主块 p {
  margin: 4px 0 0;
  color: #545d69;
  font-size: 12px;
  line-height: 1.5;
}

.联系行 {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 9px;
  color: #77808f;
  font-size: 11px;
}

.配送参数,
.金额构成,
.同步信息 {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-content: start;
  gap: 7px 12px;
  margin: 0;
  font-size: 11px;
}

.配送参数 dt,
.金额构成 dt,
.同步信息 dt {
  color: #8a93a2;
}

.配送参数 dd,
.金额构成 dd,
.同步信息 dd {
  min-width: 0;
  margin: 0;
  color: #424a56;
  overflow-wrap: anywhere;
}

.配送参数 dd {
  text-align: right;
}

.不适用说明 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 4px;
  background: #f3f5f7;
  color: #687180;
  font-size: 12px;
}

.区块空态 {
  display: flex;
  min-height: 86px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 12px;
  border: 1px dashed #dce1e8;
  border-radius: 5px;
  color: #646d79;
  font-size: 12px;
}

.区块空态 small {
  color: #9aa1ac;
}

.商品表格 {
  width: 100%;
  margin-top: 12px;
}

.商品表格 :deep(th.el-table__cell) {
  height: 34px;
  background: #f7f8fa;
  color: #707987;
  font-size: 11px;
  font-weight: 600;
}

.商品表格 :deep(td.el-table__cell) {
  padding: 10px 0;
  vertical-align: top;
}

.商品详情 {
  display: flex;
  min-width: 0;
  gap: 12px;
}

.商品占位图 {
  display: block;
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  border: 1px solid #e3e6eb;
  border-radius: 6px;
  background: #f7f8fa;
  object-fit: contain;
}

.商品文字,
.纵向字段,
.金额明细 {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.商品文字 strong {
  color: #303744;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}

.商品文字 > span,
.纵向字段,
.金额明细 span {
  color: #7c8592;
  font-size: 10px;
  line-height: 1.45;
}

.属性标签 {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.属性标签 span {
  padding: 1px 5px;
  border-radius: 3px;
  background: #f1f4f8;
  color: #697585;
  font-size: 9px;
}

.纵向字段 code {
  width: fit-content;
}

.纵向字段.居中 {
  align-items: center;
}

.待识别 {
  color: #b56d09 !important;
}

.金额明细 {
  align-items: flex-end;
}

.金额明细 strong {
  font-family: Consolas, monospace;
  font-size: 12px;
}

.包裹列表 {
  margin-top: 12px;
}

.包裹卡 {
  display: flex;
  min-width: 0;
  border: 1px solid #e6e9ef;
  border-radius: 5px;
  overflow: hidden;
}

.包裹卡 + .包裹卡 {
  margin-top: 8px;
}

.包裹序号 {
  display: grid;
  width: 42px;
  flex: 0 0 42px;
  place-items: center;
  background: #f3f5f8;
  color: #7f8996;
  font-family: Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
}

.包裹主体 {
  min-width: 0;
  flex: 1;
  padding: 12px;
}

.包裹标题 {
  display: grid;
  grid-template-columns: 0.8fr 1.1fr 1fr;
  gap: 18px;
}

.包裹标题 span,
.包裹标题 strong {
  display: block;
}

.包裹标题 span {
  color: #929aa6;
  font-size: 9px;
  letter-spacing: 0.3px;
}

.包裹标题 strong {
  margin-top: 3px;
  color: #3e4652;
  font-family: Consolas, monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.包裹商品行 {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 9px;
}

.包裹商品行 span {
  padding: 3px 6px;
  border-radius: 3px;
  background: #f4f6f8;
  color: #727c89;
  font-family: Consolas, monospace;
  font-size: 9px;
}

.事实提示 {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 9px 0 0;
  color: #8a93a0;
  font-size: 10px;
}

.侧栏标题 {
  margin-bottom: 12px;
}

.金额卡片 {
  border-top: 2px solid #487edb;
}

.金额构成 {
  gap: 7px 10px;
}

.金额构成 dd {
  font-family: Consolas, monospace;
  text-align: right;
}

.订单总额 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid #e8ebef;
}

.订单总额 span {
  font-size: 12px;
  font-weight: 600;
}

.订单总额 strong {
  color: #1e5fbd;
  font-family: Consolas, monospace;
  font-size: 18px;
}

.金额口径 {
  margin: 7px 0 0;
  color: #949ca8;
  font-size: 9px;
  line-height: 1.5;
}

.明细小标题 {
  margin-bottom: 7px;
  color: #5f6875;
  font-size: 11px;
  font-weight: 600;
}

.退款标题 {
  margin-top: 12px;
}

.支付明细列表 {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.支付明细 {
  padding: 8px;
  border-radius: 4px;
  background: #f7f9fb;
}

.支付明细 > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.支付明细 > div + div {
  margin-top: 4px;
}

.支付明细 span,
.支付明细 strong {
  font-size: 11px;
}

.支付明细 strong {
  font-family: Consolas, monospace;
}

.支付明细 small {
  color: #939ba7;
  font-size: 9px;
}

.支付明细.退款 {
  background: #fff6f5;
}

.系统订单链接 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid #cfe0f8;
  border-radius: 4px;
  background: #f4f8ff;
  color: #2868bc;
  cursor: pointer;
}

.系统订单链接 span,
.系统订单链接 strong {
  display: block;
}

.系统订单链接 span {
  color: #7790b2;
  font-size: 9px;
}

.系统订单链接 strong {
  margin-top: 2px;
  font-family: Consolas, monospace;
  font-size: 11px;
}

.OMS描述 {
  margin: 12px 0;
}

.OMS描述 :deep(.el-descriptions__label) {
  width: 88px;
  color: #8a93a0;
  font-size: 10px;
}

.OMS描述 :deep(.el-descriptions__content) {
  color: #46505d;
  font-size: 10px;
  text-align: right;
}

.侧栏操作 {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 12px;
}

.侧栏操作 .el-button {
  width: 100%;
  margin: 0;
}

.同步信息 {
  grid-template-columns: 62px minmax(0, 1fr);
  padding: 10px;
  border-radius: 4px;
  background: #f7f8fa;
}

.同步口径 {
  margin: -3px 0 10px;
  color: #7c8592;
  font-size: 11px;
  line-height: 1.55;
}

.刷新宽按钮,
.禁用按钮承载,
.禁用按钮承载 .el-button {
  width: 100%;
}

.刷新宽按钮 {
  margin: 10px 0 6px;
}

.授权说明 {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
  border-radius: 5px;
  background: #fff7e8;
  color: #7a541b;
}

.授权说明 .el-icon {
  margin-top: 2px;
  flex: 0 0 auto;
}

.授权说明 p {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
}

@media (max-width: 1280px) {
  .详情内容 {
    grid-template-columns: minmax(0, 1fr) 292px;
  }

  .详情顶栏操作 .最近同步 {
    display: none;
  }

  .配送网格 {
    grid-template-columns: minmax(0, 1fr) 270px;
  }

  .独立状态条 {
    gap: 12px;
  }
}
</style>
