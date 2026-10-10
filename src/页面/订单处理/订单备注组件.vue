<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElButton, ElDialog, ElInput, ElMessage } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 获取订单备注, 获取备注作者名称, 追加订单备注, 订单备注字数上限 } from './订单备注模型'

const props = withDefaults(defineProps<{ orderNo: string; mode?: 'list' | 'detail' | 'action' | 'controller' }>(), { mode: 'list' })
const 备注列表 = computed(() => 获取订单备注(props.orderNo))
const 最新备注 = computed(() => 备注列表.value[备注列表.value.length - 1])
const 历史打开 = ref(false)
const 备注打开 = ref(false)
const 草稿 = ref('')
const 校验信息 = ref('')
const 保存中 = ref(false)

const 备注标注: 原型标注 = {
  id: 'oms.processing.local-notes', 标题: '订单级本地备注', 说明: '本地备注使用既有 oms_order_note 纯文本模型；按订单追加历史，与平台买家留言分别展示。列表使用最新备注两行摘要，点击全部条数查看完整历史并可追加；详情仍展示完整历史，所有履约行读取同一订单备注。',
  锚点: 'oms.processing.local-notes', 路由: '/oms/self-fulfillment/processing', 版本: '2026-10-10', 状态: '待评审', 事实等级: '合理假设',
  prd引用: ['PRD/订单单据字段标准.md#65-订单备注-oms_order_note', 'PRD/订单处理功能PRD.md'],
  触发方式: ['点击全部 N 条，打开完整备注历史；按钮可键盘操作，Esc 关闭弹窗。', '点击增加备注，在同一弹窗查看带连续序号的历史全文和操作时间，再输入纯文本保存；历史及醒目序号为用户确认，限高滚动为实现方案，序号仅为展示序号。'],
  系统动作: ['按系统订单号关联，仅追加 note_content、author_id、noted_at 的本地投影；不覆盖原备注，保留文本内部换行。', '紧凑列表摘要使用浅色细色条，仅展示最新备注最多两行和全部条数，不在列表逐条列出作者时间；此折叠展示为本轮合理假设。完整历史弹窗及详情逐条展示正文、作者和时间，全文自然换行、不截断。', '不会自动阻断审核、推仓、发货或修改路由。'],
  异常处理: ['内容去除首尾空白后不能为空；2000 字上限为实现假设，保存按钮防重复点击。', '切换关联订单关闭历史及未保存弹窗并清空草稿，避免把备注写到另一订单。'],
  数据来源: ['当前浏览器会话的虚构备注；尚未连接真实 API、权限、加密存储或持久化审计，刷新恢复初始虚构样例。'],
  权限与审计: ['不将备注正文写入普通订单操作日志；生产权限和受控审计须按既有 S2 规则接入。'],
  验收要点: ['同一订单跨履约行、队列与详情立即共享追加结果；其他订单隔离。', '列表摘要紧凑且有完整历史入口；历史及详情的长文本和原换行完整可读。追加后摘要和条数立即更新，空白及超长内容不保存。'],
}

function 备注时间(时间: string): string {
  const 日期 = new Date(时间)
  if (Number.isNaN(日期.getTime())) return '时间待核实'
  return `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(日期)} UTC+8`
}

function 打开备注() {
  草稿.value = ''; 校验信息.value = ''; 备注打开.value = true
}
defineExpose({ open: 打开备注 })

watch(() => props.orderNo, () => {
  历史打开.value = false; 备注打开.value = false; 草稿.value = ''; 校验信息.value = ''
}, { flush: 'sync' })

async function 保存备注() {
  if (保存中.value || !备注打开.value) return
  保存中.value = true
  const 本次订单号 = props.orderNo
  const 本次草稿 = 草稿.value
  try {
    await nextTick()
    if (!备注打开.value || props.orderNo !== 本次订单号) return
    const 结果 = 追加订单备注(本次订单号, 本次草稿)
    if (!结果.成功) { 校验信息.value = 结果.信息; return }
    备注打开.value = false; 草稿.value = ''; 校验信息.value = ''
    ElMessage.success(结果.信息)
  } finally { 保存中.value = false }
}
</script>

