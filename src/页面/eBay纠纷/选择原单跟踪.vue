<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { 共享订单 } from '../订单处理/演示会话'
import { recordKey } from './模型'
import type { DisputeRecord } from './类型'
import { originalTrackingOptions, type OriginalTracking } from './原单跟踪'

const props = defineProps<{ record: DisputeRecord }>()
const emit = defineEmits<{ pick: [value: OriginalTracking] }>()
const open = ref(false)
const options = computed(() => originalTrackingOptions(props.record, 共享订单.value))
watch(() => recordKey(props.record), () => { open.value = false })
function pick(fulfillmentNo: string, tracking: string) {
  const item = options.value.find(option => option.fulfillmentNo === fulfillmentNo && option.tracking === tracking)
  if (!item) return void ElMessage.warning('原单包裹资料已变化，请重新核对')
  emit('pick', { tracking: item.tracking, ...(item.carrier ? { carrier: item.carrier } : {}),
    ...(item.carrierCode ? { carrierCode: item.carrierCode } : {}),
    ...(item.unsupportedCarrierName ? { unsupportedCarrierName: item.unsupportedCarrierName } : {}) })
  open.value = false
}
</script>
<template>
  <div class="original-tracking-picker">
    <template v-if="options.length">
      <ElButton size="small" plain type="primary" :aria-expanded="open" @click="open = !open">选择原单跟踪</ElButton>
      <ul v-if="open" class="tracking-options" aria-label="本纠纷已发货包裹">
        <li v-for="item in options" :key="item.fulfillmentNo">
          <div class="package-option"><strong>{{ item.tracking }}</strong><span>{{ item.carrier || '承运商待填写' }}</span>
            <small>{{ item.warehouse }} · {{ item.fulfillmentNo }}</small></div>
          <ElButton link type="primary" :aria-label="'选用 ' + item.tracking" @click="pick(item.fulfillmentNo, item.tracking)">选用</ElButton>
        </li>
      </ul>
    </template>
    <small v-else class="tracking-empty">暂无已核实的原单跟踪号，请手动填写。</small>
  </div>
</template>
<style scoped>
.original-tracking-picker{min-width:0;margin:0 0 12px}
.tracking-options{margin:8px 0 0;padding:0 10px;background:#f6f8fb;border:1px solid #e2e7ed;border-radius:4px;list-style:none}
.tracking-options li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0}
.tracking-options li+li{border-top:1px solid #e2e7ed}.package-option{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.package-option strong{color:var(--yy-text-heading);font-size:12px;overflow-wrap:anywhere}
.package-option span,.package-option small,.tracking-empty{font-size:12px;color:#718095;overflow-wrap:anywhere}
.package-option small{flex-basis:100%}
</style>
