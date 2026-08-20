<script setup lang="ts">
import type { EditForm, UserInfo } from '@/composables/useAdminUsers'
import ConfirmModal from '@/components/ConfirmModal.vue'

const props = defineProps<{
  renewUserCardCode: string
  expiredUsersCount: number
  editForm: EditForm
  toggleUserStatusLoading: boolean
  deleteUserLoading: boolean
  renewUserLoading: boolean
  clearExpiredUsersLoading: boolean
  editLoading: boolean
}>()

const emit = defineEmits<{
  toggleUserStatus: []
  deleteUser: []
  renewUser: []
  clearExpiredUsers: []
  editUser: []
}>()

const showToggleUserStatusConfirm = defineModel<boolean>('showToggleUserStatusConfirm', { required: true })
const pendingToggleUser = defineModel<UserInfo | null>('pendingToggleUser', { required: true })
const showDeleteUserConfirm = defineModel<boolean>('showDeleteUserConfirm', { required: true })
const pendingDeleteUser = defineModel<UserInfo | null>('pendingDeleteUser', { required: true })
const showRenewUserConfirm = defineModel<boolean>('showRenewUserConfirm', { required: true })
const pendingRenewUser = defineModel<UserInfo | null>('pendingRenewUser', { required: true })
const showClearExpiredUsersConfirm = defineModel<boolean>('showClearExpiredUsersConfirm', { required: true })
const showEditUserConfirm = defineModel<boolean>('showEditUserConfirm', { required: true })
const selectedUser = defineModel<UserInfo | null>('selectedUser', { required: true })

function closeToggleUserStatusConfirm() {
  if (props.toggleUserStatusLoading)
    return
  showToggleUserStatusConfirm.value = false
  pendingToggleUser.value = null
}

function closeDeleteUserConfirm() {
  if (props.deleteUserLoading)
    return
  showDeleteUserConfirm.value = false
  pendingDeleteUser.value = null
}

function closeRenewUserConfirm() {
  if (!props.renewUserLoading)
    showRenewUserConfirm.value = false
}

function closeClearExpiredUsersConfirm() {
  if (!props.clearExpiredUsersLoading)
    showClearExpiredUsersConfirm.value = false
}

function closeEditUserConfirm() {
  if (!props.editLoading)
    showEditUserConfirm.value = false
}
</script>

<template>
  <ConfirmModal
    :show="showToggleUserStatusConfirm"
    :title="pendingToggleUser?.card?.enabled === false ? '确认解封用户' : '确认封禁用户'"
    :message="`确定要${pendingToggleUser?.card?.enabled === false ? '解封' : '封禁'}用户 ${pendingToggleUser?.username || ''} 吗？${pendingToggleUser?.card?.enabled === false ? '解封后该用户可以继续正常登录。' : '封禁后该用户将无法继续使用当前登录状态。'}`"
    type="danger"
    :loading="toggleUserStatusLoading"
    confirm-text="确认执行"
    cancel-text="取消"
    @confirm="emit('toggleUserStatus')"
    @close="closeToggleUserStatusConfirm"
    @cancel="closeToggleUserStatusConfirm"
  />

  <ConfirmModal
    :show="showDeleteUserConfirm"
    title="确认删除用户"
    :message="`确定要删除用户 ${pendingDeleteUser?.username || ''} 吗？该用户的登录将立刻失效，此操作不可恢复。`"
    type="danger"
    :loading="deleteUserLoading"
    confirm-text="确认删除"
    cancel-text="取消"
    @confirm="emit('deleteUser')"
    @close="closeDeleteUserConfirm"
    @cancel="closeDeleteUserConfirm"
  />

  <ConfirmModal
    :show="showRenewUserConfirm"
    title="确认用户续费"
    :message="`确定要为用户 ${pendingRenewUser?.username || ''} 使用卡密 ${renewUserCardCode.trim() || '-'} 续费吗？续费后会立即更新用户时长与额度。`"
    type="danger"
    :loading="renewUserLoading"
    confirm-text="确认续费"
    cancel-text="取消"
    @confirm="emit('renewUser')"
    @close="closeRenewUserConfirm"
    @cancel="closeRenewUserConfirm"
  />

  <ConfirmModal
    :show="showClearExpiredUsersConfirm"
    title="确认清理到期用户"
    :message="`确定要清理全部到期用户吗？当前检测到 ${expiredUsersCount} 个已过期账号。`"
    type="danger"
    :loading="clearExpiredUsersLoading"
    confirm-text="确认清理"
    cancel-text="取消"
    @confirm="emit('clearExpiredUsers')"
    @close="closeClearExpiredUsersConfirm"
    @cancel="closeClearExpiredUsersConfirm"
  />

  <ConfirmModal
    :show="showEditUserConfirm"
    title="确认保存用户资料"
    :message="`确定要保存用户 ${selectedUser?.username || ''} 的资料修改吗？${editForm.newUsername && editForm.newUsername !== selectedUser?.username ? `\n将改名为：${editForm.newUsername}` : ''}${editForm.password ? '\n将同时重置密码。' : ''}`"
    type="danger"
    :loading="editLoading"
    confirm-text="确认保存"
    cancel-text="取消"
    @confirm="emit('editUser')"
    @close="closeEditUserConfirm"
    @cancel="closeEditUserConfirm"
  />
</template>
