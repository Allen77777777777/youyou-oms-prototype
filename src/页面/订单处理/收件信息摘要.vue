<script setup lang="ts">
import { computed } from 'vue'
import type { 脱敏收件信息 } from '../全渠道订单/类型'

const props = withDefaults(defineProps<{ address: 脱敏收件信息; showAddress?: boolean }>(), { showAddress: true })
const 国家地区 = computed(() => {
  const 代码 = props.address.countryCode?.trim().toUpperCase()
  if (!代码) return '—'
  if (!/^[A-Z]{2}$/.test(代码)) return 代码
  try {
    const 名称 = new Intl.DisplayNames(['zh-CN'], { type: 'region', fallback: 'code' }).of(代码)
    return 名称 && 名称 !== 代码 ? `${名称} [${代码}]` : 代码
  } catch { return 代码 }
})
const 电话 = computed(() => [...new Set([props.address.mobilePhone, props.address.telephone].filter(Boolean))].join(' / ') || '—')
const 地址 = computed(() => [props.address.addressLine1, props.address.addressLine2].filter(Boolean).join(' ') || '—')
</script>

<template>
  <dl class="收件信息明细">
    <dt>国家/地区：</dt><dd>{{ 国家地区 }}</dd>
    <dt>省/州：</dt><dd>{{ address.stateProvince || '—' }}</dd>
    <dt>城市：</dt><dd>{{ address.city || '—' }}</dd>
    <template v-if="address.district"><dt>县/区：</dt><dd>{{ address.district }}</dd></template>
    <dt>邮编：</dt><dd>{{ address.postalCode || '—' }}</dd>
    <dt>收件人：</dt><dd>{{ address.fullName || '—' }}</dd>
    <dt>电话：</dt><dd>{{ 电话 }}</dd>
    <dt>邮箱：</dt><dd>{{ address.email || '—' }}</dd>
    <template v-if="showAddress"><dt>地址：</dt><dd>{{ 地址 }}</dd></template>
  </dl>
</template>

<style scoped>
.收件信息明细{display:grid;grid-template-columns:72px minmax(0,1fr);gap:5px 0;margin:0;font-size:12px;line-height:1.55;min-width:0;align-items:start}
.收件信息明细 dt{color:#8c98a9;white-space:nowrap;font-weight:400}
.收件信息明细 dd{margin:0;color:#354963;overflow-wrap:anywhere;white-space:pre-wrap;min-width:0}
</style>
