<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useStatusStore } from '@/stores/status'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { lands, summary, loading, dogSkillGiftPendingCount, dogSkillGiftLoading, dogSkillGiftError } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, loading: statusLoading, realtimeConnected, currentStatusReady } = storeToRefs(statusStore)

const operating = ref(false)
const farmLoaded = ref(false)
const confirmVisible = ref(false)
const selectedLandId = ref<number | null>(null)
const farmCanvas = ref<HTMLCanvasElement | null>(null)
const farmViewport = ref<HTMLElement | null>(null)
const farmStageWidth = ref<number | null>(null)
const FARM_CANVAS_WIDTH = 1200
const FARM_CANVAS_HEIGHT = 650
const SINGLE_LAND_WIDTH = 210
const SINGLE_LAND_HEIGHT = 125
const LAND_STEP_X = 115
const LAND_STEP_Y = 59
const MERGED_LAND_WIDTH = SINGLE_LAND_WIDTH + LAND_STEP_X * 2
const MERGED_LAND_HEIGHT = SINGLE_LAND_HEIGHT + LAND_STEP_Y * 2
const FIELD_BACKGROUND_SCALE = 1.16
const FIELD_BACKGROUND_OFFSET_X = 10
const FIELD_BACKGROUND_OFFSET_Y = 8
const imageCache = new Map<string, HTMLImageElement>()
type PendingLandAction = 'fertilize' | 'remove'

const confirmConfig = ref({
  title: '',
  message: '',
  opType: '',
  bulkAction: '' as 'removeAll' | '',
  landAction: '' as PendingLandAction | '',
  land: null as any | null,
  type: 'primary' as 'primary' | 'danger',
})

async function executeOperate() {
  if (!currentAccountId.value)
    return

  const config = confirmConfig.value
  if (!config.opType && !config.bulkAction && (!config.landAction || !config.land))
    return

  confirmVisible.value = false
  operating.value = true
  try {
    if (config.opType) {
      await farmStore.operate(currentAccountId.value, config.opType)
    }
    else if (config.bulkAction === 'removeAll') {
      await farmStore.removeAllPlants(currentAccountId.value)
    }
    else if (config.landAction === 'fertilize') {
      await farmStore.fertilizeLand(currentAccountId.value, Number(config.land.id))
    }
    else if (config.landAction === 'remove') {
      await farmStore.removePlant(currentAccountId.value, Number(config.land.id))
    }
  }
  finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return

  const confirmMap: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要执行一键务农吗？将自动浇水、除草、除虫。',
    plant: '确定要一键种植吗？(根据策略配置)',
    upgrade: '确定要升级所有可升级的土地吗？(消耗金币)',
    all: '确定要执行一键全收吗？将依次执行收获、务农、种植与升级。',
  }

  confirmConfig.value = {
    title: '确认操作',
    message: confirmMap[opType] || '确定执行此操作吗？',
    opType,
    bulkAction: '',
    landAction: '',
    land: null,
    type: 'primary',
  }
  confirmVisible.value = true
}

function handleRemoveAllPlants() {
  if (!currentAccountId.value)
    return

  confirmConfig.value = {
    title: '确认一键铲除',
    message: '确定要铲除全部已种植作物吗？此操作不可恢复。',
    opType: '',
    bulkAction: 'removeAll',
    landAction: '',
    land: null,
    type: 'danger',
  }
  confirmVisible.value = true
}

function getLandActionName(land: any) {
  return `#${land?.id ?? '-'} ${land?.plantName || '该作物'}`
}

function handleLandFertilize(land: any) {
  if (!currentAccountId.value)
    return

  confirmConfig.value = {
    title: '确认催熟',
    message: `确定要对 ${getLandActionName(land)} 使用有机肥料催熟吗？`,
    opType: '',
    bulkAction: '',
    landAction: 'fertilize',
    land,
    type: 'primary',
  }
  confirmVisible.value = true
}

function handleLandRemove(land: any) {
  if (!currentAccountId.value)
    return

  confirmConfig.value = {
    title: '确认铲除',
    message: `确定要铲除 ${getLandActionName(land)} 吗？此操作不可恢复。`,
    opType: '',
    bulkAction: '',
    landAction: 'remove',
    land,
    type: 'danger',
  }
  confirmVisible.value = true
}

