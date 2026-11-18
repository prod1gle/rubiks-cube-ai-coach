import { isSnapshot, isPlan } from './cube'
import type { CubeSnapshot, CubePlan, TimedRecording, TimedAnalytics } from './cube'

export async function library<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { method, signal: signal ?? AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = await response.json() as { detail?: unknown }
  if (!response.ok) {
    const detail = data.detail
    throw new Error(typeof detail === 'string' ? detail : detail && typeof detail === 'object' && 'message' in detail ? String(detail.message) : `Request failed (HTTP ${response.status}).`)
  }
  return data as T
}
export interface SavedSolve { id: string; created_at: string; recording: TimedRecording; analysis: TimedAnalytics; analysis_version: string; current_version: string; versions: string[] }
export interface SolveList { total: number; items: { id: string; created_at: string; status: string; source: string; summary: TimedAnalytics['summary'] }[] }
export interface DashboardData { total_records: number; completed_solves: number; timed_sample_count: number; practice_attempts: number; personal_best_ms: number | null; average_tps: number | null; average_htm: number | null; trends: { id: string; created_at: string; elapsed_ms: number | null; htm: number; tps: number | null }[]; scope: string }
export interface TrainingRow { id: string; stage: 'F2L' | 'OLL' | 'PLL'; algorithm: string; source: string }
export interface TrainingCase extends TrainingRow { start: CubeSnapshot; plan: CubePlan; version: string; verified: true; scope: string }
export async function loadTraining(id: string, signal: AbortSignal) {
  const v = await library<TrainingCase>(`/training/${encodeURIComponent(id)}`, undefined, 'GET', signal)
  if (!isSnapshot(v.start) || !isPlan(v.plan) || v.verified !== true || v.plan.input_hash !== v.start.state_hash) throw new Error('Training state failed verification. Reload the case.')
  return v
}
export const saveSolve = (recording: TimedRecording, id = recording.clock_id) => library<SavedSolve>('/solves', { id, recording })
