<script setup lang="ts">
import { ElTable, ElTableColumn, ElTag } from 'element-plus'
import { 比价费用说明, type 计算比价分仓 } from './比价分仓'
import { 规则标注 } from './规则标注'
import { 格式化北京时间 } from '../订单处理/时间展示工具'
defineProps<{ result: ReturnType<typeof 计算比价分仓> }>()
</script>

<template>
  <section class="比价试算结果" v-prototype="规则标注('price-simulation', '接口总费用比较结果')">
    <div class="比价题头"><h3>{{ result.comparisonMode === 'priceAge' ? '价格与库龄比较' : '接口总费用比较' }}</h3><ElTag type="info" size="small">模拟海外仓接口结果</ElTag></div>
    <p class="比价说明">{{ 比价费用说明 }}</p>
    <ElTable :data="result.ranked" empty-text="暂无有效报价" class="比价结果表">
      <ElTableColumn label="仓库及物流渠道" min-width="220"><template #default="{ row }"><strong>{{ row.route.warehouse }} · {{ row.route.name }}</strong><p>{{ row.route.provider }} · {{ row.route.account }}</p></template></ElTableColumn>
      <ElTableColumn label="接口总费用" min-width="140"><template #default="{ row }"><strong class="比价金额">{{ row.quote.totalAmount }} {{ row.quote.currencyCode }}</strong><p v-if="result.route?.id === row.route.id" class="比价选中">{{ result.comparisonMode === 'priceAge' ? '推荐组合' : '最低费用组合' }}</p></template></ElTableColumn>
      <ElTableColumn v-if="result.exchangeRateSnapshot" label="人民币比较金额" min-width="180"><template #default="{ row }"><strong class="比价金额">{{ row.comparisonAmount ?? '—' }} {{ row.comparisonCurrency ?? '' }}</strong><p v-if="row.exchangeRate">1 {{ row.quote.currencyCode }} = {{ row.exchangeRate }} CNY</p></template></ElTableColumn>
      <ElTableColumn v-if="result.comparisonMode === 'priceAge'" label="比较库龄（天）" min-width="140"><template #default="{ row }"><strong>{{ row.ageDays ?? '—' }}</strong><p v-if="row.ageDetails?.length" :title="row.ageDetails.map((item: { systemSku: string; ageDays: string }) => `${item.systemSku}：${item.ageDays} 天`).join('；')">{{ row.ageDetails.length > 1 ? `${row.ageDetails.length} 个 SKU 库龄合计` : '单 SKU 库龄' }}</p></template></ElTableColumn>
    </ElTable>
    <p v-if="result.exchangeRateSnapshot" class="比价说明">汇率来源：{{ result.exchangeRateSnapshot.source }}；生效时间（北京时间）：{{ 格式化北京时间(result.exchangeRateSnapshot.effectiveAt) }}。本轮统一换算为人民币比较，接口原金额及币种保持不变。</p>
    <p v-if="result.selectionReason" class="比价说明">{{ result.selectionReason }}</p>
    <p v-if="result.comparisonMode === 'priceAge'" class="比价说明">按所选逻辑比较价格与库龄；未取得所需库龄资料时不推荐。多个 SKU 按所选批次口径取值后累加。</p>
    <p v-for="项 in result.skipped" :key="项.route.id" class="比价排除">{{ 项.route.warehouse }} · {{ 项.route.name }}：{{ 项.reason }}，已排除</p>
    <p class="比价说明">报价仅用于本轮只读试算；规则、订单、渠道或汇率变化后须重新试算。真实接口与订单路由尚未接入。</p>
  </section>
</template>

<style scoped>
.比价试算结果{margin:22px 0;padding:18px;border:1px solid var(--yy-border-light);border-radius:4px;min-width:0}.比价题头{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.比价题头 h3{margin:0;color:var(--yy-text-heading);font-size:14px}.比价说明,.比价排除{font-size:12px;line-height:1.9;color:var(--yy-text-secondary);margin:12px 0}.比价结果表 strong{color:var(--yy-text-heading);font-weight:500;overflow-wrap:anywhere}.比价结果表 p{margin:3px 0;font-size:12px;color:var(--yy-text-secondary)}.比价结果表 .比价金额{font-variant-numeric:tabular-nums}.比价结果表 .比价选中{color:var(--yy-success)}
</style>
