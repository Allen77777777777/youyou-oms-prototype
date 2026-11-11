<script setup lang="ts">
import type { Money, SellerRefundAmounts } from './类型'

defineProps<{ amounts: SellerRefundAmounts; estimated?: boolean }>()
const money = (value?: Money) => value?.currency && value.value ? `${value.currency} ${value.value}` : ''
</script>

<template>
  <div class="refund-breakdown" data-dispute-section="refund-breakdown">
    <dl>
      <template v-for="(line,index) in amounts.priceLines || []" :key="'price-' + index">
        <dt>{{ line.label || line.code }}</dt><dd>{{ money(line.amount) }}</dd>
      </template>
      <template v-if="amounts.netAmount"><dt>{{ estimated ? '预计卖家净退款' : '卖家净退款' }}</dt><dd class="net-amount">{{ money(amounts.netAmount) }}</dd></template>
      <template v-if="amounts.totalWithholdingAmount"><dt>{{ estimated ? '预计扣减合计' : '扣减合计' }}</dt><dd>{{ money(amounts.totalWithholdingAmount) }}</dd></template>
      <template v-for="(line,index) in amounts.withholdings || []" :key="'withholding-' + index"><dt>{{ line.label || line.code }}</dt><dd>{{ money(line.amount) }}</dd></template>
      <template v-if="amounts.totalCreditAmount"><dt>{{ estimated ? '预计返还合计' : '返还合计' }}</dt><dd>{{ money(amounts.totalCreditAmount) }}</dd></template>
      <template v-for="(line,index) in amounts.credits || []" :key="'credit-' + index"><dt>{{ line.label || line.code }}</dt><dd>{{ money(line.amount) }}</dd></template>
      <template v-if="amounts.eBayProtectionCoveredAmount"><dt>eBay 保护承担</dt><dd>{{ money(amounts.eBayProtectionCoveredAmount) }}</dd></template>
      <template v-if="amounts.plannedBuyerRecoveryAmount"><dt>计划向买家收回</dt><dd>{{ money(amounts.plannedBuyerRecoveryAmount) }}</dd></template>
    </dl>
    <p v-if="amounts.plannedBuyerRecoveryAmount" class="caption">计划收回金额不向卖家收取，不表示已收回。</p>
  </div>
</template>

<style scoped>
.refund-breakdown{min-width:0;margin-top:10px;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:minmax(88px,1fr) minmax(0,1.2fr);gap:8px 10px;margin:0}
dt{color:#657384}dd{margin:0}.net-amount{font-weight:600;color:var(--yy-text-heading)}
.caption{font-size:11px;color:#657384;margin:9px 0 0}
</style>
