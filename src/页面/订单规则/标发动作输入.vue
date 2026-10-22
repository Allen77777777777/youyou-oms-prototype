<script setup lang="ts">
import { computed } from 'vue'
import { ElFormItem, ElRadioGroup, ElRadio, ElAutocomplete, ElAlert } from 'element-plus'
import { 标发基础动作, 标发常用小时数, 标发小时数上限, 读取标发时机, 格式化标发动作, 标发动作说明, 校验标发动作 } from './标发动作'
import type { 订单规则 } from './规则逻辑'

const props = defineProps<{ rule: 订单规则; validate: boolean }>()
const 配置 = computed(() => 读取标发时机(props.rule))
const 错误 = computed(() => props.validate ? 校验标发动作(props.rule) : '')
function 常用时长(query: string, callback: (items: { value: string }[]) => void) {
  callback(标发常用小时数.filter(value => value.startsWith(query.trim())).map(value => ({ value })))
}
</script>

<template>
  <div class="标发动作配置">
    <ElFormItem label="标发动作" required>
      <ElRadioGroup v-model="rule.action" aria-label="标发动作" class="标发基础选项"><ElRadio v-for="动作 in 标发基础动作" :key="动作" :value="动作">{{ 动作 }}</ElRadio></ElRadioGroup>
    </ElFormItem>
    <p v-if="错误" class="标发校验错误" role="alert">{{ 错误 }}</p>
    <ElAlert v-if="!标发基础动作.includes(rule.action)" title="原标发动作需重新选择，请确认本规则的处理方式。" type="warning" :closable="false" />
    <div v-if="rule.action === '仓库发货完成后标发' || rule.action === '物流下单后标发'" class="标发时机面板">
      <span class="时机标题">标发时机</span>
      <ElRadioGroup v-model="配置.timing" aria-label="标发时机" class="标发时机选项">
        <div class="时机行"><ElRadio value="immediate">立即标发</ElRadio></div>
        <div class="时机行"><ElRadio value="delay">延迟标发</ElRadio><div class="时机输入"><ElAutocomplete v-model="配置.delayHours" aria-label="延迟小时数" :disabled="配置.timing !== 'delay'" :fetch-suggestions="常用时长" :debounce="0" maxlength="3" inputmode="numeric" placeholder="输入或选择" clearable><template #default="{ item }">{{ item.value }} 小时</template></ElAutocomplete><span>小时后标发</span></div></div>
        <div class="时机行"><ElRadio value="beforeDeadline">最晚标发时间前</ElRadio><div class="时机输入"><ElAutocomplete v-model="配置.beforeDeadlineHours" aria-label="提前小时数" :disabled="配置.timing !== 'beforeDeadline'" :fetch-suggestions="常用时长" :debounce="0" maxlength="3" inputmode="numeric" placeholder="输入或选择" clearable><template #default="{ item }">{{ item.value }} 小时</template></ElAutocomplete><span>小时标发</span></div></div>
      </ElRadioGroup>
      <p class="时长帮助">可选常用时长，也可输入 1～{{ 标发小时数上限 }} 小时整数。</p>
      <p v-if="配置.timing === 'beforeDeadline'" class="时机帮助">以平台提供的最晚标发时间为准，未取得时暂不安排；不使用最晚发货时间代替。</p>
      <div class="标发时间预览" aria-live="polite"><strong>{{ 格式化标发动作(rule) }}</strong><p>{{ 标发动作说明(rule) }}</p></div>
    </div>
    <p v-else-if="rule.action === '无需标发'" class="无需标发说明">{{ 标发动作说明(rule) }}</p>
  </div>
</template>

<style scoped>
.标发基础选项{display:flex;flex-wrap:wrap;gap:8px 24px}.标发基础选项 .el-radio{margin:0}.标发动作配置 :deep(.el-form-item__label){font-size:12px}.标发动作配置 :deep(.el-radio__label){font-size:13px}.标发时机面板{padding:18px 20px;background:#fafbfc;border:1px solid var(--yy-border-light);border-radius:4px}.时机标题{display:block;color:var(--yy-text-heading);font-size:12px;font-weight:500;margin-bottom:10px}.标发时机选项{display:flex;flex-direction:column;align-items:stretch;gap:10px}.时机行{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;min-height:32px}.时机行>.el-radio{width:158px;margin:0}.时机输入{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--yy-text-regular)}.时机输入 .el-input{width:100px}.时机输入 span{white-space:nowrap}.标发时间预览{background:#f0f4fa;border-radius:3px;margin-top:16px;padding:10px 12px;font-size:12px;line-height:1.8}.标发时间预览 strong{font-weight:500;color:var(--yy-text-heading)}.标发时间预览 p{margin:2px 0 0;color:var(--yy-text-secondary)}.时机帮助,.无需标发说明{font-size:12px;line-height:1.8;color:var(--yy-text-secondary);margin:12px 0 0}.无需标发说明{background:#f5f8fd;padding:12px;margin:0;border-radius:4px}
</style>

<style scoped>
.标发校验错误{margin:0 0 14px;color:var(--yy-danger);font-size:12px;line-height:1.8}
.时机输入 .el-autocomplete{width:144px}.时机输入 :deep(.el-input){width:100%}.时长帮助{font-size:12px;line-height:1.8;color:var(--yy-text-secondary);margin:12px 0 0}
</style>
