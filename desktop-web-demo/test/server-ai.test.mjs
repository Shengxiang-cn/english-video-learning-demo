import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTranscriptContext, normalizeGuestNote, normalizeSaveCandidates, parseStructuredAiResponse } from '../server.mjs'

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

test('AI save candidates stay concise enough for note summaries', () => {
  const [note, question] = normalizeSaveCandidates([
    { type: 'keyIdea', content: 'A'.repeat(900) },
    { type: 'reviewQuestion', content: 'Q'.repeat(500) },
  ])

  assert.equal(note.content.length, 520)
  assert.equal(question.content.length, 280)
})

test('guest migration preserves an explicit manual note source', () => {
  const note = normalizeGuestNote({
    clientTempId: 'manual-note',
    type: 'thought',
    source: 'manual',
    quote: 'Selected subtitle',
    note: 'My note',
    content: 'My note',
    tags: [],
  }, 0, '00000000-0000-0000-0000-000000000001', { id: 'video-1', title: 'Video' })

  assert.equal(note.source, 'manual')
  assert.equal(note.type, 'thought')
})
