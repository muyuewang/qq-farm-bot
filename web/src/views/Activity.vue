<script setup lang="ts">
import type { ActivityLabels, ActivitySection, ActivitySectionKey } from '@/components/activity/types'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import HeluExchangePanel from '@/components/activity/HeluExchangePanel.vue'
import HeluPassportPanel from '@/components/activity/HeluPassportPanel.vue'
import HeluSolarTermsPanel from '@/components/activity/HeluSolarTermsPanel.vue'
import QixiActivityPanel from '@/components/activity/QixiActivityPanel.vue'
import RainPoemActivityPanel from '@/components/activity/RainPoemActivityPanel.vue'
import StarRecordPanel from '@/components/activity/StarRecordPanel.vue'
import AdminActivityUpdatePanel from '@/components/admin/AdminActivityUpdatePanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { isWithinActivityWindowMs, RAIN_POEM_ACTIVITY_WINDOW } from '@/constants/activity-windows'
import { useAccountStore } from '@/stores/account'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const L: ActivityLabels = {
  title: '活动中心',
  currentAccount: '当前账号',
  none: '未选择',
  needAccount: '请先选择账号，再查看活动数据。',
  refresh: '刷新',
  loading: '正在加载活动数据...',
  empty: '暂无数据',
  warningTitle: '活动提示',
  heluTitle: '心许千灯星垂野',
  giftLotusTab: '观星礼录',
  shopTab: '星砂兑换商店',
  journeyTab: '千星游记',
  notesTab: '节令小札',
  pool: '奖池',
  recent: '最近结果',
  freeRemain: '免费剩余',
  paidRemain: '点券剩余',
  dailyUsed: '今日已用',
  dailyRemain: '今日剩余',
  helu: '星砂',
  heluBalance: '星砂余额',
  exchangeGoods: '兑换奖励',
  drawOne: '点亮',
  drawBatch: '一键点亮',
  drawDone: '点亮完成',
  batchDone: '点亮完成',
  drawFail: '点亮失败',
  exchangeDone: '兑换成功：',
  exchangeFail: '兑换失败',
  canExchange: '立即兑换',
  unavailable: '暂不可用',
  owned: '已拥有',
  noHelu: '星砂不足',
  unsupportedCurrency: '暂不支持该货币',
  priceLabel: '价格',
  stateLabel: '状态',
  drawCostLabel: '操作说明',
  freeDraw: '免费',
  paidDraw: '消耗',
  recentCost: '本次消耗',
  rewardPoolCount: '星宿奖励',
  exchangeCount: '兑换奖励',
  typeFallback: '活动奖励',
  gold: '金币',
  coupon: '点券',
  activityCurrency: '星砂',
  defaultHeluTitle: '心许千灯星垂野',
  decorationLabel: '装扮',
  subActivityUnavailable: '暂未读取到活动数据。',
  activityStatus: '活动状态',
}

const accountStore = useAccountStore()
const activityStore = useActivityStore()
const toast = useToastStore()
const userStore = useUserStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const {
  heluActivity: activity,
  heluLoading,
  passportClaimLoading,
  solarClaimLoading,
  starRecordClaimLoading,
  exchangeLoading,
  heluError,
  qixiActivity,
  qixiFriends,
  qixiLoading,
  qixiBuildLoading,
  qixiGiftLoading,
  qixiDewLoading,
  rainPoemActivity,
  rainPoemLoading,
} = storeToRefs(activityStore)

const SHOW_QIXI_ACTIVITY = false
const SHOW_STAR_ACTIVITY = false
const nowMs = ref(Date.now())
let nowTimer: ReturnType<typeof window.setInterval> | null = null
const showRainPoemActivity = computed(() => isWithinActivityWindowMs(RAIN_POEM_ACTIVITY_WINDOW, nowMs.value))
const activeSection = ref<ActivitySectionKey>('journey')
const showActivityAnalysis = ref(false)
const ACTIVITY_REFRESH_INTERVAL_MS = 30_000
const sections = computed<ActivitySection[]>(() => [
  ...(SHOW_QIXI_ACTIVITY ? [{ key: 'qixi' as const, label: '鹊桥寄情', icon: 'i-carbon-favorite', count: qixiActivity.value?.gift.remainingCount || 0 }] : []),
  { key: 'journey', label: '千星游记', icon: 'i-carbon-map', count: activity.value?.passport?.claimableLevels || 0 },
  { key: 'records', label: '观星礼录', icon: 'i-carbon-star', count: activity.value?.starRecord?.claimableCount || 0 },
  { key: 'shop', label: '星砂兑换商店', icon: 'i-carbon-store', count: activity.value?.exchangeShop?.length || 0 },
  { key: 'notes', label: '节令小札', icon: 'i-carbon-notebook', count: activity.value?.solarTerms?.claimableCount || 0 },
])

