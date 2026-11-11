<script setup lang="ts">
import { computed } from 'vue'
import { ElTable, ElTableColumn } from 'element-plus'
import type { AfterSaleRecord, DataSet } from './类型'
import { formatMoney } from './模型'
import { convertAmount } from './汇率换算'
import type { ExchangeQuote } from './汇率换算'
import { collectCostEvidence, collectExecutionEvidence } from './分析工具'
import { formatTime, shopName, staffName } from './展示工具'
const props = defineProps<{ record: AfterSaleRecord; data: DataSet; displayCurrency: string; exchangeQuote: ExchangeQuote }>()
const costs = computed(() => collectCostEvidence(props.data, [props.record]))
const convertedValue = (value: string, source: string) => formatMoney(convertAmount(value, source, props.displayCurrency, props.exchangeQuote).value, props.displayCurrency)
const executions = computed(() => collectExecutionEvidence(props.data, [props.record]))
const executionKind = { refund: '退款', return: '退货实收', reship: '重发出库' }
const executionOutcome = { success: '已成功', pending: '处理中', failed: '明确失败', unknown: '待核查' }
</script>
<template>
  <section class="as-record-detail">
        <div class="as-record-fields"><div><label>售后单号</label><span>{{ record.no }}</span></div><div><label>办理状态</label><span>{{ record.status }}</span></div><div><label>来源渠道</label><span>{{ record.origin }} · {{ record.scenario }}</span></div><div><label>登记处理方式</label><span>{{ record.method }}</span></div><div><label>来源单号</label><span>{{ record.sourceId || '中台主动发起' }}</span></div><div><label>关联原订单</label><span>{{ record.orderNo || '待关联' }}</span></div><div><label>所属店铺</label><span>{{ shopName(data, record.shopId) }}</span></div><div><label>客户</label><span>{{ record.customerName || '客户待关联' }}</span></div><div><label>当前负责人</label><span>{{ staffName(data, record.ownerId) }}</span></div><div><label>创建时间</label><span>{{ formatTime(record.createdAt) }}</span></div></div>
        <h3>本次涉及商品</h3><ElTable :data="record.items" class="as-table" size="small"><ElTableColumn prop="sku" label="系统SKU" min-width="130"><template #default="{ row }">{{ row.sku || '待关联' }}</template></ElTableColumn><ElTableColumn prop="title" label="商品" min-width="180" /><ElTableColumn prop="quantity" label="数量" width="75" /><ElTableColumn prop="problem" label="原始售后原因" min-width="140" /><ElTableColumn label="关联情况" width="105"><template #default="{ row }">{{ row.linkage === 'verified' ? '已核实' : '待核实' }}</template></ElTableColumn></ElTable>
        <h3>费用凭证</h3><p class="as-exchange-context">统一展示 {{ displayCurrency }} · 汇率日期 {{ formatTime(exchangeQuote.asOf) }} · 原币金额保留追溯</p><ElTable :data="costs" class="as-table" size="small" empty-text="暂无可核实费用凭证"><ElTableColumn prop="kind" label="费用项目" min-width="135" /><ElTableColumn label="原币金额" min-width="125"><template #default="{ row }">{{ formatMoney(row.value, row.currency) }}</template></ElTableColumn><ElTableColumn :label="'折算金额（' + displayCurrency + '）'" min-width="140"><template #default="{ row }">{{ convertedValue(row.value, row.currency) }}</template></ElTableColumn><ElTableColumn label="确认情况" width="100"><template #default="{ row }">{{ row.status === 'confirmed' ? '已确认' : '待核实' }}</template></ElTableColumn><ElTableColumn prop="source" label="凭证来源" min-width="125" /><ElTableColumn prop="evidenceId" label="凭证行标识" min-width="180" show-overflow-tooltip /><ElTableColumn label="商品分摊" width="100"><template #default="{ row }">{{ row.allocationValid ? '有分摊依据' : '未分摊' }}</template></ElTableColumn></ElTable>
        <h3>办理证据</h3><ElTable :data="record.actions" class="as-table" size="small" empty-text="暂无办理证据"><ElTableColumn label="人员" min-width="110"><template #default="{ row }">{{ row.source === 'system' ? '系统' : staffName(data, row.actorId) }}</template></ElTableColumn><ElTableColumn prop="label" label="办理动作" min-width="180" /><ElTableColumn label="结果" min-width="100"><template #default="{ row }">{{ ({ success: '已确认', pending: '处理中', failed: '明确失败', unknown: '待核查' })[row.outcome as 'success' | 'pending' | 'failed' | 'unknown'] }}</template></ElTableColumn><ElTableColumn label="发生时间" min-width="155"><template #default="{ row }">{{ formatTime(row.at) }}</template></ElTableColumn></ElTable>
        <p v-if="record.response || record.handling" class="as-record-note"><template v-if="record.response">首响：{{ formatTime(record.response.startedAt) }} → {{ formatTime(record.response.respondedAt) }}。</template><template v-if="record.handling"> 办理：{{ formatTime(record.handling.startedAt) }} → {{ formatTime(record.handling.endedAt) }}。</template></p>
        <p v-if="record.note" class="as-record-note">{{ record.note }}</p>
      <h3>实际执行结果</h3>
<ElTable :data="executions" class="as-table" size="small" empty-text="未取得独立执行结果，不能由登记方式或办理状态推断">
<ElTableColumn label="业务结果" min-width="110"><template #default="{ row }">{{ executionKind[row.kind as keyof typeof executionKind] }}</template></ElTableColumn>
<ElTableColumn label="执行状态" min-width="100"><template #default="{ row }">{{ executionOutcome[row.outcome as keyof typeof executionOutcome] }}</template></ElTableColumn>
<ElTableColumn prop="reference" label="来源结果号" min-width="160" /><ElTableColumn prop="source" label="证据来源" min-width="150" />
<ElTableColumn label="结果时间" min-width="160"><template #default="{ row }">{{ formatTime(row.at) }}</template></ElTableColumn>
</ElTable></section></template>