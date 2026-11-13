<script setup lang="ts">
import { ref } from 'vue'
import { ElAlert, ElButton, ElMessage, ElMessageBox, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 全渠道订单 } from '../全渠道订单/类型'
import { 执行拆单后分仓, 撤销规则拆分结果 } from '../订单规则/拆单规则会话'
import { 拆单标注 } from '../订单规则/拆单规则标注'
import { 当前版本 } from './演示会话'

const props = defineProps<{ order: 全渠道订单 }>()
const error = ref('')
function 名称(lineId: string) {
  const line = props.order.items.find(row => row.externalLineId === lineId)
  return `${line?.systemItemName || line?.platformItemTitle || lineId} · ${line?.systemSku || line?.platformSku || '—'}`
}
function 分仓() {
  if (!props.order.ruleSplitDraft) return
  const result = 执行拆单后分仓(props.order.systemOrderNo, props.order.ruleSplitDraft.id)
  error.value = result.成功 ? '' : result.信息
  if (result.成功) ElMessage.success(result.信息)
}
async function 撤销() {
  const id = props.order.ruleSplitDraft?.id
  if (!id) return
  const version = 当前版本(props.order.systemOrderNo)
  try { await ElMessageBox.confirm('撤销后可重新试算拆单规则，原订单商品及交易金额保留。', '撤销拆分结果', { confirmButtonText: '确认撤销', cancelButtonText: '取消' }) } catch { return }
  const result = 撤销规则拆分结果(props.order.systemOrderNo, id, version)
  error.value = result.成功 ? '' : result.信息
  if (result.成功) ElMessage.success(result.信息)
}
</script>

<template>
  <section v-if="order.ruleSplitDraft" class="规则待分仓" v-prototype="拆单标注('apply', '待分仓拆分结果')">
    <header><div><h3>拆分结果 <ElTag size="small" type="warning">待分仓</ElTag></h3><p>已形成 {{ order.ruleSplitDraft.packages.length }} 个包裹，逐包分仓完成后继续审单规则及系统默认审单。</p></div><div><ElButton @click="撤销">撤销拆分结果</ElButton><ElButton type="primary" @click="分仓">执行分仓规则</ElButton></div></header>
    <ElAlert v-if="error" :title="error" type="warning" :closable="false" show-icon />
    <ElTable :data="order.ruleSplitDraft.packages" row-key="key" table-layout="fixed">
      <ElTableColumn label="包裹" width="110"><template #default="{ $index }">包裹 {{ $index + 1 }}</template></ElTableColumn>
      <ElTableColumn label="商品 / SKU" min-width="280"><template #default="{ row }"><div v-for="item in row.items" :key="item.externalLineId" class="待分仓商品">{{ 名称(item.externalLineId) }}<b>× {{ item.quantity }}</b></div></template></ElTableColumn>
      <ElTableColumn label="后续处理" min-width="240"><template #default>分仓规则确定本包仓库及物流渠道</template></ElTableColumn>
    </ElTable>
    <p class="待分仓规则">{{ order.ruleSplitDraft.reason }}</p>
  </section>
</template>

<style scoped>
.规则待分仓{border:1px solid var(--yy-border-light);border-radius:5px;margin:18px 0;padding:16px;font-size:12px}.规则待分仓>header{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.规则待分仓 h3{display:flex;align-items:center;gap:10px;margin:0;color:var(--yy-text-heading);font-size:14px}.规则待分仓 p{margin:8px 0 0;line-height:1.7;color:var(--yy-text-secondary)}.规则待分仓 :deep(.el-alert){margin-bottom:12px}.待分仓商品{display:flex;justify-content:space-between;gap:16px;line-height:1.8}.待分仓商品 b{white-space:nowrap;font-weight:500}.待分仓规则{overflow-wrap:anywhere}
</style>
