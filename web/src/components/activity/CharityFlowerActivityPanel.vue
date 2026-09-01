<script setup lang="ts">
import { computed } from 'vue'
import { useActivityStore } from '@/stores/activity'

const props = defineProps<{ accountId: string; activeAccountId?: string | null }>()

const store = useActivityStore()
const activity = computed(() => store.charityFlowerActivity)
const loading = computed(() => store.charityFlowerLoading)

function fmtTime(ts?: number) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString()
}
</script>

<template>
  <div class="activity-panel charity-flower-panel">
    <div class="gradient-header charity-flower-header">
      <h3>公益小红花</h3>
      <p v-if="activity.active !== false">
        活动时间: {{ fmtTime(activity.startTime) }} ~ {{ fmtTime(activity.endTime) }}
      </p>
      <p v-else>活动未开始或已结束</p>
    </div>

    <div class="panel-body">
      <div class="charity-flower-section">
        <div class="section-header">
          <span class="section-title">爱心值</span>
          <span class="section-badge" v-if="activity.love">{{ activity.love.count || 0 }}</span>
        </div>
        <p v-if="activity.love?.canDonate" class="hint">爱心可捐赠</p>
      </div>

      <div class="charity-flower-section" v-if="activity.global">
        <div class="section-header">
          <span class="section-title">全服进度</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: Math.min(100, Math.round((activity.global.amountYuan || 0) / Math.max(1, activity.global.targetYuan || 1) * 100)) + '%' }"></div>
        </div>
        <p class="progress-text">{{ activity.global.amountYuan || 0 }} 元 / {{ activity.global.targetYuan || 0 }} 元</p>
      </div>

      <div class="charity-flower-section" v-if="activity.share">
        <div class="section-header">
          <span class="section-title">分享奖励</span>
          <span class="section-badge claimed" v-if="activity.share.claimed">已领取</span>
          <span class="section-badge claimable" v-else-if="activity.share.claimable">可领取</span>
          <span class="section-badge" v-else>未达成</span>
        </div>
        <div class="rewards-list" v-if="activity.share.rewards?.length">
          <div class="reward-item" v-for="(r, i) in activity.share.rewards" :key="i">
            <span>{{ r.name || `物品#${r.id}` }}</span>
            <span class="reward-count" v-if="r.count">×{{ r.count }}</span>
          </div>
        </div>
      </div>

      <div class="charity-flower-section" v-if="activity.personalRewards?.length">
        <div class="section-header">
          <span class="section-title">爱心档位</span>
        </div>
        <div class="tiers-list">
          <div class="tier-item" v-for="(tier, i) in activity.personalRewards" :key="i" :class="{ reached: tier.reached, claimed: tier.claimed }">
            <span class="tier-score">爱心 {{ tier.needScore }}</span>
            <span class="tier-status">
              <span v-if="tier.claimed" class="badge claimed">已领取</span>
              <span v-else-if="tier.reached" class="badge claimable">可领取</span>
              <span v-else class="badge">未达成</span>
            </span>
            <div class="rewards-list compact" v-if="tier.rewards?.length">
              <span class="reward-item" v-for="(r, j) in tier.rewards" :key="j">
                {{ r.name || `物品#${r.id}` }}<span v-if="r.count"> ×{{ r.count }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="charity-flower-section" v-if="activity.publicFund">
        <div class="section-header">
          <span class="section-title">公益金</span>
          <span class="section-badge claimed" v-if="activity.publicFund.claimed">已捐赠</span>
          <span class="section-badge claimable" v-else-if="activity.publicFund.claimable">可捐赠</span>
          <span class="section-badge" v-else>未达成</span>
        </div>
        <p v-if="!activity.publicFund.complianceAgreed" class="hint">需同意腾讯公益平台协议</p>
      </div>

      <div class="charity-flower-section" v-if="activity.finalReward">
        <div class="section-header">
          <span class="section-title">最终奖励</span>
          <span class="section-badge" v-if="activity.finalReward.threshold">爱心 {{ activity.finalReward.threshold }}</span>
          <span class="section-badge claimed" v-if="activity.finalReward.settled">已结算</span>
        </div>
        <p class="hint" v-if="activity.finalReward.settlementTime">结算时间: {{ fmtTime(activity.finalReward.settlementTime) }}</p>
      </div>

      <div v-if="loading" class="loading-hint">加载中...</div>
    </div>
  </div>
</template>

<style scoped>
.charity-flower-panel { border: 1px solid rgba(255, 105, 180, 0.3); border-radius: 12px; overflow: hidden; background: #fff; }
.charity-flower-header { background: linear-gradient(135deg, #ff6b9d, #c73866); padding: 16px; }
.charity-flower-header h3 { margin: 0 0 4px; color: #fff; font-size: 16px; }
.charity-flower-header p { margin: 0; color: rgba(255, 255, 255, 0.85); font-size: 12px; }
.panel-body { padding: 12px 16px; }
.charity-flower-section { margin-bottom: 12px; }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.section-title { font-weight: 600; font-size: 13px; }
.section-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #f0f0f0; color: #666; }
.section-badge.claimable { background: #fff3e0; color: #e65100; }
.section-badge.claimed { background: #e8f5e9; color: #2e7d32; }
.hint { margin: 4px 0 0; font-size: 12px; color: #999; }
.progress-bar-wrap { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
.progress-bar { height: 100%; background: linear-gradient(90deg, #ff6b9d, #c73866); transition: width 0.3s; border-radius: 4px; }
.progress-text { margin: 4px 0 0; font-size: 11px; color: #666; }
.tiers-list, .rewards-list { display: flex; flex-direction: column; gap: 4px; }
.tier-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; background: #fafafa; font-size: 12px; }
.tier-item.reached { background: #fff8e1; }
.tier-item.claimed { background: #e8f5e9; }
.tier-score { min-width: 70px; font-weight: 500; }
.tier-status .badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; }
.badge { background: #f0f0f0; color: #666; }
.badge.claimable { background: #fff3e0; color: #e65100; }
.badge.claimed { background: #e8f5e9; color: #2e7d32; }
.rewards-list.compact { flex-direction: row; flex-wrap: wrap; gap: 4px; }
.reward-item { font-size: 11px; color: #666; }
.reward-count { color: #999; }
.loading-hint { text-align: center; padding: 12px; color: #999; font-size: 12px; }
</style>
