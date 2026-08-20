<script setup lang="ts">
defineProps<{
  totalCards: number
  unusedTimeCardsCount: number
  totalUsers: number
  loginLogsTotal: number
}>()
</script>

<template>
  <div class="mb-4 rounded-3xl bg-white p-6 shadow-sm dark:bg-gray-800">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl text-gray-900 font-bold dark:text-gray-100">
          <div class="i-fas-user-shield text-lg" />
          后台管理
        </h1>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          统一处理卡密、用户、登录日志与系统配置，优先关注库存、过期和异常登录。
        </p>
      </div>

      <div class="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-2xl bg-blue-50 px-4 py-3 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          <div class="text-xs opacity-80">
            卡密总数
          </div>
          <div class="mt-1 font-medium">
            {{ totalCards }} 个
          </div>
        </div>
        <div class="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          <div class="text-xs opacity-80">
            可领时间卡
          </div>
          <div class="mt-1 font-medium">
            {{ unusedTimeCardsCount }} 张
          </div>
        </div>
        <div class="rounded-2xl bg-amber-50 px-4 py-3 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          <div class="text-xs opacity-80">
            用户数量
          </div>
          <div class="mt-1 font-medium">
            {{ totalUsers }} 人
          </div>
        </div>
        <div class="rounded-2xl bg-rose-50 px-4 py-3 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
          <div class="text-xs opacity-80">
            登录日志
          </div>
          <div class="mt-1 font-medium">
            {{ loginLogsTotal }} 条
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
