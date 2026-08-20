<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import AccountSettingsTab from '@/components/settings/AccountSettingsTab.vue'
import AutomationSettingsTab from '@/components/settings/AutomationSettingsTab.vue'
import DefaultPlanSettingsTab from '@/components/settings/DefaultPlanSettingsTab.vue'
import StrategySettingsTab from '@/components/settings/StrategySettingsTab.vue'
import UserSettingsTab from '@/components/settings/UserSettingsTab.vue'
import { useAccountSettings } from '@/composables/settings/useAccountSettings'
import { useAutomationSettings } from '@/composables/settings/useAutomationSettings'
import { useStrategySettings } from '@/composables/settings/useStrategySettings'
import { useUserSettings } from '@/composables/settings/useUserSettings'
import { useSettingStore } from '@/stores/setting'

const settingStore = useSettingStore()
const route = useRoute()

type SettingsTabKey = 'account' | 'strategy' | 'automation' | 'default-plan' | 'user'

function getInitialSettingsTab(): SettingsTabKey {
  const requested = String(route.query.tab || '')
  if (requested === 'account' || requested === 'strategy' || requested === 'automation' || requested === 'default-plan' || requested === 'user')
    return requested
  const saved = localStorage.getItem('settings-active-tab')
  return saved === 'strategy' || saved === 'automation' || saved === 'default-plan' || saved === 'user'
    ? saved
    : 'account'
}

const activeTab = ref<SettingsTabKey>(getInitialSettingsTab())
const settingsTabsNav = ref<HTMLElement | null>(null)

async function scrollActiveTabIntoView() {
  await nextTick()
  const button = settingsTabsNav.value?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab.value}"]`)
  button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

watch(activeTab, (newTab) => {
  localStorage.setItem('settings-active-tab', newTab)
  void scrollActiveTabIntoView()
})

const tabs = [
  { key: 'account', label: '账号管理', icon: 'i-carbon-user-settings' },
  { key: 'strategy', label: '策略设置', icon: 'i-fas-cogs' },
  { key: 'automation', label: '自动控制', icon: 'i-carbon-toggle-on' },
  { key: 'default-plan', label: '默认方案', icon: 'i-carbon-settings-adjust' },
  { key: 'user', label: '用户管理', icon: 'i-carbon-user' },
] as const

const modalVisible = ref(false)
const defaultPlanApplyingId = ref('')
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

const {
  passwordSaving,
  offlineSaving,
  offlineTesting,
  deviceProtocolLoading,
  deviceProtocolSaving,
  passwordForm,
  deviceProtocolPresetOptions,
  selectedDevicePreset,
  deviceProtocolForm,
  localOffline,
  channelOptions,
  currentChannelDocUrl,
  openChannelDocs,
  fillRandomDeviceMac,
  fillRandomDeviceId,
  fillRandomImei,
  applyDevicePreset,
  fetchDeviceProtocol,
  syncLocalOfflineSettings,
  handleSaveDeviceProtocol,
  handleChangePassword,
  handleSaveOffline,
  handleTestOffline,
} = useUserSettings(showAlert)

const {
  accounts,
  accountsLoading,
  currentAccountId,
  currentAccountName,
  userIsAdmin,
  showModal,
  showDeleteConfirm,
  deleteLoading,
  editingAccount,
  accountToDelete,
  showClearStoppedConfirm,
  clearStoppedLoading,
  refreshWxCodesLoading,
  stoppedAccountsCount,
  isAddAccountDisabled,
  addAccountDisabledReason,
  isAccountOpsDisabled,
  fetchAccounts,
  selectFirstAccountIfNeeded,
  openSettings,
  openAddModal,
  openEditModal,
  handleDelete,
  confirmDelete,
  toggleAccount,
  refreshWxCodesNow,
  handleSaved,
  selectAccount,
  openClearStoppedConfirm,
  confirmClearStopped,
} = useAccountSettings(showAlert)

