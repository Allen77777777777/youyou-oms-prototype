<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElTooltip } from 'element-plus'
import OrderProductImage from '../全渠道订单/商品缩略图.vue'
import PlatformProductTitle from '../全渠道订单/平台商品标题.vue'
import { 格式化金额, 获取订单商品数量 } from '../全渠道订单/订单工具'
import type { 全渠道订单, 履约单摘要 } from '../全渠道订单/类型'
import { 获取商品运营人员, 处理人姓名 } from './处理人模型'
import { 订单处理标注 } from './订单处理原型标注'
import { 格式化包裹金额, 读取拆分包裹商品投影, type 拆分包裹商品投影 } from './拆分包裹商品投影'

const props = defineProps<{ order: 全渠道订单; sourceOrder: boolean; fulfillment?: 履约单摘要; parcelView?: boolean }>()
const 展开 = ref(false)
const 本次分配 = computed(() => props.fulfillment?.items?.filter(item => item.orderNo === props.order.systemOrderNo))
const 本包投影 = computed<拆分包裹商品投影>(() => props.parcelView && props.fulfillment
  ? 读取拆分包裹商品投影(props.order, props.fulfillment)
  : { items: [], quantity: null, reason: '本包商品分配待核实' })
const 本包商品 = (行号: string) => 本包投影.value.items.find(行 => 行.item.externalLineId === 行号)
const 商品列表 = computed(() => props.parcelView ? 本包投影.value.items.map(行 => 行.item) : 本次分配.value === undefined ? props.order.items : props.order.items.filter(item => 本次分配.value!.some(allocation => allocation.externalLineId === item.externalLineId)))
const 本次计划 = (行号: string) => 本次分配.value?.filter(item => item.externalLineId === 行号).reduce((sum, item) => sum + item.quantity, 0)
const 本次计划总量 = computed(() => 本次分配.value?.reduce((sum, item) => sum + item.quantity, 0) ?? 0)
const 展示来源金额 = computed(() => props.parcelView || props.sourceOrder || 本次分配.value !== undefined)
</script>

<template>
  <div class="作业商品摘要">
    <ElTooltip :disabled="!展示来源金额" :content="parcelView ? '按本包数量展示对应商品实收，原交易数据保留。' : '商品单价、商品实收金额均为来源订单商品行金额，不代表本次履约金额。'" placement="top">
      <div class="商品数量摘要" :tabindex="展示来源金额 ? 0 : undefined"><template v-if="parcelView">本包商品 · <template v-if="本包投影.quantity !== null">{{ 商品列表.length }} 行 · {{ 本包投影.quantity }} 件</template><template v-else>待核实</template></template><template v-else-if="本次分配 !== undefined">本次履约商品 · {{ 商品列表.length }} 行 · 本次计划 {{ 本次计划总量 }} 件</template><template v-else>{{ sourceOrder ? '来源订单商品' : '订单商品' }} · {{ order.items.length }} 行 · 下单 {{ 获取订单商品数量(order) }} 件</template></div>
    </ElTooltip>
    <span v-if="商品列表.some(商品 => !商品.systemSku?.trim())" class="商品问题">未匹配系统 SKU · {{ 商品列表.filter(商品 => !商品.systemSku?.trim()).length }} 行</span>
    <article v-for="商品 in (展开 ? 商品列表 : 商品列表.slice(0, 1))" :key="商品.externalLineId" class="商品明细">
      <OrderProductImage :src="商品.itemImageUrl" hover-preview />
      <div class="商品资料">
        <PlatformProductTitle :order="order" :item="商品" compact />
        <div><span>平台 SKU</span><b>{{ 商品.platformSku || '—' }}</b></div>
        <div><span>系统 SKU</span><b>{{ 商品.systemSku || '—' }}</b></div>
        <div v-prototype="订单处理标注.运营人员" class="商品运营人员"><span>运营人员</span><b>{{ 处理人姓名(获取商品运营人员(order, 商品)) }}</b></div>
        <dl class="商品金额" :aria-label="parcelView ? '本包商品金额' : 展示来源金额 ? '来源订单商品行金额' : '订单商品行金额'">
          <div><dt>商品单价：</dt><dd>{{ parcelView ? 格式化包裹金额(商品.unitPrice) : 格式化金额(商品.unitPrice) }}</dd></div>
          <div><dt>{{ parcelView ? '本包实收金额' : '商品实收金额' }}：</dt><dd>{{ parcelView ? 格式化包裹金额(本包商品(商品.externalLineId)?.actualReceived) : 格式化金额(商品.actualReceived) }}</dd></div>
        </dl>
        <div class="商品数量"><em v-if="!商品.systemSku?.trim()" class="未识别">未匹配系统 SKU</em><span v-if="parcelView">本包数量 {{ 本包商品(商品.externalLineId)?.quantity ?? '待核实' }}</span><template v-else><span v-if="本次分配 !== undefined">本次计划 {{ 本次计划(商品.externalLineId) }} 件</span><span>{{ 本次分配 !== undefined ? '来源下单' : '下单' }} {{ 商品.orderedQuantity }}</span></template></div>
      </div>
    </article>
    <span v-if="!商品列表.length" class="空商品">{{ parcelView ? '本包商品分配待核实' : 本次分配 !== undefined ? '本次履约没有该来源订单商品' : '暂无商品行' }}</span>
    <ElButton v-if="商品列表.length > 1" class="展开商品" link type="primary" :aria-expanded="展开" @click="展开 = !展开">{{ 展开 ? '收起商品' : `展开全部 ${商品列表.length} 行商品` }}</ElButton>
  </div>
</template>

<style scoped>
.商品问题{font-size:11px;color:#b45f37;background:#fff3e9;border-radius:3px;padding:2px 5px;align-self:flex-start}
.商品金额{display:flex;flex-direction:column;gap:5px;margin:0;font-size:11px;line-height:1.5}.商品金额>div{display:flex;align-items:baseline;gap:4px;min-width:0}.商品金额 dt{flex-shrink:0;color:#8a95a5;font-weight:400}.商品金额 dd{margin:0;min-width:0;color:#47566c;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.作业商品摘要{display:flex;flex-direction:column;gap:9px;min-width:0}.商品数量摘要{font-size:11px;color:#7c899c}.商品明细{display:flex;gap:8px;align-items:flex-start;min-width:0}.商品明细+.商品明细{padding-top:10px;border-top:1px dashed #e3e9f0}.商品资料{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.商品标题{font-size:12px;line-height:1.5;color:var(--yy-text-heading);font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.商品资料>div{display:flex;gap:6px;align-items:baseline}.商品资料>div>span:first-child{color:#8a95a5;font-size:11px;flex-shrink:0}.商品资料 b{font-family:Consolas,'Microsoft YaHei',monospace;font-size:11px;font-weight:400;overflow-wrap:anywhere;color:#47566c}.商品数量{flex-wrap:wrap}.商品数量 em{font-size:10px;font-style:normal;color:#368263;background:#edf7f2;padding:0 4px;border-radius:3px}.商品数量 em.未识别{color:#b45f37;background:#fff3e9}.商品数量 span,.空商品{font-size:11px;color:#7c899c}.展开商品{align-self:flex-start;height:20px;font-size:11px;padding:0}
</style>
