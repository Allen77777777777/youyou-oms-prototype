<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import type { 全渠道订单, 订单收件处理记录 } from '../全渠道订单/类型'
import type { 原型标注 } from '@/类型/标注'
import { 收件处理状态名称, 收件处理触发名称 } from '../订单规则/收件信息执行'
import { 格式化北京时间 } from './时间展示工具'

const props = defineProps<{ order: 全渠道订单 }>()
const 记录列表 = computed<订单收件处理记录[]>(() => [
  ...[...(props.order.recipientRequestRecords ?? [])].reverse(),
  ...(props.order.recipientProcessing ? [props.order.recipientProcessing] : []),
])
const 字段 = [{ key: 'addressLine1', label: '地址行 1' }, { key: 'addressLine2', label: '地址行 2' }, { key: 'houseNumber', label: '门牌号' }] as const
const 标注: 原型标注 = {
  id: 'oms.recipient.creation-result', 分类: '规则', 标题: '请求提交时冻结的收件信息处理记录',
  说明: '收件规则在对外请求前解析门牌号，原始地址及来源独立门牌不回写；旧创建记录仅作历史展示。',
  锚点: 'oms.recipient.creation-result', 版本: '0.4', 状态: '待评审', 事实等级: '合理假设',
  prd引用: ['PRD/收件信息规则功能PRD.md'],
  交互规则: ['订单创建、规则与拆合试算不执行正式请求，不写本区记录。', '新记录为本地推仓命令已提交的请求快照；准备失败沿原操作结果提示，暂不另建失败准备记录。真实接口、持久化与请求审计未接入。', '运费候选仅接入纯准备契约，物流订单请求链路尚未开放；不能把只读预览当作正式运费或物流请求。', '请求使用当次候选或实际履约路由及原始完整收件资料；多来源分别匹配且完整处理资料一致才可提交。', '每次新请求单独冻结规则、路由与地址前后值；已提交及结果未知请求只查原请求，明确未生效后重提才创建新快照。', '旧创建记录保留历史，不作为新请求输入或当前有效地址；普通日志不记录完整地址。'],
}
</script>

<template>
  <section v-if="记录列表.length" class="收件处理结果" v-prototype="标注">
    <h3>收件信息处理记录</h3>
    <article v-for="(记录, index) in 记录列表" :key="记录.requestId || `history-${index}`" class="请求记录">
    <header><strong>{{ 收件处理触发名称[记录.trigger] }}</strong><ElTag size="small" :type="记录.status === 'parsed' || 记录.status === 'preserved' ? 'success' : 记录.status === 'not_matched' || 记录.status === 'not_applicable' ? 'info' : 'warning'">{{ 收件处理状态名称[记录.status] }}</ElTag></header>
    <p class="处理来源">{{ 格式化北京时间(记录.processedAt) }}<template v-if="记录.ruleName"> · {{ 记录.ruleName }}（v{{ 记录.ruleVersion }}）</template></p>
    <p v-if="记录.trigger === 'order_created'" class="资料变化" role="status">旧版创建时历史记录，仅供追溯，不作为新请求收件资料。</p>
    <p v-else class="处理来源">本次请求快照 · {{ 记录.requestId }}<template v-if="记录.routeSnapshot"> · {{ 记录.routeSnapshot.warehouse }} / {{ 记录.routeSnapshot.shippingChannel }}</template></p>
    <div class="处理对照" role="table" aria-label="收件信息处理前后对照">
      <div class="对照行 对照表头" role="row"><span role="columnheader">字段</span><span role="columnheader">原始资料</span><span role="columnheader">处理结果</span></div>
      <div v-for="项 in 字段" :key="项.key" class="对照行" role="row"><span role="rowheader">{{ 项.label }}</span><span role="cell">{{ 记录.before[项.key] || '—' }}</span><span role="cell" :class="{ 已变化: 记录.before[项.key] !== 记录.after[项.key] }">{{ 记录.after[项.key] || '—' }}</span></div>
    </div>
    <p class="处理原因">{{ 记录.reason }}</p>
    </article>
  </section>
</template>

<style scoped>
.收件处理结果{margin-top:18px;padding-top:16px;border-top:1px solid var(--el-border-color-lighter);min-width:0}
.请求记录{margin-top:12px}.请求记录+.请求记录{padding-top:14px;border-top:1px solid var(--el-border-color-lighter)}
.收件处理结果 header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.收件处理结果 h3{margin:0;font-size:14px;color:var(--yy-text-heading)}
.处理来源,.处理原因{font-size:12px;color:var(--yy-text-secondary);line-height:1.65;overflow-wrap:anywhere;margin:8px 0}
.处理对照{border:1px solid var(--el-border-color-lighter);border-radius:4px;overflow:hidden}.对照行{display:grid;grid-template-columns:82px minmax(0,1fr) minmax(0,1fr);font-size:12px;line-height:1.65}.对照行+ .对照行{border-top:1px solid var(--el-border-color-lighter)}.对照行 span{padding:8px;overflow-wrap:anywhere;white-space:pre-wrap;min-width:0}.对照表头{background:var(--el-fill-color-light);color:var(--yy-text-heading);font-weight:500}.已变化{color:var(--el-color-primary)}.资料变化{font-size:12px;color:var(--el-color-warning-dark-2);background:var(--el-color-warning-light-9);padding:8px 10px;border-radius:4px;line-height:1.6}
</style>
