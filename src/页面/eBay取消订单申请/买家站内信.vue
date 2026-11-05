<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { mailSession, requestBuyerMailNavigation } from '../eBay站内信/会话'
import { formatBuyerMailTime, getBuyerIncomingMail } from './关联站内信'

const props = defineProps<{ shopId: string; buyerId: string; timeZone?: string; formatTime?: (value: string) => string }>()
const router = useRouter()
const expanded = ref(false), expandedBodies = ref<string[]>([])
const messages = computed(() => getBuyerIncomingMail(mailSession.conversations, props.shopId, props.buyerId))
const visibleMessages = computed(() => expanded.value ? messages.value : messages.value.slice(0, 3))
const isLong = (body: string) => body.length > 260 || body.split('\n').length > 5
const bodyOpen = (key: string) => expandedBodies.value.includes(key)
function toggleBody(key: string) { expandedBodies.value = bodyOpen(key) ? expandedBodies.value.filter(item => item !== key) : [...expandedBodies.value, key] }
function openMail(conversationId: string, messageId: string) {
  if (!requestBuyerMailNavigation(props.shopId, props.buyerId, conversationId, messageId)) return void ElMessage.warning('来信关联已变化，请核对来源消息')
  void router.push('/oms/ebay-service/messages')
}
watch(() => [props.shopId, props.buyerId], () => { expanded.value = false; expandedBodies.value = [] })
</script>

<template>
  <section class="cancel-buyer-mail" aria-label="买家站内信">
    <header class="buyer-mail-heading"><h3>买家站内信 <span>{{ messages.length }}</span></h3><span class="mail-scope">本店该买家的来信</span></header>
    <div v-if="!messages.length" class="buyer-mail-empty">暂无该买家在本店的站内信</div>
    <div v-else class="buyer-mail-list">
      <article v-for="message in visibleMessages" :key="message.key" class="buyer-mail-card" :data-message-id="message.messageId">
        <header class="buyer-mail-card-heading"><strong><button type="button" class="buyer-mail-link" @click="openMail(message.conversationId, message.messageId)">{{ message.subject || '无主题' }}</button></strong><time :datetime="message.at" :title="formatTime ? undefined : timeZone || '站点时区待配置'">{{ formatTime ? formatTime(message.at) : formatBuyerMailTime(message.at, timeZone) }}</time></header>
        <div class="buyer-mail-source">来源会话：{{ message.conversationId }}</div>
        <p class="buyer-mail-body" :class="{ collapsed: isLong(message.bodyText) && !bodyOpen(message.key) }">{{ message.bodyText || '暂无正文' }}</p>
        <button type="button" class="buyer-mail-link" :aria-label="`查看站内信 ${message.messageId}`" @click="openMail(message.conversationId, message.messageId)">查看站内信</button>
        <button v-if="isLong(message.bodyText)" type="button" class="buyer-mail-link" :aria-expanded="bodyOpen(message.key)" @click="toggleBody(message.key)">{{ bodyOpen(message.key) ? '收起正文' : '展开正文' }}</button>
        <div v-if="message.attachmentNames.length" class="buyer-mail-attachments"><span>附件：</span><span v-for="(name, index) in message.attachmentNames" :key="index" class="buyer-mail-attachment">{{ name }}</span></div>
      </article>
      <button v-if="messages.length > 3" type="button" class="buyer-mail-toggle" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起至最近 3 封' : `展开全部 ${messages.length} 封来信` }}</button>
    </div>
  </section>
</template>

<style scoped>
.cancel-buyer-mail{min-width:0;font-size:12px;color:#354154}.buyer-mail-heading{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:12px}.buyer-mail-heading h3{margin:0;color:var(--yy-text-heading);font-size:14px;font-weight:600}.buyer-mail-heading h3 span{display:inline-block;min-width:15px;padding:1px 5px;margin-left:5px;background:#edf2f8;border-radius:8px;color:#68819c;font-size:11px;font-weight:400;text-align:center}.mail-scope{color:#8a96a5;white-space:nowrap}.buyer-mail-empty{padding:22px 12px;border:1px dashed #e1e7ef;background:#fafbfd;text-align:center;color:#8b97a7;border-radius:5px}.buyer-mail-list{display:flex;flex-direction:column;gap:10px}.buyer-mail-card{background:#f8fafc;border:1px solid #e6ecf2;border-radius:5px;padding:13px 15px;min-width:0}.buyer-mail-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}.buyer-mail-card-heading strong{color:var(--yy-text-heading);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.buyer-mail-card-heading time{flex:none;color:#8793a2;font-size:11px;line-height:1.8}.buyer-mail-source{margin-top:4px;font-size:11px;color:#8995a4;overflow-wrap:anywhere}.buyer-mail-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;margin:9px 0 0;font-size:12px;color:#48576a}.buyer-mail-body.collapsed{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden;max-height:9.25em}.buyer-mail-link,.buyer-mail-toggle{border:0;background:none;color:#337cc2;padding:0;cursor:pointer;font-size:12px}.buyer-mail-link{margin-top:6px}.buyer-mail-toggle{align-self:center;padding:5px 12px}.buyer-mail-attachments{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center;color:#8390a1}.buyer-mail-attachment{display:inline-block;max-width:100%;overflow-wrap:anywhere;padding:3px 7px;background:#eef2f7;color:#65788e;border-radius:3px}@media(max-width:1100px){.buyer-mail-card-heading{flex-wrap:wrap;gap:3px}.buyer-mail-card-heading time{flex-basis:100%}}
</style>
