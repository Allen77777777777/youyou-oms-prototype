<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CircleCheck, Plus, QuestionFilled } from '@element-plus/icons-vue'
import {
  ElButton, ElDialog, ElDrawer, ElEmpty, ElForm, ElFormItem, ElIcon, ElInput, ElMessage,
  ElOption, ElPagination, ElRadioButton, ElRadioGroup, ElSelect, ElTable, ElTableColumn, ElTag,
} from 'element-plus'

import FieldSearch from '@/组件/筛选/字段搜索.vue'
import MultiFilter from '@/组件/筛选/多选筛选.vue'
import DateRange from '@/组件/筛选/时间范围.vue'
import { 校验字段搜索, 命中字段搜索, type 搜索字段, type 搜索模式 } from '@/组件/筛选/筛选工具'
import { 格式化北京时间 } from '@/页面/订单处理/时间展示工具'
import { temuAuthAnnotation } from './标注'
import {
  authStatusLabels, authorizedStores, categoryLabels, currencyLabels, getAuthorizationStatus, getCredentialLabel, getRegionOptions,
  getRegionStatus, getSelectedRegions, previewAuthorization, regionLabels,
  saveAuthorization, setStoreEnabled, storeNameMaxLength, storeTypeLabels, updateStoreName,
  type AuthorizationCategory, type AuthorizationInput, type AuthorizationPeriod, type AuthorizedStore, type AuthStatus,
  type Currency, type Region, type RegionSelection, type StoreType,
} from './授权模型'

const toOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const authorizationOptions = toOptions(authStatusLabels)
const storeStatusOptions = [{ value: 'enabled', label: '已启用' }, { value: 'disabled', label: '已停用' }]
const regionOptions = (['US', 'GLOBAL', 'EU'] as const).map(value => ({ value, label: regionLabels[value] }))
const typeOptions = toOptions(storeTypeLabels)
const categoryOptions = toOptions(categoryLabels)
const currencyOptions = toOptions(currencyLabels)
const fields: 搜索字段[] = [
  { value: 'name', label: '店铺名称', kind: 'text' },
  { value: 'id', label: '店铺 ID', kind: 'identifier' },
]

function defaultFilters() {
  return {
    query: '', field: 'name', mode: 'contains' as 搜索模式, categories: [] as string[], types: [] as string[],
    regions: [] as string[], authorization: [] as string[], storeStatus: [] as string[],
    date: null as string[] | null,
  }
}

const filters = reactive(defaultFilters())
const applied = ref(defaultFilters())
const page = ref(1)
const pageSize = ref(20)

function search() {
  const kind = filters.field === 'id' ? 'identifier' : 'text'
  const error = 校验字段搜索(filters.query, filters.mode, kind)
  if (error) return void ElMessage.warning(error)
  applied.value = { ...filters }
  page.value = 1
}

function reset() {
  Object.assign(filters, defaultFilters())
  search()
}

function authorizationEntries(store: AuthorizedStore): Array<AuthorizationPeriod & { region?: Region }> {
  return store.category === 'half-managed' ? store.regions : [{ ...store.authorization, region: undefined }]
}

const results = computed(() => {
  const { query, field, mode, categories, types, regions, authorization, storeStatus, date } = applied.value
  return authorizedStores.value.filter(store => {
    if (categories.length && !categories.includes(store.category)) return false
    if (types.length && (store.category !== 'half-managed' || !types.includes(store.type))) return false
    if (authorization.length && !authorization.includes(getAuthorizationStatus(store))) return false
    if (storeStatus.length && !storeStatus.includes(store.enabled ? 'enabled' : 'disabled')) return false
    if (!authorizationEntries(store).some(item => {
      const authorizedDate = 格式化北京时间(item.authorizedAt).slice(0, 10)
      return (!regions.length || (item.region !== undefined && regions.includes(item.region)))
        && (!date || (authorizedDate >= date[0]! && authorizedDate <= date[1]!))
    })) return false
    return field === 'id'
      ? 命中字段搜索(store.id, query, mode, 'identifier')
      : 命中字段搜索(store.name, query, mode, 'text')
  })
})
const rows = computed(() => results.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch(() => results.value.length, total => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(total / pageSize.value)))
})

