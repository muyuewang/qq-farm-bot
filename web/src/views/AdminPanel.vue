<script setup lang="ts">
import type { AdminTabKey } from '@/components/admin/AdminPanelTabs.vue'
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/api'
import AdminAlertModal from '@/components/admin/AdminAlertModal.vue'
import AdminCardConfirmModals from '@/components/admin/AdminCardConfirmModals.vue'
import AdminCardPanel from '@/components/admin/AdminCardPanel.vue'
import AdminLoginLogConfirmModal from '@/components/admin/AdminLoginLogConfirmModal.vue'
import AdminLoginLogPanel from '@/components/admin/AdminLoginLogPanel.vue'
import AdminPanelHeader from '@/components/admin/AdminPanelHeader.vue'
import AdminPanelTabs from '@/components/admin/AdminPanelTabs.vue'
import AdminSystemPanel from '@/components/admin/AdminSystemPanel.vue'
import AdminUserConfirmModals from '@/components/admin/AdminUserConfirmModals.vue'
import AdminUserPanel from '@/components/admin/AdminUserPanel.vue'
import AutoCodeRefreshCard from '@/components/settings/AutoCodeRefreshCard.vue'
import DeviceProtocolCard from '@/components/settings/DeviceProtocolCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAdminCards } from '@/composables/useAdminCards'
import { useAdminLoginLogs } from '@/composables/useAdminLoginLogs'
import { useAdminSystemConfig } from '@/composables/useAdminSystemConfig'
import { useAdminUsers } from '@/composables/useAdminUsers'
import { useAccountSettings } from '@/composables/settings/useAccountSettings'
import { useAutomationSettings } from '@/composables/settings/useAutomationSettings'
import { useUserSettings } from '@/composables/settings/useUserSettings'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const savedAdminTab = localStorage.getItem('admin-active-tab')
const activeTab = ref<AdminTabKey>(['card', 'user', 'log', 'system'].includes(savedAdminTab || '')
  ? savedAdminTab as AdminTabKey
  : 'card')

watch(activeTab, (newTab) => {
  localStorage.setItem('admin-active-tab', newTab)
})

const tabs = [
  { key: 'card', label: '卡密', icon: 'i-carbon-ticket' },
  { key: 'user', label: '用户', icon: 'i-carbon-user-admin' },
  { key: 'log', label: '日志', icon: 'i-carbon-document' },
  { key: 'system', label: '系统配置', icon: 'i-carbon-settings-services' },
] as const

const modalVisible = ref(false)
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
  systemConfigSaving,
  captureConfigSaving,
  captureConfigTesting,
  localSystemConfig,
  defaultSystemConfig,
  localCaptureConfig,
  platformOptions,
  osOptions,
  loadCaptureConfig,
  handleTestCaptureConfig,
  loadSystemConfig,
  handleResetSystemConfig,
} = useAdminSystemConfig({ showAlert })

const {
  deviceProtocolLoading,
  deviceProtocolSaving,
  deviceProtocolPresetOptions,
  selectedDevicePreset,
  deviceProtocolForm,
  fetchDeviceProtocol,
  fillRandomDeviceMac,
  fillRandomDeviceId,
  fillRandomImei,
  applyDevicePreset,
} = useUserSettings(showAlert)

const {
  accountsLoading,
  currentAccountId,
  currentAccountName,
} = useAccountSettings(showAlert)

const {
  localAutoCodeRefresh,
  autoCodeRefreshing,
} = useAutomationSettings({ currentAccountId, showAlert })

const systemSettingsSaving = ref(false)
const anySystemSaving = computed(() => systemSettingsSaving.value || systemConfigSaving.value || captureConfigSaving.value || deviceProtocolSaving.value)

