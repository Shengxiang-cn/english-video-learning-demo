# Video Learning MVP Demo Plan

## 1. Product positioning

Build a mobile-first demo for learning from long-form English YouTube videos.

The goal is not to recreate the full Readwise Reader experience. The goal is to prove one complete loop:

`Import video -> watch with synced transcript -> highlight a passage -> ask AI -> save structured note -> export to Markdown`

Target user:

- Learners who use long English videos for research, language learning, or professional upskilling
- Users who want to turn passive watching into reusable notes

## 2. MVP scope

### Must have

1. Add a YouTube URL
2. Show video detail card in a library/inbox
3. Open a player page with synced transcript
4. Let users select transcript text and create a highlight
5. Show an action sheet for:
   - Highlight only
   - Add note
   - Ask AI to explain
   - Save to notes
6. Generate a structured note block from the selected passage
7. Export all notes for one video as Markdown

### Nice to have for demo

1. "Ask this video" global chat entry
2. Auto-generated chapter summary
3. Vocabulary explanation mode
4. Continue learning card on the home page

### Explicitly out of scope

1. Full article reader
2. Full Readwise-style library system
3. Social sharing
4. Offline download
5. Real account system
6. Real-time multi-video knowledge graph

## 3. Core user flow

### Flow A: Add and start learning

1. User lands on `Library`
2. Taps `+ Add`
3. Bottom sheet appears with URL input
4. Paste YouTube link
5. App resolves mock metadata:
   - title
   - channel
   - thumbnail
   - duration
   - transcript availability
6. Item appears in library with `Ready to learn`
7. User opens detail page

### Flow B: Watch and highlight

1. Top half shows video player
2. Bottom half shows synced transcript
3. Current sentence is auto-highlighted while video time changes
4. User long-presses or drags across transcript lines
5. Selection toolbar appears
6. User chooses:
   - `Highlight`
   - `Note`
   - `Explain`
   - `Save`

### Flow C: Ask AI from a passage

1. User taps `Explain`
2. Bottom sheet opens with selected quote pinned at top
3. Suggested prompts:
   - Simplify this
   - Explain in plain English
   - What does the speaker mean here
   - Give an example
4. AI response appears as short cards, not chat bubbles only
5. User can tap `Save to note`

### Flow D: Structured notes and export

1. User opens `Notes`
2. Notes grouped by video and timestamp
3. Each note contains:
   - quote
   - timestamp
   - user note
   - AI explanation
   - tags
4. User taps `Export Markdown`
5. App generates preview and share/download action

## 4. Screen architecture

### 1. Library / Inbox

Purpose:
Show imported learning items and help users resume.

Key modules:

- Header with `Library`
- `Continue learning` sticky card
- Video cards with thumbnail, title, duration, last position
- `+ Add` floating action

Why it matters:
This reproduces the low-friction capture feel from Readwise without copying its whole structure.

### 2. Add URL sheet

Purpose:
Fast intake for YouTube links.

Key modules:

- URL input
- Paste from clipboard
- Example supported links
- Import CTA

Demo shortcut:
Use 2 to 3 preloaded YouTube examples so the import feels instant.

### 3. Video learning page

Purpose:
This is the heart of the product.

Layout:

- Top: sticky video player
- Middle: mode switch
  - Transcript
  - AI
  - Notes
- Bottom: scrollable content panel

Key interactions:

- Transcript follows playback
- Tap transcript line to seek video
- Drag to select text
- Floating mini-toolbar near selection

### 4. Passage action sheet

Purpose:
Turn selection into action immediately.

Actions:

- Highlight
- Add note
- Explain
- Tag
- Cancel

Interaction style:
Use a rounded vertical action rail or bottom sheet inspired by the references, but simplify to 3 to 4 primary choices.

### 5. AI explanation sheet

Purpose:
Help learners unpack difficult English quickly.

Recommended answer formats:

- `Plain English`
- `Context meaning`
- `Key takeaway`
- `Example`

Avoid:
Long assistant paragraphs. Short structured blocks feel more useful in a learning product.

### 6. Notes and export view

Purpose:
Show knowledge accumulation, not just isolated highlights.

Sections:

- Summary
- Highlights
- My notes
- AI takeaways
- Markdown export preview

## 5. Interaction design principles

### Principle 1: Player stays secondary to learning

Users came for understanding, not only watching. The transcript and note actions should be visually first-class.

### Principle 2: Every interaction should reduce friction

From selection to AI help should take one step, not three screens.

### Principle 3: AI should feel contextual, not generic

AI actions should always know:

- selected text
- surrounding transcript
- current timestamp
- video title