const operations = [
  { type: 'harvest', label: '收获', icon: 'i-carbon-wheat', color: 'bg-blue-600 hover:bg-blue-700' },
  { type: 'clear', label: '一键务农', icon: 'i-carbon-clean', color: 'bg-teal-600 hover:bg-teal-700' },
  { type: 'plant', label: '种植', icon: 'i-carbon-sprout', color: 'bg-green-600 hover:bg-green-700' },
  { type: 'upgrade', label: '升级土地', icon: 'i-carbon-upgrade', color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'all', label: '一键全收', icon: 'i-carbon-flash', color: 'bg-orange-600 hover:bg-orange-700' },
]

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    try {
      if (!realtimeConnected.value) {
        await statusStore.fetchStatus(currentAccountId.value)
      }

      if (acc.running) {
        await Promise.all([
          farmStore.fetchLands(currentAccountId.value),
          farmStore.fetchDogSkillGiftStatus(currentAccountId.value),
        ])
      }
    }
    finally {
      farmLoaded.value = true
    }
  }
}

async function claimDogSkillGifts() {
  if (currentAccountId.value)
    await farmStore.claimDogSkillGifts(currentAccountId.value)
}

const showInitialLoading = computed(() =>
  !farmLoaded.value && (loading.value || statusLoading.value),
)

function selectLand(land: any) {
  const id = Number(land?.id) || null
  selectedLandId.value = selectedLandId.value === id ? null : id
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (selectedLandId.value === null)
    return
  const target = event.target
  if (target instanceof Element && target.closest('.land-card, .land-bubble'))
    return
  selectedLandId.value = null
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    selectedLandId.value = null
}

function getLandAnchorId(land: any) {
  const occupiedIds = Array.isArray(land?.occupiedLandIds)
    ? land.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  return occupiedIds.length > 1 ? Math.min(...occupiedIds) : Number(land?.id) || 0
}

function getCanvasPosition(land: any) {
  const occupiedIds = Array.isArray(land?.occupiedLandIds)
    ? land.occupiedLandIds.map(Number).filter((id: number) => id > 0)
    : []
  const ids = occupiedIds.length > 1 ? occupiedIds : [getLandAnchorId(land)]
  const points = ids.map((id: number) => {
    const column = (id - 1) % 4
    const row = Math.floor((id - 1) / 4)
    return { x: 700 + column * LAND_STEP_X - row * LAND_STEP_X, y: 86 + (column + row) * LAND_STEP_Y }
  })
  return {
    x: points.reduce((sum: number, point: { x: number }) => sum + point.x, 0) / points.length,
    y: points.reduce((sum: number, point: { y: number }) => sum + point.y, 0) / points.length,
  }
}

const displayLands = computed(() =>
  (Array.isArray(lands.value) ? lands.value : []).filter(land => !land?.occupiedByMaster),
)

const farmStageStyle = computed(() => farmStageWidth.value
  ? { width: `${farmStageWidth.value}px` }
  : undefined)

function updateFarmStageSize() {
  const viewport = farmViewport.value
  if (!viewport || window.innerWidth < 640) {
    farmStageWidth.value = null
    return
  }
  const documentTop = viewport.getBoundingClientRect().top + window.scrollY
  const availableHeight = Math.max(240, window.innerHeight - documentTop - 72)
  const availableWidth = viewport.parentElement?.clientWidth || FARM_CANVAS_WIDTH
  // 保持 1200×650 比例并限制在当前一屏内；外层 viewport 同步收窄，不再露出第二层背景。
  farmStageWidth.value = Math.min(availableWidth, FARM_CANVAS_WIDTH, availableHeight * FARM_CANVAS_WIDTH / FARM_CANVAS_HEIGHT)
}

function getLandTextureUrl(land: any) {
  const level = Math.min(5, Math.max(1, Number(land?.level) || 1))
  if (Number(land?.plantSize) > 1)
    return `/game-config/land_images/land_valid${level}_2x2.png`
  if (land?.status === 'locked')
    return '/game-config/land_images/land_locked.png'
  return `/game-config/land_images/${land?.needWater ? `land_dry${level}` : `land_valid${level}`}.png`
}

function shouldRotateLandTexture(land: any) {
  const level = Number(land?.level) || 1
  return level === 5
}

