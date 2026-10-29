import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRecognizedModels } from './recognized-models'

test('model output rejects malformed rows while retaining valid neighbors', () => {
  assert.deepEqual(parseRecognizedModels(null), [])
  assert.deepEqual(parseRecognizedModels({ models: {} }), [])
  const rows = parseRecognizedModels({ models: [null, 12, [], { modelCode: 'A', issues: ['timeout', 7] }] })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].modelCode, 'A')
  assert.deepEqual(rows[0].issues, ['timeout'])
})

test('model aliases and numeric metrics survive normalization', () => {
  const [row] = parseRecognizedModels([{ code: 'B', display_name: 'Beta', elapsed: 0, tool_calls: '12', hardMetrics: { success: false, latency: 0 } }])
  assert.equal(row.displayName, 'Beta')
  assert.equal(row.duration, '0')
  assert.equal(row.toolCalls, 12)
  assert.deepEqual(row.metrics, { success: false, latency: 0 })
})

test('model output does not admit non-finite counts or arrays as metric records', () => {
  const [row] = parseRecognizedModels([{ toolCalls: Infinity, metrics: [], custom: true, nested: { x: 1 } }], '')
  assert.equal(row.modelCode, '')
  assert.equal(row.toolCalls, undefined)
  assert.deepEqual(row.metrics, { custom: true })
})
