import type { TicketAttachment } from './会话'
import packageLandscapeUrl from './演示素材/虚构包裹外观-横图.png?url'
import receiptPortraitUrl from './演示素材/虚构实收清单-竖图.png?url'
import warehouseReplyUrl from './演示素材/虚构仓库回函.txt?url'
import receiptCsvUrl from './演示素材/虚构退件实收核对清单-用于测试长文件名完整展示与原件下载.csv?url'

// 仅这四个稳定标识可读取随原型打包的虚构原件；用户上传文件仍由附件存储管理。
const definitions = [
  { id: 'demo-ticket-package-landscape-v1', name: '虚构包裹外观-横图.png', type: 'image/png', size: 21676, url: packageLandscapeUrl },
  { id: 'demo-ticket-receipt-portrait-v1', name: '虚构实收清单-竖图.png', type: 'image/png', size: 18282, url: receiptPortraitUrl },
  { id: 'demo-ticket-warehouse-reply-v1', name: '虚构仓库回函.txt', type: 'text/plain', size: 231, url: warehouseReplyUrl },
  { id: 'demo-ticket-receipt-csv-v1', name: '虚构退件实收核对清单-用于测试长文件名完整展示与原件下载.csv', type: 'text/csv', size: 131, url: receiptCsvUrl },
] as const

export const builtinTicketAttachments: readonly TicketAttachment[] = Object.freeze(definitions.map(({ url: _url, ...attachment }) => Object.freeze(attachment)))
const builtinUrls = new Map<string, string>(definitions.map(({ id, url }) => [id, url]))

export function resolveBuiltinTicketAttachment(id: string): string | undefined {
  return builtinUrls.get(id)
}
