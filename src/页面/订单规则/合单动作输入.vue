<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElCheckbox, ElInput, ElInputNumber, ElRadio, ElRadioGroup, ElTag, ElTimePicker, ElTooltip } from 'element-plus'
import { 合单固定条件, 校验合单动作, 校验合单时长输入, type 合单动作配置 } from './合单规则模型'

const props = defineProps<{ config: 合单动作配置; readonly?: boolean; compact?: boolean }>()
const savedQuantity = ref(props.config.maxQuantity ?? 20)
const savedWeight = ref(props.config.maxWeightKg ?? '10')
const quantityEnabled = computed({ get: () => props.config.maxQuantity !== undefined, set: enabled => { if (!enabled && props.config.maxQuantity !== undefined) savedQuantity.value = props.config.maxQuantity; props.config.maxQuantity = enabled ? savedQuantity.value : undefined } })
const weightEnabled = computed({ get: () => props.config.maxWeightKg !== undefined, set: enabled => { if (!enabled && props.config.maxWeightKg !== undefined) savedWeight.value = props.config.maxWeightKg; props.config.maxWeightKg = enabled ? savedWeight.value : undefined } })
// 页面以小时输入；保存与既有等待快照仍沿用分钟，不改历史期限。
const maxWaitHours = computed<number | undefined>({ get: () => Number.isFinite(props.config.maxWaitMinutes) ? props.config.maxWaitMinutes / 60 : undefined, set: value => { props.config.maxWaitMinutes = typeof value === 'number' && Number.isFinite(value) ? value * 60 : NaN } })
const shipByBufferHours = computed<number | undefined>({ get: () => Number.isFinite(props.config.shipByBufferMinutes) ? props.config.shipByBufferMinutes / 60 : undefined, set: value => { props.config.shipByBufferMinutes = typeof value === 'number' && Number.isFinite(value) ? value * 60 : NaN } })
const error = computed(() => 校验合单时长输入(props.config) || 校验合单动作(props.config))
function timeValue(value: string | undefined) { return value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '' }
function setTime(index: number, value: unknown) { props.config.releaseTimes[index] = typeof value === 'string' ? value : '' }
function setReleaseMode(value: unknown) {
  if (value === 'scheduled' && !props.config.releaseTimes.length) props.config.releaseTimes.push('14:00', '18:00')
}
function addTime() {
  for (let offset = 0; offset < 24; offset++) {
    const hour = (offset + 8) % 24
    const time = `${String(hour).padStart(2, '0')}:00`
    if (!props.config.releaseTimes.includes(time)) { props.config.releaseTimes.push(time); return }
  }
}
</script>