async function saveSystemSettings() {
  if (anySystemSaving.value)
    return
  systemSettingsSaving.value = true
  try {
    const devicePayload = {
      enabled: !!deviceProtocolForm.value.enabled,
      userAgent: String(deviceProtocolForm.value.userAgent || '').trim(),
      deviceBrand: String(deviceProtocolForm.value.deviceBrand || '').trim(),
      deviceModel: String(deviceProtocolForm.value.deviceModel || '').trim(),
      deviceMac: String(deviceProtocolForm.value.deviceMac || '').trim(),
      deviceId: String(deviceProtocolForm.value.deviceId || '').trim(),
      imei: String(deviceProtocolForm.value.imei || '').trim(),
    }
    const [systemResult, captureResult, deviceResult] = await Promise.all([
      api.post('/api/admin/system-config', { ...localSystemConfig.value, confirmed: true }),
      api.post('/api/admin/capture-config', { ...localCaptureConfig.value, confirmed: true }),
      api.post('/api/user/device-protocol', devicePayload),
    ])
    if (!systemResult.data?.ok || !captureResult.data?.ok || !deviceResult.data?.ok)
      throw new Error('部分系统配置保存失败')
    await Promise.all([loadSystemConfig(), loadCaptureConfig(), fetchDeviceProtocol()])
    showAlert('系统配置已统一保存并生效')
  }
  catch (error: any) {
    showAlert(error.response?.data?.error || error.message || '系统配置保存失败', 'danger')
  }
  finally {
    systemSettingsSaving.value = false
  }
}

const {
  cards,
  cardsLoading,
  showCreateModal,
  newCard,
  selectedCards,
  selectAll,
  searchQuery,
  filterStatus,
  cardTypeFilter,
  cardClaimEnabled,
  cardClaimLoading,
  availableTimeCards,
  showDeleteCardConfirm,
  pendingDeleteCard,
  deleteCardLoading,
  showCreateCardConfirm,
  createCardLoading,
  showToggleCardStatusConfirm,
  pendingToggleCard,
  toggleCardStatusLoading,
  showDeleteSelectedCardsConfirm,
  deleteSelectedCardsLoading,
  showCardClaimConfirm,
  pendingCardClaimEnabled,
  unusedTimeCardsCount,
  usedCardsCount,
  enabledCardsCount,
  filteredCards,
  selectedCardCount,
  currentCardTypeLabel,
  currentCardStatusLabel,
  cardManagementSummary,
  fetchCards,
  fetchCardClaimStatus,
  requestToggleCardClaimStatus,
  confirmToggleCardClaimStatus,
  requestCreateCard,
  createCard,
  requestToggleCardStatus,
  toggleCardStatus,
  requestDeleteCard,
  confirmDeleteCard,
  requestDeleteSelectedCards,
  confirmDeleteSelectedCards,
  copyCode,
  copySelectedCards,
  toggleSelectAll,
  toggleSelectCard,
  clearSelectedCards,
} = useAdminCards({ showAlert })

const {
  showDeleteUserConfirm,
  pendingDeleteUser,
  deleteUserLoading,
  showRenewUserModal,
  showRenewUserConfirm,
  pendingRenewUser,
  renewUserCardCode,
  renewUserLoading,
  showToggleUserStatusConfirm,
  pendingToggleUser,
  toggleUserStatusLoading,
  showClearExpiredUsersConfirm,
  clearExpiredUsersLoading,
  showEditUserConfirm,
  users,
  usersLoading,
  userSearchQuery,
  filteredUsers,
  showEditModal,
  selectedUser,
  editForm,
  editLoading,
  currentUsername,
  activeUsersCount,
  expiredUsersCount,
  adminUsersCount,
  userManagementSummary,
  fetchUsers,
  requestToggleUserStatus,
  confirmToggleUserStatus,
  requestDeleteUser,
  confirmDeleteUser,
  openRenewUserModal,
  requestRenewUser,
  confirmRenewUser,
  openClearExpiredUsersConfirm,
  confirmClearExpiredUsers,
  openEditModal,
  handleEdit,
  confirmEditUser,
} = useAdminUsers()

const showClearLogsConfirm = ref(false)
const {
  loginLogs,
  loginLogsLoading,
  loginLogsTotal,
  clearLogsLoading,
  loginSuccessCount,
  loginFailedCount,
  loginLogSummary,
  fetchLoginLogs,
  clearLoginLogs,
} = useAdminLoginLogs()

function openClearLogsConfirm() {
  if (loginLogsTotal.value === 0) {
    toast.warning('暂无日志可清空')
    return
  }
  showClearLogsConfirm.value = true
}

async function confirmClearLogs() {
  const cleared = await clearLoginLogs()
  if (cleared)
    showClearLogsConfirm.value = false
}

onMounted(() => {
  fetchCards()
  fetchUsers()
  fetchLoginLogs()
  fetchCardClaimStatus()
  loadSystemConfig()
  loadCaptureConfig()
  fetchDeviceProtocol()
})
</script>

