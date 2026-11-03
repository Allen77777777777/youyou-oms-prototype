<script setup lang="ts">
import type { BuyerFeedbackRecord } from './类型'
import { formatReviewTime, getBuyerFeedbackMethod, getBuyerFeedbackResult } from './模型'
defineProps<{ record?: BuyerFeedbackRecord; blockedReason?: string }>()
</script>

<template>
  <div class="review-buyer-summary">
    <template v-if="record">
      <div class="review-buyer-summary-meta"><span :class="['review-leave-result', getBuyerFeedbackResult(record).status]">{{ getBuyerFeedbackResult(record).label }}</span><span v-if="getBuyerFeedbackMethod(record).label !== '—'">{{ getBuyerFeedbackMethod(record).label }}</span><span v-if="getBuyerFeedbackMethod(record).ruleName">规则：{{ getBuyerFeedbackMethod(record).ruleName }}</span></div>
      <template v-if="record.comment"><p class="review-buyer-comment">{{ record.comment.text }}</p><small>{{ record.comment.by }} · {{ formatReviewTime(record.comment.at) }}</small></template>
      <p v-else class="review-muted">{{ blockedReason || getBuyerFeedbackResult(record).reason || '尚未向这位买家提交好评' }}</p>
      <details v-if="record.attempts?.length" class="review-attempt-history" :open="getBuyerFeedbackResult(record).status === 'failed'"><summary>好评提交记录（{{ record.attempts.length }}）</summary><article v-for="attempt in [...record.attempts].reverse()" :key="attempt.id"><strong :class="['review-leave-result', attempt.outcome === 'failed' ? 'failed' : 'succeeded']">{{ attempt.outcome === 'failed' ? '提交失败' : '好评成功' }}</strong><span>{{ formatReviewTime(attempt.at) }} · {{ attempt.by }}</span><p>{{ attempt.message }}</p><blockquote>{{ attempt.text }}</blockquote></article></details>
    </template>
    <p v-else class="review-muted">暂无好评记录</p>
  </div>
</template>
