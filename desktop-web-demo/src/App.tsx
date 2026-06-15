import { Fragment, startTransition, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronDown,
  Check,
  Copy,
  FileText,
  Home as HomeIcon,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  StickyNote,
  ThumbsUp,
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
import { isSupabaseConfigured, supabase, toAuthUser } from './supabaseClient'

type Screen = 'home' | 'library' | 'reader' | 'notes'
type RightTab = 'info' | 'note' | 'chat' | 'subtitle'
type InboxTab = 'inbox' | 'learning' | 'done'
type LibraryTab = InboxTab | 'favourite'
type NoteType = 'highlight' | 'thought' | 'explanation' | 'keyIdea' | 'reviewQuestion' | 'videoBrief'
type AiNoteType = 'explanation' | 'keyIdea' | 'reviewQuestion'
type VideoMeta = {
  status: InboxTab
  isFavourite: boolean
  tags: string[]
}

type PendingAction =
  | { type: 'open-library' }
  | { type: 'open-notes' }
  | { type: 'save-discover-to-inbox'; discoverId: string }
  | { type: 'save-highlight' }
  | { type: 'add-thought' }
  | { type: 'save-ai-note'; recordId: string; noteType: AiNoteType }
  | { type: 'star-note'; noteId: string }
  | { type: 'edit-tags'; videoId: string }
  | { type: 'save-video' }

type ContractVideo = {
  id: string
  youtubeId: string
  youtubeUrl: string
  title: string
  channel: string
  durationSec: number
  thumbnailUrl: string
  transcript?: DemoVideo['transcript']
  status?: InboxTab
  isFavourite?: boolean
  tags?: string[]
  transcriptLanguage?: string | null
  transcriptSource?: string | null
  transcriptLanguages?: string[]
  transcriptError?: unknown
  lastPositionSec?: number
  lastWatchedAt?: string | null
  savedAt?: string
}

type PreviewResponse = {
  video: ContractVideo
  transcript: DemoVideo['transcript']
}

type ImportResponse = {
  video: ContractVideo
}

type GuestMigrateResponse = {
  video: {
    id: string
    youtubeId: string
    status: InboxTab
  }
  notes: unknown[]
  conversations: unknown[]
}

type TemporaryChatRecord = {
  clientTempId: string
  question: string
  quote: string
  answer: string
  createdAt: string
}

type TemporaryNote = {
  clientTempId: string
  type: AiNoteType
  source: 'ai' | 'thought' | 'highlight' | 'manual'
  quote: string
  timestampLabel: string
  note: string
  content: string
  takeaway: string
  tags: string[]
}

type GuestWorkspace = {
  temporaryVideo: ContractVideo
  transcript: DemoVideo['transcript']
  temporaryChatRecords: TemporaryChatRecord[]
  temporaryNotes: TemporaryNote[]
  askCount: number
  playedSeconds: number
  hasStartedWatching: boolean
  hasAskedAI: boolean
  hasTemporaryNotes: boolean
  createdAt: string
  pendingAction: string | null
}

type AuthUser = {
  id: string
  email: string
  name: string
  createdAt: string
}

type SavedNote = {
  id: string
  videoId: string
  videoTitle?: string
  quote: string
  timestamp: string
  note: string
  takeaway: string
  tags: string[]
  type?: NoteType
  originalSubtitle?: string
  content?: string
  topics?: string[]
  createdAt?: string
  updatedAt?: string
  savedAt?: string
  isStarred?: boolean
  source: 'thought' | 'manual' | 'ai' | 'highlight'
}

type ChatCitation = {
  segmentId: string
  startSec: number
  endSec: number
  label: string
  text: string
}

type AiSaveCandidate = {
  type: AiNoteType
  content: string
  quote?: string
  timestamp?: string
}

type ChatRecord = {
  id: string
  videoId: string
  videoTitle?: string
  question: string
  quote?: string
  answer: string
  citations?: ChatCitation[]
  followUps?: string[]
  saveCandidates?: AiSaveCandidate[]
  createdAt: string
}

type LearningVideoRow = {
  id: string
  title: string
  channel: string
  duration_label: string
  duration_sec: number
  last_position_sec: number
  last_position_label: string
  summary: string
  youtube_url: string
  youtube_id?: string | null
  source_type?: 'mock' | 'youtube'
  accent: string
  cover_image?: string | null
  player_image?: string | null
  cover_eyebrow: string
  cover_title: string
  cover_detail: string
  transcript_language?: string | null
  transcript_source?: string | null
  transcript_languages?: unknown
  transcript_error?: unknown
  transcript: DemoVideo['transcript']
  status?: InboxTab | null
  is_favourite?: boolean | null
  tags?: unknown
  saved_at?: string
}

type LearningNoteRow = {
  id: string
  video_id: string
  video_title?: string | null
  quote: string
  timestamp_label: string
  note: string
  takeaway: string
  tags?: unknown
  type?: NoteType | null
  original_subtitle?: string | null
  content?: string | null
  topics?: unknown
  created_at?: string
  saved_at?: string
  is_starred?: boolean | null
  source: SavedNote['source']
}

type LearningTranslationRow = {
  user_id?: string
  video_id: string
  language: string
  segments?: unknown
  status?: 'partial' | 'ready' | 'failed'
  created_at?: string
  updated_at?: string
}

type PendingChatRequest = {
  id: string
  question: string
  quote: string
  timestamp: string
  selectedSubtitle: SelectedSubtitlePayload | null
}

type FailedChatRequest = PendingChatRequest & {
  message: string
}

type TranscriptSelection = {
  quote: string
  timestamp: string
  startSec: number
  endSec: number
  segmentIds: string[]
  x: number
  y: number
}

type SelectedSubtitlePayload = {
  text: string
  startSec: number
  endSec: number
}

type TranslationBatch = {
  id: string
  language: string
  segments: DemoVideo['transcript']
}

function getAuthRedirectUrl() {
  return typeof window === 'undefined' ? undefined : window.location.origin
}

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication failed.'
  const normalized = message.toLowerCase()

  if (normalized.includes('email not confirmed')) {
    return '邮箱还没有确认。请先打开确认邮件里的链接，再回来登录。'
  }

  if (normalized.includes('invalid login credentials')) {
    return '邮箱或密码不正确。如果刚注册，请先确认邮箱后再登录。'
  }

  if (normalized.includes('user already registered') || normalized.includes('already registered')) {
    return '这个邮箱已经注册过了，请直接登录。'
  }

  if (normalized.includes('signup') && normalized.includes('disabled')) {
    return '当前项目没有开启注册，请在 Supabase Auth 设置里允许 Email 注册。'
  }

  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return '登录状态已失效，请重新登录。'
  }

  return message
}

const defaultVideoMeta: VideoMeta = { status: 'inbox', isFavourite: false, tags: [] }

const sidebarCollections: Array<{ label: string; screen: Screen; icon: typeof Video }> = [
  { label: 'Home', screen: 'home', icon: HomeIcon },
  { label: 'Library', screen: 'library', icon: BookOpen },
  { label: 'Notes', screen: 'notes', icon: StickyNote },
]

type DiscoveryItem = {
  id: string
  youtubeId: string
  youtubeUrl: string
  title: string
  channel: string
  duration: string
  durationSec: number
  thumbnailUrl: string
  difficulty: string
  category: string
  tags: string[]
  transcriptLanguage?: string
  reason: string
  learnBullets: string[]
}

const discoveryItems: DiscoveryItem[] = [
  {
    id: 'karpathy-llm-deep-dive',
    youtubeId: '7xTGNNLPyMI',
    youtubeUrl: 'https://www.youtube.com/watch?v=7xTGNNLPyMI',
    title: 'Deep Dive into LLMs like ChatGPT',
    channel: 'Andrej Karpathy',
    duration: '3:31:25',
    durationSec: 12685,
    thumbnailUrl: 'https://img.youtube.com/vi/7xTGNNLPyMI/maxresdefault.jpg',
    difficulty: 'Advanced',
    category: 'LLM',
    tags: ['AI Agent', 'Research'],
    reason: '运营精选：适合系统理解 LLM、ChatGPT 和现代 AI 工具的底层工作方式。',
    learnBullets: ['建立 LLM 基础概念', '保存 prompt 和训练相关表达', '把长课拆成可复习笔记'],
  },
  {
    id: 'karpathy-how-i-use-llms',
    youtubeId: 'EWvNQjAaOHw',
    youtubeUrl: 'https://www.youtube.com/watch?v=EWvNQjAaOHw&t=4150s',
    title: 'How I use LLMs',
    channel: 'Andrej Karpathy',
    duration: '2:11:14',
    durationSec: 7874,
    thumbnailUrl: 'https://img.youtube.com/vi/EWvNQjAaOHw/maxresdefault.jpg',
    difficulty: 'Intermediate',
    category: 'AI Workflow',
    tags: ['AI Agent', 'Product'],
    reason: '运营精选：适合学习真实工作流里如何使用 LLM，并积累 AI 工具表达。',
    learnBullets: ['理解 LLM 工作流', '保存工具使用相关片段', '整理可复用的学习方法'],
  },
  {
    id: 'jenny-wen-design-process',
    youtubeId: 'eh8bcBIAAFo',
    youtubeUrl: 'https://www.youtube.com/watch?v=eh8bcBIAAFo&t=390s',
    title: 'The design process is dead. Here’s what’s replacing it.',
    channel: "Lenny's Podcast",
    duration: '1:17:26',
    durationSec: 4646,
    thumbnailUrl: 'https://img.youtube.com/vi/eh8bcBIAAFo/maxresdefault.jpg',
    difficulty: 'Intermediate',
    category: 'Design',
    tags: ['Design', 'Product'],
    reason: '运营精选：适合理解 AI 产品团队的新设计流程，以及设计如何进入真实迭代。',
    learnBullets: ['理解 AI 产品设计变化', '保存设计流程相关表达', '沉淀产品协作和决策笔记'],
  },
  {
    id: 'max-schoening-agency-ai-era',
    youtubeId: 'mCO-D3pkviM',
    youtubeUrl: 'https://www.youtube.com/watch?v=mCO-D3pkviM&t=77s',
    title: 'AI era skills: Why cultivating agency matters more than job titles',
    channel: "Lenny's Podcast",
    duration: '1:27:22',
    durationSec: 5242,
    thumbnailUrl: 'https://img.youtube.com/vi/mCO-D3pkviM/maxresdefault.jpg',
    difficulty: 'Intermediate',
    category: 'AI Workflow',
    tags: ['AI Agent', 'Product'],
    reason: '运营精选：适合理解 AI 时代 PM、设计师和工程师边界变化，以及为什么主动性比职位更重要。',
    learnBullets: ['理解 agency 在 AI 时代的价值', '积累产品和设计协作表达', '整理 AI 工作流转型笔记'],
  },
  {
    id: 'cat-wu-anthropic-product-speed',
    youtubeId: 'PplmzlgE0kg',
    youtubeUrl: 'https://www.youtube.com/watch?v=PplmzlgE0kg&t=279s',
    title: "How Anthropic's product team moves faster than anyone else",
    channel: "Lenny's Podcast",
    duration: '1:25:34',
    durationSec: 5134,
    thumbnailUrl: 'https://img.youtube.com/vi/PplmzlgE0kg/maxresdefault.jpg',
    difficulty: 'Intermediate',
    category: 'Product',
    tags: ['Product', 'AI Agent'],
    reason: '运营精选：适合学习 Anthropic 的 AI 产品节奏、Claude Code 产品方法，以及 AI 公司里的 PM 能力变化。',
    learnBullets: ['理解 AI 产品团队如何提速', '保存 Claude Code 和 Cowork 相关表达', '沉淀产品发布和反馈机制笔记'],
  },
]

const commonTags = ['Product', 'English', 'Design', 'Startup', 'AI Agent', 'Research']

const demoNotebookNotes: SavedNote[] = [
  {
    id: 'demo-note-explanation-1',
    videoId: 'jenny-design',
    videoTitle: "How Anthropic's product team moves faster than anyone else",
    quote: 'The design and engineering relationship changes because prototypes can get in front of users much earlier.',
    timestamp: '35:35',
    note: 'AI explains why prototypes compress the product learning loop.',
    takeaway: 'AI explains why prototypes compress the product learning loop.',
    tags: ['AI Agent', 'Product Thinking'],
    type: 'explanation',
    originalSubtitle: 'The design and engineering relationship changes because prototypes can get in front of users much earlier.',
    content: 'AI explains why prototypes compress the product learning loop.',
    topics: ['AI Agent', 'Product Thinking'],
    createdAt: '2026-06-05T09:00:00.000Z',
    source: 'ai',
  },
  {
    id: 'demo-note-key-idea-1',
    videoId: 'learn-faster',
    videoTitle: "The design process is dead. Here's what's replacing it.",
    quote: 'Modern design work guides decisions while the product changes underneath the team.',
    timestamp: '36:13',
    note: 'Modern design work guides decisions while the product changes underneath the team.',
    takeaway: 'Modern design work guides decisions while the product changes underneath the team.',
    tags: ['Design', 'Product Thinking'],
    type: 'keyIdea',
    originalSubtitle: 'The design process is dead. Here is what is replacing it.',
    content: 'Modern design work guides decisions while the product changes underneath the team.',
    topics: ['Design', 'Product Thinking'],
    createdAt: '2026-06-05T09:08:00.000Z',
    source: 'ai',
  },
  {
    id: 'demo-note-review-1',
    videoId: 'learn-faster',
    videoTitle: "The design process is dead. Here's what's replacing it.",
    quote: 'What changes when design stays inside the implementation loop instead of outside it?',
    timestamp: '36:26',
    note: 'Review this before the next product planning session.',
    takeaway: 'Review this before the next product planning session.',
    tags: ['English Learning', 'Design'],
    type: 'reviewQuestion',
    originalSubtitle: 'What changes when design stays inside the implementation loop instead of outside it?',
    content: 'Review this before the next product planning session.',
    topics: ['English Learning', 'Design'],
    createdAt: '2026-06-05T09:14:00.000Z',
    source: 'ai',
  },
  {
    id: 'demo-note-thought-1',
    videoId: 'jenny-design',
    videoTitle: "How Anthropic's product team moves faster than anyone else",
    quote: 'The team is working with shorter horizons and tighter feedback loops.',
    timestamp: '36:00',
    note: 'This is the real operating model shift: design becomes a live decision partner.',
    takeaway: 'Design becomes a live decision partner.',
    tags: ['Product', 'Startup'],
    type: 'thought',
    originalSubtitle: 'The team is working with shorter horizons and tighter feedback loops.',
    content: 'This is the real operating model shift: design becomes a live decision partner.',
    topics: ['Product', 'Startup'],
    createdAt: '2026-06-05T09:20:00.000Z',
    source: 'thought',
  },
  {
    id: 'demo-note-highlight-1',
    videoId: 'product-storytelling',
    videoTitle: 'Product Storytelling for Technical Founders',
    quote: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.',
    timestamp: '08:32',
    note: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.',
    takeaway: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.',
    tags: ['Startup', 'Business'],
    type: 'highlight',
    originalSubtitle: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.',
    content: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.',
    topics: ['Startup', 'Business'],
    createdAt: '2026-06-05T09:26:00.000Z',
    source: 'highlight',
  },
]

