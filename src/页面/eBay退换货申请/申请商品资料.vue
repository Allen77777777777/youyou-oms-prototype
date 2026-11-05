<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import { formatReturnTime, getReturnDetail, returnKey, type ReturnRecord } from './模型'
import { returnItemPictureUrl } from './展示工具'
import ReturnMoney from './金额资料.vue'
import { returnAnnotation as annotation } from './标注'
const props = defineProps<{ row: ReturnRecord; linkedItem?: { platformSku?: string; systemSku?: string; externalLineId?: string } | null }>()
const detail = computed(() => getReturnDetail(props.row))
const hidden = computed(() => detail.value.contentOnHold || detail.value.itemOnHold === true)
const title = computed(() => hidden.value ? '平台已隐藏商品内容' : detail.value.itemTitle || props.row.title || '未提供商品标题')
const picture = computed(() => hidden.value ? '' : returnItemPictureUrl(detail.value.itemPicture))
const visible = ref(false), failed = ref(false)
watch(() => [returnKey(props.row), picture.value], () => { visible.value = false; failed.value = false })
</script>
<template>
  <section v-prototype="annotation('application-item')" class="detail-panel return-item-panel"><h3>本次申请商品</h3>
    <div class="product-card"><button type="button" class="product-image" :disabled="!picture || failed" aria-label="查看申请商品大图" @click="visible = true"><img v-if="picture && !failed" :src="picture" :alt="title" referrerpolicy="no-referrer" @error="failed = true" /><span v-else>{{ hidden ? '已隐藏' : failed ? '图片不可用' : '暂无图片' }}</span></button><div class="product-content"><strong>{{ title }}</strong><p class="quantity">申请数量 {{ detail.quantityConflict ? '待核实' : row.quantity ?? '—' }}</p></div></div>
    <p v-if="detail.quantityConflict" class="read-warning">平台摘要与详情的申请数量不一致，请核实。摘要数量 {{ detail.summaryQuantity ?? '未提供' }}；详情数量 {{ detail.fullQuantity ?? '未提供' }}。</p>
    <dl class="product-fields"><dt>商品价格</dt><dd><ReturnMoney :value="detail.itemPrice" /></dd><dt>成交时间</dt><dd>{{ formatReturnTime(detail.transactionDate, row) }}</dd><dt>平台 SKU</dt><dd>{{ linkedItem?.platformSku || '—' }}</dd><dt>系统 SKU</dt><dd>{{ linkedItem?.systemSku || row.sku || '—' }}</dd><dt>平台订单行 ID</dt><dd>{{ linkedItem?.externalLineId || '—' }}</dd></dl>
    <ElDialog v-model="visible" title="申请商品图片" width="min(1000px, calc(100vw - 48px))" append-to-body destroy-on-close><div class="product-preview"><img v-if="picture && !failed" :src="picture" :alt="title" referrerpolicy="no-referrer" @error="failed = true" /><p v-else>商品图片未能加载，请刷新后重试。</p></div><template #footer><ElButton @click="visible = false">关闭</ElButton></template></ElDialog>
  </section>
</template>
<style scoped>
.detail-panel{border:1px solid #e8ebef;border-radius:5px;padding:14px;margin-bottom:16px;min-width:0;color:#303133;font-size:12px}.detail-panel h3{font-size:14px;margin:0 0 16px;color:var(--yy-text-heading)}.product-card{display:flex;gap:12px;align-items:flex-start;background:#f7f9fb;border:1px solid #e7ecf1;border-radius:4px;padding:12px;min-width:0}.product-image{width:68px;height:68px;flex:none;border:1px solid #e4e7ed;background:#fff;border-radius:4px;padding:0;overflow:hidden;display:grid;place-items:center;cursor:pointer}.product-image:disabled{cursor:default}.product-image img{width:100%;height:100%;object-fit:contain}.product-image span{color:#909399;font-size:11px;padding:5px}.product-image:focus-visible{outline:2px solid #1677ff;outline-offset:3px}.product-content{min-width:0;overflow-wrap:anywhere;line-height:1.7}.product-content strong{font-weight:500;color:var(--yy-text-heading)}.quantity{margin:7px 0 0;color:#909399}.product-fields{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px 8px;margin:16px 0 0;line-height:1.7}.product-fields dt{color:#909399}.product-fields dd{margin:0;overflow-wrap:anywhere}.source-details{border-top:1px solid #ebeef5;margin-top:16px;padding-top:12px}.source-details summary{color:#1677ff;cursor:pointer}.product-preview{display:flex;justify-content:center;align-items:center;min-height:260px;max-height:72vh;overflow:auto;background:#f5f7fa}.product-preview img{max-width:100%;max-height:72vh;object-fit:contain}.product-preview p{font-size:13px;color:#737b87}.read-warning{background:#fff8e9;color:#986618;padding:10px 12px;line-height:1.8;font-size:12px;border-radius:4px}
</style>
