<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useToastStore } from '@/stores/toast'

interface ActivityUpdateReport {
  scannedAt: number
  appId: string
  status: 'unavailable' | 'update-found' | 'up-to-date'
  source: null | { version: string, modifiedAt: number, wasmSize: number }
  candidateCount: number
  incompleteCandidates: Array<{ version: string, missing: string[] }>
  detectedActivityIds: number[]
  unknownActivityIds: number[]
  caches: Array<{ cacheListModifiedAt: number, bundles: string[] }>
  warnings: string[]
  localScanEnabled?: boolean
  sourceChanged?: boolean
  previousSourceVersion?: string | null
  analysis?: {
    candidateGroups: Array<{ date: string, ids: number[] }>
    requiresProtocolSample: boolean
    safeToAutoApply: boolean
    summary: string
  }
  online?: {
    available: boolean
    accountName?: string
    scannedAt?: number
    error?: string
    activities: Array<{
      id: number
      title: string
      type?: number
      status?: number
      startTime?: number
      endTime?: number
      visible?: boolean
      enabled?: boolean
    }>
    groups: Array<{
      id: number
      parentId?: number
      title?: string
      type?: number
      status?: number
      startTime?: number
      endTime?: number
      visible?: boolean
      enabled?: boolean
      features?: ActivityFeatures
      children?: ActivityGroup[]
      payload?: Record<string, unknown> | null
      error?: string
    } & ActivityGroup>
    unknownActivityIds: number[]
    probes?: { attempted: number, matched: number, activityGroups?: number }
  } | null
  localEvidence?: {
    enabled: boolean
    unknownActivityIds: number[]
    detectedActivityIds: number[]
    source: null | { version: string, modifiedAt: number, wasmSize: number }
    caches: Array<{ cacheListModifiedAt: number, bundles: string[] }>
    warnings: string[]
  }
}

interface ActivityFeatures {
  randomShop?: boolean
  exchangeShop?: boolean
  draw?: boolean
  starRecord?: boolean
}

interface ActivityGroup {
  id: number
  parentId?: number
  title?: string
  type?: number
  status?: number
  startTime?: number
  endTime?: number
  visible?: boolean
  enabled?: boolean
  features?: ActivityFeatures
  children?: ActivityGroup[]
  payload?: Record<string, unknown> | null
  error?: string
}

const toast = useToastStore()
const loading = ref(false)
const report = ref<ActivityUpdateReport | null>(null)
const error = ref('')
const intervalMs = ref(0)
const nextScanAt = ref(0)

const discoveredGroups = computed(() => report.value?.online?.groups || [])

const statusLabel = computed(() => {
  if (!report.value)
    return '尚未扫描'
  if (report.value.status === 'update-found')
    return '发现候选更新'
  if (report.value.status === 'up-to-date')
    return '未发现未知活动'
  return '扫描环境不可用'
})

const statusClass = computed(() => {
  if (report.value?.status === 'update-found')
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
  if (report.value?.status === 'up-to-date')
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
})

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString() : '—'
}

function activityStatus(group: ActivityGroup) {
  const now = Date.now() / 1000
  if (group.startTime && now < group.startTime)
    return '未开始'
  if (group.endTime && now > group.endTime)
    return '已结束'
  if (group.enabled === false)
    return '未启用'
  return '进行中'
}

function flattenGroup(group: ActivityGroup): ActivityGroup[] {
  return [group, ...(group.children || []).flatMap(flattenGroup)]
}

function featureSummary(group: ActivityGroup) {
  const nodes = flattenGroup(group)
  const exchange = nodes.filter(node => node.features?.exchangeShop).length
  const randomShop = nodes.filter(node => node.features?.randomShop).length
  const draw = nodes.filter(node => node.features?.draw).length
  const starRecord = nodes.filter(node => node.features?.starRecord).length
  return { nodes: nodes.length, exchange, randomShop, draw, starRecord }
}

function contentSummary(group: ActivityGroup) {
  const summary = featureSummary(group)
  const parts = [`节点 ${summary.nodes}`]
  if (summary.exchange) parts.push(`兑换 ${summary.exchange}`)
  if (summary.randomShop) parts.push(`刷新店 ${summary.randomShop}`)
  if (summary.draw) parts.push(`抽奖 ${summary.draw}`)
  if (summary.starRecord) parts.push(`图鉴 ${summary.starRecord}`)
  return parts.join(' · ')
}

function plainActivityText(value: unknown) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
}

function activityRuleSections(group: ActivityGroup) {
  return flattenGroup(group).flatMap((node) => {
    const payload = node.payload as Record<string, unknown> | null | undefined
    const tipsValue = payload && typeof payload === 'object'
      ? payload.tips
      : null
    if (!tipsValue || typeof tipsValue !== 'object')
      return []
    const tips = tipsValue as Record<string, unknown>
    const lines = Array.isArray(tips.txt)
      ? tips.txt.map(plainActivityText).filter(Boolean)
      : []
    if (!lines.length)
      return []
    return [{
      id: node.id,
      title: plainActivityText(tips.title) || '活动说明',
      uid: plainActivityText(payload?.uid),
      lines,
    }]
  })
}

