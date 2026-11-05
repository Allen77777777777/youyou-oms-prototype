<script setup lang="ts">
import { moneyText, type ReturnMoney } from './接口契约'
defineProps<{ value?: ReturnMoney | null }>()
</script>
<template><span class="return-money"><span>{{ moneyText(value) }}</span><small v-if="value?.convertedFromValue || value?.convertedFromCurrency || value?.exchangeRate" class="exchange-source"><span v-if="value.convertedFromValue || value.convertedFromCurrency">换汇来源 {{ [value.convertedFromCurrency, value.convertedFromValue].filter(Boolean).join(' ') }}</span><span v-if="value.exchangeRate">来源汇率 {{ value.exchangeRate }}</span></small></span></template>
<style scoped>.return-money{display:inline-flex;flex-direction:column;gap:4px;min-width:0;overflow-wrap:anywhere;vertical-align:top}.exchange-source{display:flex;flex-direction:column;gap:2px;color:#909399;font-size:11px;font-weight:400;line-height:1.6}</style>