async function refreshAll() {
  if (currentAccountId.value && !rainPoemLoading.value && !heluLoading.value && !qixiLoading.value) {
    const requests = []
    if (SHOW_STAR_ACTIVITY)
      requests.push(activityStore.fetchHeluActivity(String(currentAccountId.value)))
    if (SHOW_QIXI_ACTIVITY)
      requests.push(activityStore.fetchQixiActivity(String(currentAccountId.value)))
    if (showRainPoemActivity.value)
      requests.push(activityStore.fetchRainPoemActivity(String(currentAccountId.value)))
    await Promise.all(requests)
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    nowMs.value = Date.now()
    refreshAll()
  }
}

async function buildQixi() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.buildQixiBridge(String(currentAccountId.value))
  result?.ok ? toast.success(result.completed ? '鹊桥已全部完成' : '驻建鹊桥成功') : toast.error(result?.error || '驻建鹊桥失败')
}
async function useQixiDew() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.useQixiDew(String(currentAccountId.value))
  result?.ok
    ? toast.success(result.usedCount ? `已使用 ${result.usedCount} 个鹊羽灵露` : result.reason === 'daily_limit' ? '今日使用次数已达上限' : '暂无符合条件的土地')
    : toast.error(result?.error || '使用鹊羽灵露失败')
}

async function giftQixi(friendGid: number, count: number) {
  if (!currentAccountId.value)
    return
  const result = await activityStore.sendQixiSachet(String(currentAccountId.value), friendGid, count)
  result?.ok ? toast.success(`已赠送 ${result.sentCount || count} 个鹊羽香囊`) : toast.error(result?.error || '香囊赠送失败')
}

async function claimRecords() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimStarRecords(currentAccountId.value)
  if (result?.ok) {
    const count = result.recordIds?.length || 0
    toast.success(count ? `已点亮并领取 ${count} 个星宿奖励` : '观星礼录领取完成')
  }
  else {
    toast.error(result?.error || '观星礼录领取失败')
  }
}

async function claimPassport() {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimHeluPassport(currentAccountId.value)
  result?.ok ? toast.success('千星游记奖励领取完成') : toast.error(result?.error || '千星游记领取失败')
}

async function claimSolar(term: { id: number, title?: string }) {
  if (!currentAccountId.value)
    return
  const result = await activityStore.claimHeluSolar(currentAccountId.value, term.id)
  result?.ok
    ? toast.success(`节令小札领取完成：${term.title || term.id}`)
    : toast.error(result?.error || '节令小札领取失败')
}

async function exchangeStarSand(item: { id: number, itemName?: string, name?: string }, count: number) {
  if (!currentAccountId.value)
    return
  const result = await activityStore.exchangeStarSand(currentAccountId.value, item.id, count)
  result?.ok
    ? toast.success(`${L.exchangeDone}${item.itemName || item.name || item.id} ×${count}`)
    : toast.error(result?.error || L.exchangeFail)
}

