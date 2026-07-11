import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(testDir, '..')
const repositoryRoot = path.resolve(appRoot, '..')

test('the browser uses Supabase for auth only, not direct learning-data queries', async () => {
  const appSource = await readFile(path.join(appRoot, 'src/App.tsx'), 'utf8')
  assert.doesNotMatch(appSource, /supabase\s*\.\s*from\s*\(/)
  assert.match(appSource, /supabase\.auth\./)
  assert.match(appSource, /requestJson<WorkspaceResponse>\('\/api\/library'/)
})

test('blocking overlays share one accessible dialog boundary', async () => {
  const [appSource, dialogSource] = await Promise.all([
    readFile(path.join(appRoot, 'src/App.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/components/AppDialog.tsx'), 'utf8'),
  ])
  assert.doesNotMatch(appSource, /className="modal-backdrop"/)
  assert.match(appSource, /<AppDialog/g)
  assert.match(dialogSource, /role: 'dialog'/)
  assert.match(dialogSource, /event\.key === 'Escape'/)
  assert.match(dialogSource, /event\.key !== 'Tab'/)
})

test('every exposed learning table has RLS, authenticated ownership policies, and explicit grants', async () => {
  const migrationsDir = path.join(repositoryRoot, 'supabase/migrations')
  const migrationNames = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  const migrations = (await Promise.all(
    migrationNames.map((name) => readFile(path.join(migrationsDir, name), 'utf8')),
  )).join('\n')
  const tables = [
    'learning_videos',
    'learning_notes',
    'learning_conversations',
    'learning_translations',
    'learning_transcript_chunks',
  ]

  for (const table of tables) {
    assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
    assert.match(migrations, new RegExp(`on public\\.${table}[\\s\\S]*?to authenticated`, 'i'))
  }

  assert.match(migrations, /\(select auth\.uid\(\)\) = user_id/i)
  assert.match(migrations, /revoke all on table[\s\S]*from anon, authenticated/i)
  assert.match(migrations, /grant select, insert, update, delete on table[\s\S]*to authenticated/i)
})

test('learning notes preserve validated transcript anchors', async () => {
  const [migrationSource, serverSource] = await Promise.all([
    readFile(path.join(repositoryRoot, 'supabase/migrations/20260711112430_add_note_transcript_anchors.sql'), 'utf8'),
    readFile(path.join(appRoot, 'server.mjs'), 'utf8'),
  ])

  assert.match(migrationSource, /add column if not exists segment_ids jsonb not null default '\[\]'::jsonb/i)
  assert.match(migrationSource, /add column if not exists start_sec double precision/i)
  assert.match(migrationSource, /add column if not exists end_sec double precision/i)
  assert.match(migrationSource, /end_sec >= start_sec/i)
  assert.match(serverSource, /segment_ids: Array\.isArray\(note\.segmentIds\)/)
  assert.match(serverSource, /segmentIds: Array\.isArray\(row\.segment_ids\)/)
  assert.match(serverSource, /Note transcript time range is invalid/)
})

test('notes support typed guest saves, search, markdown, and an accessible editor', async () => {
  const appSource = await readFile(path.join(appRoot, 'src/App.tsx'), 'utf8')

  assert.match(appSource, /type TemporaryNote = \{[\s\S]*?type: NoteType/)
  assert.doesNotMatch(appSource, /type === 'highlight'[\s\S]{0,120}?\? 'explanation'/)
  assert.match(appSource, /segmentIds: transcriptSelection\?\.segmentIds \?\? \[\]/)
  assert.match(appSource, /noteSearchQuery/)
  assert.match(appSource, /<NoteMarkdown>/)
  assert.match(appSource, /labelledBy="note-editor-title"/)
  assert.doesNotMatch(appSource, /window\.prompt/)
})
