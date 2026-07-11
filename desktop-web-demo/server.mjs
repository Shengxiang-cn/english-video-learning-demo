import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { fetchYouTubeTranscript } from './youtube-transcript-provider.mjs'
import {
  createFixedWindowRateLimiter,
  fetchWithTimeout,
  isAbortError,
  requestIp,
  validateAskRequest,
  validatePreviewRequest,
} from './server-security.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 4174)
const host = process.env.HOST ?? '0.0.0.0'
const kimiBaseUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1'
const kimiModel = process.env.KIMI_MODEL ?? 'kimi-k2.5'
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const metadataTimeoutMs = Number(process.env.METADATA_TIMEOUT_MS ?? 12_000)
const kimiTimeoutMs = Number(process.env.KIMI_TIMEOUT_MS ?? 45_000)
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
const supabaseAuth = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  })
  : null

const videosTable = 'learning_videos'
const notesTable = 'learning_notes'
const conversationsTable = 'learning_conversations'
const transcriptChunksTable = 'learning_transcript_chunks'
const translationsTable = 'learning_translations'

const allowedOrigins = new Set([
  'https://english-video-learning-demo.onrender.com',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://localhost:4174',
  'http://localhost:5173',
  ...String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
])

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin))
  },
}))
app.use(express.json({ limit: '1mb' }))

const previewGlobalLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.PREVIEW_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.PREVIEW_GLOBAL_RATE_LIMIT_MAX ?? 300),
  key: () => 'preview-global',
  message: 'Video preview is temporarily busy. Please try again later.',
})
const previewIpLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.PREVIEW_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.PREVIEW_RATE_LIMIT_MAX ?? 12),
  key: (req) => `preview:${requestIp(req)}`,
  message: 'Too many video previews. Please try again later.',
})
const importUserLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.IMPORT_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.IMPORT_RATE_LIMIT_MAX ?? 20),
  key: (req) => `import:${req.user?.id ?? requestIp(req)}`,
  message: 'Too many video imports. Please try again later.',
})
const askGlobalLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.ASK_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.ASK_GLOBAL_RATE_LIMIT_MAX ?? 300),
  key: () => 'ask-global',
  message: 'AI is temporarily busy. Please try again later.',
})
const askGuestLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.ASK_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.ASK_GUEST_RATE_LIMIT_MAX ?? 6),
  key: (req) => `ask-guest:${requestIp(req)}`,
  message: 'Guest AI limit reached. Please log in or try again later.',
})
const askUserLimiter = createFixedWindowRateLimiter({
  windowMs: Number(process.env.ASK_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
  maxRequests: Number(process.env.ASK_USER_RATE_LIMIT_MAX ?? 120),
  key: (req) => `ask-user:${req.user?.id ?? requestIp(req)}`,
  message: 'AI request limit reached. Please try again later.',
})

function askIdentityLimiter(req, res, next) {
  return req.user ? askUserLimiter(req, res, next) : askGuestLimiter(req, res, next)
}

function validatePreviewBody(req, res, next) {
  const validationError = validatePreviewRequest(req.body)
  if (validationError) {
    return res.status(400).json({ error: validationError, code: 'INVALID_REQUEST' })
  }
  return next()
}

function validateAskBody(req, res, next) {
  const validationError = validateAskRequest(req.body)
  if (validationError) {
    return res.status(400).json({ error: validationError, code: 'INVALID_REQUEST' })
  }
  return next()
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Learner',
    createdAt: user.created_at,
  }
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization ?? '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? ''
}

async function requireAuth(req, res, next) {
  if (!supabaseAuth) {
    return res.status(500).json({ error: 'Supabase is not configured on the server.' })
  }

  const accessToken = getBearerToken(req)
  if (!accessToken) {
    return res.status(401).json({ error: 'Please log in first.' })
  }

  const { data, error } = await supabaseAuth.auth.getUser(accessToken)
  if (error || !data.user) {
    return res.status(401).json({ error: 'Supabase session is invalid or expired.' })
  }

  req.accessToken = accessToken
  req.user = publicUser(data.user)
  return next()
}

async function optionalAuth(req, _res, next) {
  if (!supabaseAuth) {
    return next()
  }

  const accessToken = getBearerToken(req)
  if (!accessToken) {
    return next()
  }

  const { data, error } = await supabaseAuth.auth.getUser(accessToken)
  if (!error && data.user) {
    req.accessToken = accessToken
    req.user = publicUser(data.user)
  }

  return next()
}

function requestSupabase(req) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
    global: {
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
      },
    },
  })
}

function contractVideoFromRow(row) {
  return {
    id: row.id,
    youtubeId: row.youtube_id ?? undefined,
    youtubeUrl: row.youtube_url,
    title: row.title,
    channel: row.channel,
    durationSec: row.duration_sec ?? 0,
    thumbnailUrl: row.cover_image ?? undefined,
    transcript: row.transcript ?? [],
    transcriptLanguage: row.transcript_language ?? null,
    transcriptSource: row.transcript_source ?? null,
    transcriptLanguages: Array.isArray(row.transcript_languages) ? row.transcript_languages : [],
    transcriptError: row.transcript_error ?? null,
    status: row.status ?? 'inbox',
    isFavourite: Boolean(row.is_favourite),
    tags: Array.isArray(row.tags) ? row.tags : [],
    lastPositionSec: row.last_position_sec ?? 0,
    lastWatchedAt: row.last_watched_at ?? null,
    savedAt: row.saved_at,
  }
}

function contractVideoFromPreview(video) {
  return {
    id: video.id,
    youtubeId: video.youtubeId,
    youtubeUrl: video.youtubeUrl,
    title: video.title,
    channel: video.channel,
    durationSec: video.durationSec,
    thumbnailUrl: video.thumbnailUrl,
  }
}

function videoToRow(video, userId) {
  return {
    id: video.id,
    user_id: userId,
    title: video.title,
    channel: video.channel,
    duration_label: video.durationLabel,
    duration_sec: video.durationSec,
    last_position_sec: video.lastPositionSec,
    last_position_label: video.lastPositionLabel,
    summary: video.summary,
    youtube_url: video.youtubeUrl,
    youtube_id: video.youtubeId ?? null,
    source_type: video.sourceType ?? 'youtube',
    accent: video.accent,
    cover_image: video.coverImage ?? null,
    player_image: video.playerImage ?? null,
    cover_eyebrow: video.coverEyebrow,
    cover_title: video.coverTitle,
    cover_detail: video.coverDetail,
    transcript_language: video.transcriptLanguage ?? null,
    transcript_source: video.transcriptSource ?? null,
    transcript_languages: video.transcriptLanguages ?? [],
    transcript_error: video.transcriptError ?? null,
    transcript: video.transcript ?? [],
    status: video.status ?? 'inbox',
    is_favourite: Boolean(video.isFavourite),
    tags: video.tags ?? [],
    saved_at: video.savedAt ?? new Date().toISOString(),
  }
}

