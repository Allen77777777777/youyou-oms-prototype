import { shallowRef } from 'vue'

export const 业务页签关闭请求 = shallowRef<{ path: string; returnTo: string }>()
const 关闭清理 = new Map<string, () => void>()
export function 注册业务页签清理(path: string, cleanup: () => void) { 关闭清理.set(path, cleanup) }
export function 注销业务页签清理(path: string) { 关闭清理.delete(path) }
export function 清理业务页签(path: string) { const cleanup = 关闭清理.get(path); 关闭清理.delete(path); cleanup?.() }
export function 关闭业务页签(path: string, returnTo: string) { 业务页签关闭请求.value = { path, returnTo } }
