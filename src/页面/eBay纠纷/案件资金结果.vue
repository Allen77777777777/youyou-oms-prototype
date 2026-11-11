<script setup lang="ts">
import { dateText } from './模型'
import type { CaseFunds, CaseLegacyAppeal, Money } from './类型'

defineProps<{ funds?: CaseFunds; appeal?: CaseLegacyAppeal }>()
const money = (value?: Money) => value?.currency && value.value ? `${value.currency} ${value.value}` : ''
const conversion = (value?: Money) => [
  value?.convertedFromValue && value.convertedFromCurrency ? `折算前 ${value.convertedFromCurrency} ${value.convertedFromValue}` : '',
  value?.exchangeRate ? `汇率 ${value.exchangeRate}` : '',
].filter(Boolean).join(' · ')
const fundingStatusLabels: Record<string, string> = { FUNDED: '出资成功', FAILED: '出资失败' }
const fundingText = (code: string) => fundingStatusLabels[code] || code
</script>

<template>
  <section v-if="appeal && Object.values(appeal).some(Boolean)" class="case-result" data-dispute-section="legacy-appeal">
    <h3>申诉处理结果</h3>
    <dl>
      <template v-if="appeal.requestedAt"><dt>申诉发起</dt><dd>{{ dateText(appeal.requestedAt) }}</dd></template>
      <template v-if="appeal.statusText || appeal.statusCode"><dt>申诉阶段</dt><dd>{{ appeal.statusText || appeal.statusCode }}</dd></template>
      <template v-if="appeal.outcomeText || appeal.outcomeCode"><dt>申诉处理</dt><dd>{{ appeal.outcomeText || appeal.outcomeCode }}</dd></template>
      <template v-if="appeal.closureReasonText || appeal.closureReasonCode"><dt>申诉结束原因</dt><dd>{{ appeal.closureReasonText || appeal.closureReasonCode }}</dd></template>
      <template v-if="appeal.refundAmount"><dt>申诉退款金额</dt><dd>{{ money(appeal.refundAmount) }}<small v-if="conversion(appeal.refundAmount)" class="conversion">{{ conversion(appeal.refundAmount) }}</small></dd></template>
    </dl>
    <details v-if="appeal.statusCode || appeal.outcomeCode || appeal.closureReasonCode" class="raw"><summary>申诉原始代码</summary><dl>
      <template v-if="appeal.statusCode"><dt>申诉阶段</dt><dd>{{ appeal.statusCode }}</dd></template>
      <template v-if="appeal.outcomeCode"><dt>申诉处理</dt><dd>{{ appeal.outcomeCode }}</dd></template>
      <template v-if="appeal.closureReasonCode"><dt>结束原因</dt><dd>{{ appeal.closureReasonCode }}</dd></template>
    </dl></details>
  </section>
  <section v-if="funds && Object.values(funds).some(value => Array.isArray(value) ? value.length : value)" class="case-result" data-dispute-section="case-funds">
    <h3>案件资金结果</h3>
    <dl>
      <template v-if="funds.refundAmount"><dt>退款金额</dt><dd>{{ money(funds.refundAmount) }}<small v-if="conversion(funds.refundAmount)" class="conversion">{{ conversion(funds.refundAmount) }}</small></dd></template>
      <template v-if="funds.refundChargedAmount"><dt>卖家退款扣款</dt><dd>{{ money(funds.refundChargedAmount) }}<small v-if="conversion(funds.refundChargedAmount)" class="conversion">{{ conversion(funds.refundChargedAmount) }}</small></dd></template>
      <template v-if="funds.feeCreditAmount"><dt>费用返还</dt><dd>{{ money(funds.feeCreditAmount) }}<small v-if="conversion(funds.feeCreditAmount)" class="conversion">{{ conversion(funds.feeCreditAmount) }}</small></dd></template>
      <template v-if="funds.internationalRefundAmount"><dt>跨境退款金额</dt><dd>{{ money(funds.internationalRefundAmount) }}<small v-if="conversion(funds.internationalRefundAmount)" class="conversion">{{ conversion(funds.internationalRefundAmount) }}</small></dd></template>
    </dl>
    <article v-for="(transaction,index) in funds.transactions || []" :key="index" class="transaction">
      <h4>资金记录 {{ index + 1 }}</h4><dl>
        <template v-if="transaction.at"><dt>记录时间</dt><dd>{{ dateText(transaction.at) }}</dd></template>
        <template v-if="transaction.type"><dt>资金类型</dt><dd>{{ transaction.type }}</dd></template>
        <template v-if="transaction.amount"><dt>记录金额</dt><dd>{{ money(transaction.amount) }}<small v-if="conversion(transaction.amount)" class="conversion">{{ conversion(transaction.amount) }}</small></dd></template>
        <template v-if="transaction.fundingSource"><dt>出资来源</dt><dd>{{ transaction.fundingSource }}</dd></template>
        <template v-if="transaction.fundingStatus"><dt>出资结果</dt><dd>{{ fundingText(transaction.fundingStatus) }}</dd></template>
        <template v-if="transaction.reason"><dt>记录说明</dt><dd>{{ transaction.reason }}</dd></template>
      </dl>
      <details v-if="transaction.fundingStatus" class="raw"><summary>资金原始代码</summary><dl><dt>出资结果</dt><dd>{{ transaction.fundingStatus }}</dd></dl></details>
    </article>
  </section>
</template>

<style scoped>
.case-result{min-width:0;margin-top:14px;padding-top:12px;border-top:1px solid #e8ecf0;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
h3,h4{margin:0 0 9px;color:var(--yy-text-heading);font-size:12px}dl{display:grid;grid-template-columns:minmax(88px,1fr) minmax(0,1.2fr);gap:8px 10px;margin:0}dt{color:#657384}dd{margin:0}
.transaction,.raw{margin-top:12px;padding-top:10px;border-top:1px solid #edf0f4}.raw summary{cursor:pointer;color:#657384}.raw[open] dl{margin-top:9px}
.conversion{display:block;font-size:11px;color:#657384;margin-top:3px}
</style>