<template>
  <div class="merge-action" :class="{ 'is-readonly': readonly, 'is-compact': compact }">
    <section class="merge-section">
      <h4>合单分组</h4>
      <div class="merge-fixed"><ElTag v-for="item in 合单固定条件" :key="item" effect="plain" type="info">{{ item }}</ElTag></div>
      <ElCheckbox v-model="config.groupBySite" :disabled="readonly">同时要求同一订单站点</ElCheckbox>
    </section>

    <section class="merge-section">
      <h4>合并限制</h4>
      <div class="merge-field"><span class="merge-label">每组最多订单数</span><ElInputNumber v-model="config.maxOrders" :min="2" :max="100" :precision="0" controls-position="right" :disabled="readonly" aria-label="每组最多订单数" /><span>单</span></div>
      <div class="merge-field"><ElCheckbox v-model="quantityEnabled" :disabled="readonly" class="merge-limit-label">合并后总件数上限</ElCheckbox><ElInputNumber v-model="config.maxQuantity" :min="1" :max="999999" :precision="0" controls-position="right" :disabled="readonly || !quantityEnabled" aria-label="合并后总件数上限" /><span>件</span></div>
      <div class="merge-field"><ElCheckbox v-model="weightEnabled" :disabled="readonly" class="merge-limit-label">合并后重量上限</ElCheckbox><ElInput v-model="config.maxWeightKg" :disabled="readonly || !weightEnabled" inputmode="decimal" aria-label="合并后重量上限" class="merge-weight" /><span>kg</span></div>
    </section>

    <section class="merge-section">
      <h4>处理模式</h4>
      <ElRadioGroup v-model="config.mode" :disabled="readonly" class="merge-mode-options" aria-label="合单处理模式">
        <ElRadio value="basic" border><span class="mode-title">基础模式</span><span class="mode-description">本轮处理后放单，有无合单伙伴均继续后续流程</span></ElRadio>
        <ElRadio value="advanced" border><span class="mode-title">高级等单</span><span class="mode-description">到达合单节点即入池，满足放单条件即处理</span></ElRadio>
      </ElRadioGroup>
      <p v-if="config.mode === 'basic'" class="merge-help">到达合单节点后登记待本轮处理，按执行周期统一尝试合单；有无合单伙伴均在本轮结束等待，继续分仓与审单。</p>
      <div v-else class="advanced-settings">
        <div class="advanced-fields">
          <div class="merge-field"><span class="merge-label">最长等待时间</span><ElInputNumber v-model="maxWaitHours" :min="0.5" :max="168" :step="0.5" step-strictly :precision="1" controls-position="right" :disabled="readonly" aria-label="最长等待时间" /><span>小时</span></div>
          <div class="merge-field align-start"><span class="merge-label">放单方式</span><ElRadioGroup v-model="config.releaseMode" :disabled="readonly" aria-label="高级放单方式" class="release-options" @change="setReleaseMode">
            <span class="release-option"><ElRadio value="ready">可合即放</ElRadio><ElTooltip content="同组达到设定订单数且满足合并限制即可提前放单；最长等待到期，即使未凑够数量也结束等待，能合则合，不能合则独立放单。" placement="top" :trigger="['hover', 'focus', 'click']"><button type="button" class="release-help" aria-label="可合即放说明" @click.stop>?</button></ElTooltip></span>
            <span class="release-option"><ElRadio value="scheduled">到点集中放单</ElRadio><ElTooltip content="按固定时点集中放单；最长等待或发货时限保护更早到期时，先到先放。" placement="top" :trigger="['hover', 'focus', 'click']"><button type="button" class="release-help" aria-label="到点集中放单说明" @click.stop>?</button></ElTooltip></span>
          </ElRadioGroup></div>
          <div v-if="config.releaseMode === 'ready'" class="merge-field"><span class="merge-label">提前放单条件</span><span>达到</span><ElInputNumber v-model="config.readyOrderCount" :min="2" :max="config.maxOrders" :precision="0" controls-position="right" :disabled="readonly" aria-label="提前放单订单数" /><span>单且符合合并限制</span></div>
          <div class="merge-field align-start"><span class="merge-label">固定放单时间</span><div class="merge-times"><div v-for="(_, index) in config.releaseTimes" :key="index" class="time-row"><ElTimePicker :model-value="timeValue(config.releaseTimes[index])" @update:model-value="setTime(index, $event)" format="HH:mm" value-format="HH:mm" :clearable="false" :disabled="readonly" :aria-label="`固定放单时间 ${index + 1}`" placeholder="请选择时间" /><ElButton v-if="!readonly" link type="danger" :aria-label="`删除放单时间 ${index + 1}`" @click="config.releaseTimes.splice(index, 1)">删除</ElButton></div><ElButton v-if="!readonly" link type="primary" :disabled="config.releaseTimes.length >= 24" @click="addTime">＋ 添加放单时间</ElButton><span v-else-if="!config.releaseTimes.length" class="merge-help">未设置</span></div></div>
        </div>
        <aside class="advanced-description" aria-label="等单与放单说明">
          <div class="description-step">
            <h5>入池与计时</h5>
            <p>完成前置处理、到达合单节点且命中规则后入池。从首次到达节点起计时，新单加入不延长等待。</p>
          </div>
          <div class="description-step">
            <h5>{{ config.releaseMode === 'ready' ? '可合即放 · 满足条件提前放' : '到点集中放单 · 按时点放' }}</h5>
            <p v-if="config.releaseMode === 'ready'">同组达到设定订单数，且符合合并限制，即可提前放单。</p>
            <p v-else>等待固定放单时点，届时统一处理；至少设置一个时点，使用北京时间。</p>
          </div>
          <div class="description-deadline">
            <h5>到期就放，不再等单</h5>
            <p>最长等待到期，<strong>未凑够数量也放单</strong>。符合合并限制的合并放单，无法合并的独立放单。</p>
          </div>
          <p class="description-footnote">固定时点（北京时间）、最长等待、发货时限保护，先到先放。放单后继续分仓与审单，仍须通过发货条件校验。</p>
        </aside>
      </div>
    </section>

    <section class="merge-section">
      <h4>发货时限保护</h4>
      <div class="merge-field"><span class="merge-label">履约预留时间</span><ElInputNumber v-model="shipByBufferHours" :min="0" :max="168" :step="0.5" step-strictly :precision="1" controls-position="right" :disabled="readonly" aria-label="履约预留时间" /><span>小时</span></div>
      <p class="merge-help">按组内最早发货截止时间提前结束等待，预留分仓、审核及仓库履约时间。放单后仍须通过发货条件校验。</p>
    </section>
    <p v-if="error" class="merge-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.merge-action{display:flex;flex-direction:column;gap:20px;min-width:0}.merge-section{min-width:0}.merge-section h4{margin:0 0 12px;color:var(--yy-text-heading);font-size:14px;font-weight:600}.merge-fixed{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.merge-field{display:flex;align-items:center;gap:10px;min-width:0;min-height:36px;margin:9px 0;flex-wrap:wrap}.merge-label,.merge-limit-label{width:145px;flex:0 0 145px}.merge-field :deep(.el-input-number){width:148px}.merge-weight{width:148px}.merge-help{font-size:12px;line-height:1.7;color:var(--el-text-color-secondary);margin:8px 0 0}.merge-mode-options{display:grid;grid-template-columns:1fr;gap:10px;width:100%}.merge-mode-options :deep(.el-radio){margin:0;padding:14px 16px;height:auto;min-height:66px;white-space:normal;align-items:flex-start}.merge-mode-options :deep(.el-radio__input){margin-top:3px}.merge-mode-options :deep(.el-radio__label){white-space:normal;line-height:1.5}.mode-title{font-weight:600;color:var(--yy-text-heading);display:block;font-size:14px}.mode-description{display:block;margin-top:4px;font-size:12px;color:var(--el-text-color-secondary)}.advanced-settings{margin-top:16px;padding:12px 16px;background:var(--el-fill-color-light);border-radius:6px}.indented{margin-left:155px}.align-start{align-items:flex-start}.release-options{gap:16px}.release-options :deep(.el-radio){margin-right:0}.merge-times{flex:1;min-width:180px}.time-row{display:flex;gap:10px;align-items:center;margin-bottom:8px}.time-row :deep(.el-date-editor){width:148px;flex:0 0 148px}.merge-error{margin:0;color:var(--el-color-danger);font-size:12px}.is-readonly :deep(.el-radio.is-bordered.is-checked){border-color:var(--el-border-color)}@media(min-width:1500px){.merge-mode-options{grid-template-columns:1fr 1fr}}@media(max-width:1300px){.merge-label,.merge-limit-label{width:132px;flex-basis:132px}.indented{margin-left:142px}.advanced-settings{padding:10px}}
