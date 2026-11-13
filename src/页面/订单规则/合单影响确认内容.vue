<script setup lang="ts">
import { 自动合单标注 } from '../订单处理/自动合单标注'
defineProps<{ message: string; groups: string[][] }>()
</script>

<template>
  <section v-prototype="自动合单标注('rule-exit-impact', '合单规则退出影响确认')" class="合单影响确认">
    <p>{{ message }}</p>
    <p class="影响汇总">将结束 <strong>{{ groups.length }} 组、{{ groups.reduce((sum, group) => sum + group.length, 0) }} 张订单</strong>的等待。</p>
    <template v-if="groups.length">
      <p>完整组合将继续分仓和审核，包含同组由其他规则筛入的订单；仍须通过发货条件校验，不代表立即发货。</p>
      <details open><summary>受影响订单</summary><ol class="影响名单"><li v-for="(group, index) in groups" :key="group.join('|')"><strong>第 {{ index + 1 }} 组 · {{ group.length }} 单</strong><div>{{ group.join('、') }}</div></li></ol></details>
    </template>
    <p v-else>当前没有需要结束等待的候选组。</p>
  </section>
</template>

<style scoped>
.合单影响确认{line-height:1.7;font-size:13px;min-width:0}.合单影响确认 p{margin:0 0 10px}.影响汇总 strong,summary{color:var(--yy-text-heading)}summary{cursor:pointer;font-weight:500}.影响名单{max-height:220px;overflow:auto;margin:8px 0 0;padding:0;list-style:none}.影响名单 li{padding:8px 10px;background:var(--el-fill-color-light);margin-bottom:6px;border-radius:4px}.影响名单 div{overflow-wrap:anywhere;margin-top:3px}
</style>
