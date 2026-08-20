<script setup lang="ts">
import type { PasswordStrength } from '@/composables/usePasswordStrength'
import BaseInput from '@/components/ui/BaseInput.vue'
import PasswordStrengthMeter from './PasswordStrengthMeter.vue'

interface ClaimModalContent {
  success: boolean
  title: string
  message: string
  cardCode: string
}

defineProps<{
  claimModalContent: ClaimModalContent
  resetError: string
  resetLoading: boolean
  resetPasswordStrength: PasswordStrength
  renewalError: string
  renewalSuccess: string
  renewalLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'closeClaim'): void
  (e: 'closeRenewal'): void
  (e: 'closeResetVerify'): void
  (e: 'closeResetPassword'): void
  (e: 'submitRenewal'): void
  (e: 'verifyResetPassword'): void
  (e: 'submitResetPassword'): void
}>()

const showClaimModal = defineModel<boolean>('showClaimModal', { required: true })
const showRenewalModal = defineModel<boolean>('showRenewalModal', { required: true })
const showResetVerifyModal = defineModel<boolean>('showResetVerifyModal', { required: true })
const showResetPasswordModal = defineModel<boolean>('showResetPasswordModal', { required: true })
const renewalUsername = defineModel<string>('renewalUsername', { required: true })
const renewalCardCode = defineModel<string>('renewalCardCode', { required: true })
const resetUsername = defineModel<string>('resetUsername', { required: true })
const resetCardCode = defineModel<string>('resetCardCode', { required: true })
const resetNewPassword = defineModel<string>('resetNewPassword', { required: true })
const resetConfirmPassword = defineModel<string>('resetConfirmPassword', { required: true })
const resetPasswordTouched = defineModel<boolean>('resetPasswordTouched', { required: true })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showClaimModal"
        class="claim-modal-overlay"
        @click.self="emit('closeClaim')"
      >
        <div class="claim-modal">
          <div class="claim-modal-header">
            <span class="claim-modal-icon">{{ claimModalContent.success ? '🎉' : '⚠️' }}</span>
            <h3 class="claim-modal-title">
              {{ claimModalContent.title }}
            </h3>
          </div>
          <div class="claim-modal-body">
            <p class="claim-modal-message">
              {{ claimModalContent.message }}
            </p>
            <div v-if="claimModalContent.success && claimModalContent.cardCode" class="claim-modal-card-info">
              <div class="card-code-label">
                卡密已自动填入
              </div>
              <div class="card-code-value">
                {{ claimModalContent.cardCode }}
              </div>
            </div>
          </div>
          <div class="claim-modal-footer">
            <button class="claim-modal-btn" @click="emit('closeClaim')">
              {{ claimModalContent.success ? '开始注册' : '我知道了' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showRenewalModal"
        class="claim-modal-overlay"
        @click.self="emit('closeRenewal')"
      >
        <div class="claim-modal reset-modal">
          <div class="claim-modal-header">
            <span class="claim-modal-icon">
              <span class="i-carbon-ticket" />
            </span>
            <h3 class="claim-modal-title">
              账号续费
            </h3>
          </div>
          <form class="reset-modal-body" @submit.prevent="emit('submitRenewal')">
            <p class="reset-modal-tip">
              输入用户名和续费卡密，确认后会直接为该账号续费。
            </p>
            <BaseInput v-model="renewalUsername" label="用户名" placeholder="请输入用户名" />
            <BaseInput v-model="renewalCardCode" label="续费卡密" placeholder="请输入续费卡密" />
            <div v-if="renewalError" class="reset-modal-error">
              {{ renewalError }}
            </div>
            <div v-if="renewalSuccess" class="reset-modal-success">
              {{ renewalSuccess }}
            </div>
            <div class="reset-modal-actions">
              <button type="button" class="claim-modal-btn secondary" :disabled="renewalLoading" @click="emit('closeRenewal')">
                {{ renewalSuccess ? '关闭' : '取消' }}
              </button>
              <button type="submit" class="claim-modal-btn" :disabled="renewalLoading">
                {{ renewalLoading ? '续费中...' : '确认续费' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showResetVerifyModal"
        class="claim-modal-overlay"
        @click.self="emit('closeResetVerify')"
      >
        <div class="claim-modal reset-modal">
          <div class="claim-modal-header">
            <span class="claim-modal-icon">
              <span class="i-carbon-password" />
            </span>
            <h3 class="claim-modal-title">
              找回密码
            </h3>
          </div>
          <form class="reset-modal-body" @submit.prevent="emit('verifyResetPassword')">
            <p class="reset-modal-tip">
              输入用户名和注册时使用的卡密，通过验证后即可设置新密码。
            </p>
            <BaseInput v-model="resetUsername" label="用户名" placeholder="请输入用户名" />
            <BaseInput v-model="resetCardCode" label="卡密" placeholder="请输入注册时使用的卡密" />
            <div v-if="resetError" class="reset-modal-error">
              {{ resetError }}
            </div>
            <div class="reset-modal-actions">
              <button type="button" class="claim-modal-btn secondary" :disabled="resetLoading" @click="emit('closeResetVerify')">
                取消
              </button>
              <button type="submit" class="claim-modal-btn" :disabled="resetLoading">
                {{ resetLoading ? '验证中...' : '验证' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="showResetPasswordModal"
        class="claim-modal-overlay"
        @click.self="emit('closeResetPassword')"
      >
        <div class="claim-modal reset-modal">
          <div class="claim-modal-header">
            <span class="claim-modal-icon">
              <span class="i-carbon-security" />
            </span>
            <h3 class="claim-modal-title">
              设置新密码
            </h3>
          </div>
          <form class="reset-modal-body" @submit.prevent="emit('submitResetPassword')">
            <BaseInput
              v-model="resetNewPassword"
              label="新密码"
              type="password"
              placeholder="请输入新密码"
              @input="resetPasswordTouched = true"
            />
            <PasswordStrengthMeter
              v-if="resetPasswordTouched && resetNewPassword"
              :strength="resetPasswordStrength"
            />
            <BaseInput
              v-model="resetConfirmPassword"
              label="确认密码"
              type="password"
              placeholder="请再次输入新密码"
            />
            <div v-if="resetError" class="reset-modal-error">
              {{ resetError }}
            </div>
            <div class="reset-modal-actions">
              <button type="button" class="claim-modal-btn secondary" :disabled="resetLoading" @click="emit('closeResetPassword')">
                取消
              </button>
              <button type="submit" class="claim-modal-btn" :disabled="resetLoading">
                {{ resetLoading ? '提交中...' : '确认修改' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.claim-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(4px);
}

.claim-modal {
  width: 100%;
  max-width: 360px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(102, 187, 106, 0.22);
  border-radius: 18px;
  box-shadow:
    0 18px 56px rgba(46, 125, 50, 0.14),
    0 8px 28px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  backdrop-filter: blur(18px);
  animation: modalSlideIn 0.25s ease;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.claim-modal-header {
  text-align: center;
  padding: 30px 28px 14px;
  background: transparent;
}

.claim-modal-icon {
  width: 58px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  background: #e8f5e9;
  border: 2px solid #66bb6a;
  border-radius: 50%;
  color: #43a047;
  font-size: 1.65rem;
  box-shadow: 0 6px 18px rgba(102, 187, 106, 0.16);
}

.claim-modal-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #2e7d32;
  margin: 0;
}

.claim-modal-body {
  padding: 18px 28px 26px;
  text-align: center;
}

.claim-modal-message {
  font-size: 1rem;
  color: #37474f;
  margin: 0 0 16px;
  line-height: 1.5;
}

.claim-modal-card-info {
  background: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-top: 8px;
}

.card-code-label {
  font-size: 0.75rem;
  color: #66bb6a;
  margin-bottom: 8px;
}

.card-code-value {
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2e7d32;
  background: white;
  padding: 8px 12px;
  border-radius: 8px;
  word-break: break-all;
}

.claim-modal-footer {
  padding: 0 28px 28px;
}

.claim-modal-btn {
  width: 100%;
  min-height: 46px;
  padding: 12px 16px;
  background: #4caf50;
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.28);
  transition: all 0.2s ease;
}

.claim-modal-btn:hover {
  background: #43a047;
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(76, 175, 80, 0.34);
}

.claim-modal-btn:active {
  transform: translateY(0);
}

.claim-modal-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
  transform: none;
}

.claim-modal-btn.secondary {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  color: #757575;
  box-shadow: none;
}

.claim-modal-btn.secondary:hover {
  background: #f0fdf4;
  border-color: #86efac;
  color: #15803d;
}

.reset-modal {
  max-width: 420px;
}

.reset-modal-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 6px 28px 28px;
}

.reset-modal-body :deep(.base-input) {
  min-height: 42px;
  border-color: #d7dce2;
  border-radius: 8px;
  background: #fafafa;
  padding: 10px 12px;
  font-size: 0.94rem;
}

.reset-modal-body :deep(.base-input:focus) {
  border-color: #66bb6a;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(102, 187, 106, 0.16);
}

.reset-modal-body :deep(label) {
  color: #558b2f;
  font-weight: 700;
}

.reset-modal-tip {
  color: #757575;
  font-size: 0.88rem;
  line-height: 1.5;
  margin: 0;
  text-align: center;
}

.reset-modal-error {
  background: rgba(239, 83, 80, 0.1);
  border-radius: 10px;
  color: #d32f2f;
  font-size: 0.875rem;
  padding: 10px 12px;
}

.reset-modal-success {
  background: rgba(102, 187, 106, 0.12);
  border-radius: 10px;
  color: #2e7d32;
  font-size: 0.875rem;
  padding: 10px 12px;
}

.reset-modal-actions {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
  margin-top: 2px;
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .claim-modal,
.modal-leave-to .claim-modal {
  transform: translateY(-20px) scale(0.95);
}

@media (max-width: 480px) {
  .claim-modal-overlay {
    padding: 16px;
    align-items: flex-end;
  }

  .claim-modal {
    border-radius: 20px 20px 0 0;
    max-width: 100%;
    animation: modalSlideUp 0.3s ease;
  }

  @keyframes modalSlideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .claim-modal-header {
    padding: 24px 22px 12px;
  }

  .claim-modal-icon {
    width: 52px;
    height: 52px;
    font-size: 1.45rem;
  }

  .claim-modal-body {
    padding: 16px 22px 22px;
  }

  .claim-modal-footer {
    padding: 0 22px 22px;
  }

  .claim-modal-btn {
    padding: 12px;
  }
}
</style>
