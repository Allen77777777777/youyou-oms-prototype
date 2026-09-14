<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Search, ArrowUp, ArrowDown, Delete, Setting, VideoPlay } from '@element-plus/icons-vue'
import { ElButton, ElInput, ElSelect, ElOption, ElIcon, ElTag, ElTable, ElTableColumn, ElDialog, ElDrawer, ElForm, ElFormItem, ElRadioGroup, ElRadioButton, ElAlert, ElEmpty, ElMessage, ElMessageBox, ElTimeline, ElTimelineItem } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 共享订单 } from '../订单处理/演示会话'
import { 规则动作, 条件字段名, 试算规则, type 规则类型, type 订单规则, type 条件字段 } from './规则逻辑'
import { 共享规则, 共享规则日志 } from './演示会话'

const 类型列表: 规则类型[] = ['审单规则', '分仓规则', '订单标发规则']
const 规则 = 共享规则; const 当前类型 = ref<规则类型>('审单规则'); const 关键词 = ref(''); const 状态 = ref('')
const 编辑打开 = ref(false); const 试算打开 = ref(false); const 日志打开 = ref(false); const 编辑Id = ref('')
const 日志 = 共享规则日志
const 编辑 = reactive<订单规则>({ id: '', name: '', type: '审单规则', enabled: false, priority: 10, mode: '全部满足', conditions: [], action: '', version: 1, updatedAt: '', note: '' })
const 试算订单 = ref(''); const 已试算订单 = ref(''); const 已试算类型 = ref<规则类型>('审单规则'); const 试算结果 = ref<ReturnType<typeof 试算规则>>()
const 列表 = computed(() => 规则.value.filter((项) => 项.type === 当前类型.value && 项.name.includes(关键词.value.trim()) && (!状态.value || String(项.enabled) === 状态.value)).sort((a,b) => a.priority-b.priority))
function 标注(id: string, 标题: string, 分类: 原型标注['分类'], 说明: string, 动作: string[], 等级: 原型标注['事实等级'] = '合理假设'): 原型标注 {
  return { id: `oms.rules.${id}`, 标题, 分类, 说明, 事实等级: 等级, 状态: '待评审', 版本: '0.3.0', 路由: '/oms/self-fulfillment/order-rules', 锚点: `oms.rules.${id}`, prd引用: ['PRD/订单规则功能PRD.md#6-功能与交互'], 前置条件: ['当前仅配置本地演示规则，不接入生产执行引擎。'], 触发方式: ['点击相应规则操作。'], 系统动作: 动作, 成功结果: ['保存版本或返回试算轨迹；订单及外部系统不发生变化。'], 异常处理: ['名称、条件或动作不完整时保留编辑内容并提示修复。', '业务门禁优先于规则命中；订单级 PAID 准入及后续非 PAID 转异常由平台适配链路负责，规则不能绕过取消、异常、平台接入或有效出库校验。'], 验收要点: 动作 }
}
function 记录(text: string) { 日志.value.unshift({ time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8', text }) }
function 打开编辑(项?: 订单规则) {
  编辑Id.value = 项?.id ?? ''
  Object.assign(编辑, 项 ? JSON.parse(JSON.stringify(项)) : { id: '', name: '', type: 当前类型.value, enabled: false, priority: Math.max(0, ...规则.value.filter(项 => 项.type === 当前类型.value).map(项 => 项.priority)) + 10, mode: '全部满足', conditions: [{ field: 'platformCode', operator: '等于', value: 'eBay' }], action: 规则动作[当前类型.value][0], version: 1, updatedAt: '', note: '' })
  编辑打开.value = true
}
function 保存() {
  if (!编辑.name.trim()) { ElMessage.warning('请输入规则名称'); return }
  if (规则.value.some(项 => 项.id !== 编辑Id.value && 项.type === 编辑.type && 项.name === 编辑.name.trim())) { ElMessage.warning('同一类型中已存在同名规则'); return }
  if (!编辑.conditions.length || 编辑.conditions.some(项 => !项.value.trim())) { ElMessage.warning('至少填写一条完整条件'); return }
  if (!规则动作[编辑.type].includes(编辑.action)) { ElMessage.warning('请选择有效执行动作'); return }
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8'
  const 保存项: 订单规则 = JSON.parse(JSON.stringify(编辑)) as 订单规则
  保存项.id = 编辑Id.value || `RULE-DEMO-${Date.now()}`; 保存项.name = 编辑.name.trim(); 保存项.updatedAt = now
  const 索引 = 规则.value.findIndex(项 => 项.id === 编辑Id.value)
  if (索引 >= 0) { 保存项.version += 1; 规则.value[索引] = 保存项 } else 规则.value.push(保存项)
  记录(`${索引 >= 0 ? '更新' : '创建'} ${保存项.name}，版本 v${保存项.version}；${保存项.enabled ? '演示启用' : '未启用'}`)
  编辑打开.value = false; ElMessage.success('规则已保存到本次演示会话')
}
async function 切换启停(项: 订单规则) {
  try { await ElMessageBox.confirm(`${项.enabled ? '停用' : '启用'}“${项.name}”后，后续本地试算将${项.enabled ? '跳过' : '纳入'}此规则。已生成执行快照不变。`, '确认规则变更', { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  项.enabled = !项.enabled; 项.version += 1; 项.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8'; 记录(`${项.enabled ? '启用' : '停用'} ${项.name}，版本 v${项.version}`)
}
function 调整优先级(项: 订单规则, 偏移: number) {
  const 同类 = 规则.value.filter(条 => 条.type === 项.type).sort((a,b) => a.priority-b.priority); const 索引 = 同类.findIndex(条 => 条.id === 项.id); const 目标 = 同类[索引 + 偏移]; if (!目标) return
  const 原优先级 = 项.priority; 项.priority = 目标.priority; 目标.priority = 原优先级; 项.version++; 目标.version++
  项.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8'; 目标.updatedAt = 项.updatedAt
  记录(`调整 ${项.name} 优先级 ${原优先级} → ${项.priority}；同时调整 ${目标.name}`)
}
function 开始试算() { 试算订单.value ||= 共享订单.value.find(项 => 项.processingStatus === '待审核')?.systemOrderNo || 共享订单.value[0]?.systemOrderNo || ''; 试算结果.value = undefined; 试算打开.value = true }
function 执行试算() { const 订单 = 共享订单.value.find(项 => 项.systemOrderNo === 试算订单.value); if (!订单) return; 已试算订单.value = 订单.systemOrderNo; 已试算类型.value = 当前类型.value; 试算结果.value = 试算规则(JSON.parse(JSON.stringify(规则.value)) as 订单规则[], 订单, 当前类型.value); 记录(`执行 ${当前类型.value} 试算，订单 ${订单.systemOrderNo}，候选 ${试算结果.value.hit?.name || '无'}，门禁 ${试算结果.value.gates.length} 项；未写入订单`) }
function 条件选项(field: 条件字段) { return [...new Set(共享订单.value.map(项 => field === 'countryCode' ? 项.address.countryCode : 项[field]))] }
function 上下边界(项: 订单规则, 偏移: number) { const 同类 = 规则.value.filter(条 => 条.type === 项.type).sort((a,b) => a.priority-b.priority); const 索引 = 同类.findIndex(条 => 条.id === 项.id); return 索引 + 偏移 < 0 || 索引 + 偏移 >= 同类.length }
</script>

<template>
  <main class="规则页面">
    <header class="页首" v-prototype="标注('overview', '订单规则配置范围', '页面', '当前制作审单、分仓和订单标发规则。规则条件、动作及冲突策略仍属评审方案。', ['保持三类规则独立；分仓结果与物流选择的责任关系待确认。', '不配置平台特有原值、SKU 配对、库存同步或自动取消。'])"><div><h1>订单规则</h1><p>维护适用条件、执行顺序与命中结果</p></div><div><ElButton @click="日志打开 = true">变更记录</ElButton><ElButton type="primary" :icon="Plus" @click="打开编辑()">新建规则</ElButton></div></header>
    <ElAlert class="评审提示" title="规则配置与试算为评审方案" description="样例仅在当前会话生效。优先级、条件组合、冲突策略与执行权限待确认；试算不会自动修改订单。" type="info" :closable="false" show-icon />
    <section class="规则主体">
      <aside v-prototype="标注('categories', '三类规则', '页面', '复用当前产品规划的三类优先规则，暂不增设独立物流规则。', ['按类型筛选与排序，跨类型不比较优先级。'])"><div class="分组标题"><ElIcon><Setting /></ElIcon>规则类型</div><button v-for="类型 in 类型列表" :key="类型" :class="{ active: 当前类型 === 类型 }" @click="当前类型 = 类型; 关键词 = ''; 状态 = ''"><span>{{ 类型 }}</span><b>{{ 规则.filter(项 => 项.type === 类型).length }}</b></button><div class="侧边说明">业务门禁始终生效<p>规则命中不代表订单可立即审核、推仓或标发。</p></div></aside>
      <div class="规则内容"><div class="内容标题"><div><h2>{{ 当前类型 }}</h2><span>优先级数值越小越先匹配 · 仅演示顺序</span></div><ElButton :icon="VideoPlay" @click="开始试算">规则试算</ElButton></div>
        <div class="搜索栏"><ElInput v-model="关键词" placeholder="搜索规则名称" clearable :prefix-icon="Search"/><ElSelect v-model="状态" placeholder="全部状态" clearable><ElOption label="演示启用" value="true"/><ElOption label="已停用" value="false"/></ElSelect><span>共 {{ 列表.length }} 条</span></div>
        <ElTable :data="列表" row-key="id">
          <ElTableColumn label="优先级" width="110"><template #default="{ row }"><div class="优先级"><b>{{ row.priority }}</b><ElButton :icon="ArrowUp" link :disabled="上下边界(row as 订单规则, -1)" aria-label="上移规则" @click="调整优先级(row as 订单规则, -1)"/><ElButton :icon="ArrowDown" link :disabled="上下边界(row as 订单规则, 1)" aria-label="下移规则" @click="调整优先级(row as 订单规则, 1)"/></div></template></ElTableColumn>
          <ElTableColumn label="规则名称 / 条件" min-width="260"><template #default="{ row }"><ElButton link type="primary" @click="打开编辑(row as 订单规则)">{{ row.name }}</ElButton><div class="条件摘要"><ElTag size="small" type="info">{{ row.mode }}</ElTag><span v-for="(条件, index) in row.conditions" :key="index">{{ 条件字段名[条件.field as 条件字段] }} {{ 条件.operator }} {{ 条件.value }}{{ Number(index) < row.conditions.length - 1 ? '；' : '' }}</span></div></template></ElTableColumn>
          <ElTableColumn label="执行动作" min-width="180"><template #default="{ row }">{{ row.action }}<small>候选动作 · 通过业务门禁后适用</small></template></ElTableColumn>
          <ElTableColumn label="状态 / 版本" min-width="130"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'" effect="light">{{ row.enabled ? '演示启用' : '已停用' }}</ElTag><small>v{{ row.version }}</small></template></ElTableColumn>
          <ElTableColumn label="操作" width="125" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="打开编辑(row as 订单规则)">编辑</ElButton><ElButton link :type="row.enabled ? 'warning' : 'primary'" @click="切换启停(row as 订单规则)">{{ row.enabled ? '停用' : '启用' }}</ElButton></template></ElTableColumn>
          <template #empty><ElEmpty description="暂无符合条件的规则" :image-size="65"><ElButton @click="关键词 = ''; 状态 = ''">清空筛选</ElButton></ElEmpty></template>
        </ElTable>
        <div class="匹配说明" v-prototype="标注('priority', '执行顺序与冲突策略', '待确认', '数值较小优先，首条命中作为候选是原型假设，尚未形成生产执行决定。', ['上移/下移交换同类两条规则优先级并记录版本。', '停用规则在试算中显示跳过；条件命中后仍独立检查业务门禁。'])"><strong>本次试算采用的假设</strong><p>同类规则按优先级从小到大检查，首条命中作为候选结果；全部命中轨迹均保留。未命中时返回“无候选规则”，交由人工核对。</p><span>待确认：多规则叠加、默认规则、生效时间、团队权限与版本发布方式。</span></div>
      </div>
    </section>
    <ElDialog v-model="编辑打开" :title="编辑Id ? '编辑规则' : '新建规则'" width="min(800px, calc(100vw - 80px))" :close-on-click-modal="false" append-to-body>
      <ElForm label-position="top" class="编辑表单" v-prototype="标注('editor', '条件与动作编辑', '交互', '通过明确的字段、运算符和值构成规则，不允许空条件静默命中全部订单。', ['新建默认为停用，名称在同类规则中唯一。', '全部满足执行 AND，任一满足执行 OR；没有条件时无法保存。', '编辑保存产生新版本；点击取消不修改原规则。'])"><div class="表单双列"><ElFormItem label="规则名称" required><ElInput v-model="编辑.name" maxlength="40" show-word-limit placeholder="为规则填写清晰的业务名称"/></ElFormItem><ElFormItem label="规则类型"><ElInput :model-value="编辑.type" disabled/></ElFormItem></div><ElFormItem label="匹配方式"><ElRadioGroup v-model="编辑.mode"><ElRadioButton value="全部满足">全部满足（AND）</ElRadioButton><ElRadioButton value="任一满足">任一满足（OR）</ElRadioButton></ElRadioGroup></ElFormItem><ElFormItem label="适用条件" required><div class="条件编辑"><div v-for="(条件, index) in 编辑.conditions" :key="index" class="条件行"><span>{{ index + 1 }}</span><ElSelect v-model="条件.field" aria-label="条件字段" @change="条件.value = ''"><ElOption v-for="(名称, key) in 条件字段名" :key="key" :label="名称" :value="key"/></ElSelect><ElSelect v-model="条件.operator" aria-label="比较方式"><ElOption label="等于" value="等于"/><ElOption label="不等于" value="不等于"/></ElSelect><ElSelect v-model="条件.value" filterable allow-create default-first-option placeholder="选择或输入条件值" aria-label="条件值"><ElOption v-for="值 in 条件选项(条件.field)" :key="值" :label="值" :value="值"/></ElSelect><ElButton :icon="Delete" text :disabled="编辑.conditions.length === 1" aria-label="删除条件" @click="编辑.conditions.splice(index, 1)"/></div><ElButton link type="primary" :icon="Plus" @click="编辑.conditions.push({ field: 'countryCode', operator: '等于', value: '' })">添加条件</ElButton></div></ElFormItem><ElFormItem label="候选执行动作" required><ElSelect v-model="编辑.action" style="width: 100%"><ElOption v-for="动作 in 规则动作[编辑.type]" :key="动作" :label="动作" :value="动作"/></ElSelect></ElFormItem><ElFormItem label="业务说明"><ElInput v-model="编辑.note" type="textarea" :rows="2" placeholder="说明适用业务与尚待确认的边界" maxlength="300"/></ElFormItem><ElAlert title="业务门禁不能由规则配置关闭" description="未通过订单级 PAID 准入、准入后付款状态变化已转异常、最终取消、系统外履约、有效出库不足或平台结果待核查等情况，仍由对应业务对象及平台适配规则拦截；付款时间不作为门禁。" type="info" :closable="false"/></ElForm><template #footer><ElButton @click="编辑打开 = false">取消</ElButton><ElButton type="primary" @click="保存">保存规则</ElButton></template>
    </ElDialog>
    <ElDrawer v-model="试算打开" title="规则试算" size="min(740px, calc(100vw - 84px))" append-to-body>
      <section v-prototype="标注('simulation', '规则试算与命中轨迹', '交互', '选择一个本地标准订单，仅运行当前规则类型的条件计算。', ['试算展示未启用、未命中、候选及后续命中结果。', '规则候选与业务门禁分别显示；阻断时不写入订单。', '试算记录来源订单号与规则版本，切换订单后须再次点击试算。'])"><ElAlert title="只读试算，不执行订单动作" :description="`当前类型：${当前类型}。试算采用当前会话的规则版本与虚构订单。`" type="info" :closable="false"/><div class="试算选择"><ElSelect v-model="试算订单" filterable placeholder="选择演示订单"><ElOption v-for="订单 in 共享订单" :key="订单.systemOrderNo" :label="`${订单.systemOrderNo} · ${订单.platformCode} · ${订单.processingStatus || '未进入处理'}`" :value="订单.systemOrderNo"/></ElSelect><ElButton type="primary" @click="执行试算">开始试算</ElButton></div></section>
      <template v-if="试算结果"><div class="试算结果"><small>{{ 已试算订单 }} · {{ 已试算类型 }}</small><h3>{{ 试算结果.hit ? '候选：' + 试算结果.hit.name : '无候选规则' }}</h3><p>{{ 试算结果.hit?.action || '请检查规则条件或交由人工核对' }}</p><ElAlert :title="试算结果.gates.length ? '业务门禁阻断执行' : '本地演示门禁通过'" :description="试算结果.gates.join('；') || '仅返回候选动作。正式执行还需要实时平台、库存、权限与版本校验。'" :type="试算结果.gates.length ? 'warning' : 'success'" :closable="false"/></div><h3 class="轨迹标题">匹配轨迹</h3><ElTimeline><ElTimelineItem v-for="条 in 试算结果.trace" :key="条.rule.id" :type="条.rule.id === 试算结果.hit?.id ? 'primary' : 'info'"><div class="轨迹行"><strong>{{ 条.rule.priority }} · {{ 条.rule.name }}</strong><ElTag size="small" :type="!条.rule.enabled ? 'info' : 条.matched ? 'success' : 'info'">{{ !条.rule.enabled ? '停用跳过' : 条.matched ? (条.rule.id === 试算结果.hit?.id ? '首个命中' : '后续命中') : '未命中' }}</ElTag></div><p>版本 v{{ 条.rule.version }} · {{ 条.rule.mode }}<br/><span v-for="(条件,index) in 条.rule.conditions" :key="index">{{ 条件字段名[条件.field] }} {{ 条件.operator }} {{ 条件.value }}；</span></p></ElTimelineItem></ElTimeline></template><ElEmpty v-else description="选择订单后点击开始试算" :image-size="80"/>
    </ElDrawer>
    <ElDrawer v-model="日志打开" title="规则变更与试算记录" size="min(560px, calc(100vw - 84px))" append-to-body><ElAlert title="本次会话记录 · UTC+8" description="角色权限、团队共享与正式审计存储待研发评审。" type="info" :closable="false"/><ElTimeline v-if="日志.length" class="日志列表"><ElTimelineItem v-for="(条,index) in 日志" :key="index" :timestamp="条.time">{{ 条.text }}</ElTimelineItem></ElTimeline><ElEmpty v-else description="本次会话还没有变更" :image-size="75"/></ElDrawer>
  </main>
</template>

<style scoped>
.规则页面{padding:20px;min-width:0;height:100%;overflow:auto;background:#f3f5f8;color:#2d3c50}.页首{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:20px}.页首 h1{font-size:21px;margin:0 0 8px}.页首 p{font-size:13px;color:#8994a4;margin:0}.评审提示{margin-bottom:18px}.规则主体{display:flex;min-width:0;background:#fff;border:1px solid #e5eaf1;border-radius:8px;overflow:hidden;min-height:510px}aside{width:180px;flex-shrink:0;background:#fbfcfe;border-right:1px solid #eaf0f5;padding:20px 12px}.分组标题{font-size:12px;display:flex;align-items:center;gap:8px;color:#929cad;padding:0 12px 18px}aside button{display:flex;justify-content:space-between;width:100%;padding:13px 12px;margin-bottom:6px;border:0;background:none;color:#58677c;font-size:13px;border-radius:5px;cursor:pointer}aside button.active{background:#eaf2ff;color:#2674d8}aside b{font-weight:400;font-size:11px}.侧边说明{border-top:1px solid #e8edf3;margin:28px 10px 0;padding-top:20px;font-size:12px;color:#7e8ca0}.侧边说明 p{font-size:11px;color:#98a3b3;line-height:1.9}.规则内容{flex:1;min-width:0}.内容标题{display:flex;justify-content:space-between;align-items:center;padding:22px 20px}.内容标题 h2{font-size:16px;margin:0 0 7px}.内容标题 span{font-size:12px;color:#8995a6}.搜索栏{display:flex;align-items:center;gap:10px;padding:0 20px 20px}.搜索栏>.el-input{width:240px}.搜索栏>.el-select{width:155px}.搜索栏>span{margin-left:auto;color:#8d99a9;font-size:12px}.el-table{font-size:12px}.el-table :deep(th.el-table__cell){background:#f8fafc;color:#7e8c9f;font-weight:500}.el-table :deep(td.el-table__cell){padding:18px 0}.优先级{display:flex;align-items:center;gap:3px}.优先级 b{font-weight:500;min-width:24px}.优先级 .el-button+.el-button{margin-left:0}.条件摘要{font-size:11px;line-height:1.9;color:#92a0b1;margin-top:8px;display:flex;flex-wrap:wrap;gap:4px}small{display:block;color:#96a0af;font-size:11px;line-height:1.8;margin-top:6px}.匹配说明{margin:24px 20px;padding:16px 18px;border:1px solid #eaf0f7;background:#f9fbfe;border-radius:6px;font-size:12px;color:#738198}.匹配说明 p{line-height:1.9;margin:8px 0}.匹配说明 span{color:#a08755;font-size:11px}.表单双列{display:grid;grid-template-columns:2fr 1fr;gap:20px}.条件编辑{width:100%;border:1px solid #e6ecf3;padding:14px;background:#f9fbfd;border-radius:6px}.条件行{display:grid;grid-template-columns:20px 1fr 90px 1.3fr 30px;gap:8px;align-items:center;margin-bottom:12px}.条件行>span{font-size:11px;color:#94a1b2}.试算选择{display:flex;gap:10px;margin-top:20px}.试算选择 .el-select{flex:1}.试算结果{border:1px solid #e6edf7;background:#f9fbfe;border-radius:6px;padding:18px;margin:24px 0}.试算结果 h3{font-size:16px;margin:10px 0}.试算结果 p{font-size:13px;color:#718197;margin-bottom:18px}.轨迹标题{font-size:14px;margin-bottom:22px}.轨迹行{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px}.el-timeline{padding-left:12px}.el-timeline p{font-size:12px;color:#8e9bad;line-height:1.9}.日志列表{margin-top:24px}
@media(max-width:1300px){.规则页面{padding:16px}aside{width:154px;padding:18px 8px}.内容标题{padding:20px 16px}.搜索栏{padding:0 16px 16px;flex-wrap:wrap}.搜索栏>.el-input{width:220px}.页首{flex-wrap:wrap}}
@media(max-width:950px){.规则主体{display:block}aside{display:flex;width:auto;gap:8px;padding:10px;border-right:0;border-bottom:1px solid #eaf0f5}.分组标题,.侧边说明{display:none}aside button{margin:0}.条件行{grid-template-columns:18px 1fr 90px 1fr 30px}}
</style>
