import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  FileText,
  Globe,
  Inbox,
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
  importExamples,
  initialLibraryIds,
  type DemoVideo,
} from './mockData'

type Screen = 'library' | 'reader'
type RightTab = 'info' | 'notebook' | 'chat'
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

type TranscriptSelection = {
  quote: string
  timestamp: string
  segmentIds: string[]
  x: number
  y: number
}

const sidebarCollections = [
  { label: 'Videos', icon: Video },
  { label: 'Tags', icon: Tag },
]

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function videoById(id: string) {
  return catalogVideos.find((video) => video.id === id) ?? catalogVideos[0]
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
  return new URL(url).hostname.replace('www.', '')
}

function App() {
  const [screen, setScreen] = useState<Screen>('library')
  const [rightTab, setRightTab] = useState<RightTab>('info')
  const [inboxTab, setInboxTab] = useState<InboxTab>('inbox')
  const [libraryIds, setLibraryIds] = useState(initialLibraryIds)
  const [selectedVideoId, setSelectedVideoId] = useState(initialLibraryIds[0])
  const [currentPosition, setCurrentPosition] = useState(videoById(initialLibraryIds[0]).lastPositionSec)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [linkInput, setLinkInput] = useState(importExamples[2].url)
  const [chatPrompt, setChatPrompt] = useState(askSuggestions[1])
  const [noteDraft, setNoteDraft] = useState(
    'This passage matters because it reframes the design process as an adaptive learning loop.'
  )
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([])
  const [toast, setToast] = useState<string | null>('Select text inside the transcript to ask AI or attach a note.')
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelection | null>(null)

  const transcriptContentRef = useRef<HTMLDivElement | null>(null)

  const selectedVideo = videoById(selectedVideoId)
  const transcript = selectedVideo.transcript
  const selectedQuote = transcriptSelection?.quote ?? ''
  const selectedTimestamp = transcriptSelection?.timestamp ?? formatTime(selectedVideo.lastPositionSec)
  const selectedNotes = savedNotes.filter((note) => note.videoId === selectedVideo.id)
  const activeSegmentIndex = transcript.findIndex(
    (segment) => currentPosition >= segment.startSec && currentPosition <= segment.endSec,
  )
  const selectedSegmentIds = transcriptSelection?.segmentIds ?? []

  const chatResponse = useMemo(() => buildTakeaway(selectedVideo, selectedQuote), [selectedQuote, selectedVideo])

  useEffect(() => {
    if (screen !== 'reader' || !isPlaying) {
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

    function syncSelection() {
      const container = transcriptContentRef.current
      const selection = window.getSelection()

      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setTranscriptSelection(null)
        return
      }

      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode

      if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
        setTranscriptSelection(null)
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
        setTranscriptSelection(null)
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

    document.addEventListener('selectionchange', syncSelection)
    return () => document.removeEventListener('selectionchange', syncSelection)
  }, [screen, selectedVideo.lastPositionSec, transcript])

  function clearNativeSelection() {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    setTranscriptSelection(null)
  }

  function openReader(videoId: string) {
    const video = videoById(videoId)

    startTransition(() => {
      setSelectedVideoId(videoId)
      setScreen('reader')
      setRightTab('info')
      setCurrentPosition(video.lastPositionSec || video.transcript[0]?.startSec || 0)
    })

    clearNativeSelection()
    setToast(`Opened ${video.title}`)
  }

  function handleSelectRow(videoId: string) {
    setSelectedVideoId(videoId)
    if (screen === 'reader') {
      openReader(videoId)
    }
  }

  function handleSeek(startSec: number) {
    setCurrentPosition(startSec)
  }

  function handleImport(videoId: string) {
    if (!libraryIds.includes(videoId)) {
      setLibraryIds((current) => [videoId, ...current])
    }

    setShowAddModal(false)
    setSelectedVideoId(videoId)
    setToast('Video imported into Library.')
  }

  function saveNote(source: SavedNote['source']) {
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
          ? `${chatPrompt} ${chatResponse}`
          : source === 'highlight'
            ? 'Saved as a highlighted passage for review later.'
            : noteDraft,
      takeaway: buildTakeaway(selectedVideo, selectedQuote),
      tags: ['video-learning', 'transcript', selectedVideo.channel.toLowerCase().replace(/\s+/g, '-')],
      source,
    }

    setSavedNotes((current) => [note, ...current])
    setRightTab('notebook')
    setShowNoteModal(false)
    clearNativeSelection()
    setToast(
      source === 'ai'
        ? 'Saved AI note to notebook.'
        : source === 'highlight'
          ? 'Saved highlighted passage to notebook.'
          : 'Saved note to notebook.',
    )
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
    <main className="desktop-app">
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
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setScreen('library')}>
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
            <button className="icon-button" type="button" onClick={() => setShowAddModal(true)}>
              <Plus size={18} />
            </button>
          </div>
        </header>

        {screen === 'library' ? (
          <div className="library-layout">
            <section className="list-pane">
              <div className="rows">
                {libraryIds.map((videoId, index) => {
                  const video = videoById(videoId)
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
                {(['info', 'notebook', 'chat'] as RightTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`right-pane__tab ${rightTab === tab ? 'right-pane__tab--active' : ''}`}
                    type="button"
                    onClick={() => setRightTab(tab)}
                  >
                    {tab}
                    {tab === 'notebook' ? <span>{selectedNotes.length}</span> : null}
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

              {rightTab === 'notebook' ? (
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
                <div className="detail-panel">
                  <section className="meta-section">
                    <p>Chat</p>
                    <div className="chat-composer">
                      <input value={chatPrompt} onChange={(event) => setChatPrompt(event.target.value)} />
                    </div>
                  </section>

                  <div className="chat-suggestions">
                    {askSuggestions.map((suggestion) => (
                      <button key={suggestion} className="chip-button" type="button" onClick={() => setChatPrompt(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <article className="chat-card">
                    <span>Pinned selection</span>
                    <blockquote className="chat-quote">
                      {selectedQuote || 'Select transcript text first. Your exact highlighted words will show up here.'}
                    </blockquote>
                    <p>{chatResponse}</p>
                    <button className="secondary-button" type="button" onClick={() => saveNote('ai')} disabled={!selectedQuote}>
                      Save to notebook
                    </button>
                  </article>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
          <div className="reader-layout">
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
                  <div className="reader-hero__frame" style={{ background: `linear-gradient(135deg, #f1c18e, ${selectedVideo.accent})` }}>
                    {selectedVideo.playerImage ?? selectedVideo.coverImage ? (
                      <img
                        className="reader-hero__image"
                        alt={selectedVideo.title}
                        src={selectedVideo.playerImage ?? selectedVideo.coverImage}
                      />
                    ) : null}
                    <div className="reader-hero__scrim" />

                    <button className="play-button play-button--center" type="button" onClick={() => setIsPlaying((value) => !value)}>
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>

                    <div className="reader-hero__footer">
                      <div>
                        <span className="reader-hero__eyebrow">{selectedVideo.coverEyebrow}</span>
                        <h2>{selectedVideo.coverTitle}</h2>
                      </div>
                      <span className="reader-hero__duration">{selectedVideo.durationLabel}</span>
                    </div>
                  </div>
                </article>

                <div className="reader-scrubber">
                  <div className="reader-scrubber__fill" style={{ width: `${(currentPosition / selectedVideo.durationSec) * 100}%` }} />
                </div>

                <section className="reader-text">
                  <div className="highlight-bar" />
                  <div ref={transcriptContentRef} className="reader-text__content">
                    {transcript.map((segment, index) => {
                      const isSelected = selectedSegmentIds.includes(segment.id)
                      const isActive = activeSegmentIndex === index

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
                            <span className={`speaker-pill speaker-pill--${segment.speaker}`}>{segment.speaker}:</span>
                            <p className="reader-line__text">{segment.text}</p>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              </div>
            </section>

            <aside className="right-pane">
              <div className="right-pane__tabs">
                {(['info', 'notebook', 'chat'] as RightTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`right-pane__tab ${rightTab === tab ? 'right-pane__tab--active' : ''}`}
                    type="button"
                    onClick={() => setRightTab(tab)}
                  >
                    {tab}
                    {tab === 'notebook' ? <span>{selectedNotes.length}</span> : null}
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
                      <div><dt>Domain</dt><dd>{new URL(selectedVideo.youtubeUrl).hostname.replace('www.', '')}</dd></div>
                      <div><dt>Length</dt><dd>{selectedVideo.durationLabel}</dd></div>
                      <div><dt>Progress</dt><dd>{Math.min(Math.round((currentPosition / selectedVideo.durationSec) * 100), 100)}%</dd></div>
                    </dl>
                  </section>
                </div>
              ) : null}

              {rightTab === 'notebook' ? (
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
                <div className="detail-panel">
                  <section className="meta-section">
                    <p>Chat</p>
                    <div className="chat-composer">
                      <input value={chatPrompt} onChange={(event) => setChatPrompt(event.target.value)} />
                    </div>
                  </section>

                  <div className="chat-suggestions">
                    {askSuggestions.map((suggestion) => (
                      <button key={suggestion} className="chip-button" type="button" onClick={() => setChatPrompt(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>

                  <article className="chat-card">
                    <span>Pinned selection</span>
                    <blockquote className="chat-quote">
                      {selectedQuote || 'Select transcript text first. Your exact highlighted words will show up here.'}
                    </blockquote>
                    <p>{chatResponse}</p>
                    <button className="secondary-button" type="button" onClick={() => saveNote('ai')} disabled={!selectedQuote}>
                      Save to notebook
                    </button>
                  </article>
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
              onClick={() => {
                setRightTab('chat')
                setToast('AI pane pinned to your highlight.')
              }}
            >
              Ask AI
            </button>
            <button type="button" onClick={() => setShowNoteModal(true)}>
              Add note
            </button>
            <button type="button" onClick={() => saveNote('highlight')}>
              Save
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
                const matchedExample = importExamples.find((example) => example.url === linkInput) ?? importExamples[2]
                handleImport(matchedExample.videoId)
              }}
            >
              <div className="add-modal__header">
                <input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} placeholder="URL" />
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setShowAddModal(false)}>
                  <X size={20} />
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
