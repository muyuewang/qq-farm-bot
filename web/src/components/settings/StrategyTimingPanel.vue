<script setup lang="ts">
import { computed } from 'vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

interface StrategyTimingSettings {
  plantOrderRandom: boolean
  plantDelaySeconds: number
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

const settings = defineModel<StrategyTimingSettings>('settings', { required: true })

type IntervalKey = keyof StrategyTimingSettings['intervals']

function intervalModel(key: IntervalKey) {
  return computed({
    get: () => settings.value.intervals[key],
    set: (value: number | string) => {
      const parsed = Number.parseInt(String(value), 10)
      settings.value = {
        ...settings.value,
        intervals: {
          ...settings.value.intervals,
          [key]: Number.isFinite(parsed) ? parsed : 1,
        },
      }
    },
  })
}

const farmMin = intervalModel('farmMin')
const farmMax = intervalModel('farmMax')
const helpMin = intervalModel('helpMin')
const helpMax = intervalModel('helpMax')
const stealMin = intervalModel('stealMin')
const stealMax = intervalModel('stealMax')
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <BaseInput
        v-model.number="farmMin"
        label="农场巡查最小 (秒)"
        type="number"
        min="1"
      />
      <BaseInput
        v-model.number="farmMax"
        label="农场巡查最大 (秒)"
        type="number"
        min="1"
      />
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-2">
      <BaseInput
        v-model.number="helpMin"
        label="帮助巡查最小 (秒)"
        type="number"
        min="1"
      />
      <BaseInput
        v-model.number="helpMax"
        label="帮助巡查最大 (秒)"
        type="number"
        min="1"
      />
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-2">
      <BaseInput
        v-model.number="stealMin"
        label="偷菜巡查最小 (秒)"
        type="number"
        min="1"
      />
      <BaseInput
        v-model.number="stealMax"
        label="偷菜巡查最大 (秒)"
        type="number"
        min="1"
      />
    </div>

    <div class="flex flex-wrap items-center gap-4 border-t pt-3 dark:border-gray-700">
      <BaseSwitch
        v-model="settings.friendQuietHours.enabled"
        label="启用静默时段"
      />
      <div class="flex items-center gap-2">
        <input
          v-model="settings.friendQuietHours.start"
          type="time"
          class="w-20 border border-gray-200 rounded bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          :disabled="!settings.friendQuietHours.enabled"
        >
        <span class="text-xs text-gray-500">-</span>
        <input
          v-model="settings.friendQuietHours.end"
          type="time"
          class="w-20 border border-gray-200 rounded bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          :disabled="!settings.friendQuietHours.enabled"
        >
      </div>
    </div>

    <div class="border-t pt-3 space-y-3 dark:border-gray-700">
      <h4 class="text-sm text-gray-700 font-medium dark:text-gray-300">
        种植与偷菜延迟设置
      </h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <BaseSwitch
          v-model="settings.plantOrderRandom"
          label="种植顺序随机"
        />
        <BaseInput
          v-model.number="settings.plantDelaySeconds"
          label="种植延迟 (秒)"
          type="number"
          min="0"
        />
        <BaseInput
          v-model.number="settings.stealDelaySeconds"
          label="偷菜延迟 (秒)"
          type="number"
          min="0"
        />
      </div>
    </div>
  </div>
</template>
