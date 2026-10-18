<script setup lang="ts">
import { ref } from 'vue'
import { ElIcon, ElPopover } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { 尺寸帮助, 材积帮助, 叠加换算帮助 } from './尺寸材积模型'
const props = defineProps<{ type: 'dimensions' | 'volume' | 'convert' }>()
const visible = ref(false)
const 标题 = () => props.type === 'dimensions' ? '产品尺寸' : props.type === 'volume' ? '材积范围' : '叠加换算'
</script>

<template>
  <ElPopover v-model:visible="visible" trigger="hover" placement="top-start" :width="type === 'dimensions' ? 900 : 760" :show-after="150" :popper-style="{ maxWidth: 'calc(100vw - 36px)' }">
    <template #reference><button type="button" class="尺寸问号" :aria-label="`${标题()}说明`" @click="visible = true" @focus="visible = true" @keydown.esc.stop.prevent="visible = false"><ElIcon><QuestionFilled /></ElIcon></button></template>
    <div class="尺寸帮助正文" :aria-label="`${标题()}帮助内容`">
      <template v-if="type === 'dimensions'"><section v-for="group in 尺寸帮助" :key="group.title"><strong>{{ group.title }}</strong><p v-for="line in group.lines" :key="line">{{ line }}</p></section></template>
      <p v-else>{{ type === 'volume' ? 材积帮助 : 叠加换算帮助 }}</p>
    </div>
  </ElPopover>
</template>

<style scoped>
.尺寸问号{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;background:none;color:#9ca4af;cursor:help;padding:0;border-radius:3px}.尺寸问号:hover,.尺寸问号:focus-visible{color:var(--yy-primary)}.尺寸问号:focus-visible{outline:1px solid var(--yy-primary)}.尺寸帮助正文{max-height:65vh;overflow:auto;font-size:12px;line-height:1.9;color:var(--yy-text-regular);white-space:pre-line;overflow-wrap:anywhere}.尺寸帮助正文 section+section{margin-top:12px}.尺寸帮助正文 strong{color:var(--yy-text-heading)}.尺寸帮助正文 p{margin:4px 0 4px 20px}.尺寸帮助正文>p{margin:0}
</style>
