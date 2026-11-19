import { isPlan, isSnapshot } from '../../api/cube'
import type { CubePlan, CubeSnapshot } from '../../api/cube'

export interface BeginnerLesson {
  id: string; title: string; goal: string; protect: string | null; algorithm: string
  start: CubeSnapshot; end: CubeSnapshot; plan: CubePlan; verified: true; version: string
  start_progress: Record<string, boolean>; end_progress: Record<string, boolean>
}
export interface BeginnerCheck {
  lesson_id: string; input_hash: string; end_hash: string; objective_met: boolean
  protected_preserved: boolean; success: boolean; verified: true; moves: number
}
async function request(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/beginner${path}`, { signal, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail?.message ?? `Lesson request failed (HTTP ${response.status}).`)
  return data
}
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v) }
export async function loadLesson(id: string, signal: AbortSignal): Promise<BeginnerLesson> {
  const data = await request(`/lessons/${encodeURIComponent(id)}`, signal)
  if (!(record(data) && data.id === id && data.verified === true && typeof data.title === 'string' && data.version === 'beginner-v1' && (data.protect === null || typeof data.protect === 'string') && typeof data.algorithm === 'string' && typeof data.goal === 'string' && isSnapshot(data.start) && isSnapshot(data.end) && isPlan(data.plan) && record(data.start_progress) && Object.values(data.start_progress).every(v => typeof v === 'boolean') && record(data.end_progress) && Object.values(data.end_progress).every(v => typeof v === 'boolean'))) throw new Error('The lesson did not pass engine-data validation.')
  let hash = data.start.state_hash
  for (const step of data.plan.steps) {
    if (step.before_hash !== hash) throw new Error('The lesson contains a discontinuous example.')
    hash = step.snapshot.state_hash
  }
  if (data.plan.input_hash !== data.start.state_hash || hash !== data.end.state_hash || data.algorithm !== data.plan.sequence.normalized || data.plan.steps.map(s => s.token).join(' ') !== data.algorithm) throw new Error('The lesson example failed endpoint verification.')
  return data as unknown as BeginnerLesson
}
export async function verifyLesson(item: BeginnerLesson, attempt: string, expectedHash: string, signal: AbortSignal): Promise<BeginnerCheck> {
  const data = await request('/check', signal, { lesson_id: item.id, attempt, expected_hash: expectedHash })
  if (!(record(data) && data.lesson_id === item.id && data.input_hash === item.start.state_hash && data.end_hash === expectedHash && data.verified === true && ['success', 'objective_met', 'protected_preserved'].every(key => typeof data[key] === 'boolean') && Number.isInteger(data.moves) && Number(data.moves) >= 0 && data.success === (data.objective_met && data.protected_preserved && Number(data.moves) > 0))) throw new Error('The practice check was stale or inconsistent. Your progress was not changed.')
  return data as unknown as BeginnerCheck
}
