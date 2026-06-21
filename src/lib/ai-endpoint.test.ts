import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAiBaseUrl, openAiChatCompletionsUrl, parseAiMaxTokens, parseAiProvider } from './ai-endpoint'

test('normalizes safe AI endpoint paths', () => {
  assert.equal(normalizeAiBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1')
  assert.equal(openAiChatCompletionsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions')
  assert.equal(openAiChatCompletionsUrl('https://api.example.com'), 'https://api.example.com/v1/chat/completions')
})

test('rejects credentials and invalid provider settings', () => {
  assert.throws(() => normalizeAiBaseUrl('https://user:pass@example.com/v1'), /用户名或密码/)
  assert.throws(() => parseAiProvider('UNKNOWN'), /不支持/)
  assert.throws(() => parseAiMaxTokens(10), /256/)
  assert.equal(parseAiMaxTokens(8192), 8192)
})
