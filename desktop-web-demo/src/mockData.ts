export type TranscriptSegment = {
  id: string
  startSec: number
  endSec: number
  speaker: 'speaker1' | 'speaker2'
  text: string
}

export type DemoVideo = {
  id: string
  title: string
  channel: string
  durationLabel: string
  durationSec: number
  lastPositionSec: number
  lastPositionLabel: string
  summary: string
  youtubeUrl: string
  youtubeId?: string
  sourceType?: 'mock' | 'youtube'
  accent: string
  coverImage?: string
  playerImage?: string
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
    text: 'When the product team ships with AI in the loop, the bottleneck is no longer just planning. It is how quickly the team can learn from real use.'
  },
  {
    id: 'jw-2',
    startSec: 2135,
    endSec: 2144,
    speaker: 'speaker2',
    text: 'Exactly, and the design and engineering relationship changes because prototypes can get in front of users much earlier than before.'
  },
  {
    id: 'jw-3',
    startSec: 2145,
    endSec: 2158,
    speaker: 'speaker1',
    text: 'That means the old process of waiting for a polished specification starts to feel too slow for the pace of product decisions.'
  },
  {
    id: 'jw-4',
    startSec: 2159,
    endSec: 2172,
    speaker: 'speaker2',
    text: 'Now the team is often working with shorter horizons, tighter feedback loops, and a much stronger bias toward trying the idea live.'
  },
  {
    id: 'jw-5',
    startSec: 2173,
    endSec: 2185,
    speaker: 'speaker1',
    text: 'So instead of a fixed artifact, you need a product system that adapts while the interface, model quality, and user expectations keep moving.'
  },
  {
    id: 'jw-6',
    startSec: 2186,
    endSec: 2201,
    speaker: 'speaker2',
    text: 'The role becomes much more cross-functional: shaping behavior, clarifying intent, and helping everyone see the tradeoffs earlier.'
  },
  {
    id: 'jw-7',
    startSec: 2202,
    endSec: 2217,
    speaker: 'speaker1',
    text: 'Which is why language, examples, and in-product guidance suddenly matter much more than a static design handoff ever did.'
  }
]

const learningTranscript: TranscriptSegment[] = [
  {
    id: 'lf-1',
    startSec: 304,
    endSec: 314,
    speaker: 'speaker1',
    text: 'The fastest way to learn from a long video is to stop treating it like background noise.'
  },
  {
    id: 'lf-2',
    startSec: 315,
    endSec: 324,
    speaker: 'speaker2',
    text: 'Yes, you want to notice friction, capture the moment, and turn confusion into an explicit question.'
  },
  {
    id: 'lf-3',
    startSec: 325,
    endSec: 337,
    speaker: 'speaker1',
    text: 'A good study workflow creates artifacts as you go: highlights, notes, examples, and summary bullets.'
  },
  {
    id: 'lf-4',
    startSec: 338,
    endSec: 349,
    speaker: 'speaker2',
    text: 'If the note is usable a week later, the learning session worked. If it is not, the session evaporates.'
  }
]

export const catalogVideos: DemoVideo[] = [
  {
    id: 'jenny-design',
    title: "How Anthropic's product team moves faster than anyone else",
    channel: "Lenny's Podcast",
    durationLabel: '01:25:35',
    durationSec: 4645,
    lastPositionSec: 2135,
    lastPositionLabel: 'Continue at 35:35',
    summary:
      'A long-form conversation about how Anthropic product teams work faster with tighter loops between product, design, engineering, and AI behavior.',
    youtubeUrl: 'https://www.youtube.com/watch?v=jenny-wen-demo',
    accent: '#f5b274',
    coverImage: 'assets/cat-wu-card-source.png',
    playerImage: 'assets/cat-wu-player-source.png',
    coverEyebrow: 'Cat Wu · Head of Product, Claude Code',
    coverTitle: "How Anthropic's product team moves faster",
    coverDetail: 'A more realistic long-form interview cover inspired by your reference',
    transcript: jennyTranscript
  },
  {
    id: 'learn-faster',
    title: "The design process is dead. Here's what's replacing it.",
    channel: "Lenny's Podcast",
    durationLabel: '01:17:25',
    durationSec: 4645,
    lastPositionSec: 2138,
    lastPositionLabel: 'Continue at 35:38',
    summary:
      'Jenny Wen explains why modern product design can no longer rely on slow, polished handoffs, and why adaptive collaboration now matters more than static process.',
    youtubeUrl: 'https://www.youtube.com/watch?v=learn-faster-demo',
    accent: '#f2b377',
    coverImage: 'assets/jenny-card-source.png',
    playerImage: 'assets/jenny-player-source.png',
    coverEyebrow: 'Jenny Wen · Head of Design at Claude',
    coverTitle: 'The design process is dead',
    coverDetail: 'A more realistic interview cover for the second reference video',
    transcript: learningTranscript.map((segment, index) => ({
      ...segment,
      id: `jd-${index + 1}`,
      text:
        index === 0
          ? 'The old design process assumed you had the luxury of polishing the concept before the rest of the team moved.'
          : index === 1
            ? 'But now engineering velocity is so high that design has to stay inside the implementation loop, not outside of it.'
            : index === 2
              ? 'So the deliverable becomes less about a perfect spec and more about guiding decisions while the product changes underneath you.'
              : 'That is why the best design work now helps teams execute, align, and learn faster rather than just admire a beautiful artifact.',
    }))
  },
  {
    id: 'product-storytelling',
    title: 'Product Storytelling for Technical Founders',
    channel: 'Studio North',
    durationLabel: '00:58:42',
    durationSec: 3522,
    lastPositionSec: 0,
    lastPositionLabel: 'Not started',
    summary:
      'A breakdown of how technical teams can frame product narratives clearly for users, investors, and hiring conversations.',
    youtubeUrl: 'https://www.youtube.com/watch?v=storytelling-demo',
    accent: '#93c8a1',
    coverEyebrow: 'Narrative strategy',
    coverTitle: 'Tell the product story',
    coverDetail: 'Positioning, framing, and memorable examples',
    transcript: [
      {
        id: 'ps-1',
        startSec: 512,
        endSec: 524,
        speaker: 'speaker1',
        text: 'A strong demo is not a tour of features. It is a controlled sequence of realizations.'
      },
      {
        id: 'ps-2',
        startSec: 525,
        endSec: 537,
        speaker: 'speaker2',
        text: 'Each screen should answer one question so the audience never has to ask what they are looking at.'
      }
    ]
  }
]

export const initialLibraryIds = ['jenny-design', 'learn-faster']

export const importExamples = [
  {
    label: 'Paste a YouTube interview',
    url: 'https://www.youtube.com/watch?v=storytelling-demo',
    videoId: 'product-storytelling'
  },
  {
    label: 'Paste a study workflow video',
    url: 'https://www.youtube.com/watch?v=learn-faster-demo',
    videoId: 'learn-faster'
  },
  {
    label: 'Paste the Jenny Wen reference clip',
    url: 'https://www.youtube.com/watch?v=jenny-wen-demo',
    videoId: 'jenny-design'
  }
]

export const askSuggestions = [
  'Give me the key idea in plain English',
  'What is the speaker really arguing here?',
  'Turn this into three reusable study notes',
  'What should I remember one week later?'
]
