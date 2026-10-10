<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElDialog, ElEmpty, ElOption, ElSelect, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import { 数量定义, 时间文本, type 数量键 } from '../三方仓库存/库存模型'
import type { 作业行 } from './展示工具'
import { 查询订单关联库存, 取得库存查询范围, 关联数量文本, type 关联展示行 } from './库存关联模型'
import { 关联原型标注 } from './关联原型标注'

const props = defineProps<{ modelValue: boolean; row?: 作业行 }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const SourceQuantityColumn = ElTableColumn<关联展示行>
const opened = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const range = computed(() => props.row ? 取得库存查询范围(props.row) : undefined)
const rows = computed(() => props.row ? 查询订单关联库存(props.row) : [])
const selectedLine = ref('')
const 商品选项 = computed(() => props.row?.order.items.map(item => ({ value: item.externalLineId, label: item.systemSku || item.platformSku || '未匹配系统 SKU' })) ?? [])
watch(() => [props.modelValue, props.row?.key], () => { selectedLine.value = 商品选项.value[0]?.value ?? '' }, { immediate: true })
const 展示行 = computed(() => rows.value.filter(row => row.lineId === selectedLine.value))
const 账号范围 = computed(() => [...new Set(range.value?.scopes.map(scope => scope.account))].join('；'))
const 多账号范围 = computed(() => new Set(range.value?.scopes.map(scope => scope.accountId)).size > 1)
const 路由仓库 = computed(() => range.value?.scopes.filter(scope => range.value?.routeScopeIds.includes(scope.id)).map(scope => scope.warehouse).join('；'))
function 数量说明(source: 关联展示行, key: 数量键): string {
  const value = source.inventory?.quantities[key]
  return value == null ? '来源未提供' : value < 0 ? '来源返回负数，需核查；未截为零。' : key === 'available' && source.inventoryReason ? source.inventoryReason : ''
}
</script>

