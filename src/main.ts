import { createApp } from 'vue'

import {
  ElBadge,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElInput,
  ElPopover,
  ElTag,
  ElTooltip,
} from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { 原型标注指令 } from './原型标注/原型标注指令'
import { router } from './路由'
import './样式/基础.css'
import { 初始化新单首轮样例 } from './页面/订单处理/审单规则执行'

const app = createApp(App).directive('prototype', 原型标注指令).use(router)

for (const component of [
  ElBadge,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElInput,
  ElPopover,
  ElTag,
  ElTooltip,
]) {
  app.component(component.name!, component)
}

初始化新单首轮样例()
app.mount('#app')
