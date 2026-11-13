<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElPopover } from 'element-plus'
import { 拆单标注 } from './拆单规则标注'
import type { 拆单方式 } from './拆单规则模型'

const props = defineProps<{ type: 拆单方式 }>()
const visible = ref(false), pinned = ref(false)
const button = ref<HTMLElement>(), panel = ref<HTMLElement>()
let closeTimer: ReturnType<typeof setTimeout> | undefined
type 拆法图例 = { title: string; source: string[]; condition: string; details?: string; packages: { items: string[]; note: string }[]; conclusion: string }
const examples: Record<拆单方式, 拆法图例> = {
  unit: {
    title: '每件产品拆为一包', source: ['A × 2', 'B × 1'], condition: '拆分要求：每包只放 1 件商品',
    packages: [{ items: ['A × 1'], note: '第 1 件 A' }, { items: ['A × 1'], note: '第 2 件 A' }, { items: ['B × 1'], note: '1 件 B' }],
    conclusion: 'A 的 2 件分别成包，B 的 1 件单独成包，共 3 包。同一种 SKU 有多件，也按每件拆开。',
  },
  sku: {
    title: '一种 SKU 拆为一包', source: ['A × 2', 'B × 1'], condition: '拆分要求：相同 SKU 放在同一包',
    packages: [{ items: ['A × 2'], note: '相同 SKU 同包' }, { items: ['B × 1'], note: '另一种 SKU 单独成包' }],
    conclusion: 'A 的 2 件合在一包，B 的 1 件另成一包，共 2 包。按当前选择的 SKU 依据区分商品。',
  },
  selected: {
    title: '指定 SKU 合为一包', source: ['A × 2', 'B × 1', 'C × 2'], condition: '指定 SKU：A、B',
    packages: [{ items: ['A × 2', 'B × 1'], note: '指定商品同包' }, { items: ['C × 2'], note: '其余商品' }],
    conclusion: '选中的 A、B 合在一包，未选中的 C 另成一包。未命中的集合不生成空包。',
  },
  selectedQty: {
    title: '指定 SKU 按件数分包', source: ['A × 5', 'B × 3', 'C × 1'], condition: '指定 SKU：A、B，每包最多 2 件',
    packages: [{ items: ['A × 2'], note: '满包 2 件' }, { items: ['A × 2'], note: '满包 2 件' }, { items: ['A × 1'], note: '尾包 1 件' }, { items: ['B × 2'], note: '满包 2 件' }, { items: ['B × 1'], note: '尾包 1 件' }, { items: ['C × 1'], note: '其余商品' }],
    conclusion: '每个指定 SKU 分别分包，A 的 5 件拆成 2／2／1；B 的 3 件拆成 2／1。不同 SKU 的尾包不混装，未选中的 C 另成一包。',
  },
  capacity: {
    title: '智能分包', source: ['A × 3', 'B × 2'], condition: '每包最多 3 kg；带电商品与普通商品分开发',
    details: 'A：单件 1.2 kg，带电；B：单件 0.8 kg，普通商品。',
    packages: [{ items: ['A × 2'], note: '2.4 kg · 带电' }, { items: ['A × 1'], note: '1.2 kg · 带电' }, { items: ['B × 2'], note: '1.6 kg · 普通' }],
    conclusion: 'A 按重量分成 2 件、1 件两包，B 的 2 件另成一包。每包都不超过 3 kg，且带电与普通商品不混装。',
  },
}
const example = computed(() => examples[props.type])
const title = computed(() => example.value.title)
const source = computed(() => example.value.source)
const packages = computed(() => example.value.packages)
function open() { clearTimeout(closeTimer); visible.value = true }
function leave() { clearTimeout(closeTimer); closeTimer = setTimeout(() => { if (!pinned.value) visible.value = false }, 160) }
function close() { clearTimeout(closeTimer); visible.value = false; pinned.value = false }
function outside(event: PointerEvent) { if (event.target instanceof Node && !button.value?.contains(event.target) && !panel.value?.contains(event.target)) close() }
function escape(event: KeyboardEvent) { if (event.key === 'Escape' && visible.value) { event.stopPropagation(); close() } }
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true) })
onBeforeUnmount(() => { clearTimeout(closeTimer); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) })
</script>

