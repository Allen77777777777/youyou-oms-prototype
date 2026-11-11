<script setup lang="ts">
import { ElButton, ElCheckbox, ElDatePicker, ElTimePicker } from 'element-plus'
import { autoReplyScheduleSummary, defaultAutoReplyConfig, autoReplyWeekdays, type AutoReplyConfig } from './规则模型'

const props = defineProps<{ config: AutoReplyConfig }>()
function dayLabel(day: number) { return autoReplyWeekdays.find(item => item.value === day)?.label ?? '' }
function addPeriod() { props.config.specificPeriods.push({ id: crypto.randomUUID(), start: '', end: '' }) }
function toggleSpecific(enabled: boolean) {
  props.config.specificEnabled = enabled
  if (enabled && !props.config.specificPeriods.length) addPeriod()
}
</script>

<template>
  <div class="service-auto-reply-schedule">
    <p class="service-schedule-help">以下休息时段均使用北京时间。</p>
    <section v-if="config.legacySchedule && !config.legacySchedule.reviewedAt" class="service-schedule-block">
      <p class="service-validation-error">原规则已停用。请核对原配置，并重新设置北京时间休息时段。</p>
      <details><summary>查看原休息时段（{{ config.legacySchedule.timeZone || '时区未记录' }}）</summary><p v-for="line in autoReplyScheduleSummary({ ...defaultAutoReplyConfig(), ...config.legacySchedule })" :key="line">{{ line }}</p></details>
      <ElCheckbox :model-value="config.timeZoneReviewRequired === false" aria-label="已核对北京时间休息时段" @change="config.timeZoneReviewRequired = $event !== true">已核对原配置，并按北京时间重新设置休息时段</ElCheckbox>
    </section>
    <div class="service-schedule-block">
      <div class="service-schedule-heading"><ElCheckbox v-model="config.weeklyEnabled" aria-label="启用每周休息时段">每周休息时段</ElCheckbox><span>每周循环</span></div>
      <div class="service-weekly-schedule" :class="{ 'is-disabled': !config.weeklyEnabled }">
        <div v-for="period in config.weekly" :key="period.day" class="service-weekly-row">
          <ElCheckbox v-model="period.enabled" :disabled="!config.weeklyEnabled" :aria-label="`${dayLabel(period.day)}休息`">{{ dayLabel(period.day) }}</ElCheckbox>
          <ElCheckbox v-model="period.allDay" :disabled="!config.weeklyEnabled || !period.enabled" :aria-label="`${dayLabel(period.day)}全天休息`">全天休息</ElCheckbox>
          <div class="service-weekly-clock"><span v-if="period.allDay" class="service-all-day-text">00:00 ～ 24:00</span><template v-else><ElTimePicker v-model="period.start" format="HH:mm" value-format="HH:mm" :clearable="false" :disabled="!config.weeklyEnabled || !period.enabled" :aria-label="`${dayLabel(period.day)}开始时间`" placeholder="开始时间" /><span>至</span><ElTimePicker v-model="period.end" format="HH:mm" value-format="HH:mm" :clearable="false" :disabled="!config.weeklyEnabled || !period.enabled" :aria-label="`${dayLabel(period.day)}结束时间`" placeholder="结束时间" /><small v-if="config.weeklyEnabled && period.enabled && period.end && period.end < period.start">次日</small></template></div>
        </div>
      </div>
      <p class="service-schedule-help">勾选需要自动回复的日期；结束时间早于开始时间表示延续至次日。</p>
    </div>
    <div class="service-schedule-block">
      <div class="service-schedule-heading"><ElCheckbox :model-value="config.specificEnabled" aria-label="启用特定时间段" @change="toggleSpecific($event === true)">特定时间段</ElCheckbox><span>适用于长假或临时休息</span></div>
      <div v-if="config.specificPeriods.length" class="service-specific-periods">
        <div v-for="(period, index) in config.specificPeriods" :key="period.id" class="service-specific-row">
          <span class="service-period-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <ElDatePicker v-model="period.start" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" :disabled="!config.specificEnabled" :aria-label="`特定时段${index + 1}开始时间`" placeholder="开始日期时间" />
          <span>至</span>
          <ElDatePicker v-model="period.end" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm" :disabled="!config.specificEnabled" :aria-label="`特定时段${index + 1}结束时间`" placeholder="结束日期时间" />
          <ElButton text type="danger" :disabled="!config.specificEnabled" :aria-label="`删除特定时段${index + 1}`" @click="config.specificPeriods.splice(index, 1)">删除</ElButton>
        </div>
      </div>
      <ElButton plain :disabled="!config.specificEnabled" aria-label="添加特定时间段" class="service-add-period" @click="addPeriod">＋ 添加时间段</ElButton>
    </div>
    <p class="service-schedule-help service-schedule-combination">每周休息时段或特定时间段任一命中即生效，至少设置一种有效时段。</p>
  </div>
</template>
