<script setup lang="ts">
import type { LoginLog } from '@/composables/useAdminLoginLogs'
import BaseButton from '@/components/ui/BaseButton.vue'
import {
  formatLogTime,
  getErrorTypeLabel,
  getEventClass,
  getEventLabel,
  parseBrowser,
} from '@/composables/useAdminLoginLogs'

defineProps<{
  logs: LoginLog[]
  loading: boolean
  total: number
  successCount: number
  failedCount: number
  summary: string
}>()

defineEmits<{
  refresh: []
  clear: []
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
        登录日志
      </h3>
      <div class="flex items-center gap-2">
        <BaseButton
          variant="danger"
          size="sm"
          @click="$emit('clear')"
        >
          清空日志
        </BaseButton>
        <BaseButton
          variant="primary"
          size="sm"
          :loading="loading"
          @click="$emit('refresh')"
        >
          刷新
        </BaseButton>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div class="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          日志总数
        </div>
        <div class="mt-1 font-semibold">
          {{ total }} 条
        </div>
      </div>
      <div class="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          成功登录
        </div>
        <div class="mt-1 font-semibold">
          {{ successCount }} 条
        </div>
      </div>
      <div class="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          失败登录
        </div>
        <div class="mt-1 font-semibold">
          {{ failedCount }} 条
        </div>
      </div>
    </div>

    <div class="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
      登录日志默认展示最近记录，适合快速排查锁定、限流和密码错误等异常。
    </div>

    <div class="border border-gray-200 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="text-xs text-gray-500 dark:text-gray-400">
        当前日志结论
      </div>
      <div class="mt-1 text-gray-900 font-medium dark:text-gray-100">
        {{ summary }}
      </div>
    </div>

    <div class="overflow-hidden border border-gray-200 rounded-lg bg-white dark:border-gray-700 dark:bg-gray-800">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                时间
              </th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                事件
              </th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                用户名
              </th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                错误类型
              </th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                IP地址
              </th>
              <th class="px-3 py-2 text-left text-xs text-gray-500 font-medium uppercase dark:text-gray-300">
                浏览器
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <tr v-if="loading">
              <td colspan="6" class="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                加载中...
              </td>
            </tr>
            <tr v-else-if="logs.length === 0">
              <td colspan="6" class="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                <div class="i-carbon-document-blank mx-auto mb-2 text-3xl text-gray-300" />
                <div class="text-sm">
                  暂无登录日志
                </div>
              </td>
            </tr>
            <tr v-for="log in logs" :key="log.id">
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">
                {{ formatLogTime(log.timestamp) }}
              </td>
              <td class="whitespace-nowrap px-3 py-2">
                <span
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="getEventClass(log.event)"
                >
                  {{ getEventLabel(log.event) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 font-medium dark:text-white">
                {{ log.username }}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-white">
                {{ getErrorTypeLabel(log.errorType) }}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-600 font-mono dark:text-gray-300">
                {{ log.ip }}
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                {{ parseBrowser(log.userAgent) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="total > 0" class="border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        共 {{ total }} 条记录
      </div>
    </div>
  </div>
</template>