function rowToVideo(row) {
  return {
    id: row.id,
    title: row.title,
    channel: row.channel,
    durationLabel: row.duration_label,
    durationSec: row.duration_sec,
    lastPositionSec: row.last_position_sec,
    lastPositionLabel: row.last_position_label,
    summary: row.summary,
    youtubeUrl: row.youtube_url,
    youtubeId: row.youtube_id ?? undefined,
    sourceType: row.source_type ?? 'youtube',
    accent: row.accent,
    coverImage: row.cover_image ?? undefined,
    playerImage: row.player_image ?? undefined,
    coverEyebrow: row.cover_eyebrow,
    coverTitle: row.cover_title,
    coverDetail: row.cover_detail,
    transcriptLanguage: row.transcript_language,
    transcriptSource: row.transcript_source,
    transcriptLanguages: row.transcript_languages ?? [],
    transcriptError: row.transcript_error,
    transcript: row.transcript ?? [],
    status: row.status ?? (row.last_position_sec > 0 ? 'learning' : 'inbox'),
    isFavourite: Boolean(row.is_favourite),
    tags: row.tags ?? [],
    lastWatchedAt: row.last_watched_at ?? null,
    savedAt: row.saved_at,
  }
}

function noteToRow(note, userId) {
  return {
    id: note.id,
    user_id: userId,
    video_id: note.videoId,
    video_title: note.videoTitle ?? null,
    quote: note.quote,
    timestamp_label: note.timestamp,
    note: note.note,
    takeaway: note.takeaway,
    tags: note.tags ?? [],
    type: note.type ?? null,
    original_subtitle: note.originalSubtitle ?? null,
    content: note.content ?? null,
    topics: note.topics ?? [],
    source: note.source,
    is_starred: Boolean(note.isStarred),
    segment_ids: Array.isArray(note.segmentIds) ? note.segmentIds : [],
    start_sec: note.startSec != null && Number.isFinite(Number(note.startSec)) ? Number(note.startSec) : null,
    end_sec: note.endSec != null && Number.isFinite(Number(note.endSec)) ? Number(note.endSec) : null,
    created_at: note.createdAt ?? new Date().toISOString(),
    updated_at: note.updatedAt ?? note.createdAt ?? new Date().toISOString(),
    saved_at: note.savedAt ?? new Date().toISOString(),
  }
}

function rowToNote(row) {
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title ?? undefined,
    quote: row.quote,
    timestamp: row.timestamp_label,
    note: row.note,
    takeaway: row.takeaway,
    tags: row.tags ?? [],
    type: row.type ?? undefined,
    originalSubtitle: row.original_subtitle ?? undefined,
    content: row.content ?? undefined,
    topics: row.topics ?? [],
    createdAt: row.created_at,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    isStarred: Boolean(row.is_starred),
    segmentIds: Array.isArray(row.segment_ids) ? row.segment_ids : [],
    startSec: row.start_sec ?? undefined,
    endSec: row.end_sec ?? undefined,
    source: row.source,
  }
}

function rowToConversation(row) {
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title ?? undefined,
    question: row.question,
    quote: row.quote ?? '',
    answer: row.answer,
    citations: Array.isArray(row.citations) ? row.citations : [],
    followUps: Array.isArray(row.follow_ups) ? row.follow_ups : [],
    createdAt: row.created_at,
  }
}

function rowToTranslation(row) {
  return {
    videoId: row.video_id,
    language: row.language,
    segments: row.segments && typeof row.segments === 'object' && !Array.isArray(row.segments)
      ? row.segments
      : {},
    status: row.status ?? 'ready',
    updatedAt: row.updated_at,
  }
}

function stableId(prefix, ...parts) {
  const hash = crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 24)
  return `${prefix}-${hash}`
}

function normalizeContractTranscript(value) {
  return (Array.isArray(value) ? value : [])
    .flatMap((segment, index) => {
      if (!segment || typeof segment !== 'object') return []
      const text = String(segment.text ?? '').replace(/\s+/g, ' ').trim()
      if (!text) return []
      const startSec = Math.max(0, Number(segment.startSec ?? segment.start_sec) || 0)
      const endSec = Math.max(startSec, Number(segment.endSec ?? segment.end_sec) || startSec)
      return [{
        id: String(segment.id ?? `seg-${index + 1}`),
        startSec,
        endSec,
        text,
      }]
    })
}

function normalizeGuestActivity(value) {
  const activity = value && typeof value === 'object' ? value : {}
  return {
    playedSeconds: Math.max(0, Number(activity.playedSeconds) || 0),
    hasStartedWatching: activity.hasStartedWatching === true,
    hasAskedAI: activity.hasAskedAI === true,
    hasTemporaryNotes: activity.hasTemporaryNotes === true,
    askCount: Math.max(0, Number(activity.askCount) || 0),
  }
}

function guestActivityRequiresLearning(activity) {
  return activity.playedSeconds > 0
    || activity.hasStartedWatching
    || activity.hasAskedAI
    || activity.hasTemporaryNotes
    || activity.askCount > 0
}

function normalizeGuestNote(note, index, userId, video) {
  if (!note || typeof note !== 'object') return null

  const rawType = String(note.type ?? '').trim()
  const type = ['highlight', 'thought', 'explanation', 'keyIdea', 'reviewQuestion', 'videoBrief'].includes(rawType)
    ? rawType
    : 'explanation'
  const explicitSource = String(note.source ?? '').trim()
  const source = ['manual', 'ai', 'highlight', 'thought'].includes(explicitSource)
    ? explicitSource
    : type === 'thought'
      ? 'thought'
      : type === 'highlight'
        ? 'highlight'
        : 'ai'
  const quote = String(note.quote ?? note.originalSubtitle ?? '').replace(/\s+/g, ' ').trim()
  const content = String(note.content ?? note.note ?? '').trim()
  if (!quote && !content) return null

  const clientTempId = String(note.clientTempId ?? '').trim()
  const id = clientTempId
    ? stableId('guest-note', userId, video.id, clientTempId)
    : stableId('guest-note', userId, video.id, index, quote, content)
  const rawStartSec = note.startSec != null ? Number(note.startSec) : Number.NaN
  const rawEndSec = note.endSec != null ? Number(note.endSec) : Number.NaN
  const hasValidAnchorRange = Number.isFinite(rawStartSec)
    && Number.isFinite(rawEndSec)
    && rawStartSec >= 0
    && rawEndSec >= rawStartSec

  return {
    id,
    videoId: video.id,
    videoTitle: video.title,
    quote: quote || content.slice(0, 240),
    timestamp: String(note.timestampLabel ?? note.timestamp ?? '00:00').trim() || '00:00',
    note: String(note.note ?? content).trim() || content,
    content: content || String(note.note ?? '').trim(),
    takeaway: String(note.takeaway ?? content ?? note.note ?? '').trim() || content || quote,
    tags: Array.isArray(note.tags) ? note.tags.filter((tag) => typeof tag === 'string') : [],
    type,
    originalSubtitle: quote || undefined,
    topics: [],
    source,
    isStarred: false,
    segmentIds: Array.isArray(note.segmentIds)
      ? note.segmentIds.filter((segmentId) => typeof segmentId === 'string').slice(0, 100)
      : [],
    startSec: hasValidAnchorRange ? rawStartSec : undefined,
    endSec: hasValidAnchorRange ? rawEndSec : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
  }
}

function normalizeGuestConversation(record, index, userId, video) {
  if (!record || typeof record !== 'object') return null
  const question = String(record.question ?? '').trim()
  const answer = String(record.answer ?? '').trim()
  if (!question || !answer) return null

  const clientTempId = String(record.clientTempId ?? '').trim()
  const createdAt = String(record.createdAt ?? '').trim() || new Date().toISOString()

  return {
    id: clientTempId
      ? stableId('guest-chat', userId, video.id, clientTempId)
      : stableId('guest-chat', userId, video.id, index, question, answer),
    user_id: userId,
    video_id: video.id,
    video_title: video.title,
    question,
    quote: String(record.quote ?? '').trim() || null,
    answer,
    created_at: createdAt,
  }
}

