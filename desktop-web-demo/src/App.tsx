import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  FileText,
  Globe,
  Inbox,
  Menu,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Tag,
  Video,
  X,
} from 'lucide-react'
import './App.css'
import {
  askSuggestions,
  catalogVideos,
  initialLibraryIds,
  type DemoVideo,
} from './mockData'

type Screen = 'library' | 'reader'
type RightTab = 'info' | 'note' | 'chat' | 'subtitle'
type InboxTab = 'inbox' | 'later' | 'archive'

type SavedNote = {
  id: string
  videoId: string
  quote: string
  timestamp: string
  note: string
  takeaway: string
  tags: string[]
  source: 'manual' | 'ai' | 'highlight'
}

type ServerLibrary = {
  videos?: DemoVideo[]
  notes?: SavedNote[]
}

type TranscriptSelection = {
  quote: string
  timestamp: string
  segmentIds: string[]
  x: number
  y: number
}

type TranslationBatch = {
  id: string
  language: string
  segments: DemoVideo['transcript']
}

type TranslationStatus = {
  total: number
  completed: number
  failed: TranslationBatch[]
  lastError: string
}

const sidebarCollections = [
  { label: 'Videos', icon: Video },
  { label: 'Tags', icon: Tag },
]

const defaultImportUrl = 'https://www.youtube.com/watch?v=3Y8aq_ofEVs'
const translationLanguages = [
  { label: '中文', value: 'Simplified Chinese' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Korean', value: 'Korean' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'French', value: 'French' },
]
const defaultTranslationLanguage = translationLanguages[0].value

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function videoById(id: string) {
  return catalogVideos.find((video) => video.id === id) ?? catalogVideos[0]
}

function findVideoById(videos: DemoVideo[], id: string) {
  return videos.find((video) => video.id === id) ?? videos[0]
}

function buildTakeaway(video: DemoVideo, quote: string) {
  if (!quote) {
    return `Select a difficult passage in ${video.channel} to ask AI or save a note.`
  }

  if (video.id === 'jenny-design') {
    return 'The speaker is arguing that fast product teams learn in public. Instead of waiting for polished handoffs, they use tighter build-feedback loops across product, design, engineering, and AI behavior.'
  }

  if (video.id === 'learn-faster') {
    return 'The core argument is that design cannot remain a slow approval stage. It has to become an active part of execution, alignment, and fast product learning.'
  }

  return `This quote from ${video.channel} matters because it can be turned into a reusable learning artifact instead of staying trapped inside a long video.`
}

function buildSummary(video: DemoVideo) {
  if (video.id === 'jenny-design') {
    return 'This interview explains how Anthropic product teams move faster by shortening planning cycles and turning design into an active partner in iteration, feedback, and decision-making.'
  }

  if (video.id === 'learn-faster') {
    return 'Jenny Wen describes why the old design process breaks in fast AI product teams, and why design now has to operate inside the build-feedback loop with engineering.'
  }

  return video.summary
}

function handleFromChannel(channel: string) {
  return channel.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function getHostnameLabel(url: string) {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'youtube.com'
  }
}

function parseNumberedTranslations(answer: string, expectedCount: number) {
  const parsed: string[] = []

  answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const numberedMatch = line.match(/^(\d+)\s*[).\u3001:-]\s*(.+)$/)
      if (numberedMatch) {
        const index = Number(numberedMatch[1]) - 1
        if (index >= 0 && index < expectedCount) {
          parsed[index] = numberedMatch[2].trim()
        }
        return
      }

      if (parsed.length === 0) {
        parsed.push(line)
        return
      }

      const lastIndex = parsed.length - 1
      parsed[lastIndex] = [parsed[lastIndex], line].filter(Boolean).join(' ')
    })

  if (parsed.filter(Boolean).length < expectedCount) {
    const fallbackLines = answer
      .split('\n')
      .map((line) => line.replace(/^\s*\d+\s*[).\u3001:-]\s*/, '').trim())
      .filter(Boolean)

    fallbackLines.forEach((line, index) => {
      if (!parsed[index]) {
        parsed[index] = line
      }
    })
  }

  return Array.from({ length: expectedCount }, (_, index) => parsed[index] ?? '')
}

