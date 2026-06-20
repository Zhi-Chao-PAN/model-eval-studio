import assert from 'node:assert/strict'
import test from 'node:test'
import { splitAiContent, thinkingAiContent, visibleAiContent } from './ai-content'
import { parseDesignOutput } from './design-output'

test('keeps a partial streaming think tag out of visible content', () => {
  assert.equal(visibleAiContent('正文之前<thi'), '正文之前')
  assert.deepEqual(splitAiContent('<think>分析中'), [
    { kind: 'think', content: '分析中', open: true },
  ])
})
test('preserves reasoning while keeping the answer intact', () => {
  const raw = '<think>先确认结构</think>最终正文'
  assert.equal(thinkingAiContent(raw), '先确认结构')
  assert.equal(visibleAiContent(raw), '最终正文')
})

test('parses legacy headings without splitting on a document title separator', () => {
  const output = `<think>设计一道 Agent 题</think>
# Agent 评测题设计稿

--- 第一部分：任务 Prompt（交给待测模型的题目原文）---

这是应当交给待测模型的完整任务。

--- 第二部分：题目来源 / 背景说明 ---

这是只给测试者看的背景。`
  assert.deepEqual(parseDesignOutput(output), {
    prompt: '这是应当交给待测模型的完整任务。',
    background: '这是只给测试者看的背景。',
    thinking: '设计一道 Agent 题',
  })
})

test('prefers stable design output markers', () => {
  const output = '<<<TASK_PROMPT>>>\n任务 A\n<<<BACKGROUND>>>\n背景 B'
  assert.deepEqual(parseDesignOutput(output), {
    prompt: '任务 A',
    background: '背景 B',
    thinking: '',
  })
})
