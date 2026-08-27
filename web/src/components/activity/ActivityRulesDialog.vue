<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  rules: string[]
}>()
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @click.self="$emit('close')"
    >
      <div class="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        <header class="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2 class="text-gray-900 font-semibold dark:text-white">
            {{ title }}
          </h2>
          <button
            class="grid h-9 w-9 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="关闭规则"
            @click="$emit('close')"
          >
            <span class="i-carbon-close text-xl" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div class="space-y-3">
            <p v-for="(rule, i) in rules" :key="i" class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {{ rule }}
            </p>
          </div>
        </div>
        <footer class="flex shrink-0 justify-end border-t border-gray-200 px-5 py-3 dark:border-gray-700">
          <button
            class="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="$emit('close')"
          >
            我知道了
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
