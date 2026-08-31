<script setup lang="ts">
import { computed } from 'vue'
import StrategyTimingPanel from '@/components/settings/StrategyTimingPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

interface SelectOption<T = string | number> {
  label: string
  value: T
  disabled?: boolean
}

interface SeedItem {
  seedId: number
  name: string
  requiredLevel?: number
}

interface StrategySettings {
  plantingStrategy: string
  prioritize2x2Crops: boolean
  bagSeedPriority: number[]
  bagSeedFallbackStrategy: string
  plantSeedPriority: number[]
  stealDelaySeconds: number
  intervals: {
    farmMin: number
    farmMax: number
    helpMin: number
    helpMax: number
    stealMin: number
    stealMax: number
  }
  friendQuietHours: {
    enabled: boolean
    start: string
    end: string
  }
}

const props = withDefaults(defineProps<{
  currentAccountName: string | null
  currentAccountId: string | number | null | undefined
  loading: boolean
  saving: boolean
  plantingStrategyOptions: SelectOption[]
  bagFallbackStrategyOptions: SelectOption[]
  strategyPreviewLabel: string | null
  availableSeeds?: SeedItem[]
  title?: string
  saveLabel?: string
  showActions?: boolean
  timingSection?: 'all' | 'planting' | 'friends' | 'steal'
}>(), {
  title: '策略设置',
  saveLabel: '保存策略设置',
  showActions: true,
  timingSection: 'all',
  availableSeeds: () => [],
})

const emit = defineEmits<{
  save: []
}>()

const settings = defineModel<StrategySettings>('settings', { required: true })

function selectBagFallbackStrategy(value: string | number) {
  settings.value.bagSeedFallbackStrategy = String(value)
}

function isBagFallbackStrategySelected(value: string | number) {
  return settings.value.bagSeedFallbackStrategy === value
}

const prioritySeeds = computed(() =>
  settings.value.plantSeedPriority
    .map(id => props.availableSeeds.find(s => s.seedId === id))
    .filter(Boolean) as SeedItem[],
)

const candidateSeeds = computed(() => {
  const chosen = new Set(settings.value.plantSeedPriority)
  return props.availableSeeds.filter(s => !chosen.has(s.seedId))
})

function addSeed(seedId: number) {
  if (!settings.value.plantSeedPriority.includes(seedId))
    settings.value.plantSeedPriority.push(seedId)
}

function removeSeed(seedId: number) {
  settings.value.plantSeedPriority = settings.value.plantSeedPriority.filter(id => id !== seedId)
}

function moveUp(index: number) {
  if (index <= 0) return
  const list = [...settings.value.plantSeedPriority]
  const a = list[index] as number
  const b = list[index - 1] as number
  list[index] = b
  list[index - 1] = a
  settings.value.plantSeedPriority = list
}

function moveDown(index: number) {
  const list = [...settings.value.plantSeedPriority]
  if (index >= list.length - 1) return
  const a = list[index] as number
  const b = list[index + 1] as number
  list[index] = b
  list[index + 1] = a
  settings.value.plantSeedPriority = list
}