function activityNodeLabel(node: ActivityGroup) {
  if (!node.parentId || node.type === 1)
    return '主活动'
  if (node.type === 15)
    return '核心玩法节点'
  if (node.type === 16)
    return '赠礼关联节点'
  return `功能节点 · 类型 ${node.type || '未知'}`
}

function activityNodeDescription(node: ActivityGroup) {
  if (node.type === 15)
    return '包含 QiXiActivity 活动标识及完整玩法规则，是鹊羽获取、筑桥和奖励适配的主要入口。'
  if (node.type === 16)
    return '当前在线接口仅返回基础元数据；可能关联香囊赠礼或情谊记录，具体字段仍需活动开放后的协议样本确认。'
  return node.parentId ? '服务端活动树中的功能子节点。' : '活动组根节点，负责活动入口和起止时间。'
}

async function scanUpdates() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/activity/update/scan')
    if (!data.ok)
      throw new Error(data.error || '活动更新扫描失败')
    report.value = data.report
    intervalMs.value = Number(data.intervalMs) || intervalMs.value
    nextScanAt.value = Number(data.nextScanAt) || nextScanAt.value
    if (data.report?.status === 'update-found')
      toast.warning(`发现 ${data.report.unknownActivityIds.length} 个候选活动 ID`)
    else
      toast.success('活动更新扫描完成')
  }
  catch (err: any) {
    error.value = err?.response?.data?.error || err.message || '活动更新扫描失败'
  }
  finally {
    loading.value = false
  }
}

async function loadUpdateStatus() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get('/api/activity/update/status')
    if (!data.ok)
      throw new Error(data.error || '读取活动更新状态失败')
    report.value = data.report || null
    intervalMs.value = Number(data.intervalMs) || 0
    nextScanAt.value = Number(data.nextScanAt) || 0
  }
  catch (err: any) {
    error.value = err?.response?.data?.error || err.message || '读取活动更新状态失败'
  }
  finally {
    loading.value = false
  }
}

