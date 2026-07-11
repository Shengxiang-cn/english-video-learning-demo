alter table public.learning_notes
  add column if not exists segment_ids jsonb not null default '[]'::jsonb,
  add column if not exists start_sec double precision,
  add column if not exists end_sec double precision,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_notes_segment_ids_shape_check'
      and conrelid = 'public.learning_notes'::regclass
  ) then
    alter table public.learning_notes
      add constraint learning_notes_segment_ids_shape_check
      check (jsonb_typeof(segment_ids) = 'array') not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_notes_anchor_range_check'
      and conrelid = 'public.learning_notes'::regclass
  ) then
    alter table public.learning_notes
      add constraint learning_notes_anchor_range_check
      check (
        (start_sec is null and end_sec is null)
        or (
          start_sec is not null
          and end_sec is not null
          and start_sec >= 0
          and end_sec >= start_sec
        )
      ) not valid;
  end if;
end
$$;

alter table public.learning_notes
  validate constraint learning_notes_segment_ids_shape_check;

alter table public.learning_notes
  validate constraint learning_notes_anchor_range_check;

comment on column public.learning_notes.segment_ids is
  'Ordered transcript segment identifiers captured when the note was created.';

comment on column public.learning_notes.start_sec is
  'Start of the transcript selection in video seconds.';

comment on column public.learning_notes.end_sec is
  'End of the transcript selection in video seconds.';
