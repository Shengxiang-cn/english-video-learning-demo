import type { DemoVideo } from './mockData'

export type LibraryStatus = 'inbox' | 'learning' | 'done'

export type ContractVideo = {
  id: string
  youtubeId: string
  youtubeUrl: string
  title: string
  channel: string
  durationSec: number
  thumbnailUrl: string
  transcript?: DemoVideo['transcript']
  status?: LibraryStatus
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

export type PreviewResponse = {
  video: ContractVideo
  transcript: DemoVideo['transcript']
}

export type ImportResponse = {
  video: ContractVideo
}

export type GuestMigrateResponse = {
  video: {
    id: string
    youtubeId: string
    status: LibraryStatus
  }
  notes: unknown[]
  conversations: unknown[]
}
