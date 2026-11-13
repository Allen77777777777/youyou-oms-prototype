<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, ElTag } from 'element-plus'
import { 解析门牌号, 门牌解析状态名称, type 收件信息动作配置, type 门牌解析结果 } from './收件信息规则模型'
import { 收件信息标注 } from './收件信息规则标注'

const props = defineProps<{ rule: { name?: string; recipientAction?: 收件信息动作配置 } }>()
// 本地合成地址，不关联任何真实收件人。
const input = reactive({ addressLine1: 'Rue du Christ 712', addressLine2: '', houseNumber: '' })
const result = ref<门牌解析结果>()
watch(() => JSON.stringify([input, props.rule.recipientAction]), () => { result.value = undefined })
const tone = computed(() => result.value?.status === 'parsed' || result.value?.status === 'preserved' ? 'success' : result.value?.status === 'invalid_config' ? 'error' : 'warning')
const rows = computed(() => result.value ? [
  { label: '地址 1', before: result.value.before.addressLine1, after: result.value.after.addressLine1 },
  { label: '地址 2', before: result.value.before.addressLine2, after: result.value.after.addressLine2 },
  { label: '独立门牌号', before: result.value.before.houseNumber, after: result.value.after.houseNumber },
] : [])
function 试算() { result.value = 解析门牌号(input, props.rule.recipientAction) }
function 示例(kind: 'method' | 'multiple' | 'existing' | 'compound') {
  const method = props.rule.recipientAction?.method
  const line = kind === 'multiple' ? 'Rue 12 Christ 712' : kind === 'compound' ? 'Rue du Christ 12A-14B' : method === 'leadingNumber' ? '712, Rue du Christ' : method === 'firstDigits' ? 'Rue du 712 Christ' : 'Rue du Christ 712'
  Object.assign(input, { addressLine1: line, addressLine2: '', houseNumber: kind === 'existing' ? '712' : '' })
}
</script>

<template>
  <section class="门牌动作试算" v-prototype="收件信息标注('action-preview', '门牌解析处理前后试算')">
    <div class="门牌试算标题"><h3>解析试算</h3><ElTag size="small" type="info">当前动作</ElTag></div>
    <p class="门牌试算说明">输入地址检查当前解析方式，仅预览处理结果，不判断规则条件，也不保存到订单。</p>
    <div class="门牌快捷样本"><span>填入示例</span><ElButton link type="primary" @click="示例('method')">当前方式示例</ElButton><ElButton link type="primary" @click="示例('multiple')">多组数字</ElButton><ElButton link type="primary" @click="示例('compound')">字母及连字符</ElButton><ElButton link type="primary" @click="示例('existing')">已有门牌</ElButton></div>
    <ElForm label-position="top" class="门牌样本表单">
      <ElFormItem label="地址 1"><ElInput v-model="input.addressLine1" aria-label="试算地址1" maxlength="300" placeholder="填写原始地址 1" /></ElFormItem>
      <ElFormItem label="地址 2"><ElInput v-model="input.addressLine2" aria-label="试算地址2" maxlength="300" placeholder="选填，填写原始地址 2" /></ElFormItem>
      <ElFormItem label="来源独立门牌号"><ElInput v-model="input.houseNumber" aria-label="试算来源门牌号" maxlength="100" placeholder="选填，已有值时保留" /></ElFormItem>
    </ElForm>
    <ElButton type="primary" plain @click="试算">解析试算</ElButton>
    <div v-if="result" class="门牌试算结果" aria-live="polite">
      <ElAlert :title="门牌解析状态名称[result.status]" :description="result.reason" :type="tone" show-icon :closable="false" />
      <table class="门牌前后对照"><thead><tr><th>字段</th><th>原始资料</th><th>处理结果</th></tr></thead><tbody><tr v-for="row in rows" :key="row.label"><th>{{ row.label }}</th><td>{{ row.before || '—' }}</td><td :class="{ '门牌值变化': row.before !== row.after }">{{ row.after || '—' }}</td></tr></tbody></table>
    </div>
  </section>
</template>

<style scoped>
.门牌动作试算 { border:1px solid var(--el-border-color-lighter); border-radius:4px; padding:18px; margin-top:20px; min-width:0; }
.门牌试算标题 { display:flex; align-items:center; gap:10px; }.门牌试算标题 h3 { margin:0; font-size:14px; color:var(--yy-text-heading); }
.门牌试算说明 { font-size:12px; line-height:1.6; color:var(--el-text-color-secondary); margin:8px 0 10px; }
.门牌快捷样本 { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; font-size:12px; margin-bottom:14px; color:var(--el-text-color-secondary); }
.门牌快捷样本 :deep(.el-button+.el-button) { margin-left:0; }
.门牌样本表单 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0 16px; }
.门牌样本表单 :deep(.el-form-item:last-child) { max-width:260px; }
.门牌试算结果 { margin-top:16px; }.门牌前后对照 { width:100%; border-collapse:collapse; margin-top:12px; table-layout:fixed; font-size:12px; }
.门牌前后对照 th,.门牌前后对照 td { border:1px solid var(--el-border-color-lighter); padding:10px 12px; text-align:left; overflow-wrap:anywhere; line-height:1.6; white-space:pre-wrap; }
.门牌前后对照 th { color:var(--yy-text-heading); background:var(--el-fill-color-light); font-weight:500; }.门牌前后对照 th:first-child { width:90px; }.门牌值变化 { background:var(--el-color-primary-light-9); color:var(--el-color-primary); }
@media(max-width:1350px) { .门牌样本表单 { grid-template-columns:minmax(0,1fr); }.门牌样本表单 :deep(.el-form-item:last-child) { max-width:none; } }
</style>
