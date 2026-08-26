<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAccountStore } from '@/stores/account'
import { usePetStore } from '@/stores/pet'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const petStore = usePetStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { overview, logs, capitalMode, loading, mutating } = storeToRefs(petStore)
const tab = ref<'pets' | 'logs' | 'capital'>('pets')
const feedCounts = reactive<Record<number, number>>({})
const draft = reactive({ enabled: false, dogId: 0, leadSeconds: 10 })
const deployed = computed(() => overview.value.dogs.find(dog => dog.deployed))

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days ? `${days}天${hours}小时` : `${hours}小时`
}
async function load() {
  const id = String(currentAccountId.value || '')
  if (!id)
    return
  try {
    await Promise.all([petStore.fetchOverview(id), petStore.fetchCapitalMode(id), tab.value === 'logs' ? petStore.fetchLogs(id) : Promise.resolve()])
    Object.assign(draft, capitalMode.value)
  }
  catch (e: any) { toast.error(e?.response?.data?.error || e?.message || '加载失败') }
}
async function action(run: () => Promise<any>, message: string) {
  try {
    await run()
    toast.success(message)
  }
  catch (e: any) { toast.error(e?.response?.data?.error || e?.message || '操作失败') }
}
watch([currentAccountId, tab], load)
onMounted(load)
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">
          宠物犬
        </h1><p class="text-sm text-gray-500">
          宠物守护、喂食和资本模式
        </p>
      </div>
      <button class="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50" :disabled="loading" @click="load">
        刷新
      </button>
    </div>
    <div class="mb-4 flex gap-2">
      <button v-for="item in [{ k: 'pets', n: '宠物' }, { k: 'logs', n: '守护记录' }, { k: 'capital', n: '资本模式' }]" :key="item.k" class="rounded-lg px-4 py-2" :class="tab === item.k ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800'" @click="tab = item.k as any">
        {{ item.n }}
      </button>
    </div>
    <div v-if="!currentAccountId" class="rounded-xl bg-white p-8 text-center text-gray-500 dark:bg-gray-800">
      请先选择账号
    </div>
    <template v-else-if="tab === 'pets'">
      <div class="mb-4 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm text-gray-500">
              当前守护
            </div><div class="text-xl font-bold">
              {{ deployed?.name || '暂无' }}
            </div><div class="text-sm text-gray-500">
              狗粮剩余 {{ duration(overview.foodSeconds) }}
            </div>
          </div><button v-if="deployed" class="rounded-lg bg-red-500 px-4 py-2 text-white" :disabled="mutating" @click="action(() => petStore.withdraw(String(currentAccountId)), '宠物已召回')">
            召回
          </button>
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="dog in overview.dogs" :key="dog.id" class="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
          <div class="flex gap-3">
            <img v-if="dog.image" :src="dog.image" class="h-16 w-16 object-contain"><div>
              <div class="text-lg font-bold">
                {{ dog.name }}
              </div><div class="text-sm text-gray-500">
                {{ dog.owned ? '已拥有' : '未获得' }} · Lv.{{ dog.level || 1 }}
              </div>
            </div>
          </div>
          <p class="my-3 min-h-10 text-sm text-gray-500">
            {{ dog.desc }}
          </p>
          <button class="w-full rounded-lg bg-blue-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-40" :disabled="!dog.owned || dog.deployed || mutating" @click="action(() => petStore.deploy(String(currentAccountId), dog.id), `${dog.name}已派出`)">
            {{ dog.deployed ? '守护中' : '派出' }}
          </button>
        </div>
      </div>
      <h2 class="mb-3 mt-6 text-lg font-bold">
        狗粮
      </h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="food in overview.foods" :key="food.id" class="rounded-xl bg-white p-4 dark:bg-gray-800">
          <div class="font-bold">
            {{ food.name }}
          </div><div class="text-sm text-gray-500">
            {{ food.days }} 天 · 库存 {{ food.count }}
          </div><div class="mt-3 flex gap-2">
            <input v-model.number="feedCounts[food.id]" type="number" min="1" :max="food.count" class="min-w-0 flex-1 border rounded px-2 dark:bg-gray-900"><button class="rounded bg-green-600 px-3 text-white disabled:opacity-40" :disabled="!food.count || mutating" @click="action(() => petStore.feed(String(currentAccountId), food.id, feedCounts[food.id] || 1), '喂食成功')">
              喂食
            </button>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="tab === 'logs'" class="space-y-3">
      <div v-if="!logs.length" class="rounded-xl bg-white p-8 text-center text-gray-500 dark:bg-gray-800">
        暂无守护记录
      </div><div v-for="item in logs" :key="item.id" class="rounded-xl bg-white p-4 dark:bg-gray-800">
        <div class="font-bold">
          {{ item.friendName || `好友 ${item.friendGid}` }}
        </div><div class="text-sm text-gray-500">
          {{ new Date(item.timestamp * 1000).toLocaleString() }} · {{ item.dogName }} · 守护金币 {{ item.protectedGold }}
        </div>
      </div>
    </div>
    <div v-else class="max-w-xl rounded-xl bg-white p-5 dark:bg-gray-800">
      <label class="mb-4 flex items-center gap-2"><input v-model="draft.enabled" type="checkbox">启用资本模式</label><label class="mb-3 block text-sm">成熟前派出的宠物<select v-model.number="draft.dogId" class="mt-1 w-full border rounded p-2 dark:bg-gray-900"><option :value="0">请选择</option><option v-for="dog in overview.dogs.filter(d => d.owned)" :key="dog.id" :value="dog.id">{{ dog.name }}</option></select></label><label class="mb-4 block text-sm">提前秒数（5–300）<input v-model.number="draft.leadSeconds" type="number" min="5" max="300" class="mt-1 w-full border rounded p-2 dark:bg-gray-900"></label><p class="mb-4 text-sm text-gray-500">
        作物即将成熟时自动派出所选宠物，收获完成 5 秒后自动召回。已有手动派出的宠物不会被替换。
      </p><button class="rounded-lg bg-blue-600 px-4 py-2 text-white" @click="action(() => petStore.saveCapitalMode(String(currentAccountId), draft), '设置已保存')">
        保存
      </button>
    </div>
  </div>
</template>