const statusTag: Record<AuthStatus, 'success' | 'warning' | 'danger'> = {
  authorized: 'success', expiring: 'warning', expired: 'danger', partial: 'warning',
}
const statusOf = (store: AuthorizedStore) => getAuthorizationStatus(store)

const helpOpen = ref(false)
const detailId = ref('')
const detail = computed(() => authorizedStores.value.find(store => store.id === detailId.value))
const detailOpen = computed({ get: () => Boolean(detail.value), set: open => { if (!open) detailId.value = '' } })

const authOpen = ref(false)
const authError = ref('')
const authPreview = ref<AuthorizedStore>()
const renewId = ref('')
const renewStore = computed(() => authorizedStores.value.find(store => store.id === renewId.value))
const draft = reactive({
  name: '', category: 'half-managed' as AuthorizationCategory, type: 'cross-border' as StoreType,
  region: 'US' as RegionSelection, currency: '' as Currency | '',
  codes: {} as Partial<Record<Region, string>>, accessToken: '',
})
const targetRegions = computed(() => getSelectedRegions(draft.region))
const selectableRegions = computed(() => {
  const current = renewStore.value
  return getRegionOptions(draft.type).filter(selection => current?.category !== 'half-managed'
    || getSelectedRegions(selection).every(region => current.regions.some(item => item.region === region)))
})
const previewEntries = computed(() => authPreview.value
  ? authorizationEntries(authPreview.value).filter(item => !item.region || targetRegions.value.includes(item.region))
  : [])

function openAuthorization(store?: AuthorizedStore) {
  detailId.value = ''
  renewId.value = store?.id ?? ''
  const regions = store?.category === 'half-managed' ? store.regions : []
  const combined = regions.some(item => item.region === 'US') && regions.some(item => item.region === 'GLOBAL')
  Object.assign(draft, {
    name: store?.name ?? '', category: store?.category ?? 'half-managed',
    type: store?.category === 'half-managed' ? store.type : 'cross-border',
    region: combined ? 'US_GLOBAL' : regions[0]?.region ?? 'US', currency: store?.currency ?? '',
  })
  clearCredentials()
  authOpen.value = true
}

function clearPreview() {
  authPreview.value = undefined
  authError.value = ''
}

function clearCredentials() {
  draft.codes = {}
  draft.accessToken = ''
  clearPreview()
}

function updateCategory(value: string | number | boolean | undefined) {
  if (value !== 'half-managed' && value !== 'full-managed') return
  draft.category = value
  clearCredentials()
}

function updateType(value: string | number | boolean | undefined) {
  if (value !== 'local' && value !== 'cross-border') return
  draft.type = value
  if (!getRegionOptions(value).includes(draft.region)) draft.region = 'US'
  clearCredentials()
}

function getAuthorizationInput(): AuthorizationInput {
  const { name, category, type, region, currency, codes, accessToken } = draft
  const identity = { name, currency, storeId: renewId.value || undefined }
  return category === 'half-managed' ? { ...identity, category, type, region, codes } : { ...identity, category, accessToken }
}

function verifyAuthorization() {
  if (authPreview.value) return
  const result = previewAuthorization(getAuthorizationInput())
  if (!result.ok) { authError.value = result.message; return }
  clearPreview()
  authPreview.value = result.store
}

function confirmAuthorization() {
  if (!authPreview.value) return
  const result = saveAuthorization(getAuthorizationInput())
  if (!result.ok) { authError.value = result.message; return }
  if (!renewId.value) reset()
  ElMessage.success(renewId.value ? '授权已更新' : '店铺授权成功')
  authOpen.value = false
  clearCredentials()
}

const editOpen = ref(false)
const editId = ref('')
const editName = ref('')
const editError = ref('')

function openEdit(store: AuthorizedStore) {
  editId.value = store.id
  editName.value = store.name
  editError.value = ''
  editOpen.value = true
}

function saveName() {
  const result = updateStoreName(editId.value, editName.value)
  if (!result.ok) { editError.value = result.message; return }
  editOpen.value = false
  ElMessage.success('店铺名称已保存')
}

