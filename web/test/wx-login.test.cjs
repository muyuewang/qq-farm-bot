const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')

function setup(fetch) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/stores/wx-login.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, {
    exports, fetch, TypeError,
    localStorage: { getItem: () => '' },
    require: name => name === 'vue' ? { ref: value => ({ value }) } : { defineStore: (_, setup) => setup },
  })
  const store = exports.useWxLoginStore()
  store.uuid.value = 'original'
  store.status.value = 'confirming'
  return store
}

const response = data => ({ ok: true, json: async () => data })

test('interrupted check preserves confirmation and next poll succeeds', async () => {
  let calls = 0
  const store = setup(async () => {
    if (++calls === 1) throw new TypeError('Load failed')
    return response({ code: 0, data: { wxid: 'wx-user' } })
  })
  await store.checkLogin()
  assert.equal(store.status.value, 'confirming')
  assert.equal(store.errorMessage.value, '')
  assert.equal((await store.checkLogin()).wxid, 'wx-user')
})

test('HTTP and business failures remain terminal', async () => {
  for (const result of [{ ok: false, status: 401 }, response({ code: 500, msg: 'expired' })]) {
    const store = setup(async () => result)
    await store.checkLogin()
    assert.equal(store.status.value, 'error')
    assert.ok(store.errorMessage.value)
  }
})

test('old request cannot overwrite a reset session', async () => {
  let finish
  const store = setup(() => new Promise(resolve => { finish = resolve }))
  const pending = store.checkLogin()
  store.resetState()
  finish(response({ code: 0, data: { wxid: 'stale' } }))
  assert.equal((await pending).success, false)
  assert.equal(store.status.value, 'idle')
  assert.equal(store.wxid.value, '')
})
