alter table public.learning_videos
  add column if not exists status text not null default 'inbox',
  add column if not exists is_favourite boolean not null default false,
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.learning_videos
  drop constraint if exists learning_videos_status_check;

alter table public.learning_videos
  add constraint learning_videos_status_check
  check (status in ('inbox', 'learning', 'done'));

alter table public.learning_notes
  add column if not exists is_starred boolean not null default false;

alter table public.learning_notes
  drop constraint if exists learning_notes_source_check;

alter table public.learning_notes
  add constraint learning_notes_source_check
  check (source in ('manual', 'ai', 'highlight', 'thought'));

alter table public.learning_notes
  drop constraint if exists learning_notes_type_check;

alter table public.learning_notes
  add constraint learning_notes_type_check
  check (type is null or type in ('highlight', 'thought', 'explanation', 'keyIdea', 'reviewQuestion', 'videoBrief'));

create table if not exists public.learning_translations (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  language text not null,
  segments jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id, language),
  constraint learning_translations_status_check check (status in ('partial', 'ready', 'failed'))
);

create index if not exists learning_videos_user_status_idx
  on public.learning_videos (user_id, status, saved_at desc);

create index if not exists learning_translations_user_video_idx
  on public.learning_translations (user_id, video_id);

alter table public.learning_translations enable row level security;

grant select, insert, update, delete on public.learning_translations to authenticated;

drop policy if exists "Users can select own learning translations" on public.learning_translations;
create policy "Users can select own learning translations"
  on public.learning_translations
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert own learning translations" on public.learning_translations;
create policy "Users can insert own learning translations"
  on public.learning_translations
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update own learning translations" on public.learning_translations;
create policy "Users can update own learning translations"
  on public.learning_translations
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete own learning translations" on public.learning_translations;
create policy "Users can delete own learning translations"
  on public.learning_translations
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