function clearAll() {
  settings.value.plantSeedPriority = []
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="flex items-center gap-2 text-lg text-gray-900 font-bold dark:text-gray-100">
        <div class="i-fas-cog text-lg" />
        {{ title }}
        <span v-if="currentAccountName" class="ml-2 text-sm text-gray-500 font-normal dark:text-gray-400">
          ({{ currentAccountName }})
        </span>
      </h3>
    </div>

    <div v-if="loading" class="py-4 text-center text-gray-500">
      <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
      <p>加载中...</p>
    </div>

    <div v-else-if="!currentAccountId" class="py-8 text-center text-gray-500">
      <div class="i-carbon-settings-adjust mx-auto mb-2 text-3xl text-gray-400" />
      <p>请先选择账号</p>
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BaseSelect
          v-model="settings.plantingStrategy"
          label="种植策略"
          :options="plantingStrategyOptions"
        />
        <div class="flex flex-col gap-1.5">
          <label class="text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ settings.plantingStrategy === 'bag_priority' ? '第二优先策略预览' : settings.plantingStrategy === 'seed_priority' ? '已选优先种子' : '策略选种预览' }}
          </label>
          <div
            v-if="settings.plantingStrategy !== 'seed_priority'"
            class="w-full flex items-center justify-between border border-dashed border-gray-200 rounded-lg bg-gray-50 px-3 py-2 text-gray-500 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
            title="根据当前策略自动匹配，仅供预览"
          >
            <span class="truncate">{{ strategyPreviewLabel ?? '加载中...' }}</span>
            <div class="i-carbon-information shrink-0 text-base text-gray-400" />
          </div>
          <div v-else class="w-full flex items-center justify-between border border-dashed border-gray-200 rounded-lg bg-gray-50 px-3 py-2 text-gray-500 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
            <span class="truncate">
              {{ prioritySeeds.length > 0 ? prioritySeeds.map(s => s.name).join(' → ') : '未选择种子' }}
            </span>
            <span class="ml-2 shrink-0 text-xs">{{ prioritySeeds.length }}</span>
          </div>
        </div>
      </div>

      <div v-if="settings.plantingStrategy === 'bag_priority'" class="flex flex-col gap-2">
        <label class="text-sm text-gray-700 font-medium dark:text-gray-300">
          第二优先策略
        </label>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="option in bagFallbackStrategyOptions"
            :key="option.value"
            type="button"
            class="min-h-11 flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-left text-sm transition"
            :class="isBagFallbackStrategySelected(option.value)
              ? 'border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)] text-gray-900 shadow-sm dark:text-gray-100'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700/60'"
            :aria-pressed="isBagFallbackStrategySelected(option.value)"
            @click="selectBagFallbackStrategy(option.value)"
          >
            <span class="min-w-0 break-words font-medium leading-5">{{ option.label }}</span>
            <span
              class="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs transition"
              :class="isBagFallbackStrategySelected(option.value)
                ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white'
                : 'border-gray-300 text-transparent dark:border-gray-600'"
            >
              <span class="i-carbon-checkmark text-sm" />
            </span>
          </button>
        </div>
      </div>

      <div v-if="settings.plantingStrategy === 'seed_priority'" class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <label class="text-sm text-gray-700 font-medium dark:text-gray-300">
            优先种植种子（按顺序优先购买）
          </label>
          <BaseButton v-if="settings.plantSeedPriority.length > 0" size="sm" variant="danger" @click="clearAll">
            清空
          </BaseButton>
        </div>

        <div v-if="prioritySeeds.length > 0" class="flex flex-col gap-1">
          <div
            v-for="(seed, index) in prioritySeeds"
            :key="seed.seedId"
            class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <span class="w-5 shrink-0 text-center text-xs text-gray-400">{{ index + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
              {{ seed.name }}
            </span>
            <span class="shrink-0 text-xs text-gray-400">{{ seed.seedId }}</span>
            <button
              type="button"
              class="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              :disabled="index === 0"
              @click="moveUp(index)"
            >
              <div class="i-carbon-arrow-up text-sm" />
            </button>
            <button
              type="button"
              class="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              :disabled="index === prioritySeeds.length - 1"
              @click="moveDown(index)"
            >
              <div class="i-carbon-arrow-down text-sm" />
            </button>
            <button
              type="button"
              class="shrink-0 p-1 text-gray-400 hover:text-red-500"
              @click="removeSeed(seed.seedId)"
            >
              <div class="i-carbon-close text-sm" />
            </button>
          </div>
        </div>

        <div v-else class="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
          尚未选择优先种子，请从下方列表添加
        </div>

        <div v-if="candidateSeeds.length > 0" class="flex flex-col gap-1">
          <label class="text-xs text-gray-500 dark:text-gray-400">点击添加：</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="seed in candidateSeeds"
              :key="seed.seedId"
              type="button"
              class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 transition hover:border-[var(--theme-primary)] hover:text-[var(--theme-primary)] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-[var(--theme-primary)]"
              @click="addSeed(seed.seedId)"
            >
              <span class="i-carbon-add text-xs" />
              {{ seed.name }}
            </button>
          </div>
        </div>
      </div>

      <StrategyTimingPanel v-model:settings="settings" :section="timingSection" />

      <div v-if="showActions" class="flex justify-end gap-2 border-t pt-3 dark:border-gray-700">
        <BaseButton
          variant="primary"
          size="sm"
          :loading="saving"
          @click="emit('save')"
        >
          {{ saveLabel }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
