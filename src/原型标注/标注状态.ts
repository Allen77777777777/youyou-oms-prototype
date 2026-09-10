import { readonly, ref } from 'vue'

import type { 原型标注 } from '@/类型/标注'

const 标注模式 = ref(false)
const 当前标注 = ref<原型标注>()

// 开发环境热更新可能保留 body 属性；状态模块重新初始化时同步恢复正常交互模式。
if (typeof document !== 'undefined') {
  document.body.dataset.prototypeMode = 'false'
}

export const 标注状态 = {
  标注模式: readonly(标注模式),
  当前标注: readonly(当前标注),
  切换模式() {
    标注模式.value = !标注模式.value
    document.body.dataset.prototypeMode = String(标注模式.value)
    if (!标注模式.value) 当前标注.value = undefined
  },
  打开(标注: 原型标注) {
    if (标注模式.value) 当前标注.value = 标注
  },
  关闭() {
    当前标注.value = undefined
  },
}
