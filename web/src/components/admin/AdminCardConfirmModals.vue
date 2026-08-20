<script setup lang="ts">
import type { NewCardForm } from '@/composables/useAdminCards'
import type { Card } from '@/stores/user'
import ConfirmModal from '@/components/ConfirmModal.vue'

const props = defineProps<{
  newCard: NewCardForm
  selectedCardCount: number
  availableTimeCards: number
  cardClaimLoading: boolean
  createCardLoading: boolean
  toggleCardStatusLoading: boolean
  deleteCardLoading: boolean
  deleteSelectedCardsLoading: boolean
}>()

const emit = defineEmits<{
  toggleCardClaimStatus: []
  createCard: []
  toggleCardStatus: []
  deleteCard: []
  deleteSelectedCards: []
}>()

const showCardClaimConfirm = defineModel<boolean>('showCardClaimConfirm', { required: true })
const pendingCardClaimEnabled = defineModel<boolean | null>('pendingCardClaimEnabled', { required: true })
const showCreateCardConfirm = defineModel<boolean>('showCreateCardConfirm', { required: true })
const showToggleCardStatusConfirm = defineModel<boolean>('showToggleCardStatusConfirm', { required: true })
const pendingToggleCard = defineModel<Card | null>('pendingToggleCard', { required: true })
const showDeleteCardConfirm = defineModel<boolean>('showDeleteCardConfirm', { required: true })
const pendingDeleteCard = defineModel<Card | null>('pendingDeleteCard', { required: true })
const showDeleteSelectedCardsConfirm = defineModel<boolean>('showDeleteSelectedCardsConfirm', { required: true })

function closeCardClaimConfirm() {
  if (props.cardClaimLoading)
    return
  showCardClaimConfirm.value = false
  pendingCardClaimEnabled.value = null
}

function closeCreateCardConfirm() {
  if (!props.createCardLoading)
    showCreateCardConfirm.value = false
}

function closeToggleCardStatusConfirm() {
  if (props.toggleCardStatusLoading)
    return
  showToggleCardStatusConfirm.value = false
  pendingToggleCard.value = null
}

function closeDeleteCardConfirm() {
  if (props.deleteCardLoading)
    return
  showDeleteCardConfirm.value = false
  pendingDeleteCard.value = null
}

function closeDeleteSelectedCardsConfirm() {
  if (!props.deleteSelectedCardsLoading)
    showDeleteSelectedCardsConfirm.value = false
}
</script>

<template>
  <ConfirmModal
    :show="showCardClaimConfirm"
    title="确认更新卡密领取功能"
    :message="`确定要${pendingCardClaimEnabled ? '开启' : '关闭'}卡密领取功能吗？${pendingCardClaimEnabled ? `开启后，新用户注册时可以免费领取一张时间卡密。当前可领取库存：${availableTimeCards} 张。` : '关闭后，新用户将不再自动领取卡密。'}`"
    type="danger"
    :loading="cardClaimLoading"
    confirm-text="确认执行"
    cancel-text="取消"
    @confirm="emit('toggleCardClaimStatus')"
    @close="closeCardClaimConfirm"
    @cancel="closeCardClaimConfirm"
  />

  <ConfirmModal
    :show="showCreateCardConfirm"
    title="确认创建卡密"
    :message="`确定要创建${newCard.count > 1 ? `${newCard.count} 个` : ''}${newCard.type === 'quota' ? `额度卡密（+${newCard.days || 0}额度）` : `时间卡密（${newCard.days === -1 ? '永久' : `${newCard.days || 0}${newCard.durationUnit === 'hour' ? '小时' : '天'}`}）`}吗？${newCard.count > 1 ? '批量创建后会立即生成并导出本批卡密。' : '创建后卡密将立即可用。'}`"
    type="danger"
    :loading="createCardLoading"
    confirm-text="确认创建"
    cancel-text="取消"
    @confirm="emit('createCard')"
    @close="closeCreateCardConfirm"
    @cancel="closeCreateCardConfirm"
  />

  <ConfirmModal
    :show="showToggleCardStatusConfirm"
    :title="pendingToggleCard?.enabled ? '确认禁用卡密' : '确认启用卡密'"
    :message="`确定要${pendingToggleCard?.enabled ? '禁用' : '启用'}卡密 ${pendingToggleCard?.code || ''} 吗？${pendingToggleCard?.enabled ? '禁用后该卡密将无法继续被领取或使用。' : '启用后该卡密会重新恢复可用状态。'}`"
    type="danger"
    :loading="toggleCardStatusLoading"
    confirm-text="确认执行"
    cancel-text="取消"
    @confirm="emit('toggleCardStatus')"
    @close="closeToggleCardStatusConfirm"
    @cancel="closeToggleCardStatusConfirm"
  />

  <ConfirmModal
    :show="showDeleteCardConfirm"
    title="确认删除卡密"
    :message="`确定要删除卡密 ${pendingDeleteCard?.code || ''} 吗？此操作不可恢复。`"
    type="danger"
    :loading="deleteCardLoading"
    confirm-text="确认删除"
    cancel-text="取消"
    @confirm="emit('deleteCard')"
    @close="closeDeleteCardConfirm"
    @cancel="closeDeleteCardConfirm"
  />

  <ConfirmModal
    :show="showDeleteSelectedCardsConfirm"
    title="确认批量删除卡密"
    :message="`确定要删除当前选中的 ${selectedCardCount} 个卡密吗？此操作不可恢复。`"
    type="danger"
    :loading="deleteSelectedCardsLoading"
    confirm-text="确认删除"
    cancel-text="取消"
    @confirm="emit('deleteSelectedCards')"
    @close="closeDeleteSelectedCardsConfirm"
    @cancel="closeDeleteSelectedCardsConfirm"
  />
</template>
