<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElButton, ElTag, ElEmpty, ElMessage, ElMessageBox } from 'element-plus'
import RuleForm from './规则编辑表单.vue'
import { 共享规则, 记录规则操作 } from './演示会话'
import { 共享订单 } from '../订单处理/演示会话'
import { 渠道会话 } from '../仓配管理/仓配会话'
import { 校验规则配置, type 订单规则 } from './规则逻辑'
import { 格式化标发动作 } from './标发动作'
import { 分仓配置摘要 } from './规则路由'
import { 创建规则草稿, 读取规则草稿, 丢弃规则草稿, 当前规则分类, type 规则编辑模式, type 规则草稿会话 } from './规则编辑会话'
import { 关闭业务页签 } from '@/布局/页签操作'

const route = useRoute(), router = useRouter()
const 模式 = computed(() => route.meta.ruleEditorMode as 规则编辑模式)
const 标题 = computed(() => 模式.value === 'edit' ? '编辑规则' : 模式.value === 'copy' ? '复制规则' : '新增规则')
watch(() => route.fullPath, () => {
  const id = String(route.params.sessionId || '')
  if (模式.value === 'edit' && !读取规则草稿('edit', id)) {
    const source = 共享规则.value.find(项 => 项.id === id)
    if (source) 创建规则草稿(source.type, 共享规则.value, 'edit', source)
  }
}, { immediate: true })
const 会话 = computed(() => 读取规则草稿(模式.value, String(route.params.sessionId || '')))
const 列表路径 = '/oms/self-fulfillment/order-rules'
function 返回列表() { if (会话.value) 当前规则分类.value = 会话.value.draft.type; return router.push(列表路径) }
async function 结束编辑(session: 规则草稿会话 | undefined, editorPath: string) {
  if (session) 丢弃规则草稿(session.key)
  if (route.path === editorPath) {
    if (session) 当前规则分类.value = session.draft.type
    await router.push(列表路径)
  }
  关闭业务页签(editorPath, 列表路径)
}
function 取消编辑() { return 结束编辑(会话.value, route.path) }
async function 保存(保存项: 订单规则) {
  const session = 会话.value, editorPath = route.path
  if (!session) return
  const 会话仍有效 = () => 读取规则草稿(session.mode, session.id) === session
  const 检查版本 = () => session.mode !== 'edit' || 共享规则.value.some(项 => 项.id === session.sourceId && 项.version === session.sourceVersion)
  if (!检查版本()) return void ElMessage.warning('规则已变化，请取消后重新打开编辑')
  let error = 校验规则配置(保存项, 共享规则.value, 渠道会话.value)
  if (error) return void ElMessage.warning(error)
  const 原项 = session.mode === 'edit' ? 共享规则.value.find(项 => 项.id === session.sourceId) : undefined
  if (保存项.enabled || (原项 && 原项.enabled !== 保存项.enabled)) {
    try { await ElMessageBox.confirm(`保存后“${保存项.name}”将${保存项.enabled ? '参与' : '不再参与'}后续规则试算。`, 保存项.enabled ? '保存启用规则' : '保存并停用规则', { confirmButtonText: 保存项.enabled ? '保存并启用' : '保存并停用', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return }
  }
  if (!会话仍有效()) return void ElMessage.warning('编辑已结束，本次保存已取消')
  if (!检查版本()) return void ElMessage.warning('确认期间规则已变化，请重新打开编辑')
  error = 校验规则配置(保存项, 共享规则.value, 渠道会话.value)
  if (error) return void ElMessage.warning(error)
  保存项.name = 保存项.name.trim(); 保存项.note = 保存项.note.trim()
  if (保存项.type === '审单规则' && 保存项.orderNote?.trim()) 保存项.orderNote = 保存项.orderNote.trim()
  else delete 保存项.orderNote
  if (保存项.type !== '订单标发规则' || 保存项.action === '无需标发') delete 保存项.shippingAction
  保存项.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' UTC+8'
  保存项.version = 原项 ? 原项.version + 1 : 1
  保存项.id = 原项?.id || `RULE-DEMO-${crypto.randomUUID()}`
  if (原项) 共享规则.value.splice(共享规则.value.findIndex(项 => 项.id === 原项.id), 1, 保存项)
  else 共享规则.value.push(保存项)
  const action = 原项 ? '编辑' : session.mode === 'copy' ? '复制' : '新增'
  记录规则操作(保存项, action, `${action}规则「${保存项.name}」；${保存项.enabled ? '启用' : '停用'}；${保存项.conditions.length} 项条件全部满足${保存项.type === '订单标发规则' ? `；${格式化标发动作(保存项)}` : 保存项.type === '分仓规则' ? `；${分仓配置摘要(保存项, 渠道会话.value).join('；')}` : ''}${原项 && 原项.name !== 保存项.name ? `；原名称：${原项.name}` : ''}`, 保存项.updatedAt)
  ElMessage.success('规则已保存到本次会话')
  await 结束编辑(session, editorPath)
}
</script>

<template>
  <main class="规则编辑页">
    <header class="编辑页标题"><div><ElButton link :icon="ArrowLeft" @click="返回列表">返回规则列表</ElButton><i /><h1>{{ 标题 }}</h1><ElTag v-if="会话" size="small" type="info">{{ 会话.draft.type }}</ElTag></div><span v-if="会话?.draft.type === '分仓规则'">设置发货仓库与物流渠道</span></header>
    <RuleForm v-if="会话" :key="会话.key" :draft="会话.draft" :rules="共享规则" :orders="共享订单" @save="保存" @cancel="取消编辑" />
    <ElEmpty v-else description="未找到规则或草稿已失效"><ElButton type="primary" @click="取消编辑">返回规则列表</ElButton></ElEmpty>
  </main>
</template>

<style scoped>
.规则编辑页{display:flex;flex-direction:column;height:100%;min-height:0;background:#fff}.编辑页标题{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-shrink:0;padding:16px 24px;border-bottom:1px solid var(--yy-border-light)}.编辑页标题>div{display:flex;align-items:center;gap:14px;min-width:0}.编辑页标题 h1{font-size:16px;margin:0;font-weight:600}.编辑页标题 i{height:16px;width:1px;background:var(--yy-border)}.编辑页标题 .el-button{font-size:12px;color:var(--yy-text-secondary)}.编辑页标题>span{font-size:12px;color:var(--yy-text-secondary)}.规则编辑页>:last-child{flex:1;min-height:0}
</style>
