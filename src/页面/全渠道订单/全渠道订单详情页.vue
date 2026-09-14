<script setup lang="ts">
import { computed } from 'vue'
import {
  CopyDocument,
  InfoFilled,
  Lock,
  WarningFilled,
} from '@element-plus/icons-vue'
import {
  ElButton,
  ElIcon,
  ElMessage,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus'

import type { 原型标注 } from '@/类型/标注'
import {
  格式化金额,
  获取OMS状态说明,
  获取SKU状态说明,
  获取同步状态说明,
  获取平台状态说明,
  获取当前路由,
} from './订单工具'
import type { 全渠道订单 } from './类型'

const props = defineProps<{ order: 全渠道订单 }>()

const OMS状态 = computed(() => 获取OMS状态说明(props.order))
const 平台状态 = computed(() => 获取平台状态说明(props.order))
const 当前路由 = computed(() => 获取当前路由(props.order))

const 标注 = (
  id: string,
  标题: string,
  说明: string,
  事实等级: 原型标注['事实等级'],
  prd引用: string[],
  交互规则: string[] = [],
): 原型标注 => ({
  id,
  标题,
  说明,
  路由: '/oms/orders/all/:systemOrderNo',
  锚点: id,
  版本: '0.2.0',
  状态: '待评审',
  事实等级,
  prd引用,
  交互规则,
})

const 详情标注 = 标注(
  'oms.all-order.detail',
  '全渠道订单独立详情页签',
  '从列表进入详情时，在中台顶部页签栏打开独立业务页签；同一系统订单复用已有页签，不使用右侧抽屉承载完整详情。',
  '已确认',
  ['PRD/全渠道订单功能PRD.md#61-页面组成'],
  ['点击列表系统订单号、查看详情或双击行进入。', '相同系统订单号复用同一路径页签，不同订单打开不同页签。'],
)

const 状态标注 = 标注(
  'oms.all-order.detail.statuses',
  '平台状态与 OMS 状态分离',
  '平台状态投影与 OMS 自配送六态是两个独立维度；处理状态为空时区分等待准入和平台履约不适用。',
  '已确认',
  ['PRD/订单单据字段标准.md#61-订单头-oms_order', '文档/架构/领域模型与状态机.md#72-其他正交维度'],
)

const 商品标注 = 标注(
  'oms.all-order.detail.items',
  '标准订单商品行',
  '只展示跨平台通用的订单行字段；系统 SKU 来自中台现有映射资料，OMS 不提供配对或映射维护。',
  '已确认',
  ['PRD/订单单据字段标准.md#62-订单商品行-oms_order_line'],
)

const 路由标注 = 标注(
  'oms.all-order.detail.routing',
  '订单履约信息与仓储物流',
  '待审核阶段先保存订单头首次/默认路由；形成履约单后展示当前有效履约单的实际路由，跨仓时聚合为多值。',
  '已确认',
  ['PRD/订单单据字段标准.md#61-订单头-oms_order', 'PRD/订单领域模型设计.md#22-订单头先保存路由结果履约单保存执行快照'],
  ['业务页面按发货仓库、仓储服务商、仓库账号、物流渠道、面单获取模式分别展示订单已保存字段。', '下方履约单的仓储物流读取各自执行快照，不覆盖订单保存值。'],
)

const 敏感信息标注 = 标注(
  'oms.all-order.detail.masked-address',
  '收件信息默认脱敏',
  '原型只使用虚构且脱敏的数据。明文查看的角色、原因输入、审批和审计机制仍待业务与安全评审。',
  '待确认',
  ['PRD/订单单据字段标准.md#63-收件信息-oms_order_address', '文档/产品规划/OMS与eBay客服UI设计建议.md#53-订单详情'],
)

const 日志标注 = 标注(
  'oms.all-order.detail.operation-logs',
  '订单操作日志',
  '展示已有订单操作日志中的操作时间、操作者、操作类型、结果和内容；无记录时显示空态，不将审核轮次推造为操作日志。',
  '已确认',
  ['PRD/订单单据字段标准.md#123-操作日志-operation_log', 'PRD/全渠道订单功能PRD.md#19-2026-09-14-详情页评审调整'],
  ['只读取 operationLogs 中已有日志，不生成样例补齐空态。', '审核汇总仍由审核业务保存，详情不单独展示审核记录分区。'],
)

const 追溯标注 = 标注(
  'oms.all-order.detail.trace',
  '订单同步信息',
  '原始报文不在普通页面直接铺开；本区只展示版本、标准化结果和同步时间；订单操作日志独立展示。',
  '已确认',
  ['PRD/订单单据字段标准.md#52-集成报文快照-integration_payload_snapshot', 'PRD/订单单据字段标准.md#123-操作日志-operation_log'],
)

async function 复制系统订单号() {
  try {
    await navigator.clipboard.writeText(props.order.systemOrderNo)
    ElMessage.success('已复制系统订单号')
  } catch {
    ElMessage.warning('当前浏览器未允许复制，请手动选择订单号')
  }
}
</script>

<template>
  <article v-prototype="详情标注" class="详情页">
      <header class="详情头部">
        <div class="标题区">
          <div class="标题行">
            <span class="对象类型">全渠道订单</span>
            <strong>{{ order.systemOrderNo }}</strong>
            <button type="button" aria-label="复制系统订单号" @click="复制系统订单号">
              <ElIcon><CopyDocument /></ElIcon>
            </button>
          </div>
          <p>{{ order.platformCode }} · {{ order.storeName }} · 平台单号 {{ order.platformOrderNo }}</p>
        </div>
      </header>

      <section v-prototype="状态标注" class="摘要带">
        <div>
          <span>OMS 处理状态</span>
          <b class="状态徽标" :class="'tone-' + OMS状态?.tone">{{ OMS状态?.text }}</b>
          <small>{{ OMS状态?.helper || '当前履约阶段' }}</small>
        </div>
        <div>
          <span>平台订单状态</span>
          <b class="状态徽标" :class="'tone-' + 平台状态?.tone">{{ 平台状态?.text }}</b>
          <small>{{ order.platformCode === 'eBay' ? 'eBay orderFulfillmentStatus' : '状态映射待接入（占位）' }}</small>
        </div>
        <div>
          <span>履约模式</span>
          <strong>{{ order.fulfillmentMode }}</strong>
          <small>{{ order.fulfillmentMode === '自配送' ? '由 OMS 进入卖家履约链路' : 'OMS 自配送链路不适用' }}</small>
        </div>
        <div>
          <span>订单金额</span>
          <strong class="金额">{{ 格式化金额(order.amount.orderAmount) }}</strong>
          <small>订单总金额</small>
        </div>
      </section>

      <div v-if="order.blockReason || order.noShipmentReason || order.admissionReason" class="业务提示" :class="{ 阻断: Boolean(order.blockReason) }">
        <ElIcon><WarningFilled v-if="order.blockReason" /><InfoFilled v-else /></ElIcon>
        <div>
          <strong>{{ order.blockReason ? '履约已阻断' : order.noShipmentReason ? '无需 OMS 发货' : '尚未进入订单处理' }}</strong>
          <span>{{ order.blockReason || order.noShipmentReason || order.admissionReason }}</span>
        </div>
      </div>

      <section class="详情分区">
        <div class="分区标题">
          <h2>订单信息</h2>
        </div>
        <dl class="事实网格">
          <div><dt>系统订单号</dt><dd>{{ order.systemOrderNo }}</dd></div>
          <div><dt>平台订单号</dt><dd>{{ order.platformOrderNo }}</dd></div>
          <div><dt>平台订单 ID</dt><dd>{{ order.platformOrderId || '平台未提供' }}</dd></div>
          <div><dt>平台 / 店铺</dt><dd>{{ order.platformCode }} / {{ order.storeName }}</dd></div>
          <div><dt>订单类型</dt><dd>{{ order.orderType }}</dd></div>
          <div><dt>平台订单类型原值</dt><dd>{{ order.platformOrderType || '未返回' }}</dd></div>
          <div><dt>买家 ID</dt><dd>{{ order.buyerExternalId || '未返回' }}</dd></div>
          <div><dt>下单时间</dt><dd>{{ order.orderedAt }}</dd></div>
          <div><dt>付款时间</dt><dd>{{ order.paidAt || '尚无可靠付款时间' }}</dd></div>
          <div><dt>最晚发货时间</dt><dd>{{ order.shipByAt || '不适用 / 未返回' }}</dd></div>
          <div><dt>平台更新时间</dt><dd>{{ order.platformUpdatedAt || '未返回' }}</dd></div>
          <div><dt>最近同步时间</dt><dd>{{ order.lastSyncedAt }}</dd></div>
          <div v-if="order.cancelledAt"><dt>取消时间</dt><dd>{{ order.cancelledAt }}</dd></div>
          <div v-if="order.cancelledReason"><dt>取消原因</dt><dd>{{ order.cancelledReason }}</dd></div>
        </dl>
      </section>

      <section v-prototype="商品标注" class="详情分区">
        <div class="分区标题">
          <h2>商品与 SKU 解析</h2>
          <span>{{ order.items.length }} 个商品行</span>
        </div>
        <ElTable :data="order.items" row-key="externalLineId" table-layout="fixed" class="明细表">
          <ElTableColumn label="平台商品" min-width="218">
            <template #default="{ row }">
              <div class="商品信息">
                <strong>{{ row.platformItemTitle || '平台未返回商品标题' }}</strong>
                <span>平台 SKU {{ row.platformSku || '—' }}</span>
                <span v-if="row.platformVariant">{{ row.platformVariant }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="系统 SKU" width="158">
            <template #default="{ row }">
              <div class="商品信息">
                <strong>{{ row.systemSku || '尚未取得' }}</strong>
                <b class="状态徽标" :class="'tone-' + 获取SKU状态说明(row.skuResolutionStatus).tone">
                  {{ 获取SKU状态说明(row.skuResolutionStatus).text }}
                </b>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="数量" width="96" align="right">
            <template #default="{ row }">
              <div class="数量信息">
                <strong>× {{ row.orderedQuantity }}</strong>
                <span>可履约 {{ row.fulfillableQuantity ?? '—' }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="行金额" width="126" align="right">
            <template #default="{ row }">
              <div class="数量信息">
                <strong>{{ 格式化金额(row.itemTotal) }}</strong>
                <span>单价 {{ 格式化金额(row.unitPrice) }}</span>
              </div>
            </template>
          </ElTableColumn>
        </ElTable>
      </section>

      <section v-prototype="路由标注" class="详情分区">
        <div class="分区标题">
          <h2>订单履约信息</h2>
          <span v-if="order.fulfillmentMode === '平台履约'">平台履约</span>
        </div>

        <dl v-if="order.defaultRoute" class="仓储物流字段">
          <div><dt>发货仓库</dt><dd>{{ order.defaultRoute.warehouse || '—' }}</dd></div>
          <div><dt>物流渠道</dt><dd>{{ order.defaultRoute.shippingChannel || '—' }}</dd></div>
          <div><dt>仓储服务商</dt><dd>{{ order.defaultRoute.warehouseProvider || '—' }}</dd></div>
          <div><dt>仓库账号</dt><dd>{{ order.defaultRoute.warehouseAccount || '—' }}</dd></div>
          <div><dt>面单获取模式</dt><dd>{{ order.defaultRoute.labelMode || '—' }}</dd></div>
        </dl>

        <ElTable
          v-if="order.fulfillmentOrders.length"
          :data="order.fulfillmentOrders"
          row-key="fulfillmentOrderNo"
          table-layout="fixed"
          class="明细表 履约表"
        >
          <ElTableColumn label="履约单" width="154">
            <template #default="{ row }">
              <div class="商品信息">
                <strong>{{ row.fulfillmentOrderNo }}</strong>
                <span>{{ row.status }} · {{ row.isActive ? '当前有效' : '历史版本' }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="仓储物流" min-width="252">
            <template #default="{ row }">
              <div class="商品信息">
                <strong>{{ row.route.warehouse }}</strong>
                <span>{{ row.route.shippingChannel }} · {{ row.route.labelMode }}</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="数量" width="102" align="right">
            <template #default="{ row }">
              <div class="数量信息">
                <strong>{{ row.shippedQuantity }} / {{ row.plannedQuantity }}</strong>
                <span>已发 / 计划</span>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="跟踪号" width="130">
            <template #default="{ row }">
              <span class="等宽">{{ row.trackingNumber || '尚未取得' }}</span>
            </template>
          </ElTableColumn>
        </ElTable>

        <div v-else-if="order.fulfillmentMode === '平台履约'" class="无路由提示">
          <ElIcon><InfoFilled /></ElIcon>
          平台负责仓储与配送，OMS 不创建卖家仓履约单、物流下单或标发单。
        </div>
        <div v-else-if="!当前路由.length" class="无路由提示">
          <ElIcon><InfoFilled /></ElIcon>
          尚未分配发货仓库和物流渠道。
        </div>
      </section>

      <section class="双列分区">
        <div class="详情分区 子分区">
          <div class="分区标题"><h2>金额信息</h2></div>
          <div class="订单金额汇总"><span>订单金额</span><strong>{{ 格式化金额(order.amount.orderAmount) }}</strong></div>
          <dl class="金额明细">
            <div><dt>客付运费</dt><dd>{{ 格式化金额(order.amount.buyerPaidShipping) }}</dd></div>
            <div><dt>客付税费</dt><dd>{{ 格式化金额(order.amount.buyerPaidTax) }}</dd></div>
            <div><dt>交易费</dt><dd>{{ 格式化金额(order.amount.transactionFee) }}</dd></div>
            <div><dt>平台补贴</dt><dd>{{ 格式化金额(order.amount.platformSubsidy) }}</dd></div>
            <div><dt>其他费用</dt><dd>{{ 格式化金额(order.amount.otherFee) }}</dd></div>
          </dl>
        </div>

        <div v-prototype="敏感信息标注" class="详情分区 子分区">
          <div class="分区标题">
            <h2>收件信息</h2>
            <span class="锁定提示"><ElIcon><Lock /></ElIcon>默认脱敏</span>
          </div>
          <address class="收件信息">
            <strong>{{ order.address.fullName }}</strong>
            <span>{{ order.address.addressLine1 }} {{ order.address.addressLine2 }}</span>
            <span>{{ order.address.city }} {{ order.address.stateProvince }} {{ order.address.postalCode }}</span>
            <span>{{ order.address.countryCode }}</span>
            <span>{{ order.address.mobilePhone || order.address.telephone || '未返回联系电话' }}</span>
            <span>{{ order.address.email || '未返回邮箱' }}</span>
          </address>
          <ElTooltip content="明文查看权限、原因输入和审计机制尚待确认">
            <ElButton plain disabled>申请查看明文</ElButton>
          </ElTooltip>
        </div>
      </section>

      <section v-prototype="追溯标注" class="详情分区">
        <div class="分区标题"><h2>同步信息</h2></div>
        <div class="同步摘要">
          <b class="状态徽标" :class="'tone-' + 获取同步状态说明(order.sync.status).tone">
            {{ 获取同步状态说明(order.sync.status).text }}
          </b>
          <div><span>最近成功</span><strong>{{ order.sync.lastSuccess || '暂无成功记录' }}</strong></div>
          <div><span>最近尝试</span><strong>{{ order.sync.latestAttempt }}</strong></div>
          <div><span>外部版本</span><strong>{{ order.sync.externalVersion || '平台未提供' }}</strong></div>
          <div><span>标准化</span><strong>{{ order.sync.normalizationStatus || '—' }}</strong></div>
        </div>
        <p v-if="order.sync.message" class="同步说明">{{ order.sync.message }}</p>

      </section>

      <section v-prototype="日志标注" class="详情分区">
        <div class="分区标题"><h2>订单操作日志</h2><span>{{ order.operationLogs.length }} 条</span></div>
        <ElTable :data="order.operationLogs" table-layout="fixed" class="明细表 日志表" empty-text="暂无订单操作日志">
          <ElTableColumn prop="operatedAt" label="操作时间" width="208" />
          <ElTableColumn prop="operator" label="操作人" width="130" />
          <ElTableColumn prop="operationType" label="操作类型" width="138" />
          <ElTableColumn label="操作结果" width="96">
            <template #default="{ row }">
              <b class="状态徽标" :class="'tone-' + (row.operationResult === '成功' ? 'success' : row.operationResult === '失败' ? 'danger' : 'info')">{{ row.operationResult }}</b>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="content" label="操作内容" min-width="260" />
        </ElTable>
      </section>
  </article>
</template>

<style scoped>
.详情页 {
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: auto;
  background: #fff;
  color: var(--yy-text-primary);
}

.详情头部 {
  position: sticky;
  z-index: 4;
  top: 0;
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #e7eaee;
  background: rgb(255 255 255 / 96%);
  backdrop-filter: blur(8px);
}

.标题区 {
  min-width: 0;
}

.标题行 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.标题行 strong {
  color: #25303d;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 17px;
}

.对象类型 {
  color: #66717f;
  font-size: 12px;
}

.标题行 button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #7f8995;
  cursor: pointer;
}

.标题行 button:hover {
  background: #edf4fc;
  color: #2878d0;
}

.标题区 p {
  margin: 4px 0 0;
  overflow: hidden;
  color: #7c8693;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.摘要带 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid #e7eaee;
  background: #f8fafc;
}

.摘要带 > div {
  display: flex;
  min-width: 0;
  min-height: 84px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  padding: 10px 14px;
  border-right: 1px solid #e7eaee;
}

.摘要带 > div:last-child {
  border-right: 0;
}

.摘要带 span,
.摘要带 small {
  max-width: 100%;
  overflow: hidden;
  color: #818a96;
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.摘要带 strong {
  font-size: 13px;
}

.摘要带 .金额 {
  font-family: Consolas, monospace;
  font-size: 15px;
}

.状态徽标 {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-height: 20px;
  align-items: center;
  padding: 1px 6px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-neutral { border-color: #dfe3e8; background: #f5f6f8; color: #667085; }
.tone-info { border-color: #bad9ff; background: #edf6ff; color: #2878d0; }
.tone-success { border-color: #b7e1cb; background: #eef9f2; color: #237a4b; }
.tone-warning { border-color: #f1d0a6; background: #fff7e8; color: #a65e00; }
.tone-danger { border-color: #efb7ba; background: #fff0f0; color: #c6363d; }

.业务提示 {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 12px 16px 0;
  padding: 10px 12px;
  border: 1px solid #c9ddf7;
  border-radius: 4px;
  background: #f2f7fd;
  color: #316caa;
}

.业务提示.阻断 {
  border-color: #efc0c2;
  background: #fff3f3;
  color: #b9363c;
}

.业务提示.接入占位 {
  border-color: #d8dee7;
  background: #f7f8fa;
  color: #66717f;
}

.业务提示 > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.业务提示 strong {
  font-size: 13px;
}

.业务提示 span {
  color: #626f7e;
  font-size: 12px;
  line-height: 1.5;
}

.详情分区 {
  padding: 16px;
  border-bottom: 1px solid #e9ecef;
}

.分区标题 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.分区标题 h2 {
  margin: 0;
  color: #293441;
  font-size: 14px;
}

.分区标题 > span {
  color: #8a939f;
  font-size: 11px;
}

.事实网格 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  border-top: 1px solid #e8ebef;
  border-left: 1px solid #e8ebef;
}

.事实网格 > div {
  min-width: 0;
  padding: 8px 10px;
  border-right: 1px solid #e8ebef;
  border-bottom: 1px solid #e8ebef;
}

.事实网格 dt,
.金额明细 dt {
  margin-bottom: 4px;
  color: #8a939f;
  font-size: 11px;
}

.事实网格 dd,
.金额明细 dd {
  margin: 0;
  overflow: hidden;
  color: #3c4653;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.明细表 {
  width: 100%;
  border: 1px solid #e7eaee;
  --el-table-border-color: #edf0f3;
  --el-table-header-bg-color: #f7f8fa;
}

.明细表 :deep(th.el-table__cell) {
  height: 36px;
  padding: 0;
  color: #697382;
  font-size: 11px;
}

.明细表 :deep(td.el-table__cell) {
  padding: 7px 0;
  vertical-align: top;
}

.商品信息,
.数量信息 {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.商品信息 strong,
.数量信息 strong {
  overflow: hidden;
  color: #3b4552;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.商品信息 span,
.数量信息 span {
  overflow: hidden;
  color: #848d99;
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.数量信息 {
  align-items: flex-end;
}

.仓储物流字段 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 0 0 16px;
  padding: 16px;
  border: 1px solid #e7eaee;
  border-radius: 4px;
  background: #fafbfc;
}
.仓储物流字段 > div { min-width: 0; }
.仓储物流字段 dt { margin-bottom: 6px; color: #66717f; font-size: 12px; }
.仓储物流字段 dd { margin: 0; color: #303133; font-size: 13px; overflow-wrap: anywhere; }

.履约表 {
  margin-top: 8px;
}

.等宽 {
  color: #485463;
  font-family: Consolas, monospace;
  font-size: 11px;
}

.无路由提示 {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px;
  border: 1px dashed #d7dde5;
  border-radius: 4px;
  background: #fafbfc;
  color: #6f7986;
  font-size: 12px;
}

.双列分区 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #e9ecef;
}

.双列分区 .详情分区 {
  border-bottom: 0;
}

.双列分区 .详情分区:first-child {
  border-right: 1px solid #e9ecef;
}

.子分区 { min-width: 0; }
.订单金额汇总 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid #e4e9ef;
  border-radius: 4px;
  background: #f7f9fc;
}
.订单金额汇总 span { font-size: 13px; color: #303133; }
.订单金额汇总 strong { font-size: 20px; font-family: Consolas, monospace; font-variant-numeric: tabular-nums; color: #111; }
.金额明细 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; margin: 8px 0 0; }
.金额明细 > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 12px 0; border-bottom: 1px solid #edf0f3; }
.金额明细 dt { margin: 0; color: #66717f; font-size: 12px; }
.金额明细 dd { font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }

.锁定提示 {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.收件信息 {
  display: flex;
  min-height: 124px;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  color: #727c89;
  font-size: 12px;
  font-style: normal;
  line-height: 1.45;
}

.收件信息 strong {
  color: #374250;
}

.同步摘要 {
  display: grid;
  grid-template-columns: max-content repeat(4, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid #e3e8ee;
  border-radius: 4px;
  background: #f8fafc;
}

.同步摘要 > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.同步摘要 span {
  color: #8a939f;
  font-size: 10px;
}

.同步摘要 strong {
  overflow: hidden;
  color: #45505e;
  font-family: Consolas, "Microsoft YaHei", sans-serif;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.同步说明 {
  margin: 7px 0 12px;
  color: #6f7986;
  font-size: 12px;
}

@media (max-width: 1280px) {
  .金额明细 { grid-template-columns: 1fr; }
  .仓储物流字段 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .摘要带 {
    grid-template-columns: 1fr 1fr;
  }

  .摘要带 > div:nth-child(2) {
    border-right: 0;
  }

  .摘要带 > div:nth-child(-n + 2) {
    border-bottom: 1px solid #e7eaee;
  }
}
</style>
