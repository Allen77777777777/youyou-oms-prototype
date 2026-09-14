<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowDown, ChatLineSquare, Close, Location, Search } from '@element-plus/icons-vue'
import type { 原型标注 } from '@/类型/标注'
import { 获取标注分类, 标注状态 } from './标注状态'

type 分类 = '全部' | NonNullable<原型标注['分类']>
interface 条目 { 标注: 原型标注; 编号: number; 元素: HTMLElement[] }
interface 标记 { id: string; 编号: number; 分类: string; x: number; y: number; 标题: string }
const route = useRoute()
const 分类列表: 分类[] = ['全部', '页面', '字段', '交互', '规则', '待确认']
const 颜色: Record<string, string> = { 页面: '#7c8fa9', 字段: '#0aa7d9', 交互: '#059c78', 规则: '#9061dc', 待确认: '#ec9614' }
const 当前分类 = ref<分类>('全部')
const 关键词 = ref('')
const 条目列表 = shallowRef<条目[]>([])
const 标记列表 = shallowRef<标记[]>([])
const 定位区域 = shallowRef<{ x: number; y: number; width: number; height: number }>()
const 展开项 = ref<string[]>([])
const 卡片元素 = new Map<string, HTMLElement>()
const 编号表 = new Map<string, number>()
let 下一编号 = 1
let 动画帧 = 0
let 上次布局时间 = 0
const 筛选条目 = computed(() => 条目列表.value.filter(({ 标注 }) => {
  const 匹配分类 = 当前分类.value === '全部' || (当前分类.value === '待确认' ? 标注.事实等级 === '待确认' || 获取标注分类(标注) === '待确认' : 获取标注分类(标注) === 当前分类.value)
  return 匹配分类 && JSON.stringify(标注).toLowerCase().includes(关键词.value.trim().toLowerCase())
}))
const 显示标记 = computed(() => 标记列表.value.filter((点) => 筛选条目.value.some((项) => 项.标注.id === 点.id)))
const 当前id = computed(() => 标注状态.当前标注.value?.id)
const 页面标题 = computed(() => String(route.meta.title || '当前页面'))
function 逻辑区块(标注: 原型标注) {
  return [
    { 标题: '前置条件', 内容: 标注.前置条件 }, { 标题: '触发方式', 内容: 标注.触发方式 },
    { 标题: '系统动作', 内容: 标注.系统动作 }, { 标题: '成功结果', 内容: 标注.成功结果 },
    { 标题: '异常与阻断', 内容: 标注.异常处理 }, { 标题: '交互规则', 内容: 标注.交互规则 },
    { 标题: '数据来源', 内容: 标注.数据来源 }, { 标题: '权限与审计', 内容: 标注.权限与审计 },
    { 标题: '验收要点', 内容: 标注.验收要点 },
  ].filter((块): 块 is { 标题: string; 内容: string[] } => Boolean(块.内容?.length))
}
function 是否已展开(id: string) { return 展开项.value.includes(id) }
function 切换详情(id: string) { 展开项.value = 是否已展开(id) ? 展开项.value.filter((项) => 项 !== id) : [...展开项.value, id] }
function 是否已渲染(元素: HTMLElement) {
  return 元素.isConnected && 元素.getClientRects().length > 0 && getComputedStyle(元素).visibility !== 'hidden'
}
function 可见区域(元素: HTMLElement) {
  const 矩形 = 元素.getBoundingClientRect()
  let left = Math.max(54, 矩形.left), top = Math.max(44, 矩形.top)
  let right = Math.min(innerWidth, 矩形.right), bottom = Math.min(innerHeight, 矩形.bottom)
  for (let 父级 = 元素.parentElement; 父级; 父级 = 父级.parentElement) {
    const 样式 = getComputedStyle(父级)
    const 边界 = 父级.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/.test(样式.overflowX)) { left = Math.max(left, 边界.left); right = Math.min(right, 边界.right) }
    if (/(auto|scroll|hidden|clip)/.test(样式.overflowY)) { top = Math.max(top, 边界.top); bottom = Math.min(bottom, 边界.bottom) }
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}
function 更新布局() {
  const 分组 = new Map<string, 条目>()
  const 弹层列表 = [...document.querySelectorAll<HTMLElement>('.el-dialog, .el-drawer, .el-message-box')].filter(是否已渲染).sort((a, b) => Number(getComputedStyle(a.closest('.el-overlay') ?? a).zIndex) - Number(getComputedStyle(b.closest('.el-overlay') ?? b).zIndex))
  const 最上弹层 = 弹层列表[弹层列表.length - 1]
  const 有标注弹层 = 最上弹层 && 标注状态.注册项.value.some((项) => 最上弹层.contains(项.元素)) ? 最上弹层 : undefined
  const 顺序注册项 = [...标注状态.注册项.value].sort((a, b) => a.元素 === b.元素 ? 0 : a.元素.compareDocumentPosition(b.元素) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
  for (const { 元素, 标注 } of 顺序注册项) {
    if (!是否已渲染(元素)) continue
    if (有标注弹层 && !有标注弹层.contains(元素)) continue
    if (!编号表.has(标注.id)) 编号表.set(标注.id, 下一编号++)
    if (!分组.has(标注.id)) 分组.set(标注.id, { 标注, 编号: 编号表.get(标注.id)!, 元素: [] })
    分组.get(标注.id)!.元素.push(元素)
  }
  const 新条目 = [...分组.values()].sort((a, b) => a.编号 - b.编号)
  if (JSON.stringify(新条目.map((项) => [项.编号, 项.标注])) !== JSON.stringify(条目列表.value.map((项) => [项.编号, 项.标注])) || 新条目.some((项, i) => 项.元素.length !== 条目列表.value[i]?.元素.length || 项.元素.some((元素, j) => 元素 !== 条目列表.value[i]?.元素[j]))) 条目列表.value = 新条目
  if (document.querySelector('.功能菜单遮罩')) { 标记列表.value = []; 定位区域.value = undefined; return }
  const 控件区域 = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a, label, h1, h2, h3, h4, [role="button"], [role="combobox"]')].filter((元素) => !元素.closest('.标注工作台, .原型编号层') && 是否已渲染(元素)).map((元素) => 元素.getBoundingClientRect())
  const 新标记: 标记[] = []
  let 新区域: typeof 定位区域.value
  for (const 项 of 新条目) {
    for (const 元素 of 项.元素) {
      if (最上弹层 && !最上弹层.contains(元素)) continue
      const 区域 = 可见区域(元素)
      if (区域.width < 18 || 区域.height < 15) continue
      if (项.标注.id === 当前id.value && !新区域) 新区域 = { x: 区域.left, y: 区域.top, width: 区域.width, height: 区域.height }
      const 右边界 = innerWidth - (innerWidth <= 1440 ? 362 : 392)
      const 候选位置 = [
        [区域.left + 6, 区域.top - 8], [区域.left - 30, 区域.top],
        [区域.left, 区域.top - 30], [区域.right + 3, 区域.top],
        [区域.left, 区域.bottom + 3], [55, 区域.top],
        ...Array.from({ length: 8 }, (_, i) => [区域.left + i * 30, 区域.top - 30]),
      ]
      const 空闲位置 = 候选位置.find(([x = 0, y = 0]) => x >= 55 && y >= 45 && x + 27 <= 右边界 && y + 27 <= innerHeight && !控件区域.some((矩形) => x < 矩形.right && x + 27 > 矩形.left && y < 矩形.bottom && y + 27 > 矩形.top) && !新标记.some((点) => Math.abs(点.x - x) < 29 && Math.abs(点.y - y) < 29))
      if (!空闲位置) continue
      const x = Math.round(空闲位置[0]!), y = Math.round(空闲位置[1]!)
      新标记.push({ id: 项.标注.id, 编号: 项.编号, 分类: 获取标注分类(项.标注), x, y, 标题: 项.标注.标题 })
      if (项.标注.id === 当前id.value) 新区域 = { x: 区域.left, y: 区域.top, width: 区域.width, height: 区域.height }
      break
    }
  }
  if (JSON.stringify(新标记) !== JSON.stringify(标记列表.value)) 标记列表.value = 新标记
  if (JSON.stringify(新区域) !== JSON.stringify(定位区域.value)) 定位区域.value = 新区域
}
function 帧循环(time: number) {
  if (!标注状态.标注模式.value) return
  if (time - 上次布局时间 > 120) { 更新布局(); 上次布局时间 = time }
  动画帧 = requestAnimationFrame(帧循环)
}
async function 选择条目(项: 条目, 来源: '页面' | '索引') {
  标注状态.打开(项.标注)
  if (!是否已展开(项.标注.id)) 展开项.value.push(项.标注.id)
  if (来源 === '索引') {
    const 元素 = 项.元素.find((元素) => 可见区域(元素).height > 18) ?? 项.元素[0]
    元素?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  } else {
    当前分类.value = '全部'
    关键词.value = ''
    await nextTick()
    卡片元素.get(项.标注.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
  更新布局()
}
function 点击编号(id: string) { const 项 = 条目列表.value.find((项) => 项.标注.id === id); if (项) void 选择条目(项, '页面') }
watch(() => 标注状态.标注模式.value, async (开启) => {
  cancelAnimationFrame(动画帧)
  if (开启) { await nextTick(); 更新布局(); 动画帧 = requestAnimationFrame(帧循环) }
  else { 标记列表.value = []; 定位区域.value = undefined }
}, { immediate: true })
watch(() => route.fullPath, () => {
  标注状态.关闭(); 当前分类.value = '全部'; 关键词.value = ''; 展开项.value = []
  编号表.clear(); 下一编号 = 1; 卡片元素.clear(); 条目列表.value = []; 标记列表.value = []
})
onBeforeUnmount(() => cancelAnimationFrame(动画帧))
</script>

<template>
  <div v-if="标注状态.标注模式.value" class="标注占位" />
  <Teleport to="body">
  <aside v-if="标注状态.标注模式.value" class="标注工作台" aria-label="原型标注索引">
    <header class="标注页头">
      <div class="标注标题"><ElIcon :size="20"><ChatLineSquare /></ElIcon><strong>原型标注</strong><span class="总数">{{ 条目列表.length }}</span><button aria-label="关闭原型标注" @click="标注状态.退出()"><ElIcon><Close /></ElIcon></button></div>
      <p>{{ 页面标题 }} · 点击编号或条目定位对应区域</p>
    </header>
    <nav class="分类栏" aria-label="标注分类"><button v-for="分类 in 分类列表" :key="分类" :class="{ 选中: 当前分类 === 分类 }" @click="当前分类 = 分类">{{ 分类 }}</button></nav>
    <div class="标注搜索"><ElInput v-model="关键词" placeholder="搜索说明、规则或锚点" clearable size="small" :prefix-icon="Search" /></div>
    <div class="标注列表">
      <article v-for="项 in 筛选条目" :key="项.标注.id" :ref="(el) => { if (el) 卡片元素.set(项.标注.id, el as HTMLElement); else 卡片元素.delete(项.标注.id) }" class="标注卡片" :class="{ 当前: 当前id === 项.标注.id }" :style="{ '--分类颜色': 颜色[获取标注分类(项.标注)] }">
        <button class="标注卡片标题" @click="选择条目(项, '索引')"><span class="卡片编号">{{ 项.编号 }}</span><strong>{{ 项.标注.标题 }}</strong><span class="分类标签">{{ 获取标注分类(项.标注) }}</span></button>
        <p class="摘要">{{ 项.标注.说明 }}</p>
        <div class="事实行"><span :class="['事实标签', 项.标注.事实等级]">{{ 项.标注.事实等级 }}</span><span>{{ 项.标注.状态 }} · v{{ 项.标注.版本 }}</span></div>
        <button class="详情开关" :aria-expanded="是否已展开(项.标注.id)" @click="切换详情(项.标注.id)">{{ 是否已展开(项.标注.id) ? '收起详细说明' : '展开详细说明' }}<ElIcon :class="{ 旋转: 是否已展开(项.标注.id) }"><ArrowDown /></ElIcon><small>{{ 逻辑区块(项.标注).length }} 项</small></button>
        <div v-if="是否已展开(项.标注.id)" class="详细说明">
          <section v-for="块 in 逻辑区块(项.标注)" :key="块.标题"><h4>{{ 块.标题 }}</h4><p v-for="(内容, i) in 块.内容" :key="i">{{ 内容 }}</p></section>
          <section v-if="!逻辑区块(项.标注).length"><h4>说明边界</h4><p>此锚点的详细执行规则尚待补齐，以所引用的 PRD 为准。</p></section>
          <section><h4>来源与追溯</h4><p v-for="引用 in 项.标注.prd引用" :key="引用" class="引用">{{ 引用 }}</p><code>{{ 项.标注.锚点 }}</code><small class="路由">{{ 项.标注.路由 }}</small></section>
          <button class="定位按钮" @click="选择条目(项, '索引')"><ElIcon><Location /></ElIcon>定位页面区域<span v-if="项.元素.length > 1"> · {{ 项.元素.length }} 处复用</span></button>
        </div>
      </article>
      <div v-if="!筛选条目.length" class="标注空态"><ElIcon :size="30"><ChatLineSquare /></ElIcon><strong>{{ 条目列表.length ? '没有匹配的标注' : '当前区域暂无标注' }}</strong><span>{{ 条目列表.length ? '调整分类或搜索词后重试' : '打开业务页面或展开对应操作后查看' }}</span></div>
    </div>
    <footer class="标注页尾">编号用于评审定位 · 页面操作仍可正常使用</footer>
  </aside>
    <div v-if="标注状态.标注模式.value" class="原型编号层">
      <div v-if="定位区域" class="标注定位框" :style="{ left: 定位区域.x + 'px', top: 定位区域.y + 'px', width: 定位区域.width + 'px', height: 定位区域.height + 'px' }" />
      <button v-for="点 in 显示标记" :key="点.id" class="原型编号" :class="{ 当前: 当前id === 点.id }" :style="{ left: 点.x + 'px', top: 点.y + 'px', background: 颜色[点.分类] }" :aria-label="'标注 ' + 点.编号 + '：' + 点.标题" :title="点.标题" @click.stop="点击编号(点.id)">{{ 点.编号 }}</button>
    </div>
  </Teleport>
</template>

<style scoped>
.标注占位 { width: 392px; min-width: 392px; }
.标注工作台 { position: fixed; top: 54px; bottom: 10px; right: 10px; z-index: 5001; width: 382px; border: 1px solid #dce4ed; border-radius: 10px; background: #fff; box-shadow: 0 3px 12px #24394e0b; display: flex; flex-direction: column; overflow: hidden; color: #334155; }
.标注页头 { padding: 20px 18px 14px; border-bottom: 1px solid #edf1f5; }
.标注标题 { display: flex; align-items: center; gap: 9px; color: #00896b; }
.标注标题 strong { color: #243247; font-size: 18px; }
.总数 { font-size: 12px; background: #f0f4f8; color: #738399; border-radius: 12px; padding: 2px 7px; }
.标注标题 button { margin-left: auto; border: none; background: none; color: #91a0b3; cursor: pointer; padding: 4px; }
.标注页头 p { margin: 9px 0 0; font-size: 12px; color: #8191a7; line-height: 1.6; }
.分类栏 { display: flex; padding: 12px 12px 4px; gap: 2px; }
.分类栏 button { flex: 1; white-space: nowrap; padding: 7px 4px; border: 0; border-radius: 6px; color: #74849a; background: transparent; cursor: pointer; font-size: 12px; }
.分类栏 button.选中 { background: #008568; color: white; font-weight: 600; }
.标注搜索 { padding: 8px 16px 12px; border-bottom: 1px solid #edf1f5; }
.标注列表 { flex: 1; min-height: 0; overflow: auto; padding: 12px; overscroll-behavior: contain; }
.标注卡片 { margin-bottom: 10px; border: 1px solid #e7edf3; border-radius: 7px; padding: 14px 12px 10px; transition: border-color .15s; }
.标注卡片.当前 { border-color: #48b69c; box-shadow: 0 0 0 1px #48b69c18; }
.标注卡片标题 { width: 100%; border: 0; background: none; padding: 0; display: flex; align-items: flex-start; gap: 8px; text-align: left; color: #26374b; cursor: pointer; }
.标注卡片标题 strong { flex: 1; min-width: 0; font-size: 14px; line-height: 1.6; }
.卡片编号 { background: var(--分类颜色); color: white; border-radius: 50%; min-width: 24px; height: 24px; font-size: 12px; display: grid; place-items: center; }
.分类标签 { color: var(--分类颜色); background: #f5f8fa; border-radius: 3px; padding: 2px 5px; white-space: nowrap; font-size: 11px; }
.摘要 { font-size: 12px; line-height: 1.85; color: #718298; margin: 10px 0 12px 32px; }
.事实行 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: 32px; color: #9aa6b5; font-size: 10px; }
.事实标签 { padding: 2px 5px; border-radius: 3px; background: #f2f5f8; }
.事实标签.已确认 { color: #188467; background: #edf9f3; }.事实标签.待确认 { color: #b87a14; background: #fff7e6; }.事实标签.合理假设 { color: #8865b9; background: #f5f0fc; }
.详情开关 { width: 100%; display: flex; align-items: center; gap: 6px; padding: 12px 0 4px 32px; border: 0; background: none; color: #008769; cursor: pointer; font-size: 12px; text-align: left; }
.详情开关 small { color: #a0adbd; margin-left: 2px; }.旋转 { transform: rotate(180deg); }
.详细说明 { margin-top: 12px; padding: 0 2px; border-top: 1px solid #edf1f5; font-size: 12px; line-height: 1.85; overflow-wrap: anywhere; }
.详细说明 section { margin-top: 18px; }.详细说明 h4 { margin: 0 0 6px; color: #8b9bb0; font-size: 11px; letter-spacing: .5px; }
.详细说明 p { margin: 4px 0; color: #52667f; }.详细说明 p + p { margin-top: 8px; }.详细说明 .引用 { color: #5878a0; font-size: 11px; }
.详细说明 code { display: block; margin-top: 8px; padding: 5px 7px; background: #f5f7fa; font-size: 10px; color: #7f8fa4; border-radius: 4px; }.路由 { display: block; font-size: 10px; color: #9aa7b6; margin-top: 4px; }
.定位按钮 { display: flex; gap: 5px; align-items: center; margin-top: 14px; padding: 6px 0; border: 0; background: none; color: #008769; font-size: 11px; cursor: pointer; }
.标注页尾 { padding: 12px; border-top: 1px solid #edf1f5; text-align: center; color: #92a0b2; font-size: 10px; }.标注空态 { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 50px 8px; color: #8c9caf; font-size: 12px; }
.原型编号层 { position: fixed; inset: 0; pointer-events: none; z-index: 5000; }.原型编号 { position: fixed; width: 27px; height: 27px; border: 2px solid white; border-radius: 50%; color: white; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px #31445a35; cursor: pointer; pointer-events: auto; padding: 0; }.原型编号:hover,.原型编号.当前 { transform: scale(1.12); box-shadow: 0 0 0 3px #00856925; }.原型编号:focus-visible { outline: 3px solid #3f9ffe; outline-offset: 2px; }.标注定位框 { position: fixed; border: 2px solid #00a47c; border-radius: 5px; box-shadow: inset 0 0 0 3px #00a47c0b; pointer-events: none; }
@media (max-width: 1440px) { .标注占位 { width: 362px; min-width: 362px; }.标注工作台 { width: 352px; }.标注页头 { padding: 16px 14px 12px; }.标注列表 { padding: 10px; } }
</style>
