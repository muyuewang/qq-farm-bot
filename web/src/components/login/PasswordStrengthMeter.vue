<script setup lang="ts">
import type { PasswordStrength } from '@/composables/usePasswordStrength'

withDefaults(defineProps<{
  strength: PasswordStrength
  compact?: boolean
}>(), {
  compact: false,
})
</script>

<template>
  <div class="password-strength" :class="{ compact }">
    <div class="strength-bar">
      <div
        class="strength-fill"
        :style="{ width: `${Math.min(strength.score * 12.5, 100)}%`, backgroundColor: strength.color }"
      />
    </div>
    <span class="strength-text" :style="{ color: strength.color }">
      {{ strength.level }}
    </span>
  </div>
</template>

<style scoped>
.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: -4px;
}

.password-strength.compact {
  margin-top: 6px;
}

.strength-bar {
  flex: 1;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.password-strength.compact .strength-bar {
  height: 4px;
  border-radius: 2px;
}

.strength-fill {
  height: 100%;
  transition:
    width 0.3s ease,
    background-color 0.3s ease;
}

.strength-text {
  font-size: 0.75rem;
  font-weight: 600;
}

.password-strength.compact .strength-text {
  font-weight: 500;
  min-width: 50px;
}

@media (prefers-color-scheme: dark) {
  .strength-bar {
    background: #2a4a3a;
  }
}
</style>
