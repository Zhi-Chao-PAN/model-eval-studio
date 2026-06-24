import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isTypingTarget,
  matchShortcut,
  nextStepKey,
  consumeGPrefix,
} from './keyboard-shortcuts.js'

// ----- Test doubles ------------------------------------------------------
// Node 测试环境没有 DOM，所以我们直接构造最小的 mock object 并强转。
// 这里仅依赖运行时不存在 Element / HTMLElement 全局——helper 内的 typeof 守卫
// 会自动跳过 instanceof 检查，转而走 duck-typed `tagName` / `isContentEditable` 路径。

function makeTarget(tagName: string, contentEditable = false): EventTarget {
  return { tagName, isContentEditable: contentEditable } as unknown as EventTarget
}

function makeEvent(opts: {
  key: string
  target?: EventTarget | null
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
}): KeyboardEvent {
  return {
    key: opts.key,
    target: opts.target ?? null,
    metaKey: !!opts.meta,
    ctrlKey: !!opts.ctrl,
    altKey: !!opts.alt,
  } as unknown as KeyboardEvent
}

// ----- isTypingTarget ----------------------------------------------------

test('isTypingTarget: null 与 undefined 都返回 false', () => {
  assert.equal(isTypingTarget(null), false)
})

test('isTypingTarget: INPUT / TEXTAREA / SELECT 视为打字 target', () => {
  assert.equal(isTypingTarget(makeTarget('INPUT')), true)
  assert.equal(isTypingTarget(makeTarget('TEXTAREA')), true)
  assert.equal(isTypingTarget(makeTarget('SELECT')), true)
})

test('isTypingTarget: 普通 DIV 不算打字 target', () => {
  assert.equal(isTypingTarget(makeTarget('DIV')), false)
})

// ----- matchShortcut -----------------------------------------------------

test('matchShortcut: 修饰键按下时永不匹配', () => {
  assert.equal(matchShortcut(makeEvent({ key: '/', meta: true }), '/'), false)
  assert.equal(matchShortcut(makeEvent({ key: '/', ctrl: true }), '/'), false)
  assert.equal(matchShortcut(makeEvent({ key: '/', alt: true }), '/'), false)
})

test('matchShortcut: 无修饰键并键值一致才匹配', () => {
  assert.equal(matchShortcut(makeEvent({ key: '/' }), '/'), true)
  assert.equal(matchShortcut(makeEvent({ key: '?' }), '?'), true)
  assert.equal(matchShortcut(makeEvent({ key: 'n' }), '/'), false)
})

// ----- nextStepKey -------------------------------------------------------

const STEPS = [
  { key: 'DESIGN' },
  { key: 'INFO' },
  { key: 'SCREENSHOT' },
  { key: 'ARTIFACT' },
  { key: 'REPORT' },
] as const

test('nextStepKey: 中间步骤可前后切换', () => {
  assert.equal(nextStepKey(STEPS, 'INFO', 1), 'SCREENSHOT')
  assert.equal(nextStepKey(STEPS, 'INFO', -1), 'DESIGN')
})

test('nextStepKey: 边界返回 null 而不是回环', () => {
  assert.equal(nextStepKey(STEPS, 'DESIGN', -1), null)
  assert.equal(nextStepKey(STEPS, 'REPORT', 1), null)
})

test('nextStepKey: 未知 current 返回 null', () => {
  assert.equal(nextStepKey(STEPS, 'NOPE', 1), null)
})

test('nextStepKey: 空 steps 返回 null', () => {
  assert.equal(nextStepKey([] as const, 'DESIGN', 1), null)
})

// ----- consumeGPrefix ----------------------------------------------------

test('consumeGPrefix: 第一次按 g 进入 prefix 状态', () => {
  const r = consumeGPrefix(makeEvent({ key: 'g', target: makeTarget('DIV') }), null, 1000)
  assert.equal(r.matched, null)
  assert.equal(r.nextPrefixAt, 1000)
  assert.equal(r.isPrefixStart, true)
})

test('consumeGPrefix: prefix 状态下再按 d → matched = "d"', () => {
  const r = consumeGPrefix(makeEvent({ key: 'd', target: makeTarget('DIV') }), 1000, 1500)
  assert.equal(r.matched, 'd')
  assert.equal(r.nextPrefixAt, null)
})

test('consumeGPrefix: 超时后再按 d → 不再匹配', () => {
  const r = consumeGPrefix(makeEvent({ key: 'd', target: makeTarget('DIV') }), 1000, 5000)
  assert.equal(r.matched, null)
  assert.equal(r.nextPrefixAt, null)
})

test('consumeGPrefix: 在 INPUT 上按 g 不进入 prefix', () => {
  const r = consumeGPrefix(makeEvent({ key: 'g', target: makeTarget('INPUT') }), null, 1000)
  assert.equal(r.matched, null)
  assert.equal(r.nextPrefixAt, null)
  assert.equal(r.isPrefixStart, false)
})

test('consumeGPrefix: 修饰键按下时不进入 prefix', () => {
  const r = consumeGPrefix(makeEvent({ key: 'g', meta: true, target: makeTarget('DIV') }), null, 1000)
  assert.equal(r.nextPrefixAt, null)
  assert.equal(r.isPrefixStart, false)
})

test('consumeGPrefix: 大小写 G 同样进入 prefix', () => {
  const r = consumeGPrefix(makeEvent({ key: 'G', target: makeTarget('DIV') }), null, 1000)
  assert.equal(r.nextPrefixAt, 1000)
  assert.equal(r.isPrefixStart, true)
})

test('consumeGPrefix: prefix 下按下大写字母时统一返回小写', () => {
  const r = consumeGPrefix(makeEvent({ key: 'D', target: makeTarget('DIV') }), 1000, 1500)
  assert.equal(r.matched, 'd')
})