onMounted(loadUpdateStatus)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="font-semibold text-gray-900 dark:text-white">
          活动自动更新
        </h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          服务端会定时读取在线 ActivityService.List，发现未知活动后再只读调用 GetGroup。不会执行活动操作。
        </p>
      </div>
      <BaseButton variant="primary" :loading="loading" @click="scanUpdates">
        <span class="i-carbon-search mr-2" />
        立即重新分析
      </BaseButton>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
      {{ error }}
    </div>

    <template v-if="report">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">扫描状态</div>
          <span class="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium" :class="statusClass">{{ statusLabel }}</span>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">发现方式</div>
          <div class="mt-2 break-all text-sm font-medium text-gray-900 dark:text-white">在线 List + GetGroup</div>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">在线读取时间</div>
          <div class="mt-2 text-sm text-gray-900 dark:text-white">{{ formatTime(report.online?.scannedAt) }}</div>
          <div class="text-xs text-gray-500">{{ report.online?.accountName || '等待在线账号' }}</div>
        </div>
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="text-xs text-gray-500">在线活动树</div>
          <div class="mt-2 text-sm font-medium text-gray-900 dark:text-white">{{ report.online?.activities.length || 0 }} 个服务端节点</div>
          <div class="text-xs text-gray-500">仅统计 ActivityService 在线响应</div>
        </div>
      </div>

      <div class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ report.analysis?.summary || '自动分析已完成' }}</span>
          <span class="text-xs opacity-75">
            每 {{ Math.round(intervalMs / 60000) || 30 }} 分钟自动分析 · 下次 {{ formatTime(nextScanAt) }}
          </span>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">候选新活动 ID</h4>
          <div v-if="report.unknownActivityIds.length" class="mt-3 flex flex-wrap gap-2">
            <code v-for="id in report.unknownActivityIds" :key="id" class="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{{ id }}</code>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">没有发现当前代码尚未登记的活动 ID。</p>
          <p class="mt-3 text-xs text-gray-400">共识别 {{ report.detectedActivityIds.length }} 个日期型活动 ID；候选项仍需协议样本确认。</p>
          <div v-if="report.analysis?.candidateGroups.length" class="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
            <div v-for="group in report.analysis.candidateGroups" :key="group.date" class="text-xs text-gray-500">
              {{ group.date }}：{{ group.ids.join('、') }}
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">扫描提示</h4>
          <ul v-if="report.warnings.length" class="mt-3 space-y-2 text-sm text-amber-700 dark:text-amber-300">
            <li v-for="warning in report.warnings" :key="warning" class="flex gap-2">
              <span class="i-carbon-warning-alt mt-0.5 shrink-0" />{{ warning }}
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-gray-500">源码目录与资源缓存检查正常。</p>
          <div class="mt-3 text-xs text-gray-400">扫描时间：{{ formatTime(report.scannedAt) }}</div>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">在线 ActivityService 分析</h4>
          <span
            class="rounded-full px-2.5 py-1 text-xs"
            :class="report.online?.available
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'"
          >
            {{ report.online?.available ? `已通过 ${report.online.accountName || '在线账号'} 读取` : '等待在线账号' }}
          </span>
        </div>
        <p v-if="!report.online?.available" class="mt-3 text-sm text-gray-500">
          {{ report.online?.error || '启动并连接任意账号后，定时器会自动读取服务端活动列表。' }}
        </p>
        <template v-else>
          <div class="mt-3 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">服务端活动</div>
              <div class="mt-1 font-medium">{{ report.online.activities.length }} 个</div>
            </div>
            <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">新增候选</div>
              <div class="mt-1 font-medium">{{ report.online.unknownActivityIds.length }} 个</div>
            </div>
            <div class="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">GetGroup 探测</div>
              <div class="mt-1 font-medium">{{ report.online.probes?.activityGroups || 0 }} 组 · {{ report.online.probes?.matched || 0 }} 节点</div>
            </div>
          </div>
          <div v-if="report.online.groups.length" class="mt-3 space-y-2">
            <div v-for="group in report.online.groups" :key="group.id" class="rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
              <div class="flex flex-wrap justify-between gap-2">
                <span class="font-medium text-gray-900 dark:text-white">{{ group.title || `活动 ${group.id}` }}</span>
                <code class="text-xs text-gray-500">{{ group.id }}</code>
              </div>
              <div class="mt-1 text-xs text-gray-500">
                {{ group.error || `${formatTime(group.startTime && group.startTime * 1000)} — ${formatTime(group.endTime && group.endTime * 1000)}` }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <div
        v-if="discoveredGroups.length"
        class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <h4 class="font-semibold">新活动待适配</h4>
        <p class="mt-2 text-sm">
          已自动发现 {{ discoveredGroups.length }} 个活动入口。当前仅保存只读结构快照，等待确认兑换、抽奖或任务规则。
        </p>
        <div class="mt-3 space-y-2">
          <div v-for="group in discoveredGroups" :key="group.id" class="rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-900/40">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <strong>{{ group.title || `活动 ${group.id}` }}</strong>
              <code class="text-xs">ID {{ group.id }}</code>
            </div>
            <div class="mt-1 text-xs opacity-80">来源 List + GetGroup · {{ contentSummary(group) }}</div>
          </div>
        </div>
      </div>

      <div v-if="discoveredGroups.length" class="space-y-4">
        <article v-for="group in discoveredGroups" :key="`detail-${group.id}`" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="text-lg font-semibold text-gray-900 dark:text-white">{{ group.title || `活动 ${group.id}` }}</h4>
              <code class="mt-1 block text-sm text-gray-500">ID {{ group.id }}</code>
            </div>
            <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-900/30 dark:text-teal-200">
              {{ activityStatus(group) }}
            </span>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">开始时间</div>
              <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ formatTime(group.startTime && group.startTime * 1000) }}</div>
            </div>
            <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">结束时间</div>
              <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ formatTime(group.endTime && group.endTime * 1000) }}</div>
            </div>
            <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
              <div class="text-xs text-gray-500">内容摘要</div>
              <div class="mt-1 font-medium text-gray-900 dark:text-white">{{ contentSummary(group) }}</div>
            </div>
          </div>
          <div v-if="group.children?.length" class="mt-4">
            <div class="text-sm font-semibold text-gray-900 dark:text-white">活动节点 {{ group.children.length }}</div>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <div v-for="child in group.children" :key="child.id" class="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
                <div class="flex justify-between gap-2 text-sm">
                  <span class="font-medium">{{ child.title || `节点 ${child.id}` }}</span>
                  <code class="text-xs text-gray-500">{{ child.id }}</code>
                </div>
                <div class="mt-1 text-xs text-gray-500">{{ activityNodeLabel(child) }} · {{ contentSummary(child) }}</div>
                <p class="mt-2 text-xs leading-5 text-gray-500">{{ activityNodeDescription(child) }}</p>
              </div>
            </div>
          </div>
          <div v-if="activityRuleSections(group).length" class="mt-5 border-t border-gray-100 pt-4 dark:border-gray-700">
            <h5 class="font-semibold text-gray-900 dark:text-white">玩法规则与完整活动说明</h5>
            <section
              v-for="section in activityRuleSections(group)"
              :key="section.id"
              class="mt-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h6 class="font-medium text-gray-900 dark:text-white">{{ section.title }}</h6>
                <span class="text-xs text-gray-500">
                  节点 {{ section.id }}<template v-if="section.uid"> · {{ section.uid }}</template>
                </span>
              </div>
              <div class="mt-3 space-y-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                <p v-for="(line, index) in section.lines" :key="`${section.id}-${index}`" class="whitespace-pre-line">
                  {{ line }}
                </p>
              </div>
            </section>
          </div>
        </article>
      </div>

    </template>
  </section>
</template>
