import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createFixedWindowRateLimiter,
  fetchWithTimeout,
  isAbortError,
  validateAskRequest,
  validatePreviewRequest,
} from '../server-security.mjs'

function mockResponse() {
  const headers = new Map()
  return {
    headers,
    body: null,
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value))
    },
    status(value) {
      this.statusCode = value
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

test('preview validation rejects missing and unreasonable input', () => {
  assert.match(validatePreviewRequest({}), /Missing YouTube URL/)
  assert.match(validatePreviewRequest({ youtubeId: 'x'.repeat(101) }), /too long/)
  assert.match(validatePreviewRequest({ youtubeId: 'abcdefghijk', durationSec: 90_000 }), /supported range/)
  assert.equal(validatePreviewRequest({ youtubeId: 'abcdefghijk', durationSec: 600 }), null)
})

test('AI validation bounds purpose, question, and transcript context', () => {
  assert.match(validateAskRequest({ purpose: 'summarize', videoId: 'v', userQuestion: 'q' }), /Unsupported/)
  assert.match(validateAskRequest({ purpose: 'translate', videoId: 'v', question: 'Translate this' }), /Missing lines/)
  assert.match(validateAskRequest({ purpose: 'ask', videoId: 'v', userQuestion: 'q'.repeat(2_001) }), /Question is too long/)
  assert.match(validateAskRequest({
    purpose: 'ask',
    videoId: 'v',
    userQuestion: 'Explain this',
    selectedSubtitle: { text: 'x'.repeat(12_001) },
  }), /subtitle context is too long/)
  assert.equal(validateAskRequest({ purpose: 'ask', videoId: 'v', userQuestion: 'Explain this' }), null)
})

test('fixed-window limiter blocks an identity and resets after the window', () => {
  let timestamp = 1_000
  let nextCalls = 0
  const limiter = createFixedWindowRateLimiter({
    windowMs: 5_000,
    maxRequests: 2,
    key: (req) => req.identity,
    now: () => timestamp,
  })
  const req = { identity: 'guest-1' }

  const first = mockResponse()
  limiter(req, first, () => { nextCalls += 1 })
  assert.equal(first.statusCode, 200)
  assert.equal(first.headers.get('ratelimit-remaining'), '1')
  assert.equal(first.headers.get('ratelimit-reset'), '5')

  const second = mockResponse()
  limiter(req, second, () => { nextCalls += 1 })
  assert.equal(second.headers.get('ratelimit-remaining'), '0')
  assert.equal(nextCalls, 2)

  const blocked = mockResponse()
  limiter(req, blocked, () => { nextCalls += 1 })
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.body.code, 'RATE_LIMITED')
  assert.equal(blocked.headers.get('retry-after'), '5')
  assert.equal(nextCalls, 2)

  timestamp += 5_001
  const reset = mockResponse()
  limiter(req, reset, () => { nextCalls += 1 })
  assert.equal(reset.statusCode, 200)
  assert.equal(reset.headers.get('ratelimit-remaining'), '1')
  assert.equal(nextCalls, 3)
})

test('fetchWithTimeout aborts a stalled upstream request', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  try {
    await assert.rejects(
      fetchWithTimeout('https://example.invalid/stall', {}, 10),
      (error) => isAbortError(error),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