### Principle 4: Output should be reusable

Every highlight should have a clean path into notes and Markdown export.

## 6. Recommended demo UX

For a convincing demo, use these tabs inside the learning page:

1. `Transcript`
2. `Ask`
3. `Notes`

This is better than scattering functions across multiple screens because:

- it keeps focus on one learning session
- it makes the AI feel grounded in the video
- it reduces navigation complexity in the prototype

## 7. Data model for the demo

### Video

```ts
type Video = {
  id: string
  title: string
  channel: string
  durationSec: number
  thumbnailUrl: string
  youtubeUrl: string
  transcriptStatus: "ready" | "missing"
  lastPositionSec: number
}
```

### Transcript segment

```ts
type TranscriptSegment = {
  id: string
  startSec: number
  endSec: number
  text: string
}
```

### Highlight

```ts
type Highlight = {
  id: string
  videoId: string
  segmentIds: string[]
  quote: string
  startSec: number
  endSec: number
  note?: string
  aiExplanation?: string
  tags: string[]
  createdAt: string
}
```

## 8. Demo technical recommendation

### Best choice for fastest interactive demo

Use:

- `Next.js` or `Vite + React`
- `TypeScript`
- `Tailwind CSS`
- `Framer Motion`
- local mock JSON for video metadata, transcript, notes

Why:

- fastest to build
- easy to make mobile-first
- easy to demo in browser or PWA shell
- no backend dependency for the first version

### Video implementation

For demo:

- use YouTube iframe embed
- sync transcript using mocked timestamps

For later production:

- server fetches transcript and normalizes into segments

### AI implementation

For demo:

- use predefined prompt templates
- optionally connect to OpenAI API for live explanation
- keep answers short and structured

Suggested AI actions:

1. Explain selected passage
2. Summarize current chapter
3. Turn highlight into study note
4. Generate Markdown export summary

## 9. Suggested information architecture

```text
Library
|- Video Card
   |- Learning Page
      |- Transcript tab
      |- Ask tab
      |- Notes tab
      |- Export Markdown
```

This is enough for a demo. Do not add extra navigation unless it supports a specific presentation story.

## 10. Demo script

Use one strong video example, ideally a design, product, AI, or business interview.

### 3-minute stakeholder demo

1. Start in `Library`
2. Add a YouTube URL
3. Open imported video
4. Scroll transcript while playback is running
5. Select one meaningful passage
6. Tap `Explain`
7. Show AI breakdown
8. Save it as a note
9. Open `Notes`
10. Export Markdown

This tells a clear story:

`long video -> understanding -> capture -> structured output`

## 11. Build phases

### Phase 1: Clickable prototype

Deliver:

- static but polished mobile screens
- fake transcript sync state
- fake AI answer cards

Goal:
Validate interaction design.

### Phase 2: Interactive front-end demo

Deliver:

- working URL import flow
- synced transcript scrolling
- selection and highlight state
- note saving
- Markdown export

Goal:
Validate end-to-end learning loop.

### Phase 3: Smart demo

Deliver:

- live AI explanation
- auto-summary
- better transcript navigation

Goal:
Make it feel product-real, not prototype-only.

## 12. Key product decisions

### Decision A: Native app vs web demo

Recommendation:
Start with a mobile web demo first.

Reason:

- much faster to ship
- easier to iterate on transcript interactions
- easy to present on phone-sized viewport
- can later wrap into React Native or Expo if needed

### Decision B: Transcript-first vs player-first

Recommendation:
Transcript-first.

Reason:
The differentiation is learning from long videos, not generic playback.

### Decision C: Full AI chat vs guided AI actions

Recommendation:
Guided AI actions first.

Reason:
They feel faster, more concrete, and easier to demo than an empty chat box.

## 13. Visual direction

Tone:

- calm
- editorial
- knowledge-focused
- slightly premium

Suggested UI language:

- large readable typography
- warm neutral backgrounds
- subtle highlight yellow
- dark charcoal text
- soft cards and sheet transitions

Avoid:

- looking like a generic video app
- heavy dashboard UI
- overusing bright accent colors

## 14. Success criteria for the demo

The demo is successful if a first-time viewer can understand these three points within one minute:

1. I can import a long English YouTube video for study
2. I can understand hard passages with synced transcript and AI help
3. I can turn insights into reusable notes and Markdown

## 15. My implementation recommendation

If we build this next, I would implement the first demo in this order:

1. Library screen
2. Add URL sheet
3. Learning page with sticky player
4. Synced transcript state
5. Selection toolbar
6. AI explanation sheet
7. Notes tab
8. Markdown export

That gives the best ratio of effort to perceived completeness.
