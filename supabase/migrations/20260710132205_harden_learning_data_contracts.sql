-- Strengthen the JSON and numeric contracts used by the learning workspace.
-- NOT VALID keeps this migration safe for existing production rows while still
-- enforcing each constraint for new writes. Validate after auditing old rows.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_videos_json_shape_check'
      and conrelid = 'public.learning_videos'::regclass
  ) then
    alter table public.learning_videos
      add constraint learning_videos_json_shape_check
      check (
        jsonb_typeof(tags) = 'array'
        and jsonb_typeof(transcript) = 'array'
        and jsonb_typeof(transcript_languages) = 'array'
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_videos_time_range_check'
      and conrelid = 'public.learning_videos'::regclass
  ) then
    alter table public.learning_videos
      add constraint learning_videos_time_range_check
      check (duration_sec >= 0 and last_position_sec >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_notes_json_shape_check'
      and conrelid = 'public.learning_notes'::regclass
  ) then
    alter table public.learning_notes
      add constraint learning_notes_json_shape_check
      check (jsonb_typeof(tags) = 'array' and jsonb_typeof(topics) = 'array') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_conversations_json_shape_check'
      and conrelid = 'public.learning_conversations'::regclass
  ) then
    alter table public.learning_conversations
      add constraint learning_conversations_json_shape_check
      check (jsonb_typeof(citations) = 'array' and jsonb_typeof(follow_ups) = 'array') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_translations_segments_shape_check'
      and conrelid = 'public.learning_translations'::regclass
  ) then
    alter table public.learning_translations
      add constraint learning_translations_segments_shape_check
      check (jsonb_typeof(segments) = 'object') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_transcript_chunks_shape_check'
      and conrelid = 'public.learning_transcript_chunks'::regclass
  ) then
    alter table public.learning_transcript_chunks
      add constraint learning_transcript_chunks_shape_check
      check (
        chunk_index >= 0
        and start_sec >= 0
        and end_sec >= start_sec
        and token_estimate >= 0
        and jsonb_typeof(segment_ids) = 'array'
      ) not valid;
  end if;
end
$$;

-- Data API access remains explicit and RLS remains the authorization boundary.
revoke all on table
  public.learning_videos,
  public.learning_notes,
  public.learning_conversations,
  public.learning_translations,
  public.learning_transcript_chunks
from anon, authenticated;

grant select, insert, update, delete on table
  public.learning_videos,
  public.learning_notes,
  public.learning_conversations,
  public.learning_translations,
  public.learning_transcript_chunks
to authenticated;

alter table public.learning_videos enable row level security;
alter table public.learning_notes enable row level security;
alter table public.learning_conversations enable row level security;
alter table public.learning_translations enable row level security;
alter table public.learning_transcript_chunks enable row level security;

-- Preflight on 2026-07-10 confirmed zero incompatible production rows.
alter table public.learning_videos validate constraint learning_videos_json_shape_check;
alter table public.learning_videos validate constraint learning_videos_time_range_check;
alter table public.learning_notes validate constraint learning_notes_json_shape_check;
alter table public.learning_conversations validate constraint learning_conversations_json_shape_check;
alter table public.learning_translations validate constraint learning_translations_segments_shape_check;
alter table public.learning_transcript_chunks validate constraint learning_transcript_chunks_shape_check;
