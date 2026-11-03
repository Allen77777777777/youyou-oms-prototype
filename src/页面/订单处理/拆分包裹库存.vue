<script setup lang="ts">
import { ElEmpty, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 人工发货库存行 } from './拆合发货库存'
import { 展示处理原因 } from './处理提示展示'
import { 时间文本 } from '../三方仓库存/库存模型'
import { 拆合发货标注 } from './拆合发货原型标注'

withDefaults(defineProps<{ rows: readonly 人工发货库存行[]; selected?: boolean; showPackage?: boolean }>(), { selected: true })
function 数量(value: number | null) { return value !== null && Number.isFinite(value) ? value : '—' }
function 库存时间(value: string) { return Number.isFinite(Date.parse(value)) ? 时间文本(value) : '待核实' }
</script>

<template>
  <div v-prototype="拆合发货标注.库存" class="拆分包裹库存">
    <div class="库存标题"><strong>仓库库存</strong><small>同仓本次总需求包含本方案全部包裹</small></div>
    <p v-if="selected === false" class="库存待选">请选择发货仓库后查看库存</p>
    <ElEmpty v-else-if="!rows.length" description="暂未取得库存，请核实后继续" :image-size="38" />
    <ElTable v-else :data="[...rows]" size="small" class="包裹库存表">
      <ElTableColumn v-if="showPackage" label="包裹" width="80"><template #default="{ row }">包裹 {{ row.packageIndex + 1 }}</template></ElTableColumn>
      <ElTableColumn label="系统 SKU / 海外仓 SKU" min-width="210"><template #default="{ row }"><div class="库存商品"><strong>{{ row.systemSku || '—' }}</strong><small>{{ row.warehouseSku || '海外仓 SKU 待核实' }}</small><small v-if="showPackage">{{ row.warehouse || '未选择仓库' }}</small></div></template></ElTableColumn>
      <ElTableColumn label="本包数量" width="90" align="right"><template #default="{ row }">{{ 数量(row.required) }}</template></ElTableColumn>
      <ElTableColumn label="同仓本次总需求" width="138" align="right"><template #default="{ row }">{{ 数量(row.scopeRequired) }}</template></ElTableColumn>
      <ElTableColumn label="可用数量" width="110" align="right"><template #default="{ row }"><span :class="{ 库存不足: row.status === '不足' }">{{ 数量(row.available) }}</span></template></ElTableColumn>
      <ElTableColumn label="库存校验" min-width="225"><template #default="{ row }"><div class="库存校验"><ElTag size="small" :type="row.status === '充足' ? 'success' : row.status === '不足' ? 'danger' : 'warning'">{{ row.status }}</ElTag><span>{{ 展示处理原因(row.reason) || (row.status === '充足' ? '本次需求可满足' : '请核实库存后继续') }}</span><small v-if="row.sourceAt">库存时间（北京时间）：{{ 库存时间(row.sourceAt) }}</small></div></template></ElTableColumn>
    </ElTable>
  </div>
</template>

<style scoped>
.拆分包裹库存{padding:0 14px 12px;min-width:0;max-width:100%}.库存标题{display:flex;align-items:center;gap:13px;padding:2px 0 10px;font-size:12px}.库存标题 strong{color:var(--yy-text-heading);font-size:12px;font-weight:500}.库存标题 small{color:#96a0ae;font-size:11px}.库存待选{margin:0;padding:11px;background:#f8f9fb;border-radius:4px;font-size:12px;color:#8b97a7}.库存商品,.库存校验{display:flex;align-items:flex-start;flex-direction:column;gap:4px;line-height:1.55;overflow-wrap:anywhere}.库存商品 strong{font-size:12px;font-weight:400;color:#44546b}.库存商品 small,.库存校验 small{font-size:11px;color:#9aa4b3}.库存校验>span:not(.el-tag){font-size:11px;color:#77869a}.库存不足{color:#d36349;font-weight:500}.包裹库存表 :deep(th.el-table__cell){background:#f7f9fc;color:var(--yy-text-heading)}.包裹库存表 :deep(.el-table__cell){vertical-align:top}.拆分包裹库存 :deep(.el-empty){padding:12px 0}.拆分包裹库存 :deep(.el-empty__description){margin-top:7px}.拆分包裹库存 :deep(.el-empty__description p){font-size:12px;color:#8996a7}@media(max-width:900px){.库存标题{align-items:flex-start;flex-direction:column;gap:5px}}
</style>