<template>
  <ElDialog v-model="opened" title="仓库库存与库龄" width="min(1760px, 96vw)" append-to-body :close-on-click-modal="false">
    <div v-prototype="关联原型标注.库存" class="库存关联内容">
      <div v-if="row && range" v-prototype="关联原型标注.范围" class="查询范围">
        <strong>{{ row.fulfillment?.fulfillmentOrderNo || row.order.systemOrderNo }}</strong>
        <span class="范围账号">{{ 账号范围 || '候选仓库' }}</span>
        <span v-if="路由仓库" class="路由仓">发货仓：{{ 路由仓库 }}</span>
        <ElTag v-else size="small" type="warning">{{ range.reason || (range.candidates ? '候选仓库（尚未分仓）' : '发货仓待核实') }}</ElTag>
      </div>
      <div v-prototype="关联原型标注.商品" class="商品切换">
        <label>系统 SKU</label>
        <ElSelect v-model="selectedLine" aria-label="库存查询商品" class="商品选择" filterable>
          <ElOption v-for="item in 商品选项" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
        <span>{{ 展示行.filter(source => source.inventory).length }} 条库存记录</span>
        <small>所有时间为北京时间</small>
      </div>
      <p v-if="range?.itemScopeNote" class="范围提醒">{{ range.itemScopeNote }}</p>
      <ElTable :data="展示行" row-key="id" border max-height="520" class="库存关联表">
        <ElTableColumn type="expand" width="42" fixed="left">
          <template #default="{ row: source }">
            <div v-prototype="关联原型标注.批次" class="库龄展开">
              <div class="批次标题"><strong>{{ source.scope?.warehouse || '仓库未确定' }} · 在库批次库龄</strong><span>快照日期：{{ source.aging.snapshotDate || '未取得' }}</span></div>
              <div class="来源身份">来源客户：{{ source.sourceCustomer || '未取得' }}<span>库存批次：{{ source.batchNo || '未取得' }}</span><span>{{ source.mappingText }}</span></div>
              <p>{{ source.aging.reason }}</p>
              <ElTable v-if="source.aging.records.length" :data="source.aging.records" border size="small">
                <ElTableColumn prop="batchNo" label="来源批次" min-width="150" />
                <ElTableColumn prop="consignmentNo" label="入库委托单号" min-width="170" />
                <ElTableColumn label="在库数量（良品）" min-width="140"><template #default="{ row: batch }">{{ batch.quality === '良品' ? batch.onHandQty ?? '—' : '—' }}</template></ElTableColumn>
                <ElTableColumn label="在库数量（不良品）" min-width="150"><template #default="{ row: batch }">{{ batch.quality === '不良品' ? batch.onHandQty ?? '—' : '—' }}</template></ElTableColumn>
                <ElTableColumn prop="unit" label="库存单位" width="90" />
                <ElTableColumn label="库龄天数" min-width="110"><template #default="{ row: batch }">{{ batch.agingDays ?? '—' }}</template></ElTableColumn>
              </ElTable>
              <ElEmpty v-else :description="source.aging.reason" :image-size="50" />
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="仓库名称" width="220" fixed="left">
          <template #default="{ row: source }"><div class="来源单元"><b>{{ source.scope?.warehouse || '范围未确定' }}</b><small v-if="range?.candidates || 多账号范围">{{ source.scope?.account || source.scope?.provider || '—' }}</small><span>{{ source.scope?.country || '—' }}<ElTag v-if="source.routeWarehouse" size="small" type="info">发货仓</ElTag></span></div></template>
        </ElTableColumn>
        <ElTableColumn label="仓库 SKU" width="180"><template #default="{ row: source }"><div v-prototype="关联原型标注.来源" class="来源单元"><b>{{ source.warehouseSku || '未映射' }}</b><small v-if="!source.inventory">{{ source.inventoryReason }}</small><small v-else>{{ source.sourceCustomer || '来源客户未取得' }}</small></div></template></ElTableColumn>
        <ElTableColumn label="质量" width="80"><template #default="{ row: source }">{{ source.quality || '—' }}</template></ElTableColumn>
        <ElTableColumn label="库存单位" width="82"><template #default="{ row: source }">{{ source.unit || '—' }}</template></ElTableColumn>
        <SourceQuantityColumn v-for="d in 数量定义" :key="d.key" :label="d.label" width="96" align="right">
          <template #header><ElTooltip :content="d.definition" placement="top"><span v-prototype="关联原型标注.数量" tabindex="0">{{ d.label }}</span></ElTooltip></template>
          <template #default="{ row: source }"><ElTooltip :content="数量说明(source, d.key)" :disabled="!数量说明(source, d.key)"><span class="数量" :class="{ 数量缺失: source.inventory?.quantities[d.key] == null, 数量异常: (source.inventory?.quantities[d.key] ?? 0) < 0 || (d.key === 'available' && source.availableText === '待核实') }" tabindex="0">{{ 关联数量文本(source, d.key) }}</span></ElTooltip></template>
        </SourceQuantityColumn>
        <ElTableColumn label="最大库龄（在库批次）" width="170"><template #default="{ row: source }"><div v-prototype="关联原型标注.最大库龄" class="来源单元"><ElTooltip :content="source.aging.reason" placement="top"><b tabindex="0" :class="{ 数量异常: source.aging.status === '待核实' }">{{ source.aging.text }}</b></ElTooltip><small>快照：{{ source.aging.snapshotDate || '未取得' }}</small></div></template></ElTableColumn>
        <ElTableColumn label="库存来源时间" width="185"><template #default="{ row: source }"><div v-prototype="关联原型标注.库存时间" class="来源单元"><span>{{ 时间文本(source.sourceAt) }}</span><small>同步：{{ 时间文本(source.updatedAt) }}</small></div></template></ElTableColumn>
        <template #empty><ElEmpty description="暂无订单商品可查询" :image-size="70" /></template>
      </ElTable>
    </div>
    <template #footer><ElButton @click="opened = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.库存关联内容{display:flex;flex-direction:column;gap:12px;min-width:0}.查询范围{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:12px}.查询范围>strong{font-family:Consolas,'Microsoft YaHei',monospace;font-size:14px;overflow-wrap:anywhere}.范围账号{color:var(--yy-text-heading)}.路由仓{margin-left:auto;color:#7b8798}.商品切换{display:flex;align-items:center;gap:10px;font-size:12px}.商品选择{width:250px;flex:none}.商品切换>span,.商品切换>small{color:#7b8798;font-size:12px}.商品切换>small{margin-left:auto}.范围提醒{margin:0;font-size:12px;line-height:1.6;color:#b66b37}.来源单元{display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.来源单元 b{font-weight:500}.来源单元 small{font-size:11px;color:#8792a2}.来源单元 :deep(.el-tag){margin-left:8px}.数量{font-variant-numeric:tabular-nums;font-size:12px}.数量缺失{color:#a0a8b3}.数量异常{color:#b56b3b}.库龄展开{position:sticky;left:0;padding:14px 18px 18px;width:min(1100px, calc(96vw - 110px));box-sizing:border-box}.批次标题{display:flex;gap:18px;font-size:12px;align-items:center}.批次标题>strong{color:var(--yy-text-heading)}.批次标题>span,.来源身份{color:#7e8999;font-size:12px}.来源身份{display:flex;flex-wrap:wrap;gap:18px;margin-top:10px}.库龄展开>p{font-size:12px;line-height:1.6;color:#7e8999}.库存关联表{width:100%}.库存关联表 :deep(td.el-table__cell){vertical-align:top}
</style>
