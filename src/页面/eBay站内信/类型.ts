export type MessageSource = 'buyer' | 'ebay'
export type WorkStatus = 'pending' | 'processed' | 'ignored'
export type MailPriority = 'urgent' | 'high' | 'normal' | 'low'
export type DeliveryStatus = 'sending' | 'success' | 'failed' | 'unknown'
export type ContextTab = 'overview' | 'order' | 'logistics' | 'afterSales' | 'disputes' | 'reviews' | 'activity'
export interface MessageAttachment { id: string; name: string; size: number; type: string; source?: 'local' | 'url'; url?: string }
export interface MailMessage {
  id: string; kind: 'incoming' | 'outgoing' | 'note'; sender: string; body: string; at: string
  subject?: string; bodyHtml?: string; notice?: NoticeBody
  translation?: string; delivery?: DeliveryStatus; failureReason?: string; attachments?: MessageAttachment[]; forwardedTo?: string
  /** 兼容镜像：来信取所在会话的阅读状态，不作为独立逐封状态或买家已读回执。 */
  unread?: boolean; sendSource?: 'manual' | 'automation'; automationRuleName?: string
  markProcessedOnSuccess?: boolean
}
export interface NoticeBody { heading: string; paragraphs: string[]; sections: Array<{ title: string; content: string }>; footer: string }
export interface Conversation {
  id: string; source: MessageSource; shopId: string; shopName: string; buyerId: string; subject: string
  /** 由服务端核验买家身份并按组织/店铺权限裁剪；原型显式提供虚构范围，不代表真实鉴权。 */
  buyerDataScope?: { buyerKey: string; shopIds: string[] }
  /** 当前卖家会话的阅读投影；与本地处理状态status独立。 */
  unread: boolean; flagged: boolean; assignee: string; status: WorkStatus; updatedAt: string; canReply: boolean
  association: 'confirmed' | 'none' | 'pending'; relatedOrderIds: string[]; messages: MailMessage[]
  product?: { title: string; sku: string }; sendScenario: 'success' | 'failed' | 'unknown'
  priority?: MailPriority; tags?: string[]; lastHandledBy?: string; lastHandledAt?: string; lastHandledAction?: string
  /** 本地显式处理操作版本，避免旧发送回执覆盖后续人工选择。 */
  statusRevision?: number
}
export interface ContextRecord { id: string; title: string; status: string; description: string; at: string; trackingNumber?: string; details?: Array<{ label: string; value: string }> }
export interface ContextDataset { state: 'ready' | 'not_synced' | 'failed' | 'forbidden'; records: ContextRecord[]; updatedAt?: string }
export interface RelatedOrder {
  id: string; shopId: string; buyerId: string; orderNo: string; omsStatus: string; amount: string; currency: string
  shopName?: string
  /** 已核验同一 eBay 账户的内部键，包含来源身份命名空间；不得由显示名或模糊匹配推导。 */
  buyerKey?: string
  product: { title: string; sku: string; quantity: number }; logistics: ContextDataset; afterSales: ContextDataset
  platformProduct?: { title: string; sku: string }
  disputes: ContextDataset; reviews: ContextDataset; activity: ContextRecord[]
}
export interface ReplyDraft { body: string; subject?: string; bodyHtml?: string; attachments: MessageAttachment[]; savedAt?: string; translation?: string }
export interface MailFilters { shopIds: string[]; assignees: string[]; field: string; mode: 'contains' | 'exact'; query: string; onlyUnread: boolean; onlyFlagged: boolean }