function parseYoutubeId(input) {
  try {
    const url = new URL(input)
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.split('/').filter(Boolean)[0] ?? null
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
        return url.pathname.split('/').filter(Boolean)[1] ?? null
      }
      return url.searchParams.get('v')
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input
    }
  }

  return null
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function normalizeTranscript(items) {
  const rawSegments = items
    .filter((item) => item.text?.trim())
    .map((item, index) => {
      const hasOffsetMs = item.offset !== undefined
      const startSec = Math.round(hasOffsetMs ? Number(item.offset) / 1000 : Number(item.start))
      const durationSec = Math.max(2, Math.round(hasOffsetMs ? Number(item.duration) / 1000 : Number(item.duration)))
      return {
        id: `raw-${index + 1}`,
        startSec,
        endSec: startSec + durationSec,
        text: item.text.replace(/\s+/g, ' ').trim(),
      }
    })
    .flatMap(splitTurnMarkedSegment)

  return groupTranscriptLines(rawSegments)
}

function splitTurnMarkedSegment(segment) {
  const parts = segment.text.split(/\s*>>\s*/).filter((part) => part.trim())
  if (parts.length <= 1) {
    return [
      {
        ...segment,
        startsTurn: /^>>/.test(segment.text),
        text: segment.text.replace(/^>>\s*/, '').trim(),
      },
    ]
  }

  const totalChars = parts.reduce((sum, part) => sum + part.length, 0)
  const totalDuration = Math.max(1, segment.endSec - segment.startSec)
  let elapsed = 0

  return parts.map((part, index) => {
    const partDuration = Math.max(1, Math.round((part.length / totalChars) * totalDuration))
    const startSec = segment.startSec + elapsed
    elapsed += partDuration
    return {
      ...segment,
      id: `${segment.id}-turn-${index + 1}`,
      startSec,
      endSec: Math.min(segment.endSec, startSec + partDuration),
      startsTurn: index > 0 || (index === 0 && /^>>/.test(segment.text)),
      text: part.trim(),
    }
  })
}

function isSentenceEnd(text) {
  return /[.!?]["')\]]?$/.test(text.trim())
}

function shouldBreakTranscriptLine(current, next) {
  const gap = next.startSec - current.endSec
  const wordCount = current.text.split(/\s+/).filter(Boolean).length
  const nextStartsFreshThought = /^(and|but|so|then|now|because|i|we|you|they|this|that|there|here|when|what|how|why)\b/i.test(
    next.text,
  )
  const nextLooksLikeContinuation = /^[a-z,;:)]/.test(next.text)

  if (next.startsTurn) return true
  if (current.text.length >= 1000) return true
  if (wordCount >= 150) return true
  if (current.text.length >= 360 && !nextLooksLikeContinuation) return true
  if (wordCount >= 54 && !nextLooksLikeContinuation) return true
  if (gap >= 1.4) return true
  if (gap >= 0.75 && (isSentenceEnd(current.text) || nextStartsFreshThought)) return true
  if (isSentenceEnd(current.text) && wordCount >= 8) return true
  if (current.text.length >= 230 && (nextStartsFreshThought || gap >= 0.4)) return true
  return false
}

function groupTranscriptLines(segments) {
  const lines = []
  let current = null

  for (let segment of segments) {
    if (!current) {
      current = { ...segment }
      continue
    }

    if (shouldBreakTranscriptLine(current, segment)) {
      const movedConnector = current.text.match(/\s+(and|but|so|then)$/i)?.[1]
      if (movedConnector) {
        current = {
          ...current,
          text: current.text.replace(/\s+(and|but|so|then)$/i, '').trim(),
        }
        segment = {
          ...segment,
          text: `${movedConnector} ${segment.text}`.replace(/\s+/g, ' ').trim(),
        }
      }
      lines.push(current)
      current = { ...segment }
    } else {
      current = {
        ...current,
        endSec: Math.max(current.endSec, segment.endSec),
        text: `${current.text} ${segment.text}`.replace(/\s+/g, ' ').trim(),
      }
    }
  }

  if (current) lines.push(current)

  return lines.map((line, index) => ({
    id: `yt-${index + 1}`,
    startSec: line.startSec,
    endSec: line.endSec,
    text: line.text,
  }))
}

function transcriptContext(video, limit = null) {
  const transcript = video.transcript ?? []
  const segments = Number.isFinite(limit) ? transcript.slice(0, limit) : transcript
  return segments
    .map((segment) => {
      const segmentId = segment.id ?? `segment-${segment.startSec}`
      return `[${segmentId} | ${formatDuration(segment.startSec)}-${formatDuration(segment.endSec)}] ${segment.text}`
    })
    .join('\n')
}

function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4)
}

function formatTranscriptForPrompt(transcript) {
  return transcript
    .map((segment) => {
      const startSec = Math.max(0, Math.round(Number(segment.startSec) || 0))
      const endSec = Math.max(startSec, Math.round(Number(segment.endSec) || startSec))
      return `[${formatDuration(startSec)}-${formatDuration(endSec)}] ${String(segment.text ?? '').replace(/\s+/g, ' ').trim()}`
    })
    .filter((line) => !line.endsWith('] '))
    .join('\n')
}

function buildTranscriptContext({
  transcript,
  question = '',
  currentPlaybackTime = 0,
  selectedSubtitle = null,
  maxTokens = 12_000,
} = {}) {
  const cleanTranscript = Array.isArray(transcript) ? transcript : []
  const fullContext = formatTranscriptForPrompt(cleanTranscript)
  const fullTokenEstimate = estimateTokens(fullContext)
  if (fullTokenEstimate <= maxTokens) {
    return {
      strategy: 'full',
      context: fullContext,
      tokenEstimate: fullTokenEstimate,
      segmentCount: cleanTranscript.length,
      sourceSegmentCount: cleanTranscript.length,
    }
  }

  const keywords = [...new Set(
    String(question)
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? [],
  )].filter((word) => !['about', 'could', 'explain', 'from', 'have', 'that', 'this', 'video', 'what', 'when', 'where', 'which', 'with', 'would'].includes(word))
  const focusTime = Number(selectedSubtitle?.startSec ?? currentPlaybackTime) || 0
  const ranked = cleanTranscript.map((segment, index) => {
    const text = String(segment.text ?? '').toLowerCase()
    const keywordScore = keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 12 : 0), 0)
    const distance = Math.abs((Number(segment.startSec) || 0) - focusTime)
    const proximityScore = distance <= 45 ? 30 : distance <= 180 ? 18 : distance <= 600 ? 6 : 0
    const selectedScore = selectedSubtitle?.text && text.includes(String(selectedSubtitle.text).toLowerCase().slice(0, 80)) ? 60 : 0
    return { segment, index, score: keywordScore + proximityScore + selectedScore }
  })
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)

  const selectedIndexes = new Set()
  let characterCount = 0
  const characterBudget = maxTokens * 4
  for (const candidate of ranked) {
    const segmentText = String(candidate.segment.text ?? '')
    if (selectedIndexes.size > 0 && characterCount + segmentText.length > characterBudget) continue
    selectedIndexes.add(candidate.index)
    characterCount += segmentText.length
    if (characterCount >= characterBudget) break
  }

  const focusedTranscript = cleanTranscript.filter((_segment, index) => selectedIndexes.has(index))
  const context = formatTranscriptForPrompt(focusedTranscript)
  return {
    strategy: 'focused',
    context,
    tokenEstimate: estimateTokens(context),
    segmentCount: focusedTranscript.length,
    sourceSegmentCount: cleanTranscript.length,
  }
}

