const DEFAULT_MAX_TRACKED_KEYS = 10_000

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function requestIp(req) {
  return String(req.ip ?? req.socket?.remoteAddress ?? 'unknown')
}

export function createFixedWindowRateLimiter({
  windowMs,
  maxRequests,
  key = requestIp,
  message = 'Too many requests. Please try again later.',
  maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS,
  now = Date.now,
} = {}) {
  // This store is intentionally process-local for the current single-instance Render service.
  // Replace it with a shared atomic store before running more than one web instance.
  const safeWindowMs = positiveInteger(windowMs, 10 * 60 * 1000)
  const safeMaxRequests = positiveInteger(maxRequests, 10)
  const safeMaxTrackedKeys = positiveInteger(maxTrackedKeys, DEFAULT_MAX_TRACKED_KEYS)
  const entries = new Map()
  let requestsSinceSweep = 0

  function sweepExpired(timestamp) {
    for (const [entryKey, entry] of entries) {
      if (entry.resetAt <= timestamp) {
        entries.delete(entryKey)
      }
    }
  }

  return function fixedWindowRateLimiter(req, res, next) {
    const timestamp = now()
    requestsSinceSweep += 1
    if (requestsSinceSweep >= 100 || entries.size >= safeMaxTrackedKeys) {
      sweepExpired(timestamp)
      requestsSinceSweep = 0
    }

    const requestedKey = String(key(req) || 'unknown')
    const entryKey = entries.size >= safeMaxTrackedKeys && !entries.has(requestedKey)
      ? '__overflow__'
      : requestedKey
    const current = entries.get(entryKey)
    const entry = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + safeWindowMs }
      : current

    entry.count += 1
    entries.set(entryKey, entry)

    const remaining = Math.max(0, safeMaxRequests - entry.count)
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))
    res.setHeader('RateLimit-Limit', String(safeMaxRequests))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(retryAfterSec))

    if (entry.count > safeMaxRequests) {
      res.setHeader('Retry-After', String(retryAfterSec))
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retryAfterSec,
      })
    }

    return next()
  }
}

export function validatePreviewRequest(body) {
  const youtubeUrl = String(body?.youtubeUrl ?? body?.url ?? '').trim()
  const youtubeId = String(body?.youtubeId ?? '').trim()
  const durationSec = Number(body?.durationSec ?? body?.duration_sec ?? 0)
  const transcriptLanguage = String(body?.transcriptLanguage ?? body?.transcript_language ?? body?.language ?? '').trim()

  if (!youtubeUrl && !youtubeId) {
    return 'Missing YouTube URL or video ID.'
  }
  if (youtubeUrl.length > 500 || youtubeId.length > 100) {
    return 'YouTube URL or video ID is too long.'
  }
  if (transcriptLanguage.length > 32) {
    return 'Transcript language is too long.'
  }
  if (durationSec && (!Number.isFinite(durationSec) || durationSec < 0 || durationSec > 24 * 60 * 60)) {
    return 'Video duration is outside the supported range.'
  }

  return null
}

export function validateAskRequest(body) {
  const purpose = String(body?.purpose ?? 'ask').trim()
  const videoId = String(body?.videoId ?? body?.video_id ?? '').trim()
  const videoTitle = String(body?.videoTitle ?? '').trim()
  const answerLanguage = String(body?.answerLanguage ?? body?.answer_language ?? 'zh-CN').trim()
  const question = String(body?.userQuestion ?? (purpose === 'translate' ? body?.question : '')).trim()
  const selectedText = String(body?.selectedSubtitle?.text ?? body?.selected_subtitle?.text ?? '').trim()
  const nearbySubtitles = Array.isArray(body?.nearbySubtitles) ? body.nearbySubtitles : []

  if (purpose !== 'ask' && purpose !== 'translate') {
    return 'Unsupported AI request purpose.'
  }

  if (!videoId || !question) {
    return 'Missing videoId or userQuestion.'
  }
  if (purpose === 'translate' && !selectedText) {
    return 'Missing lines to translate.'
  }
  if (videoId.length > 200 || videoTitle.length > 500) {
    return 'Video metadata is too long.'
  }
  if (question.length > 2_000) {
    return 'Question is too long.'
  }
  if (answerLanguage.length > 64) {
    return 'Answer language is too long.'
  }
  if (selectedText.length > 12_000) {
    return 'Selected subtitle context is too long.'
  }
  if (nearbySubtitles.length > 80) {
    return 'Nearby subtitle context is too large.'
  }

  const nearbyCharacters = nearbySubtitles.reduce((total, segment) => total + String(segment?.text ?? '').length, 0)
  if (nearbyCharacters > 20_000) {
    return 'Nearby subtitle context is too large.'
  }

  return null
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController()
  const safeTimeoutMs = positiveInteger(timeoutMs, 30_000)
  const timeout = setTimeout(() => controller.abort(new Error('Upstream request timed out.')), safeTimeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || /timed out|aborted/i.test(String(error?.message ?? ''))
}