function translationKey(videoId: string, language: string, segmentId: string) {
  return `${videoId}:${language}:${segmentId}`
}

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [rightTab, setRightTab] = useState<RightTab>('info')
  const [inboxTab, setInboxTab] = useState<InboxTab>('inbox')
  const [videos, setVideos] = useState<DemoVideo[]>(catalogVideos)
  const [libraryIds, setLibraryIds] = useState(initialLibraryIds)
  const [selectedVideoId, setSelectedVideoId] = useState(initialLibraryIds[0])
  const [currentPosition, setCurrentPosition] = useState(videoById(initialLibraryIds[0]).lastPositionSec)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [linkInput, setLinkInput] = useState(defaultImportUrl)
  const [chatPrompt, setChatPrompt] = useState(askSuggestions[1])
  const [aiAnswer, setAiAnswer] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showTranslations, setShowTranslations] = useState(false)
  const [translationLanguage, setTranslationLanguage] = useState(defaultTranslationLanguage)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>({
    total: 0,
    completed: 0,
    failed: [],
    lastError: '',
  })
  const [translatedSegments, setTranslatedSegments] = useState<Record<string, string>>({})
  const [isTranscriptFollowing, setIsTranscriptFollowing] = useState(true)
  const [showSyncPrompt, setShowSyncPrompt] = useState(false)
  const [readerLeftWidth, setReaderLeftWidth] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState(
    'This passage matters because it reframes the design process as an adaptive learning loop.'
  )
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([])
  const [toast, setToast] = useState<string | null>('Select text inside the transcript to ask AI or attach a note.')
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelection | null>(null)

  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null)
  const readerLayoutRef = useRef<HTMLDivElement | null>(null)
  const autoScrollResetRef = useRef<number | null>(null)
  const isAutoScrollingRef = useRef(false)

  const selectedVideo = findVideoById(videos, selectedVideoId)
  const transcript = selectedVideo.transcript
  const selectedQuote = transcriptSelection?.quote ?? ''
  const selectedTimestamp = transcriptSelection?.timestamp ?? formatTime(selectedVideo.lastPositionSec)
  const selectedNotes = savedNotes.filter((note) => note.videoId === selectedVideo.id)
  const activeSegmentIndex = transcript.findIndex(
    (segment) => currentPosition >= segment.startSec && currentPosition <= segment.endSec,
  )
  const selectedSegmentIds = transcriptSelection?.segmentIds ?? []

  const chatResponse = useMemo(() => buildTakeaway(selectedVideo, selectedQuote), [selectedQuote, selectedVideo])
  const chatAnswer = aiAnswer || chatResponse

  useEffect(() => {
    let isMounted = true

    async function loadLibrary() {
      try {
        const response = await fetch('/api/library')
        if (!response.ok) {
          return
        }

        const data = (await response.json()) as ServerLibrary
        if (!isMounted) {
          return
        }

        const persistedVideos = data.videos ?? []
        const persistedNotes = data.notes ?? []
        const mergedVideos = [
          ...persistedVideos,
          ...catalogVideos.filter((video) => !persistedVideos.some((persisted) => persisted.id === video.id)),
        ]
        const mergedIds = [
          ...persistedVideos.map((video) => video.id),
          ...initialLibraryIds.filter((id) => !persistedVideos.some((video) => video.id === id)),
        ]

        setVideos(mergedVideos)
        setLibraryIds(mergedIds)
        setSavedNotes(persistedNotes)

        if (persistedVideos.length > 0) {
          setSelectedVideoId(persistedVideos[0].id)
          setCurrentPosition(persistedVideos[0].lastPositionSec || persistedVideos[0].transcript[0]?.startSec || 0)
        }
      } catch {
        setToast('Local API is unavailable, using demo data for now.')
      }
    }

    void loadLibrary()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (screen !== 'reader' || !isPlaying || transcript.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      setCurrentPosition((position) => {
        const next = position + 2
        if (next > transcript[transcript.length - 1].endSec) {
          return transcript[0].startSec
        }
        return next
      })
    }, 1400)

    return () => window.clearInterval(timer)
  }, [isPlaying, screen, transcript])

  useEffect(() => {
    if (screen !== 'reader' || activeSegmentIndex < 0) return

    if (isTranscriptFollowing) {
      scrollActiveTranscriptLine('smooth')
      return
    }

    if (isPlaying && !isActiveTranscriptLineVisible()) {
      setShowSyncPrompt(true)
    }
  }, [activeSegmentIndex, isPlaying, isTranscriptFollowing, screen])

  useEffect(() => {
    if (!isPlaying) {
      setShowSyncPrompt(false)
    }
  }, [isPlaying])

  useEffect(() => {
    setAiAnswer('')
  }, [selectedVideoId, selectedQuote])

  useEffect(() => {
    function syncYoutubeProgress(event: MessageEvent) {
      if (typeof event.data !== 'string') return

      try {
        const payload = JSON.parse(event.data)
        const info = payload?.info
        if (payload?.event !== 'infoDelivery' || !info) return

        if (typeof info.currentTime === 'number') {
          setCurrentPosition(info.currentTime)
        }

        if (info.playerState === 1) {
          setIsPlaying(true)
        } else if (info.playerState === 0 || info.playerState === 2) {
          setIsPlaying(false)
        }
      } catch {
        // Ignore non-YouTube postMessage payloads.
      }
    }

    window.addEventListener('message', syncYoutubeProgress)
    return () => window.removeEventListener('message', syncYoutubeProgress)
  }, [])

  useEffect(() => {
    if (screen !== 'reader' || !selectedVideo.youtubeId) return

    const timer = window.setInterval(() => {
      youtubeFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 'video-learning-demo' }),
        '*',
      )
      sendYoutubeCommand('getCurrentTime')
    }, 900)

    return () => window.clearInterval(timer)
  }, [screen, selectedVideo.youtubeId])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => {
      setToast(null)
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (screen !== 'reader') {
      clearNativeSelection()
      return
    }

    function readStableSelection() {
      const container = transcriptContentRef.current
      const selection = window.getSelection()

      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return
      }

      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode

      if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
        return
      }

      const range = selection.getRangeAt(0)
      const quote = selection
        .toString()
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && !/^\d{2}:\d{2}$/.test(line))
        .join('\n')
        .slice(0, 1200)

      if (!quote) {
        return
      }

      const segmentElements = Array.from(container.querySelectorAll<HTMLElement>('[data-segment-id]'))
      const segmentIds = segmentElements
        .filter((element) => {
          try {
            return range.intersectsNode(element)
          } catch {
            return false
          }
        })
        .map((element) => element.dataset.segmentId ?? '')
        .filter(Boolean)

      const firstSegment = transcript.find((segment) => segmentIds.includes(segment.id))
      const rect = range.getBoundingClientRect()

      setTranscriptSelection({
        quote,
        timestamp: firstSegment ? formatTime(firstSegment.startSec) : formatTime(selectedVideo.lastPositionSec),
        segmentIds,
        x: Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120),
        y: Math.max(rect.top - 18, 96),
      })
    }

    function scheduleSelectionRead() {
      window.setTimeout(readStableSelection, 80)
    }

    function clearWhenClickingOutside(event: MouseEvent) {
      const target = event.target as Node | null
      if (!target) return

      const transcript = transcriptContentRef.current
      const actionDock = document.querySelector('.transcript-action-dock')
      const selectionFloat = document.querySelector('.selection-float')

      if (transcript?.contains(target) || actionDock?.contains(target) || selectionFloat?.contains(target)) {
        return
      }

      clearNativeSelection()
    }

    document.addEventListener('mouseup', scheduleSelectionRead)
    document.addEventListener('touchend', scheduleSelectionRead)
    document.addEventListener('keyup', scheduleSelectionRead)
    document.addEventListener('mousedown', clearWhenClickingOutside)

    return () => {
      document.removeEventListener('mouseup', scheduleSelectionRead)
      document.removeEventListener('touchend', scheduleSelectionRead)
      document.removeEventListener('keyup', scheduleSelectionRead)
      document.removeEventListener('mousedown', clearWhenClickingOutside)
    }
  }, [screen, selectedVideo.lastPositionSec, transcript])

  function clearNativeSelection() {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    setTranscriptSelection(null)
  }

  function isActiveTranscriptLineVisible() {
    const container = transcriptContentRef.current
    const activeLine = container?.querySelector('.reader-line--active')
    if (!container || !activeLine) return true

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    return lineRect.top >= containerRect.top + 24 && lineRect.bottom <= containerRect.bottom - 24
  }

  function scrollActiveTranscriptLine(behavior: ScrollBehavior = 'smooth') {
    const activeLine = transcriptContentRef.current?.querySelector('.reader-line--active')
    if (!activeLine) return

    isAutoScrollingRef.current = true
    activeLine.scrollIntoView({ block: 'center', behavior })
    setShowSyncPrompt(false)

    if (autoScrollResetRef.current) {
      window.clearTimeout(autoScrollResetRef.current)
    }
    autoScrollResetRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, 420)
  }

  function handleTranscriptScroll() {
    if (isAutoScrollingRef.current || screen !== 'reader' || activeSegmentIndex < 0) return

    const isVisible = isActiveTranscriptLineVisible()
    setIsTranscriptFollowing(isVisible)
    if (!isPlaying || isVisible) {
      setShowSyncPrompt(false)
    }
  }

  function sendYoutubeCommand(func: 'playVideo' | 'pauseVideo' | 'seekTo' | 'getCurrentTime', args: unknown[] = []) {
    youtubeFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args,
      }),
      '*',
    )
  }

  function openReader(videoId: string) {
    const video = findVideoById(videos, videoId)

    startTransition(() => {
      setSelectedVideoId(videoId)
      setScreen('reader')
      setRightTab('subtitle')
      setCurrentPosition(video.lastPositionSec || video.transcript[0]?.startSec || 0)
      setIsPlaying(false)
    })

    clearNativeSelection()
    setToast(`Opened ${video.title}`)
  }

  function returnToLibrary() {
    setScreen('library')
    setRightTab('info')
    clearNativeSelection()
  }

  function handleSelectRow(videoId: string) {
    setSelectedVideoId(videoId)
    if (screen === 'reader') {
      openReader(videoId)
    }
  }

  function handleSeek(startSec: number) {
    setCurrentPosition(startSec)
    setIsTranscriptFollowing(true)
    setShowSyncPrompt(false)
    if (selectedVideo.youtubeId) {
      sendYoutubeCommand('seekTo', [startSec, true])
      sendYoutubeCommand('playVideo')
      setIsPlaying(true)
    }
  }

  function clampReaderLeftWidth(width: number) {
    const layout = readerLayoutRef.current
    const totalWidth = layout?.getBoundingClientRect().width ?? window.innerWidth
    const minRightPane = 340
    const minLeftPane = 520
    const maxLeftPane = Math.max(minLeftPane, totalWidth - minRightPane)

    return Math.min(Math.max(width, minLeftPane), maxLeftPane)
  }

  function handleVideoResizeStart(mode: 'horizontal' | 'vertical', event: React.PointerEvent<HTMLButtonElement>) {
    const layout = readerLayoutRef.current
    if (!layout) return

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const layoutRect = layout.getBoundingClientRect()
    const heroRect = event.currentTarget.closest('.reader-hero')?.getBoundingClientRect()
    const heroTop = heroRect?.top ?? layoutRect.top

    const resizeClassName = `is-resizing-video--${mode}`
    document.body.classList.add('is-resizing-video', resizeClassName)

    function handlePointerMove(pointerEvent: PointerEvent) {
      const rawWidth =
        mode === 'horizontal'
          ? pointerEvent.clientX - layoutRect.left
          : (pointerEvent.clientY - heroTop) * (16 / 9)
      setReaderLeftWidth(clampReaderLeftWidth(rawWidth))
    }

    function handlePointerUp() {
      document.body.classList.remove('is-resizing-video', resizeClassName)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  async function handleImportUrl() {
    const url = linkInput.trim()
    if (!url) {
      setToast('Paste a YouTube URL first.')
      return
    }

    setIsImporting(true)
    setToast('Importing YouTube metadata and subtitles...')

    try {
      const response = await fetch('/api/youtube/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Failed to import this YouTube URL.')
      }

      const importedVideo = data as DemoVideo
      setVideos((current) => [importedVideo, ...current.filter((video) => video.id !== importedVideo.id)])
      setLibraryIds((current) => [importedVideo.id, ...current.filter((id) => id !== importedVideo.id)])
      setSelectedVideoId(importedVideo.id)
      setCurrentPosition(importedVideo.lastPositionSec || importedVideo.transcript[0]?.startSec || 0)
      setShowAddModal(false)
      setToast(
        importedVideo.transcript.length
          ? 'Imported video card with subtitles.'
          : 'Imported video card, but no transcript was found.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import this YouTube URL.'
      setToast(message)
    } finally {
      setIsImporting(false)
    }
  }

  async function handleAskAi() {
    if (!chatPrompt.trim()) {
      setToast('Type a question for AI first.')
      return
    }

    setRightTab('chat')
    setIsAsking(true)
    setToast('Asking Kimi about this video...')

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video: selectedVideo,
          question: chatPrompt,
          quote: selectedQuote,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'AI request failed.')
      }

      setAiAnswer(String(data.answer ?? 'No answer returned.'))
      setToast('Kimi answer is ready.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI request failed.'
      setToast(message)
    } finally {
      setIsAsking(false)
    }
  }

  async function translateBatch(batch: TranslationBatch) {
    const numberedLines = batch.segments.map((segment, index) => `${index + 1}. ${segment.text}`).join('\n')
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video: selectedVideo,
        question:
          `Translate every numbered transcript line into natural ${batch.language}. Keep the original numbering and return exactly ${batch.segments.length} lines. Do not summarize, merge, explain, or add extra text.`,
        quote: numberedLines,
      }),
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data?.error ?? 'Translation failed.')
    }

    const translatedLines = parseNumberedTranslations(String(data.answer ?? ''), batch.segments.length)

    setTranslatedSegments((current) => {
      const next = { ...current }
      batch.segments.forEach((segment, index) => {
        next[translationKey(selectedVideo.id, batch.language, segment.id)] =
          translatedLines[index] || 'Translation unavailable.'
      })
      return next
    })
  }

  async function runTranslationBatches(batches: TranslationBatch[], totalSegments: number, completedOffset = 0) {
    if (batches.length === 0) {
      return
    }

    setIsTranslating(true)
    setTranslationStatus({
      total: totalSegments,
      completed: completedOffset,
      failed: [],
      lastError: '',
    })

    let completed = completedOffset
    const failed: TranslationBatch[] = []
    let lastError = ''

    for (const batch of batches) {
      try {
        await translateBatch(batch)
        completed += batch.segments.length
      } catch (error) {
        failed.push(batch)
        lastError = error instanceof Error ? error.message : 'Translation failed.'
        setTranslationStatus({
          total: totalSegments,
          completed: Math.min(completed, totalSegments),
          failed,
          lastError,
        })
        setIsTranslating(false)
        setToast('Translation paused after a failed batch. Retry failed or continue later.')
        return
      }

      setTranslationStatus({
        total: totalSegments,
        completed: Math.min(completed, totalSegments),
        failed,
        lastError,
      })
    }

    setIsTranslating(false)
    setToast(`${batches[0].language} captions are ready.`)
  }

  async function handleTranslateCaptions(language = translationLanguage) {
    setShowTranslations(true)

    if (transcript.length === 0) {
      return
    }

    const segmentsToTranslate = transcript.filter(
      (segment) => !translatedSegments[translationKey(selectedVideo.id, language, segment.id)],
    )

    if (segmentsToTranslate.length === 0) {
      setTranslationStatus({
        total: transcript.length,
        completed: transcript.length,
        failed: [],
        lastError: '',
      })
      setToast(`${language} captions are already translated.`)
      return
    }

    const batchSize = 8
    const batches = Array.from({ length: Math.ceil(segmentsToTranslate.length / batchSize) }, (_, index) => ({
      id: `${selectedVideo.id}:${language}:${index}`,
      language,
      segments: segmentsToTranslate.slice(index * batchSize, index * batchSize + batchSize),
    }))

    setToast(`Translating full transcript to ${language}...`)
    await runTranslationBatches(batches, transcript.length, transcript.length - segmentsToTranslate.length)
  }

  async function handleRetryFailedTranslations() {
    if (translationStatus.failed.length === 0) {
      await handleTranslateCaptions()
      return
    }

    const failedBatches = translationStatus.failed
    setToast('Retrying failed translation batches...')
    await runTranslationBatches(failedBatches, translationStatus.total || transcript.length, translationStatus.completed)
  }

  function handleJumpToCurrentSubtitle() {
    setIsTranscriptFollowing(true)
    setShowSyncPrompt(false)
    scrollActiveTranscriptLine('smooth')
  }

  function handleTranslationLanguageChange(language: string) {
    setTranslationLanguage(language)
    void handleTranslateCaptions(language)
  }

  function handleAskSelectedQuote() {
    if (!selectedQuote) {
      setToast('Highlight transcript text first.')
      return
    }

    setChatPrompt(selectedQuote)
    setRightTab('chat')
    setToast('Highlight copied into chat. Add your question, then send.')
  }

  async function saveNote(source: SavedNote['source']) {
    if (!selectedQuote) {
      return
    }

    const note: SavedNote = {
      id: `${selectedVideo.id}-${selectedTimestamp}-${Date.now()}`,
      videoId: selectedVideo.id,
      quote: selectedQuote,
      timestamp: selectedTimestamp,
      note:
        source === 'ai'
          ? `${chatPrompt} ${chatAnswer}`
          : source === 'highlight'
            ? 'Saved as a highlighted passage for review later.'
            : noteDraft,
      takeaway: source === 'ai' ? chatAnswer : buildTakeaway(selectedVideo, selectedQuote),
      tags: ['video-learning', 'transcript', selectedVideo.channel.toLowerCase().replace(/\s+/g, '-')],
      source,
    }

    setSavedNotes((current) => [note, ...current])
    setRightTab('note')
    setShowNoteModal(false)
    clearNativeSelection()
    const savedMessage =
      source === 'ai'
        ? 'Saved AI note to notebook.'
        : source === 'highlight'
          ? 'Saved highlighted passage to notebook.'
          : 'Saved note to notebook.'
    setToast(savedMessage)

    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to persist note.')
      }
    } catch {
      setToast('Note is saved on screen, but server persistence failed.')
    }
  }

  function handleExportMarkdown() {
    const markdown = selectedNotes.length
      ? [
          `# ${selectedVideo.title}`,
          '',
          `Source: ${selectedVideo.channel}`,
          '',
          ...selectedNotes.flatMap((note) => [
            `## ${note.timestamp}`,
            '',
            `> ${note.quote}`,
            '',
            `- Note: ${note.note}`,
            `- Takeaway: ${note.takeaway}`,
            `- Tags: ${note.tags.join(', ')}`,
            '',
          ]),
        ].join('\n')
      : '# No notes yet'

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'reader-video-notes.md'
    anchor.click()
    window.URL.revokeObjectURL(url)
    setToast('Markdown exported.')
  }

  return (
    <main className={`desktop-app ${screen === 'reader' ? 'desktop-app--reader' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1>Reader</h1>
          <div className="sidebar__brand-actions">
            <button className="icon-button" type="button">
              <NotebookPen size={18} />
            </button>
            <button className="icon-button" type="button" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
            </button>
          </div>
        </div>

        <nav className="sidebar__main">
          <div className="sidebar__stack">
            {sidebarCollections.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.label}
                  className={`nav-link nav-link--subtle ${item.label === 'Videos' ? 'nav-link--selected' : ''}`}
                  type="button"
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="sidebar__footer">
          <button className="nav-link nav-link--subtle" type="button">
            <Search size={18} />
            <span>Search</span>
          </button>
          <button className="nav-link nav-link--subtle" type="button">
            <Settings size={18} />
            <span>Preferences</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        {screen === 'reader' ? (
          <button className="reader-menu-button" type="button" onClick={returnToLibrary} aria-label="Open navigation">
            <Menu size={18} />
          </button>
        ) : null}

        <header className="workspace__topbar">
          <div className="workspace__group">
            <div className="library-title">
              <button className="icon-button icon-button--ghost" type="button">
                <Video size={18} />
              </button>
              <strong>Videos</strong>
              <ChevronDown size={16} />
            </div>

            {screen === 'library' ? (
              <div className="tabs">
                {(['inbox', 'later', 'archive'] as InboxTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`tabs__item ${inboxTab === tab ? 'tabs__item--active' : ''}`}
                    type="button"
                    onClick={() => setInboxTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            ) : (
              <div className="reader-controls">
                <button className="icon-button icon-button--ghost" type="button" onClick={returnToLibrary}>
                  <ArrowLeft size={18} />
                </button>
                <button className="icon-button icon-button--ghost" type="button">
                  <FileText size={18} />
                </button>
                <button className="icon-button icon-button--ghost" type="button">
                  <Video size={18} />
                </button>
                <button className="icon-button icon-button--ghost" type="button">
                  <Globe size={18} />
                </button>
              </div>
            )}
          </div>

          <div className="workspace__group workspace__group--right">
            <button className="date-filter" type="button">
              <Clock3 size={18} />
              <span>{screen === 'library' ? 'Date moved' : 'Sort by timestamp'}</span>
              <ChevronDown size={16} />
            </button>
            <button className="secondary-button secondary-button--strong" type="button" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
              <span>Add YouTube URL</span>
            </button>
            <button className="icon-button icon-button--mobile" type="button" onClick={() => setShowAddModal(true)} aria-label="Add YouTube URL">
              <Plus size={18} />
            </button>
          </div>
        </header>

        {screen === 'library' ? (
          <div className="library-layout">
            <section className="list-pane">
              <form
                className="url-import-bar"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleImportUrl()
                }}
              >
                <label>
                  <span>YouTube URL</span>
                  <input
                    value={linkInput}
                    onChange={(event) => setLinkInput(event.target.value)}
                    placeholder="Paste a YouTube URL, then import subtitles"
                    disabled={isImporting}
                  />
                </label>
                <button className="secondary-button secondary-button--strong" type="submit" disabled={isImporting || !linkInput.trim()}>
                  {isImporting ? 'Parsing...' : 'Parse URL'}
                </button>
              </form>

              <div className="rows">
                {libraryIds.map((videoId, index) => {
                  const video = findVideoById(videos, videoId)
                  const isActive = video.id === selectedVideoId

                  return (
                    <button
                      key={video.id}
                      className={`library-row ${isActive ? 'library-row--active' : ''}`}
                      type="button"
                      onClick={() => handleSelectRow(video.id)}
                      onDoubleClick={() => openReader(video.id)}
                    >
                        <div className="library-row__thumb" style={{ background: `linear-gradient(160deg, #f9f5ef, ${video.accent})` }}>
                          {video.coverImage ? <img alt={video.title} src={video.coverImage} /> : null}
                          <span className="library-row__duration">{video.durationLabel}</span>
                        </div>
                      <div className="library-row__content">
                        <div className="library-row__title-line">
                          <h3>{video.title}</h3>
                          <span>{index === 0 ? '1:43 pm' : index === 1 ? '1:34 pm' : '1:30 pm'}</span>
                        </div>
                        <p>{buildSummary(video)}</p>
                        <div className="library-row__meta">
                          <span>{getHostnameLabel(video.youtubeUrl)}</span>
                          <span>{video.channel}</span>
                          <span>{video.durationLabel}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <aside className="right-pane">
              <div className="right-pane__tabs">
                {(['info', 'note', 'chat'] as RightTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`right-pane__tab ${rightTab === tab ? 'right-pane__tab--active' : ''}`}
                    type="button"
                    onClick={() => setRightTab(tab)}
                  >
                    {tab}
                    {tab === 'note' ? <span>{selectedNotes.length}</span> : null}
                  </button>
                ))}
              </div>

              {rightTab === 'info' ? (
                <div className="detail-panel">
                  <h2>{selectedVideo.title}</h2>
                  <span className="detail-panel__domain">{getHostnameLabel(selectedVideo.youtubeUrl)}</span>

                  <div className="author-card">
                    <div className="author-card__avatar">{selectedVideo.channel.slice(0, 1)}</div>
                    <div>
                      <strong>{selectedVideo.channel}</strong>
                      <p>@{handleFromChannel(selectedVideo.channel)}</p>
                    </div>
                  </div>

                  <section className="meta-section">
                    <p>Summary</p>
                    <div className="summary-card">{buildSummary(selectedVideo)}</div>
                  </section>

                  <section className="meta-section">
                    <p>Metadata</p>
                    <dl className="metadata-list">
                      <div><dt>Type</dt><dd>Video</dd></div>
                      <div><dt>Domain</dt><dd>{getHostnameLabel(selectedVideo.youtubeUrl)}</dd></div>
                      <div><dt>Length</dt><dd>{selectedVideo.durationLabel}</dd></div>
                      <div><dt>Saved</dt><dd>about 2 hours ago</dd></div>
                      <div><dt>Progress</dt><dd>{Math.min(Math.round((currentPosition / selectedVideo.durationSec) * 100), 100)}%</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}

              {rightTab === 'note' ? (
                <div className="detail-panel">
                  <section className="meta-section">
                    <p>Notebook</p>
                    <div className="notebook-actions">
                      <button className="secondary-button" type="button" onClick={handleExportMarkdown}>
                        Export Markdown
                      </button>
                    </div>
                  </section>

                  <div className="note-stack">
                    {selectedNotes.length ? (
                      selectedNotes.map((note) => (
                        <article key={note.id} className="note-card">
                          <span>{note.timestamp}</span>
                          <blockquote>{note.quote}</blockquote>
                          <p>{note.note}</p>
                          <small>{note.takeaway}</small>
                        </article>
                      ))
                    ) : (
                      <article className="empty-card">
                        <strong>No notes yet</strong>
                        <p>Highlight part of the transcript and save a note to populate this notebook.</p>
                      </article>
                    )}
                  </div>
                </div>
              ) : null}

              {rightTab === 'chat' ? (
                <div className="detail-panel detail-panel--chat">
                  <div className="chat-suggestions">
                    {askSuggestions.map((suggestion) => (
                      <button key={suggestion} className="chip-button" type="button" onClick={() => setChatPrompt(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <div className="chat-thread">
                    {aiAnswer ? (
                      <article className="chat-card">
                        <span>Kimi answer</span>
                        <p>{chatAnswer}</p>
                        <div className="chat-card__actions">
                          <button className="secondary-button" type="button" onClick={() => saveNote('ai')} disabled={!selectedQuote}>
                            Save to notebook
                          </button>
                        </div>
                      </article>
                    ) : (
                      <article className="empty-card">
                        <strong>Ask about this video</strong>
                        <p>Highlight transcript text, choose Ask AI, then refine the question here.</p>
                      </article>
                    )}
                  </div>

                  <section className="meta-section chat-composer-section">
                    <p>Chat</p>
                    <div className="chat-composer">
                      <textarea
                        value={chatPrompt}
                        onChange={(event) => setChatPrompt(event.target.value)}
                        placeholder="Ask about this video, or highlight transcript text and choose Ask AI."
                      />
                      <button className="secondary-button secondary-button--strong" type="button" onClick={handleAskAi} disabled={isAsking}>
                        {isAsking ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
	          <div
              ref={readerLayoutRef}
              className="reader-layout"
              style={readerLeftWidth ? { gridTemplateColumns: `${readerLeftWidth}px minmax(340px, 1fr)` } : undefined}
            >
            <section className="reader-main">
              <header className="reader-main__toolbar">
                <div className="reader-main__left">
                  <button className="icon-button icon-button--ghost" type="button">
                    Aa
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <FileText size={18} />
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <Video size={18} />
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <Globe size={18} />
                  </button>
                </div>

                <div className="reader-main__right">
                  <button className="icon-button icon-button--ghost" type="button">
                    <NotebookPen size={18} />
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <Clock3 size={18} />
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <Inbox size={18} />
                  </button>
                  <button className="icon-button icon-button--ghost" type="button">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </header>

              <div className="reader-scroll">
                <article className="reader-hero">
                  <div
                    className={`reader-hero__frame ${selectedVideo.youtubeId ? 'reader-hero__frame--youtube' : ''}`}
                    style={{ background: `linear-gradient(135deg, #f1c18e, ${selectedVideo.accent})` }}
                  >
                    {selectedVideo.youtubeId ? (
                      <iframe
                        ref={youtubeFrameRef}
                        className="reader-hero__iframe"
                        title={selectedVideo.title}
                        src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : selectedVideo.playerImage ?? selectedVideo.coverImage ? (
                      <img
                        className="reader-hero__image"
                        alt={selectedVideo.title}
                        src={selectedVideo.playerImage ?? selectedVideo.coverImage}
                      />
                    ) : null}
                    <div className="reader-hero__scrim" />

	                    <div className="reader-hero__footer">
	                      <div>
	                        <span className="reader-hero__eyebrow">{selectedVideo.coverEyebrow}</span>
	                        <h2>{selectedVideo.coverTitle}</h2>
	                      </div>
	                      <span className="reader-hero__duration">{selectedVideo.durationLabel}</span>
	                    </div>
                    <button
                      className="reader-hero__edge reader-hero__edge--right"
                      type="button"
                      aria-label="Resize video player horizontally"
                      onPointerDown={(event) => handleVideoResizeStart('horizontal', event)}
                    />
                    <button
                      className="reader-hero__edge reader-hero__edge--bottom"
                      type="button"
                      aria-label="Resize video player vertically"
                      onPointerDown={(event) => handleVideoResizeStart('vertical', event)}
                    />
	                  </div>
	                </article>

                <div className="reader-scrubber">
                  <div className="reader-scrubber__fill" style={{ width: `${(currentPosition / selectedVideo.durationSec) * 100}%` }} />
                </div>

              </div>
            </section>

            <aside className="right-pane">
              <div className="right-pane__tabs right-pane__tabs--with-tools">
                <div className="right-pane__tab-list">
                  {(['info', 'note', 'chat', 'subtitle'] as RightTab[]).map((tab) => (
                    <button
                      key={tab}
                      className={`right-pane__tab ${rightTab === tab ? 'right-pane__tab--active' : ''}`}
                      type="button"
                      onClick={() => setRightTab(tab)}
                    >
                      {tab}
                      {tab === 'note' ? <span>{selectedNotes.length}</span> : null}
                    </button>
                  ))}
                </div>

                {rightTab === 'subtitle' ? (
                  <div className="translation-control translation-control--tabs">
                    <label className="translation-picker">
                      <span>To</span>
                      <select value={translationLanguage} onChange={(event) => handleTranslationLanguageChange(event.target.value)}>
                        {translationLanguages.map((language) => (
                          <option key={language.value} value={language.value}>
                            {language.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="secondary-button" type="button" onClick={() => (showTranslations ? setShowTranslations(false) : void handleTranslateCaptions())}>
                      {showTranslations ? 'Hide' : 'Translate'}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => void handleTranslateCaptions()} disabled={isTranslating}>
                      Continue
                    </button>
                    <div className="translation-control__status">
                      <div className="translation-progress" aria-label="Translation progress">
                        <span
                          style={{
                            width: `${translationStatus.total ? Math.round((translationStatus.completed / translationStatus.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        {translationStatus.completed}/{translationStatus.total || transcript.length}
                        {translationStatus.failed.length ? ` · ${translationStatus.failed.length} failed` : ''}
                      </small>
                      {translationStatus.failed.length ? (
                        <button className="text-button" type="button" onClick={() => void handleRetryFailedTranslations()} disabled={isTranslating}>
                          Retry failed
                        </button>
                      ) : null}
                      {translationStatus.lastError ? <small className="translation-control__error">{translationStatus.lastError}</small> : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {rightTab === 'info' ? (
                <div className="detail-panel">
                  <h2>{selectedVideo.title}</h2>
                  <span className="detail-panel__domain">{getHostnameLabel(selectedVideo.youtubeUrl)}</span>
                  <div className="author-card">
                    <div className="author-card__avatar">{selectedVideo.channel.slice(0, 1)}</div>
                    <div>
                      <strong>{selectedVideo.channel}</strong>
                      <p>@{handleFromChannel(selectedVideo.channel)}</p>
                    </div>
                  </div>

                  <section className="meta-section">
                    <p>Summary</p>
                    <div className="summary-card">{buildSummary(selectedVideo)}</div>
                  </section>

                  <section className="meta-section">
                    <p>Metadata</p>
                    <dl className="metadata-list">
                      <div><dt>Type</dt><dd>Video</dd></div>
                      <div><dt>Domain</dt><dd>{getHostnameLabel(selectedVideo.youtubeUrl)}</dd></div>
                      <div><dt>Length</dt><dd>{selectedVideo.durationLabel}</dd></div>
                      <div><dt>Progress</dt><dd>{Math.min(Math.round((currentPosition / selectedVideo.durationSec) * 100), 100)}%</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}

              {rightTab === 'note' ? (
                <div className="detail-panel">
                  <section className="meta-section">
                    <p>Notebook</p>
                    <div className="notebook-actions">
                      <button className="secondary-button" type="button" onClick={handleExportMarkdown}>
                        Export Markdown
                      </button>
                    </div>
                  </section>

                  <div className="note-stack">
                    {selectedNotes.length ? (
                      selectedNotes.map((note) => (
                        <article key={note.id} className="note-card">
                          <span>{note.timestamp}</span>
                          <blockquote>{note.quote}</blockquote>
                          <p>{note.note}</p>
                          <small>{note.takeaway}</small>
                        </article>
                      ))
                    ) : (
                      <article className="empty-card">
                        <strong>No notes yet</strong>
                        <p>Use the floating selection actions in the transcript to save notes or AI explanations.</p>
                      </article>
                    )}
                  </div>
                </div>
              ) : null}

              {rightTab === 'chat' ? (
                <div className="detail-panel detail-panel--chat">
                  <div className="chat-suggestions">
                    {askSuggestions.map((suggestion) => (
                      <button key={suggestion} className="chip-button" type="button" onClick={() => setChatPrompt(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <div className="chat-thread">
                    {aiAnswer ? (
                      <article className="chat-card">
                        <span>Kimi answer</span>
                        <p>{chatAnswer}</p>
                        <div className="chat-card__actions">
                          <button className="secondary-button" type="button" onClick={() => saveNote('ai')} disabled={!selectedQuote}>
                            Save to notebook
                          </button>
                        </div>
                      </article>
                    ) : (
                      <article className="empty-card">
                        <strong>Ask about this video</strong>
                        <p>Highlight transcript text, choose Ask AI, then refine the question here.</p>
                      </article>
                    )}
                  </div>

                  <section className="meta-section chat-composer-section">
                    <p>Chat</p>
                    <div className="chat-composer">
                      <textarea
                        value={chatPrompt}
                        onChange={(event) => setChatPrompt(event.target.value)}
                        placeholder="Ask about this video, or highlight transcript text and choose Ask AI."
                      />
                      <button className="secondary-button secondary-button--strong" type="button" onClick={handleAskAi} disabled={isAsking}>
                        {isAsking ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}

              {rightTab === 'subtitle' ? (
                <div className="detail-panel detail-panel--subtitle">
                  <section className="reader-text reader-text--side">
                    <div className="highlight-bar" />
                    <div ref={transcriptContentRef} className="reader-text__content" onScroll={handleTranscriptScroll}>
                      {showSyncPrompt ? (
                        <div className="sync-prompt">
                          <span>Subtitle position is away from the video.</span>
                          <button type="button" onClick={handleJumpToCurrentSubtitle}>
                            Jump back
                          </button>
                        </div>
                      ) : null}
                      {showSyncPrompt ? (
                        <button className="secondary-button secondary-button--strong" type="button" onClick={handleJumpToCurrentSubtitle}>
                          Jump to current subtitle
                        </button>
                      ) : null}
                      {transcript.length === 0 ? (
                        <article className="empty-card">
                          <strong>No transcript found</strong>
                          <p>This YouTube video was imported, but captions were not available from the public transcript endpoint.</p>
                        </article>
                      ) : null}
                      {transcript.map((segment, index) => {
                        const isSelected = selectedSegmentIds.includes(segment.id)
                        const isActive = activeSegmentIndex === index
                        const translationText = translatedSegments[translationKey(selectedVideo.id, translationLanguage, segment.id)]

                        return (
                          <article
                            key={segment.id}
                            className={`reader-line ${isSelected ? 'reader-line--selected' : ''} ${isActive ? 'reader-line--active' : ''}`}
                            data-segment-id={segment.id}
                          >
                            <button className="reader-line__time" type="button" onClick={() => handleSeek(segment.startSec)}>
                              {formatTime(segment.startSec)}
                            </button>
                            <div className="reader-line__body">
                              <p className="reader-line__text">{segment.text}</p>
                              {showTranslations && (translationText || isTranslating) ? (
                                <p className="reader-line__translation">{translationText ?? 'Translating...'}</p>
                              ) : null}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </section>

      <AnimatePresence>
        {transcriptSelection ? (
          <motion.div
            className="selection-float"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{ left: transcriptSelection.x, top: transcriptSelection.y }}
          >
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleAskSelectedQuote}
            >
              {isAsking ? 'Asking...' : 'Ask AI'}
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => saveNote('highlight')}>
              Add note
            </button>
            <button className="selection-float__ghost" type="button" onClick={clearNativeSelection}>
              <X size={16} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAddModal ? (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              className="add-modal"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              onSubmit={(event) => {
                event.preventDefault()
                void handleImportUrl()
              }}
            >
              <div className="add-modal__header">
                <input
                  value={linkInput}
                  onChange={(event) => setLinkInput(event.target.value)}
                  placeholder="Paste a YouTube URL"
                  disabled={isImporting}
                />
                <button className="secondary-button secondary-button--strong" type="submit" disabled={isImporting || !linkInput.trim()}>
                  {isImporting ? 'Parsing...' : 'Import video'}
                </button>
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setShowAddModal(false)}>
                  {isImporting ? <span className="add-modal__spinner" /> : <X size={20} />}
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showNoteModal ? (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="note-modal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
              <div className="note-modal__header">
                <strong>Add note</strong>
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setShowNoteModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="note-modal__body">
                <div className="selected-quote-card">
                  <span>{selectedTimestamp}</span>
                  <blockquote>{selectedQuote}</blockquote>
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  rows={6}
                />
                <div className="note-modal__actions">
                  <button className="secondary-button" type="button" onClick={() => setShowNoteModal(false)}>
                    Cancel
                  </button>
                  <button className="secondary-button secondary-button--strong" type="button" onClick={() => saveNote('manual')}>
                    Save note
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div className="toast" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}>
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}

export default App
