import { createClient, type User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export function toAuthUser(user: User | null) {
  if (!user) return null

  return {
    id: user.id,
    email: user.email ?? '',
    name: typeof user.user_metadata?.name === 'string'
      ? user.user_metadata.name
      : user.email?.split('@')[0] ?? 'Learner',
    createdAt: user.created_at,
  }
}
