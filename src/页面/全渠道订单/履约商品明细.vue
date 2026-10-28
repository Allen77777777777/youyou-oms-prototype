<script setup lang="ts">
import type { 履约商品展示 } from './履约商品展示'

defineProps<{ data: 履约商品展示; showSource: boolean }>()
</script>

<template>
  <div class="履约商品列表">
    <div v-for="商品 in data.rows" :key="商品.key" class="履约商品项">
      <strong>{{ 商品.item?.systemItemName || 商品.item?.platformItemTitle || '商品资料待核实' }}</strong>
      <dl>
        <div><dt>系统 SKU</dt><dd>{{ 商品.item?.systemSku || '—' }}</dd></div>
        <div><dt>平台 SKU</dt><dd>{{ 商品.item?.platformSku || '—' }}</dd></div>
        <div v-if="showSource"><dt>来源订单</dt><dd>{{ 商品.orderNo || '—' }}</dd></div>
        <div><dt>平台商品行</dt><dd>{{ 商品.externalLineId || '—' }}</dd></div>
        <div><dt>计划数量</dt><dd class="分配数量">{{ 商品.quantity ?? '—' }}</dd></div>
      </dl>
    </div>
    <p v-if="data.message" class="商品核查提示">{{ data.message }}</p>
  </div>
</template>

<style scoped>
.履约商品列表{display:flex;flex-direction:column;gap:12px;min-width:0}.履约商品项{min-width:0}.履约商品项+.履约商品项{padding-top:10px;border-top:1px solid #edf0f4}.履约商品项>strong{display:block;color:var(--yy-text-heading);font-size:12px;font-weight:500;line-height:1.6;overflow-wrap:anywhere}.履约商品项 dl{margin:6px 0 0;font-size:11px}.履约商品项 dl>div{display:flex;align-items:baseline;gap:7px;line-height:1.65;margin-top:3px;min-width:0}.履约商品项 dt{flex:0 0 60px;color:#8a97a8}.履约商品项 dd{margin:0;min-width:0;color:#41526c;overflow-wrap:anywhere;font-family:Consolas,'Microsoft YaHei',monospace}.履约商品项 .分配数量{font-size:12px;font-variant-numeric:tabular-nums}.商品核查提示{margin:0;color:#8a97a8;font-size:11px;line-height:1.6}
</style>