<template>
  <div class="admin-panel">
    <AdminPanelHeader
      :total-cards="cards.length"
      :unused-time-cards-count="unusedTimeCardsCount"
      :total-users="users.length"
      :login-logs-total="loginLogsTotal"
    />

    <AdminPanelTabs v-model:active-tab="activeTab" :tabs="tabs">
      <AdminCardPanel
        v-if="activeTab === 'card'"
        v-model:show-create-modal="showCreateModal"
        v-model:new-card="newCard"
        v-model:select-all="selectAll"
        v-model:search-query="searchQuery"
        v-model:filter-status="filterStatus"
        v-model:card-type-filter="cardTypeFilter"
        :cards="cards"
        :cards-loading="cardsLoading"
        :used-cards-count="usedCardsCount"
        :enabled-cards-count="enabledCardsCount"
        :unused-time-cards-count="unusedTimeCardsCount"
        :card-management-summary="cardManagementSummary"
        :card-claim-enabled="cardClaimEnabled"
        :card-claim-loading="cardClaimLoading"
        :filtered-cards="filteredCards"
        :selected-cards="selectedCards"
        :selected-card-count="selectedCardCount"
        :current-card-type-label="currentCardTypeLabel"
        :current-card-status-label="currentCardStatusLabel"
        :create-card-loading="createCardLoading"
        @refresh="fetchCards"
        @create="requestCreateCard"
        @toggle-claim="requestToggleCardClaimStatus"
        @copy-selected="copySelectedCards"
        @delete-selected="requestDeleteSelectedCards"
        @clear-selected="clearSelectedCards"
        @toggle-select-all="toggleSelectAll"
        @toggle-select-card="toggleSelectCard"
        @copy-code="copyCode"
        @toggle-card-status="requestToggleCardStatus"
        @delete-card="requestDeleteCard"
      />

      <AdminUserPanel
        v-else-if="activeTab === 'user'"
        v-model:show-renew-user-modal="showRenewUserModal"
        v-model:pending-renew-user="pendingRenewUser"
        v-model:renew-user-card-code="renewUserCardCode"
        v-model:show-edit-modal="showEditModal"
        v-model:edit-form="editForm"
        v-model:user-search-query="userSearchQuery"
        :users="users"
        :filtered-users="filteredUsers"
        :users-loading="usersLoading"
        :current-username="currentUsername"
        :active-users-count="activeUsersCount"
        :expired-users-count="expiredUsersCount"
        :admin-users-count="adminUsersCount"
        :user-management-summary="userManagementSummary"
        :renew-user-loading="renewUserLoading"
        :edit-loading="editLoading"
        @clear-expired="openClearExpiredUsersConfirm"
        @refresh="fetchUsers"
        @open-renew-user="openRenewUserModal"
        @open-edit-user="openEditModal"
        @toggle-user-status="requestToggleUserStatus"
        @delete-user="requestDeleteUser"
        @renew-user="requestRenewUser"
        @edit-user="handleEdit"
      />

      <AdminLoginLogPanel
        v-else-if="activeTab === 'log'"
        :logs="loginLogs"
        :loading="loginLogsLoading"
        :total="loginLogsTotal"
        :success-count="loginSuccessCount"
        :failed-count="loginFailedCount"
        :summary="loginLogSummary"
        @refresh="fetchLoginLogs"
        @clear="openClearLogsConfirm"
      />

      <div v-else-if="activeTab === 'system'" class="space-y-5">
        <div class="sticky top-0 z-10 flex items-center justify-between border border-gray-200 rounded-xl bg-white/95 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
          <div>
            <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
              系统配置
            </h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              统一管理连接参数、设备协议和抓包服务。
            </p>
          </div>
          <BaseButton size="sm" :loading="anySystemSaving" @click="saveSystemSettings">
            保存系统配置
          </BaseButton>
        </div>

        <AdminSystemPanel
          v-model:local-system-config="localSystemConfig"
          v-model:local-capture-config="localCaptureConfig"
          section="system"
          :show-heading="false"
          :show-save="false"
          :default-system-config="defaultSystemConfig"
          :platform-options="platformOptions"
          :os-options="osOptions"
          :system-config-saving="systemConfigSaving"
          :capture-config-saving="captureConfigSaving"
          :capture-config-testing="captureConfigTesting"
          @reset-system="handleResetSystemConfig"
          @test-capture="handleTestCaptureConfig"
        />

        <DeviceProtocolCard
          v-model:form="deviceProtocolForm"
          v-model:selected-preset="selectedDevicePreset"
          :loading="deviceProtocolLoading"
          :saving="deviceProtocolSaving"
          :preset-options="deviceProtocolPresetOptions"
          :show-save="false"
          @apply-preset="applyDevicePreset"
          @random-mac="fillRandomDeviceMac"
          @random-device-id="fillRandomDeviceId"
          @random-imei="fillRandomImei"
        />

        <AutoCodeRefreshCard
          v-model:config="localAutoCodeRefresh"
          :current-account-name="currentAccountName"
          :current-account-id="currentAccountId"
          :loading="accountsLoading"
          :saving="false"
          :refreshing="autoCodeRefreshing"
          @save="saveSystemSettings"
          @refresh="saveSystemSettings"
        />

        <AdminSystemPanel
          v-model:local-system-config="localSystemConfig"
          v-model:local-capture-config="localCaptureConfig"
          section="capture"
          :show-heading="false"
          :show-save="false"
          :default-system-config="defaultSystemConfig"
          :platform-options="platformOptions"
          :os-options="osOptions"
          :system-config-saving="systemConfigSaving"
          :capture-config-saving="captureConfigSaving"
          :capture-config-testing="captureConfigTesting"
          @test-capture="handleTestCaptureConfig"
        />
      </div>

    </AdminPanelTabs>

    <AdminLoginLogConfirmModal
      v-model:show="showClearLogsConfirm"
      :total="loginLogsTotal"
      :loading="clearLogsLoading"
      @clear="confirmClearLogs"
    />

    <AdminCardConfirmModals
      v-model:show-card-claim-confirm="showCardClaimConfirm"
      v-model:pending-card-claim-enabled="pendingCardClaimEnabled"
      v-model:show-create-card-confirm="showCreateCardConfirm"
      v-model:show-toggle-card-status-confirm="showToggleCardStatusConfirm"
      v-model:pending-toggle-card="pendingToggleCard"
      v-model:show-delete-card-confirm="showDeleteCardConfirm"
      v-model:pending-delete-card="pendingDeleteCard"
      v-model:show-delete-selected-cards-confirm="showDeleteSelectedCardsConfirm"
      :new-card="newCard"
      :selected-card-count="selectedCardCount"
      :available-time-cards="availableTimeCards"
      :card-claim-loading="cardClaimLoading"
      :create-card-loading="createCardLoading"
      :toggle-card-status-loading="toggleCardStatusLoading"
      :delete-card-loading="deleteCardLoading"
      :delete-selected-cards-loading="deleteSelectedCardsLoading"
      @toggle-card-claim-status="confirmToggleCardClaimStatus"
      @create-card="createCard"
      @toggle-card-status="toggleCardStatus"
      @delete-card="confirmDeleteCard"
      @delete-selected-cards="confirmDeleteSelectedCards"
    />

    <AdminUserConfirmModals
      v-model:show-toggle-user-status-confirm="showToggleUserStatusConfirm"
      v-model:pending-toggle-user="pendingToggleUser"
      v-model:show-delete-user-confirm="showDeleteUserConfirm"
      v-model:pending-delete-user="pendingDeleteUser"
      v-model:show-renew-user-confirm="showRenewUserConfirm"
      v-model:pending-renew-user="pendingRenewUser"
      v-model:show-clear-expired-users-confirm="showClearExpiredUsersConfirm"
      v-model:show-edit-user-confirm="showEditUserConfirm"
      v-model:selected-user="selectedUser"
      :renew-user-card-code="renewUserCardCode"
      :expired-users-count="expiredUsersCount"
      :edit-form="editForm"
      :toggle-user-status-loading="toggleUserStatusLoading"
      :delete-user-loading="deleteUserLoading"
      :renew-user-loading="renewUserLoading"
      :clear-expired-users-loading="clearExpiredUsersLoading"
      :edit-loading="editLoading"
      @toggle-user-status="confirmToggleUserStatus"
      @delete-user="confirmDeleteUser"
      @renew-user="confirmRenewUser"
      @clear-expired-users="confirmClearExpiredUsers"
      @edit-user="confirmEditUser"
    />

    <AdminAlertModal
      v-model:show="modalVisible"
      :config="modalConfig"
    />
  </div>
</template>

<style scoped lang="postcss">
</style>