<template>
  <section v-if="mode === 'list' && 最新备注" v-prototype="备注标注" class="本地备注块 备注摘要块">
    <header><strong>本地备注</strong><ElButton link type="primary" :aria-expanded="历史打开" aria-haspopup="dialog" @click="历史打开 = true">全部 {{ 备注列表.length }} 条</ElButton></header>
    <p class="备注摘要">{{ 最新备注.note_content }}</p>
  </section>
  <section v-else-if="mode === 'detail'" v-prototype="备注标注" class="本地备注块 详情备注">
    <header><strong>本地备注</strong><ElButton link type="primary" @click="打开备注">增加备注</ElButton></header>
    <article v-for="(备注, 索引) in 备注列表" :key="`${备注.noted_at}-${索引}`" class="备注项目">
      <p class="备注正文">{{ 备注.note_content }}</p>
      <footer><span>{{ 获取备注作者名称(备注.author_id) }}</span><time :datetime="备注.noted_at">{{ 备注时间(备注.noted_at) }}</time></footer>
    </article>
    <p v-if="!备注列表.length" class="暂无备注">暂无本地备注</p>
  </section>
  <ElButton v-else-if="mode === 'action'" v-prototype="备注标注" link type="primary" @click="打开备注">增加备注</ElButton>

  <ElDialog v-model="历史打开" :title="`本地备注 · 全部 ${备注列表.length} 条`" width="min(700px, 92vw)" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="true">
    <div v-prototype="备注标注" class="备注历史">
      <div class="备注订单"><span>系统订单号</span><strong>{{ orderNo }}</strong></div>
      <div class="完整备注列表">
        <article v-for="(备注, 索引) in 备注列表" :key="`${备注.noted_at}-${索引}`" class="备注项目">
          <p class="备注正文">{{ 备注.note_content }}</p>
          <footer><span>{{ 获取备注作者名称(备注.author_id) }}</span><time :datetime="备注.noted_at">{{ 备注时间(备注.noted_at) }}</time></footer>
        </article>
        <p v-if="!备注列表.length" class="暂无备注">暂无本地备注</p>
      </div>
    </div>
    <template #footer><ElButton @click="历史打开 = false">关闭</ElButton><ElButton type="primary" @click="打开备注">增加备注</ElButton></template>
  </ElDialog>

  <ElDialog v-model="备注打开" title="增加备注" width="min(640px, 92vw)" append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="true">
    <div v-prototype="备注标注" class="备注表单">
      <div class="备注订单"><span>系统订单号</span><strong>{{ orderNo }}</strong></div>
      <section v-if="备注列表.length" class="追加备注历史" aria-label="历史备注">
        <h3>历史备注 <span>共 {{ 备注列表.length }} 条 · 操作时间为北京时间</span></h3>
        <div class="追加历史列表">
          <article v-for="(备注, 索引) in 备注列表" :key="`${备注.noted_at}-${索引}`" class="备注项目">
            <span class="备注序号" :aria-label="`第 ${索引 + 1} 条备注`">{{ 索引 + 1 }}</span>
            <p class="备注正文">{{ 备注.note_content }}</p>
            <footer><span>{{ 获取备注作者名称(备注.author_id) }}</span><time :datetime="备注.noted_at">{{ 备注时间(备注.noted_at) }}</time></footer>
          </article>
        </div>
      </section>
      <ElInput v-model="草稿" type="textarea" :rows="6" :maxlength="订单备注字数上限" show-word-limit placeholder="请输入本地订单备注" aria-label="本地订单备注" @input="校验信息 = ''" />
      <p v-if="校验信息" class="校验信息" role="alert">{{ 校验信息 }}</p>
      <p class="备注说明">备注供内部查看，保存后追加历史，不向平台或仓库发送。</p>
    </div>
    <template #footer><ElButton :disabled="保存中" @click="备注打开 = false">取消</ElButton><ElButton type="primary" :loading="保存中" @click="保存备注">保存备注</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.追加历史列表 .备注项目{position:relative;padding-left:34px;min-height:26px}.备注序号{position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;min-width:24px;height:24px;box-sizing:border-box;padding:0 5px;border-radius:5px;background:#e5efff;color:#2563a6;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.追加历史列表 .备注项目+.备注项目 .备注序号{top:12px}
.追加备注历史{min-width:0;padding:12px;background:#f8fafc;border:1px solid #e8edf3;border-radius:4px}.追加备注历史 h3{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 10px;font-size:13px;color:var(--yy-text-heading)}.追加备注历史 h3 span{font-size:11px;font-weight:400;color:#738197}.追加历史列表{max-height:25vh;overflow-y:auto;padding-right:6px}
.本地备注块{display:block;box-sizing:border-box;min-width:0;max-width:100%}.本地备注块>header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px}.本地备注块>header>strong{font-size:12px;color:var(--yy-text-heading)}.备注摘要块{background:#fbfaf6;border-left:2px solid #d1b176;border-radius:0 3px 3px 0;padding:6px 8px;max-height:75px}.备注摘要块>header{height:16px;margin-bottom:3px}.备注摘要块>header>strong{font-size:10px;font-weight:600}.备注摘要块>header :deep(.el-button){font-size:11px;min-height:16px;height:16px;padding:0}.备注摘要{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:36px;overflow:hidden;margin:0;font-size:12px;line-height:18px;color:#58677b;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.详情备注{margin-top:4px;padding:10px 12px;background:#f8fafc;border-left:2px solid #d9e3ef;border-radius:0 3px 3px 0}.备注项目+.备注项目{border-top:1px solid #e8edf3;margin-top:12px;padding-top:12px}.备注正文{margin:0;color:#47566b;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.备注项目>footer{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px;color:#8995a6;font-size:11px;line-height:1.5}.备注项目 time{overflow-wrap:anywhere}.暂无备注{margin:0;color:#8995a6;font-size:12px}.备注历史{display:flex;flex-direction:column;gap:16px}.完整备注列表{max-height:60vh;overflow-y:auto;padding-right:6px}.备注表单{display:flex;flex-direction:column;gap:12px}.备注订单{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;color:#738197;font-size:12px}.备注订单>strong{font-family:Consolas,'Microsoft YaHei',monospace;color:var(--yy-text-heading);overflow-wrap:anywhere}.备注说明{margin:0;color:#738197;font-size:12px;line-height:1.6}.校验信息{margin:0;color:#c55540;font-size:12px}
</style>