function createTranscriptChunks(transcript, userId, videoId, windowSec = 90) {
  const chunks = []
  let current = null

  for (const segment of Array.isArray(transcript) ? transcript : []) {
    const startSec = Math.max(0, Math.round(Number(segment.startSec) || 0))
    const endSec = Math.max(startSec, Math.round(Number(segment.endSec) || startSec))
    const text = String(segment.text ?? '').replace(/\s+/g, ' ').trim()
    const segmentId = String(segment.id ?? `segment-${startSec}`)

    if (!text) continue

    if (!current || (startSec - current.start_sec >= windowSec && current.text.length > 0)) {
      if (current) chunks.push(current)
      current = {
        user_id: userId,
        video_id: videoId,
        chunk_index: chunks.length,
        start_sec: startSec,
        end_sec: endSec,
        text: text,
        segment_ids: [segmentId],
        token_estimate: estimateTokens(text),
      }
      continue
    }

    current.end_sec = Math.max(current.end_sec, endSec)
    current.text = `${current.text}\n${text}`
    current.segment_ids.push(segmentId)
    current.token_estimate = estimateTokens(current.text)
  }

  if (current) chunks.push(current)
  return chunks
}

async function replaceTranscriptChunks(db, userId, videoId, transcript) {
  const { error: deleteError } = await db
    .from(transcriptChunksTable)
    .delete()
    .eq('user_id', userId)
    .eq('video_id', videoId)

  if (deleteError) {
    throw deleteError
  }

  const chunks = createTranscriptChunks(transcript, userId, videoId)
  if (chunks.length === 0) {
    return
  }

  const { error: insertError } = await db.from(transcriptChunksTable).insert(chunks)
  if (insertError) {
    throw insertError
  }
}

function parseStructuredAiResponse(rawAnswer) {
  const raw = String(rawAnswer ?? '').trim()
  if (!raw) {
    return { answer: 'No answer returned.', timestamps: [], citations: [], followUps: [], saveCandidates: [] }
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const withoutFence = fenced?.[1] ?? raw
  const objectStart = withoutFence.indexOf('{')
  const objectEnd = withoutFence.lastIndexOf('}')
  const candidate = objectStart >= 0 && objectEnd > objectStart
    ? withoutFence.slice(objectStart, objectEnd + 1)
    : withoutFence

  try {
    const parsed = JSON.parse(candidate)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Structured response is not an object.')
    }

    const answer = String(parsed.answer ?? parsed.content ?? '').trim()
    return {
      answer: answer || raw,
      timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [],
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : Array.isArray(parsed.follow_ups) ? parsed.follow_ups : [],
      saveCandidates: Array.isArray(parsed.saveCandidates) ? parsed.saveCandidates : Array.isArray(parsed.save_candidates) ? parsed.save_candidates : [],
    }
  } catch {
    return { answer: raw, timestamps: [], citations: [], followUps: [], saveCandidates: [] }
  }
}

function parseTimestampToSeconds(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/(\d{1,2}:)?\d{1,2}:\d{2}/)
  if (!match) {
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null
  }

  const parts = match[0].split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) {
    return null
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2])
  }

  return Math.max(0, parts[0] * 60 + parts[1])
}

function extractTimestamps(answer) {
  return Array.from(String(answer ?? '').matchAll(/(?:\d{1,2}:)?\d{1,2}:\d{2}/g), (match) => match[0])
}

function findClosestSegment(transcript, timestampSec) {
  let closest = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const segment of transcript) {
    const startSec = Number(segment.startSec)
    const endSec = Number(segment.endSec)
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue

    const distance = timestampSec >= startSec && timestampSec <= endSec
      ? 0
      : Math.min(Math.abs(timestampSec - startSec), Math.abs(timestampSec - endSec))

    if (distance < closestDistance) {
      closest = segment
      closestDistance = distance
    }
  }

  return closest
}

function citationsFromTimestamps(timestamps, answer, video) {
  const transcript = Array.isArray(video.transcript) ? video.transcript : []
  const candidates = (Array.isArray(timestamps) && timestamps.length ? timestamps : extractTimestamps(answer))
    .map(parseTimestampToSeconds)
    .filter((timestamp) => timestamp !== null)

  const seen = new Set()
  const citations = []

  for (const timestampSec of candidates) {
    const segment = findClosestSegment(transcript, timestampSec)
    if (!segment) continue

    const segmentId = String(segment.id ?? `segment-${segment.startSec}`)
    if (seen.has(segmentId)) continue

    seen.add(segmentId)
    citations.push({
      segmentId,
      startSec: Number(segment.startSec),
      endSec: Number(segment.endSec),
      label: `${formatDuration(segment.startSec)}-${formatDuration(segment.endSec)}`,
      text: String(segment.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 360),
    })

    if (citations.length >= 5) break
  }

  return citations
}

function normalizeCitation(candidate, video) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const transcript = Array.isArray(video.transcript) ? video.transcript : []
  const requestedId = String(candidate.segmentId ?? candidate.segment_id ?? candidate.id ?? '').trim()
  const startNumber = Number(candidate.startSec ?? candidate.start_sec ?? candidate.start)
  const segment = transcript.find((item) => item.id === requestedId)
    ?? transcript.find((item) => Number.isFinite(startNumber) && Math.abs(Number(item.startSec) - startNumber) <= 2)

  if (!segment) {
    return null
  }

  return {
    segmentId: segment.id,
    startSec: Number(segment.startSec),
    endSec: Number(segment.endSec),
    label: `${formatDuration(segment.startSec)}-${formatDuration(segment.endSec)}`,
    text: String(candidate.text ?? segment.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 360),
  }
}

function normalizeCitations(citations, video) {
  const seen = new Set()
  return citations
    .map((citation) => normalizeCitation(citation, video))
    .filter((citation) => {
      if (!citation || seen.has(citation.segmentId)) {
        return false
      }
      seen.add(citation.segmentId)
      return true
    })
    .slice(0, 5)
}

