<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'

const visible = ref(false)
const content = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get('/api/announcement')
    if (data.ok && data.data?.content && data.data?.shouldShow) {
      content.value = data.data.content
      visible.value = true
    }
  } catch { /* ignore */ }
})

async function close() {
  visible.value = false
  try {
    await api.post('/api/announcement/read')
  } catch { /* ignore */ }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div class="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        <div class="mb-4 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full" style="background: var(--theme-gradient);">
            <div class="i-carbon-notification text-xl text-white" />
          </div>
          <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            系统公告
          </h3>
        </div>
        <div class="mb-6 max-h-60 overflow-y-auto rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap dark:bg-gray-900/50 dark:text-gray-300">
          {{ content }}
        </div>
        <div class="flex justify-end">
          <BaseButton size="sm" @click="close">
            我知道了
          </BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
