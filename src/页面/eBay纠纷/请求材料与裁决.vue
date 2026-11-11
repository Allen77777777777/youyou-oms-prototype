<script setup lang="ts">
import { computed } from 'vue'
import NumberCopy from '@/组件/单号复制.vue'
import { dateText, type DisputeRecord } from './模型'
import { disputeAnnotations } from './标注'
import './平台资料阅读.css'

const props = defineProps<{ record: DisputeRecord }>()
const materialGroups = computed(() => {
  const requests = props.record.inquiry?.requestedInfo || []
  const submissions = props.record.inquiry?.providedInfo || []
  const kinds = new Set([...requests, ...submissions].map(entry => entry.kind))
  return Array.from(kinds, kind => ({
    kind,
    requests: requests.filter(entry => entry.kind === kind).sort((a, b) => b.at.localeCompare(a.at)),
    submissions: submissions.filter(entry => entry.kind === kind).sort((a, b) => b.at.localeCompare(a.at)),
  }))
})
const decisions = computed(() => {
  const info = props.record.caseInfo
  return [...(info?.decisions || [])].sort((a, b) => {
    if (a.id === info?.latestDecisionId) return -1
    if (b.id === info?.latestDecisionId) return 1
    return b.at.localeCompare(a.at)
  })
})
const favors = { BUYER: '支持买家', SELLER: '支持卖家', BOTH: '支持双方', NONE: '未支持任何一方' }
const kindName = (kind: string) => kind === 'SIGNATURE' ? '签收证明' : kind === 'TRACKING' ? '发货跟踪' : '其他资料'
</script>

<template>
  <section v-if="materialGroups.length" v-prototype="disputeAnnotations.materials" class="material-panel" data-dispute-section="inquiry-materials" aria-label="平台资料">
    <h2>平台资料</h2>
    <article v-for="group in materialGroups" :key="group.kind" class="material-group">
      <h3>{{ kindName(group.kind) }}</h3>
      <p v-for="(item,index) in group.requests" :key="index" class="byline">{{ item.actor }} 要求提供 <time>{{ dateText(item.at) }}</time></p>
      <p v-if="group.requests.length && !group.submissions.length" class="missing">尚未取得这类资料的提交记录。</p>
      <div v-for="(item,index) in group.submissions" :key="index" class="submitted">
        <p class="byline">{{ item.actor }} 已提供 <time>{{ dateText(item.at) }}</time></p>
        <p v-if="item.documentName" class="document-name">{{ item.documentName }}</p>
        <dl class="material-facts">
          <template v-if="item.carrier"><dt>承运商</dt><dd>{{ item.carrier }}</dd></template>
          <template v-if="item.tracking"><dt>跟踪号</dt><dd><NumberCopy :value="item.tracking" label="跟踪号" /></dd></template>
          <template v-if="item.documentId"><dt>凭证编号</dt><dd><NumberCopy :value="item.documentId" label="凭证编号" /></dd></template>
          <template v-if="item.uploadedAt && item.uploadedAt !== item.at"><dt>文件上传</dt><dd>{{ dateText(item.uploadedAt) }}</dd></template>
        </dl>
        <small v-if="item.documentName || item.documentId" class="meta">仅有凭证信息，未取得原件</small>
      </div>
    </article>
  </section>
  <section v-if="decisions.length" v-prototype="disputeAnnotations.decisions" class="material-panel" data-dispute-section="decisions" aria-label="历次裁决与复核">
    <h2>历次裁决与复核</h2>
    <details v-for="(decision,index) in decisions" :key="decision.id" class="decision material-group" :open="index === 0">
      <summary>
        <span>{{ favors[decision.inFavorOf] || '裁决支持方待核实' }}<small v-if="decision.id === record.caseInfo?.latestDecisionId">当前裁决</small></span>
        <time>{{ dateText(decision.at) }}</time>
      </summary>
      <p v-if="decision.note" class="decision-note">{{ decision.note }}</p>
      <dl class="material-facts">
        <dt>裁决编号</dt><dd><NumberCopy :value="decision.id" label="裁决编号" /></dd>
        <template v-for="(outcome,i) in decision.outcomes" :key="i">
          <dt>{{ i ? '其他结果' : '裁决结果' }}</dt><dd>{{ outcome.label }}<strong v-if="outcome.amount"> · {{ outcome.amount.currency }} {{ outcome.amount.value }}</strong></dd>
        </template>
      </dl>
      <div v-if="decision.review" class="submitted">
        <h4>本次裁决的复核申请</h4>
        <p class="byline">{{ decision.review.requester }} 提交 <time>{{ dateText(decision.review.at) }}</time></p>
        <p>{{ decision.review.reason }}</p>
        <p v-if="decision.review.note && decision.review.note !== decision.review.reason">{{ decision.review.note }}</p>
      </div>
      <details v-if="decision.outcomes.some(outcome => outcome.code) || decision.review?.reasonCode" class="decision-codes"><summary>裁决与复核原始代码</summary><dl class="material-facts">
        <template v-for="(outcome,i) in decision.outcomes.filter(outcome => outcome.code)" :key="i"><dt>裁决结果码</dt><dd>{{ outcome.code }}</dd></template>
        <template v-if="decision.review?.reasonCode"><dt>复核原因码</dt><dd>{{ decision.review.reasonCode }}</dd></template>
      </dl></details>
    </details>
  </section>
</template>

<style scoped>
.document-name { font-weight: 600; }
.decision summary { cursor: pointer; }
.decision summary > span { color: var(--yy-text-heading); font-weight: 600; }
.decision summary small { font-size: 11px; font-weight: 400; margin-left: 6px; color: #59738c; }
.decision summary time { display: block; padding-left: 13px; font-weight: 400; }
.decision-note { margin: 7px 0; }
.decision-codes{margin-top:11px;font-size:11px}.decision-codes summary{cursor:pointer;color:#657384}.decision-codes[open] dl{margin-top:8px}
</style>
