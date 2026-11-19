import { library } from './library'

export type CoachGoal = 'balanced' | 'efficiency' | 'fluency' | 'consistency'
export interface CoachContext {
  schema_version: 1
  configured: boolean
  provider: 'ollama' | null
  model: string | null
  disclosure: string
  recent_limit: number
  solves: { id: string; created_at: string; status: string; source: string }[]
}
export interface CoachFact { id: string; text: string; source_href: string | null }
export interface CoachRecommendation {
  template_id: string; fact_id: string; title: string; action: string
  link_label: string; href: string
}
export interface CoachReply {
  schema_version: 1; version: string; mode: 'engine' | 'ai'
  provider_status: 'not_requested' | 'not_configured' | 'used' | 'timeout' | 'rejected' | 'unavailable' | 'busy'
  model: string | null; goal: CoachGoal; solve_id: string | null
  facts: CoachFact[]; recommendations: CoachRecommendation[]; disclosure: string; limitations: string[]
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const internalLink = (v: unknown): v is string => typeof v === 'string' && /^(?:\/live-solve(?:\?mode=virtual)?|\/algorithm-trainer(?:\?case=[A-Za-z0-9_-]+)?|\/solve-analysis\?solve=[0-9a-f-]{36})$/.test(v)
const goals = ['balanced', 'efficiency', 'fluency', 'consistency']
const statuses = ['not_requested', 'not_configured', 'used', 'timeout', 'rejected', 'unavailable', 'busy']
export async function loadCoachContext(signal: AbortSignal): Promise<CoachContext> {
  const v = await library<CoachContext>('/ai/context', undefined, 'GET', signal)
  if (!record(v) || v.schema_version !== 1 || typeof v.configured !== 'boolean' || !['ollama', null].includes(v.provider) || !(v.model === null || typeof v.model === 'string') || typeof v.disclosure !== 'string' || v.recent_limit !== 20 || (v.configured !== (v.provider === 'ollama' && typeof v.model === 'string' && !!v.model)) || !Array.isArray(v.solves) || v.solves.length > 20 || v.solves.some(s => !record(s) || typeof s.id !== 'string' || !/^[0-9a-f-]{36}$/.test(s.id) || typeof s.created_at !== 'string' || !Number.isFinite(Date.parse(s.created_at)) || typeof s.status !== 'string' || typeof s.source !== 'string')) throw new Error('Coaching context failed validation. Reload your records.')
  return v
}
export async function requestCoaching(input: { solve_id: string | null; goal: CoachGoal; use_model: boolean }, signal: AbortSignal): Promise<CoachReply> {
  const v = await library<CoachReply>('/ai/coach', input, 'POST', signal)
  if (!record(v) || v.schema_version !== 1 || typeof v.version !== 'string' || !['engine', 'ai'].includes(v.mode) || !statuses.includes(v.provider_status) || !goals.includes(v.goal) || v.goal !== input.goal || v.solve_id !== input.solve_id || typeof v.disclosure !== 'string' || !Array.isArray(v.facts) || v.facts.length > 20 || v.facts.some(f => !record(f) || typeof f.id !== 'string' || typeof f.text !== 'string' || !(f.source_href === null || internalLink(f.source_href))) || new Set(v.facts.map(f => f.id)).size !== v.facts.length || !Array.isArray(v.recommendations) || !v.recommendations.length || v.recommendations.length > 3 || v.recommendations.some(r => !record(r) || typeof r.template_id !== 'string' || !v.facts.some(f => f.id === r.fact_id) || typeof r.title !== 'string' || typeof r.action !== 'string' || typeof r.link_label !== 'string' || !internalLink(r.href)) || !Array.isArray(v.limitations) || v.limitations.some(n => typeof n !== 'string') || (v.mode === 'engine' && (v.provider_status === 'used' || v.model !== null)) || (v.mode === 'ai' && (!input.use_model || v.provider_status !== 'used' || typeof v.model !== 'string'))) throw new Error('Coaching response failed validation. No advice was accepted.')
  return v
}
