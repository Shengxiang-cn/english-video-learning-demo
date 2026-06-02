import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchYouTubeTranscript } from './youtube-transcript-provider.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 4174)
const host = process.env.HOST ?? '0.0.0.0'
const kimiBaseUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1'
const kimiModel = process.env.KIMI_MODEL ?? 'kimi-k2.5'
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, 'data')
const storePath = path.join(dataDir, 'store.json')

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const defaultStore = {
  videos: [],
  notes: [],
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Unable to read store: ${error.message}`)
    }
    return defaultStore
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true })
  const tmpPath = `${storePath}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  await fs.rename(tmpPath, storePath)
}

async function upsertStoredVideo(video) {
  const store = await readStore()
  const videos = [video, ...store.videos.filter((item) => item.id !== video.id)]
  const nextStore = { ...store, videos }
  await writeStore(nextStore)
  return video
}

async function upsertStoredNote(note) {
  const store = await readStore()
  const notes = [note, ...store.notes.filter((item) => item.id !== note.id)]
  const nextStore = { ...store, notes }
  await writeStore(nextStore)
  return note
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
  if (current.text.length >= 420) return true
  if (wordCount >= 62) return true
  if (current.text.length >= 320 && !nextLooksLikeContinuation) return true
  if (wordCount >= 46 && !nextLooksLikeContinuation) return true
  if (gap >= 1.4) return true
  if (gap >= 0.75 && (isSentenceEnd(current.text) || nextStartsFreshThought)) return true
  if (isSentenceEnd(current.text) && wordCount >= 8) return true
  if (current.text.length >= 230 && (nextStartsFreshThought || gap >= 0.4)) return true
  return false
}

function groupTranscriptLines(segments) {
  const lines = []
  let current = null

  for (const segment of segments) {
    if (!current) {
      current = { ...segment }
      continue
    }

    if (shouldBreakTranscriptLine(current, segment)) {
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
    captions: {
      supadataConfigured: Boolean(process.env.SUPADATA_API_KEY),
    },
    ai: {
      kimiConfigured: Boolean(process.env.KIMI_API_KEY),
    },
  })
})

app.get('/api/library', async (_req, res) => {
  const store = await readStore()
  res.json(store)
})

app.post('/api/youtube/import', async (req, res) => {
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

    await upsertStoredVideo(importedVideo)
    res.json(importedVideo)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import this YouTube video.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/notes', async (req, res) => {
  try {
    const note = req.body?.note
    if (!note?.id || !note?.videoId || !note?.quote) {
      return res.status(400).json({ error: 'Missing note fields.' })
    }

    const storedNote = {
      ...note,
      savedAt: new Date().toISOString(),
    }

    await upsertStoredNote(storedNote)
    res.json(storedNote)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save note.'
    res.status(500).json({ error: message })
  }
})

app.post('/api/ask', async (req, res) => {
  try {
    const apiKey = process.env.KIMI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'KIMI_API_KEY is not configured on the server.' })
    }

    const video = req.body?.video
    const question = String(req.body?.question ?? '').trim()
    const quote = String(req.body?.quote ?? '').trim()

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

    res.json({ answer: data?.choices?.[0]?.message?.content ?? 'No answer returned.' })
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
