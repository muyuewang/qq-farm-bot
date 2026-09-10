<script setup lang="ts">
import type { PetDiaryActivityData } from '@/stores/activity'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ activity?: PetDiaryActivityData | null, loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()

const accountStore = useAccountStore()
const activityStore = useActivityStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)

type TabKey = 'home' | 'stories' | 'shop' | 'solar' | 'treasure'
const activeTab = ref<TabKey>('home')
const busyAction = ref('')
const shopExchangeCount = reactive<Record<number, number>>({})

const tabs: Array<{ key: TabKey, label: string, icon: string }> = [
  { key: 'home', label: '比熊之家', icon: 'i-carbon-pet' },
  { key: 'stories', label: '爪印手记', icon: 'i-carbon-camera' },
  { key: 'shop', label: '拾物小铺', icon: 'i-carbon-shopping-cart' },
  { key: 'solar', label: '节令小礼', icon: 'i-carbon-calendar' },
  { key: 'treasure', label: '宝藏护送', icon: 'i-carbon-delivery' },
]

const growthPercent = computed(() => {
  const adultGrowth = props.activity?.nurture.adultGrowth || 0
  if (!adultGrowth)
    return props.activity?.nurture.adult ? 100 : 0
  return Math.min(100, Math.round((props.activity?.nurture.growth || 0) / adultGrowth * 100))
})

const unlockedStories = computed(() => props.activity?.stories.filter(item => item.unlocked).length || 0)
const claimedStories = computed(() => props.activity?.stories.filter(item => item.claimed).length || 0)
const pendingTreasures = computed(() => props.activity?.treasures.filter(item => item.status === 1) || [])
const escortingTreasures = computed(() => props.activity?.treasures.filter(item => item.status === 2) || [])
const claimableTreasures = computed(() => props.activity?.treasures.filter(item => item.status === 3) || [])
const claimableStory = computed(() => props.activity?.stories.find(item => item.unlocked && !item.claimed) || null)
const solarTerms = computed(() => (props.activity as any)?.solarTerms || null)

function balanceOf(itemId: number) {
  return props.activity?.balances.find(item => item.itemId === itemId)?.count || 0
}

function costText(costs?: Array<{ itemId: number, count: number }>) {
  if (!costs?.length)
    return '无'
  return costs.map(item => `${item.itemId}×${item.count}`).join(' + ')
}