watch(currentAccountId, () => {
  activityStore.clearActivityData()
  refreshAll()
})
watch(showRainPoemActivity, (visible) => {
  if (visible)
    refreshAll()
  else
    activityStore.clearActivityData()
})
onMounted(() => {
  nowTimer = window.setInterval(() => {
    nowMs.value = Date.now()
    if (document.visibilityState === 'visible')
      refreshAll()
  }, ACTIVITY_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  refreshAll()
})
onUnmounted(() => {
  if (nowTimer)
    window.clearInterval(nowTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <section class="space-y-4">
    <header v-if="SHOW_STAR_ACTIVITY" class="relative min-h-40 overflow-hidden rounded-lg bg-[#071b43] shadow-sm">
      <img
        src="/activity/star-festival/star-sky.png"
        alt=""
        class="absolute inset-0 h-full w-full object-cover opacity-80"
      >
      <div class="absolute inset-0 bg-gradient-to-r from-[#061632]/95 via-[#0b2e61]/80 to-[#0b2e61]/25" />
      <img
        src="/activity/star-festival/star-farm.png"
        alt=""
        class="pointer-events-none absolute -bottom-32 right-0 hidden h-96 w-96 object-contain opacity-85 lg:block"
      >

      <div class="relative flex min-h-40 flex-col justify-between gap-4 p-4 xl:flex-row xl:items-center">
        <div class="min-w-0">
          <img
            src="/activity/star-festival/event-title.png"
            :alt="activity?.title || L.heluTitle"
            class="h-auto w-72 max-w-full object-contain object-left"
          >
          <div class="mt-1 text-xs text-sky-100/75">
            活动中心 · {{ L.currentAccount }} {{ currentAccount?.name || L.none }}
          </div>
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-2 xl:max-w-[68%] xl:justify-end">
          <span class="inline-flex items-center rounded-lg border border-sky-200/20 bg-[#071b43]/70 px-3 py-1.5 text-xs text-sky-50 backdrop-blur-sm">
            <img src="/activity/star-festival/star-token.png" alt="" class="mr-1.5 h-5 w-7 object-contain">
            {{ L.heluBalance }} {{ Number(activity?.starSandBalance || 0).toLocaleString() }}
          </span>
          <div class="max-w-full overflow-x-auto">
            <div class="min-w-max inline-flex border border-sky-200/20 rounded-lg bg-[#071b43]/70 p-0.5 backdrop-blur-sm">
              <button
                v-for="section in sections"
                :key="section.key"
                class="rounded-md px-3 py-1.5 text-sm transition"
                :class="activeSection === section.key ? 'text-white' : 'text-sky-100/80 hover:text-white'"
                :style="activeSection === section.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
                @click="activeSection = section.key"
              >
                {{ section.label }}
                <span v-if="section.count" class="ml-1 opacity-80">{{ section.count }}</span>
              </button>
            </div>
          </div>
          <BaseButton variant="primary" :loading="heluLoading" :disabled="!currentAccountId" @click="refreshAll">
            {{ L.refresh }}
          </BaseButton>
          <BaseButton v-if="userStore.isAdmin" variant="secondary" @click="showActivityAnalysis = true">
            <span class="i-carbon-analytics mr-1.5" />
            活动分析
          </BaseButton>
        </div>
      </div>
    </header>

    <RainPoemActivityPanel
      v-if="showRainPoemActivity && currentAccountId"
      :activity="rainPoemActivity"
      :loading="rainPoemLoading"
      @refresh="refreshAll"
    />
    <div v-else-if="showRainPoemActivity && !currentAccountId" class="rounded-lg bg-white p-10 text-center text-sm text-gray-500 shadow dark:bg-gray-800">
      {{ L.needAccount }}
    </div>
    <div v-else-if="!SHOW_STAR_ACTIVITY" class="rounded-lg bg-white p-10 text-center text-sm text-gray-500 shadow dark:bg-gray-800">
      <div class="i-carbon-events mx-auto mb-3 text-4xl text-gray-300" />
      <p>当前暂无进行中的活动。</p>
      <BaseButton v-if="userStore.isAdmin" class="mt-4" variant="secondary" @click="showActivityAnalysis = true">
        <span class="i-carbon-analytics mr-1.5" />
        活动分析
      </BaseButton>
    </div>
    <div v-else-if="!currentAccountId" class="rounded-lg bg-white p-10 text-center text-sm text-gray-500 shadow dark:bg-gray-800">
      {{ L.needAccount }}
    </div>
    <template v-else>
      <div v-if="heluError" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
        {{ heluError }}
      </div>
      <div v-if="activity?.warning" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        {{ activity.warning }}
      </div>
      <div v-if="heluLoading && !activity" class="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
        {{ L.loading }}
      </div>

      <StarRecordPanel
        v-if="activeSection === 'records'"
        :record="activity?.starRecord"
        :loading="starRecordClaimLoading"
        @claim="claimRecords"
      />
      <QixiActivityPanel
        v-else-if="SHOW_QIXI_ACTIVITY && activeSection === 'qixi'"
        :activity="qixiActivity"
        :friends="qixiFriends"
        :build-loading="qixiBuildLoading || qixiLoading"
        :gift-loading="qixiGiftLoading"
        :dew-loading="qixiDewLoading"
        @build="buildQixi"
        @dew="useQixiDew"
        @gift="giftQixi"
      />
      <div v-else-if="activeSection === 'shop'" class="space-y-3">
        <div v-if="activity?.shopWarning" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {{ activity.shopWarning }}
        </div>
        <HeluExchangePanel
          :items="activity?.exchangeShop || []"
          :balance="activity?.starSandBalance || 0"
          :exchange-loading="exchangeLoading"
          :read-only="activity?.shopReadOnly"
          :labels="L"
          @exchange="exchangeStarSand"
        />
      </div>
      <HeluPassportPanel
        v-else-if="activeSection === 'journey'"
        :passport="activity?.passport"
        :loading="passportClaimLoading"
        :labels="L"
        @claim="claimPassport"
      />
      <HeluSolarTermsPanel
        v-else
        :solar-terms="activity?.solarTerms"
        :loading="solarClaimLoading"
        :labels="L"
        @claim="claimSolar"
      />
    </template>

    <Teleport to="body">
      <div
        v-if="showActivityAnalysis"
        class="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="活动分析"
        @click.self="showActivityAnalysis = false"
      >
        <div class="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
          <header class="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <h2 class="font-semibold text-gray-900 dark:text-white">活动分析</h2>
              <p class="mt-0.5 text-xs text-gray-500">在线发现未适配活动并读取只读活动树</p>
            </div>
            <button
              class="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="关闭活动分析"
              @click="showActivityAnalysis = false"
            >
              <span class="i-carbon-close text-xl" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <AdminActivityUpdatePanel />
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