function normalizeFollowUps(followUps) {
  return (Array.isArray(followUps) ? followUps : [])
    .map((question) => String(question ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((question, index, array) => array.indexOf(question) === index)
    .slice(0, 3)
}

function normalizeSaveCandidates(saveCandidates) {
  const allowedTypes = new Set(['explanation', 'keyIdea', 'reviewQuestion'])
  return (Array.isArray(saveCandidates) ? saveCandidates : [])
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') return []
      const type = String(candidate.type ?? '').trim()
      const content = String(candidate.content ?? '').replace(/\s+/g, ' ').trim()
      if (!allowedTypes.has(type) || !content) return []
      return [{
        type,
        content: content.slice(0, type === 'reviewQuestion' ? 280 : 520),
        quote: String(candidate.quote ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
        timestamp: String(candidate.timestamp ?? '').trim().slice(0, 16),
      }]
    })
    .slice(0, 5)
}

function normalizeSelectedSubtitle(value) {
  if (!value || typeof value !== 'object') return null
  const text = String(value.text ?? '').replace(/\s+/g, ' ').trim()
  const startSec = Math.max(0, Math.round(Number(value.startSec ?? value.start_sec) || 0))
  const endSec = Math.max(startSec, Math.round(Number(value.endSec ?? value.end_sec) || startSec))
  if (!text) return null
  return { text: text.slice(0, 2000), startSec, endSec }
}

async function fetchOembed(url) {
  try {
    const response = await fetchWithTimeout(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      {},
      metadataTimeoutMs,
    )
    if (response.ok) {
      return response.json()
    }
  } catch {
    // Some local networks cannot reach YouTube directly; noembed keeps the import flow usable.
  }

  const fallback = await fetchWithTimeout(
    `https://noembed.com/embed?url=${encodeURIComponent(url)}`,
    {},
    metadataTimeoutMs,
  )
  if (!fallback.ok) {
    throw new Error('Unable to read YouTube metadata.')
  }
  return fallback.json()
}

async function fetchTranscript(youtubeId, language = 'en') {
  return fetchYouTubeTranscript(youtubeId, { language }).catch((error) => ({
    segments: [],
    language: null,
    availableLanguages: [],
    source: null,
    error: { code: error?.code ?? 'UNKNOWN', message: error?.message ?? 'Transcript request failed.' },
  }))
}

function youtubeIdFromRequest(body) {
  const explicitId = String(body?.youtubeId ?? '').trim()
  if (explicitId) {
    return parseYoutubeId(explicitId)
  }

  return parseYoutubeId(String(body?.youtubeUrl ?? body?.url ?? '').trim())
}

async function parseYouTubeForLearning(body) {
  const youtubeId = youtubeIdFromRequest(body)

  if (!youtubeId) {
    throw new Error('Please provide a valid YouTube URL or YouTube video ID.')
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeId}`
  const transcriptLanguage = String(body?.transcriptLanguage ?? body?.transcript_language ?? body?.language ?? 'en').trim() || 'en'
  const [metadata, transcriptResult] = await Promise.all([
    fetchOembed(canonicalUrl),
    fetchTranscript(youtubeId, transcriptLanguage),
  ])

  const transcript = normalizeTranscript(transcriptResult.segments ?? [])
  const requestedDurationSec = Math.round(Number(body?.durationSec ?? body?.duration_sec) || 0)
  const durationSec = Math.max(transcript[transcript.length - 1]?.endSec ?? 0, requestedDurationSec, 300)
  const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`

  return {
    video: {
      id: `youtube-${youtubeId}`,
      youtubeId,
      youtubeUrl: canonicalUrl,
      title: metadata.title ?? `YouTube video ${youtubeId}`,
      channel: metadata.author_name ?? 'YouTube',
      durationSec,
      durationLabel: formatDuration(durationSec),
      thumbnailUrl,
      coverImage: thumbnailUrl,
      coverEyebrow: metadata.author_name ?? 'YouTube',
      coverTitle: metadata.title ?? `YouTube video ${youtubeId}`,
      coverDetail: 'Imported YouTube video with transcript',
      accent: '#8cb8ff',
      sourceType: 'youtube',
      transcriptLanguage: transcriptResult.language,
      transcriptSource: transcriptResult.source,
      transcriptLanguages: transcriptResult.availableLanguages,
      transcriptError: transcript.length === 0 ? transcriptResult.error ?? null : null,
    },
    transcript,
  }
}

function contractVideoToStoredVideo(temporaryVideo, transcript, status, savedAt = new Date().toISOString()) {
  const youtubeId = String(temporaryVideo.youtubeId ?? parseYoutubeId(temporaryVideo.youtubeUrl ?? temporaryVideo.id) ?? '').trim()
  const videoId = youtubeId ? `youtube-${youtubeId}` : String(temporaryVideo.id ?? `temporary-${Date.now()}`)
  const durationSec = Math.max(Number(temporaryVideo.durationSec) || 0, transcript[transcript.length - 1]?.endSec ?? 0)
  const lastPositionSec = Math.max(0, Math.round(Number(temporaryVideo.lastPositionSec ?? 0) || 0))

  return {
    id: videoId,
    title: String(temporaryVideo.title ?? `YouTube video ${youtubeId || videoId}`).trim(),
    channel: String(temporaryVideo.channel ?? 'YouTube').trim(),
    durationLabel: formatDuration(durationSec),
    durationSec,
    lastPositionSec,
    lastPositionLabel: lastPositionSec > 0 ? `Continue at ${formatDuration(lastPositionSec)}` : 'Not started',
    summary: 'Imported from Discover preview.',
    youtubeUrl: String(temporaryVideo.youtubeUrl ?? (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '')).trim(),
    youtubeId: youtubeId || null,
    accent: '#8cb8ff',
    coverImage: temporaryVideo.thumbnailUrl ?? null,
    coverEyebrow: String(temporaryVideo.channel ?? 'YouTube').trim(),
    coverTitle: String(temporaryVideo.title ?? '').trim(),
    coverDetail: 'Migrated from guest workspace',
    sourceType: 'youtube',
    transcript,
    transcriptLanguage: null,
    transcriptSource: null,
    transcriptLanguages: [],
    transcriptError: transcript.length === 0 ? { code: 'NO_TRANSCRIPT', message: 'No transcript was provided during migration.' } : null,
    status,
    isFavourite: false,
    tags: [],
    savedAt,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    database: {
      supabaseConfigured: isSupabaseConfigured,
    },
    captions: {
      supadataConfigured: Boolean(process.env.SUPADATA_API_KEY),
    },
    ai: {
      kimiConfigured: Boolean(process.env.KIMI_API_KEY),
    },
  })
})

app.get('/api/library', requireAuth, async (req, res) => {
  const db = requestSupabase(req)
  const [videosResult, notesResult, conversationsResult, translationsResult] = await Promise.all([
    db.from(videosTable).select('*').eq('user_id', req.user.id).order('saved_at', { ascending: false }),
    db.from(notesTable).select('*').eq('user_id', req.user.id).order('saved_at', { ascending: false }),
    db.from(conversationsTable).select('*').eq('user_id', req.user.id).order('created_at', { ascending: true }),
    db.from(translationsTable).select('*').eq('user_id', req.user.id),
  ])

  const error = videosResult.error ?? notesResult.error ?? conversationsResult.error ?? translationsResult.error
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json({
    videos: (videosResult.data ?? []).map(rowToVideo),
    notes: (notesResult.data ?? []).map(rowToNote),
    conversations: (conversationsResult.data ?? []).map(rowToConversation),
    translations: (translationsResult.data ?? []).map(rowToTranslation),
  })
})

