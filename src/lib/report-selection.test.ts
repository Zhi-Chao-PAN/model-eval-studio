import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectReportForView } from './report-selection'

const latest = { id: 'v2', content: 'latest' }
const history = { id: 'v1', content: 'history' }

test('latest report is immediately available before its metadata request completes', () => {
  assert.equal(selectReportForView('v2', latest, undefined), latest)
})

test('pending or failed history cannot fall back to another report revision', () => {
  assert.equal(selectReportForView('v1', latest, undefined), null)
  assert.equal(selectReportForView('v1', latest, { id: 'other-model', content: 'stale' }), null)
})

test('historical content follows the selected ID independently of panel visibility', () => {
  assert.equal(selectReportForView('v1', latest, history), history)
  assert.equal(selectReportForView('v2', latest, history), latest)
})
