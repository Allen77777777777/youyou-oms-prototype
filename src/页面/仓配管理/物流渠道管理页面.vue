<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Search, Setting, Connection, CircleCheck, CircleClose, Refresh } from '@element-plus/icons-vue'
import { ElAlert, ElButton, ElDialog, ElDrawer, ElForm, ElFormItem, ElIcon, ElInput, ElMessage, ElOption, ElSelect, ElTable, ElTableColumn, ElTag } from 'element-plus'
import type { 原型标注 } from '@/类型/标注'
import { 仓储服务商, 校验物流渠道, 演示时间, type 物流渠道 } from './仓配模型'
import { 渠道会话, 渠道会话审计 } from './仓配会话'

const 渠道列表 = 渠道会话
const 筛选 = reactive({ keyword: '', provider: '', state: '' })
const 已应用 = reactive({ ...筛选 })
const 编辑打开 = ref(false)
const 当前详情 = ref<物流渠道>()
const 详情打开 = ref(false)
const 新建 = ref(false)
const 表单错误 = ref('')
const 草稿 = reactive<物流渠道>({ id: '', name: '', code: '', provider: '', account: '', warehouse: '', providerCode: '', countries: [], enabled: false, labelMode: '仓库回传', updatedAt: '' })
const 审计 = 渠道会话审计
const 状态确认 = ref<物流渠道>()
const 状态确认打开 = ref(false)
const 国家 = [{ code: 'US', name: '美国 US' }, { code: 'CA', name: '加拿大 CA' }, { code: 'GB', name: '英国 GB' }, { code: 'DE', name: '德国 DE' }, { code: 'FR', name: '法国 FR' }]
const 已启用数 = computed(() => 渠道列表.value.filter(c => c.enabled).length)
const 查询结果 = computed(() => 渠道列表.value.filter(c => (!已应用.keyword.trim() || [c.name, c.code, c.providerCode].some(v => v.toLowerCase().includes(已应用.keyword.trim().toLowerCase()))) && (!已应用.provider || c.provider === 已应用.provider) && (!已应用.state || c.enabled === (已应用.state === '启用'))))
const 渠道标注说明: Record<string, Partial<原型标注>> = {
  overview: {
    前置条件: ['从 OMS → 仓配管理 → 物流渠道管理进入；当前加载浏览器会话内的虚构渠道配置。'],
    触发方式: ['进入页面查看全量统计；点击新增渠道打开空白配置草案，点击刷新按已填写条件重查本地列表。'],
    系统动作: ['按渠道 ID 展示配置，统计全量渠道、业务启用、停用和服务商数量；切中台页签保留会话配置，浏览器刷新重新初始化。'],
    成功结果: ['用户可分辨标准代码、服务商账号、仓库和外部渠道代码；业务启用旁仍显示组合待核对、尚不可执行。'],
    异常处理: ['本地配置不证明外部渠道、账号或平台映射可用；中台是否已有权威维护入口、配置读写归属和真实权限仍待评审。'],
    验收要点: ['新增一条草案后全量和停用数量各加 1；切换中台页签返回后草案仍在；刷新浏览器后恢复虚构初始配置。'],
  },
  filters: {
    前置条件: ['列表已加载；搜索框、服务商和启停选项可以任意组合，空值表示该项不限制。'],
    触发方式: ['输入名称/代码后点击搜索或按 Enter；点击重置清空三个条件；刷新列表重新应用当前输入。'],
    系统动作: ['名称、标准代码和外部代码进行不区分大小写的包含匹配，并与服务商及业务启停条件取交集。'],
    成功结果: ['列表标题数量随筛选结果更新；顶部卡片仍统计全量会话配置，不代表当前结果数量。'],
    异常处理: ['无匹配数据时保留筛选值与空列表，不改写任何渠道；搜索条件不查询外部 API，也不代表权限过滤已经实现。'],
    验收要点: ['用部分标准代码搜索，再叠加不匹配服务商应为空；清空或重置能恢复记录；启用筛选只判断业务开关，不把待核对渠道判为可执行。'],
  },
  mapping: {
    前置条件: ['列表中存在本地渠道记录；每条记录具有稳定 ID，外部代码仅在所属服务商、账号与仓库范围解释。'],
    触发方式: ['点击渠道名称或详情打开侧边详情；点击编辑复制当前配置进入表单；点击启用/停用进入确认。'],
    系统动作: ['详情显示当前映射、国家、面单来源和更新时间；本次会话日志按当前标准渠道代码筛选，尚无日志时明确展示空状态。'],
    成功结果: ['同一条记录的名称、标准代码、服务商账号、仓库和外部代码可以一并核对；详情不会把当前业务启用解释为接口验证通过。'],
    异常处理: ['样例国家范围与外部代码均未验证；实际组合键、主数据归属及跨账号同代码复用规则待评审，原型不自动同步或删除服务商配置。'],
    验收要点: ['从不同服务商的同名标准配送行打开详情，账号和外部代码对应当前行；编辑后日志出现在该渠道详情，不串入其他渠道。'],
  },
  scope: {
    前置条件: ['评审人员查看候选渠道配置范围；已确认复用授权、平台面单排除与候选配置模型分开理解。'],
    触发方式: ['展开本条标注核对本次原型的已实现能力与尚未接入的能力。'],
    系统动作: ['页面只提供三方仓物流、仓库回传模式的本地配置；不存在真实账号授权、渠道查询、比价、购买面单或生产发布操作。'],
    成功结果: ['新增、编辑和启停可以评审，但所有组合持续标为待核对，不向订单处理自动发放可执行资格。'],
    异常处理: ['实际仓库账号关联、国家/商品限制、平台承运商映射、验证证据、在途影响和发布权限尚待评审；不能用本地开关解除外部失败阻断。'],
    验收要点: ['表单不存在 token、费用报价或平台面单输入；启用后仍显示组合待核对；保存配置不修改已有出库单的失败原因或执行快照。'],
  },
  form: {
    前置条件: ['点击新增生成默认停用的空草案；点击编辑先复制当前渠道，未保存输入不直接写回列表。生产配置权限尚未接入。'],
    触发方式: ['输入名称、代码、服务商、账号、仓库、外部代码和国家后点击保存；点击取消关闭草案。'],
    系统动作: ['名称、标准代码和外部代码去除首尾空格；依次校验必填、2–40 位大写代码格式、至少一个国家、标准代码唯一及映射组合唯一。', '面单模式固定仓库回传；编辑既有记录时标准代码不可修改。合法保存才写回会话对象、更新时间并追加演示日志。'],
    成功结果: ['合法新增显示在列表顶部且保持停用；合法编辑更新原 ID 的配置；保存后关闭表单并提示本地成功。'],
    异常处理: ['真实账号与仓库依赖关系、并发版本、外部能力验证和配置发布未接入；本地校验成功不证明组合可用于生产履约。'],
    验收要点: ['未保存先取消，列表与日志不变；新增保存后为停用；编辑代码控件不可输入；输入重复映射时草案保留且不追加日志。'],
  },
  toggle: {
    前置条件: ['用户选中一条已有渠道；当前开关只表示本地业务启停，实际组合可用性仍为待核对。'],
    触发方式: ['点击行内启用/停用展示确认框，再点击确认才执行；点击取消不改变当前开关。'],
    系统动作: ['启用前再次运行本地完整性与唯一校验；通过后更新 enabled、UTC+8 时间并追加会话日志。停用不删除渠道，也不调用外部服务。'],
    成功结果: ['业务启停标签和全量统计更新，但组合仍显示尚不可执行；详情能够查到对应启用/停用日志。'],
    异常处理: ['启用校验失败显示具体原因并保留确认框；已生成履约快照、在途出库和物流单不被自动取消或重规划。', '生产版待审/待推/在途影响预览、审批、前后值及变更原因采集尚待评审，当前日志是本地演示摘要。'],
    验收要点: ['确认前后分别核对开关、时间和日志；取消不更改；停用后原出库单数量及业务状态不变；启用不解除共享失败单阻断。'],
  },
}
function 标注(id: string, 标题: string, 说明: string, extra: Partial<原型标注> = {}): 原型标注 {
  const 细则 = 渠道标注说明[id] || {}
  const 结果: 原型标注 = { id: `oms.channels.${id}`, 标题, 说明, 分类: '交互', 事实等级: '合理假设', 版本: '2026-09-12', 状态: '待评审', prd引用: ['PRD/物流渠道管理功能PRD.md#6-功能与操作'], ...细则, ...extra }
  for (const key of ['前置条件', '触发方式', '系统动作', '成功结果', '异常处理', '数据来源', '权限与审计', '验收要点'] as const) {
    结果[key] = [...new Set([...(细则[key] || []), ...(extra[key] || [])])]
  }
  return 结果
}
function 查询() { Object.assign(已应用, 筛选) }
function 重置() { Object.assign(筛选, { keyword: '', provider: '', state: '' }); 查询() }
function 编辑(channel?: 物流渠道) {
  新建.value = !channel; 表单错误.value = ''
  Object.assign(草稿, channel ? { ...channel, countries: [...channel.countries] } : { id: `channel-local-${Date.now()}`, name: '', code: '', provider: '', account: '', warehouse: '', providerCode: '', countries: [], enabled: false, labelMode: '仓库回传', updatedAt: '' })
  编辑打开.value = true
}
function 保存() {
  草稿.name = 草稿.name.trim(); 草稿.code = 草稿.code.trim(); 草稿.providerCode = 草稿.providerCode.trim()
  表单错误.value = 校验物流渠道(草稿, 渠道列表.value)
  if (表单错误.value) return
  const 原渠道 = 渠道列表.value.find(c => c.id === 草稿.id)
  const 保存值 = { ...草稿, countries: [...草稿.countries], updatedAt: 演示时间() }
  if (原渠道) Object.assign(原渠道, 保存值)
  else 渠道列表.value.unshift(保存值)
  审计.value.unshift({ code: 草稿.code, action: 新建.value ? '新增渠道' : '编辑渠道', time: 保存值.updatedAt, detail: `演示操作员保存渠道配置；状态：${草稿.enabled ? '启用' : '停用'}；已生成履约单的执行快照保持历史取值。` })
  编辑打开.value = false; ElMessage.success(新建.value ? '已保存本地渠道草案，当前为停用；核对后可演示启用' : '已保存本地渠道配置')
}
function 切换状态(channel: 物流渠道) { 状态确认.value = channel; 状态确认打开.value = true }
function 确认状态() {
  const channel = 状态确认.value
  if (!channel) return
  const error = !channel.enabled ? 校验物流渠道(channel, 渠道列表.value) : ''
  if (error) return void ElMessage.error(error)
  channel.enabled = !channel.enabled; channel.updatedAt = 演示时间()
  审计.value.unshift({ code: channel.code, action: channel.enabled ? '启用渠道' : '停用渠道', time: channel.updatedAt, detail: `演示操作员确认${channel.enabled ? '启用' : '停用'} ${channel.name}。只演示后续路由可选性，不改写历史出库单。` })
  状态确认打开.value = false; ElMessage.success(`已在本地${channel.enabled ? '启用' : '停用'}该渠道`)
}
function 查看(channel: 物流渠道) { 当前详情.value = channel; 详情打开.value = true }
</script>

