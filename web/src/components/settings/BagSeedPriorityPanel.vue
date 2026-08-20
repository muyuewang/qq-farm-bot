<script setup lang="ts">
interface BagSeedItem {
  seedId: number
  name: string
  count: number
  requiredLevel: number
  plantSize: number
}

defineProps<{
  seeds: BagSeedItem[]
  sortedSeeds: BagSeedItem[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  reset: []
  move: [seedId: number, direction: -1 | 1]
  remove: [seedId: number]
  dragStart: [seedId: number, event: DragEvent]
  dragOver: [seedId: number, event: DragEvent]
  drop: [seedId: number, event: DragEvent]
}>()
</script>

<template>
  <div class="border border-amber-200 rounded-lg bg-amber-50/70 p-3 space-y-3 dark:border-amber-800/50 dark:bg-amber-900/20">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-sm text-amber-900 font-semibold dark:text-amber-200">
          背包种子优先顺序
        </div>
        <p class="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
          先按下方顺序消耗背包种子；开启 2×2 优先时，四格种子会先用于预留区域，其余空地再按第二优先策略补种。
        </p>
      </div>
      <button
        class="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 transition dark:bg-amber-900/50 hover:bg-amber-200 dark:text-amber-300 dark:hover:bg-amber-900/70"
        @click="emit('reset')"
      >
        重置顺序
      </button>
    </div>

    <div v-if="loading" class="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
      加载中...
    </div>
    <div v-else-if="error" class="py-4 text-center text-sm text-red-600 dark:text-red-400">
      {{ error }}
    </div>
    <div v-else-if="seeds.length === 0" class="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
      背包中暂无种子
    </div>
    <div v-else-if="sortedSeeds.length === 0" class="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
      优先列表为空，可重置顺序恢复背包种子。
    </div>
    <div v-else class="grid gap-2 lg:grid-cols-3 sm:grid-cols-2">
      <div
        v-for="(seed, index) in sortedSeeds"
        :key="seed.seedId"
        class="flex items-center gap-2 border border-amber-200 rounded-lg bg-white p-2 dark:border-amber-700/50 dark:bg-gray-800"
        draggable="true"
        @dragstart="emit('dragStart', seed.seedId, $event)"
        @dragover.prevent="emit('dragOver', seed.seedId, $event)"
        @drop="emit('drop', seed.seedId, $event)"
      >
        <div class="h-8 w-8 flex shrink-0 items-center justify-center rounded bg-amber-100 text-xs text-amber-700 font-bold dark:bg-amber-900/50 dark:text-amber-300">
          {{ index + 1 }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm text-gray-800 font-medium dark:text-gray-200">
            {{ seed.name }}
            <span v-if="seed.plantSize === 2" class="ml-1 text-xs text-emerald-600 dark:text-emerald-400">2×2</span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            数量: {{ seed.count }} | 等级: {{ seed.requiredLevel }}
          </div>
        </div>
        <div class="flex shrink-0 flex-col gap-1">
          <button
            class="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
            title="移出优先列表"
            aria-label="移出优先列表"
            @click="emit('remove', seed.seedId)"
          >
            <div class="i-carbon-close text-sm" />
          </button>
          <button
            class="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            :disabled="index === 0"
            @click="emit('move', seed.seedId, -1)"
          >
            <div class="i-carbon-arrow-up text-sm" />
          </button>
          <button
            class="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            :disabled="index === sortedSeeds.length - 1"
            @click="emit('move', seed.seedId, 1)"
          >
            <div class="i-carbon-arrow-down text-sm" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
