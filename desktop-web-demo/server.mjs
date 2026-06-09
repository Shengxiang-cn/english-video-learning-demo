import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { fetchYouTubeTranscript } from './youtube-transcript-provider.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 4174)
const host = process.env.HOST ?? '0.0.0.0'
const kimiBaseUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1'
const kimiModel = process.env.KIMI_MODEL ?? 'kimi-k2.5'
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
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
const transcriptChunksTable = 'learning_transcript_chunks'

app.use(cors())
app.use(express.json({ limit: '1mb' }))

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
    created_at: note.createdAt ?? new Date().toISOString(),
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
    isStarred: Boolean(row.is_starred),
    source: row.source,
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

function buildTranscriptContext({ transcript, strategy = 'full' } = {}) {
  const cleanTranscript = Array.isArray(transcript) ? transcript : []

  if (strategy === 'hybrid') {
    return {
      strategy,
      context: formatTranscriptForPrompt(cleanTranscript),
      tokenEstimate: estimateTokens(formatTranscriptForPrompt(cleanTranscript)),
      segmentCount: cleanTranscript.length,
    }
  }

  const context = formatTranscriptForPrompt(cleanTranscript)
  return {
    strategy: 'full',
    context,
    tokenEstimate: estimateTokens(context),
    segmentCount: cleanTranscript.length,
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
        content: content.slice(0, 1600),
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
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
    if (response.ok) {
      return response.json()
    }
  } catch {
    // Some local networks cannot reach YouTube directly; noembed keeps the import flow usable.
  }

  const fallback = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
  if (!fallback.ok) {
    throw new Error('Unable to read YouTube metadata.')
  }
  return fallback.json()
}

async function fetchTranscript(youtubeId) {
  return fetchYouTubeTranscript(youtubeId, { language: 'en' }).catch((error) => ({
    segments: [],
    language: null,
    availableLanguages: [],
    source: null,
    error: { code: error?.code ?? 'UNKNOWN', message: error?.message ?? 'Transcript request failed.' },
  }))
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
  const [videosResult, notesResult] = await Promise.all([
    db.from(videosTable).select('*').order('saved_at', { ascending: false }),
    db.from(notesTable).select('*').order('saved_at', { ascending: false }),
  ])

  const error = videosResult.error ?? notesResult.error
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json({
    videos: (videosResult.data ?? []).map(rowToVideo),
    notes: (notesResult.data ?? []).map(rowToNote),
  })
})

app.post('/api/youtube/import', requireAuth, async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim()
    const youtubeId = parseYoutubeId(url)

    if (!youtubeId) {
      return res.status(400).json({ error: 'Please paste a valid YouTube URL.' })
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeId}`
    const [metadata, transcriptResult] = await Promise.all([
      fetchOembed(canonicalUrl),
      fetchTranscript(youtubeId),
    ])

    const transcript = normalizeTranscript(transcriptResult.segments ?? [])
    const durationSec = Math.max(transcript.at(-1)?.endSec ?? 0, 300)

    const importedVideo = {
      id: `youtube-${youtubeId}`,
      title: metadata.title ?? `YouTube video ${youtubeId}`,
      channel: metadata.author_name ?? 'YouTube',
      durationLabel: formatDuration(durationSec),
      durationSec,
      lastPositionSec: transcript[0]?.startSec ?? 0,
      lastPositionLabel: 'Not started',
      summary: 'Imported from YouTube. Ask AI to summarize this video or explain highlighted transcript passages.',
      youtubeUrl: canonicalUrl,
      youtubeId,
      accent: '#8cb8ff',
      coverImage: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      coverEyebrow: metadata.author_name ?? 'YouTube',
      coverTitle: metadata.title ?? `YouTube video ${youtubeId}`,
      coverDetail: 'Imported YouTube video with transcript',
      sourceType: 'youtube',
      savedAt: new Date().toISOString(),
      transcriptLanguage: transcriptResult.language,
      transcriptSource: transcriptResult.source,
      transcriptLanguages: transcriptResult.availableLanguages,
      transcriptError: transcript.length === 0 ? transcriptResult.error ?? null : null,
      transcript,
    }

    const db = requestSupabase(req)
    const { data, error } = await db
      .from(videosTable)
      .upsert(videoToRow(importedVideo, req.user.id), { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    await replaceTranscriptChunks(db, req.user.id, data.id, data.transcript ?? [])

    res.json(rowToVideo(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import this YouTube video.'
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

app.post('/api/notes', requireAuth, async (req, res) => {
  try {
    const note = req.body?.note
    if (!note?.id || !note?.videoId || !note?.quote) {
      return res.status(400).json({ error: 'Missing note fields.' })
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

app.post('/api/ask', requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.KIMI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'KIMI_API_KEY is not configured on the server.' })
    }

    const videoId = String(req.body?.videoId ?? req.body?.video_id ?? '').trim()
    const question = String(req.body?.question ?? '').trim()
    const selectedSubtitle = normalizeSelectedSubtitle(req.body?.selectedSubtitle ?? req.body?.selected_subtitle)
    const currentPlaybackTime = Math.max(0, Math.round(Number(req.body?.currentPlaybackTime ?? req.body?.current_playback_time) || 0))
    const answerLanguage = String(req.body?.answerLanguage ?? req.body?.answer_language ?? 'zh-CN').trim() || 'zh-CN'
    const purpose = String(req.body?.purpose ?? 'ask').trim()

    if (!videoId || !question) {
      return res.status(400).json({ error: 'Missing videoId or question.' })
    }

    const db = requestSupabase(req)

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

      const response = await fetch(`${kimiBaseUrl}/chat/completions`, {
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
      })

      const data = await response.json()
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

    const { data: videoRow, error: videoError } = await db
      .from(videosTable)
      .select('id,title,channel,transcript,duration_sec,tags')
      .eq('user_id', req.user.id)
      .eq('id', videoId)
      .maybeSingle()

    if (videoError) {
      return res.status(500).json({ error: videoError.message })
    }

    if (!videoRow) {
      return res.status(404).json({ error: 'Video not found.' })
    }

    const video = rowToVideo(videoRow)
    const transcript = Array.isArray(video.transcript) ? video.transcript : []
    if (transcript.length === 0) {
      return res.status(400).json({ error: 'This video does not have a transcript source.' })
    }

    const transcriptSource = buildTranscriptContext({ transcript, strategy: 'full' })
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
          'Explanation, keyIdea, and reviewQuestion are note types, not tags.',
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
          'Full transcript source:',
          transcriptSource.context,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ]

    const response = await fetch(`${kimiBaseUrl}/chat/completions`, {
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
    })

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message ?? 'Kimi request failed.' })
    }

    const rawAnswer = data?.choices?.[0]?.message?.content ?? 'No answer returned.'
    const structuredAnswer = parseStructuredAiResponse(rawAnswer)
    const answer = structuredAnswer.answer
    const citations = citationsFromTimestamps(structuredAnswer.timestamps, answer, video)
      .concat(normalizeCitations(structuredAnswer.citations, video))
      .filter((citation, index, array) => array.findIndex((item) => item.segmentId === citation.segmentId) === index)
      .slice(0, 5)
    const followUps = normalizeFollowUps(structuredAnswer.followUps)
    const saveCandidates = normalizeSaveCandidates(structuredAnswer.saveCandidates)

    res.json({ answer, citations, followUps, saveCandidates })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ask AI.'
    res.status(500).json({ error: message })
  }
})

app.use(express.static(path.join(__dirname, 'dist')))
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(port, host, () => {
  console.log(`Video learning app listening on http://${host}:${port}`)
})
