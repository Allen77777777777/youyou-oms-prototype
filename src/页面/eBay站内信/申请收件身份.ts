/** 申请中的买家标识与 Message API 的收件身份需要在发件店铺内建立映射。 */
export interface ApplicationMailRecipient {
  shopId: string
  sourceBuyerId: string
  username: string
}

export function demoMailRecipient(shopId: string, buyerId: string): ApplicationMailRecipient {
  // 本地虚构数据两侧使用相同标识，生产接入需要独立核验。
  return { shopId, sourceBuyerId: buyerId, username: buyerId }
}

export function getMailUsername(shopId: string, buyerId: string, recipient?: ApplicationMailRecipient): string {
  if (!shopId.trim() || !buyerId.trim() || recipient?.shopId !== shopId || recipient.sourceBuyerId !== buyerId) return ''
  return recipient.username.trim()
}
