# Supabase migration

This app now uses Supabase for:

- Auth: email/password accounts via Supabase Auth.
- Videos: `public.learning_videos`.
- Notes: `public.learning_notes`.
- AI chat history: `public.learning_conversations`.

## Required Supabase setup

Run this migration in the target Supabase project:

```text
supabase/migrations/20260603000000_create_learning_workspace_tables.sql
```

It creates the three app tables, enables RLS, grants access to the `authenticated` role, and adds policies that only allow each user to read/write their own rows via `auth.uid() = user_id`.

## Required environment variables

Frontend build:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Node server runtime:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

The server still needs:

```bash
KIMI_API_KEY=...
SUPADATA_API_KEY=...
```

## Runtime model

The browser signs users in with Supabase Auth and reads/writes notes, videos, conversations, and progress through Supabase RLS.

The Node server keeps the operations that require server-side execution:

- `/api/youtube/import`: parses YouTube metadata and captions, then writes the imported video to Supabase using the user's Bearer token.
- `/api/ask`: calls Kimi and optionally writes the AI answer to `learning_conversations`.

Every protected server route requires:

```http
Authorization: Bearer <supabase-access-token>
```

No app password hashes, custom sessions, or local `store.json` data are used after this migration.
