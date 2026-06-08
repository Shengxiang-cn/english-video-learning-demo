export type TranscriptSegment = {
  id: string
  startSec: number
  endSec: number
  speaker: 'speaker1' | 'speaker2'
  text: string
}

export type DemoVideo = {
  id: string
  sourceType: 'youtube' | 'bili' | 'reader'
  sourceLabel: string
  title: string
  channel: string
  durationLabel: string
  durationSec: number
  lastPositionSec: number
  lastPositionLabel: string
  summary: string
  cardPreview: string
  publisherLine: string
  thumbnailUrl: string
  youtubeUrl: string
  accent: string
  coverEyebrow: string
  coverTitle: string
  coverDetail: string
  transcript: TranscriptSegment[]
}

const jennyTranscript: TranscriptSegment[] = [
  {
    id: 'jw-1',
    startSec: 2126,
    endSec: 2134,
    speaker: 'speaker1',
    text: 'Yes, and today we want to ask how design teams keep up when there are agents running everywhere at once.',
  },
  {
    id: 'jw-2',
    startSec: 2135,
    endSec: 2144,
    speaker: 'speaker2',
    text: "Wow, that's a very, very interesting shift, because engineering is changing so quickly that design is forced to change with it.",
  },
  {
    id: 'jw-3',
    startSec: 2145,
    endSec: 2158,
    speaker: 'speaker1',
    text: 'So the old model was to step away and make a two-year, five-year, even ten-year vision deck.',
  },
  {
    id: 'jw-4',
    startSec: 2159,
    endSec: 2172,
    speaker: 'speaker2',
    text: 'Now the vision is usually only three to six months out, and it is not necessarily this polished, beautiful deck anymore.',
  },
  {
    id: 'jw-5',
    startSec: 2173,
    endSec: 2185,
    speaker: 'speaker1',
    text: 'Instead of a fixed artifact, you need a system that adapts while both the product layer and the model layer keep moving.',
  },
  {
    id: 'jw-6',
    startSec: 2186,
    endSec: 2201,
    speaker: 'speaker2',
    text: 'Exactly, and the designer is no longer polishing one frozen flow. They are orchestrating behavior, feedback, and trust.',
  },
]

const evanTranscript: TranscriptSegment[] = [
  {
    id: 'es-1',
    startSec: 1660,
    endSec: 1673,
    speaker: 'speaker1',
    text: 'When software gets easier to build, the thing that matters is not the feature alone, it is how reliably you win distribution.',
  },
  {
    id: 'es-2',
    startSec: 1674,
    endSec: 1687,
    speaker: 'speaker2',
    text: 'Right, because if everybody can ship a similar product, the moat shifts toward default behavior, retained audience, and product habit.',
  },
  {
    id: 'es-3',
    startSec: 1688,
    endSec: 1701,
    speaker: 'speaker1',
    text: 'The brand, the network, and the distribution rails become the real strategic asset, not just clever software architecture.',
  },
  {
    id: 'es-4',
    startSec: 1702,
    endSec: 1716,
    speaker: 'speaker2',
    text: 'So product teams should ask whether they are shipping a tool anyone can copy, or a system people will keep returning to.',
  },
]

const catTranscript: TranscriptSegment[] = [
  {
    id: 'cw-1',
    startSec: 2415,
    endSec: 2428,
    speaker: 'speaker1',
    text: 'We are AGI-pilled in the sense that the product team assumes the models will keep improving, so the operating cadence has to stay fast.',
  },
  {
    id: 'cw-2',
    startSec: 2429,
    endSec: 2442,
    speaker: 'speaker2',
    text: 'That means product, research, and engineering cannot hand work off in long batches. They have to collapse feedback loops together.',
  },
  {
    id: 'cw-3',
    startSec: 2443,
    endSec: 2456,
    speaker: 'speaker1',
    text: 'You learn by shipping, observing, and tightening the loop, not by waiting for a stable roadmap to appear first.',
  },
  {
    id: 'cw-4',
    startSec: 2457,
    endSec: 2470,
    speaker: 'speaker2',
    text: 'Exactly. The product team moves faster because the system is built around iteration speed rather than approval ceremony.',
  },
]

