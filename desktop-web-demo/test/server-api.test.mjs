import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'

process.env.KIMI_API_KEY = ''
process.env.SUPABASE_URL = ''
process.env.SUPABASE_ANON_KEY = ''
process.env.VITE_SUPABASE_URL = ''
process.env.VITE_SUPABASE_ANON_KEY = ''
process.env.ASK_GUEST_RATE_LIMIT_MAX = '2'
process.env.ASK_GLOBAL_RATE_LIMIT_MAX = '100'
process.env.ALLOWED_ORIGINS = 'https://allowed.example'

const { app } = await import('../server.mjs')
let server
let baseUrl

before(async () => {
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('health is public and does not expose the Express signature', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-powered-by'), null)
  assert.equal((await response.json()).ok, true)
})

test('CORS allows configured origins and omits unapproved origins', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://allowed.example' },
  })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example')

  const denied = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://unapproved.example' },
  })
  assert.equal(denied.status, 200)
  assert.equal(denied.headers.get('access-control-allow-origin'), null)
})

test('preview rejects invalid input before consuming provider capacity', async () => {
  const response = await fetch(`${baseUrl}/api/youtube/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'INVALID_REQUEST')
  assert.equal(response.headers.get('ratelimit-limit'), null)
})

test('malformed and oversized JSON receive stable JSON errors', async () => {
  const malformed = await fetch(`${baseUrl}/api/youtube/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).code, 'INVALID_JSON')

  const oversized = await fetch(`${baseUrl}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(1_100_000) }),
  })
  assert.equal(oversized.status, 413)
  assert.equal((await oversized.json()).code, 'PAYLOAD_TOO_LARGE')
})

test('guest AI requests are rate-limited by forwarded client identity', async () => {
  const request = () => fetch(`${baseUrl}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.10',
    },
    body: JSON.stringify({
      purpose: 'ask',
      videoId: 'test-video',
      userQuestion: 'Explain this line.',
    }),
  })

  const first = await request()
  assert.equal(first.status, 500)
  assert.equal(first.headers.get('ratelimit-remaining'), '1')

  const second = await request()
  assert.equal(second.status, 500)
  assert.equal(second.headers.get('ratelimit-remaining'), '0')

  const blocked = await request()
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'RATE_LIMITED')
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
})
