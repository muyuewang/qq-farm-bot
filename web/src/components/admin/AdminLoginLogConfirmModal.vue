<script setup lang="ts">
import ConfirmModal from '@/components/ConfirmModal.vue'

const props = defineProps<{
  total: number
  loading: boolean
}>()

const emit = defineEmits<{
  clear: []
}>()

const show = defineModel<boolean>('show', { required: true })

function closeModal() {
  if (!props.loading)
    show.value = false
}
</script>

<template>
  <ConfirmModal
    :show="show"
    title="确认清空日志"
    :message="`确定要清空所有登录日志吗？此操作不可恢复。\n当前共有 ${total} 条记录。`"
    type="danger"
    :loading="loading"
    confirm-text="确认清空"
    cancel-text="取消"
    @confirm="emit('clear')"
    @close="closeModal"
    @cancel="closeModal"
  />
</template>
