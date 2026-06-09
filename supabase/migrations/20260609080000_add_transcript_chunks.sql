create table if not exists public.learning_transcript_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  chunk_index integer not null,
  start_sec integer not null default 0,
  end_sec integer not null default 0,
  text text not null default '',
  segment_ids jsonb not null default '[]'::jsonb,
  token_estimate integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, video_id, chunk_index),
  foreign key (user_id, video_id)
    references public.learning_videos(user_id, id)
    on delete cascade
);

create index if not exists learning_transcript_chunks_user_video_idx
  on public.learning_transcript_chunks (user_id, video_id, chunk_index);

alter table public.learning_transcript_chunks enable row level security;

grant select, insert, update, delete on public.learning_transcript_chunks to authenticated;

drop policy if exists "Users can select own transcript chunks" on public.learning_transcript_chunks;
create policy "Users can select own transcript chunks"
  on public.learning_transcript_chunks
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert own transcript chunks" on public.learning_transcript_chunks;
create policy "Users can insert own transcript chunks"
  on public.learning_transcript_chunks
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update own transcript chunks" on public.learning_transcript_chunks;
create policy "Users can update own transcript chunks"
  on public.learning_transcript_chunks
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete own transcript chunks" on public.learning_transcript_chunks;
create policy "Users can delete own transcript chunks"
  on public.learning_transcript_chunks
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
