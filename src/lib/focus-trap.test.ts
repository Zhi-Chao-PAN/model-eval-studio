import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterFocusable,
  getNextFocusTarget,
  FOCUSABLE_SELECTOR,
  type FocusableLike,
} from './focus-trap.js'

// ----- helpers -----------------------------------------------------------

function makeEl(opts: {
  disabled?: boolean
  ariaHiddenAncestor?: boolean
} = {}): FocusableLike {
  return {
    disabled: opts.disabled === true ? true : undefined,
    closest: (sel: string) => {
      if (sel === '[aria-hidden="true"]') {
        return opts.ariaHiddenAncestor ? { tagName: 'DIV' } : null
      }
      return null
    },
  }
}

// ----- FOCUSABLE_SELECTOR ------------------------------------------------

test('FOCUSABLE_SELECTOR: 包含主要表单/链接/可制表元素', () => {
  // 不直接 query DOM，只确认 selector 字符串结构稳定（防止误删 token）
  assert.match(FOCUSABLE_SELECTOR, /button/)
  assert.match(FOCUSABLE_SELECTOR, /\[href\]/)
  assert.match(FOCUSABLE_SELECTOR, /input/)
  assert.match(FOCUSABLE_SELECTOR, /select/)
  assert.match(FOCUSABLE_SELECTOR, /textarea/)
  assert.match(FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/)
})

// ----- filterFocusable ---------------------------------------------------

test('filterFocusable: disabled 元素被过滤掉', () => {
  const a = makeEl()
  const b = makeEl({ disabled: true })
  const c = makeEl()
  assert.deepEqual(filterFocusable([a, b, c]), [a, c])
})

test('filterFocusable: aria-hidden 容器内的元素被过滤掉', () => {
  const a = makeEl()
  const b = makeEl({ ariaHiddenAncestor: true })
  assert.deepEqual(filterFocusable([a, b]), [a])
})

test('filterFocusable: 没有 closest 方法时不抛错', () => {
  const a: FocusableLike = {}
  assert.deepEqual(filterFocusable([a]), [a])
})

test('filterFocusable: 空数组返回空数组', () => {
  assert.deepEqual(filterFocusable([]), [])
})

// ----- getNextFocusTarget ------------------------------------------------

test('getNextFocusTarget: 空列表返回 null（不拦截）', () => {
  assert.equal(getNextFocusTarget([], null, false), null)
  assert.equal(getNextFocusTarget([], null, true), null)
})

test('getNextFocusTarget: 正向 Tab，当前是最后一个 → 循环到第一个', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  assert.equal(getNextFocusTarget([a, b, c], c, false), a)
})

test('getNextFocusTarget: 正向 Tab，当前在中间 → null（让浏览器走）', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  assert.equal(getNextFocusTarget([a, b, c], b, false), null)
})

test('getNextFocusTarget: 正向 Tab，当前不在列表 → 跳到第一个', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const outside = { id: 'x' }
  assert.equal(getNextFocusTarget([a, b], outside, false), a)
})

test('getNextFocusTarget: 反向 Tab，当前是第一个 → 循环到最后一个', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  assert.equal(getNextFocusTarget([a, b, c], a, true), c)
})

test('getNextFocusTarget: 反向 Tab，当前在中间 → null', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  assert.equal(getNextFocusTarget([a, b, c], b, true), null)
})

test('getNextFocusTarget: 反向 Tab，current=null → 跳到最后一个（容器外侵入）', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  assert.equal(getNextFocusTarget([a, b], null, true), b)
})

test('getNextFocusTarget: 单元素列表，Tab 与 Shift+Tab 都返回自己', () => {
  const a = { id: 'a' }
  assert.equal(getNextFocusTarget([a], a, false), a)
  assert.equal(getNextFocusTarget([a], a, true), a)
})
