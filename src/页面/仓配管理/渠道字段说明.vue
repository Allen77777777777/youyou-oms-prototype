<script setup lang="ts">
import { ref } from 'vue'
import { ElIcon, ElTooltip } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'

defineProps<{ 标题: string; 内容: string }>()
const 提示 = ref<InstanceType<typeof ElTooltip>>()
</script>

<template>
  <span class="字段标题">{{ 标题 }}
    <ElTooltip ref="提示" :content="内容" :trigger="['hover', 'focus']" placement="top" :hide-after="0" :popper-style="{ maxWidth: '300px', lineHeight: '1.7' }">
      <button type="button" class="字段问号" :aria-label="`${标题}说明`" @click="提示?.onOpen($event)" @keydown.esc.stop.prevent="提示?.hide()">
        <ElIcon aria-hidden="true"><QuestionFilled /></ElIcon>
      </button>
    </ElTooltip>
  </span>
</template>

<style scoped>
.字段标题 { display:inline-flex; align-items:center; gap:5px; }
.字段问号 { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; padding:0; border:0; border-radius:3px; background:transparent; color:#9099a6; cursor:help; vertical-align:middle; }
.字段问号:hover,.字段问号:focus-visible { color:#409eff; }
.字段问号:focus-visible { outline:2px solid #409eff; outline-offset:2px; }
.字段问号 .el-icon { font-size:13px; }
</style>
