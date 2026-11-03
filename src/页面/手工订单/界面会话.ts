import { reactive } from 'vue'
import { 创建手工订单草稿 } from './模型'

/** 仅保留当前浏览器运行会话的未提交输入，不写入浏览器持久存储。 */
export const 手工建单界面 = reactive({ draft: 创建手工订单草稿() })
