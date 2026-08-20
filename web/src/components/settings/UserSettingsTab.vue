<script setup lang="ts">
import DeviceProtocolCard from '@/components/settings/DeviceProtocolCard.vue'
import OfflineReminderCard from '@/components/settings/OfflineReminderCard.vue'
import PasswordChangeCard from '@/components/settings/PasswordChangeCard.vue'

interface SelectOption<T = string | number> {
  label: string
  value: T
}

interface DeviceProtocolConfig {
  enabled: boolean
  userAgent: string
  deviceModel: string
  deviceBrand: string
  deviceMac: string
  deviceId: string
  imei: string
}

interface PasswordForm {
  old: string
  new: string
  confirm: string
}

interface OfflineReminderConfig {
  channel: string
  reloginUrlMode: string
  endpoint: string
  token: string
  title: string
  msg: string
  offlineDeleteSec: number
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  senderName: string
  recipientEmail: string
  emailContent: string
}

defineProps<{
  deviceProtocolLoading: boolean
  deviceProtocolSaving: boolean
  deviceProtocolPresetOptions: SelectOption[]
  passwordSaving: boolean
  channelOptions: SelectOption[]
  currentChannelDocUrl: string
  offlineSaving: boolean
  offlineTesting: boolean
}>()

const emit = defineEmits<{
  applyDevicePreset: [value: string | number | undefined]
  randomMac: []
  randomDeviceId: []
  randomImei: []
  saveDeviceProtocol: []
  changePassword: []
  openDocs: []
  testOffline: []
  saveOffline: []
}>()

const deviceProtocolForm = defineModel<DeviceProtocolConfig>('deviceProtocolForm', { required: true })
const selectedDevicePreset = defineModel<string>('selectedDevicePreset', { required: true })
const passwordForm = defineModel<PasswordForm>('passwordForm', { required: true })
const offlineConfig = defineModel<OfflineReminderConfig>('offlineConfig', { required: true })
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
      用户管理
    </h3>

    <div class="space-y-4">
      <DeviceProtocolCard
        v-model:form="deviceProtocolForm"
        v-model:selected-preset="selectedDevicePreset"
        :loading="deviceProtocolLoading"
        :saving="deviceProtocolSaving"
        :preset-options="deviceProtocolPresetOptions"
        @apply-preset="value => emit('applyDevicePreset', value)"
        @random-mac="emit('randomMac')"
        @random-device-id="emit('randomDeviceId')"
        @random-imei="emit('randomImei')"
        @save="emit('saveDeviceProtocol')"
      />

      <PasswordChangeCard
        v-model:form="passwordForm"
        :saving="passwordSaving"
        @save="emit('changePassword')"
      />

      <OfflineReminderCard
        v-model:config="offlineConfig"
        :channel-options="channelOptions"
        :current-channel-doc-url="currentChannelDocUrl"
        :saving="offlineSaving"
        :testing="offlineTesting"
        @open-docs="emit('openDocs')"
        @test="emit('testOffline')"
        @save="emit('saveOffline')"
      />
    </div>
  </div>
</template>
