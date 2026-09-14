import { computed, readonly, ref, shallowRef } from 'vue'
import type { 原型标注 } from '@/类型/标注'

export interface 标注注册项 { 元素: HTMLElement; 标注: 原型标注 }
const 标注模式 = ref(false)
const 当前标注 = shallowRef<原型标注>()
const 注册项 = shallowRef<标注注册项[]>([])

export function 获取标注分类(标注: 原型标注): NonNullable<原型标注['分类']> {
  if (标注.分类) return 标注.分类
  if (标注.事实等级 === '待确认') return '待确认'
  if (/状态|字段|时间|路由|金额|数量|空值/.test(标注.标题)) return '字段'
  if (/规则|门禁|资格/.test(标注.标题)) return '规则'
  if (/页面|列表|工作台|视图|表格/.test(标注.标题)) return '页面'
  return '交互'
}
if (typeof document !== 'undefined') document.body.dataset.prototypeMode = 'false'

export const 标注状态 = {
  标注模式: readonly(标注模式),
  当前标注: readonly(当前标注),
  注册项: computed(() => 注册项.value),
  注册(元素: HTMLElement, 数据: 原型标注) {
    const 标注: 原型标注 = {
      路由: typeof location === 'undefined' ? '/' : location.hash.slice(1) || '/',
      锚点: 数据.id, 版本: '0.3.0', 状态: '待评审', 事实等级: '待确认', ...数据,
    }
    const 已有 = 注册项.value.find((项) => 项.元素 === 元素)
    if (已有 && JSON.stringify(已有.标注) === JSON.stringify(标注)) return
    注册项.value = 已有 ? 注册项.value.map((项) => 项.元素 === 元素 ? { 元素, 标注 } : 项) : [...注册项.value, { 元素, 标注 }]
    if (当前标注.value?.id === 标注.id) 当前标注.value = 标注
  },
  注销(元素: HTMLElement) {
    注册项.value = 注册项.value.filter((项) => 项.元素 !== 元素)
    if (当前标注.value && !注册项.value.some((项) => 项.标注.id === 当前标注.value?.id)) 当前标注.value = undefined
  },
  切换模式() {
    标注模式.value = !标注模式.value
    document.body.dataset.prototypeMode = String(标注模式.value)
    if (!标注模式.value) 当前标注.value = undefined
  },
  打开(标注: 原型标注) { if (标注模式.value) 当前标注.value = 标注 },
  关闭() { 当前标注.value = undefined },
  退出() {
    标注模式.value = false
    当前标注.value = undefined
    document.body.dataset.prototypeMode = 'false'
  },
}
