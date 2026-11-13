<script setup lang="ts">
import { computed } from 'vue'
import { ElAlert, ElFormItem, ElOption, ElRadio, ElRadioGroup, ElSelect, ElTag } from 'element-plus'
import { 创建默认收件信息动作, 校验收件信息动作, 门牌来源选项, 门牌解析方式选项, type 收件信息动作配置 } from './收件信息规则模型'
import { 收件信息标注 } from './收件信息规则标注'

const props = defineProps<{ rule: { recipientAction?: 收件信息动作配置 }; validate?: boolean; readonly?: boolean }>()
if (!props.rule.recipientAction) props.rule.recipientAction = 创建默认收件信息动作()
const action = computed(() => props.rule.recipientAction!)
const error = computed(() => props.validate ? 校验收件信息动作(action.value) : '')
const method = computed(() => 门牌解析方式选项.find(item => item.value === action.value.method))
</script>

<template>
  <div class="收件信息动作" v-prototype="收件信息标注('action', '门牌号解析配置')">
    <div class="收件动作标题"><strong>门牌号解析</strong><ElTag size="small" type="info">对外请求前执行</ElTag></div>
    <p class="执行位置说明">在对外运费试算、物流下单或推仓前，处理本次请求的收件资料。</p>
    <ElFormItem label="来源地址" required>
      <ElSelect v-model="action.sourceOrder" aria-label="门牌来源地址" :disabled="readonly" class="门牌来源选择">
        <ElOption v-for="item in 门牌来源选项" :key="item.value" :value="item.value" :label="item.label" />
      </ElSelect>
    </ElFormItem>
    <ElFormItem label="解析方式" required>
      <ElSelect v-model="action.method" aria-label="门牌解析方式" :disabled="readonly" placeholder="请选择解析方式" class="门牌来源选择">
        <ElOption v-for="item in 门牌解析方式选项" :key="item.value" :value="item.value" :label="item.label" />
      </ElSelect>
      <p v-if="method" class="收件动作帮助">{{ method.description }}<br />{{ method.example }}</p>
    </ElFormItem>
    <ElFormItem label="门牌字符" required>
      <ElRadioGroup v-model="action.tokenMode" aria-label="门牌字符类型" :disabled="readonly"><ElRadio value="digits">仅数字</ElRadio><ElRadio value="alphanumeric">数字、字母及连字符</ElRadio></ElRadioGroup>
      <p class="收件动作帮助">最多 8 个字符，超出时解析失败。<template v-if="action.method === 'leadingNumber' || action.method === 'firstDigits'">当前解析方式只截取连续数字。</template><template v-else>可按所选字符范围识别 128、12A、12-14。</template></p>
    </ElFormItem>
    <ElFormItem label="解析后的详细地址" required>
      <ElRadioGroup v-model="action.addressMode" aria-label="解析后的详细地址" :disabled="readonly"><ElRadio value="keep">保留门牌号</ElRadio><ElRadio value="remove">移除门牌号</ElRadio></ElRadioGroup>
      <p class="收件动作帮助">仅影响本次请求的地址副本；订单原始地址保留。来源已有独立门牌号时，保留已有值。</p>
    </ElFormItem>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon />
  </div>
</template>

<style scoped>
.收件动作标题 { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:0 0 20px; color:var(--yy-text-heading); }
.执行位置说明 { margin:-10px 0 20px; font-size:12px; line-height:1.65; color:var(--el-text-color-secondary); }
.门牌来源选择 { width:320px; max-width:100%; }
.收件动作帮助 { flex-basis:100%; margin:5px 0 0; line-height:1.65; font-size:12px; color:var(--el-text-color-secondary); }
.收件信息动作 :deep(.el-radio-group) { display:flex; flex-wrap:wrap; gap:0 16px; }
.收件信息动作 :deep(.el-radio) { margin-right:0; }
</style>
