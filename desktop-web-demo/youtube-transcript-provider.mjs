const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'

const CLIENTS = [
  {
    label: 'Android',
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8 Pro Build/UD1A.231105.004) gzip',
  },
  {
    label: 'Web',
    clientName: 'WEB',
    clientVersion: '2.20250326.00.00',
    userAgent: WEB_USER_AGENT,
  },
  {
    label: 'iOS',
    clientName: 'IOS',
    clientVersion: '20.10.4',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
  },
]

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export class YouTubeTranscriptError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'YouTubeTranscriptError'
    this.code = code
  }
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITY_MAP[name] ?? `&${name};`)
}

function cleanCaptionText(value) {
  return decodeEntities(String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).trim()
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function getRendererText(value) {
  if (!value || typeof value !== 'object') return 'Unknown'
  if (typeof value.simpleText === 'string') return value.simpleText
  if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text ?? '').join('')
  return 'Unknown'
}

async function readWatchPage(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  const headers = {
    'User-Agent': WEB_USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
  }

  let response
  try {
    response = await fetchWithTimeout(url, { headers, redirect: 'follow' })
  } catch (error) {
    throw new YouTubeTranscriptError('PAGE_FETCH_FAILED', `Watch page request failed: ${error.message}`)
  }

  let html = await response.text()

  if (html.includes('consent.youtube.com')) {
    const consentValue = html.match(/name="v"\s+value="([^"]+)"/)?.[1]
    if (consentValue) {
      try {
        const retry = await fetchWithTimeout(url, {
          headers: {
            ...headers,
            Cookie: `CONSENT=YES+${consentValue}`,
          },
          redirect: 'follow',
        })
        html = await retry.text()
      } catch {
        // Keep the original response; the non-web clients can still be tried.
      }
    }
  }

  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1]
  if (!apiKey) {
    if (html.includes('Sign in to confirm your age') || html.includes('"LOGIN_REQUIRED"')) {
      throw new YouTubeTranscriptError('AGE_RESTRICTED', 'This video requires login or age verification.')
    }
    if (html.includes('"playabilityStatus":{"status":"ERROR"')) {
      throw new YouTubeTranscriptError('VIDEO_UNAVAILABLE', 'This video is unavailable.')
    }
    throw new YouTubeTranscriptError('PAGE_FETCH_FAILED', 'Could not read InnerTube config from the watch page.')
  }

  return {
    apiKey,
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1],
    visitorData: html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/)?.[1],
  }
}

function classifyPlayability(data, clientLabel) {
  const status = data?.playabilityStatus
  if (!status || typeof status !== 'object') return

  if (status.status === 'ERROR' || status.status === 'UNPLAYABLE') {
    throw new YouTubeTranscriptError('VIDEO_UNAVAILABLE', `Video is ${String(status.status).toLowerCase()}.`)
  }

  if (status.status === 'LOGIN_REQUIRED') {
    const reason = String(status.reason ?? '')
    if (/age|confirm/i.test(reason)) {
      throw new YouTubeTranscriptError('AGE_RESTRICTED', reason || 'Video requires age verification.')
    }
    throw new YouTubeTranscriptError('BOT_DETECTED', `${clientLabel} client was asked to log in.`)
  }
}

async function fetchCaptionTracks(videoId, client, pageData) {
  const apiKey = pageData?.apiKey
  if (!apiKey) {
    throw new YouTubeTranscriptError('PAGE_FETCH_FAILED', `${client.label} client has no InnerTube API key.`)
  }

  const body = {
    videoId,
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientName === 'WEB' ? pageData?.clientVersion ?? client.clientVersion : client.clientVersion,
        hl: 'en',
        gl: 'US',
        userAgent: client.userAgent,
        ...(pageData?.visitorData ? { visitorData: pageData.visitorData } : {}),
      },
    },
  }

  if (client.clientName === 'ANDROID' || client.clientName === 'IOS') {
    body.contentCheckOk = true
    body.racyCheckOk = true
  }

  let response
  try {
    response = await fetchWithTimeout(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new YouTubeTranscriptError('INNERTUBE_REJECTED', `${client.label} InnerTube request failed: ${error.message}`)
  }

  if (response.status === 429) {
    throw new YouTubeTranscriptError('IP_BLOCKED', `${client.label} InnerTube request was rate limited.`)
  }
  if (!response.ok) {
    throw new YouTubeTranscriptError('INNERTUBE_REJECTED', `${client.label} InnerTube returned ${response.status}.`)
  }

  const data = await response.json()
  classifyPlayability(data, client.label)

  const rawTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    throw new YouTubeTranscriptError('TRANSCRIPTS_DISABLED', 'No caption tracks were returned for this video.')
  }

  return rawTracks
    .filter((track) => typeof track?.baseUrl === 'string' && typeof track?.languageCode === 'string')
    .map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode,
      name: getRendererText(track.name),
      kind: typeof track.kind === 'string' ? track.kind : undefined,
    }))
}

