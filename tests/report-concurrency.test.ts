import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'

let db: typeof import('../src/lib/prisma')['prisma'] | undefined
let reports: typeof import('../src/lib/report-versioning')
let userId: string | undefined
let taskId: string

before(async () => {
  const value = process.env.TEST_DATABASE_URL
  if (!value) throw new Error('TEST_DATABASE_URL must point to an isolated local modeleval_test_* database')
  const url = new URL(value)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^\/modeleval_test_[a-z0-9_]+$/.test(url.pathname)) {
    throw new Error('Refusing to run database tests outside an isolated local modeleval_test_* database')
  }
  process.env.DATABASE_URL = value
  process.env.DIRECT_URL = value
  db = (await import('../src/lib/prisma')).prisma
  reports = await import('../src/lib/report-versioning')
  const user = await db.user.create({
    data: { username: `report-test-${randomUUID()}`, passwordHash: 'isolated-test-fixture' },
  })
  userId = user.id
  taskId = (await db.task.create({ data: { userId, title: 'Concurrent report fixture' } })).id
})

after(async () => {
  try {
    if (db && userId) await db.user.delete({ where: { id: userId } })
  } finally {
    await db?.$disconnect()
  }
})

async function model() {
  assert.ok(db)
  return db.taskModel.create({ data: { taskId, modelCode: randomUUID() } })
}

const content = {
  productFeedback: 'fixture', overallScore: 5, overallComment: 'overall',
  efficiencyScore: 5, efficiencyComment: 'efficiency',
  qualityScore: 5, qualityComment: 'quality',
}

test('concurrent first-time manual and AI writes persist distinct consecutive versions', async () => {
  const target = await model()
  const saved = await Promise.all(Array.from({ length: 12 }, (_, index) => reports.createVersionedReport({
    ...content, taskModelId: target.id,
    source: index % 2 ? 'MANUAL' : 'AI_GENERATED',
    productFeedback: `submission-${index}`,
  })))
  assert.deepEqual(saved.map(r => r.version).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1))
  assert.equal(new Set(saved.map(r => r.id)).size, 12)
  assert.equal(new Set(saved.map(r => r.productFeedback)).size, 12)
  assert.equal(await db!.modelReport.count({ where: { taskModelId: target.id } }), 12)
})

test('concurrent AI adjustment and manual revisions preserve ancestry and source', async () => {
  const target = await model()
  const parent = await reports.createVersionedReport({
    ...content, taskModelId: target.id, source: 'AI_GENERATED',
    generationSnapshot: '{"fixture":true}',
  })
  const revised = await Promise.all(Array.from({ length: 8 }, (_, index) => reports.createReportRevision({
    taskModelId: target.id, parentReportId: parent.id,
    source: index % 2 ? 'MANUAL' : 'AI_ADJUSTED', editedById: userId,
    editNote: `revision-${index}`, overallComment: `corrected-${index}`,
  })))
  assert.deepEqual(revised.map(r => r.version).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9])
  for (const [index, revision] of revised.entries()) {
    assert.equal(revision.parentReportId, parent.id)
    assert.equal(revision.generationSnapshot, parent.generationSnapshot)
    assert.equal(revision.source, index % 2 ? 'MANUAL' : 'AI_ADJUSTED')
    assert.equal(revision.overallComment, `corrected-${index}`)
  }
})

test('models have independent version sequences and cannot share revision parents', async () => {
  const [a, b] = await Promise.all([model(), model()])
  const first = await reports.createVersionedReport({ ...content, taskModelId: a.id })
  await assert.rejects(reports.createReportRevision({
    taskModelId: b.id, parentReportId: first.id, source: 'MANUAL',
  }), /父报告与当前模型不匹配/)
  const second = await reports.createVersionedReport({ ...content, taskModelId: b.id })
  assert.equal(first.version, 1)
  assert.equal(second.version, 1)
})

test('failed writes roll back without consuming a version or retaining the model lock', async () => {
  const target = await model()
  await assert.rejects(reports.createVersionedReport({
    ...content, taskModelId: target.id, editedById: 'nonexistent-user',
  }))
  const saved = await reports.createVersionedReport({ ...content, taskModelId: target.id })
  assert.equal(saved.version, 1)
})

test('missing models fail without creating an orphan report', async () => {
  await assert.rejects(reports.createVersionedReport({
    ...content, taskModelId: 'missing-model',
  }), /模型不存在/)
})
