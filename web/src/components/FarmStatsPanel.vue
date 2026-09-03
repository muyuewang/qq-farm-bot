<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()

const props = defineProps<{
  /** 不传则从 statusStore 取 */
  operations?: Record<string, number>
  dateRange?: { start: string; end: string } | null
  totalDays?: number
}>()

type TabKey = 'steal' | 'stolen' | 'dogBite' | 'summary'

interface TabDef {
  key: TabKey
  label: string
  icon: string
}

const tabs: TabDef[] = [
  { key: 'steal', label: '偷菜榜', icon: 'i-carbon-chevron-left' },
  { key: 'stolen', label: '被偷榜', icon: 'i-carbon-chevron-right' },
  { key: 'dogBite', label: '狗咬榜', icon: 'i-carbon-pet-care' },
  { key: 'summary', label: '统计榜', icon: 'i-carbon-chart-bar' },
]

const activeTab = ref<TabKey>('summary')

const aggregate = computed(() => {
  if (props.operations)
    return props
  const agg = statusStore.status?.aggregateOperations
  if (!agg)
    return { operations: {} as Record<string, number>, dateRange: null, totalDays: 0 }
  return agg
})

const ops = computed(() => {
  const obj = (aggregate.value as any)?.operations || {}
  return obj as Record<string, number>
})

const dateRange = computed(() => {
  if (props.dateRange)
    return props.dateRange
  return (aggregate.value as any)?.dateRange || null
})

const totalDays = computed(() => {
  if (typeof props.totalDays === 'number')
    return props.totalDays
  return Number((aggregate.value as any)?.totalDays || 0)
})

interface MetricCell {
  key: string
  value: number
  label: string
  bgClass: string
  valueClass: string
}

interface CategoryGroup {
  icon: string
  title: string
  cells: MetricCell[]
}

const groups: CategoryGroup[] = computed(() => {
  const get = (key: string) => Number(ops.value?.[key] || 0)
  return [
    {
      icon: 'i-carbon-run text-orange-500',
      title: '偷窃',
      cells: [
        { key: 'stealCount', value: get('steal'), label: '偷菜次数', bgClass: 'bg-amber-50 dark:bg-amber-950/30', valueClass: 'text-orange-500' },
        { key: 'stealFruit', value: 0, label: '偷到果实', bgClass: 'bg-amber-50 dark:bg-amber-950/30', valueClass: 'text-orange-500' },
        { key: 'stealLand', value: get('steal'), label: '偷菜块数', bgClass: 'bg-amber-50 dark:bg-amber-950/30', valueClass: 'text-orange-500' },
      ],
    },
    {
      icon: 'i-carbon-pet-care text-pink-500',
      title: '被狗咬',
      cells: [
        { key: 'bittenCount', value: 0, label: '被咬次数', bgClass: 'bg-rose-50 dark:bg-rose-950/30', valueClass: 'text-pink-500' },
        { key: 'bittenGold', value: 0, label: '损失金币', bgClass: 'bg-rose-50 dark:bg-rose-950/30', valueClass: 'text-pink-500' },
      ],
    },
    {
      icon: 'i-carbon-user-follow text-orange-400',
      title: '被偷',
      cells: [
        { key: 'stolenCount', value: 0, label: '被偷次数', bgClass: 'bg-orange-50 dark:bg-orange-950/30', valueClass: 'text-orange-500' },
        { key: 'stolenFruit', value: 0, label: '被偷果实', bgClass: 'bg-orange-50 dark:bg-orange-950/30', valueClass: 'text-orange-500' },
      ],
    },
    {
      icon: 'i-carbon-user-activity text-green-600',
      title: '帮好友',
      cells: [
        { key: 'helpWater', value: get('helpWater'), label: '浇水', bgClass: 'bg-green-50 dark:bg-green-950/30', valueClass: 'text-emerald-600' },
        { key: 'helpWeed', value: get('helpWeed'), label: '除草', bgClass: 'bg-green-50 dark:bg-green-950/30', valueClass: 'text-emerald-600' },
        { key: 'helpBug', value: get('helpBug'), label: '除虫', bgClass: 'bg-green-50 dark:bg-green-950/30', valueClass: 'text-emerald-600' },
      ],
    },
    {
      icon: 'i-carbon-gift text-indigo-500',
      title: '其他',
      cells: [
        { key: 'tongQiGift', value: get('tongQiGift'), label: '同气礼包', bgClass: 'bg-indigo-50 dark:bg-indigo-950/30', valueClass: 'text-indigo-500' },
        { key: 'harvest', value: get('harvest'), label: '收获果实总数', bgClass: 'bg-violet-50 dark:bg-violet-950/30', valueClass: 'text-violet-500' },
      ],
    },
    {
      icon: 'i-carbon-chemistry text-lime-600',
      title: '施肥',
      cells: [
        { key: 'fertilize', value: get('fertilize'), label: '普通施肥次', bgClass: 'bg-lime-50 dark:bg-lime-950/30', valueClass: 'text-lime-600' },
        { key: 'fertilizeOrganic', value: 0, label: '有机施肥次', bgClass: 'bg-lime-50 dark:bg-lime-950/30', valueClass: 'text-lime-600' },
      ],
    },
  ]
})

