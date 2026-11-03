<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElAlert, ElButton, ElInput } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { 人工发货方案, 全渠道订单 } from '../全渠道订单/类型'
import { 读取包裹分配数量, 更新拆分包裹数量, 添加拆分包裹, 删除拆分包裹, 拆分包裹统计 } from './拆分包裹分配'

const props = defineProps<{ plan: 人工发货方案; order: 全渠道订单 }>()
const emit = defineEmits<{ changed: [] }>()
const 操作错误 = ref('')
const 输入文本 = ref<Record<string, Record<string, string>>>({})
const 商品行 = computed(() => props.order.items)
const 统计 = computed(() => props.plan.packages.map(parcel => 拆分包裹统计(props.plan, props.order, parcel.key)))
function 数量(key: string, lineId: string) { return 读取包裹分配数量(props.plan, key, props.order.systemOrderNo, lineId) }
function 显示输入(key: string, lineId: string) {
  const parcelInput = 输入文本.value[key]
  if (parcelInput && Object.prototype.hasOwnProperty.call(parcelInput, lineId)) return parcelInput[lineId] || ''
  const value = 数量(key, lineId)
  return Number.isFinite(value) && value !== 0 ? String(value) : ''
}
function 输入数量(key: string, lineId: string, value: string | number | undefined | null) {
  const text = String(value ?? '')
  if (!输入文本.value[key]) 输入文本.value[key] = {}
  输入文本.value[key]![lineId] = text
  更新拆分包裹数量(props.plan, props.order, key, lineId, text.trim() ? Number(text) : undefined)
  操作错误.value = ''; emit('changed')
}
function 添加() {
  const result = 添加拆分包裹(props.plan, props.order)
  操作错误.value = result.成功 ? '' : result.信息
  if (result.成功) emit('changed')
}
function 删除(key: string) {
  const result = 删除拆分包裹(props.plan, props.order, key)
  操作错误.value = result.成功 ? '' : result.信息
  if (result.成功) { delete 输入文本.value[key]; emit('changed') }
}
function 展示数量(value: number) { return Number.isFinite(value) ? value : '—' }
watch(() => props.plan.id, () => { 输入文本.value = {} })
</script>

<template>
  <div class="拆分矩阵区">
    <header class="矩阵工具栏"><div><h3>拆分包裹</h3><span>包裹 1 保留剩余数量，在其他包裹中填写要拆出的数量。</span></div><ElButton :icon="Plus" size="small" @click="添加">添加包裹</ElButton></header>
    <ElAlert v-if="操作错误" :title="操作错误" type="warning" :closable="false" show-icon />
    <div class="矩阵横滚" tabindex="0" aria-label="商品与包裹数量分配表，可横向滚动">
      <table class="包裹矩阵" :style="{ minWidth: `${720 + plan.packages.length * 150}px` }">
        <colgroup><col class="平台商品列宽" /><col class="本地商品列宽" /><col class="数量列宽" /><col class="数量列宽" /><col v-for="parcel in plan.packages" :key="parcel.key" class="包裹列宽" /></colgroup>
        <thead><tr><th class="商品固定列">平台商品</th><th class="本地商品表头">本地商品</th><th>下单数量</th><th>可发数量</th><th v-for="(parcel, index) in plan.packages" :key="parcel.key" :class="{ 首包列: index === 0 }"><div class="包裹列标题"><strong>包裹 {{ index + 1 }}</strong><span v-if="index === 0" class="余量标签">剩余数量</span><ElButton v-else text size="small" :icon="Delete" :disabled="plan.packages.length <= 2" :aria-label="`删除包裹 ${index + 1}`" @click="删除(parcel.key)" /></div></th></tr></thead>
        <tbody><tr v-for="(item, rowIndex) in 商品行" :key="JSON.stringify([order.systemOrderNo, item.externalLineId])"><td class="商品固定列"><div class="矩阵商品"><div class="商品缩略图"><img v-if="item.itemImageUrl" :src="item.itemImageUrl" alt="" /><span v-else>{{ rowIndex + 1 }}</span></div><div><strong>{{ item.platformItemTitle || '—' }}</strong><span>{{ item.platformSku || '—' }}</span><small>平台商品行：{{ item.externalLineId }}</small></div></div></td><td class="本地商品格"><strong>{{ item.systemItemName || '—' }}</strong><span>{{ item.systemSku || 'SKU 待核实' }}</span></td><td class="原数量">{{ item.orderedQuantity }}</td><td class="原数量">{{ item.fulfillableQuantity ?? '待核实' }}</td><td v-for="(parcel, index) in plan.packages" :key="parcel.key" :class="{ 首包列: index === 0, 分配异常: 数量(parcel.key, item.externalLineId) < 0 || !Number.isFinite(数量(parcel.key, item.externalLineId)) }"><span v-if="index === 0" class="首包余量" :aria-label="`包裹 1 商品 ${item.externalLineId} 剩余数量`">{{ 展示数量(数量(parcel.key, item.externalLineId)) }}</span><ElInput v-else :model-value="显示输入(parcel.key, item.externalLineId)" inputmode="numeric" size="small" placeholder="0" class="拆分数量输入" :aria-label="`包裹 ${index + 1} 商品 ${item.externalLineId} 数量`" @update:model-value="输入数量(parcel.key, item.externalLineId, $event)" /></td></tr></tbody>
        <tfoot><tr class="包裹统计 总数量统计"><th colspan="4">商品总数量</th><td v-for="(parcel, index) in plan.packages" :key="parcel.key" :data-package-key="parcel.key"><strong>{{ 展示数量(统计[index]!.quantity) }}</strong><span> 件</span></td></tr><tr class="包裹统计 SKU统计"><th colspan="4">SKU 种类数</th><td v-for="(parcel, index) in plan.packages" :key="parcel.key" :data-package-key="parcel.key"><strong>{{ 统计[index]!.skuCount }}</strong><span> 种</span></td></tr></tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.拆分矩阵区{display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;color:var(--yy-text-heading)}