export const catalogVideos: DemoVideo[] = [
  {
    id: 'jenny-design',
    sourceType: 'youtube',
    sourceLabel: 'YOUTUBE.COM',
    title: "The design process is dead. Here’s what’s replacing it. | Jenny Wen (head of design at Claude)",
    channel: "Lenny's Podcast",
    durationLabel: '1:17:25',
    durationSec: 4645,
    lastPositionSec: 2135,
    lastPositionLabel: 'Continue at 35:35',
    summary:
      'Jenny Wen breaks down why AI product design is moving away from static decks and toward adaptive systems shaped by language, trust, and fast iteration.',
    cardPreview:
      'Classic design rituals cannot keep pace with AI-era shipping. The new workflow is shorter-horizon, more operational, and much closer to product behavior.',
    publisherLine: "Lenny's Podcast · 1:17:25",
    thumbnailUrl: 'https://img.youtube.com/vi/eh8bcBIAAFo/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=eh8bcBIAAFo',
    accent: '#f5b274',
    coverEyebrow: 'Head of Design at Claude',
    coverTitle: 'Design is becoming adaptive',
    coverDetail: 'A product-design reset for the AI era',
    transcript: jennyTranscript,
  },
  {
    id: 'evan-distribution',
    sourceType: 'youtube',
    sourceLabel: 'YOUTUBE.COM',
    title: 'How to win when software is not a moat | Evan Spiegel (Snapchat CEO)',
    channel: "Lenny's Podcast",
    durationLabel: '1:10:25',
    durationSec: 4225,
    lastPositionSec: 1668,
    lastPositionLabel: 'Continue at 27:48',
    summary:
      'Evan Spiegel explains why the defensibility of modern products is shifting from software novelty toward brand, habit, network effects, and distribution.',
    cardPreview:
      'If software becomes easier to reproduce, the strategic edge moves to distribution, audience retention, and the surfaces users already return to.',
    publisherLine: "Lenny's Podcast · 1:10:25",
    thumbnailUrl: 'https://img.youtube.com/vi/-7Yol5vX5xw/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=-7Yol5vX5xw',
    accent: '#f0b46e',
    coverEyebrow: 'Snap Inc. Co-founder & CEO',
    coverTitle: 'Distribution is the new moat',
    coverDetail: 'Why product leverage no longer lives only in code',
    transcript: evanTranscript,
  },
  {
    id: 'cat-wu-anthropic',
    sourceType: 'youtube',
    sourceLabel: 'YOUTUBE.COM',
    title: "How Anthropic’s product team moves faster than anyone else | Cat Wu (Head of Product, Claude Code)",
    channel: "Lenny's Podcast",
    durationLabel: '1:25:35',
    durationSec: 5135,
    lastPositionSec: 2424,
    lastPositionLabel: 'Continue at 40:24',
    summary:
      'Cat Wu shares how Anthropic speeds up product execution by collapsing research, product, and engineering into one faster learning loop.',
    cardPreview:
      'Anthropic’s product team runs on short learning loops: ship, observe, and refine, instead of waiting for long roadmap certainty.',
    publisherLine: "Lenny's Podcast · 1:25:35",
    thumbnailUrl: 'https://img.youtube.com/vi/PplmzlgE0kg/hqdefault.jpg',
    youtubeUrl: 'https://www.youtube.com/watch?v=PplmzlgE0kg',
    accent: '#efae78',
    coverEyebrow: 'Head of Product, Claude Code',
    coverTitle: 'We are AGI-pilled',
    coverDetail: 'Operating faster than roadmap-heavy teams',
    transcript: catTranscript,
  },
]

export const initialLibraryIds = ['jenny-design', 'evan-distribution', 'cat-wu-anthropic']

export const importExamples = [
  {
    label: 'Paste the Jenny Wen interview',
    url: 'https://www.youtube.com/watch?v=eh8bcBIAAFo',
    videoId: 'jenny-design',
  },
  {
    label: 'Paste the Evan Spiegel interview',
    url: 'https://www.youtube.com/watch?v=-7Yol5vX5xw',
    videoId: 'evan-distribution',
  },
  {
    label: 'Paste the Cat Wu interview',
    url: 'https://www.youtube.com/watch?v=PplmzlgE0kg',
    videoId: 'cat-wu-anthropic',
  },
]

export const askSuggestions = [
  'Give me the key idea in plain English',
  'What is the speaker really arguing here?',
  'Turn this into three reusable study notes',
  'What should I remember one week later?',
]
