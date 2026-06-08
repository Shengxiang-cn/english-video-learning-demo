import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignJustify,
  BadgePlus,
  CircleEllipsis,
  Download,
  House,
  LibraryBig,
  Pause,
  Play,
  Radio,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import './App.css'
import {
  askSuggestions,
  catalogVideos,
  initialLibraryIds,
  type DemoVideo,
} from './mockData'

type View = 'library' | 'learn'
type InboxTab = 'inbox' | 'later' | 'archive'
type LearnPanel = 'info' | 'notebook' | 'chat'
type SavedNote = {
  id: string
  videoId: string
  quote: string
  timestamp: string
  note: string
  source: 'manual' | 'ai'
}

type AiInsight = {
  quote: string
  timestamp: string
  response: string
}

type TranscriptSelection = {
  quote: string
  timestamp: string
  segmentIds: string[]
  x: number
  y: number
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function videoById(id: string) {
  return catalogVideos.find((video) => video.id === id) ?? catalogVideos[0]
}

function domainLabel(url: string) {
  return new URL(url).hostname.replace('www.', '').toUpperCase()
}

function relativeTime(index: number) {
  if (index === 0) return '1:43 pm'
  if (index === 1) return '1:34 pm'
  return '1:27 pm'
}

function buildAiResponse(video: DemoVideo, quote: string, prompt: string) {
  if (!quote) {
    return 'Highlight a difficult passage first. AI answers should always be grounded in the exact transcript you selected.'
  }

  if (video.id === 'jenny-design') {
    return `${prompt} The speakers are saying that when engineering and AI move faster, design cannot rely on slow, polished decks anymore. Design has to become more adaptive and operational.`
  }

  return `${prompt} This passage means the learner should stop watching passively and start extracting reusable notes directly from moments of confusion.`
}

function normalizeVideoIdFromUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl.trim())
    const hostname = parsed.hostname.replace('www.', '')

    if (hostname === 'youtu.be') {
      return parsed.pathname.replace('/', '')
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      return parsed.searchParams.get('v') ?? ''
    }
  } catch {
    return ''
  }

  return ''
}

