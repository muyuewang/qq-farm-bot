<script setup lang="ts">
import type { CharityFlowerActivityData } from '@/stores/activity'
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps<{
  activity: CharityFlowerActivityData | null
  loading: boolean
  pendingSeeds?: boolean
  pendingDonate?: boolean
  pendingDailyGift?: boolean
  pendingReward?: number | null
}>()
defineEmits<{
  refresh: []
  claimSeeds: []
  donateLove: []
  claimDailyGift: []
  claimReward: [needScore: number]
}>()
function pct(value: number, target: number) { return target > 0 ? Math.min(100, Math.max(0, value / target * 100)) : 0 }
function time(value?: number) { return value ? new Date(value * 1000).toLocaleString('zh-CN', { hour12: false }) : '—' }
function itemsText(items: Array<{ itemName?: string, itemCount?: number }>) {
  return (items || []).map(item => `${item.itemName || '物品'} ×${item.itemCount ?? 1}`).join('、')
}
function settlementStatus(activity: CharityFlowerActivityData) {
  const finalReward = activity.finalReward
  if (finalReward?.settled)
    return '已结算'
  if (finalReward?.eligible)
    return '已获得结算资格'
  if (!finalReward?.personalReached && finalReward?.threshold > 0)
    return `还差 ${Math.max(0, finalReward.threshold - activity.love.personalScore)} 份爱心`
  if (!finalReward?.globalReached)
    return '等待全服爱心目标达成'
  return '等待活动结束结算'
}
</script>