const defaultImportUrl = 'https://www.youtube.com/watch?v=3Y8aq_ofEVs'
const defaultTranslationLanguage = 'Simplified Chinese'

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

function progressPercent(video: DemoVideo) {
  return Math.min(Math.round((video.lastPositionSec / Math.max(video.durationSec, 1)) * 100), 100)
}

function noteTypeLabel(type?: NoteType) {
  const labels: Record<NoteType, string> = {
    highlight: 'Highlight',
    thought: 'Thought',
    explanation: 'Explanation',
    keyIdea: 'Key Idea',
    reviewQuestion: 'Review Question',
    videoBrief: 'Video Brief',
  }

  return labels[type ?? 'highlight']
}

function noteTypeFromSource(note: SavedNote): NoteType {
  if (note.type) return note.type
  if (note.source === 'ai') return 'explanation'
  if (note.source === 'thought') return 'thought'
  return 'highlight'
}

function initialVideoMeta(videos: DemoVideo[]) {
  return videos.reduce<Record<string, VideoMeta>>((acc, video) => {
    acc[video.id] = videoMetaFromVideo(video)
    return acc
  }, {})
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function chatCitationArray(value: unknown): ChatCitation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const citation = item as Partial<ChatCitation>
    const segmentId = typeof citation.segmentId === 'string' ? citation.segmentId : ''
    const startSec = Number(citation.startSec)
    const endSec = Number(citation.endSec)
    const label = typeof citation.label === 'string' ? citation.label : formatTime(startSec)
    const text = typeof citation.text === 'string' ? citation.text : ''

    return segmentId && Number.isFinite(startSec) && Number.isFinite(endSec)
      ? [{ segmentId, startSec, endSec, label, text }]
      : []
  })
}

function aiSaveCandidateArray(value: unknown): AiSaveCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }

  const allowedTypes = new Set<AiNoteType>(['explanation', 'keyIdea', 'reviewQuestion'])
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const candidate = item as Partial<AiSaveCandidate>
    const type = candidate.type
    const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''

    return type && allowedTypes.has(type) && content
      ? [{
          type,
          content,
          quote: typeof candidate.quote === 'string' ? candidate.quote : undefined,
          timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
        }]
      : []
  })
}

function normalizedStatus(status: unknown, fallback: InboxTab = 'inbox'): InboxTab {
  return status === 'inbox' || status === 'learning' || status === 'done' ? status : fallback
}

function videoMetaFromVideo(video: DemoVideo): VideoMeta {
  return {
    status: normalizedStatus(video.status, video.lastPositionSec > 0 ? 'learning' : 'inbox'),
    isFavourite: Boolean(video.isFavourite),
    tags: video.tags ?? [],
  }
}

function videoToRow(video: DemoVideo, userId: string, meta: VideoMeta = videoMetaFromVideo(video)): LearningVideoRow & { user_id: string } {
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
    status: meta.status,
    is_favourite: meta.isFavourite,
    tags: meta.tags,
    saved_at: video.savedAt ?? new Date().toISOString(),
  }
}

function rowToVideo(row: LearningVideoRow): DemoVideo {
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
    status: normalizedStatus(row.status, row.last_position_sec > 0 ? 'learning' : 'inbox'),
    isFavourite: Boolean(row.is_favourite),
    tags: stringArray(row.tags),
    transcriptLanguage: row.transcript_language ?? null,
    transcriptSource: row.transcript_source ?? null,
    transcriptLanguages: stringArray(row.transcript_languages),
    transcriptError: row.transcript_error ?? null,
    transcript: row.transcript ?? [],
    savedAt: row.saved_at,
  }
}

function noteToRow(note: SavedNote, userId?: string) {
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
    created_at: note.createdAt ?? new Date().toISOString(),
    saved_at: note.savedAt ?? new Date().toISOString(),
    is_starred: Boolean(note.isStarred),
    source: note.source,
  }
}

function rowToNote(row: LearningNoteRow): SavedNote {
  return {
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.video_title ?? undefined,
    quote: row.quote,
    timestamp: row.timestamp_label,
    note: row.note,
    takeaway: row.takeaway,
    tags: stringArray(row.tags),
    type: row.type ?? undefined,
    originalSubtitle: row.original_subtitle ?? undefined,
    content: row.content ?? undefined,
    topics: stringArray(row.topics),
    createdAt: row.created_at,
    savedAt: row.saved_at,
    isStarred: Boolean(row.is_starred),
    source: row.source,
  }
}

function rowsToTranslatedSegments(rows: LearningTranslationRow[]) {
  return rows.reduce<Record<string, string>>((acc, row) => {
    const segments = row.segments
    if (!segments || Array.isArray(segments) || typeof segments !== 'object') {
      return acc
    }

    Object.entries(segments as Record<string, unknown>).forEach(([segmentId, text]) => {
      if (typeof text === 'string') {
        acc[translationKey(row.video_id, row.language, segmentId)] = text
      }
    })

    return acc
  }, {})
}

function translationSegmentsForVideo(
  translatedSegments: Record<string, string>,
  videoId: string,
  language: string,
) {
  return Object.entries(translatedSegments).reduce<Record<string, string>>((acc, [key, value]) => {
    const prefix = `${videoId}:${language}:`
    if (key.startsWith(prefix)) {
      acc[key.slice(prefix.length)] = value
    }
    return acc
  }, {})
}

function extractYouTubeId(youtubeUrl: string) {
  try {
    const url = new URL(youtubeUrl)
    return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || undefined
  } catch {
    return undefined
  }
}

function durationLabelFromSeconds(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function contractVideoToDemoVideo(video: ContractVideo, transcript: DemoVideo['transcript'] = video.transcript ?? []): DemoVideo {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel,
    durationLabel: durationLabelFromSeconds(video.durationSec),
    durationSec: video.durationSec,
    lastPositionSec: video.lastPositionSec ?? 0,
    lastPositionLabel: video.lastPositionSec ? `Continue at ${formatTime(video.lastPositionSec)}` : 'Not started',
    summary: `Temporary learning video from ${video.channel}.`,
    youtubeUrl: video.youtubeUrl,
    youtubeId: video.youtubeId,
    sourceType: 'youtube',
    accent: '#93c8a1',
    coverImage: video.thumbnailUrl,
    playerImage: video.thumbnailUrl,
    coverEyebrow: video.channel,
    coverTitle: video.title,
    coverDetail: 'YouTube preview',
    status: video.status ?? 'inbox',
    isFavourite: Boolean(video.isFavourite),
    tags: video.tags ?? [],
    transcriptLanguage: video.transcriptLanguage ?? null,
    transcriptSource: video.transcriptSource ?? null,
    transcriptLanguages: video.transcriptLanguages ?? [],
    transcriptError: video.transcriptError ?? null,
    savedAt: video.savedAt,
    transcript,
  }
}

function loadStoredGuestWorkspace(): GuestWorkspace | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem('vist.guestWorkspace')
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GuestWorkspace>
    if (!parsed.temporaryVideo || !Array.isArray(parsed.transcript)) return null

    return {
      temporaryVideo: parsed.temporaryVideo as ContractVideo,
      transcript: parsed.transcript,
      temporaryChatRecords: Array.isArray(parsed.temporaryChatRecords) ? parsed.temporaryChatRecords as TemporaryChatRecord[] : [],
      temporaryNotes: Array.isArray(parsed.temporaryNotes) ? parsed.temporaryNotes as TemporaryNote[] : [],
      askCount: Number(parsed.askCount ?? 0),
      playedSeconds: Number(parsed.playedSeconds ?? 0),
      hasStartedWatching: Boolean(parsed.hasStartedWatching),
      hasAskedAI: Boolean(parsed.hasAskedAI),
      hasTemporaryNotes: Boolean(parsed.hasTemporaryNotes),
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      pendingAction: typeof parsed.pendingAction === 'string' ? parsed.pendingAction : null,
    }
  } catch {
    return null
  }
}

