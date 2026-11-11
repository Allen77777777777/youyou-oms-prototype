import { cloneVNode, computed, defineComponent, provide, shallowReactive, shallowRef, watch, type Component, type PropType, type VNode } from 'vue'
import { routeLocationKey, routerViewLocationKey, type RouteLocationNormalizedLoaded } from 'vue-router'

// 仅在查看买家资料时保留来源页签；普通导航仍沿用原页面生命周期。
const retainedPaths = shallowRef(new Set<string>())
const scopes = new Map<string, Component>()
const names = new Map<string, string>()
const closedPaths = new Set<string>()
let sequence = 0

function scopeName(path: string) {
  if (!names.has(path)) names.set(path, `BuyerBrowseScope${++sequence}`)
  return names.get(path)!
}

export const buyerRetainedPageNames = computed(() => [...retainedPaths.value].map(scopeName))
export function retainBuyerSourcePage(path: string) {
  if (!path || path === '/index' || closedPaths.has(path)) return
  retainedPaths.value = new Set([...retainedPaths.value, path])
}
export function releaseBuyerSourcePage(path: string) {
  closedPaths.add(path)
  const next = new Set(retainedPaths.value)
  next.delete(path)
  retainedPaths.value = next
}
/** 页签真实打开后才允许再次保留；关闭后跳邻近买家页不能复活旧实例。 */
export function markBuyerSourcePageOpen(path: string) { closedPaths.delete(path) }

/** 每个页签固定自己的路由上下文，后台保留页不会误响应另一个买家的参数。 */
export function buyerScopedPage(path: string): Component {
  if (!scopes.has(path)) {
    scopes.set(path, defineComponent({
      name: scopeName(path),
      props: {
        page: { type: Object as PropType<VNode>, required: true },
        viewRoute: { type: Object as PropType<RouteLocationNormalizedLoaded>, required: true },
      },
      setup(props) {
        const snapshot = shallowReactive({ ...props.viewRoute })
        provide(routeLocationKey, snapshot)
        provide(routerViewLocationKey, computed(() => snapshot))
        watch(() => props.viewRoute, value => Object.assign(snapshot, value))
        return () => cloneVNode(props.page)
      },
    }))
  }
  return scopes.get(path)!
}
