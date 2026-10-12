<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, CopyDocument, QuestionFilled } from '@element-plus/icons-vue'
import { ElButton, ElIcon, ElTag, ElTable, ElTableColumn, ElDrawer, ElDescriptions, ElDescriptionsItem, ElAlert, ElEmpty, ElMessage, ElTimeline, ElTimelineItem, ElPagination, ElDialog, ElTooltip, ElInput } from 'element-plus'
import { 共享订单, 仓库执行记录 } from '../订单处理/演示会话'
import { 获取平台状态说明 } from '../全渠道订单/订单工具'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 取得标发渠道, 取得标发出库, 取得标发准备单, 使用标发准备值, 标发字段阻断, 标发时效 } from './标发字段展示'
import { 格式化北京时间, 解析来源时刻 } from '../订单处理/时间展示工具'
import { 标发阻断原因, 标发状态列表, type 标发单, type 标发状态 } from './标发逻辑'
import { 共享标发单 } from './演示会话'
import { 标发动作阻断, 标发确认指纹, 标发下一步, 设置不标发, 不标发原因错误, type 标发动作, type 标发处理结果 } from './标发工作台模型'
import type { 原型标注 } from '@/类型/标注'
import MultiSelectFilter from '@/组件/筛选/多选筛选.vue'
import FieldSearch from '@/组件/筛选/字段搜索.vue'
import TimeRange from '@/组件/筛选/时间范围.vue'
import ListSort from '@/组件/筛选/列表排序.vue'
import { 标发搜索字段, 默认标发筛选, 校验标发筛选, 命中标发筛选, 排序标发单 } from './标发筛选'