function formatDateTime(ms?: number) {
  if (!ms)
    return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

function formatFullDateTime(ms?: number) {
  if (!ms)
    return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

async function runAction(action: string, input: Record<string, unknown> = {}, label = '') {
  if (!currentAccountId.value || busyAction.value)
    return
  busyAction.value = action
  try {
    const data = await activityStore.operatePetDiary(String(currentAccountId.value), action, input)
    if (data?.ok) {
      const rewardText = (data.rewards || []).map((item: any) => `${item.itemId}×${item.count}`).join('、')
      toast.success(data.refreshError
        ? `${label || '操作'}成功，但刷新失败：${data.refreshError}`
        : `${label || '操作'}成功${rewardText ? `：${rewardText}` : ''}`)
      if (!data.activity)
        emit('refresh')
    }
    else {
      toast.error(data?.error || `${label || '操作'}失败`)
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || `${label || '操作'}失败`)
  }
  finally {
    busyAction.value = ''
  }
}

function exchangeCount(goodsId: number) {
  return Math.max(1, Number(shopExchangeCount[goodsId] || 1))
}

function treasureStatusLabel(status: number) {
  if (status === 1) return '待护送'
  if (status === 2) return '护送中'
  if (status === 3) return '可领取'
  if (status === 4) return '已领取'
  return `状态${status}`
}
</script>

<template>
  <section class="space-y-4">
    <header class="relative overflow-hidden rounded-lg bg-gradient-to-r from-amber-700 via-orange-600 to-rose-500 p-4 text-white shadow-sm sm:p-5">
      <div class="pointer-events-none absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/10" />
      <div class="pointer-events-none absolute right-16 top-16 h-20 w-20 rounded-full border border-white/20" />
      <div class="relative flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 text-xs text-amber-100/90">
            <span class="inline-flex items-center gap-1.5 font-medium"><span class="i-carbon-pet" />限时萌宠活动</span>
            <span v-if="activity?.endTime" class="text-white/65">至 {{ formatDateTime(activity.endTime) }}</span>
          </div>
          <h2 class="mt-1 text-2xl font-semibold">
            {{ activity?.title || '萌宠成长日记' }}
          </h2>
          <p class="mt-1 text-sm text-white/80">
            比熊之家 · 爪印手记 · 拾物小铺 · 节令小礼 · 宝藏护送
          </p>
        </div>
        <BaseButton size="sm" variant="secondary" :loading="loading" aria-label="刷新活动数据" @click="$emit('refresh')">
          <span v-if="!loading" class="i-carbon-renew text-base" />
          <span class="ml-1.5 hidden sm:inline">刷新</span>
        </BaseButton>
      </div>

      <div class="relative grid grid-cols-2 mt-4 gap-2 sm:grid-cols-4">
        <div class="rounded-lg bg-white/12 px-3 py-2.5 backdrop-blur-sm">
          <div class="text-xs text-white/70">元气糕</div>
          <div class="mt-0.5 text-lg font-semibold">{{ balanceOf(1028) }}</div>
        </div>
        <div class="rounded-lg bg-white/12 px-3 py-2.5 backdrop-blur-sm">
          <div class="text-xs text-white/70">幸运星</div>
          <div class="mt-0.5 text-lg font-semibold">{{ balanceOf(1029) }}</div>
        </div>
        <div class="rounded-lg bg-white/12 px-3 py-2.5 backdrop-blur-sm">
          <div class="text-xs text-white/70">成长值</div>
          <div class="mt-0.5 text-lg font-semibold">{{ activity?.nurture.growth || 0 }}</div>
        </div>
        <div class="rounded-lg bg-white/12 px-3 py-2.5 backdrop-blur-sm">
          <div class="text-xs text-white/70">活动状态</div>
          <div class="mt-0.5 text-lg font-semibold">{{ activity?.active ? '进行中' : '未开放' }}</div>
        </div>
      </div>
    </header>

    <div class="flex flex-wrap gap-1.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition"
        :class="activeTab === tab.key
          ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
          : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'"
        :aria-pressed="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        <span :class="tab.icon" />
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activity?.warnings?.length" class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <div v-for="warning in activity.warnings" :key="warning">{{ warning }}</div>
    </div>

    <!-- 比熊之家 -->
    <article v-if="activeTab === 'home'" class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <header class="mb-3 flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span class="i-carbon-pet text-amber-600" />
          比熊之家
        </h3>
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="activity?.nurture.adult ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'"
        >
          {{ activity?.nurture.adult ? '成年期' : '幼年期' }}
        </span>
      </header>

      <div class="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        <div>
          <div class="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>成长进度</span>
            <span>{{ activity?.nurture.growth || 0 }} / {{ activity?.nurture.adultGrowth || 0 }}（{{ growthPercent }}%）</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div class="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" :style="{ width: `${growthPercent}%` }" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-500">今日投喂</div>
            <div class="mt-0.5 font-medium">{{ activity?.nurture.feedCount || 0 }} / {{ activity?.nurture.feedLimit || 0 }}</div>
          </div>
          <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-500">投喂消耗</div>
            <div class="mt-0.5 font-medium">{{ costText(activity?.nurture.feedCosts) }}</div>
          </div>
          <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-500">今日寻宝</div>
            <div class="mt-0.5 font-medium">{{ activity?.hunt.count || 0 }} / {{ activity?.hunt.limit || 0 }}</div>
          </div>
          <div class="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
            <div class="text-xs text-gray-500">寻宝消耗</div>
            <div class="mt-0.5 font-medium">{{ costText(activity?.hunt.costs) }}</div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-xs">
          <span class="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-700" :class="activity?.nurture.initialized ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500'">
            已领养 {{ activity?.nurture.initialized ? '是' : '否' }}
          </span>
          <span class="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-700" :class="activity?.nurture.dogGranted ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500'">
            永久比熊 {{ activity?.nurture.dogGranted ? '已领取' : '未领取' }}
          </span>
          <span class="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-700" :class="activity?.hunt.canPlunder ? 'text-rose-700 dark:text-rose-300' : 'text-gray-500'">
            {{ activity?.hunt.canPlunder ? '可夺宝' : '暂不可夺宝' }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <BaseButton
            v-if="activity && !activity.nurture.initialized"
            size="sm"
            variant="primary"
            :loading="busyAction === 'initialize'"
            :disabled="!!busyAction || !activity.active"
            @click="runAction('initialize', {}, '领养')"
          >
            领养比熊
          </BaseButton>
          <BaseButton
            v-if="activity?.nurture.canFeed"
            size="sm"
            variant="primary"
            :loading="busyAction === 'feed'"
            :disabled="!!busyAction"
            @click="runAction('feed', {}, '投喂')"
          >
            投喂一次
          </BaseButton>
          <BaseButton
            v-if="activity?.nurture.adult && !activity.nurture.dogGranted"
            size="sm"
            variant="primary"
            :loading="busyAction === 'claimDog'"
            :disabled="!!busyAction"
            @click="runAction('claimDog', {}, '领取比熊')"
          >
            领取永久比熊
          </BaseButton>
          <BaseButton
            v-if="activity?.hunt.canDraw"
            size="sm"
            variant="primary"
            :loading="busyAction === 'draw'"
            :disabled="!!busyAction"
            @click="runAction('draw', {}, '寻宝')"
          >
            寻宝一次
          </BaseButton>
          <BaseButton
            size="sm"
            variant="outline"
            :loading="busyAction === 'skipBattle'"
            :disabled="!!busyAction"
            @click="runAction('skipBattle', { skip: !activity?.skipBattle }, '跳过动画')"
          >
            {{ activity?.skipBattle ? '关闭跳过动画' : '开启跳过动画' }}
          </BaseButton>
        </div>
      </div>
    </article>

    <!-- 爪印手记 -->
    <article v-else-if="activeTab === 'stories'" class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <header class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span class="i-carbon-camera text-violet-600" />
          爪印手记
        </h3>
        <span class="text-xs text-gray-500">解锁 {{ unlockedStories }} · 已领 {{ claimedStories }} / {{ activity?.stories.length || 0 }}</span>
      </header>
      <div v-if="claimableStory" class="mb-3">
        <BaseButton
          size="sm"
          variant="primary"
          :loading="busyAction === 'story'"
          :disabled="!!busyAction"
          @click="runAction('story', { order: claimableStory.order }, '领取手记')"
        >
          领取手记 {{ claimableStory.order }}
        </BaseButton>
      </div>
      <div v-if="!activity?.stories.length" class="py-6 text-center text-sm text-gray-400">
        多跟比熊互动可以解锁更多照片
      </div>
      <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div
          v-for="story in activity.stories"
          :key="story.order"
          class="rounded-md border px-3 py-2 text-sm"
          :class="story.unlocked
            ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20'
            : 'border-gray-200 bg-gray-50 opacity-70 dark:border-gray-700 dark:bg-gray-900/30'"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-900 dark:text-white">手记 {{ story.order }}</span>
            <span class="text-xs" :class="story.claimed ? 'text-emerald-600' : story.unlocked ? 'text-amber-600' : 'text-gray-400'">
              {{ story.claimed ? '已领取' : story.unlocked ? '可领取' : '未解锁' }}
            </span>
          </div>
          <p v-if="story.caption" class="mt-1 truncate text-xs text-gray-500">
            {{ story.caption }}
          </p>
          <BaseButton
            v-if="story.unlocked && !story.claimed"
            class="mt-2"
            size="sm"
            variant="secondary"
            :loading="busyAction === 'story'"
            :disabled="!!busyAction"
            @click="runAction('story', { order: story.order }, '领取手记')"
          >
            领取
          </BaseButton>
        </div>
      </div>
    </article>

    <!-- 拾物小铺 -->
    <article v-else-if="activeTab === 'shop'" class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <header class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span class="i-carbon-shopping-cart text-emerald-600" />
          拾物小铺
        </h3>
        <span class="text-xs" :class="activity?.shopActive ? 'text-emerald-600' : 'text-gray-400'">
          {{ activity?.shopActive ? '开放中' : '未开放' }}
        </span>
      </header>
      <div v-if="!activity?.shop.length" class="py-6 text-center text-sm text-gray-400">
        暂无商品目录
      </div>
      <div v-else class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="goods in activity.shop"
          :key="goods.id"
          class="rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/30"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate font-medium text-gray-900 dark:text-white">{{ goods.name || `商品 ${goods.id}` }}</div>
              <div class="mt-1 text-xs text-gray-500">{{ goods.category }}</div>
            </div>
            <span v-if="goods.usesDiamond" class="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
              钻石
            </span>
          </div>
          <div class="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
            <div>奖励：{{ costText(goods.rewards) }}</div>
            <div>消耗：{{ costText(goods.costs) }}</div>
            <div>限购：{{ goods.remaining === null ? '不限' : `${goods.remaining} 剩余` }}</div>
          </div>
          <div v-if="goods.exchangeable" class="mt-2 flex items-center gap-2">
            <input
              v-model.number="shopExchangeCount[goods.id]"
              type="number"
              min="1"
              class="h-8 w-16 rounded border border-gray-200 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-800"
            >
            <BaseButton
              size="sm"
              variant="primary"
              :loading="busyAction === 'exchange'"
              :disabled="!!busyAction"
              @click="runAction('exchange', { goodsId: goods.id, count: exchangeCount(goods.id) }, '兑换')"
            >
              兑换
            </BaseButton>
          </div>
          <div v-else-if="goods.usesDiamond" class="mt-2 text-[11px] text-rose-500">
            可能消耗钻石，已禁用自动兑换
          </div>
        </div>
      </div>
    </article>

    <!-- 节令小礼 -->
    <article v-else-if="activeTab === 'solar'" class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <header class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span class="i-carbon-calendar text-cyan-600" />
          节令小礼
        </h3>
        <span class="text-xs" :class="(solarTerms?.claimableCount || 0) > 0 ? 'text-amber-600' : 'text-gray-400'">
          {{ (solarTerms?.claimableCount || 0) > 0 ? `可领取 ${solarTerms.claimableCount}` : '暂无可领取' }}
        </span>
      </header>
      <p v-if="solarTerms?.tipsText" class="mb-3 text-xs text-gray-500">
        {{ solarTerms.tipsText }}
      </p>
      <div v-if="!solarTerms?.terms?.length" class="py-6 text-center text-sm text-gray-400">
        暂无节令数据
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="term in solarTerms.terms"
          :key="term.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2.5 text-sm dark:bg-gray-900/40"
        >
          <div class="min-w-0">
            <div class="font-medium text-gray-900 dark:text-white">{{ term.title || `节令 ${term.id}` }}</div>
            <div class="mt-0.5 text-xs text-gray-500">
              {{ formatDateTime(term.startTime) }} — {{ formatDateTime(term.endTime) }}
              · {{ term.statusLabel }}
            </div>
            <div v-if="term.rewards?.length" class="mt-1 text-xs text-gray-600 dark:text-gray-300">
              奖励：{{ costText(term.rewards) }}
            </div>
          </div>
          <BaseButton
            v-if="term.claimable"
            size="sm"
            variant="primary"
            :loading="busyAction === 'solar'"
            :disabled="!!busyAction"
            @click="runAction('solar', { termId: term.id }, '领取节令')"
          >
            领取
          </BaseButton>
        </div>
      </div>
    </article>

    <!-- 宝藏护送 -->
    <article v-else class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <header class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span class="i-carbon-delivery text-orange-600" />
          宝藏护送
        </h3>
        <span class="text-xs text-gray-500">
          待护送 {{ pendingTreasures.length }} · 护送中 {{ escortingTreasures.length }} · 可领取 {{ claimableTreasures.length }}
        </span>
      </header>

      <div class="mb-3 flex flex-wrap gap-2">
        <BaseButton
          v-if="claimableTreasures.length > 0"
          size="sm"
          variant="primary"
          :loading="busyAction === 'openTreasure'"
          :disabled="!!busyAction"
          @click="runAction('openTreasure', {}, '领取宝藏')"
        >
          一键领取宝藏（{{ claimableTreasures.length }}）
        </BaseButton>
        <BaseButton
          v-if="(activity?.compensationCount || 0) > 0"
          size="sm"
          variant="secondary"
          :loading="busyAction === 'compensation'"
          :disabled="!!busyAction"
          @click="runAction('compensation', {}, '领取补偿')"
        >
          领取夺宝补偿（{{ activity?.compensationCount }}）
        </BaseButton>
        <BaseButton
          v-if="activity?.charms.canRefresh"
          size="sm"
          variant="secondary"
          :loading="busyAction === 'refreshCharm'"
          :disabled="!!busyAction"
          @click="runAction('refreshCharm', {}, '刷新锦囊')"
        >
          免费刷新锦囊（剩 {{ activity?.charms.freeRefreshRemaining }}）
        </BaseButton>
      </div>

      <div v-if="!activity?.treasures.length" class="py-6 text-center text-sm text-gray-400">
        暂无宝藏。成年后可通过寻宝获取。
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="treasure in activity.treasures"
          :key="treasure.id"
          class="rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900/30"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="font-medium text-gray-900 dark:text-white">
              物品 {{ treasure.itemId }} × {{ treasure.count }}
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs"
              :class="treasure.status === 3
                ? 'bg-amber-100 text-amber-700'
                : treasure.status === 2
                  ? 'bg-cyan-100 text-cyan-700'
                  : 'bg-gray-100 text-gray-600'"
            >
              {{ treasureStatusLabel(treasure.status) }}
            </span>
          </div>
          <div class="mt-1 text-xs text-gray-500">
            保底 {{ treasure.protectedCount }} · 原值 {{ treasure.originalCount }}
            <template v-if="treasure.endTime"> · 结束 {{ formatDateTime(treasure.endTime) }}</template>
            · 被挑战 {{ treasure.plunderCount }}/{{ treasure.maxPlunderCount }}
          </div>
        </div>
      </div>

      <div v-if="activity?.charms.all?.length" class="mt-5">
        <h4 class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">锦囊总览</h4>
        <p class="mb-2 text-xs text-gray-500">{{ activity.charms.refreshNote }}</p>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="charm in activity.charms.all"
            :key="charm.id"
            class="rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/30"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium text-gray-900 dark:text-white">{{ charm.name }}</div>
              <span v-if="activity.charms.equipped.some(item => item.id === charm.id)" class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                已装备
              </span>
            </div>
            <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{{ charm.description || '暂无说明' }}</p>
          </div>
        </div>
      </div>
    </article>

    <p class="text-xs text-gray-400">
      活动时间：{{ formatFullDateTime(activity?.startTime) }} — {{ formatFullDateTime(activity?.endTime) }}。
    </p>
  </section>
</template>
