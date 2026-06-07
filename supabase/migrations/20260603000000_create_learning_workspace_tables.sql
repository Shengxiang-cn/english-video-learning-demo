create table if not exists public.learning_videos (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  channel text not null,
  duration_label text not null,
  duration_sec integer not null default 0,
  last_position_sec integer not null default 0,
  last_position_label text not null default 'Not started',
  summary text not null default '',
  youtube_url text not null,
  youtube_id text,
  source_type text not null default 'youtube',
  accent text not null default '#8cb8ff',
  cover_image text,
  player_image text,
  cover_eyebrow text not null default '',
  cover_title text not null default '',
  cover_detail text not null default '',
  transcript_language text,
  transcript_source text,
  transcript_languages jsonb not null default '[]'::jsonb,
  transcript_error jsonb,
  transcript jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now(),
  last_watched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint learning_videos_source_type_check check (source_type in ('mock', 'youtube'))
);

create table if not exists public.learning_notes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  video_title text,
  quote text not null,
  timestamp_label text not null,
  note text not null,
  takeaway text not null,
  tags jsonb not null default '[]'::jsonb,
  type text,
  original_subtitle text,
  content text,
  topics jsonb not null default '[]'::jsonb,
  source text not null,
  created_at timestamptz not null default now(),
  saved_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint learning_notes_source_check check (source in ('manual', 'ai', 'highlight')),
  constraint learning_notes_type_check check (type is null or type in ('highlight', 'explanation', 'keyIdea', 'reviewQuestion', 'videoBrief'))
);

create table if not exists public.learning_conversations (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  video_title text,
  question text not null,
  quote text,
  answer text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists learning_videos_user_saved_at_idx
  on public.learning_videos (user_id, saved_at desc);

create index if not exists learning_notes_user_saved_at_idx
  on public.learning_notes (user_id, saved_at desc);

create index if not exists learning_notes_user_video_idx
  on public.learning_notes (user_id, video_id);

create index if not exists learning_conversations_user_created_at_idx
  on public.learning_conversations (user_id, created_at desc);

create index if not exists learning_conversations_user_video_idx
  on public.learning_conversations (user_id, video_id);

alter table public.learning_videos enable row level security;
alter table public.learning_notes enable row level security;
alter table public.learning_conversations enable row level security;

grant select, insert, update, delete on public.learning_videos to authenticated;
grant select, insert, update, delete on public.learning_notes to authenticated;
grant select, insert, update, delete on public.learning_conversations to authenticated;

drop policy if exists "Users can select own learning videos" on public.learning_videos;
create policy "Users can select own learning videos"
  on public.learning_videos
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert own learning videos" on public.learning_videos;
create policy "Users can insert own learning videos"
  on public.learning_videos
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update own learning videos" on public.learning_videos;
create policy "Users can update own learning videos"
  on public.learning_videos
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete own learning videos" on public.learning_videos;
create policy "Users can delete own learning videos"
  on public.learning_videos
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can select own learning notes" on public.learning_notes;
create policy "Users can select own learning notes"
  on public.learning_notes
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert own learning notes" on public.learning_notes;
create policy "Users can insert own learning notes"
  on public.learning_notes
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update own learning notes" on public.learning_notes;
create policy "Users can update own learning notes"
  on public.learning_notes
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete own learning notes" on public.learning_notes;
create policy "Users can delete own learning notes"
  on public.learning_notes
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can select own learning conversations" on public.learning_conversations;
create policy "Users can select own learning conversations"
  on public.learning_conversations
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert own learning conversations" on public.learning_conversations;
create policy "Users can insert own learning conversations"
  on public.learning_conversations
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete own learning conversations" on public.learning_conversations;
create policy "Users can delete own learning conversations"
  on public.learning_conversations
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