<template>
  <div class="仓配页面">
    <header v-prototype="标注('overview', '物流渠道标准化配置', '本页维护候选标准渠道及服务商账号、仓库、外部渠道代码映射。复用既有仓库授权，不导入令牌、不建设库存同步。', { 分类: '页面', 事实等级: '合理假设', 数据来源: ['仓库与物流主数据、现有授权账号引用；具体读写契约待评审。'] })" class="仓配页头"><div><div class="仓配面包屑">OMS <span>/</span> 仓配管理</div><h1>物流渠道管理 <ElTag type="info" size="small" effect="plain">配置草案 · 待评审</ElTag></h1><p>统一渠道与仓库映射，供分仓和物流选择使用。</p></div><div class="仓配页头操作"><span>本地虚构配置 · 时间 UTC+8</span><ElButton :icon="Refresh" @click="查询">刷新列表</ElButton><ElButton type="primary" :icon="Plus" @click="编辑()">新增渠道</ElButton></div></header>
    <div class="仓配指标"><button @click="重置"><ElIcon class="blue"><Connection /></ElIcon><span>全部物流渠道<strong>{{ 渠道列表.length }}<small>个</small></strong></span></button><button @click="筛选.state = '启用'; 查询()"><ElIcon class="green"><CircleCheck /></ElIcon><span>启用中<strong>{{ 已启用数 }}<small>个</small></strong></span></button><button @click="筛选.state = '停用'; 查询()"><ElIcon class="amber"><CircleClose /></ElIcon><span>已停用<strong>{{ 渠道列表.length - 已启用数 }}<small>个</small></strong></span></button><button @click="重置"><ElIcon class="blue"><Setting /></ElIcon><span>仓储服务商<strong>{{ new Set(渠道列表.map(c => c.provider)).size }}<small>家</small></strong></span></button></div>
    <section class="仓配卡片">
      <div v-prototype="标注('filters', '渠道查询', '按名称、标准代码、外部渠道代码搜索，叠加服务商和启停状态。', { 成功结果: ['搜索取条件交集；重置恢复全部渠道。'] })" class="仓配筛选"><label class="宽查询"><span>渠道查询</span><ElInput v-model="筛选.keyword" :prefix-icon="Search" clearable placeholder="渠道名称 / 标准代码 / 服务商渠道代码" @keyup.enter="查询" /></label><label><span>仓储服务商</span><ElSelect v-model="筛选.provider" clearable placeholder="全部服务商"><ElOption v-for="provider in 仓储服务商" :key="provider" :value="provider" :label="provider" /></ElSelect></label><label><span>使用状态</span><ElSelect v-model="筛选.state" clearable placeholder="全部状态"><ElOption label="启用" value="启用" /><ElOption label="停用" value="停用" /></ElSelect></label><div class="仓配筛选按钮"><ElButton type="primary" @click="查询">搜索</ElButton><ElButton @click="重置">重置</ElButton></div></div>
      <div class="仓配作业栏"><span>渠道列表 <b>{{ 查询结果.length }}</b></span><span class="仓配表格提示">渠道类型：三方仓物流 · 面单来源：仓库回传</span></div>
      <ElTable v-prototype="标注('mapping', '标准渠道与外部代码的映射', '渠道代码、服务商、授权账号、仓库和服务商渠道代码分别保存；不把外部渠道代码当作全局唯一 ID。', { 分类: '字段', 数据来源: ['具体主数据归属尚待接口评审，原型使用虚构配置。'], 验收要点: ['详情完整展示账号、仓库和代码组合；列表按渠道 ID 唯一。'] })" :data="查询结果" class="仓配表格" row-key="id"><ElTableColumn label="渠道名称 / 标准代码" min-width="225" fixed="left"><template #default="{ row }"><button class="单号按钮" @click="查看(row as 物流渠道)">{{ row.name }}</button><div class="次行 数字文本">{{ row.code }}</div></template></ElTableColumn><ElTableColumn label="服务商 / 账号" min-width="150"><template #default="{ row }">{{ row.provider }}<div class="次行">{{ row.account }}</div></template></ElTableColumn><ElTableColumn prop="warehouse" label="发货仓库" min-width="130" /><ElTableColumn label="外部渠道 / 面单模式" min-width="185"><template #default="{ row }"><span class="数字文本">{{ row.providerCode }}</span><div class="次行">{{ row.labelMode }} · 三方仓物流</div></template></ElTableColumn><ElTableColumn label="目的国家 / 地区" min-width="145"><template #default="{ row }"><div class="仓配标签组"><ElTag v-for="country in row.countries" :key="country" size="small" type="info" effect="plain">{{ country }}</ElTag></div></template></ElTableColumn><ElTableColumn label="业务启停 / 可用性" width="145"><template #default="{ row }"><ElTag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</ElTag><div class='次行'>组合待核对 · 尚不可执行</div></template></ElTableColumn><ElTableColumn label="最近更新 UTC+8" min-width="160"><template #default="{ row }"><span class="时间文本">{{ row.updatedAt }}</span></template></ElTableColumn><ElTableColumn label="操作" width="155" fixed="right"><template #default="{ row }"><ElButton link type="primary" @click="查看(row as 物流渠道)">详情</ElButton><ElButton link type="primary" @click="编辑(row as 物流渠道)">编辑</ElButton><ElButton link :type="row.enabled ? 'danger' : 'primary'" @click="切换状态(row as 物流渠道)">{{ row.enabled ? '停用' : '启用' }}</ElButton></template></ElTableColumn></ElTable>
      <div v-prototype="标注('scope', '配置范围与尚待确认的能力', '当前创建和维护的是三方仓物流候选配置。API物流、平台面单、费用报价、计费重量、配送时效承诺、渠道规则阈值均未在此默认开放。', { 分类: '待确认', 事实等级: '待确认', 验收要点: ['不得把虚构渠道字段、账号能力或目的地范围作为已完成接入的证据。'] })" class="仓配作业栏"><span class="仓配表格提示">配置保留于当前浏览器会话。实际渠道代码、覆盖地区与账号可用性需按服务商逐项核验。</span></div>
    </section>

    <ElDrawer v-model="编辑打开" :title="新建 ? '新增物流渠道' : '编辑物流渠道'" :size="'min(690px, calc(100vw - 84px))'">
      <ElAlert type="info" :closable="false" title="渠道配置草案" description="复用中台已有仓库及账号引用。以下选项为本地虚构资料；新增渠道默认停用，保存不代表完成接口接入。" show-icon />
      <ElForm v-prototype="标注('form', '渠道新增编辑与校验', '保存前校验必填、渠道代码格式、代码唯一、外部映射组合唯一与至少一个目的地。新增默认停用；标准代码在编辑时固定。', { 分类: '交互', 前置条件: ['生产方案要求渠道配置权限并复用既有授权引用；当前原型只提供虚构选项，尚未接入权限校验。'], 系统动作: ['保存本地草案并追加操作日志；生产版应校验版本避免覆盖并发修改。'], 异常处理: ['校验失败保留已输入值，展示具体错误，不关闭表单。'], 验收要点: ['空字段、重复代码、重复映射、无国家、合法新增与编辑均覆盖。'] })" label-position="top" class="仓配渠道表单">
        <ElFormItem label="渠道名称" required class="跨列"><ElInput v-model="草稿.name" maxlength="60" show-word-limit placeholder="例如：演示仓标准配送" /></ElFormItem><ElFormItem label="标准渠道代码" required><ElInput v-model="草稿.code" maxlength="40" :disabled="!新建" placeholder="大写字母、数字、_、-" /></ElFormItem><ElFormItem label="仓储服务商" required><ElSelect v-model="草稿.provider" placeholder="选择服务商"><ElOption v-for="p in 仓储服务商" :key="p" :value="p" :label="p" /></ElSelect></ElFormItem><ElFormItem label="仓库账号引用" required><ElSelect v-model="草稿.account" placeholder="选择既有演示账号"><ElOption v-for="n in 3" :key="n" :value="`演示账号 ${String(n).padStart(2, '0')}`" :label="`演示账号 ${String(n).padStart(2, '0')}`" /></ElSelect></ElFormItem><ElFormItem label="发货仓库" required><ElSelect v-model="草稿.warehouse" placeholder="选择发货仓库"><ElOption v-for="warehouse in ['美西演示仓', '美东演示仓', '英国演示仓', '德国演示仓']" :key="warehouse" :value="warehouse" :label="warehouse" /></ElSelect></ElFormItem><ElFormItem label="服务商渠道代码" required><ElInput v-model="草稿.providerCode" maxlength="128" placeholder="填写外部服务代码（演示）" /></ElFormItem><ElFormItem label="面单获取模式"><ElInput model-value="仓库回传" disabled /></ElFormItem><ElFormItem label="目的国家 / 地区" required class="跨列"><ElSelect v-model="草稿.countries" multiple placeholder="选择目的国家或地区"><ElOption v-for="country in 国家" :key="country.code" :value="country.code" :label="country.name" /></ElSelect></ElFormItem>
      </ElForm>
      <div class="仓配配置预览"><strong>执行关系预览</strong><p>{{ 草稿.provider || '仓储服务商' }} / {{ 草稿.account || '仓库账号' }} → {{ 草稿.warehouse || '发货仓库' }}</p><p>{{ 草稿.name || '标准渠道' }} → {{ 草稿.providerCode || '服务商渠道代码' }} → 仓库回传面单与跟踪号</p><p>历史履约单继续使用当次执行快照；变更是否影响待推单的校验与重新规划规则待评审。</p></div>
      <ElAlert v-if="表单错误" :title="表单错误" type="error" :closable="false" class="仓配表单错误" show-icon />
      <template #footer><ElButton @click="编辑打开 = false">取消</ElButton><ElButton type="primary" @click="保存">保存{{ 新建 ? '草案' : '配置' }}</ElButton></template>
    </ElDrawer>

    <ElDrawer v-model="详情打开" title="物流渠道详情" :size="'min(690px, calc(100vw - 84px))'"><template v-if="当前详情"><div class="仓配详情标题"><div><p>{{ 当前详情.code }}</p><h2>{{ 当前详情.name }}</h2></div><ElTag :type="当前详情.enabled ? 'success' : 'info'">{{ 当前详情.enabled ? '启用' : '停用' }}</ElTag></div><div class="仓配配置预览"><strong>渠道映射</strong><p>{{ 当前详情.provider }} / {{ 当前详情.account }} / {{ 当前详情.warehouse }}</p><p>服务商渠道代码：{{ 当前详情.providerCode }}</p><p>物流类型：三方仓物流　面单来源：{{ 当前详情.labelMode }}</p><p>目的国家 / 地区：{{ 当前详情.countries.join('、') }}</p><p>更新时间：{{ 当前详情.updatedAt }} UTC+8</p></div><ElAlert :closable="false" type="info" title="配置不代表账号或接口已验证" description="仓库授权已由中台提供，具体渠道代码、适用国家与接口能力仍需验证。本页不展示或修改 token。" /><h3 class="仓配频道说明">本次会话操作记录</h3><ElTable :data="审计.filter(log => log.code === 当前详情?.code)" class="仓配表格"><ElTableColumn prop="action" label="操作" width="100" /><ElTableColumn prop="detail" label="说明" /><ElTableColumn prop="time" label="时间 UTC+8" width="165" /><template #empty><div class="仓配解释">尚无本次会话操作记录</div></template></ElTable></template><template #footer><ElButton @click="详情打开 = false">关闭</ElButton><ElButton type="primary" @click="编辑(当前详情)">编辑配置</ElButton></template></ElDrawer>

    <ElDialog v-model="状态确认打开" :title="状态确认?.enabled ? '确认停用渠道' : '确认启用渠道'" width="520px"><div v-if="状态确认" v-prototype="标注('toggle', '启停影响范围确认', '当前只演示业务启停，启用前重新校验本地配置，组合仍待核对。生产方案拟将停用渠道排除出新路由候选；在途影响与发布规则待评审。', { 分类: '规则', 交互规则: ['点击启用或停用后展示当前渠道名称、代码和影响说明；确认后才更改。'], 权限与审计: ['当前记录演示操作员、UTC+8 时间、标准渠道代码与操作摘要；生产版的动作权限、渠道 ID、前后值和变更原因采集待评审。'], 验收要点: ['取消确认不更改配置；停用不删除渠道记录、不自动撤销在途出库单。'] })"><p><strong>{{ 状态确认.name }}</strong></p><p class="仓配频道说明">标准代码：{{ 状态确认.code }}</p><ElAlert :closable="false" :type="状态确认.enabled ? 'warning' : 'info'" :title="状态确认.enabled ? '停用后不再用于后续路由选择' : '仅演示业务启用，组合可用性仍待核对'" description="启用不代表外部账号、渠道或平台映射已验证，也不会参与实际路由执行。历史单据保留快照，原型不重规划或取消在途单据。" /></div><template #footer><ElButton @click="状态确认打开 = false">取消</ElButton><ElButton :type="状态确认?.enabled ? 'danger' : 'primary'" @click="确认状态">确认{{ 状态确认?.enabled ? '停用' : '启用' }}</ElButton></template></ElDialog>
  </div>
</template>

<style scoped src="./仓配样式.css"></style>