function App() {
  const [view, setView] = useState<View>('library')
  const [inboxTab, setInboxTab] = useState<InboxTab>('inbox')
  const [libraryIds, setLibraryIds] = useState(initialLibraryIds)
  const [selectedVideoId, setSelectedVideoId] = useState(initialLibraryIds[0])
  const [currentPosition, setCurrentPosition] = useState(videoById(initialLibraryIds[0]).lastPositionSec)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showImportSheet, setShowImportSheet] = useState(false)
  const [showNoteSheet, setShowNoteSheet] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [learnPanel, setLearnPanel] = useState<LearnPanel>('info')
  const [chatPrompt] = useState(askSuggestions[1])
  const [noteDraft, setNoteDraft] = useState('')
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([])
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null)
  const [toast, setToast] = useState<string | null>('Swipe your attention into the transcript, not the chrome.')
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelection | null>(null)

  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const transcriptSheetRef = useRef<HTMLDivElement | null>(null)
  const selectionClearTimerRef = useRef<number | null>(null)
  const selectedVideo = videoById(selectedVideoId)
  const transcript = selectedVideo.transcript
  const continueVideo = videoById('jenny-design')
  const selectedQuote = transcriptSelection?.quote ?? ''
  const selectedTimestamp = transcriptSelection?.timestamp ?? formatTime(selectedVideo.lastPositionSec)
  const selectedNotes = savedNotes.filter((note) => note.videoId === selectedVideo.id)
  const activeSegmentIndex = transcript.findIndex(
    (segment) => currentPosition >= segment.startSec && currentPosition <= segment.endSec,
  )

  const transcriptParagraphs = useMemo(() => {
    const paragraphs: Array<{
      id: string
      segmentIds: string[]
      startSec: number
      paragraph: string
    }> = []

    for (let index = 0; index < transcript.length; index += 2) {
      const slice = transcript.slice(index, index + 2)
      paragraphs.push({
        id: slice.map((segment) => segment.id).join('-'),
        segmentIds: slice.map((segment) => segment.id),
        startSec: slice[0].startSec,
        paragraph: slice.map((segment) => `${segment.speaker}: ${segment.text}`).join(' '),
      })
    }

    return paragraphs
  }, [transcript])

  const aiResponse = useMemo(
    () => buildAiResponse(selectedVideo, selectedQuote, chatPrompt),
    [chatPrompt, selectedQuote, selectedVideo],
  )

  useEffect(() => {
    if (view !== 'learn' || !isPlaying) {
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
  }, [isPlaying, transcript, view])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (view !== 'learn') {
      setTranscriptSelection(null)
      return
    }

    function cancelPendingClear() {
      if (selectionClearTimerRef.current !== null) {
        window.clearTimeout(selectionClearTimerRef.current)
        selectionClearTimerRef.current = null
      }
    }

    function scheduleClearSelection() {
      cancelPendingClear()
      selectionClearTimerRef.current = window.setTimeout(() => {
        setTranscriptSelection(null)
        selectionClearTimerRef.current = null
      }, 120)
    }

    function syncSelection() {
      const container = transcriptContentRef.current
      const selection = window.getSelection()

      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        scheduleClearSelection()
        return
      }

      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode
      if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
        scheduleClearSelection()
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

      if (!quote) {
        scheduleClearSelection()
        return
      }

      const segmentElements = Array.from(container.querySelectorAll<HTMLElement>('[data-segment-ids]'))
      const segmentIds = segmentElements
        .filter((element) => {
          try {
            return range.intersectsNode(element)
          } catch {
            return false
          }
        })
        .flatMap((element) => (element.dataset.segmentIds ?? '').split(','))
        .filter(Boolean)

      const firstSegment = transcript.find((segment) => segmentIds.includes(segment.id))
      const rangeRect = range.getBoundingClientRect()
      const sheetRect = transcriptSheetRef.current?.getBoundingClientRect()
      const x = sheetRect ? rangeRect.left + rangeRect.width / 2 - sheetRect.left : 180
      const y = sheetRect ? rangeRect.top - sheetRect.top + 10 : 60

      cancelPendingClear()
      setTranscriptSelection((current) => {
        const next = {
          quote,
          timestamp: firstSegment ? formatTime(firstSegment.startSec) : formatTime(selectedVideo.lastPositionSec),
          segmentIds,
          x,
          y,
        }

        if (
          current &&
          current.quote === next.quote &&
          current.timestamp === next.timestamp &&
          current.segmentIds.join(',') === next.segmentIds.join(',') &&
          Math.abs(current.x - next.x) < 2 &&
          Math.abs(current.y - next.y) < 2
        ) {
          return current
        }

        return next
      })
    }

    function scheduleSync() {
      window.setTimeout(syncSelection, 20)
    }

    document.addEventListener('selectionchange', syncSelection)
    const container = transcriptContentRef.current
    container?.addEventListener('mouseup', scheduleSync)
    container?.addEventListener('touchend', scheduleSync)

    return () => {
      cancelPendingClear()
      document.removeEventListener('selectionchange', syncSelection)
      container?.removeEventListener('mouseup', scheduleSync)
      container?.removeEventListener('touchend', scheduleSync)
    }
  }, [selectedVideo.lastPositionSec, transcript, view])

  function clearSelection() {
    if (selectionClearTimerRef.current !== null) {
      window.clearTimeout(selectionClearTimerRef.current)
      selectionClearTimerRef.current = null
    }
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    setTranscriptSelection(null)
  }

  function openNoteSheet() {
    setNoteDraft('')
    setShowNoteSheet(true)
    setTranscriptSelection(null)
  }

  function openVideo(videoId: string) {
    const video = videoById(videoId)
    setSelectedVideoId(videoId)
    setCurrentPosition(video.lastPositionSec || video.transcript[0]?.startSec || 0)
    setView('learn')
    setLearnPanel('info')
    setAiInsight(null)
    clearSelection()
    setToast(`Opened ${video.title}`)
  }

  function handleImport(videoId: string) {
    if (!libraryIds.includes(videoId)) {
      setLibraryIds((current) => [videoId, ...current])
    }
    setImportUrl('')
    setImportMessage(null)
    setShowImportSheet(false)
    openVideo(videoId)
  }

  function handleImportFromUrl() {
    const videoId = normalizeVideoIdFromUrl(importUrl)

    if (!videoId) {
      setImportMessage('Paste a valid YouTube URL to continue.')
      return
    }

    const matchedVideo = catalogVideos.find((video) => normalizeVideoIdFromUrl(video.youtubeUrl) === videoId)

    if (!matchedVideo) {
      setImportMessage('This demo can currently parse YouTube links for the videos already modeled in the prototype.')
      return
    }

    setImportMessage(`Parsed: ${matchedVideo.title}`)
    handleImport(matchedVideo.id)
  }

  function saveManualNote() {
    if (!selectedQuote) {
      return
    }

    setSavedNotes((current) => [
      {
        id: `${selectedVideo.id}-${selectedTimestamp}-${Date.now()}`,
        videoId: selectedVideo.id,
        quote: selectedQuote,
        timestamp: selectedTimestamp,
        note: noteDraft,
        source: 'manual',
      },
      ...current,
    ])
    setShowNoteSheet(false)
    setLearnPanel('notebook')
    clearSelection()
    setToast('Highlight note saved.')
  }

  function askAiAboutSelection() {
    if (!selectedQuote) {
      return
    }

    setAiInsight({
      quote: selectedQuote,
      timestamp: selectedTimestamp,
      response: aiResponse,
    })
    setLearnPanel('chat')
    clearSelection()
    setToast('AI explanation ready.')
  }

  function saveSelectionQuick() {
    if (!selectedQuote) {
      return
    }

    setSavedNotes((current) => [
      {
        id: `${selectedVideo.id}-${selectedTimestamp}-${Date.now()}`,
        videoId: selectedVideo.id,
        quote: selectedQuote,
        timestamp: selectedTimestamp,
        note: 'Saved highlight',
        source: 'manual',
      },
      ...current,
    ])
    setLearnPanel('notebook')
    clearSelection()
    setToast('Saved to notebook.')
  }

  function saveAiInsightToNotebook() {
    if (!aiInsight) {
      return
    }

    setSavedNotes((current) => [
      {
        id: `${selectedVideo.id}-${aiInsight.timestamp}-${Date.now()}`,
        videoId: selectedVideo.id,
        quote: aiInsight.quote,
        timestamp: aiInsight.timestamp,
        note: aiInsight.response,
        source: 'ai',
      },
      ...current,
    ])
    setLearnPanel('notebook')
    clearSelection()
    setToast('AI note saved to notebook.')
  }

  function exportMarkdown() {
    const markdown = selectedNotes.length
      ? [
          `# ${selectedVideo.title}`,
          '',
          ...selectedNotes.flatMap((note) => [
            `## ${note.timestamp}`,
            '',
            `> ${note.quote}`,
            '',
            `- ${note.note}`,
            '',
          ]),
        ].join('\n')
      : '# No notes yet'

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'video-learning-notes.md'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <main className="app-stage">
      <div className="phone-frame">
        <div className="phone-screen">
          <div className="status-bar">
            <span>14:07</span>
            <span>5G 52%</span>
          </div>

          {view === 'library' ? (
            <section className="library-screen">
              <header className="library-header">
                <button className="icon-button plain" type="button">
                  <AlignJustify size={26} />
                </button>
                <div className="trial-pill">Free Trial - 29 days left</div>
                <div className="header-actions">
                  <button className="icon-button circle" type="button" onClick={() => setShowImportSheet(true)}>
                    <BadgePlus size={22} />
                  </button>
                  <button className="icon-button circle" type="button">
                    <CircleEllipsis size={22} />
                  </button>
                </div>
              </header>

              <div className="title-row">
                <h1>Inbox</h1>
                <span>{libraryIds.length}</span>
              </div>

              <div className="feed-list">
                {libraryIds.map((videoId, index) => {
                  const video = videoById(videoId)
                  return (
                    <button key={video.id} className="feed-card" type="button" onClick={() => openVideo(video.id)}>
                      <div className="feed-card__top">
                        <div className="feed-domain">
                          <span className={`domain-dot domain-dot--${video.sourceType}`} />
                          {video.sourceLabel || domainLabel(video.youtubeUrl)}
                        </div>
                        <CircleEllipsis size={18} />
                      </div>
                      <div className="feed-cover">
                        <img src={video.thumbnailUrl} alt={video.title} />
                        <span className="feed-duration">{video.durationLabel}</span>
                      </div>
                      <div className="feed-card__body">
                        <div className="feed-copy">
                          <h2>{video.title}</h2>
                          <p>{video.cardPreview}</p>
                          <small>
                            {relativeTime(index)} · {video.publisherLine}
                          </small>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="inbox-switch">
                {(['inbox', 'later', 'archive'] as InboxTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={inboxTab === tab ? 'inbox-switch__item active' : 'inbox-switch__item'}
                    type="button"
                    onClick={() => setInboxTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="continue-strip">
                <img className="continue-strip__thumb" src={continueVideo.thumbnailUrl} alt={continueVideo.title} />
                <p>Continue: {continueVideo.title}</p>
                <button type="button" onClick={() => openVideo(continueVideo.id)}>
                  <X size={18} />
                </button>
              </div>

              <nav className="bottom-nav">
                <button className="bottom-nav__item" type="button">
                  <House size={22} />
                  <span>Home</span>
                </button>
                <button className="bottom-nav__item active" type="button">
                  <LibraryBig size={22} />
                  <span>Library</span>
                </button>
                <button className="bottom-nav__item" type="button">
                  <Radio size={22} />
                  <span>Feed</span>
                </button>
                <button className="bottom-nav__item" type="button">
                  <Search size={22} />
                  <span>Search</span>
                </button>
                <button className="bottom-nav__item" type="button">
                  <UserRound size={22} />
                  <span>Account</span>
                </button>
              </nav>
            </section>
          ) : (
            <section className="learn-screen">
              <div className="video-stage">
                <div className="video-frame">
                  <img className="video-poster" src={selectedVideo.thumbnailUrl} alt={selectedVideo.title} />
                  <div className="video-overlay">
                    <div className="video-meta">
                      <div className="avatar" />
                      <div>
                        <h2>{selectedVideo.title}</h2>
                        <p>{selectedVideo.channel}</p>
                      </div>
                    </div>
                    <button className="play-hero" type="button" onClick={() => setIsPlaying((value) => !value)}>
                      {isPlaying ? <Pause size={30} /> : <Play size={30} fill="currentColor" />}
                    </button>
                    <div className="video-cta-row">
                      <button className="cta-chip" type="button" onClick={() => setView('library')}>
                        <span>↗</span>
                      </button>
                      <button className="cta-chip wide" type="button">
                        前往平台观看
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div ref={transcriptSheetRef} className="transcript-sheet">
                <div className="sheet-handle top" />
                <div className="reader-tabs">
                  <button
                    className={learnPanel === 'info' ? 'reader-tab active' : 'reader-tab'}
                    type="button"
                    onClick={() => setLearnPanel('info')}
                  >
                    INFO
                  </button>
                  <button
                    className={learnPanel === 'notebook' ? 'reader-tab active' : 'reader-tab'}
                    type="button"
                    onClick={() => setLearnPanel('notebook')}
                  >
                    NOTEBOOK
                    <span>{selectedNotes.length}</span>
                  </button>
                  <button
                    className={learnPanel === 'chat' ? 'reader-tab active' : 'reader-tab'}
                    type="button"
                    onClick={() => setLearnPanel('chat')}
                  >
                    CHAT
                  </button>
                </div>

                {learnPanel === 'info' ? (
                  <div className="info-panel">
                    {transcriptSelection ? (
                      <div
                        className="selection-popover"
                        style={{
                          left: Math.min(Math.max(transcriptSelection.x, 136), 310),
                          top: Math.max(transcriptSelection.y, 54),
                        }}
                      >
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={askAiAboutSelection}
                        >
                          Ask AI
                        </button>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={openNoteSheet}
                        >
                          Add note
                        </button>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={saveSelectionQuick}
                        >
                          Save
                        </button>
                        <button type="button" className="selection-popover__close" onMouseDown={(event) => event.preventDefault()} onClick={clearSelection}>
                          <X size={17} />
                        </button>
                      </div>
                    ) : null}

                    <div ref={transcriptContentRef} className="transcript-scroll">
                      {transcriptParagraphs.map((paragraph) => (
                        <p
                          key={paragraph.id}
                          className={
                            paragraph.segmentIds.includes(transcript[activeSegmentIndex]?.id ?? '')
                              ? 'transcript-paragraph active'
                              : 'transcript-paragraph'
                          }
                          data-segment-ids={paragraph.segmentIds.join(',')}
                        >
                          {paragraph.paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {learnPanel === 'notebook' ? (
                  <div className="panel-scroll notebook-panel">
                    {selectedNotes.length ? (
                      selectedNotes.map((note) => (
                        <article key={note.id} className="note-card">
                          <div className="note-card__meta">
                            <span>{note.timestamp}</span>
                            <strong>{note.source === 'ai' ? 'AI note' : 'Manual note'}</strong>
                          </div>
                          <blockquote>{note.quote}</blockquote>
                          <p>{note.note}</p>
                        </article>
                      ))
                    ) : (
                      <div className="empty-panel">
                        <h3>No notes yet</h3>
                        <p>Highlight transcript text and tap Note to save your first excerpt.</p>
                      </div>
                    )}
                  </div>
                ) : null}

                {learnPanel === 'chat' ? (
                  <div className="panel-scroll chat-panel">
                    {aiInsight ? (
                      <article className="chat-card">
                        <div className="chat-card__label">{aiInsight.timestamp} · Selected passage</div>
                        <blockquote>{aiInsight.quote}</blockquote>
                        <div className="chat-card__label">AI explanation</div>
                        <p>{aiInsight.response}</p>
                        <button className="save-ai-button" type="button" onClick={saveAiInsightToNotebook}>
                          Save to notebook
                        </button>
                      </article>
                    ) : (
                      <div className="empty-panel">
                        <h3>Ask about a highlighted moment</h3>
                        <p>Select a difficult line in the transcript, then tap Ask AI to open the explanation here.</p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="article-footer">{selectedVideo.title} | {selectedVideo.channel}</div>
              </div>
            </section>
          )}

          {showImportSheet ? (
            <div className="sheet-backdrop" onClick={() => setShowImportSheet(false)}>
              <div className="modal-sheet import-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-handle" />
                <div className="modal-head">
                  <button className="text-button" type="button" onClick={() => setShowImportSheet(false)}>
                    Cancel
                  </button>
                  <h3>Import URL</h3>
                  <button className="text-button strong" type="button" onClick={handleImportFromUrl}>
                    Parse
                  </button>
                </div>
                <div className="import-sheet__body">
                  <p className="import-sheet__description">
                    Paste a YouTube URL and the app will parse it into a study-ready video entry.
                  </p>
                  <input
                    className="import-sheet__input"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={importUrl}
                    onChange={(event) => {
                      setImportUrl(event.target.value)
                      if (importMessage) setImportMessage(null)
                    }}
                  />
                  <button className="import-sheet__submit" type="button" onClick={handleImportFromUrl}>
                    Parse URL
                  </button>
                  <p className={importMessage ? 'import-sheet__message active' : 'import-sheet__message'}>
                    {importMessage ?? 'Supported in this demo: YouTube interview links with modeled transcript data.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {showNoteSheet ? (
            <div className="sheet-backdrop" onClick={() => setShowNoteSheet(false)}>
              <div className="modal-sheet note-sheet" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-handle" />
                <div className="modal-head">
                  <button className="text-button" type="button" onClick={() => setShowNoteSheet(false)}>
                    Cancel
                  </button>
                  <h3>Add a highlight note</h3>
                  <button className="text-button strong" type="button" onClick={saveManualNote}>
                    Done
                  </button>
                </div>
                <div className="note-sheet__body">
                  <div className="selected-quote">{selectedQuote || 'Select transcript text first.'}</div>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add a note about why this moment matters..."
                  />
                </div>
              </div>
            </div>
          ) : null}

          {selectedNotes.length && view === 'learn' ? (
            <button className="notes-fab" type="button" onClick={exportMarkdown}>
              <Download size={16} />
              <span>{selectedNotes.length}</span>
            </button>
          ) : null}

          {toast ? <div className="toast">{toast}</div> : null}
        </div>
      </div>
    </main>
  )
}

export default App
