<script setup lang="ts">
import { computed } from 'vue'
import type { CharityFlowerActivityData } from '@/stores/activity'
import BaseButton from '@/components/ui/BaseButton.vue'

const props = defineProps<{
  activity: CharityFlowerActivityData | null
  loading: boolean
  sendLovePending: boolean
  sendMoneyPending: boolean
  claimRewardPending: boolean
  sharePending: boolean
}>()

const emit = defineEmits<{
  refresh: []
  sendLove: []
  sendMoney: []
  claimReward: [tier: number]
  share: []
}>()

const active = computed(() => props.activity?.active ?? false)

function formatDate(ts: number) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="py-8 text-center text-gray-400">
      <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
      加载中...
    </div>

    <template v-else-if="activity">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-bold text-gray-900 dark:text-gray-100">
            {{ activity.title }}
          </h3>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {{ formatDate(activity.startTime) }} ~ {{ formatDate(activity.endTime) }}
          </p>
        </div>
        <BaseButton size="sm" variant="ghost" @click="emit('refresh')">
          <div class="i-carbon-refresh text-sm" />
        </BaseButton>
      </div>

      <!-- 未开启 -->
      <div v-if="!active" class="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
        活动未开启或已结束
      </div>

      <template v-else>
        <!-- 爱心值 + 全服进度 -->
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-pink-50 p-3 text-center dark:bg-pink-900/20">
            <div class="text-2xl font-bold text-pink-600 dark:text-pink-400">
              {{ activity.totalLovePoints }}
            </div>
            <div class="mt-0.5 text-xs text-pink-500 dark:text-pink-300">
              个人爱心值
            </div>
          </div>
          <div class="rounded-lg bg-red-50 p-3 text-center dark:bg-red-900/20">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">
              {{ activity.serverGoal.percent }}%
            </div>
            <div class="mt-0.5 text-xs text-red-500 dark:text-red-300">
              全服公益目标
            </div>
          </div>
        </div>

        <!-- 全服进度条 -->
        <div>
          <div class="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>全服进度</span>
            <span>{{ activity.serverGoal.progress }} / {{ activity.serverGoal.target }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-pink-500 to-red-500 transition-all"
              :style="{ width: `${activity.serverGoal.percent}%` }"
            />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="grid grid-cols-2 gap-2">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="sendLovePending"
            :disabled="sendLovePending"
            @click="emit('sendLove')"
          >
            送出爱心值
          </BaseButton>
          <BaseButton
            variant="success"
            size="sm"
            :loading="sendMoneyPending"
            :disabled="sendMoneyPending"
            @click="emit('sendMoney')"
          >
            送出公益金
          </BaseButton>
        </div>

        <!-- 分享奖励 -->
        <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
          <span class="text-sm text-gray-700 dark:text-gray-300">分享奖励</span>
          <BaseButton
            v-if="activity.share.available"
            size="sm"
            variant="ghost"
            :loading="sharePending"
            @click="emit('share')"
          >
            领取
          </BaseButton>
          <span v-else class="text-xs text-gray-400">已领取或不可用</span>
        </div>

        <!-- 5 档领奖 -->
        <div>
          <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            个人爱心值奖励
          </div>
          <div class="space-y-2">
            <div
              v-for="tier in activity.tiers"
              :key="tier.tier"
              class="flex items-center justify-between rounded-lg border px-3 py-2 transition"
              :class="tier.claimed
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : tier.reached
                  ? 'border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-900/20'
                  : 'border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800'"
            >
              <div class="flex items-center gap-2">
                <span
                  class="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white"
                  :class="tier.claimed ? 'bg-green-500' : tier.reached ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'"
                >
                  {{ tier.tier }}
                </span>
                <div>
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{ tier.label }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    奖励: {{ tier.reward }}
                  </div>
                </div>
              </div>
              <BaseButton
                v-if="tier.reached && !tier.claimed"
                size="sm"
                variant="primary"
                :loading="claimRewardPending"
                @click="emit('claimReward', tier.tier)"
              >
                领取
              </BaseButton>
              <span v-else-if="tier.claimed" class="text-xs text-green-500">已领取</span>
              <span v-else class="text-xs text-gray-400">{{ tier.lovePoints }}点</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div v-else class="py-8 text-center text-sm text-gray-400">
      暂无活动数据
    </div>
  </div>
</template>