</style>

<style scoped>
.advanced-settings,.is-compact .advanced-settings{display:flex;align-items:flex-start;flex-wrap:wrap;gap:20px 28px;background:transparent;padding:4px 0 0}
.advanced-fields{flex:1.7 1 500px;min-width:0}
.advanced-description{flex:1 1 300px;min-width:0;padding:0 0 0 22px;border-left:1px solid var(--el-border-color-lighter);font-size:13px;line-height:1.7;color:var(--el-text-color-regular)}
.advanced-description h5{margin:0 0 4px;font-size:13px;font-weight:600;line-height:1.6;color:var(--yy-text-heading)}
.advanced-description p{margin:0}
.description-step{margin-bottom:14px}
.description-deadline{padding:10px 12px;background:var(--el-color-primary-light-9);border-radius:4px}
.description-deadline strong{font-weight:600;color:var(--yy-text-heading)}
.advanced-description .description-footnote{margin-top:12px;font-size:12px;line-height:1.7}
.advanced-fields>.merge-field:first-child{margin-top:0}
.release-options{flex:1;display:flex;align-items:center;flex-wrap:wrap;gap:8px 22px;min-width:0}
.release-option{display:inline-flex;align-items:center;gap:5px;min-height:32px;white-space:nowrap}
.release-help{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px;padding:0;border:1px solid var(--el-text-color-secondary);border-radius:50%;background:transparent;color:var(--el-text-color-secondary);font-size:11px;line-height:1;cursor:help}
.release-help:hover,.release-help:focus-visible{border-color:var(--el-color-primary);color:var(--el-color-primary)}
.release-help:focus-visible{outline:2px solid var(--el-color-primary-light-5);outline-offset:2px}
</style>

<style scoped>
.is-compact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 24px}.is-compact>.merge-section{padding:14px 16px;border:1px solid var(--el-border-color-lighter);border-radius:5px}.is-compact>.merge-section:nth-child(3){grid-column:1/-1;grid-row:1}.is-compact>.merge-section:nth-child(4){grid-column:1/-1}.is-compact .merge-mode-options{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.is-compact .merge-mode-options :deep(.el-radio){min-height:54px;padding:10px 12px}.is-compact .advanced-settings{margin-top:14px}.is-compact .merge-times{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.is-compact .time-row{margin-bottom:0}.is-compact .merge-section h4{margin-bottom:10px}.is-compact .merge-section:nth-child(4)>.merge-field{display:inline-flex;margin-right:18px}.is-compact .merge-section:nth-child(4)>.merge-help{display:inline;font-size:12px}.is-compact>.merge-error{grid-column:1/-1}@media(max-width:1200px){.is-compact .merge-section:nth-child(4)>.merge-help{display:block}.is-compact .merge-label,.is-compact .merge-limit-label{width:132px;flex-basis:132px}}
</style>
