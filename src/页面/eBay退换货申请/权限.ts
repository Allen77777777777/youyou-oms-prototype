import { canViewAfterSale } from '../售后单管理/权限'

/** 复用当前演示人员的店铺授权；不从处理人名单授予权限，也不推导正式角色矩阵。 */
export function getReturnWritePermissionError(row: { shopId: string }): string {
  return canViewAfterSale(row) ? '' : '当前人员没有该店铺的办理权限'
}