const router = useRouter(), route = useRoute(), 单据 = 共享标发单
const 当前状态 = ref<标发状态 | '全部'>('全部')
const 筛选 = reactive(默认标发筛选()), 已应用 = reactive(默认标发筛选()), 仅待核查 = ref(false)
const 来源 = (单: 标发单) => 共享订单.value.find(订单 => 订单.systemOrderNo === 单.orderNo)
const 平台状态 = (单: 标发单) => { const 订单 = 来源(单); return 订单 ? 获取平台状态说明(订单).text : '—' }
const 履约 = (单: 标发单) => 来源(单)?.fulfillmentOrders.find(项 => 项.fulfillmentOrderNo === 单.fulfillmentNo)
const 渠道 = (单: 标发单) => 取得标发渠道(单, 来源(单), 渠道会话.value)
const 出库 = (单: 标发单) => 取得标发出库(单, 仓库执行记录.value)
const 准备值 = (单: 标发单) => 取得标发准备单(单, 来源(单), 渠道会话.value)
const 查询值 = (单: 标发单) => ({ ...准备值(单), shippedAt: 出库(单)?.出库事实?.shippedAt || '' })
const 阻断 = (单: 标发单) => [...new Set([...标发阻断原因(准备值(单), 来源(单)), ...标发字段阻断(单, 来源(单), 渠道会话.value, 仓库执行记录.value)])]
const 动作阻断 = (单: 标发单, 动作: 标发动作) => ['不标发', '查询结果'].includes(动作) ? 标发动作阻断(单, 动作, 来源(单)) : [...new Set([...标发动作阻断(准备值(单), 动作, 来源(单)), ...标发字段阻断(单, 来源(单), 渠道会话.value, 仓库执行记录.value)])]
const 确认指纹 = (单: 标发单) => ['不标发', '查询结果'].includes(当前动作.value) ? 标发确认指纹(单, 来源(单)) : JSON.stringify([标发确认指纹(单, 来源(单)), 标发确认指纹(准备值(单), 来源(单)), 履约(单), 渠道(单), 出库(单)])
const 当前时刻 = ref(Date.now())
let 计时器: ReturnType<typeof setInterval> | undefined
let 已挂载 = false
const 需要计时 = computed(() => route.path === '/oms/self-fulfillment/shipping-confirmation' && 单据.value.some(单 => !['标发成功', '无需标发'].includes(单.status) && 解析来源时刻(来源(单)?.shipByAt) !== undefined))
function 更新计时() {
  if (计时器 !== undefined) { clearInterval(计时器); 计时器 = undefined }
  当前时刻.value = Date.now()
  if (已挂载 && 需要计时.value) 计时器 = setInterval(() => { 当前时刻.value = Date.now() }, 1000)
}
onMounted(() => { 已挂载 = true; 更新计时() })
watch(需要计时, 更新计时)
onUnmounted(() => { 已挂载 = false; if (计时器 !== undefined) clearInterval(计时器) })
const 时效 = (单: 标发单) => 标发时效(单, 来源(单)?.shipByAt, 当前时刻.value)
const 时效说明 = '最晚发货时间取来源订单平台字段，统一按北京时间（UTC+8）显示。标发未完成时每秒更新剩余时间；成功或无需标发后停止。未取得时间不推算；该时间不代表独立标发截止时间。'
function 查看渠道(单: 标发单) { const channel = 渠道(单).channel; if (!channel) return void ElMessage.warning(渠道(单).error); void router.push({ path: '/oms/warehouse-delivery/logistics-channels', query: { channelId: channel.id } }) }
const 平台选项 = computed(() => [...new Set(单据.value.flatMap(单 => 来源(单) ? [来源(单)!.platformCode] : []))].map(值 => ({ value: 值, label: 值 })))
const 店铺选项 = computed(() => [...new Map(单据.value.flatMap(单 => {
  const 订单 = 来源(单)
  return 订单 && (!筛选.platform.length || 筛选.platform.includes(订单.platformCode)) ? [[JSON.stringify([订单.platformCode, 订单.storeId]), { value: JSON.stringify([订单.platformCode, 订单.storeId]), label: 订单.storeName }] as const] : []
})).values()])
watch(店铺选项, 选项 => { 筛选.store = 筛选.store.filter(值 => 选项.some(项 => 项.value === 值)) })
const 排序 = ref<{ field: string; direction: 'asc' | 'desc' }>({ field: '', direction: 'desc' })
const 排序字段 = [{ value: 'shippedAt', label: '实际发货时间', kind: 'time' as const }, { value: 'no', label: '标发单号', kind: 'text' as const }]
const 选中 = ref<标发单[]>([]), 详情 = ref<标发单>(), 抽屉 = ref(false), 正在执行 = ref(false)
const 页码 = ref(1), 每页 = ref(10), 表格 = ref<{ clearSelection: () => void }>()
const 筛选范围 = computed(() => 单据.value.filter(单 => 命中标发筛选(查询值(单), 已应用, 来源(单)) && (!仅待核查.value || 单.pendingVerification)))
const 结果 = computed(() => {
  const 范围 = 筛选范围.value.filter(单 => 当前状态.value === '全部' || 单.status === 当前状态.value)
  const 原单 = new Map(范围.map(单 => [单.no, 单]))
  return 排序标发单(范围.map(查询值), 排序.value).map(单 => 原单.get(单.no)!)
})
const 页数据 = computed(() => 结果.value.slice((页码.value - 1) * 每页.value, 页码.value * 每页.value))
const 状态数量 = (状态: string) => 状态 === '全部' ? 筛选范围.value.length : 筛选范围.value.filter(单 => 单.status === 状态).length
const 待核查数量 = computed(() => 单据.value.filter(单 => 命中标发筛选(查询值(单), 已应用, 来源(单)) && 单.pendingVerification).length)
const 色 = (状态: string) => ['标发成功', '成功'].includes(状态) ? 'success' : ['标发失败', '失败'].includes(状态) ? 'danger' : ['无需标发', '跳过'].includes(状态) ? 'info' : 状态 === '待标发' ? 'primary' : 'warning'
const 时间 = 格式化北京时间
const 最近尝试 = (单: 标发单) => 单.attempts[0]
const 成功时间 = (单: 标发单) => 单.status === '标发成功' ? 单.attempts.find(项 => ['标发成功', '核查确认成功'].includes(项.result))?.time : undefined
const 下一步 = (单: 标发单) => ['待标发', '标发失败'].includes(单.status) && !单.pendingVerification && 阻断(单).length ? '查看详情并修复条件' : 标发下一步(准备值(单), 来源(单))
const 简短原因 = (单: 标发单) => 单.pendingVerification ? '平台结果待核查 · 禁止重提' : 单.status === '无需标发' ? '' : 单.reason || (单.status === '待标发' && 阻断(单).length ? 阻断(单)[0] : '')
const 显示提交 = computed(() => ['全部', '待标发'].includes(当前状态.value))
const 显示重试 = computed(() => ['全部', '标发失败'].includes(当前状态.value))
const 显示核查 = computed(() => ['全部', '标发中', '标发失败'].includes(当前状态.value))
const 显示不标发 = computed(() => ['全部', '待标发', '标发失败'].includes(当前状态.value))
const 不标发门禁 = (单: 标发单) => 标发动作阻断(单, '不标发', 来源(单))
function 标注(id: string, 标题: string, 分类: 原型标注['分类'], 说明: string, 规则: string[], 等级: 原型标注['事实等级'] = '已确认'): 原型标注 {
  return { id: `oms.confirmation.${id}`, 标题, 说明, 分类, 事实等级: 等级, 状态: '待评审', 版本: '2026-10-12', 路由: '/oms/self-fulfillment/shipping-confirmation', 锚点: `oms.confirmation.${id}`,
    prd引用: ['PRD/订单标发功能PRD.md#21-生成时机与主流程', 'PRD/订单标发功能PRD.md#1-原型界面说明', 'PRD/订单标发功能PRD.md#154-不标发', ...(['channel-mapping', 'outbound-facts', 'shipping-timeliness'].includes(id) ? ['PRD/订单标发功能PRD.md#23-物流渠道标发设置与提交内容'] : []), ...(id === 'filters' ? ['PRD/列表筛选组件规范.md'] : [])],
    触发方式: ['点击对应入口；页面使用虚构数据与模拟响应。'], 系统动作: 规则,
    成功结果: ['按本次范围呈现结果，标发状态与仓库真实出库、订单处理状态分别维护。人工不标发仅结束本单 OMS 回传责任，不证明平台已接收。'],
    异常处理: ['平台结果待核查时禁止重提；成功与无需标发保持只读；确认期间数据变化要求重新检查。'],
    数据来源: ['本地共享标发单、同源标准订单、关联履约快照与接口尝试；真实自动生成、任务调度、多行明细与平台 API 尚未接入。'],
    权限与审计: ['正式实现按平台、店铺及动作权限控制；保留操作者、前后状态和接口证据，生产权限与持久审计尚未接入。'], 验收要点: 规则 }
}
const 不标发标注 = 标注('non-mark', '不标发与人工终止回传', '规则', '用户确认不再由 OMS 标发，操作后进入无需标发；不代表平台标发成功。', ['单条、详情与批量复用本单资格；待标发或明确未生效失败可操作，标发中、待核查与终态禁止。', '原因必填，确认后复验状态和版本；人工记录保存原因、操作者、时间和前状态，不计入接口尝试。', '仅选中的标发单结束回传责任，不扩散到同单其他包裹或合单兄弟来源。', '真实服务端须原子停止本单未开始任务，补偿及自动调度不得重复建立该责任；当前没有真实任务。'], '合理假设')
const 平台状态标注 = 标注('platform-order-status', '平台订单状态', '字段', '只读展示本标发单来源订单的平台订单状态，与标发状态分别展示。', ['读取 oms_order.platform_order_status，复用全渠道订单展示口径；eBay 取 orderFulfillmentStatus，不拼接付款或取消状态。', '无来源显示 —；eBay 未返回显示未返回，未知枚举保留原值；其他平台显示状态映射待接入。', '不根据标发成功、无需标发或出库情况推算平台状态，不改变操作资格及状态流转。'])
const 渠道标注 = 标注('channel-mapping', '物流渠道与平台标发设置', '字段', '本次承运商取实际履约渠道在来源订单平台下的标发设置；点击渠道查看共享资料。', ['列表只显示渠道名称，渠道代码在详情物流渠道标发设置中查看；仍保留渠道数据和关联校验。', '用明确渠道 ID 关联，复核服务商、账号、仓库及渠道代码；不按名称猜承运商，不取其他平台配置。', '首次提交前读取当前配置和仓库跟踪号；执行时固定载荷。已有尝试保留原快照，当前配置只读对照，差异须核查。', '使用跟踪号取 tracking_number，不取内部标发编号；配送服务七平台均不适用；eBay 不提交查询地址。', '两个专用虚构渠道用于本地联动，其映射仅供评审；真实平台字典和接口未接入。'], '合理假设')
const 出库标注 = 标注('outbound-facts', '关联出库状态、数量与跟踪号', '字段', '显示本次关联出库单的状态及计划／实发数量、跟踪号和实际发货时间。', ['按出库单号、履约单号与来源订单精确关联；缺失、重复、跨来源均不取首条兜底。', '三方仓出库单号为 external_outbound_no；物流商单号为关联出库执行 external_logistics_order_no，只读可空且不互相补值。物流商单号用于业务核对，不作为提交跟踪号、不改变平台载荷或缺号门禁；真实来源映射待核验。', '数量为关联出库单总量，合单可能包括其他来源，不作为本单订单行量；本次标发数量另外显示。', '出库状态独立于标发状态；待核查、非已出库或物流事实矛盾阻断提交，不改写仓库事实。', '旧评审仓单未进入新版出库列表，只读展示已有领域执行，不创建仓单或虚构明细归属。'], '合理假设')
const 时效标注 = 标注('shipping-timeliness', '最晚发货时间与剩余时间', '字段', '在标发工作台持续关注订单的平台发货时效。', ['取来源订单 shipByAt，解析来源时区后按北京时间秒级显示，不计算独立 confirmation_deadline_at。', '待标发、标发中、标发失败每秒更新，超时显红；标发成功及无需标发停止。OMS 已出库不让未完成标发提前停止。', '缺失显示 —，无时区或非法时间显示时间待核实；计时组件卸载清理定时器。', '倒计时仅为展示提醒，不提前生成标发单、不触发自动重试或改变状态。'], '合理假设')
function 清除勾选() { 选中.value = []; 表格.value?.clearSelection() }
function 查询() { const 错误 = 校验标发筛选(筛选); if (错误) return void ElMessage.warning(错误); Object.assign(已应用, JSON.parse(JSON.stringify(筛选))); 页码.value = 1; 清除勾选() }
function 切状态(状态: 标发状态 | '全部') { 当前状态.value = 状态; 页码.value = 1; 清除勾选() }
function 切核查() { 仅待核查.value = !仅待核查.value; 切状态('全部') }
function 重置() { Object.assign(筛选, 默认标发筛选()); Object.assign(已应用, 默认标发筛选()); 排序.value = { field: '', direction: 'desc' }; 仅待核查.value = false; 切状态('全部') }
function 确认排序() { 页码.value = 1; 清除勾选() }
watch(() => [route.path, route.query.shippingConfirmationNo, route.query.fulfillmentOrderNo, route.query.systemOrderNo], ([路径, 标发号, 履约号, 订单号]) => {
  if (路径 !== '/oms/self-fulfillment/shipping-confirmation') return
  详情.value = undefined; 抽屉.value = false
  if (typeof 标发号 === 'string' && 标发号) {
    重置(); 筛选.searchType = 'no'; 筛选.searchMatch = 'exact'; 筛选.keyword = 标发号; 查询()
    const 单 = 单据.value.find(项 => 项.no === 标发号)
    if (!单) return void ElMessage.warning('未找到对应的订单标发记录：' + 标发号)
    if ((typeof 履约号 === 'string' && 履约号 !== 单.fulfillmentNo) || (typeof 订单号 === 'string' && 订单号 !== 单.orderNo)) return void ElMessage.warning('标发记录与来源订单或履约单不一致，请核对后查看')
    查看(单); return
  }
  const 编号 = typeof 履约号 === 'string' ? 履约号 : typeof 订单号 === 'string' ? 订单号 : ''
  if (!编号) return
  重置(); 筛选.searchType = typeof 履约号 === 'string' ? 'fulfillmentNo' : 'orderNo'; 筛选.searchMatch = 'exact'; 筛选.keyword = 编号; 查询()
}, { immediate: true })
watch(结果, 行 => { if (页码.value > Math.max(1, Math.ceil(行.length / 每页.value))) 页码.value = 1 })
function 查看(单: 标发单) { 详情.value = 单; 抽屉.value = true }
function 查看订单(单: 标发单) { if (!来源(单)) return void ElMessage.warning('来源订单不存在，请先核查关联关系'); 抽屉.value = false; void router.push('/oms/orders/all/' + 单.orderNo) }
function 查看履约(单: 标发单) { if (!来源(单) || !履约(单)) return void ElMessage.warning('来源履约不存在，请先核查关联关系'); 抽屉.value = false; void router.push({ path: '/oms/self-fulfillment/processing', query: { systemOrderNo: 单.orderNo } }) }
async function 复制(值: string, 名称: string) { try { await navigator.clipboard.writeText(值); ElMessage.success(`已复制${名称}`) } catch { ElMessage.warning('浏览器未允许复制，请手动选择内容') } }
function 记尝试(单: 标发单, action: string, result: string, evidence: string) { 单.attempts.unshift({ time: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8', action, result, evidence }) }
const 确认打开 = ref(false), 当前动作 = ref<标发动作>('提交标发'), 目标 = ref<标发单[]>([]), 指纹 = ref<Record<string, string>>({})
const 不标发原因 = ref('')
const 预检 = computed(() => 目标.value.map(单 => ({ no: 单.no, status: 单.status, quantity: 单.quantity, carrier: 准备值(单).carrier, tracking: 准备值(单).tracking, reason: 动作阻断(单, 当前动作.value).join('；') })))
const 可执行数 = computed(() => 预检.value.filter(项 => !项.reason).length)
const 批量结果 = ref<标发处理结果[]>([]), 结果打开 = ref(false)
const 结果统计 = computed(() => ({ total: 批量结果.value.length, success: 批量结果.value.filter(项 => 项.result === '成功').length, failed: 批量结果.value.filter(项 => 项.result === '失败').length, skipped: 批量结果.value.filter(项 => 项.result === '跳过').length, processing: 批量结果.value.filter(项 => 项.result === '处理中').length }))
function 准备动作(动作: 标发动作, 列表: 标发单[] = 选中.value) {
  if (正在执行.value) return
  if (!列表.length) return void ElMessage.warning('请先选择标发单')
  当前动作.value = 动作; 目标.value = [...new Map(列表.map(单 => [单.no, 单])).values()]
  不标发原因.value = ''
  指纹.value = Object.fromEntries(目标.value.map(单 => [单.no, 确认指纹(单)])); 确认打开.value = true
}
async function 执行() {
  if (正在执行.value || !可执行数.value) return
  if (当前动作.value === '不标发' && 不标发原因错误(不标发原因.value)) return void ElMessage.warning(不标发原因错误(不标发原因.value))
  const 本次原因 = 不标发原因.value.trim()
  正在执行.value = true
  批量结果.value = 目标.value.map(单 => ({ no: 单.no, result: '处理中', status: 单.status, reason: '等待逐项校验与处理' }))
  确认打开.value = false; 结果打开.value = true
  try {
    for (const 原单 of 目标.value) {
      const 本项 = 批量结果.value.find(项 => 项.no === 原单.no)!
      const 单 = 单据.value.find(项 => 项.no === 原单.no)
      const 原因 = !单 ? ['记录已不存在，请重新查询'] : 确认指纹(单) !== 指纹.value[单.no] ? ['记录已变化，请重新检查后操作'] : 动作阻断(单, 当前动作.value)
      if (!单 || 原因.length) { Object.assign(本项, { result: '跳过', status: 单?.status || '—', reason: 原因.join('；') }); continue }
      if (当前动作.value === '不标发') {
        const 拦截 = 设置不标发(单, 来源(单), 本次原因, new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8', '原型演示用户')
        Object.assign(本项, { result: 拦截.length ? '跳过' : '成功', status: 单.status, reason: 拦截.length ? 拦截.join('；') : '已设置无需标发，OMS 不再提交本单；平台完成情况未核验' })
        continue
      }
      本项.reason = 当前动作.value === '查询结果' ? '正在查询原平台记录' : '请求处理中，等待平台回执'
      try {
        if (当前动作.value !== '查询结果') {
          const 本次 = 准备值(单)
          单.carrier = 本次.carrier; 单.tracking = 本次.tracking; 单.shippedAt = 本次.shippedAt
          if (当前动作.value === '重新提交') 单.status = '待标发'
          单.status = '标发中'; 记尝试(单, 当前动作.value, '处理中', `复用幂等键 ${单.idempotencyKey}；提交前重新校验来源与发货条件`)
          本项.status = 单.status
        }
        await new Promise(完成 => setTimeout(完成, 320))
        单.status = '标发成功'; 单.pendingVerification = false; 单.reason = ''
        单.externalId = `${当前动作.value === '查询结果' ? 'DEMO-VERIFIED' : 'DEMO-FULFILLMENT'}-${单.no}`
        记尝试(单, 当前动作.value === '查询结果' ? '查询平台结果（模拟）' : '模拟平台响应', 当前动作.value === '查询结果' ? '核查确认成功' : '标发成功', 当前动作.value === '查询结果' ? '模拟记录的来源订单行、数量、承运商和跟踪号完全匹配；原单补记成功，未重复创建' : `模拟 201 + 可解析 Location；${单.externalId}`)
        本项.result = '成功'; 本项.status = 单.status; 本项.reason = 当前动作.value === '查询结果' ? '等价平台记录已核验，原单补记成功（模拟）' : '平台明确接收，已保留回执（模拟）'
      } catch {
        if (当前动作.value !== '查询结果') { 单.status = '标发失败'; 单.pendingVerification = true; 单.reason = '平台结果无法确认，先查询结果，禁止重提' }
        记尝试(单, 当前动作.value, '失败', '本地执行未取得明确结果；保留原请求并等待核查')
        本项.result = '失败'; 本项.status = 单.status; 本项.reason = '未取得明确平台结果，请核查原请求'
      }
    }
  } finally { 正在执行.value = false; 清除勾选() }
}
</script>

<template>
  <main class="标发页面" v-prototype="标注('overview', '订单标发工作台', '页面', '以标发单为工作粒度，集中处理平台发货回传；布局为本轮评审方案。', ['已确认：本期有效出库且来源 OMS 订单已发货后，才生成标发单并安排标发任务；未出库但有跟踪号的提前标发后期支持。', '正常订单1:1生成；拆单按平台规则，eBay一履约单一标发单；合单按原平台订单分别生成，使用各自店铺token。', '每行一张标发单；多个来源订单分别追溯，标发数量不称为订单数。', '已出库和平台已接收是两个独立事实；标发失败不触发重复推仓。'], '合理假设')">
    <section class="工作区">
      <nav class="状态栏" aria-label="标发状态" v-prototype="标注('states', '标发五态', '规则', '五态独立于订单处理及仓库出库；待核查是失败原因分类。', ['页签数量随已应用查询和待核查范围变化，点击只切换标发状态。', '待核查筛选切回全部，退出筛选保留其他已应用条件。'])">
        <button v-for="状态 in ['全部', ...标发状态列表] as const" :key="状态" :class="{ active: 当前状态 === 状态 }" :aria-pressed="当前状态 === 状态" @click="切状态(状态)">{{ 状态 }} <b>{{ 状态数量(状态) }}</b></button>
      </nav>
      <div class="搜索栏" v-prototype="标注('filters', '标发筛选与排序', '交互', '复用公共字段搜索、多选、时间范围和排序；只改变工作范围。', ['平台与店铺多选先写草稿，查询才应用；店铺身份按平台＋店铺ID隔离。', '字段搜索只匹配所选字段，支持模糊、精确和多行精确 OR。', '实际发货时间按北京时间秒级读取；未取得截止时间不自动推算。', '排序、换页、查询及范围切换清除勾选，深链重置旧条件。'], '合理假设')">
        <div class="筛选首行"><MultiSelectFilter v-model="筛选.platform" :options="平台选项" placeholder="平台" /><MultiSelectFilter v-model="筛选.store" :options="店铺选项" placeholder="店铺" :width="160" /><button class="关注筛选" :class="{ active: 仅待核查 }" :aria-pressed="仅待核查" @click="切核查">仅待核查 <b>{{ 待核查数量 }}</b></button></div>
        <div class="筛选次行"><FieldSearch v-model="筛选.keyword" v-model:field="筛选.searchType" v-model:mode="筛选.searchMatch" :fields="标发搜索字段" aria-prefix="订单标发" @search="查询" /><div class="实际时间筛选"><span>实际发货时间</span><TimeRange v-model="筛选.dates" aria-prefix="订单标发实际发货时间" /></div><ElButton type="primary" @click="查询">查询</ElButton><ElButton @click="重置">重置</ElButton><ListSort v-model="排序" :fields="排序字段" aria-prefix="订单标发" @change="确认排序" /></div>
      </div>
      <div class="操作栏" v-prototype="标注('submit', '标发动作与批量预检', '交互', '标发、重新提交、结果查询与不标发分开办理，逐张展示资格和跳过原因。', ['提交仅待标发；重新提交仅合格失败；两者均要求来源 OMS 订单已发货且有有效出库。查询仅标发中或待核查失败。', '确认展示来源状态、数量与跟踪号；待核查项不进入重提集合。', '执行时重验最新数据及载荷指纹，发生变化跳过；复用原单与幂等键。', '反馈总数、成功、失败、跳过和处理中及每项原因；完成清除勾选。'], '合理假设')">
        <ElButton v-if="显示提交" type="primary" :disabled="!选中.length || 正在执行" @click="准备动作('提交标发')">批量标发</ElButton>
        <ElButton v-if="显示重试" :disabled="!选中.length || 正在执行" @click="准备动作('重新提交')">批量重新提交</ElButton>
        <ElButton v-if="显示核查" :disabled="!选中.length || 正在执行" @click="准备动作('查询结果')">批量查询结果</ElButton>
        <ElButton v-if="显示不标发" v-prototype="不标发标注" :disabled="!选中.length || 正在执行" @click="准备动作('不标发')">批量不标发</ElButton>
        <span class="勾选提示">已选 <b>{{ 选中.length }}</b> 张<ElButton v-if="选中.length" link type="primary" @click="清除勾选">清空</ElButton></span>
        <ElButton v-if="批量结果.length" class="最近结果" link type="primary" @click="结果打开 = true">查看处理结果</ElButton>
      </div>
      <ElTable ref="表格" :data="页数据" row-key="no" @selection-change="选中 = $event" @row-dblclick="查看">
        <ElTableColumn type="selection" width="44" />
        <ElTableColumn label="标发单 / 来源订单" min-width="195"><template #default="{ row }"><ElButton class="单号" link type="primary" @click="查看(row as 标发单)">{{ row.no }}</ElButton><div class="来源编号"><ElButton link type="primary" @click="查看订单(row as 标发单)">{{ row.orderNo }}</ElButton></div><small :title="来源(row as 标发单)?.platformOrderNo">平台单：{{ 来源(row as 标发单)?.platformOrderNo || '—' }}</small></template></ElTableColumn>
        <ElTableColumn label="平台 / 店铺" min-width="125"><template #default="{ row }"><span>{{ 来源(row as 标发单)?.platformCode || '—' }}</span><small>{{ 来源(row as 标发单)?.storeName || '来源待核查' }}</small></template></ElTableColumn>
        <ElTableColumn label="标发状态 / 处理提示" min-width="190"><template #default="{ row }"><ElTag :type="色(row.status)" size="small">{{ row.status }}</ElTag><small v-prototype="平台状态标注">平台订单状态：{{ 平台状态(row as 标发单) }}</small><ElTooltip v-if="简短原因(row as 标发单)" :content="row.exemptionReason || 简短原因(row as 标发单)" placement="top" :show-after="300"><small class="原因摘要" :class="{ 警示: row.pendingVerification || row.status === '标发失败' }">{{ 简短原因(row as 标发单) }}</small></ElTooltip><small>{{ 下一步(row as 标发单) }}</small></template></ElTableColumn>
        <ElTableColumn label="发货时效" min-width="180"><template #header><span class="时间表头">发货时效<ElTooltip :trigger="['hover', 'focus', 'click']" :content="时效说明"><button class="列头帮助" aria-label="发货时效说明" type="button"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></span></template><template #default="{ row }"><div v-prototype="时效标注"><small>最晚发货时间</small><span class="时间值">{{ 时间(来源(row as 标发单)?.shipByAt) }}</span><small>{{ ['标发成功', '无需标发'].includes(row.status) ? '时效状态' : '剩余发货时间' }}</small><strong class="倒计时" :class="'时效-' + 时效(row as 标发单).kind">{{ 时效(row as 标发单).text }}</strong></div></template></ElTableColumn>
        <ElTableColumn label="平台标发 / 跟踪号" min-width="210"><template #default="{ row }"><div v-prototype="渠道标注"><span>{{ 来源(row as 标发单)?.platformCode || '—' }} · {{ 准备值(row as 标发单).carrier || '承运商未配置' }}</span><div class="可复制 跟踪号"><span :title="准备值(row as 标发单).tracking">{{ 准备值(row as 标发单).tracking || '跟踪号缺失' }}</span><ElButton v-if="准备值(row as 标发单).tracking" link :aria-label="'复制跟踪号 ' + 准备值(row as 标发单).tracking" @click="复制(准备值(row as 标发单).tracking, '跟踪号')"><ElIcon><CopyDocument /></ElIcon></ElButton></div><small>物流商单号：{{ 出库(row as 标发单)?.externalLogisticsOrderNo || '—' }}</small><small>{{ 使用标发准备值(row as 标发单) ? '本次准备值' : row.attempts.length ? '原提交快照' : '保留标发数据' }} · {{ row.quantity }} 件</small><small v-if="使用标发准备值(row as 标发单) && 渠道(row as 标发单).error" class="警示">{{ 渠道(row as 标发单).error }}</small><small v-else-if="!使用标发准备值(row as 标发单) && 渠道(row as 标发单).mapping?.carrierCode !== row.carrier" class="警示">当前配置与原承运商不同</small></div></template></ElTableColumn>
        <ElTableColumn label="履约 / 仓库 / 物流渠道" min-width="190"><template #default="{ row }"><div v-prototype="渠道标注"><ElButton link type="primary" @click="查看履约(row as 标发单)">{{ row.fulfillmentNo }}</ElButton><small>{{ 履约(row as 标发单)?.route.warehouse || '—' }}</small><ElButton link type="primary" :disabled="!渠道(row as 标发单).channel" @click="查看渠道(row as 标发单)">{{ 履约(row as 标发单)?.route.shippingChannel || '渠道待关联' }}</ElButton></div></template></ElTableColumn>
        <ElTableColumn label="出库情况" min-width="225"><template #header><span class="时间表头">出库情况<ElTooltip :trigger="['hover', 'focus', 'click']" content="出库单计划／实发为整张关联出库单数量，合单时可能含其他来源；本次标发数量单独展示。实际发货时间按北京时间（UTC+8）显示。"><button class="列头帮助" aria-label="出库情况说明" type="button"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></span></template><template #default="{ row }"><div v-prototype="出库标注"><ElTag :type="出库(row as 标发单)?.待核查 ? 'warning' : 出库(row as 标发单)?.状态 === '已出库' ? 'success' : 'info'" size="small">{{ 出库(row as 标发单)?.待核查 ? '出库待核查' : 出库(row as 标发单)?.状态 || '出库待关联' }}</ElTag><small>出库单计划 / 实发：{{ 出库(row as 标发单)?.出库事实?.planned ?? '—' }} / {{ 出库(row as 标发单)?.出库事实?.shipped ?? '—' }} 件</small><small>{{ row.outboundNo || '—' }}</small><span class="时间值">{{ 时间(出库(row as 标发单)?.出库事实?.shippedAt || undefined) }}</span></div></template></ElTableColumn>
        <ElTableColumn label="最近尝试" min-width="165"><template #header><span class="时间表头">最近尝试<ElTooltip :trigger="['hover', 'focus', 'click']" content="接口尝试时间统一按北京时间（UTC+8）显示。不标发是人工操作，不计入接口尝试次数。" placement="top"><button class="列头帮助" aria-label="最近尝试说明" type="button"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></span></template><template #default="{ row }"><span class="时间值">{{ 时间(最近尝试(row as 标发单)?.time) }}</span><small>{{ 最近尝试(row as 标发单)?.result || '尚未执行' }} · {{ row.attempts.length }} 次尝试</small></template></ElTableColumn>
        <ElTableColumn label="操作" width="165" fixed="right"><template #default="{ row }"><div class="行操作"><ElButton link type="primary" @click="查看(row as 标发单)">详情</ElButton><ElTooltip v-if="row.pendingVerification || row.status === '标发中'" :disabled="!标发动作阻断(row as 标发单, '查询结果', 来源(row as 标发单)).length" :content="标发动作阻断(row as 标发单, '查询结果', 来源(row as 标发单)).join('；')"><span><ElButton link type="primary" :disabled="正在执行 || 标发动作阻断(row as 标发单, '查询结果', 来源(row as 标发单)).length > 0" @click="准备动作('查询结果', [row as 标发单])">查询结果</ElButton></span></ElTooltip><ElTooltip v-else-if="row.status === '待标发' || row.status === '标发失败'" :disabled="!阻断(row as 标发单).length" :content="阻断(row as 标发单).join('；')"><span><ElButton link type="primary" :disabled="正在执行 || 阻断(row as 标发单).length > 0" @click="准备动作(row.status === '待标发' ? '提交标发' : '重新提交', [row as 标发单])">{{ row.status === '标发失败' ? '重新提交' : '提交标发' }}</ElButton></span></ElTooltip><ElTooltip v-if="row.status === '待标发' || row.status === '标发失败'" :disabled="!不标发门禁(row as 标发单).length" :content="不标发门禁(row as 标发单).join('；')"><span v-prototype="不标发标注"><ElButton link type="primary" :disabled="正在执行 || 不标发门禁(row as 标发单).length > 0" @click="准备动作('不标发', [row as 标发单])">不标发</ElButton></span></ElTooltip></div></template></ElTableColumn>
        <template #empty><ElEmpty description="没有符合条件的标发单" :image-size="70"><ElButton @click="重置">清空条件</ElButton></ElEmpty></template>
      </ElTable>
      <footer><span>共 {{ 结果.length }} 张标发单</span><ElPagination v-model:current-page="页码" v-model:page-size="每页" :page-sizes="[10, 20, 50]" :total="结果.length" layout="sizes, prev, pager, next" @current-change="清除勾选" @size-change="页码 = 1; 清除勾选()" /></footer>
    </section>
    <ElDrawer v-model="抽屉" size="min(1040px, calc(100vw - 84px))" :title="详情?.no" append-to-body>
      <template v-if="详情">
        <div class="详情标题"><div><small>标发单号</small><h2>{{ 详情.no }}<ElButton link :aria-label="`复制标发单号 ${详情.no}`" @click="复制(详情.no, '标发单号')"><ElIcon><CopyDocument /></ElIcon></ElButton></h2><p>{{ 来源(详情)?.platformCode || '—' }} · {{ 来源(详情)?.storeName || '来源待核查' }}</p></div><ElTag :type="色(详情.status)">{{ 详情.status }}</ElTag></div>
        <div class="详情摘要"><span>本次标发 <b>{{ 详情.quantity }} 件</b></span><span>接口尝试 <b>{{ 详情.attempts.length }} 次</b></span><span>处理建议 <b>{{ 下一步(详情) }}</b></span></div>
        <ElAlert v-if="详情.pendingVerification" title="平台结果待核查" description="请求可能已经被平台受理。先查询已有发货记录，核对订单行、数量、承运商和跟踪号；禁止直接重新提交。" type="warning" :closable="false" show-icon />
        <ElAlert v-else-if="详情.status === '标发失败'" title="标发失败" :description="详情.reason || '请查看接口尝试并核对失败原因'" type="error" :closable="false" show-icon />
        <ElAlert v-if="详情.exemptionReason" :title="详情.nonMarkRecord ? '不标发：OMS 不再提交本单' : '无需标发：保留豁免事实'" :description="详情.exemptionReason" type="info" :closable="false" />
        <section v-if="详情.nonMarkRecord" class="详情节" v-prototype="标注('non-mark-record', '人工不标发记录', '字段', '人工决定与平台回执分别追溯；本记录不证明平台已完成。', ['记录前状态、原因、操作人和时间；接口尝试次数保持。', '不写标发成功时间、平台回执或订单出库；恢复路径另行评审。'], '合理假设')"><h3>不标发记录</h3><ElDescriptions :column="2" border><ElDescriptionsItem label="操作人">{{ 详情.nonMarkRecord.operator }}</ElDescriptionsItem><ElDescriptionsItem label="操作时间">{{ 时间(详情.nonMarkRecord.time) }}</ElDescriptionsItem><ElDescriptionsItem label="操作前状态">{{ 详情.nonMarkRecord.previousStatus }}</ElDescriptionsItem><ElDescriptionsItem label="操作后状态">无需标发</ElDescriptionsItem><ElDescriptionsItem label="原因" :span="2">{{ 详情.nonMarkRecord.reason }}</ElDescriptionsItem></ElDescriptions><p>仅结束本单 OMS 回传责任；店铺后台是否已完成标发尚未核验。</p></section>
        <section class="详情节" v-prototype="标注('source', '来源订单与有效出库依据', '字段', '关联同源订单和履约快照，标发数量不覆盖真实出库数量。', ['订单链接进入完整详情，履约链接定位订单处理。', '合单的跨店铺、跨平台及同店铺来源都按原平台订单分别回传；只提交该来源的行和数量，使用该来源店铺token。', '履约已发数量为该履约摘要的数量，不充当订单行级出库数量。', '关联缺失显示空值或阻断，不用订单默认路由冒充执行路由。'])"><h3>来源与发货依据</h3><ElDescriptions :column="2" border>
          <ElDescriptionsItem label="来源订单"><ElButton link type="primary" @click="查看订单(详情)">{{ 详情.orderNo }}</ElButton></ElDescriptionsItem><ElDescriptionsItem label="平台订单号">{{ 来源(详情)?.platformOrderNo || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="履约单"><ElButton link type="primary" @click="查看履约(详情)">{{ 详情.fulfillmentNo }}</ElButton></ElDescriptionsItem><ElDescriptionsItem label="履约状态">{{ 履约(详情)?.status || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="发货仓库">{{ 履约(详情)?.route.warehouse || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="仓储服务商">{{ 履约(详情)?.route.warehouseProvider || '—' }}</ElDescriptionsItem>
          <ElDescriptionsItem label="物流渠道">{{ 履约(详情)?.route.shippingChannel || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="履约已发数量">{{ 履约(详情)?.shippedQuantity ?? '—' }}</ElDescriptionsItem>
        </ElDescriptions></section>
        <section class="详情节" v-prototype="出库标注"><h3>出库情况</h3><ElDescriptions :column="2" border><ElDescriptionsItem label="三方仓出库单号">{{ 出库(详情)?.三方仓出库单号 || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="物流商单号">{{ 出库(详情)?.externalLogisticsOrderNo || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="OMS 出库单号">{{ 详情.outboundNo || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="出库状态">{{ 出库(详情)?.状态 || '出库待关联' }}{{ 出库(详情)?.待核查 ? ' · 待核查' : '' }}</ElDescriptionsItem><ElDescriptionsItem label="出库单计划数量">{{ 出库(详情)?.出库事实?.planned ?? '—' }}</ElDescriptionsItem><ElDescriptionsItem label="出库单实发数量">{{ 出库(详情)?.出库事实?.shipped ?? '—' }}</ElDescriptionsItem><ElDescriptionsItem label="仓库回传跟踪号"><div class="可复制 跟踪号"><span>{{ 出库(详情)?.出库事实?.tracking || '—' }}</span><ElButton v-if="出库(详情)?.出库事实?.tracking" link aria-label="复制仓库回传跟踪号" @click="复制(出库(详情)!.出库事实!.tracking!, '仓库回传跟踪号')"><ElIcon><CopyDocument /></ElIcon></ElButton></div></ElDescriptionsItem><ElDescriptionsItem label="实际发货时间">{{ 时间(出库(详情)?.出库事实?.shippedAt || undefined) }}</ElDescriptionsItem></ElDescriptions><p>计划／实发为整张关联出库单数量；本次标发 {{ 详情.quantity }} 件，仅属于当前来源订单。</p></section>
        <section class="详情节" v-prototype="渠道标注"><h3>物流渠道标发设置</h3><ElDescriptions :column="2" border><ElDescriptionsItem label="物流渠道"><ElButton link type="primary" :disabled="!渠道(详情).channel" @click="查看渠道(详情)">{{ 履约(详情)?.route.shippingChannel || '渠道待关联' }}</ElButton></ElDescriptionsItem><ElDescriptionsItem label="来源平台">{{ 来源(详情)?.platformCode || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="渠道代码">{{ 履约(详情)?.route.shippingChannelCode || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="当前配置承运商">{{ 渠道(详情).mapping?.carrierCode || '未配置' }}</ElDescriptionsItem><ElDescriptionsItem label="标发单号来源">{{ 渠道(详情).mapping ? '使用跟踪号' : '—' }}</ElDescriptionsItem><ElDescriptionsItem label="配送服务">—</ElDescriptionsItem><ElDescriptionsItem label="查询地址" :span="2">{{ 渠道(详情).mapping?.trackingUrl || '未配置' }}</ElDescriptionsItem></ElDescriptions><p>按当前物流渠道及来源平台取值；{{ 使用标发准备值(详情) ? '首次提交前读取当前配置。' : '当前配置仅供对照，原提交数据保留。' }}{{ 来源(详情)?.platformCode === 'eBay' ? 'eBay 标发不发送配送服务及查询地址。' : '' }}</p><ElAlert v-if="渠道(详情).error" :title="渠道(详情).error" type="warning" :closable="false" /></section>
        <section class="详情节" v-prototype="时效标注"><h3>发货时效<ElTooltip :trigger="['hover', 'focus', 'click']" :content="时效说明"><button class="列头帮助" aria-label="详情发货时效说明" type="button"><ElIcon><QuestionFilled /></ElIcon></button></ElTooltip></h3><ElDescriptions :column="2" border><ElDescriptionsItem label="最晚发货时间">{{ 时间(来源(详情)?.shipByAt) }}</ElDescriptionsItem><ElDescriptionsItem label="剩余发货时间"><strong class="倒计时" :class="'时效-' + 时效(详情).kind">{{ 时效(详情).text }}</strong></ElDescriptionsItem></ElDescriptions></section>
        <section class="详情节" v-prototype="标注('snapshot', '本次标发提交快照', '字段', '首次提交前显示准备值，已有尝试显示原承运商、跟踪号、数量及平台回执，不用当前渠道配置替换历史值。', ['本地模型一行来源明细，不假装实现生产多行与组件分摊。', '标发成功时间只读取已有成功尝试，缺失显示空值；平台发货截止来源未接入，不从订单发货截止推算。', '幂等键仅追溯业务身份，不是凭据；真实平台资源和版本落点待设计。'])"><h3>{{ 使用标发准备值(详情) ? '本次标发准备值' : 详情.attempts.length ? '原提交快照' : '保留标发数据' }}</h3><ElDescriptions :column="2" border>
          <ElDescriptionsItem label="承运商">{{ 准备值(详情).carrier || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="跟踪号"><div class="可复制"><span class="跟踪号">{{ 准备值(详情).tracking || '—' }}</span><ElButton v-if="准备值(详情).tracking" link aria-label="复制详情跟踪号" @click="复制(准备值(详情).tracking, '跟踪号')"><ElIcon><CopyDocument /></ElIcon></ElButton></div></ElDescriptionsItem>
          <ElDescriptionsItem label="实际发货时间">{{ 时间(准备值(详情).shippedAt) }}</ElDescriptionsItem><ElDescriptionsItem label="标发成功时间">{{ 时间(成功时间(详情)) }}</ElDescriptionsItem>

          <ElDescriptionsItem label="平台回执" :span="2">{{ 详情.externalId || '—' }}</ElDescriptionsItem><ElDescriptionsItem label="幂等键" :span="2">{{ 详情.idempotencyKey }}</ElDescriptionsItem>
        </ElDescriptions><div class="标发明细"><ElTable :data="[详情]" size="small" border><ElTableColumn label="来源平台订单行" prop="lineId" min-width="200" /><ElTableColumn label="系统 SKU" min-width="150"><template #default="{ row }">{{ 来源(row as 标发单)?.items.find(项 => 项.externalLineId === row.lineId)?.systemSku || '—' }}</template></ElTableColumn><ElTableColumn label="本次标发数量" prop="quantity" width="130" /></ElTable></div></section>
        <section v-if="详情.status === '待标发' || 详情.status === '标发失败'" class="详情节" v-prototype="标注('precheck', '提交前检查与阻断', '规则', '本期提交和重试均要求 OMS 订单已发货及有效出库；真实提交还需校验当前平台订单级状态。', ['待核查失败禁止重新提交，只允许查询原请求。', '部分出库而 OMS 订单仍待发货时阻断，未出库仅有跟踪号也不放行。', '检查来源、有效出库、平台规则、完整物流字段与数量；eBay可按item多次回传，不代表同一lineItemId可任意拆成多个包裹。', '不因本地校验通过声称实时付款、取消、映射和服务端幂等已接入。'])"><h3>提交前检查</h3><ElAlert :title="阻断(详情).length ? '存在提交阻断' : '本地演示校验通过'" :description="阻断(详情).join('；') || 'OMS 订单已发货，已找到有效出库、完整物流信息与对应订单行。实际提交仍须核对当前平台订单级状态及历史回传记录。'" :type="阻断(详情).length ? 'warning' : 'success'" :closable="false" /></section>
        <section class="详情节" v-prototype="标注('attempts', '接口尝试与结果核查', '规则', '每次提交、查询单独记录；成功必须有可核验平台证据。', ['按本地记录从新到旧展示时间、动作、结果和证据，不暴露请求原文或 token。', '核查成功在原单补记，不能只按跟踪号或空查询结果判断。', '其他平台接口、真实核查分页及延迟尚未实现。'])"><h3>接口尝试与核查记录 <span>北京时间</span></h3><ElTimeline v-if="详情.attempts.length"><ElTimelineItem v-for="(记录, index) in 详情.attempts" :key="index" :timestamp="时间(记录.time)" placement="top"><div class="尝试标题"><strong>{{ 记录.action }}</strong><ElTag :type="色(记录.result)" size="small">{{ 记录.result }}</ElTag></div><p>{{ 记录.evidence }}</p></ElTimelineItem></ElTimeline><ElEmpty v-else description="尚无接口尝试" :image-size="50" /></section>
      </template>
      <template #footer><ElButton @click="抽屉 = false">关闭</ElButton><ElTooltip v-if="详情 && ['待标发','标发失败'].includes(详情.status)" :disabled="!不标发门禁(详情).length" :content="不标发门禁(详情).join('；')"><span v-prototype="不标发标注"><ElButton :disabled="正在执行 || 不标发门禁(详情).length > 0" @click="准备动作('不标发', [详情])">不标发</ElButton></span></ElTooltip><ElButton v-if="详情 && (详情.pendingVerification || 详情.status === '标发中')" type="primary" :disabled="标发动作阻断(详情, '查询结果', 来源(详情)).length > 0 || 正在执行" @click="准备动作('查询结果', [详情])"><ElIcon><Refresh /></ElIcon>查询结果</ElButton><ElButton v-else-if="详情 && ['待标发','标发失败'].includes(详情.status)" type="primary" :disabled="阻断(详情).length > 0 || 正在执行" @click="准备动作(详情.status === '待标发' ? '提交标发' : '重新提交', [详情])">{{ 详情.status === '标发失败' ? '重新提交' : '提交标发' }}</ElButton></template>
    </ElDrawer>
    <ElDialog v-model="确认打开" :title="`确认${当前动作}`" width="min(920px, calc(100vw - 64px))" align-center append-to-body :close-on-click-modal="false">
      <div v-prototype="标注('confirmation', '动作确认与资格明细', '交互', '明确确认范围，混选时逐单解释可执行与跳过原因。', ['确认共选、可执行、跳过数；零可执行禁用确认。', '提交展示数量和跟踪号；查询沿用原请求身份；不标发必填原因，不调用平台、不计入接口尝试。', '确认期间状态、载荷或尝试变化时跳过，要求重新检查。'], '合理假设')"><ElAlert :title="`共选 ${目标.length} 张，可执行 ${可执行数} 张，将跳过 ${目标.length - 可执行数} 张`" :description="当前动作 === '不标发' ? '确认后 OMS 不再提交选中标发单；不会向平台发送请求，也不证明店铺后台已完成标发。只处理本次选中的标发单。' : 当前动作 === '查询结果' ? '查询原平台发货记录；核对来源订单行、数量、承运商与跟踪号后补记结果。' : '仅处理通过发货条件校验的记录；平台结果待核查项禁止重提。'" type="info" show-icon :closable="false" /><ElTable :data="预检" max-height="360" class="确认明细"><ElTableColumn prop="no" label="标发单号" min-width="215" /><ElTableColumn prop="status" label="当前状态" width="100" /><ElTableColumn prop="quantity" label="标发数量" width="90" /><ElTableColumn prop="carrier" label="承运商" min-width="110" /><ElTableColumn prop="tracking" label="跟踪号" min-width="175" /><ElTableColumn label="执行判断" min-width="230"><template #default="{ row }"><span :class="{ 警示: row.reason }">{{ row.reason || '可执行' }}</span></template></ElTableColumn></ElTable></div>
      <div v-if="当前动作 === '不标发'" class="不标发原因"><label for="non-mark-reason">不标发原因 <span class="必填">*</span></label><ElInput id="non-mark-reason" v-model="不标发原因" type="textarea" :rows="3" :maxlength="500" show-word-limit placeholder="例如：已自行在店铺后台处理，本单不再由 OMS 标发" aria-label="不标发原因" /></div>
      <template #footer><ElButton @click="确认打开 = false">返回检查</ElButton><ElButton type="primary" :disabled="!可执行数 || 正在执行 || (当前动作 === '不标发' && !!不标发原因错误(不标发原因))" @click="执行">确认{{ 当前动作 }}</ElButton></template>
    </ElDialog>
    <ElDialog v-model="结果打开" title="标发处理结果" width="min(900px, calc(100vw - 64px))" align-center append-to-body :close-on-click-modal="!正在执行" :show-close="!正在执行" :close-on-press-escape="!正在执行">
      <div v-prototype="标注('batch-result', '逐项处理结果', '交互', '展示本次动作的实时逐项结果，失败和跳过记录可定位原业务单。', ['成功、失败、跳过、处理中分别计数；处理期间防重复执行。', '提交／查询成功依模拟平台回执；不标发成功表示人工操作完成，状态为无需标发，平台完成情况未核验。', '查看结果或详情不隐式重试、不更改订单有效出库事实。'], '合理假设')"><div class="结果汇总"><span>总数 <b>{{ 结果统计.total }}</b></span><span>成功 <b class="成功色">{{ 结果统计.success }}</b></span><span>失败 <b class="失败色">{{ 结果统计.failed }}</b></span><span>跳过 <b>{{ 结果统计.skipped }}</b></span><span>处理中 <b>{{ 结果统计.processing }}</b></span></div><ElTable :data="批量结果" max-height="380"><ElTableColumn prop="no" label="标发单号" min-width="215" /><ElTableColumn label="处理结果" width="100"><template #default="{ row }"><ElTag :type="色(row.result)" size="small">{{ row.result }}</ElTag></template></ElTableColumn><ElTableColumn prop="status" label="标发状态" width="105" /><ElTableColumn prop="reason" label="结果说明" min-width="280" /></ElTable></div>
      <template #footer><ElButton :disabled="正在执行" @click="结果打开 = false">关闭</ElButton></template>
    </ElDialog>
  </main>
</template>

<style scoped>
.标发页面{height:100%;min-width:0;overflow:auto;padding:12px;background:#f3f5f8;color:var(--el-text-color-regular);box-sizing:border-box}
.工作区{background:#fff;border:1px solid #e5eaf1;border-radius:5px;overflow:hidden;min-width:0}
.状态栏{display:flex;align-items:center;flex-wrap:wrap;gap:28px;padding:0 18px;border-bottom:1px solid #e8edf2}
.状态栏 button{display:flex;align-items:center;gap:7px;border:0;border-bottom:2px solid transparent;background:none;padding:14px 0;font-size:13px;color:#536273;cursor:pointer;white-space:nowrap}
.状态栏 button.active{color:var(--el-color-primary);border-bottom-color:var(--el-color-primary)}
.状态栏 b,.关注筛选 b{font-weight:500;font-size:11px;border-radius:4px;background:#f0f3f7;padding:1px 6px;font-variant-numeric:tabular-nums}
.状态栏 button.active b{background:#ecf4ff;color:var(--el-color-primary)}
.搜索栏{padding:16px 16px 12px;display:flex;flex-direction:column;gap:10px}
.筛选首行,.筛选次行{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}
.实际时间筛选{display:flex;align-items:center;gap:8px;flex:none;font-size:12px}
.搜索栏 :deep(.el-button),.操作栏 :deep(.el-button){height:32px;font-size:12px;margin-left:0}
.关注筛选{display:flex;align-items:center;gap:8px;padding:0 10px;height:32px;background:#fff;border:1px solid #dcdfe6;border-radius:4px;font-size:12px;color:#606266;cursor:pointer}
.关注筛选.active{border-color:#e6a23c;color:#a16c1a;background:#fdf6ec}
.操作栏{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 16px 12px;font-size:12px;min-height:32px}
.勾选提示{display:flex;align-items:center;gap:7px;margin-left:8px;color:#8490a0}.勾选提示 b{color:var(--el-color-primary);font-weight:500}.最近结果{margin-left:auto!important}
.标发页面 :deep(.el-table){font-size:12px}.标发页面 :deep(.el-table th.el-table__cell){background:#f7f9fb;color:var(--yy-text-heading);font-weight:550}.标发页面 :deep(.el-table td.el-table__cell){padding:12px 0;vertical-align:top}.标发页面 :deep(.el-table .cell){line-height:22px}
.标发页面 :deep(.el-button.is-link){font-size:12px;height:auto;line-height:22px;white-space:normal;text-align:left;vertical-align:top}
.单号{font-variant-numeric:tabular-nums;font-weight:500}.来源编号{margin-top:2px}small{display:block;font-size:12px;color:#8590a0;line-height:21px;margin-top:2px;overflow-wrap:anywhere}.原因摘要{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:190px}.警示{color:#b87818}.时间值{font-variant-numeric:tabular-nums;white-space:nowrap}.行操作{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.行操作 :deep(.el-button){margin-left:0}
.可复制{display:flex;align-items:flex-start;gap:6px;min-width:0}.可复制>span{overflow-wrap:anywhere;min-width:0}.可复制 :deep(.el-button){flex:none;color:#8993a1}.可复制 :deep(.el-button:hover){color:var(--el-color-primary)}
footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 16px;font-size:12px;color:#8590a0}
.详情标题{display:flex;justify-content:space-between;align-items:center;gap:14px;background:#f7f9fc;border:1px solid #e8edf3;padding:16px;border-radius:5px;margin-bottom:12px}.详情标题 h2{font-size:18px;color:var(--yy-text-heading);margin:3px 0;display:flex;align-items:center;gap:10px;overflow-wrap:anywhere}.详情标题 p{font-size:12px;color:#7e8a9a;margin:5px 0 0}.详情摘要{display:flex;gap:22px;flex-wrap:wrap;font-size:12px;color:#8390a0;padding:4px 0 16px}.详情摘要 b{color:#38475a;font-weight:500;margin-left:5px}
.详情节{margin-top:24px}.详情节 h3{font-size:14px;margin:0 0 12px;color:var(--yy-text-heading)}.详情节 h3 span{font-size:11px;font-weight:400;color:#98a3b4;margin-left:8px}.详情节 p{font-size:12px;line-height:1.8;color:#7b8797;overflow-wrap:anywhere;margin:8px 0 0}.详情节 :deep(.el-descriptions__content){word-break:break-word;font-size:12px}.详情节 :deep(.el-descriptions__label){font-size:12px;width:115px;color:#566275}.详情节 :deep(.el-timeline){padding-left:10px}.标发明细{margin-top:12px}.尝试标题{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--yy-text-heading)}
.时间表头{display:inline-flex;align-items:center;gap:5px}.列头帮助{display:inline-flex;padding:0;border:0;background:transparent;color:#9099a7;cursor:help;font-size:13px}.列头帮助:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:3px}.不标发原因{margin-top:16px}.不标发原因 label{display:block;font-size:13px;margin-bottom:8px;color:var(--yy-text-heading)}.必填{color:var(--el-color-danger)}
.跟踪号{font-weight:600;color:var(--yy-text-heading);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.倒计时{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:#c28323}.时效-overdue,.时效-invalid{color:var(--el-color-danger)}.时效-complete,.时效-missing{color:#8590a0;font-size:12px;font-weight:400}.详情节 h3 .列头帮助{margin-left:6px}.确认明细{margin-top:16px}.结果汇总{display:flex;gap:26px;flex-wrap:wrap;padding:6px 0 20px;color:#7e8999;font-size:13px}.结果汇总 b{font-size:20px;color:var(--yy-text-heading);margin-left:6px}.结果汇总 .成功色{color:#299d78}.结果汇总 .失败色{color:#d85d5d}
@media(max-width:1300px){.状态栏{gap:22px}.标发页面{padding:10px}.详情摘要{gap:12px}}
</style>
