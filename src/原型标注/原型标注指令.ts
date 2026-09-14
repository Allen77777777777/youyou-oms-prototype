import type { Directive } from 'vue'
import type { 原型标注 } from '@/类型/标注'
import { 标注状态 } from './标注状态'

// 指令只登记稳定锚点；覆盖层负责编号，不修改业务元素的角色、焦点或事件。
export const 原型标注指令: Directive<HTMLElement, 原型标注> = {
  mounted(元素, binding) {
    元素.dataset.prototypeId = binding.value.id
    标注状态.注册(元素, binding.value)
  },
  updated(元素, binding) {
    元素.dataset.prototypeId = binding.value.id
    标注状态.注册(元素, binding.value)
  },
  unmounted(元素) {
    标注状态.注销(元素)
    delete 元素.dataset.prototypeId
  },
}
