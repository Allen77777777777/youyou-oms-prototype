import { onActivated, onDeactivated, ref } from 'vue'

/** 买家详情往返期间仅暂停弹层展示，原表单与业务 open 状态继续保留。 */
export function useBuyerPageActive() {
  const active = ref(true)
  onActivated(() => { active.value = true })
  onDeactivated(() => { active.value = false })
  return active
}
