<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { ElButton } from 'element-plus'
import { useBuyerPageActive } from '@/组件/买家/页面活跃'
import VerificationDialog from './发送核查弹窗.vue'
import { canViewMailVerification, type MailVerificationTarget } from './发送核查'

const props = defineProps<{ targets: readonly MailVerificationTarget[] }>()
const emit = defineEmits<{ resolved: [] }>()
const buyerPageActive = useBuyerPageActive()
const current = shallowRef<MailVerificationTarget>()
const visibleTargets = computed(() => props.targets.filter(canViewMailVerification))
const opened = computed(() => Boolean(buyerPageActive.value && current.value && canViewMailVerification(current.value)))

function open(target: MailVerificationTarget) {
  if (canViewMailVerification(target)) current.value = target
}
</script>

<template>
  <span v-if="visibleTargets.length" class="mail-verification-links">
    <ElButton v-for="target in visibleTargets" :key="JSON.stringify([target.conversation.shopId, target.conversation.id, target.message.id])"
      type="primary" link :title="`查看核查 ${target.message.id}`" @click="open(target)">查看核查</ElButton>
  </span>
  <VerificationDialog v-if="current" :model-value="opened" :conversation="current.conversation" :message="current.message"
    @update:model-value="value => { if (!value) current = undefined }" @resolved="emit('resolved')" />
</template>

<style scoped>
.mail-verification-links{display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px 8px}.mail-verification-links .el-button{margin:0;font-size:12px}
</style>
