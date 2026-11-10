const { test: unitTest } = require('node:test');
const assert = require('node:assert/strict');
const { test: callMiniMax } = require('./test-ai.js');

unitTest('missing key fails before any network request', async () => {
  const previous = process.env.MINIMAX_API_KEY;
  const originalFetch = global.fetch;
  let called = false;
  try {
    delete process.env.MINIMAX_API_KEY;
    global.fetch = async () => { called = true; throw new Error('Network must not run'); };
    await assert.rejects(callMiniMax(), /MINIMAX_API_KEY/);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
    if (previous === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previous;
  }
});

unitTest('configured key reaches only the existing MiniMax endpoint', async () => {
  const previous = process.env.MINIMAX_API_KEY;
  const originalFetch = global.fetch;
  try {
    process.env.MINIMAX_API_KEY = 'unit-test-credential-without-provider-prefix';
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.minimaxi.com/anthropic/v1/messages');
      assert.equal(options.headers['x-api-key'], process.env.MINIMAX_API_KEY);
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).max_tokens, 100);
      return { status: 200, text: async () => '{"content":[]}' };
    };
    await callMiniMax();
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    if (previous === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = previous;
  }
});