function selectedSubtitlePayload(selection: TranscriptSelection | null): SelectedSubtitlePayload | null {
  if (!selection?.quote.trim()) {
    return null
  }

  return {
    text: selection.quote.trim(),
    startSec: selection.startSec,
    endSec: selection.endSec,
  }
}

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isAuthChecked, setIsAuthChecked] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authModalMessage, setAuthModalMessage] = useState('登录后保存你的学习进度、笔记和 AI 对话。')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [pendingMigratedVideoId, setPendingMigratedVideoId] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [rightTab, setRightTab] = useState<RightTab>('info')
  const [inboxTab, setInboxTab] = useState<LibraryTab>('inbox')
  const [videos, setVideos] = useState<DemoVideo[]>(catalogVideos)
  const [videoMeta, setVideoMeta] = useState<Record<string, VideoMeta>>(() => initialVideoMeta(catalogVideos))
  const [libraryIds, setLibraryIds] = useState<string[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState(initialLibraryIds[0])
  const [currentPosition, setCurrentPosition] = useState(videoById(initialLibraryIds[0]).lastPositionSec)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [previewDiscoverId, setPreviewDiscoverId] = useState<string | null>(null)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [tagModalVideoId, setTagModalVideoId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [activeVideoMenuId, setActiveVideoMenuId] = useState<string | null>(null)
  const [activeNoteMenuId, setActiveNoteMenuId] = useState<string | null>(null)
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteType | 'all'>('all')
  const [noteVideoFilter, setNoteVideoFilter] = useState('all')
  const [noteTagFilter, setNoteTagFilter] = useState('all')
  const [noteStarredOnly, setNoteStarredOnly] = useState(false)
  const [noteSortOrder, setNoteSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [linkInput, setLinkInput] = useState(defaultImportUrl)
  const [chatPrompt, setChatPrompt] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [pendingChatRequest, setPendingChatRequest] = useState<PendingChatRequest | null>(null)
  const [failedChatRequest, setFailedChatRequest] = useState<FailedChatRequest | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showTranslations, setShowTranslations] = useState(false)
  const [aiSaveType, setAiSaveType] = useState<AiNoteType>('explanation')
  const [activeAiSaveMenuId, setActiveAiSaveMenuId] = useState<string | null>(null)
  const [copiedChatMessageId, setCopiedChatMessageId] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translatedSegments, setTranslatedSegments] = useState<Record<string, string>>({})
  const [isTranscriptFollowing, setIsTranscriptFollowing] = useState(true)
  const [showSyncPrompt, setShowSyncPrompt] = useState(false)
  const [readerLeftWidth, setReaderLeftWidth] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([])
  const [chatRecords, setChatRecords] = useState<ChatRecord[]>([])
  const [toast, setToast] = useState<string | null>('Select text inside the transcript to ask AI or attach a note.')
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelection | null>(null)
  const [isSelectionGestureActive, setIsSelectionGestureActive] = useState(false)
  const [chatContextSelection, setChatContextSelection] = useState<TranscriptSelection | null>(null)
  const [isChatContextOpen, setIsChatContextOpen] = useState(false)
  const [guestWorkspace, setGuestWorkspace] = useState<GuestWorkspace | null>(() => loadStoredGuestWorkspace())

  const transcriptContentRef = useRef<HTMLDivElement | null>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isChatComposingRef = useRef(false)
  const selectionFloatRef = useRef<HTMLDivElement | null>(null)
  const tagInputRef = useRef<HTMLInputElement | null>(null)
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null)
  const readerLayoutRef = useRef<HTMLDivElement | null>(null)
  const autoScrollResetRef = useRef<number | null>(null)
  const manualScrollResetRef = useRef<number | null>(null)
  const syncPromptDelayRef = useRef<number | null>(null)
  const selectionReadTimerRef = useRef<number | null>(null)
  const isTouchSelectingRef = useRef(false)
  const ignoreSelectionChangeUntilRef = useRef(0)
  const lastSavedProgressRef = useRef<Record<string, number>>({})
  const isAutoScrollingRef = useRef(false)
  const isManualTranscriptBrowsingRef = useRef(false)
  const detachedAtSegmentIndexRef = useRef<number | null>(null)

  const previewDiscoverItem = discoveryItems.find((item) => item.id === previewDiscoverId) ?? null
  const selectedVideo = findVideoById(videos, selectedVideoId)
  const selectedVideoMeta = videoMeta[selectedVideo.id] ?? defaultVideoMeta
  const isTemporaryReader = !currentUser && Boolean(guestWorkspace?.temporaryVideo.id === selectedVideo.id)
  const transcript = selectedVideo.transcript
  const selectedQuote = transcriptSelection?.quote ?? ''
  const selectedTimestamp = transcriptSelection?.timestamp ?? formatTime(selectedVideo.lastPositionSec)
  const selectedNotes = savedNotes
    .filter((note) => note.videoId === selectedVideo.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const allNotes = savedNotes
  const visibleLibraryIds = libraryIds.filter((videoId) => {
    const meta = videoMeta[videoId] ?? { status: 'inbox', isFavourite: false, tags: [] }
    return inboxTab === 'favourite' ? meta.isFavourite : meta.status === inboxTab
  })
  const selectedChatRecords = chatRecords
    .filter((record) => record.videoId === selectedVideo.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  const activeSegmentIndex = transcript.findIndex(
    (segment) => currentPosition >= segment.startSec && currentPosition <= segment.endSec,
  )
  const selectedSegmentIds = transcriptSelection?.segmentIds ?? []
  const chatContextQuote = chatContextSelection?.quote || selectedQuote
  const activeContextSegment = activeSegmentIndex >= 0 ? transcript[activeSegmentIndex] : null
  const chatContextLabel = chatContextSelection
    ? `选中字幕 · ${chatContextSelection.timestamp}`
    : activeContextSegment
      ? `基于当前时间点 · ${formatTime(currentPosition)}`
      : '基于整条视频字幕'
  const chatContextPreview = chatContextSelection?.quote || activeContextSegment?.text || '整条视频字幕会作为回答来源。'

  const activeChatQuestion = chatPrompt.trim()
  const hasChatActivity = selectedChatRecords.length > 0 || Boolean(pendingChatRequest) || Boolean(failedChatRequest)
  const shouldShowChatSuggestions =
    !activeChatQuestion &&
    !isAsking &&
    !hasChatActivity

  useEffect(() => {
    if (!guestWorkspace) {
      window.localStorage.removeItem('vist.guestWorkspace')
      return
    }

    window.localStorage.setItem('vist.guestWorkspace', JSON.stringify(guestWorkspace))
  }, [guestWorkspace])

  useEffect(() => {
    if (!guestWorkspace) return

    const temporaryVideo = contractVideoToDemoVideo(guestWorkspace.temporaryVideo, guestWorkspace.transcript)
    setVideos((current) => [temporaryVideo, ...current.filter((video) => video.id !== temporaryVideo.id)])
    setVideoMeta((current) => ({
      ...current,
      [temporaryVideo.id]: videoMetaFromVideo(temporaryVideo),
    }))
    setChatRecords((current) => {
      const restoredRecords = guestWorkspace.temporaryChatRecords.map((record) => ({
        id: record.clientTempId,
        videoId: temporaryVideo.id,
        videoTitle: temporaryVideo.title,
        question: record.question,
        quote: record.quote,
        answer: record.answer,
        createdAt: record.createdAt,
      }))
      return [
        ...current.filter((record) => record.videoId !== temporaryVideo.id),
        ...restoredRecords,
      ]
    })
  }, [guestWorkspace])

  useEffect(() => {
    if (!currentUser || showAuthModal || !pendingAction) {
      return
    }

    const action = pendingAction
    const migratedVideoId = pendingMigratedVideoId ?? undefined
    setPendingAction(null)
    setPendingMigratedVideoId(null)
    void executePendingAction(action, migratedVideoId)
  // executePendingAction intentionally runs after auth state has re-rendered with currentUser.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, pendingAction, pendingMigratedVideoId, showAuthModal])

  async function getAccessToken() {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session?.access_token) {
      throw new Error('Please log in again.')
    }

    return data.session.access_token
  }

  async function refreshLibraryState() {
    if (!supabase) {
      return
    }

    const [videosResult, notesResult, translationsResult] = await Promise.all([
      supabase.from('learning_videos').select('*').order('saved_at', { ascending: false }),
      supabase.from('learning_notes').select('*').order('saved_at', { ascending: false }),
      supabase.from('learning_translations').select('*'),
    ])

    const error = videosResult.error ?? notesResult.error ?? translationsResult.error
    if (error) throw error

    const persistedVideos = ((videosResult.data ?? []) as LearningVideoRow[]).map(rowToVideo)
    const persistedNotes = ((notesResult.data ?? []) as LearningNoteRow[]).map(rowToNote)
    const persistedTranslations = rowsToTranslatedSegments((translationsResult.data ?? []) as LearningTranslationRow[])
    const mergedVideos = [
      ...persistedVideos,
      ...catalogVideos.filter((video) => !persistedVideos.some((persisted) => persisted.id === video.id)),
    ]
    const mergedIds = [
      ...persistedVideos.map((video) => video.id),
      ...initialLibraryIds.filter((id) => !persistedVideos.some((video) => video.id === id)),
    ]

    setVideos(mergedVideos)
    setVideoMeta(initialVideoMeta(mergedVideos))
    setLibraryIds(mergedIds)
    setSavedNotes(persistedNotes)
    setChatRecords([])
    setTranslatedSegments(persistedTranslations)

    if (persistedVideos.length > 0) {
      setSelectedVideoId(persistedVideos[0].id)
      setCurrentPosition(persistedVideos[0].lastPositionSec || persistedVideos[0].transcript[0]?.startSec || 0)
    }
  }

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      if (!supabase) {
        setIsAuthChecked(true)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        if (isMounted) {
          setCurrentUser(toAuthUser(data.session?.user ?? null))
        }
      } catch {
        if (isMounted) {
          setCurrentUser(null)
        }
      } finally {
        if (isMounted) {
          setIsAuthChecked(true)
        }
      }
    }

    void loadSession()
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(toAuthUser(session?.user ?? null))
      if (!session?.user) {
        setScreen('home')
        setLibraryIds([])
        setVideos(catalogVideos)
        setVideoMeta(initialVideoMeta(catalogVideos))
        setSavedNotes([])
        setChatRecords([])
        setTranslatedSegments({})
      }
    })

    return () => {
      isMounted = false
      subscription?.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAuthChecked || !currentUser) {
      return
    }

    let isMounted = true

    async function loadLibrary() {
      if (!supabase) {
        setToast('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
        return
      }

      try {
        await refreshLibraryState()
      } catch {
        if (!isMounted) return
        setToast('Unable to load Supabase library. Check database migration and RLS policies.')
      }
    }

    void loadLibrary()

    return () => {
      isMounted = false
    }
  }, [currentUser, isAuthChecked])

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
      scrollActiveTranscriptLine()
      return
    }

    if (
      isPlaying &&
      !isManualTranscriptBrowsingRef.current &&
      !isActiveTranscriptLineVisible('loose') &&
      detachedAtSegmentIndexRef.current !== null &&
      activeSegmentIndex - detachedAtSegmentIndexRef.current >= 2
    ) {
      if (syncPromptDelayRef.current) {
        window.clearTimeout(syncPromptDelayRef.current)
      }
      syncPromptDelayRef.current = window.setTimeout(() => {
        if (isPlaying && !isTranscriptFollowing && !isManualTranscriptBrowsingRef.current && !isActiveTranscriptLineVisible('loose')) {
          setShowSyncPrompt(true)
        }
      }, 900)
    }
  // The scroll helpers intentionally read live refs; adding them here would retrigger follow-scroll on unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentIndex, isPlaying, isTranscriptFollowing, screen])

  useEffect(() => {
    if (!isPlaying) {
      setShowSyncPrompt(false)
    }
  }, [isPlaying])

  useEffect(() => {
    return () => {
      if (autoScrollResetRef.current) {
        window.clearTimeout(autoScrollResetRef.current)
      }
      if (manualScrollResetRef.current) {
        window.clearTimeout(manualScrollResetRef.current)
      }
      if (syncPromptDelayRef.current) {
        window.clearTimeout(syncPromptDelayRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setChatPrompt('')
    setPendingChatRequest(null)
    setFailedChatRequest(null)
    setActiveAiSaveMenuId(null)
    setCopiedChatMessageId(null)
  }, [selectedVideoId])

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
    if (!currentUser || !supabase || screen !== 'reader' || selectedVideo.sourceType !== 'youtube') {
      return
    }

    const supabaseClient = supabase
    const previousPosition = lastSavedProgressRef.current[selectedVideo.id] ?? selectedVideo.lastPositionSec ?? 0
    if (Math.abs(currentPosition - previousPosition) < 10) {
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        const safePosition = Math.max(0, Math.round(currentPosition))
        const nextVideo: DemoVideo = {
          ...selectedVideo,
          lastPositionSec: safePosition,
          lastPositionLabel: safePosition > 0 ? `Continue at ${formatTime(safePosition)}` : 'Not started',
        }
        const { data, error } = await supabaseClient
          .from('learning_videos')
          .upsert(
            {
              ...videoToRow(nextVideo, currentUser.id, selectedVideoMeta),
              last_watched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,id' },
          )
          .select('*')
          .maybeSingle()

        if (error) {
          setToast('Failed to save video progress.')
          return
        }

        if (!data) {
          setToast('Failed to save video progress.')
          return
        }

        const updatedVideo = rowToVideo(data as LearningVideoRow)
        lastSavedProgressRef.current[selectedVideo.id] = updatedVideo.lastPositionSec
        setVideos((current) => current.map((video) => (video.id === updatedVideo.id ? { ...video, ...updatedVideo } : video)))
      } catch {
        setToast('Failed to save video progress.')
      }
    }, 900)

    return () => window.clearTimeout(timer)
  }, [currentPosition, currentUser, screen, selectedVideo, selectedVideoMeta])

  useEffect(() => {
    if (!isTemporaryReader || !guestWorkspace) {
      return
    }

    const nextPlayedSeconds = Math.max(guestWorkspace.playedSeconds, Math.round(currentPosition))
    const nextHasStartedWatching = nextPlayedSeconds > 0 || isPlaying
    if (nextPlayedSeconds === guestWorkspace.playedSeconds && nextHasStartedWatching === guestWorkspace.hasStartedWatching) {
      return
    }

    setGuestWorkspace({
      ...guestWorkspace,
      playedSeconds: nextPlayedSeconds,
      hasStartedWatching: nextHasStartedWatching,
    })
  }, [currentPosition, guestWorkspace, isPlaying, isTemporaryReader])

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
    if (!showTagModal) return

    const timer = window.setTimeout(() => {
      tagInputRef.current?.focus()
    }, 120)

    return () => window.clearTimeout(timer)
  }, [showTagModal])

  useEffect(() => {
    if (!transcriptSelection) return

    const frame = window.requestAnimationFrame(() => {
      const element = selectionFloatRef.current
      if (!element) return

      const rect = element.getBoundingClientRect()
      const viewportPadding = 14
      let nextX = transcriptSelection.x
      let nextY = transcriptSelection.y

      if (rect.right > window.innerWidth - viewportPadding) {
        nextX -= rect.right - (window.innerWidth - viewportPadding)
      }

      if (rect.left < viewportPadding) {
        nextX += viewportPadding - rect.left
      }

      if (rect.top < viewportPadding) {
        nextY += viewportPadding - rect.top
      }

      if (rect.bottom > window.innerHeight - viewportPadding) {
        nextY -= rect.bottom - (window.innerHeight - viewportPadding)
      }

      if (Math.abs(nextX - transcriptSelection.x) > 1 || Math.abs(nextY - transcriptSelection.y) > 1) {
        setTranscriptSelection((current) => current ? { ...current, x: nextX, y: nextY } : current)
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [transcriptSelection])

  useEffect(() => {
    function keepSelectionFloatInViewport() {
      const element = selectionFloatRef.current
      if (!element) return

      const rect = element.getBoundingClientRect()
      const viewportPadding = 14
      let deltaX = 0
      let deltaY = 0

      if (rect.right > window.innerWidth - viewportPadding) {
        deltaX = window.innerWidth - viewportPadding - rect.right
      } else if (rect.left < viewportPadding) {
        deltaX = viewportPadding - rect.left
      }

      if (rect.bottom > window.innerHeight - viewportPadding) {
        deltaY = window.innerHeight - viewportPadding - rect.bottom
      } else if (rect.top < viewportPadding) {
        deltaY = viewportPadding - rect.top
      }

      if (deltaX || deltaY) {
        setTranscriptSelection((current) => current ? { ...current, x: current.x + deltaX, y: current.y + deltaY } : current)
      }
    }

    window.addEventListener('resize', keepSelectionFloatInViewport)

    return () => window.removeEventListener('resize', keepSelectionFloatInViewport)
  }, [])

  useEffect(() => {
    if (screen !== 'reader') {
      setIsSelectionGestureActive(false)
      clearNativeSelection()
      return
    }

    function readStableSelection({ clearOnInvalid = false }: { clearOnInvalid?: boolean } = {}) {
      const rejectSelection = () => {
        if (clearOnInvalid) {
          setTranscriptSelection(null)
        }
        return false
      }

      const container = transcriptContentRef.current
      const selection = window.getSelection()

      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return rejectSelection()
      }

      const anchorNode = selection.anchorNode
      const focusNode = selection.focusNode

      if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
        return rejectSelection()
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
        return rejectSelection()
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
      const selectedSegments = transcript.filter((segment) => segmentIds.includes(segment.id))
      const rect = range.getBoundingClientRect()
      const viewportPadding = 14
      const estimatedFloatWidth = Math.min(window.innerWidth - viewportPadding * 2, 360)
      const estimatedFloatHeight = 62
      const selectionCenter = rect.left + rect.width / 2
      let x = selectionCenter - estimatedFloatWidth / 2
      let y = rect.top - estimatedFloatHeight - 12

      x = Math.min(Math.max(x, viewportPadding), window.innerWidth - estimatedFloatWidth - viewportPadding)
      if (y < viewportPadding) {
        y = rect.bottom + 12
      }
      y = Math.min(Math.max(y, viewportPadding), window.innerHeight - estimatedFloatHeight - viewportPadding)

      const nextSelection = {
        quote,
        timestamp: firstSegment ? formatTime(firstSegment.startSec) : formatTime(selectedVideo.lastPositionSec),
        startSec: selectedSegments[0]?.startSec ?? firstSegment?.startSec ?? selectedVideo.lastPositionSec,
        endSec: selectedSegments[selectedSegments.length - 1]?.endSec ?? firstSegment?.endSec ?? selectedVideo.lastPositionSec,
        segmentIds,
        x,
        y,
      }

      setTranscriptSelection((current) => {
        if (
          current &&
          current.quote === nextSelection.quote &&
          current.timestamp === nextSelection.timestamp &&
          current.segmentIds.join('|') === nextSelection.segmentIds.join('|')
        ) {
          return current
        }

        return nextSelection
      })

      return true
    }

    function scheduleSelectionRead(
      delay = 160,
      { clearOnInvalid = false, finishTouchGesture = false }: { clearOnInvalid?: boolean; finishTouchGesture?: boolean } = {},
    ) {
      if (selectionReadTimerRef.current) {
        window.clearTimeout(selectionReadTimerRef.current)
      }

      selectionReadTimerRef.current = window.setTimeout(() => {
        selectionReadTimerRef.current = null
        readStableSelection({ clearOnInvalid })
        if (finishTouchGesture) {
          setIsSelectionGestureActive(false)
        }
      }, delay)
    }

    function handleTouchStart(event: TouchEvent) {
      const target = event.target as Node | null
      const transcript = transcriptContentRef.current
      const isTranscriptTouch = Boolean(target && transcript?.contains(target))

      isTouchSelectingRef.current = isTranscriptTouch
      if (isTranscriptTouch) {
        setIsSelectionGestureActive(true)
      } else {
        setIsSelectionGestureActive(false)
      }
    }

    function handleTouchEnd() {
      const wasSelectingTranscript = isTouchSelectingRef.current
      isTouchSelectingRef.current = false
      if (!wasSelectingTranscript) {
        return
      }

      ignoreSelectionChangeUntilRef.current = Date.now() + 900
      scheduleSelectionRead(280, { clearOnInvalid: true, finishTouchGesture: true })
    }

    function handleTouchCancel() {
      isTouchSelectingRef.current = false
      setIsSelectionGestureActive(false)
    }

    function handleSelectionChange() {
      if (isTouchSelectingRef.current || Date.now() < ignoreSelectionChangeUntilRef.current) {
        return
      }

      scheduleSelectionRead(180)
    }

    function handleMouseUp() {
      scheduleSelectionRead(120)
    }

    function handleKeyUp() {
      scheduleSelectionRead(120)
    }

    function clearWhenClickingOutside(event: MouseEvent) {
      const target = event.target as Node | null
      if (!target) return

      const transcript = transcriptContentRef.current
      const actionDock = document.querySelector('.transcript-action-dock')
      const selectionFloat = document.querySelector('.selection-float')
      const noteModal = document.querySelector('.note-modal')

      if (transcript?.contains(target) || actionDock?.contains(target) || selectionFloat?.contains(target) || noteModal?.contains(target)) {
        return
      }

      clearNativeSelection()
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchCancel)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('mousedown', clearWhenClickingOutside)

    return () => {
      if (selectionReadTimerRef.current) {
        window.clearTimeout(selectionReadTimerRef.current)
        selectionReadTimerRef.current = null
      }
      setIsSelectionGestureActive(false)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('touchcancel', handleTouchCancel)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('mousedown', clearWhenClickingOutside)
    }
  }, [screen, selectedVideo.lastPositionSec, transcript])

  function clearNativeSelection() {
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
    setIsSelectionGestureActive(false)
    setTranscriptSelection(null)
  }

  function isActiveTranscriptLineVisible(mode: 'strict' | 'loose' = 'strict') {
    const container = transcriptContentRef.current
    const activeLine = container?.querySelector('.reader-line--active')
    if (!container || !activeLine) return true

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    const inset = mode === 'loose' ? -120 : 24
    return lineRect.top >= containerRect.top + inset && lineRect.bottom <= containerRect.bottom - inset
  }

  function shouldAutoScrollActiveLine() {
    const container = transcriptContentRef.current
    const activeLine = container?.querySelector('.reader-line--active')
    if (!container || !activeLine) return false

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    const lineCenter = lineRect.top + lineRect.height / 2
    const upperComfortLine = containerRect.top + containerRect.height * 0.34
    const lowerComfortLine = containerRect.top + containerRect.height * 0.62

    return lineCenter < upperComfortLine || lineCenter > lowerComfortLine
  }

  function scrollActiveTranscriptLine() {
    const container = transcriptContentRef.current
    const activeLine = container?.querySelector('.reader-line--active')
    if (!container || !activeLine || !shouldAutoScrollActiveLine()) return

    isAutoScrollingRef.current = true
    setShowSyncPrompt(false)
    detachedAtSegmentIndexRef.current = null

    const containerRect = container.getBoundingClientRect()
    const lineRect = activeLine.getBoundingClientRect()
    const lineCenter = lineRect.top + lineRect.height / 2
    const targetCenter = containerRect.top + containerRect.height * 0.45
    const delta = lineCenter - targetCenter

    if (Math.abs(delta) > 18) {
      container.scrollTo({
        top: container.scrollTop + delta,
        behavior: 'smooth',
      })
    }

    if (autoScrollResetRef.current) {
      window.clearTimeout(autoScrollResetRef.current)
    }
    autoScrollResetRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, 720)
  }

  function handleTranscriptScroll() {
    if (isAutoScrollingRef.current || screen !== 'reader' || activeSegmentIndex < 0) return

    isManualTranscriptBrowsingRef.current = true
    setShowSyncPrompt(false)

    if (manualScrollResetRef.current) {
      window.clearTimeout(manualScrollResetRef.current)
    }
    manualScrollResetRef.current = window.setTimeout(() => {
      isManualTranscriptBrowsingRef.current = false
    }, 1800)

    const isVisible = isActiveTranscriptLineVisible('loose')
    const shouldFollow = isVisible && shouldAutoScrollActiveLine() === false
    setIsTranscriptFollowing(shouldFollow)

    if (!shouldFollow && detachedAtSegmentIndexRef.current === null) {
      detachedAtSegmentIndexRef.current = activeSegmentIndex
    }

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
    const meta = videoMeta[videoId] ?? { status: 'inbox', isFavourite: false, tags: [] }
    if (currentUser && meta.status !== 'done') {
      void updateVideoMeta(videoId, { status: 'learning' })
    }

    startTransition(() => {
      setSelectedVideoId(videoId)
      setScreen('reader')
      setRightTab('subtitle')
      setChatContextSelection(null)
      setIsTranscriptFollowing(true)
      setShowSyncPrompt(false)
      detachedAtSegmentIndexRef.current = null
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

  function pendingActionKey(action: PendingAction | null) {
    if (!action) return null
    return action.type
  }

  function openAuthModal(message: string, action: PendingAction | null = null) {
    setAuthModalMessage(message)
    setPendingAction(action)
    setAuthMode('login')
    setAuthError('')
    setAuthSuccess('')
    setShowAuthModal(true)
    setGuestWorkspace((current) => current ? {
      ...current,
      pendingAction: pendingActionKey(action),
    } : current)
  }

  async function postContractJson<T>(path: string, body: unknown, accessToken?: string) {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const error = new Error(data?.error ?? `${path} failed.`)
      Object.assign(error, { status: response.status })
      throw error
    }

    return data as T
  }

  async function migrateGuestWorkspace(workspace: GuestWorkspace) {
    const accessToken = await getAccessToken()
    const body = {
      temporaryVideo: workspace.temporaryVideo,
      transcript: workspace.transcript,
      temporaryChatRecords: workspace.temporaryChatRecords,
      temporaryNotes: workspace.temporaryNotes,
      activity: {
        playedSeconds: workspace.playedSeconds,
        hasStartedWatching: workspace.hasStartedWatching,
        hasAskedAI: workspace.hasAskedAI,
        hasTemporaryNotes: workspace.hasTemporaryNotes,
        askCount: workspace.askCount,
      },
    }

    return postContractJson<GuestMigrateResponse>('/api/guest/migrate', body, accessToken)
  }

  async function executePendingAction(action: PendingAction | null, migratedVideoId?: string) {
    if (!action) return

    if (action.type === 'open-library') {
      setScreen('library')
      return
    }
    if (action.type === 'open-notes') {
      setScreen('notes')
      return
    }
    if (action.type === 'save-discover-to-inbox') {
      await saveDiscoverToInbox(action.discoverId)
      return
    }
    if (action.type === 'save-highlight') {
      if (migratedVideoId) {
        setToast('Saved to your account.')
        return
      }
      await saveNote('highlight', 'highlight')
      return
    }
    if (action.type === 'add-thought') {
      setShowNoteModal(true)
      return
    }
    if (action.type === 'save-ai-note') {
      if (migratedVideoId) {
        setToast('Saved to your account.')
        return
      }
      const record = chatRecords.find((item) => item.id === action.recordId)
      if (record) {
        await saveAiResponseAsNote(record, action.noteType)
      }
      return
    }
    if (action.type === 'star-note') {
      await updateNote(action.noteId, { isStarred: true })
      return
    }
    if (action.type === 'edit-tags') {
      openTagEditor(action.videoId)
      return
    }
    if (action.type === 'save-video') {
      setToast('Saved to your account.')
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setIsAuthBusy(true)

    if (!supabase) {
      setAuthError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      setIsAuthBusy(false)
      return
    }

    try {
      const authResult = authMode === 'signup'
        ? await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: {
              emailRedirectTo: getAuthRedirectUrl(),
              data: {
                name: authName.trim() || authEmail.split('@')[0],
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
          })

      if (authResult.error) {
        throw authResult.error
      }

      if (authMode === 'signup') {
        setAuthPassword('')
        setAuthError('')
        setAuthMode('login')
        if (authResult.data.session?.user) {
          await supabase.auth.signOut().catch(() => null)
          setCurrentUser(null)
          setAuthSuccess('恭喜注册成功，可以使用你的账号登录了。')
        } else {
          setAuthSuccess('账号已创建，请打开确认邮件完成验证后再登录。')
        }
        return
      }

      setAuthPassword('')
      setAuthError('')

      const authedUser = toAuthUser(authResult.data.session?.user ?? null)
      if (authedUser) {
        setCurrentUser(authedUser)
        let migratedVideoId: string | undefined
        if (guestWorkspace) {
          const migrationResult = await migrateGuestWorkspace(guestWorkspace)
          migratedVideoId = migrationResult.video.id
          setGuestWorkspace(null)
          setToast('Saved to your account.')
        } else {
          setToast('Logged in.')
        }
        await refreshLibraryState()
        setShowAuthModal(false)
        setPendingMigratedVideoId(migratedVideoId ?? null)
      } else {
        setToast('账号已创建，请打开确认邮件完成验证后再登录。')
      }
    } catch (error) {
      setAuthError(authErrorMessage(error))
    } finally {
      setIsAuthBusy(false)
    }
  }

  async function handleLogout() {
    await supabase?.auth.signOut().catch(() => null)

    setCurrentUser(null)
    setScreen('home')
    setVideos(catalogVideos)
    setVideoMeta(initialVideoMeta(catalogVideos))
    setLibraryIds([])
    setSelectedVideoId(initialLibraryIds[0])
    setCurrentPosition(videoById(initialLibraryIds[0]).lastPositionSec)
    setSavedNotes([])
    setChatRecords([])
    setTranslatedSegments({})
    setChatPrompt('')
    setPendingChatRequest(null)
    setFailedChatRequest(null)
    setShowAddModal(false)
    setShowAuthModal(false)
    setGuestWorkspace(null)
    setPendingAction(null)
    setTranscriptSelection(null)
    lastSavedProgressRef.current = {}
  }

  function renderAccountControl({
    className,
    signInMessage,
    signInAction = null,
  }: {
    className: string
    signInMessage: string
    signInAction?: PendingAction | null
  }) {
    const initial = currentUser?.name?.trim().slice(0, 1) || currentUser?.email.slice(0, 1) || 'U'

    return (
      <div className={className}>
        {currentUser ? (
          <button
            className="reader-account-button"
            type="button"
            aria-label="User menu"
            aria-expanded={showUserMenu}
            onClick={() => setShowUserMenu((current) => !current)}
          >
            <span>{initial.toUpperCase()}</span>
          </button>
        ) : (
          <button
            className="reader-signin-button"
            type="button"
            onClick={() => openAuthModal(signInMessage, signInAction)}
          >
            Sign In
          </button>
        )}

        {currentUser && showUserMenu ? (
          <div className="account-menu">
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(false)
                void handleLogout()
              }}
            >
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUserMenu(false)
                setToast('联系我们：support@vist.example')
              }}
            >
              <MessageCircle size={16} />
              <span>联系我们</span>
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  async function openGuestPreview(
    youtubeUrl: string,
    youtubeId?: string,
    options: { durationSec?: number; transcriptLanguage?: string } = {},
  ) {
    const normalizedUrl = youtubeUrl.trim()
    const requestedYoutubeId = youtubeId ?? extractYouTubeId(normalizedUrl)

    if (!normalizedUrl) {
      setToast('Paste a YouTube URL first.')
      return
    }

    if (
      guestWorkspace?.temporaryVideo &&
      requestedYoutubeId &&
      guestWorkspace.temporaryVideo.youtubeId !== requestedYoutubeId
    ) {
      openAuthModal('游客一次只能临时解析 1 个视频。登录后可以保存更多视频并继续学习。', { type: 'save-video' })
      return
    }

    setIsImporting(true)
    setToast('Opening a temporary video...')

    try {
      const preview = await postContractJson<PreviewResponse>('/api/youtube/preview', {
        youtubeUrl: normalizedUrl,
        youtubeId: requestedYoutubeId,
        durationSec: options.durationSec,
        transcriptLanguage: options.transcriptLanguage,
      })

      if (
        guestWorkspace?.temporaryVideo &&
        guestWorkspace.temporaryVideo.youtubeId !== preview.video.youtubeId
      ) {
        openAuthModal('游客一次只能临时解析 1 个视频。登录后可以保存更多视频并继续学习。', { type: 'save-video' })
        return
      }

      const temporaryVideo = contractVideoToDemoVideo(preview.video, preview.transcript)
      const workspace: GuestWorkspace = {
        temporaryVideo: preview.video,
        transcript: preview.transcript,
        temporaryChatRecords: guestWorkspace?.temporaryChatRecords ?? [],
        temporaryNotes: guestWorkspace?.temporaryNotes ?? [],
        askCount: guestWorkspace?.askCount ?? 0,
        playedSeconds: guestWorkspace?.playedSeconds ?? 0,
        hasStartedWatching: guestWorkspace?.hasStartedWatching ?? false,
        hasAskedAI: guestWorkspace?.hasAskedAI ?? false,
        hasTemporaryNotes: guestWorkspace?.hasTemporaryNotes ?? false,
        createdAt: guestWorkspace?.createdAt ?? new Date().toISOString(),
        pendingAction: guestWorkspace?.pendingAction ?? null,
      }

      setGuestWorkspace(workspace)
      setVideos((current) => [temporaryVideo, ...current.filter((video) => video.id !== temporaryVideo.id)])
      setVideoMeta((current) => ({
        ...current,
        [temporaryVideo.id]: videoMetaFromVideo(temporaryVideo),
      }))
      setSelectedVideoId(temporaryVideo.id)
      setCurrentPosition(preview.transcript[0]?.startSec ?? 0)
      setRightTab(preview.transcript.length ? 'subtitle' : 'info')
      setScreen('reader')
      setPreviewDiscoverId(null)
      setShowAddModal(false)
      setToast('Temporary video opened.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to preview this video.'
      setToast(message)
    } finally {
      setIsImporting(false)
    }
  }

  async function handleImportUrl() {
    const url = linkInput.trim()
    if (!url) {
      setToast('Paste a YouTube URL first.')
      return
    }

    if (!currentUser) {
      await openGuestPreview(url, extractYouTubeId(url))
      return
    }

    setIsImporting(true)
    setToast('Importing YouTube metadata and subtitles...')

    try {
      const accessToken = await getAccessToken()
      const data = await postContractJson<ImportResponse>('/api/youtube/import', {
        youtubeUrl: url,
        youtubeId: extractYouTubeId(url),
        status: 'learning',
        forceReopen: false,
      }, accessToken)
      const importedVideo = contractVideoToDemoVideo(data.video, data.video.transcript ?? [])
      setVideos((current) => [importedVideo, ...current.filter((video) => video.id !== importedVideo.id)])
      setVideoMeta((current) => ({
        ...current,
        [importedVideo.id]: videoMetaFromVideo(importedVideo),
      }))
      setLibraryIds((current) => [importedVideo.id, ...current.filter((id) => id !== importedVideo.id)])
      setSelectedVideoId(importedVideo.id)
      setCurrentPosition(importedVideo.lastPositionSec || importedVideo.transcript[0]?.startSec || 0)
      setScreen('reader')
      setRightTab(importedVideo.transcript.length ? 'subtitle' : 'info')
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

  function findDiscoverItem(discoverId: string) {
    return discoveryItems.find((item) => item.id === discoverId)
  }

  function findSavedDiscoveryVideo(discoverId: string) {
    const item = findDiscoverItem(discoverId)
    if (!item) return null

    return videos.find((video) => (
      libraryIds.includes(video.id) &&
      (video.youtubeId === item.youtubeId || video.youtubeUrl === item.youtubeUrl)
    )) ?? null
  }

  async function importDiscoverVideo(discoverId: string, status: 'inbox' | 'learning', forceReopen = false) {
    const item = findDiscoverItem(discoverId)
    if (!item) {
      throw new Error('Discover item not found.')
    }
    if (!currentUser) {
      openAuthModal(
        '登录后保存这个视频到你的学习库。',
        status === 'inbox' ? { type: 'save-discover-to-inbox', discoverId } : { type: 'save-video' },
      )
      throw new Error('Please log in first.')
    }

    const accessToken = await getAccessToken()
    const data = await postContractJson<ImportResponse>('/api/youtube/import', {
      youtubeUrl: item.youtubeUrl,
      youtubeId: item.youtubeId,
      durationSec: item.durationSec,
      transcriptLanguage: 'transcriptLanguage' in item ? item.transcriptLanguage : undefined,
      status,
      forceReopen,
    }, accessToken)
    return contractVideoToDemoVideo(data.video, data.video.transcript ?? [])
  }

  async function saveDiscoverToInbox(discoverId: string) {
    setIsImporting(true)
    try {
      const importedVideo = await importDiscoverVideo(discoverId, 'inbox')
      setVideos((current) => [importedVideo, ...current.filter((video) => video.id !== importedVideo.id)])
      setVideoMeta((current) => ({
        ...current,
        [importedVideo.id]: videoMetaFromVideo(importedVideo),
      }))
      setLibraryIds((current) => [importedVideo.id, ...current.filter((id) => id !== importedVideo.id)])
      setPreviewDiscoverId(discoverId)
      setToast('Saved to Inbox.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save to Inbox.'
      if (message !== 'Please log in first.') setToast(message)
    } finally {
      setIsImporting(false)
    }
  }

  async function startLearningFromDiscover(discoverId: string) {
    const item = findDiscoverItem(discoverId)
    const existing = findSavedDiscoveryVideo(discoverId)
    const preferredLanguage = item && 'transcriptLanguage' in item ? item.transcriptLanguage : undefined
    const hasPreferredTranscript = !preferredLanguage || existing?.transcriptLanguage?.startsWith(preferredLanguage)

    if (existing && hasPreferredTranscript && (videoMeta[existing.id]?.status === 'learning' || videoMeta[existing.id]?.status === 'done')) {
      openReader(existing.id)
      setPreviewDiscoverId(null)
      return
    }

    setIsImporting(true)
    try {
      const importedVideo = await importDiscoverVideo(discoverId, 'learning', Boolean(existing && !hasPreferredTranscript))
      setVideos((current) => [importedVideo, ...current.filter((video) => video.id !== importedVideo.id)])
      setVideoMeta((current) => ({
        ...current,
        [importedVideo.id]: videoMetaFromVideo(importedVideo),
      }))
      setLibraryIds((current) => [importedVideo.id, ...current.filter((id) => id !== importedVideo.id)])
      setPreviewDiscoverId(null)
      openReader(importedVideo.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start learning.'
      if (message !== 'Please log in first.') setToast(message)
    } finally {
      setIsImporting(false)
    }
  }

  async function startGuestWatching(discoverId: string) {
    const item = findDiscoverItem(discoverId)
    if (!item) return

    await openGuestPreview(item.youtubeUrl, item.youtubeId, {
      durationSec: item.durationSec,
      transcriptLanguage: 'transcriptLanguage' in item ? item.transcriptLanguage : undefined,
    })
  }

  async function sendChatQuestion(
    questionInput = chatPrompt,
    contextOverride?: Partial<Pick<PendingChatRequest, 'quote' | 'timestamp' | 'selectedSubtitle'>>,
  ) {
    if (!currentUser && !isTemporaryReader) {
      openAuthModal('登录后可以围绕保存的视频继续向 AI 提问。')
      return
    }

    if (!currentUser && (guestWorkspace?.askCount ?? 0) >= 3) {
      openAuthModal('游客最多可以 Ask AI 3 次。登录后可以继续提问并保存对话。', { type: 'save-video' })
      return
    }

    const question = questionInput.trim()
    if (!question) {
      setToast('Type a question for AI first.')
      return
    }

    const contextQuote = contextOverride?.quote ?? chatContextQuote
    const contextTimestamp = contextOverride?.timestamp ?? (chatContextSelection?.timestamp ?? selectedTimestamp)
    const hasSubtitleOverride = Boolean(contextOverride && 'selectedSubtitle' in contextOverride)
    const contextSubtitle = hasSubtitleOverride
      ? contextOverride?.selectedSubtitle ?? null
      : selectedSubtitlePayload(chatContextSelection) ?? selectedSubtitlePayload(transcriptSelection)
    const fallbackSubtitle = activeContextSegment
      ? { text: activeContextSegment.text, startSec: activeContextSegment.startSec, endSec: activeContextSegment.endSec }
      : {
          text: transcript.slice(0, 3).map((segment) => segment.text).join(' '),
          startSec: transcript[0]?.startSec ?? currentPosition,
          endSec: transcript[2]?.endSec ?? currentPosition,
        }
    const askSubtitle = contextSubtitle ?? fallbackSubtitle
    const pendingRequest: PendingChatRequest = {
      id: `pending-${Date.now()}`,
      question,
      quote: contextQuote,
      timestamp: contextTimestamp,
      selectedSubtitle: askSubtitle,
    }

    setRightTab('chat')
    setIsAsking(true)
    setActiveAiSaveMenuId(null)
    setFailedChatRequest(null)
    setPendingChatRequest(pendingRequest)
    setChatPrompt('')
    setToast('Asking AI about this video...')

    try {
      const accessToken = currentUser ? await getAccessToken() : undefined
      const data = await postContractJson<{
        answer?: unknown
        citations?: unknown
        followUps?: unknown
        saveCandidates?: unknown
      }>('/api/ask', {
        videoTitle: selectedVideo.title,
        videoId: selectedVideo.id,
        selectedSubtitle: askSubtitle,
        nearbySubtitles: [],
        currentPlaybackTime: currentPosition,
        userQuestion: question,
        answerLanguage: 'zh-CN',
        mode: currentUser ? 'authenticated' : 'guest',
      }, accessToken)

      const record: ChatRecord = {
        id: `chat-${Date.now()}`,
        videoId: selectedVideo.id,
        videoTitle: selectedVideo.title,
        question,
        quote: contextQuote,
        answer: String(data.answer ?? ''),
        citations: chatCitationArray(data.citations),
        followUps: stringArray(data.followUps),
        saveCandidates: aiSaveCandidateArray(data.saveCandidates),
        createdAt: new Date().toISOString(),
      }
      setChatRecords((current) => [...current, record])
      if (!currentUser && guestWorkspace) {
        setGuestWorkspace({
          ...guestWorkspace,
          askCount: guestWorkspace.askCount + 1,
          hasAskedAI: true,
          temporaryChatRecords: [
            ...guestWorkspace.temporaryChatRecords,
            {
              clientTempId: record.id,
              question,
              quote: contextQuote,
              answer: record.answer,
              createdAt: record.createdAt,
            },
          ],
        })
      }
      setPendingChatRequest(null)
      setChatContextSelection(null)
      clearNativeSelection()
      setToast('AI answer is ready.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI request failed.'
      setFailedChatRequest({
        ...pendingRequest,
        message,
      })
      setToast(message)
    } finally {
      setIsAsking(false)
      setPendingChatRequest(null)
    }
  }

  function handleAskAi() {
    void sendChatQuestion()
  }

  function handleRetryChat(request: FailedChatRequest) {
    void sendChatQuestion(request.question, {
      quote: request.quote,
      timestamp: request.timestamp,
      selectedSubtitle: request.selectedSubtitle,
    })
  }

  async function persistTranslationCache(
    videoId: string,
    language: string,
    segments: Record<string, string>,
    status: 'partial' | 'ready' | 'failed',
  ) {
    if (!currentUser || !supabase) {
      throw new Error('Please log in before caching translated captions.')
    }

    const { error } = await supabase
      .from('learning_translations')
      .upsert(
        {
          user_id: currentUser.id,
          video_id: videoId,
          language,
          segments,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,video_id,language' },
      )

    if (error) {
      throw error
    }
  }

  async function translateBatch(batch: TranslationBatch) {
    const numberedLines = batch.segments.map((segment, index) => `${index + 1}. ${segment.text}`).join('\n')
    const accessToken = await getAccessToken()
    const data = await postContractJson<{ answer?: unknown }>('/api/ask',
      {
        videoTitle: selectedVideo.title,
        videoId: selectedVideo.id,
        selectedSubtitle: {
          text: numberedLines,
          startSec: batch.segments[0]?.startSec ?? currentPosition,
          endSec: batch.segments[batch.segments.length - 1]?.endSec ?? currentPosition,
        },
        nearbySubtitles: [],
        currentPlaybackTime: currentPosition,
        userQuestion:
          `Translate every numbered transcript line into natural ${batch.language}. Keep the original numbering and return exactly ${batch.segments.length} lines. Do not summarize, merge, explain, or add extra text.`,
        answerLanguage: batch.language,
        mode: 'authenticated',
      },
      accessToken,
    )

    const translatedLines = parseNumberedTranslations(String(data.answer ?? ''), batch.segments.length)
    return batch.segments.reduce<Record<string, string>>((acc, segment, index) => {
      acc[segment.id] = translatedLines[index] || 'Translation unavailable.'
      return acc
    }, {})
  }

  async function runTranslationBatches(batches: TranslationBatch[], totalSegments: number, completedOffset = 0) {
    if (batches.length === 0) {
      return
    }

    setIsTranslating(true)

    let completed = completedOffset
    let cachedSegments = translationSegmentsForVideo(translatedSegments, selectedVideo.id, batches[0].language)

    for (const batch of batches) {
      try {
        const batchTranslations = await translateBatch(batch)
        cachedSegments = {
          ...cachedSegments,
          ...batchTranslations,
        }
        const status = completed + batch.segments.length >= totalSegments ? 'ready' : 'partial'
        await persistTranslationCache(selectedVideo.id, batch.language, cachedSegments, status)
        setTranslatedSegments((current) => {
          const next = { ...current }
          Object.entries(batchTranslations).forEach(([segmentId, text]) => {
            next[translationKey(selectedVideo.id, batch.language, segmentId)] = text
          })
          return next
        })
        completed += batch.segments.length
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Translation failed.'
        await persistTranslationCache(selectedVideo.id, batch.language, cachedSegments, 'failed').catch(() => null)
        setIsTranslating(false)
        setToast(message)
        return
      }
    }

    setIsTranslating(false)
    setToast('中文字幕已准备好。')
  }

  async function handleTranslateCaptions(language = defaultTranslationLanguage) {
    setShowTranslations(true)

    if (transcript.length === 0) {
      return
    }

    const segmentsToTranslate = transcript.filter(
      (segment) => !translatedSegments[translationKey(selectedVideo.id, language, segment.id)],
    )

    if (segmentsToTranslate.length === 0) {
      setToast('中文字幕已准备好。')
      return
    }

    const batchSize = 8
    const batches = Array.from({ length: Math.ceil(segmentsToTranslate.length / batchSize) }, (_, index) => ({
      id: `${selectedVideo.id}:${language}:${index}`,
      language,
      segments: segmentsToTranslate.slice(index * batchSize, index * batchSize + batchSize),
    }))

    setToast('正在翻译中文字幕...')
    await runTranslationBatches(batches, transcript.length, transcript.length - segmentsToTranslate.length)
  }

  function handleJumpToCurrentSubtitle() {
    setIsTranscriptFollowing(true)
    setShowSyncPrompt(false)
    detachedAtSegmentIndexRef.current = null
    isManualTranscriptBrowsingRef.current = false
    scrollActiveTranscriptLine()
  }

  function handleTranslateTabClick() {
    if (rightTab !== 'subtitle') {
      setRightTab('subtitle')
      if (!showTranslations) {
        void handleTranslateCaptions()
      }
      return
    }

    if (showTranslations) {
      setShowTranslations(false)
      return
    }

    void handleTranslateCaptions()
  }

  function handleAskSelectedQuote() {
    if (!selectedQuote) {
      setToast('Highlight transcript text first.')
      return
    }

    const selection = transcriptSelection
    if (selection) {
      setChatContextSelection(selection)
      setChatPrompt(selection.quote)
      setIsChatContextOpen(false)
    } else {
      setChatPrompt(selectedQuote)
    }
    setActiveAiSaveMenuId(null)
    setRightTab('chat')
    clearNativeSelection()
    window.setTimeout(() => {
      chatTextareaRef.current?.focus()
    }, 80)
    setToast('Selected subtitle is ready as focus context.')
  }

  async function persistNote(note: SavedNote) {
    if (!currentUser || !supabase) {
      throw new Error('Please log in before saving notes.')
    }

    const { data, error } = await supabase
      .from('learning_notes')
      .upsert(noteToRow(note, currentUser.id), { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return rowToNote(data as LearningNoteRow)
  }

  async function persistVideoMeta(videoId: string, meta: VideoMeta) {
    if (!currentUser || !supabase) {
      throw new Error('Please log in before updating the library.')
    }

    const video = findVideoById(videos, videoId)
    const { data, error } = await supabase
      .from('learning_videos')
      .upsert(videoToRow(video, currentUser.id, meta), { onConflict: 'user_id,id' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return rowToVideo(data as LearningVideoRow)
  }

  async function saveNote(source: 'highlight' | 'thought', type: NoteType = source === 'thought' ? 'thought' : 'highlight') {
    const noteQuote = selectedQuote
    const noteTimestamp = selectedTimestamp

    if (!noteQuote) {
      return
    }

    if (!currentUser) {
      if (guestWorkspace && guestWorkspace.temporaryNotes.length < 3) {
        const content = source === 'highlight' ? noteQuote : noteDraft
        setGuestWorkspace({
          ...guestWorkspace,
          hasTemporaryNotes: true,
          temporaryNotes: [
            ...guestWorkspace.temporaryNotes,
            {
              clientTempId: `note-temp-${Date.now()}`,
              type: type === 'highlight' || type === 'thought' || type === 'videoBrief' ? 'explanation' : type,
              source,
              quote: noteQuote,
              timestampLabel: noteTimestamp,
              note: source === 'thought' ? content : '',
              content,
              takeaway: source === 'thought' ? content : '',
              tags: selectedVideoMeta.tags,
            },
          ],
        })
      } else if (guestWorkspace && guestWorkspace.temporaryNotes.length >= 3) {
        openAuthModal('游客最多可以临时保存 3 条 notes。登录后可以继续保存并同步到 Notes。', {
          type: source === 'thought' ? 'add-thought' : 'save-highlight',
        })
        return
      }
      openAuthModal('登录后保存和管理你的学习笔记。AI 回答、Highlight、Thought 都会沉淀在这里。', {
        type: source === 'thought' ? 'add-thought' : 'save-highlight',
      })
      return
    }

    const content = source === 'highlight' ? noteQuote : noteDraft
    const note: SavedNote = {
      id: `${selectedVideo.id}-${noteTimestamp}-${Date.now()}`,
      videoId: selectedVideo.id,
      videoTitle: selectedVideo.title,
      quote: noteQuote,
      timestamp: noteTimestamp,
      note: content,
      takeaway: buildTakeaway(selectedVideo, noteQuote),
      tags: selectedVideoMeta.tags,
      type,
      originalSubtitle: noteQuote,
      content,
      topics: selectedVideoMeta.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isStarred: false,
      source,
    }

    try {
      const storedNote = await persistNote(note)
      setSavedNotes((current) => [storedNote, ...current.filter((existing) => existing.id !== storedNote.id)])
      void updateVideoMeta(selectedVideo.id, {
        status: selectedVideoMeta.status === 'done' ? 'done' : 'learning',
      })
      setRightTab('note')
      setShowNoteModal(false)
      setActiveAiSaveMenuId(null)
      clearNativeSelection()

      const savedMessage =
        source === 'highlight'
          ? 'Saved as Highlight.'
          : 'Saved as Thought.'
      setToast(savedMessage)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save note.'
      setToast(message)
    }
  }

  async function saveAiResponseAsNote(record: ChatRecord, type: AiNoteType = aiSaveType, candidate?: AiSaveCandidate) {
    if (!currentUser) {
      if (guestWorkspace && guestWorkspace.temporaryNotes.length < 3) {
        const firstCitation = record.citations?.[0]
        const noteQuote = candidate?.quote || record.quote || firstCitation?.text || record.question
        const noteTimestamp = candidate?.timestamp || (firstCitation ? formatTime(firstCitation.startSec) : selectedTimestamp)
        const noteContent = candidate?.content || record.answer
        setGuestWorkspace({
          ...guestWorkspace,
          hasTemporaryNotes: true,
          temporaryNotes: [
            ...guestWorkspace.temporaryNotes,
            {
              clientTempId: `note-temp-${Date.now()}`,
              type,
              source: 'ai',
              quote: noteQuote,
              timestampLabel: noteTimestamp,
              note: '',
              content: noteContent,
              takeaway: '',
              tags: selectedVideoMeta.tags,
            },
          ],
        })
      } else if (guestWorkspace && guestWorkspace.temporaryNotes.length >= 3) {
        openAuthModal('游客最多可以临时保存 3 条 notes。登录后可以继续保存并同步到 Notes。', {
          type: 'save-ai-note',
          recordId: record.id,
          noteType: type,
        })
        return
      }
      openAuthModal('登录后保存和管理你的学习笔记。AI 回答、Highlight、Thought 都会沉淀在这里。', {
        type: 'save-ai-note',
        recordId: record.id,
        noteType: type,
      })
      return
    }

    const firstCitation = record.citations?.[0]
    const noteQuote = candidate?.quote || record.quote || firstCitation?.text || record.question
    const noteTimestamp = candidate?.timestamp || (firstCitation ? formatTime(firstCitation.startSec) : selectedTimestamp)
    const noteContent = candidate?.content || record.answer
    const note: SavedNote = {
      id: `${selectedVideo.id}-${noteTimestamp}-${Date.now()}`,
      videoId: selectedVideo.id,
      videoTitle: selectedVideo.title,
      quote: noteQuote,
      timestamp: noteTimestamp,
      note: noteContent,
      takeaway: noteContent,
      tags: selectedVideoMeta.tags,
      type,
      originalSubtitle: noteQuote,
      content: noteContent,
      topics: selectedVideoMeta.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isStarred: false,
      source: 'ai',
    }

    try {
      const storedNote = await persistNote(note)
      setSavedNotes((current) => [storedNote, ...current.filter((existing) => existing.id !== storedNote.id)])
      void updateVideoMeta(selectedVideo.id, {
        status: selectedVideoMeta.status === 'done' ? 'done' : 'learning',
      })
      setActiveAiSaveMenuId(null)
      setToast(`Saved as ${noteTypeLabel(type)}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save note.'
      setToast(message)
    }
  }

  async function copyChatAnswer(record: ChatRecord) {
    try {
      await navigator.clipboard.writeText(record.answer)
      setCopiedChatMessageId(record.id)
      window.setTimeout(() => setCopiedChatMessageId(null), 1600)
    } catch {
      setToast('Failed to copy answer.')
    }
  }

  function handleChatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || isChatComposingRef.current) {
      return
    }

    event.preventDefault()
    if (!isAsking && chatPrompt.trim()) {
      void sendChatQuestion()
    }
  }

  function openThoughtModal() {
    if (!selectedQuote) {
      setToast('Highlight transcript text first.')
      return
    }
    if (!currentUser) {
      openAuthModal('登录后保存和管理你的学习笔记。AI 回答、Highlight、Thought 都会沉淀在这里。', { type: 'add-thought' })
      return
    }
    setNoteDraft('')
    setShowNoteModal(true)
  }

  async function updateVideoMeta(videoId: string, patch: Partial<VideoMeta>) {
    if (!currentUser) {
      openAuthModal('登录后可以保存视频、继续学习进度，并管理所有学习状态。', { type: 'save-video' })
      return
    }

    const previousMeta = videoMeta[videoId] ?? { status: 'inbox', isFavourite: false, tags: [] }
    const nextMeta = {
      ...previousMeta,
      ...patch,
    }

    setVideoMeta((current) => ({
      ...current,
      [videoId]: nextMeta,
    }))

    try {
      const persistedVideo = await persistVideoMeta(videoId, nextMeta)
      setVideos((current) => current.map((video) => (video.id === videoId ? { ...video, ...persistedVideo } : video)))
      setVideoMeta((current) => ({
        ...current,
        [videoId]: videoMetaFromVideo(persistedVideo),
      }))
    } catch (error) {
      setVideoMeta((current) => ({
        ...current,
        [videoId]: previousMeta,
      }))
      const message = error instanceof Error ? error.message : 'Failed to save library update.'
      setToast(message)
    }
  }

  function openTagEditor(videoId: string) {
    if (!currentUser) {
      openAuthModal('登录后可以编辑标签并同步到你的学习库。', { type: 'edit-tags', videoId })
      return
    }
    setTagModalVideoId(videoId)
    setTagDraft('')
    setShowTagModal(true)
    setActiveVideoMenuId(null)
  }

  function addTagToVideo(tag: string) {
    const videoId = tagModalVideoId
    const cleanTag = tag.trim()
    if (!videoId || !cleanTag) return

    const meta = videoMeta[videoId] ?? { status: 'inbox', isFavourite: false, tags: [] }
    if (meta.tags.some((existing) => existing.toLowerCase() === cleanTag.toLowerCase())) {
      setTagDraft('')
      return
    }
    void updateVideoMeta(videoId, { tags: [...meta.tags, cleanTag] })
    setTagDraft('')
  }

  function removeTagFromVideo(videoId: string, tag: string) {
    const meta = videoMeta[videoId] ?? { status: 'inbox', isFavourite: false, tags: [] }
    void updateVideoMeta(videoId, { tags: meta.tags.filter((item) => item !== tag) })
  }

  async function deleteVideo(videoId: string) {
    if (!currentUser || !supabase) {
      setToast('Please log in before deleting videos.')
      return
    }

    const previousVideos = videos
    const previousLibraryIds = libraryIds
    const previousNotes = savedNotes
    const previousVideoMeta = videoMeta
    const previousTranslations = translatedSegments

    setLibraryIds((current) => current.filter((id) => id !== videoId))
    setVideos((current) => current.filter((video) => video.id !== videoId))
    setSavedNotes((current) => current.filter((note) => note.videoId !== videoId))
    setVideoMeta((current) => {
      const next = { ...current }
      delete next[videoId]
      return next
    })
    setTranslatedSegments((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${videoId}:`))),
    )
    setActiveVideoMenuId(null)
    if (selectedVideoId === videoId) {
      const nextId = libraryIds.find((id) => id !== videoId) ?? initialLibraryIds[0]
      setSelectedVideoId(nextId)
    }

    try {
      const [translationsResult, notesResult, conversationsResult, videosResult] = await Promise.all([
        supabase.from('learning_translations').delete().eq('user_id', currentUser.id).eq('video_id', videoId),
        supabase.from('learning_notes').delete().eq('user_id', currentUser.id).eq('video_id', videoId),
        supabase.from('learning_conversations').delete().eq('user_id', currentUser.id).eq('video_id', videoId),
        supabase.from('learning_videos').delete().eq('user_id', currentUser.id).eq('id', videoId),
      ])
      const error = translationsResult.error ?? notesResult.error ?? conversationsResult.error ?? videosResult.error
      if (error) {
        throw error
      }
      setToast('Video deleted from this workspace.')
    } catch (error) {
      setVideos(previousVideos)
      setLibraryIds(previousLibraryIds)
      setSavedNotes(previousNotes)
      setVideoMeta(previousVideoMeta)
      setTranslatedSegments(previousTranslations)
      const message = error instanceof Error ? error.message : 'Failed to delete video.'
      setToast(message)
    }
  }

  async function updateNote(noteId: string, patch: Partial<SavedNote>) {
    if (!currentUser || !supabase) {
      openAuthModal('登录后保存和管理你的学习笔记。AI 回答、Highlight、Thought 都会沉淀在这里。', {
        type: 'star-note',
        noteId,
      })
      return false
    }

    const previousNotes = savedNotes
    const targetNote = savedNotes.find((note) => note.id === noteId)
    if (!targetNote) return false

    const nextNote: SavedNote = {
      ...targetNote,
      ...patch,
      updatedAt: new Date().toISOString(),
    }

    setSavedNotes((current) => current.map((note) => (note.id === noteId ? nextNote : note)))

    try {
      const storedNote = await persistNote(nextNote)
      setSavedNotes((current) => current.map((note) => (note.id === noteId ? storedNote : note)))
      return true
    } catch (error) {
      setSavedNotes(previousNotes)
      const message = error instanceof Error ? error.message : 'Failed to update note.'
      setToast(message)
      return false
    }
  }

  async function deleteNote(noteId: string) {
    if (!currentUser || !supabase) {
      setToast('Please log in before deleting notes.')
      return
    }

    const previousNotes = savedNotes
    setSavedNotes((current) => current.filter((note) => note.id !== noteId))
    setActiveNoteMenuId(null)

    try {
      const { error } = await supabase
        .from('learning_notes')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('id', noteId)

      if (error) {
        throw error
      }
      setToast('Note deleted.')
    } catch (error) {
      setSavedNotes(previousNotes)
      const message = error instanceof Error ? error.message : 'Failed to delete note.'
      setToast(message)
    }
  }

  async function editNoteContent(note: SavedNote) {
    const nextContent = window.prompt('Edit note', note.content ?? note.note)
    if (nextContent === null) return

    const didUpdate = await updateNote(note.id, {
      content: nextContent,
      note: nextContent,
    })
    setActiveNoteMenuId(null)
    if (didUpdate) {
      setToast('Note updated.')
    }
  }

  function handleNavigate(nextScreen: Screen) {
    if (!currentUser && nextScreen === 'library') {
      openAuthModal('登录后查看你的学习库。你可以保存视频、继续学习进度，并管理所有学习状态。', { type: 'open-library' })
      return
    }

    if (!currentUser && nextScreen === 'notes') {
      openAuthModal('登录后保存和管理你的学习笔记。AI 回答、Highlight、Thought 都会沉淀在这里。', { type: 'open-notes' })
      return
    }

    setScreen(nextScreen)
  }

  function renderChatThread() {
    const latestRecordId = selectedChatRecords[selectedChatRecords.length - 1]?.id
    return (
      <div className="chat-thread">
        {!hasChatActivity ? (
          <article className="chat-empty-state">
            <strong>Ask about this video</strong>
            <p>Ask for meaning, arguments, examples, or study notes grounded in the transcript.</p>
          </article>
        ) : null}

        {selectedChatRecords.map((record) => {
          const showFollowUps = record.id === latestRecordId && (record.followUps?.length ?? 0) > 0 && !isAsking

          return (
            <div key={record.id} className="chat-exchange">
              <article className="chat-message chat-message--user">
                <p>{record.question}</p>
                {record.quote ? <span>基于选中字幕</span> : <span>基于整条视频字幕</span>}
              </article>

              <article className="chat-message chat-message--assistant">
                <div className="chat-answer-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {record.answer}
                  </ReactMarkdown>
                </div>
                {record.citations?.length ? (
                  <div className="chat-citations" aria-label="Answer citations">
                    {record.citations.map((citation) => (
                      <button key={`${record.id}-${citation.segmentId}`} type="button" onClick={() => handleSeek(citation.startSec)}>
                        <span>{citation.label}</span>
                        <small>{citation.text}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="chat-message-actions">
                  <button type="button" onClick={() => void copyChatAnswer(record)} title="Copy answer">
                    {copiedChatMessageId === record.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button type="button" onClick={() => setActiveAiSaveMenuId(activeAiSaveMenuId === record.id ? null : record.id)} title="Save to Notebook">
                    <Bookmark size={15} />
                  </button>
                  <button type="button" onClick={() => void sendChatQuestion(record.question, { quote: record.quote ?? '', timestamp: selectedTimestamp, selectedSubtitle: null })} title="Retry question" disabled={isAsking}>
                    <RefreshCw size={15} />
                  </button>
                </div>
                {activeAiSaveMenuId === record.id ? (
                  <div className="chat-save-picker">
                    <select value={aiSaveType} onChange={(event) => setAiSaveType(event.target.value as AiNoteType)}>
                      <option value="explanation">Explanation</option>
                      <option value="keyIdea">Key Idea</option>
                      <option value="reviewQuestion">Review Question</option>
                    </select>
                    <button type="button" onClick={() => void saveAiResponseAsNote(record, aiSaveType)}>
                      Save full answer
                    </button>
                    {record.saveCandidates?.length ? (
                      <div className="chat-save-candidates">
                        {record.saveCandidates.map((candidate, index) => (
                          <button
                            key={`${record.id}-candidate-${index}`}
                            type="button"
                            onClick={() => void saveAiResponseAsNote(record, candidate.type, candidate)}
                          >
                            <strong>{noteTypeLabel(candidate.type)}</strong>
                            <span>{candidate.content}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {showFollowUps ? (
                  <div className="chat-followups">
                    {record.followUps?.map((question) => (
                      <button key={question} type="button" onClick={() => void sendChatQuestion(question, { quote: '', timestamp: selectedTimestamp, selectedSubtitle: null })} disabled={isAsking}>
                        {question}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>
          )
        })}

        {pendingChatRequest ? (
          <div className="chat-exchange">
            <article className="chat-message chat-message--user">
              <p>{pendingChatRequest.question}</p>
              {pendingChatRequest.quote ? <span>基于选中字幕</span> : <span>基于整条视频字幕</span>}
            </article>
            <article className="chat-message chat-message--assistant chat-message--loading">
              <Loader2 size={16} />
              <p>AI is thinking...</p>
            </article>
          </div>
        ) : null}

        {failedChatRequest ? (
          <div className="chat-exchange">
            <article className="chat-message chat-message--user">
              <p>{failedChatRequest.question}</p>
              {failedChatRequest.quote ? <span>基于选中字幕</span> : <span>基于整条视频字幕</span>}
            </article>
            <article className="chat-message chat-message--assistant chat-message--error">
              <p>{failedChatRequest.message}</p>
              <button type="button" onClick={() => handleRetryChat(failedChatRequest)} disabled={isAsking}>
                <RefreshCw size={14} />
                Retry
              </button>
            </article>
          </div>
        ) : null}
      </div>
    )
  }

  function renderHomePage() {
    const recentVideos = libraryIds.map((id) => findVideoById(videos, id)).slice(0, 3)

    return (
      <div className="page-shell home-page">
        <section className="home-hero">
          <p className="page-eyebrow">Vist / 观知</p>
          <h2>Learn deeply from YouTube videos</h2>
          <p>Paste a YouTube URL and turn it into notes, highlights, questions and review cards.</p>
          <form
            className="home-import"
            onSubmit={(event) => {
              event.preventDefault()
              void handleImportUrl()
            }}
          >
            <input
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="Paste YouTube URL..."
              disabled={isImporting}
            />
            <button className="secondary-button secondary-button--strong" type="submit" disabled={isImporting || !linkInput.trim()}>
              {isImporting ? 'Importing...' : 'Start Learning'}
            </button>
          </form>
        </section>

        <section className="page-section">
          <div className="section-heading">
            <div>
              <p>Recent Learning</p>
              <h3>Continue where your last video became knowledge</h3>
            </div>
            <button className="text-button" type="button" onClick={() => handleNavigate('library')}>
              View All
            </button>
          </div>
          <div className="recent-grid">
            <button className="learning-card learning-card--new" type="button" onClick={() => setShowAddModal(true)}>
              <div className="learning-card__placeholder"><Plus size={24} /></div>
              <strong>Import New Video</strong>
              <span>粘贴链接开始学习</span>
            </button>
            {recentVideos.map((video) => {
              const videoNotes = savedNotes.filter((note) => note.videoId === video.id)
              return (
                <button key={video.id} className="learning-card" type="button" onClick={() => openReader(video.id)}>
                  <div className="learning-card__thumb" style={{ background: `linear-gradient(160deg, #f9f5ef, ${video.accent})` }}>
                    {video.coverImage ? <img alt={video.title} src={video.coverImage} /> : null}
                    <span>{video.durationLabel}</span>
                  </div>
                  <strong>{video.title}</strong>
                  <small>{video.channel}</small>
                  <div className="learning-card__meta">
                    <span>Progress {progressPercent(video)}%</span>
                    <span>{Math.max(videoNotes.length, video.id === 'jenny-design' ? 8 : 3)} notes</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="page-section home-discovery-section">
          <div className="section-heading">
            <div>
              <p>Discover</p>
              <h3>Learning videos worth opening next</h3>
            </div>
          </div>
          <div className="home-discovery-waterfall">
            {discoveryItems.map((item, index) => (
              <button
                key={item.id}
                className="home-video-card"
                type="button"
                onClick={() => setPreviewDiscoverId(item.id)}
              >
                <div className="home-video-card__thumb" data-tone={index % 4}>
                  <img alt={item.title} src={item.thumbnailUrl} />
                  <span>{item.duration}</span>
                </div>
                <div className="home-video-card__body">
                  <strong>{item.title}</strong>
                  <div>
                    <span>{item.channel}</span>
                    <span>{item.duration}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    )
  }

  function renderNotesPage() {
    const noteTabs: Array<{ label: string; type: NoteType | 'all' }> = [
      { label: 'All Notes', type: 'all' },
      { label: 'Highlights', type: 'highlight' },
      { label: 'Thoughts', type: 'thought' },
      { label: 'Explanations', type: 'explanation' },
      { label: 'Key Ideas', type: 'keyIdea' },
      { label: 'Review Questions', type: 'reviewQuestion' },
    ]
    const sourceNotes = currentUser ? allNotes : demoNotebookNotes
    const noteVideoOptions = Array.from(
      new Map(sourceNotes.map((note) => [note.videoId, note.videoTitle ?? findVideoById(videos, note.videoId).title])).entries(),
    )
    const noteTagOptions = Array.from(new Set(sourceNotes.flatMap((note) => note.tags))).sort((a, b) => a.localeCompare(b))
    const visibleNotes = sourceNotes
      .filter((note) => noteTypeFilter === 'all' || noteTypeFromSource(note) === noteTypeFilter)
      .filter((note) => noteVideoFilter === 'all' || note.videoId === noteVideoFilter)
      .filter((note) => noteTagFilter === 'all' || note.tags.includes(noteTagFilter))
      .filter((note) => !noteStarredOnly || note.isStarred)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0

        return noteSortOrder === 'newest' ? bTime - aTime : aTime - bTime
      })

    return (
      <div className="page-shell">
        <div className="page-title">
          <h2>Notes 全局笔记</h2>
        </div>
        <div className="page-tabs">
          {noteTabs.map((tab) => (
            <button
              key={tab.label}
              className={`tabs__item tabs__item--soft ${noteTypeFilter === tab.type ? 'tabs__item--active' : ''}`}
              type="button"
              onClick={() => setNoteTypeFilter(tab.type)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="note-filter-bar">
          <label className="note-filter-control">
            <span>Video:</span>
            <select value={noteVideoFilter} onChange={(event) => setNoteVideoFilter(event.target.value)}>
              <option value="all">All Videos</option>
              {noteVideoOptions.map(([videoId, videoTitle]) => (
                <option key={videoId} value={videoId}>{videoTitle}</option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>
          <label className="note-filter-control">
            <span>Tag:</span>
            <select value={noteTagFilter} onChange={(event) => setNoteTagFilter(event.target.value)}>
              <option value="all">All Tags</option>
              {noteTagOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>
          <label className="note-filter-check">
            <input
              type="checkbox"
              checked={noteStarredOnly}
              onChange={(event) => setNoteStarredOnly(event.target.checked)}
            />
            <span>Starred only</span>
          </label>
          <label className="note-filter-control">
            <span>Sort:</span>
            <select value={noteSortOrder} onChange={(event) => setNoteSortOrder(event.target.value as 'newest' | 'oldest')}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
            <ChevronDown size={16} />
          </label>
        </div>
        <div className="global-note-list global-note-list--waterfall">
          {visibleNotes.map((note) => {
            const noteType = noteTypeFromSource(note)
            const isHighlight = noteType === 'highlight'

            return (
              <article key={note.id} className="global-note-card">
                <div className="global-note-card__top">
                  <span>{noteTypeLabel(noteType)} · {note.timestamp}</span>
                  <button
                    className="icon-button icon-button--ghost"
                    type="button"
                    aria-label="Note menu"
                    onClick={() => setActiveNoteMenuId((current) => (current === note.id ? null : note.id))}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {activeNoteMenuId === note.id ? (
                    <div className="row-menu row-menu--note">
                      <button type="button" onClick={() => openReader(note.videoId)}>Open video</button>
                      <button type="button" onClick={() => void editNoteContent(note)}>Edit</button>
                      <button type="button" onClick={() => void deleteNote(note.id)}>Delete</button>
                    </div>
                  ) : null}
                </div>
                {note.originalSubtitle || note.quote ? <blockquote>{note.originalSubtitle ?? note.quote}</blockquote> : null}
                {!isHighlight ? <p>{note.content ?? note.takeaway ?? note.note}</p> : null}
                <span className="global-note-card__source">{note.videoTitle ?? findVideoById(videos, note.videoId).title}</span>
                <footer className="global-note-card__footer">
                  <div className="tag-row tag-row--compact global-note-card__tags">
                    {note.tags.length ? note.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No tags</span>}
                  </div>
                  <button
                    className={`note-like-button ${note.isStarred ? 'note-like-button--active' : ''}`}
                    type="button"
                    aria-label={note.isStarred ? 'Unstar note' : 'Star note'}
                    onClick={() => void updateNote(note.id, { isStarred: !note.isStarred })}
                  >
                    <ThumbsUp size={15} />
                  </button>
                </footer>
              </article>
            )
          })}
        </div>
      </div>
    )
  }

  if (!isAuthChecked) {
    return (
      <main className="auth-shell">
        <section className="auth-panel auth-panel--loading">
          <div className="add-modal__spinner" />
          <p>Checking session...</p>
        </section>
      </main>
    )
  }

  return (
    <main className={`desktop-app ${screen === 'reader' ? 'desktop-app--reader' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1>
            <span>Vist</span>
            <span>观知</span>
          </h1>
        </div>

        <nav className="sidebar__main">
          <div className="sidebar__stack">
            {sidebarCollections.map((item) => {
              const Icon = item.icon
              const isLocked = !currentUser && item.screen !== 'home'
              const isSelected = screen === item.screen && !isLocked

              return (
                <button
                  key={item.label}
                  className={`nav-link nav-link--subtle ${isSelected ? 'nav-link--selected' : ''} ${isLocked ? 'nav-link--locked' : ''}`}
                  type="button"
                  onClick={() => handleNavigate(item.screen)}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {isLocked ? <Lock size={14} /> : null}
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      {screen !== 'reader' ? renderAccountControl({
        className: 'global-account',
        signInMessage: '登录后保存你的学习进度、笔记和 AI 对话。',
      }) : null}

      <section className="workspace">
        {screen === 'library' ? (
        <header className="workspace__topbar">
          <div className="workspace__group">
            <div className="library-title">
              <strong>Videos</strong>
              <ChevronDown size={16} />
            </div>

            {screen === 'library' ? (
              <div className="tabs">
                {(['inbox', 'learning', 'done', 'favourite'] as LibraryTab[]).map((tab) => (
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
              </div>
            )}
          </div>

        </header>
        ) : null}

        {screen === 'home' ? (
          renderHomePage()
        ) : screen === 'library' ? (
          <div className="library-layout">
            <section className="list-pane">
              {inboxTab === 'inbox' ? (
                <div className="inbox-action-bar">
                  <form
                    className="inbox-import"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleImportUrl()
                    }}
                  >
                    <input
                      value={linkInput}
                      onChange={(event) => setLinkInput(event.target.value)}
                      placeholder="Paste YouTube URL..."
                      disabled={isImporting}
                    />
                    <button className="secondary-button secondary-button--strong" type="submit" disabled={isImporting || !linkInput.trim()}>
                      {isImporting ? 'Importing...' : 'Start Learning'}
                    </button>
                  </form>
                </div>
              ) : null}
              <div className="rows">
                {visibleLibraryIds.map((videoId, index) => {
                  const video = findVideoById(videos, videoId)
                  const isActive = video.id === selectedVideoId
                  const meta = videoMeta[video.id] ?? { status: 'inbox', isFavourite: false, tags: [] }
                  const videoNotes = savedNotes.filter((note) => note.videoId === video.id)
                  const highlightCount = videoNotes.filter((note) => noteTypeFromSource(note) === 'highlight').length
                  const questionCount = videoNotes.filter((note) => noteTypeFromSource(note) === 'reviewQuestion').length

                  return (
                    <article
                      key={video.id}
                      className={`library-row ${isActive ? 'library-row--active' : ''}`}
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
                          <div className="library-row__actions">
                            <button
                              className={`icon-button icon-button--ghost ${meta.isFavourite ? 'icon-button--favourite' : ''}`}
                              type="button"
                              aria-label={meta.isFavourite ? 'Unfavourite' : 'Favourite'}
                              onClick={(event) => {
                                event.stopPropagation()
                                void updateVideoMeta(video.id, { isFavourite: !meta.isFavourite })
                              }}
                            >
                              <Star size={16} />
                            </button>
                            <button
                              className="icon-button icon-button--ghost"
                              type="button"
                              aria-label="Video menu"
                              onClick={(event) => {
                                event.stopPropagation()
                                setActiveVideoMenuId((current) => (current === video.id ? null : video.id))
                              }}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                            {activeVideoMenuId === video.id ? (
                              <div className="row-menu" onClick={(event) => event.stopPropagation()}>
                                <button type="button" onClick={() => openTagEditor(video.id)}>Edit Tags</button>
                                <button type="button" onClick={() => { void updateVideoMeta(video.id, { status: 'done' }); setActiveVideoMenuId(null) }}>Mark as Done</button>
                                <button type="button" onClick={() => { void updateVideoMeta(video.id, { status: 'inbox' }); setActiveVideoMenuId(null) }}>Move to Inbox</button>
                                <button type="button" onClick={() => { void updateVideoMeta(video.id, { isFavourite: !meta.isFavourite }); setActiveVideoMenuId(null) }}>
                                  {meta.isFavourite ? 'Unfavourite' : 'Favourite'}
                                </button>
                                <button type="button" onClick={() => void deleteVideo(video.id)}>Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="library-row__meta">
                          <span>{getHostnameLabel(video.youtubeUrl)}</span>
                          <span>{video.channel}</span>
                          <span>{video.durationLabel}</span>
                        </div>
                        <div className="library-row__stats">
                          <span>Progress {progressPercent(video)}%</span>
                          <span>Notes {Math.max(videoNotes.length, index === 0 ? 12 : 6)}</span>
                          <span>Highlights {Math.max(highlightCount, index === 0 ? 34 : 18)}</span>
                          <span>Questions {Math.max(questionCount, index === 0 ? 5 : 2)}</span>
                          <span>{index === 0 ? 'today' : index === 1 ? 'today' : 'yesterday'}</span>
                        </div>
                        <div className="tag-row">
                          {meta.tags.length ? meta.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No tags</span>}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

          </div>
        ) : screen === 'reader' ? (
          <>
            <header className="reader-topbar">
              <button
                className="reader-topbar__brand"
                type="button"
                aria-label="Back to home"
                onClick={() => setScreen('home')}
              >
                <span>Vist</span>
                <span>观知</span>
              </button>

              {isTemporaryReader ? (
                <div className="reader-temp-status">
                  Temporary video · Log in to save progress and notes
                </div>
              ) : null}

              {renderAccountControl({
                className: 'reader-topbar__account',
                signInMessage: '登录后可以保存这个临时视频的学习进度和笔记。',
                signInAction: { type: 'save-video' },
              })}
            </header>

            <div
              ref={readerLayoutRef}
              className="reader-layout"
              style={readerLeftWidth ? { gridTemplateColumns: `${readerLeftWidth}px minmax(340px, 1fr)` } : undefined}
            >
            <section className="reader-main">
              <div className="reader-scroll">
                <article className="study-player-card">
                  <header className="study-player-card__header">
                    <div>
                      <h2>{selectedVideo.title}</h2>
                      <p>{selectedVideo.channel}</p>
                    </div>
                  </header>

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

                  <div className="study-player-progress">
                    <span>{formatTime(currentPosition)} / {selectedVideo.durationLabel}</span>
                    <div>
                      <i style={{ width: `${(currentPosition / selectedVideo.durationSec) * 100}%` }} />
                    </div>
                  </div>
                </article>

              </div>
            </section>

            <aside className="right-pane">
              <div className="right-pane__tabs right-pane__tabs--with-tools">
                <div className="right-pane__tab-list">
                  {(['info', 'note', 'chat', 'subtitle'] as RightTab[]).map((tab) => (
                    <Fragment key={tab}>
                      <button
                        className={`right-pane__tab ${rightTab === tab ? 'right-pane__tab--active' : ''}`}
                        type="button"
                        onClick={() => setRightTab(tab)}
                      >
                        {tab.toUpperCase()}
                        {tab === 'note' ? <span>{selectedNotes.length}</span> : null}
                      </button>
                      {tab === 'info' ? (
                        <button
                          className="right-pane__tab right-pane__translate-button"
                          type="button"
                          onClick={handleTranslateTabClick}
                          disabled={isTranslating}
                        >
                          {isTranslating ? 'Translating' : showTranslations ? 'Hide' : 'Translate'}
                        </button>
                      ) : null}
                    </Fragment>
                  ))}
                </div>

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
                      <div><dt>Notes</dt><dd>{selectedNotes.length}</dd></div>
                      <div><dt>Highlights</dt><dd>{selectedNotes.filter((note) => noteTypeFromSource(note) === 'highlight').length}</dd></div>
                      <div><dt>Questions</dt><dd>{selectedNotes.filter((note) => noteTypeFromSource(note) === 'reviewQuestion').length}</dd></div>
                    </dl>
                  </section>

                  <section className="meta-section">
                    <p>Manual Tags</p>
                    <div className="tag-row tag-row--compact">
                      {selectedVideoMeta.tags.length ? selectedVideoMeta.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No tags</span>}
                    </div>
                  </section>
                </div>
              ) : null}

              {rightTab === 'note' ? (
                <div className="detail-panel">
                  <section className="meta-section">
                    <p>Notebook</p>
                  </section>

                  <div className="note-stack">
                    {selectedNotes.length ? (
                      selectedNotes.map((note) => (
                        <article key={note.id} className="note-card">
                          <span>{note.timestamp} · {noteTypeLabel(noteTypeFromSource(note))}</span>
                          <blockquote>{note.originalSubtitle ?? note.quote}</blockquote>
                          <p>{note.content ?? note.note}</p>
                          <div className="tag-row tag-row--compact">
                            {note.tags.length ? note.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>No tags</span>}
                          </div>
                          <div className="note-card__actions">
                            <button className="text-button" type="button" onClick={() => handleSeek(Number(note.timestamp.split(':')[0]) * 60 + Number(note.timestamp.split(':')[1] ?? 0))}>Jump</button>
                            <button className="text-button" type="button" onClick={() => void editNoteContent(note)}>Edit</button>
                            <button className="text-button" type="button" onClick={() => void deleteNote(note.id)}>Delete</button>
                          </div>
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
                  {renderChatThread()}

                  {shouldShowChatSuggestions ? (
                    <div className="chat-suggestions">
                      {askSuggestions.map((suggestion) => (
                        <button key={suggestion} className="chip-button chip-button--prompt" type="button" onClick={() => void sendChatQuestion(suggestion, { quote: '', timestamp: selectedTimestamp, selectedSubtitle: null })}>
                          <Sparkles size={14} />
                          <span>{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <section className="meta-section chat-composer-section">
                    {transcript.length ? (
                      <div className="chat-context-pill">
                        <button
                          className="chat-context-pill__label"
                          type="button"
                          onClick={() => setIsChatContextOpen((current) => !current)}
                        >
                          {chatContextLabel}
                        </button>
                        {chatContextSelection ? (
                          <button
                            type="button"
                            onClick={() => {
                              setChatContextSelection(null)
                              setTranscriptSelection(null)
                              setIsChatContextOpen(false)
                              clearNativeSelection()
                            }}
                            aria-label="Clear subtitle context"
                          >
                            <X size={13} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {isChatContextOpen ? (
                      <blockquote className="chat-context-preview">
                        {chatContextPreview}
                      </blockquote>
                    ) : null}
                    <div className="chat-composer">
                      <textarea
                        ref={chatTextareaRef}
                        value={chatPrompt}
                        onChange={(event) => setChatPrompt(event.target.value)}
                        onKeyDown={handleChatKeyDown}
                        onCompositionStart={() => {
                          isChatComposingRef.current = true
                        }}
                        onCompositionEnd={() => {
                          isChatComposingRef.current = false
                        }}
                        placeholder="Ask about this video..."
                        disabled={isAsking}
                      />
                      <button className="chat-send-button" type="button" onClick={handleAskAi} disabled={isAsking || !chatPrompt.trim()} title="Send">
                        {isAsking ? <Loader2 size={17} /> : <Send size={17} />}
                      </button>
                    </div>
                  </section>
                </div>
              ) : null}

              {rightTab === 'subtitle' ? (
                <div className="detail-panel detail-panel--subtitle">
                  <p className="panel-kicker panel-kicker--subtitle">Subtitle 字幕</p>
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
                      {transcript.length === 0 ? (
                        <article className="empty-card">
                          <strong>No transcript found</strong>
                          <p>This video was imported, but captions were not available from the public transcript endpoint.</p>
                          <div className="empty-card__actions">
                            <button className="secondary-button" type="button" onClick={() => window.open(selectedVideo.youtubeUrl, '_blank', 'noopener,noreferrer')}>
                              Open in YouTube
                            </button>
                            <button className="secondary-button secondary-button--strong" type="button" onClick={() => setShowAddModal(true)}>
                              Import another video
                            </button>
                          </div>
                        </article>
                      ) : null}
                      {transcript.map((segment, index) => {
                        const isSelected = selectedSegmentIds.includes(segment.id)
                        const isActive = activeSegmentIndex === index
                        const translationText = translatedSegments[translationKey(selectedVideo.id, defaultTranslationLanguage, segment.id)]

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
          </>
        ) : screen === 'notes' ? (
          renderNotesPage()
        ) : (
          renderHomePage()
        )}
      </section>

      <AnimatePresence>
        {transcriptSelection && !isSelectionGestureActive ? (
          <motion.div
            ref={selectionFloatRef}
            className="selection-float"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{ left: transcriptSelection.x, top: transcriptSelection.y }}
          >
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void saveNote('highlight', 'highlight')}>
              Save to Notebook
            </button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openThoughtModal}>
              Add Thought
            </button>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleAskSelectedQuote}
            >
              {isAsking ? 'Asking...' : 'Ask AI'}
            </button>
            <button className="selection-float__ghost" type="button" onClick={clearNativeSelection}>
              <X size={16} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {previewDiscoverItem ? (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="preview-modal" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }}>
              <div className="preview-modal__thumb" data-tone={discoveryItems.findIndex((item) => item.id === previewDiscoverItem.id) % 4}>
                <img alt={previewDiscoverItem.title} src={previewDiscoverItem.thumbnailUrl} />
                <span>{previewDiscoverItem.duration}</span>
              </div>
              <div className="preview-modal__body">
                <button className="icon-button icon-button--ghost preview-modal__close" type="button" onClick={() => setPreviewDiscoverId(null)}>
                  <X size={18} />
                </button>
                <div className="preview-modal__meta">
                  <span>{previewDiscoverItem.channel}</span>
                  <span>{previewDiscoverItem.duration}</span>
                  {previewDiscoverItem.difficulty ? <span>{previewDiscoverItem.difficulty}</span> : null}
                </div>
                <h3>{previewDiscoverItem.title}</h3>
                <p>{previewDiscoverItem.reason}</p>
                <section>
                  <strong>What you will learn</strong>
                  <ul>
                    {previewDiscoverItem.learnBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </section>
                <div className="tag-row tag-row--compact">
                  {previewDiscoverItem.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="preview-modal__actions">
                  {currentUser ? (
                    <>
                      <button
                        className="secondary-button secondary-button--strong"
                        type="button"
                        disabled={isImporting}
                        onClick={() => void startLearningFromDiscover(previewDiscoverItem.id)}
                      >
                        Start learning
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isImporting}
                        onClick={() => void saveDiscoverToInbox(previewDiscoverItem.id)}
                      >
                        {videoMeta[findSavedDiscoveryVideo(previewDiscoverItem.id)?.id ?? '']?.status === 'inbox' ? 'Saved to Inbox' : 'Save to Inbox'}
                      </button>
                      {videoMeta[findSavedDiscoveryVideo(previewDiscoverItem.id)?.id ?? '']?.status === 'inbox' ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setPreviewDiscoverId(null)
                            handleNavigate('library')
                          }}
                        >
                          View in Library
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        className="secondary-button secondary-button--strong"
                        type="button"
                        disabled={isImporting}
                        onClick={() => void startGuestWatching(previewDiscoverItem.id)}
                      >
                        Start watching
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openAuthModal('登录后可以保存视频、继续学习进度，并管理所有学习状态。', { type: 'save-discover-to-inbox', discoverId: previewDiscoverItem.id })}
                      >
                        Log in to save
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
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
                <strong>Add your thought</strong>
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
                  placeholder="Write your thought about this passage..."
                  rows={6}
                />
                <div className="note-modal__actions">
                  <button className="secondary-button" type="button" onClick={() => setShowNoteModal(false)}>
                    Cancel
                  </button>
                  <button className="secondary-button secondary-button--strong" type="button" onClick={() => void saveNote('thought', 'thought')}>
                    Save Thought
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showTagModal && tagModalVideoId ? (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="note-modal tag-modal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
              <div className="note-modal__header">
                <strong>Edit Tags</strong>
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setShowTagModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="note-modal__body">
                <div className="tag-row">
                  {(videoMeta[tagModalVideoId]?.tags ?? []).length ? (
                    videoMeta[tagModalVideoId].tags.map((tag) => (
                      <button key={tag} className="tag-pill-button" type="button" onClick={() => removeTagFromVideo(tagModalVideoId, tag)}>
                        {tag} <X size={12} />
                      </button>
                    ))
                  ) : (
                    <span>No tags</span>
                  )}
                </div>
                <form
                  className="tag-add-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    addTagToVideo(tagDraft)
                  }}
                >
                  <label htmlFor="custom-tag-input">Custom tag</label>
                  <input
                    ref={tagInputRef}
                    id="custom-tag-input"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="Type a tag and press Enter"
                  />
                  <button className="secondary-button" type="submit" disabled={!tagDraft.trim()}>Add</button>
                </form>
                <div className="common-tag-grid">
                  {commonTags.map((tag) => (
                    <button key={tag} className="chip-button" type="button" onClick={() => addTagToVideo(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="note-modal__actions">
                  <button className="secondary-button" type="button" onClick={() => setShowTagModal(false)}>
                    Cancel
                  </button>
                  <button className="secondary-button secondary-button--strong" type="button" onClick={() => setShowTagModal(false)}>
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showAuthModal ? (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              className="auth-card auth-card--modal"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              onSubmit={handleAuthSubmit}
            >
              <div className="note-modal__header">
                <strong>{authMode === 'signup' ? 'Create account' : 'Sign in'}</strong>
                <button className="icon-button icon-button--ghost" type="button" onClick={() => setShowAuthModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <p className="auth-modal-message">{authModalMessage}</p>
              <div className="auth-card__switch">
                <button
                  className={authMode === 'login' ? 'auth-card__switch-item auth-card__switch-item--active' : 'auth-card__switch-item'}
                  type="button"
                  onClick={() => {
                    setAuthMode('login')
                    setAuthError('')
                    setAuthSuccess('')
                  }}
                >
                  Log in
                </button>
                <button
                  className={authMode === 'signup' ? 'auth-card__switch-item auth-card__switch-item--active' : 'auth-card__switch-item'}
                  type="button"
                  onClick={() => {
                    setAuthMode('signup')
                    setAuthError('')
                    setAuthSuccess('')
                  }}
                >
                  Sign up
                </button>
              </div>

              {authMode === 'signup' ? (
                <label className="auth-field">
                  <span>Name</span>
                  <input
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
              ) : null}

              <label className="auth-field">
                <span>Email</span>
                <input
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="auth-field">
                <span>Password</span>
                <input
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
              </label>

              {!isSupabaseConfigured ? (
                <p className="auth-error">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
              ) : null}
              {authSuccess ? <p className="auth-success">{authSuccess}</p> : null}
              {authError ? <p className="auth-error">{authError}</p> : null}

              <button className="secondary-button secondary-button--strong auth-submit" type="submit" disabled={isAuthBusy || !isSupabaseConfigured}>
                {isAuthBusy ? 'Working...' : authMode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </motion.form>
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
