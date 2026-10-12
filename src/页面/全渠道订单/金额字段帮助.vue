<script setup lang="ts">
import { ref } from 'vue'
import { ElIcon, ElTooltip } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'

defineProps<{ label: string; description: string }>()
const 提示 = ref<InstanceType<typeof ElTooltip>>()
</script>

<template>
  <ElTooltip ref="提示" :trigger="['hover', 'focus']" placement="top" :hide-after="0" :popper-style="{ maxWidth: '320px', lineHeight: '1.7' }">
    <template #content>
      <div>{{ description }}</div>
      <div class="金额显示说明">“—”表示暂无该项金额信息；0 表示该项金额为零。</div>
    </template>
    <button type="button" class="金额字段问号" :aria-label="`${label}说明`" @click.stop="提示?.onOpen($event)" @dblclick.stop @keydown.esc.stop.prevent="提示?.hide()">
      <ElIcon aria-hidden="true"><QuestionFilled /></ElIcon>
    </button>
  </ElTooltip>
</template>

<style scoped>
.金额字段问号{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:16px;height:16px;margin-left:2px;padding:0;border:0;border-radius:3px;background:transparent;color:#9099a6;cursor:help;flex-shrink:0}
.金额字段问号 .el-icon{font-size:12px}
.金额字段问号:hover,.金额字段问号:focus-visible{color:#409eff}
.金额字段问号:focus-visible{outline:2px solid #409eff;outline-offset:2px}
.金额显示说明{margin-top:6px;font-size:11px;opacity:.8}
</style>