const toggleOpen = ref(false)
const toggleTarget = ref<{ id: string; name: string; category: AuthorizationCategory; enabled: boolean }>()

function openToggle(store: AuthorizedStore) {
  toggleTarget.value = { id: store.id, name: store.name, category: store.category, enabled: !store.enabled }
  toggleOpen.value = true
}

function confirmToggle() {
  const target = toggleTarget.value
  if (!target) return
  const result = setStoreEnabled(target.id, target.enabled)
  if (!result.ok) return void ElMessage.warning(result.message)
  toggleOpen.value = false
  ElMessage.success(target.enabled ? '店铺已启用' : '店铺已停用')
}
</script>

<template>
  <section class="auth-workbench" aria-labelledby="temu-auth-title">
    <header class="auth-header">
      <h1 id="temu-auth-title">Temu店铺授权</h1>
      <ElButton link type="primary" :icon="QuestionFilled" @click="helpOpen = true">授权说明</ElButton>
    </header>

    <div class="auth-filters" v-prototype="temuAuthAnnotation.filters" aria-label="店铺授权筛选">
      <FieldSearch v-model="filters.query" v-model:field="filters.field" v-model:mode="filters.mode"
        :fields="fields" :width="340" aria-prefix="Temu店铺" @search="search" />
      <MultiFilter v-model="filters.categories" :options="categoryOptions" placeholder="托管类型" :width="90" />
      <MultiFilter v-model="filters.types" :options="typeOptions" placeholder="店铺类型" :width="90" />
      <MultiFilter v-model="filters.regions" :options="regionOptions" placeholder="区域" :width="76" />
      <MultiFilter v-model="filters.authorization" :options="authorizationOptions" placeholder="授权状态" :width="96" />
      <MultiFilter v-model="filters.storeStatus" :options="storeStatusOptions" placeholder="店铺状态" :width="96" />
      <div class="filter-tail">
        <DateRange v-model="filters.date" :width="205" precision="date" aria-prefix="授权时间" hint="按北京时间筛选符合条件的授权日期" />
        <div class="filter-buttons">
          <ElButton type="primary" @click="search">查询</ElButton>
          <ElButton @click="reset">重置</ElButton>
        </div>
      </div>
    </div>

    <div class="auth-toolbar">
      <span v-prototype="temuAuthAnnotation.add"><ElButton type="primary" :icon="Plus" @click="openAuthorization()">授权店铺</ElButton></span>
      <span class="time-note">授权时间与到期时间均为北京时间</span>
    </div>

    <div class="auth-table" v-prototype="temuAuthAnnotation.list">
      <ElTable :data="rows" row-key="id" height="100%" highlight-current-row>
        <ElTableColumn label="店铺名称" min-width="146" show-overflow-tooltip>
          <template #default="{ row }"><ElButton link type="primary" class="store-link" @click="detailId = row.id">{{ row.name }}</ElButton></template>
        </ElTableColumn>
        <ElTableColumn prop="id" label="Temu 店铺 ID" min-width="128" show-overflow-tooltip />
        <ElTableColumn label="托管类型" min-width="103">
          <template #default="{ row }">
            <div>{{ categoryLabels[row.category as AuthorizationCategory] }}</div>
            <div v-if="row.category === 'half-managed'" class="store-subtype">{{ storeTypeLabels[row.type as StoreType] }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="currency" label="店铺币种" min-width="74" />
        <ElTableColumn label="区域" min-width="75">
          <template #default="{ row }">
            <div v-for="item in authorizationEntries(row as AuthorizedStore)" :key="item.region ?? 'shop'" class="region-line">{{ item.region ? regionLabels[item.region] : '—' }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="授权状态" min-width="94">
          <template #default="{ row }">
            <div v-for="item in authorizationEntries(row as AuthorizedStore)" :key="item.region ?? 'shop'" class="region-line">
              <ElTag :type="statusTag[getRegionStatus(item.expiresAt)]" effect="light" size="small">{{ authStatusLabels[getRegionStatus(item.expiresAt)] }}</ElTag>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="授权时间" min-width="138">
          <template #default="{ row }">
            <div v-for="item in authorizationEntries(row as AuthorizedStore)" :key="item.region ?? 'shop'" class="region-line time-value">{{ 格式化北京时间(item.authorizedAt) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="到期时间" min-width="138">
          <template #default="{ row }">
            <div v-for="item in authorizationEntries(row as AuthorizedStore)" :key="item.region ?? 'shop'" class="region-line time-value" :class="getRegionStatus(item.expiresAt)">{{ 格式化北京时间(item.expiresAt) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="店铺状态" min-width="82">
          <template #default="{ row }"><span class="enabled-status" :class="{ enabled: row.enabled }">{{ row.enabled ? '已启用' : '已停用' }}</span></template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="160">
          <template #default="{ row }">
            <div class="row-actions" v-prototype="temuAuthAnnotation.actions">
              <ElButton link type="primary" @click="openAuthorization(row as AuthorizedStore)">更新授权</ElButton>
              <ElButton link type="primary" @click="openEdit(row as AuthorizedStore)">编辑</ElButton>
              <ElButton link :type="row.enabled ? 'danger' : 'primary'" @click="openToggle(row as AuthorizedStore)">{{ row.enabled ? '停用' : '启用' }}</ElButton>
            </div>
          </template>
        </ElTableColumn>
        <template #empty><ElEmpty description="暂无匹配的店铺授权" :image-size="80" /></template>
      </ElTable>
    </div>

    <footer class="auth-pagination">
      <ElPagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]"
        :total="results.length" layout="total, sizes, prev, pager, next" background @size-change="page = 1" />
    </footer>
  </section>

  <ElDialog v-model="authOpen" :title="renewId ? '更新授权' : '授权店铺'" width="min(620px, 94vw)"
    append-to-body align-center destroy-on-close :close-on-click-modal="false" @close="clearCredentials">
    <div v-prototype="temuAuthAnnotation.form" class="authorization-form">
      <ol class="auth-steps" aria-label="授权步骤">
        <li :class="{ current: !authPreview, complete: authPreview }" :aria-current="!authPreview ? 'step' : undefined"><span>1</span>填写授权信息</li>
        <li :class="{ current: authPreview }" :aria-current="authPreview ? 'step' : undefined"><span>2</span>确认店铺</li>
      </ol>

      <ElForm v-if="!authPreview" label-position="top" autocomplete="off" @submit.prevent="verifyAuthorization">
        <ElFormItem label="托管类型" required>
          <ElRadioGroup :model-value="draft.category" :disabled="!!renewId" aria-label="托管类型" @change="updateCategory">
            <ElRadioButton label="半托管" value="half-managed" />
            <ElRadioButton label="全托管" value="full-managed" />
          </ElRadioGroup>
        </ElFormItem>
        <div class="form-columns shop-form-columns">
          <ElFormItem label="店铺名称" required>
            <ElInput v-model="draft.name" :maxlength="storeNameMaxLength" :disabled="!!renewId" placeholder="输入中台使用的店铺名称" aria-label="店铺名称" @input="clearPreview" />
          </ElFormItem>
          <ElFormItem label="店铺币种" required>
            <ElSelect v-model="draft.currency" :disabled="!!renewId" aria-label="店铺币种" placeholder="请选择店铺币种" @change="clearPreview">
              <ElOption v-for="item in currencyOptions" :key="item.value" :value="item.value" :label="item.label" />
            </ElSelect>
          </ElFormItem>
        </div>
        <div v-if="draft.category === 'half-managed'" class="form-columns">
          <ElFormItem label="店铺类型" required>
            <ElRadioGroup :model-value="draft.type" :disabled="!!renewId" aria-label="店铺类型" @change="updateType">
              <ElRadioButton label="跨境" value="cross-border" />
              <ElRadioButton label="本土" value="local" />
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="区域" required>
            <ElSelect v-model="draft.region" :disabled="selectableRegions.length === 1" aria-label="授权区域" @change="clearCredentials">
              <ElOption v-for="region in selectableRegions" :key="region" :value="region" :label="regionLabels[region]" />
            </ElSelect>
          </ElFormItem>
        </div>
        <div v-if="draft.category === 'half-managed'" class="credential-fields">
          <ElFormItem v-for="region in targetRegions" :key="region" :label="getCredentialLabel(region, draft.type)" required>
            <ElInput v-model="draft.codes[region]" :aria-label="getCredentialLabel(region, draft.type)" type="password"
              autocomplete="off" :spellcheck="false" :placeholder="`请粘贴 ${getCredentialLabel(region, draft.type)}`" @input="clearPreview" />
          </ElFormItem>
          <p v-if="draft.region === 'US_GLOBAL'" class="form-hint">请分别粘贴同一店铺的美国和 Global 订单发货 Token。</p>
          <p v-if="draft.type === 'local'" class="form-hint">按店铺所在站点选择区域。加拿大、墨西哥等非美国、非欧区站点选 Global。</p>
        </div>
        <ElFormItem v-else label="Access Token" required class="full-token-field">
          <ElInput v-model="draft.accessToken" aria-label="Access Token" type="password"
            autocomplete="off" :spellcheck="false" placeholder="请粘贴 Access Token" @input="clearPreview" />
        </ElFormItem>
      </ElForm>

      <div v-else class="auth-review">
        <p class="verified-note"><ElIcon><CircleCheck /></ElIcon>凭证校验通过，请核对平台店铺及授权信息。</p>
        <dl class="shop-fields">
          <div><dt>店铺名称</dt><dd>{{ authPreview.name }}</dd></div>
          <div><dt>Temu 店铺名称</dt><dd>{{ authPreview.platformName }}</dd></div>
          <div><dt>Temu 店铺 ID</dt><dd>{{ authPreview.id }}</dd></div>
          <div><dt>托管类型</dt><dd>{{ categoryLabels[authPreview.category] }}</dd></div>
          <div v-if="authPreview.category === 'half-managed'"><dt>店铺类型</dt><dd>{{ storeTypeLabels[authPreview.type] }}</dd></div>
          <div><dt>店铺币种</dt><dd>{{ authPreview.currency }}</dd></div>
        </dl>
        <dl class="review-regions">
          <div v-for="item in previewEntries" :key="item.region ?? 'shop'"><dt>{{ item.region ? regionLabels[item.region] : '' }}预计到期时间（北京时间）</dt><dd class="time-value">{{ 格式化北京时间(item.expiresAt) }}</dd></div>
        </dl>
      </div>
      <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
    </div>
    <template #footer>
      <ElButton @click="authOpen = false">取消</ElButton>
      <ElButton v-if="authPreview" @click="clearPreview">上一步</ElButton>
      <ElButton v-if="authPreview" type="primary" @click="confirmAuthorization">{{ renewId ? '确认更新' : '确认授权' }}</ElButton>
      <ElButton v-else type="primary" @click="verifyAuthorization">校验授权</ElButton>
    </template>
  </ElDialog>

  <ElDrawer v-model="detailOpen" title="授权详情" size="min(650px, 96vw)" append-to-body destroy-on-close>
    <div v-if="detail" v-prototype="temuAuthAnnotation.detail" class="auth-detail">
      <div class="detail-header">
        <h2>{{ detail.name }}</h2>
        <ElTag :type="statusTag[statusOf(detail)]" effect="light">{{ authStatusLabels[statusOf(detail)] }}</ElTag>
      </div>
      <dl class="shop-fields">
        <div><dt>Temu 店铺 ID</dt><dd>{{ detail.id }}</dd></div>
        <div><dt>Temu 店铺名称</dt><dd>{{ detail.platformName }}</dd></div>
        <div><dt>托管类型</dt><dd>{{ categoryLabels[detail.category] }}</dd></div>
        <div v-if="detail.category === 'half-managed'"><dt>店铺类型</dt><dd>{{ storeTypeLabels[detail.type] }}</dd></div>
        <div><dt>店铺币种</dt><dd>{{ detail.currency }}</dd></div>
        <div><dt>店铺状态</dt><dd>{{ detail.enabled ? '已启用' : '已停用' }}</dd></div>
      </dl>
      <h3>{{ detail.category === 'half-managed' ? '订单授权记录' : '店铺授权记录' }}</h3>
      <p class="time-note">北京时间</p>
      <ElTable :data="authorizationEntries(detail)">
        <ElTableColumn v-if="detail.category === 'half-managed'" label="区域" min-width="73">
          <template #default="{ row }">{{ regionLabels[row.region as Region] }}</template>
        </ElTableColumn>
        <ElTableColumn label="授权状态" min-width="95">
          <template #default="{ row }">
            <ElTag :type="statusTag[getRegionStatus(row.expiresAt)]" effect="light" size="small">{{ authStatusLabels[getRegionStatus(row.expiresAt)] }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="授权时间" min-width="149"><template #default="{ row }"><span class="time-value">{{ 格式化北京时间(row.authorizedAt) }}</span></template></ElTableColumn>
        <ElTableColumn label="到期时间" min-width="149"><template #default="{ row }"><span class="time-value">{{ 格式化北京时间(row.expiresAt) }}</span></template></ElTableColumn>
      </ElTable>
    </div>
    <template #footer>
      <ElButton @click="detailOpen = false">关闭</ElButton>
      <ElButton v-if="detail" type="primary" @click="openAuthorization(detail)">更新授权</ElButton>
    </template>
  </ElDrawer>

  <ElDialog v-model="editOpen" title="编辑店铺名称" width="min(440px, 94vw)" append-to-body align-center destroy-on-close>
    <ElForm label-position="top" @submit.prevent="saveName">
      <ElFormItem label="店铺名称" required>
        <ElInput v-model="editName" :maxlength="storeNameMaxLength" show-word-limit aria-label="店铺名称" @input="editError = ''" />
      </ElFormItem>
      <p v-if="editError" class="form-error" role="alert">{{ editError }}</p>
    </ElForm>
    <template #footer><ElButton @click="editOpen = false">取消</ElButton><ElButton type="primary" @click="saveName">保存</ElButton></template>
  </ElDialog>

  <ElDialog v-model="toggleOpen" :title="toggleTarget?.enabled ? '启用店铺' : '停用店铺'" width="min(440px, 94vw)" append-to-body align-center destroy-on-close>
    <div v-if="toggleTarget" v-prototype="temuAuthAnnotation.confirm" class="toggle-confirm">
      <p>确认{{ toggleTarget.enabled ? '启用' : '停用' }}「{{ toggleTarget.name }}」？</p>
      <p v-if="toggleTarget.category === 'half-managed'" class="form-hint">{{ toggleTarget.enabled ? '启用后，仍需有效的订单凭证才能接入订单。' : '停用后将暂停该店铺的订单接入，已有订单可继续查看。' }}</p>
    </div>
    <template #footer>
      <ElButton @click="toggleOpen = false">取消</ElButton>
      <ElButton :type="toggleTarget?.enabled ? 'primary' : 'danger'" @click="confirmToggle">{{ toggleTarget?.enabled ? '确认启用' : '确认停用' }}</ElButton>
    </template>
  </ElDialog>

  <ElDialog v-model="helpOpen" title="授权说明" width="min(550px, 94vw)" append-to-body align-center>
    <div class="help-content">
      <dl>
        <div><dt>半托管 · 跨境</dt><dd>粘贴对应区域的订单发货 Token。美国与 Global 合并录入时，分别粘贴同一店铺的两个区域凭证。</dd></div>
        <div><dt>半托管 · 本土</dt><dd>按店铺所在站点选择对应区域，粘贴一个 Access Token。</dd></div>
        <div><dt>全托管</dt><dd>填写店铺名称和币种，粘贴一个 Access Token。</dd></div>
        <div><dt>授权到期</dt><dd>重新获取相应凭证，再从列表选择「更新授权」。</dd></div>
      </dl>
    </div>
    <template #footer><ElButton @click="helpOpen = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.auth-workbench {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 4px;
  color: #455469;
  font-size: 13px;
}
.auth-header, .auth-filters, .auth-toolbar, .auth-pagination { flex: none; }
.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #edf0f5;
}
.auth-header h1 { margin: 0; color: var(--yy-text-heading); font-size: 16px; font-weight: 600; }
.auth-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 14px 16px 12px; }
.filter-buttons, .filter-tail { display: flex; align-items: center; gap: 8px; }
.filter-tail { flex-wrap: wrap; max-width: 100%; }
.filter-buttons .el-button, .auth-toolbar .el-button, .row-actions .el-button { margin: 0; font-size: 12px; }
.auth-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px 12px; }
.time-note { color: #657386; font-size: 12px; }
.auth-table { flex: 1; min-height: 0; min-width: 0; padding: 0 15px; }
.auth-table :deep(.el-table), .auth-detail :deep(.el-table) { color: #455469; font-size: 12px; }
.auth-table :deep(.el-table th), .auth-detail :deep(.el-table th) { background: #f5f7fa; color: var(--yy-text-heading); }
.auth-table :deep(.el-table__cell) { padding: 9px 0; }
.auth-table :deep(.el-table th .cell), .row-actions, .time-value { white-space: nowrap; }
.region-line { display: flex; align-items: center; min-height: 27px; }
.store-link { display: inline-block; max-width: 100%; overflow: hidden; font-size: 12px; text-overflow: ellipsis; vertical-align: middle; }
.store-link :deep(span) { display: inline; }
.store-subtype { color: #657386; font-size: 12px; line-height: 1.35; }
.time-value { font-variant-numeric: tabular-nums; }
.time-value.expiring { color: #996213; }
.time-value.expired { color: #b54343; }
.enabled-status { display: inline-flex; align-items: center; white-space: nowrap; gap: 6px; color: #657386; }
.enabled-status::before { width: 6px; height: 6px; border-radius: 50%; background: #8a96a5; content: ''; }
.enabled-status.enabled::before { background: #4a9e60; }
.row-actions { display: flex; align-items: center; gap: 9px; }
.auth-pagination { display: flex; justify-content: flex-end; padding: 11px 16px; border-top: 1px solid #edf0f5; }
.auth-steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 0 20px;
  padding: 10px 12px;
  border: 1px solid #e4eaf2;
  border-radius: 4px;
  background: #f7f9fc;
  list-style: none;
}
.auth-steps li { display: flex; align-items: center; gap: 8px; color: #657386; font-size: 13px; }
.auth-steps li.current { color: var(--yy-text-heading); font-weight: 600; }
.auth-steps li span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #e5ebf3; font-size: 12px; }
.auth-steps .current span { background: var(--el-color-primary); color: #fff; }
.auth-steps .complete span { background: #e5f4ed; color: #34855e; }
.form-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.shop-form-columns { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
.authorization-form :deep(.el-form-item__label) { color: var(--yy-text-heading); }
.authorization-form :deep(.el-select) { width: 100%; }
.credential-fields .el-form-item:last-of-type { margin-bottom: 8px; }
.full-token-field { margin-bottom: 8px; }
.form-hint, .form-error { margin: 8px 0 0; font-size: 12px; line-height: 1.6; }
.form-hint { color: #657386; }
.form-error { color: #b54343; }
.verified-note { display: flex; align-items: center; gap: 7px; margin: 0 0 14px; color: #31744d; }
.shop-fields, .review-regions { margin: 0; }
.shop-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; padding: 14px; border: 1px solid #e5eaf1; border-radius: 4px; }
.shop-fields div { min-width: 0; }
.shop-fields dt, .review-regions dt { margin-bottom: 4px; color: #657386; font-size: 12px; }
.shop-fields dd, .review-regions dd { margin: 0; color: var(--yy-text-heading); overflow-wrap: anywhere; }
.review-regions { display: flex; flex-wrap: wrap; gap: 12px 22px; margin-top: 14px; }
.detail-header { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
.detail-header h2 { margin: 0; color: var(--yy-text-heading); font-size: 16px; overflow-wrap: anywhere; }
.auth-detail h3 { margin: 22px 0 3px; color: var(--yy-text-heading); font-size: 14px; }
.auth-detail .time-note { margin: 0 0 9px; }
.toggle-confirm p { overflow-wrap: anywhere; }
.toggle-confirm p:first-child, .help-content p { margin-top: 0; }
.help-content dl { display: grid; gap: 12px; margin: 0; }
.help-content dt { margin-bottom: 4px; color: var(--yy-text-heading); font-weight: 600; }
.help-content dd { margin: 0; line-height: 1.6; }
</style>