const rangeText = computed(() => {
  const r = dateRange.value
  if (!r)
    return ''
  if (r.start === r.end)
    return `仅 ${r.start}`
  return `自${r.start}至 ${r.end} 共 ${totalDays.value} 天`
})

const formatNum = (n: number) => n.toLocaleString('zh-CN')
</script>

<template>
  <section class="ui-panel rounded-xl p-4">
    <!-- Tabs -->
    <div class="mb-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
        :class="activeTab === tab.key
          ? 'bg-emerald-500 text-white shadow-sm'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="activeTab = tab.key"
      >
        <div :class="tab.icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- 统计榜内容 -->
    <div v-if="activeTab === 'summary'" class="space-y-5">
      <div class="text-xs text-gray-500 dark:text-gray-400">
        账号累计数据统计 · 仅当前账号 · 累计
      </div>
      <div v-if="rangeText" class="rounded-md bg-blue-50 dark:bg-blue-950/20 px-3 py-1.5 text-center text-xs text-blue-600 dark:text-blue-300">
        {{ rangeText }}
      </div>

      <div v-if="!Object.keys(ops).length" class="ui-subtle-panel flex flex-col items-center justify-center gap-2 rounded-lg p-8 text-center">
        <div class="i-carbon-chart-column text-3xl text-gray-300" />
        <div class="text-sm text-gray-600 font-medium dark:text-gray-300">
          暂无累计统计数据
        </div>
        <div class="text-xs text-gray-400">
          等待 bot 开始工作并持久化统计文件后显示。
        </div>
      </div>

      <template v-else>
        <div
          v-for="group in groups"
          :key="group.title"
          class="space-y-2"
        >
          <div class="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
            <div :class="group.icon" />
            {{ group.title }}
          </div>
          <div
            class="grid gap-2"
            :style="{ gridTemplateColumns: `repeat(${group.cells.length}, minmax(0, 1fr))` }"
          >
            <div
              v-for="cell in group.cells"
              :key="cell.key"
              class="rounded-lg px-3 py-3 text-center"
              :class="cell.bgClass"
            >
              <div class="text-xl font-bold leading-tight" :class="cell.valueClass">
                {{ formatNum(cell.value) }}
              </div>
              <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ cell.label }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 三个排行榜 tab（暂用占位 + 当前账号排名展示） -->
    <div v-else class="space-y-4">
      <div class="text-xs text-gray-500 dark:text-gray-400">
        全账号排行 · 仅当前账号排名可显示
      </div>

      <div class="ui-subtle-panel rounded-lg p-5">
        <template v-if="activeTab === 'steal'">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium text-orange-500">
            <div class="i-carbon-run" /> 偷菜榜（累计）
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3">
              <div class="text-xl font-bold text-orange-500">{{ formatNum(ops.steal || 0) }}</div>
              <div class="text-xs text-gray-500 mt-0.5">偷菜块数</div>
            </div>
            <div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3">
              <div class="text-xl font-bold text-orange-500">{{ formatNum(0) }}</div>
              <div class="text-xs text-gray-500 mt-0.5">偷到果实</div>
            </div>
            <div class="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3">
              <div class="text-xl font-bold text-orange-500">{{ formatNum(ops.steal || 0) }}</div>
              <div class="text-xs text-gray-500 mt-0.5">偷菜次数</div>
            </div>
          </div>
          <div class="mt-3 text-xs text-gray-400">跨账号排行功能待后端支持。</div>
        </template>

        <template v-else-if="activeTab === 'stolen'">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium text-orange-400">
            <div class="i-carbon-user-follow" /> 被偷榜（累计）
          </div>
          <div class="grid grid-cols-2 gap-2 text-center">
            <div class="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3">
              <div class="text-xl font-bold text-orange-500">0</div>
              <div class="text-xs text-gray-500 mt-0.5">被偷次数</div>
            </div>
            <div class="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3">
              <div class="text-xl font-bold text-orange-500">0</div>
              <div class="text-xs text-gray-500 mt-0.5">被偷果实</div>
            </div>
          </div>
          <div class="mt-3 text-xs text-gray-400">被偷事件尚未追踪，值为 0 为正常。</div>
        </template>

        <template v-else-if="activeTab === 'dogBite'">
          <div class="mb-3 flex items-center gap-1.5 text-sm font-medium text-pink-500">
            <div class="i-carbon-pet-care" /> 狗咬榜（累计）
          </div>
          <div class="grid grid-cols-2 gap-2 text-center">
            <div class="rounded-md bg-rose-50 dark:bg-rose-950/30 p-3">
              <div class="text-xl font-bold text-pink-500">0</div>
              <div class="text-xs text-gray-500 mt-0.5">被咬次数</div>
            </div>
            <div class="rounded-md bg-rose-50 dark:bg-rose-950/30 p-3">
              <div class="text-xl font-bold text-pink-500">0</div>
              <div class="text-xs text-gray-500 mt-0.5">损失金币</div>
            </div>
          </div>
          <div class="mt-3 text-xs text-gray-400">狗咬事件尚未追踪，值为 0 为正常。</div>
        </template>
      </div>
    </div>
  </section>
</template>
