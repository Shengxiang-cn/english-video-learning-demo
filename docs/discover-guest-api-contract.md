# Discover / Guest Mode API Contract

## Product Rules

- Discover is an editorial recommendation entry, not the user's Library.
- Inbox / Learning / Done only belong to Library.
- Guest users do not have Inbox.
- Guest users can preview and temporarily watch a video.
- Guest data is stored in frontend guestWorkspace before login.
- After login, guestWorkspace can be migrated into Supabase.
- Opening a Discover preview modal must not write to Supabase.
- Logged-in users can Save to Inbox or Start learning.

---

## 1. POST /api/youtube/preview

Used by guest users.

Purpose:
Parse a YouTube video and return metadata + transcript.
Do not write to Supabase.
Do not create learning_videos.
Do not create Library item.

Request:

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
  "youtubeId": "optional"
}
```

Response:

```json
{
  "video": {
    "id": "temporary-or-youtube-id",
    "youtubeId": "xxxx",
    "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
    "title": "Video title",
    "channel": "Channel name",
    "durationSec": 1234,
    "thumbnailUrl": "https://..."
  },
  "transcript": [
    {
      "id": "seg-1",
      "startSec": 12.3,
      "endSec": 16.8,
      "text": "subtitle text"
    }
  ]
}
```

Important:
- Guest accessible.
- No Supabase write.
- No Inbox status.
- No conversations write.
- No notes write.

---

## 2. POST /api/youtube/import

Used by logged-in users.

Purpose:
Parse a YouTube video and write / update learning_videos.

Request:

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
  "youtubeId": "optional",
  "status": "inbox",
  "forceReopen": false
}
```

status can be:
- inbox
- learning

Behavior:
- Requires authenticated user.
- Upsert learning_videos by current user + youtubeId.
- If status = inbox, save to Inbox.
- If status = learning, save as Learning.
- If existing video is done, do not change it back to learning unless forceReopen = true.
- Return saved video row.

Response:

```json
{
  "video": {
    "id": "video-row-id",
    "youtubeId": "xxxx",
    "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
    "title": "Video title",
    "channel": "Channel name",
    "durationSec": 1234,
    "thumbnailUrl": "https://...",
    "transcript": [],
    "status": "inbox",
    "isFavourite": false,
    "tags": [],
    "lastPositionSec": 0,
    "lastWatchedAt": null,
    "savedAt": "2026-06-09T00:00:00.000Z"
  }
}
```

---

## 3. POST /api/guest/migrate

Used after a guest user logs in.

Purpose:
Migrate guestWorkspace into the logged-in user's Supabase account.

Request:

```json
{
  "temporaryVideo": {
    "id": "temporary-or-youtube-id",
    "youtubeId": "xxxx",
    "youtubeUrl": "https://www.youtube.com/watch?v=xxxx",
    "title": "Video title",
    "channel": "Channel name",
    "durationSec": 1234,
    "thumbnailUrl": "https://..."
  },
  "transcript": [
    {
      "id": "seg-1",
      "startSec": 12.3,
      "endSec": 16.8,
      "text": "subtitle text"
    }
  ],
  "temporaryChatRecords": [
    {
      "clientTempId": "chat-temp-1",
      "question": "What does this mean?",
      "quote": "selected subtitle",
      "answer": "AI answer",
      "createdAt": "2026-06-09T00:00:00.000Z"
    }
  ],
  "temporaryNotes": [
    {
      "clientTempId": "note-temp-1",
      "type": "explanation",
      "source": "ai",
      "quote": "selected subtitle",
      "timestampLabel": "12:03",
      "note": "",
      "content": "saved note content",
      "takeaway": "",
      "tags": []
    }
  ],
  "activity": {
    "playedSeconds": 0,
    "hasStartedWatching": false,
    "hasAskedAI": false,
    "hasTemporaryNotes": false,
    "askCount": 0
  }
}
```

Migration status rule:
- If user only previewed / parsed the video and had no real learning activity:
  learning_videos.status = inbox
- If user played the video, asked AI, or created temporary notes:
  learning_videos.status = learning

Response:

```json
{
  "video": {
    "id": "video-row-id",
    "youtubeId": "xxxx",
    "status": "learning"
  },
  "notes": [],
  "conversations": []
}
```

Important:
- Requires authenticated user.
- Never trust user_id from frontend.
- Always use current auth.uid().
- Write temporaryVideo into learning_videos.
- Write temporaryChatRecords into learning_conversations.
- Write temporaryNotes into learning_notes.
- Avoid duplicate video rows for the same user + youtubeId.

---

## 4. POST /api/ask

Used by both guest and logged-in users.

Request:

```json
{
  "videoTitle": "Video title",
  "videoId": "video-id-or-temporary-id",
  "selectedSubtitle": {
    "text": "selected subtitle",
    "startSec": 12.3,
    "endSec": 16.8
  },
  "nearbySubtitles": [],
  "currentPlaybackTime": 123.4,
  "userQuestion": "What does this mean?",
  "answerLanguage": "zh-CN",
  "mode": "guest"
}
```

mode:
- guest
- authenticated

Behavior:
- Guest users can call Ask AI.
- Guest Ask AI must not write learning_conversations.
- Logged-in Ask AI can write learning_conversations.
- Model API keys must remain server-side.
