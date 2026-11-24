<script setup lang="ts">
withDefaults(defineProps<{ soldViaAdCampaign?: boolean; title?: string }>(), {
  title: '该商品通过 eBay 广告成交',
})
</script>

<template>
  <small v-if="soldViaAdCampaign === true" class="广告订单标签" :title="title">广告订单</small>
</template>

<style scoped>
.广告订单标签 {
  display: inline-block;
  margin-inline-start: 5px;
  padding: 0 4px;
  border: 1px solid #afc8eb;
  border-radius: 4px;
  color: #2558a8;
  background: #eaf2ff;
  font: 500 11px/14px var(--yy-font-ui, sans-serif);
  vertical-align: baseline;
  white-space: nowrap;
}
</style>
