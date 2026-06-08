alter table public.learning_conversations
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists follow_ups jsonb not null default '[]'::jsonb;