const {
  localAutomationSettings,
  localAutoCodeRefresh,
  automationSaving,
  autoCodeRefreshing,
  fertilizerLandTypeOptions,
  fertilizerOptions,
  syncLocalAutomationSettings,
  saveAutomationSettings,
  runAutoCodeRefreshNow,
} = useAutomationSettings({
  currentAccountId,
  showAlert,
})

const {
  settingsLoading,
  strategySaving,
  localStrategySettings,
  plantingStrategyOptions,
  bagFallbackStrategyOptions,
  bagSeeds,
  bagSeedsLoading,
  bagSeedsError,
  sortedBagSeeds,
  preferredSeedOptions,
  strategyPreviewLabel,
  resetBagSeedPriority,
  moveBagSeed,
  removeBagSeedPriority,
  startBagSeedDrag,
  dragOverBagSeed,
  dropBagSeed,
  loadStrategyData,
  saveStrategySettings,
  resetStrategyState,
} = useStrategySettings({
  currentAccountId,
  getAutomationSettings: () => localAutomationSettings.value,
  showAlert,
})

async function applyDefaultPlan(account: any) {
  if (!account?.id || defaultPlanApplyingId.value)
    return
  const accountId = String(account.id)
  defaultPlanApplyingId.value = accountId
  try {
    const { data } = await api.post('/api/settings/default-plan/apply', {}, {
      headers: { 'x-account-id': accountId },
    })
    if (!data?.ok)
      throw new Error(data?.error || '应用失败')
    if (String(currentAccountId.value || '') === accountId) {
      settingStore.clearSettingsState()
      resetStrategyState()
      await loadStrategyData()
      syncLocalAutomationSettings()
    }
    showAlert(`已将默认方案应用到 ${account.name || account.id}`)
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '应用默认方案失败', 'danger')
  }
  finally {
    defaultPlanApplyingId.value = ''
  }
}

watch(currentAccountId, async () => {
  settingStore.clearSettingsState()
  resetStrategyState()
  if (currentAccountId.value) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
})

onMounted(async () => {
  await fetchAccounts()
  await fetchDeviceProtocol()
  selectFirstAccountIfNeeded()
  if (currentAccountId.value) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
  await scrollActiveTabIntoView()
})
</script>

