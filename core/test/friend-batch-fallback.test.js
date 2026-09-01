const assert = require('node:assert/strict');
const test = require('node:test');

const { runBatchWithFallback } = require('../src/services/friend-visit');

test('unknown batch failures do not fan out into single requests', async () => {
  let singles = 0;
  await assert.rejects(
    runBatchWithFallback([1, 2, 3], async () => { throw new Error('请求超时'); }, async () => { singles++; }),
    /请求超时/
  );
  assert.equal(singles, 0);
});

test('explicit unsupported-batch failures use a bounded fallback', async () => {
  let singles = 0;
  const count = await runBatchWithFallback(
    [1, 2, 3, 4, 5],
    async () => { const error = new Error('unsupported batch'); error.code = 'BATCH_UNSUPPORTED'; throw error; },
    async () => { singles++; },
    { maxFallbacks: 2 }
  );
  assert.equal(count, 2);
  assert.equal(singles, 2);
});
