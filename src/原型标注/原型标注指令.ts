import { watch, type Directive } from 'vue'

import type { 原型标注 } from '@/类型/标注'
import { 标注状态 } from './标注状态'

type 标注元素 = HTMLElement & {
  __原型标注?: 原型标注
  __原型标注点击?: (event: MouseEvent) => void
  __原型标注键盘?: (event: KeyboardEvent) => void
  __原型标注停止监听?: () => void
  __原型标注原始TabIndex?: string | null
  __原型标注原始Role?: string | null
  __原型标注添加了AriaLabel?: boolean
}

function 是否可交互元素(element: HTMLElement) {
  return element.matches('button, a, input, select, textarea, summary, [tabindex]')
}

function 设置标注标识(element: 标注元素, 标注: 原型标注) {
  element.dataset.prototypeId = 标注.id
  element.dataset.prototypeTitle = 标注.标题
}

function 启用标注语义(element: 标注元素, 标注: 原型标注) {
  设置标注标识(element, 标注)
  if (!element.getAttribute('aria-label')) {
    element.setAttribute('aria-label', `原型标注：${标注.标题}`)
    element.__原型标注添加了AriaLabel = true
  }
  if (!是否可交互元素(element)) {
    if (element.__原型标注原始TabIndex === undefined) {
      element.__原型标注原始TabIndex = element.getAttribute('tabindex')
    }
    if (element.__原型标注原始Role === undefined) {
      element.__原型标注原始Role = element.getAttribute('role')
    }
    element.setAttribute('tabindex', '0')
    element.setAttribute('role', 'button')
  }
}

function 关闭标注语义(element: 标注元素) {
  if (element.__原型标注原始TabIndex !== undefined) {
    if (element.__原型标注原始TabIndex === null) element.removeAttribute('tabindex')
    else element.setAttribute('tabindex', element.__原型标注原始TabIndex)
  }
  if (element.__原型标注原始Role !== undefined) {
    if (element.__原型标注原始Role === null) element.removeAttribute('role')
    else element.setAttribute('role', element.__原型标注原始Role)
  }
  if (element.__原型标注添加了AriaLabel) element.removeAttribute('aria-label')
}

export const 原型标注指令: Directive<标注元素, 原型标注> = {
  mounted(element, binding) {
    element.__原型标注 = binding.value
    设置标注标识(element, binding.value)
    element.__原型标注点击 = (event) => {
      if (!标注状态.标注模式.value) return
      const 点击目标 = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-prototype-id]') : null
      if (点击目标 && 点击目标 !== element) return
      event.preventDefault()
      event.stopPropagation()
      if (element.__原型标注) 标注状态.打开(element.__原型标注)
    }
    element.addEventListener('click', element.__原型标注点击, true)
    element.__原型标注键盘 = (event) => {
      if (!标注状态.标注模式.value || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      event.stopPropagation()
      if (element.__原型标注) 标注状态.打开(element.__原型标注)
    }
    element.addEventListener('keydown', element.__原型标注键盘, true)
    element.__原型标注停止监听 = watch(
      () => 标注状态.标注模式.value,
      (是否开启) => {
        if (是否开启 && element.__原型标注) 启用标注语义(element, element.__原型标注)
        else 关闭标注语义(element)
      },
      { immediate: true },
    )
  },
  updated(element, binding) {
    element.__原型标注 = binding.value
    设置标注标识(element, binding.value)
    if (标注状态.标注模式.value) 启用标注语义(element, binding.value)
  },
  unmounted(element) {
    if (element.__原型标注点击) {
      element.removeEventListener('click', element.__原型标注点击, true)
    }
    if (element.__原型标注键盘) {
      element.removeEventListener('keydown', element.__原型标注键盘, true)
    }
    element.__原型标注停止监听?.()
    关闭标注语义(element)
    delete element.dataset.prototypeTitle
    delete element.__原型标注
  },
}