<template>
  <div class="settings-page">
    <div class="mb-4">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-gray-100">
        设置
      </h1>
    </div>

    <div class="border border-gray-200 rounded-lg bg-white shadow dark:border-gray-700 dark:bg-gray-800">
      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav ref="settingsTabsNav" class="flex gap-1 overflow-x-auto p-2">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :data-settings-tab="tab.key"
            class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all"
            :class="activeTab === tab.key
              ? 'text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'"
            :style="activeTab === tab.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
            @click="activeTab = tab.key"
          >
            <div :class="tab.icon" />
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="p-4">
        <!-- 账号管理 -->
        <AccountSettingsTab
          v-if="activeTab === 'account'"
          :accounts="accounts"
          :accounts-loading="accountsLoading"
          :current-account-id="currentAccountId"
          :user-is-admin="userIsAdmin"
          :stopped-accounts-count="stoppedAccountsCount"
          :is-add-account-disabled="isAddAccountDisabled"
          :add-account-disabled-reason="addAccountDisabledReason"
          :is-account-ops-disabled="isAccountOpsDisabled"
          :show-modal="showModal"
          :editing-account="editingAccount"
          :show-delete-confirm="showDeleteConfirm"
          :delete-loading="deleteLoading"
          :account-to-delete="accountToDelete"
          :show-clear-stopped-confirm="showClearStoppedConfirm"
          :clear-stopped-loading="clearStoppedLoading"
          :refresh-wx-codes-loading="refreshWxCodesLoading"
          :default-plan-applying-id="defaultPlanApplyingId"
          @add="openAddModal"
          @clear-stopped="openClearStoppedConfirm"
          @refresh-wx-codes="refreshWxCodesNow"
          @select="selectAccount"
          @toggle="toggleAccount"
          @settings="openSettings"
          @apply-default-plan="applyDefaultPlan"
          @edit="openEditModal"
          @delete="handleDelete"
          @saved="handleSaved"
          @close-modal="showModal = false"
          @close-delete-confirm="showDeleteConfirm = false"
          @confirm-delete="confirmDelete"
          @close-clear-stopped-confirm="showClearStoppedConfirm = false"
          @confirm-clear-stopped="confirmClearStopped"
        />

        <StrategySettingsTab
          v-else-if="activeTab === 'strategy'"
          v-model:settings="localStrategySettings"
          :current-account-name="currentAccountName"
          :current-account-id="currentAccountId"
          :loading="settingsLoading"
          :saving="strategySaving"
          :planting-strategy-options="plantingStrategyOptions"
          :preferred-seed-options="preferredSeedOptions"
          :bag-fallback-strategy-options="bagFallbackStrategyOptions"
          :strategy-preview-label="strategyPreviewLabel"
          :bag-seeds="bagSeeds"
          :sorted-bag-seeds="sortedBagSeeds"
          :bag-seeds-loading="bagSeedsLoading"
          :bag-seeds-error="bagSeedsError"
          @reset-bag-seed-priority="resetBagSeedPriority"
          @move-bag-seed="moveBagSeed"
          @remove-bag-seed="removeBagSeedPriority"
          @start-bag-seed-drag="startBagSeedDrag"
          @drag-over-bag-seed="dragOverBagSeed"
          @drop-bag-seed="dropBagSeed"
          @save="saveStrategySettings"
        />

        <!-- 自动控制 -->
        <AutomationSettingsTab
          v-else-if="activeTab === 'automation'"
          v-model:settings="localAutomationSettings"
          v-model:auto-code-refresh="localAutoCodeRefresh"
          :current-account-name="currentAccountName"
          :current-account-id="currentAccountId"
          :loading="settingsLoading"
          :saving="automationSaving"
          :auto-code-refreshing="autoCodeRefreshing"
          :fertilizer-land-type-options="fertilizerLandTypeOptions"
          :fertilizer-options="fertilizerOptions"
          @run-auto-code-refresh="runAutoCodeRefreshNow"
          @save="saveAutomationSettings"
        />

        <DefaultPlanSettingsTab
          v-else-if="activeTab === 'default-plan'"
          :current-account-id="currentAccountId"
          :current-account-name="currentAccountName"
          :planting-strategy-options="plantingStrategyOptions"
          :preferred-seed-options="preferredSeedOptions"
          :bag-fallback-strategy-options="bagFallbackStrategyOptions"
          :bag-seeds="bagSeeds"
          :bag-seeds-loading="bagSeedsLoading"
          :bag-seeds-error="bagSeedsError"
          :fertilizer-land-type-options="fertilizerLandTypeOptions"
          :fertilizer-options="fertilizerOptions"
          @notify="showAlert"
        />

        <UserSettingsTab
          v-else-if="activeTab === 'user'"
          v-model:device-protocol-form="deviceProtocolForm"
          v-model:selected-device-preset="selectedDevicePreset"
          v-model:password-form="passwordForm"
          v-model:offline-config="localOffline"
          :device-protocol-loading="deviceProtocolLoading"
          :device-protocol-saving="deviceProtocolSaving"
          :device-protocol-preset-options="deviceProtocolPresetOptions"
          :password-saving="passwordSaving"
          :channel-options="channelOptions"
          :current-channel-doc-url="currentChannelDocUrl"
          :offline-saving="offlineSaving"
          :offline-testing="offlineTesting"
          @apply-device-preset="applyDevicePreset"
          @random-mac="fillRandomDeviceMac"
          @random-device-id="fillRandomDeviceId"
          @random-imei="fillRandomImei"
          @save-device-protocol="handleSaveDeviceProtocol"
          @change-password="handleChangePassword"
          @open-docs="openChannelDocs"
          @test-offline="handleTestOffline"
          @save-offline="handleSaveOffline"
        />
      </div>
    </div>

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @close="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </div>
</template>
