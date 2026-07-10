import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTranscriptContext, parseStructuredAiResponse } from '../server.mjs'

test('long transcripts are bounded and keep question-relevant context', () => {
  const transcript = Array.from({ length: 120 }, (_, index) => ({
    id: `segment-${index}`,
    startSec: index * 20,
    endSec: index * 20 + 18,
    text: index === 90
      ? 'The retrieval architecture uses a compact relevance window for grounded answers.'
      : `General product discussion segment ${index} with repeated background context.`,
  }))

  const result = buildTranscriptContext({
    transcript,
    question: 'How does the retrieval architecture work?',
    currentPlaybackTime: 1_800,
    maxTokens: 180,
  })

  assert.equal(result.strategy, 'focused')
  assert.ok(result.tokenEstimate <= 220)
  assert.ok(result.segmentCount < transcript.length)
  assert.match(result.context, /retrieval architecture/i)
})

test('short transcripts remain complete', () => {
  const transcript = [{ id: 'one', startSec: 0, endSec: 5, text: 'A short source.' }]
  const result = buildTranscriptContext({ transcript })
  assert.equal(result.strategy, 'full')
  assert.equal(result.segmentCount, 1)
})

test('structured AI responses tolerate fenced JSON and normalize missing values', () => {
  const parsed = parseStructuredAiResponse('```json\n{"answer":"Grounded answer","timestamps":["01:10"],"followUps":["Why?"]}\n```')
  assert.equal(parsed.answer, 'Grounded answer')
  assert.deepEqual(parsed.timestamps, ['01:10'])
  assert.deepEqual(parsed.followUps, ['Why?'])
  assert.deepEqual(parsed.saveCandidates, [])
})
