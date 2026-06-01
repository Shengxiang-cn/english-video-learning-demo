import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { YoutubeTranscript } from 'youtube-transcript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT ?? 4174)
const host = process.env.HOST ?? '127.0.0.1'
const kimiBaseUrl = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn/v1'
const kimiModel = process.env.KIMI_MODEL ?? 'kimi-k2.5'

app.use(cors())
app.use(express.json({ limit: '1mb' }))

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
  return items
    .filter((item) => item.text?.trim())
    .slice(0, 240)
    .map((item, index) => {
      const startSec = Math.round(Number(item.offset) / 1000)
      const durationSec = Math.max(2, Math.round(Number(item.duration) / 1000))
      return {
        id: `yt-${index + 1}`,
        startSec,
        endSec: startSec + durationSec,
        speaker: index % 2 === 0 ? 'speaker1' : 'speaker2',
        text: item.text.replace(/\s+/g, ' ').trim(),
      }
    })
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
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transcript request timed out.')), 6000)
      }),
    ])

  return Promise.any([
    withTimeout(YoutubeTranscript.fetchTranscript(youtubeId, { lang: 'en' })),
    withTimeout(YoutubeTranscript.fetchTranscript(youtubeId)),
  ]).catch(() => [])
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/youtube/import', async (req, res) => {
  try {
    const url = String(req.body?.url ?? '').trim()
    const youtubeId = parseYoutubeId(url)

    if (!youtubeId) {
      return res.status(400).json({ error: 'Please paste a valid YouTube URL.' })
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeId}`
    const [metadata, transcriptItems] = await Promise.all([
      fetchOembed(canonicalUrl),
      fetchTranscript(youtubeId),
    ])

    const transcript = normalizeTranscript(transcriptItems)
    const durationSec = Math.max(transcript.at(-1)?.endSec ?? 0, 300)

    res.json({
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
      transcript,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import this YouTube video.'
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