function loadCanvasImage(src: string) {
  const cached = imageCache.get(src)
  if (cached)
    return Promise.resolve(cached)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      imageCache.set(src, image)
      resolve(image)
    }
    image.onerror = reject
    image.src = src
  })
}

async function drawFarmCanvas() {
  await nextTick()
  const context = farmCanvas.value?.getContext('2d')
  if (!context)
    return
  context.clearRect(0, 0, FARM_CANVAS_WIDTH, FARM_CANVAS_HEIGHT)
  const field = await loadCanvasImage('/game-config/scene_images/farm-field-base.png').catch(() => null)
  if (field) {
    const fieldWidth = FARM_CANVAS_WIDTH * FIELD_BACKGROUND_SCALE
    const fieldHeight = FARM_CANVAS_HEIGHT * FIELD_BACKGROUND_SCALE
    context.drawImage(
      field,
      (FARM_CANVAS_WIDTH - fieldWidth) / 2 + FIELD_BACKGROUND_OFFSET_X,
      (FARM_CANVAS_HEIGHT - fieldHeight) / 2 + FIELD_BACKGROUND_OFFSET_Y,
      fieldWidth,
      fieldHeight,
    )
  }

  const visibleLands = displayLands.value
    .sort((a, b) => getCanvasPosition(a).y - getCanvasPosition(b).y)
  const textures = await Promise.all(visibleLands.map(land => loadCanvasImage(getLandTextureUrl(land)).catch(() => null)))
  visibleLands.forEach((land, index) => {
    if (selectedLandId.value === Number(land?.id))
      return
    const texture = textures[index]
    if (!texture)
      return
    const { x, y } = getCanvasPosition(land)
    const large = Number(land?.plantSize) > 1
    const width = large ? MERGED_LAND_WIDTH : SINGLE_LAND_WIDTH
    const height = large ? MERGED_LAND_HEIGHT : SINGLE_LAND_HEIGHT
    if (shouldRotateLandTexture(land)) {
      context.save()
      context.translate(x, y)
      context.rotate(Math.PI)
      context.drawImage(texture, -width / 2, -height / 2, width, height)
      context.restore()
    }
    else {
      context.drawImage(texture, x - width / 2, y - height / 2, width, height)
    }
  })
}

function getIsometricStyle(land: any) {
  const { x, y } = getCanvasPosition(land)
  const size = Math.max(1, Number(land?.plantSize) || 1)
  const width = size > 1 ? MERGED_LAND_WIDTH : SINGLE_LAND_WIDTH
  const height = size > 1 ? MERGED_LAND_HEIGHT : SINGLE_LAND_HEIGHT

  return {
    left: `${x / FARM_CANVAS_WIDTH * 100}%`,
    top: `${(y - height / 2) / FARM_CANVAS_HEIGHT * 100}%`,
    width: `${width / FARM_CANVAS_WIDTH * 100}%`,
    height: `${height / FARM_CANVAS_HEIGHT * 100}%`,
    zIndex: Math.round(y) + size,
  }
}

watch(lands, () => {
  drawFarmCanvas()
  nextTick(updateFarmStageSize)
}, { deep: true, flush: 'post' })

watch(selectedLandId, () => {
  drawFarmCanvas()
})

watch(currentAccountId, (newId, oldId) => {
  if (oldId !== undefined && newId !== oldId) {
    farmLoaded.value = false
    farmStore.clearFarmData()
    statusStore.clearAccountScopedData()
    selectedLandId.value = null
  }
  refresh()
}, { immediate: true })

watch(() => currentAccount.value?.running, () => {
  refresh()
})

watch(confirmVisible, (visible) => {
  if (visible)
    selectedLandId.value = null
})

const { pause, resume } = useIntervalFn(() => {
  if (lands.value) {
    lands.value = lands.value.map((l: any) =>
      l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
    )
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refresh, 60000)

resume()
resumeRefresh()
onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('resize', updateFarmStageSize)
  updateFarmStageSize()
  drawFarmCanvas()
})
onUnmounted(() => {
  pause()
  pauseRefresh()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('resize', updateFarmStageSize)
})
</script>