<template>
  <ElPopover :visible="visible" trigger="click" role="dialog" placement="left-start" :popper-options="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: true } }] }" :width="560" :popper-style="{ maxWidth: 'calc(100vw - 40px)' }">
    <template #reference><button ref="button" type="button" class="拆法示例入口" :aria-label="`${title}示例`" v-prototype="拆单标注(`examples-${type}`, `${title}示例`)" @mouseenter="open" @mouseleave="leave" @focus="open" @blur="leave" @click.stop="open(); pinned = true">查看示例</button></template>
    <section :id="`split-example-${type}`" ref="panel" class="拆法示例浮窗" :aria-label="`${title}示例说明`" @mouseenter="open" @mouseleave="leave">
      <header><strong>{{ title }}</strong><button type="button" aria-label="关闭拆法示例" @click="close">×</button></header>
      <div class="拆法示例来源"><span>原订单</span><b v-for="item in source" :key="item" :class="`商品${item[0]}`">{{ item }}</b></div>
      <p class="拆法示例条件">{{ example.condition }}</p>
      <p v-if="example.details" class="拆法示例资料">{{ example.details }}</p>
      <div class="拆法示例箭头" aria-hidden="true">↓</div>
      <div class="拆法示例包组" :class="{ 件数包组: packages.length > 2 }">
        <article v-for="(parcel,index) in packages" :key="index" class="拆法示例包裹">
          <div class="拆法示例包头"><svg width="20" height="22" viewBox="0 0 24 26" fill="none" aria-hidden="true"><path d="M2 7 12 2 22 7v12l-10 5-10-5V7Z" stroke="currentColor" stroke-width="1.4"/><path d="m2 7 10 5 10-5M12 12v12M7 4.5 17 9.5v5" stroke="currentColor" stroke-width="1.4"/></svg><strong>包裹 {{ index + 1 }}</strong></div>
          <div class="拆法示例包货"><b v-for="item in parcel.items" :key="item" :class="`商品${item[0]}`">{{ item }}</b></div>
          <small>{{ parcel.note }}</small>
        </article>
      </div>
      <p class="拆法示例结论">{{ example.conclusion }}</p>
      <p class="拆法示例注记">固定示例，按当前选择的 SKU 依据理解；实际订单请使用规则试算。</p>
    </section>
  </ElPopover>
</template>

<style scoped>
.拆法示例资料{margin:4px 0 0;color:var(--yy-text-secondary)}
.拆法示例入口{border:0;background:transparent;padding:5px 0;font:inherit;font-size:12px;color:var(--yy-primary);cursor:pointer;white-space:nowrap}.拆法示例入口:focus-visible{outline:2px solid var(--yy-primary);outline-offset:2px;border-radius:3px}.拆法示例浮窗{font-size:12px;line-height:1.7;max-height:min(560px,70vh);overflow:auto;color:var(--yy-text-regular)}.拆法示例浮窗 header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.拆法示例浮窗 header>strong{font-size:14px;color:var(--yy-text-heading)}.拆法示例浮窗 header>button{border:0;background:none;font-size:22px;line-height:24px;width:28px;cursor:pointer;color:var(--yy-text-secondary)}.拆法示例来源{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px;background:#f6f8fb;border-radius:5px}.拆法示例来源>span{margin-right:8px;color:var(--yy-text-heading)}.拆法示例来源 b,.拆法示例包货 b{font-size:12px;font-weight:500;padding:2px 7px;border-radius:3px;white-space:nowrap}.商品A{background:#eaf2ff;color:#3268ad}.商品B{background:#eaf7f3;color:#29765c}.商品C{background:#f1edf9;color:#7552a2}.拆法示例条件{margin:12px 0 0}.拆法示例条件 b{color:var(--yy-text-heading);font-weight:500}.拆法示例箭头{text-align:center;color:#91a2b8;font-size:24px;line-height:26px;margin:5px 0}.拆法示例包组{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.拆法示例包组.件数包组{grid-template-columns:repeat(3,minmax(0,1fr))}.拆法示例包裹{border:1px solid #dde5ef;border-radius:5px;padding:10px;min-width:0;background:#fff}.拆法示例包头{display:flex;align-items:center;gap:7px;color:#8ba0bb}.拆法示例包头 strong{font-size:12px;font-weight:500;color:var(--yy-text-heading)}.拆法示例包货{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.拆法示例包裹>small{font-size:11px;color:var(--yy-text-secondary)}.拆法示例结论{margin:14px 0 0;padding:10px 12px;background:#f5f8fd;border-radius:4px}.拆法示例注记{font-size:11px;color:var(--yy-text-secondary);margin:10px 0 0}
</style>