function pickTrack(tracks, preferredLanguage = 'en') {
  const matchLanguage = (track, language) =>
    track.languageCode === language || track.languageCode.startsWith(`${language.split('-')[0]}-`)
  const byLanguage = (list, language) => list.find((track) => matchLanguage(track, language))
  const manual = tracks.filter((track) => track.kind !== 'asr')
  const generated = tracks.filter((track) => track.kind === 'asr')

  return (
    byLanguage(manual, preferredLanguage) ??
    byLanguage(generated, preferredLanguage) ??
    byLanguage(manual, 'en') ??
    byLanguage(generated, 'en') ??
    manual[0] ??
    generated[0] ??
    tracks[0] ??
    null
  )
}

function withFormat(baseUrl, format) {
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('fmt', format)
    return url.toString()
  } catch {
    return baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=${format}`
  }
}

function parseJson3Captions(raw) {
  const data = JSON.parse(raw)
  if (!Array.isArray(data.events)) return []

  return data.events
    .map((event) => {
      const text = (event.segs ?? []).map((segment) => segment?.utf8 ?? '').join('')
      return {
        start: Number(event.tStartMs ?? 0) / 1000,
        duration: Number(event.dDurationMs ?? 0) / 1000,
        text: cleanCaptionText(text),
      }
    })
    .filter((segment) => segment.text)
}

function parseXmlCaptions(xml) {
  const segments = []
  const parseMatches = (regex, timeScale) => {
    let match
    while ((match = regex.exec(xml)) !== null) {
      const text = cleanCaptionText(match[3])
      if (text) {
        segments.push({
          start: Number(match[1] || 0) / timeScale,
          duration: Number(match[2] || 0) / timeScale,
          text,
        })
      }
    }
  }

  parseMatches(/<p\s+t="([^"]*)"(?:\s+d="([^"]*)")?[^>]*>([\s\S]*?)<\/p>/g, 1000)
  if (segments.length > 0) return segments

  parseMatches(/<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g, 1)
  return segments
}

async function downloadCaptions(track) {
  const attempts = [
    { url: withFormat(track.baseUrl, 'json3'), parser: parseJson3Captions },
    { url: withFormat(track.baseUrl, '3'), parser: parseXmlCaptions },
    { url: track.baseUrl, parser: parseXmlCaptions },
  ]

  let lastError
  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeout(attempt.url, {
        headers: {
          'User-Agent': WEB_USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!response.ok) {
        throw new Error(`caption endpoint returned ${response.status}`)
      }
      const raw = await response.text()
      const segments = attempt.parser(raw)
      if (segments.length > 0) return segments
    } catch (error) {
      lastError = error
    }
  }

  throw new YouTubeTranscriptError('CAPTION_FETCH_FAILED', `Could not download caption track: ${lastError?.message ?? 'empty response'}`)
}

function normalizeThirdPartySegments(items) {
  if (!Array.isArray(items)) return []

  const sample = items
    .slice(0, 5)
    .map((item) => Number(item?.offset ?? item?.start ?? 0))
    .filter((value) => value > 0)
  const looksLikeMilliseconds = sample.length > 0 && sample.reduce((sum, value) => sum + value, 0) / sample.length > 500

  return items
    .map((item) => {
      const rawStart = Number(item?.offset ?? item?.start ?? 0)
      const rawDuration = Number(item?.duration ?? item?.dur ?? 0)
      return {
        text: cleanCaptionText(item?.text ?? item?.content ?? ''),
        start: looksLikeMilliseconds ? rawStart / 1000 : rawStart,
        duration: looksLikeMilliseconds ? rawDuration / 1000 : rawDuration,
      }
    })
    .filter((segment) => segment.text)
}

async function fetchSupadataTranscript(videoId, language) {
  const apiKey = process.env.SUPADATA_API_KEY
  if (!apiKey) return null

  const url = new URL('https://api.supadata.ai/v1/transcript')
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)
  if (language) url.searchParams.set('lang', language)

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    },
    20000,
  )

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new YouTubeTranscriptError('SUPADATA_REJECTED', body?.error ?? body?.message ?? `Supadata returned ${response.status}.`)
  }

  const content = Array.isArray(body?.content) ? body.content : Array.isArray(body?.transcript) ? body.transcript : Array.isArray(body) ? body : []
  const segments = normalizeThirdPartySegments(content)

  if (segments.length === 0) {
    throw new YouTubeTranscriptError('SUPADATA_EMPTY', 'Supadata returned no transcript segments.')
  }

  return {
    segments,
    language: typeof body?.lang === 'string' ? body.lang : language ?? null,
    availableLanguages: Array.isArray(body?.availableLangs) ? body.availableLangs.filter((item) => typeof item === 'string') : [],
    source: 'Supadata',
  }
}

function shouldTryNext(error) {
  return ['PAGE_FETCH_FAILED', 'BOT_DETECTED', 'IP_BLOCKED', 'INNERTUBE_REJECTED', 'CAPTION_FETCH_FAILED'].includes(error.code)
}

export async function fetchYouTubeTranscript(videoId, options = {}) {
  let pageData = null
  let pageError = null
  try {
    pageData = await readWatchPage(videoId)
  } catch (error) {
    pageError = error
    console.warn(`[youtube-transcript] Watch page fallback for ${videoId}: ${error.code ?? 'UNKNOWN'} ${error.message}`)
  }

  let lastError = pageError
  for (const client of CLIENTS) {
    if (!pageData?.apiKey) continue

    try {
      const tracks = await fetchCaptionTracks(videoId, client, pageData)
      const track = pickTrack(tracks, options.language ?? 'en')
      if (!track) {
        throw new YouTubeTranscriptError('NO_TRANSCRIPT', 'No suitable caption track was found.')
      }

      const segments = await downloadCaptions(track)
      return {
        segments,
        language: track.languageCode,
        availableLanguages: [...new Set(tracks.map((item) => item.languageCode))],
        source: client.label,
      }
    } catch (error) {
      lastError = error
      console.warn(`[youtube-transcript] ${client.label} failed for ${videoId}: ${error.code ?? 'UNKNOWN'} ${error.message}`)
      if (error instanceof YouTubeTranscriptError && !shouldTryNext(error)) break
    }
  }

  if (process.env.SUPADATA_API_KEY) {
    const supadataLanguages = [...new Set([options.language ?? 'en', null])]
    try {
      for (const language of supadataLanguages) {
        try {
          const supadataResult = await fetchSupadataTranscript(videoId, language)
          if (supadataResult) return supadataResult
        } catch (error) {
          lastError = error
          console.warn(
            `[youtube-transcript] Supadata${language ? ` (${language})` : ' (auto)'} failed for ${videoId}: ${error.code ?? 'UNKNOWN'} ${error.message}`,
          )
        }
      }
    } catch (error) {
      lastError = error
      console.warn(`[youtube-transcript] Supadata failed for ${videoId}: ${error.code ?? 'UNKNOWN'} ${error.message}`)
    }
  }

  if (lastError) {
    console.warn(`[youtube-transcript] No transcript for ${videoId}: ${lastError.code ?? 'UNKNOWN'} ${lastError.message}`)
  }

  return {
    segments: [],
    language: null,
    availableLanguages: [],
    source: null,
    error: lastError ? { code: lastError.code ?? 'UNKNOWN', message: lastError.message } : null,
  }
}
