export type Platform = 'x' | 'tiktok' | 'instagram' | 'telegram' | 'facebook'

export type TemplateSettings = {
  mode?: string
  background?: string
  surface?: string
  text?: string
  muted?: string
  accent?: string
  font_size?: number
  margin?: number
  logo_opacity?: number
  watermark_opacity?: number
  source_attribution?: boolean
  redactions?: { x: number; y: number; w: number; h: number }[]
  video_color_tweak?: boolean
  [key: string]: unknown
}

export type AccountSettings = {
  template?: TemplateSettings
  telegram_target_url?: string
  replace_username?: boolean
  ocr_images?: boolean
  auto_confidence?: number
  logo_path?: string
  template_path?: string
  [key: string]: unknown
}

export type AccountProfile = {
  dialect?: string
  topics?: string[]
  style_notes?: string
  publishing_guidelines?: string
  [key: string]: unknown
}

export type Account = {
  id: string
  name: string
  platform: Platform
  username: string
  enabled: boolean
  auto_publish: boolean
  review_required: boolean
  phone_replacement: string
  monitor_interval_sec: number
  min_delay_sec: number
  max_delay_sec: number
  settings: AccountSettings
  session_status: string
  last_error?: string | null
  last_monitor_at?: string | null
  proxy_masked?: string | null
  proxy_configured: boolean
  sources?: Source[]
  profile?: AccountProfile
}
export type Source = {
  id: string
  account_id: string
  platform: 'x' | 'tiktok' | 'instagram'
  handle: string
  url: string
  enabled: boolean
  config: Record<string, unknown>
  last_sync_at?: string | null
  last_error?: string | null
}
export type Media = { kind: 'image' | 'video'; url: string; local_path?: string; processed_path?: string }
export type Post = {
  id: string
  account_id: string
  account_name?: string
  platform?: Platform
  source_id?: string
  source_handle?: string
  external_id: string
  url: string
  author: string
  raw_text: string
  processed_text: string
  media: Media[]
  status: string
  ai_decision?: string
  ai_reason?: string
  ai_confidence?: number
  category?: string
  important: boolean
  user_comment?: string
  error?: string
  created_at: string
}
export type Stats = {
  accounts: number; enabled_accounts: number; sources: number; published: number
  pending: number; ignored: number; ready: number; failed: number; active_jobs: number
}
export type EventItem = {
  id: string; account_id?: string; account_name?: string; level: string
  event: string; message: string; created_at: string; metadata: Record<string, unknown>
}
export type StudioScene = { heading: string; text: string }
export type StudioProject = {
  id: string; account_id: string; account_name: string; username: string; account_platform: Platform
  title: string; brief: string; kind: 'university_news' | 'student_promo'
  source_mode: 'generated' | 'reuse'; output_format: 'video' | 'image' | 'text'
  platforms: Platform[]; caption: string; script: string; scenes: StudioScene[]; status: string
  scheduled_at?: string | null; voice: string; template: string; source_asset_id?: string | null
  rights_confirmed: boolean; output_path?: string | null; cover_path?: string | null; voice_path?: string | null
  provider: string; voice_provider?: string | null; error?: string | null; warning?: string | null
  idempotency_key: string; publication: Record<string, unknown>; created_at: string; updated_at: string
}
export type StudioStats = { total: number; drafts: number; ready: number; rendering: number; scheduled: number; published: number; failed: number; today: number }
export type AIProvider = {
  id: string; name: string; base_url: string; model: string; timeout_seconds: number
  enabled: boolean; priority: number; key_configured: boolean; key_hint: string
}
export type DashboardData = {
  stats: Stats; accounts: Account[]; recent_posts: Post[]; events: EventItem[]
  studio_stats: StudioStats; studio_projects: StudioProject[]; upcoming: StudioProject[]
}
export type Health = {
  ok: boolean; version: string; dry_run: boolean; publishing_enabled: boolean; scheduler: boolean
  ai: AIConfig; chromium_configured: boolean; ffmpeg_configured: boolean; tesseract_configured: boolean
  database: string
}
export type AIConfig = { base_url: string; model: string; timeout_seconds: number; key_configured: boolean }
export type AITestResult = {
  ok: boolean
  requested_model: string
  resolved_model?: string
  seconds: number
  usage?: Record<string, unknown>
}
export type ChatMessage = { id: string; account_id?: string; role: 'user' | 'assistant' | 'system'; text: string; created_at: string }
