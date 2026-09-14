<script setup lang="ts">
import { ElRadioButton, ElRadioGroup, ElTooltip } from 'element-plus'
import { 当前eBay时区 } from './时区偏好'
import type { 原型标注 } from '@/类型/标注'

const 标注: 原型标注 = {
  id: 'oms.ebay-order.timezone', 锚点: 'oms.ebay-order.timezone', 路由: '/oms/orders/ebay',
  标题: '北京时区与站点时区', 分类: '交互', 事实等级: '已确认', 版本: '0.7.0', 状态: '待评审',
  说明: '切换 eBay 列表、详情及日期查询的时间口径，保留原始时间不变。',
  prd引用: ['PRD/eBay订单功能PRD.md#EB-03'],
  触发方式: ['点击北京时区或站点时区；列表和详情页签共享本次会话选择。'],
  系统动作: ['按 UTC 瞬间转换显示，日期查询按当前时区的自然日匹配；切换时区后按已提交条件重新计算结果并回到第一页，不提交尚未查询的编辑条件。'],
  成功结果: ['所有时间标明实际 UTC 偏移，夏令时按事件日期计算。'],
  异常处理: ['缺少时间显示“—”；站点时区缺失或多个站点时区冲突时保留来源时间并提示待配置，不猜测查询边界。'],
  数据来源: ['平台原始时间；原型站点 IANA 配置为合理假设，生产字典及默认偏好待确认。'],
  验收要点: ['核对跨日、夏令时、日期筛选、列表详情一致性及未知站点。'],
}
</script>

<template>
  <ElTooltip content="北京时区统一按 UTC+8；站点时区按每笔订单的成交站点配置显示，日期查询同步采用所选时区。" placement="bottom">
    <ElRadioGroup v-model="当前eBay时区" v-prototype="标注" aria-label="eBay时间显示时区" class="时区切换">
      <ElRadioButton value="beijing">北京时区</ElRadioButton>
      <ElRadioButton value="site">站点时区</ElRadioButton>
    </ElRadioGroup>
  </ElTooltip>
</template>

<style scoped>
.时区切换 { flex-shrink: 0; flex-wrap: nowrap; white-space: nowrap; }
.时区切换 :deep(.el-radio-button__inner) { padding-inline: 10px; }
</style>
