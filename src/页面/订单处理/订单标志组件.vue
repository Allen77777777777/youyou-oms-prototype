<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElTooltip } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 合并来源订单标志, 订单标志短释义, type 订单标志, type 订单标志代码 } from './订单标志模型'

const props = defineProps<{ flags: 订单标志[] }>()
const displayed = computed(() => 合并来源订单标志([props.flags]))
const hoverCode = ref<订单标志代码>()
const focusCode = ref<订单标志代码>()
function open(code: 订单标志代码, mode: 'hover' | 'focus') { if (mode === 'hover') hoverCode.value = code; else focusCode.value = code }
function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  hoverCode.value = undefined
  focusCode.value = undefined
  // 只收起标志提示，不拦截详情抽屉等父级的原生 Escape 行为。
}
onMounted(() => document.addEventListener('keydown', closeOnEscape))
onUnmounted(() => document.removeEventListener('keydown', closeOnEscape))
function tooltip(flag: 订单标志) { return 订单标志短释义[flag.code] }
const 标志标注: 原型标注 = {
  id: 'oms.processing.order-flags', 标题: '订单标志展示', 说明: '依据订单标志 PRD 展示退、消、信、言；读取同源本地虚构证据，不代表真实打标、接口或订单规则已实现。',
  分类: '字段', 锚点: 'oms.processing.order-flags', 路由: '/oms/self-fulfillment/processing', 版本: '2026-10-09', 状态: '待评审', 事实等级: '合理假设',
  prd引用: ['PRD/订单标志功能PRD.md#3-显示位置', 'PRD/订单标志功能PRD.md#5-各标志判定条件'],
  数据来源: ['eBay 标准订单的买家留言，及系统订单号、店铺、稳定平台订单 ID 完全匹配的独立虚构专业／消息证据。'],
  系统动作: ['同标志只显示一次，按退、消、信、言、合、拆排序；无命中不显示占位。', '所有来源订单的投影可取并集；提示只显示对应短释义，不显示来源订单号或命中依据；底层来源仍保留，标志不改变审核资格或处理状态。'],
  异常处理: ['证据不可靠、不完整、身份不匹配或同版本冲突不猜测；不解析原因、日志、商品数或包裹数。', '本轮不生成合／拆成功样例；缺失消息证据不等于明确无消息。'],
  验收要点: ['22×22 像素、4 像素间距；鼠标悬停与键盘聚焦只显示 PRD 对应短释义，Esc 关闭。'],
}
</script>

<template>
  <div v-if="displayed.length" v-prototype="标志标注" class="订单标志组" role="group" aria-label="订单标志">
    <ElTooltip v-for="flag in displayed" :key="flag.code" :content="tooltip(flag)" :visible="hoverCode === flag.code || focusCode === flag.code" placement="top" :enterable="false" :persistent="false">
      <button type="button" class="订单标志" :class="`标志-${flag.tone}`" tabindex="0" :aria-label="tooltip(flag)" :data-flag-code="flag.code"
        @mouseenter="open(flag.code, 'hover')" @mouseleave="hoverCode = undefined" @focus="open(flag.code, 'focus')" @blur="focusCode = undefined">{{ flag.text }}</button>
    </ElTooltip>
  </div>
</template>

<style scoped>
.订单标志组[role="group"]{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}.订单标志组 .订单标志{display:inline-flex;box-sizing:border-box;flex:0 0 22px;align-items:center;justify-content:center;width:22px;height:22px;padding:0;margin:0;appearance:none;border:1px solid;border-radius:4px;font-family:inherit;font-size:14px;font-weight:600;line-height:1;cursor:default}.订单标志组 .订单标志.标志-red{color:#c73535;background:#fdebec;border-color:#f4bfc0}.订单标志组 .订单标志.标志-orange{color:#9a5700;background:#fff1d6;border-color:#e9bb62}.订单标志组 .订单标志.标志-blue{color:#2558a8;background:#eaf2ff;border-color:#afc8eb}.订单标志:focus-visible{outline:2px solid #287ad2;outline-offset:2px}
</style>
