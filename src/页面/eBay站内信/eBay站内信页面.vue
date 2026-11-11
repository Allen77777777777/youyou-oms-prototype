<script setup lang="ts">
import MailWorkbench from './邮箱工作台.vue'
import { initializeAfterSaleDemo } from '../售后单管理/演示数据'

// 仅幂等载入既有明确虚构业务样例；浏览、切单和摘要计算不推进办理状态。
initializeAfterSaleDemo()
</script>
<template><MailWorkbench /></template>