app.post('/api/youtube/preview', validatePreviewBody, previewGlobalLimiter, previewIpLimiter, async (req, res) => {
  try {
    const { video, transcript } = await parseYouTubeForLearning(req.body)
    res.json({
      video: contractVideoFromPreview(video),
      transcript,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to preview this YouTube video.'
    if (isAbortError(error)) {
      return res.status(504).json({ error: 'Video metadata provider timed out.', code: 'UPSTREAM_TIMEOUT' })
    }
    res.status(400).json({ error: message })
  }
})

app.post('/api/youtube/import', requireAuth, validatePreviewBody, importUserLimiter, async (req, res) => {
  try {
    const requestedStatus = req.body?.status === 'learning' ? 'learning' : 'inbox'
    const forceReopen = req.body?.forceReopen === true
    const { video, transcript } = await parseYouTubeForLearning(req.body)

    const importedVideo = {
      ...video,
      lastPositionSec: 0,
      lastPositionLabel: 'Not started',
      summary: 'Imported from YouTube. Ask AI to summarize this video or explain highlighted transcript passages.',
      savedAt: new Date().toISOString(),
      status: requestedStatus,
      transcript,
    }

    const db = requestSupabase(req)
    const { data: existingVideo, error: existingError } = await db
      .from(videosTable)
      .select('*')
      .eq('user_id', req.user.id)
      .eq('id', importedVideo.id)
      .maybeSingle()

    if (existingError) {
      return res.status(500).json({ error: existingError.message })
    }

    if (existingVideo) {
      const existingStatus = existingVideo.status ?? 'inbox'
      const nextStatus = existingStatus === 'done' && !forceReopen
        ? 'done'
        : requestedStatus === 'learning'
          ? 'learning'
          : existingStatus
      const { data: updatedVideo, error: updateError } = await db
        .from(videosTable)
        .update({
          status: nextStatus,
          transcript: importedVideo.transcript,
          transcript_language: importedVideo.transcriptLanguage,
          transcript_source: importedVideo.transcriptSource,
          transcript_languages: importedVideo.transcriptLanguages,
          transcript_error: importedVideo.transcriptError,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', req.user.id)
        .eq('id', importedVideo.id)
        .select('*')
        .single()

      if (updateError) {
        return res.status(500).json({ error: updateError.message })
      }

      await replaceTranscriptChunks(db, req.user.id, updatedVideo.id, updatedVideo.transcript ?? [])
      return res.json({ video: contractVideoFromRow(updatedVideo) })
    }

    const { data, error } = await db
      .from(videosTable)
      .upsert(videoToRow(importedVideo, req.user.id), { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    await replaceTranscriptChunks(db, req.user.id, data.id, data.transcript ?? [])

    res.json({ video: contractVideoFromRow(data) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import this YouTube video.'
    if (isAbortError(error)) {
      return res.status(504).json({ error: 'Video metadata provider timed out.', code: 'UPSTREAM_TIMEOUT' })
    }
    res.status(500).json({ error: message })
  }
})

app.post('/api/videos/:videoId/progress', requireAuth, async (req, res) => {
  try {
    const safePosition = Math.max(0, Math.round(Number(req.body?.positionSec) || 0))
    const db = requestSupabase(req)
    const { data, error } = await db
      .from(videosTable)
      .update({
        last_position_sec: safePosition,
        last_position_label: safePosition > 0 ? `Continue at ${formatDuration(safePosition)}` : 'Not started',
        last_watched_at: new Date().toISOString(),
      })
      .eq('user_id', req.user.id)
      .eq('id', req.params.videoId)
      .select('*')
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    if (!data) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    res.json(rowToVideo(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save video progress.'
    res.status(500).json({ error: message })
  }
})

app.patch('/api/videos/:videoId', requireAuth, async (req, res) => {
  try {
    const patch = {}
    if (req.body?.status !== undefined) {
      if (!['inbox', 'learning', 'done'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Unsupported video status.', code: 'INVALID_REQUEST' })
      }
      patch.status = req.body.status
    }
    if (req.body?.isFavourite !== undefined) {
      if (typeof req.body.isFavourite !== 'boolean') {
        return res.status(400).json({ error: 'isFavourite must be a boolean.', code: 'INVALID_REQUEST' })
      }
      patch.is_favourite = req.body.isFavourite
    }
    if (req.body?.tags !== undefined) {
      if (!Array.isArray(req.body.tags) || req.body.tags.length > 20) {
        return res.status(400).json({ error: 'Video tags must be an array with at most 20 items.', code: 'INVALID_REQUEST' })
      }
      const tags = [...new Set(req.body.tags.map((tag) => String(tag).trim()).filter(Boolean))]
      if (tags.some((tag) => tag.length > 64)) {
        return res.status(400).json({ error: 'Video tags must be 64 characters or fewer.', code: 'INVALID_REQUEST' })
      }
      patch.tags = tags
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No supported video fields were provided.', code: 'INVALID_REQUEST' })
    }

    patch.updated_at = new Date().toISOString()
    const db = requestSupabase(req)
    const { data, error } = await db
      .from(videosTable)
      .update(patch)
      .eq('user_id', req.user.id)
      .eq('id', req.params.videoId)
      .select('*')
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }
    if (!data) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    return res.json(rowToVideo(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update video.'
    return res.status(500).json({ error: message })
  }
})

app.delete('/api/videos/:videoId', requireAuth, async (req, res) => {
  try {
    const videoId = String(req.params.videoId ?? '').trim()
    if (!videoId || videoId.length > 200) {
      return res.status(400).json({ error: 'Invalid video ID.', code: 'INVALID_REQUEST' })
    }

    const db = requestSupabase(req)
    const childTables = [translationsTable, notesTable, conversationsTable, transcriptChunksTable]
    for (const table of childTables) {
      const { error } = await db
        .from(table)
        .delete()
        .eq('user_id', req.user.id)
        .eq('video_id', videoId)
      if (error) {
        return res.status(500).json({ error: error.message })
      }
    }

    const { data, error } = await db
      .from(videosTable)
      .delete()
      .eq('user_id', req.user.id)
      .eq('id', videoId)
      .select('id')
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }
    if (!data) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    return res.json({ deleted: true, videoId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete video.'
    return res.status(500).json({ error: message })
  }
})

app.put('/api/videos/:videoId/translations/:language', requireAuth, async (req, res) => {
  try {
    const videoId = String(req.params.videoId ?? '').trim()
    const language = String(req.params.language ?? '').trim()
    const segments = req.body?.segments
    const status = String(req.body?.status ?? 'ready')

    if (!videoId || videoId.length > 200 || !language || language.length > 64) {
      return res.status(400).json({ error: 'Invalid video or language.', code: 'INVALID_REQUEST' })
    }
    if (!segments || typeof segments !== 'object' || Array.isArray(segments)) {
      return res.status(400).json({ error: 'Translation segments must be an object.', code: 'INVALID_REQUEST' })
    }
    const entries = Object.entries(segments)
    if (entries.length > 2_000 || entries.some(([segmentId, text]) => segmentId.length > 200 || typeof text !== 'string' || text.length > 2_000)) {
      return res.status(400).json({ error: 'Translation cache is outside the supported size.', code: 'INVALID_REQUEST' })
    }
    if (!['partial', 'ready', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Unsupported translation status.', code: 'INVALID_REQUEST' })
    }

    const db = requestSupabase(req)
    const { data, error } = await db
      .from(translationsTable)
      .upsert({
        user_id: req.user.id,
        video_id: videoId,
        language,
        segments,
        status,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,video_id,language' })
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.json(rowToTranslation(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cache translation.'
    return res.status(500).json({ error: message })
  }
})

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const note = req.body?.note
    if (!note?.id || !note?.videoId || !note?.quote) {
      return res.status(400).json({ error: 'Missing note fields.', code: 'INVALID_REQUEST' })
    }
    if (String(note.id).length > 200 || String(note.videoId).length > 200 || String(note.videoTitle ?? '').length > 500) {
      return res.status(400).json({ error: 'Note identity fields are too long.', code: 'INVALID_REQUEST' })
    }
    if (String(note.quote).length > 12_000 || String(note.content ?? '').length > 20_000 || String(note.note ?? '').length > 20_000) {
      return res.status(400).json({ error: 'Note content is too long.', code: 'INVALID_REQUEST' })
    }
    if (!['manual', 'ai', 'highlight', 'thought'].includes(String(note.source ?? ''))) {
      return res.status(400).json({ error: 'Unsupported note source.', code: 'INVALID_REQUEST' })
    }
    if (note.type != null && !['highlight', 'thought', 'explanation', 'keyIdea', 'reviewQuestion', 'videoBrief'].includes(String(note.type))) {
      return res.status(400).json({ error: 'Unsupported note type.', code: 'INVALID_REQUEST' })
    }
    if (!Array.isArray(note.tags ?? []) || (note.tags ?? []).length > 20) {
      return res.status(400).json({ error: 'Note tags are outside the supported size.', code: 'INVALID_REQUEST' })
    }
    if (!Array.isArray(note.segmentIds ?? [])
      || (note.segmentIds ?? []).length > 100
      || (note.segmentIds ?? []).some((segmentId) => typeof segmentId !== 'string' || segmentId.length > 200)) {
      return res.status(400).json({ error: 'Note transcript anchors are outside the supported size.', code: 'INVALID_REQUEST' })
    }
    const hasStartSec = note.startSec != null
    const hasEndSec = note.endSec != null
    if (hasStartSec !== hasEndSec
      || (hasStartSec && (!Number.isFinite(Number(note.startSec))
        || !Number.isFinite(Number(note.endSec))
        || Number(note.startSec) < 0
        || Number(note.endSec) < Number(note.startSec)))) {
      return res.status(400).json({ error: 'Note transcript time range is invalid.', code: 'INVALID_REQUEST' })
    }

    const storedNote = {
      ...note,
      savedAt: new Date().toISOString(),
    }

    const db = requestSupabase(req)
    const { data, error } = await db
      .from(notesTable)
      .upsert(noteToRow(storedNote, req.user.id), { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json(rowToNote(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save note.'
    res.status(500).json({ error: message })
  }
})

app.delete('/api/notes/:noteId', requireAuth, async (req, res) => {
  try {
    const noteId = String(req.params.noteId ?? '').trim()
    if (!noteId || noteId.length > 200) {
      return res.status(400).json({ error: 'Invalid note ID.', code: 'INVALID_REQUEST' })
    }

    const db = requestSupabase(req)
    const { data, error } = await db
      .from(notesTable)
      .delete()
      .eq('user_id', req.user.id)
      .eq('id', noteId)
      .select('id')
      .maybeSingle()

    if (error) {
      return res.status(500).json({ error: error.message })
    }
    if (!data) {
      return res.status(404).json({ error: 'Note not found.' })
    }

    return res.json({ deleted: true, noteId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete note.'
    return res.status(500).json({ error: message })
  }
})

app.post('/api/guest/migrate', requireAuth, async (req, res) => {
  try {
    const temporaryVideo = req.body?.temporaryVideo
    if (!temporaryVideo || typeof temporaryVideo !== 'object') {
      return res.status(400).json({ error: 'Missing temporaryVideo.' })
    }

    const transcript = normalizeContractTranscript(req.body?.transcript)
    const activity = normalizeGuestActivity(req.body?.activity)
    const status = guestActivityRequiresLearning(activity) ? 'learning' : 'inbox'
    const storedVideo = contractVideoToStoredVideo(temporaryVideo, transcript, status)
    const db = requestSupabase(req)

    const { data: existingVideo, error: existingError } = await db
      .from(videosTable)
      .select('*')
      .eq('user_id', req.user.id)
      .eq('id', storedVideo.id)
      .maybeSingle()

    if (existingError) {
      return res.status(500).json({ error: existingError.message })
    }

    const videoRow = {
      ...videoToRow(storedVideo, req.user.id),
      status: existingVideo?.status === 'done' ? 'done' : status,
      transcript,
      last_position_sec: activity.playedSeconds > 0 ? Math.round(activity.playedSeconds) : existingVideo?.last_position_sec ?? 0,
      last_position_label: activity.playedSeconds > 0 ? `Continue at ${formatDuration(activity.playedSeconds)}` : existingVideo?.last_position_label ?? 'Not started',
      last_watched_at: activity.playedSeconds > 0 || activity.hasStartedWatching ? new Date().toISOString() : existingVideo?.last_watched_at ?? null,
      saved_at: existingVideo?.saved_at ?? new Date().toISOString(),
    }

    const { data: savedVideo, error: videoError } = await db
      .from(videosTable)
      .upsert(videoRow, { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (videoError) {
      return res.status(500).json({ error: videoError.message })
    }

    await replaceTranscriptChunks(db, req.user.id, savedVideo.id, transcript)

    const normalizedVideo = rowToVideo(savedVideo)
    const noteRows = (Array.isArray(req.body?.temporaryNotes) ? req.body.temporaryNotes : [])
      .map((note, index) => normalizeGuestNote(note, index, req.user.id, normalizedVideo))
      .filter(Boolean)
      .map((note) => noteToRow(note, req.user.id))
    const conversationRows = (Array.isArray(req.body?.temporaryChatRecords) ? req.body.temporaryChatRecords : [])
      .map((record, index) => normalizeGuestConversation(record, index, req.user.id, normalizedVideo))
      .filter(Boolean)

    const [notesResult, conversationsResult] = await Promise.all([
      noteRows.length
        ? db.from(notesTable).upsert(noteRows, { onConflict: 'user_id,id' }).select('*')
        : Promise.resolve({ data: [], error: null }),
      conversationRows.length
        ? db.from(conversationsTable).upsert(conversationRows, { onConflict: 'user_id,id' }).select('*')
        : Promise.resolve({ data: [], error: null }),
    ])

    const writeError = notesResult.error ?? conversationsResult.error
    if (writeError) {
      return res.status(500).json({ error: writeError.message })
    }

    res.json({
      video: {
        id: savedVideo.id,
        youtubeId: savedVideo.youtube_id,
        status: savedVideo.status,
      },
      notes: (notesResult.data ?? []).map(rowToNote),
      conversations: (conversationsResult.data ?? []).map(rowToConversation),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to migrate guest workspace.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/ask', validateAskBody, askGlobalLimiter, optionalAuth, askIdentityLimiter, async (req, res) => {
  try {
    const apiKey = process.env.KIMI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'KIMI_API_KEY is not configured on the server.' })
    }

    const videoId = String(req.body?.videoId ?? req.body?.video_id ?? '').trim()
    const videoTitle = String(req.body?.videoTitle ?? '').trim()
    const selectedSubtitle = normalizeSelectedSubtitle(req.body?.selectedSubtitle ?? req.body?.selected_subtitle)
    const currentPlaybackTime = Math.max(0, Math.round(Number(req.body?.currentPlaybackTime ?? req.body?.current_playback_time) || 0))
    const answerLanguage = String(req.body?.answerLanguage ?? req.body?.answer_language ?? 'zh-CN').trim() || 'zh-CN'
    const mode = req.body?.mode === 'authenticated' ? 'authenticated' : 'guest'
    const purpose = String(req.body?.purpose ?? 'ask').trim()
    const question = String(req.body?.userQuestion ?? (purpose === 'translate' ? req.body?.question : '')).trim()

    if (!videoId || !question) {
      return res.status(400).json({ error: 'Missing videoId or userQuestion.' })
    }

    if (purpose === 'translate') {
      if (!selectedSubtitle?.text) {
        return res.status(400).json({ error: 'Missing lines to translate.' })
      }

      const messages = [
        {
          role: 'system',
          content:
            'You translate numbered transcript lines. Return only translated numbered lines. Do not summarize, merge, explain, or add extra text.',
        },
        {
          role: 'user',
          content: [
            `Target language: ${answerLanguage}`,
            question,
            'Lines:',
            selectedSubtitle.text,
          ].join('\n\n'),
        },
      ]

      const response = await fetchWithTimeout(`${kimiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: kimiModel,
          thinking: { type: 'disabled' },
          messages,
        }),
      }, kimiTimeoutMs)

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return res.status(response.status).json({ error: data?.error?.message ?? 'Kimi request failed.' })
      }

      return res.json({
        answer: data?.choices?.[0]?.message?.content ?? 'No answer returned.',
        citations: [],
        followUps: [],
        saveCandidates: [],
      })
    }

    if (mode === 'authenticated' && !req.user) {
      return res.status(401).json({ error: 'Please log in first.' })
    }

    let video = {
      id: videoId,
      title: videoTitle || 'Temporary video',
      channel: 'YouTube',
      transcript: normalizeContractTranscript(req.body?.nearbySubtitles),
    }

    if (selectedSubtitle) {
      const hasSelected = video.transcript.some(
        (segment) => Math.abs(Number(segment.startSec) - selectedSubtitle.startSec) < 0.5 && segment.text === selectedSubtitle.text,
      )
      if (!hasSelected) {
        video.transcript = [
          {
            id: 'selected-subtitle',
            startSec: selectedSubtitle.startSec,
            endSec: selectedSubtitle.endSec,
            text: selectedSubtitle.text,
          },
          ...video.transcript,
        ]
      }
    }

    let db = null
    let videoRow = null
    if (mode === 'authenticated') {
      db = requestSupabase(req)
      const result = await db
        .from(videosTable)
        .select('id,title,channel,transcript,duration_sec,tags')
        .eq('user_id', req.user.id)
        .eq('id', videoId)
        .maybeSingle()

      if (result.error) {
        return res.status(500).json({ error: result.error.message })
      }

      if (!result.data) {
        return res.status(404).json({ error: 'Video not found.' })
      }

      videoRow = result.data
      video = rowToVideo(videoRow)
    }

    const transcript = Array.isArray(video.transcript) ? video.transcript : []
    if (transcript.length === 0) {
      return res.status(400).json({ error: 'No subtitle context was provided for this question.' })
    }

    const transcriptSource = buildTranscriptContext({
      transcript,
      question,
      currentPlaybackTime,
      selectedSubtitle,
    })
    const selectedSubtitleBlock = selectedSubtitle
      ? [
          `Focus subtitle timestamp: ${formatDuration(selectedSubtitle.startSec)}-${formatDuration(selectedSubtitle.endSec)}`,
          `Focus subtitle text: ${selectedSubtitle.text}`,
        ].join('\n')
      : ''

    const currentSegment = findClosestSegment(transcript, currentPlaybackTime)
    const currentPlaybackBlock = currentSegment
      ? [
          `Current playback time: ${formatDuration(currentPlaybackTime)}`,
          `Nearest current subtitle: [${formatDuration(currentSegment.startSec)}-${formatDuration(currentSegment.endSec)}] ${currentSegment.text}`,
        ].join('\n')
      : `Current playback time: ${formatDuration(currentPlaybackTime)}`

    const messages = [
      {
        role: 'system',
        content: [
          'You are a NotebookLM-style source-grounded video question answering assistant.',
          'The transcript is the only source. Answer only from the transcript when discussing video content.',
          `Answer language: ${answerLanguage}.`,
          'If the selected subtitle is provided, treat it as focus context, but still use the full transcript as the source.',
          'For factual claims about the video, include evidence timestamps naturally in the answer, such as [12:34].',
          'Use Markdown only for simple paragraphs, bold text, bullet lists, numbered lists, blockquotes, and inline code.',
          'Do not output Markdown tables or complex heading hierarchies.',
          'Return strict JSON only. Do not wrap the JSON in Markdown code fences.',
          'JSON shape: {"answer":"string","timestamps":["MM:SS"],"followUps":["string"],"saveCandidates":[{"type":"explanation|keyIdea|reviewQuestion","content":"string","quote":"string","timestamp":"MM:SS"}]}.',
          'Return 1-5 timestamps that best support the answer. Use timestamps that appear in, or are strongly supported by, the transcript.',
          'Return one concise keyIdea or explanation candidate suitable for a short saved note, plus one reviewQuestion candidate when useful.',
          'Keep note candidates under 520 characters and review questions under 280 characters. These types are internal metadata, not user-facing categories or tags.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Video title: ${video.title}`,
          `Channel: ${video.channel}`,
          currentPlaybackBlock,
          selectedSubtitleBlock,
          `Question: ${question}`,
          `Transcript strategy: ${transcriptSource.strategy}`,
          `Transcript token estimate: ${transcriptSource.tokenEstimate}`,
          `Transcript segments included: ${transcriptSource.segmentCount}/${transcriptSource.sourceSegmentCount}`,
          transcriptSource.strategy === 'full' ? 'Full transcript source:' : 'Focused transcript source:',
          transcriptSource.context,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ]

    const response = await fetchWithTimeout(`${kimiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: kimiModel,
        thinking: { type: 'disabled' },
        messages,
      }),
    }, kimiTimeoutMs)

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message ?? 'Kimi request failed.' })
    }

    const rawAnswer = data?.choices?.[0]?.message?.content ?? 'No answer returned.'
    const structuredAnswer = parseStructuredAiResponse(rawAnswer)
    const answer = structuredAnswer.answer
    const normalizedCitations = normalizeCitations(structuredAnswer.citations, video)
    const citations = normalizedCitations.length > 0
      ? normalizedCitations
      : citationsFromTimestamps(structuredAnswer.timestamps, answer, video)
    const followUps = normalizeFollowUps(structuredAnswer.followUps)
    const saveCandidates = normalizeSaveCandidates(structuredAnswer.saveCandidates)
    let conversation = null

    if (mode === 'authenticated' && db && req.user) {
      const conversationRow = {
        id: stableId('chat', req.user.id, video.id, question, answer, Date.now()),
        user_id: req.user.id,
        video_id: video.id,
        video_title: video.title,
        question,
        quote: selectedSubtitle?.text ?? null,
        answer,
        citations,
        follow_ups: followUps,
        created_at: new Date().toISOString(),
      }
      const { data: savedConversation, error: conversationError } = await db
        .from(conversationsTable)
        .insert(conversationRow)
        .select('*')
        .single()

      if (conversationError) {
        return res.status(500).json({ error: conversationError.message })
      }

      conversation = rowToConversation(savedConversation)
    }

    res.json({ answer, citations, followUps, saveCandidates, conversation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ask AI.'
    if (isAbortError(error)) {
      return res.status(504).json({ error: 'AI provider timed out.', code: 'UPSTREAM_TIMEOUT' })
    }
    res.status(500).json({ error: message })
  }
})

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body is too large.',
      code: 'PAYLOAD_TOO_LARGE',
    })
  }

  if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Request body must be valid JSON.',
      code: 'INVALID_JSON',
    })
  }

  return next(error)
})

app.use(express.static(path.join(__dirname, 'dist')))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

export { app, buildTranscriptContext, normalizeGuestNote, normalizeSaveCandidates, parseStructuredAiResponse }

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  app.listen(port, host, () => {
    console.log(`Video learning app listening on http://${host}:${port}`)
  })
}