<template>
  <section class="space-y-4">
    <div class="overflow-hidden rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-6 text-white shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div><p class="text-sm text-white/75">QQ 农场公益活动</p><h1 class="mt-1 text-3xl font-semibold">{{ activity?.title || '公益小红花' }}</h1><p class="mt-2 text-sm text-white/80">{{ time(activity?.startTime) }} — {{ time(activity?.endTime) }}</p></div>
        <button class="rounded-lg bg-white/20 px-3 py-2 text-sm disabled:opacity-50" :disabled="loading" @click="$emit('refresh')">{{ loading ? '刷新中' : '刷新' }}</button>
      </div>
      <div class="mt-6 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-lg bg-white/15 p-3"><div class="text-xs text-white/70">可送爱心</div><div class="mt-1 text-2xl font-semibold">{{ activity?.love?.count || 0 }}</div></div>
        <div class="rounded-lg bg-white/15 p-3"><div class="text-xs text-white/70">个人爱心值</div><div class="mt-1 text-2xl font-semibold">{{ activity?.love?.personalScore || 0 }}</div></div>
        <div class="rounded-lg bg-white/15 p-3"><div class="text-xs text-white/70">公益金今日状态</div><div class="mt-1 text-sm font-medium">{{ activity?.publicFund?.claimedToday ? '今日已送出' : !activity?.dailyGift?.harvestedToday ? '待收获小红花' : activity?.publicFund?.complianceAgreed ? '今日可送出' : '未同意协议' }}</div></div>
      </div>
    </div>

    <div v-if="loading && !activity" class="rounded-xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm dark:bg-gray-800">正在读取活动状态…</div>
    <template v-else-if="activity">
      <section class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
        <div class="flex justify-between text-sm"><span class="font-medium">全服公益金进度（元）</span><span>{{ Number(activity.global.amountYuan).toLocaleString(undefined, { minimumFractionDigits: 2 }) }} / {{ Number(activity.global.targetYuan).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span></div>
        <div class="mt-3 h-3 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950"><div class="h-full rounded-full bg-rose-500" :style="{ width: `${pct(activity.global.score, activity.global.target)}%` }" /></div>
        <p v-if="activity.global.reward?.length" class="mt-2 text-xs text-gray-500">全服目标奖励：{{ itemsText(activity.global.reward) }}</p>
        <p class="mt-1 text-xs text-gray-500">全服结算时间：{{ time(activity.finalReward.settlementTime) }}</p>
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
        <h2 class="text-base font-semibold">操作</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <div class="text-xs text-gray-500">领取小红花种子</div>
            <div class="mt-1 text-sm font-medium">{{ activity.seedReward?.claimed ? '已领取' : activity.seedReward?.claimable ? '可领取' : '不可领取' }}</div>
            <BaseButton class="mt-2" size="sm" :disabled="!activity.seedReward?.claimable || pendingSeeds" @click="$emit('claimSeeds')">{{ pendingSeeds ? '领取中…' : '领取种子' }}</BaseButton>
          </div>
          <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <div class="text-xs text-gray-500">捐赠爱心</div>
            <div class="mt-1 text-sm font-medium">{{ activity.love.canDonate ? `可送 ${activity.love.count} 份` : '暂无可送爱心' }}</div>
            <BaseButton class="mt-2" size="sm" :disabled="!activity.love.canDonate || activity.love.count <= 0 || pendingDonate" @click="$emit('donateLove')">{{ pendingDonate ? '捐赠中…' : '捐赠全部爱心' }}</BaseButton>
          </div>
          <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
            <div class="text-xs text-gray-500">每日公益礼包</div>
            <div class="mt-1 text-sm font-medium">{{ activity.dailyGift?.claimed ? '已领取' : !activity.dailyGift?.harvestedToday ? '今日收获小红花后可领取' : '可领取' }}</div>
            <BaseButton class="mt-2" size="sm" :disabled="!activity.dailyGift?.claimable || pendingDailyGift" @click="$emit('claimDailyGift')">{{ pendingDailyGift ? '领取中…' : '领取礼包' }}</BaseButton>
          </div>
        </div>
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
        <h2 class="text-base font-semibold">个人爱心奖励</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div v-for="tier in activity.personalRewards" :key="tier.needScore" class="rounded-lg border p-3" :class="tier.claimed ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : tier.claimable ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/20' : 'border-gray-200 dark:border-gray-700'">
            <div class="text-xs text-gray-500">{{ tier.needScore }} 爱心</div><div class="mt-2 text-sm font-medium">{{ itemsText(tier.rewards) }}</div>
            <div class="mt-2 text-xs">{{ tier.claimed ? '已领取' : tier.claimable ? '可领取' : '未达成' }}</div>
            <BaseButton v-if="tier.claimable" class="mt-2 w-full" size="sm" :disabled="pendingReward === tier.needScore" @click="$emit('claimReward', tier.needScore)">{{ pendingReward === tier.needScore ? '领取中…' : '领取奖励' }}</BaseButton>
          </div>
        </div>
      </section>

      <section class="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold">结算奖励</h2>
          <span class="rounded-full px-3 py-1 text-xs" :class="activity.finalReward?.eligible ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'">{{ settlementStatus(activity) }}</span>
        </div>
        <p v-if="activity.finalReward?.rewards?.length" class="mt-3 text-sm">{{ itemsText(activity.finalReward.rewards) }}</p>
        <p v-else class="mt-3 text-sm text-gray-400">结算奖励内容待活动结束结算时发放</p>
        <p class="mt-2 text-xs text-gray-500">需同时达成个人目标（{{ activity.finalReward?.threshold || 0 }} 爱心）与全服目标；结算奖励将在活动结束后通过邮件发放并自动打开。</p>
      </section>

      <section class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800"><div class="text-xs text-gray-500">公益协议</div><div class="mt-2 text-sm font-medium">{{ activity.publicFund.complianceAgreed ? '已同意' : '未同意' }}</div></div>
        <div class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800"><div class="text-xs text-gray-500">已送公益金次数</div><div class="mt-2 text-sm font-medium">{{ activity.publicFund.successCount }}</div></div>
      </section>
    </template>
    <div v-else class="rounded-xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm dark:bg-gray-800">当前账号暂无活动数据</div>
  </section>
</template>