<template>
  <div
    class="space-y-4"
    :class="{
      'farm-panel-modal-open': confirmVisible,
      'farm-has-selected-land': selectedLandId !== null,
    }"
  >
    <div class="rounded-lg bg-white shadow dark:bg-gray-800">
      <!-- Header with Title and Actions -->
      <div class="flex flex-col items-stretch justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center dark:border-gray-700">
        <h3 class="flex items-center gap-2 text-lg font-bold">
          <div class="i-carbon-grid text-xl" />
          土地详情
        </h3>
        <div class="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button
            v-for="op in operations"
            :key="op.type"
            class="flex items-center justify-center gap-1.5 rounded px-3 py-2 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            :class="op.color"
            :disabled="operating"
            @click="handleOperate(op.type)"
          >
            <div :class="op.icon" />
            <span class="hidden sm:inline">{{ op.label }}</span>
            <span class="sm:hidden">{{ op.type === 'clear' ? '务农' : op.label.replace('一键', '') }}</span>
          </button>
          <button
            class="flex items-center justify-center gap-1.5 rounded bg-red-600 px-3 py-2 text-sm text-white transition disabled:cursor-not-allowed hover:bg-red-700 disabled:opacity-50"
            :disabled="operating"
            @click="handleRemoveAllPlants"
          >
            <div class="i-carbon-trash-can" />
            一键铲除
          </button>
        </div>
      </div>

      <div
        v-if="dogSkillGiftPendingCount > 0"
        class="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <div class="i-carbon-gift text-xl" />
        <div class="min-w-0 flex-1">
          待拾取同气连枝礼包 ×{{ dogSkillGiftPendingCount }}
        </div>
        <button
          class="rounded bg-amber-600 px-3 py-1.5 text-white disabled:opacity-50 hover:bg-amber-700"
          :disabled="dogSkillGiftLoading"
          @click="claimDogSkillGifts"
        >
          {{ dogSkillGiftLoading ? '拾取中…' : '拾取' }}
        </button>
      </div>
      <div v-else-if="dogSkillGiftError" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        {{ dogSkillGiftError }}
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-4 gap-2 border-b border-gray-100 bg-gray-50 p-3 text-xs sm:flex sm:flex-wrap sm:gap-4 dark:border-gray-700 dark:bg-gray-900/50 sm:p-4 sm:text-sm">
        <div class="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
          <div class="i-carbon-clean" />
          <span class="font-medium">可收: {{ summary?.harvestable || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <div class="i-carbon-sprout" />
          <span class="font-medium">生长: {{ summary?.growing || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <div class="i-carbon-checkbox" />
          <span class="font-medium">空闲: {{ summary?.empty || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <div class="i-carbon-warning" />
          <span class="font-medium">枯萎: {{ summary?.dead || 0 }}</span>
        </div>
      </div>

      <!-- Grid -->
      <div class="p-2 sm:p-4">
        <div v-if="showInitialLoading" class="flex justify-center py-12">
          <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
        </div>

        <div v-else-if="!currentAccountId" class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white p-12 text-center text-gray-500 shadow dark:bg-gray-800">
          <div class="i-carbon-user-offline text-4xl text-gray-400" />
          <div>
            <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
              未登录账号
            </div>
            <div class="mt-1 text-sm text-gray-400">
              请先添加农场账号
            </div>
          </div>
        </div>

        <div v-else-if="!lands || lands.length === 0" class="flex justify-center py-12 text-gray-500">
          暂无土地数据
        </div>

        <div v-else-if="currentStatusReady && !status?.connection?.connected" class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white p-12 text-center text-gray-500 shadow dark:bg-gray-800">
          <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
          <div>
            <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
              账号未登录
            </div>
            <div class="mt-1 text-sm text-gray-400">
              请先运行账号或检查网络连接
            </div>
          </div>
        </div>

        <div v-else>
          <div ref="farmViewport" class="farm-land-viewport rounded-2xl" :style="farmStageStyle">
            <div class="iso-farm-stage">
              <canvas
                ref="farmCanvas"
                class="farm-scene-canvas"
                :width="FARM_CANVAS_WIDTH"
                :height="FARM_CANVAS_HEIGHT"
                aria-hidden="true"
              />
              <LandCard
                v-for="land in displayLands"
                :key="land.id"
                :land="land"
                isometric
                :style="getIsometricStyle(land)"
                :selected="selectedLandId === Number(land.id)"
                :selection-active="selectedLandId !== null"
                :show-actions="false"
                @select="selectLand"
                @fertilize="handleLandFertilize"
                @remove="handleLandRemove"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      :type="confirmConfig.type"
      @confirm="executeOperate"
      @close="confirmVisible = false"
      @cancel="confirmVisible = false"
    />
  </div>
</template>

<style scoped>
.farm-land-viewport {
  container-type: inline-size;
  overflow: hidden;
  margin-inline: auto;
  background: #a8d85d;
  box-shadow: inset 0 0 0 1px rgb(53 101 37 / 0.18);
}

.farm-panel-modal-open :deep(.land-bubble) {
  display: none !important;
}

.farm-panel-modal-open :deep(.land-card) {
  z-index: 0 !important;
}

.farm-has-selected-land :deep(.land-card:not(.land-card-selected) .land-bubble) {
  display: none !important;
}

.iso-farm-stage {
  position: relative;
  isolation: isolate;
  width: 100%;
  aspect-ratio: 1200 / 650;
  margin: 0 auto;
}

.farm-scene-canvas {
  position: absolute;
  z-index: 0;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.iso-farm-stage :deep(.land-card) {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.iso-farm-stage :deep(.land-card-image) {
  position: absolute;
  left: 50%;
  top: 35%;
  width: 42%;
  height: 68%;
  margin: 0;
  transform: translate(-50%, -50%);
}

/* 通用种子贴图的内容锚点在图片中央，单格种子应落在土地几何中心。 */
.iso-farm-stage :deep(.land-card-image-seed-single) {
  top: 50%;
}

/* SpriteFrame 已裁掉透明画布；保持它在原 150px 画布中的官方视觉尺寸。 */
.iso-farm-stage :deep(.land-card-image-seed img) {
  width: 23%;
  max-width: none;
}

.iso-farm-stage :deep(.land-isometric-size-2 .land-card-image) {
  left: 50%;
  /* 2x2 作物通常是高图，客户端按根部/花盆底部落在四格土地中心，而不是按图片中心。 */
  top: auto;
  bottom: 42%;
  width: 56%;
  /* 顶排四格土地距离场景上沿较近，必须给高株成熟图保留完整显示空间。 */
  height: 54%;
  align-items: flex-end;
  transform: translateX(-50%);
}

.iso-farm-stage :deep(.land-isometric-size-2 .land-card-image-seed) {
  top: 50%;
  bottom: auto;
  align-items: center;
  transform: translate(-50%, -50%);
}

.iso-farm-stage :deep(.land-isometric-size-2 .land-card-image-seed img) {
  width: 13%;
}

.iso-farm-stage :deep(.land-card-name),
.iso-farm-stage :deep(.land-card-meta),
.iso-farm-stage :deep(.land-card-season) {
  display: none;
}

.iso-farm-stage :deep(.land-card-flags),
.iso-farm-stage :deep(.land-mutant-effects) {
  display: none;
}

.iso-farm-stage :deep(.land-ground-single),
.iso-farm-stage :deep(.land-ground-merged) {
  display: none;
}

.iso-farm-stage :deep(.land-card-selected .land-ground-single),
.iso-farm-stage :deep(.land-card-selected .land-ground-merged) {
  display: block;
  left: 50%;
  top: 50%;
  width: 100%;
  height: 100%;
  max-height: none;
  object-fit: fill;
  opacity: 1;
  transform: translate(-50%, -50%);
  filter: saturate(1.08) brightness(1.06) drop-shadow(0 10px 7px rgb(62 46 27 / 0.35));
}

.iso-farm-stage :deep(.land-card-selected .land-ground-layer) {
  inset: 0;
}

.iso-farm-stage :deep(.land-isometric-size-2 .land-ground-merged) {
  width: 100%;
  max-height: none;
}

.iso-farm-stage :deep(.land-isometric-size-2 .land-ground-layer) {
  inset: 0;
}

@media (max-width: 639px) {
  .iso-farm-stage {
    width: 100%;
  }

  .iso-farm-stage :deep(.land-card) {
    padding: 1px;
  }

  .iso-farm-stage :deep(.land-card-image) {
    width: 42%;
    height: 68%;
    margin: 0;
  }

  .iso-farm-stage :deep(.land-isometric-size-2 .land-card-image) {
    width: 56%;
    height: 54%;
    margin: 0;
  }

  .iso-farm-stage :deep(.land-card-id) {
    font-size: 8px;
  }
}
</style>
