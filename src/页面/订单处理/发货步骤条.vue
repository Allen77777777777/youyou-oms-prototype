<script setup lang="ts">
import { Check, ArrowRight } from '@element-plus/icons-vue'
import { ElIcon } from 'element-plus'

defineProps<{ active: number; titles: readonly string[]; note?: string }>()
</script>

<template>
  <nav class="发货步骤条" aria-label="发货安排步骤">
    <ol class="步骤列表">
      <li v-for="(title, index) in titles" :key="title" :class="{ 当前: index === active, 完成: index < active }" :aria-current="index === active ? 'step' : undefined">
        <div class="步骤内容"><span class="步骤编号" aria-hidden="true"><ElIcon v-if="index < active"><Check /></ElIcon><template v-else>{{ index + 1 }}</template></span><div class="步骤文字"><strong>{{ title }}</strong><small v-if="index === active">当前步骤</small><small v-else-if="index < active">已完成</small><small v-else>待进行</small></div></div>
        <ElIcon v-if="index < titles.length - 1" class="步骤箭头" aria-hidden="true"><ArrowRight /></ElIcon>
      </li>
    </ol>
    <div class="步骤附加"><span class="步骤进度">第 {{ active + 1 }} / {{ titles.length }} 步</span><span v-if="note" class="步骤提示">{{ note }}</span></div>
  </nav>
</template>

<style scoped>
.发货步骤条{display:flex;align-items:center;gap:20px;padding:10px 14px;background:#f7f9fc;border:1px solid #edf0f4;border-radius:5px;min-width:0}.步骤列表{display:flex;align-items:stretch;flex:1;gap:12px;list-style:none;padding:0;margin:0;min-width:0}.步骤列表>li{display:flex;align-items:center;gap:12px;flex:1;min-width:0}.步骤内容{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:8px 12px;border:1px solid transparent;border-radius:5px}.当前 .步骤内容{background:#edf8f1;border-color:#c7e9d4}.步骤编号{display:flex;align-items:center;justify-content:center;flex:0 0 26px;width:26px;height:26px;border:1px solid #d9e1e9;border-radius:50%;font-size:13px;font-weight:600;color:#8c9aab;background:#fff}.当前 .步骤编号{background:#259b61;border-color:#259b61;color:#fff;box-shadow:0 0 0 3px #ddf2e6}.完成 .步骤编号{color:#259b61;border-color:#93d3b0;background:#f1faf5}.步骤文字{display:flex;flex-direction:column;gap:4px;line-height:1.35;min-width:0}.步骤文字 strong{color:var(--yy-text-heading);font-size:12px;font-weight:500;overflow-wrap:anywhere}.步骤文字 small{font-size:10px;color:#97a3b3}.当前 .步骤文字 small,.完成 .步骤文字 small{color:#259b61}.当前 .步骤文字 strong{font-weight:600}.步骤箭头{flex-shrink:0;color:#c4cdd8;font-size:16px}.完成>.步骤箭头,.当前>.步骤箭头{color:#36a46e}.步骤附加{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}.步骤进度{font-size:12px;font-weight:500;color:#238956;white-space:nowrap}.步骤提示{font-size:11px;color:#8a97a8;white-space:nowrap}@media(max-width:900px){.发货步骤条{gap:10px;padding:8px 10px}.步骤列表{gap:6px}.步骤内容{gap:8px;padding:7px 8px}.步骤列表>li{gap:6px}.步骤提示{display:none}}@media(max-width:650px){.步骤附加{display:none}.步骤文字 strong{font-size:11px}.步骤编号{width:23px;height:23px;flex-basis:23px}}
</style>
