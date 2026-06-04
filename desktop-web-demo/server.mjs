import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
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
    })
  : null

const videosTable = 'learning_videos'
const notesTable = 'learning_notes'
const conversationsTable = 'learning_conversations'

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
    createdAt: row.created_at,
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

function transcriptContext(video) {
  return (video.transcript ?? [])
    .slice(0, 120)
    .map((segment) => `[${formatDuration(segment.startSec)}] ${segment.text}`)
    .join('\n')
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
  const [videosResult, notesResult, conversationsResult] = await Promise.all([
    db.from(videosTable).select('*').order('saved_at', { ascending: false }),
    db.from(notesTable).select('*').order('saved_at', { ascending: false }),
    db.from(conversationsTable).select('*').order('created_at', { ascending: false }),
  ])

  const error = videosResult.error ?? notesResult.error ?? conversationsResult.error
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json({
    videos: (videosResult.data ?? []).map(rowToVideo),
    notes: (notesResult.data ?? []).map(rowToNote),
    conversations: (conversationsResult.data ?? []).map(rowToConversation),
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

    const video = req.body?.video
    const question = String(req.body?.question ?? '').trim()
    const quote = String(req.body?.quote ?? '').trim()
    const shouldSaveConversation = req.body?.saveConversation === true

    if (!video || !question) {
      return res.status(400).json({ error: 'Missing video or question.' })
    }

    const response = await fetch(`${kimiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: kimiModel,
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content:
              'You are an English long-video learning assistant. Answer in concise Chinese, grounded only in the provided video transcript. If useful, include the English phrase being explained.',
          },
          {
            role: 'user',
            content: [
              `Video title: ${video.title}`,
              `Channel: ${video.channel}`,
              quote ? `Highlighted passage: ${quote}` : '',
              `Question: ${question}`,
              'Transcript:',
              transcriptContext(video),
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message ?? 'Kimi request failed.' })
    }

    const answer = data?.choices?.[0]?.message?.content ?? 'No answer returned.'
    const conversation = shouldSaveConversation
      ? {
          id: `chat-${crypto.randomUUID()}`,
          user_id: req.user.id,
          video_id: video.id,
          video_title: video.title,
          question,
          quote,
          answer,
          created_at: new Date().toISOString(),
        }
      : null

    if (!conversation) {
      return res.json({ answer, conversation: null })
    }

    const db = requestSupabase(req)
    const { data: storedConversation, error: conversationError } = await db
      .from(conversationsTable)
      .insert(conversation)
      .select('*')
      .single()

    if (conversationError) {
      return res.status(500).json({ error: conversationError.message })
    }

    res.json({ answer, conversation: rowToConversation(storedConversation) })
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
