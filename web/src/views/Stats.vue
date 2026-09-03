<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import FarmStatsPanel from '@/components/FarmStatsPanel.vue'
import { useAccountStore } from '@/stores/account'

const accountStore = useAccountStore()
const { currentAccount } = storeToRefs(accountStore)

const accountLabel = computed(() => {
  const acc = currentAccount.value as any
  if (!acc)
    return ''
  return acc.nick || acc.name || acc.username || String(acc.uin || acc.id || '')
})
</script>

<template>
  <div class="space-y-4">
    <!-- 无账号状态 -->
    <div
      v-if="!currentAccount"
      class="ui-subtle-panel flex flex-col items-center justify-center gap-2 rounded-xl p-10 text-center"
    >
      <div class="i-carbon-user-avatar text-4xl text-gray-300" />
      <div class="text-sm font-medium text-gray-600 dark:text-gray-300">
        尚未选择账号
      </div>
      <div class="text-xs text-gray-400">
        请先在顶部账号菜单中选择一个 QQ 农场账号。
      </div>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 px-1">
        <div class="i-carbon-trophy text-xl text-amber-500" />
        <h2 class="text-lg font-semibold">统计榜</h2>
        <span class="ml-auto text-xs text-gray-400">
          当前账号：{{ accountLabel }}
        </span>
      </div>

      <FarmStatsPanel />
    </template>
  </div>
</template>