.矩阵工具栏{display:flex;justify-content:space-between;align-items:center;gap:16px}.矩阵工具栏>div{display:flex;align-items:center;gap:14px;min-width:0}.矩阵工具栏 h3{margin:0;color:var(--yy-text-heading);font-size:13px;white-space:nowrap;font-weight:600}.矩阵工具栏>div>span{font-size:12px;line-height:1.6;color:#8a94a3}
.矩阵横滚{width:100%;max-width:100%;overflow-x:auto;border:1px solid #e4e7ed;border-radius:4px;box-sizing:border-box}.矩阵横滚:focus-visible{outline:2px solid #409eff;outline-offset:2px}
.包裹矩阵{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;font-size:12px}.平台商品列宽{width:300px}.本地商品列宽{width:240px}.数量列宽{width:90px}.包裹列宽{width:150px}
.包裹矩阵 th,.包裹矩阵 td{padding:13px 12px;line-height:1.5;box-sizing:border-box;text-align:center;border-right:1px solid #e8ebf0;border-bottom:1px solid #e8ebf0;vertical-align:middle}.包裹矩阵 tr>:last-child{border-right:0}.包裹矩阵 thead th{height:49px;background:#f6f7f9;color:var(--yy-text-heading);font-weight:500}
.包裹矩阵 .商品固定列{position:sticky;left:0;text-align:left;background:#fff;z-index:1}.包裹矩阵 thead .商品固定列{background:#f6f7f9;z-index:2}.包裹矩阵 .首包列{background:#f8f9fb}.本地商品表头{text-align:left!important}
.包裹列标题{display:flex;justify-content:center;align-items:center;gap:8px;min-height:24px;white-space:nowrap}.包裹列标题 strong{font-size:12px;font-weight:500;color:var(--yy-text-heading)}.包裹列标题>.el-button{padding:3px;height:22px;color:#9ca5b2}.包裹列标题>.el-button:not(:disabled):hover{color:#f56c6c}.余量标签{font-size:10px;color:#919baa;background:#edf0f4;padding:2px 5px;border-radius:3px;font-weight:400}
.矩阵商品{display:flex;gap:10px;align-items:center;min-width:0}.商品缩略图{width:38px;height:38px;flex-shrink:0;border:1px solid #edf0f4;background:#fafbfc;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#a8b0bd;font-size:12px}.商品缩略图 img{width:100%;height:100%;object-fit:contain}.矩阵商品>div:last-child{display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere}.矩阵商品 strong{font-size:12px;color:#303744;font-weight:400;line-height:1.55}.矩阵商品 span{color:#62738a;font-size:11px}.矩阵商品 small{color:#9ba5b3;font-size:10px}
.本地商品格{text-align:left!important;overflow-wrap:anywhere}.本地商品格 strong,.本地商品格 span{display:block;font-size:12px;font-weight:400;line-height:1.6}.本地商品格 strong{color:#303744}.本地商品格 span{margin-top:4px;color:#62738a;font-size:11px}
.原数量{color:#69778b}.首包余量{font-variant-numeric:tabular-nums;color:#505d6f}.分配异常 .首包余量{color:#e66b50;font-weight:600}.拆分数量输入{width:102px;max-width:100%}.拆分数量输入 :deep(.el-input__inner){text-align:center;font-variant-numeric:tabular-nums}
.包裹矩阵 tfoot th{padding-left:15px;text-align:left;font-weight:400;color:var(--yy-text-heading);background:#fafbfc}.包裹矩阵 tfoot td{background:#fafbfc;font-variant-numeric:tabular-nums;color:#596a81}.包裹矩阵 tfoot strong{font-weight:500;color:var(--yy-text-heading)}.包裹矩阵 tfoot span{font-size:11px;color:#9aa4b3}
@media(max-width:900px){.矩阵工具栏>div{align-items:flex-start;flex-direction:column;gap:5px}}@media(max-width:620px){.矩阵商品{gap:6px}.商品缩略图{display:none}}
</style>
