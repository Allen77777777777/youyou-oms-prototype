<script setup lang="ts">
import { RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { 启动循环审单 } from './页面/业务配置/循环审单'
import { 启动循环推单 } from './页面/业务配置/循环推单'
import { 启动循环合单 } from './页面/业务配置/循环合单'

启动循环审单()
启动循环推单()
启动循环合单()
</script>

<template>
  <ElConfigProvider :locale="zhCn"><RouterView /></ElConfigProvider>
</template>
